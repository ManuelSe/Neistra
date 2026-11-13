import type { AtomReference, Project, QuickFieldOmission, QuickMinimizationReport, Selection } from "../api/types";

export function quickSelectionError(project: Project, selection: Selection): string | null {
  if (!selection.atoms.length) return "Select atoms before minimizing.";
  if (selection.atoms.length > 2000) return "Select at most 2000 atoms before minimizing.";
  const entries = new Map(project.entries.map(entry => [entry.id, entry]));
  const memberships = new Map<string, Set<number>>();
  for (const atom of selection.atoms) {
    const entry = entries.get(atom.structure_id);
    if (!entry) return "The current selection contains an unavailable entry.";
    if (entry.locked) return "Unlock selected entries before minimizing.";
    let ids = memberships.get(entry.id);
    if (!ids) { ids = new Set(entry.atom_ids); memberships.set(entry.id, ids); }
    if (!ids.has(atom.atom_id)) return "The current selection contains an unavailable atom.";
  }
  return null;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function references(value: unknown): AtomReference[] | null {
  if (!record(value) || value.schema_version !== 1 || !Array.isArray(value.atoms) || !value.atoms.length || value.atoms.length > 2000) return null;
  const result: AtomReference[] = [], seen = new Set<string>();
  for (const atom of value.atoms as unknown[]) {
    if (!record(atom) || typeof atom.structure_id !== "string" || !atom.structure_id ||
      typeof atom.atom_id !== "number" || !Number.isSafeInteger(atom.atom_id) || atom.atom_id < 1) return null;
    const key = JSON.stringify([atom.structure_id, atom.atom_id]);
    if (seen.has(key)) return null;
    seen.add(key); result.push({ structure_id: atom.structure_id, atom_id: atom.atom_id });
  }
  return result;
}
export interface QuickTargetSummary {
  requested: number | null;
  movable: number | null;
  expandedHydrogens: number | null;
  fixed: number | null;
  helpers: number | null;
  caps: number | null;
  modeledEntries: { entryId: string; count: number }[];
  issue: string | null;
}
/** Captured input membership is never used as a proxy for local modeled context. */
export function quickTargets(draft: Selection | undefined, parameters: unknown, report?: QuickMinimizationReport): QuickTargetSummary {
  const result: QuickTargetSummary = { requested: draft?.atoms.length ?? null, movable: null, expandedHydrogens: null,
    fixed: null, helpers: null, caps: null, modeledEntries: [], issue: null };
  if (!parameters) return result;
  if (!record(parameters) || parameters.model !== "quick-local-v1") return result;
  const requested = references(parameters.requested_selection), movable = references(parameters.selection);
  if (!requested || !movable || typeof parameters.expand_hydrogens !== "boolean") {
    return { ...result, issue: "Captured target details are unavailable for this result." };
  }
  const keys = new Set(movable.map(atom => JSON.stringify([atom.structure_id, atom.atom_id])));
  if (requested.some(atom => !keys.has(JSON.stringify([atom.structure_id, atom.atom_id]))) ||
    (!parameters.expand_hydrogens && requested.length !== movable.length)) {
    return { ...result, issue: "Captured target details are inconsistent; inspect the stored report." };
  }
  result.requested = requested.length;
  result.movable = movable.length;
  result.expandedHydrogens = movable.length - requested.length;
  if (!report?.method || !Object.keys(report.modeled_atoms).length) return result;
  const entries = Object.entries(report.modeled_atoms).map(([entryId, atoms]) => ({ entryId, count: atoms.length }));
  const counts = [report.movable_count, report.fixed_count, report.helper_count, report.cap_count];
  if (counts.some(count => !Number.isSafeInteger(count) || count < 0) || report.movable_count !== movable.length ||
    report.cap_count > report.helper_count || entries.reduce((sum, entry) => sum + entry.count, 0) !== report.movable_count + report.fixed_count) {
    return { ...result, issue: "Local context details are inconsistent; inspect the stored report." };
  }
  return { ...result, fixed: report.fixed_count, helpers: report.helper_count, caps: report.cap_count, modeledEntries: entries };
}

export const fieldOmissionLabels: Record<QuickFieldOmission, string> = {
  uff_electrostatics: "UFF electrostatics are omitted",
  unsupported_site_electrostatics: "Electrostatics involving unsupported sites are omitted",
  coordination: "Coordination involving unsupported sites is not modeled",
  unsupported_physical_terms: "Unsupported physical interactions are omitted",
  fixed_only_native_terms: "Native terms involving only fixed atoms are omitted",
  current_connectivity: "Sparse current connectivity limits this component",
};
export function quickMethodName(method: "MMFF94" | "UFF" | "geometry_repair" | "fixed_geometry" | null) {
  return method === "geometry_repair" ? "Geometry repair" : method === "fixed_geometry" ? "Fixed geometric context" : method ?? "No calculation model";
}
