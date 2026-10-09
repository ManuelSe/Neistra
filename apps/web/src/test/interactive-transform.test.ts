import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Project } from "../api/types";
import {
  captureMovement, initialMovementPose, movementContextMatches, movementMatrix,
  movementPreview, movementRequest, movePose, type MovementView,
} from "../coordinates/interactiveTransform";
import { MovementSession } from "../coordinates/MovementSession";
import { canonicalSelection } from "../selection/selection";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

function fixture() {
  const projection = proteinProjection();
  projection.structure.atoms[2].id = 7;
  projection.structure.bonds = [{ id: 1, atom_1_id: 1, atom_2_id: 2, order: 1, aromatic: false, stereo: null, inferred: false }];
  const other = structuredClone(projection);
  other.entry_id = "other";
  other.structure.atoms[0].coordinates = [0, 4, 0];
  const project = molecularProject([
    { ...molecularEntry("protein", "Receptor", "protein"), atom_ids: [1, 2, 7] },
    { ...molecularEntry("other", "Hidden", "protein"), visible: false, atom_ids: [1, 2, 7] },
  ]);
  const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }, { structure_id: "other", atom_id: 1 }, { structure_id: "protein", atom_id: 7 }]);
  const rendered = selection.atoms.filter(atom => atom.structure_id === "protein");
  const structures = new Map([["protein", projection], ["other", other]]);
  const capture = captureMovement(project, selection, structures, rendered);
  return { project, selection, rendered, structures, capture };
}

const view: MovementView = { camera: { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5, mode: "perspective" }, height: 400, fov: Math.PI / 4 };

