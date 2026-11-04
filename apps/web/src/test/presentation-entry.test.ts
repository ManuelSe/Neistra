import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountPresentation } from "../presentation/entry";

let cleanup: (() => void) | undefined;
let frames: Map<number, VideoFrameRequestCallback>;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal("opener", { closed: false, postMessage: vi.fn() });
  frames = new Map();
  let id = 0;
  vi.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue();
  Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", { configurable: true, value:
    vi.fn((callback: VideoFrameRequestCallback) => { frames.set(++id, callback); return id; }) });
  Object.defineProperty(HTMLVideoElement.prototype, "cancelVideoFrameCallback", { configurable: true, value:
    vi.fn((id: number) => frames.delete(id)) });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("never exposes a retired frame or accepts an earlier generation", () => {
  cleanup = mountPresentation("session");
  const receive = window.neistraPresentation!.receive;
  const stream = {} as MediaStream;
  receive({ session: "session", generation: 1, status: null, preview: false }, stream);
  const video = document.querySelector("video")!;
  const pending = [...frames.values()][0];
  receive({ session: "session", generation: 2, status: "Waiting", preview: false }, null);
  pending(0, {} as VideoFrameCallbackMetadata);
  expect(video.hidden).toBe(true);
  receive({ session: "session", generation: 1, status: null, preview: false }, stream);
  expect(video.srcObject).toBeNull();
  expect(document.querySelector('[role="status"]')).toHaveTextContent("Waiting");
});

it("keeps current playback failure visible across heartbeats and detects lost owners", async () => {
  vi.spyOn(HTMLVideoElement.prototype, "play").mockRejectedValue(new Error("Denied"));
  cleanup = mountPresentation("session");
  const receive = window.neistraPresentation!.receive;
  const stream = {} as MediaStream;
  const state = { session: "session", generation: 1, status: null, preview: false };
  receive(state, stream);
  await Promise.resolve();
  receive(state, stream);
  expect(document.querySelector("video")!.hidden).toBe(true);
  expect(document.querySelector('[role="status"]')).toHaveTextContent("Playback is unavailable");
  vi.advanceTimersByTime(11000);
  expect(document.querySelector('[role="status"]')).toHaveTextContent("Workspace disconnected");
});

it("does not reveal a late frame from a replaced stream with the same generation", () => {
  cleanup = mountPresentation("session");
  const receive = window.neistraPresentation!.receive;
  const state = { session: "session", generation: 1, status: null, preview: false };
  receive(state, {} as MediaStream);
  const pending = [...frames.values()][0];
  const replacement = {} as MediaStream;
  receive(state, replacement);
  pending(0, {} as VideoFrameCallbackMetadata);
  expect(document.querySelector("video")!.hidden).toBe(true);
  receive({ ...state, status: "Paused" }, replacement);
  expect(frames.size).toBe(0);
});
