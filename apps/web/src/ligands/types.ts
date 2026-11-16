import type { Artifact, Entry, Project } from "../api/types";

export interface LigandDesignation {
  schema_version: 1;
  status: "unresolved" | "selection_required" | "not_applicable" | "cleared" | "resolved" | "stale";
  source_artifact_id: string | null;
  instance_id: string | null;
  atom_ids: number[];
  origin: "automatic_single_candidate" | "manual" | null;
  selected_at: string | null;
  reason_code: string | null;
  resolver_version: string | null;
  assessed_at: string | null;
  assessed_revision: number | null;
}
export interface LigandLocation {
  residue_id: number;
  residue_name: string;
  chain_id: number | null;
  chain_name: string | null;
  author_number: number | null;
  insertion_code: string | null;
  source_entity_id: string | null;
  source_asym_id: string | null;
}
export interface LigandCandidate {
  candidate_key: string;
  atom_ids: number[];
  residue_ids: number[];
  component_ids: string[];
  label: string;
  locations: LigandLocation[];
  boundary_status: "qualified" | "source_instance" | "unsupported" | "ineligible";
  potential_ligand: boolean;
  reason_codes: string[];
  provenance: string[];
  heavy_atom_count: number | null;
  formal_charge: number | null;
  formula: string | null;
  molecular_weight: number | null;
  chemistry_status: "qualified" | "unavailable";
  chemistry_reason: string | null;
  chemical_input_hash: string | null;
}
export interface LigandCandidatesRead {
  project_id: string;
  entry_id: string;
  artifact_id: string | null;
  designation: LigandDesignation;
  input_hash: string;
  resolver_version: string;
  total: number;
  offset: number;
  limit: number;
  candidates: LigandCandidate[];
  selectable_candidate_keys: string[];
  designated_candidate: LigandCandidate | null;
  warnings: string[];
}
export interface LigandDepictionRead {
  entry_id: string;
  artifact_id: string | null;
  candidate_key: string;
  status: "ready" | "unavailable" | "busy";
  reason: string | null;
  input_hash: string | null;
  cache_key: string | null;
  artifact: Artifact | null;
  implementation: string;
  library_version: string;
  formula: string | null;
  molecular_weight: number | null;
  formal_charge: number | null;
  provenance: string | null;
}
export interface LigandDesignationCommand {
  expected_revision: number;
  expected_artifact_id: string | null;
  candidate_key?: string;
  expected_input_hash?: string;
  clear?: boolean;
}
export interface LigandApi {
  candidates(projectId: string, entry: Entry, offset: number, signal: AbortSignal): Promise<LigandCandidatesRead>;
  depiction(projectId: string, entry: Entry, candidateKey: string, signal: AbortSignal): Promise<LigandDepictionRead>;
  designate(projectId: string, entryId: string, command: LigandDesignationCommand): Promise<Project>;
  resolve(projectId: string, revision: number, entryIds: string[]): Promise<Project>;
}

export const unresolvedLigandDesignation = (): LigandDesignation => ({
  schema_version: 1, status: "unresolved", source_artifact_id: null, instance_id: null,
  atom_ids: [], origin: null, selected_at: null, reason_code: null,
  resolver_version: null, assessed_at: null, assessed_revision: null,
});
