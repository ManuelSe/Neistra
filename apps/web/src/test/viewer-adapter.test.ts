import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import {
  componentHierarchy,
  proteinStructure,
  viewerSettings,
} from "./molecular-fixtures";

const calls = vi.hoisted(() => ({
  mount: vi.fn(),
  cancelSurface: vi.fn(),
  retrySurface: vi.fn(),
  background: vi.fn(),
  sync: vi.fn(),
  selection: vi.fn(),
  activeSurface: vi.fn(),
  surfaceSelection: vi.fn((listener: unknown) => { void listener; return vi.fn(); }),
  granularity: vi.fn(),
  movement: vi.fn(),
  subscribe: vi.fn((listener: unknown) => {
    void listener;
    return () => undefined;
  }),
  resize: vi.fn(),
  dispose: vi.fn(),
  measurements: vi.fn(),
  interactions: vi.fn(),
  isolation: vi.fn(),
  focus: vi.fn(),
  fit: vi.fn(),
  cameraSubscribe: vi.fn((listener: unknown) => {
    void listener;
    return () => undefined;
  }),
}));

vi.mock("../viewer/MolstarEngine", () => ({
  MolstarEngine: class {
    mount(target: HTMLElement) {
      return Promise.resolve(calls.mount(target));
    }

    setBackgroundColor(cssColor: string) {
      calls.background(cssColor);
    }

    syncStructures(structures: ViewerStructure[]) {
      calls.sync(structures);
      return Promise.resolve();
    }

    setSelection(atoms: unknown[]) {
      calls.selection(atoms);
    }
    setActiveSurface(surface: unknown) { calls.activeSurface(surface); }
    subscribeSurfaceSelection(listener: unknown) { return calls.surfaceSelection(listener); }

    setPickingGranularity(granularity: string) {
      calls.granularity(granularity);
    }

    subscribeSelection(listener: unknown) {
      return calls.subscribe(listener);
    }

    setMeasurements(value: unknown) {
      calls.measurements(value);
      return Promise.resolve();
    }

    setInteractions(value: unknown) {
      calls.interactions(value);
      return Promise.resolve();
    }

    setIsolation(value: unknown) {
      calls.isolation(value);
      return Promise.resolve();
    }

    getCamera() {
      return null;
    }

    getMovementView() { return null; }
    getRenderedAtomReferences() { return []; }
    setMovementMode(value: string) { calls.movement(value); }

    cancelSurface(id: string, channel: string) { calls.cancelSurface(id, channel); }
    retrySurface(id: string, channel: string) { calls.retrySurface(id, channel); }

    setCamera() {}
    setCameraMode() {}
    zoom() {}
    focusAtoms(atoms: unknown[]) {
      calls.focus(atoms);
    }

    fitVisible() {
      calls.fit();
    }

    subscribeCamera(listener: unknown) {
      return calls.cameraSubscribe(listener);
    }

    resize() {
      calls.resize();
    }

    dispose() {
      calls.dispose();
    }
  },
}));

describe("MolecularViewer Molstar adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("releases a native engine whose asynchronous mount completes after disposal", async () => {
    let finish!: () => void;
    calls.mount.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const { createMolstarViewer } = await import("../viewer/MolstarViewer");
    const viewer = createMolstarViewer();
    viewer.subscribeCamera(vi.fn());
    const mounting = viewer.mount(document.createElement("div"));
    await vi.waitFor(() => expect(calls.mount).toHaveBeenCalledOnce());
    viewer.dispose();
    finish();
    await mounting;
    expect(calls.dispose).toHaveBeenCalledTimes(2);
    expect(calls.cameraSubscribe).not.toHaveBeenCalled();
    expect(calls.granularity).not.toHaveBeenCalled();
  });

  it("loads Molstar lazily and forwards only application viewer concepts", async () => {
    const { createMolstarViewer } = await import("../viewer/MolstarViewer");
    const target = document.createElement("div");
    const protein = proteinStructure();
    const ligand = { ...proteinStructure(), structure_type: "ligand" as const };
    const structures: ViewerStructure[] = [
      {
        entryId: "protein",
        label: "Receptor",
        projection: { format: "mmcif", data: "protein data" },
        atomIds: [10, 11],
        normalized: protein,
        hierarchy: componentHierarchy(protein),
        settings: viewerSettings("cartoon"),
      },
      {
        entryId: "ligand",
        label: "Ligand",
        projection: { format: "sdf", data: "ligand data" },
        atomIds: [20],
        normalized: ligand,
        hierarchy: componentHierarchy(ligand),
        settings: viewerSettings(),
      },
    ];
    const viewer = createMolstarViewer();
    const listener = vi.fn();

    expect(calls.mount).not.toHaveBeenCalled();
    viewer.setBackgroundColor("#11191b");
    viewer.setPickingGranularity("chain");
    viewer.setSelection([{ structure_id: "protein", atom_id: 10 }]);
    viewer.subscribeSelection(listener);
    await viewer.mount(target);
    viewer.setBackgroundColor("#eef2f1");
    await viewer.syncStructures(structures);
    await viewer.setInteractions([]);
    viewer.focusAtoms([{ structure_id: "protein", atom_id: 10 }]);
    viewer.fitVisible();
    viewer.resize();
    viewer.dispose();

    expect(calls.mount).toHaveBeenCalledWith(target);
    expect(calls.background.mock.calls).toEqual([["#11191b"], ["#eef2f1"]]);
    expect(calls.background.mock.invocationCallOrder[0]).toBeLessThan(
      calls.mount.mock.invocationCallOrder[0],
    );
    expect(calls.granularity).toHaveBeenCalledWith("chain");
    expect(calls.selection).toHaveBeenCalledWith([
      { structure_id: "protein", atom_id: 10 },
    ]);
    expect(calls.subscribe).toHaveBeenCalledWith(listener);
    expect(calls.sync).toHaveBeenCalledWith(structures);
    expect(calls.interactions).toHaveBeenCalledWith([]);
    expect(calls.focus).toHaveBeenCalledWith([
      { structure_id: "protein", atom_id: 10 },
    ]);
    expect(calls.fit).toHaveBeenCalledOnce();
    expect(calls.resize).toHaveBeenCalledOnce();
    expect(calls.dispose).toHaveBeenCalledOnce();
  });
});

