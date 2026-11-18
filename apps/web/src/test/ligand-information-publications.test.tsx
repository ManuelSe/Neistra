import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorPublications, inspectorQueryPublications } from "../components/inspectorPublications";
import { LigandInformation } from "../components/LigandInformation";
import { LigandProperties } from "../components/LigandProperties";
import { PropertyInputOwner } from "../ligandProperties/ownership";
import { LigandPropertySession, propertyTargetKey } from "../ligandProperties/session";
import type { LigandPropertyApi, PropertyAggregate } from "../ligandProperties/types";
import { deferredProperty, propertyEntry, propertyPreferences, propertyRegistry, propertyResult, propertyTarget } from "./ligand-properties-fixtures";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanup(); cleanups.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); });
function rect(top: number): DOMRect {
  return { top, left: 0, width: 300, height: 30, right: 300, bottom: top + 30, x: 0, y: top, toJSON: () => ({}) };
}
function layout(owner: HTMLElement, control: HTMLElement, published: () => boolean) {
  let scroll = 150;
  const writes: number[] = [];
  Object.defineProperty(owner, "scrollTop", { configurable: true, get: () => scroll, set: (value: number) => { scroll = value; writes.push(value); } });
  vi.spyOn(owner, "getBoundingClientRect").mockImplementation(() => rect(50));
  vi.spyOn(control, "getBoundingClientRect").mockImplementation(() => rect(450 + (published() ? 108.4375 : 0) - scroll));
  control.focus();
  return { writes, top: () => control.getBoundingClientRect().top };
}

