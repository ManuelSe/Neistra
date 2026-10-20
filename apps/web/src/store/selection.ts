import { create } from "zustand";
import type {
  Entry,
  Selection,
  SelectionGranularity,
  SelectionMode,
} from "../api/types";
import {
  combineSelection,
  emptySelection,
} from "../selection/selection";
import { containsResidue, proteinResidueTarget, residueRange, type ResidueRangeAnchor, type SelectionStructure, type ViewerPick } from "../selection/gestures";

export interface ViewerSelectionContext {
  projectId: string;
  artifactId: string;
  source: SelectionStructure;
}

interface SelectionState {
  projectId: string | null;
  projectEpoch: number;
  rangeAnchor: ResidueRangeAnchor | null;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  setProject: (projectId: string | null) => void;
  setPickingGranularity: (granularity: SelectionGranularity) => void;
  apply: (operand: Selection, mode?: SelectionMode) => void;
  replace: (selection: Selection) => void;
  clear: () => void;
  applyViewer: (operand: Selection, mode: SelectionMode, pick: ViewerPick, context: ViewerSelectionContext) => void;
  reconcileAnchor: (entries: readonly Pick<Entry, "id" | "current_artifact_id">[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  projectId: null,
  projectEpoch: 0,
  rangeAnchor: null,
  selection: emptySelection(),
  pickingGranularity: "atom",
  setProject: (projectId) =>
    set((state) =>
      state.projectId === projectId
        ? state
        : { projectId, projectEpoch: state.projectEpoch + 1, selection: emptySelection(), rangeAnchor: null },
    ),
  apply: (operand, mode = "replace") =>
    set((state) => {
      const selection = combineSelection(state.selection, operand, mode);
      const rangeAnchor = mode !== "replace" && state.rangeAnchor && containsResidue(selection, state.rangeAnchor) ? state.rangeAnchor : null;
      return { selection, rangeAnchor };
    }),
  replace: (selection) => set({ selection, rangeAnchor: null }),
  setPickingGranularity: (pickingGranularity) => set(state => state.pickingGranularity === pickingGranularity ? state : { pickingGranularity, rangeAnchor: null }),
  clear: () => set({ selection: emptySelection(), rangeAnchor: null }),
  reconcileAnchor: entries => set(state => !state.rangeAnchor || entries.some(entry =>
    entry.id === state.rangeAnchor!.entryId && entry.current_artifact_id === state.rangeAnchor!.artifactId)
    ? state : { rangeAnchor: null }),
  applyViewer: (operand, mode, pick, context) => set(state => {
    if (state.projectId !== context.projectId) return state;
    const { source } = context;
    const target = proteinResidueTarget(pick.atoms, source);
    let anchor = state.rangeAnchor;
    if (anchor && (!containsResidue(state.selection, anchor)
      || (anchor.entryId === source.entryId && anchor.artifactId !== context.artifactId))) anchor = null;
    if (pick.shift && mode === "add" && anchor && target
      && (state.pickingGranularity === "residue" || state.pickingGranularity === "atom")) {
      const range = residueRange(anchor, target, source);
      if (range) return { selection: combineSelection(state.selection, range, "add"), rangeAnchor: anchor };
    }
    const selection = combineSelection(state.selection, operand, mode);
    const explicitResidue = !pick.shift && (state.pickingGranularity === "residue" || pick.kind === "double");
    if (explicitResidue && (mode === "replace" || mode === "toggle") && target && containsResidue(selection, target)) {
      anchor = { ...target, projectId: context.projectId, artifactId: context.artifactId };
    } else if (mode === "replace" || (anchor && !containsResidue(selection, anchor))) anchor = null;
    return { selection, rangeAnchor: anchor };
  }),
}));
