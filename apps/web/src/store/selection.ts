import { create } from "zustand";
import type {
  Selection,
  SelectionGranularity,
  SelectionMode,
} from "../api/types";
import {
  combineSelection,
  emptySelection,
} from "../selection/selection";

interface SelectionState {
  projectId: string | null;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  setProject: (projectId: string | null) => void;
  setPickingGranularity: (granularity: SelectionGranularity) => void;
  apply: (operand: Selection, mode?: SelectionMode) => void;
  replace: (selection: Selection) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  projectId: null,
  selection: emptySelection(),
  pickingGranularity: "atom",
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
  setPickingGranularity: (pickingGranularity) => set({ pickingGranularity }),
  clear: () => set({ selection: emptySelection() }),
}));
