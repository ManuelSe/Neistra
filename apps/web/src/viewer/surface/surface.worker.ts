import { computeSurface } from "./geometry";
import type { SurfaceInput, SurfaceWorkerResponse } from "./protocol";

const send = (response: SurfaceWorkerResponse, transfer: Transferable[] = []) => postMessage(response, { transfer });
onmessage = async (event: MessageEvent<SurfaceInput>) => {
  try {
    const geometry = await computeSurface(event.data, (message) => send({ kind: "progress", message }));
    send({ kind: "complete", geometry }, [geometry.vertices.buffer, geometry.normals.buffer,
      geometry.indices.buffer, geometry.groups.buffer, geometry.atomIds.buffer]);
  } catch (error) {
    send({ kind: "error", message: error instanceof Error ? error.message : "Surface calculation failed." });
  }
};
