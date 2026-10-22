import { useMinimizationStore } from "../minimization/store";
import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { AtomReference } from "../api/types";

export interface QuickTiming { commandAcceptedMs: number; nativeAppliedMs: number; longestTaskMs: number }
/** Observe trusted input, real canonical coordinate publication and next native paint. */
export function measureQuickPublication(engine: MolstarEngine, atoms: AtomReference[]): Promise<QuickTiming> {
  const native = engine as unknown as { syncQueue: Promise<void>; loaded: Map<string, { baseCoordinates: Map<number, number[]> }> };
  const baseline = atoms.map(a => native.loaded.get(a.structure_id)?.baseCoordinates.get(a.atom_id)?.slice());
  return new Promise((resolve, reject) => {
    const input = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m" || !event.ctrlKey) return;
      window.removeEventListener("keydown", input, true);
      if (!event.isTrusted) { reject(new Error("Trusted input required")); return; }
      const start = performance.now(); let commandAcceptedMs = -1, generation: number | null = null, longestTaskMs = 0;
      const tasks = new PerformanceObserver(list => { for (const entry of list.getEntries()) longestTaskMs = Math.max(longestTaskMs, entry.duration); });
      tasks.observe({ type: "longtask", buffered: false });
      // Quiet operation has no panel/progress feedback. Observe acceptance of the
      // trusted command, independently from real canonical publication/paint below.
      const unsubscribe = useMinimizationStore.subscribe(state => {
        if (generation === null && state.loading && state.autoApply) {
          generation = state.generation;
          commandAcceptedMs = performance.now() - start;
        }
      });
      const sample = () => {
        const state = useMinimizationStore.getState();
        const applied = state.generation === generation && state.applied;
        const changed = atoms.some((a, i) => {
          const point = native.loaded.get(a.structure_id)?.baseCoordinates.get(a.atom_id);
          return point && baseline[i] && point.some((v, axis) => v !== baseline[i]![axis]);
        });
        if (applied && changed) void native.syncQueue.then(() => requestAnimationFrame(() => {
          unsubscribe(); tasks.disconnect(); resolve({ commandAcceptedMs, nativeAppliedMs: performance.now() - start, longestTaskMs });
        }), (error: unknown) => { unsubscribe(); tasks.disconnect(); reject(error instanceof Error ? error : new Error("Native coordinate synchronization failed")); });
        else if (performance.now() - start > 30_000) { unsubscribe(); tasks.disconnect(); reject(new Error("Quick publication did not reach native canonical geometry")); }
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    window.addEventListener("keydown", input, true);
  });
}
