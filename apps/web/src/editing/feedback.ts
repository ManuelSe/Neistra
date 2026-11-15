import type { ModelPreview } from "../api/types";

export function previewReadiness(result: ModelPreview | undefined, error?: string) {
  if (error) return { label: "Preview unavailable", partial: false, warnings: 0 };
  if (!result) return { label: "Preparing preview…", partial: false, warnings: 0 };
  const partial = [result.hydrogen_report?.status, result.hydrogen_reconciliation_report?.status]
    .some(status => status === "partial" || status === "unresolved");
  const warnings = result.warnings.length;
  return { label: result.rotation?.no_op ? "No change" : `Ready${warnings ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}${partial ? " · partial H" : ""}`,
    partial, warnings };
}
