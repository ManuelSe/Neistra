import { StrictMode, useCallback, useLayoutEffect, useRef } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorReadingSession, useInspectorReadingPosition } from "../components/inspectorReadingPosition";
import { InspectorReadingBoundary } from "../components/InspectorReadingBoundary";
import { InspectorPublications } from "../components/inspectorPublications";
import { InspectorContentAnchor } from "../components/InspectorContentAnchor";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, left: 0, right: 300, width: 300, height,
    x: 0, y: top, toJSON: () => ({}) };
}

function setup(strict = false, earlierLandmark = false) {
  const session = new InspectorReadingSession();
  const geometry = { content: 1200, viewport: 400, width: 300, section: 450, earlierSection: 200 };
  function Presenter({ scope, section }: { scope: string; section: boolean }) {
    const owner = useRef<HTMLDivElement>(null);
    const attach = useCallback((node: HTMLDivElement | null) => {
      owner.current = node;
      if (!node) return;
      let top = 0;
      Object.defineProperty(node, "scrollTop", { configurable: true, get: () => top,
        set: (value: number) => { top = Math.min(Math.max(0, value), Math.max(0, geometry.content - geometry.viewport)); } });
      Object.defineProperty(node, "clientWidth", { configurable: true, get: () => geometry.width });
      Object.defineProperty(node, "clientHeight", { configurable: true, get: () => geometry.viewport });
      node.getBoundingClientRect = () => rect(20, geometry.viewport);
    }, []);
    useInspectorReadingPosition(owner, { session, scope });
    return <div ref={attach} data-testid="owner"><div className="inspector-body">
      {earlierLandmark ? <h3 ref={node => {
        if (!node) return;
        node.getBoundingClientRect = () => rect(20 + geometry.earlierSection - (owner.current?.scrollTop ?? 0), 24);
        node.getClientRects = () => [node.getBoundingClientRect()] as unknown as DOMRectList;
      }}>Earlier section</h3> : null}
      {section ? <h3 ref={node => {
        if (!node) return;
        node.getBoundingClientRect = () => rect(20 + geometry.section - (owner.current?.scrollTop ?? 0), 24);
        node.getClientRects = () => [node.getBoundingClientRect()] as unknown as DOMRectList;
      }}>Polarity</h3> : null}
    </div></div>;
  }
  function Host({ visible, scope, section }: { visible: boolean; scope: string; section: boolean }) {
    useLayoutEffect(() => { session.enter(scope); }, [scope]);
    return visible ? <Presenter scope={scope} section={section} /> : null;
  }
  const tree = (visible = true, scope = "project-A/entry-A/ligand", section = true) => {
    const host = <Host visible={visible} scope={scope} section={section} />;
    return strict ? <StrictMode>{host}</StrictMode> : host;
  };
  const app = render(tree());
  return { ...app, geometry, update: (visible = true, scope?: string, section = true) => app.rerender(tree(visible, scope, section)),
    owner: () => app.getByTestId("owner") };
}

