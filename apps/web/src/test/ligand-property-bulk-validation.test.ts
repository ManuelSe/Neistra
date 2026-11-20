import { strictEqual } from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { collectBulkPropertyValidationErrors } from "../../../../tests/e2e/support/bulk-property-validation";

interface Value { status: string; value?: unknown }
interface Row {
  source: { id: number };
  status: string;
  report: { model_status?: string; values?: (Value | null | undefined)[] | null } | null;
}
const ready = (id: number): Row => ({ source: { id }, status: "ready", report: {
  model_status: "qualified", values: Array.from({ length: 14 }, (_, index) => ({ status: "ready", value: index - 7 })),
} });
const batch = () => Array.from({ length: 200 }, (_, index) => ready(index));
const sourceOrder = (rows: Row[]) => rows.map(row => row.source);

// Literal prior pointwise oracle, independent of the collector's implementation.
function priorOracle(rows: Row[], sources: ReturnType<typeof sourceOrder>, step = () => {}) {
  step(); expect(rows.map(row => row.source)).toEqual(sources);
  // Retain the former API cast: malformed runtime fields fail its literal checks.
  for (const row of rows as (Omit<Row, "report"> & { report: { model_status: string; values: Value[] } | null })[]) {
    step(); expect(["ready", "pending"]).toContain(row.status);
    if (row.status === "ready") {
      step(); expect(row.report?.model_status).toBe("qualified");
      step(); expect(row.report?.values).toHaveLength(14);
      step(); expect(row.report?.values.every(value => value.status === "ready" && Number.isFinite(value.value))).toBe(true);
    }
  }
}
// The same independent pointwise predicates for the exhaustive negative matrix.
// Keep source equality semantics and malformed-value native throws; avoid repeated
// passing matcher bookkeeping. The literal prior oracle remains above for parity
// and its original 801-step accounting below.
function pointwiseOracle(rows: Row[], sources: ReturnType<typeof sourceOrder>) {
  expect(rows.map(row => row.source)).toEqual(sources);
  for (const row of rows as (Omit<Row, "report"> & { report: { model_status: string; values: Value[] } | null })[]) {
    strictEqual(["ready", "pending"].includes(row.status), true);
    if (row.status === "ready") {
      strictEqual(row.report?.model_status, "qualified");
      strictEqual(row.report?.values?.length, 14);
      strictEqual(row.report?.values.every(value => value.status === "ready" && Number.isFinite(value.value)), true);
    }
  }
}
function batchOracle(rows: Row[], sources: ReturnType<typeof sourceOrder>, step = () => {}) {
  step(); expect(rows.map(row => row.source)).toEqual(sources);
  step(); expect(collectBulkPropertyValidationErrors(rows)).toEqual([]);
}
function passes(oracle: () => void) {
  try { oracle(); return true; } catch { return false; }
}
function sameRejection(rows: Row[], index: number) {
  const sources = sourceOrder(rows);
  expect(passes(() => pointwiseOracle(rows, sources))).toBe(false);
  expect(passes(() => batchOracle(rows, sources))).toBe(false);
  expect(collectBulkPropertyValidationErrors(rows).map(error => error.index)).toEqual([index]);
}

