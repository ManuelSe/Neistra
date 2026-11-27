import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Entry } from "../api/types";
import { LigandDesignationControls } from "../components/LigandDesignationControls";
import { ligandApi } from "../ligands/api";
import { currentDesignatedCandidate, inventoryOptions, LigandInventoryOwner, sourceKey, useDesignatedLigandContext, type DesignatedLigandContext } from "../ligands/presentation";
import type { LigandApi, LigandCandidate, LigandCandidatesRead, LigandDepictionRead } from "../ligands/types";
import { molecularEntry, molecularProject } from "./molecular-fixtures";

const cleanups: (() => void)[] = [];
const candidatesMock = vi.fn<LigandApi["candidates"]>();
const depictionMock = vi.fn<LigandApi["depiction"]>();
function entry(): Entry {
  const item = molecularEntry("entry-a", "Repeated complex", "complex");
  item.ligand_designation = { ...item.ligand_designation, status: "resolved", atom_ids: [201, 202],
    instance_id: "durable-instance-a", source_artifact_id: item.current_artifact_id, origin: "manual", selected_at: "2026-11-17T00:00:00Z" };
  return item;
}
function candidate(index = 20): LigandCandidate {
  return { candidate_key: `candidate-${index}`, atom_ids: [index * 10 + 1, index * 10 + 2], residue_ids: [index], component_ids: ["LIG"],
    label: "Repeated ligand", locations: [{ residue_id: index, residue_name: "LIG", author_number: 601, insertion_code: "A", chain_id: index,
      chain_name: `chain-${index}`, source_entity_id: "entity-1", source_asym_id: `asym-${index}` }],
    boundary_status: "qualified", potential_ligand: true, reason_codes: [], provenance: ["source_connectivity"], heavy_atom_count: 2,
    formal_charge: 0, formula: "C2H6O", molecular_weight: 46.069, chemistry_status: "qualified", chemistry_reason: null,
    chemical_input_hash: `chemical-${index}`, occurrence_count: 24, occurrence_basis: "qualified_representation_v1", occurrence_reason: null };
}
function inventory(item = entry(), offset = 0): LigandCandidatesRead {
  const all = Array.from({ length: 24 }, (_, index) => candidate(index + 1));
  return { project_id: "project-1", entry_id: item.id, artifact_id: item.current_artifact_id, designation: structuredClone(item.ligand_designation),
    resolver_version: "ligand-instance-v3", input_hash: `inventory-${item.current_artifact_id}`, offset, limit: 12, total: 24,
    candidates: all.slice(offset, offset + 12), selectable_candidate_keys: all.slice(offset, offset + 12).map(candidate => candidate.candidate_key),
    designated_candidate: all.find(candidate => candidate.atom_ids.join() === item.ligand_designation.atom_ids.join()) ?? null, warnings: [] };
}
function drawing(item: Entry, key: string): LigandDepictionRead {
  return { entry_id: item.id, artifact_id: item.current_artifact_id, candidate_key: key, status: "ready", reason: null,
    input_hash: key.replace("candidate", "chemical"), cache_key: key, implementation: "ligand-2d-v1", library_version: "pinned",
    formula: "C2H6O", molecular_weight: 46.069, formal_charge: 0, provenance: "source_connectivity",
    artifact: { id: `${item.current_artifact_id}-${key}`, filename: "ligand.svg", size: 100, sha256: "digest", media_type: "image/svg+xml", download_url: `/images/${item.current_artifact_id}-${key}.svg` } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
beforeEach(() => {
  candidatesMock.mockReset().mockImplementation((_id, item, offset) => Promise.resolve(inventory(item, offset)));
  vi.spyOn(ligandApi, "candidates").mockImplementation(candidatesMock);
  depictionMock.mockReset().mockImplementation((_id, item, key) => Promise.resolve(drawing(item, key)));
  vi.spyOn(ligandApi, "depiction").mockImplementation(depictionMock);
});
afterEach(() => { cleanup(); cleanups.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); });
function setup(item = entry(), strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), owner = new LigandInventoryOwner(client);
  cleanups.push(() => { owner.deactivate(); client.clear(); });
  let props = { project: molecularProject([item]), entryId: item.id as string | null, pausedReason: null as string | null, visible: true, depiction: true };
  let context!: DesignatedLigandContext;
  const onPublication = vi.fn(), onDesignate = vi.fn().mockResolvedValue("current");
  function Host() {
    useLayoutEffect(() => { owner.activate(); return () => owner.deactivate(); }, []);
    context = useDesignatedLigandContext({ ...props, owner, onPublication });
    return props.visible ? <LigandDesignationControls {...props} busy={false} onInspectEntry={() => {}} onDesignate={onDesignate}
      inventoryOwner={owner} context={context} informationHeader onPublication={onPublication} /> : null;
  }
  const tree = () => <QueryClientProvider client={client}><Tooltip.Provider>{strict ? <StrictMode><Host /></StrictMode> : <Host />}</Tooltip.Provider></QueryClientProvider>;
  const rendered = render(tree());
  return { client, owner, onPublication, onDesignate, context: () => context, props: () => props,
    update: (next: Partial<typeof props>) => act(() => { props = { ...props, ...next }; rendered.rerender(tree()); }), ...rendered };
}
const header = () => screen.getByRole("group", { name: "Designated ligand information" });
const image = () => within(header()).findByRole("img");

