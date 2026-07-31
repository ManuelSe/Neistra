import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LigandEditResult,
  NormalizedStructure,
  Selection,
} from "../api/types";
import { LigandEditorPanel } from "../components/LigandEditorPanel";
import { molecularEntry, molecularProject } from "./molecular-fixtures";

const structure: NormalizedStructure = {
  schema_version: 1,
  title: "Butane",
  structure_type: "ligand",
  chains: [],
  residues: [],
  atoms: [1, 2, 3, 4].map((id) => ({
    id,
    name: `C${id}`,
    element: "C",
    coordinates: [id, id === 4 ? 1 : 0, 0],
    residue_id: null,
    formal_charge: 0,
    source_index: id - 1,
    alternate_location: null,
    occupancy: null,
    b_factor: null,
    stereo: null,
    inferred_fields: [],
  })),
  bonds: [
    {
      id: 1,
      atom_1_id: 1,
      atom_2_id: 2,
      order: 1,
      aromatic: false,
      stereo: null,
      inferred: false,
    },
    {
      id: 2,
      atom_1_id: 2,
      atom_2_id: 3,
      order: 1,
      aromatic: false,
      stereo: null,
      inferred: false,
    },
    {
      id: 3,
      atom_1_id: 3,
      atom_2_id: 4,
      order: 1,
      aromatic: false,
      stereo: null,
      inferred: false,
    },
  ],
  conformers: [],
  warnings: [],
};

function setup(selection: Selection, locked = false) {
  const entry = {
    ...molecularEntry("ligand", "Butane", "ligand"),
    atom_count: 4,
    atom_ids: [1, 2, 3, 4],
    bond_count: 3,
    locked,
  };
  const project = molecularProject([entry]);
  const result: LigandEditResult = {
    project,
    warnings: [],
    report: {
      operation: "atom.add",
      created_atom_ids: [5],
      created_bond_ids: [],
      deleted_atom_ids: [],
      deleted_bond_ids: [],
      changed_atom_ids: [],
      force_field: null,
      converged: null,
    },
  };
  const onEdit = vi.fn().mockResolvedValue(result);
  const onMove = vi.fn().mockResolvedValue(undefined);
  render(
    <LigandEditorPanel
      project={project}
      selection={selection}
      structures={new Map([["ligand", structure]])}
      busy={false}
      onEdit={onEdit}
      onMove={onMove}
    />,
  );
  return { onEdit, onMove };
}

const sideSelection: Selection = {
  schema_version: 1,
  atoms: [
    { structure_id: "ligand", atom_id: 3 },
    { structure_id: "ligand", atom_id: 4 },
  ],
  granularity: "atom",
  source: "inspector",
};

describe("ligand editor", () => {
  afterEach(cleanup);

  it("submits atom, bond, hydrogen, rotation, movement, and cleanup commands", async () => {
    const user = userEvent.setup();
    const { onEdit, onMove } = setup(sideSelection);

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onEdit).toHaveBeenLastCalledWith(
      "ligand",
      expect.objectContaining({ operation: "atom.add", element: "C" }),
    );

    const bondSelects = screen.getAllByLabelText("Existing bond");
    await user.selectOptions(bondSelects[0], "2");
    await user.selectOptions(screen.getByLabelText("Order"), "2");
    await user.click(screen.getByRole("button", { name: "Apply order" }));
    expect(onEdit).toHaveBeenLastCalledWith("ligand", {
      operation: "bond.order",
      bond_id: 2,
      order: 2,
    });

    await user.click(screen.getByRole("button", { name: "Selection" }));
    await user.click(screen.getByRole("button", { name: "Add H" }));
    expect(onEdit).toHaveBeenLastCalledWith("ligand", {
      operation: "hydrogen.add",
      atom_ids: [3, 4],
    });

    await user.selectOptions(screen.getByLabelText("Rotatable bond"), "2");
    await user.click(screen.getByRole("button", { name: "Rotate selected side" }));
    expect(onEdit).toHaveBeenLastCalledWith(
      "ligand",
      expect.objectContaining({
        operation: "bond.rotate",
        bond_id: 2,
        movable_atom_ids: [3, 4],
      }),
    );

    const dx = screen.getByLabelText("dX");
    await user.clear(dx);
    await user.type(dx, "1.5");
    await user.click(screen.getByRole("button", { name: "Move selected" }));
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_id: "ligand",
        scope: "selection",
        translation: [1.5, 0, 0],
      }),
    );

    await user.selectOptions(screen.getByLabelText("Force field"), "uff");
    await user.click(screen.getByRole("button", { name: "Minimize coordinates" }));
    expect(onEdit).toHaveBeenLastCalledWith("ligand", {
      operation: "coordinates.cleanup",
      force_field: "uff",
      max_iterations: 200,
      atom_ids: [3, 4],
    });
    expect(await screen.findByText("No chemistry warnings")).toBeInTheDocument();
  });

  it("uses one selected atom for element/charge and disables locked edits", async () => {
    const user = userEvent.setup();
    const selection: Selection = {
      ...sideSelection,
      atoms: [{ structure_id: "ligand", atom_id: 2 }],
    };
    const { onEdit } = setup(selection);
    await user.selectOptions(screen.getByLabelText("Element"), "N");
    await user.click(screen.getByRole("button", { name: "Apply element" }));
    expect(onEdit).toHaveBeenLastCalledWith("ligand", {
      operation: "atom.element",
      atom_id: 2,
      element: "N",
    });
    await user.click(screen.getByRole("button", { name: "Apply charge" }));
    expect(onEdit).toHaveBeenLastCalledWith("ligand", {
      operation: "atom.charge",
      atom_id: 2,
      formal_charge: 0,
    });
  });

  it("exposes no functioning command while the entry is locked", () => {
    setup(sideSelection, true);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete selected" })).toBeDisabled();
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });
});
