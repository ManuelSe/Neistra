import { act, cleanup, render, screen } from "@testing-library/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Selection, StructureProjection } from "../api/types";
import { SelectionStyleDialog } from "../components/SelectionStyleDialog";
import { SelectionColorControls } from "../components/SelectionColorControls";
import { SelectionHydrogenControls } from "../components/SelectionHydrogenControls";
import {
  molecularEntry,
  proteinProjection,
} from "./molecular-fixtures";

afterEach(cleanup);

function Harness({
  selection,
  structures,
  onAction,
}: {
  selection: Selection;
  structures: Map<string, StructureProjection>;
  onAction: (
    action: "apply" | "reset",
    style?: "line" | "stick" | "thick-stick" | "ball-and-stick" | "space-filling" | "backbone" | "cartoon",
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip.Provider delayDuration={0}>
      <button type="button" onClick={() => setOpen(true)}>
        Style selection
      </button>
      <SelectionStyleDialog
        open={open}
        selection={selection}
        entries={[molecularEntry("protein", "Receptor", "protein")]}
        structures={structures}
        eligibilityBusy={false}
        busy={false}
        onOpenChange={setOpen}
        onAction={onAction}
      />
    </Tooltip.Provider>
  );
}

const completeResidue: Selection = {
  schema_version: 1,
  atoms: [
    { structure_id: "protein", atom_id: 1 },
    { structure_id: "protein", atom_id: 2 },
  ],
  granularity: "residue",
  source: "inspector",
};

describe("selection style dialog", () => {
  it("shows mixed colors and applies or resets only the requested property", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    const entry = molecularEntry("protein", "Receptor", "protein");
    entry.viewer_settings.selection_colors = [{ color: "#ff0000", atom_ids: [1] }];
    render(<SelectionColorControls selection={completeResidue} entries={[entry]}
      busy={false} onChange={onChange} />);
    expect(screen.getByText("Mixed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Apply color" }));
    expect(onChange).toHaveBeenCalledWith({ property: "color", action: "set", color: "#3b82f6" });
    await user.selectOptions(screen.getByLabelText("Coloring mode"), "carbon");
    expect(screen.getByText(/other selected atoms use element colors/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Apply color" }));
    expect(onChange).toHaveBeenLastCalledWith({ property: "color", action: "set", color: "#3b82f6", color_mode: "carbon" });
    await user.click(screen.getByRole("button", { name: "Reset color" }));
    expect(onChange).toHaveBeenLastCalledWith({ property: "color", action: "reset" });
    expect(completeResidue.atoms).toHaveLength(2);
  });
  it("groups styles, applies and resets without changing the selection, and restores focus", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <Harness
        selection={completeResidue}
        structures={new Map([["protein", proteinProjection()]])}
        onAction={onAction}
      />,
    );
    const launcher = screen.getByRole("button", { name: "Style selection" });
    await user.click(launcher);

    expect(screen.getByRole("dialog", { name: "Style selection" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Atom detail" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Polymer" })).toBeVisible();
    expect(screen.getByText("2", { selector: "dd" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cartoon" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Thin sticks" }));
    expect(onAction).toHaveBeenCalledWith("apply", "stick");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Applied Thin sticks to 2 selected atoms",
    );

    await user.click(screen.getByRole("button", { name: "Reset representation" }));
    expect(onAction).toHaveBeenLastCalledWith("reset", undefined);
    expect(completeResidue.atoms).toHaveLength(2);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("keeps atomic actions available and explains an incompatible polymer target", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <Harness
        selection={{ ...completeResidue, atoms: [completeResidue.atoms[0]] }}
        structures={new Map([["protein", proteinProjection()]])}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Style selection" }));
    expect(screen.getByText(/require every atom in each selected residue/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Cartoon" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Line" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Line" }));
    expect(onAction).toHaveBeenCalledWith("apply", "line");
  });
});

it("explains exact hydrogen targets and mixed/master states, with separate inheritance", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn().mockResolvedValue(undefined);
  const entry = molecularEntry("protein", "Receptor", "protein");
  const projection = proteinProjection();
  const props = { selection: completeResidue, entries: [entry],
    structures: new Map([["protein", projection]]), busy: false, onChange };
  const view = render(<SelectionHydrogenControls {...props} />);
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.getByText(/Select explicit hydrogen atoms, or/)).toBeVisible();
  projection.structure.atoms[0].element = "H";
  projection.structure.atoms[1].element = "H";
  entry.viewer_settings.selection_nonpolar_hydrogens = [{ show: false, atom_ids: [1] }];
  entry.viewer_settings.components.hydrogens = false;
  view.rerender(<SelectionHydrogenControls {...props} entries={[...props.entries]} />);
  expect(screen.getByRole("combobox")).toHaveValue("mixed");
  expect(screen.getByText(/Show hydrogens is off/)).toBeVisible();
  await user.selectOptions(screen.getByRole("combobox"), "show");
  expect(onChange).toHaveBeenLastCalledWith({ property: "nonpolar_hydrogens", action: "set", show: true });
  await user.selectOptions(screen.getByRole("combobox"), "inherit");
  expect(onChange).toHaveBeenLastCalledWith({ property: "nonpolar_hydrogens", action: "reset" });
  onChange.mockRejectedValueOnce(new Error("Revision changed"));
  await user.selectOptions(screen.getByRole("combobox"), "hide");
  expect(await screen.findByRole("alert")).toHaveTextContent("Revision changed");
});


