import { DoubleClickSequence, doubleClickExpansion } from "../selection/gestures";
import { resolvePickingTarget, type PickingTarget } from "./pickingTargets";
import { applicationHoverBehaviors, markMolecularHover } from "./hover";
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects";
import { ButtonsType } from "molstar/lib/mol-util/input/input-observer";
import { preparePreviewGpu } from "./previewGpu";
import { createModelPreviewRepresentation, modelPreviewColor } from "./modelPreviewGeometry";
import type { MolecularProposalGeometry } from "../api/types";
import { componentAtomIds } from "../selection/components";
import type { InteractionRecord } from "../interactions/types";
import { createInteractionRepresentation } from "./interactionGeometry";
import { filterInteractions } from "../interactions/filter";
import { createPocketCrop, isolatePocketSurface } from "./surface/pocket";
import { surfaceWireframe } from "./surface/wireframe";
import { SurfaceRuntime, type SurfaceStatus } from "./surface/runtime";
import { SurfaceVisualRegistry, type SurfaceIdentity } from "./surface/objects";
import { attachSurfaceGeometry, detachSurfaceGeometry, SelectionSurfaceProvider, SelectionSurfaceWireframeProvider, attachSurfaceWireframe, surfaceInput, surfaceDisplayGeometry } from "./surface/visual";
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
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { NeistraViewport } from "./viewport";
import { mountViewerPlugin } from "./mountPlugin";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { StateTransforms } from "molstar/lib/mol-plugin-state/transforms";
import { createStructureRepresentationParams } from "molstar/lib/mol-plugin-state/helpers/structure-representation-params";
import { captureSurfaceSync, surfaceDefinitionKey, surfaceIdentityKey, surfaceSyncChanges, SurfaceUpdateQueue, type SurfaceSyncSnapshot } from "./surfaceReconciliation";
import type {
  AtomReference,
  CameraState,
  ColorScheme,
  CoordinatePatch,
  Point3D,
  SelectionGranularity,
  SurfaceAppearance,
  SurfaceObject,
} from "../api/types";
import type {
  MolecularViewer,
  MovementInteraction,
  ViewerSelectionEvent,
  ViewerStructure,
  ViewerMeasurement,
  PresentationPointer,
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
import { authoredBondInput, AuthoredModelBonds, CanonicalStructureBonds } from "./authoredBonds";
import {
  hydrogenDisplayMode,
  molstarRepresentationProfile,
} from "./settings";

// Small mesh spheres reuse the ordinary mesh shader instead of compiling a new
// sphere-impostor pipeline on the first movement of a cartoon/surface-only view.
const movementCueParams = { sizeFactor: 0.3, tryUseImpostor: false, quality: "custom" as const, detail: 0 };

interface LoadedStructure {
  entryId: string;
  structure: Structure;
  atomIds: number[];
  coordinateRef: string;
  structureRef: string;
  baseCoordinates: Map<number, Point3D>;
}

interface SurfaceBinding {
  controller: AbortController;
  unregister?: () => void;
  entryId: string;
  surfaceId: string;
  channel: SurfaceChannel;
  definition: string;
  componentRef: string;
  structure: Structure;
  atomIds: number[];
  ids: number[];
  visible: Set<number>;
  isolated: Set<number> | null;
  received: boolean;
  geometry?: SurfaceGeometry;
  mapped?: SurfaceGeometry;
  mappingBytes: number;
  representationRef?: string;
  overpaintRef?: string;
  mode?: SurfaceAppearance["mode"];
  appearance?: SurfaceAppearance;
  installedGeometry?: SurfaceGeometry;
  displayGeometry?: SurfaceGeometry;
  renderedAtoms?: AtomReference[];
  failureMessage?: string;
}

export class MolstarEngine implements MolecularViewer {
  capturePresentation() {
    const canvas = this.mountTarget?.querySelector("canvas");
    if (!canvas?.captureStream || this.disposed) throw new Error("Presentation capture is unavailable.");
    return {
      stream: canvas.captureStream(30), refresh: () => this.plugin?.canvas3d?.requestDraw(),
      subscribePointer: (listener: (point: PresentationPointer | null) => void) => {
        const root = this.mountTarget?.parentElement ?? canvas;
        const clear = () => listener(null);
        const move = (event: PointerEvent) => {
          if (!(event.target instanceof Element) || (event.target !== canvas && !event.target.closest("[data-movement-canvas]"))) {
            clear(); return;
          }
          const bounds = canvas.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / bounds.width;
          const y = (event.clientY - bounds.top) / bounds.height;
          listener(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null);
        };
        const up = (event: PointerEvent) => { if (event.pointerType === "touch") clear(); };
        root.addEventListener("pointermove", move, { passive: true });
        root.addEventListener("pointerleave", clear);
        root.addEventListener("pointerup", up);
        window.addEventListener("blur", clear);
        return () => {
          root.removeEventListener("pointermove", move);
          root.removeEventListener("pointerleave", clear);
          root.removeEventListener("pointerup", up);
          window.removeEventListener("blur", clear);
        };
      },
      subscribeAvailability: (listener: (available: boolean) => void) => {
        const lost = () => listener(false);
        const restored = () => listener(true);
        canvas.addEventListener("webglcontextlost", lost);
        canvas.addEventListener("webglcontextrestored", restored);
        return () => {
          canvas.removeEventListener("webglcontextlost", lost);
          canvas.removeEventListener("webglcontextrestored", restored);
        };
      },
    };
  }
  private disposePlugin: (() => void) | undefined;
  private disposed = false;
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
  private doubleClicks = new DoubleClickSequence();
  private clickSubscription: { unsubscribe(): void } | undefined;
  private hoverSubscription: { unsubscribe(): void } | undefined;
  private stopHoverMarking: (() => void) | undefined;
  private hoverTarget: PickingTarget | null = null;
  private hoverNativeLoci: Loci | null = null;
  private hoverCamera: CameraState | null = null;
  private cameraSubscription: { unsubscribe(): void } | undefined;
  private measurementRefs: string[] = [];
  private labelRefs: string[] = [];
  private structures: ViewerStructure[] = [];
  private pocketPreviewEntries = new Set<string>();
  private coordinatePreviews = new Map<string, Map<number, Point3D>>();
  private measurements: ViewerMeasurement[] = [];
  private interactions: InteractionRecord[] = [];
  private modelPreview: MolecularProposalGeometry | null = null;
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
  private movementCueRefs = new Map<string, string>();
  private renderedAtomReferences = new Map<string, AtomReference[]>();
  private surfaceRenderedAtoms = new Map<string, AtomReference[]>();
  private previewRenderedAtoms = new Map<string, AtomReference[]>();
  private previewTargetIds = new Map<string, Set<number>>();
  private surfaceBindings = new Map<string, SurfaceBinding>();
  private surfaceSyncSnapshot: SurfaceSyncSnapshot | undefined;
  private surfaceDefinitions = new Map<string, string>();
  private surfaceUpdates = new SurfaceUpdateQueue();
  private surfacePreviews = new Map<string, { appearance: SurfaceAppearance; canonical: string; definition: string; normalized: ViewerStructure["normalized"] }>();

  async mount(target: HTMLElement): Promise<void> {
    const defaultSpec = DefaultPluginUISpec();
    const mounted = await mountViewerPlugin(target, {
      ...defaultSpec,
      behaviors: applicationHoverBehaviors(withCameraNeutralPrimarySelection(defaultSpec.behaviors, () => this.movementInteraction === "inactive")),
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
        hideTaskOverlay: true,
        viewport: { view: NeistraViewport },
      },
    });
    if (this.disposed) {
      mounted.dispose();
      return;
    }
    const plugin = mounted.plugin;
    if (!plugin.canvas3d) { mounted.dispose(); throw new Error("The molecular canvas could not start."); }
    this.disposePlugin = mounted.dispose;
    this.plugin = plugin;
    this.mountTarget = target;
    const inputRoot = target.parentElement ?? target;
    const down = (event: PointerEvent) => {
      if (event.target instanceof Element && (event.target instanceof HTMLCanvasElement
        || event.target.closest(".movement-pointer-surface"))) {
        this.heldPointers.add(event.pointerId);
        this.clearHover();
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
    const blur = () => { this.clearHover(); this.doubleClicks.clear(); this.heldPointers.clear(); this.ignoredPointers.clear(); this.ignoredMouseRelease = false; };
    const doubleClick = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLCanvasElement) || this.boundGeneration !== this.generation
        || this.rebuilding || this.movementInteraction !== "inactive" || this.pickingGranularity !== "atom"
        || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) {
        this.doubleClicks.clear(); return;
      }
      const expanded = this.doubleClicks.take();
      if (expanded) this.emit({ atoms: expanded.selection.atoms, granularity: expanded.selection.granularity,
        mode: "replace", pick: { atoms: expanded.pick, kind: "double", shift: false } });
    };
    const resetGesture = () => { this.clearHover(); this.doubleClicks.clear(); };
    const leave = () => this.clearHover();
    const dragSubscription = plugin.canvas3d.input.drag.subscribe(resetGesture);
    const wheelSubscription = plugin.canvas3d.input.wheel.subscribe(resetGesture);
    target.addEventListener("dblclick", doubleClick);
    target.addEventListener("pointerleave", leave);
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
      dragSubscription.unsubscribe();
      wheelSubscription.unsubscribe();
      target.removeEventListener("dblclick", doubleClick);
      target.removeEventListener("pointerleave", leave);
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
    this.setBackgroundColor(this.backgroundColor);
    const highlightManager = plugin.managers.interactivity.lociHighlights;
    const markHover: Parameters<typeof highlightManager.addProvider>[0] = ({ loci }, action) => {
      const representations = [...plugin.state.data.cells.values()].flatMap(cell =>
        PluginStateObject.Molecule.Structure.Representation3D.is(cell.obj) ? [cell.obj.data.repr] : []);
      markMolecularHover(representations, this.surfaceVisuals, loci, action, (target, marker) => plugin.canvas3d?.mark(target, marker));
    };
    highlightManager.addProvider(markHover);
    this.stopHoverMarking = () => highlightManager.removeProvider(markHover);
    this.hoverSubscription = plugin.behaviors.interaction.hover.subscribe(({ current, buttons }) => {
      if (buttons !== ButtonsType.Flag.None || this.heldPointers.size || plugin.isBusy || this.rebuilding
        || this.boundGeneration !== this.generation || this.movementInteraction !== "inactive"
        || this.surfaceVisuals.isManaged(current.repr) || Loci.isEmpty(current.loci)) {
        this.clearHover(); return;
      }
      const nativeLoci = this.pickingGranularity === "residue" ? null : Loci.normalize(current.loci,
        this.pickingGranularity === "atom" ? "element" : this.pickingGranularity, true);
      // Compare native membership before materializing canonical reference sets
      // for repeated Atom/Chain/Structure hits. Residues use indexed app targets.
      if (nativeLoci && this.hoverNativeLoci && Loci.areEqual(nativeLoci, this.hoverNativeLoci)) return;
      const target = this.pickingTarget(current.loci);
      if (!target.atoms.length) { this.clearHover(); return; }
      this.hoverNativeLoci = nativeLoci;
      if (this.hoverTarget?.key === target.key) return;
      const loci = this.lociFor(target.atoms);
      if (!loci) { this.clearHover(); return; }
      this.hoverTarget = target;
      this.hoverCamera = this.getCamera();
      highlightManager.highlightOnly({ loci }, false);
    });
    this.clickSubscription = plugin.behaviors.interaction.click.subscribe(
      ({ current, button, modifiers }) => {
        if (this.boundGeneration !== this.generation || this.rebuilding || this.movementInteraction !== "inactive" || !isPrimarySelectionActivation(button)) { this.doubleClicks.clear(); return; }
        const mode = selectionModeForModifiers(modifiers);
        if (this.surfaceHitIgnored(current.repr)) {
          this.doubleClicks.clear(); return;
        }
        if (mode === "replace" && this.surfaceVisuals.pick(current.repr)) {
          this.doubleClicks.clear();
          plugin.canvas3d?.requestDraw();
          return;
        }
        if (Loci.isEmpty(current.loci)) {
          this.doubleClicks.clear();
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
        const references = this.pickingTarget(current.loci).atoms;
        if (!references.length) { this.doubleClicks.clear(); return; }
        const pickedAtoms = this.referencesFromLoci(current.loci);
        this.doubleClicks.record(mode === "replace" && this.pickingGranularity === "atom"
          ? doubleClickExpansion(pickedAtoms, this.structures) : null);
        this.emit({
          atoms: references,
          granularity: this.pickingGranularity,
          mode,
          pick: { atoms: pickedAtoms, kind: "single", shift: modifiers.shift },
        });
      },
    );
    let gestureCamera = JSON.stringify(plugin.canvas3d.camera.getSnapshot());
    let publishedCamera: CameraState | null = null;
    this.cameraSubscription = plugin.canvas3d.camera.changed.subscribe(() => {
      const snapshot = plugin.canvas3d!.camera.getSnapshot();
      const nextGestureCamera = JSON.stringify(snapshot);
      // Projection jitter emits native camera events without moving the camera.
      if (nextGestureCamera !== gestureCamera) {
        this.doubleClicks.clear();
        gestureCamera = nextGestureCamera;
      }
      if (this.movementCamera && ["position", "target", "up"].some(key =>
        (snapshot[key as "position"] as number[]).some((value, axis) => value !== this.movementCamera![key as "position"][axis]))) {
        this.setCamera(this.movementCamera);
      }
      const camera = this.getCamera();
      // Mol* multisampling changes projection jitter on every marked frame.
      // Only application camera changes invalidate a stable molecular hover.
      if (this.hoverCamera && camera && JSON.stringify(this.hoverCamera) !== JSON.stringify(camera)) this.clearHover();
      if (camera && JSON.stringify(publishedCamera) !== JSON.stringify(camera)) {
        publishedCamera = camera;
        for (const listener of this.cameraListeners) listener(camera);
      }
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
    const snapshot = captureSurfaceSync(structures, this.isolation);
    const changes = this.plugin && !this.rebuilding && this.boundGeneration === this.generation
      ? surfaceSyncChanges(this.surfaceSyncSnapshot, snapshot) : undefined;
    this.pruneSurfacePreviews(structures);
    this.surfaceSyncSnapshot = snapshot;
    this.surfaceDefinitions = new Map(snapshot.entries.flatMap(entry => [...entry.surfaces].map(([surfaceId, state]) =>
      [surfaceIdentityKey({ entryId: entry.entryId, surfaceId }), state.definition] as const)));
    this.structures = structures;
    if (changes !== undefined) {
      for (const identity of changes) {
        const binding = this.findSurfaceBinding(identity);
        const current = this.surfaceObject(identity);
        if (binding && (!current || !current.surface.visible || binding.definition !== this.surfaceDefinitions.get(surfaceIdentityKey(identity)))) {
          binding.controller.abort(); binding.unregister?.();
          this.surfaces.remove(identity.entryId, binding.channel, identity.surfaceId);
        }
      }
      return Promise.all(changes.map(identity => this.scheduleSurfaceUpdate(identity))).then(() => undefined);
    }
    this.clearHover();
    this.doubleClicks.clear();
    // The generation invalidates retired visual hits immediately, even if the
    // serialized rebuild waits. Camera navigation retains its existing owner.
    this.surfaces.retain(new Set(structures.flatMap(item => item.settings.surface_objects
      .map(surface => surfaceKey(item.entryId, surface.source.kind, surface.id)))));
    for (const binding of this.surfaceBindings.values()) { binding.controller.abort(); binding.unregister?.(); }
    this.surfaceBindings.clear();
    this.surfaceVisuals.clearVisuals();
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
    this.clearHover();
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
        if (mode === "preview") {
          const label = this.structures.find(item => item.entryId === dependent.entryId)?.label ?? "Surface";
          this.surfaces.request(dependent.entryId, "pocket", label, "preview-paused", null, () => {}, undefined, dependent.surfaceId);
          this.surfaces.markHidden(dependent.entryId, "pocket", dependent.surfaceId, "Paused during coordinate preview");
        }
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
        this.surfaces.remove(patch.entry_id, surface.source.kind, surface.id);
      }
      const firstPreview = mode === "preview" && !this.coordinatePreviews.has(patch.entry_id);
      const hadPreview = this.coordinatePreviews.has(patch.entry_id);
      if (firstPreview) {
        for (const surface of this.structures.find(item => item.entryId === patch.entry_id)?.settings.surface_objects ?? []) {
          this.surfaces.request(patch.entry_id, surface.source.kind, surface.name, "preview-paused", null, () => {}, undefined, surface.id);
          this.surfaces.markHidden(patch.entry_id, surface.source.kind, surface.id, "Paused during coordinate preview");
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
        if (hadPreview && source) await this.restorePreviewRepresentations(source);
        await this.prepareSurfaces(patch.entry_id);
        for (const item of dependents) if (item.entryId !== patch.entry_id) await this.prepareSurface(item.entryId, item.surfaceId);
      }
    });
    return this.syncQueue;
  }

  clearCoordinatePreview(entryId: string): Promise<void> {
    this.clearHover();
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
        if (source) await this.restorePreviewRepresentations(source);
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

  prepareCoordinatePreview(signal: AbortSignal): Promise<void> {
    const gpu = this.plugin?.canvas3d?.webgl;
    return gpu ? preparePreviewGpu(gpu, signal) : Promise.resolve();
  }

  setPickingGranularity(granularity: SelectionGranularity): void {
    if (this.pickingGranularity !== granularity) { this.clearHover(); this.doubleClicks.clear(); }
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

  setModelPreview(preview: MolecularProposalGeometry | null): Promise<void> {
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
    this.clearHover();
    this.doubleClicks.clear();
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

  previewSurfaceAppearance(identity: SurfaceIdentity, appearance: SurfaceAppearance | null): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const current = this.surfaceObject(identity), key = surfaceIdentityKey(identity);
    if (!current) { this.surfacePreviews.delete(key); return Promise.resolve(); }
    if (appearance) {
      if (!Number.isFinite(appearance.opacity) || appearance.opacity < 0 || appearance.opacity > 1
        || !/^#[\da-f]{6}$/i.test(appearance.custom_color)) return Promise.reject(new Error("Invalid surface appearance."));
      const previous = this.surfacePreviews.get(key);
      this.surfacePreviews.set(key, { appearance: { ...appearance },
        canonical: previous?.canonical ?? JSON.stringify(current.surface.appearance),
        definition: previous?.definition ?? surfaceDefinitionKey(current.source, current.surface),
        normalized: previous?.normalized ?? current.source.normalized });
    } else if (!this.surfacePreviews.delete(key)) return Promise.resolve();
    return this.scheduleSurfaceUpdate(identity);
  }

  private surfaceObject(identity: SurfaceIdentity): { source: ViewerStructure; surface: SurfaceObject } | undefined {
    const source = this.structures.find(item => item.entryId === identity.entryId);
    const surface = source?.settings.surface_objects.find(item => item.id === identity.surfaceId);
    return source && surface ? { source, surface } : undefined;
  }

  private surfacePickEligible(identity: SurfaceIdentity): boolean {
    const current = this.surfaceObject(identity), binding = this.findSurfaceBinding(identity);
    return Boolean(current?.surface.visible && binding && this.surfaceBindingCurrent(binding)
      && this.surfaceAppearance(identity, current.surface).opacity > 0);
  }
  private surfaceHitIgnored(representation: Parameters<SurfaceVisualRegistry["identityFor"]>[0]): boolean {
    const identity = this.surfaceVisuals.identityFor(representation);
    return this.surfaceVisuals.isRetired(representation) || Boolean(identity && !this.surfacePickEligible(identity));
  }

  private surfaceAppearance(identity: SurfaceIdentity, surface: SurfaceObject): SurfaceAppearance {
    return this.surfacePreviews.get(surfaceIdentityKey(identity))?.appearance ?? surface.appearance;
  }

  private pruneSurfacePreviews(sources: readonly ViewerStructure[]) {
    for (const [key, preview] of this.surfacePreviews) {
      const source = sources.find(item => item.settings.surface_objects.some(surface => surfaceIdentityKey({ entryId: item.entryId, surfaceId: surface.id }) === key));
      const surface = source?.settings.surface_objects.find(item => surfaceIdentityKey({ entryId: source.entryId, surfaceId: item.id }) === key);
      if (!source || !surface || !surface.visible || source.normalized !== preview.normalized
        || surfaceDefinitionKey(source, surface) !== preview.definition || JSON.stringify(surface.appearance) !== preview.canonical) this.surfacePreviews.delete(key);
    }
  }

  private findSurfaceBinding(identity: SurfaceIdentity): SurfaceBinding | undefined {
    return [...this.surfaceBindings.values()].find(binding => binding.entryId === identity.entryId && binding.surfaceId === identity.surfaceId);
  }

  private surfaceBindingCurrent(binding: SurfaceBinding): boolean {
    const current = this.surfaceObject(binding);
    return !this.disposed && Boolean(this.plugin) && !binding.controller.signal.aborted
      && this.surfaceBindings.get(surfaceKey(binding.entryId, binding.channel, binding.surfaceId)) === binding
      && Boolean(current?.surface.visible && this.surfaceDefinitions.get(surfaceIdentityKey(binding)) === binding.definition);
  }

  private scheduleSurfaceUpdate(identity: SurfaceIdentity): Promise<void> {
    return this.surfaceUpdates.request(surfaceIdentityKey(identity), () => {
      this.syncQueue = this.syncQueue.catch(() => undefined).then(() => this.reconcileSurface(identity));
      return this.syncQueue;
    });
  }

  private async reconcileSurface(identity: SurfaceIdentity): Promise<void> {
    if (!this.plugin || this.disposed) return;
    const current = this.surfaceObject(identity);
    let binding = this.findSurfaceBinding(identity);
    if (!current || !current.surface.visible || (binding && !this.surfaceBindingCurrent(binding))) {
      const status = this.surfaces.statuses().find(item => item.entryId === identity.entryId && item.surfaceId === identity.surfaceId);
      await this.detachSurface(identity.entryId, identity.surfaceId);
      if (status) this.surfaces.remove(identity.entryId, status.channel, identity.surfaceId);
      binding = undefined;
      if (!current) { this.surfacePreviews.delete(surfaceIdentityKey(identity)); return; }
    }
    this.surfaces.updateLabel(identity.entryId, current.surface.source.kind, identity.surfaceId, `${current.source.label} · ${current.surface.name}`);
    if (!binding) { await this.prepareSurface(identity.entryId, identity.surfaceId); return; }
    if (!binding.received) return;
    await this.updateSurfaceDisplay(binding);
  }

  private async removeSurfaceRepresentation(binding: SurfaceBinding) {
    const plugin = this.plugin;
    binding.unregister?.(); binding.unregister = undefined;
    const ref = binding.representationRef;
    binding.representationRef = undefined; binding.overpaintRef = undefined; binding.mode = undefined; binding.appearance = undefined;
    if (ref && plugin?.state.data.cells.has(ref)) await plugin.state.data.build().delete(ref).commit();
  }

  private async updateSurfaceOverpaint(binding: SurfaceBinding, source: ViewerStructure, appearance: SurfaceAppearance) {
    const plugin = this.plugin, ref = binding.representationRef;
    if (!plugin || !ref) return;
    if (!appearance.inherit_atom_colors && binding.overpaintRef) {
      const old = binding.overpaintRef; binding.overpaintRef = undefined;
      if (plugin.state.data.cells.has(old)) await plugin.state.data.build().delete(old).commit();
    } else if (appearance.inherit_atom_colors && !binding.overpaintRef) {
      const ids = new Set(binding.ids);
      const layers = selectionColorLayers(source.settings.selection_colors, source.normalized.atoms).flatMap(assignment => {
        const loci = this.lociFor(assignment.atomIds.filter(id => ids.has(id)).map(atom_id => ({ structure_id: binding.entryId, atom_id })));
        return loci ? [{ bundle: StructureElement.Bundle.fromLoci(loci), color: assignment.color, clear: false }] : [];
      });
      if (layers.length) {
        const update = plugin.state.data.build();
        const overpaint = update.to(ref).apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle, { layers });
        await update.commit();
        if (this.surfaceBindingCurrent(binding)) binding.overpaintRef = overpaint.ref;
      }
    }
  }

  private async updateSurfaceDisplay(binding: SurfaceBinding): Promise<void> {
    const plugin = this.plugin, geometry = binding.geometry;
    const valid = () => this.surfaceBindingCurrent(binding) && binding.geometry === geometry
      && (!geometry || this.surfaces.canDisplay(binding.entryId, binding.channel, binding.surfaceId, geometry));
    if (!plugin || !valid()) return;
    const current = this.surfaceObject(binding)!;
    const appearance = { ...this.surfaceAppearance(binding, current.surface) };
    const key = surfaceKey(binding.entryId, binding.channel, binding.surfaceId);
    if (binding.appearance && binding.installedGeometry === geometry
      && JSON.stringify(binding.appearance) === JSON.stringify(appearance)) return;
    try {
      if (!geometry) {
        if (binding.representationRef && !binding.installedGeometry) {
          const representation = plugin.state.data.cells.get(binding.representationRef)?.obj;
          if (PluginStateObject.Molecule.Structure.Representation3D.is(representation)) representation.data.repr.setState({ visible: appearance.opacity > 0, pickable: appearance.opacity > 0 });
          if (appearance.opacity > 0 && binding.renderedAtoms) this.surfaceRenderedAtoms.set(key, binding.renderedAtoms);
          else this.surfaceRenderedAtoms.delete(key);
          binding.appearance = appearance;
          this.updateSurfacePickingThreshold(); this.commitScene(this.getCamera());
          return;
        }
        await this.removeSurfaceRepresentation(binding);
        if (!valid()) return;
        detachSurfaceGeometry(binding.structure); binding.mapped = undefined; binding.mappingBytes = 0;
        this.surfaceMeshEntries.delete(key); this.surfaceRenderedAtoms.delete(key);
        if (binding.channel !== "pocket") {
          const representation = await this.addSurfaceFallback(binding.componentRef);
          if (!valid()) return;
          if (representation?.obj) {
            binding.representationRef = representation.ref;
            representation.obj.data.repr.setState({ visible: appearance.opacity > 0, pickable: appearance.opacity > 0 });
            binding.unregister = this.surfaceVisuals.register(representation.obj.data.repr, { entryId: binding.entryId, surfaceId: binding.surfaceId });
          }
          const hidden = new Set(current.source.settings.selection_hidden_atoms);
          binding.renderedAtoms = binding.ids.filter(id => binding.visible.has(id) && !hidden.has(id))
            .map(atom_id => ({ structure_id: binding.entryId, atom_id }));
          if (appearance.opacity > 0) this.surfaceRenderedAtoms.set(key, binding.renderedAtoms);
        }
        binding.installedGeometry = undefined; binding.appearance = appearance;
        if (binding.failureMessage) this.surfaces.fail(binding.entryId, binding.channel, binding.failureMessage, true, binding.surfaceId, true);
        this.updateSurfacePickingThreshold(); this.applySelection(); this.commitScene(this.getCamera());
        return;
      }
      const isolated = binding.displayGeometry ??= binding.channel === "pocket" ? isolatePocketSurface(geometry, binding.isolated) : geometry;
      if (binding.channel === "pocket" && !isolated.indices.length) {
        await this.removeSurfaceRepresentation(binding);
        if (!valid()) return;
        this.surfaceMeshEntries.delete(key); this.surfaceRenderedAtoms.delete(key);
        binding.installedGeometry = geometry; binding.appearance = appearance;
        this.updateSurfacePickingThreshold(); this.commitScene(this.getCamera());
        this.surfaces.markDisplayed(binding.entryId, binding.channel, binding.surfaceId, geometry, geometry.indices.length ? "Hidden by isolation" : undefined);
        return;
      }
      const replaceVisual = !binding.representationRef || binding.mode !== appearance.mode || binding.installedGeometry !== geometry;
      if (replaceVisual) {
        this.surfaces.markPreparing(binding.entryId, binding.channel, binding.surfaceId, geometry);
        await this.removeSurfaceRepresentation(binding);
        if (!valid()) return;
        if (!binding.mapped) {
          const mapped = await surfaceDisplayGeometry(binding.structure, binding.atomIds, isolated, binding.controller.signal, bytes => {
            if (!valid()) throw new DOMException("Surface binding changed", "AbortError");
            this.surfaces.reserveDisplayBytes(binding.entryId, binding.channel, bytes, binding.surfaceId);
          });
          if (!valid()) return;
          binding.mapped = mapped.geometry; binding.mappingBytes = mapped.displayBytes;
        }
        if (appearance.mode === "mesh") {
          const lines = await surfaceWireframe(binding.mapped, binding.controller.signal, bytes => {
            if (!valid()) throw new DOMException("Surface binding changed", "AbortError");
            this.surfaces.reserveDisplayBytes(binding.entryId, binding.channel, binding.mappingBytes + bytes, binding.surfaceId);
          }, binding.mappingBytes + (binding.channel === "pocket" ? binding.mapped.indices.byteLength : 0));
          if (!valid()) return;
          attachSurfaceWireframe(binding.structure, lines);
        } else {
          this.surfaces.reserveDisplayBytes(binding.entryId, binding.channel, binding.mappingBytes, binding.surfaceId);
          attachSurfaceGeometry(binding.structure, binding.mapped);
        }
        const representation = await plugin.builders.structure.representation.addRepresentation(binding.componentRef, {
          type: appearance.mode === "mesh" ? SelectionSurfaceWireframeProvider : SelectionSurfaceProvider,
          typeParams: { alpha: appearance.opacity }, color: plugin.representation.structure.themes.colorThemeRegistry.get(this.colorTheme(appearance.color_by)),
          colorParams: appearance.color_by === "custom" ? { value: Color.fromHexStyle(appearance.custom_color) } : undefined,
        }, { tag: `neistra-representation-surface-${binding.surfaceId}` });
        if (!valid()) return;
        if (!representation?.obj) throw new Error("Surface representation could not be installed.");
        binding.representationRef = representation.ref; binding.mode = appearance.mode;
        binding.unregister = this.surfaceVisuals.register(representation.obj.data.repr, { entryId: binding.entryId, surfaceId: binding.surfaceId });
      } else {
        const params = createStructureRepresentationParams(plugin, binding.structure, {
          type: appearance.mode === "mesh" ? SelectionSurfaceWireframeProvider : SelectionSurfaceProvider,
          typeParams: { alpha: appearance.opacity }, color: plugin.representation.structure.themes.colorThemeRegistry.get(this.colorTheme(appearance.color_by)),
          colorParams: appearance.color_by === "custom" ? { value: Color.fromHexStyle(appearance.custom_color) } : undefined,
        });
        await plugin.state.data.build().to(binding.representationRef!).update(StateTransforms.Representation.StructureRepresentation3D, () => params).commit();
        if (!valid()) return;
      }
      await this.updateSurfaceOverpaint(binding, current.source, appearance);
      if (!valid()) return;
      const representation = plugin.state.data.cells.get(binding.representationRef!)?.obj;
      if (PluginStateObject.Molecule.Structure.Representation3D.is(representation)) representation.data.repr.setState({ pickable: appearance.opacity > 0 });
      binding.installedGeometry = geometry; binding.appearance = appearance;
      this.surfaceMeshEntries.add(key);
      if (!binding.renderedAtoms) {
        const hidden = new Set(current.source.settings.selection_hidden_atoms), displayedIds = new Set<number>();
        for (const group of binding.mapped!.groups) displayedIds.add(binding.mapped!.atomIds[group]);
        binding.renderedAtoms = [...displayedIds].filter(id => binding.visible.has(id) && !hidden.has(id))
          .map(atom_id => ({ structure_id: binding.entryId, atom_id }));
      }
      if (appearance.opacity > 0) this.surfaceRenderedAtoms.set(key, binding.renderedAtoms);
      else this.surfaceRenderedAtoms.delete(key);
      this.updateSurfacePickingThreshold();
      if (replaceVisual) this.applySelection();
      this.commitScene(this.getCamera());
      if (JSON.stringify(this.surfaceAppearance(binding, this.surfaceObject(binding)!.surface)) === JSON.stringify(appearance)) {
        this.surfaces.markDisplayed(binding.entryId, binding.channel, binding.surfaceId, geometry, appearance.opacity <= 0 ? "Opacity is zero" : undefined);
      }
    } catch (error) {
      if (!valid()) return;
      await this.removeSurfaceRepresentation(binding);
      detachSurfaceGeometry(binding.structure); binding.mapped = undefined; binding.mappingBytes = 0;
      this.surfaceMeshEntries.delete(key); this.surfaceRenderedAtoms.delete(key);
      if (!geometry) {
        this.surfaces.fail(binding.entryId, binding.channel, "Surface and line rendering failed.", false, binding.surfaceId, true);
        this.updateSurfacePickingThreshold(); this.commitScene(this.getCamera());
        return;
      }
      binding.failureMessage = error instanceof Error ? error.message : "Surface upload failed.";
      this.surfaces.fail(binding.entryId, binding.channel, binding.failureMessage, false, binding.surfaceId, true);
      binding.geometry = undefined; binding.received = true;
      // The fallback uses its own current object binding, never a retired upload.
      await this.updateSurfaceDisplay(binding);
    }
  }

  cancelSurface(entryId: string, channel: SurfaceChannel = "fragment", surfaceId: string = channel): void {
    this.surfaces.cancel(entryId, channel, surfaceId);
  }

  retrySurface(entryId: string, channel: SurfaceChannel = "fragment", surfaceId: string = channel): void {
    this.surfaces.remove(entryId, channel, surfaceId);
    this.syncQueue = this.syncQueue.catch(() => undefined).then(async () => {
      await this.detachSurface(entryId, surfaceId);
      await this.prepareSurface(entryId, surfaceId);
    });
  }

  private updateSurfacePickingThreshold() {
    const alphas = this.structures.flatMap(source => source.settings.surface_objects
      .filter(surface => {
        const key = surfaceKey(source.entryId, surface.source.kind, surface.id);
        const rendered = this.surfaceMeshEntries.has(key) && Boolean(this.surfaceBindings.get(key)?.unregister);
        return rendered && this.surfacePickEligible({ entryId: source.entryId, surfaceId: surface.id });
      }).map(surface => this.surfaceAppearance({ entryId: source.entryId, surfaceId: surface.id }, surface).opacity));
    this.plugin?.canvas3d?.setProps({ renderer: { pickingAlphaThreshold: Math.min(0.5, ...alphas) } });
  }

  resize(): void {
    this.plugin?.layout.events.updated.next(undefined);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearHover();
    this.hoverSubscription?.unsubscribe();
    this.hoverSubscription = undefined;
    this.stopHoverMarking?.();
    this.stopHoverMarking = undefined;
    this.modelPreview = null;
    this.plugin?.canvas3d?.remove(this.modelPreviewRepresentation);
    this.modelPreviewRepresentation.destroy();
    this.plugin?.canvas3d?.remove(this.interactionRepresentation);
    this.interactionRepresentation.destroy();
    this.setMovementMode("inactive");
    this.stopInputBoundary?.();
    this.stopInputBoundary = undefined;
    this.generation += 1;
    this.surfaces.dispose();
    this.surfaceUpdates.dispose(); this.surfacePreviews.clear(); this.surfaceDefinitions.clear(); this.surfaceSyncSnapshot = undefined;
    this.surfaceVisuals.dispose();
    for (const binding of this.surfaceBindings.values()) { binding.controller.abort(); binding.unregister?.(); }
    this.surfaceBindings.clear();
    this.surfaceRefs.clear();
    this.surfaceMeshEntries.clear();
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
    this.disposePlugin?.();
    this.disposePlugin = undefined;
    this.plugin = undefined;
  }

  private referencesFromLoci(loci: Loci): AtomReference[] {
    const normalized = Loci.normalize(loci, "element", true);
    if (!StructureElement.Loci.is(normalized)) return [];
    const references: AtomReference[] = [];
    for (const element of normalized.elements) {
      if (!Unit.isAtomic(element.unit)) continue;
      const mapping = this.models.get(element.unit.model);
      if (!mapping) continue;
      OrderedSet.forEach(element.indices, unitIndex => {
        const sourceIndex = element.unit.model.atomicHierarchy.atomSourceIndex.value(element.unit.elements[unitIndex]);
        const atomId = mapping.atomIds[sourceIndex];
        if (atomId !== undefined) references.push({ structure_id: mapping.entryId, atom_id: atomId });
      });
    }
    return references;
  }

  private pickingTarget(loci: Loci): PickingTarget {
    const pick = this.referencesFromLoci(loci);
    return resolvePickingTarget(pick, this.pickingGranularity, this.structures, (atoms, mode) => {
      const input = atoms === pick ? loci : this.lociFor(atoms);
      return input ? this.referencesFromLoci(Loci.normalize(input, mode === "atom" ? "element" : mode, true)) : [];
    });
  }

  private clearHover(): void {
    this.hoverTarget = null;
    this.hoverNativeLoci = null;
    this.hoverCamera = null;
    this.plugin?.managers.interactivity.lociHighlights.clearHighlights();
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
    this.clearHover();
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
    const bondInput = authoredBondInput(structure.normalized);
    const displayModel = await plugin.state.data.build().to(coordinateModel)
      .apply(AuthoredModelBonds, { input: bondInput }).commit({ revertOnError: true });
    const modelStructure = await plugin.builders.structure.createStructure(displayModel, { name: "model", params: {} });
    const canonicalStructure = await plugin.state.data.build().to(modelStructure)
      .apply(CanonicalStructureBonds).commit({ revertOnError: true });
    const structureProperties =
      await plugin.builders.structure.insertStructureProperties(canonicalStructure);
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

  private async addRepresentations(structure: ViewerStructure, structureRef: string, molstarStructure: Structure): Promise<void> {
    const plugin = this.plugin;
    if (!plugin) return;
    const isolatedIds = this.isolation === null ? null : new Set(this.isolation.filter(atom => atom.structure_id === structure.entryId).map(atom => atom.atom_id));
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
    const hidden = new Set(structure.settings.selection_hidden_atoms);
    const visibleAtoms = [...new Set(layers.filter(layer => !layer.surface && layer.opacity > 0).flatMap(layer => layer.atomIds))].filter(id => !hidden.has(id));
    this.renderedAtomReferences.set(structure.entryId, visibleAtoms.map(atom_id => ({ structure_id: structure.entryId, atom_id })));
    if (this.coordinatePreviews.has(structure.entryId)) {
      const visible = new Set(this.previewRenderedAtoms.get(structure.entryId)?.map(atom => atom.atom_id) ?? []);
      layers.push({ id: "movement-preview", style: "space-filling", colorBy: "element", customColor: "#C94F2D", opacity: 1, exactTarget: true,
        atomIds: [...(this.previewTargetIds.get(structure.entryId) ?? [])].filter(id => visible.has(id) && !hidden.has(id)) });
    }
    for (const layer of layers) {
      // Independent surfaces share one bounded combined-context worker path.
      if (layer.surface) continue;
      const loci = this.lociFor(layer.atomIds.map(atom_id => ({ structure_id: structure.entryId, atom_id })));
      if (!loci) continue;
      const component = await plugin.builders.structure.tryCreateComponent(structureRef, {
        type: { name: "bundle", params: StructureElement.Bundle.fromLoci(loci) }, nullIfEmpty: true,
        label: `${structure.label} ${layer.style}`,
      }, `${layer.id}-${structure.entryId}`);
      if (!component) continue;
      if (layer.id === "movement-preview") this.movementCueRefs.set(structure.entryId, component.ref);
      const profile = molstarRepresentationProfile(layer.style, {
        opacity: layer.opacity, hydrogenMode: localHydrogens ? "all" : hydrogenDisplayMode(structure.settings.components),
        exactTarget: layer.exactTarget || localHydrogens,
      });
      const representation = await plugin.builders.structure.representation.addRepresentation(component, {
        type: profile.type,
        typeParams: layer.id === "movement-preview" ? { ...profile.typeParams, ...movementCueParams } : profile.typeParams,
        size: profile.size, sizeParams: profile.sizeParams,
        color: this.colorTheme(layer.colorBy),
        colorParams: layer.colorBy === "custom" ? { value: Color.fromHexStyle(layer.customColor) } : undefined,
      }, { tag: `neistra-representation-${layer.id}` });
      if (!representation) continue;
      representation.obj?.data.repr.setState({ pickable: layer.opacity >= 0.5 });
      const visible = new Set(layer.atomIds);
      const colors = colorLayers.flatMap(assignment => {
        const colorLoci = this.lociFor(assignment.atomIds.filter(id => visible.has(id)).map(atom_id => ({ structure_id: structure.entryId, atom_id })));
        return colorLoci ? [{ bundle: StructureElement.Bundle.fromLoci(colorLoci), color: assignment.color, clear: false }] : [];
      });
      if (colors.length) await plugin.state.data.build().to(representation)
        .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle, { layers: colors }).commit();
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

  private async restorePreviewRepresentations(source: ViewerStructure) {
    const cue = this.movementCueRefs.get(source.entryId);
    this.movementCueRefs.delete(source.entryId);
    this.previewRenderedAtoms.delete(source.entryId);
    this.previewTargetIds.delete(source.entryId);
    if (cue) await this.plugin?.state.data.build().delete(cue).commit();
    this.commitScene(this.getCamera());
  }

  private pocketSurfaces() {
    return this.structures.flatMap(source => Object.entries(source.pockets ?? {}).map(([surfaceId, pocket]) => ({
      entryId: source.entryId, surfaceId, pocket,
    })));
  }

  private async detachSurface(entryId: string, surfaceId?: string) {
    if (!surfaceId) {
      for (const binding of [...this.surfaceBindings.values()].filter(item => item.entryId === entryId)) {
        await this.detachSurface(entryId, binding.surfaceId);
      }
      return;
    }
    const binding = this.findSurfaceBinding({ entryId, surfaceId });
    const surface = this.surfaceObject({ entryId, surfaceId })?.surface;
    if (!binding && !surface) return;
    const key = surfaceKey(entryId, binding?.channel ?? surface!.source.kind, surfaceId);
    binding?.controller.abort(); binding?.unregister?.();
    if (binding) detachSurfaceGeometry(binding.structure);
    this.surfaceBindings.delete(key);
    this.surfaceRenderedAtoms.delete(key);
    const ref = binding?.componentRef ?? this.surfaceRefs.get(key);
    this.surfaceRefs.delete(key); this.surfaceMeshEntries.delete(key);
    if (ref && this.plugin?.state.data.cells.has(ref)) await this.plugin.state.data.build().delete(ref).commit();
    this.updateSurfacePickingThreshold();
  }

  private async prepareSurfaces(entryId: string) {
    const source = this.structures.find(item => item.entryId === entryId);
    for (const surface of source?.settings.surface_objects ?? []) {
      await this.prepareSurface(entryId, surface.id);
    }
  }

  private async prepareSurface(entryId: string, surfaceId: string) {
    const plugin = this.plugin;
    const loaded = this.loaded.get(entryId);
    const source = this.structures.find(item => item.entryId === entryId);
    const surface = source?.settings.surface_objects.find(item => item.id === surfaceId);
    if (!plugin || !loaded || !source || !surface) return;
    const definition = surface.source, channel = definition.kind;
    const definitionKey = surfaceDefinitionKey(source, surface);
    this.surfaceDefinitions.set(surfaceIdentityKey({ entryId, surfaceId }), definitionKey);
    const pocket = source.pockets?.[surfaceId];
    const key = surfaceKey(entryId, channel, surfaceId);
    const label = `${source.label} · ${surface.name}`;
    const hiddenStatus = (message: string, dependency = "hidden") => {
      this.surfaces.request(entryId, channel, label, dependency, null, () => {}, undefined, surfaceId);
      this.surfaces.markHidden(entryId, channel, surfaceId, message);
    };
    if (this.coordinatePreviews.has(entryId)) {
      hiddenStatus("Paused during coordinate preview", "preview-paused"); return;
    }
    if (!surface.visible || this.surfaceAppearance({ entryId, surfaceId }, surface).opacity <= 0) {
      hiddenStatus(!surface.visible ? "Hidden" : "Opacity is zero"); return;
    }
    if (channel === "pocket" && (this.pocketPreviewEntries.has(entryId) ||
      pocket?.seeds.some(seed => this.pocketPreviewEntries.has(seed.reference.structure_id)))) {
      hiddenStatus("Paused during coordinate preview", "preview-paused"); return;
    }
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
      : definition.kind === "entry" ? [...visible].sort((a, b) => a - b)
      : [...new Set(source.hierarchy.components.filter(component => component.category === "protein")
        .flatMap(component => componentAtomIds(source.normalized, component)))].sort((a, b) => a - b);
    const loci = this.lociFor(ids.map(atom_id => ({ structure_id: entryId, atom_id })));
    let revision = this.surfaceSourceRevisions.get(source.normalized);
    if (revision === undefined) { revision = ++this.nextSurfaceSourceRevision; this.surfaceSourceRevisions.set(source.normalized, revision); }
    const dependencyKey = `${channel}:${revision}:${ids.join(",")}:${channel === "pocket" ? `${pocket?.dependencyKey}:${pocket?.radius}` : SURFACE_PROFILE.id}`;
    const unavailable = channel === "pocket" ? pocket?.unavailable ?? (!pocket ? "Loading current pocket inputs…" : undefined) : undefined;
    if (channel === "pocket" && !source.settings.components.protein) {
      hiddenStatus("Protein hidden", dependencyKey); return;
    }
    if (channel === "pocket" && unavailable) {
      this.surfaces.request(entryId, channel, label, dependencyKey, null, () => {}, unavailable, surfaceId); return;
    }
    if (!loci) {
      if (channel === "pocket") this.surfaces.request(entryId, channel, label, dependencyKey, null, () => {}, "No protein context is available.", surfaceId);
      else hiddenStatus(isolated ? "Hidden by isolation or display filters" : "Hidden by display filters", dependencyKey);
      return;
    }
    const component = await plugin.builders.structure.tryCreateComponent(loaded.structureRef, {
      type: { name: "bundle", params: StructureElement.Bundle.fromLoci(loci) }, nullIfEmpty: true, label,
    }, `surface-${key}`);
    if (!component?.obj) return;
    this.surfaceRefs.set(key, component.ref);
    const binding: SurfaceBinding = { controller: new AbortController(), entryId, surfaceId, channel,
      definition: definitionKey, componentRef: component.ref, structure: component.obj.data,
      atomIds: loaded.atomIds, ids, visible, isolated, received: false, mappingBytes: 0 };
    this.surfaceBindings.set(key, binding);
    const notify = (geometry?: SurfaceGeometry) => {
      if (!this.surfaceBindingCurrent(binding)) return;
      if (binding.geometry !== geometry) { binding.mapped = undefined; binding.displayGeometry = undefined; binding.mappingBytes = 0; }
      binding.received = true; binding.geometry = geometry;
      void this.scheduleSurfaceUpdate({ entryId, surfaceId }).catch((error: unknown) => {
        if (this.surfaceBindingCurrent(binding)) this.surfaces.fail(entryId, channel,
          error instanceof Error ? error.message : "Surface display failed.", false, surfaceId, true);
      });
    };
    const reduced = source.normalized.atoms.length >= 250_000 ? "Large entry uses reduced detail." : undefined;
    // Capture the matching immutable calculation snapshot, not a disposable selector.
    // A queued request can outlive its renderer component during an appearance rebuild.
    // Typed inputs remain lazy; changed molecular dependencies cancel this request.
    const calculationStructure = component.obj.data;
    this.surfaces.request(entryId, channel, label, dependencyKey, reduced ? null : () => {
      const input = surfaceInput(calculationStructure, loaded.atomIds, channel);
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
