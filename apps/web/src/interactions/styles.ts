import { INTERACTION_KINDS, type InteractionAppearance, type InteractionKind, type InteractionRecord } from "./types";

/** Drawing eligibility only; detection and canonical contact endpoints stay intact. */
export function interactionHasDisplayGeometry(record: InteractionRecord): boolean {
  const [a, b] = record.endpoints;
  if (!a || !b || a.length !== 3 || b.length !== 3 || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return false;
  const distance = Math.hypot(...a.map((value, axis) => b[axis] - value));
  return Number.isFinite(distance) && (distance > 0 || record.kind === "clash");
}

export const INTERACTION_COLORS: Record<InteractionKind, number> = {
  clash: 0xdb3850, hydrogen_bond: 0x1597b0, hydrophobic: 0xa88836,
  pi_pi: 0x9567c4, cation_pi: 0x5079d3, salt_bridge: 0xd56b30,
};

/** Alternating dash/gap lengths in Å, shared with decorative legend samples. */
export const INTERACTION_PATTERNS: Record<InteractionKind, readonly number[]> = {
  clash: [1], hydrogen_bond: [0.25, 0.18], hydrophobic: [0.08, 0.18],
  pi_pi: [0.45, 0.2], cation_pi: [0.45, 0.15, 0.08, 0.15], salt_bridge: [0.18, 0.1, 0.18, 0.25],
};

export function defaultInteractionAppearance(): InteractionAppearance {
  return Object.fromEntries(INTERACTION_KINDS.map(kind => [kind, {
    color: `#${INTERACTION_COLORS[kind].toString(16).padStart(6, "0")}`, width: 2.5,
  }])) as InteractionAppearance;
}

export function normalizeInteractionAppearance(value?: Partial<InteractionAppearance>): InteractionAppearance {
  const result = defaultInteractionAppearance();
  for (const kind of INTERACTION_KINDS) {
    const supplied = value?.[kind];
    if (supplied && /^#[0-9a-f]{6}$/i.test(supplied.color)) result[kind].color = supplied.color;
    if (supplied && Number.isFinite(supplied.width)) result[kind].width = Math.max(1, Math.min(6, supplied.width));
  }
  return result;
}
