import { create } from "zustand";
import type {
  Entry,
  Selection,
  SelectionGranularity,
  SelectionMode,
} from "../api/types";
import {
  combineSelection,
  canonicalSelection,
  emptySelection,
} from "../selection/selection";
import { containsResidue, gestureIndex, proteinResidueTarget, residueRange, type ResidueRangeAnchor, type ResidueSelectionRequest, type ResidueTarget, type SelectionStructure, type ViewerPick } from "../selection/gestures";

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
  applyResidue: (request: ResidueSelectionRequest, context: ViewerSelectionContext) => void;
  reconcileAnchor: (entries: readonly Pick<Entry, "id" | "current_artifact_id">[]) => void;
}

function residueTransition(state: SelectionState, operand: Selection, mode: SelectionMode,
  context: ViewerSelectionContext, target: ResidueTarget | null, shift: boolean,
  allowRange: boolean, explicitResidue: boolean) {
  let anchor = state.rangeAnchor;
  if (anchor && (!containsResidue(state.selection, anchor)
    || (anchor.entryId === context.source.entryId && anchor.artifactId !== context.artifactId))) anchor = null;
  if (shift && mode === "add" && allowRange && anchor && target) {
    const range = residueRange(anchor, target, context.source, operand.source);
    if (range) return { selection: combineSelection(state.selection, range, "add"), rangeAnchor: anchor };
  }
  const selection = combineSelection(state.selection, operand, mode);
  if (!shift && explicitResidue && (mode === "replace" || mode === "toggle") && target && containsResidue(selection, target)) {
    anchor = { ...target, projectId: context.projectId, artifactId: context.artifactId };
  } else if (mode === "replace" || (anchor && !containsResidue(selection, anchor))) anchor = null;
  return { selection, rangeAnchor: anchor };
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
    return residueTransition(state, operand, mode, context, proteinResidueTarget(pick.atoms, context.source), pick.shift,
      state.pickingGranularity === "residue" || state.pickingGranularity === "atom",
      state.pickingGranularity === "residue" || pick.kind === "double");
  }),
  applyResidue: (request, context) => set(state => {
    if (state.projectId !== request.projectId || state.projectEpoch !== request.projectEpoch
      || context.projectId !== request.projectId || context.artifactId !== request.artifactId
      || context.source.entryId !== request.entryId) return state;
    const membership = gestureIndex(context.source).proteinResidues.get(request.residueId);
    if (!membership) return state;
    const target = { ...membership, entryId: request.entryId };
    const operand = canonicalSelection(target.atomIds.map(atom_id => ({ structure_id: request.entryId, atom_id })), "residue", request.source);
    return residueTransition(state, operand, request.mode, context, target, request.shift, true, true);
  }),
}));
