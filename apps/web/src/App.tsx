import * as Tooltip from "@radix-ui/react-tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History as HistoryIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { ApiError, molecularApi, projectApi } from "./api/client";
import type {
  Entry,
  CameraState,
  CoordinatePatch,
  CoordinateTransform,
  LigandEdit,
  Measurement,
  MeasurementKind,
  ProteinEdit,
  Project,
  ProjectListItem,
  SavedSelection,
  Scene,
  SelectionGranularity,
  SelectionMode,
  StructureProjection,
  SuperpositionRequest,
} from "./api/types";
import { LowerPanel } from "./components/LowerPanel";
import type { LowerPanelTab } from "./components/LowerPanel";
import { IconButton } from "./components/IconButton";
import { ImportDialog } from "./components/ImportDialog";
import { ArchiveImportDialog } from "./components/ArchiveImportDialog";
import { Modal } from "./components/Modal";
import { ExportDialog } from "./components/ExportDialog";
import { ProjectBrowser } from "./components/ProjectBrowser";
import { ProjectInspector } from "./components/ProjectInspector";
import { TopBar } from "./components/TopBar";
import { WorkspaceCanvas } from "./components/WorkspaceCanvas";
import { JobSubmitDialog } from "./components/JobSubmitDialog";
import { useMediaQuery } from "./hooks/useMediaQuery";
import {
  canonicalSelection,
  expandSelection,
  invertSelection,
  predicateSelection,
  selectedEntryIds,
  structureSelection,
  type PredicateField,
  type StructureMap,
} from "./selection/selection";
import { spatialSelectionInWorker } from "./selection/spatialClient";
import {
  patchStructureProjection,
  previewTransform,
} from "./coordinates/transforms";
import { useSelectionStore } from "./store/selection";
import { useWorkspaceStore } from "./store/workspace";

type EntryDialog = { mode: "rename" | "group" | "delete"; entry: Entry } | null;

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "The operation could not be completed.";
}

