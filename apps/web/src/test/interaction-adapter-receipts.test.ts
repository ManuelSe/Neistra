import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InteractionDisplayOptions, InteractionDisplayState, InteractionRecord } from "../interactions/types";
import { defaultInteractionAppearance } from "../interactions/styles";

const native = vi.hoisted(() => ({
  mounting: undefined as Promise<void> | undefined,
  listeners: new Set<(value: InteractionDisplayState) => void>(),
  interaction: vi.fn<(records: InteractionRecord[], options?: InteractionDisplayOptions) => void>(),
  disposed: vi.fn(),
  current: undefined as InteractionDisplayState | undefined,
}));

vi.mock("../viewer/MolstarEngine", () => ({
  MolstarEngine: class {
    mount() { return native.mounting ?? Promise.resolve(); }
    setBackgroundColor() {}
    setPickingGranularity() {}
    setSelection() {}
    setMovementMode() {}
    setInteractions(records: InteractionRecord[], options?: InteractionDisplayOptions) {
      native.interaction(records, options);
      native.current = {
        displayKey: options?.displayKey ?? "", sceneGeneration: 1, status: "ready", installedRecordKeys: [],
        countsByKind: { clash: 0, hydrogen_bond: 0, hydrophobic: 0, pi_pi: 0, cation_pi: 0, salt_bridge: 0 },
      };
      for (const listener of native.listeners) listener(native.current);
      return Promise.resolve();
    }
    subscribeInteractionDisplay(listener: (value: InteractionDisplayState) => void) {
      native.listeners.add(listener);
      if (native.current) listener(native.current);
      return () => native.listeners.delete(listener);
    }
    dispose() { native.disposed(); }
  },
}));

import { createMolstarViewer } from "../viewer/MolstarViewer";

beforeEach(() => {
  native.mounting = undefined;
  native.current = undefined;
  native.listeners.clear();
  vi.clearAllMocks();
});

describe("lazy interaction display receipts", () => {
  it("reports unready while unmounted and replays the exact presentation request after mount", async () => {
    const viewer = createMolstarViewer(), states: InteractionDisplayState[] = [];
    viewer.subscribeInteractionDisplay!(value => states.push(value));
    const options = { displayKey: "before-mount", appearance: defaultInteractionAppearance() };
    await viewer.setInteractions([], options);
    expect(states.every(value => value.status === "pending")).toBe(true);
    expect(native.interaction).not.toHaveBeenCalled();
    await viewer.mount(document.createElement("div"));
    expect(native.interaction).toHaveBeenLastCalledWith([], options);
    expect(states.at(-1)).toMatchObject({ displayKey: "before-mount", status: "ready", sceneGeneration: 1 });
    viewer.dispose();
  });

  it("does not publish native-ready while mounting and replays the newest pending request", async () => {
    let finish!: () => void;
    native.mounting = new Promise<void>(resolve => { finish = resolve; });
    const viewer = createMolstarViewer(), states: InteractionDisplayState[] = [];
    viewer.subscribeInteractionDisplay!(value => states.push(value));
    await viewer.setInteractions([], { displayKey: "old" });
    const mounting = viewer.mount(document.createElement("div"));
    await vi.waitFor(() => expect(native.mounting).toBeDefined());
    await viewer.setInteractions([], { displayKey: "new" });
    expect(states.some(value => value.status === "ready")).toBe(false);
    finish(); await mounting;
    const ready = states.filter(value => value.status === "ready");
    expect(ready.length).toBeGreaterThan(0);
    expect(ready.every(value => value.displayKey === "new")).toBe(true);
    expect(native.interaction).toHaveBeenLastCalledWith([], { displayKey: "new" });
    viewer.dispose();
  });

  it("clears readiness on disposal and detaches native callbacks", async () => {
    const viewer = createMolstarViewer(), listener = vi.fn<(value: InteractionDisplayState) => void>();
    const release = viewer.subscribeInteractionDisplay!(listener);
    await viewer.mount(document.createElement("div"));
    await viewer.setInteractions([], { displayKey: "active" });
    expect(listener.mock.calls.at(-1)?.[0].status).toBe("ready");
    const retired = [...native.listeners];
    viewer.dispose();
    expect(listener.mock.calls.at(-1)?.[0].status).toBe("pending");
    expect(native.listeners.size).toBe(0);
    const count = listener.mock.calls.length;
    for (const old of retired) old(native.current!);
    expect(listener).toHaveBeenCalledTimes(count);
    release();
    expect(native.disposed).toHaveBeenCalledOnce();
  });
});
