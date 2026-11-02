import { act, render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { NeistraViewport } from "../viewer/viewport";
import { mountViewerPlugin } from "../viewer/mountPlugin";

const native = vi.hoisted(() => ({ dispose: vi.fn(), initError: false, canvasError: false, props: vi.fn<(props: { logo?: unknown; noWebGl: () => null }) => void>() }));
vi.mock("molstar/lib/mol-plugin-ui/context", () => ({
  PluginUIContext: class {
    initialized = Promise.resolve();
    canvas3dInitialized = Promise.resolve().then(() => { if (native.canvasError) throw new Error("No GPU"); });
    canvas3d = {};
    init = () => native.initError ? Promise.reject(new Error("Initialization failed")) : Promise.resolve();
    dispose = native.dispose;
  },
}));
vi.mock("molstar/lib/mol-plugin-ui/plugin", () => ({ Plugin: () => <canvas /> }));
vi.mock("molstar/lib/mol-plugin-ui/viewport/canvas", () => ({
  ViewportCanvas: (props: { logo?: unknown; noWebGl: () => null }) => { native.props(props); return <canvas />; },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); native.initError = false; native.canvasError = false; });

it("composes only the canvas without logo or native error text", () => {
  const { container } = render(<NeistraViewport />);
  expect(container.querySelectorAll("canvas")).toHaveLength(1);
  expect(container.textContent).toBe("");
  const props = native.props.mock.calls[0][0];
  expect(props.logo).toBeUndefined();
  expect(props.noWebGl()).toBeNull();
});

it("unmounts the owned root and disposes the plugin exactly once", async () => {
  const target = document.createElement("div");
  document.body.append(target);
  let mounted!: Awaited<ReturnType<typeof mountViewerPlugin>>;
  await act(async () => { mounted = await mountViewerPlugin(target, DefaultPluginUISpec()); });
  expect(target.querySelector("canvas")).not.toBeNull();
  act(() => { mounted.dispose(); mounted.dispose(); });
  expect(target).toBeEmptyDOMElement();
  expect(native.dispose).toHaveBeenCalledOnce();
  target.remove();
});

it.each(["initError", "canvasError"] as const)("cleans up %s and reports an application error", async kind => {
  native[kind] = true;
  const target = document.createElement("div");
  await act(async () => {
    await expect(mountViewerPlugin(target, DefaultPluginUISpec())).rejects.toThrow(kind === "initError" ? "Initialization failed" : "WebGL is unavailable");
  });
  expect(native.dispose).toHaveBeenCalledOnce();
  expect(target).toBeEmptyDOMElement();
});
