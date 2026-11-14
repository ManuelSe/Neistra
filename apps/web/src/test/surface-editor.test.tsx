import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SurfaceEditor } from "../components/SurfaceEditor";
import { createSurfaceManagerSession, surfaceObjectKey } from "../surfaces/surfaceManagerSession";
import { molecularEntry, proteinProjection, surfaceObject } from "./molecular-fixtures";
import { capturedFragmentSource, surfaceSourceAtoms } from "../selection/surfaceSources";

afterEach(cleanup);
function fixture(kind: "fragment" | "pocket" = "fragment") {
  const entry = molecularEntry("e", "Receptor", "protein");
  const surface = surfaceObject("surface", kind === "fragment" ? { kind: "fragment", profile: "molecular-v1", atom_ids: [1, 2] }
    : { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: "e", atom_id: 1 }] });
  entry.viewer_settings.surface_objects = [surface];
  const props: ComponentProps<typeof SurfaceEditor> = { projectId: "project", session: createSurfaceManagerSession("project"), entries: [entry], entry, surface,
    selection: [], busy: false, onSave: vi.fn().mockResolvedValue(undefined), onPreviewAppearance: vi.fn() };
  return { entry, surface, props };
}

it("previews many opacity inputs and publishes once at the completed keyboard gesture without losing focus", async () => {
  const { props, surface } = fixture();
  let finish!: () => void;
  props.onSave = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const view = render(<SurfaceEditor {...props} />);
  const input = screen.getByLabelText("Surface opacity"); act(() => input.focus());
  fireEvent.change(input, { target: { value: "0.3" } });
  fireEvent.change(input, { target: { value: "0.35" } });
  expect(props.onSave).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" }); fireEvent.blur(input);
  expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ appearance: { ...surface.appearance, opacity: 0.35 } });
  expect(input).toHaveFocus(); expect(input).not.toBeDisabled();
  await act(async () => { finish(); await Promise.resolve(); });
  const accepted = { ...surface, appearance: { ...surface.appearance, opacity: 0.35 } };
  view.rerender(<SurfaceEditor {...props} surface={accepted} />);
  await waitFor(() => expect(props.session.getSnapshot().previews).toEqual({}));
  expect(props.onPreviewAppearance).toHaveBeenLastCalledWith({ entryId: "e", surfaceId: "surface" }, null);
});

it("cancels pointer/Escape/retirement previews and suppresses unchanged gestures", () => {
  const { props } = fixture();
  const view = render(<SurfaceEditor {...props} />);
  const slider = screen.getByLabelText("Surface opacity slider");
  fireEvent.pointerDown(slider); fireEvent.change(slider, { target: { value: "0.2" } }); fireEvent.pointerCancel(slider); fireEvent.blur(slider);
  fireEvent.change(slider, { target: { value: "0.3" } }); fireEvent.keyDown(slider, { key: "Escape" }); fireEvent.blur(slider);
  fireEvent.pointerDown(slider); fireEvent.pointerUp(slider);
  expect(props.onSave).not.toHaveBeenCalled();
  fireEvent.change(slider, { target: { value: "0.4" } }); view.unmount();
  expect(props.session.getSnapshot().previews).toEqual({});
  expect(props.onSave).not.toHaveBeenCalled();
});

it("uses native color completion rather than each input and deduplicates change plus blur", async () => {
  const { props, surface } = fixture(); surface.appearance.color_by = "custom";
  render(<SurfaceEditor {...props} />);
  const input = screen.getByLabelText("Surface uniform color");
  fireEvent.input(input, { target: { value: "#ff0000" } });
  fireEvent.input(input, { target: { value: "#00ff00" } });
  expect(props.onSave).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "#00ff00" } }); fireEvent.blur(input);
  await waitFor(() => expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ appearance: { ...surface.appearance, custom_color: "#00ff00", inherit_atom_colors: false } }));
});

it("refreshes an ambiguous appearance failure without replaying or claiming a rollback", async () => {
  const { props, entry } = fixture();
  props.onSave = vi.fn().mockRejectedValue(new Error("Connection interrupted"));
  props.refresh = vi.fn().mockResolvedValue([entry]);
  render(<SurfaceEditor {...props} />);
  const input = screen.getByLabelText("Surface opacity");
  fireEvent.change(input, { target: { value: "0.2" } }); fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(props.refresh).toHaveBeenCalledOnce());
  await waitFor(() => expect(props.session.getSnapshot().previews).toEqual({}));
  expect(props.onSave).toHaveBeenCalledOnce();
  expect(props.session.getSnapshot().feedback?.text).toMatch(/Current settings refreshed/);
  expect(props.session.getSnapshot().feedback?.text).not.toMatch(/restored|not saved/i);
});

