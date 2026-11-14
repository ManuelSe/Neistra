import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { HydrogenAppearanceChange, Selection } from "../api/types";
import { dispatchProjectCommand } from "../coordinates/projectCommand";
import { captureHydrogenTarget, hydrogenAppearanceCommand, type HydrogenActionContext } from "../selection/hydrogenAction";
import { molecularProject } from "./molecular-fixtures";

function fixture() {
  const project = molecularProject();
  const seed: Selection = { schema_version: 1, granularity: "atom", source: "viewer",
    atoms: [{ structure_id: "protein", atom_id: 1 }, { structure_id: "ligand", atom_id: 1 }] };
  const target: Selection = { ...seed, atoms: [{ structure_id: "protein", atom_id: 2 }] };
  const capture = captureHydrogenTarget(project, 7, seed, target);
  const context: HydrogenActionContext = { activeProjectId: project.id, selectionProjectId: project.id,
    projectEpoch: 7, selection: seed, project };
  const send = vi.fn(() => Promise.resolve(project));
  return { project, seed, target, capture, context, send };
}

const changes: HydrogenAppearanceChange[] = [
  { property: "nonpolar_hydrogens", action: "set", show: true },
  { property: "nonpolar_hydrogens", action: "set", show: false },
  { property: "nonpolar_hydrogens", action: "reset" },
];

it.each(changes)("publishes only the captured explicit H operand and revision for $action/$show", async change => {
  const f = fixture(), before = structuredClone({ project: f.project, seed: f.seed });
  const command = hydrogenAppearanceCommand(f.project, change, f.capture, () => f.context, f.send);
  f.context.project = { ...f.project, revision: f.project.revision + 1 };
  await dispatchProjectCommand(command, vi.fn());
  expect(f.send).toHaveBeenCalledExactlyOnceWith(f.project, { ...f.target, source: "inspector" }, change);
  expect(f.project).toEqual(before.project);
  expect(f.seed).toEqual(before.seed);
  expect(f.capture.seed).toBe(f.seed);
  expect(command.projectId).toBe(f.project.id);
  expect(command.feedback).toBe("quiet");
});

const transitions: { name: string; apply: (f: ReturnType<typeof fixture>) => void }[] = [
  { name: "active project", apply: f => { f.context.activeProjectId = "another"; } },
  { name: "selection owner", apply: f => { f.context.selectionProjectId = "another"; } },
  { name: "A to B to A project epoch", apply: f => { f.context.projectEpoch += 2; } },
  { name: "selection identity", apply: f => { f.context.selection = structuredClone(f.seed); } },
  { name: "unavailable project", apply: f => { f.context.project = undefined; } },
  { name: "target artifact", apply: f => {
    f.context.project = structuredClone(f.project);
    f.context.project.entries[0].current_artifact_id = "replacement";
  } },
  { name: "heavy seed entry without resolved H targets", apply: f => {
    f.context.project = structuredClone(f.project);
    f.context.project.entries[1].current_artifact_id = "replacement";
  } },
];

it.each(transitions)("rejects a changed $name before creating a command", transition => {
  const f = fixture(); transition.apply(f);
  expect(() => hydrogenAppearanceCommand(f.project, changes[0], f.capture, () => f.context, f.send)).toThrow(/changed|Reopen/);
  expect(f.send).not.toHaveBeenCalled();
});

it.each(transitions)("rechecks $name after awaited mutation preflight", async transition => {
  const f = fixture(), client = new QueryClient();
  const command = hydrogenAppearanceCommand(f.project, changes[2], f.capture, () => f.context, f.send);
  const mutation = client.getMutationCache().build(client, {
    onMutate: () => Promise.resolve().then(() => transition.apply(f)),
    mutationFn: () => dispatchProjectCommand(command, vi.fn()),
  });
  await expect(mutation.execute(undefined)).rejects.toThrow(/changed|Reopen/);
  expect(f.send).not.toHaveBeenCalled();
  client.clear();
});

it("refuses invalid capture scopes without silently expanding or accepting another entry", () => {
  const f = fixture();
  expect(() => captureHydrogenTarget(f.project, 7, f.seed, { ...f.target, atoms: [] })).toThrow(/No current hydrogen/);
  expect(() => captureHydrogenTarget(f.project, 7, f.seed, { ...f.target, atoms: [{ structure_id: "outside", atom_id: 2 }] })).toThrow(/No current hydrogen/);
  const unavailable = structuredClone(f.project); unavailable.entries[1].current_artifact_id = null;
  expect(() => captureHydrogenTarget(unavailable, 7, f.seed, f.target)).toThrow(/unavailable/);
  expect(() => hydrogenAppearanceCommand({ ...f.project, id: "outside" }, changes[0], f.capture, () => f.context, f.send)).toThrow(/another project/);
});

it("retains a server revision conflict without rebase or replay", async () => {
  const f = fixture(), conflict = new Error("Revision conflict");
  f.send.mockRejectedValue(conflict);
  const command = hydrogenAppearanceCommand(f.project, changes[0], f.capture, () => f.context, f.send);
  await expect(dispatchProjectCommand(command, vi.fn())).rejects.toBe(conflict);
  expect(f.send).toHaveBeenCalledTimes(1);
});
