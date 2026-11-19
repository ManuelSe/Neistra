import type { Entry } from "../api/types";
import type { PropertyTarget } from "../ligandProperties/session";
import type { DescriptorRegistry, LigandPropertyApi, PropertyAggregate, PropertyCurrent, PropertyPreferences } from "../ligandProperties/types";
import { molecularEntry, molecularProject } from "./molecular-fixtures";

export const propertyRegistry: DescriptorRegistry = {
  implementation_version: "descriptor-v1", policy_version: "policy-v1", library_version: "pinned",
  definitions: [
    { id: "heavy_atom_count", name: "Heavy atoms", description: "Atoms other than hydrogen.", category: "composition", order: 1, unit: null, value_type: "integer", method: "Observed elements", depends_on: "observed_elements" },
    { id: "molecular_weight", name: "Molecular weight", description: "Average molecular weight.", category: "composition", order: 2, unit: "g/mol", value_type: "float", method: "Average mass", depends_on: "qualified_graph" },
    { id: "tpsa", name: "Polar surface area", description: "Topological polar surface area.", category: "polarity", order: 3, unit: "Å²", value_type: "float", method: "TPSA", depends_on: "qualified_graph" },
  ].map(definition => ({ ...definition, plot_domain: [0, 1000], implementation_version: "descriptor-v1", policy_version: "policy-v1", library_version: "pinned" })) as DescriptorRegistry["definitions"],
};
export const propertyPreferences: PropertyPreferences = {
  schema_version: 1, revision: 0, enabled_categories: ["composition", "polarity"],
  default_categories: ["composition", "polarity", "lipophilicity", "flexibility"], updated_at: null,
};
export function propertyEntry(artifact = "artifact-a"): Entry {
  const entry = molecularEntry("entry-a", "Ethanol", "ligand");
  entry.current_artifact_id = artifact;
  entry.ligand_designation = { ...entry.ligand_designation, status: "resolved", instance_id: "00000000-0000-4000-8000-000000000001",
    atom_ids: [1, 2, 3], origin: "manual", selected_at: "2026-11-17T00:00:00Z", source_artifact_id: artifact };
  return entry;
}
export const propertyProject = () => molecularProject([propertyEntry()]);
export function propertyTarget(artifact = "artifact-a"): PropertyTarget {
  return { projectId: "project-1", source: { entry_id: "entry-a", source_artifact_id: artifact,
    instance_id: "00000000-0000-4000-8000-000000000001", atom_ids: [1, 2, 3] },
  originalArtifactId: "original-a", descriptorIds: propertyRegistry.definitions.map(definition => definition.id), registry: propertyRegistry };
}
export function fullCoverageTarget(): PropertyTarget {
  const target = propertyTarget();
  const keys = ["molecular_weight", "heavy_atom_count", "heteroatom_count", "carbon_count", "formal_charge", "hbd", "hba",
    "tpsa", "calculated_logp", "molar_refractivity", "rotatable_bond_count", "ring_count", "aromatic_ring_count", "fraction_sp3"];
  const integerKeys = new Set(["heavy_atom_count", "heteroatom_count", "carbon_count", "formal_charge", "hbd", "hba",
    "rotatable_bond_count", "ring_count", "aromatic_ring_count"]);
  target.registry = { ...propertyRegistry, definitions: keys.map((id, order) => ({ ...propertyRegistry.definitions[1],
    ...propertyRegistry.definitions.find(definition => definition.id === id), id, order,
    value_type: integerKeys.has(id) ? "integer" : "float" })) };
  target.descriptorIds = keys;
  return target;
}
export function propertyResult(target = propertyTarget(), status: PropertyCurrent["status"] = "ready"): PropertyAggregate {
  return { project_id: target.projectId, entries: [{ source: target.source, binding_key: `binding-${target.source.source_artifact_id}`,
    status, reason: status === "unavailable" ? "unsupported_source" : null, progress: status === "ready" ? 100 : 0,
    report: status === "ready" ? { schema_version: 1, input_hash: "a".repeat(64), implementation_version: target.registry.implementation_version,
      policy_version: target.registry.policy_version, library_version: target.registry.library_version, created_at: "2026-11-17T00:00:00Z", model_status: "qualified", model_reason: null,
      contains_formally_charged_atoms: false, coverage: [...target.descriptorIds], provenance: ["source_qualified"],
      values: target.descriptorIds.map(id => ({ descriptor_id: id, status: "ready", reason: null,
        value: id === "heavy_atom_count" ? 3 : id === "tpsa" ? 20.23 : target.registry.definitions.find(definition => definition.id === id)?.value_type === "integer" ? 1 : 46.069 })) } : null }] };
}
export function propertyAllocation(projectId = "project-1", consumerId = "test-consumer"): PropertyAggregate {
  return { project_id: projectId, entries: [], consumer_id: consumerId, sequence: 0, expires_at: "2099-01-01T00:00:00Z" };
}
export function pendingPropertySubset(target = propertyTarget(), coverage = ["heavy_atom_count", "molecular_weight"]): PropertyAggregate {
  const response = propertyResult(target);
  const current = response.entries[0];
  current.status = "pending"; current.progress = 25;
  current.report!.coverage = coverage;
  current.report!.values = current.report!.values.filter(value => coverage.includes(value.descriptor_id));
  return response;
}
export function deferredProperty<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export type PropertyApi = LigandPropertyApi;
