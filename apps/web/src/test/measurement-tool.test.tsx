import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtomReference, Measurement } from "../api/types";
import { MeasurementTool, type MeasurementToolProps } from "../components/MeasurementTool";
import { canonicalSelection } from "../selection/selection";
import { molecularEntry, proteinStructure } from "./molecular-fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const atom = (atom_id: number, structure_id = "entry"): AtomReference => ({ structure_id, atom_id });
const key = (reference: AtomReference) => JSON.stringify([reference.structure_id, reference.atom_id]);

function props(): MeasurementToolProps {
  return {
    draft: { session: 1, open: true, kind: "distance", slots: [null, null], activeSlot: 0,
      name: "", saving: false, acquiring: true, notice: null },
    entries: [molecularEntry("entry", "Protein", "protein")], structures: new Map([["entry", proteinStructure()]]),
    selection: canonicalSelection([]), inspectionOrder: null, paused: false, busy: false,
    value: null, unavailableReason: null, onClose: vi.fn(), onCancelAcquisition: vi.fn(), onKind: vi.fn(),
    onActiveSlot: vi.fn(), onRemove: vi.fn(), onChooseTarget: vi.fn(), onUseSelection: vi.fn(), onName: vi.fn(),
    onReset: vi.fn(), onSave: vi.fn(), measurements: [], savedValues: new Map(), expandedInspection: null, expandedId: null,
    onExpand: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), onSelectParticipants: vi.fn(),
    onFocusParticipants: vi.fn(), canFocus: () => false, onLoadEntry: vi.fn(() => Promise.resolve()),
    contactsOpen: false, onContactsOpenChange: vi.fn(), contactsContent: <span>Current close contacts</span>,
    onReturnFocus: vi.fn(),
  };
}

function saved(index: number, name = `Measurement ${index}`): Measurement {
  return { id: `saved-${index}`, name, kind: "distance", atom_references: [atom(1), atom(2)], visible: true,
    warnings: [], created_at: "2026-11-16T12:00:00Z", modified_at: "2026-11-16T12:00:00Z" };
}

