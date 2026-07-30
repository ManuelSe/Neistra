import type { MolecularViewer, ViewerStructure } from "./MolecularViewer";

class LazyMolstarViewer implements MolecularViewer {
  private engine: MolecularViewer | undefined;
  private disposed = false;

  async mount(target: HTMLElement): Promise<void> {
    const { MolstarEngine } = await import("./MolstarEngine");
    if (this.disposed) return;
    this.engine = new MolstarEngine();
    await this.engine.mount(target);
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    return this.engine?.syncStructures(structures) ?? Promise.resolve();
  }

  resize(): void {
    this.engine?.resize();
  }

  dispose(): void {
    this.disposed = true;
    this.engine?.dispose();
    this.engine = undefined;
  }
}

export function createMolstarViewer(): MolecularViewer {
  return new LazyMolstarViewer();
}
