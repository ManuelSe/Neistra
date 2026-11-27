import { useId } from "react";
import type { ProfileComparison as Comparison } from "./comparison";
import "./comparison.css";

const operators = { lt: "<", le: "≤", gt: ">", ge: "≥" };
const labels = { pass: "Met", fail: "Not met", pending: "Updating", unavailable: "Unavailable", error: "Error",
  stale: "Unavailable", preview: "Preview unavailable", cancelled: "Cancelled", missing: "Missing value" };
const readable = (reason: string) => reason.replaceAll("_", " ");

/** Missing axes retain their positions. Only adjacent known points are joined. */
export function ProfileComparison({ comparison }: { comparison: Comparison }) {
  const id = useId(), { rows, reason } = comparison;
  if (reason) return <p className="profile-comparison-reason">Comparison unavailable: {readable(reason)}.</p>;
  if (!rows.length) return null;
  const count = rows.length, radius = 78, center = 120;
  const position = (index: number, normalized: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return { x: center + Math.cos(angle) * radius * normalized, y: center + Math.sin(angle) * radius * normalized };
  };
  const points = rows.map((row, index) => row.normalized === null ? null : position(index, row.normalized));
  const complete = count >= 3 && points.every(point => point !== null);
  return <section className="profile-comparison" aria-label="Profile comparison">
    <svg viewBox="0 0 240 240" role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <title id={`${id}-title`}>Current ligand profile comparison</title>
      <desc id={`${id}-description`}>Display scales, not a quality score. Missing values are gaps. Exact values and criteria are in the comparison table.</desc>
      {[0.5, 1].map(scale => <circle key={scale} cx={center} cy={center} r={radius * scale} className="comparison-guide" />)}
      {rows.map((row, index) => {
        const end = position(index, 1), label = position(index, 1.22);
        return <g key={row.axis.id}>
          <line x1={center} y1={center} x2={end.x} y2={end.y} className="comparison-guide" />
          <text x={label.x} y={label.y} textAnchor={label.x < 110 ? "end" : label.x > 130 ? "start" : "middle"}
            dominantBaseline="middle">{index + 1}</text>
        </g>;
      })}
      {complete ? <polygon className="comparison-shape" points={points.map(point => `${point.x},${point.y}`).join(" ")} />
        : points.map((point, index) => {
          // Two axes have one open segment; larger incomplete sets keep cyclic adjacency.
          const next = points[(index + 1) % count];
          return point && next && count > 1 && (count !== 2 || index === 0)
            ? <line key={index} className="comparison-segment" x1={point.x} y1={point.y} x2={next.x} y2={next.y} /> : null;
        })}
      {points.map((point, index) => point ? <circle key={rows[index].axis.id} cx={point.x} cy={point.y} r={4}
        className="comparison-point" data-clipped={rows[index].clipped ?? undefined} /> : null)}
    </svg>
    <ol className="comparison-legend">{rows.map(row => <li key={row.axis.id}>{row.definition.name}</li>)}</ol>
    <p className="comparison-caption">Display scales · larger is not necessarily better</p>
    <details className="comparison-table"><summary tabIndex={0}>Values and criteria</summary>
      <table><caption>Exact profile comparison values</caption><thead><tr><th scope="col">Property</th><th scope="col">Value / criteria</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.axis.id} data-descriptor={row.axis.descriptor_id}>
          <th scope="row">{index + 1}. {row.definition.name}</th><td>
            <span>{row.value === null ? "Unavailable" : String(row.value)}{row.value !== null && row.definition.unit ? ` ${row.definition.unit}` : ""}</span>
            {row.reason ? <span>{readable(row.reason)}</span> : null}
            <span>Scale {row.axis.domain[0]}–{row.axis.domain[1]}{row.definition.unit ? ` ${row.definition.unit}` : ""}</span>
            {row.clipped ? <span>Outside display scale ({row.clipped === "low" ? "below" : "above"}); actual value retained</span> : null}
            {row.criteria.map(criterion => <span key={criterion.constraint.id}>
              {operators[criterion.constraint.operator]} {criterion.constraint.limit}{row.definition.unit ? ` ${row.definition.unit}` : ""} · {labels[criterion.status]}
            </span>)}
          </td></tr>)}</tbody>
      </table>
    </details>
  </section>;
}
