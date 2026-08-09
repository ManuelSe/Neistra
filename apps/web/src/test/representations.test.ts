import { describe, expect, it } from "vitest";
import type { ViewerSettings } from "../api/types";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { representationLayers } from "../viewer/representationProjection";
import {
  addRepresentation,
  colorSchemes,
  molstarRepresentationProfile,
  removeRepresentation,
  representationStyles,
} from "../viewer/settings";
import {
  componentHierarchy,
  proteinStructure,
} from "./molecular-fixtures";

const settings: ViewerSettings = {
  representations: [
    {
      id: "primary",
      style: "cartoon",
      color_by: "element",
      custom_color: "#3b82f6",
      opacity: 1,
    },
  ],
  selection_representations: [],
  components: {
    hydrogens: true,
    nonpolar_hydrogens: true,
    solvent: true,
    ions: true,
    ligands: true,
    protein: true,
  },
  labels: { atoms: false, residues: false, chains: false, structure: false },
};

describe("representation settings", () => {
  it("exposes every required representation and color scheme", () => {
    expect(representationStyles).toEqual([
      "cartoon",
      "backbone",
      "line",
      "stick",
      "thick-stick",
      "ball-and-stick",
      "space-filling",
      "surface",
    ]);
    expect(colorSchemes).toEqual([
      "element",
      "chain",
      "residue",
      "secondary-structure",
      "structure",
      "custom",
    ]);
  });

  it("supports coexistence and preserves at least one representation", () => {
    const expanded = addRepresentation(settings, "surface", "surface");
    expect(expanded.representations.map((item) => item.style)).toEqual([
      "cartoon",
      "surface",
    ]);
    expect(removeRepresentation(expanded, "surface").representations).toHaveLength(1);
    expect(removeRepresentation(settings, "primary")).toBe(settings);
  });

  it("projects inherited and exact selection channels independently", () => {
    const normalized = proteinStructure();
    const structure: ViewerStructure = {
      entryId: "protein",
      label: "Protein",
      projection: { format: "mmcif", data: "projection" },
      atomIds: [1, 2, 3],
      normalized,
      hierarchy: componentHierarchy(normalized),
      settings: {
        ...settings,
        representations: [
          settings.representations[0],
          {
            id: "detail",
            style: "ball-and-stick",
            color_by: "custom",
            custom_color: "#ff0000",
            opacity: 0.5,
          },
          {
            id: "surface",
            style: "surface",
            color_by: "chain",
            custom_color: "#3b82f6",
            opacity: 0.25,
          },
        ],
        selection_representations: [
          { style: "stick", atom_ids: [1, 2] },
          { style: "cartoon", atom_ids: [1, 2] },
        ],
      },
    };
    expect(representationLayers(structure)).toEqual([
      expect.objectContaining({ id: "inherited-primary", atomIds: [3] }),
      expect.objectContaining({ id: "inherited-detail", atomIds: [3] }),
      expect.objectContaining({
        id: "inherited-surface",
        atomIds: [1, 2, 3],
        opacity: 0.25,
      }),
      expect.objectContaining({
        id: "selection-stick",
        atomIds: [1, 2],
        colorBy: "element",
        opacity: 1,
        exactTarget: true,
      }),
      expect.objectContaining({
        id: "selection-cartoon",
        atomIds: [1, 2],
        exactTarget: true,
      }),
    ]);
  });

  it("intersects exact targets with hydrogen visibility and isolation", () => {
    const normalized = proteinStructure();
    normalized.atoms[1] = { ...normalized.atoms[1], element: "H" };
    const structure: ViewerStructure = {
      entryId: "protein",
      label: "Protein",
      projection: { format: "mmcif", data: "projection" },
      atomIds: [1, 2, 3],
      normalized,
      hierarchy: componentHierarchy(normalized),
      settings: {
        ...settings,
        components: { ...settings.components, hydrogens: false },
        selection_representations: [
          { style: "space-filling", atom_ids: [1, 2, 3] },
        ],
      },
    };
    expect(
      representationLayers(structure, new Set([1, 2])).find(
        (layer) => layer.id === "selection-space-filling",
      )?.atomIds,
    ).toEqual([1]);
    expect(representationLayers(structure, new Set())).toEqual([]);
  });

  it("uses distinct stick profiles and prevents parent bonds for exact targets", () => {
    const thin = molstarRepresentationProfile("stick", {
      opacity: 1,
      ignoreHydrogens: false,
      exactTarget: true,
    });
    const thick = molstarRepresentationProfile("thick-stick", {
      opacity: 1,
      ignoreHydrogens: false,
      exactTarget: true,
    });
    expect(thin.type).toBe("ball-and-stick");
    expect(thick.type).toBe("ball-and-stick");
    expect(thin.typeParams.includeParent).toBe(false);
    expect(thick.typeParams.includeParent).toBe(false);
    expect(thick.typeParams.sizeFactor).toBeGreaterThan(
      thin.typeParams.sizeFactor ?? 0,
    );
    expect(thick.typeParams.sizeAspectRatio).toBeGreaterThan(
      thin.typeParams.sizeAspectRatio ?? 0,
    );
    expect(
      molstarRepresentationProfile("surface", {
        opacity: 0.3,
        ignoreHydrogens: true,
        exactTarget: false,
      }).typeParams.includeParent,
    ).toBeUndefined();
  });
});
