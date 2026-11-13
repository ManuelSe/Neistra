import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Job, Project } from "../api/types";
import { QuickPublicationSession, quickApplicationReceipt, type QuickPublicationAttempt, type QuickPublicationPorts } from "../minimization/publication";
import { createPublicationJournal, type PublicationStorage } from "../minimization/publicationJournal";
import { molecularProject } from "./molecular-fixtures";

const P = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";
const J = "33333333-3333-4333-8333-333333333333";
const E = "44444444-4444-4444-8444-444444444444";
const attempt = (projectId = P): QuickPublicationAttempt => ({ projectId, jobId: J, proposalSha256: "a".repeat(64), expectedRevision: 5, origin: "automatic" });
const project = (revision = 5, id = P) => ({ ...molecularProject([]), id, revision });
function job(revision?: number, projectId = P): Job {
  return {
    id: J, project_id: projectId, status: "completed", job_type: "coordinates.quick_minimize", inputs: [{ entry_id: E }],
    provenance: revision === undefined ? {} : { quick_minimization_application: {
      proposal_sha256: "a".repeat(64), revision, entry_ids: [E],
    } },
  } as unknown as Job;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
class Storage implements PublicationStorage {
  values = new Map<string, string>();
  readFails = false;
  writeFails = false;
  removeFails = false;
  getItem(key: string) { if (this.readFails) throw new Error("read"); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.writeFails) throw new Error("write"); this.values.set(key, value); }
  removeItem(key: string) { if (this.removeFails) throw new Error("remove"); this.values.delete(key); }
}
function harness(storage = new Storage()) {
  const ports: QuickPublicationPorts = {
    sendApply: vi.fn(() => Promise.resolve(project(6))), readProject: vi.fn(() => Promise.resolve(project(6))),
    readJob: vi.fn(() => Promise.resolve(job(6))), acceptProject: vi.fn(), notice: vi.fn(),
  };
  const journal = createPublicationJournal(storage);
  return { ports, storage, journal, session: new QuickPublicationSession(ports, journal) };
}

it("guards synchronously and shares a single Apply for duplicate activation", async () => {
  const { ports, journal, session } = harness();
  const wait = deferred<Project>(); vi.mocked(ports.sendApply).mockReturnValue(wait.promise);
  const changes = vi.fn(); const unsub = session.subscribe(changes);
  const first = session.start(attempt()); const second = session.start(attempt());
  expect(first).toBe(second); expect(session.snapshot(P).phase).toBe("submitting");
  expect(() => session.assertWritable(P)).toThrow("pending");
  expect(() => session.assertWritable(Q)).not.toThrow();
  expect(journal.read(P).kind).toBe("valid");
  await Promise.resolve(); expect(ports.sendApply).toHaveBeenCalledTimes(1);
  wait.resolve(project(6)); await first;
  expect(session.snapshot(P)).toMatchObject({ phase: "idle", receipt: { revision: 6, jobId: J } });
  expect(journal.read(P).kind).toBe("absent"); expect(ports.acceptProject).toHaveBeenCalledWith(project(6));
  expect(ports.notice).toHaveBeenLastCalledWith(P, "Quick minimization was stored locally.", false, "transient");
  expect(changes).toHaveBeenCalledTimes(2); unsub();
});

it.each([new Error("network lost"), new SyntaxError("bad JSON"), new ApiError(503, "unavailable", "proxy lost response")])(
  "reconciles an ambiguous response without sending a second Apply: %s", async error => {
    const { ports, session } = harness(); vi.mocked(ports.sendApply).mockRejectedValue(error);
    await expect(session.start(attempt())).resolves.toEqual(project(6));
    expect(ports.sendApply).toHaveBeenCalledTimes(1); expect(ports.readProject).toHaveBeenCalledBefore(vi.mocked(ports.readJob));
    expect(session.snapshot(P).phase).toBe("idle");
  },
);

it("retains honest uncertainty when no marker exists and the revision is unchanged", async () => {
  const { ports, session } = harness();
  vi.mocked(ports.sendApply).mockRejectedValue(new Error("offline"));
  vi.mocked(ports.readProject).mockResolvedValue(project()); vi.mocked(ports.readJob).mockResolvedValue(job());
  await expect(session.start(attempt())).rejects.toThrow("No application is confirmed");
  expect(session.snapshot(P).phase).toBe("uncertain");
  expect(() => session.assertWritable(P)).toThrow();
  await expect(session.refresh(P)).rejects.toThrow("No application is confirmed");
  expect(ports.sendApply).toHaveBeenCalledTimes(1);
  await expect(session.start({ ...attempt(), jobId: E })).rejects.toThrow("pending");
});

