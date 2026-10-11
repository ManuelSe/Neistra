import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { createInteractionRepresentation } from "../viewer/interactionGeometry";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { InteractionRecord } from "../interactions/types";

/** Qualification-only native inspection; production never imports this module. */
export async function inspectInteractions(engine: MolstarEngine) {
  const native = engine as unknown as {
    syncQueue: Promise<void>;
    interactionRepresentation: ReturnType<typeof createInteractionRepresentation>;
    interactions: InteractionRecord[];
    coordinatePreviews: Map<string, unknown>;
    plugin?: PluginUIContext;
  };
  await native.syncQueue;
  return {
    records: native.interactions,
    objects: native.interactionRepresentation.renderObjects.map(object => ({ type: object.type, pickable: object.state.pickable, drawCount: object.values.drawCount.ref.value })),
    representations: native.plugin?.canvas3d?.reprCount.value ?? 0,
    previews: native.coordinatePreviews.size,
    camera: engine.getCamera(),
  };
}
