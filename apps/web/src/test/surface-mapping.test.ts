import { expect, it, vi } from "vitest";
import { parsePDB } from "molstar/lib/mol-io/reader/pdb/parser";
import { trajectoryFromPDB } from "molstar/lib/mol-model-formats/structure/pdb";
import { Structure, StructureElement, Unit } from "molstar/lib/mol-model/structure";
import { Interval, OrderedSet, SortedArray } from "molstar/lib/mol-data/int";
import { eachSerialElement, getSerialElementLoci } from "molstar/lib/mol-repr/structure/visual/util/element";
import { computeSurface } from "../viewer/surface/geometry";
import { surfaceInput, surfaceDisplayGeometry, attachSurfaceGeometry } from "../viewer/surface/visual";
import { SURFACE_LIMITS } from "../viewer/surface/protocol";

const sourceIds = [70, 9, 50, 2];
async function fixture() {
  const rows = [{ chain: "B", name: "N", x: 0 }, { chain: "A", name: "CA", x: 2 },
    { chain: "B", name: "CA", x: 4 }, { chain: "A", name: "N", x: 6 }];
  const pdb = rows.map((row, i) => `ATOM  ${String(i + 1).padStart(5)} ${row.name.padStart(4)} ALA ${row.chain}   1    ${row.x.toFixed(3).padStart(8)}   0.000   0.000  1.00 10.00           C  `).join("\n") + "\nEND\n";
  const parsed = await parsePDB(pdb).run();
  if (parsed.isError) throw new Error(parsed.message);
  const structure = Structure.ofModel((await trajectoryFromPDB(parsed.result).run()).representative);
  const singles = structure.units.flatMap(unit => Array.from(unit.elements).map(element => ({ unit, element }))).reverse();
  const partitioned = Structure.create(singles.map(({ unit, element }, i) =>
    unit.getChild(SortedArray.ofSortedArray([element])).getCopy(i, i, i)));
  return { structure, partitioned };
}

it("extracts identical canonical coordinates/radii across native order and unit partitions", async () => {
  const { structure, partitioned } = await fixture();
  const input = surfaceInput(structure, sourceIds, "entry");
  const alternative = surfaceInput(partitioned, sourceIds, "entry");
  expect(input.kind).toBe("entry");
  expect(input.atomIds).toEqual(Uint32Array.of(2, 9, 50, 70));
  expect(input.x).toEqual(Float64Array.of(6, 2, 4, 0));
  expect(alternative).toEqual(input);
  const first = await computeSurface(input), second = await computeSurface(alternative);
  for (const field of ["vertices", "normals", "indices", "groups", "atomIds"] as const) expect(first[field]).toEqual(second[field]);
  const fragment = await computeSurface({ ...input, kind: "fragment" });
  for (const field of ["vertices", "normals", "indices", "groups", "atomIds"] as const) expect(fragment[field]).toEqual(first[field]);
});

it("maps canonical owners into native picking/overpaint groups without altering cached geometry", async () => {
  const { structure } = await fixture();
  const canonical = await computeSurface(surfaceInput(structure, sourceIds));
  const originalGroups = canonical.groups.slice(), originalIds = canonical.atomIds.slice();
  const reserve = vi.fn();
  const display = await surfaceDisplayGeometry(structure, sourceIds, canonical, new AbortController().signal, reserve);
  expect(display.displayBytes).toBe(canonical.groups.byteLength + sourceIds.length * 4);
  expect(reserve).toHaveBeenCalledWith(display.displayBytes);
  expect(display.geometry.vertices).toBe(canonical.vertices);
  expect(display.geometry.normals).toBe(canonical.normals);
  expect(display.geometry.indices).toBe(canonical.indices);
  for (let i = 0; i < canonical.groups.length; i++) {
    expect(display.geometry.atomIds[display.geometry.groups[i]]).toBe(canonical.atomIds[canonical.groups[i]]);
  }
  for (let serial = 0; serial < sourceIds.length; serial++) {
    const loci = getSerialElementLoci({ objectId: 1, instanceId: 0, groupId: serial }, structure, 1);
    if (!StructureElement.Loci.is(loci)) throw new Error("Expected native atom loci.");
    const selected = loci.elements[0];
    if (!Unit.isAtomic(selected.unit)) throw new Error("Expected atomic fixture.");
    const element = selected.unit.elements[OrderedSet.getAt(selected.indices, 0)];
    expect(display.geometry.atomIds[serial]).toBe(sourceIds[selected.unit.model.atomicHierarchy.atomSourceIndex.value(element)]);
    const groups: number[] = [];
    eachSerialElement(loci, structure, range => {
      for (let i = Interval.start(range); i < Interval.end(range); i++) groups.push(i);
      return true;
    });
    expect(groups).toEqual([serial]);
  }
  expect(canonical.groups).toEqual(originalGroups); expect(canonical.atomIds).toEqual(originalIds);
  expect(() => attachSurfaceGeometry(structure, canonical)).toThrow("validated");
  expect(() => attachSurfaceGeometry(structure, display.geometry)).not.toThrow();
});

