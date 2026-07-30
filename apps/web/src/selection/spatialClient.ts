import type { AtomReference } from "../api/types";
import type { SpatialAtom, SpatialRequest, SpatialResponse } from "./spatial";

let requestId = 0;

export function spatialSelectionInWorker(
  atoms: SpatialAtom[],
  seed: AtomReference[],
  distance: number,
  granularity: "atom" | "residue",
): Promise<AtomReference[]> {
  const worker = new Worker(new URL("./spatial.worker.ts", import.meta.url), {
    type: "module",
  });
  const id = ++requestId;
  const request: SpatialRequest = { id, atoms, seed, distance, granularity };
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<SpatialResponse>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      resolve(event.data.atoms);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Distance selection worker failed."));
    };
    worker.postMessage(request);
  });
}