describe("exact designated ligand context", () => {
  it("uses the offset-zero designated instance beyond its first page, not the first same-label candidate", async () => {
    const app = setup(); await image();
    expect(within(header()).getByText("durable-instance-a")).toBeVisible();
    expect(within(header()).getByText("Chosen manually")).toBeVisible();
    expect(within(header()).getByText("C2H6O")).toBeVisible(); expect(within(header()).getByText("0", { exact: true })).toBeVisible();
    expect(app.context().candidate?.candidate_key).toBe("candidate-20");
    expect(app.context().inventory?.candidates.some(candidate => candidate.candidate_key === "candidate-20")).toBe(false);
    expect(candidatesMock).toHaveBeenCalledWith("project-1", expect.objectContaining({ id: "entry-a" }), 0, expect.any(AbortSignal));
    expect(depictionMock).toHaveBeenCalledWith("project-1", expect.objectContaining({ id: "entry-a" }), "candidate-20", expect.any(AbortSignal));
    expect(screen.getByText("LIG 601A · chain chain-20")).toBeVisible();
  });
  for (const mismatch of ["instance", "membership", "unsorted", "duplicates", "designation source", "designation visit", "artifact", "project", "entry", "policy", "offset"] as const) {
    it(`withholds a designated response with mismatched ${mismatch}`, () => {
      const item = entry(), project = molecularProject([item]), data = inventory(item);
      if (mismatch === "instance") data.designation.instance_id = "different-durable-instance";
      if (mismatch === "membership") data.designated_candidate!.atom_ids = [11, 12];
      if (mismatch === "unsorted") data.designated_candidate!.atom_ids = [202, 201];
      if (mismatch === "duplicates") data.designated_candidate!.atom_ids = [201, 201];
      if (mismatch === "designation source") data.designation.source_artifact_id = "older-source";
      if (mismatch === "designation visit") data.designation.selected_at = "2026-11-18T00:00:00Z";
      if (mismatch === "artifact") data.artifact_id = "other-current";
      if (mismatch === "project") data.project_id = "project-2";
      if (mismatch === "entry") data.entry_id = "entry-b";
      if (mismatch === "policy") data.resolver_version = "unsupported-policy";
      if (mismatch === "offset") data.offset = 12;
      expect(currentDesignatedCandidate(data, project, item)).toBeUndefined();
    });
  }
  it("retains a real source failure across responsive hiding, manual cache writes and chooser reopening until real success", async () => {
    const app = setup(); await image();
    candidatesMock.mockRejectedValueOnce(new ApiError(409, "artifact_integrity_error", "Source failed"));
    await act(async () => { await app.client.refetchQueries({ queryKey: ["ligand-candidates"] }); });
    expect(app.context().qualification.blocked).toBe(true); expect(within(header()).queryByRole("img")).toBeNull();
    const key = app.client.getQueryCache().find({ queryKey: ["ligand-candidates"], exact: false })!.queryKey;
    app.update({ visible: false }); act(() => { app.client.setQueryData(key, inventory()); }); app.update({ visible: true });
    expect(app.context().qualification.blocked).toBe(true); expect(within(header()).queryByText("C2H6O")).toBeNull();
    const checked = deferred<LigandCandidatesRead>(); candidatesMock.mockReturnValueOnce(checked.promise);
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    const dialog = await screen.findByRole("dialog"); expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
    await act(async () => { checked.resolve(inventory()); await checked.promise; });
    expect(await within(dialog).findAllByRole("radio")).toHaveLength(12); expect(app.context().qualification.blocked).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" })); await image();
  });
  it("does not trust a manual success timestamp that conceals a cached error before first owner activation", async () => {
    const client = new QueryClient(), item = entry(), project = molecularProject([item]), options = inventoryOptions(project, item, 0);
    cleanups.push(() => client.clear());
    await expect(client.fetchQuery({ ...options, retry: false, queryFn: () => Promise.reject(new Error("Failed current source")) })).rejects.toThrow();
    client.setQueryData(options.queryKey, inventory(item));
    const owner = new LigandInventoryOwner(client); cleanups.push(() => owner.deactivate()); owner.activate();
    expect(owner.qualification(sourceKey(project, item)).blocked).toBe(true);
    await client.fetchQuery({ ...options, staleTime: 0, queryFn: () => Promise.resolve(inventory(item)) });
    expect(owner.qualification(sourceKey(project, item)).blocked).toBe(false);
    owner.deactivate(); owner.activate(); expect(owner.qualification(sourceKey(project, item)).blocked).toBe(false);
  });
  it("fences errors missed during deactivation even if a manual write subsequently hides them", async () => {
    const app = setup(); await image(); app.owner.deactivate();
    candidatesMock.mockRejectedValueOnce(new Error("Failed while detached"));
    await act(async () => { await app.client.refetchQueries({ queryKey: ["ligand-candidates"] }); });
    const key = app.client.getQueryCache().find({ queryKey: ["ligand-candidates"], exact: false })!.queryKey;
    act(() => { app.client.setQueryData(key, inventory()); app.owner.activate(); });
    expect(app.context().qualification.blocked).toBe(true); expect(within(header()).queryByRole("img")).toBeNull();
  });
  for (const change of ["current", "original", "entry", "project"] as const) {
    it(`retires a held previous-source response during a ${change} source switch`, async () => {
      const app = setup(); await image();
      const previous = deferred<LigandCandidatesRead>(), current = deferred<LigandCandidatesRead>();
      candidatesMock.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
      let refetch!: Promise<void>;
      act(() => { refetch = app.client.refetchQueries({ queryKey: ["ligand-candidates"] }); });
      await waitFor(() => expect(candidatesMock).toHaveBeenCalledTimes(2));
      const next = structuredClone(app.props().project), item = next.entries[0];
      if (change === "current") { item.current_artifact_id = "current-new"; item.ligand_designation.source_artifact_id = item.current_artifact_id; }
      if (change === "original") item.original_artifact_id = "original-new";
      if (change === "entry") item.id = "entry-b";
      if (change === "project") next.id = "project-2";
      app.update({ project: next, entryId: item.id });
      await waitFor(() => expect(candidatesMock).toHaveBeenCalledTimes(3));
      expect(within(header()).queryByRole("img")).toBeNull(); expect(within(header()).queryByText("C2H6O")).toBeNull();
      await act(async () => { previous.resolve(inventory()); await refetch; });
      expect(within(header()).queryByRole("img")).toBeNull(); expect(within(header()).queryByText("C2H6O")).toBeNull();
      const response = inventory(item); response.project_id = next.id;
      await act(async () => { current.resolve(response); await current.promise; });
      await image(); expect(app.context().entry?.original_artifact_id).toBe(item.original_artifact_id);
      expect(depictionMock.mock.calls.at(-1)?.[1].original_artifact_id).toBe(item.original_artifact_id);
    });
  }

  it("hides composition/images in preview and restores only matching committed data on Cancel", async () => {
    const app = setup(); await image(); const requests = depictionMock.mock.calls.length;
    app.update({ pausedReason: "Finish the current preview." });
    expect(within(header()).queryByRole("img")).toBeNull(); expect(within(header()).queryByText("C2H6O")).toBeNull();
    expect(within(header()).getByText("Composition unavailable during preview.")).toBeVisible();
    app.update({ pausedReason: null }); await image(); expect(depictionMock).toHaveBeenCalledTimes(requests);
  });
  it("keeps matching A data after an A-to-B-to-A visit and never presents a held B completion", async () => {
    const app = setup(); const original = await image(), originalUrl = original.getAttribute("src");
    const held = deferred<LigandCandidatesRead>(); candidatesMock.mockReturnValueOnce(held.promise);
    const next = structuredClone(app.props().project); next.entries[0].current_artifact_id = "artifact-b"; next.entries[0].ligand_designation.source_artifact_id = "artifact-b";
    const initial = app.props().project; app.update({ project: next });
    await waitFor(() => expect(candidatesMock).toHaveBeenCalledTimes(2));
    expect(within(header()).queryByRole("img")).toBeNull(); app.update({ project: initial });
    expect((await image()).getAttribute("src")).toBe(originalUrl);
    const other = inventory(next.entries[0]); other.designated_candidate!.formula = "C999";
    await act(async () => { held.resolve(other); await held.promise; });
    expect(within(header()).queryByText("C999")).toBeNull(); expect((await image()).getAttribute("src")).toBe(originalUrl);
  });
  it("shares the existing exact depiction key with the chooser without a second image request", async () => {
    const item = entry(); item.ligand_designation.atom_ids = [11, 12]; setup(item); await image();
    await userEvent.click(screen.getByRole("button", { name: "Change" })); await within(screen.getByRole("dialog")).findAllByRole("img");
    await waitFor(() => expect(depictionMock).toHaveBeenCalledTimes(12));
    expect(depictionMock.mock.calls.filter(call => call[2] === "candidate-1")).toHaveLength(1);
  });
  it("keeps depiction work lazy across hidden source changes and resumes the matching source on reopen", async () => {
    const app = setup(); await image(); const requests = depictionMock.mock.calls.length;
    app.update({ visible: false, depiction: false });
    const next = structuredClone(app.props().project); next.entries[0].current_artifact_id = "current-hidden"; next.entries[0].ligand_designation.source_artifact_id = "current-hidden";
    app.update({ project: next }); await waitFor(() => expect(app.context().candidate).toBeDefined());
    expect(depictionMock).toHaveBeenCalledTimes(requests);
    app.update({ visible: true, depiction: true }); await image();
    expect(depictionMock.mock.calls.at(-1)?.[1].current_artifact_id).toBe("current-hidden");
    const second = structuredClone(next); second.entries[0].current_artifact_id = "current-hidden-again"; second.entries[0].ligand_designation.source_artifact_id = "current-hidden-again";
    app.update({ visible: false, depiction: false, project: second }); await waitFor(() => expect(app.context().candidate).toBeDefined());
    expect(depictionMock).toHaveBeenCalledTimes(requests + 1);
  });
  it("signals image-local state changes before DOM publication and recovers the same artifact with a fresh load token", async () => {
    const app = setup(); const first = await image(), events: string[] = [];
    app.onPublication.mockImplementation(() => { events.push(header().querySelector("img")?.getAttribute("src") ?? "no image"); });
    fireEvent.error(first); expect(events).toEqual([first.getAttribute("src")]);
    expect(within(header()).queryByRole("img")).toBeNull();
    await userEvent.click(within(header()).getByRole("button", { name: "Retry 2D" }));
    expect(screen.getByRole("button", { name: "Change" })).toHaveFocus();
    const retried = await image(); expect(events[1]).toBe("no image"); expect(retried.getAttribute("src")).toContain("neistra_image_retry=");
    fireEvent.load(retried); expect(app.onPublication).toHaveBeenCalledTimes(3);
    expect(within(header()).getByRole("status")).toHaveTextContent("2D loaded for designated ligand.");
    expect(depictionMock).toHaveBeenCalledTimes(1);
  });
  it("preserves source qualification and image work through StrictMode replay", async () => {
    const app = setup(entry(), true); await image(); expect(app.context().qualification.blocked).toBe(false);
    expect(screen.getByRole("button", { name: "Change" })).toBeEnabled();
  });
});

