import { useMinimizationPreview } from "../minimization/useMinimizationPreview";
import type { MinimizationWorkflow } from "../minimization/useMinimization";
import { useMinimizationShortcut } from "../minimization/useMinimizationShortcut";
import { useMinimizationStore } from "../minimization/store";
import { MinimizationPanel } from "./MinimizationPanel";
import { placementContext } from "../editing/placement";
import { useSelectionStore } from "../store/selection";
import type { SurfaceStatus } from "../viewer/surface/runtime";
import type { SurfaceActions, ChangeSelectionAppearance, ApplySelectionEdit } from "../api/types";
import { useChromeClearance } from "../viewer/useChromeClearance";
import { MolecularEditPanel } from "./MolecularEditPanel";
import { useViewerCameraStore } from "../store/viewerCamera";
import { useEditingStore } from "../store/editing";
import type { ExpandSelection } from "../selection/expansion";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { molecularApi } from "../api/client";
import type {
  CameraState,
  AtomReference,
  CoordinatePatch,
  Project,
  Scene,
  SelectionRepresentationStyle,
  StructureProjection,
  ViewerSettings,
} from "../api/types";
import type {
  Selection,
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
import { useInteractions } from "../interactions/useInteractions";
import { filterInteractions } from "../interactions/filter";

const VIEWER_BACKGROUND_COLORS: Record<Theme, string> = {
  light: THEME_TOKENS.light["viewer-background"],
  dark: THEME_TOKENS.dark["viewer-background"],
};

interface StructureViewerProps {
  onEdit?: ApplySelectionEdit;
  project: Project;
  theme: Theme;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  onPickingGranularity: (granularity: SelectionGranularity) => void;
  onViewerSelection: (selection: Selection, mode: SelectionMode) => void;
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
  onLoadPocketStructures?: () => Promise<Map<string, StructureProjection>>;
  onAppearance?: ChangeSelectionAppearance;
  onSelectionStyle?: (
    action: "apply" | "reset",
    style?: SelectionRepresentationStyle,
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
  onLoadPocketStructures,
  onAppearance,
  onEdit,
  createViewer = createMolstarViewer,
}: StructureViewerProps) {
  const queryClient = useQueryClient();
  const targetRef = useRef<HTMLDivElement>(null);
  useChromeClearance(targetRef);
  const viewerRef = useRef<MolecularViewer | undefined>(undefined);
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
  const [surfaceStatuses, setSurfaceStatuses] = useState<SurfaceStatus[]>([]);
  const [surfaceProjectId, setSurfaceProjectId] = useState<string | null>(null);
  const [activeSurface, setActiveSurface] = useState<SurfaceIdentity | null>(null);
  const surfaceOpenedByCanvas = useRef(false);
  const openSurfaces = () => {
    if (useEditingStore.getState().projectId === project.id) useEditingStore.getState().setOpen(false);
    surfaceOpenedByCanvas.current = false;
    useMinimizationStore.getState().dismiss();
    setStyleProjectId(null); setSurfaceProjectId(project.id);
  };
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState("");
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [isolation, setIsolation] = useState<Selection["atoms"] | null>(null);
  const [styleProjectId, setStyleProjectId] = useState<string | null>(null);
  const [interactionProjectId, setInteractionProjectId] = useState<string | null>(null);
  const openMinimization = () => { useEditingStore.getState().setOpen(false); setStyleProjectId(null); setSurfaceProjectId(null); setInteractionProjectId(null); };
  const minimizationUnavailable = movementActive ? "Finish movement before minimizing selection" : coordinatePreview ? "Finish coordinate preview before minimizing" : busy ? "Finish the current change before minimizing" : !selection.atoms.length ? "Select atoms before minimizing" : null;
  useMinimizationShortcut(!!minimization && !minimizationUnavailable, () => {
    openMinimization(); void minimization?.quick();
  });
  const interactionPaused = movementActive || Boolean(coordinatePreview) || Boolean(minimizationPreview.patches.length);
  const interactionInputs = project.entries.filter(entry => entry.visible && entry.current_artifact_id).map(entry => ({ entry_id: entry.id, artifact_id: entry.current_artifact_id! }));
  const interactions = useInteractions(project.id, interactionInputs, interactionPaused);
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
      queryKey: ["structure", project.id, entry.id, entry.current_artifact_id],
      queryFn: () => molecularApi.structure(project.id, entry.id),
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      placeholderData: (previous: StructureProjection | undefined) => previous,
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
      queryKey: ["structure", project.id, entry.id, entry.current_artifact_id],
      queryFn: () => molecularApi.structure(project.id, entry.id),
      retry: false, staleTime: Number.POSITIVE_INFINITY,
    })),
  });
  const pockets = resolvePocketInputs(visibleEntries.concat(hiddenSeedEntries), new Map([
    ...structureQueries.map((query, index) => [visibleEntries[index].id, {
      data: query.data, current: Boolean(query.data) && !query.isPlaceholderData, failed: query.isError,
    }] as const),
    ...hiddenSeedQueries.map((query, index) => [hiddenSeedEntries[index].id, {
      data: query.data, current: Boolean(query.data), failed: query.isError,
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
    viewer.setBackgroundColor(VIEWER_BACKGROUND_COLORS[themeRef.current]);
    let active = true;
    void viewer
      .mount(target)
      .then(() => {
        if (active) {
          // Seed the disposable viewer before its first scene commit. A later
          // restoration can lose to Mol*'s queued initial fit request.
          const retained = useViewerCameraStore.getState();
          const remembered = currentMovement.current?.camera()
            ?? (retained.projectId === project.id ? retained.camera : null);
          if (remembered) viewer.setCamera(remembered);
          setViewerReady(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setViewerError(
            error instanceof Error ? error.message : "The molecular viewer could not start.",
          );
        }
      });
    const observer = new ResizeObserver(() => viewer.resize());
    observer.observe(target);
    const unsubscribe = viewer.subscribeSelection((event) => {
      onViewerSelectionRef.current(
        {
          schema_version: 1,
          atoms: event.atoms,
          granularity: event.granularity,
          source: "viewer",
        },
        event.mode,
      );
    });
    const unsubscribeSurfaces = viewer.subscribeSurfaces(setSurfaceStatuses);
    const unsubscribeSurfaceSelection = viewer.subscribeSurfaceSelection(identity => {
      if (useEditingStore.getState().projectId === project.id) useEditingStore.getState().setOpen(false);
      surfaceOpenedByCanvas.current = true;
      setActiveSurface(identity); setStyleProjectId(null); setSurfaceProjectId(project.id);
    });
    initialSceneReady.current = false;
    const unsubscribeCamera = viewer.subscribeCamera(camera => {
      setCamera(camera);
      if (initialSceneReady.current) {
        currentMovement.current?.rememberCamera(camera);
        useViewerCameraStore.getState().remember(project.id, camera);
      }
    });
    return () => {
      active = false;
      if (initialSceneReady.current) {
        currentMovement.current?.rememberCamera(viewer.getCamera());
        useViewerCameraStore.getState().remember(project.id, viewer.getCamera());
      }
      currentMovement.current?.clearNavigation();
      unsubscribe();
      unsubscribeCamera();
      unsubscribeSurfaces();
      unsubscribeSurfaceSelection();
      observer.disconnect();
      previewQueue.current?.dispose();
      previewQueue.current = null;
      viewer.dispose();
      viewerRef.current = undefined;
    };
  }, [createViewer, project.id]);

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
  const syncKey = viewerStructures
    .map(
      (structure) =>
        `${structure.entryId}:${JSON.stringify(structure.settings)}:${Object.values(structure.pockets ?? {}).map(pocket => pocket.dependencyKey).join(";")}`,
    )
    .join("|");
  const structuresPending = structureQueries.some((query) => query.isPending);
  viewerStructuresRef.current = viewerStructures;
  const interactionViewReady = structureQueries.every(query => Boolean(query.data) && !query.isPlaceholderData && !query.isError);
  const interactionRecords = interactions.result && !interactionPaused && interactionViewReady
    ? filterInteractions(interactions.result.records, interactions.choices, viewerStructures, isolation) : [];
  const interactionDisplayKey = JSON.stringify(interactionRecords);
  const interactionRecordsRef = useRef(interactionRecords); interactionRecordsRef.current = interactionRecords;
  useLayoutEffect(() => {
    if (interactionPaused || !interactions.result || !interactionViewReady) void viewerRef.current?.setInteractions([]).catch(() => undefined);
  }, [interactionPaused, interactions.result, interactionViewReady, viewerReady]);
  useEffect(() => {
    if (!viewerReady) return;
    void viewerRef.current?.setInteractions(interactionRecordsRef.current).catch((error: unknown) => setViewerError(error instanceof Error ? error.message : "Interaction markers could not be displayed."));
  }, [interactionDisplayKey, syncKey, viewerReady]);
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
    if (!viewerReady) return;
    const syncedViewer = viewerRef.current;
    void syncedViewer
      ?.syncStructures(viewerStructuresRef.current)
      .then(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer !== syncedViewer) return;
        const workflow = currentMovement.current;
        const active = Boolean(workflow?.state.capture && workflow.state.phase !== "idle");
        if (!initialSceneReady.current && !structuresPending && viewerStructuresRef.current.length) {
          const retained = useViewerCameraStore.getState();
          const camera = (active ? workflow?.camera() : null)
            ?? (retained.projectId === project.id ? retained.camera : null);
          if (camera) {
            viewer.setMovementMode("inactive");
            viewer.setCamera(camera);
          }
          initialSceneReady.current = true;
        }
        viewer.setMovementMode(!active ? "inactive" : workflow?.cameraNavigation ? "camera" : "transform");
        if (active) workflow?.rememberCamera(viewer.getCamera());
        const editing = useEditingStore.getState();
        const focus = editing.focusNewMolecule;
        if (focus && editing.projectId === project.id) {
          editing.setFocusNewMolecule(null);
          if (!active && useSelectionStore.getState().selection === focus.selection) viewer.focusAtoms([{ structure_id: focus.entryId, atom_id: focus.atomId }]);
        }
      })
      .catch((error: unknown) =>
        setViewerError(error instanceof Error ? error.message : "The viewer rejected a structure."),
      );
  }, [structuresPending, syncKey, viewerReady, project.id]);

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
    && placement.context === placementContext(project, placement.result.entry_id, selection, editingState.generation, editingState.section === "bonds" ? editingState.bondHydrogenPolicy : editingState.hydrogenPolicy)
    ? placement.result : null;
  useEffect(() => {
    if (!viewerReady) return;
    const operation = viewerRef.current?.setModelPreview?.(modelPreview);
    void operation?.catch((error: unknown) => setViewerError(error instanceof Error ? error.message : "Placement preview could not be displayed."));
  }, [modelPreview, viewerReady]);

  const topologyDataKey = structureQueries
    .map((query, index) =>
      query.data && !query.isPlaceholderData
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
      if (queryIndex < 0 || structureQueries[queryIndex]?.isPlaceholderData) {
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
        structureQueries.flatMap((query) =>
          query.data ? [[query.data.entry_id, query.data.structure] as const] : [],
        ),
      ),
    [structureQueries],
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
    (!viewerReady && !viewerError) || structuresPending;
  const failedQueries = [...structureQueries, ...hiddenSeedQueries].filter((query) => query.isError);
  const warningCount = visibleEntries.reduce((count, entry) => count + entry.warnings.length, 0);
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
    if (activeSurface && !project.entries.some(entry => entry.id === activeSurface.entryId && entry.viewer_settings.surface_objects.some(surface => surface.id === activeSurface.surfaceId))) {
      setActiveSurface(null); viewerRef.current?.setActiveSurface(null);
    }
  }, [activeSurface, project.entries]);
  useEffect(() => { viewerRef.current?.setActiveSurface(activeSurface); }, [activeSurface, syncKey, viewerReady]);

  const openStyleDialog = () => {
    if (styleDialogOpen) { setStyleDialogOpen(false); return; }
    if (selectionStyleUnavailableReason) return;
    useEditingStore.getState().setOpen(false);
    useMinimizationStore.getState().dismiss();
    setSurfaceProjectId(null); setStyleDialogOpen(true);
    const visible = new Map(
      structureQueries.flatMap((query, index) =>
        query.data ? [[visibleEntries[index].id, query.data] as const] : [],
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
        <div className="viewer-header">
          <div className="viewer-status" role="status">
            <span>
              {visibleEntries.length} visible
              {viewerStructures.length > 0 ? ` / ${viewerStructures.length} loaded` : ""}
              {` / ${selection.atoms.length} selected`}
            </span>
            {warningCount > 0 ? (
              <span className="viewer-warning">
                <AlertTriangle size={13} /> {warningCount} warning{warningCount === 1 ? "" : "s"}
              </span>
            ) : null}
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
            interactionsOpen={interactionProjectId === project.id}
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
          <div className="viewer-edit-transform-actions">
          {movement ? <MovementControls movement={movement}
            view={() => viewerRef.current?.getMovementView() ?? null}
            zoom={factor => viewerRef.current?.zoom(factor)}
            unavailableReason={movement.state.phase !== "idle" ? "Selection capture is in progress"
              : busy ? "Finish the current project change before moving selection"
              : viewerUnavailableReason ?? movementUnavailableReason(project, selection, () => viewerRef.current?.getRenderedAtomReferences() ?? [])} /> : null}
          {onEdit && !movementActive ? <MolecularEditPanel project={project} selection={selection} busy={busy}
            onOpen={() => { useMinimizationStore.getState().dismiss(); setStyleProjectId(null); setSurfaceProjectId(null); setInteractionProjectId(null); }}
            unavailable={coordinatePreview ? "Finish coordinate preview before editing chemistry." : null}
            onEdit={onEdit} onSettings={onUpdateSettings} /> : null}
          {minimization ? <MinimizationPanel workflow={{ ...minimization, ...minimizationPreview, error: minimization.error ?? minimizationPreview.previewError }}
            unavailable={minimizationUnavailable} onOpen={openMinimization} /> : null}
          </div>
        </div>
        <InteractionPanel open={interactionProjectId === project.id} onOpenChange={open => setInteractionProjectId(open ? project.id : null)} choices={interactions.choices} result={interactions.result} onRetry={interactions.error ? interactions.retry : undefined}
          status={interactionPaused ? "Paused during preview" : interactions.error ?? (interactions.loading ? "Analyzing…" : !interactions.enabled ? "Off" : !interactionInputs.length ? "No visible inputs" : !interactions.result || !interactionViewReady ? "Waiting…" : interactions.choices.types.every(kind => interactions.result!.coverage[kind].status === "unavailable") ? "Unavailable · see Help" : `${interactionRecords.length} detected${interactions.choices.types.some(kind => interactions.result!.coverage[kind].status !== "complete") ? " · partial coverage" : ""}`)} />
        <SelectionStyleDialog
          onExpandDistance={onExpandDistance}
          onAppearance={onAppearance}
          onAtomVisibility={onAtomVisibility}
          key={project.id}
          onSurfaces={onSurfaces}
          onManageSurfaces={openSurfaces}
          onCreateFragment={onSurfaces ? async () => {
            const grouped = new Map<string, number[]>();
            for (const atom of selection.atoms) {
              const ids = grouped.get(atom.structure_id) ?? [];
              ids.push(atom.atom_id); grouped.set(atom.structure_id, ids);
            }
            await onSurfaces.create([...grouped].map(([entry_id, ids]) => ({ entry_id,
              source: { kind: "fragment", profile: "molecular-v1", atom_ids: [...new Set(ids)].sort((a, b) => a - b) } })));
          } : undefined}
          onLoadPocketStructures={onLoadPocketStructures}
          open={styleDialogOpen}
          restoreFocus={surfaceProjectId !== project.id && !editOpen}
          selection={selection}
          entries={project.entries}
          structures={styleStructures}
          eligibilityBusy={Boolean(onLoadSelectionStructures) && (styleEligibilityBusy || styleLoadedContext !== styleContext)}
          eligibilityError={styleLoadedContext === styleContext ? styleEligibilityError : null}
          busy={busy}
          onOpenChange={setStyleDialogOpen}
          onAction={async (action, style) => {
            if (!onSelectionStyle) return;
            await onSelectionStyle(action, style);
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
        onCreateSurface={onSurfaces ? entryId => {
          void onSurfaces.create([{ entry_id: entryId, source: { kind: "entry" } }]).then(openSurfaces).catch(() => undefined);
        } : undefined}
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
          void (async () => {
            if (onApplyScene) await onApplyScene(scene);
            setActiveSurface(null); viewerRef.current?.setActiveSurface(null);
            setIsolation(null);
            viewerRef.current?.setCamera(scene.camera);
            onViewerSelection(scene.selection, "replace");
          })();
        }}
        onDeleteScene={(scene) => {
          void onDeleteScene?.(scene);
        }}
        /> : null}
      </Tooltip.Provider>
      {onSurfaces ? <SurfaceManager key={project.id} open={surfaceProjectId === project.id}
        onOpenChange={open => setSurfaceProjectId(open ? project.id : null)} entries={project.entries}
        active={activeSurface} onActivate={setActiveSurface} actions={onSurfaces} statuses={surfaceStatuses} busy={busy}
        selection={selection.atoms}
        onSelectAtoms={atoms => onViewerSelection({ schema_version: 1, atoms, granularity: "atom", source: "inspector" }, "replace")}
        loadSource={async entryId => {
          const entry = project.entries.find(item => item.id === entryId);
          if (!entry?.current_artifact_id) throw new Error("This source has no current molecular artifact.");
          return queryClient.fetchQuery({ queryKey: ["structure", project.id, entry.id, entry.current_artifact_id],
            queryFn: () => molecularApi.structure(project.id, entry.id), staleTime: Number.POSITIVE_INFINITY });
        }}
        autoFocus={!surfaceOpenedByCanvas.current}
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
  );
}
