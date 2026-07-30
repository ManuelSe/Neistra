import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import type { MolecularViewer, ViewerStructure } from "./MolecularViewer";

export class MolstarEngine implements MolecularViewer {
  private plugin: PluginUIContext | undefined;
  private syncQueue: Promise<void> = Promise.resolve();
  private generation = 0;

  async mount(target: HTMLElement): Promise<void> {
    this.plugin = await createPluginUI({
      target,
      render: renderReact18,
      spec: {
        ...DefaultPluginUISpec(),
        layout: {
          initial: {
            isExpanded: false,
            showControls: false,
          },
        },
        components: {
          controls: {
            top: "none",
            left: "none",
            right: "none",
            bottom: "none",
          },
          remoteState: "none",
          disableDragOverlay: true,
        },
      },
    });
    if (!this.plugin.canvas3d) {
      this.plugin.dispose();
      this.plugin = undefined;
      throw new Error(
        "WebGL is unavailable. Enable hardware acceleration or use a browser with WebGL support.",
      );
    }
  }

  syncStructures(structures: ViewerStructure[]): Promise<void> {
    const generation = ++this.generation;
    this.syncQueue = this.syncQueue.then(async () => {
      const plugin = this.plugin;
      if (!plugin || generation !== this.generation) return;
      await plugin.clear();
      for (const structure of structures) {
        if (generation !== this.generation) return;
        const data = await plugin.builders.data.rawData(
          { data: structure.projection.data, label: structure.label },
          { state: { isGhost: true } },
        );
        const trajectory = await plugin.builders.structure.parseTrajectory(
          data,
          structure.projection.format,
        );
        await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default");
      }
      plugin.canvas3d?.requestCameraReset();
    });
    return this.syncQueue;
  }

  resize(): void {
    this.plugin?.layout.events.updated.next(undefined);
  }

  dispose(): void {
    this.generation += 1;
    this.plugin?.dispose();
    this.plugin = undefined;
  }
}