describe("current source pointer and inventory start barriers", () => {
  for (const pointer of ["stale", "null", "missing"] as const) {
    it(`withholds formula/image when stored and response designation agree on a ${pointer} source pointer`, async () => {
      const item = entry();
      if (pointer === "stale") item.ligand_designation.source_artifact_id = "older-artifact";
      if (pointer === "null") item.ligand_designation.source_artifact_id = null;
      if (pointer === "missing") delete (item.ligand_designation as Partial<typeof item.ligand_designation>).source_artifact_id;
      const app = setup(item);
      await waitFor(() => expect(app.context().inventory).toBeDefined());
      expect(app.context().inventory?.designation.source_artifact_id).toBe(item.ligand_designation.source_artifact_id);
      expect(app.context().inventory?.artifact_id).toBe(item.current_artifact_id);
      expect(app.context().candidate).toBeUndefined(); expect(within(header()).queryByText("C2H6O")).toBeNull();
      expect(within(header()).queryByRole("img")).toBeNull(); expect(depictionMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Change" })).toBeEnabled();
    });
  }
  it("cannot restore header formula/image from a held earlier check after a newer shared-page failure", async () => {
    const app = setup(); await image(); const older = deferred<LigandCandidatesRead>(); candidatesMock.mockReturnValueOnce(older.promise);
    let oldCheck!: Promise<void>;
    act(() => { oldCheck = app.client.refetchQueries({ queryKey: ["ligand-candidates"] }); });
    await waitFor(() => expect(candidatesMock).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Change" })); const dialog = screen.getByRole("dialog");
    await within(dialog).findAllByRole("radio"); candidatesMock.mockRejectedValueOnce(new ApiError(409, "artifact_integrity_error", "Newer source failure"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Next ligand page" })); await within(dialog).findByRole("alert");
    expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await act(async () => { older.resolve(inventory()); await oldCheck; });
    expect(within(header()).queryByText("C2H6O")).toBeNull(); expect(within(header()).queryByRole("img")).toBeNull();
    const query = app.client.getQueryCache().findAll({ queryKey: ["ligand-candidates"] }).find(query => query.queryKey[9] === 0)!;
    act(() => { query.setData(inventory()); });
    app.update({ visible: false }); act(() => { app.client.setQueryData(query.queryKey, inventory()); }); app.update({ visible: true });
    expect(within(header()).queryByText("C2H6O")).toBeNull(); expect(within(header()).queryByRole("img")).toBeNull();
    const fresh = deferred<LigandCandidatesRead>(); candidatesMock.mockReturnValueOnce(fresh.promise);
    await userEvent.click(within(header()).getByRole("button", { name: "Retry ligand information" }));
    expect(within(header()).queryByText("C2H6O")).toBeNull();
    await act(async () => { fresh.resolve(inventory()); await fresh.promise; });
    await image(); expect(within(header()).getByText("C2H6O")).toBeVisible(); expect(app.context().qualification.blocked).toBe(false);
  });
});
