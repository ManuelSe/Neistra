import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorContentAnchor } from "../components/InspectorContentAnchor";
import { LigandProperties } from "../components/LigandProperties";
import { PropertyInputOwner } from "../ligandProperties/ownership";
import { LigandPropertySession, propertyTargetKey } from "../ligandProperties/session";
import type { LigandPropertyApi, PropertyAggregate } from "../ligandProperties/types";
import { deferredProperty, propertyEntry, propertyPreferences, propertyRegistry, propertyResult, propertyTarget } from "./ligand-properties-fixtures";

const shift = 108.4375;
const visit = (project = "project-1", tab = "selection", request = 0) => JSON.stringify([project, tab, request]);
const cleanups: (() => void)[] = [];
afterEach(() => { cleanup(); cleanups.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); });
function rect(top: number): DOMRect {
  return { top, left: 0, width: 300, height: 30, right: 300, bottom: top + 30, x: 0, y: top, toJSON: () => ({}) };
}
/** jsdom does not lay out. Heights derive from committed DOM content, so React's
 * real pre-mutation snapshot must distinguish pending and published frames.
 * Actual geometry remains covered by the unchanged native access oracle.
 */
function measurements(owner: HTMLElement, control: HTMLElement, ready: () => boolean) {
  let scroll = 150;
  const writes: number[] = [];
  Object.defineProperty(owner, "scrollTop", { configurable: true, get: () => scroll, set: (value: number) => { scroll = value; writes.push(value); } });
  vi.spyOn(owner, "getBoundingClientRect").mockImplementation(() => rect(50));
  vi.spyOn(control, "getBoundingClientRect").mockImplementation(() => rect(50 + 400 + (ready() ? 0 : shift) - scroll));
  return { writes, top: () => control.getBoundingClientRect().top, scroll: () => scroll };
}
interface Frame {
  ready: boolean; scope: string | null; token: string | undefined; innerOwner: boolean; body: boolean; controlKey: string;
  onCommit?: () => void;
}
function DuringCommit({ ready, run }: { ready: boolean; run?: () => void }) {
  useLayoutEffect(() => { if (ready) run?.(); }, [ready, run]);
  return null;
}
function setup() {
  let frame: Frame = { ready: false, scope: "entry-1", token: visit(), innerOwner: true, body: true, controlKey: "original" };
  function Tree(props: Frame) {
    return <div className="inspector-scroll" data-inspector-visit={visit("outer-project")} aria-label="Outer owner">
      <div className={props.innerOwner ? "inspector-scroll" : "previous-owner"} data-inspector-visit={props.token} aria-label="Current owner">
        <InspectorContentAnchor scope={props.scope} className="ligand-properties" aria-label="Properties">
          <p>{props.ready ? "Current derived content" : "Pending qualification and methods"}</p><input aria-label="Profile control" />
          <DuringCommit ready={props.ready} run={props.onCommit} />
        </InspectorContentAnchor>
        <div className={props.body ? "inspector-body" : "previous-body"}>
          <input aria-label="Legacy query" key={props.controlKey} /><input aria-label="Other task control" />
        </div>
      </div>
    </div>;
  }
  const rendered = render(<Tree {...frame} />);
  const owner = screen.getByLabelText("Current owner"), control = screen.getByRole("textbox", { name: "Legacy query" });
  const section = screen.getByRole("region", { name: "Properties" });
  const layout = measurements(owner, control, () => section.textContent?.includes("Current derived content") ?? false);
  control.focus();
  return { owner, control, section, ...layout, update: (next: Partial<Frame>) => { frame = { ...frame, ...next }; rendered.rerender(<Tree {...frame} />); } };
}

