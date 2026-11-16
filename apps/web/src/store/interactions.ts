import { create } from "zustand";
import type { InteractionAppearance, InteractionChoices, InteractionKind, InteractionResult } from "../interactions/types";
import type { InteractionTarget } from "../interactions/target";
import { defaultInteractionAppearance, normalizeInteractionAppearance } from "../interactions/styles";

const defaults = (): InteractionChoices => ({ types: [], intra: false, inter: true });
interface InteractionState {
  projectId: string | null;
  choices: InteractionChoices;
  show: boolean;
  collapsed: boolean;
  targetMode: InteractionTarget["kind"];
  selectionTarget: Extract<InteractionTarget, { kind: "selection" }> | null;
  ligandTarget: Extract<InteractionTarget, { kind: "ligand" }> | null;
  ligandLabel: string | null;
  appearance: InteractionAppearance;
  inspectedKey: string | null;
  inspectedResultKey: string | null;
  cache: { key: string; result: InteractionResult } | null;
  setProject: (id: string | null) => void;
  toggleType: (type: InteractionKind) => void;
  toggleScope: (scope: "intra" | "inter") => void;
  setShow: (show: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  setTargetMode: (mode: InteractionTarget["kind"]) => void;
  captureTarget: (target: InteractionTarget, label?: string) => void;
  setInspectedKey: (key: string | null, resultKey?: string) => void;
  changeAppearance: (kind: InteractionKind, patch: Partial<InteractionAppearance[InteractionKind]>) => void;
  resetAppearance: (kind?: InteractionKind) => void;
  publish: (projectId: string, key: string, result: InteractionResult) => void;
}
/** Session state survives disposable renderer remounts; never persisted. */
export const useInteractionStore = create<InteractionState>((set) => ({
  projectId: null, choices: defaults(), cache: null,
  show: true, collapsed: false, targetMode: "all", selectionTarget: null, ligandTarget: null, ligandLabel: null,
  appearance: defaultInteractionAppearance(), inspectedKey: null, inspectedResultKey: null,
  setProject: (projectId) => set(state => state.projectId === projectId ? state : {
    projectId, choices: defaults(), cache: null, show: true, collapsed: false,
    targetMode: "all", selectionTarget: null, ligandTarget: null, ligandLabel: null,
    appearance: defaultInteractionAppearance(), inspectedKey: null, inspectedResultKey: null,
  }),
  toggleType: (type) => set(state => ({ choices: { ...state.choices, types: state.choices.types.includes(type) ? state.choices.types.filter(item => item !== type) : [...state.choices.types, type] } })),
  toggleScope: (scope) => set(state => ({ choices: { ...state.choices, [scope]: !state.choices[scope] } })),
  setShow: (show) => set({ show }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setTargetMode: (targetMode) => set({ targetMode, inspectedKey: null, inspectedResultKey: null }),
  captureTarget: (target, label) => set({ targetMode: target.kind, inspectedKey: null, inspectedResultKey: null,
    ...(target.kind === "selection" ? { selectionTarget: structuredClone(target) } : {}),
    ...(target.kind === "ligand" ? { ligandTarget: structuredClone(target), ligandLabel: label ?? null } : {}),
  }),
  setInspectedKey: (inspectedKey, resultKey) => set({ inspectedKey, inspectedResultKey: inspectedKey ? resultKey ?? null : null }),
  changeAppearance: (kind, patch) => set(state => ({ appearance: normalizeInteractionAppearance({
    ...state.appearance, [kind]: { ...state.appearance[kind], ...patch },
  }) })),
  resetAppearance: (kind) => set(state => ({ appearance: kind
    ? { ...state.appearance, [kind]: defaultInteractionAppearance()[kind] }
    : defaultInteractionAppearance() })),
  publish: (projectId, key, result) => set(state => state.projectId === projectId
    ? { cache: { key, result }, inspectedKey: null, inspectedResultKey: null } : state),
}));
