import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePresentationController } from "../workspacePresentation/controller";
import { parsePresentationMirror, serializePresentationMirror, WORKSPACE_PRESENTATION_MIRROR_KEY } from "../workspacePresentation/mirror";
import type { CameraPresentationTarget, SessionCamera, WorkspacePresentationApi, WorkspacePresentationV1 } from "../workspacePresentation/types";
import { copySessionCamera, parseSessionCamera, parseWorkspacePresentation } from "../workspacePresentation/validation";

const camera = (offset = 0): SessionCamera => ({ mode: "perspective", position: [3 + offset, -4, 20],
  target: [offset, 1, 2], up: [0.2, 1, 0.1], radius: 12, fov: 0.91 });
const presentation = (pose: SessionCamera | null, revision = pose ? 5 : 0): WorkspacePresentationV1 => ({ schema_version: 1,
  revision, camera: pose, updated_at: pose ? "2026-11-14T02:00:00Z" : null });
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
};

function target(initial: SessionCamera | null = null) {
  let current = initial ? copySessionCamera(initial) : null;
  const listeners: ((value: SessionCamera) => void)[] = [];
  const active = new Set<(value: SessionCamera) => void>();
  const failures: ((value: SessionCamera) => void)[] = [];
  const activeFailures = new Set<(value: SessionCamera) => void>();
  const setCamera = vi.fn((pose: SessionCamera) => { current = copySessionCamera(pose); });
  const getCamera = vi.fn(() => current && copySessionCamera(current));
  const value: CameraPresentationTarget = {
    getSessionCamera: getCamera,
    setSessionCamera: setCamera,
    subscribeSessionCamera: vi.fn((listener: (pose: SessionCamera) => void) => { listeners.push(listener); active.add(listener); return () => { active.delete(listener); }; }),
    subscribeSessionCameraFailure: vi.fn((listener: (pose: SessionCamera) => void) => {
      failures.push(listener); activeFailures.add(listener); return () => { activeFailures.delete(listener); };
    }),
  };
  return { value, listeners, failures, setCamera, getCamera,
    setRaw(pose: SessionCamera) { current = copySessionCamera(pose); },
    emit(pose: SessionCamera) { current = copySessionCamera(pose); for (const listener of active) listener(pose); },
    fail(pose: SessionCamera, fallback: SessionCamera | null = null) {
      current = fallback && copySessionCamera(fallback); for (const listener of activeFailures) listener(pose);
    },
    subscriptions: () => ({ navigation: active.size, failure: activeFailures.size }),
    current: () => current,
  };
}

function setup(initial = presentation(camera()), mirror: string | null = null) {
  let server = structuredClone(initial);
  const data = new Map<string, string>();
  if (mirror !== null) data.set(WORKSPACE_PRESENTATION_MIRROR_KEY, mirror);
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
  const api: WorkspacePresentationApi = {
    read: vi.fn(() => Promise.resolve(structuredClone(server))),
    write: vi.fn((pose: SessionCamera, expected: number) => {
      if (expected !== server.revision) return Promise.reject(Object.assign(new Error("Conflict"), { code: "presentation_revision_conflict" }));
      server = presentation(copySessionCamera(pose), expected + 1);
      return Promise.resolve(structuredClone(server));
    }),
  };
  const controller = new WorkspacePresentationController({ api, storage, clock: {
    now: () => Date.now(), setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer),
  } });
  return { controller, api, storage, data, server: () => server, setServer(value: WorkspacePresentationV1) { server = structuredClone(value); },
    mirror: () => parsePresentationMirror(data.get(WORKSPACE_PRESENTATION_MIRROR_KEY) ?? null),
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

describe("session camera validation", () => {
  it("retains both projection modes, roll, a nondefault FOV and arbitrarily small positive logical radius", () => {
    for (const mode of ["perspective", "orthographic"] as const) {
      const value = { ...camera(), mode, radius: Number.MIN_VALUE };
      expect(parseSessionCamera(value)).toEqual(value);
    }
    expect(parseSessionCamera({ ...camera(), up: [0, 1, 1e308], position: [0, 0, 10], target: [0, 0, 0] })).not.toBeNull();
    expect(parseSessionCamera({ ...camera(), position: [0, 0, 0.000001], target: [0, 0, 0] })).not.toBeNull();
  });

  it.each([
    { radius: 0 }, { radius: -1 }, { radius: Infinity }, { radius: true }, { fov: 0 }, { fov: Math.PI }, { fov: "0.9" }, { zoom: 2 },
    { mode: "other" }, { up: [0, 0, 0] }, { position: [3, -4, 20, 0] }, { target: [0, "1", 2] },
    { position: [NaN, 0, 1] }, { position: [0, 0, 1e200], target: [0, 0, 0] },
    { position: [0, 0, 1e-8], target: [0, 0, 0] }, { position: [0, 0, 10], target: [0, 0, 0], up: [0, 0, 1] },
    { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1e-200, 0] },
    { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1e200, 0] },
    { position: [1.5e308, 1.5e308, 10], target: [1.5e308, 1.5e308, 0], up: [-1, 1, 0] },
    { position: [0, 0, 1], target: [0, 0, 0], fov: Number.MIN_VALUE },
    { position: [0, 0, 1e-6], target: [0, 0, 0], fov: 1e-310 },
  ])("rejects invalid inputs or actual native arithmetic degeneration: %j", change => {
    expect(parseSessionCamera({ ...camera(), ...change })).toBeNull();
  });

  it("rejects malformed presentation/mirror versions and bounded recovery input without coercion", () => {
    expect(parseWorkspacePresentation(presentation(null))).toEqual(presentation(null));
    expect(parseWorkspacePresentation(presentation(camera()))).toEqual(presentation(camera()));
    for (const value of [null, {}, { ...presentation(camera()), revision: true }, { ...presentation(camera()), revision: -1 },
      { ...presentation(camera()), schema_version: 2 }, { ...presentation(camera()), updated_at: "invalid" }, presentation(camera(), 0), presentation(null, 5)]) {
      expect(parseWorkspacePresentation(value)).toBeNull();
    }
    expect(parsePresentationMirror(" ".repeat(4097))).toBeNull(); expect(parsePresentationMirror("not json")).toBeNull();
    expect(parsePresentationMirror(JSON.stringify({ schema_version: 1, base_revision: true, dirty: true, camera: camera() }))).toBeNull();
    expect(parsePresentationMirror(JSON.stringify({ schema_version: 1, base_revision: null, dirty: false, camera: camera() }))).toBeNull();
    expect(parsePresentationMirror(JSON.stringify({ schema_version: 1, base_revision: 0, dirty: false, camera: camera() }))).toBeNull();
  });
});

