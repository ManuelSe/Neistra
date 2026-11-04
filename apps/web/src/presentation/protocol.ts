/** Transient local presentation only. No molecular data or workspace commands. */
import type { PresentationPointer } from "../viewer/MolecularViewer";
export interface PresentationState {
  session: string;
  generation: number;
  status: string | null;
  preview: boolean;
  ended?: boolean;
}

export interface PresentationReceiver {
  receive(this: void, state: PresentationState, stream: MediaStream | null): void;
  pointer?(this: void, session: string, generation: number, point: PresentationPointer | null): void;
}

export const presentationReady = "neistra:presentation:ready";

declare global {
  interface Window { neistraPresentation?: PresentationReceiver }
}
