import { describe, expect, it } from "vitest";
import { displayedProteinRows } from "../viewer/sequenceDisplay";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { proteinProjection, surfaceObject, viewerSettings } from "./molecular-fixtures";

function source(): ViewerStructure {
  const projection = proteinProjection();
  return { entryId: "protein", label: "Protein", projection: projection.viewer,
    normalized: projection.structure, hierarchy: projection.hierarchy,
    atomIds: projection.structure.atoms.map(atom => atom.id), settings: viewerSettings("ball-and-stick") };
}

describe("application-owned sequence display", () => {
  it("retains the whole observed chain when one atom is displayed and removes wholly isolated chains", () => {
    const input = source();
    const selected = [{ structure_id: input.entryId, atom_id: 1 }];
    expect(displayedProteinRows(input, selected)[0].residues.map(r => r.id)).toEqual([1, 2]);
    expect(displayedProteinRows(input, [])).toEqual([]);
    expect(displayedProteinRows(input, [{ structure_id: "other", atom_id: 1 }])).toEqual([]);
  });

  it("respects protein category, opacity and atomic detail hiding while retaining independent polymers", () => {
    const input = source();
    input.settings.components.protein = false;
    expect(displayedProteinRows(input, null)).toEqual([]);
    const hidden = source(); hidden.settings.selection_hidden_atoms = hidden.atomIds;
    expect(displayedProteinRows(hidden, null)).toEqual([]);
    const cartoon = source(); cartoon.settings.selection_hidden_atoms = cartoon.atomIds;
    cartoon.settings.representations[0].style = "cartoon";
    expect(displayedProteinRows(cartoon, null)).toHaveLength(1);
    const transparent = source(); transparent.settings.representations[0].opacity = 0;
    expect(displayedProteinRows(transparent, null)).toEqual([]);
  });

  it.each(["entry", "fragment"] as const)("retains declared protein context for a visible %s surface", kind => {
    const input = source(); input.settings.representations = [];
    input.settings.selection_hidden_atoms = input.atomIds;
    input.settings.surface_objects = [surfaceObject("surface", kind === "entry" ? { kind } : { kind, profile: "molecular-v1", atom_ids: [1] })];
    expect(displayedProteinRows(input, null)[0].residues).toHaveLength(2);
    const hidden = { ...input, settings: { ...input.settings, surface_objects: input.settings.surface_objects.map(surface => ({ ...surface, visible: false })) } };
    expect(displayedProteinRows(hidden, null)).toEqual([]);
  });

  it("uses valid pocket source context, never cropped geometry, and respects isolation", () => {
    const input = source(); input.settings.representations = [];
    input.settings.surface_objects = [surfaceObject("pocket", { kind: "pocket", profile: "pocket-v1", radius: 4, seed_atom_references: [{ structure_id: "protein", atom_id: 1 }] })];
    input.pockets = { pocket: { radius: 4, seeds: [], dependencyKey: "current" } };
    expect(displayedProteinRows(input, null)[0].residues).toHaveLength(2);
    expect(displayedProteinRows(input, [])).toEqual([]);
    input.pockets = { pocket: { ...input.pockets.pocket, unavailable: "Loading" } };
    expect(displayedProteinRows(input, null)).toEqual([]);
  });

  it("reuses display membership across selection/camera changes without leaking entry isolation", () => {
    const input = source();
    const isolation = [{ structure_id: "protein", atom_id: 1 }];
    const rows = displayedProteinRows(input, isolation);
    expect(displayedProteinRows({ ...input, label: "Renamed" }, isolation)).toBe(rows);
    expect(displayedProteinRows({ ...input, entryId: "other" }, isolation)).toEqual([]);
    expect(displayedProteinRows(input, isolation)).toHaveLength(1);
  });
});
