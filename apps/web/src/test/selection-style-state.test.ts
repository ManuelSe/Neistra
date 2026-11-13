import { describe, expect, it } from "vitest";
import type { Selection } from "../api/types";
import { canonicalSelection } from "../selection/selection";
import { completeResidueStyleSelection, selectionRepresentationSummary } from "../viewer/selectionStyleState";
import { molecularEntry, proteinProjection } from "./molecular-fixtures";

const selected = (...ids: number[]): Selection => canonicalSelection(ids.map(atom_id => ({ structure_id: "protein", atom_id })));

describe("selection styling state", () => {
  it("distinguishes inherited channels, explicit styles and a mixed inherited/explicit target", () => {
    const entry = molecularEntry("protein", "Protein", "protein");
    expect(selectionRepresentationSummary(selected(1, 2), [entry], "polymer")).toBe("Entry default: Cartoon");
    expect(selectionRepresentationSummary(selected(1, 2), [entry], "atomic")).toBe("Entry default: None");
    entry.viewer_settings.selection_representations = [{ style: "backbone", atom_ids: [1] }];
    expect(selectionRepresentationSummary(selected(1), [entry], "polymer")).toBe("Selection: Backbone trace");
    expect(selectionRepresentationSummary(selected(1, 2), [entry], "polymer")).toBe("Mixed: Backbone trace, Cartoon · entry default and selection");
  });

  it("reports atomic hiding independently, including partial hiding and parent visibility", () => {
    const entry = molecularEntry("protein", "Protein", "protein");
    entry.viewer_settings.selection_representations = [{ style: "stick", atom_ids: [1, 2] }];
    entry.viewer_settings.selection_hidden_atoms = [1];
    expect(selectionRepresentationSummary(selected(1, 2), [entry], "atomic")).toBe("Selection: Thin sticks · 1 of 2 hidden");
    expect(selectionRepresentationSummary(selected(1), [entry], "atomic")).toBe("Hidden · Selection: Thin sticks");
    expect(selectionRepresentationSummary(selected(1), [entry], "polymer")).toBe("Entry default: Cartoon");
    entry.visible = false;
    expect(selectionRepresentationSummary(selected(1, 2), [entry], "polymer")).toBe("Hidden · Entry default: Cartoon");
  });

  it("keeps all inherited layers and detects a completely transparent inherited channel", () => {
    const entry = molecularEntry("protein", "Protein", "protein");
    entry.viewer_settings.representations[0].opacity = 0;
    expect(selectionRepresentationSummary(selected(1), [entry], "polymer")).toBe("Hidden · Entry default: Cartoon");
    entry.viewer_settings.representations.push({ ...entry.viewer_settings.representations[0], id: "trace", style: "backbone", opacity: 1 });
    expect(selectionRepresentationSummary(selected(1), [entry], "polymer")).toBe("Entry default: Cartoon + Backbone trace");
    expect(selectionRepresentationSummary(selected(), [entry], "atomic")).toBe("No selection");
  });

  it("offers canonical exact residue completion without changing the original target", () => {
    const projections = new Map([["protein", proteinProjection()]]);
    const original = selected(1, 3);
    expect(completeResidueStyleSelection(original, projections)).toEqual({
      selection: canonicalSelection([1, 2, 3].map(atom_id => ({ structure_id: "protein", atom_id })), "residue", "inspector"),
      residueCount: 2,
    });
    expect(original).toEqual(selected(1, 3));
    expect(completeResidueStyleSelection(selected(1, 2), projections)).toBeNull();
  });

  it("never offers completion that drops unavailable, unresidued or unsupported atoms", () => {
    const projection = proteinProjection();
    const projections = new Map([["protein", projection]]);
    expect(completeResidueStyleSelection(selected(1, 99), projections)).toBeNull();
    expect(completeResidueStyleSelection(selected(1), new Map())).toBeNull();
    projection.structure.atoms[2].residue_id = null;
    expect(completeResidueStyleSelection(selected(1, 3), projections)).toBeNull();
    projection.structure.atoms[0].name = "C";
    expect(completeResidueStyleSelection(selected(2), projections)).toBeNull();
  });
});
