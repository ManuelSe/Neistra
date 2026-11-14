import { describe, expect, it, vi } from "vitest";
import { Camera } from "molstar/lib/mol-canvas3d/camera";
import { Vec3, Vec4 } from "molstar/lib/mol-math/linear-algebra";
import { Sphere3D } from "molstar/lib/mol-math/geometry";
import { ValueCell } from "molstar/lib/mol-util/value-cell";
import type { GraphicsRenderObject } from "molstar/lib/mol-gl/render-object";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { AtomReference, CameraState } from "../api/types";
import type { SessionCamera } from "../workspacePresentation/types";
import { MolstarEngine } from "../viewer/MolstarEngine";

vi.mock("../viewer/modelPreviewGeometry", () => ({
  createModelPreviewRepresentation: () => ({ destroy: vi.fn() }), modelPreviewColor: () => 0,
}));
vi.mock("../viewer/interactionGeometry", () => ({
  createInteractionRepresentation: () => ({ destroy: vi.fn() }),
}));

interface EngineProbe {
  plugin: PluginUIContext;
  rebuilding: boolean;
  movementInteraction: "inactive" | "transform" | "camera";
  movementCamera: CameraState | null;
  renderedAtomReferences: Map<string, AtomReference[]>;
  observeCameraFrame(): void;
  updateCameraBounds(): void;
}

const initialPose = (): SessionCamera => ({ mode: "perspective", position: [0, 0, 30],
  target: [0, 0, 0], up: [0, 1, 0], radius: 4, fov: 0.7 });

function renderObject(bounds = Sphere3D.create(Vec3.create(0, 0, 0), 3)) {
  return { state: { disposed: false, visible: true, alphaFactor: 1 },
    values: { alpha: ValueCell.create(1), drawCount: ValueCell.create(3), boundingSphere: ValueCell.create(bounds) } };
}

/** The real camera supplies matrix arithmetic; only the absent GPU/plugin is replaced. */
function setup() {
  const native = new Camera(undefined, { x: 0, y: 0, width: 800, height: 600 });
  const completeBounds = Sphere3D.create(Vec3.create(0, 0, 0), 3);
  // These public cached refs deliberately do not follow committed render objects.
  const cachedCompleteBounds = Sphere3D.create(Vec3.create(0, 0, 0), 0);
  const visibleBounds = { center: Vec3.create(0, 0, 0), radius: 0 };
  const object = renderObject(completeBounds); object.state.visible = false;
  const objects = [object];
  const reprCount = { value: 1 };
  const engine = new MolstarEngine(), internals = engine as unknown as EngineProbe;
  internals.plugin = {
    canvas3d: { camera: native, boundingSphere: cachedCompleteBounds, boundingSphereVisible: visibleBounds,
      getRenderObjects: () => objects as unknown as GraphicsRenderObject[],
      reprCount, requestDraw: vi.fn(), remove: vi.fn(), commit: vi.fn() },
    managers: { interactivity: { lociHighlights: { clearHighlights: vi.fn() } } },
  } as unknown as PluginUIContext;
  engine.setSessionCamera(initialPose());
  expect(native.update()).toBe(true);
  const sessionEvents = vi.fn<(camera: SessionCamera) => void>();
  engine.subscribeSessionCamera(sessionEvents);
  return { engine, internals, native, completeBounds, cachedCompleteBounds, visibleBounds, object, objects, reprCount, sessionEvents };
}

