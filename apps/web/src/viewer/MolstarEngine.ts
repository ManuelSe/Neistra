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
import { ButtonsType } from "molstar/lib/mol-util/input/input-observer";
import type {
  AtomReference,
  CameraState,
  ColorScheme,
  CoordinatePatch,
  Point3D,
  RepresentationStyle,
  SelectionGranularity,
  SelectionMode,
} from "../api/types";
import type {
  MolecularViewer,
  ViewerSelectionEvent,
  ViewerStructure,
  ViewerMeasurement,
} from "./MolecularViewer";

interface LoadedStructure {
  entryId: string;
  structure: Structure;
  atomIds: number[];
  coordinateRef: string;
  structureRef: string;
  baseCoordinates: Map<number, Point3D>;
}

export class MolstarEngine implements MolecularViewer {
  private plugin: PluginUIContext | undefined;
  private syncQueue: Promise<void> = Promise.resolve();
  private generation = 0;
  private pickingGranularity: SelectionGranularity = "atom";
  private pendingSelection: AtomReference[] = [];
  private loaded = new Map<string, LoadedStructure>();
  private models = new Map<Model, { entryId: string; atomIds: number[] }>();
  private listeners = new Set<(event: ViewerSelectionEvent) => void>();
  private cameraListeners = new Set<(camera: CameraState) => void>();
  private clickSubscription: { unsubscribe(): void } | undefined;
  private cameraSubscription: { unsubscribe(): void } | undefined;
  private measurementRefs: string[] = [];
  private labelRefs: string[] = [];
  private structures: ViewerStructure[] = [];
  private measurements: ViewerMeasurement[] = [];
  private isolation: AtomReference[] | null = null;

