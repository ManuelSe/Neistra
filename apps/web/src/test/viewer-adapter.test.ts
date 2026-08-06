import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { proteinStructure, viewerSettings } from "./molecular-fixtures";

const calls = vi.hoisted(() => ({
  mount: vi.fn(),
  background: vi.fn(),
  sync: vi.fn(),
  selection: vi.fn(),
  granularity: vi.fn(),
  subscribe: vi.fn((listener: unknown) => {
    void listener;
    return () => undefined;
  }),
  resize: vi.fn(),
  dispose: vi.fn(),
  measurements: vi.fn(),
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
      calls.mount(target);
      return Promise.resolve();
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

    setIsolation(value: unknown) {
      calls.isolation(value);
      return Promise.resolve();
    }

    getCamera() {
      return null;
    }

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

  it("loads Molstar lazily and forwards only application viewer concepts", async () => {
    const { createMolstarViewer } = await import("../viewer/MolstarViewer");
    const target = document.createElement("div");
    const structures: ViewerStructure[] = [
      {
        entryId: "protein",
        label: "Receptor",
        projection: { format: "mmcif", data: "protein data" },
        atomIds: [10, 11],
        normalized: proteinStructure(),
        settings: viewerSettings("cartoon"),
      },
      {
        entryId: "ligand",
        label: "Ligand",
        projection: { format: "sdf", data: "ligand data" },
        atomIds: [20],
        normalized: { ...proteinStructure(), structure_type: "ligand" },
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
    expect(calls.focus).toHaveBeenCalledWith([
      { structure_id: "protein", atom_id: 10 },
    ]);
    expect(calls.fit).toHaveBeenCalledOnce();
    expect(calls.resize).toHaveBeenCalledOnce();
    expect(calls.dispose).toHaveBeenCalledOnce();
  });
});