describe("Inspector presentation reading recovery", () => {
  it("restores a nonzero same-context position after temporary unmount", () => {
    const app = setup(); app.owner().scrollTop = 300;
    app.update(false); app.update();
    expect(app.owner().scrollTop).toBe(300);
    expect(app.owner()).toHaveAttribute("data-inspector-reading-resumed", "true");
  });

  it("keeps the same logical section offset after responsive reflow", () => {
    const app = setup(); app.owner().scrollTop = 300;
    const offset = app.getByText("Polarity").getBoundingClientRect().top - app.owner().getBoundingClientRect().top;
    app.update(false); app.geometry.section = 700; app.update();
    expect(app.owner().scrollTop).toBe(550);
    expect(app.getByText("Polarity").getBoundingClientRect().top - app.owner().getBoundingClientRect().top).toBe(offset);
  });

  it("retains measured reading geometry when the host shrinks before removing its presenter", () => {
    const app = setup(); app.owner().scrollTop = 300; fireEvent.scroll(app.owner());
    app.geometry.width = 50; app.geometry.section -= 14;
    fireEvent.scroll(app.owner());
    app.update(false);
    app.geometry.width = 300; app.geometry.section = 450; app.update();
    expect(app.owner().scrollTop).toBe(300);
  });

  it("keeps the same reading landmark when responsive reflow reveals an earlier section", () => {
    const app = setup(false, true); app.owner().scrollTop = 300; fireEvent.scroll(app.owner());
    app.update(false);
    app.geometry.width = 500; app.geometry.section = 700; app.geometry.earlierSection = 650;
    app.update(); expect(app.owner().scrollTop).toBe(550);
    fireEvent.scroll(app.owner()); // The browser acknowledges the programmatic restore.
    app.update(false);
    app.geometry.width = 300; app.geometry.section = 450; app.geometry.earlierSection = 200;
    app.update(); expect(app.owner().scrollTop).toBe(300);
  });

  it("does not restore an old visit after hidden A to B to A navigation", () => {
    const app = setup(); app.owner().scrollTop = 300; app.update(false);
    app.update(false, "project-A/entry-B/ligand"); app.update(false); app.update();
    expect(app.owner().scrollTop).toBe(0);
    expect(app.owner()).not.toHaveAttribute("data-inspector-reading-resumed", "true");
  });

  it.each(["project-B/entry-A/ligand", "project-A/entry-B/ligand", "project-A/entry-A/tools", "project-A/entry-A/tools/transform"])(
    "resets on explicit context change to %s", scope => {
      const app = setup(); app.owner().scrollTop = 300; app.update(false); app.update(true, scope);
      expect(app.owner().scrollTop).toBe(0);
    },
  );

  it("recovers a logical section arriving after the remount's short loading content", async () => {
    const app = setup(); app.owner().scrollTop = 300; app.update(false);
    app.geometry.content = 200; app.update(true, undefined, false);
    expect(app.owner().scrollTop).toBe(0);
    app.geometry.content = 1200; app.geometry.section = 600;
    app.update();
    await waitFor(() => expect(app.owner().scrollTop).toBe(450));
  });

  it("yields a pending initial restore to deliberate scrolling before late content", async () => {
    const app = setup(); app.owner().scrollTop = 300; app.update(false);
    app.geometry.content = 200; app.update(true, undefined, false);
    fireEvent.wheel(app.owner(), { deltaY: 100 });
    app.geometry.content = 1200; app.update();
    await act(async () => { await Promise.resolve(); });
    expect(app.owner().scrollTop).toBe(0);
  });

  it("does not keep correcting after restoration when a connected publication grows", async () => {
    const app = setup(); app.owner().scrollTop = 300; app.update(false); app.update();
    app.geometry.section = 700; app.update();
    await act(async () => { await Promise.resolve(); });
    expect(app.owner().scrollTop).toBe(300);
  });

  it("preserves same-context recovery through StrictMode setup replay", () => {
    const app = setup(true); app.owner().scrollTop = 300; app.update(false); app.update();
    expect(app.owner().scrollTop).toBe(300);
  });
});

interface ConnectedFrame {
  visible: boolean; scope: string; continuityKey: string; visit: string;
  pending: boolean; inventoryPending: boolean; section: boolean; sectionTop: number; controlTop: number;
}

/** Geometry follows committed DOM, so the pre-mutation snapshot sees the old
 * full report before pending content clamps the same scroll owner's position. */