it("explicit retry uses precisely the original request and records only one command", async () => {
  const { ports, session } = harness();
  let stored = false, commands = 0;
  vi.mocked(ports.sendApply).mockImplementation(captured => {
    expect(captured).toEqual(attempt());
    if (!stored) { stored = true; return Promise.reject(new Error("request lost before server")); }
    commands++; return Promise.resolve(project(6));
  });
  vi.mocked(ports.readProject).mockResolvedValue(project()); vi.mocked(ports.readJob).mockResolvedValue(job());
  await expect(session.start(attempt())).rejects.toThrow("No application");
  const first = session.retry(P), duplicate = session.retry(P);
  expect(first).toBe(duplicate); await first;
  expect(commands).toBe(1); expect(ports.sendApply).toHaveBeenCalledTimes(2);
});

it("a delayed original request and a conflicting explicit retry reconcile to one command", async () => {
  const { ports, session } = harness();
  vi.mocked(ports.sendApply).mockRejectedValueOnce(new Error("response lost"))
    .mockRejectedValueOnce(new ApiError(409, "revision_conflict", "already stored"));
  vi.mocked(ports.readProject).mockResolvedValueOnce(project()).mockResolvedValueOnce(project(6));
  vi.mocked(ports.readJob).mockResolvedValueOnce(job()).mockResolvedValueOnce(job(6));
  await expect(session.start(attempt())).rejects.toThrow("No application");
  await expect(session.retry(P)).resolves.toEqual(project(6));
  expect(session.snapshot(P).receipt?.revision).toBe(6);
});

it("does not release an uncertain original request after a retry's definite rejection", async () => {
  const { ports, session } = harness();
  vi.mocked(ports.sendApply).mockRejectedValueOnce(new Error("lost"))
    .mockRejectedValueOnce(new ApiError(422, "invalid", "retry refused"));
  vi.mocked(ports.readProject).mockResolvedValue(project()); vi.mocked(ports.readJob).mockResolvedValue(job());
  await expect(session.start(attempt())).rejects.toThrow("No application");
  await expect(session.retry(P)).rejects.toThrow("No application");
  expect(session.snapshot(P).phase).toBe("uncertain"); expect(ports.readJob).toHaveBeenCalledTimes(2);
});

it.each([400, 403, 422])("definite initial rejection %i releases the guard without claiming application", async status => {
  const { ports, session, journal } = harness();
  vi.mocked(ports.sendApply).mockRejectedValue(new ApiError(status, "invalid", "request refused"));
  await expect(session.start(attempt())).rejects.toThrow("request refused");
  expect(session.snapshot(P)).toMatchObject({ phase: "idle", receipt: null });
  expect(journal.read(P).kind).toBe("absent"); expect(ports.readProject).not.toHaveBeenCalled();
});

it("a newer revision without application makes the old request stale", async () => {
  const { ports, session } = harness();
  vi.mocked(ports.sendApply).mockRejectedValue(new ApiError(409, "revision_conflict", "changed"));
  vi.mocked(ports.readProject).mockResolvedValue(project(8)); vi.mocked(ports.readJob).mockResolvedValue(job());
  await expect(session.start(attempt())).rejects.toThrow("Run a new minimization");
  expect(session.snapshot(P)).toMatchObject({ phase: "idle", receipt: null });
  expect(ports.acceptProject).toHaveBeenCalledWith(project(8));
});

it("fetches a sufficiently new project when application appears between the two reads", async () => {
  const { ports, session } = harness(); vi.mocked(ports.sendApply).mockRejectedValue(new Error("lost"));
  vi.mocked(ports.readProject).mockResolvedValueOnce(project()).mockResolvedValueOnce(project(9));
  vi.mocked(ports.readJob).mockResolvedValue(job(8));
  await expect(session.start(attempt())).resolves.toEqual(project(9));
  expect(ports.readProject).toHaveBeenCalledTimes(2); expect(session.snapshot(P).receipt?.revision).toBe(8);
});

it("preserves already-undone current state instead of applying recorded coordinates again", async () => {
  const { ports, session } = harness(); vi.mocked(ports.sendApply).mockRejectedValue(new Error("lost"));
  vi.mocked(ports.readProject).mockResolvedValue(project(10)); vi.mocked(ports.readJob).mockResolvedValue(job(6));
  await expect(session.start(attempt())).resolves.toEqual(project(10));
  expect(ports.sendApply).toHaveBeenCalledTimes(1); expect(ports.acceptProject).toHaveBeenCalledWith(project(10));
  expect(session.snapshot(P).receipt?.revision).toBe(6);
});

