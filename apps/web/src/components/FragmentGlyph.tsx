import type { FragmentName } from "../api/types";
import { FRAGMENTS } from "../editing/fragments";

/** Structural attachment previews, not a second chemistry/coordinate authority. */
export function FragmentGlyph({ name }: { name: FragmentName }) {
  return <svg viewBox="0 0 86 54" width="86" height="54" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="5" cy="28" r="2" fill="currentColor" /><path d="M8 28H24" />
    {name === "phenyl" ? <><path d="m24 28 13-20h25l13 20-13 20H37Z" /><path d="m29 28 11-15m18 0 11 15M40 43h19" /></>
      : name === "cyclopropyl" ? <path d="M24 28 58 9v38Z" />
      : name === "cyclobutyl" ? <path d="m24 28 22-21 22 21-22 21Z" />
      : name === "cyclopentyl" ? <path d="m24 28 16-20 25 8v24l-25 8Z" />
      : name === "cyclohexyl" ? <path d="m24 28 13-20h25l13 20-13 20H37Z" />
      : name === "methoxy" ? <><text x="25" y="33" stroke="none" fill="currentColor" fontSize="16">O</text><path d="m39 27 16-10" /><text x="56" y="21" stroke="none" fill="currentColor" fontSize="12">CH₃</text></>
      : name === "ethyl" ? <><path d="m24 28 19-10" /><text x="44" y="22" stroke="none" fill="currentColor" fontSize="13">CH₃</text></>
      : name === "carboxylic_acid" ? <><path d="M28 25V13m5 12V13m2 17 17 8" /><text x="24" y="11" stroke="none" fill="currentColor" fontSize="13">O</text><text x="53" y="44" stroke="none" fill="currentColor" fontSize="13">OH</text></>
      : <text x="27" y="33" stroke="none" fill="currentColor" fontSize="17">{FRAGMENTS.find(f => f.name === name)!.symbol}</text>}
  </svg>;
}
