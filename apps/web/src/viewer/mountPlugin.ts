import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { Plugin } from "molstar/lib/mol-plugin-ui/plugin";
import type { PluginUISpec } from "molstar/lib/mol-plugin-ui/spec";

/** The ordinary plugin context and canvas, with an explicitly owned React root. */
export async function mountViewerPlugin(target: HTMLElement, spec: PluginUISpec) {
  const plugin = new PluginUIContext(spec);
  const root = createRoot(target);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    // A parent React cleanup may be committing. Leave that commit before
    // unmounting this root so canvas subscriptions finish before the context.
    queueMicrotask(() => {
      try { root.unmount(); }
      finally { plugin.dispose(); }
    });
  };
  try {
    // Observe rejection even when initialization fails before the canvas mounts.
    void plugin.initialized.catch(() => undefined);
    await plugin.init();
    root.render(createElement(Plugin, { plugin }));
    try {
      await plugin.canvas3dInitialized;
    } catch (cause) {
      throw new Error("WebGL is unavailable. Enable hardware acceleration or use a browser with WebGL support.", { cause });
    }
    if (!plugin.canvas3d) throw new Error("The molecular canvas could not start.");
    return { plugin, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
