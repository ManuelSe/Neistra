import { describe, expect, it } from "vitest";
import type { AtomReference, MolecularAtom, MolecularBond, Selection, StructureProjection } from "../api/types";
import { resolveHydrogenTargets } from "../selection/hydrogenTargets";
import { componentHierarchy, proteinStructure } from "./molecular-fixtures";

function atom(id: number, element: string, x = 0): MolecularAtom {
  return { id, name: `${element}${id}`, element, coordinates: [x, 0, 0], residue_id: null,
    formal_charge: null, source_index: id, alternate_location: null, occupancy: 1,
    b_factor: null, inferred_fields: [] };
}
function bond(id: number, a: number, b: number, options: Partial<MolecularBond> = {}): MolecularBond {
  return { id, atom_1_id: a, atom_2_id: b, order: 1, aromatic: false, stereo: null, inferred: false, ...options };
}
function projection(id: string, atoms: MolecularAtom[], bonds: MolecularBond[]): StructureProjection {
  const structure = { ...proteinStructure(), title: id, atoms, bonds, chains: [], residues: [] };
  return { entry_id: id, structure, hierarchy: componentHierarchy(structure), viewer: { format: "mmcif", data: "preserved viewer source" } };
}
const refs = (entry: string, ...ids: number[]): AtomReference[] => ids.map(atom_id => ({ structure_id: entry, atom_id }));
function seed(atoms: AtomReference[]): Selection {
  return { schema_version: 1, atoms, granularity: "structure", source: "viewer" };
}

