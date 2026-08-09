import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerToolbar } from "../components/ViewerToolbar";
import { useSelectionStore } from "../store/selection";

afterEach(cleanup);

describe("viewer toolbar", () => {
  it("exposes every picking mode as one controlled keyboard-accessible value", async () => {
    const user = userEvent.setup();
    const onPickingGranularity = vi.fn();
    const actionProps = {
      fitAllUnavailableReason: null,
      focusSelectionUnavailableReason: null,
      focusLigandsUnavailableReason: null,
      selectionStyleUnavailableReason: null,
      selectionStyleOpen: false,
      onFitAll: vi.fn(),
      onFocusSelection: vi.fn(),
      onFocusLigands: vi.fn(),
      onSelectionStyle: vi.fn(),
    };
    const view = render(
      <Tooltip.Provider delayDuration={0}>
        <ViewerToolbar
          pickingGranularity="residue"
          onPickingGranularity={onPickingGranularity}
          {...actionProps}
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
          {...actionProps}
        />
      </Tooltip.Provider>,
    );
    expect(screen.getByRole("button", { name: "Pick structures" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps unavailable focus actions keyboard reachable and explains why", async () => {
    const user = userEvent.setup();
    const onFocusLigands = vi.fn();
    const view = render(
      <Tooltip.Provider delayDuration={0}>
        <ViewerToolbar
          pickingGranularity="atom"
          onPickingGranularity={() => undefined}
          fitAllUnavailableReason={null}
          focusSelectionUnavailableReason="Select atoms before focusing the selection"
          focusLigandsUnavailableReason="No ligand detected in visible structures"
          selectionStyleUnavailableReason="Select atoms before styling the selection"
          selectionStyleOpen={false}
          onFitAll={() => undefined}
          onFocusSelection={() => undefined}
          onFocusLigands={onFocusLigands}
          onSelectionStyle={() => undefined}
        />
      </Tooltip.Provider>,
    );
    const focusLigands = screen.getByRole("button", {
      name: "Focus visible ligands",
    });

    expect(focusLigands).toHaveAttribute("aria-disabled", "true");
    const styleSelection = screen.getByRole("button", {
      name: "Style selection",
    });
    expect(styleSelection).toHaveAttribute("aria-disabled", "true");
    expect(styleSelection).toHaveAttribute("aria-haspopup", "dialog");
    expect(styleSelection).toHaveAttribute("aria-expanded", "false");
    styleSelection.focus();
    expect(styleSelection).toHaveFocus();
    focusLigands.focus();
    expect(focusLigands).toHaveFocus();
    await user.hover(focusLigands);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "No ligand detected in visible structures",
    );
    await user.click(focusLigands);
    expect(onFocusLigands).not.toHaveBeenCalled();

    view.rerender(
      <Tooltip.Provider delayDuration={0}>
        <ViewerToolbar
          pickingGranularity="atom"
          onPickingGranularity={() => undefined}
          fitAllUnavailableReason={null}
          focusSelectionUnavailableReason={null}
          focusLigandsUnavailableReason={null}
          selectionStyleUnavailableReason={null}
          selectionStyleOpen={false}
          onFitAll={() => undefined}
          onFocusSelection={() => undefined}
          onFocusLigands={onFocusLigands}
          onSelectionStyle={() => undefined}
        />
      </Tooltip.Provider>,
    );
    await user.click(
      screen.getByRole("button", { name: "Focus visible ligands" }),
    );
    expect(onFocusLigands).toHaveBeenCalledOnce();
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
