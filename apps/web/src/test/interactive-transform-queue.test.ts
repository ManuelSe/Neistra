import { expect, it, vi } from "vitest";
import type { CoordinatePatch } from "../api/types";
import { CoordinatePreviewQueue } from "../viewer/CoordinatePreviewQueue";

const patch = (x: number, entry = "one"): CoordinatePatch => ({ entry_id: entry, artifact_id: "preview", atom_ids: [7], coordinates: [[x, 0, 0]] });
function pending() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

it("bounds rendering to one active call and the latest pending multi-entry frame", async () => {
  const active = pending();
  const apply = vi.fn(() => Promise.resolve()).mockReturnValueOnce(active.promise);
  const clear = vi.fn(() => Promise.resolve());
  const queue = new CoordinatePreviewQueue({ applyCoordinatePatch: apply, clearCoordinatePreview: clear }, vi.fn());
  queue.set([patch(1), patch(1, "two")]);
  for (let x = 2; x < 100; x++) queue.set([patch(x), patch(x, "two")]);
  expect(apply).toHaveBeenCalledTimes(1);
  active.resolve(); await tick();
  expect(apply.mock.calls).toEqual([[patch(1), "preview"], [patch(1, "two"), "preview"], [patch(99), "preview"], [patch(99, "two"), "preview"]]);
  queue.set([]); await tick();
  expect(clear.mock.calls).toEqual([["one"], ["two"]]);
});

it("drops obsolete pending frames before commit, then clears without restoring committed atoms", async () => {
  const active = pending();
  const apply = vi.fn(() => Promise.resolve()).mockReturnValueOnce(active.promise);
  const clear = vi.fn(() => Promise.resolve());
  const queue = new CoordinatePreviewQueue({ applyCoordinatePatch: apply, clearCoordinatePreview: clear }, vi.fn());
  queue.set([patch(1)]); queue.set([patch(2)]);
  queue.commit([{ ...patch(3), artifact_id: "committed" }]); queue.set([]);
  active.resolve(); await tick();
  expect(apply.mock.calls).toEqual([[patch(1), "preview"], [{ ...patch(3), artifact_id: "committed" }, "commit"]]);
  expect(clear).not.toHaveBeenCalled();
});

it("cancellation and disposal prevent pending frames from reviving previews", async () => {
  const active = pending();
  const apply = vi.fn(() => Promise.resolve()).mockReturnValueOnce(active.promise);
  const clear = vi.fn(() => Promise.resolve());
  const queue = new CoordinatePreviewQueue({ applyCoordinatePatch: apply, clearCoordinatePreview: clear }, vi.fn());
  queue.set([patch(1)]); queue.set([patch(2)]); queue.set([]);
  active.resolve(); await tick();
  expect(apply).toHaveBeenCalledOnce(); expect(clear).toHaveBeenCalledWith("one");
  queue.dispose(); queue.set([patch(9)]); queue.commit([patch(10)]); await tick();
  expect(apply).toHaveBeenCalledOnce();
});

it("surfaces renderer errors and still allows explicit restoration", async () => {
  const error = new Error("Renderer rejected frame");
  const apply = vi.fn(() => Promise.resolve()).mockRejectedValueOnce(error);
  const clear = vi.fn(() => Promise.resolve()); const onError = vi.fn();
  const queue = new CoordinatePreviewQueue({ applyCoordinatePatch: apply, clearCoordinatePreview: clear }, onError);
  queue.set([patch(1)]); await tick();
  expect(onError).toHaveBeenCalledWith(error);
  queue.set([]); await tick();
  expect(clear).toHaveBeenCalledWith("one");
});
