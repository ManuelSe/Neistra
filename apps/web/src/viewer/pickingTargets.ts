import type { AtomReference, SelectionGranularity } from "../api/types";
import { gestureIndex, type SelectionStructure } from "../selection/gestures";
import { canonicalSelection } from "../selection/selection";

export interface PickingTarget {
  key: string;
  atoms: AtomReference[];
}

const nonpolymers = new Set(["ligand", "solvent", "water", "ion", "other_heterogen"]);
const targets = new WeakMap<ReturnType<typeof gestureIndex>, Map<string, PickingTarget>>();

function target(atoms: AtomReference[]): PickingTarget {
  const canonical = canonicalSelection(atoms).atoms;
  return { key: JSON.stringify(canonical), atoms: canonical };
}

/** Resolve application membership; the adapter supplies native normalization for
 * unchanged granularities and unsupported residue targets. No chemistry inference. */
export function resolvePickingTarget(
  pick: AtomReference[],
  mode: SelectionGranularity,
  sources: readonly SelectionStructure[],
  native: (atoms: AtomReference[], mode: SelectionGranularity) => AtomReference[],
): PickingTarget {
  if (mode !== "residue" || !pick.length) return target(native(pick, mode));
  const byEntry = new Map(sources.map(source => [source.entryId, source]));
  const resolved = new Map<string, PickingTarget>();
  for (const atom of pick) {
    const source = byEntry.get(atom.structure_id);
    if (!source) continue;
    const index = gestureIndex(source);
    const component = index.components.get(atom.atom_id);
    const residue = index.residueByAtom.get(atom.atom_id);
    const ids = component?.category === "protein" && residue !== undefined
      ? index.residueAtoms.get(residue)
      : component?.classification_status === "assigned" && nonpolymers.has(component.category)
        ? index.componentAtoms.get(component.id) : undefined;
    if (!ids) {
      const fallback = target(native([atom], mode));
      resolved.set(fallback.key, fallback);
      continue;
    }
    let retained = targets.get(index);
    if (!retained) { retained = new Map(); targets.set(index, retained); }
    const key = JSON.stringify([source.entryId, component!.category === "protein" ? "residue" : "component",
      component!.category === "protein" ? residue : component!.id]);
    let value = retained.get(key);
    if (!value) {
      value = target(ids.map(atom_id => ({ structure_id: source.entryId, atom_id })));
      retained.set(key, value);
    }
    resolved.set(value.key, value);
  }
  return resolved.size === 1 ? resolved.values().next().value! : target([...resolved.values()].flatMap(value => value.atoms));
}
