import { describe, expect, it, vi } from "vitest";
import { createObserverSnapshotReader } from "../../../../tests/e2e/support/observer-snapshot";

const snapshot = (samples = 1) => JSON.stringify({ complete: false, samples, jobs: { job: { status: "completed" } } });
const missing = () => Object.assign(new Error("missing publication"), { code: "ENOENT" });

describe("descriptor observer snapshot reads", () => {
  it("permits first absence, then reads fresh evidence without caching or extra reads", async () => {
    const text = vi.fn<() => Promise<string>>().mockRejectedValueOnce(missing())
      .mockResolvedValueOnce(snapshot(1)).mockResolvedValueOnce(snapshot(2));
    const read = createObserverSnapshotReader(text);
    expect(await read()).toBeNull();
    const first = await read();
    expect(first?.samples).toBe(1);
    expect((await read())?.samples).toBe(2);
    expect(first?.samples).toBe(1);
    expect(text).toHaveBeenCalledTimes(3);
  });

  it("reports subsequent disappearance rather than returning stale or empty jobs", async () => {
    const error = missing();
    const text = vi.fn<() => Promise<string>>().mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(error);
    const read = createObserverSnapshotReader(text);
    expect((await read())?.jobs).toHaveProperty("job");
    await expect(read()).rejects.toBe(error);
  });

  it.each(["{", "", "null", "[]", "{}", '{"complete":false,"samples":1,"jobs":null}',
    '{"complete":false,"samples":1,"jobs":[]}', '{"complete":false,"samples":-1,"jobs":{}}',
    '{"complete":false,"samples":0.5,"jobs":{}}', '{"complete":"false","samples":1,"jobs":{}}'])("rejects invalid startup evidence %s", async body => {
    await expect(createObserverSnapshotReader(() => Promise.resolve(body))()).rejects.toThrow();
  });

  it.each(["EACCES", "EIO"])("propagates startup %s without retry or fallback", async code => {
    const error = Object.assign(new Error(code), { code });
    const text = vi.fn<() => Promise<string>>().mockRejectedValue(error);
    await expect(createObserverSnapshotReader(text)()).rejects.toBe(error);
    expect(text).toHaveBeenCalledTimes(1);
  });

  it("does not hide malformed evidence after a valid publication", async () => {
    const text = vi.fn<() => Promise<string>>().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce("{");
    const read = createObserverSnapshotReader(text);
    expect((await read())?.samples).toBe(1);
    await expect(read()).rejects.toBeInstanceOf(SyntaxError);
    expect(text).toHaveBeenCalledTimes(2);
  });
});
