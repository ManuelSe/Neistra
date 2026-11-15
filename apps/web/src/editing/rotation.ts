import type { BondRotationAction, ModelPreview, Selection, StructureProjection } from "../api/types";

/** Cheap workflow prerequisites; the backend owns scientific admission and full side counts. */
export function bondRotationTarget(projection: StructureProjection | undefined, selection: Selection) {
  const none = (reason: string) => ({ reason, endpoints: [] as StructureProjection["structure"]["atoms"] });
  if (!projection) return none("Loading the current molecule…");
  if (projection.structure.structure_type !== "ligand") return none("Bond rotation requires a supported ligand entry.");
  if (selection.atoms.length !== 2 || selection.atoms.some(ref => ref.structure_id !== projection.entry_id)
    || selection.atoms[0].atom_id === selection.atoms[1].atom_id) return none("Select the two endpoints of one ligand bond.");
  const endpoints = selection.atoms.map(ref => projection.structure.atoms.find(atom => atom.id === ref.atom_id));
  if (endpoints.some(atom => !atom)) return none("The selected bond endpoints are no longer present.");
  const [a, b] = selection.atoms.map(ref => ref.atom_id);
  const bond = projection.structure.bonds.find(value => (value.atom_1_id === a && value.atom_2_id === b) || (value.atom_1_id === b && value.atom_2_id === a));
  if (!bond) return none("The selected atoms do not share a recorded bond.");
  if (bond.aromatic || bond.order !== 1) return none("Choose a nonaromatic single bond with known order.");
  const adjacent = new Map<number, number[]>();
  for (const edge of projection.structure.bonds) {
    if (edge === bond) continue;
    const left = adjacent.get(edge.atom_1_id) ?? [], right = adjacent.get(edge.atom_2_id) ?? [];
    left.push(edge.atom_2_id); right.push(edge.atom_1_id);
    adjacent.set(edge.atom_1_id, left); adjacent.set(edge.atom_2_id, right);
  }
  const visited = new Set([a]), pending = [a];
  while (pending.length) for (const id of adjacent.get(pending.pop()!) ?? []) if (!visited.has(id)) { visited.add(id); pending.push(id); }
  if (visited.has(b)) return none("Ring bonds cannot define an independent moving side.");
  if (!(adjacent.get(a)?.length) || !(adjacent.get(b)?.length)) return none("Choose a bond with a nonterminal side at both endpoints.");
  return { reason: null, endpoints: endpoints as StructureProjection["structure"]["atoms"] };
}

export function qualifiedRotation(preview: ModelPreview | undefined, action: BondRotationAction, selection: Selection, atomCount?: number): boolean {
  const rotation = preview?.rotation;
  const fixed = selection.atoms.find(atom => atom.atom_id !== action.moving_endpoint_id)?.atom_id;
  return Boolean(rotation && fixed && rotation.axis_atom_ids[0] === fixed && rotation.axis_atom_ids[1] === action.moving_endpoint_id
    && rotation.moving_endpoint_id === action.moving_endpoint_id && rotation.angle_degrees === action.angle_degrees
    && Number.isSafeInteger(rotation.rotating_atom_count) && rotation.rotating_atom_count >= 0
    && (atomCount === undefined || rotation.rotating_atom_count + rotation.fixed_atom_count === atomCount)
    && Number.isSafeInteger(rotation.fixed_atom_count) && rotation.fixed_atom_count >= 2 && typeof rotation.no_op === "boolean");
}
