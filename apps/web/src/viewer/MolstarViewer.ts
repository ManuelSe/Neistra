import type { SurfaceChannel } from "./surface/protocol";
import type { SurfaceIdentity } from "./surface/objects";
import type { InteractionRecord } from "../interactions/types";
import type { SurfaceStatus } from "./surface/runtime";
import type { MovementView } from "../coordinates/interactiveTransform";
import type {
  MolecularProposalGeometry,
  AtomReference,
  CameraState,
  CoordinatePatch,
  SelectionGranularity,
} from "../api/types";
import type {
  MolecularViewer,
  MovementInteraction,
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
  private movementInteraction: MovementInteraction = "inactive";
  private selectionListeners = new Set<(event: ViewerSelectionEvent) => void>();
  private cameraListeners = new Set<(camera: CameraState) => void>();
  private surfaceListeners = new Set<(statuses: SurfaceStatus[]) => void>();
  private surfaceSelectionListeners = new Set<(surface: SurfaceIdentity) => void>();
  private surfaceSelectionBindings = new Map<(surface: SurfaceIdentity) => void, () => void>();
  private activeSurface: SurfaceIdentity | null = null;
  private engineUnsubscribers: (() => void)[] = [];

  async mount(target: HTMLElement): Promise<void> {
    const { MolstarEngine } = await import("./MolstarEngine");
    if (this.disposed) return;
    const engine = new MolstarEngine();
    this.engine = engine;
    engine.setBackgroundColor(this.backgroundColor);
    await engine.mount(target);
    if (this.disposed || this.engine !== engine) { engine.dispose(); return; }
    this.engine.setPickingGranularity(this.pickingGranularity);
    this.engine.setSelection(this.selection);
    this.engine.setActiveSurface(this.activeSurface);
    this.engine.setMovementMode(this.movementInteraction);
    this.engineUnsubscribers = [...this.selectionListeners].map((listener) =>
      this.engine!.subscribeSelection(listener),
    );
    this.engineUnsubscribers.push(...[...this.surfaceListeners].map((listener) => this.engine!.subscribeSurfaces(listener)));
    for (const listener of this.surfaceSelectionListeners) {
      if (!this.surfaceSelectionBindings.has(listener)) {
        this.surfaceSelectionBindings.set(listener, this.engine.subscribeSurfaceSelection(listener));
      }
    }
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

  setModelPreview(preview: MolecularProposalGeometry | null): Promise<void> {
    return this.engine?.setModelPreview?.(preview) ?? Promise.resolve();
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

  setInteractions(interactions: InteractionRecord[]): Promise<void> {
    return this.engine?.setInteractions(interactions) ?? Promise.resolve();
  }

  setIsolation(atoms: AtomReference[] | null): Promise<void> {
    return this.engine?.setIsolation(atoms) ?? Promise.resolve();
  }

  getCamera(): CameraState | null {
    return this.engine?.getCamera() ?? null;
  }

  getMovementView(): MovementView | null {
    return this.engine?.getMovementView() ?? null;
  }
  getRenderedAtomReferences(): AtomReference[] {
    return this.engine?.getRenderedAtomReferences() ?? [];
  }

  setMovementMode(interaction: MovementInteraction): void {
    this.movementInteraction = interaction;
    this.engine?.setMovementMode(interaction);
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
  cancelSurface(entryId: string, channel: SurfaceChannel = "fragment", surfaceId?: string): void { if (surfaceId === undefined) this.engine?.cancelSurface(entryId, channel); else this.engine?.cancelSurface(entryId, channel, surfaceId); }
  retrySurface(entryId: string, channel: SurfaceChannel = "fragment", surfaceId?: string): void { if (surfaceId === undefined) this.engine?.retrySurface(entryId, channel); else this.engine?.retrySurface(entryId, channel, surfaceId); }

  setActiveSurface(surface: SurfaceIdentity | null): void {
    this.activeSurface = surface ? { ...surface } : null;
    this.engine?.setActiveSurface(surface);
  }
  subscribeSurfaceSelection(listener: (surface: SurfaceIdentity) => void): () => void {
    this.surfaceSelectionListeners.add(listener);
    if (this.engine) this.surfaceSelectionBindings.set(listener, this.engine.subscribeSurfaceSelection(listener));
    return () => {
      this.surfaceSelectionListeners.delete(listener);
      this.surfaceSelectionBindings.get(listener)?.();
      this.surfaceSelectionBindings.delete(listener);
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
    this.cameraListeners.clear();
    this.surfaceListeners.clear();
    this.surfaceSelectionListeners.clear();
    for (const unsubscribe of this.surfaceSelectionBindings.values()) unsubscribe();
    this.surfaceSelectionBindings.clear();
    this.engine?.dispose();
    this.engine = undefined;
  }
}

export function createMolstarViewer(): MolecularViewer {
  return new LazyMolstarViewer();
}
