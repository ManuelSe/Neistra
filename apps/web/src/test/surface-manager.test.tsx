import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { SurfaceManager } from "../components/SurfaceManager";
import { molecularEntry, surfaceObject } from "./molecular-fixtures";

afterEach(cleanup);
function fixture() {
  const entry = molecularEntry("protein", "Receptor", "protein");
  entry.viewer_settings.surface_objects = [surfaceObject("first", { kind: "entry" }), surfaceObject("second", {
    kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: "protein", atom_id: 1 }],
  })];
  const props: ComponentProps<typeof SurfaceManager> = { open: true, onOpenChange: vi.fn(), entries: [entry], active: null,
    onActivate: vi.fn(), busy: false, autoFocus: true, statuses: [], onCancel: vi.fn(), onRetry: vi.fn(),
    actions: { create: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) } };
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
  const input = screen.getByRole("textbox", { name: "Surface name" });
  await user.clear(input); await user.type(input, "Binding site");
  await user.click(screen.getByRole("button", { name: "Rename" }));
  expect(props.actions.update).toHaveBeenCalledWith("protein", "first", { name: "Binding site" });
  const changed = structuredClone(entry); changed.viewer_settings.surface_objects[0].name = "From undo";
  view.rerender(panel({ ...props, entries: [changed] }));
  expect(input).toHaveValue("From undo");
});

it("keeps errors named to the affected object and prevents overlapping operations", async () => {
  const { props } = fixture();
  let reject!: (error: Error) => void;
  props.actions.update = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
  render(panel(props)); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Hide surface entry surface" }));
  expect(screen.getByRole("button", { name: "Remove surface pocket surface" })).toBeDisabled();
  reject(new Error("Revision conflict. Reload."));
  expect(await screen.findByRole("alert")).toHaveTextContent("entry surface: Revision conflict. Reload.");
  await waitFor(() => expect(screen.getByRole("button", { name: "Remove surface pocket surface" })).toBeEnabled());
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
