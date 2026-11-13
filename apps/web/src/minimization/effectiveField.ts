import type { QuickEffectiveComponent, QuickEffectiveField, QuickFieldOmission } from "../api/types";

export type EffectiveFieldResult = { kind: "available"; value: QuickEffectiveField }
  | { kind: "missing" } | { kind: "invalid" };
const omissions = new Set<QuickFieldOmission>(["uff_electrostatics", "unsupported_site_electrostatics",
  "coordination", "unsupported_physical_terms", "fixed_only_native_terms", "current_connectivity"]);
const methods = new Set(["MMFF94", "UFF", "geometry_repair", "fixed_geometry"]);
const maximumCanonicalAtoms = 20_000;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
function validOmissions(value: unknown): value is QuickFieldOmission[] {
  return Array.isArray(value) && value.length <= omissions.size &&
    value.every(item => omissions.has(item as QuickFieldOmission)) && new Set(value).size === value.length;
}
function validAtomIds(value: unknown): value is number[] {
  if (!Array.isArray(value) || !value.length || value.length > maximumCanonicalAtoms) return false;
  const ids: unknown[] = value;
  let previous = 0;
  for (const id of ids) {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= previous) return false;
    previous = id;
  }
  return true;
}

/** Additive job metadata is untrusted until its version and memberships validate. */
export function decodeEffectiveField(value: unknown,
  modeledAtoms?: Record<string, readonly number[]>): EffectiveFieldResult {
  if (value === undefined) return { kind: "missing" };
  if (!record(value) || !keys(value, ["schema_version", "model", "components", "omissions"]) ||
    value.schema_version !== 1 || value.model !== "quick-local-v1" ||
    !Array.isArray(value.components) || !value.components.length ||
    value.components.length > maximumCanonicalAtoms || !validOmissions(value.omissions)) {
    return { kind: "invalid" };
  }
  const identities = new Set<string>(), membership = new Map<string, Set<number>>();
  const components: QuickEffectiveComponent[] = [];
  const union = new Set<QuickFieldOmission>();
  let count = 0;
  for (const item of value.components) {
    if (!record(item) || !keys(item, ["component_id", "entry_id", "atom_ids", "method", "coverage", "omissions"]) ||
      typeof item.entry_id !== "string" || !item.entry_id.length ||
      typeof item.component_id !== "string" || identities.has(item.component_id) ||
      !validAtomIds(item.atom_ids) ||
      item.component_id !== `${item.entry_id}:${item.atom_ids[0]}` ||
      typeof item.method !== "string" || !methods.has(item.method) ||
      !["complete", "approximate"].includes(item.coverage as string) ||
      (item.method !== "MMFF94" && item.coverage !== "approximate") || !validOmissions(item.omissions) ||
      (item.coverage === "complete" && item.omissions.some(omission => omission !== "fixed_only_native_terms"))) {
      return { kind: "invalid" };
    }
    count += item.atom_ids.length;
    if (count > maximumCanonicalAtoms) return { kind: "invalid" };
    const seen = membership.get(item.entry_id) ?? new Set<number>();
    for (const id of item.atom_ids) {
      if (seen.has(id)) return { kind: "invalid" };
      seen.add(id);
    }
    membership.set(item.entry_id, seen);
    identities.add(item.component_id);
    item.omissions.forEach(omission => union.add(omission));
    components.push({ component_id: item.component_id, entry_id: item.entry_id,
      atom_ids: [...item.atom_ids], method: item.method as QuickEffectiveComponent["method"],
      coverage: item.coverage as QuickEffectiveComponent["coverage"], omissions: [...item.omissions] });
  }
  if (value.omissions.length !== union.size || !value.omissions.every(omission => union.has(omission))) {
    return { kind: "invalid" };
  }
  if (modeledAtoms !== undefined) {
    if (!record(modeledAtoms) || Object.keys(modeledAtoms).length !== membership.size) return { kind: "invalid" };
    for (const [entryId, atomIds] of Object.entries(modeledAtoms)) {
      const expected = membership.get(entryId);
      if (!expected || !Array.isArray(atomIds) || atomIds.length !== expected.size) return { kind: "invalid" };
      const ids: readonly unknown[] = atomIds;
      const seen = new Set<number>();
      for (const id of ids) {
        if (typeof id !== "number" || !expected.has(id) || seen.has(id)) return { kind: "invalid" };
        seen.add(id);
      }
    }
  }
  return { kind: "available", value: { schema_version: 1, model: "quick-local-v1",
    components, omissions: [...value.omissions] } };
}