  async mount(target: HTMLElement): Promise<void> {
    this.plugin = await createPluginUI({
      target,
      render: renderReact18,
      spec: {
        ...DefaultPluginUISpec(),
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
    if (!this.plugin.canvas3d) {
      this.plugin.dispose();
      this.plugin = undefined;
      throw new Error(
        "WebGL is unavailable. Enable hardware acceleration or use a browser with WebGL support.",
      );
    }
    this.clickSubscription = this.plugin.behaviors.interaction.click.subscribe(
      ({ current, button, modifiers }) => {
        if (button !== ButtonsType.Flag.Primary) return;
        const mode: SelectionMode = modifiers.alt
          ? "subtract"
          : modifiers.control || modifiers.meta || modifiers.shift
            ? "add"
            : "replace";
        if (Loci.isEmpty(current.loci)) {
          this.emit({ atoms: [], granularity: this.pickingGranularity, mode: "replace" });
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
    this.cameraSubscription = this.plugin.canvas3d.camera.changed.subscribe(() => {
      const camera = this.getCamera();
      if (camera) for (const listener of this.cameraListeners) listener(camera);
    });
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    this.structures = structures;
    const generation = ++this.generation;
    this.syncQueue = this.syncQueue.then(async () => {
      const plugin = this.plugin;
      if (!plugin || generation !== this.generation) return;
      const camera = this.getCamera();
      await plugin.clear();
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
      if (camera && camera.radius > 0) this.setCamera(camera);
      else plugin.canvas3d?.requestCameraReset();
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
      const loaded = this.loaded.get(patch.entry_id);
      if (!loaded || !this.plugin) return;
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
      if (mode === "commit") loaded.baseCoordinates = coordinates;
      await this.updateCoordinates(loaded, coordinates);
    });
    return this.syncQueue;
  }

  clearCoordinatePreview(entryId: string): Promise<void> {
    this.syncQueue = this.syncQueue.then(async () => {
      const loaded = this.loaded.get(entryId);
      if (loaded) await this.updateCoordinates(loaded, loaded.baseCoordinates);
    });
    return this.syncQueue;
  }

  setPickingGranularity(granularity: SelectionGranularity): void {
    this.pickingGranularity = granularity;
  }

  setMeasurements(measurements: ViewerMeasurement[]): Promise<void> {
    this.measurements = measurements;
    this.syncQueue = this.syncQueue.then(() => this.applyMeasurements());
    return this.syncQueue;
  }

  async setIsolation(atoms: AtomReference[] | null): Promise<void> {
    this.isolation = atoms;
    await this.syncStructures(this.structures);
  }

  getCamera(): CameraState | null {
    const snapshot = this.plugin?.canvas3d?.camera.getSnapshot();
    if (!snapshot) return null;
    return {
      mode: snapshot.mode,
      position: [...snapshot.position] as CameraState["position"],
      target: [...snapshot.target] as CameraState["target"],
      up: [...snapshot.up] as CameraState["up"],
      radius: snapshot.radius,
    };
  }

  setCamera(camera: CameraState): void {
    this.plugin?.canvas3d?.camera.setState({
      mode: camera.mode,
      position: Vec3.create(...camera.position),
      target: Vec3.create(...camera.target),
      up: Vec3.create(...camera.up),
      radius: camera.radius,
    });
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

  focusSelection(): void {
    const loci = this.lociFor(this.pendingSelection);
    if (loci) this.plugin?.managers.camera.focusLoci(loci);
  }

  resetCamera(): void {
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

  resize(): void {
    this.plugin?.layout.events.updated.next(undefined);
  }

  dispose(): void {
    this.generation += 1;
    this.clickSubscription?.unsubscribe();
    this.cameraSubscription?.unsubscribe();
    this.clickSubscription = undefined;
    this.listeners.clear();
    this.cameraListeners.clear();
    this.loaded.clear();
    this.models.clear();
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
          structure.normalized.atoms.map((atom) => atom.coordinates),
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
    const isolated = this.isolation?.filter(
      (reference) => reference.structure_id === structure.entryId,
    );
    const components = [];
    if (this.isolation && (!isolated || isolated.length === 0)) return;
    if (isolated?.length) {
      const loci = this.lociFor(isolated);
      if (loci) {
        const component = await plugin.builders.structure.tryCreateComponent(
          structureProperties,
          {
            type: {
              name: "bundle",
              params: StructureElement.Bundle.fromLoci(loci),
            },
            nullIfEmpty: true,
            label: "Isolated selection",
          },
          `isolation-${structure.entryId}`,
        );
        if (component) components.push(component);
      }
    } else {
      const requested = [
        structure.settings.components.protein ? "protein" : null,
        structure.settings.components.ligands ? "ligand" : null,
        structure.settings.components.solvent ? "water" : null,
        structure.settings.components.ions ? "ion" : null,
      ].filter(
        (value): value is "protein" | "ligand" | "water" | "ion" => !!value,
      );
      for (const type of requested) {
        const component =
          await plugin.builders.structure.tryCreateComponentStatic(
            structureProperties,
            type,
            { label: `${structure.label} ${type}` },
          );
        if (component) components.push(component);
      }
      if (components.length === 0) {
        const all = await plugin.builders.structure.tryCreateComponentStatic(
          structureProperties,
          "all",
          { label: structure.label },
        );
        if (all) components.push(all);
      }
    }
    for (const component of components) {
      for (const representation of structure.settings.representations) {
        await plugin.builders.structure.representation.addRepresentation(
          component,
          {
            type: this.representationType(representation.style),
            typeParams: {
              alpha: representation.opacity,
              ignoreHydrogens: !structure.settings.components.hydrogens,
              ...(representation.style === "stick"
                ? { sizeFactor: 0.22, sizeAspectRatio: 0.35 }
                : {}),
            },
            color: this.colorTheme(representation.color_by),
            colorParams:
              representation.color_by === "custom"
                ? {
                    value: Color(
                      Number.parseInt(representation.custom_color.slice(1), 16),
                    ),
                  }
                : undefined,
          },
          { tag: `molweave-representation-${representation.id}` },
        );
      }
    }
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
      for (const atom of structure.normalized.atoms) {
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

  private representationType(style: RepresentationStyle) {
    return {
      cartoon: "cartoon",
      backbone: "backbone",
      line: "line",
      stick: "ball-and-stick",
      "ball-and-stick": "ball-and-stick",
      "space-filling": "spacefill",
      surface: "molecular-surface",
    }[style] as
      | "cartoon"
      | "backbone"
      | "line"
      | "ball-and-stick"
      | "spacefill"
      | "molecular-surface";
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
