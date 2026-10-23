import type { AtomReference, ComponentHierarchy, MolecularComponent, MolecularResidue, NormalizedStructure, Selection, SelectionMode, SelectionSource } from "../api/types";
import { buildComponentMembership } from "./componentMembership";
import { canonicalSelection } from "./selection";

export interface ViewerPick {
  atoms: AtomReference[];
  kind: "single" | "double";
  shift: boolean;
}

export interface SelectionStructure {
  entryId: string;
  normalized: NormalizedStructure;
  hierarchy: ComponentHierarchy;
}

export interface ResidueSelectionRequest {
  projectId: string;
  projectEpoch: number;
  entryId: string;
  artifactId: string;
  residueId: number;
  source: "project" | "sequence";
  mode: SelectionMode;
  shift: boolean;
}

export function residuePosition(residue: MolecularResidue): string {
  const number = residue.author_number ?? residue.label_number;
  return number === null ? `ID ${residue.id}` : `${number}${residue.insertion_code ?? ""}`;
}

export function residueLabel(residue: MolecularResidue): string {
  return `${residue.name || "Unknown"} ${residuePosition(residue)}`;
}

interface GestureIndex {
  components: Map<number, MolecularComponent>;
  componentAtoms: Map<string, number[]>;
  residueByAtom: Map<number, number>;
  residueAtoms: Map<number, number[]>;
  residues: Map<number, MolecularResidue>;
  residuesByChain: Map<number, MolecularResidue[]>;
  proteinResidues: Map<number, Omit<ResidueTarget, "entryId">>;
  proteinOrder: Map<string, number[]>;
}

const indexes = new WeakMap<NormalizedStructure, WeakMap<ComponentHierarchy, GestureIndex>>();

export function gestureIndex(source: SelectionStructure): GestureIndex {
  let byHierarchy = indexes.get(source.normalized);
  if (!byHierarchy) { byHierarchy = new WeakMap(); indexes.set(source.normalized, byHierarchy); }
  const retained = byHierarchy.get(source.hierarchy);
  if (retained) return retained;
  const membership = buildComponentMembership(source.normalized, source.hierarchy);
  const components = new Map<number, MolecularComponent>();
  for (const component of source.hierarchy.components) {
    for (const id of membership.components.get(component.id) ?? []) components.set(id, component);
  }
  const residueByAtom = new Map<number, number>();
  const residueAtoms = new Map<number, number[]>();
  for (const atom of source.normalized.atoms) if (atom.residue_id !== null) {
    residueByAtom.set(atom.id, atom.residue_id);
    const members = residueAtoms.get(atom.residue_id) ?? [];
    members.push(atom.id); residueAtoms.set(atom.residue_id, members);
  }
  const residues = new Map(source.normalized.residues.map(residue => [residue.id, residue]));
  const proteinOrder = new Map<string, number[]>();
  const residuesByChain = new Map<number, MolecularResidue[]>();
  const proteinResidues = new Map<number, Omit<ResidueTarget, "entryId">>();
  for (const residue of source.normalized.residues) {
    const chain = residuesByChain.get(residue.chain_id) ?? [];
    chain.push(residue); residuesByChain.set(residue.chain_id, chain);
    const first = residueAtoms.get(residue.id)?.[0];
    const component = first === undefined ? undefined : components.get(first);
    if (component?.category !== "protein" || component.classification_status !== "assigned") continue;
    proteinResidues.set(residue.id, { componentId: component.id,
      chainId: residue.chain_id, residueId: residue.id, atomIds: residueAtoms.get(residue.id) ?? [] });
    const key = JSON.stringify([component.id, residue.chain_id]);
    const order = proteinOrder.get(key) ?? [];
    order.push(residue.id); proteinOrder.set(key, order);
  }
  const result = { components, componentAtoms: membership.components, residueByAtom, residueAtoms, residues, residuesByChain, proteinResidues, proteinOrder };
  byHierarchy.set(source.hierarchy, result);
  return result;
}

export interface PickExpansion {
  key: string;
  selection: Selection;
  pick: AtomReference[];
}

const nonpolymers = new Set(["ligand", "solvent", "water", "ion", "other_heterogen"]);

