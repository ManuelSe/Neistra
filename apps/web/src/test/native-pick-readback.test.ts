import { expect, it, vi } from "vitest";
import { PickHelper } from "molstar/lib/mol-canvas3d/helper/pick-helper";
import { AsyncPickStatus } from "molstar/lib/mol-canvas3d/passes/pick";

function helper(dirty: boolean, status: AsyncPickStatus) {
  let readable = status === AsyncPickStatus.Resolved;
  const result = { id: { objectId: 1, instanceId: 0, groupId: 2 }, position: [1, 2, 3] };
  const buffers = { check: vi.fn(() => status), read: vi.fn(() => { readable = true; }) };
  const render = vi.fn();
  const getPickData = vi.fn(() => readable ? result : undefined);
  const native: PickHelper = Object.assign(Object.create(PickHelper.prototype) as PickHelper, {
    dirty, buffers, render, getPickData, prepare: vi.fn(),
    webgl: { resources: { finalizePrograms: vi.fn() } },
  });
  return { native, buffers, render, result };
}

it.each([AsyncPickStatus.Pending, AsyncPickStatus.Failed])("finishes an unread native pick buffer before a synchronous click (%s)", status => {
  const h = helper(false, status);
  expect(h.native.identify(10, 20, {} as Parameters<PickHelper["identify"]>[2])).toBe(h.result);
  expect(h.buffers.read).toHaveBeenCalledOnce();
  expect(h.render).not.toHaveBeenCalled();
});

it("does not reread or render an already resolved clean pick buffer", () => {
  const h = helper(false, AsyncPickStatus.Resolved);
  expect(h.native.identify(10, 20, {} as Parameters<PickHelper["identify"]>[2])).toBe(h.result);
  expect(h.buffers.read).not.toHaveBeenCalled();
  expect(h.render).not.toHaveBeenCalled();
});

it("retains synchronous rendering and reading of a dirty pick scene", () => {
  const h = helper(true, AsyncPickStatus.Pending);
  expect(h.native.identify(10, 20, {} as Parameters<PickHelper["identify"]>[2])).toBe(h.result);
  expect(h.render).toHaveBeenCalledOnce();
  expect(h.buffers.read).toHaveBeenCalledOnce();
  expect(h.buffers.check).not.toHaveBeenCalled();
});
