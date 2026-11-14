import { describe, expect, it, vi } from "vitest";
import { SurfaceRuntime } from "../viewer/surface/runtime";
import type { SurfaceCalculator } from "../viewer/surface/client";
import { SURFACE_LIMITS, type SurfaceChannel, type SurfaceGeometry, type SurfaceInput } from "../viewer/surface/protocol";
const input = (x = 0, kind: SurfaceChannel = "fragment"): SurfaceInput => ({ kind, atomIds: Uint32Array.of(1), x: Float64Array.of(x), y: Float64Array.of(0), z: Float64Array.of(0), radii: Float32Array.of(1.7) });
const pocketInput = () => ({ ...input(0, "pocket"), pocket: { profile: "pocket-v1" as const, seeds: Float64Array.of(0, 0, 0), radius: 5 } });
const geometry = (meshBytes = 100): SurfaceGeometry => ({ vertices: new Float32Array(9), normals: new Float32Array(9), indices: Uint32Array.of(0, 1, 2), groups: new Float32Array(3), atomIds: Uint32Array.of(1), evidence: { meshBytes, cells: 1, activeCells: 1, meshBoundBytes: meshBytes, workingBoundBytes: meshBytes, durationMs: 1 } });
function setup() {
  const pending: { resolve: (geometry: SurfaceGeometry) => void; reject: (error: Error) => void; signal: AbortSignal; progress?: (message: string) => void }[] = [];
  const compute = vi.fn((source: SurfaceInput | (() => SurfaceInput), signal: AbortSignal, progress?: (message: string) => void) => {
    try { if (typeof source === "function") source(); }
    catch (error) { return Promise.reject(error instanceof Error ? error : new Error(String(error))); }
    return new Promise<SurfaceGeometry>((resolve, reject) => pending.push({ resolve, reject, signal, progress }));
  });
  const dispose = vi.fn();
  return { runtime: new SurfaceRuntime({ compute, dispose } as unknown as SurfaceCalculator), pending, compute, dispose };
}
describe("transient surface lifecycle", () => {
  it("keeps multiple same-entry fragments independent and accounts auxiliary display arrays", async () => {
    const { runtime, pending } = setup();
    const first = vi.fn(), second = vi.fn();
    runtime.request("a", "fragment", "First", "pose", () => input(), first, undefined, "first");
    runtime.request("a", "fragment", "Second", "pose", () => input(), second, undefined, "second");
    runtime.cancel("a", "fragment", "second");
    expect(pending[0].signal.aborted).toBe(false);
    expect(pending[1].signal.aborted).toBe(true);
    pending[0].resolve(geometry(100)); pending[1].resolve(geometry());
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
    expect(second).toHaveBeenCalledOnce(); // Immediate cancellation fallback only.
    runtime.reserveDisplayBytes("a", "fragment", SURFACE_LIMITS.retainedBytes - 100, "first");
    expect(() => runtime.reserveDisplayBytes("a", "fragment", SURFACE_LIMITS.retainedBytes, "first")).toThrow("memory limit");
    runtime.remove("a", "fragment", "first");
    expect(runtime.statuses().map(s => s.surfaceId)).toEqual(["second"]);
    expect(() => runtime.reserveDisplayBytes("a", "fragment", 1, "first")).toThrow("no longer current");
    runtime.dispose();
  });
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
    const retained = geometry(SURFACE_LIMITS.retainedBytes);
    runtime.request("a", "fragment", "A", "pose-0", () => input(), vi.fn()); pending[0].resolve(retained);
    await vi.waitFor(() => expect(runtime.statuses()[2].message).toBe("Preparing display"));
    expect(runtime.markDisplayed("a", "fragment", "fragment", retained)).toBe(true);
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
  const retained = geometry(SURFACE_LIMITS.retainedBytes);
  pending[1].resolve(geometry()); pending[0].resolve(retained);
  await vi.waitFor(() => expect(fragment).toHaveBeenCalledOnce());
  expect(runtime.markDisplayed("a", "fragment", "fragment", retained)).toBe(true);
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
  const empty = { ...geometry(), indices: new Uint32Array() };
  pending[0].resolve(empty);
  await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
  expect(runtime.statuses()[0].state).toBe("rendering");
  expect(runtime.markDisplayed("a", "pocket", "pocket", empty)).toBe(true);
  await vi.waitFor(() => expect(runtime.statuses()[0].state).toBe("empty"));
  expect(runtime.statuses()[0].message).toContain("No protein surface");
});

