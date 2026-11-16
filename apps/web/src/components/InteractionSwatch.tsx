import { INTERACTION_PATTERNS } from "../interactions/styles";
import type { InteractionAppearance, InteractionKind } from "../interactions/types";

/** The legend preserves the renderer's relative dash/gap lengths at one scale. */
export function InteractionSwatch({ kind, appearance }: { kind: InteractionKind; appearance: InteractionAppearance[InteractionKind] }) {
  const pattern = kind === "clash" ? undefined : INTERACTION_PATTERNS[kind].map(length => length * 22).join(" ");
  return <svg className="interaction-swatch" width="36" height="10" viewBox="0 0 36 10" aria-hidden="true" focusable="false" data-kind={kind}>
    <line x1="0" y1="5" x2="36" y2="5" stroke={appearance.color} strokeWidth={appearance.width} strokeDasharray={pattern} />
  </svg>;
}
