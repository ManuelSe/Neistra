import { create } from "zustand";
import type { Selection, SelectionMode } from "../api/types";
import {
  combineSelection,
  emptySelection,
} from "../selection/selection";

interface SelectionState {
  projectId: string | null;
  selection: Selection;
  setProject: (projectId: string | null) => void;
  apply: (operand: Selection, mode?: SelectionMode) => void;
  replace: (selection: Selection) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  projectId: null,
  selection: emptySelection(),
  setProject: (projectId) =>
    set((state) =>
      state.projectId === projectId
        ? state
        : { projectId, selection: emptySelection() },
    ),
  apply: (operand, mode = "replace") =>
    set((state) => ({
      selection: combineSelection(state.selection, operand, mode),
    })),
  replace: (selection) => set({ selection }),
  clear: () => set({ selection: emptySelection() }),
}));
