import type { AtomReference, SelectionGranularity } from "../api/types";
import type {
  MolecularViewer,
  ViewerSelectionEvent,
  ViewerStructure,
} from "./MolecularViewer";

class LazyMolstarViewer implements MolecularViewer {
  private engine: MolecularViewer | undefined;
  private disposed = false;
  private selection: AtomReference[] = [];
  private pickingGranularity: SelectionGranularity = "atom";
  private selectionListeners = new Set<(event: ViewerSelectionEvent) => void>();
  private engineUnsubscribers: (() => void)[] = [];

  async mount(target: HTMLElement): Promise<void> {
    const { MolstarEngine } = await import("./MolstarEngine");
    if (this.disposed) return;
    this.engine = new MolstarEngine();
    await this.engine.mount(target);
    this.engine.setPickingGranularity(this.pickingGranularity);
    this.engine.setSelection(this.selection);
    this.engineUnsubscribers = [...this.selectionListeners].map((listener) =>
      this.engine!.subscribeSelection(listener),
    );
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    return this.engine?.syncStructures(structures) ?? Promise.resolve();
  }

  setSelection(atoms: AtomReference[]): void {
    this.selection = atoms;
    this.engine?.setSelection(atoms);
  }

  setPickingGranularity(granularity: SelectionGranularity): void {
    this.pickingGranularity = granularity;
    this.engine?.setPickingGranularity(granularity);
  }

  subscribeSelection(listener: (event: ViewerSelectionEvent) => void): () => void {
    this.selectionListeners.add(listener);
    const engineUnsubscribe = this.engine?.subscribeSelection(listener);
    return () => {
      this.selectionListeners.delete(listener);
      engineUnsubscribe?.();
    };
  }

  resize(): void {
    this.engine?.resize();
  }

  dispose(): void {
    this.disposed = true;
    for (const unsubscribe of this.engineUnsubscribers) unsubscribe();
    this.engineUnsubscribers = [];
    this.selectionListeners.clear();
    this.engine?.dispose();
    this.engine = undefined;
  }
}

export function createMolstarViewer(): MolecularViewer {
  return new LazyMolstarViewer();
}