it.each<SurfaceChannel>(["entry", "fragment", "pocket"])("acknowledges %s only after current display installation and rebinds cached geometry", async channel => {
  const { runtime, pending, compute } = setup();
  const first = vi.fn(), rebound = vi.fn(), mesh = geometry();
  const create = vi.fn(() => channel === "pocket" ? pocketInput() : input(0, channel));
  runtime.request("owner", channel, "Original", "coords", create, first, undefined, "surface");
  expect(runtime.statuses()[0].state).toBe("queued");
  pending[0].progress?.("Computing field");
  expect(runtime.statuses()[0]).toMatchObject({ state: "rendering", message: "Computing field" });
  expect(runtime.markDisplayed("owner", channel, "surface", mesh)).toBe(false);
  expect(runtime.canDisplay("owner", channel, "surface", mesh)).toBe(false);
  pending[0].resolve(mesh);
  await vi.waitFor(() => expect(first).toHaveBeenCalledWith(mesh));
  expect(runtime.canDisplay("owner", channel, "surface", mesh)).toBe(true);
  expect(runtime.canDisplay("owner", channel, "surface", { ...mesh })).toBe(false);
  expect(runtime.statuses()[0]).toMatchObject({ state: "rendering", message: "Preparing display" });
  expect(runtime.markDisplayed("owner", channel, "surface", { ...mesh })).toBe(false);
  expect(runtime.markDisplayed("owner", channel, "surface", mesh)).toBe(true);
  expect(runtime.statuses()[0].state).toBe("ready");
  pending[0].progress?.("Retired progress");
  expect(runtime.statuses()[0].state).toBe("ready");
  runtime.request("owner", channel, "Renamed", "coords", create, rebound, undefined, "surface");
  expect(rebound).toHaveBeenCalledExactlyOnceWith(mesh);
  expect(runtime.statuses()[0]).toMatchObject({ label: "Renamed", state: "rendering", message: "Preparing display" });
  expect(runtime.markDisplayed("owner", channel, "surface", mesh, "Hidden by isolation")).toBe(true);
  expect(runtime.statuses()[0]).toMatchObject({ state: "hidden", message: "Hidden by isolation" });
  rebound.mockClear();
  runtime.request("owner", channel, "Renamed", "coords", create, rebound, undefined, "surface");
  expect(rebound).toHaveBeenCalledExactlyOnceWith(mesh);
  expect(runtime.markDisplayed("owner", channel, "surface", mesh)).toBe(true);
  expect(runtime.statuses()[0].state).toBe("ready");
  expect(compute).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledOnce();
});

it.each<SurfaceChannel>(["entry", "fragment", "pocket"])("cancels %s during display preparation without allowing a late acknowledgement", async channel => {
  const { runtime, pending, compute } = setup(), notify = vi.fn(), mesh = geometry();
  const create = () => channel === "pocket" ? pocketInput() : input(0, channel);
  runtime.request("owner", channel, "Surface", "coords", create, notify, undefined, "surface");
  pending[0].resolve(mesh);
  await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(mesh));
  runtime.cancel("owner", channel, "surface");
  expect(pending[0].signal.aborted).toBe(true);
  expect(runtime.canDisplay("owner", channel, "surface", mesh)).toBe(false);
  expect(runtime.markDisplayed("owner", channel, "surface", mesh)).toBe(false);
  expect(() => runtime.reserveDisplayBytes("owner", channel, 1, "surface")).toThrow("no longer current");
  expect(runtime.statuses()[0].state).toBe("cancelled");
  expect(runtime.statuses()[0].message.includes("lines shown")).toBe(channel !== "pocket");
  runtime.request("owner", channel, "Surface", "coords", create, notify, undefined, "surface");
  expect(notify).toHaveBeenLastCalledWith();
  expect(compute).toHaveBeenCalledOnce();
  expect(runtime.statuses()[0].state).toBe("cancelled");
});

