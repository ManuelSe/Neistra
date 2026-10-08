import { act, cleanup, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { captureGroupScope } from "../groups/membership";
import { useGroupDrag } from "../groups/useGroupDrag";
import { canonicalSelection } from "../selection/selection";
import { molecularProject } from "./molecular-fixtures";

afterEach(cleanup);
function dragEvent(): DragEvent {
  return { preventDefault: vi.fn(), dataTransfer: { effectAllowed: "none", dropEffect: "none", setData: vi.fn(), getData: () => '["forged"]' } } as unknown as DragEvent;
}
const project = molecularProject();
const scope = captureGroupScope(project, canonicalSelection([{ structure_id: "protein", atom_id: 1 }]), "protein", new Set(["protein"]));

it("ignores external payloads, consumes one captured batch, and clears obsolete context", () => {
  const onMove = vi.fn();
  const { result, rerender } = renderHook(({ state }) => useGroupDrag(state, false, onMove), { initialProps: { state: project } });
  act(() => result.current.target(null).onDrop(dragEvent()));
  expect(onMove).not.toHaveBeenCalled();
  act(() => result.current.start(scope, dragEvent()));
  expect(result.current.scope?.entryIds).toEqual(["protein"]);
  act(() => result.current.target("group-1").onDrop(dragEvent()));
  expect(onMove).toHaveBeenCalledExactlyOnceWith(scope, "group-1");
  act(() => result.current.target("group-1").onDrop(dragEvent()));
  expect(onMove).toHaveBeenCalledTimes(1);
  act(() => result.current.start(scope, dragEvent()));
  rerender({ state: { ...project, revision: project.revision + 1 } });
  expect(result.current.scope).toBeNull();
  act(() => result.current.target(null).onDrop(dragEvent()));
  expect(onMove).toHaveBeenCalledTimes(1);
});

it("cancels on Escape, drag end, project change and pending operations", () => {
  const onMove = vi.fn();
  const { result, rerender } = renderHook(({ state, busy }) => useGroupDrag(state, busy, onMove), { initialProps: { state: project, busy: false } });
  act(() => result.current.start(scope, dragEvent()));
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(result.current.scope).toBeNull();
  act(() => result.current.start(scope, dragEvent()));
  act(() => result.current.cancel());
  expect(result.current.scope).toBeNull();
  act(() => result.current.start(scope, dragEvent()));
  rerender({ state: { ...project, id: "other" }, busy: false });
  expect(result.current.scope).toBeNull();
  rerender({ state: project, busy: true });
  const event = dragEvent();
  const preventDefault = vi.fn();
  event.preventDefault = preventDefault;
  act(() => result.current.start(scope, event));
  expect(preventDefault).toHaveBeenCalled();
  expect(result.current.scope).toBeNull();
  expect(onMove).not.toHaveBeenCalled();
});
