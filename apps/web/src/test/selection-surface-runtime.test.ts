import { describe, expect, it, vi } from "vitest";
import { SurfaceRuntime } from "../viewer/surface/runtime";
import type { SurfaceCalculator } from "../viewer/surface/client";
import { SURFACE_LIMITS, type SurfaceGeometry, type SurfaceInput } from "../viewer/surface/protocol";
const input = (x = 0): SurfaceInput => ({ atomIds: Uint32Array.of(1), x: Float64Array.of(x), y: Float64Array.of(0), z: Float64Array.of(0), radii: Float32Array.of(1.7) });
const pocketInput = () => ({ ...input(), pocket: { profile: "pocket-v1" as const, seeds: Float64Array.of(0, 0, 0), radius: 5 } });
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
    const createInput = vi.fn(() => input());
    runtime.request("a", "fragment", "A", "pose-0", createInput, old);
    runtime.request("a", "fragment", "new label", "pose-0", createInput, current);
    pending[0].resolve(geometry());
    await vi.waitFor(() => expect(current).toHaveBeenCalledOnce());
    expect(old).not.toHaveBeenCalled();
    runtime.request("a", "fragment", "A", "pose-0", createInput, current);
    expect(compute).toHaveBeenCalledOnce();
    expect(current).toHaveBeenCalledTimes(2);
    expect(createInput).toHaveBeenCalledOnce();
  });
  it("drops stale results after coordinates change, removal and disposal", async () => {
    const { runtime, pending, dispose } = setup();
    const notify = vi.fn();
    runtime.request("a", "fragment", "A", "pose-0", () => input(), notify);
    runtime.request("a", "fragment", "A", "pose-2", () => input(2), notify);
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
    runtime.request("a", "fragment", "A", "pose-0", () => input(), notify);
    runtime.cancel("a", "fragment"); expect(pending[0].signal.aborted).toBe(true);
    runtime.request("a", "fragment", "A", "pose-0", () => input(), notify);
    expect(compute).toHaveBeenCalledOnce();
    expect(runtime.statuses()[0].state).toBe("cancelled");
    runtime.remove("a", "fragment"); runtime.request("a", "fragment", "A", "pose-0", () => input(), notify);
    pending[1].reject(new Error("Worker unavailable."));
    await vi.waitFor(() => expect(runtime.statuses()[0].state).toBe("fallback"));
    expect(runtime.statuses()[0].message).toContain("Lines shown. Membership kept.");
  });
  it("admits before workers, enforces retained budget and handles hidden targets", async () => {
    const { runtime, pending, compute } = setup();
    runtime.request("hidden", "fragment", "Hidden", "hidden", null, vi.fn());
    runtime.request("large", "fragment", "Large", "pose-0", () => input(), vi.fn(), "Large entry uses reduced detail.");
    expect(compute).not.toHaveBeenCalled();
    expect(runtime.statuses().map((s) => s.state)).toEqual(["hidden", "fallback"]);
    runtime.request("a", "fragment", "A", "pose-0", () => input(), vi.fn()); pending[0].resolve(geometry(SURFACE_LIMITS.retainedBytes));
    await vi.waitFor(() => expect(runtime.statuses()[2].state).toBe("ready"));
    runtime.request("b", "fragment", "B", "pose-0", () => input(), vi.fn()); pending[1].resolve(geometry());
    await vi.waitFor(() => expect(runtime.statuses()[3].state).toBe("fallback"));
  });
});

it("isolates same-entry Fragment/Pocket cancellation, stale work and the combined retained budget", async () => {
  const { runtime, pending } = setup();
  const fragment = vi.fn(), pocket = vi.fn();
  runtime.request("a", "fragment", "A", "f", () => input(), fragment);
  runtime.request("a", "pocket", "A", "p", pocketInput, pocket);
  runtime.cancel("a", "pocket");
  expect(pending[0].signal.aborted).toBe(false); expect(pending[1].signal.aborted).toBe(true);
  pending[1].resolve(geometry()); pending[0].resolve(geometry(SURFACE_LIMITS.retainedBytes));
  await vi.waitFor(() => expect(fragment).toHaveBeenCalledOnce());
  expect(runtime.statuses().map((s) => [s.channel, s.state])).toEqual([["fragment", "ready"], ["pocket", "cancelled"]]);
  runtime.remove("a", "pocket");
  runtime.request("a", "pocket", "A", "new", pocketInput, pocket);
  pending[2].resolve(geometry());
  await vi.waitFor(() => expect(runtime.statuses()[1].state).toBe("fallback"));
  expect(runtime.statuses()[1].message).not.toContain("Lines shown");
  expect(runtime.statuses()[0].state).toBe("ready");
});

it("explains empty pockets and computes when a previously hidden owner becomes visible", async () => {
  const { runtime, pending, compute } = setup(); const notify = vi.fn();
  runtime.request("a", "pocket", "A", "same", null, notify);
  runtime.request("a", "pocket", "A", "same", pocketInput, notify);
  expect(compute).toHaveBeenCalledOnce();
  pending[0].resolve(geometry());
  await vi.waitFor(() => expect(runtime.statuses()[0].state).toBe("empty"));
  expect(runtime.statuses()[0].message).toContain("No protein surface");
});
