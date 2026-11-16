import { beforeEach, describe, expect, it } from "vitest";
import type { AtomReference, NormalizedStructure, SelectionMode } from "../api/types";
import { atomInspection, inspectSelectionGeometry, inspectionOrderMatches } from "../selection/inspection";
import { canonicalSelection, emptySelection } from "../selection/selection";
import { useSelectionStore } from "../store/selection";
import { componentHierarchy, proteinStructure } from "./molecular-fixtures";

const refs = (...ids: number[]): AtomReference[] => ids.map(atom_id => ({ structure_id: "entry", atom_id }));

function geometryStructure(points: [number, number, number][]): NormalizedStructure {
  const original = proteinStructure();
  return { ...original, atoms: points.map((coordinates, index) => ({ ...original.atoms[0], id: index + 1, source_index: index, coordinates })),
    bonds: [], conformers: [{ id: 1, name: "Observed", coordinates: points }] };
}

describe("qualified transient selection geometry", () => {
  it("gives analytic order-independent distance, including valid coincident atoms", () => {
    const structures = new Map([["entry", geometryStructure([[0, 0, 0], [1, 2, 2]])]]);
    expect(inspectSelectionGeometry(refs(2, 1), null, structures)).toMatchObject({ status: "ready", kind: "distance", value: 3 });
    structures.set("entry", geometryStructure([[2, 2, 2], [2, 2, 2]]));
    expect(inspectSelectionGeometry(refs(1, 2), null, structures)).toMatchObject({ status: "ready", value: 0 });
  });

  it("requires real ordering and computes the displayed angle vertex", () => {
    const structures = new Map([["entry", geometryStructure([[1, 0, 0], [0, 0, 0], [0, 1, 0]])]]);
    expect(inspectSelectionGeometry(refs(1, 2, 3), null, structures).status).toBe("ordering_required");
    expect(inspectSelectionGeometry(refs(1, 2, 3), refs(1, 2, 3), structures)).toMatchObject({ status: "ready", kind: "angle", value: 90 });
    const reordered = inspectSelectionGeometry(refs(1, 2, 3), refs(2, 1, 3), structures);
    expect(reordered.value).toBeCloseTo(45, 10);
    expect(reordered.targets).toEqual(refs(2, 1, 3));
    expect(inspectSelectionGeometry(refs(1, 2, 3), refs(1, 2, 4), structures).status).toBe("ordering_required");
    expect(inspectSelectionGeometry(refs(1, 2, 3), refs(1, 2, 2), structures).status).toBe("ordering_required");
  });

  it.each([1, -1] as const)("retains independently specified signed torsion for final z=%s", z => {
    const structures = new Map([["entry", geometryStructure([[1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, z]])]]);
    expect(inspectSelectionGeometry(refs(1, 2, 3, 4), refs(1, 2, 3, 4), structures))
      .toMatchObject({ status: "ready", kind: "dihedral", value: z === 1 ? -90 : 90 });
  });

  it.each([
    { points: [[1, 0, 0], [0, 0, 0], [2, 0, 0]], value: 0 },
    { points: [[1, 0, 0], [0, 0, 0], [-2, 0, 0]], value: 180 },
  ] as { points: [number, number, number][]; value: number }[])("accepts noncoincident collinear angle $value", ({ points, value }) => {
    expect(inspectSelectionGeometry(refs(1, 2, 3), refs(1, 2, 3), new Map([["entry", geometryStructure(points)]])))
      .toMatchObject({ status: "ready", value });
  });

  it.each(([
    [[0, 0, 0], [0, 0, 0], [1, 0, 0]],
    [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]],
    [[0, 0, 0], [Number.NaN, 0, 0]],
    [[0, 0, 0], [Number.POSITIVE_INFINITY, 0, 0]],
    [[1e308, 0, 0], [-1e308, 0, 0]],
  ] as [number, number, number][][]).map(points => ({ points })))("refuses undefined or nonfinite geometry %#", ({ points }) => {
    const targets = refs(...points.map((_, index) => index + 1));
    expect(inspectSelectionGeometry(targets, targets, new Map([["entry", geometryStructure(points)]]))).toMatchObject({ status: "unavailable" });
  });

  it("retires values during preview, missing input and deleted atoms without confusing missing zeroes", () => {
    const structure = geometryStructure([[0, 0, 0], [0, 0, 0]]);
    const structures = new Map([["entry", structure]]);
    expect(inspectSelectionGeometry(refs(1, 2), null, structures, true).reason).toContain("preview");
    expect(inspectSelectionGeometry(refs(1, 3), null, structures).reason).toContain("no longer");
    expect(inspectSelectionGeometry(refs(1, 2), null, new Map()).reason).toContain("not loaded");
    structures.set("entry", { ...structure, warnings: [{ code: "missing_coordinates", operation: "import", message: "Placeholders", severity: "warning", field: "coordinates", blocking: false }] });
    expect(inspectSelectionGeometry(refs(1, 2), null, structures)).toMatchObject({ status: "unavailable", reason: "Source coordinates are missing." });
    structures.set("entry", { ...structure, source: { facts: { missing_coordinates: true } } } as NormalizedStructure);
    expect(inspectSelectionGeometry(refs(1, 2), null, structures).status).toBe("unavailable");
    structures.set("entry", structure);
    expect(inspectSelectionGeometry(refs(1, 2), null, structures)).toMatchObject({ status: "ready", value: 0 });
    expect(inspectSelectionGeometry(refs(1, 1), null, structures).status).toBe("unavailable");
  });

  it("resolves cross-entry references independently and bounds summary work", () => {
    const a = geometryStructure([[0, 0, 0]]), b = geometryStructure([[0, 0, 3]]);
    const targets = [...refs(1), { structure_id: "other", atom_id: 1 }];
    expect(inspectSelectionGeometry(targets, null, new Map([["entry", a], ["other", b]])))
      .toMatchObject({ status: "ready", value: 3 });
    const huge = Array.from({ length: 10000 }, (_, index) => refs(index + 1)[0]);
    expect(inspectSelectionGeometry(huge, null, new Map())).toEqual({ status: "summary", targets: [] });
  });
});

