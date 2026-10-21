import type { MolstarEngine } from "../viewer/MolstarEngine";
import type { AtomReference } from "../api/types";

export interface QuickTiming { feedbackMs: number; nativeAppliedMs: number; longestTaskMs: number }
/** Observe trusted input, real canonical coordinate publication and next native paint. */
export function measureQuickPublication(engine: MolstarEngine, atoms: AtomReference[]): Promise<QuickTiming> {
  const native = engine as unknown as { syncQueue: Promise<void>; loaded: Map<string, { baseCoordinates: Map<number, number[]> }> };
  const baseline = atoms.map(a => native.loaded.get(a.structure_id)?.baseCoordinates.get(a.atom_id)?.slice());
  return new Promise((resolve, reject) => {
    const input = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m" || !event.ctrlKey) return;
      window.removeEventListener("keydown", input, true);
      if (!event.isTrusted) { reject(new Error("Trusted input required")); return; }
      const start = performance.now(); let feedbackMs = -1, longestTaskMs = 0;
      const tasks = new PerformanceObserver(list => { for (const entry of list.getEntries()) longestTaskMs = Math.max(longestTaskMs, entry.duration); });
      tasks.observe({ type: "longtask", buffered: false });
      const observer = new MutationObserver(() => {
        if (feedbackMs < 0 && document.querySelector(".minimization-panel")) feedbackMs = performance.now() - start;
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const sample = () => {
        const applied = document.querySelector(".minimization-panel")?.textContent?.includes("Quick coordinates applied");
        const changed = atoms.some((a, i) => {
          const point = native.loaded.get(a.structure_id)?.baseCoordinates.get(a.atom_id);
          return point && baseline[i] && point.some((v, axis) => v !== baseline[i]![axis]);
        });
        if (applied && changed) void native.syncQueue.then(() => requestAnimationFrame(() => {
          observer.disconnect(); tasks.disconnect(); resolve({ feedbackMs, nativeAppliedMs: performance.now() - start, longestTaskMs });
        }), reject);
        else if (performance.now() - start > 30_000) { observer.disconnect(); tasks.disconnect(); reject(new Error("Quick publication did not reach native canonical geometry")); }
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    window.addEventListener("keydown", input, true);
  });
}
