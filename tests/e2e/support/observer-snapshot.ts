export interface ObserverSnapshot {
  complete: boolean;
  samples: number;
  jobs: Record<string, unknown>;
}

// A missing first publication is a startup state. Once publication has begun,
// every read must provide current, valid evidence; failures are never cached.
export function createObserverSnapshotReader<T extends ObserverSnapshot>(readText: () => Promise<string>) {
  let published = false;
  return async (): Promise<T | null> => {
    let text: string;
    try { text = await readText(); }
    catch (error) {
      if (!published && typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)
      || !("complete" in value) || typeof value.complete !== "boolean"
      || !("samples" in value) || !Number.isSafeInteger(value.samples) || (value.samples as number) < 0
      || !("jobs" in value) || typeof value.jobs !== "object" || value.jobs === null || Array.isArray(value.jobs)) {
      throw new Error("Invalid descriptor observer snapshot envelope");
    }
    published = true;
    return value as T;
  };
}
