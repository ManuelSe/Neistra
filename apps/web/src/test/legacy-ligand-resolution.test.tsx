import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../api/types";
import { useLegacyLigandResolution, type LegacyResolutionPorts } from "../ligands/useLegacyLigandResolution";
import { unresolvedLigandDesignation } from "../ligands/types";
import { molecularEntry, molecularProject } from "./molecular-fixtures";

function legacy(count: number, id = "legacy"): Project {
  return { ...molecularProject(Array.from({ length: count }, (_, index) => ({
    ...molecularEntry(`${id}-${index}`, `Entry ${index}`, "ligand"),
    ligand_designation: unresolvedLigandDesignation(),
  }))), id };
}
function ports(project: Project): LegacyResolutionPorts {
  return { project, activeProjectId: project.id, priorityEntryId: null, blocked: false,
    resolve: vi.fn(() => Promise.resolve(project)), onError: vi.fn() };
}
function deferred() {
  let resolve!: (project: Project) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Project>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("controlled legacy ligand completion", () => {
  it("recognizes unopened entries in serial bounded pages with the active entry first", async () => {
    const project = legacy(25), input = ports(project);
    input.priorityEntryId = project.entries[24].id;
    const { rerender } = renderHook(value => useLegacyLigandResolution(value), { initialProps: input });
    await waitFor(() => expect(input.resolve).toHaveBeenCalledTimes(3));
    const calls = vi.mocked(input.resolve).mock.calls;
    expect(calls.map(call => call[1].length)).toEqual([1, 12, 12]);
    expect(calls[0][1]).toEqual([project.entries[24].id]);
    expect(new Set(calls.flatMap(call => call[1])).size).toBe(25);
    rerender({ ...input, project: { ...project, revision: project.revision + 1 } });
    await act(async () => { await Promise.resolve(); });
    expect(input.resolve).toHaveBeenCalledTimes(3);
  });

  it("waits for publication ownership without losing the initial queue", async () => {
    const input = ports(legacy(1));
    const { rerender } = renderHook(value => useLegacyLigandResolution(value), {
      initialProps: { ...input, blocked: true },
    });
    expect(input.resolve).not.toHaveBeenCalled();
    rerender(input);
    await waitFor(() => expect(input.resolve).toHaveBeenCalledOnce());
  });

  it("does not repeat failed input or Undo defaults during the same open epoch", async () => {
    const input = ports(legacy(1)), error = new Error("Current source could not be qualified");
    vi.mocked(input.resolve).mockRejectedValueOnce(error);
    const { rerender } = renderHook(value => useLegacyLigandResolution(value), { initialProps: input });
    await waitFor(() => expect(input.onError).toHaveBeenCalledWith(input.project!.id, error));
    rerender({ ...input, project: { ...input.project!, revision: 5 } });
    await act(async () => { await Promise.resolve(); });
    expect(input.resolve).toHaveBeenCalledOnce();
    rerender({ ...input, activeProjectId: null, project: undefined });
    rerender(input);
    await waitFor(() => expect(input.resolve).toHaveBeenCalledTimes(2));
  });

  it("serializes a held old-project request and never dispatches its remaining entries after a switch", async () => {
    const a = ports(legacy(13, "A")), b = ports(legacy(1, "B")), held = deferred();
    vi.mocked(a.resolve).mockReturnValueOnce(held.promise);
    const { rerender } = renderHook(value => useLegacyLigandResolution(value), { initialProps: a });
    await waitFor(() => expect(a.resolve).toHaveBeenCalledOnce());
    rerender(b);
    expect(b.resolve).not.toHaveBeenCalled();
    await act(async () => { held.resolve(a.project!); await held.promise; });
    await waitFor(() => expect(b.resolve).toHaveBeenCalledOnce());
    expect(a.resolve).toHaveBeenCalledOnce();
    expect(vi.mocked(b.resolve).mock.calls[0][1]).toEqual(["B-0"]);
  });

  it("does not initialize explicit Clear, stale intent or an already assessed unavailable state", async () => {
    const project = legacy(3);
    project.entries[0].ligand_designation = { ...unresolvedLigandDesignation(), status: "cleared" };
    project.entries[1].ligand_designation = { ...unresolvedLigandDesignation(), status: "not_applicable" };
    project.entries[2].ligand_designation = { ...unresolvedLigandDesignation(),
      resolver_version: "ligand-instance-v1", assessed_at: "2026-11-16T10:00:00Z" };
    const input = ports(project);
    renderHook(value => useLegacyLigandResolution(value), { initialProps: input });
    await act(async () => { await Promise.resolve(); });
    expect(input.resolve).not.toHaveBeenCalled();
  });

  it.each(["other project", "closed project"])("retires held errors after leaving and returning through %s", async transition => {
    const a = ports(legacy(1, "A")), held = deferred();
    vi.mocked(a.resolve).mockReturnValueOnce(held.promise);
    const { rerender } = renderHook(value => useLegacyLigandResolution(value), { initialProps: a });
    await waitFor(() => expect(a.resolve).toHaveBeenCalledOnce());
    const away = transition === "other project" ? ports(legacy(1, "B"))
      : { ...a, activeProjectId: null, project: undefined };
    rerender(away);
    rerender(a);
    await act(async () => { held.reject(new Error("Retired visit source failure")); await held.promise.catch(() => undefined); });
    await waitFor(() => expect(a.resolve).toHaveBeenCalledTimes(2));
    expect(a.onError).not.toHaveBeenCalled();
    expect(away.onError).not.toHaveBeenCalled();
  });
});