describe("canonical atom information", () => {
  it("reports known author numbering/insertion and exact entries despite duplicate labels", () => {
    const structure = proteinStructure();
    structure.residues[0] = { ...structure.residues[0], author_number: 0, label_number: 100, insertion_code: "B" };
    structure.atoms[0] = { ...structure.atoms[0], formal_charge: 0 };
    const structures = new Map([["entry", structure], ["copy", structure]]);
    const entryNames = new Map([["entry", "Protein A"], ["copy", "Protein B"]]);
    const detail = atomInspection(refs(1)[0], structures, entryNames)!;
    expect(detail).toMatchObject({ entryName: "Protein A", residueName: "GLY", residueType: "polymer", residueNumber: 0,
      insertionCode: "B", chain: "A", formalCharge: 0, sourceIndex: 0 });
    expect(detail.label).toContain("GLY 0B");
    expect(atomInspection({ structure_id: "copy", atom_id: 1 }, structures, entryNames)?.label).toContain("Protein B");
    expect(atomInspection(refs(999)[0], structures, entryNames)).toBeNull();
    expect(atomInspection(refs(1)[0], new Map(), entryNames)).toBeNull();
    detail.coordinates![0] = 999;
    expect(structure.atoms[0].coordinates[0]).not.toBe(999);
  });

  it("does not invent absent identity/charge/coordinates and replaces immutable cached data", () => {
    const initial = proteinStructure();
    initial.atoms[0] = { ...initial.atoms[0], residue_id: null, formal_charge: null };
    const structures = new Map([["entry", initial]]);
    expect(atomInspection(refs(1)[0], structures, new Map())).toMatchObject({ entryName: "entry", residueName: null, residueType: null,
      residueNumber: null, insertionCode: null, chain: null, formalCharge: null });
    const next = { ...initial, atoms: initial.atoms.map(atom => ({ ...atom, name: "Changed", coordinates: [Number.NaN, 0, 0] as [number, number, number] })) };
    structures.set("entry", next);
    expect(atomInspection(refs(1)[0], structures, new Map())).toMatchObject({ name: "Changed", coordinates: null });
    structures.set("entry", { ...initial, atoms: [] });
    expect(atomInspection(refs(1)[0], structures, new Map())).toBeNull();
  });

  it("indexes an immutable source once across repeated atom inspection and readouts", () => {
    const source = geometryStructure([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    const atoms = source.atoms;
    let visits = 0;
    Object.defineProperty(source, "atoms", { get: () => { visits++; return atoms; } });
    const structures = new Map([["entry", source]]);
    for (let i = 0; i < 50; i++) {
      atomInspection(refs(i % 3 + 1)[0], structures, new Map());
      inspectSelectionGeometry(refs(1, 2, 3), refs(3, 1, 2), structures);
    }
    expect(visits).toBe(1);
  });
});

describe("application-owned inspection order", () => {
  const normalized = geometryStructure([[1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]]);
  const source = { entryId: "entry", normalized, hierarchy: componentHierarchy(normalized) };
  const context = { projectId: "project", artifactId: "artifact", source };
  const state = () => useSelectionStore.getState();
  const pick = (id: number, mode: SelectionMode = "add") => state().applyViewer(canonicalSelection(refs(id), "atom", "viewer"),
    mode, { atoms: refs(id), kind: "single", shift: mode === "add" }, context);

  beforeEach(() => {
    useSelectionStore.setState({ projectId: null, projectEpoch: 0, rangeAnchor: null,
      selection: emptySelection(), inspectionOrder: null, pickingGranularity: "atom" });
    state().setProject("project");
  });

  it("keeps actual pick sequence separately from canonical sorting and handles all modifiers", () => {
    pick(3, "replace"); pick(1); pick(4); pick(2);
    expect(state().selection.atoms).toEqual(refs(1, 2, 3, 4));
    expect(state().inspectionOrder).toEqual(refs(3, 1, 4, 2));
    pick(1, "subtract");
    expect(state().inspectionOrder).toEqual(refs(3, 4, 2));
    pick(1, "toggle");
    expect(state().inspectionOrder).toEqual(refs(3, 4, 2, 1));
    pick(4, "toggle");
    expect(state().inspectionOrder).toEqual(refs(3, 2, 1));
    pick(3, "replace");
    expect(state().inspectionOrder).toEqual(refs(3));
  });

  it("cannot manufacture a vertex from unordered query/batch/residue selections", () => {
    state().replace(canonicalSelection(refs(3, 1)));
    pick(2);
    expect(state().inspectionOrder).toBeNull();
    state().clear();
    state().apply(canonicalSelection(refs(3, 1, 2)), "replace");
    expect(state().inspectionOrder).toBeNull();
    state().setPickingGranularity("residue");
    state().applyViewer(canonicalSelection(refs(1, 2, 3), "residue", "viewer"), "replace",
      { atoms: refs(1), kind: "single", shift: false }, context);
    expect(state().inspectionOrder).toBeNull();
  });

  it("qualifies explicit order against exact current membership and rejects held obsolete submissions", () => {
    state().replace(canonicalSelection(refs(1, 2, 3)));
    const canonical = state().selection;
    expect(state().setInspectionOrder(refs(3, 1, 2))).toBe(true);
    expect(state().selection).toBe(canonical);
    expect(state().setInspectionOrder(refs(1, 1, 2))).toBe(false);
    expect(state().inspectionOrder).toEqual(refs(3, 1, 2));
    const heldOrder = refs(2, 1, 3);
    state().replace(canonicalSelection(refs(1, 2, 4)));
    expect(state().inspectionOrder).toBeNull();
    expect(state().setInspectionOrder(heldOrder)).toBe(false);
    expect(state().setInspectionOrder(refs(4, 1, 2))).toBe(true);
    state().apply(canonicalSelection(refs(1)), "subtract");
    expect(state().inspectionOrder).toEqual(refs(4, 2));
    state().apply(canonicalSelection(refs(3)), "add");
    expect(state().inspectionOrder).toBeNull();
  });

  it("does not confuse an atom hit that expands a residue range with ordered atom picking", () => {
    const range = geometryStructure([[1, 0, 0], [0, 0, 0], [0, 1, 0]]);
    range.residues = [1, 2, 3].map(id => ({ ...range.residues[0], id, author_number: id }));
    range.atoms = range.atoms.map((atom, index) => ({ ...atom, residue_id: index + 1 }));
    const rangeContext = { ...context, source: { entryId: "entry", normalized: range, hierarchy: componentHierarchy(range) } };
    useSelectionStore.setState({ selection: canonicalSelection(refs(1)), inspectionOrder: refs(1),
      rangeAnchor: { projectId: "project", artifactId: "artifact", entryId: "entry", componentId: "component-polymer", chainId: 1, residueId: 1, atomIds: [1] } });
    state().applyViewer(canonicalSelection(refs(2), "atom", "viewer"), "add",
      { atoms: refs(2), kind: "single", shift: true }, rangeContext);
    expect(state().selection.atoms).toEqual(refs(1, 2));
    expect(state().selection.granularity).toBe("residue");
    expect(state().inspectionOrder).toBeNull();
    state().applyViewer(canonicalSelection(refs(3), "atom", "viewer"), "toggle",
      { atoms: refs(3), kind: "single", shift: false }, rangeContext);
    expect(state().inspectionOrder).toBeNull();
    expect(inspectSelectionGeometry(state().selection.atoms, state().inspectionOrder, new Map([["entry", range]])).status).toBe("ordering_required");
  });

  it("retires empty/large/project order and ignores obsolete project picks", () => {
    pick(1, "replace"); pick(2); pick(3); pick(4); pick(5);
    expect(state().inspectionOrder).toBeNull();
    expect(state().setInspectionOrder(refs(5, 4, 3, 2, 1))).toBe(false);
    state().clear();
    expect(state().inspectionOrder).toBeNull();
    pick(2, "replace"); pick(1);
    state().setProject("new-project");
    expect(state().inspectionOrder).toBeNull();
    pick(3);
    expect(state().selection.atoms).toEqual([]);
    expect(state().inspectionOrder).toBeNull();
  });

  it("requires exact entry identity rather than equal numeric atom IDs", () => {
    const selected = [...refs(1), { structure_id: "copy", atom_id: 1 }];
    expect(inspectionOrderMatches(selected, refs(1, 1))).toBe(false);
    state().replace(canonicalSelection(selected));
    expect(state().setInspectionOrder([...selected].reverse())).toBe(true);
  });
});
