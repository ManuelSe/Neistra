import type { AtomReference, Entry, StructureProjection } from "../api/types";
import { canonicalSelection } from "../selection/selection";
import type { InteractionRecord, InteractionResult } from "./types";

export interface InteractionMetric {
  label: string;
  value: number;
  unit: "Å" | "°" | "e";
}

export interface InteractionWarningGroup {
  key: string;
  entryId: string;
  code: string;
  message: string;
  atomIds: number[];
  occurrences: number;
}

export interface InteractionPresentationContext {
  describe(record: InteractionRecord): string[];
  summarize(record: InteractionRecord): string;
}

interface ParticipantSummary {
  siteKey: string;
  label: string;
  countOthers: boolean;
}

/** Geometry may change without changing a relationship's canonical identity. */
export function interactionRecordKey(record: InteractionRecord): string {
  const groups = record.participants.map(group => canonicalSelection(group).atoms
    .map(atom => [atom.structure_id, atom.atom_id] as const));
  groups.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([record.kind, record.scope, groups]);
}

export function interactionParticipants(record: InteractionRecord): AtomReference[] {
  return canonicalSelection(record.participants.flat()).atoms.map(atom => ({ ...atom }));
}

/** Labels describe scientific evidence, which can differ from marker line length. */
export function interactionMetrics(record: InteractionRecord): InteractionMetric[] {
  const metrics: [string, string, InteractionMetric["unit"]][] = record.kind === "hydrogen_bond"
    ? [["distance", "H···A distance", "Å"], ["donor_acceptor_distance", "D···A distance", "Å"], ["donor_angle", "Donor angle", "°"], ["acceptor_angle", "Acceptor angle", "°"]]
    : record.kind === "pi_pi"
      ? [["distance", "Centroid distance", "Å"], ["plane_angle", "Plane angle", "°"], ["offset_1", "Ring 1 offset", "Å"], ["offset_2", "Ring 2 offset", "Å"]]
      : record.kind === "cation_pi"
        ? [["distance", "Charge-center–ring-center distance", "Å"], ["normal_angle", "Normal angle", "°"], ["offset", "Lateral offset", "Å"], ["charge", "Group formal charge", "e"]]
        : record.kind === "salt_bridge"
          ? [["distance", "Nearest charge-site distance", "Å"], ["charge_1", "Group 1 formal charge", "e"], ["charge_2", "Group 2 formal charge", "e"]]
          : record.kind === "clash"
            ? [["distance", "Atom separation", "Å"], ["overlap", "van der Waals overlap", "Å"]]
            : [["distance", "Atom separation", "Å"]];
  return metrics.flatMap(([key, label, unit]) => Number.isFinite(record.geometry[key])
    ? [{ label, value: record.geometry[key], unit }] : []);
}

export function groupInteractionWarnings(warnings: InteractionResult["warnings"]): InteractionWarningGroup[] {
  const groups = new Map<string, InteractionWarningGroup>();
  for (const warning of warnings) {
    const key = JSON.stringify([warning.entry_id, warning.code, warning.message]);
    const previous = groups.get(key);
    groups.set(key, {
      key, entryId: warning.entry_id, code: warning.code, message: warning.message,
      atomIds: [...new Set([...(previous?.atomIds ?? []), ...warning.atom_ids])].sort((a, b) => a - b),
      occurrences: (previous?.occurrences ?? 0) + 1,
    });
  }
  return [...groups.values()];
}

/** Index current canonical identities once for a bounded result-list projection. */
export function createInteractionPresentationContext(entries: readonly Entry[], projections: ReadonlyMap<string, StructureProjection>): InteractionPresentationContext {
  const labels = new Map<string, Map<number, string>>();
  const summaries = new Map<string, Map<number, ParticipantSummary>>();
  const entryLabels = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  for (const entry of entries) nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1);
  for (const entry of entries) {
    const entryLabel = (nameCounts.get(entry.name) ?? 0) > 1 ? `${entry.name} (${entry.id})` : entry.name;
    entryLabels.set(entry.id, entryLabel);
    const projection = projections.get(entry.id);
    if (projection?.entry_id !== entry.id || projection.artifact_id !== entry.current_artifact_id
      || projection.projection_state === "coordinate-seed") continue;
    const structure = projection.structure;
    const residues = new Map(structure.residues.map(residue => [residue.id, residue]));
    const chains = new Map(structure.chains.map(chain => [chain.id, chain]));
    const atoms = new Map<number, string>();
    const atomSummaries = new Map<number, ParticipantSummary>();
    for (const atom of structure.atoms) {
      const residue = atom.residue_id === null ? undefined : residues.get(atom.residue_id);
      const chain = residue ? chains.get(residue.chain_id) : undefined;
      const position = residue?.author_number ?? residue?.label_number ?? residue?.id;
      const residueLabel = residue ? ` · ${residue.name} ${position}${residue.insertion_code ?? ""}${chain ? ` · chain ${chain.name || chain.id}` : ""}` : "";
      const fullLabel = `${entryLabel}${residueLabel} · ${atom.name || atom.element} #${atom.id}`;
      atoms.set(atom.id, fullLabel);
      atomSummaries.set(atom.id, {
        siteKey: JSON.stringify([entry.id, residue ? "residue" : "atoms", residue?.id, chain?.id]),
        label: residue ? `${entryLabel}${residueLabel}` : fullLabel,
        countOthers: !residue,
      });
    }
    labels.set(entry.id, atoms);
    summaries.set(entry.id, atomSummaries);
  }
  const fallback = (reference: AtomReference) => `${entryLabels.get(reference.structure_id) ?? reference.structure_id} · Atom #${reference.atom_id}`;
  return {
    describe: record => record.participants.map(group => group.map(reference =>
      labels.get(reference.structure_id)?.get(reference.atom_id) ?? fallback(reference),
    ).join("; ")),
    summarize: record => record.participants.map(group => {
      const sites = new Map<string, { label: string; count: number; countOthers: boolean }>();
      const seen = new Set<string>();
      for (const reference of group) {
        const identity = JSON.stringify([reference.structure_id, reference.atom_id]);
        if (seen.has(identity)) continue;
        seen.add(identity);
        const summary = summaries.get(reference.structure_id)?.get(reference.atom_id);
        const siteKey = summary?.siteKey ?? identity;
        const previous = sites.get(siteKey);
        if (previous) previous.count++;
        else sites.set(siteKey, { label: summary?.label ?? fallback(reference), count: 1, countOthers: summary?.countOthers ?? false });
      }
      return [...sites.values()].map(site => site.countOthers && site.count > 1
        ? `${site.label} +${site.count - 1} ${site.count === 2 ? "other" : "others"}` : site.label).join(" + ");
    }).join(" ↔ "),
  };
}

export function describeInteractionParticipants(record: InteractionRecord, entries: readonly Entry[], projections: ReadonlyMap<string, StructureProjection>): string[] {
  return createInteractionPresentationContext(entries, projections).describe(record);
}
