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
import { formatMeasurement, measurementValue } from "../measurements/geometry";
import { ViewerControls } from "./ViewerControls";

interface StructureViewerProps {
  project: Project;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  onViewerSelection: (selection: Selection, mode: SelectionMode) => void;
  busy?: boolean;
  coordinatePreview?: CoordinatePatch | null;
  onUpdateSettings?: (entryId: string, settings: ViewerSettings) => Promise<void>;
  onCreateScene?: (name: string, camera: CameraState) => Promise<void>;
  onApplyScene?: (scene: Scene) => Promise<void>;
  onDeleteScene?: (scene: Scene) => Promise<void>;
  createViewer?: MolecularViewerFactory;
}

export function StructureViewer({
  project,
  selection,
  pickingGranularity,
  onViewerSelection,
  busy = false,
  coordinatePreview = null,
  onUpdateSettings,
  onCreateScene,
  onApplyScene,
  onDeleteScene,
  createViewer = createMolstarViewer,
}: StructureViewerProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MolecularViewer | undefined>(undefined);
  const onViewerSelectionRef = useRef(onViewerSelection);
  const viewerStructuresRef = useRef<ViewerStructure[]>([]);
  const appliedArtifactsRef = useRef(new Map<string, string>());
  const appliedTopologyArtifactsRef = useRef(new Map<string, string>());
  const previewEntryRef = useRef<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState("");
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [isolated, setIsolated] = useState(false);
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

  return (
    <div className="structure-viewer" data-testid="structure-viewer">
      <div
        ref={targetRef}
        className="molstar-host"
        data-testid="molstar-host"
        aria-label="3D molecular viewer"
      />
      <Tooltip.Provider delayDuration={350}>
        <ViewerControls
        entries={project.entries}
        activeEntryId={activeEntryId}
        camera={camera}
        scenes={project.scenes}
        selectedCount={selection.atoms.length}
        busy={busy}
        isolated={isolated}
        onActiveEntry={setActiveEntryId}
        onSettings={(entryId, settings) => {
          void onUpdateSettings?.(entryId, settings);
        }}
        onCameraMode={(mode) => {
          viewerRef.current?.setCameraMode(mode);
          setCamera((current) => (current ? { ...current, mode } : current));
        }}
        onZoom={(factor) => viewerRef.current?.zoom(factor)}
        onFocus={() => viewerRef.current?.focusSelection()}
        onReset={() => viewerRef.current?.resetCamera()}
        onIsolation={(next) => {
          setIsolated(next);
          void viewerRef.current?.setIsolation(next ? selection.atoms : null);
        }}
        onCreateScene={(name) => {
          const snapshot = viewerRef.current?.getCamera();
          if (snapshot) void onCreateScene?.(name, snapshot);
        }}
        onApplyScene={(scene) => {
          void (async () => {
            if (onApplyScene) await onApplyScene(scene);
            setIsolated(false);
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