it("rejects stale display acknowledgements after replacement, upload failure, removal and kind changes", async () => {
  const { runtime, pending } = setup(), notify = vi.fn(), old = geometry(), current = geometry();
  runtime.request("owner", "entry", "Surface", "old", () => input(0, "entry"), notify, undefined, "surface");
  pending[0].resolve(old); await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(old));
  runtime.request("owner", "entry", "Surface", "new", () => input(1, "entry"), notify, undefined, "surface");
  expect(runtime.canDisplay("owner", "entry", "surface", old)).toBe(false);
  expect(runtime.markDisplayed("owner", "entry", "surface", old)).toBe(false);
  pending[1].resolve(current); await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(current));
  runtime.fail("owner", "entry", "Upload failed.", false, "surface", true);
  expect(runtime.canDisplay("owner", "entry", "surface", current)).toBe(false);
  expect(runtime.markDisplayed("owner", "entry", "surface", current)).toBe(false);
  expect(runtime.statuses()[0].message).toBe("Upload failed. Definition kept.");
  runtime.request("owner", "fragment", "Surface", "new", () => input(), notify, undefined, "surface");
  expect(pending).toHaveLength(3);
  pending[2].resolve(current); await vi.waitFor(() => expect(runtime.statuses()[0].message).toBe("Preparing display"));
  expect(runtime.canDisplay("owner", "entry", "surface", current)).toBe(false);
  expect(runtime.canDisplay("owner", "fragment", "surface", current)).toBe(true);
  expect(runtime.markDisplayed("owner", "entry", "surface", current)).toBe(false);
  expect(runtime.markDisplayed("owner", "fragment", "surface", current)).toBe(true);
  runtime.remove("owner", "fragment", "surface");
  expect(runtime.canDisplay("owner", "fragment", "surface", current)).toBe(false);
  expect(runtime.markDisplayed("owner", "fragment", "surface", current)).toBe(false);
});

it("requires matching worker kind and pocket crop before accepting a calculation", async () => {
  for (const [channel, source] of [
    ["entry", input()], ["fragment", input(0, "entry")], ["pocket", input(0, "pocket")],
    ["entry", { ...pocketInput(), kind: "entry" }],
  ] as const) {
    const { runtime, pending } = setup();
    runtime.request("owner", channel, "Surface", "coords", () => source, vi.fn());
    await vi.waitFor(() => expect(runtime.statuses()[0].state).toBe("fallback"));
    expect(runtime.statuses()[0].message).toContain("channel/profile mismatch");
    expect(pending).toHaveLength(0);
  }
});

it("accounts entry, fragment, pocket and display buffers together while rejecting empty atomic surfaces", async () => {
  const { runtime, pending } = setup(), notify = vi.fn();
  const retained = geometry(SURFACE_LIMITS.retainedBytes - 100);
  runtime.request("owner", "entry", "Whole", "coords", () => input(0, "entry"), notify, undefined, "whole");
  pending[0].resolve(retained); await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(retained));
  runtime.reserveDisplayBytes("owner", "entry", 100, "whole");
  expect(() => runtime.reserveDisplayBytes("owner", "entry", 101, "whole")).toThrow("memory limit");
  runtime.request("owner", "fragment", "Fragment", "coords", () => input(), vi.fn(), undefined, "fragment");
  pending[1].resolve(geometry()); await vi.waitFor(() => expect(runtime.statuses()[1].state).toBe("fallback"));
  runtime.remove("owner", "entry", "whole");
  const pocket = geometry(SURFACE_LIMITS.retainedBytes - 12);
  runtime.request("owner", "pocket", "Pocket", "coords", pocketInput, vi.fn(), undefined, "pocket");
  pending[2].resolve(pocket); await vi.waitFor(() => expect(runtime.statuses()[1].message).toBe("Preparing display"));
  expect(() => runtime.reserveDisplayBytes("owner", "pocket", 1, "pocket")).toThrow("memory limit");
  runtime.remove("owner", "pocket", "pocket");
  const empty = { ...geometry(), indices: new Uint32Array() };
  runtime.request("owner", "entry", "Whole", "new", () => input(0, "entry"), notify, undefined, "whole");
  pending[3].resolve(empty); await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(empty));
  expect(runtime.markDisplayed("owner", "entry", "whole", empty)).toBe(false);
  expect(runtime.statuses().find(status => status.surfaceId === "whole")?.state).toBe("rendering");
});

