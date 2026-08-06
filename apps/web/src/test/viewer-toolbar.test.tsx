import * as Tooltip from "@radix-ui/react-tooltip";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ViewerToolbar } from "../components/ViewerToolbar";
import { useSelectionStore } from "../store/selection";

describe("viewer toolbar", () => {
  it("exposes every picking mode as one controlled keyboard-accessible value", async () => {
    const user = userEvent.setup();
    const onPickingGranularity = vi.fn();
    const view = render(
      <Tooltip.Provider delayDuration={0}>
        <ViewerToolbar
          pickingGranularity="residue"
          onPickingGranularity={onPickingGranularity}
        />
      </Tooltip.Provider>,
    );

    expect(screen.getByRole("toolbar", { name: "Viewer quick actions" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Pick residues" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("combobox", { name: "Viewer picking mode" })).toHaveValue(
      "residue",
    );

    await user.click(screen.getByRole("button", { name: "Pick chains" }));
    expect(onPickingGranularity).toHaveBeenCalledWith("chain");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Viewer picking mode" }),
      "structure",
    );
    expect(onPickingGranularity).toHaveBeenLastCalledWith("structure");

    view.rerender(
      <Tooltip.Provider delayDuration={0}>
        <ViewerToolbar
          pickingGranularity="structure"
          onPickingGranularity={onPickingGranularity}
        />
      </Tooltip.Provider>,
    );
    expect(screen.getByRole("button", { name: "Pick structures" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the canonical current selection unchanged when the future picking mode changes", () => {
    const selection = {
      schema_version: 1 as const,
      atoms: [{ structure_id: "entry-1", atom_id: 7 }],
      granularity: "residue" as const,
      source: "viewer" as const,
    };
    useSelectionStore.setState({
      projectId: "project-1",
      selection,
      pickingGranularity: "atom",
    });

    useSelectionStore.getState().setPickingGranularity("chain");

    expect(useSelectionStore.getState().selection).toEqual(selection);
    expect(useSelectionStore.getState().pickingGranularity).toBe("chain");
  });
});