it("rejects equal-count identity changes and duplicate ownership, and validates the attachment component", async () => {
  const { structure, partitioned } = await fixture();
  const canonical = await computeSurface(surfaceInput(structure, sourceIds));
  const signal = new AbortController().signal;
  await expect(surfaceDisplayGeometry(structure, [70, 9, 50, 999], canonical, signal, () => {})).rejects.toThrow("membership");
  await expect(surfaceDisplayGeometry(structure, [70, 9, 50, 9], canonical, signal, () => {})).rejects.toThrow("duplicated");
  const display = await surfaceDisplayGeometry(structure, sourceIds, canonical, signal, () => {});
  expect(() => attachSurfaceGeometry(partitioned, display.geometry)).toThrow("validated");
  display.geometry.atomIds[0] = 999;
  expect(() => attachSurfaceGeometry(structure, display.geometry)).toThrow("membership");
  await expect(surfaceDisplayGeometry(structure, sourceIds, { ...canonical, groups: Float32Array.of(99) }, signal, () => {})).rejects.toThrow("ownership");
});

it("checks retained/working admission and aborts before allocating or traversing native atoms", async () => {
  const { structure } = await fixture();
  const canonical = await computeSurface(surfaceInput(structure, sourceIds));
  const noTraversal = { elementCount: sourceIds.length, get units() { throw new Error("Traversal must not occur"); } } as unknown as Structure;
  const controller = new AbortController(); controller.abort();
  const reserve = vi.fn();
  await expect(surfaceDisplayGeometry(noTraversal, sourceIds, canonical, controller.signal, reserve)).rejects.toThrow();
  expect(reserve).not.toHaveBeenCalled();
  await expect(surfaceDisplayGeometry(noTraversal, sourceIds, canonical, new AbortController().signal,
    () => { throw new Error("retained limit"); })).rejects.toThrow("retained limit");
  await expect(surfaceDisplayGeometry(noTraversal, sourceIds,
    { ...canonical, evidence: { ...canonical.evidence, meshBytes: SURFACE_LIMITS.workingBytes } },
    new AbortController().signal, reserve)).rejects.toThrow("2 GiB");
});

it("cooperatively cancels owner conversion and rejects fractional owner groups", async () => {
  const { structure } = await fixture();
  const original = await computeSurface(surfaceInput(structure, sourceIds));
  const vertices = new Float32Array(20_000 * 3), normals = new Float32Array(vertices.length), groups = new Float32Array(20_000);
  const canonical = { ...original, vertices, normals, groups, indices: new Uint32Array(),
    evidence: { ...original.evidence, meshBytes: vertices.byteLength + normals.byteLength + groups.byteLength + original.atomIds.byteLength } };
  const controller = new AbortController();
  const reserve = vi.fn(() => { setTimeout(() => controller.abort(), 0); });
  await expect(surfaceDisplayGeometry(structure, sourceIds, canonical, controller.signal, reserve)).rejects.toThrow();
  expect(reserve).toHaveBeenCalledOnce(); expect(groups.every(value => value === 0)).toBe(true);
  const malformed = { ...original, groups: original.groups.slice() }; malformed.groups[0] = 0.5;
  await expect(surfaceDisplayGeometry(structure, sourceIds, malformed, new AbortController().signal, () => {})).rejects.toThrow("owner group");
});
