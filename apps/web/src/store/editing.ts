import { create } from "zustand";

interface EditingState {
  section: "atoms" | "bonds" | "fragments";
  setSection: (section: EditingState["section"]) => void;
  projectId: string | null;
  open: boolean;
  pending: boolean;
  setProject: (projectId: string | null) => void;
  setOpen: (open: boolean) => void;
  setPending: (pending: boolean) => void;
}

export const useEditingStore = create<EditingState>((set) => ({
  projectId: null, open: false, pending: false, section: "atoms",
  setSection: section => set({ section }),
  setProject: projectId => set(state => state.projectId === projectId ? state : { projectId, open: false, pending: false, section: "atoms" }),
  setOpen: open => set({ open }),
  setPending: pending => set({ pending }),
}));
