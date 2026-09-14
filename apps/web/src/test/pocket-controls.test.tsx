import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ChangePocketSurface, Entry, Selection } from "../api/types";
import { PocketSurfaceControls } from "../components/PocketSurfaceControls";
import { molecularEntry, proteinProjection } from "./molecular-fixtures";

afterEach(cleanup);
const receptor = () => molecularEntry("protein", "Receptor", "protein");
const selection = (id = 1): Selection => ({ schema_version: 1, atoms: [{ structure_id: "protein", atom_id: id }], granularity: "atom", source: "inspector" });
const load = vi.fn(() => Promise.resolve(new Map([["protein", proteinProjection()], ["other", proteinProjection()]])));
function panel(entries: Entry[], target: Selection, onPocket = vi.fn<ChangePocketSurface>().mockResolvedValue(undefined)) {
  return <Tooltip.Provider><PocketSurfaceControls entries={entries} selection={target}
    busy={false} onPocket={onPocket} load={load} /></Tooltip.Provider>;
}
async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Surface options" }));
  await user.click(screen.getByRole("menuitem", { name: "Pocket…" }));
  return user;
}
it("captures selection, preserves draft across selection changes, and explicitly recaptures", async () => {
  const entry = receptor(), onPocket = vi.fn<ChangePocketSurface>().mockResolvedValue(undefined);
  const view = render(panel([entry], selection(), onPocket));
  const user = await open();
  await screen.findByText("1 captured seeds");
  view.rerender(panel([entry], selection(2), onPocket));
  await user.click(screen.getByRole("button", { name: "Apply pocket" }));
  expect(onPocket.mock.calls[0][1]?.seed_atom_references).toEqual(selection().atoms);
  await user.click(screen.getByRole("button", { name: "Use selection" }));
  await user.click(screen.getByRole("button", { name: "Apply pocket" }));
  expect(onPocket.mock.calls[1][1]?.seed_atom_references).toEqual(selection(2).atoms);
  await user.click(screen.getByRole("button", { name: "Close surface panel" }));
  expect(screen.getByRole("button", { name: "Surface options" })).toHaveFocus();
});
it("loads saved seeds, permits empty-selection removal, validates radius and discards drafts", async () => {
  const entry = receptor(), onPocket = vi.fn<ChangePocketSurface>().mockResolvedValue(undefined);
  entry.viewer_settings.selection_pocket_surface = { profile: "pocket-v1", radius: 6, seed_atom_references: selection().atoms };
  render(panel([entry], { ...selection(), atoms: [] }, onPocket));
  const user = await open();
  await screen.findByDisplayValue("6");
  await user.clear(screen.getByRole("spinbutton", { name: "Pocket radius" }));
  await user.type(screen.getByRole("spinbutton", { name: "Pocket radius" }), "2.1");
  expect(screen.getByRole("button", { name: "Apply pocket" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Remove pocket" }));
  expect(onPocket).toHaveBeenCalledWith("protein", null);
  await user.click(screen.getByRole("button", { name: "Close surface panel" }));
  await open();
  await screen.findByDisplayValue("6");
});
it("requires explicit choice for multiple receptors and explains no receptor", async () => {
  const entries = [receptor(), { ...receptor(), id: "other", name: "Other" }];
  const view = render(panel(entries, selection()));
  const user = await open();
  await screen.findByText("Choose a receptor.");
  expect(screen.getByRole("button", { name: "Apply pocket" })).toBeDisabled();
  await user.selectOptions(screen.getByRole("combobox", { name: "Pocket receptor" }), "other");
  expect(screen.getByRole("button", { name: "Apply pocket" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Close surface panel" }));
  view.rerender(panel([], selection()));
  await open();
  await screen.findByText("No entry contains protein context.");
});

it("keeps removal accessible when saved receptor protein context becomes empty", async () => {
  const entry = receptor(), onPocket = vi.fn<ChangePocketSurface>().mockResolvedValue(undefined);
  entry.viewer_settings.selection_pocket_surface = { profile: "pocket-v1", radius: 5, seed_atom_references: selection().atoms };
  const empty = proteinProjection(); empty.hierarchy.components = [];
  render(<Tooltip.Provider><PocketSurfaceControls entries={[entry]} selection={{ ...selection(), atoms: [] }}
    busy={false} onPocket={onPocket} load={() => Promise.resolve(new Map([["protein", empty]]))} /></Tooltip.Provider>);
  const user = await open();
  await screen.findByText("This receptor has no current protein context.");
  expect(screen.getByRole("button", { name: "Apply pocket" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Remove pocket" }));
  expect(onPocket).toHaveBeenCalledWith("protein", null);
});

it("uses current entry eligibility after imports without guessing among multiple receptors", async () => {
  const entry = receptor(), other = { ...receptor(), id: "other", name: "Other" };
  const view = render(panel([], selection()));
  const user = await open();
  await screen.findByText("No entry contains protein context.");
  view.rerender(panel([entry, other], selection(2)));
  await screen.findByText("Choose a receptor.");
  expect(screen.getByRole("combobox", { name: "Pocket receptor" })).toHaveValue("");
  view.rerender(panel([entry], selection(2)));
  await screen.findByText("1 captured seeds");
  expect(screen.getByRole("combobox", { name: "Pocket receptor" })).toHaveValue("protein");
  await user.selectOptions(screen.getByRole("combobox", { name: "Pocket receptor" }), "");
  view.rerender(panel([entry, other], selection(2)));
  await screen.findByText("Choose a receptor.");
  expect(screen.getByRole("combobox", { name: "Pocket receptor" })).toHaveValue("");
});
