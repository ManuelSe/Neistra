import { describe, expect, it } from "vitest";
import { resolvePocketInputs } from "../selection/pocketInputs";
import { molecularEntry, proteinProjection } from "./molecular-fixtures";

describe("application pocket inputs", () => {
  const receptor = molecularEntry("receptor", "Protein", "protein");
  const seed = { ...molecularEntry("seed", "Hidden seed", "ligand"), visible: false };
  receptor.viewer_settings.selection_pocket_surface = {
    profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: seed.id, atom_id: 1 }],
  };
  const inputs = () => new Map([receptor, seed].map((entry) => [entry.id, { current: true, data: proteinProjection() }]));
  it("resolves hidden seed coordinates without mutating molecular state", () => {
    const source = inputs(), before = JSON.stringify(source.get(seed.id));
    const value = resolvePocketInputs([receptor, seed], source).get(receptor.id)!;
    expect(value.unavailable).toBeUndefined();
    expect(value.seeds[0].coordinates).toEqual(source.get(seed.id)!.data.structure.atoms[0].coordinates);
    value.seeds[0].coordinates[0] = 100;
    expect(JSON.stringify(source.get(seed.id))).toBe(before);
    expect(seed.visible).toBe(false);
  });
  it("rejects obsolete placeholders and missing seeds and changes key with artifact readiness", () => {
    const source = inputs();
    const current = resolvePocketInputs([receptor, seed], source).get(receptor.id)!;
    source.get(seed.id)!.current = false;
    const pending = resolvePocketInputs([receptor, seed], source).get(receptor.id)!;
    expect(pending.unavailable).toMatch(/Loading/); expect(pending.seeds).toEqual([]);
    expect(pending.dependencyKey).not.toBe(current.dependencyKey);
    expect(resolvePocketInputs([receptor], source).get(receptor.id)!.unavailable).toMatch(/unavailable/);
    const changed = { ...seed, current_artifact_id: "new-artifact" };
    source.get(seed.id)!.current = true;
    expect(resolvePocketInputs([receptor, changed], source).get(receptor.id)!.dependencyKey).not.toBe(current.dependencyKey);
  });
  it("keeps keys stable for visibility and appearance changes", () => {
    const source = inputs();
    const before = resolvePocketInputs([receptor, seed], source).get(receptor.id)!;
    const changed = structuredClone(receptor);
    changed.viewer_settings.selection_hidden_atoms = [1, 2];
    changed.viewer_settings.selection_colors = [{ atom_ids: [1], color: "#ff0000" }];
    changed.viewer_settings.components.hydrogens = false;
    expect(resolvePocketInputs([changed, { ...seed, visible: true }], source).get(receptor.id)).toEqual(before);
  });
});


it("does not resolve an invisible owner's unrelated pocket dependencies", () => {
  const owner = molecularEntry("hidden", "Hidden receptor", "protein");
  owner.visible = false;
  owner.viewer_settings.selection_pocket_surface = { profile: "pocket-v1", radius: 5,
    seed_atom_references: [{ structure_id: "unloaded", atom_id: 1 }] };
  expect(resolvePocketInputs([owner], new Map()).size).toBe(0);
});
