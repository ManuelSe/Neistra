import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maintainConsumerHeartbeats } from "../../../../tests/e2e/support/consumer-heartbeat";

const deferred = () => {
  let resolve!: () => void, reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const clock = () => Date.now();
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

describe("bulk qualification consumer leases", () => {
  it("maintains all five 60s leases while foreground work remains held beyond a minute", async () => {
    const owners = Array.from({ length: 5 }, (_, id) => ({ id, renewed: 0, expires: 60_000 }));
    const sequentialControl = { id: 5, renewed: 0, expires: 60_000 };
    const foreground = deferred();
    let foregroundDone = false;
    void foreground.promise.then(() => { foregroundDone = true; });
    const calls: number[] = [];
    const renewLease = (owner: typeof owners[number]) => {
      if (clock() >= owner.expires) return Promise.reject(new Error("Lease expired before renewal"));
      expect(clock()).toBeLessThan(owner.expires);
      owner.expires = clock() + 60_000;
      calls.push(owner.id);
      return Promise.resolve();
    };
    const heartbeat = maintainConsumerHeartbeats(() => owners, renewLease, clock);
    await vi.advanceTimersByTimeAsync(125_000);
    heartbeat.check();
    expect(foregroundDone).toBe(false);
    expect(calls).toEqual(Array.from({ length: 6 }, () => [0, 1, 2, 3, 4]).flat());
    expect(owners.every(owner => owner.expires > clock())).toBe(true);
    // A renewal deferred until this held foreground sweep ends is genuinely too late.
    await expect(renewLease(sequentialControl)).rejects.toThrow("Lease expired before renewal");
    await heartbeat.stop();
    foreground.resolve();
    await foreground.promise;
  });

  it("serializes a held PUT globally and does not accumulate catch-up renewals", async () => {
    const owners = [{ id: "a", renewed: 0 }, { id: "b", renewed: 0 }];
    const held = deferred();
    const renew = vi.fn((owner: typeof owners[number]) => owner.id === "a" ? held.promise : Promise.resolve());
    const heartbeat = maintainConsumerHeartbeats(() => owners, renew, clock);
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(80_000);
    expect(renew.mock.calls.map(([owner]) => owner.id)).toEqual(["a"]);
    held.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(renew.mock.calls.map(([owner]) => owner.id)).toEqual(["a", "b"]);
    expect(owners.map(owner => owner.renewed)).toEqual([100_000, 100_000]);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(renew).toHaveBeenCalledTimes(2);
    await heartbeat.stop();
  });

  it("cancels a waiting timer and never renews after stop", async () => {
    const renew = vi.fn(() => Promise.resolve());
    const heartbeat = maintainConsumerHeartbeats(() => [{ renewed: 0 }], renew, clock);
    await vi.advanceTimersByTimeAsync(19_999);
    await heartbeat.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    heartbeat.changed();
    expect(renew).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("awaits an outstanding PUT before allowing release and stops the remaining sweep", async () => {
    const owners = [{ id: "a", renewed: 0 }, { id: "b", renewed: 0 }];
    const held = deferred();
    const events: string[] = [];
    const heartbeat = maintainConsumerHeartbeats(() => owners, owner => {
      events.push(`renew:${owner.id}`);
      return held.promise;
    }, clock);
    await vi.advanceTimersByTimeAsync(20_000);
    const release = heartbeat.stop().then(() => { events.push("delete:sequence2"); });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual(["renew:a"]);
    held.resolve();
    await release;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual(["renew:a", "delete:sequence2"]);
  });

  it.each(["rejected request", "non-OK response assertion"])("retains the first %s failure without retry or subsequent renewal", async label => {
    const failure = new Error(label);
    const owners = [{ id: "a", renewed: 0 }, { id: "b", renewed: 0 }];
    const renew = vi.fn(() => label === "rejected request" ? Promise.reject(failure) : (() => { throw failure; })());
    const heartbeat = maintainConsumerHeartbeats(() => owners, renew, clock);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(() => heartbeat.check()).toThrow(failure);
    await vi.advanceTimersByTimeAsync(120_000);
    heartbeat.changed();
    expect(renew).toHaveBeenCalledTimes(1);
    await expect(heartbeat.stop()).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
    expect(owners.map(owner => owner.renewed)).toEqual([0, 0]);
  });

  it("includes an owner registered during an outstanding renewal", async () => {
    const owners = [{ id: "a", renewed: 0 }];
    const held = deferred();
    const renew = vi.fn((owner: typeof owners[number]) => owner.id === "a" ? held.promise : Promise.resolve());
    const heartbeat = maintainConsumerHeartbeats(() => owners, renew, clock);
    await vi.advanceTimersByTimeAsync(20_000);
    owners.push({ id: "b", renewed: 5_000 });
    heartbeat.changed();
    await vi.advanceTimersByTimeAsync(5_000);
    held.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(renew.mock.calls.map(([owner]) => owner.id)).toEqual(["a", "b"]);
    await heartbeat.stop();
  });

  it("starts maintenance when the first owner is registered and uses its full interval", async () => {
    const owners: { renewed: number }[] = [];
    const renew = vi.fn(() => Promise.resolve());
    const heartbeat = maintainConsumerHeartbeats(() => owners, renew, clock);
    await vi.advanceTimersByTimeAsync(30_000);
    owners.push({ renewed: clock() });
    heartbeat.changed();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(renew).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(renew).toHaveBeenCalledTimes(1);
    await heartbeat.stop();
  });
});
