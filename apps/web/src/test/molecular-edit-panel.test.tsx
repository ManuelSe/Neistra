import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MolecularEditPanel } from "../components/MolecularEditPanel";
import { useEditingStore } from "../store/editing";
import { molecularEntry, molecularProject } from "./molecular-fixtures";
import type { Selection, StructureProjection } from "../api/types";

const entry = molecularEntry("ligand", "Ethanol", "ligand");
const project = molecularProject([entry]);
const selection: Selection = { schema_version: 1, atoms: [{ structure_id: entry.id, atom_id: 1 }], granularity: "atom", source: "viewer" };
const projection: StructureProjection = {
  entry_id: entry.id, viewer: { format: "mol", data: "" },
  hierarchy: { schema_version: 1, warnings: [], components: [{ id: "ligand-component", category: "ligand", display_label: "LIG", residue_ids: [], chain_ids: [], atom_ids: [1], classification_source: "source", classification_status: "assigned", warnings: [] }] },
  structure: { schema_version: 1, title: "Ethanol", structure_type: "ligand", chains: [], residues: [],
    atoms: [{ id: 1, name: "C1", element: "C", coordinates: [0, 0, 0], residue_id: null, formal_charge: 0, source_index: 0, alternate_location: null, occupancy: null, b_factor: null, stereo: null, inferred_fields: [] }],
    bonds: [], conformers: [{ id: 1, name: "3D", coordinates: [[0, 0, 0]] }], warnings: [],
  },
};

afterEach(() => { cleanup(); useEditingStore.getState().setProject(null); });
function setup(operand = selection, unavailable: string | null = null, molecule = projection) {
  useEditingStore.getState().setProject(project.id);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["structure", project.id, entry.id, entry.current_artifact_id], molecule);
  const onEdit = vi.fn().mockResolvedValue({ project, warnings: [], report: {}, replacements: {} });
  const panelProject = { ...project, entries: [{ ...entry, structure_type: molecule.structure.structure_type }] };
  render(<QueryClientProvider client={client}><MolecularEditPanel project={panelProject} selection={operand} busy={false} unavailable={unavailable} onEdit={onEdit} /></QueryClientProvider>);
  return { onEdit, user: userEvent.setup() };
}

it("captures canonical operands, stays open, and restores owned launcher focus", async () => {
  const { user, onEdit } = setup();
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Replace selected atom with N" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, selection, { operation: "atom.element", element: "N" });
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Edit molecule" })).toHaveFocus();
});

it("explains empty selection and does not execute an inferred default target", async () => {
  const { user, onEdit } = setup({ ...selection, atoms: [] });
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  expect(screen.getByRole("status")).toHaveTextContent("Select atoms in one entry");
  expect(screen.getByRole("button", { name: "Prepare component hydrogens" })).toBeDisabled();
  expect(onEdit).not.toHaveBeenCalled();
});

it("preserves open state across responsive remounts but resets on project switch", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Fragments" }));
  cleanup(); setup();
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Fragments" })).toHaveAttribute("aria-pressed", "true");
  useEditingStore.getState().setProject("another-project");
  expect(useEditingStore.getState().open).toBe(false);
});

it("uses two canonical endpoints for bond order without a manual bond ID", async () => {
  const second = { ...projection.structure.atoms[0], id: 2, element: "O" };
  const molecule: StructureProjection = { ...projection,
    hierarchy: { ...projection.hierarchy, components: [{ ...projection.hierarchy.components[0], atom_ids: [1, 2] }] },
    structure: { ...projection.structure, atoms: [...projection.structure.atoms, second], bonds: [{ id: 9, atom_1_id: 1, atom_2_id: 2, order: 1, aromatic: false, stereo: null, inferred: false }] },
  };
  const operand = { ...selection, atoms: [1, 2].map(atom_id => ({ structure_id: entry.id, atom_id })) };
  const { user, onEdit } = setup(operand, null, molecule);
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Bonds" }));
  await user.click(screen.getByRole("button", { name: "Increase bond order" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, operand, { operation: "bond.order", order: 2 });
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

it("shows six structural previews and substitutes an H through one fragment action", async () => {
  const molecule: StructureProjection = { ...projection, structure: { ...projection.structure, atoms: [{ ...projection.structure.atoms[0], element: "H" }] } };
  const { user, onEdit } = setup(selection, null, molecule);
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Fragments" }));
  expect(document.querySelectorAll(".edit-fragment-grid svg")).toHaveLength(6);
  await user.click(screen.getByRole("button", { name: "Replace H with Carboxylic acid" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, selection, { operation: "fragment.replace", fragment: "carboxylic_acid" });
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toBeVisible();
});

it("opens by keyboard into the dialog and closes with owned focus", async () => {
  const { user } = setup();
  await user.tab();
  expect(screen.getByRole("button", { name: "Edit molecule" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Edit molecule" })).toHaveFocus();
});

it("mutates a complete standard residue through one action and explains partial selection", async () => {
  const atoms = ["N", "CA", "C", "O", "CB"].map((name, index) => ({ ...projection.structure.atoms[0], id: index + 1, name, residue_id: 1 }));
  const molecule: StructureProjection = { ...projection, structure: { ...projection.structure,
    structure_type: "protein", atoms, residues: [{ id: 1, chain_id: 1, name: "ALA", author_number: 1, label_number: 1, insertion_code: null, component_type: "polymer" }],
  } };
  const operand = { ...selection, atoms: atoms.map(atom => ({ structure_id: entry.id, atom_id: atom.id })) };
  const { user, onEdit } = setup(operand, null, molecule);
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Residues" }));
  expect(screen.getAllByRole("button", { name: /^Mutate residue to / })).toHaveLength(20);
  expect(screen.getByRole("button", { name: "Mutate residue to ALA" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Mutate residue to VAL" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, operand, { operation: "residue.mutate", target_name: "VAL" });
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toHaveFocus();
  cleanup();
  const partial = setup(selection, null, molecule);
  expect(screen.getByRole("status")).toHaveTextContent("complete residue");
  expect(screen.getByRole("button", { name: "Mutate residue to VAL" })).toBeDisabled();
  expect(partial.onEdit).not.toHaveBeenCalled();
});
