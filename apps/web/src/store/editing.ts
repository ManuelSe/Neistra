import type { HydrogenPolicy, ModelPlacementAction, ModelPreview, Selection } from "../api/types";
import { create } from "zustand";

export interface PlacementDraft {
  context: string;
  action: ModelPlacementAction;
  result?: ModelPreview;
  error?: string;
}

interface EditingState {
  launcherFocusRequested: boolean;
  setLauncherFocusRequested: (requested: boolean) => void;
  inspectingPlacement: boolean;
  setInspectingPlacement: (inspecting: boolean) => void;
  atomDraft: { element: string; charge: string; unknown: boolean };
  setAtomDraft: (patch: Partial<EditingState["atomDraft"]>) => void;
  targetEntryId: string | null;
  setTargetEntryId: (entryId: string | null) => void;
  hydrogenPolicy: HydrogenPolicy;
  setHydrogenPolicy: (policy: HydrogenPolicy) => void;
  placement: PlacementDraft | null;
  setPlacement: (draft: PlacementDraft | null) => void;
  focusNewMolecule: { entryId: string; atomId: number; selection: Selection } | null;
  setFocusNewMolecule: (focus: EditingState["focusNewMolecule"]) => void;
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
  launcherFocusRequested: false, setLauncherFocusRequested: launcherFocusRequested => set({ launcherFocusRequested }),
  inspectingPlacement: false, setInspectingPlacement: inspectingPlacement => set({ inspectingPlacement }),
  atomDraft: { element: "C", charge: "0", unknown: false },
  setAtomDraft: patch => set(state => ({ atomDraft: { ...state.atomDraft, ...patch }, placement: null })),
  targetEntryId: null, setTargetEntryId: targetEntryId => set({ targetEntryId, placement: null }),
  hydrogenPolicy: "preserve", setHydrogenPolicy: hydrogenPolicy => set({ hydrogenPolicy, placement: null }),
  placement: null, setPlacement: placement => set(state => ({ placement, inspectingPlacement: placement ? state.inspectingPlacement : false })),
  focusNewMolecule: null, setFocusNewMolecule: focusNewMolecule => set({ focusNewMolecule }),
  projectId: null, generation: 0, open: false, pending: false, section: "atoms", focusRequested: false,
  setFocusRequested: focusRequested => set({ focusRequested }),
  setSection: section => set({ section, placement: null }),
  setProject: projectId => set(state => state.projectId === projectId ? state : { projectId, generation: state.generation + 1, open: false, pending: false, section: "atoms", focusRequested: false, launcherFocusRequested: false, targetEntryId: null, hydrogenPolicy: "preserve", placement: null, inspectingPlacement: false, focusNewMolecule: null, atomDraft: { element: "C", charge: "0", unknown: false } }),
  setOpen: open => set(state => ({ open, placement: open ? state.placement : null })),
  setPending: pending => set({ pending }),
}));
