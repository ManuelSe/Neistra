import * as Tooltip from "@radix-ui/react-tooltip";
import { StrictMode } from "react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../api/types";
import { LigandDesignationControls } from "../components/LigandDesignationControls";
import { ligandApi } from "../ligands/api";
import type { LigandApi, LigandCandidate, LigandCandidatesRead, LigandDepictionRead } from "../ligands/types";
import { molecularEntry, molecularProject } from "./molecular-fixtures";

const clients: QueryClient[] = [];
const candidatesMock = vi.fn<LigandApi["candidates"]>();
const depictionMock = vi.fn<LigandApi["depiction"]>();
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
const entry = () => molecularEntry("entry-a", "Complex", "complex");
function candidate(id: number): LigandCandidate {
  return { candidate_key: `candidate-${id}`, atom_ids: [id * 10 + 1, id * 10 + 2],
    residue_ids: [id], component_ids: [`component-${id}`], label: "ATP", locations: [{
      residue_id: id, residue_name: "ATP", chain_id: id, chain_name: id % 2 ? "A" : "B",
      author_number: 601, insertion_code: id === 2 ? "A" : null,
      source_entity_id: null, source_asym_id: null,
    }], boundary_status: "qualified", potential_ligand: true, reason_codes: [],
    provenance: ["source_connectivity"], heavy_atom_count: 2, formal_charge: -1,
    formula: `C${id}H2`, molecular_weight: 42 + id, chemistry_status: "qualified",
    chemistry_reason: null, chemical_input_hash: `chemical-${id}` };
}
function inventory(owner: Entry, offset = 0, count = 2): LigandCandidatesRead {
  const all = Array.from({ length: count }, (_, index) => candidate(index + 1));
  return { project_id: "project-1", entry_id: owner.id, artifact_id: owner.current_artifact_id,
    designation: owner.ligand_designation, input_hash: "exact-inventory-hash", resolver_version: "ligand-instance-v1",
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
    expect(onDesignate).toHaveBeenLastCalledWith(owner, "candidate-2", "exact-inventory-hash");
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
    expect(props.onDesignate).toHaveBeenCalledWith(owner, null, undefined);
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
      "candidate-2", "exact-inventory-hash");
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
