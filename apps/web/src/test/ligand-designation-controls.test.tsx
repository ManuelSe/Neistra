import * as Tooltip from "@radix-ui/react-tooltip";
import { StrictMode } from "react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../api/types";
import { ApiError } from "../api/client";
import { LigandDesignationControls } from "../components/LigandDesignationControls";
import { ligandApi } from "../ligands/api";
import type { LigandApi, LigandCandidate, LigandCandidatesRead, LigandDepictionRead } from "../ligands/types";
import { molecularEntry, molecularProject } from "./molecular-fixtures";

const clients: QueryClient[] = [];
const candidatesMock = vi.fn<LigandApi["candidates"]>();
const depictionMock = vi.fn<LigandApi["depiction"]>();
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
const entry = () => molecularEntry("entry-a", "Complex", "complex");
function resolvedEntry() {
  const owner = entry();
  owner.ligand_designation = { ...owner.ligand_designation, status: "resolved", atom_ids: [11, 12],
    instance_id: "intent-a", origin: "manual", selected_at: "2026-11-16T00:00:00Z",
    source_artifact_id: owner.current_artifact_id };
  return owner;
}
function candidate(id: number): LigandCandidate {
  return { candidate_key: `candidate-${id}`, atom_ids: [id * 10 + 1, id * 10 + 2],
    residue_ids: [id], component_ids: [`component-${id}`], label: "ATP", locations: [{
      residue_id: id, residue_name: "ATP", chain_id: id, chain_name: id % 2 ? "A" : "B",
      author_number: 601, insertion_code: id === 2 ? "A" : null,
      source_entity_id: null, source_asym_id: null,
    }], boundary_status: "qualified", potential_ligand: true, reason_codes: [],
    provenance: ["source_connectivity"], heavy_atom_count: 2, formal_charge: -1,
    formula: `C${id}H2`, molecular_weight: 42 + id, chemistry_status: "qualified",
    chemistry_reason: null, chemical_input_hash: `chemical-${id}`,
    occurrence_count: null, occurrence_basis: null, occurrence_reason: "occurrence_count_not_qualified" };
}
function inventory(owner: Entry, offset = 0, count = 2): LigandCandidatesRead {
  const all = Array.from({ length: count }, (_, index) => candidate(index + 1));
  return { project_id: "project-1", entry_id: owner.id, artifact_id: owner.current_artifact_id,
    designation: owner.ligand_designation, input_hash: "exact-inventory-hash", resolver_version: "ligand-instance-v3",
    total: count, offset, limit: 12, candidates: all.slice(offset, offset + 12),
    selectable_candidate_keys: all.slice(offset, offset + 12).map(item => item.candidate_key),
    designated_candidate: owner.ligand_designation.status === "resolved" ? all[0] : null, warnings: [] };
}
function drawing(owner: Entry, key: string, suffix = key): LigandDepictionRead {
  return { entry_id: owner.id, artifact_id: owner.current_artifact_id, candidate_key: key,
    status: "ready", reason: null, input_hash: `chemical-${key.replace("candidate-", "")}`, cache_key: key,
    artifact: { id: suffix, filename: "ligand.svg", media_type: "image/svg+xml", sha256: "digest",
      size: 100, download_url: `/artifact/${suffix}.svg` }, implementation: "ligand-2d-v1",
    library_version: "pinned", formula: "C2H6O", molecular_weight: 46, formal_charge: 0, provenance: "source" };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(owner = entry(), extras: Partial<Parameters<typeof LigandDesignationControls>[0]> = {}, strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const props = { project: molecularProject([owner]), entryId: owner.id,
    onInspectEntry: vi.fn(), pausedReason: null, busy: false, onDesignate: vi.fn().mockResolvedValue(undefined), ...extras };
  const view = (next: typeof props) => {
    const content = <QueryClientProvider client={client}><Tooltip.Provider>
      <LigandDesignationControls {...next} />
    </Tooltip.Provider></QueryClientProvider>;
    return strict ? <StrictMode>{content}</StrictMode> : content;
  };
  const rendered = render(view(props));
  return { ...rendered, client, props, update: (next: typeof props) => rendered.rerender(view(next)) };
}
beforeEach(() => {
  candidatesMock.mockReset().mockImplementation((_project, owner, offset) => Promise.resolve(inventory(owner, offset)));
  depictionMock.mockReset().mockImplementation((_project, owner, key) => Promise.resolve(drawing(owner, key)));
  vi.spyOn(ligandApi, "candidates").mockImplementation(candidatesMock);
  vi.spyOn(ligandApi, "depiction").mockImplementation(depictionMock);
});

describe("entry-owned ligand designation controls", () => {
  it("shows server-qualified occurrence counts and bases without equating same-label cards", async () => {
    const user = userEvent.setup(), owner = entry(), page = inventory(owner);
    page.candidates[0] = { ...page.candidates[0], occurrence_count: 7,
      occurrence_basis: "qualified_representation_v1", occurrence_reason: null };
    page.candidates[1] = { ...page.candidates[1], occurrence_count: 2,
      occurrence_basis: "verified_source_entity_v1", occurrence_reason: null,
      chemical_input_hash: page.candidates[0].chemical_input_hash };
    candidatesMock.mockResolvedValue(page);
    const { props } = setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAccessibleName("ATP · ATP 601 · chain A · instance 1");
    expect(radios[1]).toHaveAccessibleName("ATP · ATP 601A · chain B · instance 2");
    expect(within(radios[0].closest("article")!).getByText("7 matching representations in this entry")).toBeVisible();
    expect(within(radios[1].closest("article")!).getByText("2 source instances in this entry")).toBeVisible();
    await user.click(radios[1]);
    await user.click(screen.getByRole("button", { name: "Use ligand" }));
    expect(props.onDesignate).toHaveBeenCalledWith(owner, "candidate-2", "exact-inventory-hash", expect.any(Function));
  });

  it("retains complete server occurrence counts across candidate page boundaries", async () => {
    const user = userEvent.setup();
    candidatesMock.mockImplementation((_project, owner, offset) => {
      const page = inventory(owner, offset, 13);
      page.candidates = page.candidates.map(item => item.candidate_key === "candidate-1" || item.candidate_key === "candidate-13"
        ? { ...item, occurrence_count: 2, occurrence_basis: "qualified_representation_v1", occurrence_reason: null } : item);
      return Promise.resolve(page);
    });
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("2 matching representations in this entry")).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(12);
    await user.click(screen.getByRole("button", { name: "Next ligand page" }));
    const radio = await screen.findByRole("radio", { name: /instance 13$/ });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByText("2 matching representations in this entry")).toBeVisible();
    await user.click(radio);
    await user.click(screen.getByRole("button", { name: "Use ligand" }));
    expect(props.onDesignate).toHaveBeenCalledWith(expect.anything(), "candidate-13", "exact-inventory-hash", expect.any(Function));
  });

  it("keeps exact choice usable when both occurrence count and depiction are unavailable", async () => {
    const user = userEvent.setup(), owner = entry(), page = inventory(owner);
    page.candidates = [page.candidates[0]];
    page.total = 1; page.selectable_candidate_keys = ["candidate-1"];
    page.candidates[0] = { ...page.candidates[0], occurrence_count: null,
      occurrence_basis: null, occurrence_reason: "occurrence_count_not_qualified",
      chemistry_status: "unavailable", chemistry_reason: "chemical_representation_not_qualified",
      formula: null, molecular_weight: null, formal_charge: null, chemical_input_hash: null };
    candidatesMock.mockResolvedValue(page);
    depictionMock.mockRejectedValue(new Error("Image transport failed"));
    const { props } = setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const radio = await screen.findByRole("radio");
    const card = radio.closest("article")!;
    expect(within(card).getByText("Occurrence count unavailable")).toBeVisible();
    expect(await within(card).findByText("2D could not be loaded")).toBeVisible();
    expect(radio).toBeEnabled();
    await user.click(within(card).getByText("Instance details"));
    expect(within(card).getByText("An entry-wide occurrence count could not be qualified for this instance.")).toBeVisible();
    await user.click(radio); await user.click(screen.getByRole("button", { name: "Use ligand" }));
    expect(props.onDesignate).toHaveBeenCalledWith(owner, "candidate-1", "exact-inventory-hash", expect.any(Function));
  });

  it("retires known occurrence counts during preview and failed current input checks", async () => {
    const user = userEvent.setup(), owner = entry(), page = inventory(owner);
    page.candidates[0] = { ...page.candidates[0], occurrence_count: 3,
      occurrence_basis: "qualified_representation_v1", occurrence_reason: null };
    candidatesMock.mockResolvedValue(page);
    const { props, update, client } = setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("3 matching representations in this entry")).toBeVisible();
    update({ ...props, pausedReason: "Finish preview first." });
    expect(screen.queryByText("3 matching representations in this entry")).not.toBeInTheDocument();
    expect(screen.getAllByText("Occurrence count unavailable during preview")).toHaveLength(2);
    update(props);
    expect(await screen.findByText("3 matching representations in this entry")).toBeVisible();
    candidatesMock.mockRejectedValue(new ApiError(409, "artifact_integrity_error", "Source failed"));
    await act(async () => { await client.refetchQueries({ queryKey: ["ligand-candidates"] }); });
    await waitFor(() => expect(screen.queryByText("3 matching representations in this entry")).not.toBeInTheDocument());
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
  });

  it("does not reuse a constructed candidate cache key from before occurrence qualification", async () => {
    const user = userEvent.setup(), owner = entry(), fresh = inventory(owner), old = inventory(owner);
    fresh.candidates[0] = { ...fresh.candidates[0], occurrence_count: 5,
      occurrence_basis: "qualified_representation_v1", occurrence_reason: null };
    candidatesMock.mockResolvedValue(fresh);
    const { client } = setup(owner);
    const value = owner.ligand_designation;
    const designation = JSON.stringify([value.status, value.instance_id, value.origin, value.selected_at,
      value.resolver_version, value.assessed_at, value.assessed_revision]);
    // A constructed historical-key control, not an actual old producer run.
    client.setQueryData(["ligand-candidates", "ligand-instance-v3", "project-1", owner.id,
      owner.current_artifact_id, owner.original_artifact_id, "ligand-exact-representation-v2", designation, 0, 12], old);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("5 matching representations in this entry")).toBeVisible();
    expect(candidatesMock).toHaveBeenCalledOnce();
    expect(client.getQueryCache().findAll({ queryKey: ["ligand-candidates"] })).toHaveLength(2);
  });

  it("keeps a declared singular occurrence visible after a depiction transport failure", async () => {
    const user = userEvent.setup(), owner = entry(), page = inventory(owner);
    page.candidates = [{ ...page.candidates[0], occurrence_count: 1,
      occurrence_basis: "qualified_representation_v1", occurrence_reason: null }];
    page.total = 1; page.selectable_candidate_keys = ["candidate-1"];
    candidatesMock.mockResolvedValue(page); depictionMock.mockRejectedValue(new Error("Drawing unavailable"));
    setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("2D could not be loaded")).toBeVisible();
    expect(screen.getByText("1 matching representation in this entry")).toBeVisible();
    expect(screen.getByRole("radio")).toBeEnabled();
    await user.click(screen.getByRole("radio"));
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeEnabled();
  });

  it("withholds an unqualified count and gives a generic secondary reason for an unknown code", async () => {
    const user = userEvent.setup(), owner = entry(), page = inventory(owner);
    page.candidates = [{ ...page.candidates[0], occurrence_count: 1, occurrence_basis: null,
      occurrence_reason: "future_internal_occurrence_policy" }];
    page.total = 1; page.selectable_candidate_keys = ["candidate-1"];
    candidatesMock.mockResolvedValue(page); setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("Occurrence count unavailable")).toBeVisible();
    expect(screen.queryByText("1 matching representation in this entry")).not.toBeInTheDocument();
    expect(screen.queryByText("1 source instance in this entry")).not.toBeInTheDocument();
    await user.click(screen.getByText("Instance details"));
    expect(screen.getByText("An entry-wide occurrence count could not be qualified for this instance.")).toBeVisible();
    expect(screen.queryByText("future_internal_occurrence_policy")).not.toBeInTheDocument();
    expect(screen.getByRole("radio")).toBeEnabled();
  });

  it("keeps a busy occurrence count unavailable without implying a scheduled calculation", async () => {
    const user = userEvent.setup(), owner = entry(), page = inventory(owner);
    page.candidates = [{ ...page.candidates[0], occurrence_count: null, occurrence_basis: null,
      occurrence_reason: "occurrence_work_busy" }];
    page.total = 1; page.selectable_candidate_keys = ["candidate-1"];
    candidatesMock.mockResolvedValue(page); setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("Occurrence count unavailable")).toBeVisible();
    await user.click(screen.getByText("Instance details"));
    expect(screen.getByText("Other molecular work prevented this occurrence count.")).toBeVisible();
    expect(screen.getByRole("radio")).toBeEnabled();
  });

  it.each(["occurrence_work_busy", "occurrence_work_limit"])("retries %s once on the current page without changing the chosen instance or drawing", async reason => {
    const user = userEvent.setup(), owner = entry();
    const page = (offset: number, ready = false) => {
      const value = inventory(owner, offset, 13);
      value.candidates = value.candidates.map(item => ({ ...item, occurrence_count: ready ? 2 : null,
        occurrence_basis: ready ? "qualified_representation_v1" : null, occurrence_reason: ready ? null : reason }));
      return value;
    };
    candidatesMock.mockImplementation((_project, _entry, offset) => Promise.resolve(page(offset)));
    const { client, props } = setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await screen.findAllByRole("radio");
    await user.click(screen.getByRole("button", { name: "Next ligand page" }));
    const radio = await screen.findByRole("radio", { name: /instance 13$/ });
    await user.click(radio);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const held = deferred<LigandCandidatesRead>();
    candidatesMock.mockReturnValueOnce(held.promise);
    const before = candidatesMock.mock.calls.length, drawings = depictionMock.mock.calls.length;
    const retry = screen.getByRole("button", { name: "Retry counts" });
    retry.focus();
    act(() => { fireEvent.click(retry); fireEvent.click(retry); });
    await waitFor(() => expect(candidatesMock).toHaveBeenCalledTimes(before + 1));
    expect(retry).toBeDisabled(); expect(radio).toBeChecked(); expect(radio).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeEnabled();
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
    await act(async () => { held.resolve(page(12, true)); await held.promise; });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry counts" })).toBeNull());
    expect(screen.getByText("2 matching representations in this entry")).toBeVisible();
    expect(radio).toBeChecked(); await waitFor(() => expect(radio).toHaveFocus());
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
    expect(depictionMock).toHaveBeenCalledTimes(drawings);
    expect(candidatesMock).toHaveBeenCalledTimes(before + 1); expect(props.onDesignate).not.toHaveBeenCalled();
  });

  it.each(["occurrence_work_busy", "occurrence_work_limit", "occurrence_representation_incomplete"])("reopens %s with only transient count metadata becoming stale", async reason => {
    const user = userEvent.setup(), owner = entry(), first = inventory(owner);
    first.candidates = first.candidates.map(item => ({ ...item, occurrence_count: null, occurrence_basis: null, occurrence_reason: reason }));
    const known = inventory(owner);
    known.candidates = known.candidates.map(item => ({ ...item, occurrence_count: 2,
      occurrence_basis: "qualified_representation_v1", occurrence_reason: null }));
    candidatesMock.mockResolvedValue(first); setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" })); await screen.findAllByRole("radio");
    expect(candidatesMock).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    candidatesMock.mockResolvedValue(known);
    await user.click(screen.getByRole("button", { name: "Choose" })); await screen.findAllByRole("radio");
    if (reason === "occurrence_representation_incomplete") {
      expect(candidatesMock).toHaveBeenCalledOnce();
      expect(screen.getAllByText("Occurrence count unavailable")).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Retry counts" })).toBeNull();
    } else {
      await waitFor(() => expect(candidatesMock).toHaveBeenCalledTimes(2));
      expect(await screen.findAllByText("2 matching representations in this entry")).toHaveLength(2);
    }
  });

  it("does not steal focus moved elsewhere while an occurrence retry completes", async () => {
    const user = userEvent.setup(), owner = entry(), first = inventory(owner), held = deferred<LigandCandidatesRead>();
    first.candidates.forEach(item => { item.occurrence_reason = "occurrence_work_busy"; });
    candidatesMock.mockResolvedValue(first); setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" })); await screen.findAllByRole("radio");
    candidatesMock.mockReturnValueOnce(held.promise);
    await user.click(screen.getByRole("button", { name: "Retry counts" }));
    const cancel = screen.getByRole("button", { name: "Cancel" }); cancel.focus();
    const known = inventory(owner); known.candidates.forEach(item => {
      item.occurrence_count = 2; item.occurrence_basis = "qualified_representation_v1"; item.occurrence_reason = null;
    });
    await act(async () => { held.resolve(known); await held.promise; });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry counts" })).toBeNull());
    expect(cancel).toHaveFocus();
  });

  it.each(["preview", "source", "page"])("retires occurrence retry feedback and focus across a %s visit", async transition => {
    const user = userEvent.setup(), owner = entry(), held = deferred<LigandCandidatesRead>();
    const busyPage = (source: Entry, offset: number) => {
      const value = inventory(source, offset, 25);
      value.candidates.forEach(item => { item.occurrence_reason = "occurrence_work_busy"; });
      return value;
    };
    candidatesMock.mockImplementation((_project, source, offset) => Promise.resolve(busyPage(source, offset)));
    const { props, update } = setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" })); await screen.findAllByRole("radio");
    candidatesMock.mockReturnValueOnce(held.promise);
    await user.click(screen.getByRole("button", { name: "Retry counts" }));
    if (transition === "preview") {
      update({ ...props, pausedReason: "Changed chemistry preview" }); update(props);
    } else if (transition === "source") {
      const next = { ...owner, current_artifact_id: "replacement-source" };
      update({ ...props, project: { ...props.project, entries: [next] } });
      await user.click(screen.getByRole("button", { name: "Choose" }));
    } else await user.click(screen.getByRole("button", { name: "Next ligand page" }));
    const heading = screen.getByRole("heading", { name: "Choose ligand of interest" }); heading.focus();
    const known = inventory(owner); known.candidates.forEach(item => {
      item.occurrence_count = 2; item.occurrence_basis = "qualified_representation_v1"; item.occurrence_reason = null;
    });
    await act(async () => { held.resolve(known); await held.promise; });
    expect(heading).toHaveFocus();
    expect(screen.queryByText("Occurrence counts updated.")).not.toBeInTheDocument();
    if (transition === "source" || transition === "page") {
      expect(screen.queryByText("2 matching representations in this entry")).not.toBeInTheDocument();
    }
  });

  it("retires cached known counts after a failed retry without publishing a success notice", async () => {
    const user = userEvent.setup(), owner = entry(), first = inventory(owner), held = deferred<LigandCandidatesRead>();
    first.candidates[0] = { ...first.candidates[0], occurrence_count: 3,
      occurrence_basis: "qualified_representation_v1", occurrence_reason: null };
    first.candidates[1].occurrence_reason = "occurrence_work_busy";
    candidatesMock.mockResolvedValue(first); setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("3 matching representations in this entry")).toBeVisible();
    candidatesMock.mockReturnValueOnce(held.promise);
    await user.click(screen.getByRole("button", { name: "Retry counts" }));
    await act(async () => { held.reject(new ApiError(409, "artifact_integrity_error", "Invalid current input")); await held.promise.catch(() => undefined); });
    await waitFor(() => expect(screen.queryByText("3 matching representations in this entry")).not.toBeInTheDocument());
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(screen.queryByText("Occurrence counts updated.")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("could not be verified");
  });

  it("recovers an image download failure with a fresh same-artifact request and preserves the choice", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const original = (await screen.findAllByRole("img"))[0];
    const card = original.closest("article")!;
    const originalUrl = original.getAttribute("src")!;
    const radio = within(card).getByRole("radio");
    const status = within(card).getByRole("status");
    expect(status).toBeEmptyDOMElement();
    fireEvent.load(original);
    expect(status).toBeEmptyDOMElement();
    await user.click(radio);
    fireEvent.error(original);
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
    expect(within(card).getByText("2D could not be loaded")).toBeVisible();
    expect(within(card).getByText("C1H2")).toBeVisible();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent(`Retry 2D is available for ${radio.getAttribute("aria-label")}`);
    expect(radio).toBeChecked(); expect(radio).toBeEnabled();
    await user.click(within(card).getByRole("button", { name: "Retry 2D" }));
    expect(status).toHaveTextContent(`Retrying 2D for ${radio.getAttribute("aria-label")}`);
    const retried = await within(card).findByRole("img");
    expect(radio).toHaveFocus();
    expect(retried).not.toBe(original);
    const retryUrl = new URL(retried.getAttribute("src")!, window.location.href);
    expect(retryUrl.pathname).toBe(new URL(originalUrl, window.location.href).pathname);
    expect(retried.getAttribute("src")).not.toBe(originalUrl);
    fireEvent.error(original);
    fireEvent.load(original);
    expect(status).toHaveTextContent("Retrying 2D for");
    fireEvent.load(retried);
    expect(status).toHaveTextContent(`2D loaded for ${radio.getAttribute("aria-label")}`);
    expect(within(card).getByRole("img")).toBe(retried);
    expect(within(card).queryByText("2D could not be loaded")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Retry 2D" })).not.toBeInTheDocument();
    expect(radio).toBeChecked();
    expect(props.onDesignate).not.toHaveBeenCalled();
    expect(depictionMock).toHaveBeenCalledTimes(2);
  });

  it.each(["preview", "source", "page"])("retires image errors across a %s visit", async transition => {
    const user = userEvent.setup(), owner = entry();
    candidatesMock.mockImplementation((_project, item, offset) => Promise.resolve(inventory(item, offset, 25)));
    const { props, update } = setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const original = (await screen.findAllByRole("img"))[0];
    fireEvent.error(original);
    expect(screen.getByText("2D could not be loaded")).toBeVisible();
    if (transition === "preview") {
      update({ ...props, pausedReason: "Changed chemistry preview" });
      fireEvent.error(original);
      update(props);
    } else if (transition === "source") {
      const changed = { ...owner, current_artifact_id: "changed-source" };
      update({ ...props, project: molecularProject([changed]) });
      fireEvent.error(original);
      await user.click(screen.getByRole("button", { name: "Choose" }));
    } else {
      await user.click(screen.getByRole("button", { name: "Next ligand page" }));
      await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeVisible());
      fireEvent.error(original);
      await user.click(screen.getByRole("button", { name: "Previous ligand page" }));
    }
    const current = (await screen.findAllByRole("img"))[0];
    fireEvent.error(original);
    fireEvent.load(original);
    expect(current).toBeInTheDocument();
    expect(screen.queryByText("2D could not be loaded")).not.toBeInTheDocument();
    expect(screen.queryByText(/Retry 2D is available for|Retrying 2D for|2D loaded for/)).not.toBeInTheDocument();
    expect(props.onDesignate).not.toHaveBeenCalled();
  });

  it("does not announce recovery when a failed retry later emits a load event", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const original = (await screen.findAllByRole("img"))[0], card = original.closest("article")!;
    const status = within(card).getByRole("status");
    fireEvent.error(original);
    await user.click(within(card).getByRole("button", { name: "Retry 2D" }));
    const retried = within(card).getByRole("img");
    fireEvent.error(retried); fireEvent.load(retried);
    expect(status).toHaveTextContent("Retry 2D is available for");
    expect(status).not.toHaveTextContent("2D loaded for");
    expect(within(card).getByText("2D could not be loaded")).toBeVisible();
    expect(props.onDesignate).not.toHaveBeenCalled();
  });

  it("retires a cached image when its metadata recheck fails and retries without changing designation", async () => {
    const user = userEvent.setup();
    const { client, props } = setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const image = (await screen.findAllByRole("img"))[0], card = image.closest("article")!;
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const query = client.getQueryCache().findAll({ queryKey: ["ligand-depiction"] }).find(item =>
      (item.state.data as LigandDepictionRead | undefined)?.candidate_key === "candidate-1");
    expect(query).toBeDefined();
    depictionMock.mockRejectedValueOnce(new Error("Drawing metadata transport failed"));
    await act(async () => { await client.refetchQueries({ queryKey: query!.queryKey, exact: true }); });
    expect(query!.state.status).toBe("error");
    await waitFor(() => expect(within(card).queryByRole("img")).not.toBeInTheDocument());
    expect(within(card).getByText("2D could not be loaded")).toBeVisible();
    expect(within(card).getByText("C1H2")).toBeVisible();
    await user.click(within(card).getByRole("button", { name: "Retry 2D" }));
    expect(await within(card).findByRole("img")).toBeVisible();
    expect(props.onDesignate).not.toHaveBeenCalled();
  });

  it("shows canonical sites for an unknown heavy count and keeps a known zero distinct", async () => {
    const user = userEvent.setup(), owner = entry();
    const page = inventory(owner);
    page.candidates[0].heavy_atom_count = null;
    page.candidates[0].chemistry_status = "unavailable";
    page.candidates[0].chemistry_reason = "query_or_dummy_representation_unsupported";
    page.candidates[0].formula = null;
    page.candidates[0].molecular_weight = null;
    page.candidates[0].formal_charge = null;
    page.candidates[0].chemical_input_hash = null;
    page.candidates[1].heavy_atom_count = 0;
    page.candidates[1].formula = "H2";
    page.candidates[1].molecular_weight = 2.016;
    page.candidates[1].formal_charge = 0;
    candidatesMock.mockResolvedValue(page);
    setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("2 atom sites")).toBeVisible();
    expect(screen.getByText(/0 heavy atoms/)).toBeVisible();
  });
  it.each(["ligand-instance-v1", "ligand-instance-v2"])("does not display or commit inventory from resolver policy %s", async policy => {
    const user = userEvent.setup(), owner = resolvedEntry();
    candidatesMock.mockImplementation(() => Promise.resolve({ ...inventory(owner), resolver_version: policy }));
    const { client } = setup(owner);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByText("Ligand designated")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
    expect(within(dialog).getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(within(dialog).queryByText("C1H2")).not.toBeInTheDocument();
  });
  it.each(["stale", "unresolved"] as const)("explains an unverifiable original for a %s choice without a background duplicate announcement", async status => {
    const user = userEvent.setup();
    const owner = status === "stale" ? resolvedEntry() : entry();
    owner.ligand_designation = { ...owner.ligand_designation, status,
      reason_code: "original_ligand_source_unavailable" };
    candidatesMock.mockRejectedValue(new ApiError(409, "artifact_integrity_error", "Internal artifact details"));
    const { container, props } = setup(owner);
    const message = "The original file could not be verified. Reimport the structure, then choose the new entry.";
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(candidatesMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: status === "stale" ? "Change" : "Choose" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(container.querySelector(".ligand-designation-controls > .ligand-candidate-warning"))
      .not.toHaveAttribute("role");
    expect(screen.queryByText("Internal artifact details")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(props.onDesignate).not.toHaveBeenCalled();
  });

  it("explains a changed instance while keeping review and Clear available", async () => {
    const user = userEvent.setup();
    const owner = resolvedEntry();
    owner.ligand_designation = { ...owner.ligand_designation, status: "stale",
      reason_code: "designated_instance_split_or_ambiguous" };
    setup(owner);
    const message = "The structure changed and this ligand choice needs review. Choose an instance again or clear the choice.";
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findAllByRole("radio")).toHaveLength(2);
    expect(within(screen.getByRole("dialog")).getByText(message)).toBeVisible();
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
  });

  it("explains an unresolved boundary without exposing a machine reason as ordinary copy", () => {
    const owner = entry();
    owner.ligand_designation.reason_code = "molecular_boundary_not_qualified";
    setup(owner);
    expect(screen.getByRole("status")).toHaveTextContent("A complete ligand instance could not be established.");
    expect(screen.queryByText("molecular_boundary_not_qualified")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave unassigned" })).toBeEnabled();
  });

  it("retires a resolved summary's cached metadata after a failed recheck while retaining durable intent", async () => {
    const owner = resolvedEntry();
    const { client, props } = setup(owner);
    await screen.findByText("ATP");
    expect(screen.getByText("ATP 601 · chain A")).toBeVisible();
    const chooser = screen.getByRole("combobox", { name: "Entry" });
    chooser.focus();
    candidatesMock.mockRejectedValue(new ApiError(409, "artifact_integrity_error", "Internal artifact details"));
    await act(async () => { await client.refetchQueries({ queryKey: ["ligand-candidates"] }); });
    const cached = client.getQueryCache().find({ queryKey: ["ligand-candidates"], exact: false });
    expect(cached?.state.status).toBe("error");
    expect(cached?.state.data).toBeDefined();
    await waitFor(() => expect(screen.queryByText("ATP")).not.toBeInTheDocument());
    expect(screen.queryByText("ATP 601 · chain A")).not.toBeInTheDocument();
    expect(screen.getByText("Ligand designated")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("A molecular file could not be verified. Reimport the structure, then choose the new entry.");
    expect(chooser).toHaveFocus();
    expect(owner.ligand_designation.status).toBe("resolved");
    expect(props.onDesignate).not.toHaveBeenCalled();
  });

  it.each(["summary", "choices"])("gives reload guidance for a %s source conflict and retires it when current artifact context arrives", async surface => {
    const user = userEvent.setup();
    const owner = resolvedEntry();
    const { client, props, update } = setup(owner);
    await screen.findByText("ATP");
    if (surface === "choices") {
      await user.click(screen.getByRole("button", { name: "Change" }));
      await screen.findAllByRole("img");
      await user.click(screen.getAllByRole("radio")[1]);
    }
    candidatesMock.mockRejectedValueOnce(new ApiError(409, "structure_artifact_conflict", "Old molecular input"));
    await act(async () => { await client.refetchQueries({ queryKey: ["ligand-candidates"] }); });
    const message = "The structure input changed. Reload the page, then review the ligand choice for the current structure.";
    expect(await screen.findByRole(surface === "choices" ? "alert" : "status")).toHaveTextContent(message);
    expect(screen.queryByText("Ligand instances could not be loaded. Try again.")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    if (surface === "choices") {
      expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
    }
    const chooser = screen.getByRole("combobox", { name: "Entry" });
    chooser.focus();
    const current = { ...owner, current_artifact_id: "current-artifact-after-reload",
      ligand_designation: { ...owner.ligand_designation, source_artifact_id: "current-artifact-after-reload" } };
    update({ ...props, project: { ...props.project, revision: props.project.revision + 1, entries: [current] } });
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(chooser).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Change" }));
    const dialog = screen.getByRole("dialog");
    const radios = await within(dialog).findAllByRole("radio");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    radios.forEach(radio => expect(radio).not.toBeChecked());
    await within(dialog).findAllByRole("img");
    await user.click(radios[0]);
    expect(within(dialog).getByRole("button", { name: "Use ligand" })).toBeEnabled();
    expect(props.onDesignate).not.toHaveBeenCalled();
    expect(candidatesMock).toHaveBeenLastCalledWith("project-1", current, 0, expect.any(AbortSignal));
  });

  it.each(["new choice", "Undo", "Clear"])("retires an earlier failed Use after same-artifact %s without reviving it on return", async transition => {
    const user = userEvent.setup();
    const owner = resolvedEntry();
    const onDesignate = vi.fn().mockRejectedValue(new Error("Failed choice from the earlier context"));
    const { props, update } = setup(owner, { onDesignate });
    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click((await screen.findAllByRole("radio"))[1]);
    await user.click(screen.getByRole("button", { name: "Use ligand" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed choice from the earlier context");
    expect(screen.getAllByRole("radio")[1]).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Failed choice from the earlier context");
    const chooser = screen.getByRole("combobox", { name: "Entry" });
    chooser.focus();
    const changed = { ...owner, ligand_designation: transition === "new choice"
      ? { ...owner.ligand_designation, instance_id: "new-choice-intent", atom_ids: [21, 22] }
      : { ...entry().ligand_designation, source_artifact_id: owner.current_artifact_id,
        status: transition === "Undo" ? "selection_required" as const : "cleared" as const } };
    expect(changed.current_artifact_id).toBe(owner.current_artifact_id);
    update({ ...props, project: { ...props.project, revision: props.project.revision + 1, entries: [changed] } });
    expect(screen.queryByText("Failed choice from the earlier context")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(chooser).toHaveFocus();
    update(props);
    expect(screen.queryByText("Failed choice from the earlier context")).not.toBeInTheDocument();
    expect(chooser).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDesignate).toHaveBeenCalledTimes(1);
  });

  it("keeps current source-conflict guidance ahead of an older stale-choice reason after closing choices", async () => {
    const user = userEvent.setup();
    const owner = resolvedEntry();
    owner.ligand_designation = { ...owner.ligand_designation, status: "stale",
      reason_code: "designated_instance_split_or_ambiguous" };
    candidatesMock.mockRejectedValue(new ApiError(409, "structure_artifact_conflict", "Old molecular input"));
    const { props } = setup(owner);
    await user.click(screen.getByRole("button", { name: "Change" }));
    const message = "The structure input changed. Reload the page, then review the ligand choice for the current structure.";
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Change" })).toHaveFocus();
    expect(screen.getByText("Ligand choice needs review")).toBeVisible();
    expect(props.onDesignate).not.toHaveBeenCalled();
  });

  it("ignores a late failed Use after same-artifact designation A→B→A without reopening or moving focus", async () => {
    const user = userEvent.setup();
    const owner = resolvedEntry();
    const held = deferred<void>();
    const onDesignate = vi.fn(() => held.promise);
    const { props, update } = setup(owner, { onDesignate });
    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click((await screen.findAllByRole("radio"))[1]);
    await user.click(screen.getByRole("button", { name: "Use ligand" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    const chooser = screen.getByRole("combobox", { name: "Entry" });
    chooser.focus();
    const changed = { ...owner, ligand_designation: { ...owner.ligand_designation, instance_id: "intervening-choice" } };
    update({ ...props, project: { ...props.project, entries: [changed] } });
    update(props);
    await act(async () => {
      held.reject(new Error("Late failure from an earlier designation visit"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Late failure from an earlier designation visit")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chooser).toHaveFocus();
    expect(onDesignate).toHaveBeenCalledTimes(1);
  });

  it.each(["same input", "changed input", "no longer selectable"])("retires cached cards on a failed recheck and recovers the draft only for a matching selectable %s", async recovery => {
    const user = userEvent.setup();
    const owner = entry();
    const { client, props } = setup(owner);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const dialog = screen.getByRole("dialog");
    await user.click((await within(dialog).findAllByRole("radio"))[1]);
    await within(dialog).findAllByRole("img");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    cancel.focus();
    candidatesMock.mockRejectedValueOnce(new ApiError(0, "network_error", "The local API could not be reached."));
    await act(async () => { await client.refetchQueries({ queryKey: ["ligand-candidates"] }); });
    const cached = client.getQueryCache().find({ queryKey: ["ligand-candidates"], exact: false });
    expect(cached?.state.status).toBe("error");
    expect(cached?.state.data).toBeDefined();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Ligand instances could not be loaded. Try again.");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("C1H2")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("C2H2")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Choice awaits an input check")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(cancel).toHaveFocus();
    expect(props.onDesignate).not.toHaveBeenCalled();
    candidatesMock.mockImplementation((_project, current, offset) => Promise.resolve({
      ...inventory(current, offset),
      ...(recovery === "changed input" ? { input_hash: "different-current-input" }
        : recovery === "no longer selectable" ? { selectable_candidate_keys: ["candidate-1"] } : {}),
    }));
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    const radios = await within(dialog).findAllByRole("radio");
    expect(radios[1]).toHaveProperty("checked", recovery === "same input");
    expect(within(dialog).getByRole("button", { name: "Use ligand" }))
      .toHaveProperty("disabled", recovery !== "same input");
    if (recovery !== "same input") {
      expect(within(dialog).getByText("Choose a current instance")).toBeVisible();
      expect(props.onDesignate).not.toHaveBeenCalled();
    } else {
      await user.click(within(dialog).getByRole("button", { name: "Use ligand" }));
      expect(props.onDesignate).toHaveBeenCalledWith(owner, "candidate-2", "exact-inventory-hash", expect.any(Function));
    }
  });

  it.each(["project", "entry", "artifact", "designation"])("ignores a late failed summary across %s A→B→A and preserves current focus", async change => {
    const owner = resolvedEntry();
    const held = deferred<LigandCandidatesRead>();
    let signal: AbortSignal | undefined;
    candidatesMock.mockImplementation((projectId, current, offset) => Promise.resolve({
      ...inventory(current, offset), project_id: projectId,
    })).mockImplementationOnce((_project, _owner, _offset, pendingSignal) => {
      signal = pendingSignal; return held.promise;
    });
    const { props, update } = setup(owner);
    await waitFor(() => expect(signal).toBeDefined());
    const other = { ...owner, ligand_designation: { ...owner.ligand_designation } };
    const project = { ...props.project, entries: [other] };
    if (change === "project") project.id = "project-other";
    else if (change === "entry") other.id = "entry-other";
    else if (change === "artifact") other.current_artifact_id = "artifact-other";
    else other.ligand_designation.instance_id = "intent-other";
    update({ ...props, project, entryId: other.id });
    await screen.findByText("ATP");
    update(props);
    await screen.findByText("ATP");
    expect(signal?.aborted).toBe(true);
    const chooser = screen.getByRole("combobox", { name: "Entry" });
    chooser.focus();
    await act(async () => {
      held.reject(new ApiError(409, "artifact_integrity_error", "Retired source failure"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("ATP")).toBeVisible();
    expect(chooser).toHaveFocus();
    expect(props.onDesignate).not.toHaveBeenCalled();
  });

  it("requests and paints qualified depictions through StrictMode lifecycle replay", async () => {
    const user = userEvent.setup();
    setup(entry(), {}, true);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await screen.findAllByRole("radio");
    await waitFor(() => expect(depictionMock).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByRole("img")).toHaveLength(2);
    expect(screen.queryByText("2D could not be loaded")).not.toBeInTheDocument();
  });

  it("requires an explicit exact-instance choice and Cancel never publishes", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    expect(candidatesMock).not.toHaveBeenCalled();
    expect(depictionMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const dialog = await screen.findByRole("dialog");
    const radios = await within(dialog).findAllByRole("radio");
    expect(radios).toHaveLength(2);
    radios.forEach(radio => expect(radio).not.toBeChecked());
    expect(within(dialog).getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(radios[0]).toHaveAccessibleName(/ATP 601 · chain A · instance 1/);
    expect(radios[1]).toHaveAccessibleName(/ATP 601A · chain B · instance 2/);
    await user.click(radios[1]);
    expect(props.onDesignate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(props.onDesignate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose" })).toHaveFocus();
  });

  it("preserves a failed draft and retries the exact captured candidate and input", async () => {
    const user = userEvent.setup();
    const onDesignate = vi.fn().mockRejectedValueOnce(new Error("Revision conflict")).mockResolvedValue(undefined);
    const owner = entry();
    setup(owner, { onDesignate });
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const dialog = await screen.findByRole("dialog");
    await user.click((await within(dialog).findAllByRole("radio"))[1]);
    await user.click(within(dialog).getByRole("button", { name: "Use ligand" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Revision conflict");
    expect(within(dialog).getAllByRole("radio")[1]).toBeChecked();
    expect(onDesignate).toHaveBeenLastCalledWith(owner, "candidate-2", "exact-inventory-hash", expect.any(Function));
    await user.click(within(dialog).getByRole("button", { name: "Use ligand" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onDesignate).toHaveBeenCalledTimes(2);
  });

  it("keeps current designation distinct from the unchecked draft", async () => {
    const user = userEvent.setup();
    const owner = entry();
    owner.ligand_designation = { ...owner.ligand_designation, status: "resolved", atom_ids: candidate(1).atom_ids,
      instance_id: "intent-a", origin: "manual", selected_at: "2026-11-16T00:00:00Z", source_artifact_id: owner.current_artifact_id };
    setup(owner);
    await screen.findByText("ATP 601 · chain A");
    await user.click(screen.getByRole("button", { name: "Change" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("Current designation")).toBeVisible();
    within(dialog).getAllByRole("radio").forEach(radio => expect(radio).not.toBeChecked());
    await user.click(within(dialog).getAllByRole("radio")[1]);
    expect(within(dialog).getByText("Current designation")).toBeVisible();
    expect(within(dialog).getAllByRole("radio")[1]).toBeChecked();
  });

  it("allows durable opt-out before any designation and respects preview guards", async () => {
    const user = userEvent.setup();
    const owner = entry();
    const { props, update } = setup(owner, { pausedReason: "Finish the molecular preview first." });
    expect(screen.getByRole("button", { name: "Leave unassigned" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const dialog = screen.getByRole("dialog");
    const radios = await within(dialog).findAllByRole("radio");
    radios.forEach(radio => expect(radio).toBeDisabled());
    expect(within(dialog).queryByText("C1H2")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
    expect(depictionMock).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    update({ ...props, pausedReason: null });
    await user.click(screen.getByRole("button", { name: "Leave unassigned" }));
    expect(props.onDesignate).toHaveBeenCalledWith(owner, null, undefined, expect.any(Function));
  });

  it("changes only inspection through the explicit chooser and includes hidden duplicate names", async () => {
    const user = userEvent.setup();
    const first = entry(), second = { ...entry(), id: "entry-b", visible: false };
    const { props } = setup(first, { project: molecularProject([first, second]) });
    const chooser = screen.getByRole("combobox", { name: "Entry" });
    expect(within(chooser).getByRole("option", { name: "Complex (entry-b) · hidden" })).toBeInTheDocument();
    await user.selectOptions(chooser, second.id);
    expect(props.onInspectEntry).toHaveBeenCalledWith(second.id);
    expect(props.onDesignate).not.toHaveBeenCalled();
    expect(candidatesMock).not.toHaveBeenCalled();
  });

  it("retires held inventory on A→B→A without reopening or publishing an old draft", async () => {
    const user = userEvent.setup();
    const first = entry(), second = { ...entry(), id: "entry-b" };
    const held = deferred<LigandCandidatesRead>();
    let signal: AbortSignal | undefined;
    candidatesMock.mockImplementationOnce((_project, _owner, _offset, pendingSignal) => {
      signal = pendingSignal; return held.promise;
    });
    const { props, update } = setup(first, { project: molecularProject([first, second]) });
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await waitFor(() => expect(signal).toBeDefined());
    update({ ...props, entryId: second.id });
    expect(signal?.aborted).toBe(true);
    update(props);
    await act(async () => { held.resolve(inventory(first)); await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(props.onDesignate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findAllByRole("radio")).toHaveLength(2);
  });

  it("keeps depiction failure selectable and shows known metadata", async () => {
    const user = userEvent.setup();
    depictionMock.mockResolvedValue({ ...drawing(entry(), "candidate-1"),
      status: "unavailable", reason: "chemical_representation_not_qualified", artifact: null });
    setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const radios = await screen.findAllByRole("radio");
    await user.click(radios[0]);
    expect(radios[0]).toBeEnabled();
    expect(screen.getByText("C1H2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeEnabled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("bounds cards to twelve and loads only the newly visible page's depiction", async () => {
    const user = userEvent.setup();
    candidatesMock.mockImplementation((_project, owner, offset) => Promise.resolve(inventory(owner, offset, 13)));
    setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findAllByRole("radio")).toHaveLength(12);
    await waitFor(() => expect(depictionMock).toHaveBeenCalledTimes(12));
    await user.click(screen.getByRole("button", { name: "Next ligand page" }));
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(1));
    await waitFor(() => expect(depictionMock).toHaveBeenCalledTimes(13));
    expect(screen.getByText("Page 2 of 2")).toBeVisible();
    expect(candidatesMock).toHaveBeenLastCalledWith("project-1", expect.anything(), 12, expect.any(AbortSignal));
  });

  it("bounds concurrent drawing requests and retires held page work on cancellation", async () => {
    const user = userEvent.setup();
    candidatesMock.mockImplementation((_project, owner, offset) => Promise.resolve(inventory(owner, offset, 12)));
    const held: ReturnType<typeof deferred<LigandDepictionRead>>[] = [];
    const signals: AbortSignal[] = [];
    depictionMock.mockImplementation((_project, _owner, _key, signal) => {
      const request = deferred<LigandDepictionRead>(); held.push(request); signals.push(signal); return request.promise;
    });
    setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await screen.findAllByRole("radio");
    await waitFor(() => expect(held).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signals.every(signal => signal.aborted)).toBe(true);
    await act(async () => { held.forEach((request, index) => request.resolve(drawing(entry(), `candidate-${index + 1}`, "retired"))); await Promise.resolve(); });
    expect(depictionMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("permits Close while saving and never steals focus after late completion", async () => {
    const user = userEvent.setup();
    const saving = deferred<void>();
    const onDesignate = vi.fn(() => saving.promise);
    setup(entry(), { onDesignate });
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await user.click((await screen.findAllByRole("radio"))[0]);
    await user.click(screen.getByRole("button", { name: "Use ligand" }));
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    const chooser = screen.getByRole("combobox", { name: "Entry" });
    chooser.focus();
    await act(async () => { saving.resolve(); await Promise.resolve(); });
    expect(chooser).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDesignate).toHaveBeenCalledOnce();
  });

  it("immediately retires composition and images when a preview begins", async () => {
    const user = userEvent.setup();
    const { props, update } = setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await screen.findAllByRole("img");
    await user.click(screen.getAllByRole("radio")[0]);
    expect(screen.getByText("C1H2")).toBeVisible();
    update({ ...props, pausedReason: "Finish preview first." });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("C1H2")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(props.onDesignate).not.toHaveBeenCalled();
    update(props);
    await screen.findAllByRole("img");
  });

  it.each(["source", "implementation", "chemical input"])("rejects a depiction response bound to another %s", async mismatch => {
    const user = userEvent.setup();
    depictionMock.mockImplementation((_project, owner, key) => Promise.resolve({
      ...drawing(owner, key),
      ...(mismatch === "source" ? { artifact_id: "retired-artifact" }
        : mismatch === "implementation" ? { implementation: "old-drawing-policy" }
          : { input_hash: "retired-chemical-input" }),
    }));
    setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await screen.findAllByRole("radio");
    await waitFor(() => expect(depictionMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getAllByText("2D unavailable")).toHaveLength(2);
  });

  it("supports native radio keyboard selection and an explicit keyboard commit", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const radios = await screen.findAllByRole("radio");
    radios[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(radios[1]).toBeChecked();
    expect(props.onDesignate).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "Use ligand" }).focus();
    await user.keyboard("{Enter}");
    expect(props.onDesignate).toHaveBeenCalledWith(expect.objectContaining({ id: "entry-a" }),
      "candidate-2", "exact-inventory-hash", expect.any(Function));
  });

  it("keeps a capacity refusal accessible alongside selectable metadata", async () => {
    const user = userEvent.setup();
    depictionMock.mockImplementation((_project, owner, key) => Promise.resolve({
      ...drawing(owner, key), status: "unavailable", artifact: null, reason: "depiction_cache_capacity",
    }));
    setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    const radios = await screen.findAllByRole("radio");
    await waitFor(() => expect(depictionMock).toHaveBeenCalledTimes(2));
    const card = radios[0].closest("article")!;
    await user.click(within(card).getByText("Instance details"));
    expect(within(card).getByText("The stored depiction limit has been reached.")).toBeVisible();
    expect(radios[0]).toBeEnabled();
  });


  it.each(["source", "resolver"])("refuses an inventory with an obsolete %s", async mismatch => {
    const user = userEvent.setup();
    candidatesMock.mockImplementation((_project, owner) => Promise.resolve({
      ...inventory(owner), ...(mismatch === "source" ? { artifact_id: "retired" }
        : { resolver_version: "obsolete-resolver" }),
    }));
    setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer matches this entry");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(depictionMock).not.toHaveBeenCalled();
  });

  it("shows an empty qualified inventory without inventing a candidate", async () => {
    const user = userEvent.setup();
    candidatesMock.mockImplementation((_project, owner) => Promise.resolve(inventory(owner, 0, 0)));
    setup();
    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(await screen.findByText("No eligible ligand instances were found.")).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
    expect(depictionMock).not.toHaveBeenCalled();
  });


  it("restarts held depiction work after a StrictMode preview without painting retired completions", async () => {
    const user = userEvent.setup();
    const held: ReturnType<typeof deferred<LigandDepictionRead>>[] = [];
    const signals: AbortSignal[] = [];
    depictionMock.mockImplementation((_project, owner, key, signal) => {
      signals.push(signal);
      if (held.length < 2) {
        const request = deferred<LigandDepictionRead>(); held.push(request); return request.promise;
      }
      return Promise.resolve(drawing(owner, key, `current-${key}`));
    });
    const { props, update } = setup(entry(), {}, true);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await screen.findAllByRole("radio");
    await waitFor(() => expect(held).toHaveLength(2));
    update({ ...props, pausedReason: "Finish preview first." });
    expect(signals.slice(0, 2).every(signal => signal.aborted)).toBe(true);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use ligand" })).toBeDisabled();
    update(props);
    const images = await screen.findAllByRole("img");
    expect(images).toHaveLength(2);
    images.forEach(image => expect(image).toHaveAttribute("src", expect.stringContaining("/artifact/current-")));
    await act(async () => {
      held.forEach((request, index) => request.resolve(drawing(entry(), `candidate-${index + 1}`, "retired")));
      await Promise.resolve();
    });
    screen.getAllByRole("img").forEach(image => expect(image).toHaveAttribute("src", expect.stringContaining("/artifact/current-")));
    expect(depictionMock).toHaveBeenCalledTimes(4);
  });

  it("retires only owned query consumers when a preview starts", async () => {
    const user = userEvent.setup();
    const signals = new Map<string, AbortSignal>();
    const requests = new Map<string, ReturnType<typeof deferred<LigandDepictionRead>>>();
    depictionMock.mockImplementation((_project, _owner, key, signal) => {
      const request = deferred<LigandDepictionRead>();
      requests.set(key, request); signals.set(key, signal); return request.promise;
    });
    const { client, props, update } = setup(entry(), {}, true);
    await user.click(screen.getByRole("button", { name: "Choose" }));
    await screen.findAllByRole("radio");
    await waitFor(() => expect(requests.size).toBe(2));
    const shared = client.getQueryCache().findAll({ queryKey: ["ligand-depiction"] })
      .find(query => query.queryKey.includes("candidate-1"));
    expect(shared).toBeDefined();
    const observer = new QueryObserver(client, { queryKey: shared!.queryKey, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      update({ ...props, pausedReason: "Finish preview first." });
      expect(signals.get("candidate-1")?.aborted).toBe(false);
      expect(signals.get("candidate-2")?.aborted).toBe(true);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      await act(async () => {
        requests.get("candidate-1")!.resolve(drawing(entry(), "candidate-1"));
        await Promise.resolve();
      });
      expect(shared!.state.status).toBe("success");
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    } finally { unsubscribe(); observer.destroy(); }
  });

});
