import type {
  AtomReference,
  CameraState,
  CoordinatePatch,
  Measurement,
  NormalizedStructure,
  SelectionGranularity,
  SelectionMode,
  StructureProjection,
  ViewerSettings,
} from "../api/types";

export interface ViewerStructure {
  entryId: string;
  label: string;
  projection: StructureProjection["viewer"];
  atomIds: number[];
  normalized: NormalizedStructure;
  settings: ViewerSettings;
}

export interface ViewerSelectionEvent {
  atoms: AtomReference[];
  granularity: SelectionGranularity;
  mode: SelectionMode;
}

export interface MolecularViewer {
  mount(target: HTMLElement): Promise<void>;
  syncStructures(structures: ViewerStructure[]): Promise<void>;
  replaceStructure(structure: ViewerStructure): Promise<void>;
  applyCoordinatePatch(
    patch: CoordinatePatch,
    mode: "preview" | "commit",
  ): Promise<void>;
  clearCoordinatePreview(entryId: string): Promise<void>;
  setSelection(atoms: AtomReference[]): void;
  setPickingGranularity(granularity: SelectionGranularity): void;
  setMeasurements(measurements: ViewerMeasurement[]): Promise<void>;
  setIsolation(atoms: AtomReference[] | null): Promise<void>;
  getCamera(): CameraState | null;
  setCamera(camera: CameraState): void;
  setCameraMode(mode: CameraState["mode"]): void;
  zoom(factor: number): void;
  focusSelection(): void;
  resetCamera(): void;
  subscribeCamera(listener: (camera: CameraState) => void): () => void;
  subscribeSelection(listener: (event: ViewerSelectionEvent) => void): () => void;
  resize(): void;
  dispose(): void;
}

export interface ViewerMeasurement extends Measurement {
  label: string;
}

export type MolecularViewerFactory = () => MolecularViewer;