describe("interactive-transform geometry", () => {
  it("captures the full canonical multi-entry target including hidden stable IDs without cache ownership", () => {
    const { capture, structures, selection } = fixture();
    expect(capture.hiddenCount).toBe(1);
    expect(capture.crossingBonds).toBe(2);
    expect(capture.centroid).toEqual([expect.closeTo(5 / 3, 12), expect.closeTo(4 / 3, 12), 0]);
    selection.atoms[0].atom_id = 99;
    structures.get("other")!.structure.atoms[0].coordinates[1] = 900;
    expect(capture.selection.atoms[0].atom_id).toBe(1);
    expect(capture.originals[0].coordinates[0]).toEqual([0, 4, 0]);
  });

  it.each(["empty", "locked", "hidden", "missing", "invalid"])("rejects %s activation without narrowing", reason => {
    const { project, selection, structures, rendered } = fixture();
    if (reason === "empty") selection.atoms = [];
    if (reason === "locked") project.entries[1].locked = true;
    if (reason === "missing") structures.get("protein")!.structure.atoms.pop();
    if (reason === "invalid") structures.get("protein")!.structure.atoms[0].coordinates[0] = Infinity;
    expect(() => captureMovement(project, selection, structures, reason === "hidden" ? [] : rendered)).toThrow();
  });

  it("rotates around the translated captured centroid and recomputes previews from originals", () => {
    const { capture } = fixture();
    const start = { ...initialMovementPose(), translation: [2, -3, 1] as [number, number, number] };
    const pose = movePose(capture, start, "rotate", 200, 0, view);
    const preview = movementPreview(capture, pose);
    const points = preview.flatMap(patch => patch.coordinates);
    const centroid = points.reduce<number[]>((a, p) => a.map((v, i) => v + p[i] / points.length), [0, 0, 0]);
    expect(centroid).toEqual([expect.closeTo(5 / 3 + 2, 12), expect.closeTo(4 / 3 - 3, 12), expect.closeTo(1, 12)]);
    const originalDistance = Math.hypot(...capture.originals[1].coordinates[0].map((v, i) => v - capture.originals[1].coordinates[1][i]));
    expect(Math.hypot(...preview[1].coordinates[0].map((v, i) => v - preview[1].coordinates[1][i]))).toBeCloseTo(originalDistance, 12);
    expect(movementPreview(capture, initialMovementPose())).toEqual(capture.originals.map(p => ({ ...p, artifact_id: "preview" })));
    expect(movementPreview(capture, pose)).toEqual(preview);
  });

  it("keeps long composed gestures proper rotations within the API tolerance", () => {
    const { capture } = fixture();
    let pose = initialMovementPose();
    for (let i = 0; i < 10_000; i++) pose = movePose(capture, pose, "rotate", 3, -2, view);
    const matrix = movementMatrix(pose);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      expect(matrix.reduce((sum, row) => sum + row[i] * row[j], 0)).toBeCloseTo(i === j ? 1 : 0, 12);
    }
    expect(matrix[0][0]*(matrix[1][1]*matrix[2][2]-matrix[1][2]*matrix[2][1])-matrix[0][1]*(matrix[1][0]*matrix[2][2]-matrix[1][2]*matrix[2][0])+matrix[0][2]*(matrix[1][0]*matrix[2][1]-matrix[1][1]*matrix[2][0])).toBeCloseTo(1, 12);
  });

  it.each(["perspective", "orthographic"] as const)("maps screen and depth motion in a rolled %s view", mode => {
    const { capture } = fixture();
    const rolled = { ...view, camera: { ...view.camera, mode, up: [1, 0, 0] as [number, number, number] } };
    const pose = movePose(capture, initialMovementPose(), "translate", 20, -10, rolled);
    expect(pose.translation[0]).toBeGreaterThan(0);
    expect(pose.translation[1]).toBeLessThan(0);
    expect(pose.translation[2]).toBe(0);
    const depth = movePose(capture, pose, "depth", 99, -20, rolled);
    expect(depth.translation.slice(0, 2)).toEqual(pose.translation.slice(0, 2));
    expect(depth.translation[2]).toBeLessThan(0);
    const zoomed = movePose(capture, initialMovementPose(), "translate", 20, -10, { ...rolled, camera: { ...rolled.camera, position: [0, 0, 5] } });
    expect(zoomed.translation[0]).toBeCloseTo(pose.translation[0] / 2, 12);
  });

  it("guards revision, artifact, locks, removal and exact selection", () => {
    const { capture, project, selection } = fixture();
    expect(movementContextMatches(capture, project, selection)).toBe(true);
    expect(movementContextMatches(capture, { ...project, revision: project.revision + 1 }, selection)).toBe(false);
    expect(movementContextMatches(capture, { ...project, entries: project.entries.slice(1) }, selection)).toBe(false);
    expect(movementContextMatches(capture, project, canonicalSelection(selection.atoms.slice(1)))).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

function transaction() {
  const data = fixture();
  const context = { project: data.project as Project | undefined, selection: data.selection };
  const ports = {
    context: () => context, load: vi.fn(() => Promise.resolve(data.structures)), rendered: () => data.rendered,
    commit: vi.fn(() => Promise.resolve({ ...data.project, revision: data.project.revision + 1 })),
    refresh: vi.fn(() => Promise.resolve(data.project)), accept: vi.fn(), notice: vi.fn(),
  };
  const session = new MovementSession(ports);
  return { ...data, context, ports, session };
}

describe("interactive-transform transaction", () => {
  it("combines multiple updates into one captured-revision Apply and prevents duplicate requests", async () => {
    const { session, ports, capture, project } = transaction();
    await session.begin();
    const first = movePose(capture, initialMovementPose(), "translate", 20, -10, view);
    const final = movePose(capture, first, "rotate", 30, -20, view);
    session.update(first); session.update(final);
    await Promise.all([session.apply(), session.apply()]);
    expect(ports.commit).toHaveBeenCalledExactlyOnceWith(project, movementRequest(capture, final));
    expect(session.snapshot().phase).toBe("idle");
    expect(ports.accept).toHaveBeenCalledOnce();
  });

  it("cancel discards the entire session without any write and invalidates late loads", async () => {
    const { session, ports, structures } = transaction();
    const pending = deferred<typeof structures>();
    ports.load.mockReturnValue(pending.promise);
    const begin = session.begin();
    session.cancel(); pending.resolve(structures); await begin;
    expect(session.snapshot().phase).toBe("idle");
    expect(ports.commit).not.toHaveBeenCalled();
    await session.begin(); session.cancel();
    expect(session.snapshot().capture).toBeNull();
  });

  it("discards a changed selection before Apply", async () => {
    const { session, ports, context } = transaction();
    await session.begin(); context.selection = canonicalSelection([]);
    await session.apply();
    expect(ports.commit).not.toHaveBeenCalled();
    expect(session.snapshot().phase).toBe("idle");
    expect(ports.notice).toHaveBeenCalledWith("project-1", expect.stringContaining("discarded"));
  });

  it("accepts a no-op without an edited-state claim", async () => {
    const { session, ports, project } = transaction();
    ports.commit.mockResolvedValue(project);
    await session.begin(); await session.apply();
    expect(ports.notice).toHaveBeenCalledWith(project.id, "Selection coordinates unchanged.");
  });

  it("cancels stale preview and refreshes its captured project without replay", async () => {
    const { session, ports, project } = transaction();
    ports.commit.mockRejectedValue(new ApiError(409, "revision_conflict", "Stale revision"));
    await session.begin(); await session.apply();
    expect(ports.refresh).toHaveBeenCalledExactlyOnceWith(project.id);
    expect(ports.commit).toHaveBeenCalledOnce();
    expect(session.snapshot().phase).toBe("idle");
  });

  it.each([false, true])("reconciles ambiguous transport before allowing any retry (changed=%s)", async changed => {
    const { session, ports, project } = transaction();
    ports.commit.mockRejectedValue(new ApiError(0, "network_error", "Interrupted"));
    ports.refresh.mockResolvedValue({ ...project, revision: project.revision + Number(changed) });
    await session.begin(); await session.apply();
    expect(ports.refresh).toHaveBeenCalledOnce();
    expect(ports.commit).toHaveBeenCalledOnce();
    expect(session.snapshot().phase).toBe(changed ? "idle" : "active");
  });

  it("does not permit retry when reconciliation fails", async () => {
    const { session, ports } = transaction();
    ports.commit.mockRejectedValue(new Error("Invalid response"));
    ports.refresh.mockRejectedValue(new Error("Offline"));
    await session.begin(); await session.apply(); await session.apply();
    expect(session.snapshot().phase).toBe("uncertain");
    expect(ports.commit).toHaveBeenCalledOnce();
    expect(ports.notice).toHaveBeenCalledWith("project-1", expect.stringContaining("could not be reconciled"), true);
    await session.begin(); session.cancel();
    expect(session.snapshot().phase).toBe("uncertain");
    ports.refresh.mockResolvedValue(ports.context().project!);
    await session.reconcile();
    expect(session.snapshot().phase).toBe("idle");
  });

  it("routes a late successful response to captured authority without reviving UI or feedback", async () => {
    const { session, ports, project } = transaction();
    const pending = deferred<Project>(); ports.commit.mockReturnValue(pending.promise);
    await session.begin(); const apply = session.apply();
    session.cancel(); ports.notice.mockClear();
    pending.resolve({ ...project, revision: 99 }); await apply;
    expect(ports.accept).toHaveBeenCalledWith(expect.objectContaining({ id: project.id, revision: 99 }));
    expect(ports.notice).not.toHaveBeenCalled();
    expect(session.snapshot().phase).toBe("idle");
  });
});
