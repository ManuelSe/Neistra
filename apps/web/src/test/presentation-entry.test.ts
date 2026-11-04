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
  expect(document.querySelector("video")!.hidden).toBe(true);
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

it("clears pointer after inactivity without confusing it with selection", () => {
  cleanup = mountPresentation("session");
  const video = document.querySelector("video")!;
  const root = document.getElementById("root")!;
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 1000 } });
  Object.defineProperties(video, { videoWidth: { value: 1000 }, videoHeight: { value: 500 } });
  window.neistraPresentation!.receive({ session: "session", generation: 1, status: null, preview: false }, {} as MediaStream);
  [...frames.values()][0](0, {} as VideoFrameCallbackMetadata);
  window.neistraPresentation!.pointer!("session", 1, { x: 0.25, y: 0.75 });
  const pointer = document.querySelector<HTMLElement>(".presentation-pointer")!;
  expect(pointer.hidden).toBe(false);
  expect(pointer.style.left).toBe("250px"); expect(pointer.style.top).toBe("625px");
  vi.advanceTimersByTime(2000);
  expect(pointer.hidden).toBe(true);
});

it("reports asynchronous playback errors and retains focused fullscreen access", () => {
  cleanup = mountPresentation("session");
  const video = document.querySelector("video")!;
  window.neistraPresentation!.receive({ session: "session", generation: 1, status: null, preview: true }, {} as MediaStream);
  video.dispatchEvent(new Event("error"));
  expect(video.hidden).toBe(true);
  expect(document.querySelector<HTMLElement>(".presentation-preview")!.hidden).toBe(true);
  expect(document.querySelector('[role="status"]')).toHaveTextContent("Playback is unavailable");
  const button = document.querySelector("button")!;
  button.focus(); vi.advanceTimersByTime(3000);
  expect(document.activeElement).toBe(button);
  expect(button).toHaveAccessibleName("Enter fullscreen");
});

it("reports missing first frames while the owner is still responding", () => {
  cleanup = mountPresentation("session");
  const stream = {} as MediaStream;
  const state = { session: "session", generation: 1, status: null, preview: false };
  window.neistraPresentation!.receive(state, stream);
  vi.advanceTimersByTime(9000);
  window.neistraPresentation!.receive(state, stream);
  vi.advanceTimersByTime(2000);
  window.neistraPresentation!.receive(state, stream);
  expect(document.querySelector('[role="status"]')).toHaveTextContent("Waiting for a molecular frame");
});

it("ignores an old playback rejection after the replacement stream has painted", async () => {
  let reject!: (reason: Error) => void;
  vi.spyOn(HTMLVideoElement.prototype, "play").mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue();
  cleanup = mountPresentation("session");
  const state = { session: "session", generation: 1, status: null, preview: false };
  window.neistraPresentation!.receive(state, {} as MediaStream);
  window.neistraPresentation!.receive(state, {} as MediaStream);
  [...frames.values()].at(-1)!(0, {} as VideoFrameCallbackMetadata);
  reject(new Error("Old source rejected")); await Promise.resolve();
  expect(document.querySelector("video")!.hidden).toBe(false);
  expect(document.querySelector('[role="status"]')).toHaveTextContent("");
});
