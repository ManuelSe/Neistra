/** Timing targets are meaningful only on an explicitly selected reference host. */
export function performanceEnabled(value = process.env.NEISTRA_PERFORMANCE) {
  if (value !== undefined && value !== "0" && value !== "1") {
    throw new Error("NEISTRA_PERFORMANCE must be unset, 0, or 1");
  }
  return value === "1";
}

export function performanceResult(actual, limit, { strict, inclusive = false }) {
  if (!Number.isFinite(actual) || actual < 0 || !Number.isFinite(limit) || limit <= 0) {
    throw new Error("Performance measurements must be finite and nonnegative with a positive limit");
  }
  const withinTarget = inclusive ? actual <= limit : actual < limit;
  return { actual, limit, inclusive, enforced: strict, withinTarget };
}
