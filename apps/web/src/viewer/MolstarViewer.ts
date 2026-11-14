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
  SurfaceAppearance,
} from "../api/types";
import type {
  MolecularViewer,
  MovementInteraction,
  ViewerSelectionEvent,
  ViewerStructure,
  ViewerMeasurement,
} from "./MolecularViewer";

import { THEME_TOKENS } from "../theme";
import { surfaceIdentityKey } from "./surfaceReconciliation";
import type { SessionCamera } from "../workspacePresentation/types";
import { parseSessionCamera } from "../workspacePresentation/validation";

class LazyMolstarViewer implements MolecularViewer {
  capturePresentation() {
    if (!this.engine?.capturePresentation) throw new Error("The molecular viewer is not ready.");
    return this.engine.capturePresentation();
  }
  private engine: MolecularViewer | undefined;
  private disposed = false;
  private backgroundColor: string = THEME_TOKENS.light["viewer-background"];
  private selection: AtomReference[] = [];
  private pickingGranularity: SelectionGranularity = "atom";
  private movementInteraction: MovementInteraction = "inactive";
  private selectionListeners = new Set<(event: ViewerSelectionEvent) => void>();
  private cameraListeners = new Set<(camera: CameraState) => void>();
  private sessionCameraListeners = new Set<(camera: SessionCamera) => void>();
  private sessionCameraBindings = new Map<(camera: SessionCamera) => void, () => void>();
  private pendingSessionCamera: SessionCamera | null = null;
  private cameraFailureListeners = new Set<(camera: SessionCamera) => void>();
  private drawableListeners = new Set<(drawable: boolean) => void>();
  private drawableBindings = new Map<(drawable: boolean) => void, () => void>();
  private surfaceListeners = new Set<(statuses: SurfaceStatus[]) => void>();
  private surfaceSelectionListeners = new Set<(surface: SurfaceIdentity) => void>();
  private surfaceSelectionBindings = new Map<(surface: SurfaceIdentity) => void, () => void>();
  private activeSurface: SurfaceIdentity | null = null;
  private mounted = false;
  private pendingSurfacePreviews = new Map<string, { identity: SurfaceIdentity; appearance: SurfaceAppearance }>();
  private engineUnsubscribers: (() => void)[] = [];

  async mount(target: HTMLElement): Promise<void> {
    const { MolstarEngine } = await import("./MolstarEngine");
    if (this.disposed) return;
    const engine = new MolstarEngine();
    this.engine = engine;
    engine.setBackgroundColor(this.backgroundColor);
    await engine.mount(target);
    if (this.disposed || this.engine !== engine) { engine.dispose(); return; }
    let refusedCamera: SessionCamera | undefined;
    if (this.pendingSessionCamera) {
      try { engine.setSessionCamera(this.pendingSessionCamera); }
      catch { refusedCamera = this.pendingSessionCamera; this.pendingSessionCamera = null; }
    }
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
    this.mounted = true;
    for (const listener of this.sessionCameraListeners) {
      this.sessionCameraBindings.set(listener, engine.subscribeSessionCamera(listener));
    }
    for (const listener of this.drawableListeners) this.drawableBindings.set(listener, engine.subscribeDrawable(listener));
    if (refusedCamera) for (const listener of this.cameraFailureListeners) listener(structuredClone(refusedCamera));
  }

  setBackgroundColor(cssColor: string): void {
    this.backgroundColor = cssColor;
    this.engine?.setBackgroundColor(cssColor);
  }

  async syncStructures(structures: ViewerStructure[]): Promise<void> {
    const identities = new Set(structures.flatMap(source => source.settings.surface_objects.map(surface =>
      surfaceIdentityKey({ entryId: source.entryId, surfaceId: surface.id }))));
    for (const key of this.pendingSurfacePreviews.keys()) if (!identities.has(key)) this.pendingSurfacePreviews.delete(key);
    const engine = this.engine;
    await engine?.syncStructures(structures);
    if (!engine || this.disposed || engine !== this.engine) return;
    const previews = [...this.pendingSurfacePreviews.values()]; this.pendingSurfacePreviews.clear();
    await Promise.all(previews.map(({ identity, appearance }) => engine.previewSurfaceAppearance(identity, appearance)));
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

  prepareCoordinatePreview(signal: AbortSignal): Promise<void> {
    return this.engine?.prepareCoordinatePreview?.(signal) ?? Promise.resolve();
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

  getSessionCamera(): SessionCamera | null {
    return this.engine?.getSessionCamera() ?? (this.pendingSessionCamera ? structuredClone(this.pendingSessionCamera) : null);
  }

  setSessionCamera(value: SessionCamera): void {
    const camera = parseSessionCamera(value);
    if (!camera) throw new Error("The saved camera pose is invalid.");
    if (this.disposed) return;
    this.engine?.setSessionCamera(camera);
    this.pendingSessionCamera = camera;
  }

  subscribeSessionCamera(listener: (camera: SessionCamera) => void): () => void {
    this.sessionCameraListeners.add(listener);
    if (this.mounted && this.engine) this.sessionCameraBindings.set(listener, this.engine.subscribeSessionCamera(listener));
    return () => {
      this.sessionCameraListeners.delete(listener);
      this.sessionCameraBindings.get(listener)?.();
      this.sessionCameraBindings.delete(listener);
    };
  }

  subscribeSessionCameraFailure(listener: (camera: SessionCamera) => void): () => void {
    this.cameraFailureListeners.add(listener);
    return () => this.cameraFailureListeners.delete(listener);
  }

  subscribeDrawable(listener: (drawable: boolean) => void): () => void {
    this.drawableListeners.add(listener);
    if (this.mounted && this.engine) this.drawableBindings.set(listener, this.engine.subscribeDrawable(listener));
    return () => { this.drawableListeners.delete(listener); this.drawableBindings.get(listener)?.(); this.drawableBindings.delete(listener); };
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
  previewSurfaceAppearance(identity: SurfaceIdentity, appearance: SurfaceAppearance | null): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const key = surfaceIdentityKey(identity);
    if (this.engine && this.mounted) {
      this.pendingSurfacePreviews.delete(key);
      return this.engine.previewSurfaceAppearance(identity, appearance);
    }
    if (appearance) this.pendingSurfacePreviews.set(key, { identity: { ...identity }, appearance: { ...appearance } });
    else this.pendingSurfacePreviews.delete(key);
    return Promise.resolve();
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
    this.mounted = false;
    this.pendingSurfacePreviews.clear();
    for (const unsubscribe of this.engineUnsubscribers) unsubscribe();
    this.engineUnsubscribers = [];
    this.selectionListeners.clear();
    this.cameraListeners.clear();
    for (const release of this.sessionCameraBindings.values()) release();
    this.sessionCameraBindings.clear(); this.sessionCameraListeners.clear(); this.pendingSessionCamera = null;
    for (const release of this.drawableBindings.values()) release();
    this.drawableBindings.clear(); this.drawableListeners.clear(); this.cameraFailureListeners.clear();
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