describe("exact native session camera observation", () => {
  it("publishes a valid raw change that the native matrix epsilon suppresses", () => {
    const h = setup(), matrixEvents = vi.fn();
    const release = h.native.changed.subscribe(matrixEvents);
    h.native.position[0] = 1e-7;
    expect(h.native.update()).toBe(false);
    expect(matrixEvents).not.toHaveBeenCalled();
    const exact = { ...initialPose(), position: [1e-7, 0, 30] };
    expect(h.engine.getSessionCamera()).toEqual(exact);
    h.internals.observeCameraFrame();
    expect(h.sessionEvents).toHaveBeenCalledExactlyOnceWith(exact);
    h.internals.observeCameraFrame();
    expect(h.sessionEvents).toHaveBeenCalledOnce();
    release.unsubscribe();
    h.engine.dispose();
  });

  it("retains the last exact damping pose while coalescing identical observations", () => {
    const h = setup();
    for (const x of [1, 1.0000001, 1.0000002]) {
      h.native.position[0] = x;
      h.native.update();
      h.internals.observeCameraFrame();
    }
    h.internals.observeCameraFrame(); h.internals.observeCameraFrame();
    expect(h.sessionEvents).toHaveBeenCalledTimes(3);
    expect(h.sessionEvents).toHaveBeenLastCalledWith({ ...initialPose(), position: [1.0000002, 0, 30] });
    h.engine.dispose();
  });

  it("captures a new logical focus radius before derived clipping replaces the native radius", () => {
    const h = setup();
    h.native.setState({ radius: 7 }, 0);
    // Installing displaced geometry widens clipping independently of focus.
    h.completeBounds.center[2] = -100; h.completeBounds.radius = 10;
    h.internals.updateCameraBounds();
    expect(h.engine.getSessionCamera()).toEqual({ ...initialPose(), radius: 7 });
    expect(h.native.getSnapshot().radius).toBeGreaterThan(7);
    expect(h.sessionEvents).toHaveBeenCalledExactlyOnceWith({ ...initialPose(), radius: 7 });
    h.native.update(); h.internals.observeCameraFrame(); h.internals.updateCameraBounds();
    expect(h.sessionEvents).toHaveBeenCalledOnce();
    expect(h.engine.getSessionCamera()?.radius).toBe(7);
    h.engine.dispose();
  });

  it("does not publish clipping-only changes or temporary projection probes as navigation", () => {
    const h = setup(), pose = initialPose();
    h.completeBounds.center[2] = -200; h.completeBounds.radius = 10;
    h.internals.updateCameraBounds(); h.native.update(); h.internals.observeCameraFrame();
    expect(h.engine.getSessionCamera()).toEqual(pose);
    expect(h.native.getSnapshot().radius).toBeGreaterThan(pose.radius);
    h.completeBounds.center[2] = 0; h.completeBounds.radius = 3;
    h.internals.updateCameraBounds(); h.native.update(); h.internals.observeCameraFrame();
    expect(h.engine.getSessionCamera()).toEqual(pose);
    expect(h.sessionEvents).not.toHaveBeenCalled();
    h.engine.dispose();
  });

  it("observes navigation during an empty scene and an asynchronous rebuild", () => {
    const h = setup();
    h.internals.rebuilding = true;
    h.native.position[0] = 2; h.native.target[0] = 2;
    h.native.update(); h.internals.observeCameraFrame();
    const pose: SessionCamera = { ...initialPose(), position: [2, 0, 30], target: [2, 0, 0] };
    expect(h.sessionEvents).toHaveBeenCalledExactlyOnceWith(pose);
    h.internals.updateCameraBounds();
    h.internals.rebuilding = false; h.internals.observeCameraFrame();
    expect(h.engine.getSessionCamera()).toEqual(pose);
    expect(h.sessionEvents).toHaveBeenCalledOnce();
    h.engine.dispose();
  });

  it("silently applies complete restoration without turning delayed native events into new input", () => {
    const h = setup();
    const restored: SessionCamera = { mode: "orthographic", position: [5, 7, 60], target: [1, 2, 3],
      up: [1, 2, 0], radius: 0.001, fov: 1.1 };
    h.engine.setSessionCamera(restored);
    h.native.update(); h.internals.observeCameraFrame();
    h.internals.updateCameraBounds(); h.native.update(); h.internals.observeCameraFrame();
    expect(h.engine.getSessionCamera()).toEqual(restored);
    expect(h.sessionEvents).not.toHaveBeenCalled();
    h.engine.dispose();
  });

  it("preserves a transform lock even for a raw displacement below the native matrix epsilon", () => {
    const h = setup();
    h.internals.movementInteraction = "transform";
    h.internals.movementCamera = { mode: "perspective", position: [0, 0, 30], target: [0, 0, 0], up: [0, 1, 0], radius: 4 };
    h.native.position[0] = 1e-7;
    expect(h.native.update()).toBe(false);
    h.internals.observeCameraFrame();
    expect(h.engine.getSessionCamera()).toEqual(initialPose());
    expect(h.sessionEvents).not.toHaveBeenCalled();
    // Dispose outside transform mode; the synthetic canvas has no input controls.
    h.internals.movementInteraction = "inactive";
    h.engine.dispose();
  });

  it("signals actual native drawability independently of canonical rendered references", () => {
    const h = setup(), drawable = vi.fn<(value: boolean) => void>();
    h.internals.renderedAtomReferences.set("entry", [{ structure_id: "entry", atom_id: 1 }]);
    expect(h.engine.getRenderedAtomReferences()).toHaveLength(1);
    const release = h.engine.subscribeDrawable(drawable);
    expect(drawable.mock.calls).toEqual([[false]]);
    h.internals.observeCameraFrame();
    expect(drawable.mock.calls).toEqual([[false]]);
    h.object.state.visible = true;
    h.internals.observeCameraFrame(); h.internals.observeCameraFrame();
    expect(drawable.mock.calls).toEqual([[false], [true]]);
    h.native.viewport.width = 0; h.internals.observeCameraFrame();
    expect(drawable).toHaveBeenLastCalledWith(false);
    h.native.viewport.width = 800; h.internals.observeCameraFrame();
    expect(drawable.mock.calls).toEqual([[false], [true], [false], [true]]);
    release(); h.object.state.visible = false; h.internals.observeCameraFrame();
    expect(drawable).toHaveBeenCalledTimes(4);
    h.engine.dispose();
  });

  it("releases camera and drawable listeners when the engine is disposed", () => {
    const h = setup(), drawable = vi.fn<(value: boolean) => void>();
    h.engine.subscribeDrawable(drawable);
    h.engine.dispose();
    h.native.position[0] = 3; h.visibleBounds.radius = 5;
    h.internals.observeCameraFrame();
    expect(h.sessionEvents).not.toHaveBeenCalled();
    expect(drawable.mock.calls).toEqual([[false]]);
  });

  it("fits committed visible render geometry even when the public cached spheres remain empty", () => {
    const h = setup();
    h.object.state.visible = true;
    Vec3.set(h.completeBounds.center, 7, -4, 2); h.completeBounds.radius = 6;
    const hidden = renderObject(Sphere3D.create(Vec3.create(1000, 0, 0), 20));
    hidden.state.visible = false; h.objects.push(hidden);
    expect(h.cachedCompleteBounds.radius).toBe(0); expect(h.visibleBounds.radius).toBe(0);
    h.engine.fitVisible();
    const pose = h.engine.getSessionCamera()!;
    const target = [7, -4, 2], distance = 6 / Math.sin(initialPose().fov / 2);
    pose.target.forEach((value, axis) => expect(value).toBeCloseTo(target[axis], 12));
    expect(pose.radius).toBeCloseTo(6, 12);
    expect(pose.position[0]).toBeCloseTo(7, 12); expect(pose.position[1]).toBeCloseTo(-4, 12);
    expect(pose.position[2]).toBeCloseTo(2 + distance, 12);
    expect(pose.fov).toBe(initialPose().fov);
    expect(pose).not.toEqual(initialPose());
    expect(h.sessionEvents).toHaveBeenCalledExactlyOnceWith(pose);
    h.native.update(); h.internals.observeCameraFrame();
    expect(h.native.zoom).toBeCloseTo(600 / (2 * Math.tan(pose.fov / 2) * distance), 10);
    expect(h.engine.getSessionCamera()).toEqual(pose);
    expect(h.sessionEvents).toHaveBeenCalledOnce();
    expect(h.cachedCompleteBounds.radius).toBe(0); expect(h.visibleBounds.radius).toBe(0);
    h.engine.dispose();
  });

  it("clips displaced committed geometry with stale empty public bounds while preserving pose and zoom", () => {
    const h = setup(), pose = initialPose(), beforeZoom = h.native.zoom;
    const landmarks = [Vec3.create(1, 2, 0), Vec3.create(-2, -1, 1)];
    const before = landmarks.map(point => [...h.native.project(Vec4(), point)]);
    h.object.state.visible = true;
    h.completeBounds.center[2] = -100; h.completeBounds.radius = 10;
    h.internals.updateCameraBounds(); h.native.update(); h.internals.observeCameraFrame();
    expect(h.cachedCompleteBounds.radius).toBe(0); expect(h.visibleBounds.radius).toBe(0);
    expect(h.native.getSnapshot().radius).toBeGreaterThanOrEqual(110 - 1e-10);
    expect(h.engine.getSessionCamera()).toEqual(pose);
    expect(h.native.zoom).toBe(beforeZoom);
    landmarks.forEach((point, index) => {
      const actual = h.native.project(Vec4(), point);
      expect(actual[0]).toBeCloseTo(before[index][0], 10); expect(actual[1]).toBeCloseTo(before[index][1], 10);
    });
    for (const z of [-90, -100, -110]) {
      const depth = h.native.project(Vec4(), Vec3.create(0, 0, z))[2];
      expect(depth).toBeGreaterThanOrEqual(-1e-10); expect(depth).toBeLessThanOrEqual(1 + 1e-10);
    }
    expect(h.sessionEvents).not.toHaveBeenCalled();
    h.engine.dispose();
  });

  it("retires actual drawability despite stale nonempty cached bounds and ignores ineffective render objects", () => {
    const h = setup(), drawable = vi.fn<(value: boolean) => void>();
    h.internals.renderedAtomReferences.set("entry", [{ structure_id: "entry", atom_id: 1 }]);
    h.engine.subscribeDrawable(drawable);
    h.object.state.visible = true; h.internals.observeCameraFrame();
    expect(drawable.mock.calls).toEqual([[false], [true]]);
    h.cachedCompleteBounds.radius = 10; h.visibleBounds.radius = 10;
    h.objects.length = 0; h.internals.observeCameraFrame();
    expect(drawable.mock.calls).toEqual([[false], [true], [false]]);
    const invalid = [renderObject(), renderObject(), renderObject(), renderObject(), renderObject(), renderObject()];
    invalid[0].state.visible = false;
    invalid[1].state.alphaFactor = 0;
    ValueCell.update(invalid[2].values.alpha, 0);
    ValueCell.update(invalid[3].values.drawCount, 0);
    invalid[4].state.disposed = true;
    invalid[5].values.boundingSphere.ref.value.radius = 0;
    for (const object of invalid) {
      h.objects.push(object); h.internals.observeCameraFrame();
      expect(drawable.mock.calls).toEqual([[false], [true], [false]]);
    }
    expect(h.engine.getRenderedAtomReferences()).toHaveLength(1);
    h.objects.push(renderObject()); h.internals.observeCameraFrame();
    expect(drawable.mock.calls).toEqual([[false], [true], [false], [true]]);
    h.engine.dispose();
  });
});
