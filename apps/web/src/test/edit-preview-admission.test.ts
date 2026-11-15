import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { ModelPreview } from "../api/types";
import { preparePreview } from "../editing/preview";
const busy = (retryAfterMs = 1000) => new ApiError(429, "editing_busy", "busy", undefined, undefined, retryAfterMs);
afterEach(() => vi.useRealTimers());
it("retries only preview admission with the identical captured request within a bounded budget", async () => {
  vi.useFakeTimers(); const value = {} as ModelPreview, request = vi.fn().mockRejectedValueOnce(busy()).mockResolvedValue(value);
  const pending = preparePreview(request, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(999); expect(request).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1); expect(await pending).toBe(value); expect(request).toHaveBeenCalledTimes(2);
});
it("honors server retry delay and stops after four attempts", async () => {
  vi.useFakeTimers(); const request = vi.fn().mockRejectedValue(busy()), pending = preparePreview(request, new AbortController().signal);
  const failure = expect(pending).rejects.toMatchObject({ code: "editing_busy" });
  await vi.advanceTimersByTimeAsync(5000); await failure; expect(request).toHaveBeenCalledTimes(4);
  const longDelay = vi.fn().mockRejectedValue(busy(5000)); await expect(preparePreview(longDelay, new AbortController().signal)).rejects.toThrow("busy"); expect(longDelay).toHaveBeenCalledOnce();
});
it("retires a superseded proposal during admission wait without another request", async () => {
  vi.useFakeTimers(); const request = vi.fn().mockRejectedValue(busy()), abort = new AbortController();
  const pending = preparePreview(request, abort.signal), failure = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(100); abort.abort(); await failure; await vi.advanceTimersByTimeAsync(5000);
  expect(request).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it.each([new ApiError(500, "failed", "failed"), new ApiError(429, "other", "other"), new TypeError("network")])("never retries non-admission errors: %s", async error => {
  const request = vi.fn().mockRejectedValue(error); await expect(preparePreview(request, new AbortController().signal)).rejects.toBe(error); expect(request).toHaveBeenCalledOnce();
});
