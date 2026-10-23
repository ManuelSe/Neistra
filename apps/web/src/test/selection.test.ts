import { describe, expect, it } from "vitest";
import type { AtomReference } from "../api/types";
import {
  canonicalSelection,
  combineSelection,
  expandSelection,
  invertSelection,
  predicateSelection,
  selectionSummary,
  selectionMode,
  structureSelection,
} from "../selection/selection";
import { computeSpatialSelection } from "../selection/spatial";
import { proteinStructure } from "./molecular-fixtures";

const references = (...atomIds: number[]): AtomReference[] =>
  atomIds.map((atom_id) => ({ structure_id: "protein", atom_id }));

describe("central selection algebra", () => {
  const structure = proteinStructure();
  const structures = new Map([["protein", structure]]);

  it.each(["atom", "residue", "chain", "structure"] as const)("toggles whole %s operands and preserves unrelated references", granularity => {
    const unrelated = { structure_id: "another", atom_id: 7 };
    const operand = canonicalSelection(references(1, 3), granularity, "viewer");
    const partial = canonicalSelection([unrelated, ...references(1)]);
    const complete = combineSelection(partial, operand, "toggle");
    expect(complete).toEqual(canonicalSelection([unrelated, ...references(1, 3)], granularity, "viewer"));
    expect(combineSelection(complete, operand, "toggle").atoms).toEqual([unrelated]);
    expect(combineSelection(canonicalSelection([unrelated]), operand, "toggle")).toEqual(complete);
    expect(combineSelection(partial, canonicalSelection([]), "toggle")).toBe(partial);
  });

  it("uses one deterministic modifier precedence for every combination", () => {
    for (let flags = 0; flags < 16; flags++) {
      const event = { altKey: !!(flags & 1), ctrlKey: !!(flags & 2), metaKey: !!(flags & 4), shiftKey: !!(flags & 8) };
      expect(selectionMode(event)).toBe(event.altKey ? "subtract" : event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace");
    }
  });

  it("canonicalizes and applies replace, add, subtract, and clear deterministically", () => {
    const canonical = canonicalSelection(
      [...references(3, 1), ...references(3)],
      "structure",
      "project",
    );
    expect(canonical.atoms).toEqual(references(1, 3));
    expect(combineSelection(canonical, canonicalSelection(references(2)), "replace").atoms)
      .toEqual(references(2));
    expect(combineSelection(canonical, canonicalSelection(references(2)), "add").atoms)
      .toEqual(references(1, 2, 3));
    expect(combineSelection(canonical, canonicalSelection(references(3)), "subtract").atoms)
      .toEqual(references(1));
    expect(combineSelection(canonical, canonicalSelection([]), "replace").atoms).toEqual([]);
  });

  it("shares atom references across structure, expansion, inversion, predicates, and summary", () => {
    const atom = canonicalSelection(references(1));
    expect(structureSelection("protein", structure, "project").atoms).toEqual(references(1, 2, 3));
    expect(expandSelection(atom, structures, "residue").atoms).toEqual(references(1, 2));
    expect(expandSelection(atom, structures, "chain").atoms).toEqual(references(1, 2, 3));
    expect(invertSelection(atom, structures).atoms).toEqual(references(2, 3));
    expect(predicateSelection(structures, "atom_name", "ca").atoms).toEqual(references(1, 3));
    expect(predicateSelection(structures, "atom_index", "2").atoms).toEqual(references(2));
    expect(predicateSelection(structures, "atom_reference", "protein:3").atoms).toEqual(references(3));
    expect(predicateSelection(structures, "element", "n").atoms).toEqual(references(2));
    expect(predicateSelection(structures, "residue_name", "gly").atoms).toEqual(references(1, 2));
    expect(predicateSelection(structures, "residue_number", "11").atoms).toEqual(references(3));
    expect(predicateSelection(structures, "chain", "a").atoms).toEqual(references(1, 2, 3));
    expect(predicateSelection(structures, "structure", "protein").atoms).toEqual(references(1, 2, 3));
    expect(selectionSummary(canonicalSelection(references(1, 2, 3)), structures)).toEqual({
      atoms: 3,
      residues: 2,
      chains: 1,
      structures: 1,
    });
  });

  it("computes atom and residue distance results in the worker algorithm", () => {
    const atoms = structure.atoms.map((atom) => ({
      structureId: "protein",
      atomId: atom.id,
      residueId: atom.residue_id,
      coordinates: atom.coordinates,
    }));
    expect(
      computeSpatialSelection({
        id: 1,
        atoms,
        seed: references(1),
        distance: 1.1,
        granularity: "atom",
      }).atoms,
    ).toEqual(references(1, 2));
    expect(
      computeSpatialSelection({
        id: 2,
        atoms,
        seed: references(3),
        distance: 0,
        granularity: "residue",
      }).atoms,
    ).toEqual(references(3));
  });
  it("summarizes gapped identities across entries and replaces immutable indexes with new artifacts", () => {
    const source = proteinStructure();
    source.atoms = source.atoms.map((atom, i) => ({ ...atom, id: [10, 40, 90][i] }));
    const selected = canonicalSelection([...references(10, 40, 500), { structure_id: "copy", atom_id: 10 }]);
    const sources = new Map([["protein", source], ["copy", source]]);
    expect(selectionSummary(selected, sources)).toEqual({ atoms: 4, residues: 2, chains: 2, structures: 2 });
    sources.set("protein", { ...source, atoms: source.atoms.filter(atom => atom.id === 90) });
    expect(selectionSummary(selected, sources)).toEqual({ atoms: 4, residues: 1, chains: 1, structures: 2 });
  });

  it("indexes a large immutable structure once rather than scanning atoms per selected reference", () => {
    const source = proteinStructure(), atom = source.atoms[0];
    const atoms = Array.from({ length: 10000 }, (_, i) => ({ ...atom, id: i + 1 }));
    let visits = 0;
    Object.defineProperty(source, "atoms", { get: () => { visits++; return atoms; } });
    const sources = new Map([["protein", source]]);
    const selected = canonicalSelection(atoms.map(a => ({ structure_id: "protein", atom_id: a.id })));
    expect(selectionSummary(selected, sources)).toEqual({ atoms: 10000, residues: 1, chains: 1, structures: 1 });
    selectionSummary(selected, sources);
    expect(visits).toBe(1);
  });

});