/** Pure application membership resolution; no renderer or chemistry classification. */
export function doubleClickExpansion(pick: AtomReference[], sources: readonly SelectionStructure[]): PickExpansion | null {
  const first = pick[0];
  if (!first || pick.some(atom => atom.structure_id !== first.structure_id)) return null;
  const source = sources.find(item => item.entryId === first.structure_id);
  if (!source) return null;
  const index = gestureIndex(source);
  const component = index.components.get(first.atom_id);
  if (!component || component.classification_status !== "assigned"
    || pick.some(atom => index.components.get(atom.atom_id)?.id !== component.id)) return null;
  const residueId = index.residueByAtom.get(first.atom_id);
  const protein = component.category === "protein";
  if (protein && (residueId === undefined || pick.some(atom => index.residueByAtom.get(atom.atom_id) !== residueId))) return null;
  if (!protein && !nonpolymers.has(component.category)) return null;
  const ids = protein ? index.residueAtoms.get(residueId!) : index.componentAtoms.get(component.id);
  if (!ids?.length) return null;
  return {
    key: JSON.stringify([source.entryId, component.id, protein ? residueId : null]),
    selection: canonicalSelection(ids.map(atom_id => ({ structure_id: source.entryId, atom_id })),
      protein || !component.atom_ids.length ? "residue" : "atom", "viewer"),
    pick,
  };
}

/** Correlates native dblclick with accepted Mol* hits; does not recognize drags or time clicks. */
export class DoubleClickSequence {
  private hits: PickExpansion[] = [];
  clear(): void { this.hits = []; }
  record(hit: PickExpansion | null): void {
    if (!hit) { this.clear(); return; }
    this.hits = [...this.hits.slice(-1), hit];
  }
  take(): PickExpansion | null {
    const [first, second] = this.hits;
    this.clear();
    return first && second && first.key === second.key ? second : null;
  }
}

export interface ResidueTarget {
  entryId: string;
  componentId: string;
  chainId: number;
  residueId: number;
  atomIds: number[];
}

export interface ResidueRangeAnchor extends ResidueTarget {
  projectId: string;
  artifactId: string;
}

export function proteinResidueTarget(pick: AtomReference[], source: SelectionStructure): ResidueTarget | null {
  const first = pick[0];
  if (!first || pick.some(atom => atom.structure_id !== source.entryId)) return null;
  const index = gestureIndex(source);
  const component = index.components.get(first.atom_id);
  const residueId = index.residueByAtom.get(first.atom_id);
  const residue = residueId === undefined ? undefined : index.residues.get(residueId);
  if (component?.category !== "protein" || component.classification_status !== "assigned" || !residue
    || pick.some(atom => index.components.get(atom.atom_id)?.id !== component.id
      || index.residueByAtom.get(atom.atom_id) !== residueId)) return null;
  return { entryId: source.entryId, componentId: component.id, chainId: residue.chain_id,
    residueId: residue.id, atomIds: index.residueAtoms.get(residue.id) ?? [] };
}

export function residueRange(anchor: ResidueRangeAnchor, target: ResidueTarget, source: SelectionStructure, selectionSource: SelectionSource = "viewer"): Selection | null {
  if (anchor.entryId !== target.entryId || anchor.componentId !== target.componentId || anchor.chainId !== target.chainId) return null;
  const index = gestureIndex(source);
  const order = index.proteinOrder.get(JSON.stringify([target.componentId, target.chainId])) ?? [];
  const start = order.indexOf(anchor.residueId), end = order.indexOf(target.residueId);
  if (start < 0 || end < 0) return null;
  const ids = order.slice(Math.min(start, end), Math.max(start, end) + 1).flatMap(id => index.residueAtoms.get(id) ?? []);
  return canonicalSelection(ids.map(atom_id => ({ structure_id: source.entryId, atom_id })), "residue", selectionSource);
}

export function containsResidue(selection: Selection, target: ResidueTarget): boolean {
  const selected = new Set(selection.atoms.filter(atom => atom.structure_id === target.entryId).map(atom => atom.atom_id));
  return target.atomIds.length > 0 && target.atomIds.every(id => selected.has(id));
}
