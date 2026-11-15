import type { Selection, StandardAminoAcid, StructureProjection } from "../api/types";
import { canonicalSelection } from "../selection/selection";

export const AMINO_ACIDS: StandardAminoAcid[] = [
  "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
  "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
];

export function residueMutationTarget(projection: StructureProjection | undefined, selection: Selection) {
  if (!projection) return { reason: "Loading selected molecule…", residue: undefined };
  const structure = projection.structure;
  const selected = new Set(selection.atoms.map(ref => ref.atom_id));
  const atoms = structure.atoms.filter(atom => selected.has(atom.id));
  const ids = new Set(atoms.map(atom => atom.residue_id));
  const residue = ids.size === 1 ? structure.residues.find(residue => ids.has(residue.id)) : undefined;
  if (!residue || !atoms.length || atoms.length !== selected.size) return { reason: "Select one complete amino-acid residue using residue picking.", residue };
  if (residue.component_type !== "polymer" || !AMINO_ACIDS.includes(residue.name as StandardAminoAcid)) return { reason: "Select a standard polymer amino-acid residue.", residue };
  if (structure.atoms.some(atom => atom.residue_id === residue.id && !selected.has(atom.id))) return { reason: "Select the complete residue using residue picking.", residue };
  if (structure.conformers.length !== 1 || residue.insertion_code || atoms.some(atom => atom.alternate_location)) return { reason: "Mutation requires an unambiguous single-conformer residue without insertion/alternate sites.", residue };
  if (["N", "CA", "C"].some(name => !atoms.some(atom => atom.name === name))) return { reason: "Mutation requires backbone anchors N, CA and C.", residue };
  const elements: Record<string, string> = { N: "N", CA: "C", C: "C", O: "O" };
  const incompatible = atoms.find(atom => elements[atom.name] && atom.element !== elements[atom.name]);
  if (incompatible) return { reason: `Backbone ${incompatible.name} requires ${elements[incompatible.name]}; found ${incompatible.element}. Use a compatible residue before mutation.`, residue };
  return { reason: null, residue };
}

/** Explicit selection recovery, never an implicit operand of mutation. */
export function wholeResidueSelection(projection: StructureProjection, selection: Selection): Selection | null {
  if (!selection.atoms.length || selection.atoms.some(ref => ref.structure_id !== projection.entry_id)) return null;
  const atoms = new Map(projection.structure.atoms.map(atom => [atom.id, atom]));
  const selected = selection.atoms.map(ref => atoms.get(ref.atom_id));
  if (selected.some(atom => !atom) || selected[0]?.residue_id == null) return null;
  const residueId = selected[0].residue_id;
  if (selected.some(atom => atom?.residue_id !== residueId)) return null;
  const residue = projection.structure.residues.find(value => value.id === residueId);
  if (!residue || residue.component_type !== "polymer" || !AMINO_ACIDS.includes(residue.name as StandardAminoAcid)) return null;
  const members = projection.structure.atoms.filter(atom => atom.residue_id === residueId);
  if (members.length === selected.length) return null;
  return canonicalSelection(members.map(atom => ({ structure_id: projection.entry_id, atom_id: atom.id })), "residue", "inspector");
}
