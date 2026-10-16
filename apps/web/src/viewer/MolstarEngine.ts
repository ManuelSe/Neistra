import { createModelPreviewRepresentation, modelPreviewColor } from "./modelPreviewGeometry";
import type { ModelPreview } from "../api/types";
import { componentAtomIds } from "../selection/components";
import type { InteractionRecord } from "../interactions/types";
import { createInteractionRepresentation } from "./interactionGeometry";
import { filterInteractions } from "../interactions/filter";
import { createPocketCrop, isolatePocketSurface } from "./surface/pocket";
import { surfaceWireframe } from "./surface/wireframe";
import { SurfaceRuntime, type SurfaceStatus } from "./surface/runtime";
import { SurfaceVisualRegistry, type SurfaceIdentity } from "./surface/objects";
import { attachSurfaceGeometry, detachSurfaceGeometry, SelectionSurfaceProvider, SelectionSurfaceWireframeProvider, attachSurfaceWireframe, surfaceInput } from "./surface/visual";
import { SURFACE_PROFILE, surfaceKey, type SurfaceChannel, type SurfaceGeometry } from "./surface/protocol";
import { isHydrogen } from "molstar/lib/mol-repr/structure/visual/util/common";
import { OrderedSet } from "molstar/lib/mol-data/int";
import { Loci } from "molstar/lib/mol-model/loci";
import {
  StructureElement,
  Unit,
  type Model,
  type Structure,
} from "molstar/lib/mol-model/structure";
import {
  Time,
  type Frame,
} from "molstar/lib/mol-model/structure/coordinates/coordinates";
import { Color } from "molstar/lib/mol-util/color";
import type { UnitIndex } from "molstar/lib/mol-model/structure/structure/element/util";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";
import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { StateTransforms } from "molstar/lib/mol-plugin-state/transforms";
import type {
  AtomReference,
  CameraState,
  ColorScheme,
  CoordinatePatch,
  Point3D,
  SelectionGranularity,
} from "../api/types";
import type {
  MolecularViewer,
  MovementInteraction,
  ViewerSelectionEvent,
  ViewerStructure,
  ViewerMeasurement,
} from "./MolecularViewer";
import {
  isPrimarySelectionActivation,
  selectionModeForModifiers,
  shouldClearSelectionForEmptyPick,
  withCameraNeutralPrimarySelection,
} from "./interaction";
import { selectionColorLayers } from "./selectionColors";
import { representationLayers, visibleRepresentationAtomIds } from "./representationProjection";
import { THEME_TOKENS } from "../theme";
import type { MovementView } from "../coordinates/interactiveTransform";
import { Binding } from "molstar/lib/mol-util/binding";
import type { Canvas3DAttribs, Canvas3DProps } from "molstar/lib/mol-canvas3d/canvas3d";
import { observeViewerAttribution } from "./domPresentation";
import { authoredBondInput, AuthoredModelBonds } from "./authoredBonds";
import {
  hydrogenDisplayMode,
  molstarRepresentationProfile,
} from "./settings";

// Small mesh spheres reuse the ordinary mesh shader instead of compiling a new
// sphere-impostor pipeline on the first movement of a cartoon/surface-only view.
const movementCueParams = { sizeFactor: 0.3, tryUseImpostor: false, detail: 0 };

interface LoadedStructure {
  entryId: string;
  structure: Structure;
  atomIds: number[];
  coordinateRef: string;
  structureRef: string;
  baseCoordinates: Map<number, Point3D>;
}

export class MolstarEngine implements MolecularViewer {
  private stopAttributionObserver: (() => void) | undefined;
  private plugin: PluginUIContext | undefined;
  private backgroundColor: string = THEME_TOKENS.light["viewer-background"];
  // Each caller observes its rejection; later restoration commands must still run.
  private syncQueue: Promise<void> = Promise.resolve();
  private generation = 0;
  private boundGeneration = 0;
  private pickingGranularity: SelectionGranularity = "atom";
  private pendingSelection: AtomReference[] = [];
  private loaded = new Map<string, LoadedStructure>();
  private models = new Map<Model, { entryId: string; atomIds: number[] }>();
  private listeners = new Set<(event: ViewerSelectionEvent) => void>();
  private cameraListeners = new Set<(camera: CameraState) => void>();
  private retainedCamera: CameraState | null = null;
  private movementInteraction: MovementInteraction = "inactive";
  private stopInputBoundary: (() => void) | undefined;
  private heldPointers = new Set<number>();
  private ignoredPointers = new Set<number>();
  private ignoredMouseRelease = false;
  private movementCamera: CameraState | null = null;
  private movementBindings: Canvas3DAttribs["trackball"] | null = null;
  private movementTrackball: Canvas3DProps["trackball"] | null = null;
  private mountTarget: HTMLElement | null = null;
  private rebuilding = false;
  private hasScene = false;
  private clickSubscription: { unsubscribe(): void } | undefined;
  private cameraSubscription: { unsubscribe(): void } | undefined;
  private measurementRefs: string[] = [];
  private labelRefs: string[] = [];
  private structures: ViewerStructure[] = [];
  private pocketPreviewEntries = new Set<string>();
  private coordinatePreviews = new Map<string, Map<number, Point3D>>();
  private measurements: ViewerMeasurement[] = [];
  private interactions: InteractionRecord[] = [];
  private modelPreview: ModelPreview | null = null;
  private modelPreviewRepresentation = createModelPreviewRepresentation(() => modelPreviewColor(this.backgroundColor));
  private interactionRepresentation = createInteractionRepresentation();
  private nonpolarHydrogenIds = new Map<string, Set<number>>();
  private isolation: AtomReference[] | null = null;
  private surfaces = new SurfaceRuntime();
  private surfaceVisuals = new SurfaceVisualRegistry();
  private surfaceSourceRevisions = new WeakMap<ViewerStructure["normalized"], number>();
  private nextSurfaceSourceRevision = 0;
  private surfaceMeshEntries = new Set<string>();
  private surfaceRefs = new Map<string, string>();
  private inheritedSurfaceRefs = new Map<string, string[]>();
  private movementCueRefs = new Map<string, string>();
  private renderedAtomReferences = new Map<string, AtomReference[]>();
  private surfaceRenderedAtoms = new Map<string, AtomReference[]>();
  private previewRenderedAtoms = new Map<string, AtomReference[]>();
  private previewTargetIds = new Map<string, Set<number>>();
  private surfaceBindings = new Map<string, { controller: AbortController; unregister?: () => void }>();