it("does not misreport failed or pending structure loads as hydrogen-free selections", () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const entry = molecularEntry("protein", "Receptor", "protein");
  const view = render(<SelectionHydrogenControls selection={completeResidue} entries={[entry]}
    structures={new Map()} busy loading onChange={onChange} />);
  expect(screen.getByText(/Checking explicit hydrogen targets/)).toBeVisible();
  expect(screen.queryByText(/Select explicit hydrogen atoms, or/)).not.toBeInTheDocument();
  view.unmount();
  render(<Tooltip.Provider><SelectionStyleDialog open selection={completeResidue} entries={[entry]}
    structures={new Map()} eligibilityBusy={false} eligibilityError="Could not load selection structures."
    busy={false} onAppearance={onChange} onOpenChange={() => {}} onAction={vi.fn().mockResolvedValue(undefined)} /></Tooltip.Provider>);
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load selection structures");
  expect(screen.queryByLabelText("Selected non-polar hydrogens")).not.toBeInTheDocument();
});


it("keeps workspace interaction available, suppresses old feedback and disables empty targets", async () => {
  const user = userEvent.setup();
  let finish = () => {};
  const onAction = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const props = { open: true, selection: completeResidue,
    entries: [molecularEntry("protein", "Receptor", "protein")],
    structures: new Map([["protein", proteinProjection()]]), eligibilityBusy: false,
    busy: false, onAction, onOpenChange: vi.fn() };
  const view = render(<Tooltip.Provider><button>Workspace selection</button><SelectionStyleDialog {...props} /></Tooltip.Provider>);
  const dialog = screen.getByRole("dialog");
  expect(dialog).not.toHaveAttribute("aria-modal", "true");
  await user.click(screen.getByRole("button", { name: "Thin sticks" }));
  expect(screen.getByRole("button", { name: "Line" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Workspace selection" }));
  expect(screen.getByRole("button", { name: "Workspace selection" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(props.onOpenChange).not.toHaveBeenCalled();
  view.rerender(<Tooltip.Provider><button>Workspace selection</button><SelectionStyleDialog {...props}
    selection={{ ...completeResidue, atoms: [] }} /></Tooltip.Provider>);
  await act(async () => { finish(); await Promise.resolve(); });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thin sticks" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reset representation" })).toBeDisabled();
  expect(dialog).toBeVisible();
});
