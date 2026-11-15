import { expect, it, vi } from "vitest";
import type { EditAttemptReceipt, SelectionEditResult } from "../api/types";
import { compactEditReview, EditAttemptController, editAttemptBlocksWrites, type EditAttemptIdentity, type EditAttemptJournalEnvelope, type EditReview } from "../editing/attempt";
import { createEditAttemptJournal } from "../editing/attemptJournal";
import { molecularProject } from "./molecular-fixtures";
const identity = { id: "retained", projectId: "one", entryId: "ligand", expectedRevision: 2, artifactId: "a", kind: "model" as const, targetLabel: "Ligand", operation: "atom.delete" };
const review: EditReview = { revision: 3, artifactId: null, undo: "Delete", redo: null, contextKey: "large-immutable-artifact-and-lock-context", identityUnavailable: true };
function storage(initial: string | null = null) {
  let text = initial;
  return { getItem: vi.fn(() => text), setItem: vi.fn((_key: string, next: string) => { text = next; }), removeItem: vi.fn(() => { text = null; }), text: () => text };
}
function acknowledge(controller: EditAttemptController, projectId: string, value = review) {
  const owner = controller.recoveryOwner(projectId); controller.setReview(projectId, owner, value);
  return controller.acknowledgeRecovery(projectId, owner, value);
}
const result = { project: molecularProject(), warnings: [], selection_after: { schema_version: 1, atoms: [], source: "viewer", granularity: "atom" }, replacements: {},
  report: { operation: "atom.delete", created_atom_ids: [], created_bond_ids: [], deleted_atom_ids: [], deleted_bond_ids: [], changed_atom_ids: [], force_field: null, converged: null } } as SelectionEditResult;
