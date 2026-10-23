import { seedCoordinateProjections } from "./coordinates/cache";
import type { ResidueSelectionRequest, ViewerPick } from "./selection/gestures";
import { useMinimization } from "./minimization/useMinimization";
import { useMinimizationStore } from "./minimization/store";
import { manualModelEdit } from "./editing/manual";
import { NewMoleculeDialog, type NewMoleculeInput } from "./components/NewMoleculeDialog";
import type { HydrogenPolicy } from "./api/types";
import { surfacePruningWarnings } from "./selection/surfaceWarnings";
import { useViewerCameraStore } from "./store/viewerCamera";
import { useEditingStore } from "./store/editing";
import { expandByDistance } from "./selection/expansion";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History as HistoryIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { ApiError, molecularApi, projectApi } from "./api/client";
import type {
  Entry,
  AtomReference,
  CameraState,
  CoordinatePatch,
  CoordinateTransform,
  LigandEdit,
  Selection,
  SelectionEditAction,
  Measurement,
  MeasurementKind,
  ProteinEdit,
  Project,
  ProjectListItem,
  SavedSelection,
  Scene,
  SelectionGranularity,
  SelectionMode,
  SelectionRepresentationStyle,
  SelectionAppearanceChange,
  StructureProjection,
  SuperpositionRequest,
  SurfaceCreateItem,
  SurfaceChange,
} from "./api/types";
import { LowerPanel } from "./components/LowerPanel";
import type { LowerPanelTab } from "./components/LowerPanel";
import { IconButton } from "./components/IconButton";
import { ImportDialog } from "./components/ImportDialog";
import { ArchiveImportDialog } from "./components/ArchiveImportDialog";
import { Modal } from "./components/Modal";
import { ExportDialog } from "./components/ExportDialog";
import { GroupMembershipDialog, type GroupDialogRequest } from "./components/GroupMembershipDialog";
import { groupReturnFocus, type GroupScope } from "./groups/membership";
import { useGroupActionFocus } from "./groups/useGroupActionFocus";
import { useNavigationStore } from "./store/navigation";
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
  previewTransform,
} from "./coordinates/transforms";
import { useSelectionStore } from "./store/selection";
import { useWorkspaceStore } from "./store/workspace";
import { useInteractionStore } from "./store/interactions";
import { applyTheme } from "./theme";
import { useMovementSession } from "./coordinates/useMovementSession";
import { ApplicationNotice, type ApplicationNoticeValue } from "./components/ApplicationNotice";

