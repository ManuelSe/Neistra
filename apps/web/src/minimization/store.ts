import type { CalculationSource } from "./context";
import { create } from "zustand";
import type { Project, Selection } from "../api/types";

export interface MinimizationDraft {
  project: Project;
  selection: Selection;
  sources: ReadonlyMap<string, CalculationSource>;
  mode: "isolated" | "environment" | "automatic";
  included: ReadonlySet<string>;
  iterations: number;
  loadedAll: boolean;
  strict: boolean;
  expandHydrogens: boolean;
  allowRepair: boolean;
}
export type MinimizationProfile = "quick" | "amber";
interface Presentation {
  profile: MinimizationProfile;
  autoApply: boolean;
  applied: boolean;
  open: boolean;
  draft: MinimizationDraft | null;
  jobId: string | null;
  loading: boolean;
  preview: boolean;
  live: boolean;
  applying: boolean;
  error: string | null;
}
interface MinimizationState extends Presentation {
  projectId: string | null;
  generation: number;
  setProject: (id: string | null) => void;
  begin: (project: Project, selection: Selection, profile?: MinimizationProfile, open?: boolean) => number;
  inspect: (projectId: string, jobId: string) => void;
  dismiss: () => void;
  patch: (generation: number, patch: Partial<Presentation>) => void;
}
const empty: Presentation = { profile: "amber", autoApply: false, applied: false, open: false, draft: null, jobId: null, loading: false, preview: false, live: false, applying: false, error: null };
export const useMinimizationStore = create<MinimizationState>((set, get) => ({
  ...empty, projectId: null, generation: 0,
  setProject: id => set(state => state.projectId === id ? state : { ...empty, projectId: id, generation: state.generation + 1 }),
  begin: (project, selection, profile = "amber", open = true) => {
    const generation = get().generation + 1;
    set({ ...empty, profile, autoApply: profile === "quick", projectId: project.id, generation, open, loading: true, live: true, preview: true,
      draft: { project, selection: { ...selection, atoms: selection.atoms.map(a => ({ ...a })) }, sources: new Map(), mode: "automatic", included: new Set(), iterations: 500, loadedAll: false, strict: false, expandHydrogens: true, allowRepair: true } });
    return generation;
  },
  inspect: (projectId, jobId) => set(state => ({ ...empty, projectId, jobId, open: true, generation: state.generation + 1 })),
  dismiss: () => set(state => ({ ...empty, generation: state.generation + 1 })),
  patch: (generation, patch) => set(state => state.generation === generation ? patch : state),
}));
