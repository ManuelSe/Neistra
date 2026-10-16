import { expect, it } from "vitest";
import { manualModelEdit } from "../editing/manual";
import { proteinStructure } from "./molecular-fixtures";

it("maps manual atoms/bonds to direct canonical operands while helpers stay separate", () => {
  expect(manualModelEdit("entry", { operation: "atom.charge", atom_id: 5, formal_charge: 2 })?.action).toEqual({ operation: "atom.charge.set", charge: 2 });
  const source = proteinStructure();
  source.bonds = [{ id: 17, atom_1_id: 1, atom_2_id: 2, order: null, aromatic: false, inferred: true, stereo: null }];
  const before = JSON.stringify(source);
  const direct = manualModelEdit("entry", { operation: "bond.delete", bond_id: 17 }, source)!;
  expect(direct.selection.atoms).toEqual([{ structure_id: "entry", atom_id: 1 }, { structure_id: "entry", atom_id: 2 }]);
  expect(direct.action).toEqual({ operation: "bond.delete" });
  expect(JSON.stringify(source)).toBe(before);
  expect(manualModelEdit("entry", { operation: "hydrogen.add", atom_ids: null })).toBeNull();
  expect(manualModelEdit("entry", { operation: "atom.add", element: "P", formal_charge: 0, coordinates: [1,2,3] })?.selection.atoms).toEqual([]);
  expect(() => manualModelEdit("entry", { operation: "bond.delete", bond_id: 18 }, source)).toThrow("unavailable");
});
