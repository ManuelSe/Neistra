interface BulkPropertyValue { status?: unknown; value?: unknown }
interface BulkPropertyRow {
  status: string;
  report?: {
    model_status?: unknown;
    values?: readonly (BulkPropertyValue | null | undefined)[] | null;
  } | null;
}

type BulkPropertyFailure = "status" | "model_status" | "value_count" | "values";

/** Inspect every returned row without adding a browser-test step per predicate. */
export function collectBulkPropertyValidationErrors(rows: readonly BulkPropertyRow[]) {
  const errors: { index: number; reasons: BulkPropertyFailure[] }[] = [];
  for (const [index, row] of rows.entries()) {
    const reasons: BulkPropertyFailure[] = [];
    if (row.status !== "ready" && row.status !== "pending") reasons.push("status");
    if (row.status === "ready") {
      if (row.report?.model_status !== "qualified") reasons.push("model_status");
      const values = row.report?.values;
      if (!Array.isArray(values) || values.length !== 14) reasons.push("value_count");
      if (!Array.isArray(values) || !values.every((value: BulkPropertyValue | null | undefined) => value?.status === "ready" && Number.isFinite(value.value))) reasons.push("values");
    }
    if (reasons.length) errors.push({ index, reasons });
  }
  return errors;
}
