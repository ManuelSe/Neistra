/** Keep test-owned leases alive independently of foreground reads and assertions. */
export function maintainConsumerHeartbeats<Owner extends { renewed: number }>(
  owners: () => readonly Owner[],
  renew: (owner: Owner) => Promise<void>,
  now: () => number = () => performance.now(),
  intervalMs = 20_000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let stopped = false;
  let failed = false;
  let failure: unknown;

  const check = () => { if (failed) throw failure; };
  const changed = () => {
    if (stopped || failed || running) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const current = owners();
    if (!current.length) return;
    const delay = Math.max(0, Math.min(...current.map(owner => owner.renewed + intervalMs - now())));
    timer = setTimeout(() => {
      timer = undefined;
      running = sweep().finally(() => { running = undefined; changed(); });
    }, delay);
  };
  const sweep = async () => {
    try {
      for (const owner of owners()) {
        if (stopped) break;
        if (now() - owner.renewed >= intervalMs) {
          // One serial lane: slow renewals never create overlapping/catch-up PUTs.
          await renew(owner);
          owner.renewed = now();
        }
      }
    } catch (error) { failed = true; failure = error; }
  };
  changed();
  return {
    changed,
    check,
    async stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      await running;
      check();
    },
  };
}
