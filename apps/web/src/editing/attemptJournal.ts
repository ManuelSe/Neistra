import type { EditAttemptIdentity, EditAttemptJournal, EditAttemptJournalRow, PersistedEditReview, JournalUncertainty } from "./attempt";
const key = "neistra.edit-attempts.v1";
const maximumBytes = 1024 * 1024;
function isIdentity(value: unknown): value is EditAttemptIdentity {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["id", "projectId", "entryId", "artifactId", "targetLabel", "operation"].every(field => typeof row[field] === "string" && row[field].length > 0 && row[field].length < 500)
    && typeof row.expectedRevision === "number" && Number.isSafeInteger(row.expectedRevision) && row.expectedRevision >= 0 && (row.kind === "model" || row.kind === "selection");
}
function persistedReview(value: unknown): PersistedEditReview | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return typeof row.revision === "number" && Number.isSafeInteger(row.revision) && row.revision >= 0
    && (row.artifactId === null || typeof row.artifactId === "string" && row.artifactId.length < 500)
    && (row.identityUnavailable === undefined || typeof row.identityUnavailable === "boolean")
    ? { revision: row.revision, artifactId: row.artifactId, ...(row.identityUnavailable === true ? { identityUnavailable: true } : {}) } : null;
}
function readRow(value: unknown): { row: EditAttemptJournalRow | null; valid: boolean } {
  if (isIdentity(value)) return { row: { identity: value }, valid: true };
  if (!value || typeof value !== "object" || !("identity" in value) || !isIdentity(value.identity)) return { row: null, valid: false };
  if (!("acknowledged" in value)) return { row: { identity: value.identity }, valid: true };
  const acknowledged = persistedReview(value.acknowledged);
  return acknowledged ? { row: { identity: value.identity, acknowledged }, valid: true } : { row: { identity: value.identity }, valid: false };
}
function readUncertainty(value: unknown): JournalUncertainty | null {
  if (!value || typeof value !== "object") return null;
  const marker = value as Record<string, unknown>;
  if (typeof marker.id !== "string" || !marker.id.length || marker.id.length > 500 || marker.reason !== "unreadable_previous_edit_information"
    || marker.outcome !== "unknown" || !Array.isArray(marker.acknowledgedProjects) || marker.acknowledgedProjects.length > 64) return null;
  const acknowledgments: JournalUncertainty["acknowledgedProjects"] = [];
  for (const value of marker.acknowledgedProjects as unknown[]) {
    if (!value || typeof value !== "object" || !("projectId" in value) || typeof value.projectId !== "string" || !value.projectId.length || value.projectId.length > 500 || !("reviewedContext" in value)) return null;
    const reviewedContext = persistedReview(value.reviewedContext);
    if (!reviewedContext || acknowledgments.some(item => item.projectId === value.projectId)) return null;
    acknowledgments.push({ projectId: value.projectId, reviewedContext });
  }
  return { id: marker.id, reason: marker.reason, outcome: marker.outcome, acknowledgedProjects: acknowledgments };
}
/** Small recovery metadata only; failed reads never mean that no attempt exists. */
export function createEditAttemptJournal(providedStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): EditAttemptJournal {
  const storage = () => providedStorage === undefined ? window.sessionStorage : providedStorage;
  return {
    read: () => {
      let text: string | null;
      try { const target = storage(); if (!target) return { kind: "unavailable" }; text = target.getItem(key); }
      catch { return { kind: "unavailable" }; }
      if (text === null) return { kind: "absent" };
      if (text.length > maximumBytes) return { kind: "invalid", rows: [] };
      let value: unknown; try { value = JSON.parse(text); } catch { return { kind: "invalid", rows: [] }; }
      const envelope = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
      const rawRows: unknown[] = Array.isArray(value) ? value as unknown[] : Array.isArray(envelope?.rows) ? envelope.rows as unknown[] : [];
      const parsedRows = rawRows.map(readRow);
      const rows = parsedRows.flatMap(value => value.row ? [value.row] : []);
      const uncertainty = envelope?.uncertainty === undefined ? undefined : readUncertainty(envelope.uncertainty);
      const valid = (Array.isArray(value) || envelope?.schemaVersion === 2 && Array.isArray(envelope.rows))
        && parsedRows.every(value => value.valid) && uncertainty !== null && new Set(rows.map(row => row.identity.id)).size === rows.length;
      return valid ? { kind: "ready", rows, ...(uncertainty ? { uncertainty } : {}) } : { kind: "invalid", rows };
    },
    write: value => {
      const target = storage(); if (!target) throw new Error("Session storage is unavailable.");
      target.setItem(key, JSON.stringify(value));
    },
  };
}
