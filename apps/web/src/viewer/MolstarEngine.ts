import { OrderedSet } from "molstar/lib/mol-data/int";
import { Loci } from "molstar/lib/mol-model/loci";
import {
  StructureElement,
  Unit,
  type Model,
  type Structure,
} from "molstar/lib/mol-model/structure";
import type { UnitIndex } from "molstar/lib/mol-model/structure/structure/element/util";
import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { ButtonsType } from "molstar/lib/mol-util/input/input-observer";
import type {
  AtomReference,
  SelectionGranularity,
  SelectionMode,
} from "../api/types";
import type {
  MolecularViewer,
  ViewerSelectionEvent,
  ViewerStructure,
} from "./MolecularViewer";

interface LoadedStructure {
  structure: Structure;
  atomIds: number[];
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
  private clickSubscription: { unsubscribe(): void } | undefined;

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
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    const generation = ++this.generation;
    this.syncQueue = this.syncQueue.then(async () => {
      const plugin = this.plugin;
      if (!plugin || generation !== this.generation) return;
      await plugin.clear();
      this.loaded.clear();
      this.models.clear();
      for (const structure of structures) {
        if (generation !== this.generation) return;
        const data = await plugin.builders.data.rawData(
          { data: structure.projection.data, label: structure.label },
          { state: { isGhost: true } },
        );
        const trajectory = await plugin.builders.structure.parseTrajectory(
          data,
          structure.projection.format,
        );
        const preset = await plugin.builders.structure.hierarchy.applyPreset(
          trajectory,
          "default",
        );
        const molstarStructure =
          preset?.structureProperties?.obj?.data ?? preset?.structure.obj?.data;
        if (!molstarStructure) {
          throw new Error(`Mol* could not create a structure for ${structure.label}.`);
        }
        this.loaded.set(structure.entryId, {
          structure: molstarStructure,
          atomIds: structure.atomIds,
        });
        for (const unit of molstarStructure.units) {
          this.models.set(unit.model, {
            entryId: structure.entryId,
            atomIds: structure.atomIds,
          });
        }
      }
      this.applySelection();
      plugin.canvas3d?.requestCameraReset();
    });
    return this.syncQueue;
  }

  setSelection(atoms: AtomReference[]): void {
    this.pendingSelection = atoms;
    this.applySelection();
  }

  setPickingGranularity(granularity: SelectionGranularity): void {
    this.pickingGranularity = granularity;
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
    this.clickSubscription = undefined;
    this.listeners.clear();
    this.loaded.clear();
    this.models.clear();
    this.plugin?.dispose();
    this.plugin = undefined;
  }

  private emit(event: ViewerSelectionEvent): void {
    for (const listener of this.listeners) listener(event);
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
}