it("explains inactive requests without changing active, cancelled, failed or displayed requests", async () => {
  const { runtime, pending } = setup(), mesh = geometry();
  runtime.request("owner", "entry", "Whole", "hidden", null, vi.fn(), undefined, "surface");
  expect(runtime.markHidden("owner", "entry", "surface", "Paused during coordinate preview")).toBe(true);
  expect(runtime.statuses()[0]).toMatchObject({ state: "hidden", message: "Paused during coordinate preview" });
  expect(runtime.markHidden("owner", "fragment", "surface", "Wrong kind")).toBe(false);
  runtime.request("owner", "entry", "Whole", "coords", () => input(0, "entry"), vi.fn(), undefined, "surface");
  expect(runtime.markHidden("owner", "entry", "surface", "Wrong phase")).toBe(false);
  pending[0].resolve(mesh); await vi.waitFor(() => expect(runtime.statuses()[0].message).toBe("Preparing display"));
  runtime.markDisplayed("owner", "entry", "surface", mesh, "Hidden by isolation");
  expect(runtime.markHidden("owner", "entry", "surface", "Wrong phase")).toBe(false);
  runtime.request("owner", "entry", "Whole", "next", () => input(1, "entry"), vi.fn(), undefined, "surface");
  runtime.cancel("owner", "entry", "surface");
  expect(runtime.markHidden("owner", "entry", "surface", "No cancellation recovery")).toBe(false);
  runtime.fail("owner", "entry", "Failed.", false, "surface");
  expect(runtime.markHidden("owner", "entry", "surface", "No failure recovery")).toBe(false);
  runtime.remove("owner", "entry", "surface");
  expect(runtime.markHidden("owner", "entry", "surface", "Missing")).toBe(false);
});

it("updates only metadata labels without redisplaying or recalculating surfaces", async () => {
  const { runtime, pending, compute } = setup(), notify = vi.fn(), subscriber = vi.fn(), mesh = geometry();
  runtime.subscribe(subscriber);
  runtime.request("owner", "entry", "Old", "coords", () => input(0, "entry"), notify, undefined, "surface");
  pending[0].resolve(mesh); await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
  runtime.markDisplayed("owner", "entry", "surface", mesh);
  runtime.updateLabel("owner", "entry", "surface", "Renamed");
  expect(runtime.statuses()[0]).toMatchObject({ label: "Renamed", state: "ready" });
  expect(notify).toHaveBeenCalledOnce(); expect(compute).toHaveBeenCalledOnce();
  const calls = subscriber.mock.calls.length;
  runtime.updateLabel("owner", "entry", "surface", "Renamed");
  runtime.updateLabel("owner", "fragment", "surface", "Wrong kind");
  expect(subscriber).toHaveBeenCalledTimes(calls);
});

it("prepares only current live geometry and waits for its new visual acknowledgement", async () => {
  const { runtime, pending } = setup(), mesh = geometry();
  runtime.request("owner", "entry", "Surface", "coords", () => input(0, "entry"), vi.fn(), undefined, "surface");
  expect(runtime.markPreparing("owner", "entry", "surface", mesh)).toBe(false);
  pending[0].resolve(mesh); await vi.waitFor(() => expect(runtime.canDisplay("owner", "entry", "surface", mesh)).toBe(true));
  runtime.markDisplayed("owner", "entry", "surface", mesh);
  expect(runtime.markPreparing("owner", "entry", "surface", mesh)).toBe(true);
  expect(runtime.statuses()[0]).toMatchObject({ state: "rendering", message: "Preparing display" });
  expect(runtime.markPreparing("owner", "entry", "surface", { ...mesh })).toBe(false);
  runtime.cancel("owner", "entry", "surface");
  expect(runtime.markPreparing("owner", "entry", "surface", mesh)).toBe(false);
  runtime.remove("owner", "entry", "surface");
  expect(runtime.markPreparing("owner", "entry", "surface", mesh)).toBe(false);
});
