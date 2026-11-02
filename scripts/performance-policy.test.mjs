import assert from "node:assert/strict";
import { test } from "node:test";
import { performanceEnabled, performanceResult } from "./performance-policy.mjs";

test("reference timing requires explicit opt-in and rejects misspelled settings", () => {
  const previous = process.env.NEISTRA_PERFORMANCE;
  delete process.env.NEISTRA_PERFORMANCE;
  try {
    assert.equal(performanceEnabled(), false);
  } finally {
    if (previous !== undefined) process.env.NEISTRA_PERFORMANCE = previous;
  }
  assert.equal(performanceEnabled("0"), false);
  assert.equal(performanceEnabled("1"), true);
  for (const value of ["", "true", "false", "yes"]) {
    assert.throws(() => performanceEnabled(value), /NEISTRA_PERFORMANCE/);
  }
});

test("a slow measurement remains diagnostic by default and fails a strict budget", () => {
  for (const strict of [false, true]) {
    const result = performanceResult(2600, 2000, { strict });
    assert.equal(result.withinTarget, false);
    assert.equal(result.enforced && !result.withinTarget, strict);
  }
});

test("preserves strict and inclusive target boundaries", () => {
  assert.equal(performanceResult(500, 500, { strict: true }).withinTarget, false);
  assert.equal(performanceResult(500, 500, { strict: true, inclusive: true }).withinTarget, true);
  assert.equal(performanceResult(0, 500, { strict: false }).withinTarget, true);
});

test("invalid measurements fail even when latency limits are not enforced", () => {
  for (const actual of [NaN, Infinity, -Infinity, -1]) {
    assert.throws(() => performanceResult(actual, 500, { strict: false }), /finite/);
  }
  for (const limit of [NaN, Infinity, 0, -1]) {
    assert.throws(() => performanceResult(100, limit, { strict: false }), /positive limit/);
  }
});
