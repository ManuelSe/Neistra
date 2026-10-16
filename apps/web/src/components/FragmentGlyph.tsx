import type { FragmentName } from "../api/types";
import { FRAGMENTS } from "../editing/fragments";

/** Structural attachment previews, not a second chemistry/coordinate authority. */
export function FragmentGlyph({ name }: { name: FragmentName }) {
  return <svg viewBox="0 0 86 54" width="86" height="54" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="5" cy="28" r="2" fill="currentColor" /><path d="M8 28H24" />
    {name === "phenyl" ? <><path d="m24 28 13-20h25l13 20-13 20H37Z" /><path d="m29 28 11-15m18 0 11 15M40 43h19" /></>
      : name === "ethyl" ? <><path d="m24 28 19-10" /><text x="44" y="22" stroke="none" fill="currentColor" fontSize="13">CH₃</text></>
      : name === "carboxylic_acid" ? <><path d="M28 25V13m5 12V13m2 17 17 8" /><text x="24" y="11" stroke="none" fill="currentColor" fontSize="13">O</text><text x="53" y="44" stroke="none" fill="currentColor" fontSize="13">OH</text></>
      : <text x="27" y="33" stroke="none" fill="currentColor" fontSize="17">{FRAGMENTS.find(f => f.name === name)!.symbol}</text>}
  </svg>;
}
