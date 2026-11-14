import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SurfaceCreateForm } from "../components/SurfaceCreateForm";
import { molecularEntry, proteinProjection, surfaceObject } from "./molecular-fixtures";

afterEach(cleanup);
function fixture() {
  const entry = molecularEntry("protein", "Receptor", "protein");
  const captured = [{ structure_id: entry.id, atom_id: 1 }];
  const props: ComponentProps<typeof SurfaceCreateForm> = { request: { id: "request", kind: "pocket", selection: captured },
    entries: [entry], selection: captured, busy: false,
    loadPocketStructures: vi.fn().mockResolvedValue(new Map([[entry.id, proteinProjection()]])),
    onCreate: vi.fn().mockResolvedValue(undefined), onCancel: vi.fn() };
  return { entry, props };
}

it("captures seeds once, preserves them as the central selection changes, and recaptures only explicitly", async () => {
  const { props } = fixture(), user = userEvent.setup();
  const view = render(<SurfaceCreateForm {...props} />);
  await screen.findByDisplayValue("Receptor");
  view.rerender(<SurfaceCreateForm {...props} selection={[{ structure_id: "protein", atom_id: 2 }]} />);
  await user.click(screen.getByRole("button", { name: "Create pocket" }));
  expect(props.onCreate).toHaveBeenLastCalledWith([{ entry_id: "protein", source: { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: props.request.selection } }]);
  await user.click(screen.getByRole("button", { name: "Use current selection" }));
  await user.click(screen.getByRole("button", { name: "Create pocket" }));
  expect(props.onCreate).toHaveBeenLastCalledWith([{ entry_id: "protein", source: { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: "protein", atom_id: 2 }] } }]);
});

it("creates a new source independently of existing pockets and validates the fixed radius contract", async () => {
  const { props, entry } = fixture(), user = userEvent.setup();
  entry.viewer_settings.surface_objects = [surfaceObject("saved", { kind: "pocket", profile: "pocket-v1", radius: 6, seed_atom_references: props.selection })];
  render(<SurfaceCreateForm {...props} />);
  await screen.findByDisplayValue("Receptor");
  await user.clear(screen.getByLabelText("Surface creation radius")); await user.type(screen.getByLabelText("Surface creation radius"), "2.1");
  expect(screen.getByRole("button", { name: "Create pocket" })).toBeDisabled();
  expect(screen.getByText("Use a radius from 2 to 12 Å in 0.5 Å steps.")).toBeVisible();
  await user.clear(screen.getByLabelText("Surface creation radius")); await user.type(screen.getByLabelText("Surface creation radius"), "5.5");
  await user.click(screen.getByRole("button", { name: "Create pocket" }));
  expect(props.onCreate).toHaveBeenCalledOnce();
  expect(entry.viewer_settings.surface_objects[0].source).toMatchObject({ radius: 6 });
});

it("requires an explicit choice among multiple eligible receptors and follows current imports", async () => {
  const { props, entry } = fixture(), other = { ...entry, id: "other", name: "Other" }, user = userEvent.setup();
  props.loadPocketStructures = vi.fn().mockResolvedValue(new Map([[entry.id, proteinProjection()], [other.id, proteinProjection()]]));
  const view = render(<SurfaceCreateForm {...props} entries={[entry, other]} />);
  await screen.findByText("Choose a receptor.");
  expect(screen.getByLabelText("Surface receptor")).toHaveValue("");
  await user.selectOptions(screen.getByLabelText("Surface receptor"), "other");
  expect(screen.getByRole("button", { name: "Create pocket" })).toBeEnabled();
  view.rerender(<SurfaceCreateForm {...props} entries={[entry]} />);
  await screen.findByDisplayValue("Receptor");
});

it("keeps definitions manageable when protein eligibility disappears and rejects stale loading responses", async () => {
  const { props, entry } = fixture();
  entry.viewer_settings.surface_objects = [surfaceObject("saved", { kind: "entry" })];
  let finish!: (value: Map<string, ReturnType<typeof proteinProjection>>) => void;
  const empty = proteinProjection(); empty.hierarchy.components = [];
  props.loadPocketStructures = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue(new Map([[entry.id, empty]]));
  const view = render(<SurfaceCreateForm {...props} />);
  view.rerender(<SurfaceCreateForm {...props} entries={[{ ...entry, current_artifact_id: "new" }]} />);
  await screen.findByText("No entry contains protein context.");
  await act(async () => { finish(new Map([[entry.id, proteinProjection()]])); await Promise.resolve(); });
  expect(screen.getByRole("button", { name: "Create pocket" })).toBeDisabled();
  expect(entry.viewer_settings.surface_objects).toHaveLength(1);
});

