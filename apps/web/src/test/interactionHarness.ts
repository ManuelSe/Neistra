import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { createInteractionRepresentation } from "../viewer/interactionGeometry";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { LinesValues } from "molstar/lib/mol-gl/renderable/lines";
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
    objects: native.interactionRepresentation.renderObjects.map(object => {
      const values = object.values as LinesValues;
      const count = values.drawCount.ref.value;
      const vertices = count / 6 * 4;
      return { type: object.type, pickable: object.state.pickable, drawCount: count,
        indexCapacity: values.elements.ref.value.length,
        starts: Array.from(values.aStart.ref.value.slice(0, vertices * 3)),
        ends: Array.from(values.aEnd.ref.value.slice(0, vertices * 3)),
        groups: Array.from(values.aGroup.ref.value.slice(0, vertices)),
        colors: Array.from(values.tColor.ref.value.array),
      };
    }),
    representations: native.plugin?.canvas3d?.reprCount.value ?? 0,
    previews: native.coordinatePreviews.size,
    camera: engine.getCamera(),
  };
}
