import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtomReference } from "../api/types";
import { ViewerInformationStrip, type ViewerInformationStripProps } from "../components/ViewerInformationStrip";
import { canonicalSelection } from "../selection/selection";
import { molecularEntry, proteinStructure } from "./molecular-fixtures";

afterEach(cleanup);
const atom = (atom_id: number, structure_id = "entry"): AtomReference => ({ structure_id, atom_id });
const key = (reference: AtomReference) => JSON.stringify([reference.structure_id, reference.atom_id]);

function props(ids = [1, 2, 3]): ViewerInformationStripProps {
  const structure = proteinStructure();
  structure.atoms[0].coordinates = [1, 0, 0];
  structure.atoms[1].coordinates = [0, 0, 0];
  structure.atoms[2].coordinates = [0, 1, 0];
  structure.residues[0].author_number = 42;
  structure.residues[0].insertion_code = "A";
  return {
    selection: canonicalSelection(ids.map(id => atom(id))),
    order: ids.map(id => atom(id)),
    structures: new Map([["entry", structure]]),
    entries: [molecularEntry("entry", "Active entry", "protein")],
    hover: null, paused: false, onOrder: vi.fn(),
  };
}

describe("viewer information strip", () => {
  it("distinguishes repeated names, alternate sites and identically named entries in target choices", async () => {
    const user = userEvent.setup(), state = props([1, 2]);
    const source = state.structures.get("entry")!;
    source.atoms[1] = { ...source.atoms[0], id: 2, alternate_location: "B" };
    source.atoms[0].alternate_location = "A";
    state.entries = [state.entries[0], { ...state.entries[0], id: "copy" }];
    state.structures = new Map([["entry", source], ["copy", structuredClone(source)]]);
    state.selection = canonicalSelection([atom(1), atom(2), atom(1, "copy")]);
    state.order = state.selection.atoms;
    const { rerender } = render(<ViewerInformationStrip {...state} hover={atom(1)} />);
    expect(screen.getByTestId("viewer-atom-information")).toHaveTextContent("Active entry (entry)");
    rerender(<ViewerInformationStrip {...state} hover={atom(1, "copy")} />);
    expect(screen.getByTestId("viewer-atom-information")).toHaveTextContent("Active entry (copy)");
    await user.click(screen.getByRole("button", { name: "Atom details" }));
    const options = within(screen.getByLabelText("Selected atom")).getAllByRole("option").slice(1);
    const names = options.map(option => option.textContent);
    expect(new Set(names).size).toBe(3);
    expect(names.some(name => name?.includes("(entry)") && name.includes("alternate A · atom 1"))).toBe(true);
    expect(names.some(name => name?.includes("(entry)") && name.includes("alternate B · atom 2"))).toBe(true);
    expect(names.some(name => name?.includes("(copy)") && name.includes("alternate A · atom 1"))).toBe(true);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Inspect measurement targets" }));
    const participants = within(screen.getByRole("list", { name: "Current measurement target order" })).getAllByRole("listitem");
    expect(new Set(participants.map(item => item.textContent)).size).toBe(3);
  });

  it("keeps hover identity beside retained geometry and stable selected-atom details", async () => {
    const user = userEvent.setup();
    const state = props([1, 2]);
    const { rerender } = render(<ViewerInformationStrip {...state} hover={atom(3)} />);
    expect(screen.getByTestId("viewer-atom-information")).toHaveTextContent("Active entry");
    expect(screen.getByTestId("viewer-atom-information")).toHaveTextContent("CA");
    expect(screen.getByTestId("viewer-selection-geometry")).toHaveTextContent("Distance 1.00 Å");
    expect(screen.getByRole("region", { name: "Viewer information" }).querySelector("[aria-live]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Atom details" }));
    const dialog = screen.getByRole("dialog", { name: "Atom details" });
    expect(within(dialog).getByLabelText("Selected atom")).toHaveValue("");
    await user.selectOptions(within(dialog).getByLabelText("Selected atom"), key(atom(2)));
    expect(within(dialog).getByText("Atom", { exact: true }).nextElementSibling).toHaveTextContent("N");
    expect(within(dialog).getByText("42A", { exact: true })).toBeVisible();
    expect(within(dialog).getByText("Unknown", { exact: true })).toBeVisible();
    rerender(<ViewerInformationStrip {...state} hover={atom(1)} />);
    expect(within(dialog).getByLabelText("Selected atom")).toHaveValue(key(atom(2)));
    expect(screen.getByTestId("viewer-selection-geometry")).toHaveTextContent("Distance 1.00 Å");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Atom details" })).toHaveFocus();
  });

  it("requires explicit distinct target choices and submits their actual order without changing selection", async () => {
    const user = userEvent.setup();
    const state = props();
    state.order = null;
    const originalSelection = structuredClone(state.selection);
    render(<ViewerInformationStrip {...state} />);
    expect(screen.getByTestId("viewer-selection-geometry")).toHaveTextContent("Order targets");
    await user.click(screen.getByRole("button", { name: "Order measurement targets" }));
    const dialog = screen.getByRole("dialog", { name: "Measurement targets" });
    const slots = within(dialog).getAllByRole("combobox");
    expect(slots.map(slot => (slot as HTMLSelectElement).value)).toEqual(["", "", ""]);
    expect(slots[1]).toHaveAccessibleName("Measurement target 2, angle vertex");
    const useOrder = within(dialog).getByRole("button", { name: "Use order" });
    expect(useOrder).toBeDisabled();
    await user.selectOptions(slots[0], key(atom(3)));
    await user.selectOptions(slots[1], key(atom(2)));
    await user.selectOptions(slots[2], key(atom(3)));
    expect(useOrder).toBeDisabled();
    await user.selectOptions(slots[2], key(atom(1)));
    expect(useOrder).toBeEnabled();
    await user.click(useOrder);
    expect(state.onOrder).toHaveBeenCalledExactlyOnceWith([atom(3), atom(2), atom(1)]);
    expect(state.selection).toEqual(originalSelection);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows current ordered participants without preselecting a replacement order", async () => {
    const user = userEvent.setup();
    const state = props();
    state.order = [atom(3), atom(2), atom(1)];
    render(<ViewerInformationStrip {...state} />);
    expect(screen.getByTestId("viewer-selection-geometry")).toHaveTextContent("Angle 90.0°");
    await user.click(screen.getByRole("button", { name: "Inspect measurement targets" }));
    const targets = within(screen.getByRole("list", { name: "Current measurement target order" })).getAllByRole("listitem");
    expect(targets).toHaveLength(3);
    expect(targets[0]).toHaveTextContent("ALA");
    expect(targets[1]).toHaveTextContent("N");
    expect(screen.getAllByRole("combobox").every(node => (node as HTMLSelectElement).value === "")).toBe(true);
  });

  it("does not mistake a two-atom canonical set for a recorded pick sequence", async () => {
    const user = userEvent.setup();
    const state = props([1, 2]);
    state.order = null;
    render(<ViewerInformationStrip {...state} />);
    expect(screen.getByTestId("viewer-selection-geometry")).toHaveTextContent("Distance 1.00 Å");
    await user.click(screen.getByRole("button", { name: "Inspect measurement targets" }));
    expect(screen.getByRole("list", { name: "Distance participants" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Current measurement target order" })).toBeNull();
    expect(screen.getByText(/Distance is independent of target order/)).toBeVisible();
  });

  it("retires open target drafts immediately after membership, source or preview changes", async () => {
    const user = userEvent.setup();
    const state = props();
    state.order = null;
    const { rerender } = render(<ViewerInformationStrip {...state} />);
    for (const change of ["membership", "artifact", "preview"] as const) {
      rerender(<ViewerInformationStrip {...state} />);
      await user.click(screen.getByRole("button", { name: "Order measurement targets" }));
      await user.selectOptions(screen.getByLabelText("Measurement target 1"), key(atom(3)));
      rerender(<ViewerInformationStrip {...state}
        selection={change === "membership" ? canonicalSelection([atom(1), atom(2)]) : state.selection}
        entries={change === "artifact" ? [{ ...state.entries[0], current_artifact_id: "new-source" }] : state.entries}
        paused={change === "preview"} />);
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    expect(state.onOrder).not.toHaveBeenCalled();
    expect(screen.getByTestId("viewer-selection-geometry")).toHaveTextContent("unavailable during preview");
  });

  it("uses complete long identities in details and keeps missing coordinates distinct from zero", async () => {
    const user = userEvent.setup();
    const state = props([1]);
    const longName = "Long entry " + "shared-name-".repeat(30);
    state.entries = [{ ...state.entries[0], name: longName }];
    const source = state.structures.get("entry")!;
    source.warnings = [{ code: "missing_coordinates", message: "Absent coordinates", severity: "warning", operation: "parse", field: "coordinates", blocking: false }];
    render(<ViewerInformationStrip {...state} />);
    expect(screen.getByTestId("viewer-atom-information").getAttribute("title")).toContain(longName);
    await user.click(screen.getByRole("button", { name: "Atom details" }));
    const dialog = screen.getByRole("dialog", { name: "Atom details" });
    expect(within(dialog).getByText(longName, { exact: true })).toBeVisible();
    expect(within(dialog).getByText("Coordinates (Å)").nextElementSibling).toHaveTextContent("Unavailable");
    expect(within(dialog).getByText("Formal charge").nextElementSibling).toHaveTextContent("Unknown");
  });

  it("bounds the atom chooser while retaining access to every selected participant", async () => {
    const user = userEvent.setup();
    const state = props(Array.from({ length: 101 }, (_, index) => index + 1));
    const source = state.structures.get("entry")!;
    source.atoms = Array.from({ length: 101 }, (_, index) => ({ ...source.atoms[0], id: index + 1, name: `C${index + 1}` }));
    render(<ViewerInformationStrip {...state} />);
    await user.click(screen.getByRole("button", { name: "Atom details" }));
    const chooser = screen.getByLabelText("Selected atom");
    expect(within(chooser).getAllByRole("option")).toHaveLength(51);
    await user.selectOptions(chooser, key(atom(1)));
    await user.click(screen.getByRole("button", { name: "Next selected atom page" }));
    expect(within(chooser).getAllByRole("option")).toHaveLength(52);
    expect(chooser).toHaveValue(key(atom(1)));
    await user.click(screen.getByRole("button", { name: "Next selected atom page" }));
    await user.selectOptions(chooser, key(atom(101)));
    expect(screen.getByText("C101", { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next selected atom page" })).toBeDisabled();
    expect(state.onOrder).not.toHaveBeenCalled();
  });

  it("loads missing selected details only on deliberate inspection and recovers from a failed read", async () => {
    const user = userEvent.setup();
    const state = props([1, 2]);
    state.structures = new Map();
    state.onLoadEntry = vi.fn().mockRejectedValueOnce(new Error("Current source could not be read")).mockResolvedValue(undefined);
    const { rerender } = render(<ViewerInformationStrip {...state} hover={atom(1)} />);
    expect(state.onLoadEntry).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Atom details" }));
    expect(state.onLoadEntry).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Selected atom"), key(atom(2)));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Current source could not be read"));
    expect(state.onLoadEntry).toHaveBeenCalledExactlyOnceWith("entry");
    await user.click(screen.getByRole("button", { name: "Retry atom information" }));
    await waitFor(() => expect(state.onLoadEntry).toHaveBeenCalledTimes(2));
    rerender(<ViewerInformationStrip {...state} structures={props().structures} hover={atom(3)} />);
    expect(screen.getByText("Coordinates (Å)").nextElementSibling).toHaveTextContent("0.000, 0.000, 0.000");
    expect(screen.getByLabelText("Selected atom")).toHaveValue(key(atom(2)));
  });

  it("does not restore a retired detail target when its delayed read completes", async () => {
    const user = userEvent.setup();
    const state = props([1]);
    state.structures = new Map();
    let finish: () => void = () => {};
    state.onLoadEntry = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { rerender } = render(<ViewerInformationStrip {...state} />);
    await user.click(screen.getByRole("button", { name: "Atom details" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading atom information");
    rerender(<ViewerInformationStrip {...state} selection={canonicalSelection([])} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { finish(); await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Atom details" })).toBeDisabled();
  });
});
