import { ApiError } from "../api/client";
import type { ModelPreview } from "../api/types";

function waitForAdmission(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      const reason: unknown = signal.reason; reject(reason instanceof Error ? reason : new DOMException("Preview cancelled", "AbortError"));
    };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Retry only a disposable preview whose captured payload remains owned. Never use for Apply. */
export async function preparePreview(request: () => Promise<ModelPreview>, signal: AbortSignal): Promise<ModelPreview> {
  const deadline = Date.now() + 4000;
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await request(); }
    catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof ApiError) || error.status !== 429 || error.code !== "editing_busy" || attempt >= 3) throw error;
      const delay = Math.max(1000, error.retryAfterMs ?? 1000);
      if (delay > deadline - Date.now()) throw error;
      await waitForAdmission(delay, signal);
    }
  }
}
