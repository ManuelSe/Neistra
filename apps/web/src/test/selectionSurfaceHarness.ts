/** Test-only renderer harness; never imported by the application entry point. */
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { StructureElement, Structure } from "molstar/lib/mol-model/structure";
import { SortedArray } from "molstar/lib/mol-data/int";
import { ElementSymbolColorThemeProvider } from "molstar/lib/mol-theme/color/element-symbol";
import { MolstarEngine } from "../viewer/MolstarEngine";
import type { ViewerStructure, ViewerSelectionEvent } from "../viewer/MolecularViewer";
import { SurfaceCalculator } from "../viewer/surface/client";
import { SelectionSurfaceProvider, surfaceInput, attachSurfaceGeometry } from "../viewer/surface/visual";
import { SURFACE_PROFILE } from "../viewer/surface/protocol";

export async function mountSurfaceHarness(container: HTMLElement, source: ViewerStructure) {
  const engine = new MolstarEngine();
  await engine.mount(container);
  // No inherited geometry: render and pick ONLY the worker-generated surface.
  await engine.syncStructures([{ ...source, settings: { ...source.settings, representations: [] } }]);
  const internals = engine as unknown as { plugin: PluginUIContext; loaded: Map<string, {
    structure: Structure; structureRef: string; atomIds: number[];
  }> };
  const { plugin } = internals;
  const loaded = internals.loaded.get(source.entryId)!;
  const component = await plugin.builders.structure.tryCreateComponent(loaded.structureRef, {
    type: { name: "bundle", params: StructureElement.Bundle.fromLoci(Structure.toStructureElementLoci(loaded.structure)) },
    nullIfEmpty: true, label: "Test selection surface",
  }, "surface-test");
  if (!component?.obj) throw new Error("Missing test component");
  const calculator = new SurfaceCalculator();
  const started = performance.now();
  const input = surfaceInput(component.obj.data, loaded.atomIds);
  let unitId = 0;
  const partitioned = Structure.create(component.obj.data.units.flatMap((unit) => {
    const mid = Math.ceil(unit.elements.length / 2);
    return [Array.from(unit.elements).slice(0, mid), Array.from(unit.elements).slice(mid)].filter((ids) => ids.length)
      .map((ids) => { const id = unitId++; return unit.getChild(SortedArray.ofSortedArray(ids)).getCopy(id, id, id); });
  }));
  const partitionInput = surfaceInput(partitioned, loaded.atomIds);
  const partitionInvariant = (["atomIds", "x", "y", "z", "radii"] as const)
    .every((key) => input[key].every((v, i) => v === partitionInput[key][i]));
  const longTasks: number[] = [];
  const observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => longTasks.push(e.duration)));
  observer.observe({ type: "longtask", buffered: false });
  const geometry = await calculator.compute(input, new AbortController().signal);
  attachSurfaceGeometry(component.obj.data, geometry);
  const representation = await plugin.builders.structure.representation.addRepresentation(component, {
    type: SelectionSurfaceProvider, typeParams: { alpha: SURFACE_PROFILE.opacity }, color: ElementSymbolColorThemeProvider,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  observer.disconnect();
  plugin.canvas3d?.setProps({ renderer: { pickingAlphaThreshold: SURFACE_PROFILE.opacity } });
  const events: ViewerSelectionEvent[] = [];
  engine.subscribeSelection((event) => events.push(event));
  engine.fitVisible();
  return {
    engine, calculator, events, geometry, input,
    readyMs: performance.now() - started,
    units: component.obj.data.units.length, partitionUnits: partitioned.units.length, partitionInvariant,
    longestSurfaceTaskMs: Math.max(0, ...longTasks),
    representation,
    dispose() { calculator.dispose(); engine.dispose(); },
  };
}
