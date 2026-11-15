import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, projectApi } from "../api/client";
import type { ApplySelectionEdit, ModelPreview, Selection, SelectionEditResult, StructureProjection } from "../api/types";
import { MolecularEditPanel } from "../components/MolecularEditPanel";
import { EditAttemptStatus } from "../components/EditAttemptStatus";
import { EditApplyError, EditAttemptController } from "../editing/attempt";
import { createEditAttemptJournal } from "../editing/attemptJournal";
import { wholeResidueSelection } from "../editing/residues";
import { captureSelectionTarget, assertSelectionTargetCurrent } from "../selection/capture";
import { useEditingStore } from "../store/editing";
import { molecularEntry, molecularProject, proteinStructure, componentHierarchy } from "./molecular-fixtures";
const baseAtom = proteinStructure().atoms[0];
const molecule: StructureProjection = {
  entry_id: "ligand", artifact_id: "current-ligand", viewer: { format: "mol", data: "" }, hierarchy: { schema_version: 1, warnings: [], components: [] },
  structure: { schema_version: 1, title: "Chain", structure_type: "ligand", chains: [], residues: [], warnings: [],
    atoms: Array.from({ length: 6 }, (_, index) => ({ ...baseAtom, id: index + 1, name: `C${index + 1}`, element: index === 4 ? "H" : "C", residue_id: null, coordinates: [index, 1, 0] as [number, number, number] })),
    bonds: [[1, 2], [2, 3], [3, 4], [4, 5]].map(([a, b], index) => ({ id: index + 1, atom_1_id: a, atom_2_id: b, order: 1, aromatic: false, stereo: null, inferred: false })),
    conformers: [{ id: 1, name: "3D", coordinates: Array.from({ length: 6 }, (_, i) => [i, 1, 0]) }],
  },
};
const project = molecularProject([{ ...molecularEntry("ligand", "Chain", "ligand"), atom_count: 6, atom_ids: [1, 2, 3, 4, 5, 6] }]);
const selection = (ids = [2, 3]): Selection => ({ schema_version: 1, atoms: ids.map(atom_id => ({ structure_id: "ligand", atom_id })), granularity: "atom", source: "viewer" });
const preview = (values: Partial<ModelPreview> = {}): ModelPreview => ({ entry_id: "ligand", expected_revision: project.revision, expected_artifact_id: "current-ligand", atoms: [], bonds: [], removed_atom_ids: [], warnings: [], ...values });
const result: SelectionEditResult = { project, selection_after: selection(), warnings: [], replacements: {}, report: { operation: "bond.rotate", created_atom_ids: [], created_bond_ids: [], deleted_atom_ids: [], deleted_bond_ids: [], changed_atom_ids: [4, 5], force_field: null, converged: null } };
afterEach(() => { cleanup(); vi.restoreAllMocks(); useEditingStore.getState().setProject(null); sessionStorage.clear(); });
function setup(operand = selection(), source = molecule) {
  const p = { ...project, entries: [{ ...project.entries[0], structure_type: source.structure.structure_type, atom_count: source.structure.atoms.length, atom_ids: source.structure.atoms.map(atom => atom.id) }] };
  useEditingStore.getState().setProject(p.id);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["structure", p.id, "ligand", "current-ligand"], source);
  const onEdit = vi.fn<ApplySelectionEdit>().mockResolvedValue(result), geometry = vi.fn().mockResolvedValue(true), recover = vi.fn();
  const panel = <MolecularEditPanel project={p} selection={operand} busy={false} unavailable={null} onEdit={onEdit} onGeometry={geometry} onRecoverResidue={recover} />;
  const view = render(<QueryClientProvider client={client}>{panel}</QueryClientProvider>);
  return { p, client, onEdit, geometry, recover, view, user: userEvent.setup(), panel };
}
it("exposes setup-only geometry with the exact operand while residue chemistry is unavailable", async () => {
  const source = structuredClone(molecule); source.structure.structure_type = "protein";
  const { user, geometry, onEdit } = setup(selection([2]), source);
  await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  await user.click(screen.getByRole("button", { name: "Residues" }));
  expect(screen.getByRole("button", { name: "Mutate residue to VAL" })).toBeDisabled();
  await user.click(screen.getByText("Geometry", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Advanced minimization setup" }));
  expect(geometry).toHaveBeenCalledExactlyOnceWith("advanced", expect.objectContaining({ projectId: project.id, expectedRevision: project.revision, selection: selection([2]), artifacts: { ligand: "current-ligand" } }));
  expect(onEdit).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
});
it("offers explicit whole-residue recovery outside the disabled mutation fieldset and never executes mutation", async () => {
  const source = structuredClone(molecule); source.structure.structure_type = "protein";
  source.structure.chains = [{ id: 1, name: "A", entity_type: "polymer" }];
  source.structure.residues = [{ id: 1, chain_id: 1, name: "ALA", author_number: 7, label_number: 7, insertion_code: null, component_type: "polymer" }];
  source.structure.atoms.forEach(atom => { atom.residue_id = 1; }); source.hierarchy = componentHierarchy(source.structure);
  const partial = selection([2]), { user, recover, onEdit } = setup(partial, source);
  await user.click(screen.getByRole("button", { name: "Edit molecule" })); await user.click(screen.getByRole("button", { name: "Residues" }));
  expect(screen.getByRole("button", { name: "Mutate residue to VAL" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Select whole residue" })).toBeEnabled();
  expect(recover).not.toHaveBeenCalled(); await user.click(screen.getByRole("button", { name: "Select whole residue" }));
  expect(recover).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ selection: partial })); expect(onEdit).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Edit molecule" })).toHaveFocus();
  expect(wholeResidueSelection(source, partial)?.atoms).toHaveLength(6);
  expect(screen.getByLabelText("Current target chemistry")).toHaveTextContent("ALA 7 · chain A");
});
it("shows current atom charge including unknown with an actionable charge prerequisite", async () => {
  const { user } = setup(selection([2])); await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  expect(screen.getByLabelText("Current target chemistry")).toHaveTextContent("C2 · C · q unknown");
  expect(screen.getByRole("button", { name: "Increase formal charge" })).toBeDisabled();
  expect(screen.getByText("Charge is unknown. Use Advanced atom details to assign it before using charge +/−.")).toBeVisible();
});
it("qualifies the moving side, fixed atom counts and no-op before applying torsion without H controls", async () => {
  const { user, onEdit } = setup();
  const request = vi.spyOn(projectApi, "modelPreview").mockImplementation((_p, _e, _a, _s, action) => Promise.resolve(preview({ rotation: action.operation === "bond.rotate"
    ? { axis_atom_ids: [2, 3], moving_endpoint_id: 3, angle_degrees: action.angle_degrees, rotating_atom_count: 2, fixed_atom_count: 4, no_op: action.angle_degrees === 0 } : null })));
  await user.click(screen.getByRole("button", { name: "Edit molecule" })); await user.click(screen.getByText("Geometry", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Rotate bond" }));
  expect(screen.getByRole("button", { name: "Preview rotation" })).toBeDisabled();
  await user.selectOptions(screen.getByRole("combobox", { name: "Moving side" }), "3");
  await user.click(screen.getByRole("button", { name: "Preview rotation" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Apply placement" })).toBeEnabled());
  const strip = screen.getByRole("group", { name: "Placement inspection" }); expect(within(strip).getByRole("status")).toHaveTextContent("Ready");
  expect(within(strip).getByLabelText("Qualified bond rotation")).toHaveTextContent("C2 → C3 · +30° relative");
  expect(within(strip).getByLabelText("Qualified bond rotation")).toHaveTextContent("2 moving · 4 fixed");
  expect(within(strip).getByLabelText("Qualified bond rotation")).toHaveTextContent("Including all H; both axis atoms fixed.");
  expect(screen.queryByRole("button", { name: "Next direction" })).toBeNull(); expect(screen.queryByRole("button", { name: "Show explicit H" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Placement details" }));
  expect(screen.getByText("Rotating: 2 atoms · fixed: 4 atoms, including both axis atoms.")).toBeVisible();
  await user.clear(screen.getByRole("spinbutton", { name: "Rotation (degrees)" })); await user.type(screen.getByRole("spinbutton", { name: "Rotation (degrees)" }), "0");
  await user.click(screen.getByRole("button", { name: "Preview rotation" }));
  await waitFor(() => expect(screen.getByRole("group", { name: "Placement inspection" })).toHaveTextContent("No change"));
  expect(screen.getByRole("button", { name: "Apply placement" })).toBeDisabled();
  expect(request).toHaveBeenLastCalledWith(project, "ligand", "current-ligand", selection(), { operation: "bond.rotate", moving_endpoint_id: 3, angle_degrees: 0 }, "preserve", expect.any(AbortSignal));
  expect(onEdit).not.toHaveBeenCalled();
});
it("keeps a preview failure visible on the compact strip with explicit retry and no Apply", async () => {
  const { user, onEdit } = setup(selection([2])); vi.spyOn(projectApi, "modelPreview").mockRejectedValue(new Error("Cannot place this fragment"));
  await user.click(screen.getByRole("button", { name: "Edit molecule" })); await user.click(screen.getByText("Add atom", { exact: true })); await user.click(screen.getByRole("button", { name: "Preview atom" }));
  const strip = await screen.findByRole("group", { name: "Placement inspection" });
  await waitFor(() => expect(within(strip).getByRole("alert")).toHaveTextContent("Cannot place this fragment"));
  expect(within(strip).getByRole("status")).toHaveTextContent("Preview unavailable"); expect(within(strip).getByRole("button", { name: "Apply placement" })).toBeDisabled();
  expect(within(strip).getByRole("button", { name: "Retry preview" })).toBeEnabled(); expect(onEdit).not.toHaveBeenCalled();
});
it("exposes preview warnings and partial H before Apply, with full reports in the same editor", async () => {
  const { user } = setup(selection([2])); vi.spyOn(projectApi, "modelPreview").mockResolvedValue(preview({ warnings: [{ code: "draft", severity: "warning", message: "Draft warning", operation: "atom.add", field: null, blocking: false }],
    hydrogen_reconciliation_report: { policy: "automatic", status: "partial", target_count: 2, completed_count: 1, unchanged_count: 0, skipped_count: 1, unprocessed_count: 0,
      added_hydrogen_count: 1, removed_hydrogen_count: 0, moved_hydrogen_count: 0, sites: [], diagnostics: [], reason_counts: { unsupported: 1 }, diagnostics_truncated: false } }));
  await user.click(screen.getByRole("button", { name: "Edit molecule" })); await user.click(screen.getByText("Add atom", { exact: true })); await user.click(screen.getByRole("button", { name: "Preview atom" }));
  await waitFor(() => expect(screen.getByRole("group", { name: "Placement inspection" })).toHaveTextContent("Ready · 1 warning · partial H"));
  await user.click(screen.getByRole("button", { name: "Placement details" }));
  expect(screen.getByText("Draft warning")).toBeVisible(); expect(screen.getByLabelText("Hydrogen reconciliation report")).toBeVisible();
});
it("keeps submitted Apply activity across close/remount without reopening or stealing completion focus", async () => {
  const controller = new EditAttemptController(createEditAttemptJournal(), () => "attempt"), client = new QueryClient();
  client.setQueryData(["structure", project.id, "ligand", "current-ligand"], molecule); useEditingStore.getState().setProject(project.id);
  let release!: (value: SelectionEditResult) => void; const send = vi.fn(() => new Promise<SelectionEditResult>(resolve => { release = resolve; }));
  const edit: ApplySelectionEdit = () => controller.submit({ projectId: project.id, entryId: "ligand", expectedRevision: project.revision, artifactId: "current-ligand", kind: "model", operation: "atom.element", targetLabel: "Chain" }, send);
  function Harness() { const attempt = useSyncExternalStore(controller.subscribe, () => controller.snapshot(project.id)); return <QueryClientProvider client={client}><MolecularEditPanel project={project} selection={selection([2])} busy={false} unavailable={null} attempt={attempt} onEdit={edit} /><button>Another control</button></QueryClientProvider>; }
  const user = userEvent.setup(), first = render(<Harness />); await user.click(screen.getByRole("button", { name: "Edit molecule" })); await user.click(screen.getByRole("button", { name: "Replace selected atom with N" }));
  expect(screen.getByText("Applying…")).toBeVisible(); await user.click(screen.getByRole("button", { name: "Close molecular editor" })); first.unmount(); render(<Harness />);
  expect(screen.getByRole("button", { name: "Edit molecule" })).toHaveAttribute("aria-busy", "true");
  await user.click(screen.getByRole("button", { name: "Another control" }));
  await act(async () => { release(result); await Promise.resolve(); });
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByRole("button", { name: "Another control" })).toHaveFocus(); expect(send).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Edit molecule" })); expect(screen.getByText("Saved")).toBeVisible(); client.clear();
});
it("invalidates captured geometry on project, revision, selection, artifact and epoch changes", () => {
  const operand = selection(), capture = captureSelectionTarget(project, operand, 1), context = { activeProjectId: project.id, selectionProjectId: project.id, projectEpoch: 1, project, selection: operand };
  expect(() => assertSelectionTargetCurrent(capture, context)).not.toThrow();
  for (const changed of [{ ...context, activeProjectId: "other" }, { ...context, projectEpoch: 2 }, { ...context, selection: structuredClone(operand) }, { ...context, project: { ...project, revision: project.revision + 1 } }, { ...context, project: { ...project, entries: [{ ...project.entries[0], current_artifact_id: "new" }] } }]) expect(() => assertSelectionTargetCurrent(capture, changed)).toThrow();
});
it("makes unknown recovery explicit and disables continuation when its reviewed context changes", async () => {
  const user = userEvent.setup(), onReview = vi.fn().mockResolvedValue(undefined), onContinue = vi.fn().mockResolvedValue(undefined);
  const attempt = { phase: "unknown" as const, identity: null, error: null, review: { revision: 8, artifactId: null, undo: "Delete", redo: null, contextKey: "r8" } };
  const view = render(<EditAttemptStatus attempt={attempt} onReview={onReview} onContinue={onContinue} reviewCurrent={false} />);
  expect(screen.getByText("Earlier edit outcome is unknown. It may still arrive.")).toBeVisible(); expect(screen.getByText(/Earlier target is absent/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Continue editing current state" })).toBeDisabled(); await user.click(screen.getByRole("button", { name: "Review current state" })); expect(onReview).toHaveBeenCalledOnce();
  view.rerender(<EditAttemptStatus attempt={attempt} onReview={onReview} onContinue={onContinue} reviewCurrent />);
  await user.click(screen.getByRole("button", { name: "Continue editing current state" })); expect(onContinue).toHaveBeenCalledOnce();
});
it("keeps a definitive Apply rejection on the warned compact preview and starts only a deliberately new attempt", async () => {
  const controller = new EditAttemptController(createEditAttemptJournal(), (() => { let id = 0; return () => `attempt-${++id}`; })());
  const client = new QueryClient(); client.setQueryData(["structure", project.id, "ligand", "current-ligand"], molecule); useEditingStore.getState().setProject(project.id);
  vi.spyOn(projectApi, "modelPreview").mockResolvedValue(preview({ warnings: [{ code: "draft", severity: "warning", message: "Draft warning", operation: "atom.add", field: null, blocking: false }] }));
  const send = vi.fn<(id: string) => Promise<SelectionEditResult>>().mockRejectedValueOnce(new ApiError(422, "invalid_edit", "This attachment cannot be applied")).mockResolvedValue(result);
  const edit: ApplySelectionEdit = (_entry, _artifact, _operand, action) => controller.submit({ projectId: project.id, entryId: "ligand", expectedRevision: project.revision,
    artifactId: "current-ligand", kind: "model", operation: action.operation, targetLabel: "Chain" }, id => {
      const placement = useEditingStore.getState().placement;
      if (placement) useEditingStore.getState().setPlacement({ ...placement, submittedAttemptId: id });
      return send(id);
    });
  function Harness() { const attempt = useSyncExternalStore(controller.subscribe, () => controller.snapshot(project.id)); return <QueryClientProvider client={client}><MolecularEditPanel
    project={project} selection={selection([2])} busy={false} unavailable={null} attempt={attempt} onEdit={edit} /></QueryClientProvider>; }
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Edit molecule" })); await user.click(screen.getByText("Add atom", { exact: true })); await user.click(screen.getByRole("button", { name: "Preview atom" }));
  let strip = await screen.findByRole("group", { name: "Placement inspection" });
  await waitFor(() => expect(strip).toHaveTextContent("Ready · 1 warning"));
  await user.click(within(strip).getByRole("button", { name: "Apply placement" }));
  await waitFor(() => expect(strip).toHaveTextContent("Not applied"));
  expect(within(strip).getByRole("alert")).toHaveTextContent("This attachment cannot be applied");
  expect(send).toHaveBeenCalledExactlyOnceWith("attempt-1"); expect(within(strip).getByRole("button", { name: "Apply placement" })).toBeDisabled();
  await user.click(within(strip).getByRole("button", { name: "Prepare preview again" }));
  strip = screen.getByRole("group", { name: "Placement inspection" });
  await waitFor(() => expect(strip).toHaveTextContent("Ready · 1 warning"));
  expect(within(strip).queryByText("Not applied")).toBeNull(); expect(within(strip).queryByRole("alert")).toBeNull(); expect(send).toHaveBeenCalledOnce();
  await user.click(within(strip).getByRole("button", { name: "Apply placement" })); await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send).toHaveBeenLastCalledWith("attempt-2"); client.clear();
});
it("shows a root pre-dispatch rejection on the actual strip even with an idle App-owned attempt prop", async () => {
  const { user, view, client } = setup(selection([2]));
  const reject = vi.fn<ApplySelectionEdit>().mockRejectedValue(new EditApplyError(new Error("Movement recovery must finish first"), null));
  view.rerender(<QueryClientProvider client={client}><MolecularEditPanel project={project} selection={selection([2])} busy={false} unavailable={null}
    attempt={{ phase: "idle", identity: null, error: null }} onEdit={reject} /></QueryClientProvider>);
  vi.spyOn(projectApi, "modelPreview").mockResolvedValue(preview());
  await user.click(screen.getByRole("button", { name: "Edit molecule" })); await user.click(screen.getByText("Add atom", { exact: true })); await user.click(screen.getByRole("button", { name: "Preview atom" }));
  const strip = await screen.findByRole("group", { name: "Placement inspection" });
  await waitFor(() => expect(within(strip).getByRole("button", { name: "Apply placement" })).toBeEnabled());
  await user.click(within(strip).getByRole("button", { name: "Apply placement" }));
  await waitFor(() => expect(within(strip).getByRole("alert")).toHaveTextContent("Movement recovery must finish first")); expect(reject).toHaveBeenCalledOnce();
});
it("adds a chain ID only when same-labeled chains make the residue target ambiguous", async () => {
  const source = structuredClone(molecule); source.structure.structure_type = "protein";
  source.structure.chains = [{ id: 1, name: "A", entity_type: "polymer" }, { id: 2, name: "A", entity_type: "polymer" }];
  source.structure.residues = [1, 2].map(id => ({ id, chain_id: id, name: "ALA", author_number: 7, label_number: 7, insertion_code: null, component_type: "polymer" }));
  source.structure.atoms[1].residue_id = 2;
  const { user } = setup(selection([2]), source); await user.click(screen.getByRole("button", { name: "Edit molecule" }));
  expect(screen.getByLabelText("Current target chemistry")).toHaveTextContent("ALA 7 · chain A (id 2)");
});
