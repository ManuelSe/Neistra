/** Development-only native surface-object qualification. Never imported by the application. */
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { Unit, type Structure } from "molstar/lib/mol-model/structure";
import type { Representation } from "molstar/lib/mol-repr/representation";
import { Vec2 } from "molstar/lib/mol-math/linear-algebra";
import type { SurfaceObject } from "../api/types";
import type { ViewerStructure, ViewerSelectionEvent } from "../viewer/MolecularViewer";
import type { SurfaceIdentity, SurfaceVisualRegistry } from "../viewer/surface/objects";
import { surfaceKey, type SurfaceGeometry } from "../viewer/surface/protocol";
import { mountProductionSurfaceHarness } from "./selectionSurfaceHarness";

export async function mountSurfaceObjectsHarness(container: HTMLElement, source: ViewerStructure) {
  const originalWorker = window.Worker;
  // Preserve the native method and invoke it with an explicit worker receiver.
  const originalPost = Reflect.get(originalWorker.prototype, "postMessage");
  let inputs = 0;
  originalWorker.prototype.postMessage = function(this: Worker, message: unknown, ...args: [Transferable[]] | [StructuredSerializeOptions?]) {
    if (message && typeof message === "object" && "x" in message && message.x instanceof Float64Array
      && "atomIds" in message && message.atomIds instanceof Uint32Array) inputs++;
    Reflect.apply(originalPost, this, [message, ...args]);
  };
  let mounted: Awaited<ReturnType<typeof mountProductionSurfaceHarness>> | undefined;
  try {
    const h = await mountProductionSurfaceHarness(container, { ...source,
      settings: { ...source.settings, representations: [], surface_objects: [] }, pockets: undefined });
    mounted = h;
    const { engine } = h;
    const internals = engine as unknown as {
      plugin: PluginUIContext; surfaceVisuals: SurfaceVisualRegistry;
      loaded: Map<string, { structure: Structure; atomIds: number[] }>;
      surfaceBindings: Map<string, { representationRef?: string; mapped?: SurfaceGeometry; mappingBytes: number }>;
      surfaces: { requests: Map<string, { displayBytes: number }> };
    };
    const { plugin } = internals;
    const loaded = internals.loaded.get(source.entryId)!;
    // Frame the fixture explicitly before its first visible object. A valid
    // retained pose prevents first-surface commits from queuing competing fits.
    const canvas = plugin.canvas3d!;
    canvas.commit(true);
    const initial = canvas.camera.getSnapshot(), sphere = loaded.structure.boundary.sphere;
    const radius = sphere.radius + 4;
    const focus = canvas.camera.getFocus(sphere.center, radius);
    if (!focus.position || !focus.target) throw new Error("The fixture camera could not be framed.");
    const up = focus.up ?? initial.up;
    engine.setCamera({ mode: initial.mode, radius,
      position: [focus.position[0], focus.position[1], focus.position[2]],
      target: [focus.target[0], focus.target[1], focus.target[2]], up: [up[0], up[1], up[2]] });
    const events: SurfaceIdentity[] = [], molecularEvents: ViewerSelectionEvent[] = [];
    const picks: { kind: string; surface: SurfaceIdentity | null; page: number[] | undefined }[] = [];
    let hovered: SurfaceIdentity | null = null;
    const hover = plugin.behaviors.interaction.hover.subscribe(({ current }) => { hovered = internals.surfaceVisuals.identityFor(current.repr); });
    const click = plugin.behaviors.interaction.click.subscribe(({ current, page }) => {
      picks.push({ kind: current.loci.kind, surface: internals.surfaceVisuals.identityFor(current.repr), page });
    });
    const unsubscribeSurface = engine.subscribeSurfaceSelection(identity => events.push(identity));
    const unsubscribeMolecule = engine.subscribeSelection(event => molecularEvents.push(event));

    // Capture membership from the actual loaded coordinate frame and map it back
    // into canonical IDs. Production creates and owns the components and visuals.
    const centers = new Map<number, number>();
    for (const unit of loaded.structure.units) {
      if (!Unit.isAtomic(unit)) continue;
      for (let index = 0; index < unit.elements.length; index++) {
        const element = unit.elements[index];
        const id = loaded.atomIds[unit.model.atomicHierarchy.atomSourceIndex.value(element)];
        if (id === undefined) throw new Error("Surface fixture atom identity is unavailable.");
        centers.set(id, unit.conformation.x(element));
      }
    }
    const xs = [...centers.values()].sort((a, b) => a - b), median = xs[Math.floor(xs.length / 2)];
    const objects: SurfaceObject[] = ["first", "second"].map((id, side) => {
      const atom_ids = [...centers].filter(([, x]) => side === 0 ? x <= median : x > median)
        .map(([atomId]) => atomId).sort((a, b) => a - b);
      if (!atom_ids.length) throw new Error("Surface object fixture has an empty half.");
      return { id, name: `Independent ${id}`, visible: true,
        source: { kind: "fragment", profile: "molecular-v1", atom_ids },
        appearance: { color_by: "custom", custom_color: side === 0 ? "#ff2020" : "#2040ff",
          opacity: 0.8, mode: "solid", inherit_atom_colors: false } };
    });
    h.source.settings.surface_objects = objects;
    await h.sync([h.source]);
    engine.setSelection([{ structure_id: source.entryId, atom_id: source.atomIds[0] }]);
    canvas.commit(true);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    const setAppearance = async (id: string, appearance: { color?: number; alpha?: number; mode?: "solid" | "mesh" }) => {
      if (!h.source.settings.surface_objects.some(surface => surface.id === id)) throw new Error("Unknown surface fixture object.");
      if (appearance.color !== undefined && (!Number.isInteger(appearance.color) || appearance.color < 0 || appearance.color > 0xffffff)) throw new Error("Invalid surface fixture color.");
      h.source.settings.surface_objects = h.source.settings.surface_objects.map(surface => surface.id !== id ? surface : {
        ...surface, appearance: { ...surface.appearance,
          ...(appearance.color === undefined ? {} : { color_by: "custom" as const, custom_color: `#${appearance.color.toString(16).padStart(6, "0")}` }),
          ...(appearance.alpha === undefined ? {} : { opacity: appearance.alpha }),
          ...(appearance.mode === undefined ? {} : { mode: appearance.mode }),
        },
      });
      await h.sync([h.source]);
    };
    const inspect = () => ({ camera: plugin.canvas3d!.camera.getSnapshot(), picks: [...picks], hovered,
      workers: { ...h.workers, inputs }, events: [...events], molecularEvents: [...molecularEvents],
      objects: h.source.settings.surface_objects.map(surface => {
        const key = surfaceKey(source.entryId, surface.source.kind, surface.id);
        const binding = internals.surfaceBindings.get(key), geometry = binding?.mapped;
        const cell = binding?.representationRef ? plugin.state.data.cells.get(binding.representationRef) : undefined;
        const repr = cell?.obj?.data as { repr: Representation.Any } | undefined;
        return { id: surface.id, alpha: surface.appearance.opacity, mode: surface.appearance.mode,
          color: Number.parseInt(surface.appearance.custom_color.slice(1), 16),
          displayBytes: internals.surfaces.requests.get(key)?.displayBytes ?? 0, mappingBytes: binding?.mappingBytes ?? 0,
          vertices: geometry?.vertices.length ?? 0, atoms: geometry ? [...geometry.atomIds] : [],
          drawCounts: repr?.repr.renderObjects.map(object => object.values.drawCount.ref.value) ?? [],
          markers: repr?.repr.renderObjects.map(object => Array.from(object.values.tMarker.ref.value.array)) ?? [],
        };
      }) });
    let disposed = false;
    return { engine, setAppearance, inspect, clearActive: () => engine.setActiveSurface(null),
      identify(x: number, y: number) {
        const rect = plugin.canvas3d!.webgl.gl.canvas as HTMLCanvasElement;
        const hit = plugin.canvas3d!.identify(Vec2.create(x * rect.clientWidth, y * rect.clientHeight));
        return internals.surfaceVisuals.identityFor(plugin.canvas3d!.getLoci(hit?.id).repr);
      },
      dispose() {
        if (disposed) return; disposed = true;
        hover.unsubscribe(); click.unsubscribe(); unsubscribeSurface(); unsubscribeMolecule();
        h.dispose(); originalWorker.prototype.postMessage = originalPost;
      } };
  } catch (error) {
    mounted?.dispose(); window.Worker = originalWorker; originalWorker.prototype.postMessage = originalPost;
    throw error;
  }
}
