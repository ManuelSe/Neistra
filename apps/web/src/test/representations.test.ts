import { describe, expect, it } from "vitest";
import type { ViewerSettings } from "../api/types";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { representationLayers } from "../viewer/representationProjection";
import {
  addRepresentation,
  colorSchemes,
  hydrogenDisplayMode,
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
    selection_colors: [],
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

    const polarOnly = {
      ...structure,
      settings: {
        ...structure.settings,
        components: {
          ...structure.settings.components,
          hydrogens: true,
          nonpolar_hydrogens: false,
        },
      },
    };
    expect(
      representationLayers(polarOnly, new Set([1, 2])).find(
        (layer) => layer.id === "selection-space-filling",
      )?.atomIds,
    ).toEqual([1, 2]);
    const restoredAll = {
      ...polarOnly,
      settings: {
        ...polarOnly.settings,
        components: {
          ...polarOnly.settings.components,
          nonpolar_hydrogens: true,
        },
      },
    };
    expect(
      representationLayers(restoredAll, new Set([1, 2])).find(
        (layer) => layer.id === "selection-space-filling",
      )?.atomIds,
    ).toEqual([1, 2]);
  });

  it("does not invent atoms for hydrogen-free structures in any mode", () => {
    const normalized = proteinStructure();
    const structure: ViewerStructure = {
      entryId: "hydrogen-free",
      label: "Hydrogen-free",
      projection: { format: "mmcif", data: "projection" },
      atomIds: normalized.atoms.map((atom) => atom.id),
      normalized,
      hierarchy: componentHierarchy(normalized),
      settings,
    };

    for (const components of [
      settings.components,
      { ...settings.components, nonpolar_hydrogens: false },
      {
        ...settings.components,
        hydrogens: false,
        nonpolar_hydrogens: false,
      },
    ]) {
      structure.settings = { ...settings, components };
      expect(representationLayers(structure)[0]?.atomIds).toEqual(
        normalized.atoms.map((atom) => atom.id),
      );
    }
  });

  it("uses distinct stick profiles and prevents parent bonds for exact targets", () => {
    const thin = molstarRepresentationProfile("stick", {
      opacity: 1,
      hydrogenMode: "all",
      exactTarget: true,
    });
    const thick = molstarRepresentationProfile("thick-stick", {
      opacity: 1,
      hydrogenMode: "all",
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
        hydrogenMode: "none",
        exactTarget: false,
      }).typeParams.includeParent,
    ).toBeUndefined();
  });

  it("maps the durable settings to one effective Molstar hydrogen mode", () => {
    expect(hydrogenDisplayMode(settings.components)).toBe("all");
    expect(
      hydrogenDisplayMode({
        ...settings.components,
        nonpolar_hydrogens: false,
      }),
    ).toBe("polar-only");
    expect(
      hydrogenDisplayMode({
        ...settings.components,
        hydrogens: false,
        nonpolar_hydrogens: false,
      }),
    ).toBe("none");

    for (const style of [
      "line",
      "stick",
      "thick-stick",
      "ball-and-stick",
      "space-filling",
      "surface",
    ] as const) {
      const all = molstarRepresentationProfile(style, {
        opacity: 1,
        hydrogenMode: "all",
        exactTarget: false,
      });
      const polarOnly = molstarRepresentationProfile(style, {
        opacity: 1,
        hydrogenMode: "polar-only",
        exactTarget: false,
      });
      const none = molstarRepresentationProfile(style, {
        opacity: 1,
        hydrogenMode: "none",
        exactTarget: false,
      });

      expect(all.typeParams.ignoreHydrogens).toBe(false);
      expect(all.typeParams.ignoreHydrogensVariant).toBeUndefined();
      expect(polarOnly.typeParams.ignoreHydrogens).toBe(true);
      expect(polarOnly.typeParams.ignoreHydrogensVariant).toBe("non-polar");
      expect(none.typeParams.ignoreHydrogens).toBe(true);
      expect(none.typeParams.ignoreHydrogensVariant).toBe("all");
    }

    for (const style of ["cartoon", "backbone"] as const) {
      expect(
        molstarRepresentationProfile(style, {
          opacity: 1,
          hydrogenMode: "polar-only",
          exactTarget: false,
        }).type,
      ).toBe(style);
    }
  });
});
