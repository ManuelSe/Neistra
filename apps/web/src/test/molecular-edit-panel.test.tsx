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
function setup(operand = selection, unavailable: string | null = null) {
  useEditingStore.getState().setProject(project.id);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["structure", project.id, entry.id, entry.current_artifact_id], projection);
  const onEdit = vi.fn().mockResolvedValue({ project, warnings: [], report: {}, replacements: {} });
  render(<QueryClientProvider client={client}><MolecularEditPanel project={project} selection={operand} busy={false} unavailable={unavailable} onEdit={onEdit} /></QueryClientProvider>);
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
  cleanup(); setup();
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toBeVisible();
  useEditingStore.getState().setProject("another-project");
  expect(useEditingStore.getState().open).toBe(false);
});
