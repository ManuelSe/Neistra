import { create } from "zustand";

export interface SequenceFocus { rowKey: string; residueId: number }
interface SequenceNavigation {
  projectId: string | null;
  focus: SequenceFocus | null;
  restoreFocus: boolean;
  scrollTop: number;
  scrollLeft: Record<string, number>;
  setProject: (projectId: string | null) => void;
  rememberFocus: (projectId: string, focus: SequenceFocus | null) => void;
  setRestoreFocus: (projectId: string, restore: boolean) => void;
  rememberScroll: (projectId: string, top: number) => void;
  rememberRowScroll: (projectId: string, rowKey: string, left: number) => void;
  reconcile: (projectId: string, rowKeys: readonly string[]) => void;
}

// Session navigation only; neither molecular payloads nor selection live here.
export const useSequenceNavigationStore = create<SequenceNavigation>(set => ({
  projectId: null, focus: null, restoreFocus: false, scrollTop: 0, scrollLeft: {},
  setProject: projectId => set(state => state.projectId === projectId ? state : {
    projectId, focus: null, restoreFocus: false, scrollTop: 0, scrollLeft: {},
  }),
  rememberFocus: (projectId, focus) => set(state => state.projectId === projectId ? { focus } : state),
  setRestoreFocus: (projectId, restoreFocus) => set(state => state.projectId === projectId ? { restoreFocus } : state),
  rememberScroll: (projectId, scrollTop) => set(state => state.projectId === projectId ? { scrollTop } : state),
  rememberRowScroll: (projectId, rowKey, left) => set(state => state.projectId === projectId
    ? { scrollLeft: { ...state.scrollLeft, [rowKey]: left } } : state),
  reconcile: (projectId, rowKeys) => set(state => {
    if (state.projectId !== projectId) return state;
    const keys = new Set(rowKeys);
    const scrollLeft = Object.fromEntries(Object.entries(state.scrollLeft).filter(([key]) => keys.has(key)));
    return Object.keys(scrollLeft).length === Object.keys(state.scrollLeft).length ? state : { scrollLeft };
  }),
}));

/** A cached project's first render can precede App's session-store transition. */
export function sequenceScroll(projectId: string, rowKey?: string): number {
  const state = useSequenceNavigationStore.getState();
  if (state.projectId !== projectId) return 0;
  return rowKey === undefined ? state.scrollTop : state.scrollLeft[rowKey] ?? 0;
}
