import type { Entry, Selection, SelectionRepresentationChannel, SelectionRepresentationStyle, StructureProjection } from "../api/types";
import { expandSelection } from "../selection/selection";
import { polymerStyleUnavailableReason } from "./selectionStyleEligibility";
import { atomicRepresentationStyles, polymerRepresentationStyles } from "./settings";

export const representationLabels: Record<SelectionRepresentationStyle, string> = {
  line: "Line", stick: "Thin sticks", "thick-stick": "Thick sticks",
  "ball-and-stick": "Ball and stick", "space-filling": "Space filling",
  backbone: "Backbone trace", cartoon: "Cartoon",
};

/** Explain application-owned assignments; this does not claim successful rendering. */
export function selectionRepresentationSummary(
  selection: Selection,
  entries: readonly Entry[],
  channel: Exclude<SelectionRepresentationChannel, "all">,
): string {
  if (!selection.atoms.length) return "No selection";
  const styles = channel === "atomic" ? atomicRepresentationStyles : polymerRepresentationStyles;
  const byEntry = new Map(entries.map(entry => {
    const inherited = entry.viewer_settings.representations.filter(item => styles.includes(item.style));
    const assignments = new Map(entry.viewer_settings.selection_representations
      .filter(item => styles.includes(item.style)).flatMap(item => item.atom_ids.map(id => [id, item.style] as const)));
    return [entry.id, { entry, inherited, assignments, hidden: new Set(entry.viewer_settings.selection_hidden_atoms) }] as const;
  }));
  const descriptions = new Set<string>();
  const origins = new Set<string>();
  const names = new Set<string>();
  let hidden = 0;
  for (const reference of selection.atoms) {
    const source = byEntry.get(reference.structure_id);
    if (!source) { descriptions.add("Unavailable entry"); continue; }
    const assigned = source.assignments.get(reference.atom_id);
    const origin = assigned ? "Selection" : "Entry default";
    const atomStyles = assigned ? [assigned] : source.inherited.map(item => item.style);
    const label = atomStyles.map(style => representationLabels[style]).join(" + ") || "None";
    origins.add(origin); names.add(label); descriptions.add(`${origin}: ${label}`);
    if (!source.entry.visible || channel === "atomic" && source.hidden.has(reference.atom_id)
      || !assigned && source.inherited.length > 0 && source.inherited.every(item => item.opacity === 0)) hidden++;
  }
  const label = descriptions.size === 1 ? [...descriptions][0]
    : `Mixed: ${[...names].join(", ")}${origins.size > 1 ? " · entry default and selection" : ""}`;
  return hidden === selection.atoms.length ? `Hidden · ${label}`
    : hidden ? `${label} · ${hidden} of ${selection.atoms.length} hidden` : label;
}

/** A recovery action may add complete residues, but must never drop a selected atom. */
export function completeResidueStyleSelection(selection: Selection, structures: ReadonlyMap<string, StructureProjection>) {
  if (!selection.atoms.length || polymerStyleUnavailableReason(selection, structures) === null) return null;
  const normalized = new Map([...structures].map(([id, projection]) => [id, projection.structure]));
  const expanded = expandSelection(selection, normalized, "residue");
  const members = new Set(expanded.atoms.map(atom => `${atom.structure_id}:${atom.atom_id}`));
  if (expanded.atoms.length <= selection.atoms.length
    || selection.atoms.some(atom => !members.has(`${atom.structure_id}:${atom.atom_id}`))
    || polymerStyleUnavailableReason(expanded, structures) !== null) return null;
  const residues = new Set<string>();
  const byEntry = new Map([...structures].map(([id, projection]) => [id,
    new Map(projection.structure.atoms.map(atom => [atom.id, atom.residue_id]))]));
  for (const atom of expanded.atoms) residues.add(`${atom.structure_id}:${byEntry.get(atom.structure_id)?.get(atom.atom_id)}`);
  return { selection: expanded, residueCount: residues.size };
}
