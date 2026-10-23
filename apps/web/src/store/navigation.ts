import { create } from "zustand";
import type { ComponentCategory } from "../api/types";

export interface EntryBrowsingState {
  categories: ComponentCategory[];
  proteins: string[];
  scrollTop: number;
}

interface NavigationState {
  projectId: string | null;
  inspectedEntryId: string | null;
  entries: Record<string, EntryBrowsingState>;
  tab: "entries" | "components";
  setProject: (id: string | null) => void;
  reconcile: (projectId: string, entryIds: string[]) => void;
  inspect: (projectId: string, entryId: string, showComponents?: boolean) => void;
  setTab: (tab: "entries" | "components") => void;
  updateEntry: (projectId: string, entryId: string, update: Partial<EntryBrowsingState>) => void;
}

export const emptyBrowsingState: EntryBrowsingState = { categories: [], proteins: [], scrollTop: 0 };

// Navigation is session state. Molecular structures remain in TanStack Query.
export const useNavigationStore = create<NavigationState>((set) => ({
  projectId: null, inspectedEntryId: null, entries: {}, tab: "entries",
  setProject: projectId => set(state => state.projectId === projectId ? state : {
    projectId, inspectedEntryId: null, entries: {}, tab: "entries",
  }),
  reconcile: (projectId, entryIds) => set(state => {
    if (state.projectId !== projectId) return state;
    const ids = new Set(entryIds);
    const inspectedEntryId = state.inspectedEntryId && ids.has(state.inspectedEntryId)
      ? state.inspectedEntryId : null;
    const entries = Object.fromEntries(Object.entries(state.entries).filter(([id]) => ids.has(id)));
    return inspectedEntryId === state.inspectedEntryId && Object.keys(entries).length === Object.keys(state.entries).length
      ? state : { inspectedEntryId, entries };
  }),
  inspect: (projectId, inspectedEntryId, showComponents = false) => set(state => ({
    projectId, inspectedEntryId,
    entries: state.projectId === projectId ? state.entries : {},
    tab: showComponents ? "components" : state.projectId === projectId ? state.tab : "entries",
  })),
  setTab: tab => set({ tab }),
  updateEntry: (projectId, entryId, update) => set(state => state.projectId !== projectId ? state : {
    entries: { ...state.entries, [entryId]: { ...(state.entries[entryId] ?? emptyBrowsingState), ...update } },
  }),
}));