it("treats only an absent key as absence and never writes on construction", () => {
  const target = storage(), journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal);
  expect(journal.read()).toEqual({ kind: "absent" }); expect(editAttemptBlocksWrites(controller.snapshot("one"))).toBe(false); expect(target.setItem).not.toHaveBeenCalled();
});
it.each(["{broken", "[] trailing", JSON.stringify({ schemaVersion: 99, rows: [] }), " ".repeat(1024 * 1024 + 1)])("pauses every project on unreadable journal metadata without automatically overwriting it", raw => {
  const target = storage(raw), journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal);
  expect(journal.read().kind).toBe("invalid"); expect(controller.snapshot("one").identity).toBeNull();
  expect(editAttemptBlocksWrites(controller.snapshot("one"))).toBe(true); expect(editAttemptBlocksWrites(controller.snapshot("two"))).toBe(true);
  expect(target.setItem).not.toHaveBeenCalled(); controller.reloadJournal(); expect(target.text()).toBe(raw); expect(target.setItem).not.toHaveBeenCalled();
});
it("preserves valid pending identities from a partially invalid envelope and requires their receipts independently", async () => {
  const raw = JSON.stringify({ schemaVersion: 2, rows: [{ identity }, { identity: { broken: true } }] });
  const target = storage(raw), journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal);
  expect(journal.read()).toEqual({ kind: "invalid", rows: [{ identity }] }); expect(controller.snapshot("one").identity).toEqual(identity);
  const receipt: EditAttemptReceipt = { server_instance_id: "server", attempt_id: identity.id, project_id: "one", entry_id: "ligand", kind: "model", expected_revision: 2,
    expected_artifact_id: "a", phase: "pending", outcome: null, committed_revision: null, committed_artifact_id: null, reason: null };
  await controller.check("one", () => Promise.resolve(receipt), () => Promise.resolve());
  expect(controller.snapshot("one").phase).toBe("submitting"); expect(acknowledge(controller, "one")).toBe(false); expect(target.setItem).not.toHaveBeenCalled(); expect(target.text()).toBe(raw);
});
it("replaces unreadable information only after an explicit project review and retains uncertainty for other projects and reload", () => {
  const target = storage("broken"), journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal);
  expect(acknowledge(controller, "one")).toBe(true); expect(() => controller.assertWritable("one")).not.toThrow(); expect(() => controller.assertWritable("two")).toThrow();
  const envelope = JSON.parse(target.text()!) as EditAttemptJournalEnvelope;
  expect(envelope.schemaVersion).toBe(2); expect(envelope.uncertainty).toMatchObject({ reason: "unreadable_previous_edit_information", outcome: "unknown", acknowledgedProjects: [{ projectId: "one", reviewedContext: compactEditReview(review) }] });
  expect(target.text()).not.toContain(review.contextKey); expect(target.text()).not.toContain("undo");
  const restored = new EditAttemptController(journal); expect(() => restored.assertWritable("one")).not.toThrow(); expect(() => restored.assertWritable("two")).toThrow();
  expect(acknowledge(restored, "two", { ...review, revision: 4 })).toBe(true); expect(() => restored.assertWritable("two")).not.toThrow();
});
it("does not turn unavailable storage into absence and permits read-only checks until a successful read", async () => {
  const target = storage(), get = target.getItem; target.getItem = vi.fn(() => { throw new Error("Unavailable"); });
  const journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal), refresh = vi.fn().mockResolvedValue(undefined);
  expect(journal.read()).toEqual({ kind: "unavailable" }); expect(controller.snapshot("one").canReview).toBe(false); expect(() => controller.assertWritable("one")).toThrow();
  await controller.check("one", vi.fn(), refresh); expect(refresh).toHaveBeenCalledOnce(); expect(target.setItem).not.toHaveBeenCalled();
  target.getItem = get; controller.reloadJournal(); expect(() => controller.assertWritable("one")).not.toThrow();
});
it("keeps live and reload identities when a read becomes unavailable during a submitted request", async () => {
  const target = storage(), journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal, () => "live");
  let release!: (result: SelectionEditResult) => void; const pending = controller.submit({ ...identity, projectId: "one" }, () => new Promise(resolve => { release = resolve; }));
  const get = target.getItem; target.getItem = vi.fn(() => { throw new Error("Unavailable"); }); controller.reloadJournal();
  expect(controller.snapshot("one").identity?.id).toBe("live"); expect(controller.snapshot("one").journalRecovery?.kind).toBe("unavailable");
  target.getItem = get; const restored = new EditAttemptController(journal); expect(restored.snapshot("one").identity?.id).toBe("live");
  release(result); await pending; expect(controller.snapshot("one").phase).toBe("saved");
});
it.each(["write", "readback"])("keeps the per-project guard when acknowledgment %s fails", failure => {
  const target = storage("broken"), journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal);
  if (failure === "write") target.setItem = vi.fn(() => { throw new Error("Full"); });
  else target.setItem = vi.fn();
  expect(acknowledge(controller, "one")).toBe(false); expect(controller.snapshot("one").error).toContain("Editing remains paused"); expect(() => controller.assertWritable("one")).toThrow();
});
it("retains the uncertainty marker during newer edits and does not let an old owner release its replacement", async () => {
  const target = storage("broken"), journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal, () => "newer");
  const old = controller.recoveryOwner("one"); expect(acknowledge(controller, "one")).toBe(true);
  const originalMarker = (JSON.parse(target.text()!) as EditAttemptJournalEnvelope).uncertainty!.id;
  await controller.submit({ ...identity, projectId: "one" }, () => Promise.resolve(result));
  expect((JSON.parse(target.text()!) as EditAttemptJournalEnvelope).uncertainty!.id).toBe(originalMarker); expect(() => controller.assertWritable("two")).toThrow();
  target.setItem("key", "new corruption"); controller.reloadJournal(); expect(controller.recoveryOwner("one")).not.toBe(old);
  controller.setReview("one", old, review); expect(controller.acknowledgeRecovery("one", old, review)).toBe(false); expect(() => controller.assertWritable("one")).toThrow();
});
it("keeps compact acknowledgment storage bounded independently of a large scientific project context", () => {
  const target = storage("broken"), controller = new EditAttemptController(createEditAttemptJournal(target));
  expect(acknowledge(controller, "one", { ...review, contextKey: "a".repeat(2_000_000) })).toBe(true); expect(target.text()!.length).toBeLessThan(1000);
});
it("recovers a valid identity conservatively when only its acknowledgment is malformed", () => {
  const target = storage(JSON.stringify({ schemaVersion: 2, rows: [{ identity, acknowledged: { revision: "broken" } }] })), journal = createEditAttemptJournal(target);
  expect(journal.read()).toEqual({ kind: "invalid", rows: [{ identity }] });
  const controller = new EditAttemptController(journal); expect(controller.snapshot("one").identity).toEqual(identity); expect(controller.snapshot("one").acknowledged).toBeUndefined();
  expect(target.setItem).not.toHaveBeenCalled(); expect(() => controller.assertWritable("one")).toThrow();
});
it("requires review again after a bounded project acknowledgment is evicted", () => {
  const target = storage("broken"), journal = createEditAttemptJournal(target), controller = new EditAttemptController(journal);
  for (let index = 0; index < 65; index++) expect(acknowledge(controller, `project-${index}`)).toBe(true);
  const value = journal.read(); expect(value.kind === "ready" && value.uncertainty?.acknowledgedProjects).toHaveLength(64);
  expect(() => controller.assertWritable("project-0")).toThrow(); expect(() => controller.assertWritable("project-64")).not.toThrow();
  const restored = new EditAttemptController(journal); expect(() => restored.assertWritable("project-0")).toThrow();
});
it("does not let a noncurrent positively pending identity disappear behind another unknown record", async () => {
  const second = { ...identity, id: "also-retained", expectedRevision: 3 };
  const target = storage(JSON.stringify({ schemaVersion: 2, rows: [{ identity }, { identity: second }, { malformed: true }] })), controller = new EditAttemptController(createEditAttemptJournal(target));
  const read = vi.fn((value: EditAttemptIdentity) => Promise.resolve({ server_instance_id: "server", attempt_id: value.id, project_id: "one", entry_id: "ligand", kind: "model", expected_revision: value.expectedRevision,
    expected_artifact_id: "a", phase: value.id === second.id ? "pending" : "unknown", outcome: value.id === second.id ? null : "unknown", committed_revision: null, committed_artifact_id: null, reason: null } as EditAttemptReceipt));
  await controller.check("one", read, () => Promise.resolve()); expect(read).toHaveBeenCalledTimes(2);
  expect(controller.snapshot("one").canReview).toBe(false); expect(acknowledge(controller, "one")).toBe(false); expect(target.setItem).not.toHaveBeenCalled();
});
it("preserves the current marker and newer owner when an earlier acknowledged request settles late", async () => {
  const target = storage(), journal = createEditAttemptJournal(target); let sequence = 0;
  const controller = new EditAttemptController(journal, () => ["old", "newer"][sequence++]);
  let releaseOld!: (value: SelectionEditResult) => void, releaseNew!: (value: SelectionEditResult) => void;
  const old = controller.submit({ ...identity, projectId: "one" }, () => new Promise(resolve => { releaseOld = resolve; }));
  target.setItem("key", "corrupt while active"); controller.reloadJournal();
  await controller.check("one", value => Promise.resolve({ server_instance_id: "restarted", attempt_id: value.id, project_id: "one", entry_id: null, kind: null, expected_revision: null,
    expected_artifact_id: null, phase: "unknown", outcome: "unknown", committed_revision: null, committed_artifact_id: null, reason: null }), () => Promise.resolve());
  expect(acknowledge(controller, "one")).toBe(true);
  const marker = controller.snapshot("one").journalRecovery?.markerId;
  const newer = controller.submit({ ...identity, projectId: "one", expectedRevision: 3 }, () => new Promise(resolve => { releaseNew = resolve; }));
  releaseOld({ ...result, project: { ...result.project, id: "one", revision: 3 } }); await old;
  expect(controller.snapshot("one")).toMatchObject({ identity: { id: "newer" }, phase: "submitting", journalRecovery: { markerId: marker, acknowledged: true } });
  expect(() => controller.assertWritable("two")).toThrow();
  releaseNew({ ...result, project: { ...result.project, id: "one", revision: 4 } }); await newer;
  const retained = journal.read(); expect(retained.kind === "ready" && retained.uncertainty?.id).toBe(marker);
});
