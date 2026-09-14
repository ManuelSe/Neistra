import { readFileSync, readdirSync } from "node:fs";

// Sum descendant RSS on Linux; shared pages may be counted more than once.
// This measurement is separate from accounted surface buffers, never a heap cap.
export function browserRssKiB() {
  const processes = new Map<number, { parent: number; rss: number }>();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const status = readFileSync(`/proc/${name}/status`, "utf8");
      processes.set(Number(name), { parent: Number(status.match(/^PPid:\s+(\d+)/m)?.[1]),
        rss: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) });
    } catch { /* Exited during sampling. */ }
  }
  let sum = 0;
  for (const value of processes.values()) {
    let parent = value.parent;
    while (parent > 1 && parent !== process.pid) parent = processes.get(parent)?.parent ?? 0;
    if (parent === process.pid) sum += value.rss;
  }
  return sum;
}