describe("one sidebar publication boundary", () => {
  it("anchors a descendant profile control through a real local property-session publication without parent rendering", async () => {
    const target = propertyTarget(), response = deferredProperty<PropertyAggregate>();
    const owner = new PropertyInputOwner(() => ({ activeProjectId: target.projectId, inspectedEntryId: target.source.entry_id,
      paused: false, inputKey: propertyTargetKey(target) }));
    const api: LigandPropertyApi = { registry: vi.fn(), preferences: vi.fn(), savePreferences: vi.fn(), allocate: vi.fn(),
      release: vi.fn(), read: vi.fn().mockReturnValue(response.promise), demand: vi.fn() };
    const session = new LigandPropertySession(value => owner.capture(value), api), client = new QueryClient();
    cleanups.push(() => { session.deactivate(); client.clear(); });
    const publications = new InspectorPublications([session.subscribe]), parentRender = vi.fn();
    function Host() {
      parentRender(); useLayoutEffect(() => session.connect(target), []);
      return <div className="inspector-scroll" data-inspector-visit="entry-A" aria-label="Scroll owner"><div className="inspector-body">
        <LigandInformation scope="entry-A" publications={publications} complex={false}>
          <LigandProperties state={{ entry: propertyEntry(), target, owner, registry: propertyRegistry, preferences: propertyPreferences,
            enabledDefinitions: propertyRegistry.definitions, configurationError: false, pausedReason: null, tooLarge: false, retryOptions: () => {} }}
            session={session} anchored={false} />
          <input aria-label="Current profile control" />
        </LigandInformation>
      </div></div>;
    }
    render(<QueryClientProvider client={client}><Tooltip.Provider><Host /></Tooltip.Provider></QueryClientProvider>);
    const scroll = screen.getByLabelText("Scroll owner"), control = screen.getByRole("textbox", { name: "Current profile control" });
    const section = screen.getByRole("region", { name: "Ligand information" });
    const measured = layout(scroll, control, () => !!section.querySelector("time")), before = measured.top();
    await act(async () => { response.resolve(propertyResult(target)); await response.promise; });
    expect(parentRender).toHaveBeenCalledTimes(1); expect(section.querySelector("time")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Current profile control" })).toBe(control); expect(control).toHaveFocus();
    expect(measured.top()).toBe(before); expect(measured.writes).toEqual([258.4375]);
  });
  for (const outcome of ["success", "failure"] as const) it(`observes a locally subscribed real query ${outcome} in the publication commit, with no parent rendering`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); cleanups.push(() => client.clear());
    const response = deferredProperty<string>();
    const publications = new InspectorPublications([inspectorQueryPublications(client, () => ({ projectId: "P", entryId: "E" }))]);
    function Metadata() {
      const result = useQuery({ queryKey: ["ligand-depiction", "policy", "drawing", "committed", "P", "E"], queryFn: () => response.promise });
      return <><p>{result.isError ? "Current exact depiction failure" : result.data ?? "Metadata pending"}</p><input aria-label="Depiction options" /></>;
    }
    const parentRender = vi.fn();
    function Host() {
      parentRender(); return <div className="inspector-scroll" data-inspector-visit="entry-A" aria-label="Scroll owner"><div className="inspector-body">
        <LigandInformation scope="entry-A" publications={publications} complex={false}><Metadata /></LigandInformation>
      </div></div>;
    }
    render(<QueryClientProvider client={client}><Host /></QueryClientProvider>);
    const control = screen.getByRole("textbox", { name: "Depiction options" });
    const expected = outcome === "success" ? "Current exact depiction metadata" : "Current exact depiction failure";
    const measured = layout(screen.getByLabelText("Scroll owner"), control, () => !!screen.queryByText(expected)), before = measured.top();
    await act(async () => {
      if (outcome === "success") response.resolve(expected); else response.reject(new Error("Current metadata unavailable"));
      await response.promise.catch(() => {});
    });
    await screen.findByText(expected);
    expect(parentRender).toHaveBeenCalledTimes(1); expect(control).toHaveFocus(); expect(measured.top()).toBe(before);
    expect(measured.writes).toEqual([258.4375]);
  });
  for (const event of ["load", "error"] as const) it(`observes a child-local image ${event} state publication`, () => {
    const publications = new InspectorPublications(), parentRender = vi.fn();
    function Image() {
      const [status, setStatus] = useState("Image pending");
      return <><img src="/owned-test-depiction.svg" alt="Exact current ligand" onLoad={() => { publications.publish(); setStatus("Image loaded"); }}
        onError={() => { publications.publish(); setStatus("Image failed; retry available"); }} /><p>{status}</p><input aria-label="Image option" /></>;
    }
    function Host() {
      parentRender(); return <div className="inspector-scroll" data-inspector-visit="entry-A" aria-label="Scroll owner"><div className="inspector-body">
        <LigandInformation scope="entry-A" publications={publications} complex={false}><Image /></LigandInformation>
      </div></div>;
    }
    render(<Host />);
    const control = screen.getByRole("textbox", { name: "Image option" });
    const measured = layout(screen.getByLabelText("Scroll owner"), control, () => !screen.queryByText("Image pending")), before = measured.top();
    fireEvent(screen.getByRole("img"), new Event(event));
    expect(parentRender).toHaveBeenCalledTimes(1); expect(control).toHaveFocus(); expect(measured.top()).toBe(before);
    expect(measured.writes).toEqual([258.4375]);
  });
  it("yields to explicit disclosure/profile/task intent and changed entry visits", () => {
    const publications = new InspectorPublications();
    function Dynamic() { const [ready, setReady] = useState(false); return <><p>{ready ? "Published" : "Pending"}</p>
      <button onClick={() => { publications.publish(); setReady(true); }}>Publish</button><input aria-label="Kept control" /></>; }
    let scope = "entry-A";
    const tree = () => <div className="inspector-scroll" data-inspector-visit={scope} aria-label="Scroll owner"><div className="inspector-body">
      <LigandInformation scope={scope} publications={publications} complex={false}><Dynamic /></LigandInformation>
    </div></div>;
    const view = render(tree()), control = screen.getByRole("textbox", { name: "Kept control" });
    const measured = layout(screen.getByLabelText("Scroll owner"), control, () => !!screen.queryByText("Published"));
    scope = "entry-B";
    act(() => { view.rerender(tree()); fireEvent.click(screen.getByRole("button", { name: "Publish" })); });
    expect(measured.writes).toEqual([]);
  });
  it("subscribes only while presented and releases exact subscriptions", () => {
    const stop = vi.fn(), source = vi.fn(() => stop), publications = new InspectorPublications([source]);
    const view = render(<LigandInformation scope="A" publications={publications} complex={false}>Current</LigandInformation>);
    expect(source).toHaveBeenCalledTimes(1); view.unmount(); expect(stop).toHaveBeenCalledTimes(1);
    publications.publish(); expect(stop).toHaveBeenCalledTimes(1);
  });
  it("ignores unrelated queries and old entries while batching only the current candidate and depiction notifications", async () => {
    const client = new QueryClient(); cleanups.push(() => client.clear());
    const publications = new InspectorPublications([inspectorQueryPublications(client, () => ({ projectId: "P", entryId: "E" }))]);
    const notified = vi.fn(), stop = publications.subscribe(notified); cleanups.push(stop);
    client.setQueryData(["project", "P"], {});
    client.setQueryData(["ligand-candidates", "policy", "P", "old-entry"], {});
    client.setQueryData(["ligand-depiction", "policy", "drawing", "committed", "other-project", "E"], {});
    client.setQueryData(["ligand-candidates", "policy", "P", "E"], {});
    client.setQueryData(["ligand-depiction", "policy", "drawing", "committed", "P", "E"], {});
    await waitFor(() => expect(notified).toHaveBeenCalledTimes(2));
    expect(publications.snapshot()).toBe(2);
  });
  for (const rebind of [false, true]) it(`retires queued query notifications on ${rebind ? "unsubscribe and replacement subscription" : "entry navigation"}`, async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    let current = { projectId: "P1", entryId: "E1" };
    const publications = new InspectorPublications([inspectorQueryPublications(client, () => current)]);
    const oldListener = vi.fn(), replacement = vi.fn();
    let stop = publications.subscribe(oldListener);
    try {
      client.setQueryData(["ligand-candidates", "policy", "P1", "E1"], {});
      current = { projectId: "P2", entryId: "E2" };
      if (rebind) { stop(); stop = publications.subscribe(replacement); }
      await vi.advanceTimersByTimeAsync(0);
      expect(oldListener).not.toHaveBeenCalled(); expect(replacement).not.toHaveBeenCalled();
      client.setQueryData(["ligand-candidates", "policy", "P2", "E2"], {});
      await vi.advanceTimersByTimeAsync(0);
      expect(rebind ? replacement : oldListener).toHaveBeenCalledTimes(1);
    } finally { stop(); client.clear(); vi.useRealTimers(); }
  });
});
