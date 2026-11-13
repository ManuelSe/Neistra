import { describe, expect, it } from "vitest";
import { parsePDB } from "molstar/lib/mol-io/reader/pdb/parser";
import { trajectoryFromPDB } from "molstar/lib/mol-model-formats/structure/pdb";
import { Structure, Unit, type Model } from "molstar/lib/mol-model/structure";
import { BondType } from "molstar/lib/mol-model/structure/model/types";
import { IndexPairBonds } from "molstar/lib/mol-model-formats/structure/property/bonds/index-pair";
import type { NormalizedStructure } from "../api/types";
import { authoredBondInput, canonicalStructureBonds, overlayAuthoredBonds } from "../viewer/authoredBonds";
import { proteinStructure } from "./molecular-fixtures";

const rows = [
  { serial: 1, name: "C", chain: "B", residue: 2, x: 12, element: "C" },
  { serial: 2, name: "N", chain: "A", residue: 1, x: 0, element: "N" },
  { serial: 3, name: "CA", chain: "B", residue: 2, x: 13.4, element: "C" },
  { serial: 4, name: "CA", chain: "A", residue: 1, x: 1.4, element: "C" },
];
const pdb = rows.map(row => `ATOM  ${String(row.serial).padStart(5)} ${row.name.padStart(4)} ALA ${row.chain}${String(row.residue).padStart(4)}    ${row.x.toFixed(3).padStart(8)}   0.000   0.000  1.00 10.00          ${row.element.padStart(2)}  `).join("\n") + "\nEND\n";
const ids = [41, 7, 93, 15];
const bond = (a: number, b: number, order: number | null = null, aromatic = false): NormalizedStructure["bonds"][number] => ({ id: 1, atom_1_id: a, atom_2_id: b, order, aromatic, stereo: null, inferred: false });
function source(bonds: NormalizedStructure["bonds"] = []): NormalizedStructure {
  const base = proteinStructure();
  return { ...base, atoms: rows.map((row, index) => ({ ...base.atoms[0], id: ids[index], name: row.name,
    element: row.element, source_index: index, coordinates: [row.x, 0, 0], residue_id: row.residue })), bonds };
}
async function model(): Promise<Model> {
  const parsed = await parsePDB(pdb).run();
  if (parsed.isError) throw new Error(parsed.message);
  return (await trajectoryFromPDB(parsed.result).run()).representative;
}
function pairs(structure: Structure): number[][] {
  const result = new Map<string, number[]>();
  const add = (a: Unit.Atomic, ai: number, b: Unit.Atomic, bi: number) => {
    const pair = [ids[a.model.atomicHierarchy.atomSourceIndex.value(a.elements[ai])],
      ids[b.model.atomicHierarchy.atomSourceIndex.value(b.elements[bi])]].sort((x, y) => x - y);
    result.set(pair.join(":"), pair);
  };
  for (const unit of structure.units) if (Unit.isAtomic(unit)) {
    for (let i = 0; i < unit.bonds.a.length; i++) add(unit, unit.bonds.a[i], unit, unit.bonds.b[i]);
  }
  for (const edge of structure.interUnitBonds.edges) {
    const a = structure.unitMap.get(edge.unitA), b = structure.unitMap.get(edge.unitB);
    if (Unit.isAtomic(a) && Unit.isAtomic(b)) add(a, edge.indexA, b, edge.indexB);
  }
  return [...result.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

describe("canonical viewer connectivity", () => {
  it("installs an explicitly empty graph and suppresses native inference without exclusions", async () => {
    const native = await model();
    expect(pairs(Structure.ofModel(native)).length).toBeGreaterThan(0);
    const displayed = overlayAuthoredBonds(native, authoredBondInput(source()));
    expect(IndexPairBonds.Provider.get(displayed)?.bonds.edgeCount).toBe(0);
    // Both the native consumer and the final structure must respect empty pairs.
    expect(pairs(Structure.ofModel(displayed))).toEqual([]);
    expect(pairs(canonicalStructureBonds(Structure.ofModel(displayed)))).toEqual([]);
    expect(pairs(Structure.ofModel(native)).length).toBeGreaterThan(0);
  });

  it("renders only sparse unknown-order canonical edges rather than unioning native bonds", async () => {
    const graph = source([bond(41, 93)]);
    const displayed = canonicalStructureBonds(Structure.ofModel(overlayAuthoredBonds(await model(), authoredBondInput(graph))));
    expect(pairs(displayed)).toEqual([[41, 93]]);
    expect(graph.bonds[0].order).toBeNull();
  });

  it("maps sparse IDs through native source sorting and retains stretched cross-unit edges", async () => {
    const native = await model();
    const order = native.atomicHierarchy.atomSourceIndex.toArray();
    expect(Array.from(order)).not.toEqual([0, 1, 2, 3]);
    const graph = source([bond(41, 15)]);
    const displayed = canonicalStructureBonds(Structure.ofModel(overlayAuthoredBonds(native, authoredBondInput(graph))));
    expect(displayed.units.length).toBeGreaterThan(1);
    expect(pairs(displayed)).toEqual([[15, 41]]);
    expect(displayed.interUnitBonds.edgeCount).toBeGreaterThan(0);
    // Representations derive their own structures; their native graph must remain
    // exhaustive even when each unit contains only a subset of the source atoms.
    const subset = displayed.subsetBuilder(true);
    for (const unit of displayed.units) if (Unit.isAtomic(unit)) {
      for (let index = 0; index < unit.elements.length; index++) {
        const element = unit.elements[index];
        if ([15, 41].includes(ids[unit.model.atomicHierarchy.atomSourceIndex.value(element)])) subset.addToUnit(unit.id, element);
      }
    }
    const representation = subset.getStructure();
    expect(representation.elementCount).toBe(2);
    expect(pairs(representation)).toEqual([[15, 41]]);
  });

  it("preserves aromatic flags on the canonical edge without native chemical completion", async () => {
    const overlaid = overlayAuthoredBonds(await model(), authoredBondInput(source([bond(41, 93, 1.5, true)])));
    const data = IndexPairBonds.Provider.get(overlaid)!;
    expect(data.bonds.edgeCount).toBe(1);
    expect(BondType.is(data.bonds.edgeProps.flag[0], BondType.fromName("aromatic"))).toBe(true);
    expect(pairs(canonicalStructureBonds(Structure.ofModel(overlaid)))).toEqual([[41, 93]]);
  });

  it("rejects contradictory or malformed exclusions instead of hiding present bonds", () => {
    const graph = source([bond(41, 93)]);
    graph.metadata = { neistra_modeling: { schema_version: 1, excluded_bonds: [[93, 41]] } };
    expect(() => authoredBondInput(graph)).toThrow(/both present and excluded.*Repair/);
    graph.metadata = { neistra_modeling: { schema_version: 1, excluded_bonds: [[41, 999]] } };
    expect(() => authoredBondInput(graph)).toThrow("Invalid authored bond exclusion");
    graph.metadata = { neistra_modeling: { schema_version: 2, excluded_bonds: [] } };
    expect(() => authoredBondInput(graph)).toThrow("Unsupported authored modeling metadata");
    graph.metadata = { neistra_modeling: { schema_version: 1, excluded_bonds: [], unexpected: true } };
    expect(() => authoredBondInput(graph)).toThrow("Unsupported authored modeling metadata");
    graph.metadata = { neistra_modeling: {} };
    expect(authoredBondInput(graph).bonds).toEqual(graph.bonds);
  });

  it("rejects missing canonical endpoints and changed projection membership", async () => {
    const native = await model();
    expect(() => overlayAuthoredBonds(native, authoredBondInput(source([bond(41, 999)])))).toThrow("missing atom");
    const graph = source(); graph.atoms.pop();
    expect(() => overlayAuthoredBonds(native, authoredBondInput(graph))).toThrow("changed atom membership");
  });
});
