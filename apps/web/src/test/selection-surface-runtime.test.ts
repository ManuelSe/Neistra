import { describe, expect, it, vi } from "vitest";
import { SurfaceRuntime } from "../viewer/surface/runtime";
import type { SurfaceCalculator } from "../viewer/surface/client";
import { SURFACE_LIMITS, type SurfaceGeometry, type SurfaceInput } from "../viewer/surface/protocol";
const input = (x = 0): SurfaceInput => ({ atomIds: Uint32Array.of(1), x: Float64Array.of(x), y: Float64Array.of(0), z: Float64Array.of(0), radii: Float32Array.of(1.7) });
const geometry = (meshBytes = 100): SurfaceGeometry => ({ vertices: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), groups: new Float32Array(), atomIds: Uint32Array.of(1), evidence: { meshBytes, cells: 1, activeCells: 1, meshBoundBytes: meshBytes, workingBoundBytes: meshBytes, durationMs: 1 } });
function setup() {
  const pending: { resolve: (geometry: SurfaceGeometry) => void; reject: (error: Error) => void; signal: AbortSignal }[] = [];
  const compute = vi.fn((_input: SurfaceInput, signal: AbortSignal) => new Promise<SurfaceGeometry>((resolve, reject) => pending.push({ resolve, reject, signal })));
  const dispose = vi.fn();
  return { runtime: new SurfaceRuntime({ compute, dispose } as unknown as SurfaceCalculator), pending, compute, dispose };
}
describe("transient surface lifecycle", () => {
  it("reuses pending and completed geometry, rebinding only the current disposable component", async () => {
    const { runtime, pending, compute } = setup();
    const old = vi.fn(), current = vi.fn();
    runtime.request("a", "A", input(), old);
    runtime.request("a", "new label", input(), current);
    pending[0].resolve(geometry());
    await vi.waitFor(() => expect(current).toHaveBeenCalledOnce());
    expect(old).not.toHaveBeenCalled();
    runtime.request("a", "A", input(), current);
    expect(compute).toHaveBeenCalledOnce();
    expect(current).toHaveBeenCalledTimes(2);
  });
  it("drops stale results after coordinates change, removal and disposal", async () => {
    const { runtime, pending, dispose } = setup();
    const notify = vi.fn();
    runtime.request("a", "A", input(), notify);
    runtime.request("a", "A", input(2), notify);
    expect(pending[0].signal.aborted).toBe(true);
    pending[0].resolve(geometry());
    runtime.retain(new Set());
    pending[1].resolve(geometry());
    await Promise.resolve();
    expect(notify).not.toHaveBeenCalled();
    expect(runtime.statuses()).toEqual([]);
    runtime.dispose(); expect(dispose).toHaveBeenCalledOnce();
  });
  it("keeps cancellation until retry and converts worker failures to explicit fallback", async () => {
    const { runtime, pending, compute } = setup(); const notify = vi.fn();
    runtime.request("a", "A", input(), notify);
    runtime.cancel("a"); expect(pending[0].signal.aborted).toBe(true);
    runtime.request("a", "A", input(), notify);
    expect(compute).toHaveBeenCalledOnce();
    expect(runtime.statuses()[0].state).toBe("cancelled");
    runtime.remove("a"); runtime.request("a", "A", input(), notify);
    pending[1].reject(new Error("Worker unavailable."));
    await vi.waitFor(() => expect(runtime.statuses()[0].state).toBe("fallback"));
    expect(runtime.statuses()[0].message).toContain("Lines shown. Membership kept.");
  });
  it("admits before workers, enforces retained budget and handles hidden targets", async () => {
    const { runtime, pending, compute } = setup();
    runtime.request("hidden", "Hidden", null, vi.fn());
    runtime.request("large", "Large", input(), vi.fn(), "Large entry uses reduced detail.");
    expect(compute).not.toHaveBeenCalled();
    expect(runtime.statuses().map((s) => s.state)).toEqual(["hidden", "fallback"]);
    runtime.request("a", "A", input(), vi.fn()); pending[0].resolve(geometry(SURFACE_LIMITS.retainedBytes));
    await vi.waitFor(() => expect(runtime.statuses()[2].state).toBe("ready"));
    runtime.request("b", "B", input(), vi.fn()); pending[1].resolve(geometry());
    await vi.waitFor(() => expect(runtime.statuses()[3].state).toBe("fallback"));
  });
});
