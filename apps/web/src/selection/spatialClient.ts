import type { AtomReference } from "../api/types";
import type { SpatialAtom, SpatialRequest, SpatialResponse } from "./spatial";

let requestId = 0;

export function spatialSelectionInWorker(
  atoms: SpatialAtom[],
  seed: AtomReference[],
  distance: number,
  granularity: "atom" | "residue",
  options: { signal?: AbortSignal; preserveOrphans?: boolean } = {},
): Promise<AtomReference[]> {
  options.signal?.throwIfAborted();
  const worker = new Worker(new URL("./spatial.worker.ts", import.meta.url), {
    type: "module",
  });
  const id = ++requestId;
  const request: SpatialRequest = {
    id, atoms, seed, distance, granularity, preserveOrphans: options.preserveOrphans,
  };
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.terminate();
      options.signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Distance expansion cancelled.", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<SpatialResponse>) => {
      if (event.data.id !== id) return;
      cleanup();
      resolve(event.data.atoms);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("Distance selection worker failed."));
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Distance selection could not start."));
    }
  });
}
