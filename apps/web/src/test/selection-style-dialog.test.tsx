import { cleanup, render, screen } from "@testing-library/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Selection, StructureProjection } from "../api/types";
import { SelectionStyleDialog } from "../components/SelectionStyleDialog";
import { SelectionColorControls } from "../components/SelectionColorControls";
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

    await user.click(screen.getByRole("button", { name: "Reset to entry defaults" }));
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
