import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderedSet } from "molstar/lib/mol-data/int";
import { Loci } from "molstar/lib/mol-model/loci";
import type { StructureElement } from "molstar/lib/mol-model/structure";
import { Sphere3D } from "molstar/lib/mol-math/geometry";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";
import type { RepresentationContext } from "molstar/lib/mol-repr/representation";
import type { DistanceRepresentation } from "molstar/lib/mol-repr/shape/loci/distance";
import type { AngleRepresentation } from "molstar/lib/mol-repr/shape/loci/angle";
import type { DihedralRepresentation } from "molstar/lib/mol-repr/shape/loci/dihedral";
import type { LabelRepresentation } from "molstar/lib/mol-repr/shape/loci/label";
import { SavedMeasurementBatch, savedMeasurementAnchor, savedMeasurementData, type SavedMeasurementFactories } from "../viewer/savedMeasurementGeometry";
import type { ViewerMeasurement } from "../viewer/MolecularViewer";
import type { Point3D } from "../api/types";

afterEach(() => vi.restoreAllMocks());

function measurement(id: string, kind: ViewerMeasurement["kind"], ids: number[], label = id): ViewerMeasurement {
  return { id, name: id, kind, atom_references: ids.map(atom_id => ({ structure_id: "entry", atom_id })),
    visible: true, label, warnings: [], created_at: "2026-11-16T00:00:00Z", modified_at: "2026-11-16T00:00:00Z" };
}

function analytic() {
  // A-B-C-D and E-B-C-D are opposite signed right dihedrals.
  const points: Point3D[] = [[0, 1, 0], [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, -1, 0], [2, 0, 0], [0, 0, 0]];
  const locis = points.map((_, id) => ({ kind: "element-loci", structure: {},
    elements: [{ unit: {}, indices: OrderedSet.ofSortedArray([id]) }] }) as unknown as StructureElement.Loci);
  const spheres = new Map(locis.map((loci, id) => [loci, Sphere3D.create(Vec3.create(...points[id]), 0)]));
  vi.spyOn(Loci, "getBoundingSphere").mockImplementation(loci => spheres.get(loci as StructureElement.Loci));
  const resolve = (reference: { atom_id: number }) => locis[reference.atom_id - 1] ?? null;
  return { points, locis, spheres, resolve };
}

function nativeHarness() {
  const created: ReturnType<typeof native>[] = [];
  function native() {
    const run = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    return { setState: vi.fn(), destroy: vi.fn(), createOrUpdate: vi.fn((props: object, data: object) => ({ run, props, data })), run };
  }
  const make = () => { const representation = native(); created.push(representation); return representation; };
  const factories: SavedMeasurementFactories = {
    distance: () => make() as unknown as DistanceRepresentation,
    angle: () => make() as unknown as AngleRepresentation,
    dihedral: () => make() as unknown as DihedralRepresentation,
    labels: () => make() as unknown as LabelRepresentation,
  };
  const context = {} as RepresentationContext;
  const canvas = { add: vi.fn(), remove: vi.fn() };
  return { created, factories, context, canvas };
}

function deferred() {
  let resolve!: () => void, reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}

