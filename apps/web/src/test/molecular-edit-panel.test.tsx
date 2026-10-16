import { projectApi } from "../api/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
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

afterEach(() => { vi.restoreAllMocks(); cleanup(); useEditingStore.getState().setProject(null); });
function setup(operand = selection, unavailable: string | null = null, molecule = projection) {
  useEditingStore.getState().setProject(project.id);
  vi.spyOn(projectApi, "modelPreview").mockResolvedValue({ entry_id: entry.id,
    expected_revision: project.revision, expected_artifact_id: entry.current_artifact_id!,
    atoms: [{ preview_id: "preview-0", element: "C", coordinates: [1.5, 0, 0] }],
    bonds: [], removed_atom_ids: [], warnings: [],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["structure", project.id, entry.id, entry.current_artifact_id], molecule);
  const onEdit = vi.fn().mockResolvedValue({ project, warnings: [], report: {}, replacements: {} });
  const panelProject = { ...project, entries: [{ ...entry, structure_type: molecule.structure.structure_type, atom_count: molecule.structure.atoms.length }] };
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
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, operand, { operation: "bond.set", order: 2 });
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

it("shows six structural previews and substitutes an H through one fragment action", async () => {
  const molecule: StructureProjection = { ...projection, structure: { ...projection.structure, atoms: [{ ...projection.structure.atoms[0], element: "H" }] } };
  const { user, onEdit } = setup(selection, null, molecule);
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Fragments" }));
  expect(document.querySelectorAll(".edit-fragment-grid svg")).toHaveLength(6);
  await user.click(screen.getByRole("button", { name: "Replace H with Carboxylic acid" }));
  expect(onEdit).not.toHaveBeenCalled();
  await screen.findByRole("button", { name: "Apply placement" });
  await user.click(screen.getByRole("button", { name: "Apply placement" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, selection, { operation: "fragment.attach", fragment: "carboxylic_acid", direction: 0, rotation: 0 });
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

it("surfaces failed chemistry without closing the panel or repeating a pending command", async () => {
  const { user, onEdit } = setup();
  let reject!: (reason: Error) => void;
  onEdit.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Replace selected atom with F" }));
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Replace selected atom with N" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Replace selected atom with N" }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  await act(async () => { reject(new Error("Invalid valence; unchanged.")); await Promise.resolve(); });
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("Ethanol: Invalid valence; unchanged.");
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Replace selected atom with N" })).toBeEnabled();
});

it("does not let an old project visit clear a newer visit's pending edit", async () => {
  const completed = { project, warnings: [], report: {}, replacements: {} };
  const first = setup();
  let finishFirst!: () => void;
  first.onEdit.mockImplementationOnce(() => new Promise(resolve => { finishFirst = () => resolve(completed); }));
  await first.user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await first.user.click(screen.getByRole("button", { name: "Replace selected atom with N" }));
  expect(useEditingStore.getState().pending).toBe(true);
  act(() => { useEditingStore.getState().setProject("another-project"); });
  cleanup();
  act(() => { useEditingStore.getState().setProject(project.id); });
  const second = setup();
  let finishSecond!: () => void;
  second.onEdit.mockImplementationOnce(() => new Promise(resolve => { finishSecond = () => resolve(completed); }));
  await second.user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await second.user.click(screen.getByRole("button", { name: "Replace selected atom with N" }));
  await act(async () => { finishFirst(); await Promise.resolve(); });
  try {
    expect(useEditingStore.getState().pending).toBe(true);
    expect(screen.getByRole("button", { name: "Replace selected atom with F" })).toBeDisabled();
  } finally {
    await act(async () => { finishSecond(); await Promise.resolve(); });
  }
  expect(useEditingStore.getState().pending).toBe(false);
});

it("keeps direct assignment available with unknown chemistry and separate helper prerequisites", async () => {
  const molecule: StructureProjection = { ...projection, structure: { ...projection.structure,
    structure_type: "complex", atoms: [{ ...projection.structure.atoms[0], formal_charge: null }],
  }, hierarchy: { ...projection.hierarchy, components: [] } };
  const { user, onEdit } = setup(selection, null, molecule);
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  expect(screen.getByRole("button", { name: "Replace selected atom with N" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Prepare component hydrogens" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Increase formal charge" })).toBeDisabled();
  await user.click(screen.getByText("More elements and formal charge"));
  await user.click(screen.getByRole("button", { name: "Assign charge" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, selection, { operation: "atom.charge.set", charge: 0 });
  await user.click(screen.getByRole("button", { name: "Assign element" }));
  expect(onEdit).toHaveBeenLastCalledWith(entry.id, entry.current_artifact_id, selection, { operation: "atom.element", element: "P" });
});

it("permits H endpoints and breaking a displayed inferred bond with no canonical edge", async () => {
  const second = { ...projection.structure.atoms[0], id: 2, element: "H" };
  const molecule = { ...projection, structure: { ...projection.structure, atoms: [...projection.structure.atoms, second] } };
  const operand = { ...selection, atoms: [1, 2].map(atom_id => ({ structure_id: entry.id, atom_id })) };
  const { user, onEdit } = setup(operand, null, molecule);
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Bonds" }));
  await user.click(screen.getByRole("button", { name: "Break bond" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, operand, { operation: "bond.delete" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Assign bond order" }), "unknown");
  expect(onEdit).toHaveBeenLastCalledWith(entry.id, entry.current_artifact_id, operand, { operation: "bond.set", order: null });
});


it("previews and cancels attached atoms without an edit, then applies the captured direction", async () => {
  const { user, onEdit } = setup();
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByText("Add atom", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Preview atom" }));
  await user.click(await screen.findByRole("button", { name: "Next direction" }));
  expect(useEditingStore.getState().placement?.action.direction).toBe(1);
  expect(onEdit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel placement" }));
  expect(useEditingStore.getState().placement).toBeNull();
  await user.click(screen.getByRole("button", { name: "Preview atom" }));
  await user.click(await screen.findByRole("button", { name: "Apply placement" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, selection, { operation: "atom.add", element: "C", charge: 0, direction: 0 });
});

it("requires an explicit empty-entry target for rebuilding", async () => {
  const empty = { ...projection, structure: { ...projection.structure, atoms: [], bonds: [] } };
  const operand = { ...selection, atoms: [] };
  const { user, onEdit } = setup(operand, null, empty);
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  expect(screen.getByRole("status")).toHaveTextContent("Select atoms in one entry");
  await user.selectOptions(screen.getByRole("combobox", { name: "Empty target entry" }), entry.id);
  await user.click(screen.getByText("Add atom", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Preview atom" }));
  await user.click(await screen.findByRole("button", { name: "Apply placement" }));
  expect(onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, operand, { operation: "atom.add", element: "C", charge: 0, direction: 0 });
});

it("does not allow retargeting an empty-entry write while it is pending", async () => {
  const empty = { ...projection, structure: { ...projection.structure, atoms: [], bonds: [] } };
  const operand = { ...selection, atoms: [] };
  const { user, onEdit } = setup(operand, null, empty);
  let finish!: () => void;
  onEdit.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ project, warnings: [], report: {}, replacements: {} }); }));
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Empty target entry" }), entry.id);
  await user.click(screen.getByText("Add atom", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Preview atom" }));
  await user.click(await screen.findByRole("button", { name: "Apply placement" }));
  expect(screen.getByLabelText("Empty target entry")).toBeDisabled();
  await act(async () => { finish(); await Promise.resolve(); });
  expect(screen.getByRole("combobox", { name: "Empty target entry" })).toBeEnabled();
});

it("does not resurrect a cancelled proposal when its delayed preview resolves", async () => {
  const { user, onEdit } = setup();
  const answer = { entry_id: entry.id, expected_revision: project.revision, expected_artifact_id: entry.current_artifact_id!, atoms: [{ preview_id: "preview-0", element: "C", coordinates: [1.5,0,0] as [number,number,number] }], bonds: [], removed_atom_ids: [], warnings: [] };
  let finish!: () => void;
  vi.mocked(projectApi.modelPreview).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(answer); }));
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByText("Add atom", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Preview atom" }));
  await user.click(screen.getByRole("button", { name: "Cancel placement" }));
  await act(async () => { finish(); await Promise.resolve(); });
  expect(useEditingStore.getState().placement).toBeNull();
  expect(screen.queryByRole("button", { name: "Apply placement" })).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();
});

it("retains placement inputs and the captured proposal across responsive remounts", async () => {
  const first = setup();
  await first.user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await first.user.click(screen.getByText("Add atom", { exact: true }));
  await first.user.clear(screen.getByRole("combobox", { name: "Added element" }));
  await first.user.type(screen.getByRole("combobox", { name: "Added element" }), "P");
  await first.user.click(screen.getByRole("button", { name: "Preview atom" }));
  await screen.findByRole("button", { name: "Apply placement" });
  cleanup();
  const second = setup();
  // The disclosure itself is local presentation state; its draft is project-owned.
  await second.user.click(screen.getByRole("button", { name: "Placement tools" }));
  await second.user.click(screen.getByText("Add atom", { exact: true }));
  expect(screen.getByRole("combobox", { name: "Added element" })).toHaveValue("P");
  await second.user.click(screen.getByRole("button", { name: "Apply placement" }));
  expect(second.onEdit).toHaveBeenCalledWith(entry.id, entry.current_artifact_id, selection, { operation: "atom.add", element: "P", charge: 0, direction: 0 });
});

it("retains a closed launcher's owned keyboard focus across a responsive remount", async () => {
  const first = setup();
  await first.user.tab();
  expect(screen.getByRole("button", { name: "Edit molecule" })).toHaveFocus();
  cleanup();
  setup();
  expect(screen.getByRole("button", { name: "Edit molecule" })).toHaveFocus();
  expect(screen.queryByRole("dialog", { name: "Edit molecule" })).toBeNull();
});

it("does not restore launcher focus over another control's newer focus", async () => {
  const first = setup();
  await first.user.tab();
  cleanup();
  const outside = document.createElement("button"); outside.textContent = "Other task";
  document.body.append(outside); outside.focus();
  try {
    setup();
    expect(outside).toHaveFocus();
  } finally { outside.remove(); }
});
