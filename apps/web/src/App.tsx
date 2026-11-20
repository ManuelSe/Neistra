import { LigandIntentOwner, type LigandOwnerContext } from "./ligands/ownership";
import { completeLegacyLigands } from "./ligands/resolve";
import { LigandDesignationControls } from "./components/LigandDesignationControls";
import { LigandProperties } from "./components/LigandProperties";
import { captureArtifactSource, getLigandInventoryOwner, ligandOperationSourceFailure } from "./ligands/inventoryQualification";
import { LigandPropertySession } from "./ligandProperties/session";
import { PropertyInputOwner, type PropertyOwnerContext } from "./ligandProperties/ownership";
import { PROPERTY_PREFERENCES_KEY, PROPERTY_REGISTRY_KEY, propertyInputKey } from "./ligandProperties/context";
import { useLigandProperties, usePropertySourceVerification } from "./ligandProperties/useProperties";
import { ProfileSelection } from "./ligandProfiles/context";
import { useLigandProfiles } from "./ligandProfiles/useProfiles";
import type { DescriptorRegistry, PropertyPreferences } from "./ligandProperties/types";
import { ligandApi } from "./ligands/api";
import { useLegacyLigandResolution } from "./ligands/useLegacyLigandResolution";
import { hydrogenAppearanceCommand } from "./selection/hydrogenAction";
import { MeasurementSession, type MeasurementPorts } from "./measurements/session";
import { measurementPreviewPaused } from "./measurements/preview";
import { createSurfaceManagerSession } from "./surfaces/surfaceManagerSession";
import { createdSurfaceIdentities } from "./surfaces/createdSurfaces";
import { seedCoordinateProjections } from "./coordinates/cache";
import { isCompleteProjection, structureQueryKey, structureQueryOptions } from "./structures/query";
import { captureProjectCommand, dispatchProjectCommand, type ProjectCommand } from "./coordinates/projectCommand";
import { usePresentation } from "./presentation/context";
import type { ResidueSelectionRequest, ViewerPick } from "./selection/gestures";
import { useMinimization } from "./minimization/useMinimization";
import { useMinimizationStore } from "./minimization/store";
import { QuickPublicationSession, type QuickPublicationAttempt } from "./minimization/publication";
import { createPublicationJournal } from "./minimization/publicationJournal";
import { manualModelEdit } from "./editing/manual";
import { NewMoleculeDialog, type NewMoleculeInput } from "./components/NewMoleculeDialog";
import type { HydrogenPolicy } from "./api/types";
import { surfacePruningWarnings } from "./selection/surfaceWarnings";
import { WorkspacePresentationController } from "./workspacePresentation/controller";
import { CameraRecovery } from "./components/CameraRecovery";
import { useEditingStore } from "./store/editing";
import { EditAttemptController, EditApplyError, editAttemptBlocksWrites, type EditReview } from "./editing/attempt";
import { createEditAttemptJournal } from "./editing/attemptJournal";
import { assertSelectionTargetCurrent, type SelectionTargetCapture } from "./selection/capture";
import { wholeResidueSelection } from "./editing/residues";
import { expandByDistance } from "./selection/expansion";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MutateOptions } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History as HistoryIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { ApiError, jobApi, projectApi, quickMinimizationApi, workspacePresentationApi } from "./api/client";
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
  ProteinEdit,
  Project,
  ProjectListItem,
  SavedSelection,
  Scene,
  SelectionGranularity,
  SelectionColorMode,
  SelectionMode,
  SelectionRepresentationStyle,
  SelectionRepresentationChannel,
  SelectionAppearanceChange,
  HydrogenAppearanceChange,
  CapturedHydrogenTarget,
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
import { useSequenceNavigationStore } from "./store/sequenceNavigation";
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
  const [cameraPresentation] = useState(() => new WorkspacePresentationController({
    api: workspacePresentationApi,
    storage: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) },
  }));
  useEffect(() => {
    cameraPresentation.start();
    const flush = () => { void cameraPresentation.flush({ keepalive: true }); };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
      cameraPresentation.stop();
    };
  }, [cameraPresentation]);
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
  const recoveryClassifiedProjects = useRef(new Set<string>());
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionColorMode, setSelectionColorMode] =
    useState<SelectionColorMode>("carbon");
  const [coordinatePreview, setCoordinatePreviewState] =
    useState<CoordinatePatch | null>(null);
  const coordinatePreviewRef = useRef<CoordinatePatch | null>(null);
  const numericalPreviewGeneration = useRef(0);
  const ligandOwnerPorts = useRef<(() => LigandOwnerContext) | null>(null);
  const [ligandOwner] = useState(() => new LigandIntentOwner(() => ligandOwnerPorts.current!()));
  const propertyOwnerPorts = useRef<(() => PropertyOwnerContext) | null>(null);
  const [inventoryOwner] = useState(() => getLigandInventoryOwner(queryClient));
  const [propertyOwner] = useState(() => new PropertyInputOwner(() => propertyOwnerPorts.current!()));
  const [profileSelection] = useState(() => new ProfileSelection(queryClient));
  const [propertySession] = useState(() => new LigandPropertySession(target => propertyOwner.capture(target)));
  useEffect(() => { propertySession.activate(); return () => propertySession.deactivate(); }, [propertySession]);
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
    if (!compact || !mobilePanel) return;
    const panel = mobilePanelRef.current;
    const openingFocus = document.activeElement;
    if (!panel || panel.contains(openingFocus)) return;
    const frame = requestAnimationFrame(() => {
      if (!panel.isConnected || mobilePanelRef.current !== panel) return;
      const currentFocus = document.activeElement;
      if (currentFocus !== openingFocus
        && !(currentFocus === document.body && !openingFocus?.isConnected)) return;
      panel.querySelector<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [compact, mobilePanel]);

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
  const measurementPorts = useRef<MeasurementPorts | null>(null);
  const [measurementSession] = useState(() => new MeasurementSession({
    context: () => measurementPorts.current!.context(),
    structures: references => measurementPorts.current!.structures(references),
    create: (capture, context) => measurementPorts.current!.create(capture, context),
  }));
  const setCoordinatePreview = useCallback((next: CoordinatePatch | null) => {
    if (next !== coordinatePreviewRef.current) ligandOwner.retire();
    coordinatePreviewRef.current = next;
    propertyOwner.observe();
    // Retire measurement owners before React can batch preview entry and Cancel.
    measurementSession.guardContext();
    setCoordinatePreviewState(next);
  }, [measurementSession, ligandOwner, propertyOwner]);
  const clearCoordinatePreview = useCallback(() => {
    numericalPreviewGeneration.current++;
    setCoordinatePreview(null);
  }, [setCoordinatePreview]);
  const surfaceSession = useMemo(() => createSurfaceManagerSession(activeProjectId ?? ""), [activeProjectId]);
  const previousSurfaceSession = useRef(surfaceSession);
  useEffect(() => {
    const previous = previousSurfaceSession.current;
    previousSurfaceSession.current = surfaceSession;
    if (previous !== surfaceSession && previous.hasUnappliedDrafts()) {
      setNotice({ kind: "success", text: "Unapplied surface source changes were discarded when switching projects." });
    }
  }, [surfaceSession]);
  const presentation = usePresentation();
  useLayoutEffect(() => { presentation?.retire(); }, [presentation, activeProjectId]);
  useEffect(() => setNewMoleculeOpen(false), [project?.id]);

  useEffect(() => {
    useNavigationStore.getState().setProject(activeProjectId);
    useSequenceNavigationStore.getState().setProject(activeProjectId);
    useEditingStore.getState().setProject(activeProjectId);
    useMinimizationStore.getState().setProject(activeProjectId);
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
    if (!project || recoveryClassifiedProjects.current.has(project.id)) return;
    recoveryClassifiedProjects.current.add(project.id);
    if (project.has_uncheckpointed_changes && !editedThisSession) {
      setNotice(current => current ?? { kind: "success", text: "Recovered locally stored changes." });
    }
  }, [editedThisSession, project]);

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

  const publicationPorts = useRef({
    acceptProject: (next: Project) => updateProjectCache(next),
    notice: (id: string, text: string, error: boolean, lifetime: ApplicationNoticeValue["lifetime"] = "persistent") => {
      if (id === useWorkspaceStore.getState().activeProjectId) {
        setNotice({ kind: error ? "error" : "success", text, lifetime });
      }
    },
  });
  publicationPorts.current = {
    acceptProject: next => {
      updateProjectCache(next);
      if (next.id === useWorkspaceStore.getState().activeProjectId) setEditedThisSession(true);
    },
    notice: (id, text, error, lifetime = "persistent") => {
      if (id === useWorkspaceStore.getState().activeProjectId) {
        setNotice({ kind: error ? "error" : "success", text, lifetime });
      }
    },
  };
  const [publication] = useState(() => new QuickPublicationSession({
    sendApply: attempt => quickMinimizationApi.apply(attempt.projectId, attempt.jobId,
      attempt.expectedRevision, attempt.proposalSha256),
    readProject: projectApi.get,
    readJob: jobApi.get,
    acceptProject: next => publicationPorts.current.acceptProject(next),
    notice: (id, text, error, lifetime) => publicationPorts.current.notice(id, text, error, lifetime),
  }, createPublicationJournal()));
  const publicationState = useSyncExternalStore(publication.subscribe,
    () => publication.snapshot(activeProjectId ?? ""));
  const [editAttempts] = useState(() => new EditAttemptController(createEditAttemptJournal()));
  const editAttempt = useSyncExternalStore(editAttempts.subscribe,
    () => editAttempts.snapshot(activeProjectId ?? ""));
  const editReviewContext = useRef<{ id: string; selection: Selection; epoch: number; key: string } | null>(null);
  const publicationBlocked = publicationState.phase !== "idle";
  const assertPublicationWritable = (id: string) => {
    try { publication.assertWritable(id); editAttempts.assertWritable(id); }
    catch (error) {
      if (id === useWorkspaceStore.getState().activeProjectId) {
        setNotice({ kind: "error", lifetime: "persistent", text: error instanceof Error
          ? error.message : "Reconcile quick minimization before changing this project." });
      }
      throw new ApiError(409, "quick_publication_busy", error instanceof Error
        ? error.message : "Reconcile quick minimization before changing this project.");
    }
  };
  useLayoutEffect(() => {
    if (activeProjectId) void publication.attachProject(activeProjectId);
  }, [activeProjectId, publication]);

  const selectionTargetContext = () => {
    const current = useSelectionStore.getState(), active = useWorkspaceStore.getState().activeProjectId;
    return { activeProjectId: active, selectionProjectId: current.projectId, projectEpoch: current.projectEpoch,
      project: queryClient.getQueryData<Project>(["project", active]), selection: current.selection };
  };
  const { session: movementSession, workflow: movement } = useMovementSession({
    targetContext: selectionTargetContext,
    beforeStart: () => {
      const reason = minimization.startReason();
      if (reason) throw new Error(reason);
      if (project) assertPublicationWritable(project.id);
      clearCoordinatePreview(); useMinimizationStore.getState().dismiss();
    },
    context: () => ({
      project: queryClient.getQueryData<Project>(["project", useWorkspaceStore.getState().activeProjectId]),
      selection: useSelectionStore.getState().selection,
    }),
    load: async (captured, ids) => new Map(await Promise.all(ids.map(async id => {
      const entry = captured.entries.find(item => item.id === id);
      if (!entry?.current_artifact_id) throw new Error("A selected structure is unavailable.");
      const projection = await queryClient.fetchQuery(structureQueryOptions(captured.id, id, entry.current_artifact_id));
      return [id, projection] as const;
    }))),
    rendered: () => renderedMovementAtoms.current(),
    commit: (captured, transform) => {
      assertPublicationWritable(captured.id);
      return projectApi.transformSelection(captured, transform);
    },
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

  const commandMutation = useMutation({
    mutationFn: (command: ProjectCommand) => dispatchProjectCommand(command, assertPublicationWritable),
    onMutate: (command: ProjectCommand) => {
      command.context?.assertDispatchable();
      assertPublicationWritable(command.projectId);
      if (command.projectId === useWorkspaceStore.getState().activeProjectId) {
        if (["submitting", "reconciling", "uncertain"].includes(movementSession.snapshot().phase)) throw new ApiError(409, "movement_busy", "Finish or reconcile the current movement before changing the project.");
        clearCoordinatePreview();
        const minimization = useMinimizationStore.getState();
        minimization.patch(minimization.generation, { preview: false });
        if (movementSession.snapshot().phase !== "idle") movementSession.cancel("Move selection was discarded before changing the project.");
      }
      return { projectId: command.projectId };
    },
    onSuccess: (next, command) => {
      const previous = queryClient.getQueryData<Project>(["project", next.id]);
      const superseded = previous !== undefined && previous.revision > next.revision;
      const warnings = previous && !superseded ? surfacePruningWarnings(previous, next) : [];
      updateProjectCache(next);
      if (superseded || (command.context && !command.context.ownsFeedback())) return;
      if (useWorkspaceStore.getState().activeProjectId !== next.id) return;
      setEditedThisSession(true);
      if (command.feedback !== "quiet" || warnings.length) setNotice({ kind: "success", text: ["Change stored locally.", ...warnings].join(" "), lifetime: warnings.length ? "persistent" : "transient" });
    },
    onError: (error, command) => {
      if (error instanceof ApiError && error.code === "revision_conflict") {
        void queryClient.invalidateQueries({ queryKey: ["project", command.projectId] });
      }
      if (command.context && !command.context.ownsFeedback()) return;
      if (useWorkspaceStore.getState().activeProjectId !== command.projectId || command.feedback === "quiet") return;
      setNotice({ kind: "error", text: errorMessage(error) });
    },
  });
  type CommandOptions = MutateOptions<Project, Error, ProjectCommand, { projectId: string }>;
  const projectMutation = {
    ...commandMutation,
    mutate: (operation: () => Promise<Project>, options?: CommandOptions) => {
      if (project) commandMutation.mutate(captureProjectCommand(project.id, operation), options);
    },
    mutateAsync: (operation: () => Promise<Project>, options?: CommandOptions) => project
      ? commandMutation.mutateAsync(captureProjectCommand(project.id, operation), options)
      : Promise.reject(new ApiError(409, "project_missing", "Open a project before editing.")),
  };

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
  const editBlocked = editAttemptBlocksWrites(editAttempt);
  const busy = projectMutation.isPending || createMutation.isPending || movementBlocked || editingPending || minimizationApplying || publicationBlocked || editBlocked;
  const readBusy = projectMutation.isPending || createMutation.isPending || movementBlocked || editingPending || (minimizationApplying && !publicationBlocked);
  const ligandEntryId = useNavigationStore(state => state.projectId === activeProjectId ? state.inspectedEntryId : null);
  const ligandEditingPreview = useEditingStore(state => !!state.placement?.result || !!state.rotationDraft);
  const ligandMinimizationPreview = useMinimizationStore(state => state.preview);
  const ligandPausedReason = coordinatePreview || ligandEditingPreview || ligandMinimizationPreview
    || movement.state.phase !== "idle" ? "Preview — values unavailable. Finish the current preview to change the ligand choice."
    : publicationBlocked || editBlocked ? "Reconcile the pending molecular change before choosing a ligand." : null;
  ligandOwnerPorts.current = () => {
    const active = useWorkspaceStore.getState().activeProjectId;
    const navigation = useNavigationStore.getState(), edit = useEditingStore.getState();
    const minimize = useMinimizationStore.getState(), move = movementSession.snapshot();
    return { activeProjectId: active, project: queryClient.getQueryData<Project>(["project", active]),
      inspectedEntryId: navigation.projectId === active ? navigation.inspectedEntryId : null,
      blocked: edit.pending || minimize.applying,
      paused: Boolean(coordinatePreviewRef.current)
        || Boolean(edit.projectId === active && (edit.placement?.result || edit.rotationDraft))
        || Boolean(minimize.projectId === active && (minimize.preview || minimize.applying))
        || Boolean(move.capture?.project.id === active && move.phase !== "idle")
        || publication.snapshot(active ?? "").phase !== "idle"
        || editAttemptBlocksWrites(editAttempts.snapshot(active ?? "")),
    };
  };
  useSyncExternalStore(ligandOwner.subscribe, ligandOwner.snapshot);
  useLayoutEffect(() => {
    const guard = ligandOwner.observe;
    ligandOwner.activate();
    guard();
    const release = [useWorkspaceStore.subscribe(guard), useNavigationStore.subscribe(guard),
      useEditingStore.subscribe(guard), useMinimizationStore.subscribe(guard), movementSession.subscribe(guard),
      publication.subscribe(guard), editAttempts.subscribe(guard),
      queryClient.getQueryCache().subscribe(event => {
        const key = event.query.queryKey as readonly unknown[];
        if (key[0] === "project") guard();
      })];
    return () => { for (const stop of release) stop(); ligandOwner.deactivate(); };
  }, [ligandOwner, movementSession, publication, editAttempts, queryClient]);
  const ligandViewOwner = ligandOwner.capture(true);
  propertyOwnerPorts.current = () => {
    const active = useWorkspaceStore.getState().activeProjectId;
    const current = queryClient.getQueryData<Project>(["project", active]);
    const navigation = useNavigationStore.getState(), edit = useEditingStore.getState();
    const minimize = useMinimizationStore.getState(), move = movementSession.snapshot();
    const inspected = navigation.projectId === active ? navigation.inspectedEntryId : null;
    const entry = current?.entries.find(item => item.id === inspected);
    const registry = queryClient.getQueryState<DescriptorRegistry>(PROPERTY_REGISTRY_KEY);
    const preferences = queryClient.getQueryState<PropertyPreferences>(PROPERTY_PREFERENCES_KEY);
    return { activeProjectId: active, inspectedEntryId: inspected,
      sourceIdentity: active && entry ? { projectId: active, entryId: entry.id,
        currentArtifactId: entry.current_artifact_id, originalArtifactId: entry.original_artifact_id } : null,
      inputKey: propertyInputKey(active, entry, registry?.status === "success" ? registry.data : undefined,
        preferences?.status === "success" ? preferences.data : undefined,
        profileSelection.dependencies(registry?.status === "success" ? registry.data : undefined)),
      paused: Boolean(coordinatePreviewRef.current)
        || Boolean(edit.projectId === active && (edit.placement?.result || edit.rotationDraft))
        || Boolean(minimize.projectId === active && (minimize.preview || minimize.applying))
        || Boolean(move.capture?.project.id === active && move.phase !== "idle")
        || publication.snapshot(active ?? "").phase !== "idle"
        || editAttemptBlocksWrites(editAttempts.snapshot(active ?? "")),
    };
  };
  useLayoutEffect(() => {
    const guard = propertyOwner.observe;
    propertyOwner.activate(); guard();
    const release = [useWorkspaceStore.subscribe(guard), useNavigationStore.subscribe(guard),
      useEditingStore.subscribe(guard), useMinimizationStore.subscribe(guard), movementSession.subscribe(guard),
      publication.subscribe(guard), editAttempts.subscribe(guard),
      queryClient.getQueryCache().subscribe(event => {
        const key = event.query.queryKey as readonly unknown[];
        if (event.type === "updated" && key[0] === "project") guard();
      })];
    return () => { for (const stop of release) stop(); propertyOwner.deactivate(); };
  }, [propertyOwner, movementSession, publication, editAttempts, queryClient]);
  usePropertySourceVerification(inventoryOwner, propertySession, propertyOwner);
  const profileState = useLigandProfiles(!!project, profileSelection, propertyOwner);
  const propertyState = useLigandProperties({ project, entryId: ligandEntryId, pausedReason: ligandPausedReason,
    session: propertySession, owner: propertyOwner, profileSelection });
  useLegacyLigandResolution({
    project, activeProjectId, priorityEntryId: ligandEntryId, openEpoch: ligandOwner.openVisit(),
    blocked: busy || !!ligandPausedReason,
    captureErrorOwner: () => ligandOwner.capture(false).ownsFeedback,
    resolve: (captured, entryIds) => {
      const owner = ligandOwner.capture(false);
      return completeLegacyLigands(captured, entryIds, {
        current: () => owner.ownsFeedback(),
        resolve: (source, ids) => {
          const projectId = source.id, revision = source.revision, requestedIds = [...ids];
          const sources = source.entries.filter(entry => requestedIds.includes(entry.id)).map(entry => captureArtifactSource(projectId, entry));
          const context = { ownsFeedback: owner.ownsFeedback,
            assertDispatchable: () => owner.assertDispatchable(source, ids) };
          context.assertDispatchable();
          return commandMutation.mutateAsync(captureProjectCommand(source.id,
            async () => {
              try { return await ligandApi.resolve(projectId, revision, requestedIds); }
              catch (error) {
                const proof = ligandOperationSourceFailure(error, sources, "resolve");
                if (proof) inventoryOwner.recordSourceFailure(proof);
                throw error;
              }
            }, "quiet", context));
        },
        read: projectApi.get,
        accept: updateProjectCache,
      });
    },
    onError: (owner, error) => {
      if (owner === useWorkspaceStore.getState().activeProjectId) setNotice({ kind: "error", text: errorMessage(error) });
    },
  });
  const ligandControls = project ? <><LigandDesignationControls project={project} entryId={ligandEntryId}
    onInspectEntry={id => useNavigationStore.getState().inspect(project.id, id)}
    onOpenChoices={() => measurementSession.cancelAcquisition("Atom picking stopped for ligand choice.")}
    ownsContext={ligandViewOwner.ownsFeedback}
    pausedReason={ligandPausedReason} busy={busy}
    onDesignate={async (entry, candidateKey, inputHash, ownsAttempt) => {
      const captured = project;
      const source = captureArtifactSource(captured.id, entry), revision = captured.revision;
      const context = { ownsFeedback: () => ligandViewOwner.ownsFeedback() && (!ownsAttempt || ownsAttempt()),
        assertDispatchable: () => {
          if (ownsAttempt && !ownsAttempt()) throw new ApiError(409, "ligand_context_changed", "The ligand choice was closed. Review the current choice before saving.");
          ligandViewOwner.assertDispatchable(captured, [entry.id]);
        } };
      context.assertDispatchable();
      if (busy) throw new ApiError(409, "ligand_context_changed", "Another change is being saved.");
      const next = await commandMutation.mutateAsync(captureProjectCommand(captured.id,
        async () => {
          try {
            return await ligandApi.designate(source.projectId, source.entryId, {
              expected_revision: revision, expected_artifact_id: source.currentArtifactId,
              ...(candidateKey ? { candidate_key: candidateKey, expected_input_hash: inputHash } : { clear: true }),
            });
          } catch (error) {
            const proof = ligandOperationSourceFailure(error, [source], candidateKey ? "use" : "clear");
            if (proof) inventoryOwner.recordSourceFailure(proof);
            throw error;
          }
        }, undefined, context));
      const current = queryClient.getQueryData<Project>(["project", captured.id]);
      return !context.ownsFeedback() || (current && current.revision > next.revision) ? "superseded" : "current";
    }} /><LigandProperties state={propertyState} session={propertySession} profiles={profileState} /></> : null;

  measurementPorts.current = {
    context: () => {
      const active = useWorkspaceStore.getState().activeProjectId;
      const selectionState = useSelectionStore.getState();
      const edit = useEditingStore.getState(), minimize = useMinimizationStore.getState();
      const move = movementSession.snapshot();
      return {
        project: queryClient.getQueryData<Project>(["project", active]),
        activeProjectId: active, selectionProjectId: selectionState.projectId, projectEpoch: selectionState.projectEpoch,
        paused: measurementPreviewPaused({
          movement: Boolean(move.capture?.project.id === active && move.phase !== "idle"),
          coordinates: Boolean(coordinatePreviewRef.current),
          placement: Boolean(edit.projectId === active && edit.open && edit.placement),
          minimization: Boolean(minimize.projectId === active && (minimize.preview || minimize.applying)),
        }),
        busy,
      };
    },
    structures: references => {
      const active = useWorkspaceStore.getState().activeProjectId;
      const current = queryClient.getQueryData<Project>(["project", active]);
      return new Map([...new Set(references.map(ref => ref.structure_id))].flatMap(id => {
        const entry = current?.entries.find(entry => entry.id === id);
        const key = structureQueryKey(active ?? "", id, entry?.current_artifact_id);
        const query = queryClient.getQueryState<StructureProjection>(key);
        return query?.status === "success" && isCompleteProjection(query.data, id, entry?.current_artifact_id)
          ? [[id, query.data.structure] as const] : [];
      }));
    },
    create: async (capture, context) => {
      const next = await commandMutation.mutateAsync(captureProjectCommand(capture.project.id,
        () => projectApi.createMeasurement(capture.project, capture.name, capture.kind, capture.references), "quiet", context));
      const current = queryClient.getQueryData<Project>(["project", next.id]);
      return current && current.revision > next.revision ? "superseded" : "current";
    },
  };
  useLayoutEffect(() => {
    const guard = () => measurementSession.guardContext();
    const release = [useWorkspaceStore.subscribe(guard), useSelectionStore.subscribe(guard),
      useEditingStore.subscribe(() => {
        if (useEditingStore.getState().open) measurementSession.cancelAcquisition("Atom picking stopped for editing.");
        guard();
      }), useMinimizationStore.subscribe(guard), movementSession.subscribe(() => {
        if (movementSession.snapshot().phase !== "idle") measurementSession.cancelAcquisition("Atom picking stopped for movement.");
        guard();
      }),
      queryClient.getQueryCache().subscribe(event => {
        const key = event.query.queryKey as readonly unknown[];
        if (key[0] === "project") guard();
      })];
    return () => { for (const stop of release) stop(); measurementSession.close(); };
  }, [measurementSession, movementSession, queryClient]);
  useLayoutEffect(() => { measurementSession.guardContext(); }, [measurementSession, project, activeProjectId, coordinatePreview, busy]);

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
        const result = await queryClient.fetchQuery(structureQueryOptions(project.id, entry.id, entry.current_artifact_id));
        return [entry.id, result] as const;
      }),
    );
    return new Map(loaded.filter((item): item is NonNullable<typeof item> => item !== null));
  };

  const minimization = useMinimization(project, selection,
    (operation, attempt?: QuickPublicationAttempt) => {
      if (!attempt) return projectMutation.mutateAsync(operation);
      if (attempt.projectId === useWorkspaceStore.getState().activeProjectId) {
        if (["submitting", "reconciling", "uncertain"].includes(movementSession.snapshot().phase)) {
          throw new ApiError(409, "movement_busy", "Finish or reconcile movement before applying minimization.");
        }
        clearCoordinatePreview();
        if (movementSession.snapshot().phase !== "idle") movementSession.cancel("Unapplied movement was discarded before minimization publication.");
      }
      assertPublicationWritable(attempt.projectId);
      return publication.start(attempt);
    },
    clearCoordinatePreview, setNotice, publication, selectionTargetContext, assertPublicationWritable);
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
    const projection = queryClient.getQueryData<StructureProjection>(structureQueryKey(request.projectId, entry.id, request.artifactId));
    if (!isCompleteProjection(projection, entry.id, request.artifactId)) return;
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
    const projection = queryClient.getQueryData<StructureProjection>(structureQueryKey(project.id, entry.id, entry.current_artifact_id));
    if (!isCompleteProjection(projection, entry.id, entry.current_artifact_id)) return;
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
      measurementSession.cancelAcquisition();
      if (movementSession.snapshot().phase === "active" || movementSession.snapshot().phase === "loading") movementSession.cancel("Move selection was discarded after changing inspector tasks.");
    },
    selection,
    pickingGranularity,
    selectionBusy,
    onApplySelection: applySelection,
    onPickingGranularity: (granularity: SelectionGranularity) => { measurementSession.cancelAcquisition(); setPickingGranularity(granularity); },
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
    onOpenMeasurements: () => {
      useEditingStore.getState().setOpen(false); useMinimizationStore.getState().dismiss();
      measurementSession.open();
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
        assertPublicationWritable(project.id);
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
            ? (await queryClient.fetchQuery(structureQueryOptions(project.id, entryId, entry.current_artifact_id))).structure : undefined;
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
        assertPublicationWritable(project.id);
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
        assertPublicationWritable(project.id);
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
    assertPublicationWritable(project.id);
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

  const editReviewKey = (value: Project) => JSON.stringify([value.id, value.revision,
    value.entries.map(entry => [entry.id, entry.current_artifact_id, entry.locked])]);
  const editReviewIsCurrent = () => {
    const proof = editReviewContext.current, context = selectionTargetContext();
    return Boolean(proof && editAttempts.recoveryOwner(context.activeProjectId ?? "") === proof.id
      && context.project && proof.epoch === context.projectEpoch && proof.selection === context.selection
      && context.activeProjectId === context.selectionProjectId && editReviewKey(context.project) === proof.key);
  };
  const checkEdit = async (owner: string, reviewed?: (value: Project) => void) => editAttempts.check(owner,
    identity => projectApi.editAttempt(owner, identity.id), async () => {
      const latest = await projectApi.get(owner); updateProjectCache(latest);
      await queryClient.invalidateQueries({ queryKey: ["structure", owner] });
      reviewed?.(latest);
    });
  const reviewEdit = async (acknowledge = false) => {
    const context = selectionTargetContext(), owner = context.activeProjectId;
    if (!owner || !context.project) return;
    const before = editAttempts.snapshot(owner), identity = before.identity, priorReview = before.review;
    const recoveryOwner = editAttempts.recoveryOwner(owner);
    if (!before.canReview) return;
    if (acknowledge && (!priorReview || !editReviewIsCurrent())) {
      editAttempts.reviewFailed(owner, recoveryOwner, "Project changed — review again."); return;
    }
    try {
      let reviewed: Project | undefined;
      await checkEdit(owner, value => { reviewed = value; });
      const status = editAttempts.snapshot(owner);
      if (editAttempts.recoveryOwner(owner) !== recoveryOwner || !status.canReview) return;
      const latest = reviewed;
      if (!latest) throw new Error("The current project could not be reviewed. Editing remains paused.");
      const target = latest.entries.find(entry => entry.id === identity?.entryId);
      if (target?.current_artifact_id) await queryClient.fetchQuery(structureQueryOptions(owner, target.id, target.current_artifact_id));
      const now = selectionTargetContext();
      if (now.activeProjectId !== owner || now.selectionProjectId !== owner || now.selection !== context.selection
        || now.projectEpoch !== context.projectEpoch || !now.project || editReviewKey(now.project) !== editReviewKey(latest)) {
        throw new Error("Project changed — review again.");
      }
      const review: EditReview = { revision: latest.revision, artifactId: target?.current_artifact_id ?? null,
        undo: latest.history.undo_description, redo: latest.history.redo_description, contextKey: editReviewKey(latest),
        ...(status.journalRecovery && !status.journalRecovery.acknowledged ? { identityUnavailable: true } : {}) };
      if (acknowledge && JSON.stringify(review) !== JSON.stringify(priorReview)) throw new Error("Project changed — review again.");
      editReviewContext.current = { id: recoveryOwner, selection: now.selection, epoch: now.projectEpoch, key: review.contextKey };
      editAttempts.setReview(owner, recoveryOwner, review);
      if (acknowledge && editAttempts.acknowledgeRecovery(owner, recoveryOwner, review)) {
        useEditingStore.getState().setPlacement(null);
        useEditingStore.getState().setRotationDraft(null);
      }
    } catch (error) { editAttempts.reviewFailed(owner, recoveryOwner, errorMessage(error)); }
  };
  const projects = projectsQuery.data ?? [];
  const measurementCommand = async (measurement: Measurement, operation: (captured: Project) => Promise<Project>, message: string) => {
    const captured = measurementPorts.current!.context().project;
    const scope = measurementSession.snapshot();
    const ownsFeedback = () => measurementSession.ownsSession(scope.session)
      && measurementSession.snapshot().generation === scope.generation && measurementSession.inspectionAvailable();
    if (!captured || !ownsFeedback()) throw new Error("Open the current measurement tool before changing measurements.");
    const context = {
      ownsFeedback,
      assertDispatchable: () => {
        const current = measurementPorts.current!.context().project;
        if (!ownsFeedback() || current?.revision !== captured.revision || !current.measurements.some(item => item.id === measurement.id)) {
          throw new Error("The measurement changed. Review its current record.");
        }
      },
    };
    try {
      const next = await commandMutation.mutateAsync(captureProjectCommand(captured.id, () => operation(captured), "quiet", context));
      const current = queryClient.getQueryData<Project>(["project", captured.id]);
      if (ownsFeedback() && (!current || current.revision <= next.revision)) measurementSession.notify(message, scope.session);
    } catch (error) {
      if (ownsFeedback()) measurementSession.notify(errorMessage(error), scope.session);
      throw error;
    }
  };

  const viewerActions = {
    measurementSession,
    onUpdateMeasurement: (measurement: Measurement, name: string, visible: boolean) => measurementCommand(measurement,
      captured => projectApi.updateMeasurement(captured, measurement.id, name, visible), `Updated ${name}.`),
    onDeleteMeasurement: (measurement: Measurement) => measurementCommand(measurement,
      captured => projectApi.deleteMeasurement(captured, measurement.id), `Deleted ${measurement.name}.`),
    onGeometry: async (kind: "move" | "quick" | "advanced", capture: SelectionTargetCapture) => {
      assertSelectionTargetCurrent(capture, selectionTargetContext());
      assertPublicationWritable(capture.projectId);
      if (movementSession.snapshot().phase !== "idle") throw new Error("Finish or cancel movement before opening another geometry tool.");
      const editorIntent = useEditingStore.getState();
      await Promise.all(Object.entries(capture.artifacts).map(([id, artifact]) => queryClient.fetchQuery(structureQueryOptions(capture.projectId, id, artifact))));
      assertSelectionTargetCurrent(capture, selectionTargetContext());
      const currentEditor = useEditingStore.getState();
      if (!currentEditor.open || currentEditor.projectId !== editorIntent.projectId || currentEditor.generation !== editorIntent.generation
        || currentEditor.section !== editorIntent.section) throw new Error("The editor target changed or closed. Open geometry again for the current target.");
      assertPublicationWritable(capture.projectId);
      if (kind === "move") {
        const reason = minimization.startReason(); if (reason) throw new Error(reason);
        movement.start(capture);
        return true;
      }
      if (movementSession.snapshot().phase !== "idle") throw new Error("Finish or cancel movement before opening minimization.");
      return minimization.configure(kind === "quick" ? "quick" : "amber", capture);
    },
    onRecoverResidue: (capture: SelectionTargetCapture) => {
      assertSelectionTargetCurrent(capture, selectionTargetContext());
      const id = Object.keys(capture.artifacts)[0];
      const projection = queryClient.getQueryData<StructureProjection>(structureQueryKey(capture.projectId, id, capture.artifacts[id]));
      if (!isCompleteProjection(projection, id, capture.artifacts[id])) throw new Error("Reload the current residue before expanding its selection.");
      const expanded = wholeResidueSelection(projection, capture.selection);
      if (!expanded) throw new Error("Select part of one standard amino-acid residue before expanding it.");
      useSelectionStore.getState().replace(expanded);
    },
    editAttempt,
    editReviewCurrent: editReviewIsCurrent(),
    onReviewEdit: () => reviewEdit(),
    onContinueEdit: () => reviewEdit(true),
    onCheckEdit: async () => { if (project) await checkEdit(project.id); },
    onEdit: async (entryId: string, artifactId: string, operand: Selection, action: SelectionEditAction, hydrogenPolicy: HydrogenPolicy = action.operation.startsWith("hydrogens.") ? "preserve" : "automatic") => {
      if (!project) throw new Error("Open a project before editing.");
      const owner = project.id;
      const generation = useEditingStore.getState().generation;
      const captured = useSelectionStore.getState().selection;
      const targetEntryId = useEditingStore.getState().targetEntryId;
      let dispatchedAttempt: string | null = null;
      try {
        assertPublicationWritable(project.id);
        const result = await editAttempts.submit({ projectId: owner, entryId, artifactId,
          expectedRevision: project.revision, operation: action.operation,
          targetLabel: project.entries.find(entry => entry.id === entryId)?.name ?? "Molecular target",
          kind: ["residue.mutate", "hydrogens.prepare", "fragment.replace", "atom.charge", "bond.create", "bond.order"].includes(action.operation) ? "selection" : "model",
        }, attemptId => {
          dispatchedAttempt = attemptId;
          const placement = useEditingStore.getState().placement;
          if (placement?.action === action) useEditingStore.getState().setPlacement({ ...placement, submittedAttemptId: attemptId });
          return projectApi.selectionEdit(project, entryId, artifactId, operand, action, hydrogenPolicy, attemptId);
        });
        if (result.applied !== false) updateProjectCache(result.project);
        if ((!dispatchedAttempt || editAttempts.owns(owner, dispatchedAttempt)) && useWorkspaceStore.getState().activeProjectId === owner && useEditingStore.getState().generation === generation) {
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
        if ((!dispatchedAttempt || editAttempts.owns(owner, dispatchedAttempt)) && useWorkspaceStore.getState().activeProjectId === owner && useEditingStore.getState().generation === generation) {
          setNotice({ kind: "error", text: errorMessage(error) });
          void queryClient.invalidateQueries({ queryKey: ["project", owner] });
        }
        throw new EditApplyError(error, dispatchedAttempt);
      }
    },
    busy,
    selectionColorMode,
    onSelectionColorModeChange: setSelectionColorMode,
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
    cameraPresentation,
    surfaceSession,
    onSurfaces: {
      create: async (items: SurfaceCreateItem[]) => {
        if (!project) throw new Error("Open a project before creating a surface.");
        const next = await commandMutation.mutateAsync(captureProjectCommand(project.id,
          () => projectApi.createSurfaceObjects(project, items), "quiet"));
        return createdSurfaceIdentities(project, next, items);
      },
      update: async (entryId: string, surfaceId: string, change: SurfaceChange) => {
        if (!project) throw new Error("Open a project before editing a surface.");
        await commandMutation.mutateAsync(captureProjectCommand(project.id,
          () => projectApi.updateSurfaceObject(project, entryId, surfaceId, change), "quiet"));
      },
      remove: async (entryId: string, surfaceId: string) => {
        if (!project) throw new Error("Open a project before removing a surface.");
        await commandMutation.mutateAsync(captureProjectCommand(project.id,
          () => projectApi.removeSurfaceObject(project, entryId, surfaceId), "quiet"));
      },
      refresh: async () => {
        if (!project) throw new Error("The surface project is no longer available.");
        const latest = await projectApi.get(project.id);
        updateProjectCache(latest);
        return latest.entries;
      },
    },
    onAppearance: async (change: SelectionAppearanceChange) => {
      if (!project) return;
      await projectMutation.mutateAsync(() => projectApi.updateSelectionAppearance(project, selection, change));
    },
    onHydrogenAppearance: async (change: HydrogenAppearanceChange, capture: CapturedHydrogenTarget) => {
      if (!project) throw new Error("Open a project before changing hydrogen visibility.");
      const command = hydrogenAppearanceCommand(project, change, capture, () => {
        const state = useSelectionStore.getState();
        return { activeProjectId: useWorkspaceStore.getState().activeProjectId,
          selectionProjectId: state.projectId, projectEpoch: state.projectEpoch, selection: state.selection,
          project: queryClient.getQueryData<Project>(["project", capture.projectId]) };
      }, projectApi.updateSelectionAppearance);
      await commandMutation.mutateAsync(command);
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
      channel?: SelectionRepresentationChannel,
    ) => {
      if (!project) return;
      await projectMutation.mutateAsync(() =>
        projectApi.updateSelectionRepresentations(
          project,
          selection,
          action,
          style,
          channel,
        ),
      );
      setNotice({
        kind: "success",
        text:
          action === "reset"
            ? `Selection ${channel === "atomic" ? "atom detail" : channel === "polymer" ? "polymer representation" : "representations"} reset to entry defaults.`
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
          readBusy={readBusy}
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

        <CameraRecovery cameraPresentation={cameraPresentation} />
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
                onPickingGranularity={granularity => { measurementSession.cancelAcquisition(); setPickingGranularity(granularity); }}
                onViewerSelection={applyViewerSelection}
                onSelectResidue={applyResidueSelection}
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
                      if (event.key === "Escape" && event.target instanceof Element
                        && event.target.closest('[role="dialog"]') === event.currentTarget) {
                        event.preventDefault();
                        event.stopPropagation();
                        closeMobilePanel();
                      }
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
                        ligandControls={ligandControls}
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
                        assertWritable={assertPublicationWritable}
                        writeBlocked={publicationBlocked}
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
                      onPickingGranularity={granularity => { measurementSession.cancelAcquisition(); setPickingGranularity(granularity); }}
                      onViewerSelection={applyViewerSelection}
                      onSelectResidue={applyResidueSelection}
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
                        assertWritable={assertPublicationWritable}
                        writeBlocked={publicationBlocked}
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
                        ligandControls={ligandControls}
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
        assertWritable={assertPublicationWritable}
        writeBlocked={publicationBlocked}
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
