import { useQueries } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { molecularApi } from "../api/client";
import type { Project } from "../api/types";
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

interface StructureViewerProps {
  project: Project;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  onViewerSelection: (selection: Selection, mode: SelectionMode) => void;
  createViewer?: MolecularViewerFactory;
}

export function StructureViewer({
  project,
  selection,
  pickingGranularity,
  onViewerSelection,
  createViewer = createMolstarViewer,
}: StructureViewerProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MolecularViewer | undefined>(undefined);
  const onViewerSelectionRef = useRef(onViewerSelection);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
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
    return () => {
      active = false;
      unsubscribe();
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
              },
            ]
          : [],
      ),
    [structureQueries, visibleEntries],
  );
  const syncKey = viewerStructures
    .map((structure) => `${structure.entryId}:${structure.projection.data.length}`)
    .join("|");

  useEffect(() => {
    if (!viewerReady || structureQueries.some((query) => query.isPending)) return;
    void viewerRef.current
      ?.syncStructures(viewerStructures)
      .catch((error: unknown) =>
        setViewerError(error instanceof Error ? error.message : "The viewer rejected a structure."),
      );
  }, [structureQueries, syncKey, viewerReady, viewerStructures]);

  useEffect(() => {
    if (!viewerReady) return;
    viewerRef.current?.setSelection(selection.atoms);
  }, [selection.atoms, viewerReady, syncKey]);

  useEffect(() => {
    viewerRef.current?.setPickingGranularity(pickingGranularity);
  }, [pickingGranularity]);

  const loading =
    (!viewerReady && !viewerError) || structureQueries.some((query) => query.isPending);
  const failedQueries = structureQueries.filter((query) => query.isError);
  const warningCount = visibleEntries.reduce((count, entry) => count + entry.warnings.length, 0);

  return (
    <div className="structure-viewer" data-testid="structure-viewer">
      <div
        ref={targetRef}
        className="molstar-host"
        data-testid="molstar-host"
        aria-label="3D molecular viewer"
      />
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