describe("controlled measurement tool", () => {
  it("never turns partial angle/torsion targets into a different geometry kind or clears a failed name", async () => {
    const state = props();
    state.draft = { ...state.draft, kind: "angle", slots: [atom(1), atom(2), null], name: "Held angle" };
    state.value = 3;
    const view = render(<MeasurementTool {...state} />);
    expect(screen.getByText("Angle · 2 of 3 targets")).toBeVisible();
    expect(screen.queryByText("Distance 3.00 Å")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save measurement" })).toBeDisabled();
    state.draft = { ...state.draft, kind: "dihedral", slots: [atom(1), atom(2), atom(3), null] };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getByText("Torsion · 3 of 4 targets")).toBeVisible();
    state.draft = { ...state.draft, kind: "distance", slots: [atom(1), atom(2)], name: "Reference" };
    view.rerender(<MeasurementTool {...state} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save measurement" }));
    expect(state.onSave).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Reference");
    state.draft = { ...state.draft, notice: "Save failed. Try again." };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getByRole("status")).toHaveTextContent("Save failed");
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Reference");
  });

  it("requires explicit distinct numbering for an unordered angle selection and sends that actual order", async () => {
    const state = props(), user = userEvent.setup();
    state.draft = { ...state.draft, kind: "angle", slots: [null, null, null] };
    state.selection = canonicalSelection([atom(3), atom(1), atom(2)]);
    const original = structuredClone(state.selection);
    render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Use selection" }));
    expect(state.onUseSelection).not.toHaveBeenCalled();
    const chooser = screen.getByRole("region", { name: "Confirm measurement order" });
    const selects = within(chooser).getAllByRole("combobox");
    expect(selects.map(select => (select as HTMLSelectElement).value)).toEqual(["", "", ""]);
    expect(selects[1]).toHaveAccessibleName("Ordered target 2, angle vertex");
    await user.selectOptions(selects[0], key(atom(3)));
    await user.selectOptions(selects[1], key(atom(1)));
    await user.selectOptions(selects[2], key(atom(1)));
    expect(within(chooser).getByRole("button", { name: "Use target order" })).toBeDisabled();
    await user.selectOptions(selects[2], key(atom(2)));
    await user.click(within(chooser).getByRole("button", { name: "Use target order" }));
    expect(state.onUseSelection).toHaveBeenCalledExactlyOnceWith([atom(3), atom(1), atom(2)]);
    expect(state.selection).toEqual(original);
  });

  it("retires an open order chooser before a large or replacement selection can expand its DOM", async () => {
    const state = props(), user = userEvent.setup();
    state.draft = { ...state.draft, kind: "angle", slots: [null, null, null] };
    state.selection = canonicalSelection([atom(1), atom(2), atom(3)]);
    const original = state.selection;
    const view = render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Use selection" }));
    expect(screen.getByRole("region", { name: "Confirm measurement order" })).toBeVisible();
    state.selection = { ...state.selection, atoms: Array.from({ length: 100000 }, (_, index) => atom(index + 1)) };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.queryByRole("region", { name: "Confirm measurement order" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Use selection" })).toBeDisabled();
    state.selection = original;
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.queryByRole("region", { name: "Confirm measurement order" })).not.toBeInTheDocument();
    expect(state.onUseSelection).not.toHaveBeenCalled();
  });

  it("uses an already justified order explicitly and leaves slot correction and removal with the owner", async () => {
    const state = props(), user = userEvent.setup();
    state.draft = { ...state.draft, kind: "angle", slots: [atom(3), atom(1), atom(2)], activeSlot: 1 };
    state.selection = canonicalSelection([atom(1), atom(2), atom(3)]);
    state.inspectionOrder = [atom(3), atom(1), atom(2)];
    render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Use selection" }));
    expect(state.onUseSelection).toHaveBeenCalledExactlyOnceWith([atom(3), atom(1), atom(2)]);
    expect(screen.queryByRole("region", { name: "Confirm measurement order" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pick target 2, angle vertex" }));
    expect(state.onActiveSlot).toHaveBeenCalledExactlyOnceWith(1);
    await user.click(screen.getByRole("button", { name: "Remove target 2" }));
    expect(state.onRemove).toHaveBeenCalledExactlyOnceWith(1);
    expect(state.draft.slots).toEqual([atom(3), atom(1), atom(2)]);
  });

  it("bounds the explicit chooser to 50 structures and 50 atoms while retaining hidden/locked targets", async () => {
    const state = props(), user = userEvent.setup(), template = proteinStructure();
    state.entries = Array.from({ length: 61 }, (_, i) => ({ ...molecularEntry(`entry-${i}`, "Duplicate", "protein"), visible: false, locked: true }));
    const source = { ...template, atoms: Array.from({ length: 101 }, (_, i) => ({ ...template.atoms[0], id: i + 1, name: "C", source_index: i })) };
    state.structures = new Map([["entry-0", source]]);
    render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Choose atom for target 1" }));
    let list = screen.getByRole("list", { name: "Available measurement structures" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(50);
    expect(within(list).getByRole("button", { name: "Duplicate (entry-0) Hidden · Locked" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Next structure page" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(11);
    await user.type(screen.getByLabelText("Find measurement structure"), "entry-0");
    list = screen.getByRole("list", { name: "Available measurement structures" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await user.click(within(list).getByRole("button"));
    const atoms = screen.getByRole("list", { name: "Available measurement atoms" });
    expect(within(atoms).getAllByRole("listitem")).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: "Next atom page" }));
    expect(within(atoms).getAllByRole("listitem")).toHaveLength(50);
    await user.click(within(atoms).getByRole("button", { name: /atom 52$/ }));
    expect(state.onChooseTarget).toHaveBeenCalledExactlyOnceWith(atom(52, "entry-0"));
    expect(state.onLoadEntry).not.toHaveBeenCalled();
    expect(state.selection.atoms).toEqual([]);
  });

  it("retires a held chooser failure when another entry or session owns the chooser", async () => {
    const state = props(), user = userEvent.setup();
    state.entries = [molecularEntry("A", "First", "ligand"), molecularEntry("B", "Second", "protein")];
    state.structures = new Map();
    let rejectFirst!: (reason: Error) => void, finishSecond!: () => void;
    const first = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
    const second = new Promise<void>(resolve => { finishSecond = resolve; });
    state.onLoadEntry = vi.fn(id => id === "A" ? first : second);
    const view = render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Choose atom for target 1" }));
    await user.click(screen.getByRole("button", { name: "First" }));
    expect(screen.getByText("Loading atoms…")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Choose another structure" }));
    await user.click(screen.getByRole("button", { name: "Second" }));
    await act(async () => { rejectFirst(new Error("Retired first failure")); await first.catch(() => undefined); });
    expect(screen.queryByText("Retired first failure")).not.toBeInTheDocument();
    expect(screen.getByText("Loading atoms…")).toBeVisible();
    state.draft = { ...state.draft, session: 2 };
    view.rerender(<MeasurementTool {...state} />);
    await act(async () => { finishSecond(); await second; });
    expect(screen.queryByRole("region", { name: "Choose measurement atom" })).not.toBeInTheDocument();
    expect(state.onReturnFocus).not.toHaveBeenCalled();
  });

  it("reports only an explicit chooser entry and releases it on Escape, order confirmation and session retirement", async () => {
    const state = props(), user = userEvent.setup();
    state.onChooserEntryChange = vi.fn();
    state.draft = { ...state.draft, kind: "angle", slots: [null, null, null] };
    state.selection = canonicalSelection([atom(1), atom(2), atom(3)]);
    const view = render(<MeasurementTool {...state} />);
    expect(state.onChooserEntryChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Choose atom for target 1" }));
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Protein" }));
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith("entry");
    await user.keyboard("{Escape}");
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Choose atom for target 1" }));
    await user.click(screen.getByRole("button", { name: "Protein" }));
    await user.click(screen.getByRole("button", { name: "Use selection" }));
    expect(screen.queryByRole("region", { name: "Choose measurement atom" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Confirm measurement order" })).toBeVisible();
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith(null);
    await user.keyboard("{Escape}");
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Choose atom for target 1" }));
    await user.click(screen.getByRole("button", { name: "Protein" }));
    state.draft = { ...state.draft, session: 2 };
    view.rerender(<MeasurementTool {...state} />);
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith(null);
  });

  it("mounts at most 50 of 1000 saved summaries, one action group, and pages without retaining hidden expansion", async () => {
    const state = props(), user = userEvent.setup();
    state.measurements = Array.from({ length: 1000 }, (_, i) => saved(i));
    const view = render(<MeasurementTool {...state} />);
    expect(screen.queryByRole("list", { name: "Saved measurements" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Saved measurements 1000" }));
    const list = screen.getByRole("list", { name: "Saved measurements" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: "Inspect measurement Measurement 0" }));
    expect(state.onExpand).toHaveBeenLastCalledWith("saved-0");
    state.expandedId = "saved-0";
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getAllByRole("group", { name: /^Actions for/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Focus" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Inspect measurement Measurement 1" }));
    state.expandedId = "saved-1";
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getAllByRole("group", { name: /^Actions for/ })).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Actions for Measurement 1" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Hide Measurement 1" }));
    expect(state.onUpdate).toHaveBeenLastCalledWith(state.measurements[1], "Measurement 1", false);
    await user.click(screen.getByRole("button", { name: "Next saved measurement page" }));
    expect(state.onExpand).toHaveBeenLastCalledWith(null);
    expect(within(list).getAllByRole("listitem")).toHaveLength(50);
    expect(screen.getByRole("button", { name: "Inspect measurement Measurement 50" })).toBeVisible();
    state.measurements = [saved(0)]; state.expandedId = null;
    view.rerender(<MeasurementTool {...state} />);
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Inspect measurement Measurement 0" })).toBeVisible();
  });

  it("handles nested Escape before stopping acquisition, then closes with owner-aware focus return", async () => {
    const state = props(), user = userEvent.setup();
    state.draft = { ...state.draft, kind: "angle", slots: [null, null, null] };
    state.selection = canonicalSelection([atom(1), atom(2), atom(3)]);
    const view = render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Use selection" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Confirm measurement order" })).not.toBeInTheDocument();
    expect(state.onCancelAcquisition).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use selection" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(state.onCancelAcquisition).toHaveBeenCalledOnce();
    expect(state.onClose).not.toHaveBeenCalled();
    state.draft = { ...state.draft, acquiring: false };
    view.rerender(<MeasurementTool {...state} />);
    await user.keyboard("{Escape}");
    expect(state.onClose).toHaveBeenCalledOnce();
    state.draft = { ...state.draft, open: false };
    view.rerender(<MeasurementTool {...state} />);
    await waitFor(() => expect(state.onReturnFocus).toHaveBeenCalledOnce());
  });

  it.each([true, false])("leaves Escape to another focused dialog without changing measurement acquisition=%s", acquiring => {
    const state = props();
    state.draft = { ...state.draft, acquiring, name: "Retained draft", slots: [atom(2), atom(1)] };
    const consumed = vi.fn();
    render(<><aside role="dialog" aria-label="Inspector panel" onKeyDown={event => {
      if (event.key === "Escape") { consumed(); event.preventDefault(); event.stopPropagation(); }
    }}><button type="button">Choose ligand</button></aside><MeasurementTool {...state} /></>);
    const trigger = screen.getByRole("button", { name: "Choose ligand" });
    trigger.focus();
    const captured = vi.fn((event: KeyboardEvent) => {
      // This native document-capture listener runs before React's drawer bubble
      // handler. Radix dismissal must already have been prevented here.
      expect(event.defaultPrevented).toBe(true);
      expect(consumed).not.toHaveBeenCalled();
    });
    document.addEventListener("keydown", captured, true);
    try {
      act(() => { trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    } finally { document.removeEventListener("keydown", captured, true); }
    expect(captured).toHaveBeenCalledOnce(); expect(consumed).toHaveBeenCalledOnce();
    expect(state.onClose).not.toHaveBeenCalled(); expect(state.onCancelAcquisition).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Retained draft");
    expect(state.draft.slots).toEqual([atom(2), atom(1)]);
  });

  it("keeps canvas Escape stopping acquisition before closing the measurement tool", async () => {
    const state = props(), user = userEvent.setup();
    const view = render(<><button type="button">Canvas action</button><MeasurementTool {...state} /></>);
    screen.getByRole("button", { name: "Canvas action" }).focus();
    await user.keyboard("{Escape}");
    expect(state.onCancelAcquisition).toHaveBeenCalledOnce(); expect(state.onClose).not.toHaveBeenCalled();
    state.draft = { ...state.draft, acquiring: false };
    view.rerender(<><button type="button">Canvas action</button><MeasurementTool {...state} /></>);
    screen.getByRole("button", { name: "Canvas action" }).focus();
    await user.keyboard("{Escape}");
    expect(state.onCancelAcquisition).toHaveBeenCalledOnce(); expect(state.onClose).toHaveBeenCalledOnce();
  });

  it("keeps preview values unavailable, preserves the controlled name and leaves Close available", () => {
    const state = props();
    state.draft = { ...state.draft, slots: [atom(1), atom(2)], name: "Retained" };
    state.value = 3; state.paused = true;
    render(<MeasurementTool {...state} />);
    expect(screen.getByText("Distance · Unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save measurement" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close measurements" })).toBeEnabled();
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Retained");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("paused during preview");
  });

  it("distinguishes duplicate saved names and keeps unavailable records editable", async () => {
    const state = props(), user = userEvent.setup();
    state.measurements = [saved(0, "Repeated"), saved(1, "Repeated")];
    state.expandedId = "saved-0";
    render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Saved measurements 2" }));
    expect(screen.getByRole("button", { name: "Hide Repeated (saved-0)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide Repeated (saved-1)" })).toBeVisible();
    expect(screen.getAllByText("Distance · Unavailable")).toHaveLength(2);
    const name = screen.getByLabelText("Name for Repeated (saved-0)");
    await user.clear(name); await user.type(name, "Renamed reference");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(state.onUpdate).toHaveBeenCalledExactlyOnceWith(state.measurements[0], "Renamed reference", true);
  });

  it("explains an expanded undefined saved angle and preserves edits and ordered targets when geometry returns", async () => {
    const state = props(), user = userEvent.setup();
    const measurement: Measurement = { ...saved(0, "Ordered angle"), kind: "angle", atom_references: [atom(3), atom(1), atom(2)] };
    const references = structuredClone(measurement.atom_references);
    const reason = "Measurement geometry is undefined or outside numerical limits.";
    state.measurements = [measurement]; state.expandedId = measurement.id;
    state.expandedInspection = { status: "unavailable", kind: "angle", targets: references, reason };
    const view = render(<MeasurementTool {...state} />);
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Saved measurements 1" }));
    const actions = screen.getByRole("group", { name: "Actions for Ordered angle" });
    expect(within(actions).getByText(reason)).toBeVisible();
    expect(screen.getByText("Angle · Unavailable")).toBeVisible();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(within(actions).getByRole("button", { name: "Delete measurement Ordered angle" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Hide Ordered angle" })).toBeEnabled();
    const name = within(actions).getByLabelText("Name for Ordered angle");
    await user.clear(name); await user.type(name, "Retained rename");
    await user.click(within(actions).getByRole("button", { name: "Select participants" }));
    expect(state.onSelectParticipants).toHaveBeenCalledExactlyOnceWith(measurement);
    expect(measurement.atom_references).toEqual(references);

    state.savedValues = new Map([[measurement.id, 90]]);
    state.expandedInspection = { status: "ready", kind: "angle", targets: references, value: 90 };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
    expect(screen.getByText("Angle · 90.0°")).toBeVisible();
    expect(name).toHaveValue("Retained rename");
    await user.click(within(actions).getByRole("button", { name: "Save name" }));
    expect(state.onUpdate).toHaveBeenCalledExactlyOnceWith(measurement, "Retained rename", true);
    expect(measurement.atom_references).toEqual(references);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it.each([
    "Loading current target information…",
    "Target atom information could not be loaded. Close and reopen this record to retry.",
  ])("shows the current saved source explanation only in expanded controls: %s", async reason => {
    const state = props(), user = userEvent.setup(), measurement = saved(0);
    state.measurements = [measurement]; state.expandedId = measurement.id;
    state.expandedInspection = { status: "unavailable", kind: measurement.kind, targets: measurement.atom_references, reason };
    const view = render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Saved measurements 1" }));
    const actions = screen.getByRole("group", { name: "Actions for Measurement 0" });
    expect(within(actions).getByText(reason)).toBeVisible();
    expect(within(actions).getByLabelText("Name for Measurement 0")).toBeEnabled();
    expect(within(actions).getByRole("button", { name: "Select participants" })).toBeEnabled();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    state.expandedId = null; state.expandedInspection = null;
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Actions for Measurement 0" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect measurement Measurement 0" })).toBeVisible();
  });

  it("shows a saved preview pause instead of stale source feedback and clears it on current ready geometry", async () => {
    const state = props(), user = userEvent.setup(), measurement = saved(0);
    state.measurements = [measurement]; state.expandedId = measurement.id;
    state.savedValues = new Map([[measurement.id, 3]]);
    state.expandedInspection = { status: "unavailable", kind: measurement.kind, targets: measurement.atom_references,
      reason: "Retired source failure." };
    state.paused = true;
    const view = render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Saved measurements 1" }));
    const actions = screen.getByRole("group", { name: "Actions for Measurement 0" });
    expect(within(actions).getByText("Geometry unavailable during preview.")).toBeVisible();
    expect(screen.queryByText("Retired source failure.")).not.toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Select participants" })).toBeDisabled();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    state.paused = false;
    state.expandedInspection = { status: "ready", kind: measurement.kind, targets: measurement.atom_references, value: 3 };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.queryByText("Geometry unavailable during preview.")).not.toBeInTheDocument();
    expect(screen.getByText("Distance · 3.00 Å")).toBeVisible();
    expect(within(actions).getByRole("button", { name: "Select participants" })).toBeEnabled();
  });

  it("leaves outside focus and ordinary canvas controls available without dismissing or returning focus", async () => {
    const state = props(), user = userEvent.setup();
    const contents = () => <><button type="button">Canvas control</button><MeasurementTool {...state} /></>;
    const view = render(contents());
    await user.click(screen.getByRole("button", { name: "Canvas control" }));
    expect(screen.getByRole("button", { name: "Canvas control" })).toHaveFocus();
    expect(state.onClose).not.toHaveBeenCalled();
    state.draft = { ...state.draft, open: false };
    view.rerender(contents());
    await act(async () => { await Promise.resolve(); });
    expect(state.onReturnFocus).not.toHaveBeenCalled();
  });

  it("pauses saved writes during preview and keeps pending Save truthful while picking can stop", async () => {
    const state = props(), user = userEvent.setup();
    state.measurements = [saved(0)]; state.expandedId = "saved-0"; state.canFocus = () => true;
    const view = render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Saved measurements 1" }));
    const name = screen.getByLabelText("Name for Measurement 0");
    await user.clear(name); await user.type(name, "Retained rename");
    state.paused = true;
    view.rerender(<MeasurementTool {...state} />);
    for (const label of ["Hide Measurement 0", "Save name", "Delete measurement Measurement 0", "Select participants", "Focus"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
    expect(name).toBeDisabled(); expect(name).toHaveValue("Retained rename");
    state.paused = false;
    state.draft = { ...state.draft, name: "Pending reference", slots: [atom(1), atom(2)], saving: true, notice: "Saving measurement…" };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Saving measurement… Save may finish after closing.");
    expect(screen.getByRole("button", { name: "Close measurements" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Stop picking" }));
    expect(state.onCancelAcquisition).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Pending reference");
    expect(state.draft.slots).toEqual([atom(1), atom(2)]);
  });

  it("collapses only through the owner, preserves the draft, releases chooser reads and never auto-expands after the final pick", async () => {
    const state = props(), user = userEvent.setup();
    state.draft = { ...state.draft, kind: "angle", slots: [atom(1), null, null], name: "Keep this reference", activeSlot: 1 };
    state.onPickInViewer = vi.fn(); state.onReviewTargets = vi.fn(); state.onChooserEntryChange = vi.fn();
    state.contactsOpen = true;
    const view = render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Choose atom for target 2" }));
    await user.click(screen.getByRole("button", { name: "Protein" }));
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith("entry");
    await user.click(screen.getByRole("button", { name: "Pick in viewer" }));
    expect(state.onPickInViewer).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Keep this reference");
    state.draft = { ...state.draft, minimized: true };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.queryByLabelText("Measurement name")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Measurement targets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Choose measurement atom" })).not.toBeInTheDocument();
    expect(screen.queryByText("Current close contacts")).not.toBeInTheDocument();
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith(null);
    expect(state.onExpand).toHaveBeenLastCalledWith(null);
    expect(state.onContactsOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("Angle")).toBeVisible();
    expect(screen.getByText("Target 2 of 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review targets" })).toHaveFocus();
    expect(state.draft.name).toBe("Keep this reference");
    state.draft = { ...state.draft, slots: [atom(3), atom(1), atom(2)], activeSlot: null };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getByText("Targets ready")).toBeVisible();
    expect(screen.queryByLabelText("Measurement name")).not.toBeInTheDocument();
    expect(state.onReviewTargets).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review targets" }));
    expect(state.onReviewTargets).toHaveBeenCalledOnce();
    state.draft = { ...state.draft, minimized: false, activeSlot: 1 };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getByRole("button", { name: "Pick target 2, angle vertex" })).toHaveFocus();
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Keep this reference");
    expect(state.draft.slots).toEqual([atom(3), atom(1), atom(2)]);
    await user.click(screen.getByRole("button", { name: "Choose atom for target 2" }));
    state.draft = { ...state.draft, minimized: true };
    view.rerender(<MeasurementTool {...state} />);
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("region", { name: "Choose measurement atom" })).not.toBeInTheDocument();
  });

  it.each(["busy", "saving", "paused"] as const)("disables starting viewer picking while %s", async condition => {
    const state = props(); state.onPickInViewer = vi.fn();
    if (condition === "saving") state.draft = { ...state.draft, saving: true };
    else state[condition] = true;
    render(<MeasurementTool {...state} />);
    const button = screen.getByRole("button", { name: "Pick in viewer" });
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(state.onPickInViewer).not.toHaveBeenCalled();
  });

  it("keeps compact review and close available during Save, and Escape stops picking before closing", async () => {
    const state = props(), user = userEvent.setup();
    state.onPickInViewer = vi.fn(); state.onReviewTargets = vi.fn();
    state.draft = { ...state.draft, minimized: true, slots: [atom(1), atom(2)], name: "Pending reference", saving: true, notice: "Saving…" };
    const view = render(<MeasurementTool {...state} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Save may finish after closing.");
    expect(screen.getByRole("button", { name: "Review targets" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close measurements" })).toBeEnabled();
    await user.keyboard("{Escape}");
    expect(state.onCancelAcquisition).toHaveBeenCalledOnce();
    expect(state.onClose).not.toHaveBeenCalled();
    state.draft = { ...state.draft, acquiring: false };
    view.rerender(<MeasurementTool {...state} />);
    await user.keyboard("{Escape}");
    expect(state.onClose).toHaveBeenCalledOnce();
    expect(state.draft.name).toBe("Pending reference");
    expect(state.draft.slots).toEqual([atom(1), atom(2)]);
    await user.click(screen.getByRole("button", { name: "Review targets" }));
    state.draft = { ...state.draft, minimized: false };
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getByRole("heading", { name: "Measurements" })).toHaveFocus();
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Pending reference");
    expect(screen.getByLabelText("Measurement name")).toBeDisabled();
  });

  it("keeps a rejected target chooser open and focused until its owner accepts a current atom", async () => {
    const state = props(), user = userEvent.setup();
    state.draft = { ...state.draft, slots: [atom(1), null], name: "Retained draft" };
    state.onChooserEntryChange = vi.fn(); state.onChooseTarget = vi.fn(() => false);
    const view = render(<MeasurementTool {...state} />);
    await user.click(screen.getByRole("button", { name: "Choose atom for target 1" }));
    const chooser = screen.getByRole("region", { name: "Choose measurement atom" });
    const choice = within(chooser).getByRole("button", { name: /atom 2$/ });
    await user.click(choice);
    expect(state.onChooseTarget).toHaveBeenCalledExactlyOnceWith(atom(2));
    expect(chooser).toBeVisible(); expect(choice).toHaveFocus();
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith("entry");
    expect(screen.getByLabelText("Measurement name")).toHaveValue("Retained draft");
    expect(state.draft.slots).toEqual([atom(1), null]);
    state.onChooseTarget = vi.fn(() => true);
    view.rerender(<MeasurementTool {...state} />);
    await user.click(choice);
    expect(screen.queryByRole("region", { name: "Choose measurement atom" })).not.toBeInTheDocument();
    expect(state.onChooserEntryChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: "Choose atom for target 1" })).toHaveFocus();
  });

  it("keeps contacts secondary and renders only explicitly opened content", async () => {
    const state = props(), user = userEvent.setup();
    const view = render(<MeasurementTool {...state} />);
    expect(screen.queryByText("Current close contacts")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close contacts" }));
    expect(state.onContactsOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    state.contactsOpen = true;
    view.rerender(<MeasurementTool {...state} />);
    expect(screen.getByText("Current close contacts")).toBeVisible();
  });
});
