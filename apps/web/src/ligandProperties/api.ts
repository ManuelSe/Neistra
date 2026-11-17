import { apiRequest } from "../api/client";
import type { DescriptorCategory, DescriptorRegistry, LigandPropertyApi, PropertyPreferences } from "./types";

const path = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}/ligand-properties`;
const categoryNames = new Set<DescriptorCategory>(["composition", "polarity", "lipophilicity", "flexibility"]);
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function categories(value: unknown): value is DescriptorCategory[] {
  return Array.isArray(value) && value.length <= 4 && new Set(value).size === value.length
    && value.every((item: unknown) => typeof item === "string" && categoryNames.has(item as DescriptorCategory));
}
function registry(value: unknown): DescriptorRegistry {
  if (!record(value) || !text(value.implementation_version) || !text(value.policy_version) || !text(value.library_version)
    || !Array.isArray(value.definitions) || value.definitions.length === 0 || value.definitions.length > 14 || !value.definitions.every((definition: unknown) => {
      if (!record(definition)) return false;
      return ["id", "name", "description", "method", "implementation_version", "policy_version", "library_version"].every(key => text(definition[key]))
        && typeof definition.category === "string" && categoryNames.has(definition.category as DescriptorCategory)
        && definition.implementation_version === value.implementation_version && definition.policy_version === value.policy_version
        && definition.library_version === value.library_version
        && Number.isSafeInteger(definition.order) && (definition.order as number) >= 0
        && (definition.unit === null || typeof definition.unit === "string") && ["integer", "float"].includes(String(definition.value_type))
        && ["qualified_graph", "observed_elements", "qualified_atomic_charge"].includes(String(definition.depends_on))
        && Array.isArray(definition.plot_domain) && definition.plot_domain.length === 2
        && definition.plot_domain.every((number: unknown) => typeof number === "number" && Number.isFinite(number))
        && definition.plot_domain[0] < definition.plot_domain[1];
    }) || new Set(value.definitions.map((definition: unknown) => (definition as Record<string, unknown>).id)).size !== value.definitions.length) {
    throw new Error("Property definitions could not be qualified.");
  }
  return value as unknown as DescriptorRegistry;
}
function preferences(value: unknown): PropertyPreferences {
  if (!record(value) || value.schema_version !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || !categories(value.enabled_categories) || !categories(value.default_categories)
    || (value.updated_at !== null && (typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))))) {
    throw new Error("Property options could not be qualified.");
  }
  return value as unknown as PropertyPreferences;
}
export const ligandPropertyApi: LigandPropertyApi = {
  registry: async signal => registry(await apiRequest<unknown>("/api/v1/ligand-properties/registry", { signal })),
  preferences: async signal => preferences(await apiRequest<unknown>("/api/v1/workspace/ligand-property-preferences", { signal })),
  savePreferences: async (expectedRevision, categories) => preferences(await apiRequest<unknown>("/api/v1/workspace/ligand-property-preferences", {
    method: "PUT", body: JSON.stringify({ expected_revision: expectedRevision, enabled_categories: categories }),
  })),
  allocate: projectId => apiRequest(`${path(projectId)}/consumers`, { method: "POST" }),
  read: (projectId, body, signal) => apiRequest(`${path(projectId)}/read`, { method: "POST", body: JSON.stringify(body), signal }),
  demand: (projectId, consumerId, body, signal) => apiRequest(`${path(projectId)}/consumers/${encodeURIComponent(consumerId)}`, {
    method: "PUT", body: JSON.stringify(body), signal,
  }),
  release: (projectId, consumerId, sequence) => apiRequest(`${path(projectId)}/consumers/${encodeURIComponent(consumerId)}?sequence=${sequence}`, { method: "DELETE" }),
};
