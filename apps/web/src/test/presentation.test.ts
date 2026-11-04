import { afterEach, describe, expect, it, vi } from "vitest";
import { PresentationController } from "../presentation/controller";
import { presentationReady } from "../presentation/protocol";
import type { MolecularViewer } from "../viewer/MolecularViewer";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function setup() {
  const receive = vi.fn();
  const stop = vi.fn();
  const track = Object.assign(new EventTarget(), { stop, readyState: "live", muted: false });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  const refresh = vi.fn();
  const capture = vi.fn(() => ({ stream, refresh }));
  const viewer = { capturePresentation: capture } as unknown as MolecularViewer;
  const child = { closed: false, focus: vi.fn(), neistraPresentation: { receive } } as unknown as Window;
  const open = vi.spyOn(window, "open").mockReturnValue(child);
  const controller = new PresentationController(window);
  controller.start(); controller.bind(viewer); controller.update(viewer, null, false); controller.open();
  const session = new URL(String(open.mock.calls[0][0])).hash.split("=")[1];
  const ready = () => window.dispatchEvent(new MessageEvent("message", {
    origin: window.location.origin, source: child, data: { type: presentationReady, session },
  }));
  ready();
  return { receive, stop, track, stream, refresh, capture, viewer, child, controller, ready };
}

describe("local presentation", () => {
  it("binds only the owned child/session, focuses it and stops retired capture", () => {
    const receive = vi.fn();
    const stop = vi.fn();
    const refresh = vi.fn();
    const focus = vi.fn();
    const track = Object.assign(new EventTarget(), { stop, readyState: "live", muted: false });
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    const child = { closed: false, focus, close: vi.fn(), neistraPresentation: { receive } } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(child);
    const controller = new PresentationController(window);
    controller.start();
    const capture = vi.fn(() => ({ stream, refresh }));
    const viewer = { capturePresentation: capture } as unknown as MolecularViewer;
    const release = controller.bind(viewer);
    controller.update(viewer, null, false);
    expect(controller.open()).toBeNull();
    const session = new URL(String(open.mock.calls[0][0])).hash.split("=")[1];
    const ready = (origin: string, source: Window, token = session) => window.dispatchEvent(new MessageEvent("message", {
      origin, source, data: { type: presentationReady, session: token },
    }));
    ready("https://other.invalid", child);
    ready(window.location.origin, window);
    ready(window.location.origin, child, "other");
    expect(receive).not.toHaveBeenCalled();
    ready(window.location.origin, child);
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({ session, status: null }), stream);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
    controller.open();
    expect(open).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    release();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Waiting for the molecular viewer" }), null);
    controller.dispose();
  });

  it("does not redraw stationary content on heartbeats and releases closed-window tracks", () => {
    vi.useFakeTimers();
    const state = setup();
    const draws = state.refresh.mock.calls.length;
    vi.advanceTimersByTime(3000);
    state.ready();
    expect(state.refresh).toHaveBeenCalledTimes(draws);
    expect(state.capture).toHaveBeenCalledTimes(1);
    Object.assign(state.child, { closed: true });
    vi.advanceTimersByTime(1000);
    expect(state.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    state.controller.dispose();
  });

  it("rejects retired source updates and sends terminal disconnection on owner teardown", () => {
    const state = setup();
    state.controller.retire();
    const updates = state.receive.mock.calls.length;
    state.controller.update(state.viewer, null, true);
    expect(state.receive).toHaveBeenCalledTimes(updates);
    expect(state.stop).toHaveBeenCalledTimes(1);
    state.controller.dispose();
    expect(state.receive).toHaveBeenLastCalledWith(expect.objectContaining({ ended: true,
      status: "Workspace disconnected. Reopen presentation from the workspace." }), null);
  });

  it("obscures hidden, muted and unacknowledged sources without recapturing", () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const state = setup();
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(state.receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Presentation paused while the workspace is hidden" }), state.stream);
    hidden.mockReturnValue(false);
    state.track.muted = true; state.track.dispatchEvent(new Event("mute"));
    expect(state.receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: "The molecular presentation source is unavailable" }), state.stream);
    state.track.muted = false; state.track.dispatchEvent(new Event("unmute"));
    expect(state.receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: null }), state.stream);
    vi.advanceTimersByTime(11000);
    expect(state.receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Presentation connection paused" }), state.stream);
    state.ready();
    expect(state.receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: null }), state.stream);
    expect(state.capture).toHaveBeenCalledTimes(1);
    state.controller.dispose();
  });

  it("reports unsupported capture once and recovers with a new source", () => {
    const state = setup();
    const unavailable = { capturePresentation: vi.fn(() => { throw new Error("Unsupported"); }) } as unknown as MolecularViewer;
    state.controller.bind(unavailable);
    state.ready(); state.ready();
    expect(state.receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Presentation capture is unavailable in this browser" }), null);
    state.controller.bind(state.viewer); state.controller.update(state.viewer, null, false);
    expect(state.receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: null }), state.stream);
    state.controller.dispose();
  });

  it("does not let an old binding retire a replacement binding of the same viewer", () => {
    const state = setup();
    const old = state.controller.bind(state.viewer);
    state.controller.bind(state.viewer);
    state.controller.update(state.viewer, null, false);
    const count = state.receive.mock.calls.length;
    old();
    expect(state.receive).toHaveBeenCalledTimes(count);
    state.controller.dispose();
  });

  it("reports blocked popups without starting a capture", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const controller = new PresentationController(window);
    expect(controller.open()).toContain("Allow pop-ups");
    controller.dispose();
  });
});
