import type { ArtifactSourceIdentity } from "../api/types";

export type DescriptorCategory = "composition" | "polarity" | "lipophilicity" | "flexibility";
export interface DescriptorDefinition {
  id: string; name: string; description: string; category: DescriptorCategory; order: number;
  unit: string | null; value_type: "integer" | "float"; method: string;
  implementation_version: string; library_version: string; policy_version: string;
  plot_domain: [number, number]; depends_on: string;
}
export interface DescriptorRegistry {
  definitions: DescriptorDefinition[]; implementation_version: string;
  policy_version: string; library_version: string;
}
export interface DescriptorValue {
  descriptor_id: string; status: "ready" | "unavailable" | "error";
  value: number | null; reason: string | null;
}
export interface DescriptorReport {
  schema_version: 1; input_hash: string; implementation_version: string; library_version: string;
  policy_version: string; created_at: string; model_status: "qualified" | "unavailable";
  model_reason: string | null; provenance: string[]; contains_formally_charged_atoms: boolean | null;
  coverage: string[]; values: DescriptorValue[];
}
export interface PropertyPreferences {
  schema_version: 1; revision: number; enabled_categories: DescriptorCategory[];
  default_categories: DescriptorCategory[]; updated_at: string | null;
}
export interface PropertySource {
  entry_id: string; source_artifact_id: string; instance_id: string; atom_ids: number[];
}
export interface PropertySourceFailure {
  source_identity: ArtifactSourceIdentity; source_verification: "current" | "original";
  reason: "artifact_unavailable";
}
export interface PropertyCurrent {
  source: PropertySource; binding_key: string; status: "pending" | "ready" | "unavailable" | "cancelled" | "failed";
  report: DescriptorReport | null; reason: string | null; progress: number;
  source_failure?: PropertySourceFailure | null;
}
export interface PropertyAggregate {
  project_id: string; entries: PropertyCurrent[];
  consumer_id?: string | null; sequence?: number | null; expires_at?: string | null;
}
export interface PropertyRequest { entries: PropertySource[]; descriptor_ids: string[] }
export interface PropertyDemand extends PropertyRequest { sequence: number; active_entry_id: string | null }
export interface LigandPropertyApi {
  registry: (signal?: AbortSignal) => Promise<DescriptorRegistry>;
  preferences: (signal?: AbortSignal) => Promise<PropertyPreferences>;
  savePreferences: (expectedRevision: number, categories: DescriptorCategory[]) => Promise<PropertyPreferences>;
  allocate: (projectId: string) => Promise<PropertyAggregate>;
  read: (projectId: string, body: PropertyRequest, signal?: AbortSignal) => Promise<PropertyAggregate>;
  demand: (projectId: string, consumerId: string, body: PropertyDemand, signal?: AbortSignal) => Promise<PropertyAggregate>;
  release: (projectId: string, consumerId: string, sequence: number) => Promise<unknown>;
}