describe("focused inspector reading position", () => {
  it("observes a real local property-session publication without parent rerender or remount", async () => {
    const target = propertyTarget(), response = deferredProperty<PropertyAggregate>();
    const owner = new PropertyInputOwner(() => ({ activeProjectId: target.projectId, inspectedEntryId: target.source.entry_id,
      paused: false, inputKey: propertyTargetKey(target) }));
    const api: LigandPropertyApi = { registry: vi.fn(), preferences: vi.fn(), savePreferences: vi.fn(), allocate: vi.fn(),
      release: vi.fn(), read: vi.fn().mockReturnValue(response.promise), demand: vi.fn() };
    const session = new LigandPropertySession(value => owner.capture(value), api), client = new QueryClient();
    cleanups.push(() => { session.deactivate(); client.clear(); });
    const parentRender = vi.fn();
    function Host() {
      parentRender(); useLayoutEffect(() => session.connect(target), []);
      return <div className="inspector-scroll" data-inspector-visit={visit()} aria-label="Current owner">
        <LigandProperties state={{ entry: propertyEntry(), target, owner, registry: propertyRegistry, preferences: propertyPreferences,
          enabledDefinitions: propertyRegistry.definitions, configurationError: false, pausedReason: null, tooLarge: false, retryOptions: () => {} }} session={session} />
        <div className="inspector-body"><input aria-label="Legacy query" /></div>
      </div>;
    }
    render(<QueryClientProvider client={client}><Tooltip.Provider><Host /></Tooltip.Provider></QueryClientProvider>);
    const scroll = screen.getByLabelText("Current owner"), control = screen.getByRole("textbox", { name: "Legacy query" });
    const section = screen.getByRole("region", { name: "Properties" });
    const layout = measurements(scroll, control, () => !!section.querySelector("time")); control.focus(); const before = layout.top();
    await act(async () => { response.resolve(propertyResult(target)); await response.promise; });
    expect(parentRender).toHaveBeenCalledTimes(1); expect(screen.getByRole("region", { name: "Properties" })).toBe(section);
    expect(screen.getByRole("textbox", { name: "Legacy query" })).toBe(control); expect(control).toHaveFocus();
    expect(section.querySelector("time")).not.toBeNull(); expect(layout.top()).toBe(before); expect(layout.writes).toEqual([150 - shift]);
  });
  it("preserves the same focused task offset when published content becomes shorter", () => {
    const view = setup(), before = view.top(); view.update({ ready: true });
    expect(view.control).toHaveFocus(); expect(view.top()).toBe(before); expect(view.writes).toEqual([150 - shift]);
    expect(screen.getByRole("region", { name: "Properties" })).toBe(view.section);
  });
  it("uses the latest deliberate user scroll rather than an older position", () => {
    const view = setup(); view.owner.scrollTop = 350; view.writes.length = 0;
    const latest = view.top(); view.update({ ready: true }); expect(view.top()).toBe(latest); expect(view.writes).toEqual([350 - shift]);
  });
  it("preserves the reading position when replacement qualification content grows", () => {
    const view = setup(); view.update({ ready: true }); view.writes.length = 0;
    const before = view.top(); view.update({ ready: false });
    expect(view.top()).toBe(before); expect(view.writes).toEqual([150]);
  });
  it("leaves complete native scroll anchoring alone", () => {
    const view = setup(), before = view.top(); view.update({ ready: true, onCommit: () => { view.owner.scrollTop -= shift; } });
    expect(view.top()).toBe(before); expect(view.writes).toEqual([150 - shift]);
  });
  it("adds only the residual after partial native scroll anchoring", () => {
    const view = setup(), before = view.top(); view.update({ ready: true, onCommit: () => { view.owner.scrollTop -= 64; } });
    expect(view.top()).toBe(before); expect(view.writes).toEqual([150 - 64, 150 - shift]);
  });
  for (const [name, token] of [["project", visit("project-2")], ["tab", visit("project-1", "inspect")],
    ["same-tab task activation", visit("project-1", "selection", 1)]] as const) {
    it(`yields to deliberate ${name} navigation in the publication commit`, () => {
      const view = setup(); view.update({ ready: true, token, onCommit: () => { view.owner.scrollTop = 42; } });
      expect(view.writes).toEqual([42]); expect(view.scroll()).toBe(42);
    });
  }
  it("does not restore an earlier entry's reading position", () => {
    const view = setup(); view.update({ ready: true, scope: "entry-2" }); expect(view.writes).toEqual([]);
  });
  it("does not move a newly focused control after the snapshot", () => {
    const view = setup(); view.update({ ready: true, onCommit: () => { screen.getByRole("textbox", { name: "Other task control" }).focus(); } });
    expect(screen.getByRole("textbox", { name: "Other task control" })).toHaveFocus(); expect(view.writes).toEqual([]);
  });
  it("does not scroll for a disconnected former control", () => {
    const view = setup(); view.update({ ready: true, controlKey: "replacement" }); expect(view.control.isConnected).toBe(false); expect(view.writes).toEqual([]);
  });
  it("does not apply an old owner offset to a different nearest owner", () => {
    const view = setup(), outer = screen.getByLabelText("Outer owner"), outerLayout = measurements(outer, document.createElement("input"), () => false);
    view.update({ ready: true, innerOwner: false }); expect(view.writes).toEqual([]); expect(outerLayout.writes).toEqual([]);
  });
  it("does not anchor a control moved out of its legacy task body", () => {
    const view = setup(); view.update({ ready: true, body: false }); expect(view.writes).toEqual([]);
  });
  it("leaves focus inside Properties and unknown task visits to native behavior", () => {
    const view = setup(); screen.getByRole("textbox", { name: "Profile control" }).focus(); view.update({ ready: true }); expect(view.writes).toEqual([]);
    view.control.focus(); view.update({ ready: false, token: undefined }); view.writes.length = 0; view.update({ ready: true }); expect(view.writes).toEqual([]);
  });
  it("does not write when publication leaves the reading offset unchanged", () => {
    const view = setup(); view.update({ onCommit: () => {} }); expect(view.writes).toEqual([]);
  });
});
