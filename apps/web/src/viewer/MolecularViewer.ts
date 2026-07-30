import type {
  AtomReference,
  SelectionGranularity,
  SelectionMode,
  StructureProjection,
} from "../api/types";

export interface ViewerStructure {
  entryId: string;
  label: string;
  projection: StructureProjection["viewer"];
  atomIds: number[];
}

export interface ViewerSelectionEvent {
  atoms: AtomReference[];
  granularity: SelectionGranularity;
  mode: SelectionMode;
}

export interface MolecularViewer {
  mount(target: HTMLElement): Promise<void>;
  syncStructures(structures: ViewerStructure[]): Promise<void>;
  setSelection(atoms: AtomReference[]): void;
  setPickingGranularity(granularity: SelectionGranularity): void;
  subscribeSelection(listener: (event: ViewerSelectionEvent) => void): () => void;
  resize(): void;
  dispose(): void;
}

export type MolecularViewerFactory = () => MolecularViewer;