describe("complete bulk property oracle without per-row matcher steps", () => {
  it("accepts every valid ready row, including zero and negative values", () => {
    const rows = batch();
    priorOracle(rows, sourceOrder(rows));
    pointwiseOracle(rows, sourceOrder(rows));
    batchOracle(rows, sourceOrder(rows));
    expect(collectBulkPropertyValidationErrors(rows)).toEqual([]);
  });

  it("allows mixed pending rows with null or partial reports without inspecting their values", () => {
    const rows = batch();
    for (let index = 0; index < rows.length; index += 2) {
      rows[index] = { source: { id: index }, status: "pending", report: index % 4 ? null : {
        model_status: "unavailable", values: [{ status: "failed", value: Number.NaN }],
      } };
    }
    priorOracle(rows, sourceOrder(rows));
    pointwiseOracle(rows, sourceOrder(rows));
    batchOracle(rows, sourceOrder(rows));
  });

  it("rejects an invalid status at every one of the 200 row positions", () => {
    for (let index = 0; index < 200; index++) {
      const rows = batch(); rows[index].status = "unavailable";
      sameRejection(rows, index);
    }
  });

  it("preserves every report/count predicate for first, middle and last ready rows", () => {
    const faults: ((row: Row) => void)[] = [
      row => { row.report = null; },
      row => { row.report!.model_status = "unqualified"; },
      row => { delete row.report!.model_status; },
      row => { row.report!.values = null; },
      row => { delete row.report!.values; },
      row => { row.report!.values!.pop(); },
      row => { row.report!.values!.push({ status: "ready", value: 1 }); },
    ];
    for (const index of [0, 100, 199]) for (const fault of faults) {
      const rows = batch(); fault(rows[index]); sameRejection(rows, index);
    }
  });

  it("checks every descriptor position for every invalid-value predicate in first, middle and last rows", () => {
    const faults: ((values: NonNullable<NonNullable<Row["report"]>["values"]>, position: number) => void)[] = [
      (values, position) => { values[position]!.status = "unavailable"; },
      (values, position) => { values[position]!.status = "pending"; },
      (values, position) => { values[position]!.value = null; },
      (values, position) => { values[position]!.value = "0"; },
      (values, position) => { values[position]!.value = Number.NaN; },
      (values, position) => { values[position]!.value = Number.POSITIVE_INFINITY; },
      (values, position) => { values[position]!.value = Number.NEGATIVE_INFINITY; },
      (values, position) => { delete values[position]!.value; },
      (values, position) => { values[position] = null; },
      (values, position) => { values[position] = undefined; },
    ];
    for (const index of [0, 100, 199]) for (let position = 0; position < 14; position++) for (const fault of faults) {
      const rows = batch(); fault(rows[index].report!.values!, position); sameRejection(rows, index);
    }
  });

  it("keeps the original ordered source assertion for changed or reordered sources", () => {
    const expected = sourceOrder(batch());
    for (const index of [0, 100, 199]) {
      const rows = batch(); rows[index].source = { id: 200 };
      expect(passes(() => priorOracle(rows, expected))).toBe(false);
      expect(passes(() => pointwiseOracle(rows, expected))).toBe(false);
      expect(passes(() => batchOracle(rows, expected))).toBe(false);
    }
    const rows = batch(); [rows[0], rows[199]] = [rows[199], rows[0]];
    expect(passes(() => priorOracle(rows, expected))).toBe(false);
    expect(passes(() => pointwiseOracle(rows, expected))).toBe(false);
    expect(passes(() => batchOracle(rows, expected))).toBe(false);
  });

  it("bounds diagnostics to one indexed record and at most four reasons per row", () => {
    const rows = batch();
    for (const row of rows) row.report = null;
    const errors = collectBulkPropertyValidationErrors(rows);
    expect(errors).toHaveLength(200);
    expect(errors.map(error => error.index)).toEqual(Array.from({ length: 200 }, (_, index) => index));
    expect(errors.every(error => error.reasons.length > 0 && error.reasons.length <= 4)).toBe(true);
    expect(passes(() => batchOracle(rows, sourceOrder(rows)))).toBe(false);
  });

  it("uses exactly two batch matcher steps instead of 801 for 200 ready rows", () => {
    const rows = batch(), sources = sourceOrder(rows);
    let priorSteps = 0, batchSteps = 0;
    priorOracle(rows, sources, () => { priorSteps++; });
    batchOracle(rows, sources, () => { batchSteps++; });
    expect(priorSteps).toBe(801);
    expect(batchSteps).toBe(2);
    for (const count of [0, 1, 100, 200]) {
      const subset = rows.slice(0, count);
      let steps = 0;
      batchOracle(subset, sourceOrder(subset), () => { steps++; });
      expect(steps).toBe(2);
    }
  });
});
