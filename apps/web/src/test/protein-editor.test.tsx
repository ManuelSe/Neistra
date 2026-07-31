import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CoordinateTransform,
  NormalizedStructure,
  ProteinEdit,
  ProteinEditResult,
  Selection,
} from "../api/types";
import { ProteinEditorPanel } from "../components/ProteinEditorPanel";
import { molecularEntry, molecularProject } from "./molecular-fixtures";

const structure: NormalizedStructure = {
  schema_version: 1,
  title: "Protein complex",
  structure_type: "complex",
  chains: [
    { id: 1, name: "A", entity_type: "polymer" },
    { id: 2, name: "W", entity_type: "water" },
    { id: 3, name: "I", entity_type: "ion" },
  ],
  residues: [
    {
      id: 1,
      chain_id: 1,
      name: "ALA",
      author_number: 1,
      label_number: 1,
      insertion_code: null,
      component_type: "polymer",
    },
    {
      id: 2,
      chain_id: 1,
      name: "GLY",
      author_number: 2,
      label_number: 2,
      insertion_code: null,
      component_type: "polymer",
    },
    {
      id: 3,
      chain_id: 2,
      name: "HOH",
      author_number: 101,
      label_number: null,
      insertion_code: null,
      component_type: "water",
    },
    {
      id: 4,
      chain_id: 3,
      name: "ZN",
      author_number: 201,
      label_number: null,
      insertion_code: null,
      component_type: "ion",
    },
  ],
  atoms: [
    ["N", "N", 1],
    ["CA", "C", 1],
    ["C", "C", 1],
    ["O", "O", 1],
    ["CB", "C", 1],
    ["N", "N", 2],
    ["CA", "C", 2],
    ["C", "C", 2],
    ["O", "O", 2],
    ["O", "O", 3],
    ["ZN", "Zn", 4],
  ].map(([name, element, residueId], index) => ({
    id: index + 1,
    name: String(name),
    element: String(element),
    coordinates: [index, 0, 0],
    residue_id: Number(residueId),
    formal_charge: null,
    source_index: index,
    alternate_location: null,
    occupancy: 1,
    b_factor: 10,
    stereo: null,
    inferred_fields: [],
  })),
  bonds: [],
  conformers: [],
  warnings: [],
};

const selection: Selection = {
  schema_version: 1,
  atoms: [
    { structure_id: "protein", atom_id: 1 },
    { structure_id: "protein", atom_id: 2 },
  ],
  granularity: "atom",
  source: "inspector",
};

function setup(locked = false, warning = false) {
  const entry = {
    ...molecularEntry("protein", "Protein complex", "complex"),
    atom_count: 11,
    atom_ids: Array.from({ length: 11 }, (_, index) => index + 1),
    residue_count: 4,
    locked,
  };
  const project = molecularProject([entry]);
  const result: ProteinEditResult = {
    project,
    warnings: warning
      ? [
          {
            code: "side_chain_not_optimized",
            message: "The deterministic side chain was not optimized.",
            severity: "warning",
            operation: "protein.residue.mutate",
            field: "residues.name",
            blocking: false,
          },
        ]
      : [],
    report: {
      operation: "protein.residue.mutate",
      created_atom_ids: [12, 13],
      created_bond_ids: [],
      deleted_atom_ids: [],
      deleted_bond_ids: [],
      changed_atom_ids: [1, 2, 3, 4, 5, 12, 13],
      changed_residue_ids: [1],
      deleted_residue_ids: [],
      changed_chain_ids: [],
      deleted_chain_ids: [],
    },
  };
  const onEdit = vi
    .fn<
      (entryId: string, edit: ProteinEdit) => Promise<ProteinEditResult>
    >()
    .mockResolvedValue(result);
  const onMove = vi
    .fn<(transform: CoordinateTransform) => Promise<void>>()
    .mockResolvedValue(undefined);
  const view = render(
    <ProteinEditorPanel
      project={project}
      selection={selection}
      structures={new Map([["protein", structure]])}
      busy={false}
      onEdit={onEdit}
      onMove={onMove}
    />,
  );
  return { onEdit, onMove, project, view };
}