export default function App() {
  const queryClient = useQueryClient();
  const compact = useMediaQuery("(max-width: 840px)");
  const {
    theme,
    activeProjectId,
    horizontalLayout,
    verticalLayout,
    leftCollapsed,
    rightCollapsed,
    lowerCollapsed,
    mobilePanel,
    setTheme,
    setActiveProjectId,
    setHorizontalLayout,
    setVerticalLayout,
    setLeftCollapsed,
    setRightCollapsed,
    setLowerCollapsed,
    setMobilePanel,
  } = useWorkspaceStore();

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [entryDialog, setEntryDialog] = useState<EntryDialog>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [archiveImportDialogOpen, setArchiveImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportEntry, setExportEntry] = useState<Entry | null>(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [lowerTab, setLowerTab] = useState<LowerPanelTab>("properties");
  const [entryName, setEntryName] = useState("");
  const [entryDescription, setEntryDescription] = useState("");
  const [groupName, setGroupName] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [editedThisSession, setEditedThisSession] = useState(false);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [coordinatePreview, setCoordinatePreview] =
    useState<CoordinatePatch | null>(null);
  const {
    selection,
    pickingGranularity,
    setProject: setSelectionProject,
    apply: applySelection,
    replace: replaceSelection,
    clear: clearSelection,
    setPickingGranularity,
  } = useSelectionStore();

  const leftRef = useRef<ImperativePanelHandle>(null);
  const rightRef = useRef<ImperativePanelHandle>(null);
  const lowerRef = useRef<ImperativePanelHandle>(null);
  const mobilePanelRef = useRef<HTMLElement>(null);
  const mobilePanelTriggerRef = useRef<HTMLElement | null>(null);

  const openMobilePanel = (panel: "projects" | "inspector" | "history") => {
    mobilePanelTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMobilePanel(panel);
  };

  const closeMobilePanel = () => {
    const trigger = mobilePanelTriggerRef.current;
    setMobilePanel(null);
    requestAnimationFrame(() => trigger?.focus());
  };

  useEffect(() => {
    if (!mobilePanel) return;
    requestAnimationFrame(() => {
      mobilePanelRef.current
        ?.querySelector<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        )
        ?.focus();
    });
  }, [mobilePanel]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: projectApi.list,
    retry: false,
  });
  const projectQuery = useQuery({
    queryKey: ["project", activeProjectId],
    queryFn: () => projectApi.get(activeProjectId ?? ""),
    enabled: !!activeProjectId,
    retry: false,
  });
  const project = projectQuery.data;

  useEffect(() => {
    setSelectionProject(project?.id ?? null);
  }, [project?.id, setSelectionProject]);

  useEffect(() => {
    if (!project || selection.atoms.length === 0) return;
    const entries = new Map(project.entries.map((entry) => [entry.id, entry]));
    const valid = selection.atoms.filter((reference) => {
      const entry = entries.get(reference.structure_id);
      return entry !== undefined && entry.atom_ids.includes(reference.atom_id);
    });
    if (valid.length !== selection.atoms.length) {
      replaceSelection(
        canonicalSelection(valid, selection.granularity, selection.source),
      );
    }
  }, [project, replaceSelection, selection]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "light" ? "#f7f8fa" : "#11191b",
    );
  }, [theme]);

  useEffect(() => {
    if (
      activeProjectId &&
      projectsQuery.data &&
      !projectsQuery.data.some((item) => item.id === activeProjectId)
    ) {
      setActiveProjectId(null);
    }
  }, [activeProjectId, projectsQuery.data, setActiveProjectId]);

  useEffect(() => {
    if (project?.has_uncheckpointed_changes && !editedThisSession) {
      setNotice({ kind: "success", text: "Recovered locally stored changes." });
    }
  }, [editedThisSession, project?.has_uncheckpointed_changes, project?.id]);

  const updateProjectCache = (next: Project) => {
    const previous = queryClient.getQueryData<Project>(["project", next.id]);
    for (const patch of next.structure_patches ?? []) {
      const previousEntry = previous?.entries.find(
        (entry) => entry.id === patch.entry_id,
      );
      const source = previousEntry?.current_artifact_id
        ? queryClient.getQueryData<StructureProjection>([
            "structure",
            next.id,
            patch.entry_id,
            previousEntry.current_artifact_id,
          ])
        : undefined;
      const target =
        queryClient.getQueryData<StructureProjection>([
          "structure",
          next.id,
          patch.entry_id,
          patch.artifact_id,
        ]) ?? source;
      if (target) {
        queryClient.setQueryData(
          ["structure", next.id, patch.entry_id, patch.artifact_id],
          patchStructureProjection(target, patch),
        );
      }
    }
    queryClient.setQueryData(["project", next.id], next);
    queryClient.setQueryData<ProjectListItem[]>(["projects"], (current = []) => {
      const summary: ProjectListItem = {
        id: next.id,
        name: next.name,
        description: next.description,
        revision: next.revision,
        checkpoint_revision: next.checkpoint_revision,
        has_uncheckpointed_changes: next.has_uncheckpointed_changes,
        entry_count: next.entries.length,
        created_at: next.created_at,
        modified_at: next.modified_at,
      };
      const existingIndex = current.findIndex((item) => item.id === next.id);
      if (existingIndex < 0) return [summary, ...current];
      return current.map((item, index) => (index === existingIndex ? summary : item));
    });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const projectMutation = useMutation({
    mutationFn: (operation: () => Promise<Project>) => operation(),
    onSuccess: (next) => {
      updateProjectCache(next);
      setEditedThisSession(true);
      setNotice({ kind: "success", text: "Change stored locally." });
    },
    onError: (error) => {
      setNotice({ kind: "error", text: errorMessage(error) });
      if (error instanceof ApiError && error.code === "revision_conflict" && activeProjectId) {
        void queryClient.invalidateQueries({ queryKey: ["project", activeProjectId] });
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: () => projectApi.create(newName.trim(), newDescription.trim() || null),
    onSuccess: (next) => {
      updateProjectCache(next);
      setActiveProjectId(next.id);
      setEditedThisSession(false);
      setProjectDialogOpen(false);
      setCreateMode(false);
      setNewName("");
      setNewDescription("");
      setNotice({ kind: "success", text: "Project created." });
    },
    onError: (error) => setNotice({ kind: "error", text: errorMessage(error) }),
  });

  const busy = projectMutation.isPending || createMutation.isPending;

  const entryActions = useMemo(
    () => ({
      onRename: (entry: Entry) => {
        setEntryName(entry.name);
        setEntryDescription(entry.description ?? "");
        setEntryDialog({ mode: "rename", entry });
      },
      onDuplicate: (entry: Entry) => {
        if (project) projectMutation.mutate(() => projectApi.duplicateEntry(project, entry.id));
      },
      onVisibility: (entry: Entry) => {
        if (project)
          projectMutation.mutate(() =>
            projectApi.setEntryVisibility(project, entry.id, !entry.visible),
          );
      },
      onLock: (entry: Entry) => {
        if (project)
          projectMutation.mutate(() => projectApi.setEntryLock(project, entry.id, !entry.locked));
      },
      onIsolate: (entry: Entry) => {
        if (project) projectMutation.mutate(() => projectApi.isolateEntry(project, entry.id));
      },
      onGroup: (entry: Entry) => {
        setGroupName("");
        setEntryDialog({ mode: "group", entry });
      },
      onDelete: (entry: Entry) => setEntryDialog({ mode: "delete", entry }),
      onExport: (entry: Entry) => {
        setExportEntry(entry);
        setExportDialogOpen(true);
      },
    }),
    [project, projectMutation],
  );

  const loadStructures = async (entryIds: Iterable<string>): Promise<StructureMap> => {
    if (!project) return new Map();
    const requested = [...new Set(entryIds)];
    const loaded = await Promise.all(
      requested.map(async (entryId) => {
        const entry = project.entries.find((item) => item.id === entryId);
        if (!entry?.current_artifact_id) return null;
        const result = await queryClient.fetchQuery({
          queryKey: ["structure", project.id, entry.id, entry.current_artifact_id],
          queryFn: () => molecularApi.structure(project.id, entry.id),
          staleTime: Number.POSITIVE_INFINITY,
        });
        return [entry.id, result.structure] as const;
      }),
    );
    return new Map(loaded.filter((item): item is NonNullable<typeof item> => item !== null));
  };

  const runSelectionOperation = async (operation: () => Promise<void>) => {
    setSelectionBusy(true);
    try {
      await operation();
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setSelectionBusy(false);
    }
  };

  const selectEntries = (entries: Entry[], mode: SelectionMode) => {
    void runSelectionOperation(async () => {
      const structures = await loadStructures(entries.map((entry) => entry.id));
      const operand = canonicalSelection(
        entries.flatMap((entry) => {
          const structure = structures.get(entry.id);
          return structure
            ? structureSelection(entry.id, structure, "project").atoms
            : [];
        }),
        "structure",
        "project",
      );
      applySelection(operand, mode);
    });
  };

  const setHierarchyVisibility = (
    entry: Entry,
    key: keyof Omit<Entry["viewer_settings"]["components"], "hydrogens">,
  ) => {
    if (!project) return;
    projectMutation.mutate(() =>
      projectApi.updateViewerSettings(project, entry.id, {
        ...entry.viewer_settings,
        components: {
          ...entry.viewer_settings.components,
          [key]: !entry.viewer_settings.components[key],
        },
      }),
    );
  };

  const inspectAllStructures = () =>
    loadStructures(
      project?.entries
        .filter((entry) => entry.current_artifact_id)
        .map((entry) => entry.id) ?? [],
    );

  const inspectorSelectionProps = {
    selection,
    pickingGranularity,
    selectionBusy,
    onApplySelection: applySelection,
    onPickingGranularity: setPickingGranularity,
    onClearSelection: clearSelection,
    onExpandSelection: (granularity: SelectionGranularity) => {
      void runSelectionOperation(async () => {
        const structures = await loadStructures(selectedEntryIds(selection));
        replaceSelection(expandSelection(selection, structures, granularity));
      });
    },
    onInvertSelection: () => {
      void runSelectionOperation(async () => {
        replaceSelection(invertSelection(selection, await inspectAllStructures()));
      });
    },
    onPredicateSelection: (
      field: PredicateField,
      value: string,
      mode: SelectionMode,
    ) => {
      void runSelectionOperation(async () => {
        applySelection(
          predicateSelection(await inspectAllStructures(), field, value),
          mode,
        );
      });
    },
    onSpatialSelection: (
      distance: number,
      granularity: "atom" | "residue",
      mode: SelectionMode,
    ) => {
      void runSelectionOperation(async () => {
        const structures = await inspectAllStructures();
        const atoms = [...structures].flatMap(([structureId, structure]) =>
          structure.atoms.map((atom) => ({
            structureId,
            atomId: atom.id,
            residueId: atom.residue_id,
            coordinates: atom.coordinates,
          })),
        );
        const references = await spatialSelectionInWorker(
          atoms,
          selection.atoms,
          distance,
          granularity,
        );
        applySelection(
          canonicalSelection(references, granularity, "inspector"),
          mode,
        );
      });
    },
    onSaveSelection: (name: string) => {
      if (project) {
        projectMutation.mutate(() =>
          projectApi.saveSelection(project, name, selection),
        );
      }
    },
    onLoadSelection: (saved: SavedSelection) => {
      replaceSelection(
        canonicalSelection(
          saved.atom_references,
          saved.granularity,
          "saved",
        ),
      );
    },
    onDeleteSelection: (saved: SavedSelection) => {
      if (project) {
        projectMutation.mutate(() =>
          projectApi.deleteSelection(project, saved.id),
        );
      }
    },
    onCreateMeasurement: (
      name: string,
      kind: MeasurementKind,
    ) => {
      if (project) {
        projectMutation.mutate(() =>
          projectApi.createMeasurement(project, name, kind, selection.atoms),
        );
      }
    },
    onUpdateMeasurement: (
      measurement: Measurement,
      name: string,
      visible: boolean,
    ) => {
      if (project) {
        projectMutation.mutate(() =>
          projectApi.updateMeasurement(
            project,
            measurement.id,
            name,
            visible,
          ),
        );
      }
    },
    onDeleteMeasurement: (measurement: Measurement) => {
      if (project) {
        projectMutation.mutate(() =>
          projectApi.deleteMeasurement(project, measurement.id),
        );
      }
    },
    onPreviewTransform: async (transform: CoordinateTransform) => {
      const structures = await loadStructures([transform.entry_id]);
      const structure = structures.get(transform.entry_id);
      if (!structure) throw new Error("The target structure is not loaded.");
      setCoordinatePreview(previewTransform(structure, transform));
    },
    onClearTransformPreview: () => setCoordinatePreview(null),
    onTransform: async (transform: CoordinateTransform) => {
      if (!project) return;
      setCoordinatePreview(null);
      await projectMutation.mutateAsync(() =>
        projectApi.transform(project, transform),
      );
    },
    onSuperpose: async (payload: SuperpositionRequest) => {
      if (!project) return null;
      setCoordinatePreview(null);
      try {
        const result = await projectApi.superpose(project, payload);
        updateProjectCache(result.project);
        setEditedThisSession(true);
        setNotice({
          kind: "success",
          text: `Aligned ${result.report.atom_count} atoms; RMSD ${result.report.rmsd.toFixed(4)} angstrom.`,
        });
        return result.report;
      } catch (error) {
        setNotice({ kind: "error", text: errorMessage(error) });
        if (
          error instanceof ApiError &&
          error.code === "revision_conflict" &&
          activeProjectId
        ) {
          void queryClient.invalidateQueries({
            queryKey: ["project", activeProjectId],
          });
        }
        throw error;
      }
    },
    onLigandEdit: async (entryId: string, edit: LigandEdit) => {
      if (!project) throw new Error("No project is open.");
      try {
        const result = await projectApi.ligandEdit(project, entryId, edit);
        updateProjectCache(result.project);
        const currentEntry = result.project.entries.find(
          (entry) => entry.id === entryId,
        );
        if (currentEntry) {
          replaceSelection(
            canonicalSelection(
              selection.atoms.filter(
                (reference) =>
                  reference.structure_id !== entryId ||
                  currentEntry.atom_ids.includes(reference.atom_id),
              ),
              selection.granularity,
              selection.source,
            ),
          );
        }
        setEditedThisSession(true);
        const warningText =
          result.warnings.length > 0
            ? ` ${result.warnings.length} chemistry warning${
                result.warnings.length === 1 ? "" : "s"
              }.`
            : "";
        setNotice({
          kind: "success",
          text: `Ligand edit stored.${warningText}`,
        });
        return result;
      } catch (error) {
        setNotice({ kind: "error", text: errorMessage(error) });
        if (
          error instanceof ApiError &&
          error.code === "revision_conflict" &&
          activeProjectId
        ) {
          void queryClient.invalidateQueries({
            queryKey: ["project", activeProjectId],
          });
        }
        throw error;
      }
    },
    onProteinEdit: async (entryId: string, edit: ProteinEdit) => {
      if (!project) throw new Error("No project is open.");
      try {
        const result = await projectApi.proteinEdit(project, entryId, edit);
        updateProjectCache(result.project);
        const currentEntry = result.project.entries.find(
          (entry) => entry.id === entryId,
        );
        if (currentEntry) {
          replaceSelection(
            canonicalSelection(
              selection.atoms.filter(
                (reference) =>
                  reference.structure_id !== entryId ||
                  currentEntry.atom_ids.includes(reference.atom_id),
              ),
              selection.granularity,
              selection.source,
            ),
          );
        }
        setEditedThisSession(true);
        const warningText =
          result.warnings.length > 0
            ? ` ${result.warnings.length} protein warning${
                result.warnings.length === 1 ? "" : "s"
              }.`
            : "";
        setNotice({
          kind: "success",
          text: `Protein edit stored.${warningText}`,
        });
        return result;
      } catch (error) {
        setNotice({ kind: "error", text: errorMessage(error) });
        if (
          error instanceof ApiError &&
          error.code === "revision_conflict" &&
          activeProjectId
        ) {
          void queryClient.invalidateQueries({
            queryKey: ["project", activeProjectId],
          });
        }
        throw error;
      }
    },
  };

  const projects = projectsQuery.data ?? [];
  const viewerActions = {
    busy,
    coordinatePreview,
    onUpdateSettings: async (
      entryId: string,
      settings: Entry["viewer_settings"],
    ) => {
      if (!project) return;
      await projectMutation.mutateAsync(() =>
        projectApi.updateViewerSettings(project, entryId, settings),
      );
    },
    onCreateScene: async (name: string, camera: CameraState) => {
      if (!project) return;
      await projectMutation.mutateAsync(() =>
        projectApi.createScene(project, name, camera, selection),
      );
    },
    onApplyScene: async (scene: Scene) => {
      if (!project) return;
      await projectMutation.mutateAsync(() => projectApi.applyScene(project, scene));
    },
    onDeleteScene: async (scene: Scene) => {
      if (!project) return;
      await projectMutation.mutateAsync(() => projectApi.deleteScene(project, scene));
    },
  };

  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="app-shell">
        <TopBar
          project={project}
          theme={theme}
          busy={busy}
          compact={compact}
          onProjects={() => {
            setCreateMode(false);
            setProjectDialogOpen(true);
          }}
          onSave={() => {
            if (project) {
              projectMutation.mutate(() => projectApi.save(project), {
                onSuccess: () => {
                  setEditedThisSession(false);
                  setNotice({ kind: "success", text: "Checkpoint saved." });
                },
              });
            }
          }}
          onUndo={() => {
            if (project) projectMutation.mutate(() => projectApi.undo(project));
          }}
          onRedo={() => {
            if (project) projectMutation.mutate(() => projectApi.redo(project));
          }}
          onImport={() => setImportDialogOpen(true)}
          onExport={() => {
            setExportEntry(null);
            setExportDialogOpen(true);
          }}
          onJobs={() => {
            setLowerTab("jobs");
            setJobDialogOpen(true);
            if (compact) openMobilePanel("history");
            else lowerRef.current?.expand();
          }}
          onTheme={() => setTheme(theme === "light" ? "dark" : "light")}
          onMobilePanel={openMobilePanel}
        />

        {notice ? (
          <div
            className={`notice ${notice.kind}`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
              Close
            </button>
          </div>
        ) : null}

        {projectsQuery.isError || projectQuery.isError ? (
          <div className="api-failure" role="alert">
            <strong>Local API unavailable</strong>
            <span>{errorMessage(projectsQuery.error ?? projectQuery.error)}</span>
            <button
              type="button"
              onClick={() => {
                void projectsQuery.refetch();
                if (activeProjectId) void projectQuery.refetch();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        <div className="workspace-root">
          {compact ? (
            <>
              <WorkspaceCanvas
                project={project}
                theme={theme}
                selection={selection}
                pickingGranularity={pickingGranularity}
                onPickingGranularity={setPickingGranularity}
                onViewerSelection={applySelection}
                loading={projectQuery.isLoading}
                onCreate={() => {
                  setCreateMode(true);
                  setProjectDialogOpen(true);
                }}
                onImport={() => setImportDialogOpen(true)}
                {...viewerActions}
              />
              {mobilePanel ? (
                <>
                  <button
                    type="button"
                    className="mobile-scrim"
                    aria-label="Close panel"
                    onClick={closeMobilePanel}
                  />
                  <aside
                    ref={mobilePanelRef}
                    className={`mobile-panel ${mobilePanel}`}
                    role="dialog"
                    aria-modal="true"
                    aria-label={
                      mobilePanel === "projects"
                        ? "Project browser panel"
                        : mobilePanel === "inspector"
                          ? "Inspector panel"
                          : "History and jobs panel"
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") closeMobilePanel();
                    }}
                  >
                    {mobilePanel === "projects" ? (
                      <ProjectBrowser
                        project={project}
                        selection={selection}
                        selectedEntryIds={selectedEntryIds(selection)}
                        onSelectEntries={selectEntries}
                        onSelectHierarchy={applySelection}
                        onHierarchyVisibility={setHierarchyVisibility}
                        {...entryActions}
                      />
                    ) : mobilePanel === "inspector" ? (
                      <ProjectInspector
                        project={project}
                        busy={busy}
                        {...inspectorSelectionProps}
                        onApply={(name, description) => {
                          if (project)
                            projectMutation.mutate(() =>
                              projectApi.update(project, name, description),
                            );
                        }}
                      />
                    ) : (
                      <LowerPanel
                        project={project}
                        selection={selection}
                        onSelection={replaceSelection}
                        tab={lowerTab}
                        onTabChange={setLowerTab}
                        onNewJob={() => setJobDialogOpen(true)}
                        onProjectUpdate={(next) => {
                          updateProjectCache(next);
                          setEditedThisSession(true);
                        }}
                        onNotice={(kind, text) => setNotice({ kind, text })}
                      />
                    )}
                  </aside>
                </>
              ) : null}
            </>
          ) : (
            <PanelGroup
              id="workspace-horizontal-panels"
              direction="horizontal"
              onLayout={setHorizontalLayout}
              className="horizontal-panels"
            >
              <Panel
                id="project-browser-panel"
                ref={leftRef}
                defaultSize={horizontalLayout[0]}
                minSize={15}
                maxSize={32}
                collapsible
                collapsedSize={3}
                onCollapse={() => setLeftCollapsed(true)}
                onExpand={() => setLeftCollapsed(false)}
              >
                {leftCollapsed ? (
                  <div className="collapsed-rail">
                    <IconButton
                      label="Expand project browser"
                      onClick={() => leftRef.current?.expand()}
                    >
                      <ChevronRight size={17} />
                    </IconButton>
                  </div>
                ) : (
                  <ProjectBrowser
                    project={project}
                    selection={selection}
                    selectedEntryIds={selectedEntryIds(selection)}
                    onSelectEntries={selectEntries}
                    onSelectHierarchy={applySelection}
                    onHierarchyVisibility={setHierarchyVisibility}
                    onCollapse={() => leftRef.current?.collapse()}
                    {...entryActions}
                  />
                )}
              </Panel>
              <PanelResizeHandle
                id="project-browser-resize-handle"
                className="resize-handle horizontal"
                aria-label="Resize project browser"
              />
              <Panel id="workspace-center-panel" defaultSize={horizontalLayout[1]} minSize={34}>
                <PanelGroup
                  id="workspace-vertical-panels"
                  direction="vertical"
                  onLayout={setVerticalLayout}
                  className="vertical-panels"
                >
                  <Panel id="molecular-viewer-panel" defaultSize={verticalLayout[0]} minSize={45}>
                    <WorkspaceCanvas
                      project={project}
                      theme={theme}
                      selection={selection}
                      pickingGranularity={pickingGranularity}
                      onPickingGranularity={setPickingGranularity}
                      onViewerSelection={applySelection}
                      loading={projectQuery.isLoading}
                      onCreate={() => {
                        setCreateMode(true);
                        setProjectDialogOpen(true);
                      }}
                      onImport={() => setImportDialogOpen(true)}
                      {...viewerActions}
                    />
                  </Panel>
                  <PanelResizeHandle
                    id="lower-panel-resize-handle"
                    className="resize-handle vertical"
                    aria-label="Resize lower panel"
                  />
                  <Panel
                    id="lower-panel"
                    ref={lowerRef}
                    defaultSize={verticalLayout[1]}
                    minSize={16}
                    maxSize={45}
                    collapsible
                    collapsedSize={6}
                    onCollapse={() => setLowerCollapsed(true)}
                    onExpand={() => setLowerCollapsed(false)}
                  >
                    {lowerCollapsed ? (
                      <div className="collapsed-history">
                        <HistoryIcon size={15} />
                        <span>Properties / History / Jobs</span>
                        <IconButton
                          label="Expand history"
                          onClick={() => lowerRef.current?.expand()}
                        >
                          <ChevronLeft size={17} />
                        </IconButton>
                      </div>
                    ) : (
                      <LowerPanel
                        project={project}
                        selection={selection}
                        onSelection={replaceSelection}
                        tab={lowerTab}
                        onTabChange={setLowerTab}
                        onNewJob={() => setJobDialogOpen(true)}
                        onProjectUpdate={(next) => {
                          updateProjectCache(next);
                          setEditedThisSession(true);
                        }}
                        onNotice={(kind, text) => setNotice({ kind, text })}
                        onCollapse={() => lowerRef.current?.collapse()}
                      />
                    )}
                  </Panel>
                </PanelGroup>
              </Panel>
              <PanelResizeHandle
                id="inspector-resize-handle"
                className="resize-handle horizontal"
                aria-label="Resize inspector"
              />
              <Panel
                id="inspector-panel"
                ref={rightRef}
                defaultSize={horizontalLayout[2]}
                minSize={17}
                maxSize={34}
                collapsible
                collapsedSize={3}
                onCollapse={() => setRightCollapsed(true)}
                onExpand={() => setRightCollapsed(false)}
              >
                {rightCollapsed ? (
                  <div className="collapsed-rail">
                    <IconButton
                      label="Expand inspector"
                      onClick={() => rightRef.current?.expand()}
                    >
                      <ChevronLeft size={17} />
                    </IconButton>
                  </div>
                ) : (
                  <ProjectInspector
                    project={project}
                    busy={busy}
                    {...inspectorSelectionProps}
                    onCollapse={() => rightRef.current?.collapse()}
                    onApply={(name, description) => {
                      if (project)
                        projectMutation.mutate(() => projectApi.update(project, name, description));
                    }}
                  />
                )}
              </Panel>
            </PanelGroup>
          )}
        </div>
      </div>

      <Modal
        open={projectDialogOpen}
        onOpenChange={(open) => {
          setProjectDialogOpen(open);
          if (!open) setCreateMode(false);
        }}
        title={createMode ? "Create project" : "Projects"}
        description={createMode ? "Set a name for the local workspace." : undefined}
      >
        {createMode ? (
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim()) createMutation.mutate();
            }}
          >
            <label>
              Name
              <input
                autoFocus
                value={newName}
                maxLength={120}
                onChange={(event) => setNewName(event.target.value)}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={newDescription}
                maxLength={2000}
                rows={4}
                onChange={(event) => setNewDescription(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setCreateMode(false)}>
                Back
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={!newName.trim() || createMutation.isPending}
              >
                Create project
              </button>
            </div>
          </form>
        ) : (
          <div className="project-list-dialog">
            <div className="project-list">
              {projects.length === 0 ? (
                <p className="empty-label">No projects</p>
              ) : (
                projects.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={item.id === activeProjectId ? "active" : ""}
                    onClick={() => {
                      setActiveProjectId(item.id);
                      setEditedThisSession(false);
                      setProjectDialogOpen(false);
                    }}
                  >
                    <span>{item.name}</span>
                    <small>
                      {item.entry_count} structures
                      {item.has_uncheckpointed_changes ? " - unsaved" : ""}
                    </small>
                  </button>
                ))
              )}
            </div>
            <div className="project-list-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setProjectDialogOpen(false);
                  setArchiveImportDialogOpen(true);
                }}
              >
                Import project archive
              </button>
              <button type="button" className="primary-button" onClick={() => setCreateMode(true)}>
                Create project
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ArchiveImportDialog
        open={archiveImportDialogOpen}
        onOpenChange={setArchiveImportDialogOpen}
        onImported={(result) => {
          updateProjectCache(result.project);
          setActiveProjectId(result.project.id);
          setEditedThisSession(false);
          setNotice({ kind: "success", text: `Project "${result.project.name}" imported.` });
        }}
      />

      <ImportDialog
        open={importDialogOpen}
        project={project}
        onOpenChange={setImportDialogOpen}
        onImported={(result) => {
          updateProjectCache(result.project);
          setEditedThisSession(true);
          setNotice({
            kind: "success",
            text: `${result.imported_entry_ids.length} ${
              result.imported_entry_ids.length === 1 ? "structure" : "structures"
            } imported${result.warnings.length > 0 ? ` with ${result.warnings.length} warnings` : ""}.`,
          });
        }}
      />

      <ExportDialog
        open={exportDialogOpen}
        project={project}
        initialEntry={exportEntry}
        selectedEntryIds={selectedEntryIds(selection)}
        onOpenChange={(open) => {
          setExportDialogOpen(open);
          if (!open) setExportEntry(null);
        }}
      />

      <JobSubmitDialog
        open={jobDialogOpen}
        project={project}
        onOpenChange={setJobDialogOpen}
        onSubmitted={(job) => {
          queryClient.setQueryData(["job", job.id], job);
          void queryClient.invalidateQueries({ queryKey: ["jobs", job.project_id] });
          setLowerTab("jobs");
          if (compact) openMobilePanel("history");
          else lowerRef.current?.expand();
          setNotice({ kind: "success", text: "Job queued." });
        }}
      />

      <Modal
        open={entryDialog !== null}
        onOpenChange={(open) => {
          if (!open) setEntryDialog(null);
        }}
        title={
          entryDialog?.mode === "rename"
            ? "Rename structure"
            : entryDialog?.mode === "group"
              ? "Create group"
              : "Delete structure"
        }
      >
        {entryDialog?.mode === "rename" ? (
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (project && entryName.trim()) {
                projectMutation.mutate(
                  () =>
                    projectApi.updateEntry(project, entryDialog.entry.id, {
                      name: entryName.trim(),
                      description: entryDescription.trim() || null,
                      user_metadata: entryDialog.entry.user_metadata,
                    }),
                  { onSuccess: () => setEntryDialog(null) },
                );
              }
            }}
          >
            <label>
              Name
              <input
                autoFocus
                value={entryName}
                maxLength={160}
                onChange={(event) => setEntryName(event.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                value={entryDescription}
                maxLength={2000}
                onChange={(event) => setEntryDescription(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setEntryDialog(null)}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={!entryName.trim() || busy}>
                Apply
              </button>
            </div>
          </form>
        ) : entryDialog?.mode === "group" ? (
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (project && groupName.trim()) {
                projectMutation.mutate(
                  () => projectApi.createGroup(project, groupName.trim(), [entryDialog.entry.id]),
                  { onSuccess: () => setEntryDialog(null) },
                );
              }
            }}
          >
            <label>
              Group name
              <input
                autoFocus
                value={groupName}
                maxLength={120}
                onChange={(event) => setGroupName(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setEntryDialog(null)}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={!groupName.trim() || busy}>
                Create group
              </button>
            </div>
          </form>
        ) : entryDialog ? (
          <div className="confirm-dialog">
            <p>
              Delete <strong>{entryDialog.entry.name}</strong> from this project?
            </p>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setEntryDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={() => {
                  if (project)
                    projectMutation.mutate(
                      () => projectApi.deleteEntry(project, entryDialog.entry.id),
                      { onSuccess: () => setEntryDialog(null) },
                    );
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Tooltip.Provider>
  );
}
