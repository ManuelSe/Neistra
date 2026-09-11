import type { ChangeSelectionAppearance } from "../api/types";
import type { ExpandSelection } from "../selection/expansion";
import { useQueries } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { molecularApi } from "../api/client";
import type {
  CameraState,
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
import { SelectionStyleDialog } from "./SelectionStyleDialog";

const VIEWER_BACKGROUND_COLORS: Record<Theme, string> = {
  light: THEME_TOKENS.light["viewer-background"],
  dark: THEME_TOKENS.dark["viewer-background"],
};

interface StructureViewerProps {
  project: Project;
  theme: Theme;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  onPickingGranularity: (granularity: SelectionGranularity) => void;
  onViewerSelection: (selection: Selection, mode: SelectionMode) => void;
  busy?: boolean;
  coordinatePreview?: CoordinatePatch | null;
  onUpdateSettings?: (entryId: string, settings: ViewerSettings) => Promise<void>;
  onCreateScene?: (name: string, camera: CameraState) => Promise<void>;
  onApplyScene?: (scene: Scene) => Promise<void>;
  onDeleteScene?: (scene: Scene) => Promise<void>;
  onLoadSelectionStructures?: () => Promise<Map<string, StructureProjection>>;
  onExpandDistance?: ExpandSelection;
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
  onUpdateSettings,
  onCreateScene,
  onApplyScene,
  onDeleteScene,
  onLoadSelectionStructures,
  onSelectionStyle,
  onExpandDistance,
  onAppearance,
  createViewer = createMolstarViewer,
}: StructureViewerProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MolecularViewer | undefined>(undefined);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onViewerSelectionRef = useRef(onViewerSelection);
  const viewerStructuresRef = useRef<ViewerStructure[]>([]);
  const appliedArtifactsRef = useRef(new Map<string, string>());
  const appliedTopologyArtifactsRef = useRef(new Map<string, string>());
  const previewEntryRef = useRef<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState("");
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [isolation, setIsolation] = useState<Selection["atoms"] | null>(null);
  const [styleProjectId, setStyleProjectId] = useState<string | null>(null);
  const styleDialogOpen = styleProjectId === project.id;
  const setStyleDialogOpen = (open: boolean) => setStyleProjectId(open ? project.id : null);
  useEffect(() => { setStyleProjectId(null); }, [project.id]);
  const [styleStructures, setStyleStructures] = useState(
    new Map<string, StructureProjection>(),
  );
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

  useEffect(() => {
    onViewerSelectionRef.current = onViewerSelection;
  }, [onViewerSelection]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const viewer = createViewer();
    viewerRef.current = viewer;
    viewer.setBackgroundColor(VIEWER_BACKGROUND_COLORS[themeRef.current]);
    let active = true;
    void viewer
      .mount(target)
      .then(() => {
        if (active) {
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
    const unsubscribeCamera = viewer.subscribeCamera(setCamera);
    return () => {
      active = false;
      unsubscribe();
      unsubscribeCamera();
      observer.disconnect();
      viewer.dispose();
      viewerRef.current = undefined;
    };
  }, [createViewer]);

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
                label: visibleEntries[index].name,
                projection: query.data.viewer,
                atomIds: query.data.structure.atoms.map((atom) => atom.id),
                normalized: query.data.structure,
                hierarchy: query.data.hierarchy,
                settings:
                  visibleEntries[index].atom_count >= 250_000
                    ? {
                        ...visibleEntries[index].viewer_settings,
                        representations: visibleEntries[
                          index
                        ].viewer_settings.representations.map((representation) =>
                          representation.style === "surface"
                            ? { ...representation, style: "line" as const }
                            : representation,
                        ),
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
    [structureQueries, visibleEntries],
  );
  const syncKey = viewerStructures
    .map(
      (structure) =>
        `${structure.entryId}:${JSON.stringify(structure.settings)}`,
    )
    .join("|");
  const structuresPending = structureQueries.some((query) => query.isPending);
  viewerStructuresRef.current = viewerStructures;

  useEffect(() => {
    if (!viewerReady) return;
    void viewerRef.current
      ?.syncStructures(viewerStructuresRef.current)
      .catch((error: unknown) =>
        setViewerError(error instanceof Error ? error.message : "The viewer rejected a structure."),
      );
  }, [structuresPending, syncKey, viewerReady]);

  useEffect(() => {
    if (!viewerReady) return;
    for (const patch of project.structure_patches ?? []) {
      if (appliedArtifactsRef.current.get(patch.entry_id) === patch.artifact_id) {
        continue;
      }
      appliedArtifactsRef.current.set(patch.entry_id, patch.artifact_id);
      void viewerRef.current
        ?.applyCoordinatePatch(patch, "commit")
        .catch((error: unknown) =>
          setViewerError(
            error instanceof Error
              ? error.message
              : "The viewer rejected a coordinate update.",
          ),
        );
    }
  }, [project.structure_patches, syncKey, viewerReady]);

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
    const previousEntryId = previewEntryRef.current;
    if (previousEntryId && previousEntryId !== coordinatePreview?.entry_id) {
      void viewerRef.current?.clearCoordinatePreview(previousEntryId);
    }
    previewEntryRef.current = coordinatePreview?.entry_id ?? null;
    if (coordinatePreview) {
      void viewerRef.current
        ?.applyCoordinatePatch(coordinatePreview, "preview")
        .catch((error: unknown) =>
          setViewerError(
            error instanceof Error
              ? error.message
              : "The viewer rejected a coordinate preview.",
          ),
        );
    } else if (previousEntryId) {
      void viewerRef.current?.clearCoordinatePreview(previousEntryId);
    }
  }, [coordinatePreview, viewerReady]);

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
    const measurements = project.measurements.map((measurement) => {
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
  }, [normalizedStructures, project.measurements, syncKey, viewerReady]);

  const loading =
    (!viewerReady && !viewerError) || structuresPending;
  const failedQueries = structureQueries.filter((query) => query.isError);
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
    : selection.atoms.length === 0
      ? "Select atoms before styling the selection"
      : onSelectionStyle
        ? null
        : "Selection styling is unavailable in this workspace";

  const openStyleDialog = () => {
    if (styleDialogOpen) { setStyleDialogOpen(false); return; }
    if (selectionStyleUnavailableReason) return;
    setStyleDialogOpen(true);
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
      .finally(() => { if (current) setStyleEligibilityBusy(false); });
    return () => { current = false; };
  }, [styleDialogOpen, styleContext]);

  return (
    <div className="structure-viewer" data-testid="structure-viewer">
      <div
        ref={targetRef}
        className="molstar-host"
        data-testid="molstar-host"
        aria-label="3D molecular viewer"
      />
      <Tooltip.Provider delayDuration={350}>
        <ViewerToolbar
          pickingGranularity={pickingGranularity}
          onPickingGranularity={onPickingGranularity}
          fitAllUnavailableReason={viewerUnavailableReason}
          focusSelectionUnavailableReason={focusSelectionUnavailableReason}
          focusLigandsUnavailableReason={focusLigandsUnavailableReason}
          selectionStyleUnavailableReason={styleDialogOpen ? null : selectionStyleUnavailableReason}
          selectionStyleOpen={styleDialogOpen}
          onFitAll={() => viewerRef.current?.fitVisible()}
          onFocusSelection={() => viewerRef.current?.focusAtoms(selection.atoms)}
          onFocusLigands={() => viewerRef.current?.focusAtoms(ligandAtoms)}
          onSelectionStyle={openStyleDialog}
        />
        <SelectionStyleDialog
          onExpandDistance={onExpandDistance}
          onAppearance={onAppearance}
          open={styleDialogOpen}
          selection={selection}
          entries={project.entries}
          structures={styleStructures}
          eligibilityBusy={styleEligibilityBusy}
          eligibilityError={styleEligibilityError}
          busy={busy}
          onOpenChange={setStyleDialogOpen}
          onAction={async (action, style) => {
            if (!onSelectionStyle) return;
            await onSelectionStyle(action, style);
          }}
        />
        <ViewerControls
        entries={project.entries}
        activeEntryId={activeEntryId}
        camera={camera}
        scenes={project.scenes}
        selectedCount={selection.atoms.length}
        busy={busy}
        isolated={isolation !== null}
        onActiveEntry={setActiveEntryId}
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
            setIsolation(null);
            viewerRef.current?.setCamera(scene.camera);
            onViewerSelection(scene.selection, "replace");
          })();
        }}
        onDeleteScene={(scene) => {
          void onDeleteScene?.(scene);
        }}
        />
      </Tooltip.Provider>
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
    </div>
  );
}
