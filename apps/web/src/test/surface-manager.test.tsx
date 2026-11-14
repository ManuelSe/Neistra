import * as Tooltip from "@radix-ui/react-tooltip";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { SurfaceManager } from "../components/SurfaceManager";
import { molecularEntry, surfaceObject } from "./molecular-fixtures";
import { createSurfaceManagerSession } from "../surfaces/surfaceManagerSession";

afterEach(cleanup);
function fixture() {
  const entry = molecularEntry("protein", "Receptor", "protein");
  entry.viewer_settings.surface_objects = [surfaceObject("first", { kind: "entry" }), surfaceObject("second", {
    kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: "protein", atom_id: 1 }],
  })];
  const props: ComponentProps<typeof SurfaceManager> = { projectId: "project", session: createSurfaceManagerSession("project"), open: true, onOpenChange: vi.fn(), entries: [entry], active: null,
    onActivate: vi.fn(), busy: false, autoFocus: true, statuses: [], onCancel: vi.fn(), onRetry: vi.fn(),
    actions: { create: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) } };
  return { entry, props };
}
const panel = (props: ComponentProps<typeof SurfaceManager>) => <Tooltip.Provider><SurfaceManager {...props} /></Tooltip.Provider>;

it("activates one object without issuing a project mutation, and changes only the requested visibility", async () => {
  const { props } = fixture();
  render(panel(props)); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /entry surface Whole entry/ }));
  expect(props.onActivate).toHaveBeenCalledWith({ entryId: "protein", surfaceId: "first" });
  expect(props.actions.update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Hide surface pocket surface" }));
  expect(props.actions.update).toHaveBeenCalledWith("protein", "second", { visible: false });
  expect(props.actions.remove).not.toHaveBeenCalled();
});

it("removes an unavailable saved pocket without requiring selection or protein eligibility", async () => {
  const { props } = fixture();
  props.statuses = [{ entryId: "protein", surfaceId: "second", channel: "pocket", label: "Pocket", state: "fallback", message: "No protein context is available." }];
  render(panel(props)); const user = userEvent.setup();
  expect(screen.getByText("No protein context is available.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Remove surface pocket surface" }));
  expect(props.actions.remove).toHaveBeenCalledWith("protein", "second");
});

it("renames the active object and reflects external undo rather than keeping a stale draft", async () => {
  const { props, entry } = fixture(); props.active = { entryId: "protein", surfaceId: "first" };
  const view = render(panel(props)); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Rename surface entry surface" }));
  const input = screen.getByRole("textbox", { name: "Surface name" });
  await user.clear(input); await user.type(input, "Binding site");
  await user.click(screen.getByRole("button", { name: "Save name" }));
  expect(props.actions.update).toHaveBeenCalledWith("protein", "first", { name: "Binding site" });
  const changed = structuredClone(entry); changed.viewer_settings.surface_objects[0].name = "From undo";
  view.rerender(panel({ ...props, entries: [changed] }));
  await user.click(screen.getByRole("button", { name: "Rename surface From undo" }));
  expect(screen.getByRole("textbox", { name: "Surface name" })).toHaveValue("From undo");
});

it("keeps errors named to the affected object and prevents overlapping operations", async () => {
  const { props } = fixture();
  let reject!: (error: Error) => void;
  props.actions.update = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
  render(panel(props)); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Hide surface entry surface" }));
  expect(screen.getByRole("button", { name: "Remove surface pocket surface" })).toHaveAttribute("aria-disabled", "true");
  reject(new Error("Revision conflict. Reload."));
  expect(await screen.findByRole("alert")).toHaveTextContent("entry surface: Revision conflict. Reload.");
  await waitFor(() => expect(screen.getByRole("button", { name: "Remove surface pocket surface" })).toHaveAttribute("aria-disabled", "false"));
});

