import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, useRef, type ReactNode } from "react";
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

function CommitObserver({ children, observe }: { children: ReactNode; observe?: (root: HTMLElement) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (root.current) observe?.(root.current); });
  return <div ref={root}>{children}</div>;
}

function setup(selection: Selection, locked = false, loaded = true, observe?: (root: HTMLElement) => void) {
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
  const props = { project, selection, structures: loaded ? new Map([["ligand", structure]])
    : new Map<string, NormalizedStructure>(), busy: false, onEdit, onMove };
  const view = (value: typeof props) => <CommitObserver observe={observe}>
    <LigandEditorPanel {...value} />
  </CommitObserver>;
  const rendered = render(view(props));
  let current = props;
  return { onEdit, onMove, props, update: (changes: Partial<typeof props>) => {
    current = { ...current, ...changes };
    rendered.rerender(view(current));
  } };
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

  const single: Selection = { ...sideSelection, atoms: [{ structure_id: "ligand", atom_id: 1 }] };

  it("keeps fields disabled or already seeded during the commit before passive initialization", () => {
    const observations: { value: string; disabled: boolean }[] = [];
    const { update } = setup(single, false, false, root => {
      const input = root.querySelector<HTMLInputElement>(".coordinate-grid input")!;
      observations.push({ value: input.value, disabled: input.matches(":disabled") });
    });
    expect(screen.getByRole("spinbutton", { name: "X" })).toBeDisabled();
    expect(screen.getByLabelText("Element")).toBeDisabled();
    update({ structures: new Map([["ligand", structure]]) });
    expect(observations.at(-1)?.disabled || observations.at(-1)?.value === "1").toBe(true);
    expect(screen.getByRole("spinbutton", { name: "X" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "X" })).toBeEnabled();
  });

  it("preserves a manual draft across equivalent current-source objects and submits its exact coordinates", async () => {
    const user = userEvent.setup();
    const { update, onEdit } = setup(single);
    await user.selectOptions(screen.getByLabelText("Element"), "N");
    const x = screen.getByRole("spinbutton", { name: "X" });
    const y = screen.getByRole("spinbutton", { name: "Y" });
    const charge = screen.getByLabelText("Charge");
    await user.clear(x); await user.type(x, "4");
    await user.clear(y); await user.type(y, "1");
    await user.clear(charge); await user.type(charge, "1");
    update({ structures: new Map([["ligand", { ...structure,
      atoms: structure.atoms.map(atom => ({ ...atom, coordinates: [...atom.coordinates] })),
    }]]) });
    expect(x).toHaveValue(4); expect(y).toHaveValue(1);
    expect(charge).toHaveValue(1); expect(screen.getByLabelText("Element")).toHaveValue("N");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onEdit).toHaveBeenLastCalledWith("ligand", {
      operation: "atom.add", element: "N", formal_charge: 1, coordinates: [4, 1, 0],
    });
  });

  it("reinitializes a changed source and target without inventing an unknown charge", async () => {
    const user = userEvent.setup();
    const { update, props } = setup(single);
    const x = screen.getByRole("spinbutton", { name: "X" });
    await user.clear(x); await user.type(x, "4");
    const changed: NormalizedStructure = { ...structure, atoms: structure.atoms.map(atom => atom.id === 1
      ? { ...atom, coordinates: [9, 2, 0], formal_charge: null } : atom) };
    update({ project: { ...props.project, entries: props.project.entries.map(entry => ({
      ...entry, current_artifact_id: "next-artifact",
    })) }, structures: new Map([["ligand", changed]]) });
    expect(x).toHaveValue(9);
    expect(screen.getByLabelText("Charge")).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    update({ selection: { ...single, atoms: [{ structure_id: "ligand", atom_id: 2 }] } });
    expect(x).toHaveValue(2); expect(screen.getByLabelText("Charge")).toHaveValue(0);
  });

  it("retires an initialized draft across a pending source and return to the same artifact", async () => {
    const user = userEvent.setup();
    const { update, props } = setup(single);
    const x = screen.getByRole("spinbutton", { name: "X" });
    await user.clear(x); await user.type(x, "4");
    update({ project: { ...props.project, entries: props.project.entries.map(entry => ({
      ...entry, current_artifact_id: "pending-artifact",
    })) }, structures: new Map() });
    expect(x).toBeDisabled();
    update({ project: props.project, structures: new Map([["ligand", structure]]) });
    expect(x).toBeEnabled(); expect(x).toHaveValue(1);
  });

  it("distinguishes a missing singleton from deliberate absolute Add with no selection", async () => {
    const user = userEvent.setup();
    const { update, onEdit } = setup({ ...single, atoms: [{ structure_id: "ligand", atom_id: 999 }] });
    const x = screen.getByRole("spinbutton", { name: "X" });
    expect(x).toBeDisabled();
    expect(screen.getByText(/Selected atom is unavailable/)).toBeInTheDocument();
    update({ selection: { ...single, atoms: [] } });
    expect(x).toBeEnabled();
    await user.clear(x); await user.type(x, "6");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onEdit).toHaveBeenLastCalledWith("ligand", expect.objectContaining({
      operation: "atom.add", coordinates: [6, 0, 0],
    }));
  });

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
    expect(screen.queryByRole("button", { name: "Build H…" })).toBeNull();

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
