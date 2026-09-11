import type { SurfaceStatus } from "./surface/runtime";
import type {
  AtomReference,
  CameraState,
  CoordinatePatch,
  SelectionGranularity,
} from "../api/types";
import type {
  MolecularViewer,
  ViewerSelectionEvent,
  ViewerStructure,
  ViewerMeasurement,
} from "./MolecularViewer";

import { THEME_TOKENS } from "../theme";

class LazyMolstarViewer implements MolecularViewer {
  private engine: MolecularViewer | undefined;
  private disposed = false;
  private backgroundColor: string = THEME_TOKENS.light["viewer-background"];
  private selection: AtomReference[] = [];
  private pickingGranularity: SelectionGranularity = "atom";
  private selectionListeners = new Set<(event: ViewerSelectionEvent) => void>();
  private cameraListeners = new Set<(camera: CameraState) => void>();
  private surfaceListeners = new Set<(statuses: SurfaceStatus[]) => void>();
  private engineUnsubscribers: (() => void)[] = [];

  async mount(target: HTMLElement): Promise<void> {
    const { MolstarEngine } = await import("./MolstarEngine");
    if (this.disposed) return;
    this.engine = new MolstarEngine();
    this.engine.setBackgroundColor(this.backgroundColor);
    await this.engine.mount(target);
    this.engine.setPickingGranularity(this.pickingGranularity);
    this.engine.setSelection(this.selection);
    this.engineUnsubscribers = [...this.selectionListeners].map((listener) =>
      this.engine!.subscribeSelection(listener),
    );
    this.engineUnsubscribers.push(...[...this.surfaceListeners].map((listener) => this.engine!.subscribeSurfaces(listener)));
    this.engineUnsubscribers.push(
      ...[...this.cameraListeners].map((listener) =>
        this.engine!.subscribeCamera(listener),
      ),
    );
  }

  setBackgroundColor(cssColor: string): void {
    this.backgroundColor = cssColor;
    this.engine?.setBackgroundColor(cssColor);
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    return this.engine?.syncStructures(structures) ?? Promise.resolve();
  }

  replaceStructure(structure: ViewerStructure): Promise<void> {
    return this.engine?.replaceStructure(structure) ?? Promise.resolve();
  }

  applyCoordinatePatch(
    patch: CoordinatePatch,
    mode: "preview" | "commit",
  ): Promise<void> {
    return this.engine?.applyCoordinatePatch(patch, mode) ?? Promise.resolve();
  }

  clearCoordinatePreview(entryId: string): Promise<void> {
    return this.engine?.clearCoordinatePreview(entryId) ?? Promise.resolve();
  }

  setSelection(atoms: AtomReference[]): void {
    this.selection = atoms;
    this.engine?.setSelection(atoms);
  }

  setPickingGranularity(granularity: SelectionGranularity): void {
    this.pickingGranularity = granularity;
    this.engine?.setPickingGranularity(granularity);
  }

  setMeasurements(measurements: ViewerMeasurement[]): Promise<void> {
    return this.engine?.setMeasurements(measurements) ?? Promise.resolve();
  }

  setIsolation(atoms: AtomReference[] | null): Promise<void> {
    return this.engine?.setIsolation(atoms) ?? Promise.resolve();
  }

  getCamera(): CameraState | null {
    return this.engine?.getCamera() ?? null;
  }

  setCamera(camera: CameraState): void {
    this.engine?.setCamera(camera);
  }

  setCameraMode(mode: CameraState["mode"]): void {
    this.engine?.setCameraMode(mode);
  }

  zoom(factor: number): void {
    this.engine?.zoom(factor);
  }

  focusAtoms(atoms: AtomReference[]): void {
    this.engine?.focusAtoms(atoms);
  }

  fitVisible(): void {
    this.engine?.fitVisible();
  }

  subscribeCamera(listener: (camera: CameraState) => void): () => void {
    this.cameraListeners.add(listener);
    const engineUnsubscribe = this.engine?.subscribeCamera(listener);
    return () => {
      this.cameraListeners.delete(listener);
      engineUnsubscribe?.();
    };
  }

  subscribeSelection(listener: (event: ViewerSelectionEvent) => void): () => void {
    this.selectionListeners.add(listener);
    const engineUnsubscribe = this.engine?.subscribeSelection(listener);
    return () => {
      this.selectionListeners.delete(listener);
      engineUnsubscribe?.();
    };
  }

  subscribeSurfaces(listener: (statuses: SurfaceStatus[]) => void): () => void {
    this.surfaceListeners.add(listener);
    const unsubscribe = this.engine?.subscribeSurfaces(listener);
    return () => { this.surfaceListeners.delete(listener); unsubscribe?.(); };
  }
  cancelSurface(entryId: string): void { this.engine?.cancelSurface(entryId); }
  retrySurface(entryId: string): void { this.engine?.retrySurface(entryId); }

  resize(): void {
    this.engine?.resize();
  }

  dispose(): void {
    this.disposed = true;
    for (const unsubscribe of this.engineUnsubscribers) unsubscribe();
    this.engineUnsubscribers = [];
    this.selectionListeners.clear();
    this.cameraListeners.clear();
    this.surfaceListeners.clear();
    this.engine?.dispose();
    this.engine = undefined;
  }
}

export function createMolstarViewer(): MolecularViewer {
  return new LazyMolstarViewer();
}