describe("graph-attached hydrogen targets", () => {
  it("unites explicit H with C-H and O-H neighbors, preserving entry-local sparse IDs and canonical order", () => {
    const sources = new Map([
      ["z-entry", projection("z-entry", [atom(800, "H"), atom(40, "C"), atom(7, "H"), atom(90, "O"), atom(301, "H"), atom(2000, "H")],
        [bond(1, 40, 800), bond(2, 301, 90), bond(3, 90, 2000)])],
      ["a-entry", projection("a-entry", [atom(40, "N"), atom(800, "H"), atom(9, "C"), atom(300, "H")],
        [bond(1, 800, 40), bond(2, 9, 300)])],
    ]);
    const result = resolveHydrogenTargets(seed([
      ...refs("z-entry", 90, 7, 40, 800, 40), ...refs("a-entry", 40),
    ]), sources);
    expect(result).toEqual({ schema_version: 1, granularity: "atom", source: "inspector", atoms: [
      ...refs("a-entry", 800), ...refs("z-entry", 7, 301, 800, 2000),
    ] });
  });

  it("uses recorded adjacency regardless of distance, order or inference and excludes nearby unbonded H", () => {
    const source = projection("entry", [atom(10, "C"), atom(20, "H", 1000), atom(30, "H", 0.01), atom(40, "H", -2000)],
      [bond(1, 20, 10, { order: null }), bond(2, 10, 40, { order: 2, inferred: true })]);
    const sources = new Map([["entry", source]]);
    expect(resolveHydrogenTargets(seed(refs("entry", 10)), sources).atoms).toEqual(refs("entry", 20, 40));
    const removed = structuredClone(source);
    removed.structure.bonds = [removed.structure.bonds[1]];
    expect(resolveHydrogenTargets(seed(refs("entry", 10)), new Map([["entry", removed]])).atoms).toEqual(refs("entry", 40));
  });

  it("deduplicates a bridging H without recursively propagating through H-H or heavy-heavy edges", () => {
    const source = projection("entry", [atom(10, "C"), atom(20, "N"), atom(30, "H"), atom(40, "H"), atom(50, "C"), atom(60, "H")],
      [bond(1, 10, 30), bond(2, 30, 20), bond(3, 30, 40), bond(4, 10, 50), bond(5, 50, 60)]);
    const sources = new Map([["entry", source]]);
    expect(resolveHydrogenTargets(seed(refs("entry", 10, 20, 30)), sources).atoms).toEqual(refs("entry", 30));
    expect(resolveHydrogenTargets(seed(refs("entry", 30)), sources).atoms).toEqual(refs("entry", 30));
  });

  it("preserves current H/D/T handling and isotope metadata without interpreting it as polarity", () => {
    const source = projection("entry", [atom(10, "C"), atom(20, "D"), atom(30, "T"), atom(40, "H"), atom(50, "H"), atom(60, "H"), atom(70, " h ")],
      [bond(1, 10, 20), bond(2, 10, 30), bond(3, 10, 40), bond(4, 20, 50), bond(5, 30, 60), bond(6, 70, 10)]);
    source.structure.metadata = { isotope_records: [{ atom_id: 40, isotope: 2 }], retained_provenance: "supplied" };
    source.structure.annotations = [{ kind: "hydrogen_protection", atom_ids: [40], isotope: 2 }];
    const before = structuredClone(source);
    expect(resolveHydrogenTargets(seed(refs("entry", 10, 20, 30)), new Map([["entry", source]])).atoms).toEqual(refs("entry", 40, 70));
    expect(resolveHydrogenTargets(seed(refs("entry", 20, 30)), new Map([["entry", source]])).atoms).toEqual([]);
    expect(source).toEqual(before);
  });

  it("retains explicitly selected isolated H and returns no target for heavy atoms without existing bonded H", () => {
    const source = projection("entry", [atom(10, "C"), atom(20, "O"), atom(30, "H")], []);
    const sources = new Map([["entry", source]]);
    expect(resolveHydrogenTargets(seed(refs("entry", 10, 20)), sources).atoms).toEqual([]);
    expect(resolveHydrogenTargets(seed(refs("entry", 30)), sources).atoms).toEqual(refs("entry", 30));
    expect(resolveHydrogenTargets(seed([]), sources)).toEqual({ schema_version: 1, granularity: "atom", source: "inspector", atoms: [] });
  });

  it("refuses unavailable, mismatched or stale participating sources instead of partially applying", () => {
    const source = projection("entry", [atom(10, "C"), atom(20, "H")], [bond(1, 10, 20)]);
    expect(() => resolveHydrogenTargets(seed([...refs("entry", 10), ...refs("missing", 10)]), new Map([["entry", source]])))
      .toThrow("Selected structure data is unavailable");
    expect(() => resolveHydrogenTargets(seed(refs("entry", 10)), new Map([["entry", { ...source, entry_id: "other" }]])))
      .toThrow("Selected structure data is unavailable");
    expect(() => resolveHydrogenTargets(seed(refs("entry", 10, 999)), new Map([["entry", source]])))
      .toThrow("Selected atoms are no longer present");
  });

  it("does not inspect unselected entries or mutate seed, graph, coordinates, conformers or warning metadata", () => {
    const source = projection("selected", [atom(30, "H", 7), atom(10, "C", 1)], [bond(800, 10, 30, { inferred: true, order: null })]);
    source.structure.conformers = [{ id: 12, name: "inactive", coordinates: [[70, 0, 0], [10, 0, 0]] }];
    source.structure.active_conformer_id = 2;
    source.structure.metadata = { source: "immutable", isotope_records: [{ atom_id: 30, isotope: 1 }] };
    source.structure.warnings = [{ code: "retained_warning", severity: "warning", message: "Keep source diagnostics",
      operation: "import", field: "bonds", blocking: false }];
    const unused = projection("unused", [], []);
    Object.defineProperty(unused, "structure", { get: () => { throw new Error("Unselected structure was inspected"); } });
    const selected = seed(refs("selected", 10, 30, 10));
    const beforeSource = structuredClone(source), beforeSeed = structuredClone(selected);
    expect(resolveHydrogenTargets(selected, new Map([["unused", unused], ["selected", source]])).atoms).toEqual(refs("selected", 30));
    expect(source).toEqual(beforeSource);
    expect(selected).toEqual(beforeSeed);
  });
});
