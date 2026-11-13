/** A per-project recovery descriptor, never molecular or viewer state. */
export interface QuickPublicationAttempt {
  projectId: string;
  jobId: string;
  proposalSha256: string;
  expectedRevision: number;
  origin: "automatic" | "manual";
}
export interface PublicationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type JournalRead = { kind: "absent" } | { kind: "valid"; attempt: QuickPublicationAttempt }
  | { kind: "invalid" } | { kind: "unavailable" };
export interface PublicationJournal {
  read(projectId: string): JournalRead;
  write(attempt: QuickPublicationAttempt): boolean;
  remove(projectId: string): boolean;
}
const prefix = "neistra.quick-publication.v1.";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const publicationId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
export function validPublicationAttempt(value: unknown): value is QuickPublicationAttempt {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return publicationId(a.projectId) && publicationId(a.jobId) &&
    typeof a.proposalSha256 === "string" && /^[0-9a-f]{64}$/.test(a.proposalSha256) &&
    Number.isSafeInteger(a.expectedRevision) && (a.expectedRevision as number) >= 0 &&
    (a.origin === "automatic" || a.origin === "manual");
}
export function createPublicationJournal(providedStorage?: PublicationStorage): PublicationJournal {
  const storage = () => providedStorage ?? window.sessionStorage;
  return {
    read(projectId) {
      try {
        const raw = storage().getItem(prefix + projectId);
        if (raw === null) return { kind: "absent" };
        let value: unknown;
        try { value = JSON.parse(raw); } catch { return { kind: "invalid" }; }
        if (!value || typeof value !== "object") return { kind: "invalid" };
        const record = value as Record<string, unknown>;
        if (record.schema_version !== 1 || Object.keys(record).length !== 6 ||
          !validPublicationAttempt(record) || record.projectId !== projectId) return { kind: "invalid" };
        const { projectId: id, jobId, proposalSha256, expectedRevision, origin } = record;
        return { kind: "valid", attempt: Object.freeze({ projectId: id, jobId, proposalSha256, expectedRevision, origin }) };
      } catch { return { kind: "unavailable" }; }
    },
    write(attempt) {
      if (!validPublicationAttempt(attempt)) return false;
      try {
        const value = JSON.stringify({ schema_version: 1,
          projectId: attempt.projectId, jobId: attempt.jobId, proposalSha256: attempt.proposalSha256,
          expectedRevision: attempt.expectedRevision, origin: attempt.origin,
        });
        storage().setItem(prefix + attempt.projectId, value);
        return storage().getItem(prefix + attempt.projectId) === value;
      } catch { return false; }
    },
    remove(projectId) {
      try { storage().removeItem(prefix + projectId); return storage().getItem(prefix + projectId) === null; }
      catch { return false; }
    },
  };
}