it("supports whole-entry creation with an empty atom selection without loading protein context", async () => {
  const { props, entry } = fixture(), user = userEvent.setup();
  render(<SurfaceCreateForm {...props} request={{ id: "entry", kind: "entry", entryId: entry.id, selection: [] }} selection={[]} />);
  expect(props.loadPocketStructures).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Create entry surface" }));
  expect(props.onCreate).toHaveBeenCalledExactlyOnceWith([{ entry_id: entry.id, source: { kind: "entry" } }]);
});

it("creates exact per-owner fragments atomically, retaining captured request order", async () => {
  const { props, entry } = fixture(), other = { ...entry, id: "other", name: "Other" };
  const atoms = [{ structure_id: "other", atom_id: 3 }, { structure_id: "protein", atom_id: 2 }, { structure_id: "other", atom_id: 1 }];
  render(<SurfaceCreateForm {...props} entries={[entry, other]} request={{ id: "fragments", kind: "fragment", selection: atoms }} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Create fragment" }));
  expect(props.onCreate).toHaveBeenCalledExactlyOnceWith([
    { entry_id: "other", source: { kind: "fragment", profile: "molecular-v1", atom_ids: [1, 3] } },
    { entry_id: "protein", source: { kind: "fragment", profile: "molecular-v1", atom_ids: [2] } },
  ]);
  expect(props.loadPocketStructures).not.toHaveBeenCalled();
});

it("does not replay unconfirmed creation or silently retarget after captured atoms disappear", async () => {
  const { props, entry } = fixture(), user = userEvent.setup();
  props.onCreate = vi.fn().mockRejectedValue(new Error("Connection interrupted. Inspect saved surfaces before creating again."));
  const view = render(<SurfaceCreateForm {...props} request={{ ...props.request, kind: "fragment" }} />);
  await user.click(screen.getByRole("button", { name: "Create fragment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Inspect saved surfaces");
  expect(screen.getByRole("button", { name: "Create fragment" })).toHaveAttribute("aria-disabled", "true");
  expect(props.onCreate).toHaveBeenCalledOnce();
  view.unmount();
  render(<SurfaceCreateForm {...props} request={{ ...props.request, kind: "fragment" }} entries={[{ ...entry, atom_ids: [2, 3] }]} />);
  expect(screen.getByText("Capture a valid, nonempty selection.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Create fragment" })).toBeDisabled();
});

it("retains creation publication uncertainty across kind, owner and capture changes without replay", async () => {
  const { props, entry } = fixture(), user = userEvent.setup();
  const other = { ...entry, id: "other", name: "Other" };
  props.onCreate = vi.fn().mockRejectedValue(new Error("Creation response interrupted."));
  props.loadPocketStructures = vi.fn().mockResolvedValue(new Map([[entry.id, proteinProjection()], [other.id, proteinProjection()]]));
  render(<SurfaceCreateForm {...props} entries={[entry, other]} request={{ id: "uncertain", kind: "entry", entryId: entry.id, selection: props.selection }} />);
  await user.click(screen.getByRole("button", { name: "Create entry surface" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Creation response interrupted.");
  await user.selectOptions(screen.getByLabelText("Surface entry"), other.id);
  expect(screen.getByRole("alert")).toHaveTextContent("Creation response interrupted.");
  expect(screen.getByRole("button", { name: "Create entry surface" })).toHaveAttribute("aria-disabled", "true");
  await user.click(screen.getByRole("button", { name: "Selected atoms" }));
  await user.click(screen.getByRole("button", { name: "Use current selection" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Creation response interrupted.");
  expect(screen.getByRole("button", { name: "Create fragment" })).toHaveAttribute("aria-disabled", "true");
  await user.click(screen.getByRole("button", { name: "Create fragment" }));
  expect(props.onCreate).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Around selection" }));
  await screen.findByDisplayValue("Other");
  expect(screen.getByRole("alert")).toHaveTextContent("Creation response interrupted.");
  expect(screen.getByRole("button", { name: "Create pocket" })).toHaveAttribute("aria-disabled", "true");
  await user.click(screen.getByRole("button", { name: "Inspect saved surfaces" }));
  expect(props.onCancel).toHaveBeenCalledOnce();
});
