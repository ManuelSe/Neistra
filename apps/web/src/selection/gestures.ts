import type { AtomReference, ComponentHierarchy, MolecularComponent, NormalizedStructure, Selection } from "../api/types";
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

interface GestureIndex {
  components: Map<number, MolecularComponent>;
  componentAtoms: Map<string, number[]>;
  residueByAtom: Map<number, number>;
  residueAtoms: Map<number, number[]>;
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
  const result = { components, componentAtoms: membership.components, residueByAtom, residueAtoms };
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