function setupConnected(strict = false) {
  const session = new InspectorReadingSession(), publications = new InspectorPublications();
  let frame: ConnectedFrame = { visible: true, scope: "A/entry/source1", continuityKey: "A/entry/instance/ligand",
    visit: "visit1", pending: false, inventoryPending: false, section: true, sectionTop: 450, controlTop: 600 };
  function Presenter(props: ConnectedFrame) {
    const owner = useRef<HTMLDivElement>(null);
    const context = { session, scope: props.scope, continuityKey: props.continuityKey, publications,
      isPending: () => props.pending || props.inventoryPending };
    const attach = useCallback((node: HTMLDivElement | null) => {
      owner.current = node;
      if (!node) return;
      let top = 0;
      const maximum = () => node.querySelector("dt") ? 800 : 76;
      Object.defineProperty(node, "scrollTop", { configurable: true, get: () => { top = Math.min(top, maximum()); return top; },
        set: (value: number) => { top = Math.min(Math.max(0, value), maximum()); } });
      Object.defineProperty(node, "clientWidth", { configurable: true, value: 300 });
      Object.defineProperty(node, "clientHeight", { configurable: true, value: 400 });
      node.getBoundingClientRect = () => rect(20, 400);
    }, []);
    useInspectorReadingPosition(owner, context);
    return <div ref={attach} data-testid="connected-owner" className="inspector-scroll" data-inspector-visit={props.visit}>
      <InspectorReadingBoundary owner={owner} context={context}>
        <div className="inspector-body">
          <InspectorContentAnchor scope={props.continuityKey} includeDescendants>
          {props.section ? <dl><dt ref={node => {
            if (!node) return;
            node.getBoundingClientRect = () => rect(20 + props.sectionTop - (owner.current?.scrollTop ?? 0), 24);
            node.getClientRects = () => [node.getBoundingClientRect()] as unknown as DOMRectList;
          }}>Carbon</dt><dd>9</dd></dl> : <p>Properties unavailable while the molecular change is reconciled.</p>}
          <button ref={node => {
            if (node) node.getBoundingClientRect = () => rect(20 + props.controlTop - (owner.current?.scrollTop ?? 0), 24);
          }}>Another Inspector task</button>
          </InspectorContentAnchor>
        </div>
      </InspectorReadingBoundary>
    </div>;
  }
  function Host(props: ConnectedFrame) {
    useLayoutEffect(() => { session.enter(props.scope); }, [props.scope]);
    return props.visible ? <Presenter {...props} /> : null;
  }
  const tree = () => strict ? <StrictMode><Host {...frame} /></StrictMode> : <Host {...frame} />;
  const app = render(tree());
  const update = (next: Partial<ConnectedFrame>) => { frame = { ...frame, ...next }; app.rerender(tree()); };
  const owner = () => app.getByTestId("connected-owner");
  owner().scrollTop = 300; fireEvent.scroll(owner());
  return { ...app, owner, update, session, publications, scope: () => frame.scope };
}