it.each(["readProject", "readJob"] as const)("failed %s preserves journal/guard, and refresh never replays Apply", async method => {
  const { ports, journal, session } = harness(); vi.mocked(ports.sendApply).mockRejectedValue(new Error("lost"));
  vi.mocked(ports[method]).mockRejectedValueOnce(new Error("read failed"));
  await expect(session.start(attempt())).rejects.toThrow("read failed");
  expect(session.snapshot(P).phase).toBe("uncertain"); expect(journal.read(P).kind).toBe("valid");
  await expect(session.refresh(P)).resolves.toEqual(project(6)); expect(ports.sendApply).toHaveBeenCalledTimes(1);
});

it("survives reload and returns to the captured project with read-only recovery", async () => {
  const first = harness(); first.journal.write(attempt());
  const restored = new QuickPublicationSession(first.ports, first.journal);
  await restored.attachProject(Q); expect(restored.snapshot(Q).phase).toBe("idle");
  await restored.attachProject(P);
  expect(first.ports.sendApply).not.toHaveBeenCalled(); expect(restored.snapshot(P).receipt?.revision).toBe(6);
});

it("never overwrites an unattached recovery journal with a different new request", async () => {
  const { ports, journal, session } = harness(); journal.write(attempt());
  await expect(session.start({ ...attempt(), jobId: E })).rejects.toThrow("previous");
  expect(ports.sendApply).not.toHaveBeenCalled(); expect(journal.read(P)).toEqual({ kind: "valid", attempt: attempt() });
});

it("keeps project transactions independent when late responses finish in reverse order", async () => {
  const { ports, session } = harness(); const p = deferred<Project>(), q = deferred<Project>();
  vi.mocked(ports.sendApply).mockImplementation(a => a.projectId === P ? p.promise : q.promise);
  const first = session.start(attempt()), second = session.start(attempt(Q));
  q.resolve(project(6, Q)); await second; expect(session.snapshot(P).phase).toBe("submitting");
  p.resolve(project(6)); await first;
  expect(ports.acceptProject).toHaveBeenNthCalledWith(1, project(6, Q));
  expect(ports.acceptProject).toHaveBeenNthCalledWith(2, project(6));
});

it("storage write or verification failure prevents dispatch without an uncertain server request", async () => {
  const { ports, session, storage } = harness(); storage.writeFails = true;
  await expect(session.start(attempt())).rejects.toThrow("recovery information");
  expect(ports.sendApply).not.toHaveBeenCalled(); expect(session.snapshot(P).phase).toBe("idle");
  const ignored: PublicationStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  expect(createPublicationJournal(ignored).write(attempt())).toBe(false);
});

it("removal failure is harmless and a stale descriptor is read-only on the next load", async () => {
  const { ports, journal, session, storage } = harness(); storage.removeFails = true;
  await session.start(attempt()); expect(session.snapshot(P).phase).toBe("idle");
  expect(journal.read(P).kind).toBe("valid"); vi.mocked(ports.sendApply).mockClear();
  await new QuickPublicationSession(ports, journal).attachProject(P);
  expect(ports.sendApply).not.toHaveBeenCalled();
});

describe("invalid stored requests never authorize writes", () => {
  it.each(["not JSON", "null", JSON.stringify({ schema_version: 2, ...attempt() }),
    JSON.stringify({ schema_version: 1, ...attempt(), projectId: Q }),
    JSON.stringify({ schema_version: 1, ...attempt(), expectedRevision: -1 }),
    JSON.stringify({ schema_version: 1, ...attempt(), jobId: "not-a-job" }),
    JSON.stringify({ schema_version: 1, ...attempt(), proposalSha256: "bad" }),
  ])("keeps the source project guarded for %s", async raw => {
    const { ports, session, storage } = harness(); storage.values.set(`neistra.quick-publication.v1.${P}`, raw);
    await session.attachProject(P); expect(session.snapshot(P)).toMatchObject({ phase: "uncertain", attempt: null });
    await expect(session.retry(P)).rejects.toThrow("No valid"); expect(() => session.assertWritable(P)).toThrow();
    expect(() => session.assertWritable(Q)).not.toThrow(); expect(ports.sendApply).not.toHaveBeenCalled();
  });
  it("handles unavailable storage without dropping recovery ownership", async () => {
    const { ports, session, storage } = harness(); storage.readFails = true;
    await session.attachProject(P); expect(session.snapshot(P).phase).toBe("uncertain");
    expect(ports.sendApply).not.toHaveBeenCalled();
  });
});

