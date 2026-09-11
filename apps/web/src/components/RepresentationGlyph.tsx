import type { SelectionRepresentationStyle } from "../api/types";

/** Original schematic glyphs; illustrative, not a molecular preview. */
export function RepresentationGlyph({ style }: { style: SelectionRepresentationStyle }) {
  const polymer = style === "cartoon" || style === "backbone";
  const radius = style === "space-filling" ? 9 : style === "ball-and-stick" ? 4 : 0;
  const width = style === "line" ? 1.5 : style === "stick" ? 3 : 6;
  return <svg viewBox="0 0 48 30" className="representation-glyph" aria-hidden="true" focusable="false">
    {polymer ? <>
      <path d="M4 22 C14 22 8 7 18 7 S24 23 34 23 L43 8" fill="none"
        stroke="currentColor" strokeWidth={style === "cartoon" ? 7 : 2.5} strokeLinecap="round" />
      {style === "cartoon" ? <path d="m36 9 11-5-1 12Z" fill="currentColor" /> : null}
    </> : <>
      <path d="m8 21 15-12 17 12" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" />
      {radius ? [[8, 21], [23, 9], [40, 21]].map(([cx, cy]) =>
        <circle key={cx} cx={cx} cy={cy} r={radius} fill="currentColor" stroke="var(--surface)" strokeWidth="1" />) : null}
    </>}
  </svg>;
}
