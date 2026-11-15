import { Vec3, Vec4 } from "molstar/lib/mol-math/linear-algebra";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { ViewerSelectionEvent } from "../viewer/MolecularViewer";
import type { Structure } from "molstar/lib/mol-model/structure";

/** Read element identities from the installed native model, without changing it. */
export async function displayedElements(engine: MolstarEngine, entryId: string) {
  const native = engine as unknown as { syncQueue: Promise<void>;
    loaded: Map<string, { structure: Structure; atomIds: number[] }> };
  await native.syncQueue;
  const loaded = native.loaded.get(entryId), model = loaded?.structure.models[0];
  if (!loaded || !model) return [];
  return Array.from({ length: model.atomicHierarchy.atoms._rowCount }, (_, row) => ({
    atom_id: loaded.atomIds[model.atomicHierarchy.atomSourceIndex.value(row)],
    element: model.atomicHierarchy.atoms.type_symbol.value(row),
  }));
}

/** Native observation only; production never imports this qualification module. */
export async function observeEditPicks(engine: MolstarEngine) {
  const native = engine as unknown as { plugin: PluginUIContext; syncQueue: Promise<void> };
  await native.syncQueue;
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const events: { kind: string; selection?: ViewerSelectionEvent }[] = [];
  const stopSelection = engine.subscribeSelection(selection => {
    events.push({ kind: "selection", selection });
  });
  const clicks = native.plugin.behaviors.interaction.click.subscribe(({ current }) => {
    events.push({ kind: current.loci.kind });
  });
  return {
    events,
    settled: async () => {
      await native.syncQueue;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      while (native.plugin.canvas3d?.camera.transition.inTransition) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    },
    camera: () => engine.getCamera(),
    point: (coordinates: [number, number, number]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(".molstar-host canvas")!;
      const box = canvas.getBoundingClientRect();
      const projected = native.plugin.canvas3d!.camera.project(Vec4(), Vec3.create(...coordinates));
      return { x: projected[0] * box.width / canvas.width,
        y: (canvas.height - projected[1]) * box.height / canvas.height };
    },
    dispose: () => { stopSelection(); clicks.unsubscribe(); },
  };
}
