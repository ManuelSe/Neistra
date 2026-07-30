import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerStructure } from "../viewer/MolecularViewer";

const calls = vi.hoisted(() => ({
  mount: vi.fn(),
  sync: vi.fn(),
  selection: vi.fn(),
  granularity: vi.fn(),
  subscribe: vi.fn((listener: unknown) => {
    void listener;
    return () => undefined;
  }),
  resize: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("../viewer/MolstarEngine", () => ({
  MolstarEngine: class {
    mount(target: HTMLElement) {
      calls.mount(target);
      return Promise.resolve();
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
      },
      {
        entryId: "ligand",
        label: "Ligand",
        projection: { format: "sdf", data: "ligand data" },
        atomIds: [20],
      },
    ];
    const viewer = createMolstarViewer();
    const listener = vi.fn();

    expect(calls.mount).not.toHaveBeenCalled();
    viewer.setPickingGranularity("chain");
    viewer.setSelection([{ structure_id: "protein", atom_id: 10 }]);
    viewer.subscribeSelection(listener);
    await viewer.mount(target);
    await viewer.syncStructures(structures);
    viewer.resize();
    viewer.dispose();

    expect(calls.mount).toHaveBeenCalledWith(target);
    expect(calls.granularity).toHaveBeenCalledWith("chain");
    expect(calls.selection).toHaveBeenCalledWith([
      { structure_id: "protein", atom_id: 10 },
    ]);
    expect(calls.subscribe).toHaveBeenCalledWith(listener);
    expect(calls.sync).toHaveBeenCalledWith(structures);
    expect(calls.resize).toHaveBeenCalledOnce();
    expect(calls.dispose).toHaveBeenCalledOnce();
  });
});
