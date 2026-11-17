import { describe, expect, it, vi } from "vitest";
import type { AtomReference, MeasurementKind, NormalizedStructure } from "../api/types";
import type { ProjectCommandContext } from "../coordinates/projectCommand";
import { MeasurementSession, type MeasurementContext, type MeasurementSave, type MeasurementSaveCompletion } from "../measurements/session";
import { molecularEntry, molecularProject, proteinStructure } from "./molecular-fixtures";

const refs = (...ids: number[]): AtomReference[] => ids.map(atom_id => ({ structure_id: "entry", atom_id }));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(create?: (capture: MeasurementSave, context: ProjectCommandContext) => Promise<MeasurementSaveCompletion>) {
  const structure = proteinStructure();
  const points: [number, number, number][] = [[1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, 1]];
  structure.atoms = points.map((coordinates, i) => ({ ...structure.atoms[0], id: i + 1, source_index: i, coordinates }));
  const entry = { ...molecularEntry("entry", "Entry", "ligand"), atom_count: 4, atom_ids: [1, 2, 3, 4] };
  const project = molecularProject([entry]);
  let context: MeasurementContext = { project, activeProjectId: project.id, selectionProjectId: project.id,
    projectEpoch: 4, paused: false, busy: false };
  const structures = new Map<string, NormalizedStructure>([["entry", structure]]);
  const send = vi.fn(create ?? (() => Promise.resolve<MeasurementSaveCompletion>("current")));
  const session = new MeasurementSession({ context: () => context, structures: () => structures, create: send });
  return { session, send, project, structures, context: () => context,
    patch: (patch: Partial<MeasurementContext>) => { context = { ...context, ...patch }; } };
}

function complete(f: ReturnType<typeof fixture>, kind: MeasurementKind = "distance") {
  expect(f.session.open()).toBe(true);
  f.session.setKind(kind);
  expect(f.session.useSelection(refs(...(kind === "distance" ? [1, 2] : kind === "angle" ? [1, 2, 3] : [1, 2, 3, 4])))).toBe(true);
  f.session.setName("Reference");
}

