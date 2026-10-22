import type { HydrogenReconciliationReport } from "../api/types";

export function HydrogenReconciliationDetails({ report }: { report: HydrogenReconciliationReport }) {
  return <div className="edit-scientific-note" aria-label="Hydrogen reconciliation report">
    <p role="status">Reconcile local H · {report.status}: {report.added_hydrogen_count} added, {report.removed_hydrogen_count} removed, {report.moved_hydrogen_count} moved; {report.skipped_count} skipped, {report.unprocessed_count} unprocessed.</p>
    <details><summary>Local H changes and diagnostics</summary>
      {report.sites.map(site => <p key={site.atom_id}>Atom {site.atom_id}: {site.status}{site.geometry ? ` · ${site.geometry.replaceAll("_", " ")}` : ""}. Added H: {site.added_hydrogen_ids.join(", ") || "none"}; removed H: {site.removed_hydrogen_ids.join(", ") || "none"}; moved H: {site.moved_hydrogen_ids.join(", ") || "none"}.</p>)}
      {report.diagnostics.map((item, i) => <p key={i}>Atom {item.atom_id}: {item.message}{item.conformer_ids.length ? ` Conformers: ${item.conformer_ids.join(", ")}.` : ""}</p>)}
      {report.diagnostics_truncated ? <p>Diagnostics limited. Complete counts: {Object.entries(report.reason_counts).map(([reason, count]) => `${reason}: ${count}`).join("; ")}.</p> : null}
      <p>Ideal local H geometry is unoptimized. Heavy atoms remain fixed. Skipped sites retain the requested draft; explicit atom/charge/bond and coordinate tools remain available.</p>
    </details>
  </div>;
}
