import { captureHydrogenTarget } from "../selection/hydrogenAction";
import { canonicalSelection } from "../selection/selection";
import { useSelectionStore } from "../store/selection";
import { createSurfaceManagerSession, type SurfaceCreationRequest, type SurfaceManagerSession } from "../surfaces/surfaceManagerSession";
import { replaySurfacePreviews } from "../surfaces/surfacePreviewBinding";
import { SequenceViewer } from "./SequenceViewer";
import { usePresentation } from "../presentation/context";
import { displayedProteinRows } from "../viewer/sequenceDisplay";
import { useWorkspaceStore } from "../store/workspace";
import type { ResidueSelectionRequest, ViewerPick } from "../selection/gestures";
import { useMinimizationPreview } from "../minimization/useMinimizationPreview";
import type { MinimizationWorkflow } from "../minimization/useMinimization";
import { useMinimizationShortcut } from "../minimization/useMinimizationShortcut";
import { useMinimizationStore } from "../minimization/store";
import { MinimizationPanel } from "./MinimizationPanel";
import { placementContext } from "../editing/placement";
import type { SurfaceStatus } from "../viewer/surface/runtime";
import type { SurfaceActions, ChangeSelectionAppearance, ChangeHydrogenAppearance } from "../api/types";
import { MolecularEditPanel } from "./MolecularEditPanel";
import type { WorkspacePresentationController } from "../workspacePresentation/controller";
import type { InitialFitTicket } from "../workspacePresentation/types";
import { useEditingStore } from "../store/editing";
import type { ExpandSelection } from "../selection/expansion";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isCompleteProjection, structureQueryOptions } from "../structures/query";
import type {
  CameraState,
  AtomReference,
  CoordinatePatch,
  Project,
  Scene,
  SelectionRepresentationStyle,
  SelectionRepresentationChannel,
  StructureProjection,
  ViewerSettings,
} from "../api/types";
import type {
  Selection,
  SelectionColorMode,
  SelectionGranularity,
  SelectionMode,
} from "../api/types";
import type {
  MolecularViewer,
  MolecularViewerFactory,
  ViewerStructure,
} from "../viewer/MolecularViewer";
import { createMolstarViewer } from "../viewer/MolstarViewer";
import { visibleLigandAtoms } from "../viewer/focusTargets";
import { formatMeasurement, measurementValue } from "../measurements/geometry";
import type { Theme } from "../store/workspace";
import { THEME_TOKENS } from "../theme";
import { ViewerControls } from "./ViewerControls";
import { ViewerToolbar } from "./ViewerToolbar";
import { SurfaceManager } from "./SurfaceManager";
import type { SurfaceIdentity } from "../viewer/surface/objects";
import { surfaceKey } from "../viewer/surface/protocol";
import { resolvePocketInputs } from "../selection/pocketInputs";
import { SelectionStyleDialog } from "./SelectionStyleDialog";
import { MovementOverlay, MovementControls } from "./MovementOverlay";
import type { MovementWorkflow } from "../coordinates/useMovementSession";
import { movementPreview, movementUnavailableReason } from "../coordinates/interactiveTransform";
import { CoordinatePreviewQueue } from "../viewer/CoordinatePreviewQueue";
import { InteractionPanel } from "./InteractionPanel";
import { useInteractionInspection, type InteractionNativeState, type InteractionRenderFailure } from "../interactions/useInteractionInspection";
import { ViewerWarningDetails } from "./ViewerWarningDetails";
import { editAttemptBlocksWrites } from "../editing/attempt";
import type { MolecularEditingPorts } from "../editing/ports";

const VIEWER_BACKGROUND_COLORS: Record<Theme, string> = {
  light: THEME_TOKENS.light["viewer-background"],
  dark: THEME_TOKENS.dark["viewer-background"],
};

interface StructureViewerProps extends MolecularEditingPorts {
  project: Project;
  theme: Theme;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  onPickingGranularity: (granularity: SelectionGranularity) => void;
  onSelectResidue?: (request: ResidueSelectionRequest) => void;
  onViewerSelection: (selection: Selection, mode: SelectionMode, pick?: ViewerPick) => void;
  busy?: boolean;
  coordinatePreview?: CoordinatePatch | null;
  movement?: MovementWorkflow;
  minimization?: MinimizationWorkflow;
  onRenderedMovementAtoms?: (read: () => AtomReference[]) => void;
  onUpdateSettings?: (entryId: string, settings: ViewerSettings) => Promise<void>;
  onCreateScene?: (name: string, camera: CameraState) => Promise<void>;
  onApplyScene?: (scene: Scene) => Promise<void>;
  onDeleteScene?: (scene: Scene) => Promise<void>;
  onLoadSelectionStructures?: () => Promise<Map<string, StructureProjection>>;
  onExpandDistance?: ExpandSelection;
  onAtomVisibility?: (action: "hide" | "show") => Promise<void>;
  onSurfaces?: SurfaceActions;
  surfaceSession?: SurfaceManagerSession;
  cameraPresentation?: WorkspacePresentationController;
  onLoadPocketStructures?: () => Promise<Map<string, StructureProjection>>;
  onAppearance?: ChangeSelectionAppearance;
  onHydrogenAppearance?: ChangeHydrogenAppearance;
  selectionColorMode: SelectionColorMode;
  onSelectionColorModeChange: (mode: SelectionColorMode) => void;
  onSelectionStyle?: (
    action: "apply" | "reset",
    style?: SelectionRepresentationStyle,
    channel?: SelectionRepresentationChannel,
  ) => Promise<void>;
  createViewer?: MolecularViewerFactory;
}

