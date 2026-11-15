import * as Tooltip from "@radix-ui/react-tooltip";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { InteractionPanel } from "../components/InteractionPanel";
import { InteractionSwatch } from "../components/InteractionSwatch";
import type { InteractionPanelProps } from "../interactions/panelModel";
import { defaultInteractionAppearance } from "../interactions/styles";
import { INTERACTION_KINDS, type InteractionKind } from "../interactions/types";

afterEach(cleanup);
type WithoutThis<T> = T extends (...args: infer A) => infer R ? (this: void, ...args: A) => R : T;
type PanelFixture = { [K in keyof InteractionPanelProps]: WithoutThis<InteractionPanelProps[K]> };
function fixture(): PanelFixture {
  return {
    open: true, onOpenChange: vi.fn(), collapsed: false, onCollapsedChange: vi.fn(), show: true, onShowChange: vi.fn(),
    choices: { types: ["hydrogen_bond"], inter: true, intra: false }, onToggleType: vi.fn(), onToggleScope: vi.fn(),
    target: { mode: "all", label: "All visible", message: null, ligandKey: "", candidates: [], canCaptureSelection: true, captureUnavailable: null, selectionChanged: false, needsUpdate: false },
    onTargetModeChange: vi.fn(), onLigandChange: vi.fn(), onCaptureSelection: vi.fn(),
    categories: Object.fromEntries(INTERACTION_KINDS.map(kind => [kind, { detected: 3, shown: 1, coverage: "complete" }])) as InteractionPanelProps["categories"],
    status: { message: "1 shown · 3 detected", phase: "ready", partial: false }, contacts: [], resultIdentity: "result-a", inspectedKey: null,
    onInspectContact: vi.fn(), inspected: null, warnings: [], onFocusContact: vi.fn(), onSelectContact: vi.fn(), onSelectWarning: vi.fn(),
    appearance: defaultInteractionAppearance(), onAppearanceChange: vi.fn(), onResetAppearance: vi.fn(),
  };
}
const panel = (props: InteractionPanelProps) => <Tooltip.Provider><InteractionPanel {...props} /></Tooltip.Provider>;