it("preserves requested visibility under a hidden parent and exposes per-object worker cancellation", async () => {
  const { props, entry } = fixture(); entry.visible = false;
  props.statuses = [{ entryId: "protein", surfaceId: "second", channel: "pocket", label: "Pocket", state: "rendering", message: "Calculating" }];
  render(panel(props)); const user = userEvent.setup();
  expect(screen.getAllByText("Parent hidden").length).toBe(2);
  expect(screen.getByRole("button", { name: "Hide surface pocket surface" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Cancel calculation" }));
  expect(props.onCancel).toHaveBeenCalledWith("protein", entry.viewer_settings.surface_objects[1]);
});

it("opens the shared chooser without an atom selection and activates only the exact first created identity", async () => {
  const { props } = fixture(), user = userEvent.setup();
  const identities = [{ entryId: "protein", surfaceId: "created-a" }, { entryId: "protein", surfaceId: "created-b" }];
  props.actions.create = vi.fn().mockResolvedValue(identities);
  render(panel(props));
  await user.click(screen.getByRole("button", { name: "Create surface" }));
  await user.click(screen.getByRole("button", { name: "Whole entry" }));
  await user.click(screen.getByRole("button", { name: "Create entry surface" }));
  expect(props.onActivate).toHaveBeenCalledExactlyOnceWith(identities[0]);
  expect(await screen.findByText("2 surfaces created.")).toBeVisible();
  expect(props.actions.update).not.toHaveBeenCalled();
});

it("keeps the object list separate from details and retains unapplied sources across closing and reopening", async () => {
  const { props, entry } = fixture(), user = userEvent.setup();
  entry.viewer_settings.surface_objects[0] = surfaceObject("first", { kind: "fragment", profile: "molecular-v1", atom_ids: [1] });
  props.active = { entryId: entry.id, surfaceId: "first" }; props.selection = [{ structure_id: entry.id, atom_id: 2 }];
  const view = render(panel(props));
  await user.click(screen.getByText("Source", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Capture fragment from selection" }));
  expect(screen.getByRole("button", { name: /fragment surface Captured fragment · unapplied/ })).toBeVisible();
  expect(screen.getByRole("button", { name: "Apply source" }).closest(".surface-object-list")).toBeNull();
  view.rerender(panel({ ...props, open: false }));
  view.rerender(panel({ ...props, selection: [{ structure_id: entry.id, atom_id: 3 }] }));
  await user.click(screen.getByRole("button", { name: "Apply source" }));
  expect(props.actions.update).toHaveBeenCalledWith(entry.id, "first", { source: { kind: "fragment", profile: "molecular-v1", atom_ids: [2] } });
});

it("never activates a late created object after the manager has been retired", async () => {
  const { props } = fixture(), user = userEvent.setup();
  props.creationRequest = { id: "entry", kind: "entry", entryId: "protein", selection: [] };
  let finish!: (value: { entryId: string; surfaceId: string }[]) => void;
  props.actions.create = vi.fn(() => new Promise<{ entryId: string; surfaceId: string }[]>(resolve => { finish = resolve; }));
  const view = render(panel(props));
  await user.click(screen.getByRole("button", { name: "Create entry surface" }));
  view.unmount();
  await act(async () => { finish([{ entryId: "protein", surfaceId: "late" }]); await Promise.resolve(); });
  expect(props.onActivate).not.toHaveBeenCalled();
});

it("refreshes an unconfirmed creation without guessing identities or replaying the command", async () => {
  const { props } = fixture(), user = userEvent.setup();
  props.creationRequest = { id: "entry", kind: "entry", entryId: "protein", selection: [] };
  props.actions.create = vi.fn().mockRejectedValue(new Error("Interrupted"));
  props.actions.refresh = vi.fn().mockResolvedValue(props.entries);
  render(panel(props));
  await user.click(screen.getByRole("button", { name: "Create entry surface" }));
  await waitFor(() => expect(props.actions.refresh).toHaveBeenCalledOnce());
  expect(props.actions.create).toHaveBeenCalledOnce();
  expect(props.onActivate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Create entry surface" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getAllByText(/Inspect saved surfaces before creating again/).length).toBeGreaterThan(0);
});

it("recovers an uncertain appearance through Check again and allows a new independent gesture", async () => {
  const { props, entry } = fixture(), user = userEvent.setup();
  props.active = { entryId: entry.id, surfaceId: "first" };
  props.actions.update = vi.fn().mockRejectedValueOnce(new Error("Interrupted")).mockResolvedValue(undefined);
  const view = render(panel(props));
  props.actions.refresh = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockImplementation(() => {
    const next = structuredClone(entry); next.viewer_settings.surface_objects[0].appearance.opacity = 0.55;
    view.rerender(panel({ ...props, entries: [next] })); return Promise.resolve([next]);
  });
  view.rerender(panel(props));
  const input = screen.getByLabelText("Surface opacity");
  fireEvent.change(input, { target: { value: "0.2" } }); fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByRole("button", { name: "Check again" });
  expect(input).toHaveAttribute("readonly");
  await user.click(screen.getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(input).not.toHaveAttribute("readonly"));
  expect(input).toHaveValue(0.55);
  fireEvent.keyDown(input, { key: "6" }); fireEvent.change(input, { target: { value: "0.65" } }); fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(props.actions.update).toHaveBeenCalledTimes(2));
  expect(props.actions.refresh).toHaveBeenCalledTimes(2);
});

it("lets the first Escape cancel an appearance gesture before the dialog capture handler can dismiss it", async () => {
  const { props } = fixture(), user = userEvent.setup();
  props.active = { entryId: "protein", surfaceId: "first" };
  render(<><button type="button">Outside surface controls</button>{panel(props)}</>);
  const input = screen.getByLabelText("Surface opacity");
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "0.7" } });
  expect(Object.values(props.session.getSnapshot().previews)[0]?.phase).toBe("gesture");
  await user.keyboard("{Escape}");
  expect(props.onOpenChange).not.toHaveBeenCalled();
  expect(props.session.getSnapshot().previews).toEqual({});
  expect(input).toHaveValue(0.45);
  expect(props.actions.update).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(props.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  vi.mocked(props.onOpenChange).mockClear();
  await user.click(screen.getByRole("button", { name: "Outside surface controls" }));
  await user.keyboard("{Escape}");
  expect(props.onOpenChange).not.toHaveBeenCalled();
});