it("retains an unconfirmed preview and Check again feedback when the fresh read also fails", async () => {
  const { props } = fixture();
  props.onSave = vi.fn().mockRejectedValue(new Error("Connection interrupted"));
  props.refresh = vi.fn().mockRejectedValue(new Error("Offline"));
  render(<SurfaceEditor {...props} />);
  const input = screen.getByLabelText("Surface opacity");
  fireEvent.change(input, { target: { value: "0.2" } }); fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(Object.values(props.session.getSnapshot().previews)[0]?.phase).toBe("uncertain"));
  expect(props.session.getSnapshot().feedback?.recheck).toBe(true);
  fireEvent.change(input, { target: { value: "0.3" } }); fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onSave).toHaveBeenCalledOnce();
});

it.each(["appearance", "source", "object hidden", "parent hidden"] as const)("retires an uncommitted gesture on a conflicting canonical %s change before blur", async change => {
  const { props, entry, surface } = fixture();
  const view = render(<SurfaceEditor {...props} />);
  const input = screen.getByLabelText("Surface opacity");
  fireEvent.change(input, { target: { value: "0.2" } });
  const changed = { ...surface, appearance: { ...surface.appearance } };
  const owner = { ...entry };
  if (change === "appearance") changed.appearance.opacity = 0.8;
  if (change === "source") changed.source = { kind: "fragment", profile: "molecular-v1", atom_ids: [3] };
  if (change === "object hidden") changed.visible = false;
  if (change === "parent hidden") owner.visible = false;
  view.rerender(<SurfaceEditor {...props} entry={owner} surface={changed} />);
  fireEvent.blur(input);
  await waitFor(() => expect(props.session.getSnapshot().previews).toEqual({}));
  expect(props.onSave).not.toHaveBeenCalled();
  expect(input).toHaveValue(changed.appearance.opacity);
  expect(props.onPreviewAppearance).toHaveBeenLastCalledWith({ entryId: "e", surfaceId: "surface" }, null);
});

it("does not let a retired submission clear a newer gesture when its failure settles", async () => {
  const { props, surface, entry } = fixture();
  let fail!: (error: Error) => void;
  props.onSave = vi.fn(() => new Promise<void>((_, reject) => { fail = reject; }));
  const confirmed = { ...surface, appearance: { ...surface.appearance, opacity: 0.6 } };
  const owner = { ...entry, viewer_settings: { ...entry.viewer_settings, surface_objects: [confirmed] } };
  props.refresh = vi.fn().mockResolvedValue([owner]);
  const view = render(<SurfaceEditor {...props} />);
  const input = screen.getByLabelText("Surface opacity");
  fireEvent.change(input, { target: { value: "0.2" } }); fireEvent.keyDown(input, { key: "Enter" });
  view.rerender(<SurfaceEditor {...props} entry={owner} surface={confirmed} />);
  await waitFor(() => expect(props.session.getSnapshot().previews).toEqual({}));
  fireEvent.keyDown(input, { key: "7" }); fireEvent.change(input, { target: { value: "0.7" } });
  const next = Object.values(props.session.getSnapshot().previews)[0];
  await act(async () => { fail(new Error("Late response failure")); await Promise.resolve(); });
  expect(Object.values(props.session.getSnapshot().previews)[0]).toEqual(next);
  expect(next.appearance.opacity).toBe(0.7);
  expect(props.onSave).toHaveBeenCalledOnce();
});

it.each(["pointer", "paste", "text insertion", "focus"] as const)("accepts a fresh opacity %s intent after Escape without reviving trailing input", async intent => {
  const { props, surface } = fixture();
  render(<SurfaceEditor {...props} />);
  const input = screen.getByLabelText("Surface opacity");
  fireEvent.change(input, { target: { value: "0.2" } }); fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.change(input, { target: { value: "0.3" } }); fireEvent.blur(input);
  expect(props.onSave).not.toHaveBeenCalled();
  expect(input).toHaveValue(surface.appearance.opacity);
  if (intent === "pointer") fireEvent.pointerDown(input);
  if (intent === "paste") fireEvent.paste(input);
  if (intent === "focus") fireEvent.focus(input);
  if (intent === "text insertion") fireEvent(input, new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: "0.35" }));
  fireEvent.change(input, { target: { value: "0.35" } });
  if (intent === "pointer") fireEvent.pointerUp(input);
  fireEvent.blur(input);
  await waitFor(() => expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ appearance: { ...surface.appearance, opacity: 0.35 } }));
});

