import { describe, expect, it } from "vitest";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { visibleLigandAtoms } from "../viewer/focusTargets";
import {
  componentHierarchy,
  proteinStructure,
  viewerSettings,
} from "./molecular-fixtures";

function complexStructure(
  entryId: string,
  ligandsVisible = true,
): ViewerStructure {
  const normalized = proteinStructure();
  const complex = {
    ...normalized,
    structure_type: "complex" as const,
    residues: [
      ...normalized.residues,
      {
        id: 3,
        chain_id: 1,
        name: "LIG",
        author_number: 20,
        label_number: 3,
        insertion_code: null,
        component_type: "ligand" as const,
      },
      {
        id: 4,
        chain_id: 1,
        name: "HOH",
        author_number: 21,
        label_number: 4,
        insertion_code: null,
        component_type: "water" as const,
      },
      {
        id: 5,
        chain_id: 1,
        name: "ZN",
        author_number: 22,
        label_number: 5,
        insertion_code: null,
        component_type: "ion" as const,
      },
      {
        id: 6,
        chain_id: 1,
        name: "UNK",
        author_number: 23,
        label_number: 6,
        insertion_code: null,
        component_type: "unknown" as const,
      },
    ],
    atoms: [
      ...normalized.atoms,
      {
        ...normalized.atoms[0],
        id: 4,
        name: "C1",
        residue_id: 3,
        source_index: 3,
      },
      {
        ...normalized.atoms[0],
        id: 5,
        name: "H1",
        element: "H",
        residue_id: 3,
        source_index: 4,
      },
      {
        ...normalized.atoms[0],
        id: 6,
        name: "O",
        element: "O",
        residue_id: 4,
        source_index: 5,
      },
      {
        ...normalized.atoms[0],
        id: 7,
        name: "ZN",
        element: "Zn",
        residue_id: 5,
        source_index: 6,
      },
      {
        ...normalized.atoms[0],
        id: 8,
        name: "X",
        residue_id: 6,
        source_index: 7,
      },
    ],
  };
  return {
    entryId,
    label: entryId,
    projection: { format: "mmcif", data: "projection" },
    atomIds: [1, 2, 3, 4, 5, 6, 7, 8],
    normalized: complex,
    hierarchy: componentHierarchy(complex),
    settings: {
      ...viewerSettings("cartoon"),
      components: {
        ...viewerSettings("cartoon").components,
        hydrogens: false,
        ligands: ligandsVisible,
      },
    },
  };
}

describe("viewer focus targets", () => {
  it("uses only application hierarchy ligand memberships and sorts references", () => {
    const second = complexStructure("structure-b");
    const first = complexStructure("structure-a");

    expect(visibleLigandAtoms([second, first, first], null)).toEqual([
      { structure_id: "structure-a", atom_id: 4 },
      { structure_id: "structure-b", atom_id: 4 },
    ]);
  });

  it("excludes disabled ligand components and atoms outside active isolation", () => {
    const disabled = complexStructure("disabled", false);
    const visible = complexStructure("visible");

    expect(
      visibleLigandAtoms([disabled, visible], [
        { structure_id: "visible", atom_id: 4 },
        { structure_id: "visible", atom_id: 6 },
        { structure_id: "disabled", atom_id: 4 },
      ]),
    ).toEqual([{ structure_id: "visible", atom_id: 4 }]);
  });

  it("uses stable heavy-atom ligand focus in polar-only mode", () => {
    const structure = complexStructure("polar-only");
    structure.settings = {
      ...structure.settings,
      components: {
        ...structure.settings.components,
        hydrogens: true,
        nonpolar_hydrogens: false,
      },
    };

    expect(visibleLigandAtoms([structure], null)).toEqual([
      { structure_id: "polar-only", atom_id: 4 },
    ]);
    structure.settings.components.nonpolar_hydrogens = true;
    expect(visibleLigandAtoms([structure], null)).toEqual([
      { structure_id: "polar-only", atom_id: 4 },
      { structure_id: "polar-only", atom_id: 5 },
    ]);
    structure.settings.selection_nonpolar_hydrogens = [{ show: true, atom_ids: [5] }];
    expect(visibleLigandAtoms([structure], null)).toEqual([
      { structure_id: "polar-only", atom_id: 4 },
    ]);
  });
});
