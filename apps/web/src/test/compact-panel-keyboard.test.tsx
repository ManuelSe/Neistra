import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { containCompactPanelTab } from "../components/compactPanelKeyboard";

beforeEach(() => {
  // jsdom has no layout. Native coverage supplies actual visible rectangles.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function(this: HTMLElement) {
    return (this.dataset.layoutHidden ? [] : [new DOMRect(0, 0, 100, 30)]) as unknown as DOMRectList;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup() {
  const app = render(<aside role="dialog" aria-label="Compact panel" tabIndex={-1} onKeyDown={containCompactPanelTab}>
    <h2 tabIndex={-1}>Resumed heading</h2>
    <button>First action</button>
    <h3 tabIndex={-1}>Middle recovery heading</h3>
    <button aria-disabled="true">Unavailable reason</button>
    <fieldset disabled><button>Disabled by fieldset</button></fieldset>
    <button hidden>Hidden action</button>
    <div inert><button>Inert action</button></div>
    <button style={{ visibility: "hidden" }}>CSS hidden action</button>
    <button data-layout-hidden="true">No layout action</button>
    <button tabIndex={-1}>Programmatic action</button>
    <details open><summary>Values and criteria</summary><a href="#source">Source link</a></details>
    <details><summary>Methods and limits</summary></details>
    <h3 tabIndex={-1}>Trailing recovery heading</h3>
    <div role="dialog" aria-label="Nested options"><button>Nested action</button></div>
    <div role="menu"><button>Nested menu action</button></div>
  </aside>);
  return { ...app, panel: screen.getByRole("dialog", { name: "Compact panel" }),
    first: screen.getByRole("button", { name: "First action" }),
    last: screen.getByText("Methods and limits") };
}

describe("compact panel keyboard boundaries", () => {
  it("wraps from the final native disclosure summary to the first action", () => {
    const f = setup(); f.last.focus();
    expect(fireEvent.keyDown(f.last, { key: "Tab" })).toBe(false);
    expect(f.first).toHaveFocus();
  });

  it("reverse-wraps to the final summary, excluding unavailable tab stops", () => {
    const f = setup(); f.first.focus();
    expect(fireEvent.keyDown(f.first, { key: "Tab", shiftKey: true })).toBe(false);
    expect(f.last).toHaveFocus();
  });

  it("leaves ordinary internal Tab navigation with the browser", () => {
    setup(); const link = screen.getByRole("link", { name: "Source link" }); link.focus();
    expect(fireEvent.keyDown(link, { key: "Tab" })).toBe(true);
    expect(link).toHaveFocus();
  });

  it("keeps an aria-disabled reason launcher in the native tab sequence", () => {
    const f = setup(), reason = screen.getByRole("button", { name: "Unavailable reason" });
    f.last.tabIndex = -1; screen.getByRole("link").tabIndex = -1; screen.getByText("Values and criteria").tabIndex = -1;
    reason.focus(); expect(fireEvent.keyDown(reason, { key: "Tab" })).toBe(false);
    expect(f.first).toHaveFocus();
  });

  it("reverse-wraps from the resumed heading before the first stop", () => {
    const f = setup(), heading = screen.getByRole("heading", { name: "Resumed heading" }); heading.focus();
    expect(fireEvent.keyDown(heading, { key: "Tab", shiftKey: true })).toBe(false);
    expect(f.last).toHaveFocus();
  });

  it("preserves reverse navigation from a middle programmatic recovery heading", () => {
    setup(); const heading = screen.getByRole("heading", { name: "Middle recovery heading" }); heading.focus();
    expect(fireEvent.keyDown(heading, { key: "Tab", shiftKey: true })).toBe(true);
    expect(heading).toHaveFocus();
  });

  it("wraps forward from a trailing programmatic target", () => {
    const f = setup(), heading = screen.getByRole("heading", { name: "Trailing recovery heading" }); heading.focus();
    expect(fireEvent.keyDown(heading, { key: "Tab" })).toBe(false);
    expect(f.first).toHaveFocus();
  });

  it.each(["ctrlKey", "altKey", "metaKey"] as const)("preserves browser %s+Tab", modifier => {
    const f = setup(); f.last.focus();
    expect(fireEvent.keyDown(f.last, { key: "Tab", [modifier]: true })).toBe(true);
    expect(f.last).toHaveFocus();
  });

  it("leaves nested dialogs and menu primitives with their own owners", () => {
    setup();
    for (const name of ["Nested action", "Nested menu action"]) {
      const control = screen.getByRole("button", { name }); control.focus();
      expect(fireEvent.keyDown(control, { key: "Tab" })).toBe(true);
      expect(control).toHaveFocus();
    }
  });

  it("respects an already handled keyboard event", () => {
    const app = render(<aside role="dialog" tabIndex={-1} onKeyDown={containCompactPanelTab}>
      <button>Earlier</button><button onKeyDown={event => event.preventDefault()}>Handled</button>
    </aside>);
    const handled = app.getByRole("button", { name: "Handled" }); handled.focus();
    fireEvent.keyDown(handled, { key: "Tab" }); expect(handled).toHaveFocus();
  });

  it("retains an empty dialog as the labelled keyboard fallback", () => {
    const app = render(<aside role="dialog" aria-label="Loading panel" tabIndex={-1} onKeyDown={containCompactPanelTab}>
      <h2 tabIndex={-1}>Loading</h2><button disabled>Unavailable</button>
    </aside>);
    const heading = app.getByRole("heading"); heading.focus();
    expect(fireEvent.keyDown(heading, { key: "Tab" })).toBe(false);
    expect(app.getByRole("dialog")).toHaveFocus();
  });

  it("recomputes the boundary after a control becomes nonsequential", () => {
    const f = setup(); f.last.tabIndex = -1;
    const link = screen.getByRole("link", { name: "Source link" }); link.focus();
    expect(fireEvent.keyDown(link, { key: "Tab" })).toBe(false); expect(f.first).toHaveFocus();
  });

  it("honors positive native tab priority without changing internal navigation", () => {
    const f = setup(), priority = document.createElement("button"); priority.textContent = "Priority"; priority.tabIndex = 2;
    f.panel.append(priority); f.last.focus();
    expect(fireEvent.keyDown(f.last, { key: "Tab" })).toBe(false); expect(priority).toHaveFocus();
    expect(fireEvent.keyDown(priority, { key: "Tab" })).toBe(true); expect(priority).toHaveFocus();
    f.first.focus();
    expect(fireEvent.keyDown(f.first, { key: "Tab", shiftKey: true })).toBe(true); expect(f.first).toHaveFocus();
  });
});
