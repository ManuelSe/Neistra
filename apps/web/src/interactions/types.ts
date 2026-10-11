import type { AtomReference } from "../api/types";

export type InteractionKind = "clash" | "hydrogen_bond" | "hydrophobic" | "pi_pi" | "cation_pi" | "salt_bridge";
export interface InteractionRecord {
  kind: InteractionKind;
  scope: "intra" | "inter";
  participants: AtomReference[][];
  endpoints: [number, number, number][];
  geometry: Record<string, number>;
}
export interface InteractionInput { entry_id: string; artifact_id: string }
export interface InteractionResult {
  profile: "interaction-v1";
  frame: "workspace-cartesian";
  inputs: InteractionInput[];
  records: InteractionRecord[];
  coverage: Record<InteractionKind, { status: "complete" | "partial" | "unavailable"; assessed_atoms: number; skipped_atoms: number }>;
  warnings: { entry_id: string; code: string; message: string; atom_ids: number[] }[];
  candidate_comparisons: number;
}
export interface InteractionChoices { types: InteractionKind[]; intra: boolean; inter: boolean }

export const INTERACTION_LABELS: Record<InteractionKind, string> = {
  clash: "Clashes", hydrogen_bond: "H bonds", hydrophobic: "Hydrophobic",
  pi_pi: "π–π", cation_pi: "Cation–π", salt_bridge: "Salt bridges",
};
