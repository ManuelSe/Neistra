import { create } from "zustand";

interface EditingState {
  section: "atoms" | "bonds" | "fragments" | "residues";
  setSection: (section: EditingState["section"]) => void;
  focusRequested: boolean;
  setFocusRequested: (requested: boolean) => void;
  projectId: string | null;
  generation: number;
  open: boolean;
  pending: boolean;
  setProject: (projectId: string | null) => void;
  setOpen: (open: boolean) => void;
  setPending: (pending: boolean) => void;
}

export const useEditingStore = create<EditingState>((set) => ({
  projectId: null, generation: 0, open: false, pending: false, section: "atoms", focusRequested: false,
  setFocusRequested: focusRequested => set({ focusRequested }),
  setSection: section => set({ section }),
  setProject: projectId => set(state => state.projectId === projectId ? state : { projectId, generation: state.generation + 1, open: false, pending: false, section: "atoms", focusRequested: false }),
  setOpen: open => set({ open }),
  setPending: pending => set({ pending }),
}));
