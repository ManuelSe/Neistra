import { expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { EditAttemptReceipt, SelectionEditResult } from "../api/types";
import { EditAttemptController, editAttemptBlocksWrites, compactEditReview, type EditAttemptJournal, type EditAttemptJournalEnvelope, type EditReview } from "../editing/attempt";
import { createEditAttemptJournal } from "../editing/attemptJournal";
import { molecularEntry, molecularProject } from "./molecular-fixtures";
const identity = { projectId: "project-1", entryId: "ligand", expectedRevision: 2, artifactId: "a", kind: "model" as const, targetLabel: "Ligand", operation: "atom.element" };
const review: EditReview = { revision: 3, artifactId: "b", undo: "Edit", redo: null, contextKey: "current-r3" };
const receipt = (id = "one", values: Partial<EditAttemptReceipt> = {}): EditAttemptReceipt => ({ server_instance_id: "server", attempt_id: id,
  project_id: identity.projectId, entry_id: identity.entryId, kind: identity.kind, expected_revision: 2, expected_artifact_id: "a",
  phase: "unknown", outcome: "unknown", committed_revision: null, committed_artifact_id: null, reason: null, ...values });
function readyRows(journal: EditAttemptJournal) { const value = journal.read(); return value.kind === "ready" ? value.rows : []; }
function setup(uuid?: () => string) {
  let envelope: EditAttemptJournalEnvelope | null = null;
  const journal: EditAttemptJournal = { read: () => envelope ? { kind: "ready", ...structuredClone(envelope) } : { kind: "absent" }, write: next => { envelope = structuredClone(next); } };
  let sequence = 0;
  return { journal, controller: new EditAttemptController(journal, uuid ?? (() => ["one", "two", "three"][sequence++])) };
}
const result = (revision = 3): SelectionEditResult => ({ project: { ...molecularProject([molecularEntry("ligand", "Ligand", "ligand")]), revision },
  warnings: [], replacements: {}, report: { operation: "atom.element", created_atom_ids: [], created_bond_ids: [], deleted_atom_ids: [], deleted_bond_ids: [], changed_atom_ids: [1], force_field: null, converged: null }, selection_after: { schema_version: 1, atoms: [], source: "viewer", granularity: "atom" } });
function held<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
it("keeps an Apply owned across closure and other projects without repeating or cancelling it", async () => {
  const { controller } = setup(), request = held<SelectionEditResult>(), send = vi.fn(() => request.promise);
  const pending = controller.submit(identity, send);
  expect(send).toHaveBeenCalledExactlyOnceWith("one");
  expect(() => controller.assertWritable("project-1")).toThrow("pending");
  expect(() => controller.assertWritable("other")).not.toThrow();
  await expect(controller.submit(identity, send)).rejects.toThrow("pending");
  expect(send).toHaveBeenCalledOnce(); request.resolve(result()); await pending;
  expect(controller.snapshot("project-1").phase).toBe("saved");
});
it("does not infer an outcome from a refreshed unchanged project or a lost response", async () => {
  const { controller } = setup();
  await expect(controller.submit(identity, () => Promise.reject(new TypeError("Network lost")))).rejects.toThrow();
  const refresh = vi.fn().mockResolvedValue(undefined);
  await controller.check("project-1", () => Promise.resolve(receipt()), refresh);
  expect(refresh).toHaveBeenCalledOnce(); expect(controller.snapshot("project-1").phase).toBe("unknown");
  expect(() => controller.assertWritable("project-1")).toThrow();
});
it.each(["pending", "finishing"] as const)("never acknowledges a positively %s calculation", async phase => {
  const { controller } = setup(); await controller.submit(identity, () => Promise.reject(new Error("lost"))).catch(() => {});
  await controller.check("project-1", () => Promise.resolve(receipt("one", { phase, outcome: null })), () => Promise.resolve());
  controller.setReview("project-1", "one", review);
  expect(controller.acknowledge("project-1", "one", review)).toBe(false);
  expect(editAttemptBlocksWrites(controller.snapshot("project-1"))).toBe(true);
});
it("requires exact reviewed token and retained acknowledgment before releasing only its guard", async () => {
  const { controller, journal } = setup(); await controller.submit(identity, () => Promise.reject(new Error("lost"))).catch(() => {});
  controller.setReview("project-1", "one", review);
  expect(controller.acknowledge("project-1", "replacement", review)).toBe(false);
  expect(controller.acknowledge("project-1", "one", { ...review, revision: 4 })).toBe(false);
  expect(controller.acknowledge("project-1", "one", review)).toBe(true);
  expect(readyRows(journal)[0].acknowledged).toEqual(compactEditReview(review));
  expect(controller.snapshot("project-1").phase).toBe("unknown");
  expect(editAttemptBlocksWrites(controller.snapshot("project-1"))).toBe(false);
  const restored = new EditAttemptController(journal);
  expect(restored.snapshot("project-1")).toMatchObject({ phase: "unknown", acknowledged: compactEditReview(review) });
});
it.each(["throw", "replace"])("keeps editing paused when acknowledgment storage fails: %s", async failure => {
  const { controller, journal } = setup(); await controller.submit(identity, () => Promise.reject(new Error("lost"))).catch(() => {});
  controller.setReview("project-1", "one", review);
  if (failure === "throw") journal.write = () => { throw Error("full"); };
  else { const read = journal.read; let reads = 0; journal.read = () => ++reads === 1 ? read() : { kind: "ready", rows: [{ identity: { ...identity, id: "replacement" }, acknowledged: compactEditReview(review) }] }; }
  expect(controller.acknowledge("project-1", "one", review)).toBe(false);
  expect(controller.snapshot("project-1").error).toContain("Editing remains paused");
  expect(() => controller.assertWritable("project-1")).toThrow();
});
it.each(["old-first", "new-first"])("retains late old facts without replacing the new attempt: %s", async order => {
  const { controller, journal } = setup(), old = held<SelectionEditResult>(), newer = held<SelectionEditResult>();
  const first = controller.submit(identity, () => old.promise);
  await controller.check("project-1", () => Promise.resolve(receipt()), () => Promise.resolve());
  controller.setReview("project-1", "one", review); expect(controller.acknowledge("project-1", "one", review)).toBe(true);
  const second = controller.submit({ ...identity, expectedRevision: 3, artifactId: "b" }, () => newer.promise);
  expect(controller.owns("project-1", "one")).toBe(false); expect(controller.owns("project-1", "two")).toBe(true);
  if (order === "old-first") { old.resolve(result(3)); await first; expect(controller.snapshot("project-1").phase).toBe("submitting"); newer.resolve(result(4)); }
  else { newer.resolve(result(4)); await second; old.resolve(result(3)); }
  await Promise.all([first, second]);
  expect(controller.snapshot("project-1")).toMatchObject({ identity: { id: "two" }, phase: "saved", committedRevision: 4 });
  expect(controller.snapshot("project-1").previous?.[0]).toMatchObject({ identity: { id: "one" }, phase: "saved", acknowledged: compactEditReview(review) });
  expect(readyRows(journal).find(row => row.identity.id === "one")?.acknowledged).toEqual(compactEditReview(review));
});
it("retains commit proof when an older in-flight response rejects after status confirmation", async () => {
  const { controller } = setup(), request = held<SelectionEditResult>();
  const pending = controller.submit(identity, () => request.promise).catch(() => {});
  await controller.check("project-1", () => Promise.resolve(receipt("one", { phase: "finishing", outcome: "saved", committed_revision: 3, committed_artifact_id: "b" })), () => Promise.resolve());
  request.reject(new ApiError(500, "error", "response lost")); await pending;
  expect(controller.snapshot("project-1")).toMatchObject({ phase: "saved", committedRevision: 3, committedArtifactId: "b" });
});
it("rejects mismatched or missing proof and only accepts explicit finished not-applied", async () => {
  const { controller } = setup(); await controller.submit(identity, () => Promise.reject(new Error("lost"))).catch(() => {});
  for (const value of [receipt("wrong"), receipt("one", { expected_artifact_id: "wrong" }), receipt("one", { phase: "finished", outcome: "saved", committed_revision: 3 })]) {
    await controller.check("project-1", () => Promise.resolve(value), () => Promise.resolve()); expect(controller.snapshot("project-1").phase).toBe("unknown");
  }
  await controller.check("project-1", () => Promise.resolve(receipt("one", { phase: "finished", outcome: "not_applied", reason: "conflict" })), () => Promise.resolve());
  expect(controller.snapshot("project-1").phase).toBe("not_applied"); expect(() => controller.assertWritable("project-1")).not.toThrow();
});
it("journals identity and acknowledgment without payloads, rejects corrupt storage and reports unavailable writes", () => {
  const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }, journal = createEditAttemptJournal(storage);
  journal.write({ schemaVersion: 2, rows: [{ identity: { ...identity, id: "one" }, acknowledged: compactEditReview(review) }] });
  const serialized = storage.setItem.mock.calls[0][1] as string;
  expect(serialized).not.toContain("selection"); storage.getItem.mockReturnValue(serialized);
  expect(journal.read()).toEqual({ kind: "ready", rows: [{ identity: { ...identity, id: "one" }, acknowledged: compactEditReview(review) }] });
  storage.getItem.mockReturnValue("corrupt"); expect(journal.read()).toEqual({ kind: "invalid", rows: [] });
  expect(() => createEditAttemptJournal(null).write({ schemaVersion: 2, rows: [] })).toThrow("unavailable");
});
it("does not dispatch Apply when the new token cannot be retained for reload recovery", async () => {
  const { controller, journal } = setup(), send = vi.fn().mockResolvedValue(result());
  journal.write = () => { throw new Error("Storage unavailable"); };
  await expect(controller.submit(identity, send)).rejects.toMatchObject({ code: "edit_attempt_journal_unavailable" });
  expect(send).not.toHaveBeenCalled(); expect(controller.snapshot("project-1").phase).toBe("not_applied");
  expect(() => controller.assertWritable("project-1")).toThrow(); controller.reloadJournal();
  expect(() => controller.assertWritable("project-1")).not.toThrow();
});
it("does not let a retired review error clear the newer attempt or its journal", async () => {
  const { controller, journal } = setup(); await controller.submit(identity, () => Promise.reject(new Error("lost"))).catch(() => {});
  controller.setReview("project-1", "one", review); controller.acknowledge("project-1", "one", review);
  const request = held<SelectionEditResult>(), pending = controller.submit({ ...identity, expectedRevision: 3 }, () => request.promise);
  controller.reviewFailed("project-1", "one", "Retired review failed");
  expect(controller.snapshot("project-1")).toMatchObject({ identity: { id: "two" }, phase: "submitting", error: null });
  expect(readyRows(journal).find(row => row.identity.id === "two")).toBeDefined(); request.resolve(result()); await pending;
});
it("bounds acknowledged history across repeated unknown/review/new-intent cycles and reload", async () => {
  let sequence = 0; const { controller, journal } = setup(() => `attempt-${sequence++}`);
  for (let index = 0; index < 32; index++) {
    const captured = { ...identity, expectedRevision: index + 2, artifactId: `artifact-${index}` };
    await controller.submit(captured, () => Promise.reject(new TypeError("Lost response"))).catch(() => {});
    const id = controller.snapshot(identity.projectId).identity!.id, reviewed = { ...review, revision: index + 3, contextKey: `review-${index}` };
    controller.setReview(identity.projectId, id, reviewed); expect(controller.acknowledge(identity.projectId, id, reviewed)).toBe(true);
  }
  const expectedPrevious = Array.from({ length: 20 }, (_, index) => `attempt-${index + 11}`);
  expect(controller.snapshot(identity.projectId).previous?.map(value => value.identity!.id)).toEqual(expectedPrevious);
  expect(readyRows(journal)).toHaveLength(21);
  const restored = new EditAttemptController(journal);
  expect(restored.snapshot(identity.projectId).identity?.id).toBe("attempt-31");
  expect(restored.snapshot(identity.projectId).previous?.map(value => value.identity!.id)).toEqual(expectedPrevious);
  restored.reloadJournal(); expect(restored.snapshot(identity.projectId).previous).toHaveLength(20);
  expect(readyRows(journal)).toHaveLength(21);
});
it("bounds an excess restored archive before the next write while preserving a newer explicit intent", async () => {
  const { journal } = setup();
  journal.write({ schemaVersion: 2, rows: Array.from({ length: 35 }, (_, index) => ({ identity: { ...identity, id: `old-${index}`, expectedRevision: index + 2 }, acknowledged: compactEditReview(review) })) });
  const controller = new EditAttemptController(journal, () => "fresh");
  expect(controller.snapshot(identity.projectId).identity?.id).toBe("old-34");
  expect(controller.snapshot(identity.projectId).previous?.map(value => value.identity!.id)).toEqual(Array.from({ length: 20 }, (_, index) => `old-${index + 14}`));
  controller.reloadJournal(); expect(controller.snapshot(identity.projectId).identity?.id).toBe("old-34"); expect(controller.snapshot(identity.projectId).previous).toHaveLength(20);
  await controller.submit({ ...identity, expectedRevision: 40 }, () => Promise.reject(new TypeError("Lost response"))).catch(() => {});
  expect(controller.snapshot(identity.projectId).identity?.id).toBe("fresh");
  expect(controller.snapshot(identity.projectId).previous?.map(value => value.identity!.id)).toEqual(Array.from({ length: 20 }, (_, index) => `old-${index + 15}`));
  expect(readyRows(journal)).toHaveLength(21);
});
it("preserves every unresolved/current owner and ignores an aged-out acknowledged callback", async () => {
  let sequence = 0; const { controller, journal } = setup(() => `owned-${sequence++}`), positive = held<SelectionEditResult>(), retired = held<SelectionEditResult>();
  const live = controller.submit({ ...identity, projectId: "positive-pending" }, () => positive.promise);
  await controller.submit({ ...identity, projectId: "unresolved" }, () => Promise.reject(new TypeError("Lost response"))).catch(() => {});
  const old = controller.submit(identity, () => retired.promise);
  await controller.check(identity.projectId, value => Promise.resolve(receipt(value.id)), () => Promise.resolve());
  controller.setReview(identity.projectId, "owned-2", review); expect(controller.acknowledge(identity.projectId, "owned-2", review)).toBe(true);
  for (let index = 0; index < 31; index++) {
    await controller.submit({ ...identity, expectedRevision: index + 3 }, () => Promise.reject(new TypeError("Lost response"))).catch(() => {});
    const id = controller.snapshot(identity.projectId).identity!.id;
    controller.setReview(identity.projectId, id, review); expect(controller.acknowledge(identity.projectId, id, review)).toBe(true);
  }
  const current = controller.snapshot(identity.projectId).identity!.id, pending = controller.snapshot("positive-pending"), unknown = controller.snapshot("unresolved");
  retired.resolve(result()); await old;
  const after = controller.snapshot(identity.projectId), rows = readyRows(journal);
  positive.resolve({ ...result(), project: { ...result().project, id: "positive-pending" } }); await live;
  expect(pending).toMatchObject({ phase: "submitting", identity: { id: "owned-0" } }); expect(unknown).toMatchObject({ phase: "unknown", identity: { id: "owned-1" } });
  expect(rows.map(value => value.identity.id)).toEqual(expect.arrayContaining(["owned-0", "owned-1", current]));
  expect(rows.some(value => value.identity.id === "owned-2")).toBe(false); expect(rows).toHaveLength(23);
  expect(after.identity?.id).toBe(current); expect(after.previous).toHaveLength(20); expect(controller.owns(identity.projectId, "owned-2")).toBe(false);
  const restored = new EditAttemptController(journal); expect(() => restored.assertWritable("unresolved")).toThrow();
});