export function StructureViewer({
  project,
  theme,
  selection,
  pickingGranularity,
  onPickingGranularity,
  onViewerSelection,
  onSelectResidue,
  busy = false,
  coordinatePreview = null,
  movement,
  minimization,
  onRenderedMovementAtoms,
  onUpdateSettings,
  onCreateScene,
  onApplyScene,
  onDeleteScene,
  onLoadSelectionStructures,
  onSelectionStyle,
  onExpandDistance,
  onAtomVisibility,
  onSurfaces,
  surfaceSession,
  cameraPresentation,
  onLoadPocketStructures,
  onAppearance,
  onHydrogenAppearance,
  selectionColorMode,
  onSelectionColorModeChange,
  onEdit,
  editAttempt,
  onCheckEdit,
  onReviewEdit,
  onContinueEdit,
  editReviewCurrent,
  onGeometry,
  onRecoverResidue,
  createViewer = createMolstarViewer,
}: StructureViewerProps) {
  const queryClient = useQueryClient();
  const presentation = usePresentation();
  const sequenceDisplay = useWorkspaceStore(state => state.sequenceDisplay);
  const sequenceWorkspace = useRef<HTMLDivElement>(null);
  const returnSequenceFocus = useRef(false);
  useLayoutEffect(() => {
    if (returnSequenceFocus.current) {
      returnSequenceFocus.current = false;
      sequenceWorkspace.current?.querySelector<HTMLButtonElement>(sequenceDisplay === "hidden" ? '[aria-label="Show sequences"]' : '[aria-label="Collapse sequences"]')?.focus({ preventScroll: true });
    }
  }, [sequenceDisplay]);
  const targetRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MolecularViewer | undefined>(undefined);
  const [interactionBinding, setInteractionBinding] = useState<{ projectId: string; viewer: MolecularViewer; ready: boolean } | null>(null);
  const [interactionNative, setInteractionNative] = useState<InteractionNativeState | null>(null);
  const [interactionFailure, setInteractionFailure] = useState<InteractionRenderFailure | null>(null);
  const interactionOwnerProject = useRef(project.id);
  interactionOwnerProject.current = project.id;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onViewerSelectionRef = useRef(onViewerSelection);
  const viewerStructuresRef = useRef<ViewerStructure[]>([]);
  const appliedArtifactsRef = useRef(new Map<string, string>());
  const appliedTopologyArtifactsRef = useRef(new Map<string, string>());
  const previewQueue = useRef<CoordinatePreviewQueue | null>(null);
  const minimizationPreview = useMinimizationPreview(project, minimization);
  const movementActive = Boolean(movement?.state.capture && movement.state.phase !== "idle");
  const editingState = useEditingStore();
  const editOpen = useEditingStore(state => state.projectId === project.id && state.open);
  const movementInteraction = !movementActive ? "inactive" : movement?.cameraNavigation ? "camera" : "transform";
  const currentMovement = useRef(movement);
  currentMovement.current = movement;
  const initialSceneReady = useRef(false);
  const initialFit = useRef<{ viewer: MolecularViewer; ticket: InitialFitTicket; sceneReady: boolean } | null>(null);
  const nativeDrawable = useRef<{ viewer: MolecularViewer; drawable: boolean } | null>(null);
  const cameraHydrated = useSyncExternalStore(cameraPresentation?.subscribe ?? (() => () => {}),
    () => cameraPresentation?.getSnapshot().hydrated ?? true);
  const finishInitialFit = (viewer: MolecularViewer) => {
    const pending = initialFit.current;
    if (!pending || pending.viewer !== viewer || !pending.sceneReady || viewerRef.current !== viewer) return;
    if (nativeDrawable.current?.viewer !== viewer || !nativeDrawable.current.drawable) return;
    if (!viewer.getRenderedAtomReferences().length) return;
    initialFit.current = null;
    pending.ticket.complete(true, () => { viewer.fitVisible(); return viewer.getSessionCamera(); });
  };
  const currentFinishInitialFit = useRef(finishInitialFit);
  currentFinishInitialFit.current = finishInitialFit;
  const [surfaceStatuses, setSurfaceStatuses] = useState<SurfaceStatus[]>([]);
  const [surfaceProjectId, setSurfaceProjectId] = useState<string | null>(null);
  const [activeSurface, setActiveSurface] = useState<SurfaceIdentity | null>(null);
  const managerSession = useMemo(() => surfaceSession ?? createSurfaceManagerSession(project.id), [surfaceSession, project.id]);
  const surfaceContext = useRef({ session: managerSession, projectId: project.id, entries: project.entries });
  surfaceContext.current = { session: managerSession, projectId: project.id, entries: project.entries };
  const [surfaceCreation, setSurfaceCreation] = useState<SurfaceCreationRequest>();
  const nextSurfaceCreation = useRef(0);
  const openSurfaces = () => {
    if (useEditingStore.getState().projectId === project.id) useEditingStore.getState().setOpen(false);
    setSurfaceCreation(undefined);
    useMinimizationStore.getState().dismiss();
    setStyleProjectId(null); setSurfaceProjectId(project.id);
  };
  const openSurfaceCreation = (kind?: SurfaceCreationRequest["kind"], entryId?: string) => {
    openSurfaces();
    setSurfaceCreation({ id: `${project.id}:${++nextSurfaceCreation.current}`, kind, entryId,
      selection: selection.atoms.map(atom => ({ ...atom })) });
  };
  const [viewerReady, setViewerReady] = useState(false);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState("");
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [isolation, setIsolation] = useState<Selection["atoms"] | null>(null);
  const [styleProjectId, setStyleProjectId] = useState<string | null>(null);
  const [interactionProjectId, setInteractionProjectId] = useState<string | null>(null);
  const openMinimization = () => { useEditingStore.getState().setOpen(false); setStyleProjectId(null); setSurfaceProjectId(null); setInteractionProjectId(null); };
  useEffect(() => { if (minimizationPreview.open) useEditingStore.getState().setOpen(false); }, [minimizationPreview.open]);
  const minimizationUnavailable = movementActive ? "Finish movement before minimizing selection" : coordinatePreview ? "Finish coordinate preview before minimizing" : busy ? "Finish the current change before minimizing" : !selection.atoms.length ? "Select atoms before minimizing" : null;
  useMinimizationShortcut(!!minimization && !minimizationUnavailable, () => {
    openMinimization(); void minimization?.quick();
  });
  const interactionPaused = movementActive || Boolean(coordinatePreview) || Boolean(minimizationPreview.patches.length) || minimizationPreview.state.applying;
  const styleDialogOpen = styleProjectId === project.id;
  const setStyleDialogOpen = (open: boolean) => setStyleProjectId(open ? project.id : null);
  useEffect(() => { setStyleProjectId(null); }, [project.id]);
  const [styleStructures, setStyleStructures] = useState(
    new Map<string, StructureProjection>(),
  );
  const [styleLoadedContext, setStyleLoadedContext] = useState<string | null>(null);
  const [styleEligibilityBusy, setStyleEligibilityBusy] = useState(false);
  const [styleEligibilityError, setStyleEligibilityError] = useState<string | null>(null);
  const visibleEntries = useMemo(
    () => project.entries.filter((entry) => entry.visible),
    [project.entries],
  );
  const structureQueries = useQueries({
    queries: visibleEntries.map((entry) => ({
      ...structureQueryOptions(project.id, entry.id, entry.current_artifact_id),
      placeholderData: (previous: StructureProjection | undefined) => previous?.entry_id === entry.id ? previous : undefined,
    })),
  });

  const hiddenSeedEntries = useMemo(() => {
    const needed = new Set(visibleEntries.flatMap((entry) =>
      entry.viewer_settings.surface_objects.flatMap(surface => surface.source.kind === "pocket" && surface.visible && surface.appearance.opacity > 0
        ? surface.source.seed_atom_references.map(seed => seed.structure_id) : [])));
    return project.entries.filter((entry) => !entry.visible && needed.has(entry.id));
  }, [project.entries, visibleEntries]);
  const hiddenSeedQueries = useQueries({
    queries: hiddenSeedEntries.map((entry) => ({
      ...structureQueryOptions(project.id, entry.id, entry.current_artifact_id),
    })),
  });
  const pockets = resolvePocketInputs(visibleEntries.concat(hiddenSeedEntries), new Map([
    ...structureQueries.map((query, index) => [visibleEntries[index].id, {
      data: query.data, current: isCompleteProjection(query.data, visibleEntries[index].id, visibleEntries[index].current_artifact_id) && !query.isPlaceholderData, failed: query.isError,
    }] as const),
    ...hiddenSeedQueries.map((query, index) => [hiddenSeedEntries[index].id, {
      data: query.data, current: isCompleteProjection(query.data, hiddenSeedEntries[index].id, hiddenSeedEntries[index].current_artifact_id), failed: query.isError,
    }] as const),
  ]));

  useEffect(() => {
    onViewerSelectionRef.current = onViewerSelection;
  }, [onViewerSelection]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    currentMovement.current?.clearNavigation();
    const viewer = createViewer();
    previewQueue.current = new CoordinatePreviewQueue(viewer, error => {
      currentMovement.current?.cancel();
      setViewerError(error instanceof Error ? error.message : "The viewer rejected a coordinate preview.");
    });
    viewerRef.current = viewer;
    setInteractionBinding({ projectId: project.id, viewer, ready: false });
    const releaseCamera = cameraPresentation?.bind(viewer);
    const unsubscribeDrawable = viewer.subscribeDrawable(drawable => {
      nativeDrawable.current = { viewer, drawable };
      if (drawable) currentFinishInitialFit.current(viewer);
    });
    viewer.setBackgroundColor(VIEWER_BACKGROUND_COLORS[themeRef.current]);
    let active = true;
    const unsubscribeInteractionDisplay = viewer.subscribeInteractionDisplay?.(state => {
      if (!active || viewerRef.current !== viewer || interactionOwnerProject.current !== project.id) return;
      setInteractionNative(current => current?.viewer === viewer && current.state.sceneGeneration > state.sceneGeneration
        ? current : { viewer, state });
    });
    let releasePresentation: (() => void) | undefined;
    void viewer
      .mount(target)
      .then(() => {
        if (active) {
          setViewerReady(true);
          setInteractionBinding({ projectId: project.id, viewer, ready: true });
          releasePresentation = presentation?.bind(viewer);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          presentation?.unavailable("The molecular viewer could not start. Reload the workspace to retry.");
          setViewerError(
            error instanceof Error ? error.message : "The molecular viewer could not start.",
          );
        }
      });
    const observer = new ResizeObserver(() => viewer.resize());
    observer.observe(target);
    const unsubscribe = viewer.subscribeSelection((event) => {
      if (event.mode === "replace" && !event.pick && event.atoms.length === 0) setActiveSurface(null);
      const operand: Selection = {
        schema_version: 1, atoms: event.atoms, granularity: event.granularity, source: "viewer",
      };
      if (event.pick) onViewerSelectionRef.current(operand, event.mode, event.pick);
      else onViewerSelectionRef.current(operand, event.mode);
    });
    const unsubscribeSurfaces = viewer.subscribeSurfaces(statuses => {
      setSurfaceStatuses(statuses);
      currentFinishInitialFit.current(viewer);
    });
    initialSceneReady.current = false;
    const unsubscribeCamera = viewer.subscribeCamera(camera => {
      setCamera(camera);
      if (initialSceneReady.current) {
        currentMovement.current?.rememberCamera(camera);
      }
    });
    return () => {
      active = false;
      unsubscribeInteractionDisplay?.();
      releaseCamera?.();
      unsubscribeDrawable();
      if (nativeDrawable.current?.viewer === viewer) nativeDrawable.current = null;
      initialFit.current?.ticket.cancel(); initialFit.current = null;
      releasePresentation?.();
      if (initialSceneReady.current) {
        currentMovement.current?.rememberCamera(viewer.getCamera());
      }
      currentMovement.current?.clearNavigation();
      unsubscribe();
      unsubscribeCamera();
      unsubscribeSurfaces();
      observer.disconnect();
      previewQueue.current?.dispose();
      previewQueue.current = null;
      viewer.dispose();
      viewerRef.current = undefined;
    };
  }, [createViewer, project.id, presentation, cameraPresentation]);

  useEffect(() => {
    viewerRef.current?.setBackgroundColor(VIEWER_BACKGROUND_COLORS[theme]);
  }, [theme]);

  const viewerStructures = useMemo(
    () =>
      structureQueries.flatMap<ViewerStructure>((query, index) =>
        query.data
          ? [
              {
                entryId: visibleEntries[index].id,
                pockets: Object.fromEntries(visibleEntries[index].viewer_settings.surface_objects.flatMap(surface => {
                  const resolved = pockets.get(surfaceKey(visibleEntries[index].id, "pocket", surface.id));
                  return surface.source.kind === "pocket" && resolved ? [[surface.id, resolved]] : [];
                })),
                label: visibleEntries[index].name,
                projection: query.data.viewer,
                atomIds: query.data.structure.atoms.map((atom) => atom.id),
                normalized: query.data.structure,
                hierarchy: query.data.hierarchy,
                settings:
                  visibleEntries[index].atom_count >= 250_000
                    ? {
                        ...visibleEntries[index].viewer_settings,
                        labels: {
                          atoms: false,
                          residues: false,
                          chains: false,
                          structure:
                            visibleEntries[index].viewer_settings.labels.structure,
                        },
                      }
                    : visibleEntries[index].viewer_settings,
              },
            ]
          : [],
      ),
    [structureQueries, visibleEntries, pockets],
  );
  const sequenceRows = viewerStructures.flatMap(source => {
    const position = visibleEntries.findIndex(entry => entry.id === source.entryId);
    const entry = visibleEntries[position];
    const query = structureQueries[position];
    return displayedProteinRows(source, isolation).map(row => ({ ...row,
      key: JSON.stringify([source.entryId, row.componentId, row.chainId]),
      entryId: source.entryId, entryName: visibleEntries.filter(item => item.name === source.label).length > 1
        ? `${source.label} · entry ${visibleEntries.filter(item => item.name === source.label).findIndex(item => item.id === source.entryId) + 1}` : source.label, artifactId: entry.current_artifact_id ?? "",
      current: !query.isPlaceholderData && !query.isError && isCompleteProjection(query.data, entry.id, entry.current_artifact_id),
    }));
  });
  const syncKey = viewerStructures
    .map(
      (structure) =>
        `${structure.entryId}:${JSON.stringify(structure.settings)}:${Object.values(structure.pockets ?? {}).map(pocket => pocket.dependencyKey).join(";")}`,
    )
    .join("|");
  const structuresPending = structureQueries.some((query) => query.isPending);
  viewerStructuresRef.current = viewerStructures;
  const interactionViewReady = structureQueries.every((query, index) => !query.isPlaceholderData && !query.isError
    && isCompleteProjection(query.data, visibleEntries[index].id, visibleEntries[index].current_artifact_id));
  const interactionProjectionKey = JSON.stringify(project.entries.map(entry => [entry.id, entry.current_artifact_id,
    isCompleteProjection(queryClient.getQueryData<StructureProjection>(["structure", project.id, entry.id, entry.current_artifact_id]), entry.id, entry.current_artifact_id)]));
  const interactionProjections = useMemo(() => {
    const identities = JSON.parse(interactionProjectionKey) as [string, string | null, boolean][];
    return new Map(identities.flatMap(([entryId, artifactId, complete]) => {
      const data = queryClient.getQueryData<StructureProjection>(["structure", project.id, entryId, artifactId]);
      return complete && data ? [[entryId, data] as const] : [];
    }));
  }, [interactionProjectionKey, project.id, queryClient]);
  const interactions = useInteractionInspection({ project, selection, projections: interactionProjections,
    structures: viewerStructures, isolation, paused: interactionPaused, busy,
    viewerReady: Boolean(interactionBinding?.projectId === project.id && interactionBinding.viewer === viewerRef.current && interactionBinding.ready),
    viewReady: interactionViewReady, viewer: viewerRef, native: interactionNative, renderFailure: interactionFailure,
    onSelect: atoms => onViewerSelection(canonicalSelection(atoms, "atom", "inspector"), "replace"),
  });
  const interactionRequest = useRef(interactions);
  interactionRequest.current = interactions;
  useLayoutEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || interactionBinding?.viewer !== viewer || interactionBinding.projectId !== project.id || !interactionBinding.ready) return;
    const request = interactionRequest.current;
    setInteractionFailure(null);
    void viewer.setInteractions(request.displayRecords, { displayKey: request.displayKey, appearance: request.appearance })
      .catch((error: unknown) => {
        if (viewerRef.current === viewer && interactionOwnerProject.current === project.id && interactionRequest.current.displayKey === request.displayKey) {
          setInteractionFailure({ viewer, displayKey: request.displayKey,
            message: error instanceof Error ? error.message : "Interaction markers could not be displayed." });
        }
      });
  }, [interactions.displayKey, syncKey, interactionBinding, project.id]);
  const renderedCallback = useRef(onRenderedMovementAtoms);
  renderedCallback.current = onRenderedMovementAtoms;
  useEffect(() => {
    renderedCallback.current?.(() => viewerRef.current?.getRenderedAtomReferences() ?? []);
  }, [viewerReady]);

  useLayoutEffect(() => {
    if (viewerReady) {
      const viewer = viewerRef.current;
      if (movementActive && initialSceneReady.current) currentMovement.current?.rememberCamera(viewer?.getCamera() ?? null);
      viewer?.setMovementMode(movementInteraction);
    }
  }, [movementActive, movementInteraction, movement?.inputEpoch, viewerReady]);

  useEffect(() => {
    if (!viewerReady || !cameraHydrated) return;
    const syncedViewer = viewerRef.current;
    let current = true;
    const ticket = syncedViewer ? cameraPresentation?.claimInitialFit(syncedViewer) : null;
    if (ticket && syncedViewer) initialFit.current = { viewer: syncedViewer, ticket, sceneReady: false };
    setSceneLoading(true);
    void syncedViewer
      ?.syncStructures(viewerStructuresRef.current)
      .then(async () => {
        const viewer = viewerRef.current;
        if (!current || !viewer || viewer !== syncedViewer) return;
        await replaySurfacePreviews(managerSession, viewer, () => surfaceContext.current.entries,
          () => current && viewerRef.current === syncedViewer && surfaceContext.current.session === managerSession
            && surfaceContext.current.projectId === project.id);
        if (!current || viewerRef.current !== syncedViewer) return;
        const workflow = currentMovement.current;
        const active = Boolean(workflow?.state.capture && workflow.state.phase !== "idle");
        if (!structuresPending) initialSceneReady.current = true;
        if (initialFit.current?.viewer === viewer) {
          initialFit.current.sceneReady = !structuresPending;
          currentFinishInitialFit.current(viewer);
        }
        viewer.setMovementMode(!active ? "inactive" : workflow?.cameraNavigation ? "camera" : "transform");
        if (active) workflow?.rememberCamera(viewer.getCamera());
        const editing = useEditingStore.getState();
        const focus = editing.focusNewMolecule;
        if (focus && editing.projectId === project.id) {
          editing.setFocusNewMolecule(null);
        }
      })
      .catch((error: unknown) => {
        if (current && viewerRef.current === syncedViewer) {
          setViewerError(error instanceof Error ? error.message : "The viewer rejected a structure.");
        }
      })
      .finally(() => {
        if (current && viewerRef.current === syncedViewer) setSceneLoading(false);
      });
    return () => {
      current = false;
      ticket?.cancel();
      if (initialFit.current?.ticket === ticket) initialFit.current = null;
    };
  }, [structuresPending, syncKey, viewerReady, project.id, managerSession, cameraPresentation, cameraHydrated]);

  useEffect(() => {
    if (!viewerReady) return;
    const commits: CoordinatePatch[] = [];
    for (const patch of project.structure_patches ?? []) {
      if (appliedArtifactsRef.current.get(patch.entry_id) === patch.artifact_id) {
        continue;
      }
      appliedArtifactsRef.current.set(patch.entry_id, patch.artifact_id);
      commits.push(patch);
    }
    if (commits.length) previewQueue.current?.commit(commits);
  }, [project.structure_patches, syncKey, viewerReady]);

  const placement = editingState.placement;
  const modelPreview = editOpen && !movementActive && !coordinatePreview && placement?.result
    && placement.context === placementContext(project, placement.result.entry_id, selection, editingState.generation, placement.action)
    ? placement.result : null;
  useEffect(() => {
    if (!viewerReady) return;
    const operation = viewerRef.current?.setModelPreview?.(modelPreview);
    void operation?.catch((error: unknown) => setViewerError(error instanceof Error ? error.message : "Placement preview could not be displayed."));
  }, [modelPreview, viewerReady]);

  const topologyDataKey = structureQueries
    .map((query, index) =>
      isCompleteProjection(query.data, visibleEntries[index].id, visibleEntries[index].current_artifact_id) && !query.isPlaceholderData
        ? `${visibleEntries[index].id}:${visibleEntries[index].current_artifact_id}`
        : "",
    )
    .join("|");

  useEffect(() => {
    if (!viewerReady) return;
    for (const patch of project.topology_patches ?? []) {
      if (
        appliedTopologyArtifactsRef.current.get(patch.entry_id) ===
        patch.artifact_id
      ) {
        continue;
      }
      const queryIndex = visibleEntries.findIndex(
        (entry) =>
          entry.id === patch.entry_id &&
          entry.current_artifact_id === patch.artifact_id,
      );
      if (queryIndex < 0 || structureQueries[queryIndex]?.isPlaceholderData
        || !isCompleteProjection(structureQueries[queryIndex]?.data, patch.entry_id, patch.artifact_id)) {
        continue;
      }
      const replacement = viewerStructures.find(
        (structure) => structure.entryId === patch.entry_id,
      );
      if (!replacement) continue;
      appliedTopologyArtifactsRef.current.set(patch.entry_id, patch.artifact_id);
      void viewerRef.current
        ?.replaceStructure(replacement)
        .catch((error: unknown) =>
          setViewerError(
            error instanceof Error
              ? error.message
              : "The viewer rejected a molecular update.",
          ),
        );
    }
  }, [
    project.topology_patches,
    structureQueries,
    topologyDataKey,
    viewerReady,
    viewerStructures,
    visibleEntries,
  ]);

  useEffect(() => {
    if (!viewerReady) return;
    const state = movement?.state;
    const patches = state?.capture && ["active", "submitting"].includes(state.phase)
      ? movementPreview(state.capture, state.pose)
      : coordinatePreview ? [coordinatePreview] : !editOpen ? minimizationPreview.patches : [];
    previewQueue.current?.set(patches, Boolean(!movementActive && !coordinatePreview && minimizationPreview.state.live));
  }, [coordinatePreview, movement?.state, movementActive, minimizationPreview.patches, minimizationPreview.state.live, editOpen, viewerReady]);

  useEffect(() => {
    if (!viewerReady) return;
    viewerRef.current?.setSelection(selection.atoms);
  }, [selection.atoms, viewerReady, syncKey]);

  useEffect(() => {
    viewerRef.current?.setPickingGranularity(pickingGranularity);
  }, [pickingGranularity]);

  const normalizedStructures = useMemo(
    () =>
      new Map(
        structureQueries.flatMap((query, index) =>
          isCompleteProjection(query.data, visibleEntries[index].id, visibleEntries[index].current_artifact_id)
            ? [[query.data.entry_id, query.data.structure] as const] : [],
        ),
      ),
    [structureQueries, visibleEntries],
  );

  useEffect(() => {
    if (!viewerReady) return;
    const measurements = interactionPaused ? [] : project.measurements.map((measurement) => {
      const value = measurementValue(
        measurement.kind,
        measurement.atom_references,
        normalizedStructures,
      );
      return {
        ...measurement,
        label: `${measurement.name}: ${formatMeasurement(measurement.kind, value)}`,
      };
    });
    void viewerRef.current?.setMeasurements(measurements).catch((error: unknown) => {
      setViewerError(
        error instanceof Error ? error.message : "Measurements could not be displayed.",
      );
    });
  }, [normalizedStructures, project.measurements, syncKey, viewerReady, interactionPaused]);

  const loading =
    (!viewerReady && !viewerError) || structuresPending || sceneLoading;
  const failedQueries = [...structureQueries, ...hiddenSeedQueries].filter((query) => query.isError);
  useEffect(() => {
    if (viewerRef.current) presentation?.update(viewerRef.current,
      viewerError || failedQueries.length ? "The molecular scene is unavailable" : loading ? "Loading molecular scene" : null,
      Boolean(movementActive || coordinatePreview || modelPreview || minimizationPreview.patches.length));
  }, [presentation, viewerError, failedQueries.length, loading, movementActive, coordinatePreview, modelPreview, minimizationPreview.patches.length]);
  const largeEntries = visibleEntries.filter((entry) => entry.atom_count >= 250_000);
  const ligandAtoms = useMemo(
    () => visibleLigandAtoms(viewerStructures, isolation),
    [isolation, viewerStructures],
  );
  const viewerUnavailableReason = !viewerReady
    ? "The 3D viewer is still loading"
    : structuresPending
      ? "Visible structures are still loading"
      : viewerStructures.length === 0
        ? "No molecular objects are visible"
        : null;
  const focusSelectionUnavailableReason =
    viewerUnavailableReason ??
    (selection.atoms.length === 0 ? "Select atoms before focusing the selection" : null);
  const focusLigandsUnavailableReason =
    viewerUnavailableReason ??
    (ligandAtoms.length === 0 ? "No ligand detected in visible structures" : null);
  const selectionStyleUnavailableReason = busy
    ? "Finish the current project change before styling the selection"
    : selection.atoms.length === 0 && !project.entries.some(entry => entry.viewer_settings.surface_objects.length)
      ? "Select atoms before styling the selection"
      : onSelectionStyle
        ? null
        : "Selection styling is unavailable in this workspace";

  useEffect(() => { if (movementActive) { setStyleProjectId(null); setSurfaceProjectId(null); useEditingStore.getState().setOpen(false); } }, [movementActive]);
  useEffect(() => {
    // A successful create can return its identity before the query notification
    // publishes new entries. Reconcile on canonical changes, not local activation.
    setActiveSurface(previous => previous && !project.entries.some(entry => entry.id === previous.entryId
      && entry.viewer_settings.surface_objects.some(surface => surface.id === previous.surfaceId)) ? null : previous);
  }, [project.entries]);

  const openStyleDialog = () => {
    if (styleDialogOpen) { setStyleDialogOpen(false); return; }
    if (selectionStyleUnavailableReason) return;
    useEditingStore.getState().setOpen(false);
    useMinimizationStore.getState().dismiss();
    setSurfaceProjectId(null); setStyleDialogOpen(true);
    const visible = new Map(
      structureQueries.flatMap((query, index) =>
        isCompleteProjection(query.data, visibleEntries[index].id, visibleEntries[index].current_artifact_id)
          ? [[visibleEntries[index].id, query.data] as const] : [],
      ),
    );
    setStyleStructures(visible);
  };
  const styleLoader = useRef(onLoadSelectionStructures);
  styleLoader.current = onLoadSelectionStructures;
  const styleContext = JSON.stringify([project.id, selection.atoms,
    project.entries.map((entry) => [entry.id, entry.current_artifact_id])]);
  useEffect(() => {
    if (!styleDialogOpen || !styleLoader.current) return;
    let current = true;
    setStyleEligibilityBusy(true);
    setStyleEligibilityError(null);
    void styleLoader.current()
      .then((loaded) => { if (current) setStyleStructures(loaded); })
      .catch(() => {
        if (current) {
          setStyleStructures(new Map());
          setStyleEligibilityError("Could not load selection structures. Close and reopen the styling palette to retry.");
        }
      })
      .finally(() => { if (current) { setStyleEligibilityBusy(false); setStyleLoadedContext(styleContext); } });
    return () => { current = false; };
  }, [styleDialogOpen, styleContext]);

  return (
    <div className="sequence-workspace" ref={sequenceWorkspace}>
    <div className="structure-viewer" data-testid="structure-viewer"
      onPointerMoveCapture={event => {
        // A deliberate mouse return resumes canvas keyboard ownership after tool
        // use. Editable controls, unrelated UI and modals keep their focus.
        if (currentMovement.current?.state.phase !== "active" || event.pointerType !== "mouse" || event.buttons !== 0
          || !(event.target instanceof Element) || !event.target.closest("[data-movement-canvas], .molstar-host canvas")
          || document.querySelector('[role="dialog"]:not([aria-modal="false"]):not([aria-hidden="true"])')) return;
        const focused = document.activeElement;
        if (focused !== document.body && (!focused?.closest("[data-movement-controls], [data-movement-panel]")
          || focused.closest('input, textarea, select, [role="slider"], [contenteditable]:not([contenteditable="false"])'))) return;
        event.currentTarget.querySelector<HTMLElement>("[data-movement-canvas]")?.focus({ preventScroll: true });
      }}
      onMouseDownCapture={event => {
        if (currentMovement.current?.state.phase !== "active" || !currentMovement.current.cameraNavigation
          || !(event.target instanceof Element) || !event.target.closest(".molstar-host canvas")
          || document.querySelector('[role="dialog"]:not([aria-modal="false"]):not([aria-hidden="true"])')) return;
        // Native mousedown otherwise blurs the focused overlay to body, disabling
        // the next Space press. Keep focus without stopping Mol* propagation.
        // Preventing pointerdown would suppress Mol*'s compatibility mouse input.
        event.preventDefault();
        event.currentTarget.querySelector<HTMLElement>("[data-movement-canvas]")?.focus({ preventScroll: true });
      }}>
      <div
        ref={targetRef}
        className="molstar-host"
        data-testid="molstar-host"
        role="region"
        aria-label="3D molecular viewer"
      />
      {movementActive && movement ? <MovementOverlay movement={movement}
        view={() => viewerRef.current?.getMovementView() ?? null}
        zoom={factor => viewerRef.current?.zoom(factor)} /> : null}
      {(movementActive || coordinatePreview) && project.measurements.length ? <div className="measurement-preview-notice" role="status">Measurements paused during coordinate preview.</div> : null}
      <Tooltip.Provider delayDuration={350}>
        {presentationError ? <div className="viewer-error" role="alert">
          <span>{presentationError}</span>
          <button type="button" onClick={() => setPresentationError(null)} aria-label="Dismiss presentation message">×</button>
        </div> : null}
        <div className="viewer-header">
          <div className="viewer-status" role="status">
            <span>
              {visibleEntries.length} visible
              {viewerStructures.length > 0 ? ` / ${viewerStructures.length} loaded` : ""}
              {` / ${selection.atoms.length} selected`}
            </span>
            <ViewerWarningDetails key={project.id} entries={visibleEntries}
              returnFocus={() => targetRef.current?.closest(".structure-viewer")?.querySelector<HTMLElement>(
                '[data-movement-canvas], .viewer-toolbar button:not(:disabled)',
              ) ?? null} />
            {largeEntries.length > 0 ? (
              <span className="viewer-warning" title="Surface and dense labels use reduced detail">
                <AlertTriangle size={13} /> reduced detail
              </span>
            ) : null}
          </div>
          {failedQueries.length > 0 || viewerError ? (
            <div className="viewer-error" role="alert">
              <AlertTriangle size={18} />
              <span>{viewerError ?? "One or more structures could not be loaded."}</span>
              {failedQueries.length > 0 ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => failedQueries.forEach((query) => void query.refetch())}
                >
                  <RotateCcw size={15} /> Retry
                </button>
              ) : null}
            </div>
          ) : null}
          <ViewerToolbar
            onPresentation={presentation ? () => {
              const error = presentation.open();
              setPresentationError(error);
            } : undefined}
            onShowSequences={sequenceDisplay === "hidden" ? () => { returnSequenceFocus.current = true; useWorkspaceStore.getState().setSequenceDisplay("expanded"); } : undefined}
            interactionsOpen={interactionProjectId === project.id}
            interactionsConfigured={interactions.configured}
            interactionsVisible={interactions.show}
            interactionsDescription={interactions.launcherDescription}
            interactionsStatus={interactions.panel.status}
            onInteractionVisibilityChange={interactions.panel.onShowChange}
            onInteractions={() => { useMinimizationStore.getState().dismiss(); useEditingStore.getState().setOpen(false); setInteractionProjectId(interactionProjectId === project.id ? null : project.id); }}
            pickingUnavailableReason={movementActive ? "Finish movement before changing selection" : null}
            pickingGranularity={pickingGranularity}
            onPickingGranularity={onPickingGranularity}
            fitAllUnavailableReason={movementActive ? "Finish movement before focusing the view" : viewerUnavailableReason}
            focusSelectionUnavailableReason={movementActive ? "Finish movement before focusing the view" : focusSelectionUnavailableReason}
            focusLigandsUnavailableReason={movementActive ? "Finish movement before focusing the view" : focusLigandsUnavailableReason}
            selectionStyleUnavailableReason={movementActive ? "Finish movement before styling selection" : styleDialogOpen ? null : selectionStyleUnavailableReason}
            selectionStyleOpen={styleDialogOpen}
            onFitAll={() => viewerRef.current?.fitVisible()}
            onFocusSelection={() => viewerRef.current?.focusAtoms(selection.atoms)}
            onFocusLigands={() => viewerRef.current?.focusAtoms(ligandAtoms)}
            onSelectionStyle={openStyleDialog}
          />
          <div className="viewer-edit-transform-actions" role="group" aria-label="Molecular tools" data-transform-active={movementActive}>
          {movement ? <MovementControls movement={movement}
            view={() => viewerRef.current?.getMovementView() ?? null}
            zoom={factor => viewerRef.current?.zoom(factor)}
            unavailableReason={movement.state.phase !== "idle" ? "Selection capture is in progress"
              : busy ? "Finish the current project change before moving selection"
              : minimization?.startReason() ?? viewerUnavailableReason ?? movementUnavailableReason(project, selection, () => viewerRef.current?.getRenderedAtomReferences() ?? [])} /> : null}
          {onEdit && !movementActive ? <MolecularEditPanel project={project} selection={selection} busy={busy}
            onOpen={() => {
              const reason = minimization?.startReason();
              if (reason && !(editAttempt && editAttemptBlocksWrites(editAttempt))) { setViewerError(reason); return false; }
              if (!reason) useMinimizationStore.getState().dismiss();
              setStyleProjectId(null); setSurfaceProjectId(null); setInteractionProjectId(null); return true;
            }}
            unavailable={coordinatePreview ? "Finish coordinate preview before editing chemistry." : null}
            attempt={editAttempt} onCheckEdit={onCheckEdit} onReviewEdit={onReviewEdit} onContinueEdit={onContinueEdit} editReviewCurrent={editReviewCurrent} onRecoverResidue={onRecoverResidue}
            onGeometry={onGeometry} geometryUnavailable={coordinatePreview ? "Finish coordinate preview before opening geometry." : movement?.state.phase !== "idle" && movement ? "Finish movement before opening geometry." : null}
            onEdit={onEdit} onHydrogenAppearance={onHydrogenAppearance ? (change, target) => {
              const capture = captureHydrogenTarget(project, useSelectionStore.getState().projectEpoch, selection, target);
              return onHydrogenAppearance(change, capture);
            } : undefined} /> : null}
          {minimization ? <MinimizationPanel workflow={{ ...minimization, ...minimizationPreview, error: minimizationPreview.error ?? minimizationPreview.previewError }}
            unavailable={minimizationUnavailable} onOpen={openMinimization} /> : null}
          </div>
        </div>
        <InteractionPanel {...interactions.panel} restoreFocus={!minimizationPreview.open && !minimizationPreview.state.autoApply}
          open={interactionProjectId === project.id} onOpenChange={open => setInteractionProjectId(open ? project.id : null)} />
        <SelectionStyleDialog
          onExpandDistance={onExpandDistance}
          onExpandResidues={expanded => onViewerSelection(expanded, "replace")}
          onAppearance={onAppearance}
          onHydrogenAppearance={onHydrogenAppearance ? (change, target) => {
            if (onLoadSelectionStructures && (styleEligibilityBusy || styleLoadedContext !== styleContext || styleEligibilityError)) {
              return Promise.reject(new Error("Selection structures are not current. Reopen styling to retry."));
            }
            const capture = captureHydrogenTarget(project, useSelectionStore.getState().projectEpoch, selection, target);
            return onHydrogenAppearance(change, capture);
          } : undefined}
          selectionColorMode={selectionColorMode}
          onSelectionColorModeChange={onSelectionColorModeChange}
          onAtomVisibility={onAtomVisibility}
          key={project.id}
          onManageSurfaces={openSurfaces}
          onCreateSurface={onSurfaces ? () => openSurfaceCreation() : undefined}
          open={styleDialogOpen}
          restoreFocus={surfaceProjectId !== project.id && !editOpen && !minimizationPreview.open && !minimizationPreview.state.autoApply}
          selection={selection}
          entries={project.entries}
          structures={styleStructures}
          eligibilityBusy={Boolean(onLoadSelectionStructures) && (styleEligibilityBusy || styleLoadedContext !== styleContext)}
          eligibilityError={styleLoadedContext === styleContext ? styleEligibilityError : null}
          busy={busy}
          onOpenChange={setStyleDialogOpen}
          onAction={async (action, style, channel) => {
            if (!onSelectionStyle) return;
            await onSelectionStyle(action, style, channel);
          }}
        />
        {!movementActive ? <ViewerControls
        entries={project.entries}
        activeEntryId={activeEntryId}
        camera={camera}
        scenes={project.scenes}
        selectedCount={selection.atoms.length}
        busy={busy}
        isolated={isolation !== null}
        onActiveEntry={setActiveEntryId}
        onManageSurfaces={openSurfaces}
        onCreateSurface={onSurfaces ? entryId => openSurfaceCreation("entry", entryId) : undefined}
        onSettings={(entryId, settings) => {
          void onUpdateSettings?.(entryId, settings);
        }}
        onCameraMode={(mode) => {
          viewerRef.current?.setCameraMode(mode);
          setCamera((current) => (current ? { ...current, mode } : current));
        }}
        onZoom={(factor) => viewerRef.current?.zoom(factor)}
        onIsolation={(next) => {
          const target = next ? selection.atoms : null;
          setIsolation(target);
          void viewerRef.current?.setIsolation(target);
        }}
        onCreateScene={(name) => {
          const snapshot = viewerRef.current?.getCamera();
          if (snapshot) void onCreateScene?.(name, snapshot);
        }}
        onApplyScene={(scene) => {
          const viewer = viewerRef.current;
          if (!viewer) return;
          const generation = cameraPresentation?.beginCameraIntent();
          void (async () => {
            if (onApplyScene) await onApplyScene(scene);
            if (viewerRef.current !== viewer || useWorkspaceStore.getState().activeProjectId !== project.id
              || generation !== undefined && cameraPresentation?.getSnapshot().navigationGeneration !== generation) return;
            setActiveSurface(null);
            setIsolation(null);
            viewer.setCamera(scene.camera);
            onViewerSelection(scene.selection, "replace");
          })().catch((error: unknown) => {
            if (viewerRef.current === viewer) {
              if (generation !== undefined) cameraPresentation?.cancelCameraIntent(generation);
              setViewerError(error instanceof Error ? error.message : "The scene could not be applied.");
            }
          });
        }}
        onDeleteScene={(scene) => {
          void onDeleteScene?.(scene);
        }}
        /> : null}
      </Tooltip.Provider>
      {onSurfaces ? <SurfaceManager key={project.id} open={surfaceProjectId === project.id}
        projectId={project.id} session={managerSession} creationRequest={surfaceCreation}
        loadPocketStructures={onLoadPocketStructures}
        onPreviewAppearance={(identity, appearance) => viewerRef.current?.previewSurfaceAppearance(identity, appearance)}
        onOpenChange={open => setSurfaceProjectId(open ? project.id : null)} entries={project.entries}
        active={activeSurface} onActivate={setActiveSurface} actions={onSurfaces} statuses={surfaceStatuses} busy={busy}
        selection={selection.atoms}
        onSelectAtoms={atoms => onViewerSelection({ schema_version: 1, atoms, granularity: "atom", source: "inspector" }, "replace")}
        loadSource={async entryId => {
          const entry = project.entries.find(item => item.id === entryId);
          if (!entry?.current_artifact_id) throw new Error("This source has no current molecular artifact.");
          return queryClient.fetchQuery(structureQueryOptions(project.id, entry.id, entry.current_artifact_id));
        }}
        autoFocus={true}
        onReturnFocus={() => targetRef.current?.closest(".structure-viewer")?.querySelector<HTMLButtonElement>('[aria-label="Style selection"]')?.focus()}
        onCancel={(entryId, surface) => viewerRef.current?.cancelSurface(entryId, surface.source.kind, surface.id)}
        onRetry={(entryId, surface) => viewerRef.current?.retrySurface(entryId, surface.source.kind, surface.id)} /> : null}
      {surfaceStatuses.some(status => ["queued", "rendering", "fallback", "cancelled"].includes(status.state)) ? <div className="surface-runtime-status">
        <button type="button" onClick={openSurfaces}>Surfaces · {surfaceStatuses.filter(status => ["queued", "rendering"].includes(status.state)).length} calculating
          {surfaceStatuses.some(status => ["fallback", "cancelled"].includes(status.state)) ? " · needs attention" : ""}</button>
      </div> : null}
      {loading ? (
        <div className="viewer-loading" aria-label="Loading molecular structures">
          <LoaderCircle size={22} />
          <span>{viewerReady ? "Loading structures" : "Starting 3D viewer"}</span>
        </div>
      ) : null}
      {visibleEntries.length === 0 ? (
        <div className="viewer-empty">
          <span>No visible structures</span>
        </div>
      ) : null}
    </div>
    <SequenceViewer projectId={project.id} rows={sequenceRows} selection={selection}
      loading={structureQueries.some((query, index) => query.isPending || query.isPlaceholderData
        || !isCompleteProjection(query.data, visibleEntries[index].id, visibleEntries[index].current_artifact_id))}
      failed={structureQueries.some(query => query.isError)} onSelectResidue={onSelectResidue}
      onHide={() => { returnSequenceFocus.current = true; useWorkspaceStore.getState().setSequenceDisplay("hidden"); }} />
    </div>
  );
}
