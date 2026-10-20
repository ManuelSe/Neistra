import { afterEach, expect, it, vi } from "vitest";
import { preparePreviewGpu } from "../viewer/previewGpu";

afterEach(() => vi.useRealTimers());
function gpu() {
  const fence = {} as WebGLSync;
  return { isContextLost: false, getFenceSync: () => fence, checkSyncStatus: vi.fn(() => false), deleteSync: vi.fn(), gl: { flush: vi.fn() } };
}
it("yields during a GPU draw, then releases the fence before preview work", async () => {
  vi.useFakeTimers(); const device = gpu(); let ready = false;
  const pending = preparePreviewGpu(device, new AbortController().signal).then(() => { ready = true; });
  await vi.advanceTimersByTimeAsync(16); expect(ready).toBe(false);
  device.checkSyncStatus.mockReturnValue(true);
  await vi.advanceTimersByTimeAsync(8); await pending;
  expect(ready).toBe(true); expect(device.deleteSync).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("cancellation or context loss cleans up without reviving the renderer", async () => {
  vi.useFakeTimers(); const device = gpu(), owner = new AbortController();
  const pending = preparePreviewGpu(device, owner.signal); owner.abort(); await pending;
  expect(device.deleteSync).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  device.deleteSync.mockClear();
  const lost = preparePreviewGpu(device, new AbortController().signal); device.isContextLost = true;
  await vi.advanceTimersByTimeAsync(8); await lost;
  expect(device.deleteSync).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("bounds a stalled GPU and retains the WebGL1 no-fence path", async () => {
  vi.useFakeTimers(); const device = gpu();
  const rejected = expect(preparePreviewGpu(device, new AbortController().signal)).rejects.toThrow("two seconds");
  await vi.advanceTimersByTimeAsync(2000); await rejected;
  expect(device.deleteSync).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  await preparePreviewGpu({ ...device, getFenceSync: () => null }, new AbortController().signal);
});
