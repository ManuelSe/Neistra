import type { HydrogenReport } from "../api/types";
import { hydrogenSummary } from "../editing/hydrogen";

export function HydrogenReportDetails({ report }: { report: HydrogenReport }) {
  return <div className="edit-scientific-note" aria-label="Hydrogen completion report">
    <p role="status">{report.status}: {hydrogenSummary(report)}</p>
    {report.diagnostics.length ? <details><summary>Hydrogen diagnostics ({Object.values(report.reason_counts).reduce((sum, n) => sum + n, 0)})</summary>
      {report.diagnostics.map((item, i) => <p key={i}>Atom {item.atom_id}: {item.message}{item.conformer_ids.length ? ` Conformers: ${item.conformer_ids.join(", ")}.` : ""}</p>)}
      {report.diagnostics_truncated ? <p>Detailed diagnostics limited to {report.diagnostics.length}. Complete reason counts: {Object.entries(report.reason_counts).map(([reason, count]) => `${reason}: ${count}`).join("; ")}.</p> : null}
    </details> : null}
  </div>;
}
