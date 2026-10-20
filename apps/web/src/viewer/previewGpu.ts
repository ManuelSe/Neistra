import type { WebGLContext } from "molstar/lib/mol-gl/webgl/context";

type PreviewGpu = Pick<WebGLContext, "getFenceSync" | "checkSyncStatus" | "deleteSync" | "isContextLost"> & { gl: { flush(): void } };

/** Avoid blocking dynamic-buffer uploads on the previous draw. Cancellation and
 * disposal release the fence; a lost/stalled context cannot leave a polling loop. */
export function preparePreviewGpu(gpu: PreviewGpu, signal: AbortSignal): Promise<void> {
  if (signal.aborted || gpu.isContextLost) return Promise.resolve();
  const fence = gpu.getFenceSync();
  if (!fence) return Promise.resolve(); // WebGL1 retains the existing update path.
  gpu.gl.flush();
  return new Promise((resolve, reject) => {
    const start = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      clearTimeout(timer); signal.removeEventListener("abort", abort); gpu.deleteSync(fence);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish();
    const check = () => {
      if (signal.aborted || gpu.isContextLost || gpu.checkSyncStatus(fence)) finish();
      else if (performance.now() - start >= 2000) finish(new Error("Coordinate preview paused: the GPU did not become ready within two seconds."));
      else timer = setTimeout(check, 8);
    };
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}
