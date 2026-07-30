import { describe, expect, it } from "vitest";
import type { AtomReference } from "../api/types";
import {
  canonicalSelection,
  combineSelection,
  expandSelection,
  invertSelection,
  predicateSelection,
  selectionSummary,
  structureSelection,
} from "../selection/selection";
import { computeSpatialSelection } from "../selection/spatial";
import { proteinStructure } from "./molecular-fixtures";

const references = (...atomIds: number[]): AtomReference[] =>
  atomIds.map((atom_id) => ({ structure_id: "protein", atom_id }));

describe("central selection algebra", () => {
  const structure = proteinStructure();
  const structures = new Map([["protein", structure]]);

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
});
