import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entry, MolecularWarning } from "../api/types";
import { ViewerWarningDetails } from "../components/ViewerWarningDetails";
import { MovementOverlay } from "../components/MovementOverlay";
import { useMovementSession } from "../coordinates/useMovementSession";
import { canonicalSelection } from "../selection/selection";
import { molecularProject, proteinProjection } from "./molecular-fixtures";

type WarningEntry = Pick<Entry, "id" | "name" | "warnings">;
const warning = (message: string, severity: MolecularWarning["severity"] = "warning"): MolecularWarning => ({
  message, severity, code: "fixture_code", operation: "import", field: null, blocking: false,
});
const entry = (id: string, name: string, warnings = [warning("Existing uncertainty")]): WarningEntry => ({ id, name, warnings });

function Harness({ entries, projectId = "one" }: { entries: WarningEntry[]; projectId?: string }) {
  return <Tooltip.Provider>
    <div className="structure-viewer"><div className="viewer-status">
      <span>Visible structures</span>
      <ViewerWarningDetails key={projectId} entries={entries}
        returnFocus={() => document.getElementById("warning-fallback")} />
    </div><button id="warning-fallback">Viewer action</button></div>
    <button>Outside action</button>
  </Tooltip.Provider>;
}

afterEach(cleanup);

describe("viewer warning details", () => {
  it("shares exact count and current grouped records, retaining duplicates and supplied severity", async () => {
    const user = userEvent.setup();
    const entries = [
      entry("a", "Same name", [warning("Repeated"), warning("Repeated"), warning("<b>Source text</b>", "info")]),
      entry("b", "Same name", [warning("Uncertain charge", "error")]),
      entry("none", "No records", []),
    ];
    const original = structuredClone(entries);
    render(<Harness entries={entries} />);
    await user.click(screen.getByRole("button", { name: "Inspect 4 warnings for visible structures" }));
    const dialog = screen.getByRole("dialog", { name: "Structure warnings" });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    const groups = within(dialog).getAllByRole("group", { name: "Same name" });
    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.getAttribute("data-warning-entry-id"))).toEqual(["a", "b"]);
    expect(within(groups[0]).getAllByRole("listitem").map(row => row.textContent))
      .toEqual(["WarningRepeated", "WarningRepeated", "Info<b>Source text</b>"]);
    expect(within(groups[1]).getByRole("listitem")).toHaveTextContent("ErrorUncertain charge");
    expect(within(dialog).queryByText("fixture_code")).not.toBeInTheDocument();
    expect(dialog.querySelector("b")).toBeNull();
    expect(within(dialog).queryByRole("heading", { name: "No records" })).not.toBeInTheDocument();
    expect(entries).toEqual(original);
  });

  it("opens with Enter and Space and returns focus after Escape and Close", async () => {
    const user = userEvent.setup();
    render(<Harness entries={[entry("a", "Receptor")]} />);
    const trigger = screen.getByRole("button", { name: "Inspect 1 warning for visible structures" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Structure warnings" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.keyboard(" ");
    screen.getByRole("button", { name: "Close structure warnings" }).focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "Structure warnings" })).not.toBeInTheDocument();
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Close structure warnings" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "Structure warnings" })).not.toBeInTheDocument();
  });

  it("dismisses for an outside action without taking its focus", async () => {
    const user = userEvent.setup();
    render(<Harness entries={[entry("a", "Receptor")]} />);
    await user.click(screen.getByRole("button", { name: /Inspect 1 warning/ }));
    const outside = screen.getByRole("button", { name: "Outside action" });
    await user.click(outside);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Structure warnings" })).not.toBeInTheDocument());
    expect(outside).toHaveFocus();
  });

  it("updates names, records and empty state without retaining stale snapshots", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness entries={[entry("a", "Before")]} />);
    await user.click(screen.getByRole("button", { name: /Inspect 1 warning/ }));
    rerender(<Harness entries={[entry("a", "After", [warning("Replacement", "info"), warning("Another")])]} />);
    expect(screen.getByRole("button", { name: "Inspect 2 warnings for visible structures" })).toHaveAttribute("data-state", "open");
    const dialog = screen.getByRole("dialog", { name: "Structure warnings" });
    expect(within(dialog).getByRole("heading", { name: "After" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Existing uncertainty")).not.toBeInTheDocument();
    rerender(<Harness entries={[]} />);
    expect(screen.queryByRole("button", { name: /Inspect .*warning/ })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Structure warnings" })).toHaveTextContent("No warnings for visible structures");
    await user.click(screen.getByRole("button", { name: "Close structure warnings" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Viewer action" })).toHaveFocus());
  });

  it("retires local state on project replacement without restoring the old trigger", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness entries={[entry("a", "Old project")]} />);
    await user.click(screen.getByRole("button", { name: /Inspect 1 warning/ }));
    rerender(<Harness entries={[entry("b", "New project")]} projectId="two" />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Structure warnings" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Inspect 1 warning/ })).not.toHaveFocus();
    await user.click(screen.getByRole("button", { name: /Inspect 1 warning/ }));
    expect(screen.getByRole("dialog", { name: "Structure warnings" })).not.toHaveTextContent("Old project");
  });

  it("anchors the open empty state to the live status and keeps it clamped after resize", async () => {
    const user = userEvent.setup();
    let statusLeft = 30;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      const bounds = this.classList.contains("viewer-warning-trigger") ? [200, 52, 90, 28]
        : this.classList.contains("viewer-status") ? [statusLeft, 10, 350, 50]
        : this.classList.contains("viewer-warning-details") ? [0, 0, 400, 200] : [0, 0, 0, 0];
      return { x: bounds[0], y: bounds[1], left: bounds[0], top: bounds[1],
        width: bounds[2], height: bounds[3], right: bounds[0] + bounds[2], bottom: bounds[1] + bounds[3], toJSON: () => ({}) };
    });
    try {
      const { rerender } = render(<Harness entries={[entry("a", "Receptor")]} />);
      await user.click(screen.getByRole("button", { name: /Inspect 1 warning/ }));
      const dialog = screen.getByRole("dialog", { name: "Structure warnings" });
      expect(dialog.style.getPropertyValue("--warning-details-left")).toBe("200px");
      expect(dialog.style.getPropertyValue("--warning-details-top")).toBe("88px");
      rerender(<Harness entries={[]} />);
      expect(dialog.style.getPropertyValue("--warning-details-left")).toBe("30px");
      expect(dialog.style.getPropertyValue("--warning-details-top")).toBe("68px");
      statusLeft = window.innerWidth;
      fireEvent(window, new Event("resize"));
      expect(dialog.style.getPropertyValue("--warning-details-left")).toBe(`${window.innerWidth - 408}px`);
    } finally { rect.mockRestore(); }
  });

  it("mounts every supplied message only while open and releases layout observers on dismissal", async () => {
    const user = userEvent.setup();
    const observe = vi.spyOn(ResizeObserver.prototype, "observe");
    const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const warnings = Array.from({ length: 500 }, (_, index) => warning(`Warning row ${index}`));
    render(<Harness entries={[entry("a", "Long list", warnings)]} />);
    expect(screen.queryByText("Warning row 499")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspect 500 warnings for visible structures" }));
    const dialog = screen.getByRole("dialog", { name: "Structure warnings" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(500);
    expect(observe).toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(disconnect).toHaveBeenCalled());
    expect(screen.queryByText("Warning row 499")).not.toBeInTheDocument();
    observe.mockRestore(); disconnect.mockRestore();
  });

  it("gives only focused warning details Escape ownership during an active movement", async () => {
    const user = userEvent.setup();
    const project = molecularProject();
    const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }]);
    const commit = vi.fn(() => Promise.resolve(project));
    function MovementHarness() {
      const { workflow } = useMovementSession({
        context: () => ({ project, selection }), rendered: () => selection.atoms,
        load: () => Promise.resolve(new Map([["protein", proteinProjection()]])), commit,
        refresh: () => Promise.resolve(project), accept: vi.fn(), notice: vi.fn(),
      });
      return <Tooltip.Provider><button onClick={workflow.start}>Start movement</button>
        {workflow.state.capture ? <MovementOverlay movement={workflow} zoom={vi.fn()}
          view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /> : null}
        <ViewerWarningDetails entries={[entry("a", "Receptor")]}
          returnFocus={() => document.querySelector<HTMLElement>("[data-movement-canvas]")} />
      </Tooltip.Provider>;
    }
    render(<MovementHarness />);
    await user.click(screen.getByRole("button", { name: "Start movement" }));
    const canvas = await screen.findByRole("group", { name: "Move selection canvas" });
    await user.click(screen.getByRole("button", { name: /Inspect 1 warning/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Structure warnings" })).not.toBeInTheDocument();
    expect(canvas).toBeInTheDocument();
    canvas.focus();
    fireEvent.keyDown(canvas, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("group", { name: "Move selection canvas" })).not.toBeInTheDocument());
    expect(commit).not.toHaveBeenCalled();
  });
});
