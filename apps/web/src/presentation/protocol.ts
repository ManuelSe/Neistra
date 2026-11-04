/** Transient local presentation only. No molecular data or workspace commands. */
export interface PresentationState {
  session: string;
  generation: number;
  status: string | null;
  preview: boolean;
}

export interface PresentationReceiver {
  receive(state: PresentationState, stream: MediaStream | null): void;
}

export const presentationReady = "neistra:presentation:ready";

declare global {
  interface Window { neistraPresentation?: PresentationReceiver }
}