it.each([
  { id: E }, { project_id: Q }, { job_type: "coordinates.minimize" },
  { provenance: { quick_minimization_application: { proposal_sha256: "b".repeat(64), revision: 6, entry_ids: [E] } } },
  { provenance: { quick_minimization_application: { proposal_sha256: "a".repeat(64), revision: 5, entry_ids: [E] } } },
  { provenance: { quick_minimization_application: { proposal_sha256: "a".repeat(64), revision: 6, entry_ids: [] } } },
  { provenance: { quick_minimization_application: { proposal_sha256: "a".repeat(64), revision: 6, entry_ids: [E, E] } } },
  { provenance: { quick_minimization_application: { proposal_sha256: "a".repeat(64), revision: 6, entry_ids: [Q] } } },
])("rejects malformed or cross-job application evidence %o", overrides => {
  expect(() => quickApplicationReceipt({ ...job(6), ...overrides } as Job, attempt())).toThrow();
});


it("a failed retry journal write keeps ownership and exposes a recovery diagnostic", async () => {
  const { ports, session, storage } = harness();
  vi.mocked(ports.sendApply).mockRejectedValue(new Error("lost"));
  vi.mocked(ports.readProject).mockResolvedValue(project()); vi.mocked(ports.readJob).mockResolvedValue(job());
  await expect(session.start(attempt())).rejects.toThrow("No application");
  storage.writeFails = true;
  await expect(session.retry(P)).rejects.toThrow("Retry was not submitted");
  expect(session.snapshot(P)).toMatchObject({ phase: "uncertain", attempt: attempt() });
  expect(session.snapshot(P).error).toContain("Retry was not submitted");
  expect(ports.sendApply).toHaveBeenCalledTimes(1);
  expect(ports.notice).toHaveBeenLastCalledWith(P, expect.stringContaining("Retry was not submitted"), true);
});


it("a project-cache acceptance failure after success reconciles instead of leaving a stuck request", async () => {
  const { ports, session } = harness();
  vi.mocked(ports.acceptProject).mockImplementationOnce(() => { throw new Error("cache failure"); });
  await expect(session.start(attempt())).resolves.toEqual(project(6));
  expect(ports.sendApply).toHaveBeenCalledTimes(1);
  expect(ports.readProject).toHaveBeenCalledTimes(1);
  expect(session.snapshot(P).phase).toBe("idle");
});

it("a persistent project-cache error retains an uncertain recoverable transaction", async () => {
  const { ports, session } = harness();
  vi.mocked(ports.acceptProject).mockImplementation(() => { throw new Error("cache unavailable"); });
  await expect(session.start(attempt())).rejects.toThrow("cache unavailable");
  expect(session.snapshot(P)).toMatchObject({ phase: "uncertain", attempt: attempt() });
  vi.mocked(ports.acceptProject).mockImplementation(() => {});
  await expect(session.refresh(P)).resolves.toEqual(project(6));
  expect(session.snapshot(P).phase).toBe("idle");
});

it("a malformed successful project response triggers fresh reads rather than false confirmation", async () => {
  const { ports, session } = harness();
  vi.mocked(ports.sendApply).mockResolvedValue({ id: P, revision: 6 } as Project);
  await expect(session.start(attempt())).resolves.toEqual(project(6));
  expect(ports.acceptProject).toHaveBeenCalledExactlyOnceWith(project(6));
  expect(ports.readJob).toHaveBeenCalledTimes(1);
});

it("a malformed recovery project retains a retryable guard", async () => {
  const { ports, session } = harness();
  vi.mocked(ports.sendApply).mockRejectedValue(new Error("lost"));
  vi.mocked(ports.readProject).mockResolvedValue({ id: P, revision: 6 } as Project);
  await expect(session.start(attempt())).rejects.toThrow("invalid project");
  expect(ports.acceptProject).not.toHaveBeenCalled(); expect(session.snapshot(P).phase).toBe("uncertain");
});

it("only a completed calculation can carry valid recorded-application evidence", () => {
  expect(() => quickApplicationReceipt({ ...job(6), status: "running" }, attempt())).toThrow("evidence");
});
