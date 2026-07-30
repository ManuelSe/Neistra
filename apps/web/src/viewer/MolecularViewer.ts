import type { StructureProjection } from "../api/types";

export interface ViewerStructure {
  entryId: string;
  label: string;
  projection: StructureProjection["viewer"];
}

export interface MolecularViewer {
  mount(target: HTMLElement): Promise<void>;
  syncStructures(structures: ViewerStructure[]): Promise<void>;
  resize(): void;
  dispose(): void;
}

export type MolecularViewerFactory = () => MolecularViewer;