it("buffers typed movement ownership and forwards camera transitions without remounting", async () => {
  vi.clearAllMocks();
  const { createMolstarViewer } = await import("../viewer/MolstarViewer");
  const viewer = createMolstarViewer();
  viewer.setMovementMode("transform");
  await viewer.mount(document.createElement("div"));
  expect(calls.movement).toHaveBeenLastCalledWith("transform");
  viewer.setMovementMode("camera");
  expect(calls.movement).toHaveBeenLastCalledWith("camera");
  viewer.setMovementMode("transform");
  viewer.setMovementMode("inactive");
  expect(calls.movement).toHaveBeenLastCalledWith("inactive");
  expect(calls.mount).toHaveBeenCalledOnce();
  viewer.dispose();
});

it("buffers surface identity and unsubscribes a listener registered before lazy mount after it has bound", async () => {
  vi.clearAllMocks();
  const { createMolstarViewer } = await import("../viewer/MolstarViewer");
  const viewer = createMolstarViewer();
  const identity = { entryId: "entry", surfaceId: "first" };
  const listener = vi.fn();
  const unsubscribe = viewer.subscribeSurfaceSelection(listener);
  viewer.setActiveSurface(identity);
  await viewer.mount(document.createElement("div"));
  expect(calls.activeSurface).toHaveBeenLastCalledWith(identity);
  expect(calls.surfaceSelection).toHaveBeenCalledWith(listener);
  const boundUnsubscribe = calls.surfaceSelection.mock.results[0].value as () => void;
  unsubscribe();
  expect(boundUnsubscribe).toHaveBeenCalledOnce();
  viewer.setActiveSurface(null);
  expect(calls.activeSurface).toHaveBeenLastCalledWith(null);
  viewer.dispose();
  expect(boundUnsubscribe).toHaveBeenCalledOnce();
});

it("binds a surface listener added during asynchronous mount exactly once", async () => {
  vi.clearAllMocks();
  let finish!: () => void;
  calls.mount.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  const { createMolstarViewer } = await import("../viewer/MolstarViewer");
  const viewer = createMolstarViewer();
  const mounting = viewer.mount(document.createElement("div"));
  await vi.waitFor(() => expect(calls.mount).toHaveBeenCalledOnce());
  const unsubscribe = viewer.subscribeSurfaceSelection(vi.fn());
  finish(); await mounting;
  expect(calls.surfaceSelection).toHaveBeenCalledOnce();
  unsubscribe(); viewer.dispose();
  expect(calls.surfaceSelection.mock.results[0].value).toHaveBeenCalledOnce();
});


it("forwards surface channel identity through the lazy adapter for Cancel and Retry", async () => {
  const { createMolstarViewer } = await import("../viewer/MolstarViewer");
  const viewer = createMolstarViewer();
  await viewer.mount(document.createElement("div"));
  viewer.cancelSurface("receptor", "pocket");
  viewer.retrySurface("receptor", "pocket");
  expect(calls.cancelSurface).toHaveBeenLastCalledWith("receptor", "pocket");
  expect(calls.retrySurface).toHaveBeenLastCalledWith("receptor", "pocket");
  viewer.cancelSurface("receptor");
  viewer.retrySurface("receptor");
  expect(calls.cancelSurface).toHaveBeenLastCalledWith("receptor", "fragment");
  expect(calls.retrySurface).toHaveBeenLastCalledWith("receptor", "fragment");
  viewer.dispose();
});
