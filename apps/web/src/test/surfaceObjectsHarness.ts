/** Development-only native surface-object qualification. Never imported by the application. */
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { StructureElement, Unit, type Structure } from "molstar/lib/mol-model/structure";
import { OrderedSet } from "molstar/lib/mol-data/int";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { UniformColorThemeProvider } from "molstar/lib/mol-theme/color/uniform";
import type { UnitIndex } from "molstar/lib/mol-model/structure/structure/element/util";
import { Vec2 } from "molstar/lib/mol-math/linear-algebra";
import { MolstarEngine } from "../viewer/MolstarEngine";
import type { ViewerStructure, ViewerSelectionEvent } from "../viewer/MolecularViewer";
import type { SurfaceIdentity, SurfaceVisualRegistry } from "../viewer/surface/objects";
import { SurfaceCalculator } from "../viewer/surface/client";
import { attachSurfaceGeometry, attachSurfaceWireframe, SelectionSurfaceProvider, SelectionSurfaceWireframeProvider, surfaceInput } from "../viewer/surface/visual";
import { surfaceWireframe } from "../viewer/surface/wireframe";
import type { SurfaceGeometry } from "../viewer/surface/protocol";

export async function mountSurfaceObjectsHarness(container: HTMLElement, source: ViewerStructure) {
  const engine = new MolstarEngine();
  await engine.mount(container);
  const internals = engine as unknown as {
    plugin: PluginUIContext; surfaceVisuals: SurfaceVisualRegistry;
    loaded: Map<string, { structure: Structure; structureRef: string; atomIds: number[] }>;
  };
  await engine.syncStructures([{ ...source, settings: { ...source.settings, representations: [], surface_objects: [] }, pockets: undefined }]);
  const { plugin } = internals;
  plugin.representation.structure.registry.add(SelectionSurfaceWireframeProvider);
  const loaded = internals.loaded.get(source.entryId)!;
  const workers = { created: 0, terminated: 0, active: 0, maximum: 0, inputs: 0 };
  const calculator = new SurfaceCalculator(() => {
    const worker = new Worker(new URL("../viewer/surface/surface.worker.ts", import.meta.url), { type: "module" });
    workers.created++; workers.active++; workers.maximum = Math.max(workers.maximum, workers.active);
    const terminate = worker.terminate.bind(worker);
    worker.terminate = () => { workers.terminated++; workers.active--; terminate(); };
    return worker;
  });
  const events: SurfaceIdentity[] = [], molecularEvents: ViewerSelectionEvent[] = [];
  engine.subscribeSurfaceSelection(identity => events.push(identity));
  engine.subscribeSelection(event => molecularEvents.push(event));
  const median = [...source.normalized.atoms.map(a => a.coordinates[0])].sort((a, b) => a - b)[Math.floor(source.atomIds.length / 2)];
  const objects = new Map<string, { component: string; structure: Structure; geometry: SurfaceGeometry;
    representation?: string; unregister?: () => void; color: number; alpha: number; mode: "solid" | "mesh"; displayBytes: number }>();
  const setAppearance = async (id: string, appearance: { color?: number; alpha?: number; mode?: "solid" | "mesh" }) => {
    const object = objects.get(id)!;
    Object.assign(object, appearance);
    object.unregister?.();
    if (object.representation) await plugin.state.data.build().delete(object.representation).commit();
    if (object.mode === "mesh") {
      const lines = await surfaceWireframe(object.geometry, new AbortController().signal, bytes => { object.displayBytes = bytes; });
      attachSurfaceWireframe(object.structure, lines);
    } else { object.displayBytes = 0; attachSurfaceGeometry(object.structure, object.geometry); }
    const repr = await plugin.builders.structure.representation.addRepresentation(object.component, {
      type: object.mode === "mesh" ? SelectionSurfaceWireframeProvider : SelectionSurfaceProvider,
      typeParams: { alpha: object.alpha }, color: UniformColorThemeProvider, colorParams: { value: object.color },
    });
    object.representation = repr.ref;
    object.unregister = internals.surfaceVisuals.register(repr.obj!.data.repr, { entryId: source.entryId, surfaceId: id });
  };
  const pending = ["first", "second"].map(async (id, side) => {
    const elements: StructureElement.Loci["elements"][number][] = [];
    for (const unit of loaded.structure.units) {
      if (!Unit.isAtomic(unit)) continue;
      const indices = Array.from(unit.elements, (element, index) => ({ element, index }))
        .filter(({ element }) => side === 0 ? unit.conformation.x(element) <= median : unit.conformation.x(element) > median)
        .map(({ index }) => index as UnitIndex);
      if (indices.length) elements.push({ unit, indices: OrderedSet.ofSortedArray(indices) });
    }
    const component = await plugin.builders.structure.tryCreateComponent(loaded.structureRef, {
      type: { name: "bundle", params: StructureElement.Bundle.fromLoci(StructureElement.Loci(loaded.structure, elements)) },
      nullIfEmpty: true, label: `Independent ${id}`,
    }, `object-${id}`);
    if (!component?.obj) throw new Error("Surface object component is empty.");
    const geometry = await calculator.compute(() => {
      workers.inputs++;
      return surfaceInput(component.obj!.data, loaded.atomIds);
    }, new AbortController().signal);
    objects.set(id, { component: component.ref, structure: component.obj.data, geometry,
      color: side === 0 ? 0xff2020 : 0x2040ff, alpha: 0.8, mode: "solid", displayBytes: 0 });
    await setAppearance(id, {});
  });
  await Promise.all(pending);
  plugin.canvas3d?.setProps({ renderer: { pickingAlphaThreshold: 0.05 } });
  engine.fitVisible();
  await new Promise(resolve => setTimeout(resolve, 300));
  const selection = [{ structure_id: source.entryId, atom_id: source.atomIds[0] }];
  engine.setSelection(selection);
  const inspect = () => ({ camera: engine.getCamera(), workers: { ...workers }, events: [...events], molecularEvents: [...molecularEvents],
    objects: [...objects].map(([id, object]) => {
      const cell = object.representation && plugin.state.data.cells.get(object.representation);
      const repr = cell ? cell.obj?.data as { repr: Representation.Any } : undefined;
      return { id, alpha: object.alpha, mode: object.mode, color: object.color, displayBytes: object.displayBytes,
        vertices: object.geometry.vertices.length, atoms: [...object.geometry.atomIds],
        drawCounts: repr?.repr.renderObjects.map(ro => ro.values.drawCount.ref.value) ?? [],
        markers: repr?.repr.renderObjects.map(ro => Array.from(ro.values.tMarker.ref.value.array)) ?? [] };
    }) });
  return { engine, setAppearance, inspect, clearActive: () => engine.setActiveSurface(null),
    identify(x: number, y: number) {
      const rect = plugin.canvas3d!.webgl.gl.canvas as HTMLCanvasElement;
      const hit = plugin.canvas3d!.identify(Vec2.create(x * rect.clientWidth, y * rect.clientHeight));
      return internals.surfaceVisuals.identityFor(plugin.canvas3d!.getLoci(hit?.id).repr);
    },
    dispose() { calculator.dispose(); engine.dispose(); } };
}
