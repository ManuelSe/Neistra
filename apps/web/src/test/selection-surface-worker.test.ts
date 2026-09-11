import { afterEach, describe, expect, it, vi } from "vitest";
import { SurfaceCalculator } from "../viewer/surface/client";
import type { SurfaceGeometry, SurfaceInput } from "../viewer/surface/protocol";

const input = { atomIds: Uint32Array.of(1), x: Float64Array.of(0), y: Float64Array.of(0),
  z: Float64Array.of(0), radii: Float32Array.of(1.7) } satisfies SurfaceInput;
class FakeWorker {
  terminate = vi.fn(); postMessage = vi.fn();
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
}
afterEach(() => vi.useRealTimers());
describe("surface worker lifecycle", () => {
  it("serializes entries and terminates workers on completion", async () => {
    const workers: FakeWorker[] = [];
    const calculator = new SurfaceCalculator(() => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; });
    const a = calculator.compute(input, new AbortController().signal);
    const b = calculator.compute(input, new AbortController().signal);
    await Promise.resolve(); expect(workers).toHaveLength(1);
    workers[0].onmessage?.({ data: { kind: "complete", geometry: {} as SurfaceGeometry } } as MessageEvent);
    await a; await Promise.resolve(); await Promise.resolve();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    workers[1].onmessage?.({ data: { kind: "error", message: "Failed" } } as MessageEvent);
    await expect(b).rejects.toThrow("Failed");
    expect(workers[1].terminate).toHaveBeenCalledOnce();
  });
  it("aborts active and queued computations and survives a cancelled request", async () => {
    const w = new FakeWorker();
    const make = vi.fn(() => w as unknown as Worker);
    const calculator = new SurfaceCalculator(make);
    const controller = new AbortController();
    const a = calculator.compute(input, controller.signal);
    const b = calculator.compute(input, controller.signal);
    await Promise.resolve(); controller.abort();
    await expect(a).rejects.toThrow(/cancelled/);
    await expect(b).rejects.toThrow();
    expect(w.terminate).toHaveBeenCalledOnce(); expect(make).toHaveBeenCalledOnce();
  });
  it("enforces the deadline and disposal without leaving a busy worker", async () => {
    vi.useFakeTimers(); const w = new FakeWorker();
    const calculator = new SurfaceCalculator(() => w as unknown as Worker);
    const result = calculator.compute(input, new AbortController().signal);
    const rejection = expect(result).rejects.toThrow("30 second");
    await vi.advanceTimersByTimeAsync(30_000); await rejection;
    expect(w.terminate).toHaveBeenCalledOnce();
    const pending = calculator.compute(input, new AbortController().signal);
    await Promise.resolve(); calculator.dispose();
    await expect(pending).rejects.toThrow("cancelled");
    await expect(calculator.compute(input, new AbortController().signal)).rejects.toThrow("disposed");
  });
});