describe("protein editor", () => {
  afterEach(cleanup);

  it("submits destructive, metadata, mutation, hydrogen, and movement commands", async () => {
    const user = userEvent.setup();
    const unlocked = setup();
    await user.click(
      screen.getByRole("button", { name: "Delete selected atoms" }),
    );
    expect(unlocked.onEdit).toHaveBeenLastCalledWith("protein", {
      operation: "protein.atom.delete",
      atom_ids: [1, 2],
    });

    await user.click(
      screen.getByRole("button", { name: "Delete selected residues" }),
    );
    expect(unlocked.onEdit).toHaveBeenLastCalledWith("protein", {
      operation: "protein.residue.delete",
      residue_ids: [1],
    });

    await user.clear(screen.getByLabelText("New chain name"));
    await user.type(screen.getByLabelText("New chain name"), "X");
    await user.click(screen.getByRole("button", { name: "Apply name" }));
    expect(unlocked.onEdit).toHaveBeenLastCalledWith("protein", {
      operation: "protein.chain.rename",
      chain_id: 1,
      name: "X",
    });

    await user.clear(screen.getByLabelText("Start"));
    await user.type(screen.getByLabelText("Start"), "100");
    await user.click(screen.getByRole("button", { name: /Renumber/ }));
    expect(unlocked.onEdit).toHaveBeenLastCalledWith("protein", {
      operation: "protein.residue.renumber",
      chain_id: 1,
      start: 100,
      step: 1,
    });

    await user.selectOptions(screen.getByLabelText("Target amino acid"), "VAL");
    await user.click(screen.getByRole("button", { name: "Apply mutation" }));
    expect(unlocked.onEdit).toHaveBeenLastCalledWith("protein", {
      operation: "protein.residue.mutate",
      residue_id: 1,
      target_name: "VAL",
    });

    await user.click(screen.getByRole("button", { name: "Selected residues" }));
    await user.click(screen.getByRole("button", { name: "Add H" }));
    expect(unlocked.onEdit).toHaveBeenLastCalledWith("protein", {
      operation: "protein.hydrogen.add",
      residue_ids: [1],
      ph: 7,
    });

    const dx = screen.getByLabelText("dX");
    await user.clear(dx);
    await user.type(dx, "1.25");
    await user.click(screen.getByRole("button", { name: "Move atoms" }));
    expect(unlocked.onMove).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_id: "protein",
        scope: "selection",
        translation: [1.25, 0, 0],
      }),
    );

    await user.click(screen.getByRole("button", { name: "Whole residues" }));
    await user.click(screen.getByRole("button", { name: "Move residues" }));
    const residueMove = unlocked.onMove.mock.lastCall?.[0];
    expect(residueMove?.selection.granularity).toBe("residue");
    expect(residueMove?.selection.atoms).toEqual(
      expect.arrayContaining([
        { structure_id: "protein", atom_id: 1 },
        { structure_id: "protein", atom_id: 5 },
      ]),
    );
  });

  it("removes water and ions and renders scientific result warnings", async () => {
    const user = userEvent.setup();
    const { onEdit } = setup(false, true);
    await user.click(screen.getByRole("button", { name: /Remove water/ }));
    expect(onEdit).toHaveBeenLastCalledWith("protein", {
      operation: "protein.water.delete",
    });
    await user.click(screen.getByRole("button", { name: /Remove ions/ }));
    expect(onEdit).toHaveBeenLastCalledWith("protein", {
      operation: "protein.ion.delete",
    });
    expect(
      await screen.findByText("The deterministic side chain was not optimized."),
    ).toBeInTheDocument();
  });

  it("explains template limits and disables edits for locked entries", () => {
    const { onEdit } = setup(true);
    expect(
      screen.getByText(/No rotamer search, protonation analysis/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete selected atoms" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply mutation" })).toBeDisabled();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("preserves hierarchy input while a replacement projection loads", async () => {
    const user = userEvent.setup();
    const { onEdit, onMove, project, view } = setup();
    const input = screen.getByLabelText("New chain name");
    await user.clear(input);
    await user.type(input, "X");
    view.rerender(
      <ProteinEditorPanel
        project={project}
        selection={selection}
        structures={new Map()}
        busy={false}
        onEdit={onEdit}
        onMove={onMove}
      />,
    );
    expect(screen.getByLabelText("New chain name")).toHaveValue("X");
    view.rerender(
      <ProteinEditorPanel
        project={project}
        selection={selection}
        structures={new Map([["protein", structure]])}
        busy={false}
        onEdit={onEdit}
        onMove={onMove}
      />,
    );
    expect(screen.getByLabelText("New chain name")).toHaveValue("X");
    expect(screen.getByRole("button", { name: "Apply name" })).toBeEnabled();
  });
});
