import type {
  AtomReference,
  MeasurementKind,
  MolecularResidue,
  NormalizedStructure,
} from "../api/types";
import { measurementCoordinates, measurePoints } from "../measurements/geometry";
import { structureInspectionIndex as inspectionIndex } from "../structures/inspectionIndex";
import { residuePosition } from "./gestures";

export interface AtomInspection {
  reference: AtomReference;
  entryName: string;
  name: string;
  element: string;
  residueName: string | null;
  residueType: MolecularResidue["component_type"] | null;
  residueNumber: number | null;
  insertionCode: string | null;
  chain: string | null;
  coordinates: [number, number, number] | null;
  formalCharge: number | null;
  sourceIndex: number;
  alternateLocation: string | null;
  inferredFields: readonly string[];
  label: string;
}

export interface SelectionGeometry {
  status: "ready" | "ordering_required" | "unavailable" | "summary";
  kind?: MeasurementKind;
  value?: number;
  reason?: string;
  targets: AtomReference[];
}

const referenceKey = (reference: AtomReference) => JSON.stringify([reference.structure_id, reference.atom_id]);

/** Membership qualification does not assign an order to a canonical set. */
export function inspectionOrderMatches(
  atoms: readonly AtomReference[],
  order: readonly AtomReference[] | null,
): order is readonly AtomReference[] {
  if (!order || !atoms.length || atoms.length !== order.length) return false;
  const members = new Set(atoms.map(referenceKey));
  const orderedMembers = new Set(order.map(referenceKey));
  return members.size === atoms.length && orderedMembers.size === order.length
    && order.every(reference => members.has(referenceKey(reference)));
}

/** Retain only a previously justified order when membership narrows or stays equal. */
export function reconcileInspectionOrder(
  previous: readonly AtomReference[],
  next: readonly AtomReference[],
  order: readonly AtomReference[] | null,
): AtomReference[] | null {
  if (!next.length || next.length > 4 || !inspectionOrderMatches(previous, order)) return null;
  const members = new Set(next.map(referenceKey));
  const retained = order.filter(reference => members.has(referenceKey(reference)));
  return inspectionOrderMatches(next, retained) ? retained : null;
}

/** A singleton native atom gesture can append/remove one justified target. */
export function pickedInspectionOrder(
  previous: readonly AtomReference[],
  next: readonly AtomReference[],
  order: readonly AtomReference[] | null,
  picked: AtomReference,
  replace: boolean,
): AtomReference[] | null {
  if (!next.length || next.length > 4) return null;
  if (replace) return next.length === 1 && referenceKey(next[0]) === referenceKey(picked) ? [{ ...picked }] : null;
  // A single existing participant has only one possible order. Larger unordered
  // selections cannot acquire an angle vertex from a subsequent atom pick.
  const justified = inspectionOrderMatches(previous, order) ? order : previous.length <= 1 ? previous : null;
  if (!justified) return null;
  const members = new Set(next.map(referenceKey));
  const retained = justified.filter(reference => members.has(referenceKey(reference)));
  if (members.has(referenceKey(picked)) && !retained.some(reference => referenceKey(reference) === referenceKey(picked))) {
    retained.push({ ...picked });
  }
  return inspectionOrderMatches(next, retained) ? retained : null;
}

export function atomInspection(
  reference: AtomReference,
  structures: ReadonlyMap<string, NormalizedStructure>,
  entryNames: ReadonlyMap<string, string>,
): AtomInspection | null {
  const structure = structures.get(reference.structure_id);
  if (!structure) return null;
  const index = inspectionIndex(structure);
  const atom = index.atoms.get(reference.atom_id);
  if (!atom) return null;
  const residue = atom.residue_id === null ? undefined : index.residues.get(atom.residue_id);
  const chain = residue ? index.chains.get(residue.chain_id) : undefined;
  const entryName = entryNames.get(reference.structure_id) ?? reference.structure_id;
  const coordinates = !index.missingCoordinates && atom.coordinates.length === 3 && atom.coordinates.every(Number.isFinite)
    ? atom.coordinates : null;
  const label = [entryName, `${atom.element} ${atom.name}`.trim(),
    residue ? `${residue.name} ${residuePosition(residue)}`.trim() : null,
    chain?.name ? `chain ${chain.name}` : null].filter(Boolean).join(" · ");
  return {
    reference: { ...reference }, entryName, name: atom.name, element: atom.element,
    residueName: residue?.name || null, residueType: residue?.component_type ?? null,
    residueNumber: residue?.author_number ?? residue?.label_number ?? null,
    insertionCode: residue?.insertion_code ?? null, chain: chain?.name || null,
    coordinates: coordinates ? [...coordinates] : null, formalCharge: atom.formal_charge, sourceIndex: atom.source_index,
    alternateLocation: atom.alternate_location, inferredFields: atom.inferred_fields, label,
  };
}

export function inspectSelectionGeometry(
  atoms: readonly AtomReference[],
  order: readonly AtomReference[] | null,
  structures: ReadonlyMap<string, NormalizedStructure>,
  paused = false,
): SelectionGeometry {
  const kind: MeasurementKind | undefined = atoms.length === 2 ? "distance"
    : atoms.length === 3 ? "angle" : atoms.length === 4 ? "dihedral" : undefined;
  if (!kind) return { status: "summary", targets: [] };
  const targets = atoms.map(reference => ({ ...reference }));
  if (paused) return { status: "unavailable", kind, targets, reason: "Geometry unavailable during preview." };
  const coordinates = measurementCoordinates(atoms, structures);
  if (coordinates.status !== "ready") return { ...coordinates, kind, targets };
  const ordered = inspectionOrderMatches(atoms, order) ? order.map(reference => ({ ...reference })) : null;
  if (kind !== "distance" && !ordered) {
    return { status: "ordering_required", kind, targets, reason: "Order targets to define the angle vertex or signed torsion." };
  }
  const resolvedTargets = ordered ?? targets;
  try {
    const points = new Map(atoms.map((reference, index) => [referenceKey(reference), coordinates.points[index]]));
    const value = measurePoints(kind, resolvedTargets.map(reference => points.get(referenceKey(reference))!));
    return { status: "ready", kind, value, targets: resolvedTargets };
  } catch {
    return { status: "unavailable", kind, targets: resolvedTargets, reason: "Measurement geometry is undefined or outside numerical limits." };
  }
}
