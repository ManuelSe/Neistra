import type { MinimizationProposal, MolecularProposalGeometry } from "../api/types";
import type { CalculationSource } from "./context";

export function proposalGeometry(proposal: MinimizationProposal, sources: ReadonlyMap<string, CalculationSource>): MolecularProposalGeometry {
  const selected = new Set(proposal.report.parameters.selection.atoms.map(a => `${a.structure_id}/${a.atom_id}`));
  const seen = new Set<string>();
  const geometry: MolecularProposalGeometry = { atoms: [], bonds: [], moved_atoms: [] };
  for (const entry of proposal.entries) {
    const source = sources.get(entry.entry_id)?.structure;
    if (!source || (source.active_conformer_id ?? 1) !== entry.conformer_id || entry.atom_ids.length !== entry.coordinates.length) throw new Error("Proposal source/conformer is unavailable.");
    const atoms = new Map(source.atoms.map(a => [a.id, a]));
    const updates = new Map<number, [number, number, number]>();
    entry.atom_ids.forEach((id, i) => {
      const key = `${entry.entry_id}/${id}`;
      const atom = atoms.get(id);
      const point = entry.coordinates[i];
      if (!selected.has(key) || seen.has(key) || !atom || !point.every(Number.isFinite)) throw new Error("Proposal does not match the captured selection.");
      seen.add(key); updates.set(id, point);
      geometry.atoms.push({ preview_id: key, element: atom.element, coordinates: point });
      geometry.moved_atoms!.push({ atom_id: id, before: atom.coordinates, after: point });
    });
    for (const bond of source.bonds) {
      if (!updates.has(bond.atom_1_id) && !updates.has(bond.atom_2_id)) continue;
      const first = atoms.get(bond.atom_1_id), second = atoms.get(bond.atom_2_id);
      if (!first || !second) throw new Error("Proposal topology is unavailable.");
      geometry.bonds.push({ start: updates.get(first.id) ?? first.coordinates, end: updates.get(second.id) ?? second.coordinates, order: bond.order, aromatic: bond.aromatic });
    }
  }
  if (seen.size !== selected.size) throw new Error("Proposal omits captured movable atoms.");
  return geometry;
}