describe("application-owned ordered measurement draft", () => {
  it("starts empty, requires exact kind and replaces/removes only the numbered slot", () => {
    const f = fixture(), s = f.session;
    s.open();
    expect(s.snapshot().slots).toEqual([null, null]);
    expect(s.choose(refs(3)[0])).toBe(true);
    expect(s.choose(refs(3)[0])).toBe(false);
    expect(s.snapshot().activeSlot).toBe(1);
    expect(s.choose(refs(1)[0])).toBe(true);
    expect(s.snapshot().slots).toEqual(refs(3, 1));
    expect(s.choose(refs(2)[0])).toBe(false);
    s.remove(0);
    expect(s.snapshot().slots).toEqual([null, refs(1)[0]]);
    s.choose(refs(2)[0]);
    expect(s.snapshot().slots).toEqual(refs(2, 1));
    s.setKind("angle");
    expect(s.snapshot().slots).toEqual([null, null, null]);
    s.choose(refs(1)[0]); s.choose(refs(2)[0]);
    expect(s.value()).toBeNull();
    s.choose(refs(3)[0]);
    expect(s.value()).toBe(90);
    s.setKind("dihedral");
    s.choose(refs(1)[0]); s.choose(refs(2)[0]); s.choose(refs(3)[0]);
    expect(s.value()).toBeNull();
    s.choose(refs(4)[0]);
    expect(s.value()).toBe(-90);
  });

  it("requires explicit distinct use-selection inputs and never sorts their angle vertex", () => {
    const f = fixture(); complete(f, "angle");
    expect(f.session.useSelection(refs(3, 1))).toBe(false);
    expect(f.session.useSelection(refs(3, 1, 1))).toBe(false);
    expect(f.session.useSelection(refs(3, 1, 2))).toBe(true);
    expect(f.session.snapshot().slots).toEqual(refs(3, 1, 2));
    expect(f.session.value()).toBeCloseTo(45);
    expect(f.session.useSelection(refs(3, 1, 99))).toBe(false);
  });

  it("allows hidden locked participants and qualifies identical atom IDs by entry identity", () => {
    const f = fixture(), copy = { ...f.project.entries[0], id: "copy", current_artifact_id: "copy-artifact", visible: false, locked: true };
    f.patch({ project: { ...f.project, entries: [f.project.entries[0], copy] } });
    const structure = structuredClone(f.structures.get("entry")!);
    structure.atoms[0].coordinates = [4, 0, 0]; f.structures.set("copy", structure);
    f.session.open();
    expect(f.session.useSelection([refs(1)[0], { structure_id: "copy", atom_id: 1 }])).toBe(true);
    expect(f.session.value()).toBe(3);
  });

  it("retires changed source acquisition without retargeting and permits deliberate slot correction", () => {
    const f = fixture(); complete(f);
    const previous = f.session.snapshot();
    f.patch({ project: { ...f.project, entries: [{ ...f.project.entries[0], current_artifact_id: "moved" }] } });
    f.session.guardContext();
    expect(f.session.ownsAcquisition(previous.session, previous.generation)).toBe(false);
    expect(f.session.value()).toBeNull();
    expect(f.session.snapshot().slots).toEqual(refs(1, 2));
    f.session.activate(0); expect(f.session.choose(refs(1)[0], "moved")).toBe(true);
    expect(f.session.value()).toBeNull();
    f.session.activate(1); expect(f.session.choose(refs(2)[0], "moved")).toBe(true);
    expect(f.session.value()).toBe(1);
  });

  it("pauses geometry and native acquisition for every supplied preview state, preserving draft fields", () => {
    const f = fixture(); complete(f);
    const before = f.session.snapshot();
    f.patch({ paused: true }); f.session.guardContext();
    expect(f.session.value()).toBeNull();
    expect(f.session.snapshot().acquiring).toBe(false);
    expect(f.session.snapshot().name).toBe(before.name);
    expect(f.session.snapshot().slots).toEqual(before.slots);
    f.patch({ paused: false });
    expect(f.session.value()).toBe(1);
    expect(f.session.snapshot().acquiring).toBe(false);
  });

  it("retains stable snapshots between mutations and treats a responsive unsubscribe as no session retirement", () => {
    const f = fixture(); complete(f);
    const before = f.session.snapshot(), listener = vi.fn(), release = f.session.subscribe(listener);
    expect(f.session.snapshot()).toBe(before); release();
    expect(f.session.snapshot()).toBe(before);
    f.session.activate(1);
    expect(f.session.snapshot().slots).toEqual(before.slots);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("owned asynchronous measurement save", () => {
  it("captures explicit ordered refs/revision and blocks duplicate Save synchronously", async () => {
    const held = deferred<MeasurementSaveCompletion>(); const f = fixture(() => held.promise); complete(f, "angle");
    f.session.useSelection(refs(3, 1, 2));
    const first = f.session.save(); expect(await f.session.save()).toBe(false);
    expect(f.send).toHaveBeenCalledOnce();
    const [capture, owner] = f.send.mock.calls[0];
    expect(capture).toMatchObject({ project: { id: f.project.id, revision: f.project.revision }, references: refs(3, 1, 2), name: "Reference" });
    f.patch({ busy: true }); expect(() => owner.assertDispatchable()).not.toThrow();
    f.patch({ project: { ...f.project, revision: f.project.revision + 1 } });
    expect(owner.ownsFeedback()).toBe(true); // Own successful cache advancement is not stale intent.
    held.resolve("current"); expect(await first).toBe(true);
    expect(f.session.snapshot()).toMatchObject({ name: "", slots: [null, null, null], saving: false, notice: "Saved Reference." });
  });

  it("retains name/targets after failed Save, allows retry, and refuses incomplete/invalid geometry", async () => {
    const held = deferred<MeasurementSaveCompletion>(); const f = fixture(() => held.promise); complete(f);
    const saved = f.session.save(); held.reject(new Error("Revision conflict"));
    expect(await saved).toBe(false);
    expect(f.session.snapshot()).toMatchObject({ name: "Reference", slots: refs(1, 2), saving: false, notice: "Revision conflict" });
    f.send.mockResolvedValue("current"); expect(await f.session.save()).toBe(true);
    f.session.setName("Incomplete"); expect(await f.session.save()).toBe(false);
    f.session.useSelection(refs(1, 2));
    f.structures.clear(); expect(await f.session.save()).toBe(false);
    expect(f.send).toHaveBeenCalledTimes(2);
  });

  it.each(["visit", "close", "source", "preview", "revision"] as const)("rejects dispatch after a held %s change and leaves newer UI untouched", async change => {
    const held = deferred<MeasurementSaveCompletion>(); const f = fixture(() => held.promise); complete(f);
    const saved = f.session.save(), [capture, owner] = f.send.mock.calls[0];
    if (change === "visit") {
      f.patch({ activeProjectId: "other" }); f.session.guardContext();
      f.patch({ activeProjectId: f.project.id }); f.session.open();
    } else if (change === "close") { f.session.close(); f.session.open(); }
    else if (change === "source") f.patch({ project: { ...f.project, entries: [{ ...f.project.entries[0], current_artifact_id: "changed" }] } });
    else if (change === "preview") f.patch({ paused: true });
    else f.patch({ project: { ...f.project, revision: f.project.revision + 1 } });
    f.session.guardContext();
    expect(() => owner.assertDispatchable()).toThrow(/inputs changed/);
    if (change === "visit" || change === "close") f.session.setName("New draft");
    const before = f.session.snapshot();
    held.resolve("current"); await saved;
    expect(capture.references).toEqual(refs(1, 2));
    if (change === "visit" || change === "close") expect(f.session.snapshot()).toBe(before);
    else if (change !== "revision") expect(f.session.snapshot().slots).toEqual(refs(1, 2));
  });

  it("retires A→B→A at navigation before a selection-project effect changes its epoch", async () => {
    const held = deferred<MeasurementSaveCompletion>(); const f = fixture(() => held.promise); complete(f);
    const saved = f.session.save(), epoch = f.context().projectEpoch;
    f.patch({ activeProjectId: "B" }); f.session.guardContext();
    expect(f.session.snapshot().open).toBe(false);
    f.patch({ activeProjectId: f.project.id }); f.session.open(); f.session.setName("Later visit");
    expect(f.context().projectEpoch).toBe(epoch);
    const newer = f.session.snapshot(); held.resolve("current"); await saved;
    expect(f.session.snapshot()).toBe(newer);
  });
});

it("keeps a pending Save owner when only native acquisition is stopped", async () => {
  const held = deferred<MeasurementSaveCompletion>(); const f = fixture(() => held.promise); complete(f);
  const saved = f.session.save(), owner = f.send.mock.calls[0][1];
  f.session.cancelAcquisition();
  expect(f.session.snapshot().acquiring).toBe(false);
  expect(owner.ownsFeedback()).toBe(true);
  held.resolve("current"); await saved;
  expect(f.session.snapshot()).toMatchObject({ name: "", notice: "Saved Reference.", saving: false, acquiring: false, activeSlot: null });
});

it("never resurrects a pending Save owner after a preview starts and ends while picking is stopped", async () => {
  const held = deferred<MeasurementSaveCompletion>(); const f = fixture(() => held.promise); complete(f);
  f.session.cancelAcquisition();
  const saved = f.session.save(), owner = f.send.mock.calls[0][1];
  f.patch({ paused: true }); f.session.guardContext();
  expect(owner.ownsFeedback()).toBe(false);
  f.patch({ paused: false }); f.session.guardContext();
  expect(owner.ownsFeedback()).toBe(false);
  const before = f.session.snapshot(); held.resolve("current"); await saved;
  expect(f.session.snapshot()).toMatchObject({ name: "Reference", slots: before.slots, notice: before.notice, saving: false });
});

it("never resurrects pending Save ownership after source replacement and restoration with picking stopped", async () => {
  const held = deferred<MeasurementSaveCompletion>(); const f = fixture(() => held.promise); complete(f); f.session.cancelAcquisition();
  const saved = f.session.save(), owner = f.send.mock.calls[0][1];
  f.patch({ project: { ...f.project, entries: [{ ...f.project.entries[0], current_artifact_id: "different" }] } });
  f.session.guardContext(); expect(owner.ownsFeedback()).toBe(false);
  f.patch({ project: f.project }); f.session.guardContext(); expect(owner.ownsFeedback()).toBe(false);
  held.resolve("current"); await saved;
  expect(f.session.snapshot()).toMatchObject({ name: "Reference", slots: refs(1, 2), saving: false });
});

it("keeps the named draft and acquisition owner above compact/review presentation without automatic expansion", () => {
  const f = fixture(); f.session.open(); f.session.setKind("angle"); f.session.setName("Touch reference");
  f.session.pickInViewer();
  expect(f.session.snapshot()).toMatchObject({ minimized: true, name: "Touch reference", activeSlot: 0, acquiring: true });
  f.session.choose(refs(1)[0]); f.session.choose(refs(2)[0]); f.session.choose(refs(3)[0]);
  expect(f.session.snapshot()).toMatchObject({ minimized: true, name: "Touch reference", slots: refs(1, 2, 3) });
  const generation = f.session.snapshot().generation;
  f.session.reviewTargets();
  expect(f.session.snapshot()).toMatchObject({ minimized: false, name: "Touch reference", slots: refs(1, 2, 3), generation });
});


it("retains a draft when an accepted server Save has already been superseded by newer project state", async () => {
  const held = deferred<MeasurementSaveCompletion>(), f = fixture(() => held.promise); complete(f);
  const saving = f.session.save();
  held.resolve("superseded");
  expect(await saving).toBe(false);
  expect(f.session.snapshot()).toMatchObject({ name: "Reference", slots: refs(1, 2), saving: false,
    notice: "The project changed while Save was finishing. Check Saved measurements." });
});


it("retains a stopped acquisition intent and draft after a held failed Save", async () => {
  const held = deferred<MeasurementSaveCompletion>(), f = fixture(() => held.promise); complete(f);
  const saving = f.session.save(); f.session.cancelAcquisition();
  held.reject(new Error("Retry Save"));
  expect(await saving).toBe(false);
  expect(f.session.snapshot()).toMatchObject({ name: "Reference", slots: refs(1, 2), acquiring: false,
    activeSlot: null, saving: false, notice: "Retry Save" });
});
