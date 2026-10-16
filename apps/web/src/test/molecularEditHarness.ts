import { Vec3, Vec4 } from "molstar/lib/mol-math/linear-algebra";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { ViewerSelectionEvent } from "../viewer/MolecularViewer";

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