  async mount(target: HTMLElement): Promise<void> {
    const defaultSpec = DefaultPluginUISpec();
    const plugin = await createPluginUI({
      target,
      render: renderReact18,
      spec: {
        ...defaultSpec,
        behaviors: withCameraNeutralPrimarySelection(defaultSpec.behaviors, () => this.movementInteraction === "inactive"),
        canvas3d: {
          ...defaultSpec.canvas3d,
          camera: { ...defaultSpec.canvas3d?.camera, manualReset: true },
          renderer: {
            ...defaultSpec.canvas3d?.renderer,
            backgroundColor: Color.fromHexStyle(this.backgroundColor),
          },
          transparentBackground: false,
        },
        layout: {
          initial: {
            isExpanded: false,
            showControls: false,
          },
        },
        components: {
          controls: {
            top: "none",
            left: "none",
            right: "none",
            bottom: "none",
          },
          remoteState: "none",
          disableDragOverlay: true,
        },
      },
    });
    if (!plugin.canvas3d) {
      plugin.dispose();
      throw new Error(
        "WebGL is unavailable. Enable hardware acceleration or use a browser with WebGL support.",
      );
    }
    this.plugin = plugin;
    this.mountTarget = target;
    const inputRoot = target.parentElement ?? target;
    const down = (event: PointerEvent) => {
      if (event.target instanceof Element && (event.target instanceof HTMLCanvasElement
        || event.target.closest(".movement-pointer-surface"))) {
        this.heldPointers.add(event.pointerId);
        if (this.ignoredPointers.size) this.ignoredPointers.add(event.pointerId);
      }
    };
    const up = (event: PointerEvent) => {
      this.heldPointers.delete(event.pointerId);
      const ignored = this.ignoredPointers.delete(event.pointerId);
      // Pointer-up precedes its compatibility mouse-up. Keep that final native
      // click suppressed even when the transaction has already exited.
      if (ignored && event.type === "pointerup" && event.pointerType !== "touch") this.ignoredMouseRelease = true;
    };
    const freshDown = () => {
      // preventDefault on an app-owned pointer can suppress compatibility mouse
      // events entirely. A fresh pointer starts a new sequence, anywhere in UI.
      if (!this.ignoredPointers.size) this.ignoredMouseRelease = false;
    };
    const mouseUp = (event: MouseEvent) => {
      if (!this.ignoredMouseRelease) return;
      this.ignoredMouseRelease = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const blockContinuation = (event: Event) => {
      if (!this.ignoredPointers.size) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const blur = () => { this.heldPointers.clear(); this.ignoredPointers.clear(); this.ignoredMouseRelease = false; };
    inputRoot.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerdown", freshDown, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("mouseup", mouseUp, true);
    target.addEventListener("touchmove", blockContinuation, { capture: true, passive: false });
    target.addEventListener("touchstart", blockContinuation, { capture: true, passive: false });
    target.addEventListener("mousedown", blockContinuation, true);
    window.addEventListener("blur", blur);
    this.stopInputBoundary = () => {
      inputRoot.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerdown", freshDown, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("mouseup", mouseUp, true);
      target.removeEventListener("touchmove", blockContinuation, true);
      target.removeEventListener("touchstart", blockContinuation, true);
      target.removeEventListener("mousedown", blockContinuation, true);
      window.removeEventListener("blur", blur);
      blur();
    };
    plugin.representation.structure.registry.add(SelectionSurfaceProvider);
    plugin.representation.structure.registry.add(SelectionSurfaceWireframeProvider);
    this.stopAttributionObserver = observeViewerAttribution(target);
    this.setBackgroundColor(this.backgroundColor);
    this.clickSubscription = plugin.behaviors.interaction.click.subscribe(
      ({ current, button, modifiers }) => {
        if (this.boundGeneration !== this.generation || this.rebuilding || this.movementInteraction !== "inactive" || !isPrimarySelectionActivation(button)) return;
        const mode = selectionModeForModifiers(modifiers);
        if (mode === "replace" && this.surfaceVisuals.pick(current.repr)) {
          plugin.canvas3d?.requestDraw();
          return;
        }
        if (Loci.isEmpty(current.loci)) {
          if (
            shouldClearSelectionForEmptyPick(
              mode,
              this.pendingSelection.length > 0,
            )
          ) {
            this.pendingSelection = [];
            this.emit({
              atoms: [],
              granularity: this.pickingGranularity,
              mode: "replace",
            });
          }
          return;
        }
        const granular = Loci.normalize(
          current.loci,
          this.pickingGranularity === "atom"
            ? "element"
            : this.pickingGranularity,
          true,
        );
        const normalized = Loci.normalize(granular, "element", true);
        if (!StructureElement.Loci.is(normalized)) return;
        const references: AtomReference[] = [];
        for (const element of normalized.elements) {
          if (!Unit.isAtomic(element.unit)) continue;
          const mapping = this.models.get(element.unit.model);
          if (!mapping) continue;
          OrderedSet.forEach(element.indices, (unitIndex) => {
            const modelElement = element.unit.elements[unitIndex];
            const sourceIndex =
              element.unit.model.atomicHierarchy.atomSourceIndex.value(modelElement);
            const atomId = mapping.atomIds[sourceIndex];
            if (atomId !== undefined) {
              references.push({
                structure_id: mapping.entryId,
                atom_id: atomId,
              });
            }
          });
        }
        this.emit({
          atoms: references,
          granularity: this.pickingGranularity,
          mode,
        });
      },
    );
    this.cameraSubscription = plugin.canvas3d.camera.changed.subscribe(() => {
      const snapshot = plugin.canvas3d!.camera.getSnapshot();
      if (this.movementCamera && ["position", "target", "up"].some(key =>
        (snapshot[key as "position"] as number[]).some((value, axis) => value !== this.movementCamera![key as "position"][axis]))) {
        this.setCamera(this.movementCamera);
      }
      const camera = this.getCamera();
      if (camera) for (const listener of this.cameraListeners) listener(camera);
    });
  }

  setBackgroundColor(cssColor: string): void {
    this.backgroundColor = cssColor;
    if (this.modelPreview) void this.setModelPreview(this.modelPreview).catch(() => undefined);
    this.plugin?.canvas3d?.setProps({
      renderer: { backgroundColor: Color.fromHexStyle(cssColor) },
      transparentBackground: false,
    });
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    // The generation invalidates retired visual hits immediately, even if the
    // serialized rebuild waits. Camera navigation retains its existing owner.
    this.structures = structures;
    this.surfaces.retain(new Set(structures.flatMap(item => item.settings.surface_objects
      .map(surface => surfaceKey(item.entryId, surface.source.kind, surface.id)))));
    for (const binding of this.surfaceBindings.values()) { binding.controller.abort(); binding.unregister?.(); }
    this.surfaceBindings.clear();
    this.surfaceVisuals.clearVisuals();
    this.inheritedSurfaceRefs.clear();
    this.movementCueRefs.clear();
    this.renderedAtomReferences.clear();
    this.surfaceRenderedAtoms.clear();
    const generation = ++this.generation;
    this.syncQueue = this.syncQueue.catch(() => undefined).then(async () => {
      const plugin = this.plugin;
      if (!plugin || generation !== this.generation) return;
      const camera = this.getCamera();
      this.rebuilding = true;
      try {
        await plugin.clear();
        this.surfaceRefs.clear();
        this.surfaceMeshEntries.clear();
        this.updateSurfacePickingThreshold();
        this.measurementRefs = [];
        this.labelRefs = [];
        this.loaded.clear();
        this.nonpolarHydrogenIds.clear();
        this.models.clear();
        for (const structure of structures) {
          if (generation !== this.generation) return;
          if (structure.normalized.atoms.length === 0) continue;
          await this.loadStructure(structure);
          await this.addStructureLabels(structure);
        }
        this.applySelection();
        await this.applyMeasurements();
        await this.applyInteractions();
        await this.applyModelPreview();
        this.commitScene(camera);
        this.boundGeneration = generation;
      } finally {
        this.rebuilding = false;
      }
    });
    return this.syncQueue;
  }

  replaceStructure(structure: ViewerStructure): Promise<void> {
    this.structures = this.structures.map((current) =>
      current.entryId === structure.entryId ? structure : current,
    );
    if (!this.structures.some((current) => current.entryId === structure.entryId)) {
      this.structures.push(structure);
    }
    return this.syncStructures(this.structures);
  }

  setSelection(atoms: AtomReference[]): void {
    this.pendingSelection = atoms;
    this.applySelection();
  }

  applyCoordinatePatch(
    patch: CoordinatePatch,
    mode: "preview" | "commit",
  ): Promise<void> {
    if (mode === "preview") this.plugin?.canvas3d?.remove(this.interactionRepresentation);
    this.syncQueue = this.syncQueue.catch(() => undefined).then(async () => {
      if (!this.plugin) return;
      const loaded = this.loaded.get(patch.entry_id);
      if (mode === "preview" && !this.coordinatePreviews.has(patch.entry_id)) {
        this.previewRenderedAtoms.set(patch.entry_id, this.getRenderedAtomReferences().filter(atom => atom.structure_id === patch.entry_id));
        this.previewTargetIds.set(patch.entry_id, new Set(patch.atom_ids));
      }
      if (patch.atom_ids.length !== patch.coordinates.length) throw new Error("Invalid coordinate patch.");
      // A current artifact-keyed application sync may already contain this commit.
      // Do not invalidate geometry again (or create a spurious seed revision).
      if (mode === "commit" && !this.pocketPreviewEntries.has(patch.entry_id) &&
        !this.coordinatePreviews.has(patch.entry_id)) {
        const changed = new Map(patch.atom_ids.map((id, index) => [id, patch.coordinates[index]]));
        const differs = (a: Point3D | undefined, b: Point3D) => !a || a.some((value, axis) => value !== b[axis]);
        const moleculeChanged = loaded && patch.atom_ids.some((id, index) => differs(loaded.baseCoordinates.get(id), patch.coordinates[index]));
        const seedChanged = this.pocketSurfaces().some(({ pocket }) => pocket.seeds.some(seed =>
          seed.reference.structure_id === patch.entry_id && changed.has(seed.reference.atom_id) &&
          differs(seed.coordinates, changed.get(seed.reference.atom_id)!)));
        if (!moleculeChanged && !seedChanged) return;
      }

      if (mode === "preview") this.pocketPreviewEntries.add(patch.entry_id);
      else this.pocketPreviewEntries.delete(patch.entry_id);
      const dependents = this.pocketSurfaces().filter(({ entryId, pocket }) => entryId === patch.entry_id ||
        pocket.seeds.some(seed => seed.reference.structure_id === patch.entry_id));
      for (const dependent of dependents) {
        await this.detachSurface(dependent.entryId, dependent.surfaceId);
        this.surfaces.remove(dependent.entryId, "pocket", dependent.surfaceId);
      }
      if (mode === "commit") {
        const changed = new Map(patch.atom_ids.map((id, index) => [id, patch.coordinates[index]]));
        this.structures = this.structures.map(source => ({ ...source, pockets: Object.fromEntries(
          Object.entries(source.pockets ?? {}).map(([id, pocket]) => [id, { ...pocket,
            seeds: pocket.seeds.map(seed => seed.reference.structure_id === patch.entry_id && changed.has(seed.reference.atom_id)
              ? { ...seed, coordinates: [...changed.get(seed.reference.atom_id)!] as Point3D } : seed),
            dependencyKey: dependents.some(item => item.entryId === source.entryId && item.surfaceId === id)
              ? JSON.stringify([pocket.dependencyKey, patch.entry_id, patch.artifact_id]) : pocket.dependencyKey,
          }])
        ) }));
      }
      if (!loaded) {
        if (mode === "commit") {
          this.previewRenderedAtoms.delete(patch.entry_id);
          this.previewTargetIds.delete(patch.entry_id);
        }
        if (mode === "commit") for (const item of dependents) await this.prepareSurface(item.entryId, item.surfaceId);
        return;
      }
      if (
        patch.atom_ids.length !== patch.coordinates.length ||
        patch.atom_ids.some((atomId) => !loaded.baseCoordinates.has(atomId))
      ) {
        throw new Error("The coordinate patch does not match the loaded structure.");
      }
      const coordinates = new Map(
        [...loaded.baseCoordinates].map(([atomId, point]) => [
          atomId,
          [...point] as Point3D,
        ]),
      );
      patch.atom_ids.forEach((atomId, index) => {
        coordinates.set(atomId, [...patch.coordinates[index]] as Point3D);
      });
      await this.detachSurface(patch.entry_id);
      for (const surface of this.structures.find(item => item.entryId === patch.entry_id)?.settings.surface_objects ?? []) {
        if (surface.source.kind !== "entry") this.surfaces.remove(patch.entry_id, surface.source.kind, surface.id);
      }
      const firstPreview = mode === "preview" && !this.coordinatePreviews.has(patch.entry_id);
      const hadPreview = this.coordinatePreviews.has(patch.entry_id);
      if (firstPreview) {
        const refs = this.inheritedSurfaceRefs.get(patch.entry_id) ?? [];
        for (const ref of refs) await this.plugin.state.data.build().delete(ref).commit();
        this.inheritedSurfaceRefs.delete(patch.entry_id);
        for (const surface of this.structures.find(item => item.entryId === patch.entry_id)?.settings.surface_objects ?? []) {
          if (surface.source.kind !== "entry") continue;
          const key = surfaceKey(patch.entry_id, "entry", surface.id);
          const binding = this.surfaceBindings.get(key);
          binding?.controller.abort(); binding?.unregister?.(); this.surfaceBindings.delete(key);
          this.surfaces.reportNative(patch.entry_id, surface.id, surface.name, "hidden", "Paused during coordinate preview");
        }
      }
      if (mode === "preview") this.coordinatePreviews.set(patch.entry_id, coordinates);
      else this.coordinatePreviews.delete(patch.entry_id);
      if (mode === "commit") {
        loaded.baseCoordinates = coordinates;
        // Local visibility/isolation rebuilds must use the latest authoritative patch.
        // Clone the disposable input; never mutate the application's query objects.
        this.structures = this.structures.map((source) => source.entryId !== patch.entry_id ? source : {
          ...source, normalized: { ...source.normalized, atoms: source.normalized.atoms.map((atom) => ({
            ...atom, coordinates: coordinates.get(atom.id) ?? atom.coordinates,
          })) },
        });
      }
      await this.updateCoordinates(loaded, coordinates);
      const source = this.structures.find(item => item.entryId === patch.entry_id);
      if (firstPreview && source) await this.addMovementCue(source, loaded);
      if (mode === "commit") {
        if (hadPreview && source) await this.restorePreviewRepresentations(source, loaded);
        await this.prepareSurfaces(patch.entry_id);
        for (const item of dependents) if (item.entryId !== patch.entry_id) await this.prepareSurface(item.entryId, item.surfaceId);
      }
    });
    return this.syncQueue;
  }

  clearCoordinatePreview(entryId: string): Promise<void> {
    this.syncQueue = this.syncQueue.catch(() => undefined).then(async () => {
      this.coordinatePreviews.delete(entryId);
      this.pocketPreviewEntries.delete(entryId);
      const loaded = this.loaded.get(entryId);
      if (!loaded) {
        this.previewRenderedAtoms.delete(entryId);
        this.previewTargetIds.delete(entryId);
      }
      if (loaded) {
        await this.detachSurface(entryId);
        await this.updateCoordinates(loaded, loaded.baseCoordinates);
        const source = this.structures.find(item => item.entryId === entryId);
        if (source) await this.restorePreviewRepresentations(source, loaded);
        await this.prepareSurfaces(entryId);
      }
      for (const item of this.pocketSurfaces()) {
        if (item.entryId !== entryId && item.pocket.seeds.some(seed => seed.reference.structure_id === entryId)) {
          await this.detachSurface(item.entryId, item.surfaceId);
          await this.prepareSurface(item.entryId, item.surfaceId);
        }
      }
      await this.applyInteractions();
    });
    return this.syncQueue;
  }

  setPickingGranularity(granularity: SelectionGranularity): void {
    this.pickingGranularity = granularity;
  }

  setMeasurements(measurements: ViewerMeasurement[]): Promise<void> {
    // Camera notifications can rerender the owner without changing measurements.
    // Rebuilding those same objects would restore the camera and repeat the cycle.
    if (JSON.stringify(measurements) === JSON.stringify(this.measurements)) return this.syncQueue;
    this.measurements = measurements;
    this.syncQueue = this.syncQueue.catch(() => undefined).then(async () => {
      const camera = this.getCamera();
      await this.applyMeasurements();
      this.commitScene(camera);
    });
    return this.syncQueue;
  }

  setModelPreview(preview: ModelPreview | null): Promise<void> {
    this.modelPreview = preview;
    if (!preview) this.plugin?.canvas3d?.remove(this.modelPreviewRepresentation);
    this.syncQueue = this.syncQueue.catch(() => undefined).then(() => this.applyModelPreview());
    return this.syncQueue;
  }

  private async applyModelPreview(): Promise<void> {
    const canvas = this.plugin?.canvas3d;
    const preview = this.modelPreview;
    if (!canvas) return;
    if (!preview) { canvas.remove(this.modelPreviewRepresentation); return; }
    await this.modelPreviewRepresentation.createOrUpdate({ alpha: 0.85, ignoreLight: true }, preview).run();
    if (this.modelPreview !== preview) return;
    this.modelPreviewRepresentation.setState({ pickable: false, markerActions: 0 });
    canvas.add(this.modelPreviewRepresentation);
  }

  setInteractions(interactions: InteractionRecord[]): Promise<void> {
    this.interactions = interactions;
    // Clear synchronously before queued coordinate operations can reach the canvas.
    if (!interactions.length) this.plugin?.canvas3d?.remove(this.interactionRepresentation);
    this.syncQueue = this.syncQueue.catch(() => undefined).then(() => this.applyInteractions());
    return this.syncQueue;
  }

  private async applyInteractions(): Promise<void> {
    const canvas = this.plugin?.canvas3d;
    if (!canvas) return;
    if (!this.interactions.length || this.coordinatePreviews.size) {
      canvas.remove(this.interactionRepresentation);
      return;
    }
    const types = [...new Set(this.interactions.map(record => record.kind))];
    const visible = filterInteractions(this.interactions, { types, intra: true, inter: true }, this.structures, this.isolation, this.nonpolarHydrogenIds);
    if (!visible.length) { canvas.remove(this.interactionRepresentation); return; }
    await this.interactionRepresentation.createOrUpdate({ sizeFactor: 2.5 }, visible).run();
    this.interactionRepresentation.setState({ pickable: false, markerActions: 0 });
    canvas.add(this.interactionRepresentation);
  }

  async setIsolation(atoms: AtomReference[] | null): Promise<void> {
    this.isolation = atoms;
    await this.syncQueue.catch(() => undefined);
    await this.syncStructures(this.structures);
  }

  getCamera(): CameraState | null {
    const snapshot = this.plugin?.canvas3d?.camera.getSnapshot();
    // Clearing a disposable scene can briefly yield radius zero. Never publish
    // that reset as application camera state or carry it into the next rebuild.
    if (this.rebuilding || !this.hasScene || !snapshot || snapshot.radius <= 0) return this.retainedCamera;
    this.retainedCamera = {
      mode: snapshot.mode,
      position: [...snapshot.position] as CameraState["position"],
      target: [...snapshot.target] as CameraState["target"],
      up: [...snapshot.up] as CameraState["up"],
      radius: snapshot.radius,
    };
    return this.retainedCamera;
  }

  getMovementView(): MovementView | null {
    const camera = this.getCamera();
    const snapshot = this.plugin?.canvas3d?.camera.getSnapshot();
    const height = this.mountTarget?.getBoundingClientRect().height ?? 0;
    return camera && snapshot && height > 0 ? { camera, height, fov: snapshot.fov } : null;
  }
  getRenderedAtomReferences(): AtomReference[] {
    const references = [...this.renderedAtomReferences.values(), ...this.surfaceRenderedAtoms.values()].flat();
    return [...new Map(references.map(atom => [`${atom.structure_id}:${atom.atom_id}`, atom])).values()];
  }

  setMovementMode(interaction: MovementInteraction): void {
    const canvas = this.plugin?.canvas3d;
    if (!canvas) return;
    if (interaction === this.movementInteraction) {
      if (interaction !== "inactive") {
        this.releaseNavigationKeys();
        this.endNavigationGesture();
        if (interaction === "transform") this.movementCamera = this.getCamera();
      }
      return;
    }
    const previous = this.movementInteraction;
    if (previous === "inactive") {
      this.movementBindings = structuredClone(canvas.attribs.trackball);
      this.movementTrackball = structuredClone(canvas.props.trackball);
    }
    // Suppress selection/focus before terminating native input. Public DOM end
    // events reset Mol*'s observer; no private controls or camera implementation.
    this.movementInteraction = interaction === "inactive" ? previous : interaction;
    this.releaseNavigationKeys();
    this.endNavigationGesture();
    this.movementCamera = interaction === "transform" ? this.getCamera() : null;
    this.movementInteraction = interaction;
    if (interaction === "inactive") {
      if (this.movementBindings) canvas.setAttribs({ trackball: this.movementBindings });
      if (this.movementTrackball) canvas.setProps({ trackball: this.movementTrackball });
      this.movementBindings = null;
      this.movementTrackball = null;
      return;
    }
    const bindings = interaction === "camera" ? this.movementBindings!.bindings
      : Object.fromEntries(Object.keys(this.movementBindings!.bindings).map(key => [key, Binding.Empty])) as Canvas3DAttribs["trackball"]["bindings"];
    canvas.setAttribs({ trackball: { bindings } });
    canvas.setProps({ trackball: { staticMoving: true, animate: { name: "off", params: {} } } });
  }

  private endNavigationGesture() {
    if (!this.heldPointers.size) return;
    this.heldPointers.forEach(pointer => this.ignoredPointers.add(pointer));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: -100000, clientY: -100000, buttons: 0 }));
    this.mountTarget?.querySelector("canvas")?.dispatchEvent(new Event("touchend", { bubbles: true }));
  }

  private releaseNavigationKeys() {
    // Release while current native bindings still match, including camera exit.
    // Mol* accepts keyboard events from body/canvas; window targets are ignored.
    const bindings = this.plugin?.canvas3d?.attribs.trackball.bindings;
    if (!bindings) return;
    for (const binding of Object.values(bindings)) {
      for (const trigger of binding.triggers) {
        if (!trigger.code) continue;
        document.body.dispatchEvent(new KeyboardEvent("keyup", {
          bubbles: true,
          code: trigger.code,
          ctrlKey: trigger.modifiers?.control, shiftKey: trigger.modifiers?.shift,
          altKey: trigger.modifiers?.alt, metaKey: trigger.modifiers?.meta,
        }));
      }
    }
  }

  setCamera(camera: CameraState): void {
    this.retainedCamera = camera;
    this.plugin?.canvas3d?.camera.setState({
      mode: camera.mode,
      position: Vec3.create(...camera.position),
      target: Vec3.create(...camera.target),
      up: Vec3.create(...camera.up),
      radius: camera.radius,
      // A temporarily empty scene must not clamp the application radius to 0.01.
      radiusMax: Math.max(camera.radius, (this.plugin?.canvas3d?.boundingSphere.radius ?? 0)
        * (this.plugin?.canvas3d?.props.sceneRadiusFactor ?? 1)),
    });
  }

  private commitScene(camera: CameraState | null) {
    const canvas = this.plugin?.canvas3d;
    canvas?.commit(true);
    this.hasScene = (canvas?.reprCount.value ?? 0) > 0;
    if (this.movementCamera) this.setCamera(this.movementCamera);
    else if (camera) this.setCamera(camera);
    else if (this.hasScene) canvas?.requestCameraReset({ durationMs: 0 });
  }

  setCameraMode(mode: CameraState["mode"]): void {
    if (this.movementInteraction !== "inactive") return;
    this.plugin?.canvas3d?.camera.setState({ mode });
  }

  zoom(factor: number): void {
    const camera = this.plugin?.canvas3d?.camera;
    if (!camera) return;
    const snapshot = camera.getSnapshot();
    const position = snapshot.position.map(
      (value, index) =>
        snapshot.target[index] + (value - snapshot.target[index]) * factor,
    ) as CameraState["position"];
    if (this.movementCamera) this.movementCamera = { ...this.movementCamera, position };
    camera.setState({ position: Vec3.create(...position) });
  }

  focusAtoms(atoms: AtomReference[]): void {
    if (this.movementInteraction !== "inactive") return;
    const loci = this.lociFor(atoms);
    if (loci) this.plugin?.managers.camera.focusLoci(loci);
  }

  fitVisible(): void {
    if (this.movementInteraction !== "inactive") return;
    this.plugin?.canvas3d?.requestCameraReset();
  }

  subscribeCamera(listener: (camera: CameraState) => void): () => void {
    this.cameraListeners.add(listener);
    const camera = this.getCamera();
    if (camera) listener(camera);
    return () => this.cameraListeners.delete(listener);
  }

  subscribeSelection(listener: (event: ViewerSelectionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeSurfaces(listener: (statuses: SurfaceStatus[]) => void): () => void {
    return this.surfaces.subscribe(listener);
  }

  subscribeSurfaceSelection(listener: (surface: SurfaceIdentity) => void): () => void {
    return this.surfaceVisuals.subscribe(listener);
  }
  setActiveSurface(surface: SurfaceIdentity | null): void {
    this.surfaceVisuals.select(surface);
    this.plugin?.canvas3d?.requestDraw();
  }

  cancelSurface(entryId: string, channel: SurfaceChannel = "fragment", surfaceId: string = channel): void {
    this.surfaces.cancel(entryId, channel, surfaceId);
  }

  retrySurface(entryId: string, channel: SurfaceChannel = "fragment", surfaceId: string = channel): void {
    this.surfaces.remove(entryId, channel, surfaceId);
    if (channel === "entry") { void this.syncStructures(this.structures); return; }
    this.syncQueue = this.syncQueue.catch(() => undefined).then(async () => {
      await this.detachSurface(entryId, surfaceId);
      await this.prepareSurface(entryId, surfaceId);
    });
  }

  private updateSurfacePickingThreshold() {
    const alphas = this.structures.flatMap(source => source.settings.surface_objects
      .filter(surface => {
        const key = surfaceKey(source.entryId, surface.source.kind, surface.id);
        const rendered = surface.source.kind === "entry" ? Boolean(this.surfaceBindings.get(key)?.unregister) : this.surfaceMeshEntries.has(key);
        return rendered && surface.visible && surface.appearance.opacity > 0;
      }).map(surface => surface.appearance.opacity));
    this.plugin?.canvas3d?.setProps({ renderer: { pickingAlphaThreshold: Math.min(0.5, ...alphas) } });
  }

  resize(): void {
    this.plugin?.layout.events.updated.next(undefined);
  }

  dispose(): void {
    this.modelPreview = null;
    this.plugin?.canvas3d?.remove(this.modelPreviewRepresentation);
    this.modelPreviewRepresentation.destroy();
    this.plugin?.canvas3d?.remove(this.interactionRepresentation);
    this.interactionRepresentation.destroy();
    this.setMovementMode("inactive");
    this.stopInputBoundary?.();
    this.stopInputBoundary = undefined;
    this.stopAttributionObserver?.();
    this.stopAttributionObserver = undefined;
    this.generation += 1;
    this.surfaces.dispose();
    this.surfaceVisuals.dispose();
    for (const binding of this.surfaceBindings.values()) { binding.controller.abort(); binding.unregister?.(); }
    this.surfaceBindings.clear();
    this.surfaceRefs.clear();
    this.surfaceMeshEntries.clear();
    this.inheritedSurfaceRefs.clear();
    this.movementCueRefs.clear();
    this.renderedAtomReferences.clear();
    this.surfaceRenderedAtoms.clear();
    this.previewRenderedAtoms.clear();
    this.previewTargetIds.clear();
    this.mountTarget = null;
    this.clickSubscription?.unsubscribe();
    this.cameraSubscription?.unsubscribe();
    this.clickSubscription = undefined;
    this.listeners.clear();
    this.cameraListeners.clear();
    this.loaded.clear();
    this.models.clear();
    this.coordinatePreviews.clear();
    this.pocketPreviewEntries.clear();
    this.plugin?.dispose();
    this.plugin = undefined;
  }

  private emit(event: ViewerSelectionEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private coordinateFrame(coordinates: Point3D[]): Frame {
    return {
      elementCount: coordinates.length,
      time: Time(0, "step"),
      x: Float64Array.from(coordinates, (point) => point[0]),
      y: Float64Array.from(coordinates, (point) => point[1]),
      z: Float64Array.from(coordinates, (point) => point[2]),
      xyzOrdering: { isIdentity: true },
    };
  }

  private async updateCoordinates(
    loaded: LoadedStructure,
    coordinates: Map<number, Point3D>,
  ): Promise<void> {
    const plugin = this.plugin;
    if (!plugin) return;
    const camera = this.getCamera();
    const ordered = loaded.atomIds.map((atomId) => {
      const point = coordinates.get(atomId);
      if (!point) throw new Error(`Coordinates for atom ${atomId} are unavailable.`);
      return point;
    });
    await plugin.state.data
      .build()
      .to(loaded.coordinateRef)
      .update({
        frameIndex: 0,
        frameCount: 1,
        atomicCoordinateFrame: this.coordinateFrame(ordered),
      })
      .commit({ revertOnError: true });
    const refreshed = plugin.state.data.cells.get(loaded.structureRef)?.obj
      ?.data as Structure | undefined;
    if (!refreshed) {
      throw new Error("Mol* could not refresh the coordinate model.");
    }
    loaded.structure = refreshed;
    for (const [model, mapping] of this.models) {
      if (mapping.entryId === loaded.entryId) {
        this.models.delete(model);
      }
    }
    this.indexModels(loaded.entryId, refreshed, loaded.atomIds);
    this.applySelection();
    await this.applyMeasurements();
    this.commitScene(camera);
  }

  private async loadStructure(structure: ViewerStructure): Promise<void> {
    const plugin = this.plugin;
    if (!plugin) return;
    const data = await plugin.builders.data.rawData(
      { data: structure.projection.data, label: structure.label },
      { state: { isGhost: true } },
    );
    const trajectory = await plugin.builders.structure.parseTrajectory(
      data,
      structure.projection.format,
    );
    const model = await plugin.builders.structure.createModel(trajectory);
    const modelProperties =
      await plugin.builders.structure.insertModelProperties(model);
    const coordinateModel = await plugin.state.data
      .build()
      .to(modelProperties)
      .apply(StateTransforms.Model.ModelWithCoordinates, {
        frameIndex: 0,
        frameCount: 1,
        atomicCoordinateFrame: this.coordinateFrame(
          structure.normalized.atoms.map((atom) => this.coordinatePreviews.get(structure.entryId)?.get(atom.id) ?? atom.coordinates),
        ),
      })
      .commit({ revertOnError: true });
    const bondInput = authoredBondInput(structure.normalized, structure.projection.format);
    const displayModel = bondInput ? await plugin.state.data.build().to(coordinateModel)
      .apply(AuthoredModelBonds, { input: bondInput }).commit({ revertOnError: true }) : coordinateModel;
    const modelStructure =
      await plugin.builders.structure.createStructure(displayModel);
    const structureProperties =
      await plugin.builders.structure.insertStructureProperties(modelStructure);
    const molstarStructure = structureProperties.obj?.data;
    if (!molstarStructure) {
      throw new Error(`Mol* could not create a structure for ${structure.label}.`);
    }
    this.loaded.set(structure.entryId, {
      entryId: structure.entryId,
      structure: molstarStructure,
      atomIds: structure.atomIds,
      coordinateRef: coordinateModel.ref,
      structureRef: structureProperties.ref,
      baseCoordinates: new Map(
        structure.normalized.atoms.map((atom) => [
          atom.id,
          [...atom.coordinates] as Point3D,
        ]),
      ),
    });
    this.indexModels(structure.entryId, molstarStructure, structure.atomIds);
    await this.addRepresentations(structure, structureProperties.ref, molstarStructure);
    await this.prepareSurfaces(structure.entryId);
  }

  private async addRepresentations(structure: ViewerStructure, structureRef: string, molstarStructure: Structure, onlySurfaces = false): Promise<void> {
    const plugin = this.plugin;
    if (!plugin) return;
    const isolatedIds =
      this.isolation === null
        ? null
        : new Set(
            this.isolation
              .filter((reference) => reference.structure_id === structure.entryId)
              .map((reference) => reference.atom_id),
          );
    const localHydrogens = structure.settings.selection_nonpolar_hydrogens.length > 0;
    const nonpolarHydrogens = new Set<number>();
    // Classify before filtering: a selected O-H must not lose its polar neighbour.
    // Only the disposable Mol* projection owns connectivity-based display polarity.
    if (nonpolarHydrogens) {
      for (const unit of molstarStructure.units) {
        if (!Unit.isAtomic(unit)) continue;
        for (let index = 0; index < unit.elements.length; index++) {
          const element = unit.elements[index];
          if (isHydrogen(molstarStructure, unit, element, "non-polar")) {
            const source = unit.model.atomicHierarchy.atomSourceIndex.value(element);
            const id = structure.atomIds[source];
            if (id !== undefined) nonpolarHydrogens.add(id);
          }
        }
      }
    }
    this.nonpolarHydrogenIds.set(structure.entryId, nonpolarHydrogens);
    const colorLayers = selectionColorLayers(structure.settings.selection_colors, structure.normalized.atoms);
    const layers = representationLayers(structure, isolatedIds, nonpolarHydrogens);
    for (const surface of structure.settings.surface_objects) if (surface.source.kind === "entry") {
      this.surfaces.reportNative(structure.entryId, surface.id, `${structure.label} · ${surface.name}`, "hidden", "Hidden by display filters");
    }
    if (!onlySurfaces) {
      const hidden = new Set(structure.settings.selection_hidden_atoms);
      const visible = [...new Set(layers.filter(layer => layer.opacity > 0).flatMap(layer => layer.atomIds))].filter(id => !hidden.has(id));
      this.renderedAtomReferences.set(structure.entryId, visible.map(atom_id => ({ structure_id: structure.entryId, atom_id })));
    }
    if (this.coordinatePreviews.has(structure.entryId) && !onlySurfaces) {
      const visible = new Set(this.previewRenderedAtoms.get(structure.entryId)?.map(atom => atom.atom_id) ?? []);
      const hidden = new Set(structure.settings.selection_hidden_atoms);
      layers.push({ id: "movement-preview", style: "space-filling", colorBy: "element", customColor: "#C94F2D", opacity: 1, exactTarget: true,
        atomIds: [...(this.previewTargetIds.get(structure.entryId) ?? [])].filter(id => visible.has(id) && !hidden.has(id)) });
    }
    for (const layer of layers) {
      if (onlySurfaces && layer.style !== "surface") continue;
      if (this.coordinatePreviews.has(structure.entryId) && layer.style === "surface") continue;
      const loci = this.lociFor(
        layer.atomIds.map((atomId) => ({
          structure_id: structure.entryId,
          atom_id: atomId,
        })),
      );
      if (!loci) continue;
      const component = await plugin.builders.structure.tryCreateComponent(
        structureRef,
        {
          type: {
            name: "bundle",
            params: StructureElement.Bundle.fromLoci(loci),
          },
          nullIfEmpty: true,
          label: `${structure.label} ${layer.style}`,
        },
        `${layer.id}-${structure.entryId}`,
      );
      if (!component) continue;
      if (layer.style === "surface") {
        const refs = this.inheritedSurfaceRefs.get(structure.entryId) ?? [];
        refs.push(component.ref);
        this.inheritedSurfaceRefs.set(structure.entryId, refs);
      }
      if (layer.id === "movement-preview") this.movementCueRefs.set(structure.entryId, component.ref);
      const reducedSurface = Boolean(layer.surface && structure.normalized.atoms.length >= 250_000);
      const profile = molstarRepresentationProfile(reducedSurface ? "line" : layer.style, {
        opacity: layer.opacity,
        // The full-structure mask already enforces master and local preferences.
        hydrogenMode: localHydrogens ? "all" : hydrogenDisplayMode(structure.settings.components),
        exactTarget: layer.exactTarget || localHydrogens,
      });
      const surfaceKeyId = layer.surface ? surfaceKey(structure.entryId, "entry", layer.surface.id) : undefined;
      const binding = layer.surface ? { controller: new AbortController(), unregister: undefined as (() => void) | undefined } : undefined;
      if (surfaceKeyId && binding && layer.surface) {
        this.surfaceBindings.set(surfaceKeyId, binding);
        this.surfaces.reportNative(structure.entryId, layer.surface.id, `${structure.label} · ${layer.surface.name}`, "rendering", "Rendering native entry surface");
      }
      const representation = await plugin.builders.structure.representation.addRepresentation(
        component,
        {
          type: profile.type,
          typeParams: layer.id === "movement-preview" ? { ...profile.typeParams, ...movementCueParams }
            : layer.surface && !reducedSurface ? { ...profile.typeParams,
              visuals: [layer.surface.appearance.mode === "mesh" ? "molecular-surface-wireframe" : "molecular-surface-mesh"] } : profile.typeParams,
          color: this.colorTheme(layer.colorBy),
          colorParams:
            layer.colorBy === "custom"
              ? {
                  value: Color(Number.parseInt(layer.customColor.slice(1), 16)),
                }
              : undefined,
        },
        { tag: `molweave-representation-${layer.id}` },
      ).catch(async (error: unknown) => {
        if (!layer.surface) throw error;
        if (binding && this.surfaceBindings.get(surfaceKeyId!) === binding) {
          this.surfaces.reportNative(structure.entryId, layer.surface.id, `${structure.label} · ${layer.surface.name}`,
            "fallback", `${error instanceof Error ? error.message : "Native surface failed."} Definition kept.`);
          binding.unregister?.(); this.surfaceBindings.delete(surfaceKeyId!);
        }
        if (plugin.state.data.cells.has(component.ref)) await plugin.state.data.build().delete(component.ref).commit();
        return undefined;
      });
      if (!representation) continue;
      if (binding && (binding.controller.signal.aborted || this.surfaceBindings.get(surfaceKeyId!) !== binding)) {
        if (plugin.state.data.cells.has(component.ref)) await plugin.state.data.build().delete(component.ref).commit();
        continue;
      }
      // Preserve inherited pick eligibility when the selection surface lowers the canvas threshold.
      representation.obj?.data.repr.setState({ pickable: layer.surface ? layer.opacity > 0 : layer.opacity >= 0.5 });
      if (layer.surface && binding && representation.obj) {
        binding.unregister = this.surfaceVisuals.register(representation.obj.data.repr, { entryId: structure.entryId, surfaceId: layer.surface.id });
        this.surfaces.reportNative(structure.entryId, layer.surface.id, `${structure.label} · ${layer.surface.name}`,
          reducedSurface ? "fallback" : "ready", reducedSurface ? "Large entry uses reduced detail · lines shown" : "Native surface ready");
        this.updateSurfacePickingThreshold();
      }
      const visible = new Set(layer.atomIds);
      const colors = (layer.surface && !layer.surface.appearance.inherit_atom_colors ? [] : colorLayers).flatMap((assignment) => {
        const colorLoci = this.lociFor(assignment.atomIds.filter((id) => visible.has(id))
          .map((atom_id) => ({ structure_id: structure.entryId, atom_id })));
        return colorLoci ? [{
          bundle: StructureElement.Bundle.fromLoci(colorLoci),
          color: assignment.color, clear: false,
        }] : [];
      });
      if (colors.length) {
        await plugin.state.data.build().to(representation)
          .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
            { layers: colors }).commit();
      }
    }
  }

  private async addMovementCue(source: ViewerStructure, loaded: LoadedStructure) {
    const plugin = this.plugin;
    if (!plugin) return;
    const visible = new Set(this.previewRenderedAtoms.get(source.entryId)?.map(atom => atom.atom_id) ?? []);
    const hidden = new Set(source.settings.selection_hidden_atoms);
    const loci = this.lociFor([...(this.previewTargetIds.get(source.entryId) ?? [])]
      .filter(id => visible.has(id) && !hidden.has(id))
      .map(atom_id => ({ structure_id: source.entryId, atom_id })));
    if (!loci) return;
    const component = await plugin.builders.structure.tryCreateComponent(loaded.structureRef, {
      type: { name: "bundle", params: StructureElement.Bundle.fromLoci(loci) }, nullIfEmpty: true, label: "Selected atoms: movement preview",
    }, `movement-preview-${source.entryId}`);
    if (!component) return;
    this.movementCueRefs.set(source.entryId, component.ref);
    await plugin.builders.structure.representation.addRepresentation(component, { type: "spacefill", typeParams: movementCueParams, color: "element-symbol" });
    this.applySelection();
    this.commitScene(this.getCamera());
  }

  private async restorePreviewRepresentations(source: ViewerStructure, loaded: LoadedStructure) {
    const cue = this.movementCueRefs.get(source.entryId);
    this.movementCueRefs.delete(source.entryId);
    this.previewRenderedAtoms.delete(source.entryId);
    this.previewTargetIds.delete(source.entryId);
    if (cue) await this.plugin?.state.data.build().delete(cue).commit();
    if (!this.inheritedSurfaceRefs.has(source.entryId)) await this.addRepresentations(source, loaded.structureRef, loaded.structure, true);
    this.commitScene(this.getCamera());
  }

  private pocketSurfaces() {
    return this.structures.flatMap(source => Object.entries(source.pockets ?? {}).map(([surfaceId, pocket]) => ({
      entryId: source.entryId, surfaceId, pocket,
    })));
  }

  private async detachSurface(entryId: string, surfaceId?: string) {
    const source = this.structures.find(item => item.entryId === entryId);
    if (!surfaceId) {
      for (const surface of source?.settings.surface_objects ?? []) {
        if (surface.source.kind !== "entry") await this.detachSurface(entryId, surface.id);
      }
      return;
    }
    const surface = source?.settings.surface_objects.find(item => item.id === surfaceId);
    if (!surface) return;
    const key = surfaceKey(entryId, surface.source.kind, surfaceId);
    const binding = this.surfaceBindings.get(key);
    binding?.controller.abort(); binding?.unregister?.();
    this.surfaceBindings.delete(key);
    this.surfaceRenderedAtoms.delete(key);
    const ref = this.surfaceRefs.get(key);
    this.surfaceRefs.delete(key);
    this.surfaceMeshEntries.delete(key);
    if (ref && this.plugin?.state.data.cells.has(ref)) await this.plugin.state.data.build().delete(ref).commit();
    this.updateSurfacePickingThreshold();
  }

  private async prepareSurfaces(entryId: string) {
    const source = this.structures.find(item => item.entryId === entryId);
    for (const surface of source?.settings.surface_objects ?? []) {
      if (surface.source.kind !== "entry") await this.prepareSurface(entryId, surface.id);
    }
  }

  private async prepareSurface(entryId: string, surfaceId: string) {
    const plugin = this.plugin;
    const loaded = this.loaded.get(entryId);
    const source = this.structures.find(item => item.entryId === entryId);
    const surface = source?.settings.surface_objects.find(item => item.id === surfaceId);
    if (!plugin || !loaded || !source || !surface || surface.source.kind === "entry" || this.coordinatePreviews.has(entryId)) return;
    const definition = surface.source, channel = definition.kind;
    const pocket = source.pockets?.[surfaceId];
    const key = surfaceKey(entryId, channel, surfaceId);
    const label = `${source.label} · ${surface.name}`;
    if (!surface.visible || surface.appearance.opacity <= 0) {
      this.surfaces.request(entryId, channel, label, "hidden", null, () => {}, undefined, surfaceId); return;
    }
    if (channel === "pocket" && (this.pocketPreviewEntries.has(entryId) ||
      pocket?.seeds.some(seed => this.pocketPreviewEntries.has(seed.reference.structure_id)))) return;
    const nonpolar = new Set<number>();
    for (const unit of loaded.structure.units) {
      if (!Unit.isAtomic(unit)) continue;
      for (let index = 0; index < unit.elements.length; index++) {
        const element = unit.elements[index];
        if (isHydrogen(loaded.structure, unit, element, "non-polar")) {
          nonpolar.add(loaded.atomIds[unit.model.atomicHierarchy.atomSourceIndex.value(element)]);
        }
      }
    }
    const isolated = this.isolation === null ? null : new Set(this.isolation.filter(atom => atom.structure_id === entryId).map(atom => atom.atom_id));
    const visible = visibleRepresentationAtomIds(source, isolated, nonpolar);
    const ids = definition.kind === "fragment" ? definition.atom_ids.filter(id => visible.has(id))
      : [...new Set(source.hierarchy.components.filter(component => component.category === "protein")
        .flatMap(component => componentAtomIds(source.normalized, component)))].sort((a, b) => a - b);
    const targetIds = new Set(ids);
    const loci = this.lociFor(ids.map(atom_id => ({ structure_id: entryId, atom_id })));
    let revision = this.surfaceSourceRevisions.get(source.normalized);
    if (revision === undefined) { revision = ++this.nextSurfaceSourceRevision; this.surfaceSourceRevisions.set(source.normalized, revision); }
    const dependencyKey = `${channel}:${revision}:${ids.join(",")}:${channel === "pocket" ? `${pocket?.dependencyKey}:${pocket?.radius}` : SURFACE_PROFILE.id}`;
    const unavailable = channel === "pocket" ? pocket?.unavailable ?? (!pocket ? "Loading current pocket inputs…" : undefined) : undefined;
    if (channel === "pocket" && (!source.settings.components.protein || unavailable)) {
      this.surfaces.request(entryId, channel, label, dependencyKey, null, () => {}, unavailable, surfaceId); return;
    }
    if (!loci) {
      this.surfaces.request(entryId, channel, label, dependencyKey, null, () => {}, channel === "pocket" ? "No protein context is available." : undefined, surfaceId); return;
    }
    const component = await plugin.builders.structure.tryCreateComponent(loaded.structureRef, {
      type: { name: "bundle", params: StructureElement.Bundle.fromLoci(loci) }, nullIfEmpty: true, label,
    }, `surface-${key}`);
    if (!component?.obj) return;
    this.surfaceRefs.set(key, component.ref);
    const binding = { controller: new AbortController(), unregister: undefined as (() => void) | undefined };
    this.surfaceBindings.set(key, binding);
    const current = () => this.surfaceBindings.get(key) === binding && !binding.controller.signal.aborted && Boolean(this.plugin);
    const notify = (geometry?: SurfaceGeometry) => {
      this.syncQueue = this.syncQueue.catch(() => undefined).then(async () => {
        if (!current()) return;
        const camera = this.getCamera();
        try {
          const displayed = geometry && channel === "pocket" ? isolatePocketSurface(geometry, isolated) : geometry;
          if (channel === "pocket" && !displayed?.indices.length) { this.commitScene(camera); return; }
          if (displayed && surface.appearance.mode === "mesh") {
            const lines = await surfaceWireframe(displayed, binding.controller.signal, bytes => {
              if (!current()) throw new DOMException("Surface binding changed", "AbortError");
              this.surfaces.reserveDisplayBytes(entryId, channel, bytes, surfaceId);
            });
            if (!current()) return;
            attachSurfaceWireframe(component.obj!.data, lines);
          } else if (displayed) {
            this.surfaces.reserveDisplayBytes(entryId, channel, 0, surfaceId);
            attachSurfaceGeometry(component.obj!.data, displayed);
          }
          const repr = displayed ? await plugin.builders.structure.representation.addRepresentation(component, {
            type: surface.appearance.mode === "mesh" ? SelectionSurfaceWireframeProvider : SelectionSurfaceProvider,
            typeParams: { alpha: surface.appearance.opacity },
            color: plugin.representation.structure.themes.colorThemeRegistry.get(this.colorTheme(surface.appearance.color_by)),
            colorParams: surface.appearance.color_by === "custom" ? { value: Color.fromHexStyle(surface.appearance.custom_color) } : undefined,
          }) : await this.addSurfaceFallback(component.ref);
          if (!current()) return;
          if (displayed) { this.surfaceMeshEntries.add(key); this.updateSurfacePickingThreshold(); }
          if (repr) {
            binding.unregister?.();
            binding.unregister = this.surfaceVisuals.register(repr.obj!.data.repr, { entryId, surfaceId });
            const colors = surface.appearance.inherit_atom_colors ? selectionColorLayers(source.settings.selection_colors, source.normalized.atoms).flatMap(assignment => {
              const colorLoci = this.lociFor(assignment.atomIds.filter(id => targetIds.has(id)).map(atom_id => ({ structure_id: entryId, atom_id })));
              return colorLoci ? [{ bundle: StructureElement.Bundle.fromLoci(colorLoci), color: assignment.color, clear: false }] : [];
            }) : [];
            if (colors.length) await plugin.state.data.build().to(repr)
              .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle, { layers: colors }).commit();
          }
          const hidden = new Set(source.settings.selection_hidden_atoms), displayedIds = new Set<number>();
          if (displayed) for (const group of displayed.groups) displayedIds.add(displayed.atomIds[group]);
          else if (channel === "fragment") ids.forEach(id => displayedIds.add(id));
          this.surfaceRenderedAtoms.set(key, [...displayedIds].filter(id => visible.has(id) && !hidden.has(id))
            .map(atom_id => ({ structure_id: entryId, atom_id })));
          this.applySelection(); this.commitScene(camera);
        } catch (error) {
          if (!current()) return;
          this.surfaceRenderedAtoms.delete(key);
          binding.unregister?.(); binding.unregister = undefined;
          detachSurfaceGeometry(component.obj!.data);
          this.surfaces.fail(entryId, channel, error instanceof Error ? error.message : "Surface upload failed.", true, surfaceId, true);
          try {
            const cleanup = plugin.state.data.build();
            plugin.state.data.tree.children.get(component.ref)?.forEach(child => cleanup.delete(child));
            await cleanup.commit(); this.surfaceMeshEntries.delete(key);
            this.updateSurfacePickingThreshold();
            if (channel === "fragment") await this.addSurfaceFallback(component.ref);
            this.commitScene(camera);
          } catch {
            this.surfaces.fail(entryId, channel, "Surface and line rendering failed.", false, surfaceId, true);
          }
        }
      });
    };
    const reduced = source.normalized.atoms.length >= 250_000 ? "Large entry uses reduced detail." : undefined;
    // Capture the matching immutable calculation snapshot, not a disposable selector.
    // A queued request can outlive its renderer component during an appearance rebuild.
    // Typed inputs remain lazy; changed molecular dependencies cancel this request.
    const calculationStructure = component.obj.data;
    this.surfaces.request(entryId, channel, label, dependencyKey, reduced ? null : () => {
      const input = surfaceInput(calculationStructure, loaded.atomIds);
      if (pocket) input.pocket = createPocketCrop(pocket.seeds, pocket.radius);
      return input;
    }, notify, reduced, surfaceId);
  }

  private async addSurfaceFallback(component: string) {
    if (!this.plugin) return;
    const profile = molstarRepresentationProfile("line", { opacity: 1, hydrogenMode: "all", exactTarget: true });
    return this.plugin.builders.structure.representation.addRepresentation(component, {
      type: profile.type, typeParams: profile.typeParams, color: "element-symbol",
    });
  }

  private indexModels(
    entryId: string,
    structure: Structure,
    atomIds: number[],
  ): void {
    for (const unit of structure.units) {
      this.models.set(unit.model, { entryId, atomIds });
    }
  }

  private applySelection(): void {
    const plugin = this.plugin;
    if (!plugin) return;
    plugin.managers.interactivity.lociSelects.deselectAll();
    const byEntry = new Map<string, Set<number>>();
    for (const reference of this.pendingSelection) {
      const selected = byEntry.get(reference.structure_id) ?? new Set<number>();
      selected.add(reference.atom_id);
      byEntry.set(reference.structure_id, selected);
    }
    for (const [entryId, selectedAtomIds] of byEntry) {
      const loaded = this.loaded.get(entryId);
      if (!loaded) continue;
      const elements: StructureElement.Loci["elements"][number][] = [];
      for (const unit of loaded.structure.units) {
        if (!Unit.isAtomic(unit)) continue;
        const indices: UnitIndex[] = [];
        for (let unitIndex = 0; unitIndex < unit.elements.length; unitIndex += 1) {
          const modelElement = unit.elements[unitIndex];
          const sourceIndex =
            unit.model.atomicHierarchy.atomSourceIndex.value(modelElement);
          const atomId = loaded.atomIds[sourceIndex];
          if (atomId !== undefined && selectedAtomIds.has(atomId)) {
            indices.push(unitIndex as UnitIndex);
          }
        }
        if (indices.length > 0) {
          elements.push({
            unit,
            indices: OrderedSet.ofSortedArray(indices),
          });
        }
      }
      if (elements.length > 0) {
        plugin.managers.interactivity.lociSelects.select(
          { loci: StructureElement.Loci(loaded.structure, elements) },
          false,
        );
      }
    }
  }

  private lociFor(atoms: AtomReference[]): StructureElement.Loci | null {
    const byEntry = new Map<string, Set<number>>();
    for (const reference of atoms) {
      const selected = byEntry.get(reference.structure_id) ?? new Set<number>();
      selected.add(reference.atom_id);
      byEntry.set(reference.structure_id, selected);
    }
    const locis: StructureElement.Loci[] = [];
    for (const [entryId, selectedAtomIds] of byEntry) {
      const loaded = this.loaded.get(entryId);
      if (!loaded) continue;
      const elements: StructureElement.Loci["elements"][number][] = [];
      for (const unit of loaded.structure.units) {
        if (!Unit.isAtomic(unit)) continue;
        const indices: UnitIndex[] = [];
        for (let unitIndex = 0; unitIndex < unit.elements.length; unitIndex += 1) {
          const sourceIndex = unit.model.atomicHierarchy.atomSourceIndex.value(
            unit.elements[unitIndex],
          );
          if (selectedAtomIds.has(loaded.atomIds[sourceIndex])) {
            indices.push(unitIndex as UnitIndex);
          }
        }
        if (indices.length) elements.push({ unit, indices: OrderedSet.ofSortedArray(indices) });
      }
      if (elements.length) locis.push(StructureElement.Loci(loaded.structure, elements));
    }
    if (locis.length === 0) return null;
    if (locis.length === 1) return locis[0];
    let combined = locis[0];
    for (const loci of locis.slice(1)) combined = StructureElement.Loci.union(combined, loci);
    return combined;
  }

  private async applyMeasurements(): Promise<void> {
    const plugin = this.plugin;
    if (!plugin) return;
    if (this.measurementRefs.length) {
      const update = plugin.state.data.build();
      for (const ref of this.measurementRefs) update.delete(ref);
      await update.commit();
      this.measurementRefs = [];
    }
    for (const measurement of this.measurements.filter((item) => item.visible)) {
      const locis = measurement.atom_references.map((reference) =>
        this.lociFor([reference]),
      );
      if (locis.some((loci) => loci === null)) continue;
      const valid = locis as StructureElement.Loci[];
      const options = { customText: measurement.label };
      const result =
        measurement.kind === "distance"
          ? await plugin.managers.structure.measurement.addDistance(
              valid[0],
              valid[1],
              options,
            )
          : measurement.kind === "angle"
            ? await plugin.managers.structure.measurement.addAngle(
                valid[0],
                valid[1],
                valid[2],
                options,
              )
            : await plugin.managers.structure.measurement.addDihedral(
                valid[0],
                valid[1],
                valid[2],
                valid[3],
                options,
              );
      if (result) this.measurementRefs.push(result.selection.ref);
    }
  }

  private async addStructureLabels(structure: ViewerStructure): Promise<void> {
    const labels = structure.settings.labels;
    const add = async (atoms: AtomReference[], text: string) => {
      const loci = this.lociFor(atoms);
      if (!loci) return;
      const result = await this.plugin?.managers.structure.measurement.addLabel(loci, {
        visualParams: { customText: text },
      });
      if (result) this.labelRefs.push(result.selection.ref);
    };
    if (labels.structure) {
      await add(
        structure.normalized.atoms.map((atom) => ({
          structure_id: structure.entryId,
          atom_id: atom.id,
        })),
        structure.label,
      );
    }
    if (labels.atoms && structure.normalized.atoms.length <= 500) {
      const hidden = new Set(structure.settings.selection_hidden_atoms);
      for (const atom of structure.normalized.atoms) {
        if (hidden.has(atom.id)) continue;
        await add(
          [{ structure_id: structure.entryId, atom_id: atom.id }],
          `${atom.name} (${atom.element})`,
        );
      }
    }
    if (labels.residues && structure.normalized.residues.length <= 250) {
      for (const residue of structure.normalized.residues) {
        await add(
          structure.normalized.atoms
            .filter((atom) => atom.residue_id === residue.id)
            .map((atom) => ({ structure_id: structure.entryId, atom_id: atom.id })),
          `${residue.name} ${residue.author_number ?? residue.label_number ?? residue.id}`,
        );
      }
    }
    if (labels.chains) {
      for (const chain of structure.normalized.chains) {
        const residueIds = new Set(
          structure.normalized.residues
            .filter((residue) => residue.chain_id === chain.id)
            .map((residue) => residue.id),
        );
        await add(
          structure.normalized.atoms
            .filter((atom) => atom.residue_id && residueIds.has(atom.residue_id))
            .map((atom) => ({ structure_id: structure.entryId, atom_id: atom.id })),
          `Chain ${chain.name || "-"}`,
        );
      }
    }
  }

  private colorTheme(color: ColorScheme) {
    return {
      element: "element-symbol",
      chain: "chain-id",
      residue: "residue-name",
      "secondary-structure": "secondary-structure",
      structure: "model-index",
      custom: "uniform",
    }[color] as
      | "element-symbol"
      | "chain-id"
      | "residue-name"
      | "secondary-structure"
      | "model-index"
      | "uniform";
  }
}
