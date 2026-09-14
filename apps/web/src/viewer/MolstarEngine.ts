import { componentAtomIds } from "../selection/components";
import { createPocketCrop, isolatePocketSurface } from "./surface/pocket";
import { ElementSymbolColorThemeProvider } from "molstar/lib/mol-theme/color/element-symbol";
import { SurfaceRuntime, type SurfaceStatus } from "./surface/runtime";
import { attachSurfaceGeometry, detachSurfaceGeometry, SelectionSurfaceProvider, surfaceInput } from "./surface/visual";
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
import { observeViewerAttribution } from "./domPresentation";
import {
  hydrogenDisplayMode,
  molstarRepresentationProfile,
} from "./settings";

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
  private syncQueue: Promise<void> = Promise.resolve();
  private generation = 0;
  private pickingGranularity: SelectionGranularity = "atom";
  private pendingSelection: AtomReference[] = [];
  private loaded = new Map<string, LoadedStructure>();
  private models = new Map<Model, { entryId: string; atomIds: number[] }>();
  private listeners = new Set<(event: ViewerSelectionEvent) => void>();
  private cameraListeners = new Set<(camera: CameraState) => void>();
  private retainedCamera: CameraState | null = null;
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
  private isolation: AtomReference[] | null = null;
  private surfaces = new SurfaceRuntime();
  private surfaceSourceRevisions = new WeakMap<ViewerStructure["normalized"], number>();
  private nextSurfaceSourceRevision = 0;
  private surfaceMeshEntries = new Set<string>();
  private surfaceRefs = new Map<string, string>();
  private surfaceBindings = new Map<string, object>();

  async mount(target: HTMLElement): Promise<void> {
    const defaultSpec = DefaultPluginUISpec();
    const plugin = await createPluginUI({
      target,
      render: renderReact18,
      spec: {
        ...defaultSpec,
        behaviors: withCameraNeutralPrimarySelection(defaultSpec.behaviors),
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
    plugin.representation.structure.registry.add(SelectionSurfaceProvider);
    this.stopAttributionObserver = observeViewerAttribution(target);
    this.setBackgroundColor(this.backgroundColor);
    this.clickSubscription = plugin.behaviors.interaction.click.subscribe(
      ({ current, button, modifiers }) => {
        if (!isPrimarySelectionActivation(button)) return;
        const mode = selectionModeForModifiers(modifiers);
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
      const camera = this.getCamera();
      if (camera) for (const listener of this.cameraListeners) listener(camera);
    });
  }

  setBackgroundColor(cssColor: string): void {
    this.backgroundColor = cssColor;
    this.plugin?.canvas3d?.setProps({
      renderer: { backgroundColor: Color.fromHexStyle(cssColor) },
      transparentBackground: false,
    });
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    this.structures = structures;
    this.surfaces.retain(new Set(structures.flatMap((item) => [
      ...(item.settings.selection_surface ? [surfaceKey(item.entryId, "fragment")] : []),
      ...(item.pocket ? [surfaceKey(item.entryId, "pocket")] : []),
    ])));
    this.surfaceBindings.clear();
    const generation = ++this.generation;
    this.syncQueue = this.syncQueue.then(async () => {
      const plugin = this.plugin;
      if (!plugin || generation !== this.generation) return;
      const camera = this.getCamera();
      this.rebuilding = true;
      try {
        await plugin.clear();
        this.surfaceRefs.clear();
        this.surfaceMeshEntries.clear();
        plugin.canvas3d?.setProps({ renderer: { pickingAlphaThreshold: 0.5 } });
        this.measurementRefs = [];
        this.labelRefs = [];
        this.loaded.clear();
        this.models.clear();
        for (const structure of structures) {
          if (generation !== this.generation) return;
          await this.loadStructure(structure);
          await this.addStructureLabels(structure);
        }
        this.applySelection();
        await this.applyMeasurements();
        this.commitScene(camera);
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
    this.syncQueue = this.syncQueue.then(async () => {
      if (!this.plugin) return;
      const loaded = this.loaded.get(patch.entry_id);
      if (patch.atom_ids.length !== patch.coordinates.length) throw new Error("Invalid coordinate patch.");
      // A current artifact-keyed application sync may already contain this commit.
      // Do not invalidate geometry again (or create a spurious seed revision).
      if (mode === "commit" && !this.pocketPreviewEntries.has(patch.entry_id) &&
        !this.coordinatePreviews.has(patch.entry_id)) {
        const changed = new Map(patch.atom_ids.map((id, index) => [id, patch.coordinates[index]]));
        const differs = (a: Point3D | undefined, b: Point3D) => !a || a.some((value, axis) => value !== b[axis]);
        const moleculeChanged = loaded && patch.atom_ids.some((id, index) => differs(loaded.baseCoordinates.get(id), patch.coordinates[index]));
        const seedChanged = this.structures.some((source) => source.pocket?.seeds.some((seed) =>
          seed.reference.structure_id === patch.entry_id && changed.has(seed.reference.atom_id) &&
          differs(seed.coordinates, changed.get(seed.reference.atom_id)!)));
        if (!moleculeChanged && !seedChanged) return;
      }

      if (mode === "preview") this.pocketPreviewEntries.add(patch.entry_id);
      else this.pocketPreviewEntries.delete(patch.entry_id);
      const dependentIds = this.structures.filter((source) => source.pocket &&
        (source.entryId === patch.entry_id || source.pocket.seeds.some((seed) =>
          seed.reference.structure_id === patch.entry_id))).map((source) => source.entryId);
      for (const ownerId of dependentIds) {
        await this.detachSurface(ownerId, "pocket");
        this.surfaces.remove(ownerId, "pocket");
      }
      if (mode === "commit") {
        const changed = new Map(patch.atom_ids.map((id, index) => [id, patch.coordinates[index]]));
        this.structures = this.structures.map((source) => !source.pocket ? source : {
          ...source, pocket: { ...source.pocket,
            seeds: source.pocket.seeds.map((seed) => seed.reference.structure_id === patch.entry_id &&
              changed.has(seed.reference.atom_id) ? { ...seed, coordinates: [...changed.get(seed.reference.atom_id)!] as Point3D } : seed),
            dependencyKey: dependentIds.includes(source.entryId)
              ? JSON.stringify([source.pocket.dependencyKey, patch.entry_id, patch.artifact_id]) : source.pocket.dependencyKey,
          },
        });
      }
      if (!loaded) {
        if (mode === "commit") for (const ownerId of dependentIds) await this.prepareSurface(ownerId, "pocket");
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
      for (const channel of ["fragment", "pocket"] as const) this.surfaces.remove(patch.entry_id, channel);
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
      if (mode === "commit") {
        await this.prepareSurfaces(patch.entry_id);
        for (const ownerId of dependentIds) if (ownerId !== patch.entry_id) await this.prepareSurface(ownerId, "pocket");
      }
    });
    return this.syncQueue;
  }

  clearCoordinatePreview(entryId: string): Promise<void> {
    this.syncQueue = this.syncQueue.then(async () => {
      this.coordinatePreviews.delete(entryId);
      this.pocketPreviewEntries.delete(entryId);
      const loaded = this.loaded.get(entryId);
      if (loaded) {
        await this.detachSurface(entryId);
        await this.updateCoordinates(loaded, loaded.baseCoordinates);
        await this.prepareSurfaces(entryId);
      }
      for (const source of this.structures) {
        if (source.entryId !== entryId && source.pocket?.seeds.some((seed) => seed.reference.structure_id === entryId)) {
          await this.detachSurface(source.entryId, "pocket");
          await this.prepareSurface(source.entryId, "pocket");
        }
      }
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
    this.syncQueue = this.syncQueue.then(async () => {
      const camera = this.getCamera();
      await this.applyMeasurements();
      this.commitScene(camera);
    });
    return this.syncQueue;
  }

  async setIsolation(atoms: AtomReference[] | null): Promise<void> {
    this.isolation = atoms;
    await this.syncQueue;
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
    if (camera) this.setCamera(camera);
    else if (this.hasScene) canvas?.requestCameraReset({ durationMs: 0 });
  }

  setCameraMode(mode: CameraState["mode"]): void {
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
    camera.setState({ position: Vec3.create(...position) });
  }

  focusAtoms(atoms: AtomReference[]): void {
    const loci = this.lociFor(atoms);
    if (loci) this.plugin?.managers.camera.focusLoci(loci);
  }

  fitVisible(): void {
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

  cancelSurface(entryId: string, channel: SurfaceChannel = "fragment"): void { this.surfaces.cancel(entryId, channel); }

  retrySurface(entryId: string, channel: SurfaceChannel = "fragment"): void {
    this.surfaces.remove(entryId, channel);
    this.syncQueue = this.syncQueue.then(async () => {
      await this.detachSurface(entryId, channel);
      await this.prepareSurface(entryId, channel);
    });
  }

  resize(): void {
    this.plugin?.layout.events.updated.next(undefined);
  }

  dispose(): void {
    this.stopAttributionObserver?.();
    this.stopAttributionObserver = undefined;
    this.generation += 1;
    this.surfaces.dispose();
    this.surfaceBindings.clear();
    this.surfaceRefs.clear();
    this.surfaceMeshEntries.clear();
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
    const modelStructure =
      await plugin.builders.structure.createStructure(coordinateModel);
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
    const isolatedIds =
      this.isolation === null
        ? null
        : new Set(
            this.isolation
              .filter((reference) => reference.structure_id === structure.entryId)
              .map((reference) => reference.atom_id),
          );
    const localHydrogens = structure.settings.selection_nonpolar_hydrogens.length > 0;
    const nonpolarHydrogens = localHydrogens ? new Set<number>() : undefined;
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
    const colorLayers = selectionColorLayers(structure.settings.selection_colors, structure.normalized.atoms);
    for (const layer of representationLayers(structure, isolatedIds, nonpolarHydrogens)) {
      const loci = this.lociFor(
        layer.atomIds.map((atomId) => ({
          structure_id: structure.entryId,
          atom_id: atomId,
        })),
      );
      if (!loci) continue;
      const component = await plugin.builders.structure.tryCreateComponent(
        structureProperties,
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
      const profile = molstarRepresentationProfile(layer.style, {
        opacity: layer.opacity,
        // The full-structure mask already enforces master and local preferences.
        hydrogenMode: localHydrogens ? "all" : hydrogenDisplayMode(structure.settings.components),
        exactTarget: layer.exactTarget || localHydrogens,
      });
      const representation = await plugin.builders.structure.representation.addRepresentation(
        component,
        {
          type: profile.type,
          typeParams: profile.typeParams,
          color: this.colorTheme(layer.colorBy),
          colorParams:
            layer.colorBy === "custom"
              ? {
                  value: Color(Number.parseInt(layer.customColor.slice(1), 16)),
                }
              : undefined,
        },
        { tag: `molweave-representation-${layer.id}` },
      );
      // Preserve inherited pick eligibility when the selection surface lowers the canvas threshold.
      representation.obj?.data.repr.setState({ pickable: layer.opacity >= 0.5 });
      const visible = new Set(layer.atomIds);
      const colors = colorLayers.flatMap((assignment) => {
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
    await this.prepareSurfaces(structure.entryId);
  }

  private async detachSurface(entryId: string, channel?: SurfaceChannel) {
    if (!channel) {
      await this.detachSurface(entryId, "fragment"); await this.detachSurface(entryId, "pocket"); return;
    }
    const key = surfaceKey(entryId, channel);
    this.surfaceBindings.delete(key);
    const ref = this.surfaceRefs.get(key);
    this.surfaceRefs.delete(key);
    this.surfaceMeshEntries.delete(key);
    if (ref && this.plugin?.state.data.cells.has(ref)) await this.plugin.state.data.build().delete(ref).commit();
    if (!this.surfaceMeshEntries.size) this.plugin?.canvas3d?.setProps({ renderer: { pickingAlphaThreshold: 0.5 } });
  }

  private async prepareSurfaces(entryId: string) {
    await this.prepareSurface(entryId, "fragment"); await this.prepareSurface(entryId, "pocket");
  }

  private async prepareSurface(entryId: string, channel: SurfaceChannel) {
    const key = surfaceKey(entryId, channel);
    const plugin = this.plugin;
    const loaded = this.loaded.get(entryId);
    const source = this.structures.find((item) => item.entryId === entryId);
    if (!plugin || !loaded || !source || this.coordinatePreviews.has(entryId)) return;
    if (channel === "fragment" ? !source.settings.selection_surface : !source.pocket) return;
    if (channel === "pocket" && (this.pocketPreviewEntries.has(entryId) ||
      source.pocket?.seeds.some((seed) => this.pocketPreviewEntries.has(seed.reference.structure_id)))) return;
    // Classify against the complete projection, never the selected fragment.
    const nonpolar = new Set<number>();
    for (const unit of loaded.structure.units) {
      if (!Unit.isAtomic(unit)) continue;
      for (let i = 0; i < unit.elements.length; i++) {
        const element = unit.elements[i];
        if (isHydrogen(loaded.structure, unit, element, "non-polar")) {
          nonpolar.add(loaded.atomIds[unit.model.atomicHierarchy.atomSourceIndex.value(element)]);
        }
      }
    }
    const isolated = this.isolation === null ? null : new Set(this.isolation.filter((atom) => atom.structure_id === entryId).map((atom) => atom.atom_id));
    const visible = visibleRepresentationAtomIds(source, isolated, nonpolar);
    const ids = channel === "fragment" ? source.settings.selection_surface!.atom_ids.filter((id) => visible.has(id))
      : [...new Set(source.hierarchy.components.filter((component) => component.category === "protein")
        .flatMap((component) => componentAtomIds(source.normalized, component)))].sort((a, b) => a - b);
    const targetIds = new Set(ids);
    const loci = this.lociFor(ids.map((atom_id) => ({ structure_id: entryId, atom_id })));
    let revision = this.surfaceSourceRevisions.get(source.normalized);
    if (revision === undefined) {
      revision = ++this.nextSurfaceSourceRevision;
      this.surfaceSourceRevisions.set(source.normalized, revision);
    }
    // Immutable normalized snapshots are coordinate/topology revisions. The exact
    // ordered IDs encode membership and all visibility/isolation/H intersections.
    const dependencyKey = `${channel}:${revision}:${ids.join(",")}:${channel === "pocket" ? `${source.pocket!.dependencyKey}:${source.pocket!.radius}` : SURFACE_PROFILE.id}`;
    if (channel === "pocket" && (!source.settings.components.protein || source.pocket?.unavailable)) {
      this.surfaces.request(entryId, channel, source.label, dependencyKey, null, () => {}, source.pocket?.unavailable); return;
    }
    if (!loci) { this.surfaces.request(entryId, channel, source.label, dependencyKey, null, () => {}, channel === "pocket" ? "No protein context is available." : undefined); return; }
    const component = await plugin.builders.structure.tryCreateComponent(loaded.structureRef, {
      type: { name: "bundle", params: StructureElement.Bundle.fromLoci(loci) },
      nullIfEmpty: true, label: `${source.label} ${channel} surface`,
    }, `selection-surface-${key}`);
    if (!component?.obj) return;
    this.surfaceRefs.set(key, component.ref);
    const binding = {};
    this.surfaceBindings.set(key, binding);
    const notify = (geometry?: SurfaceGeometry) => {
      // Worker completion may arrive during a rebuild. Only the latest component may attach.
      this.syncQueue = this.syncQueue.then(async () => {
        if (this.surfaceBindings.get(key) !== binding || !this.plugin) return;
        const camera = this.getCamera();
        try {
          const displayed = geometry && channel === "pocket" ? isolatePocketSurface(geometry, isolated) : geometry;
          if (channel === "pocket" && !displayed?.indices.length) { this.commitScene(camera); return; }
          if (displayed) attachSurfaceGeometry(component.obj!.data, displayed);
          const repr = geometry ? await plugin.builders.structure.representation.addRepresentation(component, {
            type: SelectionSurfaceProvider, typeParams: { alpha: SURFACE_PROFILE.opacity },
            color: ElementSymbolColorThemeProvider,
          }) : await this.addSurfaceFallback(component.ref);
          if (geometry) {
            this.surfaceMeshEntries.add(key);
            plugin.canvas3d?.setProps({ renderer: { pickingAlphaThreshold: SURFACE_PROFILE.opacity } });
          }
          if (repr) {
            const colors = selectionColorLayers(source.settings.selection_colors, source.normalized.atoms).flatMap((assignment) => {
              const colorLoci = this.lociFor(assignment.atomIds.filter((id) => targetIds.has(id)).map((atom_id) => ({ structure_id: entryId, atom_id })));
              return colorLoci ? [{ bundle: StructureElement.Bundle.fromLoci(colorLoci), color: assignment.color, clear: false }] : [];
            });
            if (colors.length) await plugin.state.data.build().to(repr)
              .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle, { layers: colors }).commit();
          }
          this.applySelection();
          this.commitScene(camera);
        } catch (error) {
          detachSurfaceGeometry(component.obj!.data);
          this.surfaces.fail(entryId, channel, error instanceof Error ? error.message : "Surface upload failed.");
          try {
            const cleanup = plugin.state.data.build();
            plugin.state.data.tree.children.get(component.ref)?.forEach((child) => cleanup.delete(child));
            await cleanup.commit();
            this.surfaceMeshEntries.delete(key);
            if (!this.surfaceMeshEntries.size) plugin.canvas3d?.setProps({ renderer: { pickingAlphaThreshold: 0.5 } });
            if (channel === "fragment") await this.addSurfaceFallback(component.ref);
            this.commitScene(camera);
          } catch {
            this.surfaces.fail(entryId, channel, channel === "pocket" ? "Pocket rendering failed." : "Surface and line rendering failed.", false);
          }
        }
      });
    };
    try {
      const unavailable = source.normalized.atoms.length >= 250_000 ? "Large entry uses reduced detail." : undefined;
      this.surfaces.request(entryId, channel, source.label, dependencyKey,
        unavailable ? null : () => {
          const input = surfaceInput(component.obj!.data, loaded.atomIds);
          if (channel === "pocket") input.pocket = createPocketCrop(source.pocket!.seeds, source.pocket!.radius);
          return input;
        }, notify, unavailable);
    } catch (error) {
      this.surfaces.request(entryId, channel, source.label, dependencyKey, null, notify,
        error instanceof Error ? error.message : "Surface atoms could not be projected.");
    }
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
