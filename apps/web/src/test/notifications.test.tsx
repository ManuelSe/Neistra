import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationNotice, type ApplicationNoticeValue } from "../components/ApplicationNotice";

function Harness({ initial = null, replacement }: {
  initial?: ApplicationNoticeValue | null;
  replacement?: ApplicationNoticeValue;
}) {
  const [notice, setNotice] = useState(initial);
  const [theme, setTheme] = useState("light");
  return <main data-theme={theme}>
    <header className="topbar"><button onClick={() => setNotice({ kind: "success", text: "Saved." })}>Save</button></header>
    <button onClick={() => setTheme("dark")}>Theme</button>
    <button onClick={() => setNotice({ kind: "error", text: "Retry required." })}>Fail</button>
    <button onClick={() => setNotice({ kind: "success", text: "Chemistry warnings.", lifetime: "persistent" })}>Warnings</button>
    <button onClick={() => setNotice(null)}>Change project</button>
    {replacement ? <button onClick={() => setNotice(replacement)}>Replace message</button> : null}
    <ApplicationNotice notice={notice} setNotice={setNotice} />
  </main>;
}
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("application notification lifetime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("expires at ten seconds without restarting on unrelated renders", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Save"));
    advance(5_000);
    fireEvent.click(screen.getByText("Theme"));
    advance(4_999);
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    advance(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("gives repeated text a fresh lifetime and guards even an obsolete callback", () => {
    const timers = vi.spyOn(window, "setTimeout");
    render(<Harness />);
    fireEvent.click(screen.getByText("Save"));
    const obsolete = timers.mock.calls.find(([, ms]) => ms === 10_000)![0] as () => void;
    advance(9_000);
    fireEvent.click(screen.getByText("Save"));
    act(obsolete);
    advance(1_000);
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    advance(8_999);
    expect(screen.getByRole("status")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps errors and warning-bearing success notices visible, with replacement intact", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Fail"));
    advance(60_000);
    expect(screen.getByRole("alert")).toHaveTextContent("Retry required.");
    fireEvent.click(screen.getByText("Warnings"));
    advance(60_000);
    expect(screen.getByRole("status")).toHaveTextContent("Chemistry warnings.");
    fireEvent.click(screen.getByText("Save"));
    advance(10_000);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores an obsolete callback after a focused replacement has reached its deadline", () => {
    const timers = vi.spyOn(window, "setTimeout");
    render(<Harness />);
    fireEvent.click(screen.getByText("Save"));
    const obsolete = timers.mock.calls.find(([, ms]) => ms === 10_000)![0] as () => void;
    fireEvent.click(screen.getByText("Save"));
    act(() => screen.getByRole("button", { name: "Dismiss message" }).focus());
    advance(10_000);
    act(obsolete);
    act(() => screen.getByText("Theme").focus());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Theme")).toHaveFocus();
  });

  it("defers expiry during keyboard focus and removes it on departure without stealing focus", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Save"));
    act(() => screen.getByRole("button", { name: "Dismiss message" }).focus());
    advance(10_000);
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => screen.getByText("Theme").focus());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Theme")).toHaveFocus();
  });

  it("keeps complete overflowing text keyboard-readable without moving the close control into it", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(120);
    const text = `${"Long diagnostic text.\n".repeat(100)}End of diagnostic.`;
    render(<Harness initial={{ kind: "success", text }} />);
    const details = screen.getByRole("region", { name: "Message details" });
    const close = screen.getByRole("button", { name: "Dismiss message" });
    expect(details.textContent).toBe(text);
    expect(details).toHaveAttribute("tabindex", "0");
    expect(details).not.toContainElement(close);
    expect(document.activeElement).not.toBe(details);
    act(() => screen.getByText("Save").focus());
    act(() => details.focus());
    advance(10_000);
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => close.focus());
    fireEvent.click(close);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Save")).toHaveFocus();
  });

  it("starts a replacement at its beginning without resetting reading on unrelated renders", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(120);
    const first = { kind: "error" as const, text: "Earlier detail.\n".repeat(100) };
    const replacement = { kind: "error" as const, text: `New diagnostic begins.\n${"New detail.\n".repeat(100)}` };
    render(<Harness initial={first} replacement={replacement} />);
    const details = screen.getByRole("region", { name: "Message details" });
    act(() => details.focus());
    details.scrollTop = 350;
    fireEvent.click(screen.getByText("Theme"));
    expect(details.scrollTop).toBe(350);
    fireEvent.click(screen.getByText("Replace message"));
    expect(screen.getByRole("region", { name: "Message details" })).toBe(details);
    expect(details.scrollTop).toBe(0);
    expect(details.textContent).toBe(replacement.text);
    expect(details).toHaveFocus();
    expect(details).not.toContainElement(screen.getByRole("button", { name: "Dismiss message" }));
  });

  it("dismisses manually before the deadline and returns keyboard focus", () => {
    const timers = vi.spyOn(window, "setTimeout");
    const clear = vi.spyOn(window, "clearTimeout");
    render(<Harness />);
    const save = screen.getByText("Save");
    act(() => save.focus());
    fireEvent.click(save);
    const timer = timers.mock.results[timers.mock.calls.findIndex(([, ms]) => ms === 10_000)].value as number;
    const close = screen.getByRole("button", { name: "Dismiss message" });
    act(() => close.focus());
    fireEvent.click(close);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(save).toHaveFocus();
    expect(clear).toHaveBeenCalledWith(timer);
    advance(10_000);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses the connected toolbar fallback when prior focus disappears", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Save"));
    act(() => screen.getByRole("button", { name: "Dismiss message" }).focus());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.getByText("Save")).toHaveFocus();
  });

  it("does not restore focus behind an open modal", () => {
    render(<Harness />);
    act(() => screen.getByText("Save").focus());
    fireEvent.click(screen.getByText("Save"));
    act(() => screen.getByRole("button", { name: "Dismiss message" }).focus());
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog"); modal.dataset.state = "open";
    modal.setAttribute("aria-modal", "true");
    const input = document.createElement("button"); input.textContent = "Modal action";
    modal.append(input); document.body.append(modal);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(input).toHaveFocus();
    modal.remove();
  });

  it("cleans up on project changes and unmount in Strict Mode", () => {
    const view = render(<StrictMode><Harness initial={{ kind: "success", text: "Recovered." }} /></StrictMode>);
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByText("Change project"));
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByText("Save"));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
