import type { AtomReference, Entry, MolecularComponent, StructureProjection } from "../api/types";
import { buildComponentMembership } from "../selection/componentMembership";
import { canonicalSelection } from "../selection/selection";
import type { InteractionRecord } from "./types";

export type InteractionTarget =
  | { kind: "all" }
  | { kind: "selection"; atoms: AtomReference[] }
  | { kind: "ligand"; entryId: string; componentId: string; atoms: AtomReference[] };

export interface InteractionLigandCandidate {
  key: string;
  entryId: string;
  componentId: string;
  label: string;
  atoms: AtomReference[];
  eligible: boolean;
  reason: string | null;
}

export interface InteractionTargetResolution {
  status: "ready" | "validating" | "needs-update";
  atoms: AtomReference[];
  hidden: boolean;
  message: string | null;
}

const polymerCategories = new Set(["protein", "dna", "rna", "other_polymer"]);
const atomKey = (atom: AtomReference) => JSON.stringify([atom.structure_id, atom.atom_id]);
const canonicalAtoms = (atoms: Iterable<AtomReference>) => canonicalSelection(atoms).atoms;

function currentProjection(entry: Entry, projections: ReadonlyMap<string, StructureProjection>) {
  const projection = projections.get(entry.id);
  return projection?.entry_id === entry.id && projection.artifact_id === entry.current_artifact_id
    && projection.projection_state !== "coordinate-seed" ? projection : null;
}

function ligandMembership(projection: StructureProjection) {
  const membership = buildComponentMembership(projection.structure, projection.hierarchy).components;
  const owners = new Map<number, Set<string>>();
  for (const component of projection.hierarchy.components) {
    if (polymerCategories.has(component.category)) continue;
    for (const id of membership.get(component.id) ?? []) {
      const components = owners.get(id) ?? new Set<string>();
      components.add(component.id); owners.set(id, components);
    }
  }
  const crosslinked = new Set<string>();
  for (const bond of projection.structure.bonds) {
    for (const first of owners.get(bond.atom_1_id) ?? []) {
      for (const second of owners.get(bond.atom_2_id) ?? []) {
        if (first !== second) { crosslinked.add(first); crosslinked.add(second); }
      }
    }
  }
  return { membership, crosslinked };
}

function candidateReason(component: MolecularComponent, ids: ReadonlySet<number>, crosslinked: ReadonlySet<string>): string | null {
  if (!ids.size) return "This ligand has no available atoms. Use an explicit selection.";
  if (crosslinked.has(component.id)) {
    return "This component is linked to another nonpolymer instance. Use an explicit selection for the complete target.";
  }
  return null;
}

/** Existing assigned navigation instances only; never infer a whole ligand. */
export function resolveInteractionLigands(entries: readonly Entry[], projections: ReadonlyMap<string, StructureProjection>): InteractionLigandCandidate[] {
  const candidates = entries.flatMap(entry => {
    const projection = currentProjection(entry, projections);
    if (!projection) return [];
    const { membership, crosslinked } = ligandMembership(projection);
    return projection.hierarchy.components
      .filter(component => component.category === "ligand" && component.classification_status === "assigned")
      .map(component => {
        const ids = new Set(membership.get(component.id));
        const reason = candidateReason(component, ids, crosslinked);
        return {
          key: JSON.stringify([entry.id, component.id]), entryId: entry.id, componentId: component.id,
          label: `${entry.name} · ${component.display_label}`,
          atoms: canonicalAtoms([...ids].map(atom_id => ({ structure_id: entry.id, atom_id }))),
          eligible: reason === null, reason,
        };
      });
  });
  const labels = new Map<string, number>();
  for (const candidate of candidates) labels.set(candidate.label, (labels.get(candidate.label) ?? 0) + 1);
  return candidates.map(candidate => (labels.get(candidate.label) ?? 0) > 1
    ? { ...candidate, label: `${candidate.label} · ${candidate.entryId}/${candidate.componentId}` }
    : candidate);
}

export function captureSelectionTarget(atoms: Iterable<AtomReference>): InteractionTarget | null {
  const captured = canonicalAtoms(atoms).map(atom => ({ ...atom }));
  return captured.length ? { kind: "selection", atoms: captured } : null;
}

export function captureLigandTarget(candidate: InteractionLigandCandidate): InteractionTarget | null {
  return candidate.eligible && candidate.atoms.length ? {
    kind: "ligand", entryId: candidate.entryId, componentId: candidate.componentId,
    atoms: canonicalAtoms(candidate.atoms).map(atom => ({ ...atom })),
  } : null;
}

/** Validate intent against canonical identity, independently of display visibility. */
export function validateInteractionTarget(target: InteractionTarget, entries: readonly Entry[], projections: ReadonlyMap<string, StructureProjection>): InteractionTargetResolution {
  if (target.kind === "all") return { status: "ready", atoms: [], hidden: false, message: null };
  const atoms = canonicalAtoms(target.atoms);
  const byEntry = new Map(entries.map(entry => [entry.id, entry]));
  const entryIds = new Set(atoms.map(atom => atom.structure_id));
  const hidden = [...entryIds].some(id => byEntry.get(id)?.visible === false);
  const invalid = (message: string): InteractionTargetResolution => ({ status: "needs-update", atoms, hidden, message });
  if (!atoms.length) return invalid("The captured target is empty. Update the interaction target.");
  const validIds = new Map([...entryIds].map(id => [id, new Set(byEntry.get(id)?.atom_ids)]));
  if (atoms.some(atom => !byEntry.has(atom.structure_id) || !validIds.get(atom.structure_id)?.has(atom.atom_id))) {
    return invalid("Captured atoms are no longer available. Update the interaction target.");
  }
  if (target.kind === "ligand") {
    const entry = byEntry.get(target.entryId);
    if (!entry || atoms.some(atom => atom.structure_id !== target.entryId)) {
      return invalid("The captured ligand is no longer available. Update the interaction target.");
    }
    const projection = currentProjection(entry, projections);
    if (!projection) return { status: "validating", atoms, hidden, message: "Waiting for current ligand data to validate the target." };
    const component = projection.hierarchy.components.find(item => item.id === target.componentId);
    if (!component || component.category !== "ligand" || component.classification_status !== "assigned") {
      return invalid("The captured ligand instance has changed. Update the interaction target.");
    }
    const { membership, crosslinked } = ligandMembership(projection);
    const ids = new Set(membership.get(component.id));
    const reason = candidateReason(component, ids, crosslinked);
    if (reason) return invalid(reason);
    if (ids.size !== atoms.length || atoms.some(atom => !ids.has(atom.atom_id))) {
      return invalid("Ligand membership has changed. Update the interaction target.");
    }
  }
  return { status: "ready", atoms, hidden, message: hidden ? "The captured target includes hidden structures." : null };
}

/** Target-to-rest means exactly one complete participant group touches the set. */
export function filterTargetInteractions(records: readonly InteractionRecord[], target: InteractionTarget): InteractionRecord[] {
  if (target.kind === "all") return [...records];
  const keys = new Set(target.atoms.map(atomKey));
  return records.filter(record => record.participants.length === 2
    && record.participants[0].some(atom => keys.has(atomKey(atom)))
      !== record.participants[1].some(atom => keys.has(atomKey(atom))));
}
