import type { Selection, StructureProjection } from "../api/types";
import { buildComponentMembership } from "../selection/componentMembership";

/** Prerequisites for the standalone H helper, never a direct-edit boundary. */
export function hydrogenPreparationReason(projection: StructureProjection | undefined, selection: Selection): string | null {
  if (!projection) return "Loading selected molecule…";
  const { structure, hierarchy } = projection;
  const selected = new Set(selection.atoms.map(ref => ref.atom_id));
  const memberships = buildComponentMembership(structure, hierarchy);
  const components = hierarchy.components.map(component => ({ component, ids: memberships.components.get(component.id) ?? [] }))
    .filter(({ ids }) => ids.some(id => selected.has(id)));
  if (components.length !== 1 || components[0].component.category !== "ligand") return "Select atoms in one prepared small-molecule ligand component.";
  const memberIds = new Set(components[0].ids);
  if ([...selected].some(id => !memberIds.has(id))) return "Some selected atoms are no longer present.";
  if (structure.conformers.length !== 1) return "Hydrogen preparation requires one conformer.";
  const atoms = structure.atoms.filter(atom => memberIds.has(atom.id));
  const bonds = structure.bonds.filter(bond => memberIds.has(bond.atom_1_id) || memberIds.has(bond.atom_2_id));
  if (bonds.some(bond => !memberIds.has(bond.atom_1_id) || !memberIds.has(bond.atom_2_id))) return "Covalent bonds cross the component boundary.";
  if (atoms.some(atom => atom.formal_charge === null) || bonds.some(bond => bond.order === null)) return "Assign formal charges and bond orders before using this helper.";
  if (atoms.some(atom => atom.alternate_location || !["H", "C", "N", "O", "S", "F", "Cl", "Br", "I"].includes(atom.element))) return "Unsupported element or unresolved alternate site.";
  if (atoms.length > 1024 || atoms.filter(atom => atom.element !== "H").length > 256) return "Component exceeds the hydrogen helper’s 256 heavy / 1,024 atom limit.";
  if (bonds.some(bond => bond.stereo !== null && bond.stereo !== "NONE")) return "Unsupported bond stereochemistry encoding.";
  return null;
}
