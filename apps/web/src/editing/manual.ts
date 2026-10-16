import type { LigandEdit, NormalizedStructure, Selection, SelectionEditAction } from "../api/types";

/** Legacy inspector controls share direct semantics; chemistry helpers keep their API. */
export function manualModelEdit(entryId: string, edit: LigandEdit, structure?: NormalizedStructure): { selection: Selection; action: SelectionEditAction } | null {
  let ids: number[], action: SelectionEditAction;
  switch (edit.operation) {
    case "atom.element": ids = [edit.atom_id]; action = { operation: "atom.element", element: edit.element }; break;
    case "atom.charge": ids = [edit.atom_id]; action = { operation: "atom.charge.set", charge: edit.formal_charge }; break;
    case "atom.delete": ids = edit.atom_ids; action = { operation: "atom.delete" }; break;
    case "atom.add": ids = []; action = { operation: "atom.add", element: edit.element, charge: edit.formal_charge, direction: 0, coordinates: edit.coordinates }; break;
    case "bond.add": ids = [edit.atom_1_id, edit.atom_2_id]; action = { operation: "bond.set", order: edit.order }; break;
    case "bond.delete":
    case "bond.order": {
      const bond = structure?.bonds.find(b => b.id === edit.bond_id);
      if (!bond) throw new Error("The bond is unavailable; reload the target before editing.");
      ids = [bond.atom_1_id, bond.atom_2_id];
      action = edit.operation === "bond.delete" ? { operation: "bond.delete" } : { operation: "bond.set", order: edit.order };
      break;
    }
    default: return null;
  }
  return { selection: { schema_version: 1, atoms: ids.map(atom_id => ({ structure_id: entryId, atom_id })), granularity: "atom", source: "inspector" }, action };
}
