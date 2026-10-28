import type { MolecularResidue } from "../api/types";
import { gestureIndex, type SelectionStructure } from "./gestures";

export interface ProteinSequenceRow {
  key: string;
  componentId: string;
  chainId: number;
  chainName: string;
  qualifier: string;
  residues: MolecularResidue[];
  residueAtoms: ReadonlyMap<number, number[]>;
}

const codes: Record<string, string> = {
  ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E",
  GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F",
  PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
};

export function residueCode(residue: MolecularResidue): string {
  return codes[residue.name] ?? (residue.name || "Unknown");
}

// Cache only entry-independent molecular memberships; entry identity is supplied
// by the caller when materializing canonical selections and display labels.
const rowsByIndex = new WeakMap<ReturnType<typeof gestureIndex>, ProteinSequenceRow[]>();

export function proteinSequenceRows(source: SelectionStructure): ProteinSequenceRow[] {
  const index = gestureIndex(source);
  const retained = rowsByIndex.get(index);
  if (retained) return retained;
  const rows: ProteinSequenceRow[] = [];
  const instances = new Map<string, number>();
  for (const chain of source.normalized.chains) {
    const componentRows = new Map<string, MolecularResidue[]>();
    for (const residue of index.residuesByChain.get(chain.id) ?? []) {
      const target = index.proteinResidues.get(residue.id);
      if (!target) continue;
      const residues = componentRows.get(target.componentId) ?? [];
      residues.push(residue);
      componentRows.set(target.componentId, residues);
    }
    for (const [componentId, residues] of componentRows) {
      const instance = (instances.get(chain.name) ?? 0) + 1;
      instances.set(chain.name, instance);
      rows.push({ key: JSON.stringify([componentId, chain.id]), componentId,
        chainId: chain.id, chainName: chain.name || "(unnamed)",
        qualifier: instance === 1 ? "" : ` · instance ${instance}`, residues,
        residueAtoms: index.residueAtoms });
    }
  }
  rowsByIndex.set(index, rows);
  return rows;
}
