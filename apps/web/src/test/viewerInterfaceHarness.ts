/** Native qualification only. Never imported by the application. */
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects";
import { StateTransforms } from "molstar/lib/mol-plugin-state/transforms";
import { PluginCommands } from "molstar/lib/mol-plugin/commands";
import { Task } from "molstar/lib/mol-task";
import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { ViewerStructure } from "../viewer/MolecularViewer";

function native(engine: MolstarEngine) {
  return engine as unknown as { plugin: PluginUIContext | undefined; syncQueue: Promise<void>; structures: ViewerStructure[] };
}

export async function inspectViewerAnnotations(engine: MolstarEngine) {
  const context = native(engine);
  await context.syncQueue;
  const { plugin } = context;
  // A replacement engine is observable before its asynchronous mount completes.
  if (!plugin) return [];
  const kinds = [
    ["distance", StateTransforms.Representation.StructureSelectionsDistance3D],
    ["angle", StateTransforms.Representation.StructureSelectionsAngle3D],
    ["dihedral", StateTransforms.Representation.StructureSelectionsDihedral3D],
    ["label", StateTransforms.Representation.StructureSelectionsLabel3D],
  ] as const;
  return [...plugin.state.data.cells.values()].flatMap(cell => {
    const kind = kinds.find(([, transformer]) => cell.transform.transformer === transformer)?.[0];
    if (!kind || !PluginStateObject.Shape.Representation3D.is(cell.obj)) return [];
    const params = cell.transform.params as { customText?: string };
    return [{ kind, text: params.customText ?? "", textDrawCount: cell.obj.data.repr.renderObjects
      .filter(object => object.type === "text" && object.state.visible)
      .reduce((sum, object) => sum + object.values.drawCount.ref.value, 0) }];
  });
}

export async function rebuildViewerAppearance(engine: MolstarEngine) {
  const sources = native(engine).structures;
  const camera = engine.getCamera();
  await engine.syncStructures(sources.map(source => ({ ...source, settings: {
    ...source.settings,
    representations: source.settings.representations.map(representation => ({ ...representation, style: "space-filling" })),
  } })));
  const changed = await inspectViewerAnnotations(engine);
  await engine.syncStructures(sources);
  return { changed, restored: await inspectViewerAnnotations(engine), camera, restoredCamera: engine.getCamera() };
}

export async function startNativeFeedback(engine: MolstarEngine) {
  const { plugin } = native(engine);
  if (!plugin) throw new Error("Native qualification requires a mounted viewer.");
  await PluginCommands.Toast.Show(plugin, { key: "qualification", title: "Native toast qualification", message: "Must not mount native UI" });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let ready!: () => void;
  const reported = new Promise<void>(resolve => { ready = resolve; });
  let overlayReports = 0;
  const progress = plugin.managers.task.events.progress.subscribe(event => { if (event.useOverlay) overlayReports++; });
  const task = plugin.runTask(Task.create("Native task qualification", async ctx => {
    await ctx.update({ message: "Must not mount native task UI", canAbort: false });
    ready(); await pending;
  }), { useOverlay: true });
  await reported;
  return {
    overlayReports, toastEntries: plugin.managers.toast.state.entries.size,
    stop: async () => {
      release(); await task; progress.unsubscribe();
      await PluginCommands.Toast.Hide(plugin, { key: "qualification" });
    },
  };
}