describe("connected Inspector edit reading continuity", () => {
  it.each([650, 250])("waits for independent current header layout to settle at %spx without withholding fresh property values", sectionTop => {
    const app = setupConnected();
    app.update({ pending: true, inventoryPending: true, section: false });
    app.update({ scope: "A/entry/source2", pending: false, section: true, sectionTop: 250 });
    expect(app.getByText("Carbon")).toBeInTheDocument();
    expect(app.getByText("9")).toBeInTheDocument();
    expect(app.session.held(app.scope())).toBe(true);
    expect(app.session.read(app.scope())?.top).toBe(300);
    app.update({ inventoryPending: false, sectionTop });
    expect(app.owner().scrollTop).toBe(sectionTop - 150);
    expect(app.getByText("Carbon").getBoundingClientRect().top - app.owner().getBoundingClientRect().top).toBe(150);
    expect(app.session.held(app.scope())).toBe(false);
  });

  it("lets deliberate input cancel a hold while only the header inventory remains pending", async () => {
    const app = setupConnected(); app.update({ pending: true, inventoryPending: true, section: false });
    app.update({ scope: "A/entry/source2", pending: false, section: true, sectionTop: 250 });
    fireEvent.wheel(app.owner()); app.owner().scrollTop = 100; fireEvent.scroll(app.owner());
    app.update({ inventoryPending: false, sectionTop: 650 });
    await act(async () => { await Promise.resolve(); });
    expect(app.owner().scrollTop).toBe(100);
    expect(app.session.held(app.scope())).toBe(false);
  });

  it("acknowledges D190's retained focused-control geometry across a connected artifact change", () => {
    const app = setupConnected(), control = app.getByRole("button", { name: "Another Inspector task" });
    control.focus();
    const offset = control.getBoundingClientRect().top - app.owner().getBoundingClientRect().top;
    app.update({ scope: "A/entry/source2", sectionTop: 650, controlTop: 850 });
    expect(control).toHaveFocus();
    expect(app.owner().scrollTop).toBe(550);
    expect(control.getBoundingClientRect().top - app.owner().getBoundingClientRect().top).toBe(offset);
    expect(app.session.held(app.scope())).toBe(false);
  });

  it.each([false, true])("disconnects held observers immediately on input (StrictMode=%s)", strict => {
    const disconnected = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const app = setupConnected(strict); app.update({ pending: true, section: false });
    expect(app.session.held(app.scope())).toBe(true);
    const before = disconnected.mock.calls.length;
    fireEvent.wheel(app.owner());
    expect(disconnected.mock.calls.length).toBeGreaterThan(before);
    expect(app.session.held(app.scope())).toBe(false);
  });

  it.each([false, true])("retains the pre-withholding landmark across ACK and fresh content (StrictMode=%s)", async strict => {
    const app = setupConnected(strict);
    app.update({ pending: true, section: false });
    expect(app.owner().scrollTop).toBe(76);
    fireEvent.scroll(app.owner());
    expect(app.session.read(app.scope())?.top).toBe(300);
    app.update({ scope: "A/entry/source2" });
    expect(app.owner().scrollTop).toBe(76);
    expect(app.session.read(app.scope())?.top).toBe(300);
    app.update({ pending: false, section: true, sectionTop: 650 });
    expect(app.owner().scrollTop).toBe(500);
    expect(app.getByText("Carbon").getBoundingClientRect().top - app.owner().getBoundingClientRect().top).toBe(150);
    expect(app.session.held(app.scope())).toBe(false);
    app.update({ sectionTop: 750 });
    await act(async () => { await Promise.resolve(); });
    expect(app.owner().scrollTop).toBe(500);
  });

  it.each(["wheel", "touchStart", "pointerDown", "keyDown", "focusIn"] as const)(
    "yields pending recovery to deliberate %s", async event => {
      const app = setupConnected(); app.update({ pending: true, section: false });
      fireEvent[event](app.owner());
      expect(app.session.held(app.scope())).toBe(false);
      app.update({ scope: "A/entry/source2" });
      app.update({ pending: false, section: true, sectionTop: 650 });
      await act(async () => { await Promise.resolve(); });
      expect(app.owner().scrollTop).toBe(76);
    },
  );

  it.each(["A/other-entry/instance/ligand", "B/entry/instance/ligand", "A/entry/new-instance/ligand", "A/entry/instance/tools"])(
    "retires connected intent on target change to %s", continuityKey => {
      const app = setupConnected(); app.update({ pending: true, section: false });
      app.update({ scope: "new-target", continuityKey, pending: false, section: true });
      expect(app.owner().scrollTop).toBe(0);
      expect(app.session.held(app.scope())).toBe(false);
    },
  );

  it("does not transfer a hidden source change or hidden source ABA", () => {
    const app = setupConnected(); app.update({ pending: true, section: false });
    app.update({ visible: false }); app.update({ scope: "A/entry/source2" });
    app.update({ scope: "A/entry/source1" });
    app.update({ visible: true, pending: false, section: true });
    expect(app.owner().scrollTop).toBe(0);
  });

  it("does not carry cancellation from A into a cached ready B's first edit", () => {
    const app = setupConnected(); app.update({ pending: true, section: false });
    fireEvent.wheel(app.owner());
    app.update({ scope: "A/entry-B/source1", continuityKey: "A/entry-B/instance/ligand", pending: false, section: true });
    app.owner().scrollTop = 300; fireEvent.scroll(app.owner());
    app.update({ pending: true, section: false });
    fireEvent.scroll(app.owner());
    expect(app.session.read(app.scope())?.top).toBe(300);
    app.update({ scope: "A/entry-B/source2" });
    app.update({ pending: false, section: true, sectionTop: 650 });
    expect(app.owner().scrollTop).toBe(500);
  });

  it("ends recovery with one bounded fallback when the final result has no landmark", async () => {
    const app = setupConnected(); app.update({ pending: true, section: false });
    app.update({ scope: "A/entry/source2", pending: false });
    expect(app.owner().scrollTop).toBe(76);
    expect(app.session.held(app.scope())).toBe(false);
    app.update({ section: true, sectionTop: 650 });
    await act(async () => { await Promise.resolve(); });
    expect(app.owner().scrollTop).toBe(76);
  });

  it("retires a pending hold when the presentation visit changes", async () => {
    const app = setupConnected(); app.update({ pending: true, section: false });
    app.update({ visit: "visit2" });
    expect(app.session.held(app.scope())).toBe(false);
    app.update({ pending: false, section: true, sectionTop: 650 });
    await act(async () => { await Promise.resolve(); });
    expect(app.owner().scrollTop).toBe(76);
  });
});