type EntryDialog = { mode: "rename" | "delete"; entry: Entry } | null;

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
  const [newMoleculeOpen, setNewMoleculeOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [archiveImportDialogOpen, setArchiveImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportEntry, setExportEntry] = useState<Entry | null>(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [lowerTab, setLowerTab] = useState<LowerPanelTab>("properties");
  const [entryName, setEntryName] = useState("");
  const [entryDescription, setEntryDescription] = useState("");
  const [groupDialog, setGroupDialog] = useState<GroupDialogRequest | null>(null);
  const [notice, setNotice] = useState<ApplicationNoticeValue | null>(null);
  const [editedThisSession, setEditedThisSession] = useState(false);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [coordinatePreview, setCoordinatePreview] =
    useState<CoordinatePatch | null>(null);
  const numericalPreviewGeneration = useRef(0);
  const clearCoordinatePreview = useCallback(() => {
    numericalPreviewGeneration.current++;
    setCoordinatePreview(null);
  }, []);
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
  const renderedMovementAtoms = useRef<() => AtomReference[]>(() => []);

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
  useEffect(() => setNewMoleculeOpen(false), [project?.id]);

  useEffect(() => {
    useNavigationStore.getState().setProject(activeProjectId);
    useEditingStore.getState().setProject(activeProjectId);
    useMinimizationStore.getState().setProject(activeProjectId);
    useViewerCameraStore.getState().setProject(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    if (project) useNavigationStore.getState().reconcile(project.id, project.entries.map(entry => entry.id));
  }, [project]);
  const focusGroupAction = useGroupActionFocus(project, activeProjectId);

  useEffect(() => {
    setSelectionProject(project?.id ?? null);
    setGroupDialog(null);
  }, [project?.id, setSelectionProject]);

  useEffect(() => {
    if (project) useSelectionStore.getState().reconcileAnchor(project.entries);
    if (!project || selection.atoms.length === 0) return;
    const entries = new Map(project.entries.map((entry) => [entry.id, new Set(entry.atom_ids)]));
    const valid = selection.atoms.filter((reference) => {
      const entry = entries.get(reference.structure_id);
      return entry?.has(reference.atom_id) ?? false;
    });
    if (valid.length !== selection.atoms.length) {
      replaceSelection(
        canonicalSelection(valid, selection.granularity, selection.source),
      );
    }
  }, [project, replaceSelection, selection]);

  useEffect(() => {
    applyTheme(theme);
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
      setNotice(current => current ?? { kind: "success", text: "Recovered locally stored changes." });
    }
  }, [editedThisSession, project?.has_uncheckpointed_changes, project?.id]);

  const updateProjectCache = (next: Project) => {
    const previous = queryClient.getQueryData<Project>(["project", next.id]);
    if (previous && previous.revision > next.revision) return;
    seedCoordinateProjections(queryClient, previous, next);
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

  const { session: movementSession, workflow: movement } = useMovementSession({
    beforeStart: () => { clearCoordinatePreview(); useMinimizationStore.getState().dismiss(); },
    context: () => ({
      project: queryClient.getQueryData<Project>(["project", useWorkspaceStore.getState().activeProjectId]),
      selection: useSelectionStore.getState().selection,
    }),
    load: async (captured, ids) => new Map(await Promise.all(ids.map(async id => {
      const entry = captured.entries.find(item => item.id === id);
      if (!entry?.current_artifact_id) throw new Error("A selected structure is unavailable.");
      const projection = await queryClient.fetchQuery({
        queryKey: ["structure", captured.id, id, entry.current_artifact_id],
        queryFn: () => molecularApi.structure(captured.id, id),
        staleTime: Number.POSITIVE_INFINITY,
      });
      return [id, projection] as const;
    }))),
    rendered: () => renderedMovementAtoms.current(),
    commit: projectApi.transformSelection,
    refresh: projectApi.get,
    accept: next => {
      updateProjectCache(next);
      if (next.id === useWorkspaceStore.getState().activeProjectId && next.structure_patches?.length) setEditedThisSession(true);
    },
    notice: (id, text, error, lifetime) => {
      if (id === useWorkspaceStore.getState().activeProjectId) setNotice({ kind: error ? "error" : "success", text, lifetime });
    },
  });
  const movementBlocked = ["submitting", "reconciling", "uncertain"].includes(movement.state.phase);

  useEffect(() => useSelectionStore.subscribe(() => movementSession.guardContext()), [movementSession]);
  useEffect(() => useWorkspaceStore.subscribe((next, previous) => {
    if (next.activeProjectId !== previous.activeProjectId) {
      useInteractionStore.getState().setProject(next.activeProjectId);
      const phase = movementSession.snapshot().phase;
      movementSession.cancel(undefined, true);
      renderedMovementAtoms.current = () => [];
      clearCoordinatePreview();
      setNotice(phase === "active" || phase === "loading"
        ? { kind: "success", text: "Unapplied movement was discarded after changing projects." }
        : ["submitting", "reconciling", "uncertain"].includes(phase)
          ? { kind: "success", lifetime: "persistent", text: "Movement for the previous project may be pending. Reopen it to check its coordinates and history." }
          : null);
    }
  }), [movementSession, clearCoordinatePreview]);
  useEffect(() => { movementSession.guardContext(); }, [movementSession, project, selection]);
  useEffect(() => clearCoordinatePreview(), [clearCoordinatePreview, project?.id, project?.revision, selection]);

  const projectMutation = useMutation({
    mutationFn: (operation: () => Promise<Project>) => operation(),
    onMutate: () => {
      if (["submitting", "reconciling", "uncertain"].includes(movementSession.snapshot().phase)) throw new ApiError(409, "movement_busy", "Finish or reconcile the current movement before changing the project.");
      clearCoordinatePreview();
      const minimization = useMinimizationStore.getState();
      minimization.patch(minimization.generation, { preview: false });
      if (movementSession.snapshot().phase !== "idle") movementSession.cancel("Move selection was discarded before changing the project.");
      return { projectId: useWorkspaceStore.getState().activeProjectId };
    },
    onSuccess: (next) => {
      const previous = queryClient.getQueryData<Project>(["project", next.id]);
      const warnings = previous ? surfacePruningWarnings(previous, next) : [];
      updateProjectCache(next);
      if (useWorkspaceStore.getState().activeProjectId !== next.id) return;
      setEditedThisSession(true);
      setNotice({ kind: "success", text: ["Change stored locally.", ...warnings].join(" "), lifetime: warnings.length ? "persistent" : "transient" });
    },
    onError: (error, _operation, context) => {
      if (error instanceof ApiError && error.code === "revision_conflict" && context?.projectId) {
        void queryClient.invalidateQueries({ queryKey: ["project", context.projectId] });
      }
      if (useWorkspaceStore.getState().activeProjectId !== context?.projectId) return;
      setNotice({ kind: "error", text: errorMessage(error) });
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

  const editingPending = useEditingStore(state => state.pending);
  const minimizationApplying = useMinimizationStore(state => state.applying);
  const busy = projectMutation.isPending || createMutation.isPending || movementBlocked || editingPending || minimizationApplying;

  const moveMembership = (scope: GroupScope, groupId: string | null) => {
    if (!project || project.id !== scope.projectId || projectMutation.isPending) return;
    projectMutation.mutate(
      () => projectApi.updateGroupMembership({ ...project, revision: scope.revision }, scope.entryIds, groupId, scope.selection),
      { onSuccess: (next) => {
        if (useWorkspaceStore.getState().activeProjectId !== scope.projectId) return;
        setNotice({ kind: "success", text: next.revision === scope.revision ? "Group membership unchanged." : `Organized ${scope.entryIds.length} complete structures.` });
        focusGroupAction(scope, groupId, next.revision);
      } },
    );
  };

  const entryActions = {
    onNewMolecule: () => { setMobilePanel(null); setNewMoleculeOpen(true); },
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
    onGroup: (_entry: Entry, scope: GroupScope) => setGroupDialog({ mode: "create", scope }),
    onMoveGroup: (scope: GroupScope) => setGroupDialog({ mode: "move", scope }),
    onRemoveGroup: (scope: GroupScope) => moveMembership(scope, null),
    onMembershipMenuClose: (scope: GroupScope) => {
      if (useWorkspaceStore.getState().activeProjectId === scope.projectId) groupReturnFocus(scope, null)?.focus();
    },
    onMoveMembership: moveMembership,
    onDelete: (entry: Entry) => setEntryDialog({ mode: "delete", entry }),
    onExport: (entry: Entry) => {
      setExportEntry(entry);
      setExportDialogOpen(true);
    },
  };

  const loadStructureProjections = async (
    entryIds: Iterable<string>,
  ): Promise<Map<string, StructureProjection>> => {
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
        return [entry.id, result] as const;
      }),
    );
    return new Map(loaded.filter((item): item is NonNullable<typeof item> => item !== null));
  };

  const minimization = useMinimization(project, selection, operation => projectMutation.mutateAsync(operation), clearCoordinatePreview, setNotice);
  useEffect(() => {
    if (projectDialogOpen || createMode || newMoleculeOpen || importDialogOpen || archiveImportDialogOpen || exportDialogOpen || entryDialog || jobDialogOpen || groupDialog) useMinimizationStore.getState().dismiss();
  }, [projectDialogOpen, createMode, newMoleculeOpen, importDialogOpen, archiveImportDialogOpen, exportDialogOpen, entryDialog, jobDialogOpen, groupDialog]);

  const loadStructures = async (entryIds: Iterable<string>): Promise<StructureMap> =>
    new Map(
      [...(await loadStructureProjections(entryIds))].map(([entryId, projection]) => [
        entryId,
        projection.structure,
      ]),
    );

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
    const capturedProjectId = project?.id;
    const capturedEpoch = useSelectionStore.getState().projectEpoch;
    void runSelectionOperation(async () => {
      const structures = await loadStructures(entries.map((entry) => entry.id));
      const latest = queryClient.getQueryData<Project>(["project", capturedProjectId]);
      if (!capturedProjectId || useWorkspaceStore.getState().activeProjectId !== capturedProjectId
        || useSelectionStore.getState().projectId !== capturedProjectId
        || useSelectionStore.getState().projectEpoch !== capturedEpoch
        || entries.some(entry => !latest?.entries.some(current => current.id === entry.id
          && current.current_artifact_id === entry.current_artifact_id))) return;
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

  const applyResidueSelection = (request: ResidueSelectionRequest) => {
    const state = useSelectionStore.getState();
    if (useWorkspaceStore.getState().activeProjectId !== request.projectId
      || state.projectId !== request.projectId || state.projectEpoch !== request.projectEpoch) return;
    const current = queryClient.getQueryData<Project>(["project", request.projectId]);
    const entry = current?.entries.find(item => item.id === request.entryId);
    if (!entry || entry.current_artifact_id !== request.artifactId) return;
    const projection = queryClient.getQueryData<StructureProjection>(["structure", request.projectId, entry.id, request.artifactId]);
    if (!projection) return;
    state.applyResidue(request, { projectId: request.projectId, artifactId: request.artifactId,
      source: { entryId: entry.id, normalized: projection.structure, hierarchy: projection.hierarchy } });
  };

  const applyViewerSelection = (operand: Selection, mode: SelectionMode, pick?: ViewerPick) => {
    const state = useSelectionStore.getState();
    if (!project || state.projectId !== project.id || useWorkspaceStore.getState().activeProjectId !== project.id) return;
    if (!pick) { state.apply(operand, mode); return; }
    const entryId = pick.atoms[0]?.structure_id;
    const entry = project.entries.find(item => item.id === entryId);
    if (!entry?.current_artifact_id) return;
    const projection = queryClient.getQueryData<StructureProjection>(["structure", project.id, entry.id, entry.current_artifact_id]);
    if (!projection) return;
    state.applyViewer(operand, mode, pick, { projectId: project.id, artifactId: entry.current_artifact_id,
      source: { entryId: entry.id, normalized: projection.structure, hierarchy: projection.hierarchy } });
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
    movement,
    onInspectorTaskChange: () => {
      if (movementSession.snapshot().phase === "active" || movementSession.snapshot().phase === "loading") movementSession.cancel("Move selection was discarded after changing inspector tasks.");
    },
    selection,
    pickingGranularity,
    selectionBusy,
    onApplySelection: applySelection,
    onSelectResidue: applyResidueSelection,
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
      if (!project || movementSession.snapshot().phase !== "idle") return;
      useMinimizationStore.getState().dismiss();
      const generation = ++numericalPreviewGeneration.current;
      let structures: StructureMap;
      try {
        structures = await loadStructures([transform.entry_id]);
      } catch (error) {
        if (generation !== numericalPreviewGeneration.current || movementSession.snapshot().phase !== "idle") return;
        throw error;
      }
      const currentProject = queryClient.getQueryData<Project>(["project", useWorkspaceStore.getState().activeProjectId]);
      if (generation !== numericalPreviewGeneration.current || movementSession.snapshot().phase !== "idle"
        || currentProject?.id !== project.id || currentProject.revision !== project.revision
        || JSON.stringify(transform.selection.atoms) !== JSON.stringify(useSelectionStore.getState().selection.atoms)) return;
      const structure = structures.get(transform.entry_id);
      if (!structure) throw new Error("The target structure is not loaded.");
      setCoordinatePreview(previewTransform(structure, transform));
    },
    onClearTransformPreview: clearCoordinatePreview,
    onTransform: async (transform: CoordinateTransform) => {
      if (!project) return;
      clearCoordinatePreview();
      await projectMutation.mutateAsync(() =>
        projectApi.transform(project, transform),
      );
    },
    onSuperpose: async (payload: SuperpositionRequest) => {
      if (!project) return null;
      clearCoordinatePreview();
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
      if (!["hydrogen.add", "hydrogen.remove", "bond.rotate", "coordinates.cleanup"].includes(edit.operation)) {
        const editing = useEditingStore.getState();
        if (editing.pending) throw new Error("Finish the current edit.");
        const generation = editing.generation;
        const captured = useSelectionStore.getState().selection;
        const owns = () => useWorkspaceStore.getState().activeProjectId === project.id && useEditingStore.getState().generation === generation;
        editing.setPending(true);
        try {
          const entry = project.entries.find(e => e.id === entryId);
          if (!entry?.current_artifact_id) throw new Error("Load the target before editing.");
          const structure = edit.operation === "bond.order" || edit.operation === "bond.delete"
            ? (await molecularApi.structure(project.id, entryId)).structure : undefined;
          if (!owns() || useSelectionStore.getState().selection !== captured) throw new Error("The target context changed; submit the edit again.");
          const direct = manualModelEdit(entryId, edit, structure);
          if (!direct) throw new Error("Unsupported direct action.");
          const result = await viewerActions.onEdit(entryId, entry.current_artifact_id, direct.selection, direct.action);
          return { ...result, report: { ...result.report, operation: edit.operation } };
        } catch (error) {
          if (owns()) setNotice({ kind: "error", text: errorMessage(error) });
          throw error;
        } finally { if (owns()) useEditingStore.getState().setPending(false); }
      }
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
          text: [`Ligand edit stored.${warningText}`, ...surfacePruningWarnings(project, result.project)].join(" "),
          lifetime: result.warnings.length || surfacePruningWarnings(project, result.project).length ? "persistent" : "transient",
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
          text: [`Protein edit stored.${warningText}`, ...surfacePruningWarnings(project, result.project)].join(" "),
          lifetime: result.warnings.length || surfacePruningWarnings(project, result.project).length ? "persistent" : "transient",
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

  const createMolecule = async (input: NewMoleculeInput, ownsResponse: () => boolean) => {
    if (!project) throw new Error("Open a project before creating a molecule.");
    const owner = project.id;
    const generation = useEditingStore.getState().generation;
    const captured = useSelectionStore.getState().selection;
    const result = await projectApi.createMolecule(project, input).catch((error: unknown) => {
      if (ownsResponse() && useWorkspaceStore.getState().activeProjectId === owner && useEditingStore.getState().generation === generation && error instanceof ApiError && error.code === "revision_conflict") {
        void queryClient.invalidateQueries({ queryKey: ["project", owner] });
      }
      throw error;
    });
    updateProjectCache(result.project);
    if (!ownsResponse() || useWorkspaceStore.getState().activeProjectId !== owner || useEditingStore.getState().generation !== generation) return;
    const latest = queryClient.getQueryData<Project>(["project", owner]);
    if (latest?.revision === result.project.revision && useSelectionStore.getState().selection === captured) {
      replaceSelection(result.selection_after);
      const editing = useEditingStore.getState();
      editing.setTargetEntryId(result.entry_id);
      editing.setSection("atoms"); editing.setFocusRequested(true); editing.setOpen(true);
      editing.setFocusNewMolecule({ entryId: result.entry_id, atomId: 1, selection: useSelectionStore.getState().selection });
    }
    setEditedThisSession(true); setNewMoleculeOpen(false);
    setNotice({ kind: "success", text: "Molecule created. Build with Add atom or Fragments in Edit; review scientific warnings.", lifetime: "persistent" });
  };

  const projects = projectsQuery.data ?? [];
  const viewerActions = {
    onEdit: async (entryId: string, artifactId: string, operand: Selection, action: SelectionEditAction, hydrogenPolicy: HydrogenPolicy = action.operation.startsWith("hydrogens.") ? "preserve" : "automatic") => {
      if (!project) throw new Error("Open a project before editing.");
      const owner = project.id;
      const generation = useEditingStore.getState().generation;
      const captured = useSelectionStore.getState().selection;
      const targetEntryId = useEditingStore.getState().targetEntryId;
      try {
        const result = await projectApi.selectionEdit(project, entryId, artifactId, operand, action, hydrogenPolicy);
        if (result.applied !== false) updateProjectCache(result.project);
        if (useWorkspaceStore.getState().activeProjectId === owner && useEditingStore.getState().generation === generation) {
          const latest = queryClient.getQueryData<Project>(["project", owner]);
          if (result.applied !== false && latest?.revision === result.project.revision && useSelectionStore.getState().selection === captured && useEditingStore.getState().targetEntryId === targetEntryId) {
            replaceSelection(result.selection_after);
            if (!result.selection_after.atoms.length) useEditingStore.getState().setTargetEntryId(entryId);
          }
          if (result.applied !== false) setEditedThisSession(true);
          setNotice({ kind: "success", text: result.applied === false ? "Hydrogen request made no changes; inspect the completion report." : [`Molecular edit stored. ${result.warnings.length} scientific warnings; see entry Details.`, ...surfacePruningWarnings(project, result.project)].join(" "), lifetime: "persistent" });
        }
        return result;
      } catch (error) {
        if (useWorkspaceStore.getState().activeProjectId === owner && useEditingStore.getState().generation === generation) {
          setNotice({ kind: "error", text: errorMessage(error) });
          void queryClient.invalidateQueries({ queryKey: ["project", owner] });
        }
        throw error;
      }
    },
    busy,
    coordinatePreview,
    minimization,
    movement,
    onRenderedMovementAtoms: (read: () => AtomReference[]) => { renderedMovementAtoms.current = read; },
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
    onLoadSelectionStructures: () =>
      loadStructureProjections(selectedEntryIds(selection)),
    onAtomVisibility: async (action: "hide" | "show") => {
      if (!project) return;
      await projectMutation.mutateAsync(() => projectApi.updateSelectionAtomVisibility(project, selection, action));
    },
    onLoadPocketStructures: () => loadStructureProjections(project?.entries.map((entry) => entry.id) ?? []),
    onSurfaces: {
      create: async (items: SurfaceCreateItem[]) => {
        if (!project) return;
        await projectMutation.mutateAsync(() => projectApi.createSurfaceObjects(project, items));
      },
      update: async (entryId: string, surfaceId: string, change: SurfaceChange) => {
        if (!project) return;
        await projectMutation.mutateAsync(() => projectApi.updateSurfaceObject(project, entryId, surfaceId, change));
      },
      remove: async (entryId: string, surfaceId: string) => {
        if (!project) return;
        await projectMutation.mutateAsync(() => projectApi.removeSurfaceObject(project, entryId, surfaceId));
      },
    },
    onAppearance: async (change: SelectionAppearanceChange) => {
      if (!project) return;
      await projectMutation.mutateAsync(() => projectApi.updateSelectionAppearance(project, selection, change));
    },
    onExpandDistance: async (
      distance: number, granularity: "atom" | "residue", signal: AbortSignal,
    ) => {
      if (!project) throw new Error("Open a project before expanding.");
      const seed = useSelectionStore.getState().selection;
      const molecularKey = (value: Project | undefined) => JSON.stringify(
        value?.entries.map((entry) => [entry.id, entry.current_artifact_id]),
      );
      const initialKey = molecularKey(project);
      return expandByDistance({
        selection: seed, distance, granularity, signal,
        load: inspectAllStructures,
        isCurrent: () =>
          useWorkspaceStore.getState().activeProjectId === project.id &&
          useSelectionStore.getState().selection === seed &&
          molecularKey(queryClient.getQueryData<Project>(["project", project.id])) === initialKey,
        apply: replaceSelection,
      });
    },
    onSelectionStyle: async (
      action: "apply" | "reset",
      style?: SelectionRepresentationStyle,
    ) => {
      if (!project) return;
      await projectMutation.mutateAsync(() =>
        projectApi.updateSelectionRepresentations(
          project,
          selection,
          action,
          style,
        ),
      );
      setNotice({
        kind: "success",
        text:
          action === "reset"
            ? "Selection representations reset to entry defaults."
            : "Selection representation applied.",
      });
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

        <ApplicationNotice notice={notice} setNotice={setNotice} />

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
                onViewerSelection={applyViewerSelection}
                loading={projectQuery.isLoading}
                onCreate={() => {
                  setCreateMode(true);
                  setProjectDialogOpen(true);
                }}
                onImport={() => setImportDialogOpen(true)}
                onNewMolecule={() => setNewMoleculeOpen(true)}
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
                        busy={busy}
                        project={project}
                        selection={selection}
                        selectedEntryIds={selectedEntryIds(selection)}
                        onSelectEntries={selectEntries}
                        onSelectHierarchy={applySelection}
                        onSelectResidue={applyResidueSelection}
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
                        onInspectMinimization={jobId => { if (project) { setMobilePanel(null); useMinimizationStore.getState().inspect(project.id, jobId); } }}
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
                    busy={busy}
                    project={project}
                    selection={selection}
                    selectedEntryIds={selectedEntryIds(selection)}
                    onSelectEntries={selectEntries}
                    onSelectHierarchy={applySelection}
                        onSelectResidue={applyResidueSelection}
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
                      onViewerSelection={applyViewerSelection}
                      loading={projectQuery.isLoading}
                      onCreate={() => {
                        setCreateMode(true);
                        setProjectDialogOpen(true);
                      }}
                      onImport={() => setImportDialogOpen(true)}
                onNewMolecule={() => setNewMoleculeOpen(true)}
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
                        onInspectMinimization={jobId => { if (project) { setMobilePanel(null); useMinimizationStore.getState().inspect(project.id, jobId); } }}
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

      {project && newMoleculeOpen ? <NewMoleculeDialog key={project.id} open={newMoleculeOpen}
        onOpenChange={setNewMoleculeOpen} onCreate={createMolecule} /> : null}
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
            lifetime: result.warnings.length ? "persistent" : "transient",
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

      {groupDialog && project && groupDialog.scope.projectId === project.id ? (
        <GroupMembershipDialog
          project={project} request={groupDialog} busy={busy}
          onClose={() => setGroupDialog(current => current === groupDialog ? null : current)}
          onSubmit={async (scope, target) => {
            if (project.id !== scope.projectId || projectMutation.isPending) return;
            const captured = { ...project, revision: scope.revision };
            const next = await projectMutation.mutateAsync(() =>
              "name" in target
                ? projectApi.createGroup(captured, target.name, scope.entryIds, scope.selection)
                : projectApi.updateGroupMembership(captured, scope.entryIds, target.groupId, scope.selection),
            );
            if (useWorkspaceStore.getState().activeProjectId !== scope.projectId) return;
            setNotice({ kind: "success", text: next.revision === scope.revision ? "Group membership unchanged." : `Organized ${scope.entryIds.length} complete structures.` });
          }}
        />
      ) : null}
      <Modal
        open={entryDialog !== null}
        onOpenChange={(open) => {
          if (!open) setEntryDialog(null);
        }}
        title={
          entryDialog?.mode === "rename"
            ? "Rename structure"
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