describe("saved native measurement data", () => {
  it("preserves every ordered native endpoint, full signed text and explicit group identity", () => {
    const a = analytic();
    const name = "Repeated full name αβ — ".repeat(80);
    const input = [measurement("plus", "dihedral", [1, 2, 3, 4], name + "+90.00 °"),
      measurement("angle", "angle", [4, 3, 2], name + "90.00 °"),
      measurement("zero", "distance", [2, 7], name + "0.00 Å"),
      measurement("minus", "dihedral", [5, 2, 3, 4], name + "−90.00 °"),
      measurement("duplicate", "distance", [2, 7], name + "0.00 Å")];
    const before = JSON.stringify(input), data = savedMeasurementData(input, a.resolve);
    expect(data.records.map(record => record.id)).toEqual(["plus", "angle", "zero", "minus", "duplicate"]);
    expect(data.groups).toEqual({ distance: ["zero", "duplicate"], angle: ["angle"], dihedral: ["plus", "minus"],
      labels: ["plus", "angle", "zero", "minus", "duplicate"] });
    expect(data.dihedral.quads[0].loci).toEqual([a.locis[0], a.locis[1], a.locis[2], a.locis[3]]);
    expect(data.dihedral.quads[1].loci).toEqual([a.locis[4], a.locis[1], a.locis[2], a.locis[3]]);
    expect(data.angle.triples[0].loci).toEqual([a.locis[3], a.locis[2], a.locis[1]]);
    expect(data.labels.infos.map(info => info.label)).toEqual(input.map(record => record.label));
    expect(data.records.map(record => record.anchor)).toEqual([[0.5, 0, 0], [1, 0, 0], [0, 0, 0], [0.5, 0, 0], [0, 0, 0]]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("retains coincident distance and zero/straight-angle labels without a singular arc anchor", () => {
    const a = analytic();
    const data = savedMeasurementData([measurement("zero-distance", "distance", [2, 7], "0.00 Å"),
      measurement("zero-angle", "angle", [3, 2, 6], "0.00 °"), measurement("straight-angle", "angle", [2, 3, 6], "180.00 °")], a.resolve);
    expect(data.records).toHaveLength(3);
    expect(data.records.map(record => record.anchor)).toEqual([[0, 0, 0], [0, 0, 0], [1, 0, 0]]);
    for (const info of data.labels.infos) {
      expect(info.loci.kind).toBe("data-loci");
      if (info.loci.kind !== "data-loci") throw new Error("Expected owned point locus");
      expect(info.loci.getBoundingSphere?.(Sphere3D()).center.every(Number.isFinite)).toBe(true);
      expect(info.loci.getBoundingSphere?.(Sphere3D()).radius).toBe(0);
      expect(info.loci.getLabel()).toBe(info.label);
    }
  });

  it("copies finite anchors and canonical references rather than borrowing mutable native sphere storage", () => {
    const a = analytic(), input = measurement("distance", "distance", [1, 4]);
    const data = savedMeasurementData([input], a.resolve);
    a.spheres.get(a.locis[0])!.center[0] = 100;
    input.atom_references[0].atom_id = 999;
    expect(data.records[0].anchor).toEqual([0.5, 0.5, 0.5]);
    expect(data.records[0].atomReferences[0].atom_id).toBe(1);
    const info = data.labels.infos[0];
    if (info.loci.kind !== "data-loci") throw new Error("Expected point locus");
    expect([...info.loci.getBoundingSphere!(Sphere3D()).center]).toEqual([0.5, 0.5, 0.5]);
  });

  it("omits hidden, incomplete, missing, nonsingleton and nonfinite records without altering durable inputs", () => {
    const a = analytic();
    const group = { ...a.locis[0], elements: [{ ...a.locis[0].elements[0], indices: OrderedSet.ofSortedArray([0, 1]) }] } as unknown as StructureElement.Loci;
    const invalid = a.spheres.get(a.locis[5])!; invalid.center[2] = Number.NaN;
    const input = [{ ...measurement("hidden", "distance", [1, 2]), visible: false }, measurement("partial", "angle", [1, 2]),
      measurement("missing", "distance", [1, 99]), measurement("group", "distance", [3, 1]),
      measurement("nonfinite", "distance", [1, 6]), measurement("valid", "distance", [1, 4])];
    const data = savedMeasurementData(input, reference => reference.atom_id === 3 ? group : a.resolve(reference));
    expect(data.records.map(record => record.id)).toEqual(["valid"]);
    expect(input).toHaveLength(6);
  });

  it.each(["distance", "angle", "dihedral"] as const)("%s anchors covary with a rigid Cartesian frame", kind => {
    const points: Point3D[] = [[3, 1, 0], [0, 2, 1], [4, 0, 3], [5, 8, 2]];
    const transform = ([x, y, z]: Point3D): Point3D => [-y + 11, x - 7, z + 5];
    const expected = transform(savedMeasurementAnchor(kind, points));
    expect(savedMeasurementAnchor(kind, points.map(transform))).toEqual(expected);
  });

  it("uses an overflow-safe midpoint and the exact angle vertex", () => {
    expect(savedMeasurementAnchor("distance", [[1.6e308, 0, 0], [1.6e308, 2, 0]])).toEqual([1.6e308, 1, 0]);
    expect(savedMeasurementAnchor("angle", [[0, 0, 0], [Number.MIN_VALUE, 0, 0], [1, 0, 0]])[0]).toBe(Number.MIN_VALUE);
  });

  it("retains record-to-group identity through reorder, rename, hide and deletion", () => {
    const a = analytic(), x = measurement("a", "distance", [1, 2]), y = measurement("b", "distance", [1, 2]);
    const data = savedMeasurementData([{ ...y, label: "Full changed name 1.00 Å" }, x], a.resolve);
    expect(data.groups.distance).toEqual(["b", "a"]);
    expect(data.labels.infos.map(info => info.label)).toEqual(["Full changed name 1.00 Å", "a"]);
    expect(savedMeasurementData([{ ...x, visible: false }, y], a.resolve).groups.labels).toEqual(["b"]);
    expect(savedMeasurementData([], a.resolve).records).toEqual([]);
  });
});

describe("owned off-canvas saved measurement batches", () => {
  function data() { const a = analytic(); return savedMeasurementData([measurement("d", "distance", [1, 2]),
    measurement("a", "angle", [1, 2, 3]), measurement("t", "dihedral", [1, 2, 3, 4])], a.resolve); }

  it("builds at most three native geometry reps and exactly one unchanged-quality text layer", async () => {
    const h = nativeHarness(), batch = new SavedMeasurementBatch(data(), h.context, h.factories);
    expect(h.created).toHaveLength(4);
    expect(batch.attach(h.canvas)).toBe(false);
    expect(await batch.prepare(() => true)).toBe(true);
    expect(h.canvas.add).not.toHaveBeenCalled();
    expect(h.created.slice(0, 3).map(repr => repr.createOrUpdate.mock.calls[0][0])).toEqual([
      { visuals: ["lines"] }, { visuals: ["vectors", "sector"] }, { visuals: ["extenders", "arms", "sector"] },
    ]);
    expect(h.created[3].createOrUpdate).toHaveBeenCalledExactlyOnceWith({ customText: "", scaleByRadius: false }, batch.data.labels);
    expect(batch.attach(h.canvas)).toBe(true); expect(h.canvas.add).toHaveBeenCalledTimes(4);
    batch.retire(); batch.retire();
    for (const repr of h.created) { expect(repr.destroy).toHaveBeenCalledOnce(); expect(repr.setState).toHaveBeenLastCalledWith({ visible: false, pickable: false, markerActions: 0 }); }
    expect(h.canvas.remove).toHaveBeenCalledTimes(4);
  });

  it.each([10, 100, 1000])("keeps one text and one geometry representation for %i complete distinct labels", async count => {
    const a = analytic(), h = nativeHarness();
    const input = Array.from({ length: count }, (_, i) => measurement(`id-${i}`, "distance", [1, 2], `Complete unique label ${i} 1.00 Å`));
    const batch = new SavedMeasurementBatch(savedMeasurementData(input, a.resolve), h.context, h.factories);
    expect(await batch.prepare(() => true)).toBe(true); batch.attach(h.canvas);
    expect(h.created).toHaveLength(2); expect(h.canvas.add).toHaveBeenCalledTimes(2);
    expect(batch.data.labels.infos.map(info => info.label)).toEqual(input.map(item => item.label));
    expect(batch.data.groups.distance).toHaveLength(count); batch.retire();
  });

  it("retires staged resources immediately and destroys the pending native task only after settlement", async () => {
    const h = nativeHarness(), held = deferred(), batch = new SavedMeasurementBatch(data(), h.context, h.factories);
    h.created[0].run.mockReturnValueOnce(held.promise);
    const preparing = batch.prepare(() => true);
    batch.retire();
    expect(h.created[0].destroy).not.toHaveBeenCalled();
    for (const repr of h.created.slice(1)) expect(repr.destroy).toHaveBeenCalledOnce();
    held.resolve(); expect(await preparing).toBe(false);
    expect(h.created[0].destroy).toHaveBeenCalledOnce();
    expect(h.created[1].run).not.toHaveBeenCalled();
    expect(batch.attach(h.canvas)).toBe(false); expect(h.canvas.add).not.toHaveBeenCalled();
  });

  it("checks ownership after each held native build and discards the entire stale batch", async () => {
    const h = nativeHarness(), held = deferred(), batch = new SavedMeasurementBatch(data(), h.context, h.factories);
    let current = true;
    h.created[1].run.mockReturnValueOnce(held.promise);
    const pending = batch.prepare(() => current);
    await vi.waitFor(() => expect(h.created[1].run).toHaveBeenCalledOnce());
    current = false; held.resolve(); expect(await pending).toBe(false);
    for (const repr of h.created) expect(repr.destroy).toHaveBeenCalledOnce();
    expect(h.created[2].run).not.toHaveBeenCalled(); expect(h.canvas.add).not.toHaveBeenCalled();
  });

  it("cleans every staged representation on native build failure and permits an independent later batch", async () => {
    const h = nativeHarness(), batch = new SavedMeasurementBatch(data(), h.context, h.factories);
    h.created[2].run.mockRejectedValueOnce(new Error("native build refused"));
    await expect(batch.prepare(() => true)).rejects.toThrow("native build refused");
    for (const repr of h.created) expect(repr.destroy).toHaveBeenCalledOnce();
    const next = new SavedMeasurementBatch(batch.data, h.context, h.factories);
    expect(await next.prepare(() => true)).toBe(true); expect(next.attach(h.canvas)).toBe(true); next.retire();
  });

  it("cleans earlier representations if a later native factory fails", () => {
    const h = nativeHarness();
    h.factories.labels = () => { throw new Error("label factory refused"); };
    expect(() => new SavedMeasurementBatch(data(), h.context, h.factories)).toThrow("label factory refused");
    for (const repr of h.created) expect(repr.destroy).toHaveBeenCalledOnce();
  });

  it("removes the entire batch if native attachment fails part way through", async () => {
    const h = nativeHarness(), batch = new SavedMeasurementBatch(data(), h.context, h.factories);
    await batch.prepare(() => true);
    h.canvas.add.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error("canvas refused"); });
    expect(() => batch.attach(h.canvas)).toThrow("canvas refused");
    expect(h.canvas.remove).toHaveBeenCalledTimes(4);
    for (const repr of h.created) expect(repr.destroy).toHaveBeenCalledOnce();
  });

  it("cannot continue attaching after synchronous retirement inside a native callback", async () => {
    const h = nativeHarness(), batch = new SavedMeasurementBatch(data(), h.context, h.factories);
    await batch.prepare(() => true);
    h.canvas.add.mockImplementationOnce(() => batch.retire());
    expect(batch.attach(h.canvas)).toBe(false); expect(h.canvas.add).toHaveBeenCalledOnce();
    for (const repr of h.created) expect(repr.destroy).toHaveBeenCalledOnce();
  });
});
