import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerToolbar } from "../components/ViewerToolbar";
import { useSelectionStore } from "../store/selection";
import type { InteractionStatusView } from "../interactions/panelModel";

afterEach(cleanup);

describe("viewer toolbar", () => {
  it("distinguishes closed interaction status while keeping visibility independent", () => {
    const renderToolbar = (status: InteractionStatusView, visible = true) => <Tooltip.Provider>
      <ViewerToolbar pickingGranularity="atom" onPickingGranularity={vi.fn()}
        fitAllUnavailableReason={null} focusSelectionUnavailableReason={null} focusLigandsUnavailableReason={null}
        selectionStyleUnavailableReason={null} selectionStyleOpen={false} onFitAll={vi.fn()} onFocusSelection={vi.fn()}
        onFocusLigands={vi.fn()} onSelectionStyle={vi.fn()} onInteractions={vi.fn()} onInteractionVisibilityChange={vi.fn()}
        interactionsConfigured interactionsVisible={visible} interactionsStatus={status} interactionsDescription={status.message} />
    </Tooltip.Provider>;
    const view = render(renderToolbar({ phase: "ready", partial: false, message: "1 shown · 1 detected" }));
    const launcher = screen.getByRole("button", { name: "Interactions" });
    expect(launcher).toHaveAttribute("aria-expanded", "false");
    expect(launcher.querySelector(".lucide-check")).not.toBeNull();
    for (const [phase, partial, icon, message] of [
      ["paused", false, "pause", "Paused during preview"],
      ["ready", true, "triangle-alert", "1 shown · partial input coverage"],
      ["error", false, "circle-alert", "Molecular display unavailable"],
      ["rendering", false, "loader-circle", "Rendering…"],
    ] as const) {
      view.rerender(renderToolbar({ phase, partial, message }));
      expect(launcher.querySelector(`.lucide-${icon}`)).not.toBeNull();
      expect(launcher).toHaveAttribute("aria-description", message);
      expect(launcher).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByRole("button", { name: "Toggle interaction visibility" })).toHaveAttribute("aria-pressed", "true");
    }
    view.rerender(renderToolbar({ phase: "hidden", partial: true, message: "Hidden · choices retained" }, false));
    expect(launcher.querySelector(".interaction-launcher-state")).toBeNull();
    expect(screen.getByRole("button", { name: "Toggle interaction visibility" })).toHaveAttribute("aria-pressed", "false");
  });

  it("exposes every picking mode as one controlled keyboard-accessible value", async () => {
    const user = userEvent.setup();
    const onPickingGranularity = vi.fn();
    const actionProps = {
      fitAllUnavailableReason: null,
      focusSelectionUnavailableReason: null,
      focusLigandsUnavailableReason: null,
      selectionStyleUnavailableReason: null,
      selectionStyleOpen: false,
      onInteractions: vi.fn(),
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
    const actions = screen.getByRole("group", { name: "Viewer focus actions" }).querySelectorAll("button");
    expect(actions[actions.length - 1]).toHaveAccessibleName("Interactions");
    screen.getByRole("button", { name: "Style selection" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Interactions" })).toHaveFocus();
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
