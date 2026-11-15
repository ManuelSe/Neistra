import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { placementContext } from "../editing/placement";
import { afterEach, expect, it, vi } from "vitest";
import type { ChangeHydrogenTarget, Project, Selection, StructureProjection } from "../api/types";
import { MolecularEditPanel } from "../components/MolecularEditPanel";
import { useEditingStore } from "../store/editing";
import { useSelectionStore } from "../store/selection";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

afterEach(() => { cleanup(); useEditingStore.getState().setProject(null); useSelectionStore.getState().setProject(null); });
function fixture() {
  const entry = molecularEntry("protein", "Target", "protein");
  const projection = proteinProjection();
  projection.artifact_id = entry.current_artifact_id!;
  projection.structure.atoms[0].element = "C";
  projection.structure.atoms[1].element = "H";
  projection.structure.atoms[2].element = "H";
  projection.structure.bonds = [2, 3].map(id => ({ id, atom_1_id: 1, atom_2_id: id, order: null, aromatic: false, stereo: null, inferred: true }));
  entry.viewer_settings.components.nonpolar_hydrogens = true;
  entry.viewer_settings.selection_nonpolar_hydrogens = [{ atom_ids: [2, 3], show: false }];
  const project = molecularProject([entry]);
  const selection: Selection = { schema_version: 1, atoms: [{ structure_id: entry.id, atom_id: 1 }], granularity: "atom", source: "viewer" };
  const target: Selection = { ...selection, source: "inspector", atoms: [2, 3].map(atom_id => ({ structure_id: entry.id, atom_id })) };
  return { project, entry, projection, selection, target };
}
function setup(options: { change?: ChangeHydrogenTarget; master?: boolean; mixed?: boolean } = {}) {
  const data = fixture();
  if (options.master === false) data.entry.viewer_settings.components.hydrogens = false;
  if (options.mixed) data.entry.viewer_settings.selection_nonpolar_hydrogens = [{ atom_ids: [2], show: false }];
  useEditingStore.getState().setProject(data.project.id);
  useSelectionStore.getState().setProject(data.project.id);
  useSelectionStore.getState().replace(data.selection);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["structure", data.project.id, data.entry.id, data.entry.current_artifact_id], data.projection);
  const onSettings = vi.fn().mockResolvedValue(undefined);
  const change = vi.fn<ChangeHydrogenTarget>(options.change ?? (async () => {}));
  function Harness({ project = data.project, selection = data.selection, busy = false, unavailable = null, attempt }: { project?: Project; selection?: Selection } & Partial<Pick<ComponentProps<typeof MolecularEditPanel>, "busy" | "unavailable" | "attempt">>) {
    const [updated, setUpdated] = useState<Project | null>(null);
    const onHydrogenAppearance: ChangeHydrogenTarget = async (action, target) => {
      await change(action, target);
      setUpdated({ ...project, entries: project.entries.map(entry => ({ ...entry, viewer_settings: { ...entry.viewer_settings,
        selection_nonpolar_hydrogens: action.action === "reset" ? [] : [{ atom_ids: target.atoms.map(atom => atom.atom_id), show: action.show }],
      } })) });
    };
    const props = { project: updated ?? project, selection, busy, unavailable, attempt, onEdit: vi.fn(), onSettings, onHydrogenAppearance };
    return <QueryClientProvider client={client}><MolecularEditPanel {...props} /><button>Other control</button></QueryClientProvider>;
  }
  const view = render(<Harness />);
  return { ...data, ...view, Harness, change, onSettings, client, user: userEvent.setup() };
}
it("replaces entry flags with exact hidden attached-H preferences, toggles twice and resets the same scope", async () => {
  const { user, change, onSettings, target, selection, entry } = setup();
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  const toggle = screen.queryByRole("button", { name: "Show non-polar hydrogens" }) ?? screen.getByRole("button", { name: "Show explicit H" });
  await user.click(toggle);
  expect(onSettings).not.toHaveBeenCalled();
  expect(toggle).toHaveAttribute("aria-label", "Show non-polar hydrogens");
  expect(change).toHaveBeenLastCalledWith({ property: "nonpolar_hydrogens", action: "set", show: true }, target);
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  await user.keyboard("{Enter}");
  expect(change).toHaveBeenLastCalledWith({ property: "nonpolar_hydrogens", action: "set", show: false }, target);
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Use entry hydrogen setting" }));
  expect(change).toHaveBeenLastCalledWith({ property: "nonpolar_hydrogens", action: "reset" }, target);
  expect(useSelectionStore.getState().selection).toBe(selection);
  expect(entry.viewer_settings.selection_nonpolar_hydrogens).toEqual([{ atom_ids: [2, 3], show: false }]);
});
it("uses Mixed → All while explaining the independent master gate", async () => {
  const { user, change, target } = setup({ master: false, mixed: true });
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  expect(toggle).toHaveAttribute("aria-pressed", "mixed");
  expect(screen.getByText("Show hydrogens is off; local preferences are retained.")).toBeVisible();
  await user.click(toggle);
  expect(change).toHaveBeenCalledWith({ property: "nonpolar_hydrogens", action: "set", show: true }, target);
});
it("excludes repeated activation synchronously, retains focus and does not take ownership of model edits", async () => {
  let finish!: () => void;
  const { user, change } = setup({ change: () => new Promise(resolve => { finish = resolve; }) });
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  toggle.focus();
  act(() => { toggle.click(); toggle.click(); });
  expect(change).toHaveBeenCalledTimes(1);
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-disabled", "true");
  expect(useEditingStore.getState().pending).toBe(false);
  await user.click(screen.getByRole("button", { name: "Other control" }));
  act(() => { finish(); });
  await act(() => Promise.resolve());
  expect(screen.getByRole("button", { name: "Other control" })).toHaveFocus();
});