it("accepts a new spinner gesture after a canonical conflict and keeps its latest baseline", async () => {
  const { props, surface } = fixture();
  const view = render(<SurfaceEditor {...props} />);
  const input = screen.getByLabelText("Surface opacity");
  fireEvent.change(input, { target: { value: "0.2" } });
  const changed = { ...surface, appearance: { ...surface.appearance, opacity: 0.6 } };
  view.rerender(<SurfaceEditor {...props} surface={changed} />);
  fireEvent.change(input, { target: { value: "0.25" } }); fireEvent.blur(input);
  expect(props.onSave).not.toHaveBeenCalled(); expect(input).toHaveValue(0.6);
  fireEvent.pointerDown(input); fireEvent.change(input, { target: { value: "0.65" } });
  fireEvent.change(input, { target: { value: "0.7" } }); fireEvent.pointerUp(input); fireEvent.blur(input);
  await waitFor(() => expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ appearance: { ...changed.appearance, opacity: 0.7 } }));
});

it("captures a fragment explicitly, retains its draft through remount and applies only that capture", async () => {
  const { props } = fixture(), user = userEvent.setup();
  const view = render(<SurfaceEditor {...props} selection={[{ structure_id: "e", atom_id: 3 }]} />);
  await user.click(screen.getByText("Source", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Capture fragment from selection" }));
  expect(props.onSave).not.toHaveBeenCalled();
  view.unmount();
  render(<SurfaceEditor {...props} selection={[{ structure_id: "e", atom_id: 1 }]} />);
  expect(screen.getByText(/Unapplied changes/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Apply source" }));
  expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ source: { kind: "fragment", profile: "molecular-v1", atom_ids: [3] } });
  await waitFor(() => expect(props.session.hasUnappliedDrafts()).toBe(false));
});

it("distinguishes saved pocket seeds from protein context and stages radius and seed replacements", async () => {
  const { props, surface } = fixture("pocket"), user = userEvent.setup();
  props.onSelect = vi.fn(); props.load = vi.fn().mockResolvedValue(proteinProjection());
  const view = render(<SurfaceEditor {...props} selection={[{ structure_id: "e", atom_id: 2 }]} />);
  await user.click(screen.getByText("Source", { exact: true }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Select protein context" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Select seeds" }));
  expect(props.onSelect).toHaveBeenLastCalledWith(surface.source.kind === "pocket" ? surface.source.seed_atom_references : []);
  await user.click(screen.getByRole("button", { name: "Select protein context" }));
  expect(props.onSelect).toHaveBeenLastCalledWith(surfaceSourceAtoms(props.entry, surface, proteinProjection()));
  await user.clear(screen.getByLabelText("Surface pocket radius")); await user.type(screen.getByLabelText("Surface pocket radius"), "5.5");
  await user.click(screen.getByRole("button", { name: "Capture seeds from selection" }));
  expect(props.onSave).not.toHaveBeenCalled();
  view.rerender(<SurfaceEditor {...props} selection={[{ structure_id: "e", atom_id: 3 }]} />);
  await user.click(screen.getByRole("button", { name: "Apply source" }));
  expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ source: { kind: "pocket", profile: "pocket-v1", radius: 5.5, seed_atom_references: [{ structure_id: "e", atom_id: 2 }] } });
});

it("ignores stale context completion and keeps unavailable source definitions reversible", async () => {
  const { props, entry } = fixture("pocket");
  let finish!: (value: ReturnType<typeof proteinProjection>) => void;
  props.load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValue(new Error("Missing artifact"));
  const view = render(<SurfaceEditor {...props} />);
  await userEvent.setup().click(screen.getByText("Source", { exact: true }));
  view.rerender(<SurfaceEditor {...props} entry={{ ...entry, current_artifact_id: "new" }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Missing artifact");
  await act(async () => { finish(proteinProjection()); await Promise.resolve(); });
  expect(screen.getByRole("button", { name: "Select protein context" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Retry source context" })).toBeEnabled();
  expect(props.session.getSnapshot().drafts[surfaceObjectKey({ entryId: entry.id, surfaceId: props.surface.id })]).toBeUndefined();
  expect(() => capturedFragmentSource(entry, [{ structure_id: "other", atom_id: 1 }])).toThrow("only to this entry");
});
