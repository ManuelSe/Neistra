import type { SurfaceChannel } from "./surface/protocol";
import type { SurfaceIdentity } from "./surface/objects";
import type { InteractionRecord } from "../interactions/types";
import type { SurfaceStatus } from "./surface/runtime";
import type { MovementView } from "../coordinates/interactiveTransform";
import type { ViewerPick } from "../selection/gestures";
import type {
  MolecularProposalGeometry,
  AtomReference,
  CameraState,
  ComponentHierarchy,
  CoordinatePatch,
  Measurement,
  NormalizedStructure,
  SelectionGranularity,
  SelectionMode,
  StructureProjection,
  ViewerSettings,
} from "../api/types";

export interface ResolvedPocket {
  radius: number;
  seeds: { reference: AtomReference; coordinates: [number, number, number] }[];
  dependencyKey: string;
  unavailable?: string;
}

export interface ViewerStructure {
  pockets?: Readonly<Record<string, ResolvedPocket>>;
  entryId: string;
  label: string;
  projection: StructureProjection["viewer"];
  atomIds: number[];
  normalized: NormalizedStructure;
  hierarchy: ComponentHierarchy;
  settings: ViewerSettings;
}

export interface ViewerSelectionEvent {
  atoms: AtomReference[];
  granularity: SelectionGranularity;
  mode: SelectionMode;
  pick?: ViewerPick;
}

export type MovementInteraction = "inactive" | "transform" | "camera";

export interface MolecularViewer {
  mount(target: HTMLElement): Promise<void>;
  setBackgroundColor(cssColor: string): void;
  syncStructures(structures: ViewerStructure[]): Promise<void>;
  replaceStructure(structure: ViewerStructure): Promise<void>;
  applyCoordinatePatch(
    patch: CoordinatePatch,
    mode: "preview" | "commit",
  ): Promise<void>;
  clearCoordinatePreview(entryId: string): Promise<void>;
  /** Yield until prior rendering releases preview buffers; never changes molecular state. */
  prepareCoordinatePreview?(signal: AbortSignal): Promise<void>;
  setModelPreview?: (preview: MolecularProposalGeometry | null) => Promise<void>;
  setSelection(atoms: AtomReference[]): void;
  setPickingGranularity(granularity: SelectionGranularity): void;
  setMeasurements(measurements: ViewerMeasurement[]): Promise<void>;
  setInteractions(interactions: InteractionRecord[]): Promise<void>;
  setIsolation(atoms: AtomReference[] | null): Promise<void>;
  getCamera(): CameraState | null;
  getMovementView(): MovementView | null;
  getRenderedAtomReferences(): AtomReference[];
  setMovementMode(interaction: MovementInteraction): void;
  setCamera(camera: CameraState): void;
  setCameraMode(mode: CameraState["mode"]): void;
  zoom(factor: number): void;
  focusAtoms(atoms: AtomReference[]): void;
  fitVisible(): void;
  subscribeCamera(listener: (camera: CameraState) => void): () => void;
  subscribeSelection(listener: (event: ViewerSelectionEvent) => void): () => void;
  subscribeSurfaces(listener: (statuses: SurfaceStatus[]) => void): () => void;
  subscribeSurfaceSelection(listener: (surface: SurfaceIdentity) => void): () => void;
  setActiveSurface(surface: SurfaceIdentity | null): void;
  cancelSurface(entryId: string, channel?: SurfaceChannel, surfaceId?: string): void;
  retrySurface(entryId: string, channel?: SurfaceChannel, surfaceId?: string): void;
  resize(): void;
  dispose(): void;
}

export interface ViewerMeasurement extends Measurement {
  label: string;
}

export type MolecularViewerFactory = () => MolecularViewer;