it("keeps master visibility, categories and independent scopes as separate controlled actions", async () => {
  const props = fixture(), user = userEvent.setup();
  render(panel(props));
  await user.click(screen.getByRole("button", { name: "Show interactions" }));
  expect(props.onShowChange).toHaveBeenCalledExactlyOnceWith(false);
  expect(props.onToggleType).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Hydrophobic" }));
  await user.click(screen.getByRole("button", { name: "Intermolecular interactions" }));
  await user.click(screen.getByRole("button", { name: "Intramolecular interactions" }));
  expect(props.onToggleType).toHaveBeenCalledExactlyOnceWith("hydrophobic");
  expect(props.onToggleScope).toHaveBeenNthCalledWith(1, "inter");
  expect(props.onToggleScope).toHaveBeenNthCalledWith(2, "intra");
  expect(screen.getByRole("button", { name: "H bonds" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "H bonds" }).querySelector(".interaction-check svg")).not.toBeNull();
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

it("shows detected and acknowledged shown counts distinctly, with conservative input coverage", () => {
  const props = fixture();
  props.categories = { ...props.categories, hydrogen_bond: { detected: 9, shown: null, coverage: "partial" }, pi_pi: { detected: null, shown: null, coverage: "unavailable" } };
  render(panel(props));
  const hydrogen = screen.getByRole("button", { name: "H bonds" });
  expect(hydrogen).toHaveTextContent("9 detected");
  expect(hydrogen).toHaveAttribute("aria-description", expect.stringContaining("current display not confirmed"));
  expect(hydrogen).toHaveAttribute("aria-description", expect.stringContaining("Partial input coverage"));
  const pi = screen.getByRole("button", { name: "π–π" });
  expect(pi).toHaveAttribute("aria-description", expect.stringContaining("Input coverage unavailable"));
  expect(pi).toHaveTextContent("—");
  const clashes = screen.getByRole("button", { name: "Clashes" });
  expect(clashes).toHaveTextContent("3 detected");
  expect(clashes).toHaveAttribute("aria-description", expect.stringContaining("1 shown"));
  expect(screen.getByRole("button", { name: "H bonds" })).not.toHaveTextContent("0 shown");
});

it("requires an explicit ligand instance, including when only one candidate exists", async () => {
  const props = fixture(), user = userEvent.setup();
  props.target = { ...props.target, mode: "ligand", candidates: [{ key: "ligand-1", entryId: "entry", componentId: "one", label: "Entry · LIG 1 A", atoms: [], eligible: true, reason: null }] };
  render(panel(props));
  const input = screen.getByRole("combobox", { name: "Interaction ligand instance" });
  expect(input).toHaveValue("");
  expect(props.onLigandChange).not.toHaveBeenCalled();
  await user.selectOptions(input, "ligand-1");
  expect(props.onLigandChange).toHaveBeenCalledExactlyOnceWith("ligand-1");
  await user.selectOptions(screen.getByRole("combobox", { name: "Interaction target" }), "selection");
  expect(props.onTargetModeChange).toHaveBeenCalledWith("selection");
  expect(props.onCaptureSelection).not.toHaveBeenCalled();
});

it("retains captured selection until explicit Update and explains unavailable capture", async () => {
  const props = fixture(), user = userEvent.setup();
  props.target = { ...props.target, mode: "selection", label: "Captured 4 atoms", selectionChanged: true };
  const view = render(panel(props));
  expect(screen.getByText("Captured 4 atoms")).toBeVisible();
  expect(props.onCaptureSelection).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Update from selection" }));
  expect(props.onCaptureSelection).toHaveBeenCalledTimes(1);
  view.rerender(panel({ ...props, target: { ...props.target, label: "Captured 4 atoms", canCaptureSelection: false, captureUnavailable: "Select atoms first." } }));
  const update = screen.getByRole("button", { name: "Update from selection" });
  expect(update).toHaveAccessibleDescription("Select atoms first.");
  await user.click(update);
  expect(props.onCaptureSelection).toHaveBeenCalledTimes(1);
});

it("explicitly updates changed ligand membership without choosing another instance", async () => {
  const props = fixture(), user = userEvent.setup();
  props.target = { ...props.target, mode: "ligand", ligandKey: "same-instance", label: "Original ligand · LIG 4 B", needsUpdate: true,
    candidates: [{ key: "same-instance", entryId: "entry", componentId: "four", label: "Original ligand · LIG 4 B", atoms: [], eligible: true, reason: null }] };
  const view = render(panel(props));
  expect(screen.getByRole("combobox", { name: "Interaction ligand instance" })).toHaveValue("same-instance");
  expect(props.onLigandChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Update ligand target" }));
  expect(props.onLigandChange).toHaveBeenCalledExactlyOnceWith("same-instance");
  view.rerender(panel({ ...props, target: { ...props.target, candidates: [{ ...props.target.candidates[0], eligible: false, reason: "This instance is now ambiguously connected." }] } }));
  expect(screen.queryByRole("button", { name: "Update ligand target" })).not.toBeInTheDocument();
  expect(screen.getByText("This instance is now ambiguously connected.", { selector: "p" })).toBeVisible();
  expect(props.onLigandChange).toHaveBeenCalledTimes(1);
});

it("retains the unavailable captured ligand in its chooser instead of displaying another candidate", async () => {
  const props = fixture(), user = userEvent.setup();
  props.target = { ...props.target, mode: "ligand", ligandKey: "retired", label: "Captured ligand · LIG 9 A", needsUpdate: true, message: "The captured ligand is no longer available. Update the interaction target.",
    candidates: [{ key: "other", entryId: "entry", componentId: "other", label: "Different ligand · LIG 10 A", atoms: [], eligible: true, reason: null }] };
  render(panel(props));
  const chooser = screen.getByRole("combobox", { name: "Interaction ligand instance" });
  expect(chooser).toHaveValue("retired");
  const retained = within(chooser).getByRole("option", { name: "Captured ligand · LIG 9 A · unavailable" });
  expect(retained).toBeDisabled();
  expect(retained).toHaveProperty("selected", true);
  expect(props.onLigandChange).not.toHaveBeenCalled();
  await user.selectOptions(chooser, "other");
  expect(props.onLigandChange).toHaveBeenCalledExactlyOnceWith("other");
});

it("keeps the full captured target accessible in the collapsed strip", () => {
  const props = fixture();
  props.collapsed = true;
  props.target = { ...props.target, mode: "selection", label: "Captured 42 atoms · Receptor chain A and ligand LIG 8" };
  render(panel(props));
  const summary = screen.getByLabelText(`Target: ${props.target.label}`);
  expect(summary).toBeVisible();
  expect(summary).toHaveAttribute("title", `Target: ${props.target.label}`);
  expect(summary).toHaveTextContent(props.target.label);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.queryByRole("combobox", { name: "Interaction target" })).not.toBeInTheDocument();
});

it("bounds a 20,000-record contact list to thirty rows and resets pages for new result identity", async () => {
  const props = fixture(), user = userEvent.setup();
  props.contacts = Array.from({ length: 20_000 }, (_, index) => ({ key: `contact-${index}`, kind: "hydrogen_bond" as InteractionKind, summary: `Independent atoms ${index}`, primaryMetric: "1.800 Å" }));
  const view = render(panel(props));
  await user.click(screen.getByText("Contacts", { selector: "summary" }));
  expect(document.querySelectorAll(".interaction-contact-row")).toHaveLength(30);
  expect(screen.getByText("1–30 of 20000")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next contact page" }));
  expect(screen.getByText("31–60 of 20000")).toBeVisible();
  expect(screen.queryByText("Independent atoms 0")).not.toBeInTheDocument();
  expect(document.querySelectorAll(".interaction-contact-row")).toHaveLength(30);
  await user.click(screen.getByRole("button", { name: /Independent atoms 30$/ }));
  expect(props.onInspectContact).toHaveBeenCalledWith("contact-30");
  expect(props.onSelectContact).not.toHaveBeenCalled();
  expect(props.onCaptureSelection).not.toHaveBeenCalled();
  view.rerender(panel({ ...props, resultIdentity: "result-b" }));
  expect(screen.getByText("1–30 of 20000")).toBeVisible();
});

it("keeps Focus, Select and exact details independent, and blocks unavailable actions", async () => {
  const props = fixture(), user = userEvent.setup();
  props.inspectedKey = "salt";
  props.inspected = { key: "salt", participants: ["Ligand · N #7", "Protein · ASP 45 · OD1 #82"], metrics: [{ label: "Nearest charge-site distance", value: 4.125, unit: "Å" }], scope: "inter", focusUnavailable: null, selectUnavailable: null };
  const view = render(panel(props));
  await user.click(screen.getByText("Contacts", { selector: "summary" }));
  const details = screen.getByRole("region", { name: "Contact details" });
  expect(within(details).getByText("Nearest charge-site distance")).toBeVisible();
  expect(within(details).getByText("4.125 Å")).toBeVisible();
  await user.click(within(details).getByRole("button", { name: "Focus" }));
  expect(props.onFocusContact).toHaveBeenCalledExactlyOnceWith("salt");
  expect(props.onSelectContact).not.toHaveBeenCalled();
  await user.click(within(details).getByRole("button", { name: "Select atoms" }));
  expect(props.onSelectContact).toHaveBeenCalledExactlyOnceWith("salt");
  view.rerender(panel({ ...props, inspected: { ...props.inspected, focusUnavailable: "Current display is not ready.", selectUnavailable: "Current structure is unavailable." } }));
  await user.click(screen.getByRole("button", { name: "Focus" }));
  await user.click(screen.getByRole("button", { name: "Select atoms" }));
  expect(props.onFocusContact).toHaveBeenCalledTimes(1);
  expect(props.onSelectContact).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Focus: Current display is not ready.")).toBeVisible();
  expect(props.onCaptureSelection).not.toHaveBeenCalled();
});

it("does not display mismatched retired inspected details", async () => {
  const props = fixture(), user = userEvent.setup();
  props.inspectedKey = "new";
  props.inspected = { key: "old", participants: ["Retired atom"], metrics: [], scope: "inter", focusUnavailable: null, selectUnavailable: null };
  render(panel(props));
  await user.click(screen.getByText("Contacts", { selector: "summary" }));
  expect(screen.queryByRole("region", { name: "Contact details" })).not.toBeInTheDocument();
  expect(screen.queryByText("Retired atom")).not.toBeInTheDocument();
});

it("bounds warning groups and only selects exact available known-site groups", async () => {
  const props = fixture(), user = userEvent.setup();
  props.warnings = Array.from({ length: 75 }, (_, index) => ({ key: `warning-${index}`, entryLabel: `Entry ${index}`, message: `Unknown chemistry ${index}`, code: "unknown", knownAtomCount: index === 0 ? 2 : 0, occurrences: 3, selectUnavailable: index === 0 ? null : "No known affected atoms." }));
  render(panel(props));
  await user.click(screen.getByText("Warnings", { selector: "summary" }));
  expect(document.querySelectorAll(".interaction-warning-list > li")).toHaveLength(30);
  await user.click(screen.getByRole("button", { name: "Select affected atoms: Entry 0 · unknown" }));
  await user.click(screen.getByRole("button", { name: "Select affected atoms: Entry 1 · unknown" }));
  expect(props.onSelectWarning).toHaveBeenCalledExactlyOnceWith("warning-0");
  await user.click(screen.getByRole("button", { name: "Next warning page" }));
  expect(screen.getByText("31–60 of 75 groups")).toBeVisible();
  expect(document.querySelectorAll(".interaction-warning-list > li")).toHaveLength(30);
});

it("changes presentation only through bounded color, width and reset callbacks", async () => {
  const props = fixture(), user = userEvent.setup();
  render(panel(props));
  await user.click(screen.getByText("Advanced appearance", { selector: "summary" }));
  fireEvent.change(screen.getByLabelText("Cation–π color"), { target: { value: "#123456" } });
  await user.selectOptions(screen.getByRole("combobox", { name: "Cation–π width" }), "6");
  expect(props.onAppearanceChange).toHaveBeenNthCalledWith(1, "cation_pi", { color: "#123456" });
  expect(props.onAppearanceChange).toHaveBeenNthCalledWith(2, "cation_pi", { width: 6 });
  await user.click(screen.getByRole("button", { name: "Reset Cation–π appearance" }));
  expect(props.onResetAppearance).toHaveBeenNthCalledWith(1, "cation_pi");
  await user.click(screen.getByRole("button", { name: "Reset appearance" }));
  expect(props.onResetAppearance).toHaveBeenNthCalledWith(2);
  expect(props.onToggleType).not.toHaveBeenCalled();
  expect(props.onCaptureSelection).not.toHaveBeenCalled();
});

it("renders genuinely different shared dash grammar and a solid clash sample", () => {
  const appearance = defaultInteractionAppearance();
  const view = render(<InteractionSwatch kind="cation_pi" appearance={appearance.cation_pi} />);
  const cationPattern = view.container.querySelector("line")!.getAttribute("stroke-dasharray")!;
  const cationLengths = cationPattern.split(" ").map(Number);
  expect(cationLengths).toHaveLength(4);
  expect(cationLengths[0] / cationLengths[2]).toBeCloseTo(0.45 / 0.08);
  expect(view.container.querySelector("line")).toHaveAttribute("stroke", "#5079d3");
  view.rerender(<InteractionSwatch kind="salt_bridge" appearance={appearance.salt_bridge} />);
  const saltLengths = view.container.querySelector("line")!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
  expect(saltLengths).toHaveLength(4);
  expect(saltLengths[0]).toBe(saltLengths[2]);
  expect(saltLengths[1]).not.toBe(saltLengths[3]);
  view.rerender(<InteractionSwatch kind="clash" appearance={{ color: "#abcdef", width: 6 }} />);
  expect(view.container.querySelector("line")).not.toHaveAttribute("stroke-dasharray");
  expect(view.container.querySelector("line")).toHaveAttribute("stroke-width", "6");
});

it("collapses to status and visibility controls without losing captured intent or recapturing", async () => {
  const props = fixture(), user = userEvent.setup();
  const view = render(panel(props));
  await user.click(screen.getByRole("button", { name: "Collapse interactions" }));
  expect(props.onCollapsedChange).toHaveBeenCalledWith(true);
  view.rerender(panel({ ...props, collapsed: true }));
  expect(screen.queryByRole("combobox", { name: "Interaction target" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 shown · 3 detected");
  expect(screen.getByRole("button", { name: "Show interactions" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Expand interactions" }));
  expect(props.onCollapsedChange).toHaveBeenLastCalledWith(false);
  expect(props.onCaptureSelection).not.toHaveBeenCalled();
});

it("announces phase changes once and exposes retry without altering choices", async () => {
  const props = fixture(), user = userEvent.setup();
  props.onRetry = vi.fn();
  const view = render(panel({ ...props, status: { message: "Paused during preview", phase: "paused", partial: false } }));
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Paused during preview");
  view.rerender(panel({ ...props, status: { message: "Current display unavailable", phase: "error", partial: true } }));
  await user.click(screen.getByRole("button", { name: "Retry interaction analysis" }));
  expect(props.onRetry).toHaveBeenCalledOnce();
  expect(props.onToggleType).not.toHaveBeenCalled();
});

it("names native display recovery accurately and invokes only the provided retry action", async () => {
  const props = fixture(), user = userEvent.setup();
  props.status = { message: "Interaction display could not be installed.", phase: "error", partial: false };
  props.retryLabel = "Retry interaction display";
  props.onRetry = vi.fn();
  render(panel(props));
  expect(screen.queryByRole("button", { name: "Retry interaction analysis" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry interaction display" }));
  expect(props.onRetry).toHaveBeenCalledOnce();
  expect(props.onToggleType).not.toHaveBeenCalled();
  expect(props.onShowChange).not.toHaveBeenCalled();
});

it("restores launcher focus on scoped Escape and preserves outside canvas interaction", async () => {
  const props = fixture(), user = userEvent.setup(), canvasClick = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <Tooltip.Provider><button onClick={() => setOpen(true)}>Launch interaction panel</button><button onClick={canvasClick}>Canvas action</button><InteractionPanel {...props} open={open} onOpenChange={setOpen} /></Tooltip.Provider>;
  }
  render(<Harness />);
  const launcher = screen.getByRole("button", { name: "Launch interaction panel" });
  await user.click(launcher);
  await user.click(screen.getByRole("button", { name: "Canvas action" }));
  expect(canvasClick).toHaveBeenCalledOnce();
  expect(screen.getByRole("dialog", { name: "Interactions" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Interactions" })).toBeVisible();
  screen.getByRole("button", { name: "H bonds" }).focus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Interactions" })).not.toBeInTheDocument());
  await waitFor(() => expect(launcher).toHaveFocus());
});

it("closes on one scoped Escape when the focused Close control has an open tooltip", async () => {
  const props = fixture(), user = userEvent.setup();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <Tooltip.Provider><button onClick={() => setOpen(true)}>Open interactions</button><InteractionPanel {...props} open={open} onOpenChange={setOpen} /></Tooltip.Provider>;
  }
  render(<Harness />);
  const launcher = screen.getByRole("button", { name: "Open interactions" });
  await user.click(launcher);
  act(() => screen.getByRole("button", { name: "Close interactions" }).focus());
  expect(await screen.findByRole("tooltip", { name: "Close interactions" })).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Interactions" })).not.toBeInTheDocument());
  await waitFor(() => expect(launcher).toHaveFocus());
});

it("does not close the panel for composition Escape on either plain or tooltip controls", () => {
  const props = fixture();
  render(panel(props));
  const close = screen.getByRole("button", { name: "Close interactions" });
  act(() => close.focus());
  fireEvent.keyDown(close, { key: "Escape", isComposing: true });
  expect(props.onOpenChange).not.toHaveBeenCalled();
  const hydrogen = screen.getByRole("button", { name: "H bonds" });
  act(() => hydrogen.focus());
  fireEvent.keyDown(hydrogen, { key: "Escape", keyCode: 229 });
  expect(props.onOpenChange).not.toHaveBeenCalled();
});

it("observes the actual portaled panel after delayed mount and repositions it when its bounds change", async () => {
  const OriginalObserver = window.ResizeObserver;
  const observers: { callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  class ObservedResizeObserver implements ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) { observers.push({ callback, observe: this.observe, disconnect: this.disconnect }); }
  }
  window.ResizeObserver = ObservedResizeObserver;
  try {
    const props = fixture(), user = userEvent.setup();
    const view = render(panel({ ...props, open: false }));
    expect(observers).toHaveLength(0);
    view.rerender(panel(props));
    const dialog = await screen.findByRole("dialog", { name: "Interactions" });
    await waitFor(() => expect(observers.some(observer => observer.observe.mock.calls.some(call => call[0] === dialog))).toBe(true));
    const panelObserver = observers.find(observer => observer.observe.mock.calls.some(call => call[0] === dialog))!;
    const style = vi.spyOn(dialog.style, "setProperty");
    await user.click(screen.getByText("Contacts", { selector: "summary" }));
    act(() => { panelObserver.callback([], {} as ResizeObserver); });
    expect(style).toHaveBeenCalledWith("--interaction-top", expect.stringMatching(/px$/));
    expect(style).toHaveBeenCalledWith("--interaction-left", expect.stringMatching(/px$/));
    view.unmount();
    expect(panelObserver.disconnect).toHaveBeenCalled();
  } finally {
    window.ResizeObserver = OriginalObserver;
  }
});
