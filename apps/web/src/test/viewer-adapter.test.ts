import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerStructure } from "../viewer/MolecularViewer";

const calls = vi.hoisted(() => ({
  mount: vi.fn(),
  sync: vi.fn(),
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
      },
      {
        entryId: "ligand",
        label: "Ligand",
        projection: { format: "sdf", data: "ligand data" },
      },
    ];
    const viewer = createMolstarViewer();

    expect(calls.mount).not.toHaveBeenCalled();
    await viewer.mount(target);
    await viewer.syncStructures(structures);
    viewer.resize();
    viewer.dispose();

    expect(calls.mount).toHaveBeenCalledWith(target);
    expect(calls.sync).toHaveBeenCalledWith(structures);
    expect(calls.resize).toHaveBeenCalledOnce();
    expect(calls.dispose).toHaveBeenCalledOnce();
  });
});
