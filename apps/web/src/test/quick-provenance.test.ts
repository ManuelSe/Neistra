import { expect, it } from "vitest";
import type { QuickEffectiveField } from "../api/types";
import { decodeEffectiveField } from "../minimization/effectiveField";

function field(): QuickEffectiveField {
  return { schema_version: 1, model: "quick-local-v1", components: [
    { component_id: "ligand:3", entry_id: "ligand", atom_ids: [3, 7, 19], method: "MMFF94",
      coverage: "approximate", omissions: ["unsupported_site_electrostatics"] },
    { component_id: "site:2", entry_id: "site", atom_ids: [2, 8], method: "geometry_repair",
      coverage: "approximate", omissions: ["unsupported_site_electrostatics", "coordination", "unsupported_physical_terms"] },
  ], omissions: ["unsupported_site_electrostatics", "coordination", "unsupported_physical_terms"] };
}
it("retains actual mixed methods with canonical sparse identities and scoped omissions", () => {
  const input = field(), result = decodeEffectiveField(input);
  expect(result).toEqual({ kind: "available", value: input });
  if (result.kind !== "available") throw new Error("Expected valid provenance");
  input.components[0].atom_ids.push(99);
  input.omissions.pop();
  expect(result.value.components[0].atom_ids).toEqual([3, 7, 19]);
  expect(result.value.omissions).toHaveLength(3);
});
it("distinguishes absent historical metadata from malformed or unsupported metadata", () => {
  expect(decodeEffectiveField(undefined)).toEqual({ kind: "missing" });
  for (const value of [null, [], "model", {}, { ...field(), schema_version: 2 }]) {
    expect(decodeEffectiveField(value)).toEqual({ kind: "invalid" });
  }
});
it.each([
  { model: "another-model" }, { components: [] }, { added: true },
  { omissions: [] }, { omissions: ["electrostatics"] },
  { omissions: [...field().omissions, "coordination"] },
])("rejects invalid top-level metadata %o", patch => {
  expect(decodeEffectiveField({ ...field(), ...patch })).toEqual({ kind: "invalid" });
});
it.each([
  { component_id: "wrong" }, { entry_id: "" }, { atom_ids: [] }, { atom_ids: [0] },
  { atom_ids: [-1] }, { atom_ids: [3, 3] }, { atom_ids: [7, 3] }, { atom_ids: [3, 3.5] },
  { atom_ids: [3, Number.MAX_SAFE_INTEGER + 1] }, { method: "initial_interpretation" },
  { coverage: "complete", method: "UFF" }, { coverage: "complete" }, { coverage: "unavailable" },
  { omissions: ["electrostatics"] }, { omissions: ["coordination", "coordination"] },
  { added: true },
])("rejects invalid component metadata %o", patch => {
  const input = field();
  expect(decodeEffectiveField({ ...input, components: [{ ...input.components[0], ...patch }, input.components[1]] }))
    .toEqual({ kind: "invalid" });
});
it("rejects duplicate components and overlapping canonical membership within one entry", () => {
  const input = field();
  expect(decodeEffectiveField({ ...input, components: [input.components[0], input.components[0]] }))
    .toEqual({ kind: "invalid" });
  expect(decodeEffectiveField({ ...input, components: [input.components[0],
    { ...input.components[0], component_id: "ligand:7", atom_ids: [7, 21] }, input.components[1]] }))
    .toEqual({ kind: "invalid" });
});
it("allows identical atom IDs in different entries and complete projected MMFF forces", () => {
  const input: QuickEffectiveField = { schema_version: 1, model: "quick-local-v1", components: [
    { component_id: "A:1", entry_id: "A", atom_ids: [1, 8], method: "MMFF94", coverage: "complete", omissions: ["fixed_only_native_terms"] },
    { component_id: "B:1", entry_id: "B", atom_ids: [1, 8], method: "fixed_geometry", coverage: "approximate", omissions: [] },
  ], omissions: ["fixed_only_native_terms"] };
  expect(decodeEffectiveField(input)).toEqual({ kind: "available", value: input });
});
it("rejects provenance exceeding the canonical local-model capacity", () => {
  const input = field();
  input.components = input.components.map(component => ({ ...component,
    component_id: `${component.entry_id}:1`, atom_ids: Array.from({ length: 10_001 }, (_, i) => i + 1) }));
  expect(decodeEffectiveField(input)).toEqual({ kind: "invalid" });
});
it("cross-checks displayed component membership against the final report without requiring report ordering", () => {
  const input = field();
  expect(decodeEffectiveField(input, { ligand: [19, 3, 7], site: [8, 2] }))
    .toEqual({ kind: "available", value: input });
  const cases: Record<string, readonly number[]>[] = [{ ligand: [3, 7, 19] },
    { ligand: [3, 7, 20], site: [2, 8] },
    { ligand: [3, 7, 19], site: [2, 2] },
    { ligand: [3, 7, 19], site: [2, 8], unrelated: [1] }];
  for (const modeled of cases) {
    expect(decodeEffectiveField(input, modeled)).toEqual({ kind: "invalid" });
  }
});
