import { expect, it } from "vitest";
import { inspectInteractions } from "./interactionHarness";
import type { MolstarEngine } from "../viewer/MolstarEngine";
import { INTERACTION_KINDS } from "../interactions/types";

function engine(queue: Promise<void>): MolstarEngine {
  return { syncQueue: queue, interactionRepresentation: { renderObjects: [] }, interactions: [],
    interactionDisplayKey: "current", generation: 1, coordinatePreviews: new Map(), getCamera: () => null,
    interactionDisplayState: { displayKey: "current", sceneGeneration: 1, status: "error", installedRecordKeys: [],
      countsByKind: Object.fromEntries(INTERACTION_KINDS.map(kind => [kind, 0])) },
  } as unknown as MolstarEngine;
}

it("fails normal native inspection on an unexpected renderer rejection", async () => {
  const refusal = new Error("Unexpected native failure");
  await expect(inspectInteractions(engine(Promise.reject(refusal)))).rejects.toBe(refusal);
});

it("requires explicit error inspection and preserves its diagnostic code", async () => {
  const refusal = Object.assign(new Error("Expected drawing refusal"), { code: "interaction_geometry_limit" });
  await expect(inspectInteractions(engine(Promise.reject(refusal)), { allowQueueError: true }))
    .resolves.toMatchObject({ queueError: "Expected drawing refusal", queueErrorCode: "interaction_geometry_limit" });
  await expect(inspectInteractions(engine(Promise.resolve())))
    .resolves.toMatchObject({ queueError: null, queueErrorCode: null });
});
