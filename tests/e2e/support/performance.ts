import { expect, test } from "@playwright/test";
import { performanceEnabled, performanceResult } from "../../../scripts/performance-policy.mjs";

/** Always execute the workflow and retain measurements; enforce latency only by opt-in. */
export function performanceBudget(actual: number, limit: number, label: string, inclusive = false): void {
  const result = performanceResult(actual, limit, { strict: performanceEnabled(), inclusive });
  test.info().annotations.push({ type: "performance", description: JSON.stringify({ label, ...result }) });
  if (result.enforced) expect(result.withinTarget, `${label}: ${actual} against ${limit}`).toBe(true);
}
