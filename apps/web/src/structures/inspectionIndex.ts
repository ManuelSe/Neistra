import type { MolecularAtom, MolecularResidue, NormalizedStructure } from "../api/types";

interface StructureInspectionIndex {
  atoms: ReadonlyMap<number, MolecularAtom>;
  residues: ReadonlyMap<number, MolecularResidue>;
  chains: ReadonlyMap<number, NormalizedStructure["chains"][number]>;
  missingCoordinates: boolean;
}

const indexes = new WeakMap<NormalizedStructure, StructureInspectionIndex>();

/** Immutable normalized payloads share one cold index across inspection and measurements. */
export function structureInspectionIndex(structure: NormalizedStructure): StructureInspectionIndex {
  const cached = indexes.get(structure);
  if (cached) return cached;
  const source = (structure as NormalizedStructure & {
    source?: { facts?: Readonly<Record<string, unknown>> };
  }).source;
  const index: StructureInspectionIndex = {
    atoms: new Map(structure.atoms.map(atom => [atom.id, atom])),
    residues: new Map(structure.residues.map(residue => [residue.id, residue])),
    chains: new Map(structure.chains.map(chain => [chain.id, chain])),
    missingCoordinates: structure.warnings.some(warning => warning.code === "missing_coordinates")
      || source?.facts?.missing_coordinates === true,
  };
  indexes.set(structure, index);
  return index;
}
