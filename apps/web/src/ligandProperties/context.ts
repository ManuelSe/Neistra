import type { Entry } from "../api/types";
import { propertySource, propertyTargetKey, type PropertyTarget } from "./session";
import type { DescriptorDefinition, DescriptorRegistry, PropertyPreferences } from "./types";

export const PROPERTY_REGISTRY_KEY = ["ligand-property-registry"] as const;
export const PROPERTY_PREFERENCES_KEY = ["ligand-property-preferences"] as const;
export const MAX_PROPERTY_SOURCE_ATOMS = 16_384;

export function propertyDefinitions(registry: DescriptorRegistry | undefined, preferences: PropertyPreferences | undefined): DescriptorDefinition[] {
  return (registry?.definitions ?? []).filter(definition => preferences?.enabled_categories.includes(definition.category))
    .sort((left, right) => left.order - right.order);
}
export function makePropertyTarget(projectId: string | null, entry: Entry | undefined, registry: DescriptorRegistry | undefined,
  preferences: PropertyPreferences | undefined, requiredDescriptorIds: readonly string[] = []): PropertyTarget | null {
  const source = propertySource(entry);
  return projectId && source && source.atom_ids.length <= MAX_PROPERTY_SOURCE_ATOMS && registry && preferences
    ? { projectId, source, originalArtifactId: entry?.original_artifact_id ?? null,
      descriptorIds: effectivePropertyDescriptors(registry, preferences, requiredDescriptorIds), registry } : null;
}
export function effectivePropertyDescriptors(registry: DescriptorRegistry, preferences: PropertyPreferences,
  requiredDescriptorIds: readonly string[] = []): string[] {
  const requested = new Set([...propertyDefinitions(registry, preferences).map(definition => definition.id), ...requiredDescriptorIds]);
  return [...registry.definitions].sort((a, b) => a.order - b.order).filter(definition => requested.has(definition.id)).map(definition => definition.id);
}
export function propertyInputKey(projectId: string | null, entry: Entry | undefined, registry: DescriptorRegistry | undefined,
  preferences: PropertyPreferences | undefined, requiredDescriptorIds: readonly string[] = []): string {
  const target = makePropertyTarget(projectId, entry, registry, preferences, requiredDescriptorIds);
  if (target) return propertyTargetKey(target);
  const designation = entry?.ligand_designation;
  return JSON.stringify(["unavailable", projectId, entry?.id, entry?.current_artifact_id, entry?.original_artifact_id,
    designation?.status, designation?.instance_id,
    designation && designation.atom_ids.length <= MAX_PROPERTY_SOURCE_ATOMS ? designation.atom_ids : designation?.atom_ids.length]);
}