it.each(["selection", "artifact", "project epoch", "editor generation", "closed"] as const)("does not publish late failure or move focus after changed %s", async transition => {
  let fail!: (error: Error) => void;
  const { user, rerender, Harness, project, selection } = setup({ change: () => new Promise((_resolve, reject) => { fail = reject; }) });
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Show non-polar hydrogens" }));
  await user.click(screen.getByRole("button", { name: "Other control" }));
  act(() => {
    if (transition === "selection") rerender(<Harness selection={{ ...selection, atoms: [{ ...selection.atoms[0], atom_id: 4 }] }} />);
    if (transition === "artifact") rerender(<Harness project={{ ...project, entries: project.entries.map(entry => ({ ...entry, current_artifact_id: "changed" })) }} />);
    if (transition === "project epoch") { useSelectionStore.getState().setProject("other"); useSelectionStore.getState().setProject(project.id); }
    if (transition === "editor generation") { useEditingStore.getState().setProject("other"); useEditingStore.getState().setProject(project.id); useEditingStore.getState().setOpen(true); }
    if (transition === "closed") useEditingStore.getState().setOpen(false);
  });
  act(() => { fail(new Error("Old target failure")); });
  await act(() => Promise.resolve());
  expect(screen.queryByText("Old target failure")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Other control" })).toHaveFocus();
});
it("reports a current failure and keeps the original focus and retry available", async () => {
  const { user } = setup({ change: () => Promise.reject(new Error("Appearance refused")) });
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  await user.click(toggle);
  expect(await screen.findByRole("alert")).toHaveTextContent("Appearance refused");
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-disabled", "false");
});
it.each(["seed", "missing artifact", "no H"] as const)("keeps %s data from authorizing hydrogen appearance", async state => {
  const { user, client, projection, project, entry, change } = setup();
  const molecule: StructureProjection = state === "seed" ? { ...projection, projection_state: "coordinate-seed" }
    : state === "missing artifact" ? { ...projection, artifact_id: "other" }
      : { ...projection, structure: { ...projection.structure, bonds: [] } };
  act(() => { client.setQueryData(["structure", project.id, entry.id, entry.current_artifact_id], molecule); });
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  expect(toggle).toHaveAttribute("aria-disabled", "true");
  await user.click(toggle);
  expect(change).not.toHaveBeenCalled();
});

it.each(["busy", "unresolved edit", "preview", "coordinate preview"] as const)("keeps the compact hydrogen target unavailable during %s", async gate => {
  const { user, rerender, Harness, project, entry, selection, change } = setup();
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  if (gate === "busy") rerender(<Harness busy />);
  if (gate === "coordinate preview") rerender(<Harness unavailable="Finish coordinate preview before editing chemistry." />);
  if (gate === "unresolved edit") rerender(<Harness attempt={{ phase: "idle", identity: null, error: null, journalRecovery: { kind: "invalid", markerId: null, acknowledged: false } }} />);
  if (gate === "preview") act(() => {
    const editing = useEditingStore.getState();
    const action = { operation: "atom.add" as const, element: "C", charge: 0, direction: 0 };
    editing.setPlacement({ id: "preview", context: placementContext(project, entry.id, selection, editing.generation, action), action,
      result: { entry_id: entry.id, expected_revision: project.revision, expected_artifact_id: entry.current_artifact_id!, atoms: [], bonds: [], removed_atom_ids: [], warnings: [] } });
  });
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  expect(toggle).toHaveAttribute("aria-disabled", "true");
  await user.click(toggle);
  await user.click(screen.getByRole("button", { name: "Use entry hydrogen setting" }));
  expect(change).not.toHaveBeenCalled();
});