describe("one application presentation controller", () => {
  it("is pure until started and hydrates only once through StrictMode-style stop/start", async () => {
    const h = setup(), viewer = target();
    expect(h.storage.getItem).not.toHaveBeenCalled(); expect(h.api.read).not.toHaveBeenCalled();
    h.controller.bind(viewer.value); h.controller.start(); h.controller.stop(); h.controller.start();
    await h.controller.hydrate();
    expect(h.api.read).toHaveBeenCalledTimes(1); expect(h.storage.getItem).toHaveBeenCalledTimes(1);
    expect(viewer.setCamera).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot()).toMatchObject({ hydrated: true, camera: camera(), status: "saved", problem: null, revision: 5 });
    expect(h.api.write).not.toHaveBeenCalled();
  });

  it("mirrors immediately and saves only after 250 ms quiet time without restoring acknowledgements", async () => {
    const h = setup(), viewer = target(); h.controller.bind(viewer.value); h.controller.start(); await h.controller.hydrate();
    const changed = { ...camera(8), mode: "orthographic" as const, fov: 1.13 };
    viewer.emit(changed);
    expect(h.mirror()).toEqual({ schema_version: 1, base_revision: 5, camera: changed, dirty: true });
    await vi.advanceTimersByTimeAsync(249); expect(h.api.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.api.write).toHaveBeenCalledExactlyOnceWith(changed, 5, { keepalive: false });
    expect(viewer.setCamera).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot()).toMatchObject({ camera: changed, revision: 6, status: "saved" });
    expect(h.mirror()).toMatchObject({ base_revision: 6, camera: changed, dirty: false });
  });

  it("bounds continuous navigation to a two-second maximum instead of endlessly restarting debounce", async () => {
    const h = setup(); h.controller.start(); await h.controller.hydrate(); h.controller.acceptNavigation(camera(1));
    for (let i = 2; i <= 20; i++) { await vi.advanceTimersByTimeAsync(100); h.controller.acceptNavigation(camera(i)); }
    expect(h.api.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(99); expect(h.api.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.api.write).toHaveBeenCalledExactlyOnceWith(camera(20), 5, { keepalive: false });
  });

  it("keeps one request and the latest pending pose, rebasing only an acknowledgement of its own write", async () => {
    const h = setup(), viewer = target(), first = deferred<WorkspacePresentationV1>();
    vi.mocked(h.api.write).mockImplementationOnce(() => first.promise);
    h.controller.bind(viewer.value); h.controller.start(); await h.controller.hydrate();
    viewer.emit(camera(1)); await vi.advanceTimersByTimeAsync(250);
    viewer.emit(camera(2)); await vi.advanceTimersByTimeAsync(100); viewer.emit(camera(3));
    await vi.advanceTimersByTimeAsync(4000); expect(h.api.write).toHaveBeenCalledTimes(1);
    h.setServer(presentation(camera(1), 6)); first.resolve(presentation(camera(1), 6));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.api.write).toHaveBeenCalledTimes(2);
    expect(vi.mocked(h.api.write).mock.calls.map(call => [call[0], call[1]])).toEqual([[camera(1), 5], [camera(3), 6]]);
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(3), revision: 7, status: "saved" });
    expect(viewer.setCamera).toHaveBeenCalledTimes(1);
  });

  it("writes a return to the old pose after an intervening in-flight write instead of losing it as a no-op", async () => {
    const h = setup(), first = deferred<WorkspacePresentationV1>(); vi.mocked(h.api.write).mockImplementationOnce(() => first.promise);
    h.controller.start(); await h.controller.hydrate();
    h.controller.acceptNavigation(camera(4)); await vi.advanceTimersByTimeAsync(250); h.controller.acceptNavigation(camera());
    h.setServer(presentation(camera(4), 6)); first.resolve(presentation(camera(4), 6)); await vi.advanceTimersByTimeAsync(250);
    expect(h.api.write).toHaveBeenLastCalledWith(camera(), 6, { keepalive: false });
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(), revision: 7, status: "saved" });
  });

  it("preserves prehydration navigation and requires explicit save when its base is unknown", async () => {
    const h = setup(), read = deferred<WorkspacePresentationV1>(), viewer = target();
    vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    h.controller.bind(viewer.value); h.controller.start(); viewer.emit(camera(9));
    read.resolve(presentation(camera(), 5)); await h.controller.hydrate(); await vi.advanceTimersByTimeAsync(2000);
    expect(viewer.setCamera).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(9), revision: 5, status: "conflict" });
    expect(h.mirror()).toMatchObject({ base_revision: null, dirty: true }); expect(h.api.write).not.toHaveBeenCalled();
    await h.controller.saveCurrentView();
    expect(h.api.write).toHaveBeenCalledExactlyOnceWith(camera(9), 5, { keepalive: false });
  });

  it.each([5, 7])("uses a clean mirror's known base for prehydration navigation against server revision %s", async revision => {
    const h = setup(presentation(camera(20), revision), serializePresentationMirror({ schema_version: 1,
      base_revision: 5, dirty: false, camera: camera(6) })), read = deferred<WorkspacePresentationV1>(), viewer = target();
    vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    h.controller.bind(viewer.value); h.controller.start(); viewer.emit(camera(9));
    expect(h.mirror()).toMatchObject({ base_revision: 5, camera: camera(9), dirty: true });
    read.resolve(presentation(camera(20), revision)); await h.controller.hydrate(); await vi.advanceTimersByTimeAsync(250);
    expect(viewer.setCamera).not.toHaveBeenCalled();
    if (revision === 5) {
      expect(h.api.write).toHaveBeenCalledExactlyOnceWith(camera(9), 5, { keepalive: false });
      expect(h.controller.getSnapshot().status).toBe("saved");
    } else {
      expect(h.api.write).not.toHaveBeenCalled(); expect(h.controller.getSnapshot().status).toBe("conflict");
      expect(h.mirror()).toMatchObject({ base_revision: 5, camera: camera(9), dirty: true });
    }
  });

  it("reserves asynchronous scene intent before a pose exists, defeating late hydration without a premature save", async () => {
    const h = setup(), read = deferred<WorkspacePresentationV1>(), viewer = target();
    vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    h.controller.bind(viewer.value); h.controller.start();
    const generation = h.controller.beginCameraIntent();
    read.resolve(presentation(camera(), 5)); await h.controller.hydrate();
    expect(h.controller.getSnapshot()).toMatchObject({ camera: null, navigationGeneration: generation, revision: 5 });
    expect(viewer.setCamera).not.toHaveBeenCalled(); expect(h.api.write).not.toHaveBeenCalled();
    viewer.emit(camera(4)); await vi.advanceTimersByTimeAsync(250);
    expect(h.api.write).toHaveBeenCalledWith(camera(4), 5, { keepalive: false });
    expect(h.controller.getSnapshot().navigationGeneration).toBeGreaterThan(generation);
  });

  it.each(["before", "after"] as const)("restores a saved pose when a held scene fails %s hydration", async order => {
    const h = setup(), read = deferred<WorkspacePresentationV1>(), viewer = target();
    vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    h.controller.bind(viewer.value); h.controller.start(); const generation = h.controller.beginCameraIntent();
    if (order === "after") { read.resolve(presentation(camera(), 5)); await h.controller.hydrate(); }
    expect(viewer.setCamera).not.toHaveBeenCalled();
    h.controller.cancelCameraIntent(generation);
    if (order === "before") { read.resolve(presentation(camera(), 5)); await h.controller.hydrate(); }
    expect(viewer.setCamera).toHaveBeenCalledExactlyOnceWith(camera());
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(), status: "saved", problem: null });
    expect(h.controller.claimInitialFit(viewer.value)).toBeNull(); expect(h.api.write).not.toHaveBeenCalled();
  });

  it("ignores cancellation superseded by a newer scene intent or accepted navigation", async () => {
    const h = setup(), read = deferred<WorkspacePresentationV1>(), viewer = target();
    vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    h.controller.bind(viewer.value); h.controller.start();
    const old = h.controller.beginCameraIntent(), current = h.controller.beginCameraIntent();
    h.controller.cancelCameraIntent(old); read.resolve(presentation(camera(), 5)); await h.controller.hydrate();
    expect(viewer.setCamera).not.toHaveBeenCalled();
    viewer.emit(camera(9)); h.controller.cancelCameraIntent(current);
    expect(h.controller.getSnapshot().camera).toEqual(camera(9)); expect(viewer.setCamera).not.toHaveBeenCalled();
  });

  it.each(["before", "after"] as const)("retires binding-owned scene intent %s hydration without restoring the retired viewer", async order => {
    const h = setup(), read = deferred<WorkspacePresentationV1>(), first = target(), second = target();
    vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    const release = h.controller.bind(first.value); h.controller.start(); h.controller.beginCameraIntent();
    if (order === "after") { read.resolve(presentation(camera(), 5)); await h.controller.hydrate(); }
    release(); expect(first.subscriptions()).toEqual({ navigation: 0, failure: 0 });
    h.controller.bind(second.value);
    if (order === "before") { read.resolve(presentation(camera(), 5)); await h.controller.hydrate(); }
    expect(first.setCamera).not.toHaveBeenCalled(); expect(second.setCamera).toHaveBeenCalledExactlyOnceWith(camera());
    expect(h.controller.claimInitialFit(second.value)).toBeNull();
  });

  it("does not cancel replacement-viewer intent when an old binding cleanup arrives late", async () => {
    const h = setup(), read = deferred<WorkspacePresentationV1>(), first = target(), second = target();
    vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    const releaseOld = h.controller.bind(first.value); h.controller.start(); h.controller.bind(second.value);
    const generation = h.controller.beginCameraIntent(); releaseOld();
    read.resolve(presentation(camera(), 5)); await h.controller.hydrate();
    expect(second.setCamera).not.toHaveBeenCalled();
    h.controller.cancelCameraIntent(generation); expect(second.setCamera).toHaveBeenCalledExactlyOnceWith(camera());
  });

  it("automatically recovers a dirty mirror only against its exact base revision", async () => {
    const mirror = serializePresentationMirror({ schema_version: 1, base_revision: 5, dirty: true, camera: camera(6) });
    const h = setup(presentation(camera(), 5), mirror), viewer = target();
    h.controller.bind(viewer.value); h.controller.start();
    expect(viewer.setCamera).toHaveBeenCalledExactlyOnceWith(camera(6));
    await h.controller.hydrate(); await vi.advanceTimersByTimeAsync(250);
    expect(h.api.write).toHaveBeenCalledWith(camera(6), 5, { keepalive: false });
    expect(h.mirror()).toMatchObject({ dirty: false, base_revision: 6 });
  });

  it.each([null, 5])("retains original dirty base %s through conflict, refresh and reload until explicit Save current view", async base => {
    const mirror = serializePresentationMirror({ schema_version: 1, base_revision: base, dirty: true, camera: camera(6) });
    const h = setup(presentation(camera(20), 7), mirror); h.controller.start(); await h.controller.hydrate();
    await h.controller.retry(); await vi.advanceTimersByTimeAsync(4000);
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(6), status: "conflict", revision: 7 });
    expect(h.mirror()).toMatchObject({ base_revision: base, dirty: true }); expect(h.api.write).not.toHaveBeenCalled();
    h.controller.stop();
    const reopened = setup(presentation(camera(20), 7), h.data.get(WORKSPACE_PRESENTATION_MIRROR_KEY));
    reopened.controller.start(); await reopened.controller.hydrate(); await vi.advanceTimersByTimeAsync(4000);
    expect(reopened.controller.getSnapshot().status).toBe("conflict"); expect(reopened.api.write).not.toHaveBeenCalled();
    await reopened.controller.saveCurrentView();
    expect(reopened.api.write).toHaveBeenCalledExactlyOnceWith(camera(6), 7, { keepalive: false });
    expect(reopened.mirror()).toMatchObject({ base_revision: 8, dirty: false });
  });

  it("uses a newer server preference rather than a clean mirror", async () => {
    const h = setup(presentation(camera(20), 7), serializePresentationMirror({ schema_version: 1, base_revision: 5, dirty: false, camera: camera(6) }));
    const viewer = target(); h.controller.bind(viewer.value); h.controller.start(); await h.controller.hydrate();
    expect(viewer.setCamera).toHaveBeenCalledExactlyOnceWith(camera(20));
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(20), revision: 7, status: "saved" });
    expect(h.api.write).not.toHaveBeenCalled();
  });

  it("confirms an ambiguous successful save by reading before retry without replaying it", async () => {
    const h = setup(); h.controller.start(); await h.controller.hydrate();
    vi.mocked(h.api.write).mockImplementationOnce(pose => {
      h.setServer(presentation(pose, 6)); return Promise.reject(new Error("Response lost"));
    });
    h.controller.acceptNavigation(camera(3)); await vi.advanceTimersByTimeAsync(250);
    expect(h.controller.getSnapshot()).toMatchObject({ status: "unsaved", problem: "save" }); expect(h.mirror()).toMatchObject({ base_revision: 5, dirty: true });
    await h.controller.retry();
    expect(h.api.write).toHaveBeenCalledTimes(1); expect(h.api.read).toHaveBeenCalledTimes(2);
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(3), revision: 6, status: "saved", problem: null });
    expect(h.mirror()).toMatchObject({ base_revision: 6, dirty: false });
  });

  it("pauses failed automatic writes while navigation continues, then checks and saves only the latest pose", async () => {
    const h = setup(); h.controller.start(); await h.controller.hydrate();
    vi.mocked(h.api.write).mockRejectedValueOnce(new Error("Offline"));
    h.controller.acceptNavigation(camera(3)); await vi.advanceTimersByTimeAsync(250);
    h.controller.acceptNavigation(camera(4)); await vi.advanceTimersByTimeAsync(4000);
    expect(h.api.write).toHaveBeenCalledTimes(1); expect(h.mirror()).toMatchObject({ camera: camera(4), base_revision: 5, dirty: true });
    await h.controller.retry();
    expect(h.api.read).toHaveBeenCalledTimes(2); expect(h.api.write).toHaveBeenLastCalledWith(camera(4), 5, { keepalive: false });
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(4), status: "saved" });
  });

  it("retains uncertain intent when a successful response contains an unconfirmed camera or revision", async () => {
    const h = setup(); h.controller.start(); await h.controller.hydrate();
    vi.mocked(h.api.write).mockResolvedValueOnce(presentation(camera(99), 6));
    h.controller.acceptNavigation(camera(3)); await vi.advanceTimersByTimeAsync(250);
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(3), revision: 5, status: "unsaved" });
    expect(h.mirror()).toMatchObject({ camera: camera(3), base_revision: 5, dirty: true });
  });

  it("surfaces save conflicts, preserves navigation, and never silently rebases the dirty mirror", async () => {
    const h = setup(); h.controller.start(); await h.controller.hydrate(); h.setServer(presentation(camera(7), 6));
    h.controller.acceptNavigation(camera(3)); await vi.advanceTimersByTimeAsync(250);
    expect(h.controller.getSnapshot().status).toBe("conflict");
    h.controller.acceptNavigation(camera(4)); await vi.advanceTimersByTimeAsync(4000);
    expect(h.api.write).toHaveBeenCalledTimes(1); expect(h.mirror()).toMatchObject({ camera: camera(4), base_revision: 5, dirty: true });
    await h.controller.retry(); expect(h.mirror()).toMatchObject({ base_revision: 5, dirty: true });
    await h.controller.saveCurrentView();
    expect(h.api.write).toHaveBeenLastCalledWith(camera(4), 6, { keepalive: false });
  });

  it("does not rebase conflict recovery when checking an explicit save fails", async () => {
    const h = setup(presentation(camera(20), 7), serializePresentationMirror({ schema_version: 1,
      base_revision: 5, dirty: true, camera: camera(6) }));
    h.controller.start(); await h.controller.hydrate();
    const read = deferred<WorkspacePresentationV1>(); vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    const save = h.controller.saveCurrentView();
    expect(h.controller.getSnapshot()).toMatchObject({ status: "saving", problem: "conflict", message: "Saving current view…" });
    read.reject(new Error("Offline")); await save;
    expect(h.mirror()).toMatchObject({ camera: camera(6), base_revision: 5, dirty: true });
    expect(h.controller.getSnapshot()).toMatchObject({ status: "conflict", problem: "conflict", message: expect.stringContaining("could not be checked") as string });
    expect(h.api.write).not.toHaveBeenCalled();
  });

  it("keeps server persistence and navigation working when local recovery storage fails", async () => {
    const h = setup(); h.storage.getItem.mockImplementation(() => { throw new Error("Denied"); });
    h.storage.setItem.mockImplementation(() => { throw new Error("Full"); });
    h.controller.start(); await h.controller.hydrate();
    expect(h.controller.getSnapshot()).toMatchObject({ status: "saved", problem: "recovery", message: "Local view recovery is unavailable." });
    h.controller.acceptNavigation(camera(5)); await vi.advanceTimersByTimeAsync(250);
    expect(h.api.write).toHaveBeenCalledWith(camera(5), 5, { keepalive: false });
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(5), status: "saved", problem: "recovery", message: "Local view recovery is unavailable." });
  });

  it("clears a recovery-only problem after local mirroring works again without changing save recovery semantics", async () => {
    const h = setup(); h.storage.setItem.mockImplementationOnce(() => { throw new Error("Temporarily full"); });
    h.controller.start(); await h.controller.hydrate();
    expect(h.controller.getSnapshot()).toMatchObject({ status: "saved", problem: "recovery" });
    h.controller.acceptNavigation(camera(5));
    expect(h.controller.getSnapshot()).toMatchObject({ status: "saving", problem: null });
    await vi.advanceTimersByTimeAsync(250);
    expect(h.controller.getSnapshot()).toMatchObject({ status: "saved", problem: null, message: null });
    expect(h.mirror()).toMatchObject({ camera: camera(5), base_revision: 6, dirty: false });
  });

  it("retries failed hydration explicitly and resumes stopped unsent work without another initial read", async () => {
    const h = setup(); vi.mocked(h.api.read).mockRejectedValueOnce(new Error("Offline"));
    h.controller.start(); await h.controller.hydrate(); expect(h.controller.getSnapshot().status).toBe("unsaved");
    await h.controller.retry(); expect(h.api.read).toHaveBeenCalledTimes(2);
    h.controller.acceptNavigation(camera(4)); h.controller.stop(); await vi.advanceTimersByTimeAsync(3000);
    expect(h.api.write).not.toHaveBeenCalled(); h.controller.start(); await vi.advanceTimersByTimeAsync(0);
    expect(h.api.read).toHaveBeenCalledTimes(2); expect(h.api.write).toHaveBeenCalledWith(camera(4), 5, { keepalive: false });
  });

  it("preserves a clean fallback mirror across a failed hydration and closure instead of replacing its known base with null", async () => {
    const original = serializePresentationMirror({ schema_version: 1, base_revision: 5, dirty: false, camera: camera(6) });
    const h = setup(presentation(camera(20), 7), original);
    vi.mocked(h.api.read).mockRejectedValueOnce(new Error("Offline")); h.controller.start(); await h.controller.hydrate();
    expect(h.controller.getSnapshot().camera).toEqual(camera(6));
    await h.controller.flush({ keepalive: true }); h.controller.stop();
    expect(h.data.get(WORKSPACE_PRESENTATION_MIRROR_KEY)).toBe(original);
    expect(h.mirror()).toMatchObject({ base_revision: 5, dirty: false, camera: camera(6) });
    const reopened = setup(presentation(camera(20), 7), h.data.get(WORKSPACE_PRESENTATION_MIRROR_KEY));
    reopened.controller.start(); await reopened.controller.hydrate();
    expect(reopened.controller.getSnapshot()).toMatchObject({ camera: camera(20), revision: 7, status: "saved" });
  });

  it("flushes a synchronous latest mirror and attempts a keepalive save without overlapping requests", async () => {
    const h = setup(), first = deferred<WorkspacePresentationV1>(); h.controller.start(); await h.controller.hydrate();
    vi.mocked(h.api.write).mockImplementationOnce(() => first.promise);
    h.controller.acceptNavigation(camera(8)); const write = h.controller.flush({ keepalive: true });
    expect(h.mirror()).toMatchObject({ camera: camera(8), base_revision: 5, dirty: true });
    await Promise.resolve(); expect(h.api.write).toHaveBeenCalledWith(camera(8), 5, { keepalive: true });
    h.controller.acceptNavigation(camera(9)); void h.controller.flush({ keepalive: true });
    expect(h.api.write).toHaveBeenCalledTimes(1); expect(h.mirror()).toMatchObject({ camera: camera(9), dirty: true });
    h.setServer(presentation(camera(8), 6)); first.resolve(presentation(camera(8), 6)); await write;
    expect(h.mirror()).toMatchObject({ camera: camera(9), base_revision: 6, dirty: true });
  });

  it.each(["flush", "retire"] as const)("captures the last unnotified sub-epsilon control pose before %s", async boundary => {
    const h = setup(), viewer = target(), replacement = target(); const release = h.controller.bind(viewer.value);
    h.controller.start(); await h.controller.hydrate();
    const raw = camera(); raw.position[0] += 1e-7; viewer.setRaw(raw);
    expect(h.controller.getSnapshot().camera).toEqual(camera());
    if (boundary === "flush") {
      const write = h.controller.flush({ keepalive: true });
      expect(h.mirror()).toMatchObject({ camera: raw, base_revision: 5, dirty: true }); await write;
      expect(h.api.write).toHaveBeenCalledExactlyOnceWith(raw, 5, { keepalive: true });
    } else {
      viewer.getCamera.mockImplementation(() => viewer.subscriptions().navigation ? raw : null);
      release(); h.controller.bind(replacement.value);
      expect(h.mirror()).toMatchObject({ camera: raw, base_revision: 5, dirty: true });
      expect(replacement.setCamera).toHaveBeenCalledExactlyOnceWith(raw);
      await vi.advanceTimersByTimeAsync(250);
      expect(h.api.write).toHaveBeenCalledExactlyOnceWith(raw, 5, { keepalive: false });
    }
    expect(h.controller.getSnapshot().camera).toEqual(raw);
    expect(h.controller.getSnapshot().navigationGeneration).toBe(1);
  });

  it.each(["pristine", "pending scene", "refused display"] as const)("does not capture startup or ambiguous native poses at closure/retirement: %s", async guard => {
    const h = setup(guard === "pristine" ? presentation(null) : presentation(camera())), viewer = target();
    const release = h.controller.bind(viewer.value); h.controller.start(); await h.controller.hydrate();
    if (guard === "pending scene") h.controller.beginCameraIntent();
    if (guard === "refused display") viewer.fail(camera(), camera(7));
    const expected = h.controller.getSnapshot().camera, generation = h.controller.getSnapshot().navigationGeneration;
    viewer.getCamera.mockClear(); viewer.setRaw(camera(99));
    await h.controller.flush({ keepalive: true }); release();
    expect(viewer.getCamera).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot()).toMatchObject({ camera: expected, navigationGeneration: generation });
    expect(h.api.write).not.toHaveBeenCalled();
  });

  it("never samples a retired target when its cleanup or later closure arrives after replacement", async () => {
    const h = setup(), first = target(), second = target(); const releaseFirst = h.controller.bind(first.value);
    h.controller.start(); await h.controller.hydrate(); h.controller.bind(second.value); first.getCamera.mockClear();
    first.setRaw(camera(99)); const raw = camera(); raw.position[0] += 1e-7; second.setRaw(raw);
    releaseFirst(); await h.controller.flush({ keepalive: true });
    expect(first.getCamera).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().camera).toEqual(raw);
    expect(h.api.write).toHaveBeenCalledExactlyOnceWith(raw, 5, { keepalive: true });
  });

  it("keeps the original base and one in-flight write when closure samples a newer unnotified pose", async () => {
    const h = setup(), viewer = target(), first = deferred<WorkspacePresentationV1>();
    vi.mocked(h.api.write).mockImplementationOnce(() => first.promise); h.controller.bind(viewer.value);
    h.controller.start(); await h.controller.hydrate(); viewer.emit(camera(2)); await vi.advanceTimersByTimeAsync(250);
    const raw = camera(2); raw.position[0] += 1e-7; viewer.setRaw(raw);
    const closed = h.controller.flush({ keepalive: true });
    expect(h.mirror()).toMatchObject({ camera: raw, base_revision: 5, dirty: true }); expect(h.api.write).toHaveBeenCalledTimes(1);
    h.setServer(presentation(camera(2), 6)); first.resolve(presentation(camera(2), 6)); await closed;
    expect(h.mirror()).toMatchObject({ camera: raw, base_revision: 6, dirty: true });
    await vi.advanceTimersByTimeAsync(250);
    expect(vi.mocked(h.api.write).mock.calls.map(call => [call[0], call[1]])).toEqual([[camera(2), 5], [raw, 6]]);
    expect(h.controller.getSnapshot()).toMatchObject({ camera: raw, revision: 7, status: "saved" });
  });

  it("waits for the running write before checking an explicit current-view save", async () => {
    const h = setup(), first = deferred<WorkspacePresentationV1>(); h.controller.start(); await h.controller.hydrate();
    vi.mocked(h.api.write).mockImplementationOnce(() => first.promise);
    h.controller.acceptNavigation(camera(2)); await vi.advanceTimersByTimeAsync(250);
    h.controller.acceptNavigation(camera(3)); const save = h.controller.saveCurrentView();
    await Promise.resolve(); expect(h.api.read).toHaveBeenCalledTimes(1);
    h.setServer(presentation(camera(2), 6)); first.resolve(presentation(camera(2), 6)); await save;
    expect(h.api.read).toHaveBeenCalledTimes(2);
    expect(vi.mocked(h.api.write).mock.calls.map(call => [call[0], call[1]])).toEqual([[camera(2), 5], [camera(3), 6]]);
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(3), revision: 7, status: "saved" });
  });

  it("rebinds the same camera across replacement viewers and ignores retired subscriptions", async () => {
    const h = setup(), first = target(), second = target(); const release = h.controller.bind(first.value);
    h.controller.start(); await h.controller.hydrate(); first.emit(camera(8)); release(); h.controller.bind(second.value);
    expect(second.setCamera).toHaveBeenCalledExactlyOnceWith(camera(8));
    first.listeners[0](camera(99)); expect(h.controller.getSnapshot().camera).toEqual(camera(8));
    second.emit(camera(9)); expect(h.controller.getSnapshot().camera).toEqual(camera(9));
  });

  it("claims the pristine fit before asynchronous work, waits for drawable content and accepts one synchronous native event", async () => {
    const h = setup(presentation(null)), viewer = target(); h.controller.bind(viewer.value);
    expect(h.controller.claimInitialFit(viewer.value)).toBeNull(); h.controller.start(); await h.controller.hydrate();
    const ticket = h.controller.claimInitialFit(viewer.value)!;
    expect(h.controller.claimInitialFit(viewer.value)).toBeNull();
    const fit = vi.fn(() => { viewer.emit(camera(2)); return camera(2); });
    expect(ticket.complete(false, fit)).toBe(false); expect(fit).not.toHaveBeenCalled();
    expect(ticket.complete(true, fit)).toBe(true); expect(fit).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().navigationGeneration).toBe(1);
    expect(ticket.complete(true, fit)).toBe(false); expect(h.controller.claimInitialFit(viewer.value)).toBeNull();
  });

  it("releases an unused retired fit ticket, but newer navigation consumes the opportunity globally", async () => {
    const h = setup(presentation(null)), first = target(), second = target(); const release = h.controller.bind(first.value);
    h.controller.start(); await h.controller.hydrate(); const old = h.controller.claimInitialFit(first.value)!;
    release(); h.controller.bind(second.value); const fit = vi.fn(() => camera(1));
    expect(old.complete(true, fit)).toBe(false); expect(fit).not.toHaveBeenCalled();
    const next = h.controller.claimInitialFit(second.value)!; next.cancel();
    const final = h.controller.claimInitialFit(second.value)!; second.emit(camera(3));
    expect(final.complete(true, fit)).toBe(false); expect(h.controller.claimInitialFit(second.value)).toBeNull();
    expect(fit).not.toHaveBeenCalled();
  });

  it("never replaces newer navigation from within the synchronous fit completion boundary", async () => {
    const h = setup(presentation(null)), viewer = target(); h.controller.bind(viewer.value); h.controller.start(); await h.controller.hydrate();
    const ticket = h.controller.claimInitialFit(viewer.value)!;
    expect(ticket.complete(true, () => { viewer.emit(camera(2)); viewer.emit(camera(3)); return camera(2); })).toBe(false);
    expect(h.controller.getSnapshot().camera).toEqual(camera(3));
  });

  it("does not restore a clean fallback mirror after failed late hydration superseded by explicit scene intent", async () => {
    const h = setup(presentation(camera(20), 7), serializePresentationMirror({ schema_version: 1,
      base_revision: 5, dirty: false, camera: camera(6) })), viewer = target(), read = deferred<WorkspacePresentationV1>();
    vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
    h.controller.bind(viewer.value); h.controller.start(); h.controller.beginCameraIntent();
    read.reject(new Error("Offline")); await h.controller.hydrate();
    expect(viewer.setCamera).not.toHaveBeenCalled(); expect(h.controller.getSnapshot().camera).toBeNull();
  });

  it("blocks implicit fitting after explicit intent, saved hydration, dirty recovery or failed hydration", async () => {
    for (const scenario of ["intent", "saved", "mirror", "failed"] as const) {
      const h = setup(scenario === "saved" ? presentation(camera()) : presentation(null), scenario === "mirror"
        ? serializePresentationMirror({ schema_version: 1, camera: camera(), base_revision: 0, dirty: true }) : null);
      const viewer = target(); h.controller.bind(viewer.value);
      if (scenario === "failed") vi.mocked(h.api.read).mockRejectedValueOnce(new Error("Offline"));
      if (scenario === "intent") h.controller.beginCameraIntent();
      h.controller.start(); await h.controller.hydrate();
      expect(h.controller.claimInitialFit(viewer.value), scenario).toBeNull(); h.controller.stop();
    }
  });

  it("catches viewport-specific restoration refusal and leaves actual navigation usable", async () => {
    const h = setup(), viewer = target(camera(7));
    vi.mocked(viewer.setCamera).mockImplementation(() => { throw new Error("Projection unavailable at this viewport"); });
    h.controller.bind(viewer.value); h.controller.start(); await h.controller.hydrate();
    expect(viewer.current()).toEqual(camera(7)); expect(h.controller.getSnapshot()).toMatchObject({ status: "unsaved", problem: "display", message: expect.stringContaining("cannot be displayed") as string });
    viewer.emit(camera(9)); await vi.advanceTimersByTimeAsync(250);
    expect(h.api.write).toHaveBeenCalledWith(camera(9), 5, { keepalive: false });
    expect(h.controller.getSnapshot()).toMatchObject({ status: "saved", problem: null, camera: camera(9) });
  });

  it("handles buffered late restoration refusal without saving the live fallback or changing the recovery mirror", async () => {
    const h = setup(), viewer = target(); h.controller.bind(viewer.value); h.controller.start(); await h.controller.hydrate();
    const mirror = h.data.get(WORKSPACE_PRESENTATION_MIRROR_KEY);
    viewer.fail(camera(), camera(7));
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(7), status: "unsaved", problem: "display" });
    await h.controller.flush({ keepalive: true }); await vi.advanceTimersByTimeAsync(4000);
    expect(h.api.write).not.toHaveBeenCalled(); expect(h.data.get(WORKSPACE_PRESENTATION_MIRROR_KEY)).toBe(mirror);
    viewer.emit(camera(9)); await vi.advanceTimersByTimeAsync(250);
    expect(h.api.write).toHaveBeenCalledExactlyOnceWith(camera(9), 5, { keepalive: false });
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(9), status: "saved", problem: null });
  });

  it("cancels a queued dirty recovery write after late display refusal until a user accepts a usable pose", async () => {
    const mirror = serializePresentationMirror({ schema_version: 1, base_revision: 5, dirty: true, camera: camera(6) });
    const h = setup(presentation(camera()), mirror), viewer = target(); h.controller.bind(viewer.value); h.controller.start(); await h.controller.hydrate();
    viewer.fail(camera(6), camera(7)); await vi.advanceTimersByTimeAsync(4000); await h.controller.flush({ keepalive: true });
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(7), problem: "display" });
    expect(h.api.write).not.toHaveBeenCalled(); expect(h.data.get(WORKSPACE_PRESENTATION_MIRROR_KEY)).toBe(mirror);
  });

  it("ignores late failures from retired bindings and superseded navigation, including an identical newer pose", async () => {
    const h = setup(), first = target(), second = target(); const release = h.controller.bind(first.value);
    h.controller.start(); await h.controller.hydrate();
    const oldFailure = first.failures[0]; release(); h.controller.bind(second.value);
    oldFailure(camera()); expect(h.controller.getSnapshot().problem).toBeNull();
    second.emit(camera(9)); second.fail(camera(), camera(7));
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(9), problem: null });
    second.emit(camera()); second.fail(camera(), camera(7));
    expect(h.controller.getSnapshot()).toMatchObject({ camera: camera(), problem: null });
  });

  it("keeps public snapshots independent from caller and target mutations, and ignores invalid navigation", async () => {
    const h = setup(); h.controller.start(); await h.controller.hydrate(); const changed = camera(6);
    h.controller.acceptNavigation(changed); changed.position[0] = 1000;
    expect(h.controller.getSnapshot().camera).toEqual(camera(6));
    expect(Object.isFrozen(h.controller.getSnapshot())).toBe(true); expect(Object.isFrozen(h.controller.getSnapshot().camera?.position)).toBe(true);
    const generation = h.controller.getSnapshot().navigationGeneration;
    expect(h.controller.acceptNavigation({ ...camera(), fov: 0 })).toBe(false);
    expect(h.controller.getSnapshot().navigationGeneration).toBe(generation);
  });
});
