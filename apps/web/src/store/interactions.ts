import { create } from "zustand";
import type { InteractionChoices, InteractionKind, InteractionResult } from "../interactions/types";

const defaults = (): InteractionChoices => ({ types: [], intra: false, inter: true });
interface InteractionState {
  projectId: string | null;
  choices: InteractionChoices;
  cache: { key: string; result: InteractionResult } | null;
  setProject: (id: string | null) => void;
  toggleType: (type: InteractionKind) => void;
  toggleScope: (scope: "intra" | "inter") => void;
  publish: (projectId: string, key: string, result: InteractionResult) => void;
}
/** Session state survives disposable renderer remounts; never persisted. */
export const useInteractionStore = create<InteractionState>((set) => ({
  projectId: null, choices: defaults(), cache: null,
  setProject: (projectId) => set(state => state.projectId === projectId ? state : { projectId, choices: defaults(), cache: null }),
  toggleType: (type) => set(state => ({ choices: { ...state.choices, types: state.choices.types.includes(type) ? state.choices.types.filter(item => item !== type) : [...state.choices.types, type] } })),
  toggleScope: (scope) => set(state => ({ choices: { ...state.choices, [scope]: !state.choices[scope] } })),
  publish: (projectId, key, result) => set(state => state.projectId === projectId ? { cache: { key, result } } : state),
}));
