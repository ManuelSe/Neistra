import { StrictMode, useCallback, useLayoutEffect, useRef } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorReadingSession, useInspectorReadingPosition } from "../components/inspectorReadingPosition";

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
