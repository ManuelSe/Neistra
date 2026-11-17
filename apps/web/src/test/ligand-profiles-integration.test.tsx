import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import metadata from "../../../../tests/fixtures/profiles/registry.json";
import oracle from "../../../../tests/fixtures/profiles/boundaries.json";
import { ApiError } from "../api/client";
import type { Project } from "../api/types";
import { LigandProperties } from "../components/LigandProperties";
import { PROFILE_REGISTRY_KEY, ligandProfileApi } from "../ligandProfiles/api";
import { profileInputAuthority } from "../ligandProfiles/authority";
import { ProfileSelection } from "../ligandProfiles/context";
import { evaluateProfile } from "../ligandProfiles/evaluate";
import { parseProfileRegistry } from "../ligandProfiles/validate";
import { useLigandProfiles } from "../ligandProfiles/useProfiles";
import { ligandPropertyApi } from "../ligandProperties/api";
import { PROPERTY_PREFERENCES_KEY, PROPERTY_REGISTRY_KEY, propertyInputKey } from "../ligandProperties/context";
import { PropertyInputOwner } from "../ligandProperties/ownership";
import { LigandPropertySession } from "../ligandProperties/session";
import type { DescriptorRegistry, PropertyAggregate, PropertyPreferences, PropertySource } from "../ligandProperties/types";
import { useLigandProperties, type PropertyPresentation } from "../ligandProperties/useProperties";
import { deferredProperty, propertyAllocation, propertyEntry, propertyPreferences, propertyProject } from "./ligand-properties-fixtures";

const registry = parseProfileRegistry(metadata);
const descriptorRegistry: DescriptorRegistry = { ...registry.descriptor_method, definitions: [...registry.descriptors] };
const baseValues: Record<string, number> = oracle.base_values;
const clients: QueryClient[] = [], sessions: LigandPropertySession[] = [];
function result(projectId: string, source: PropertySource, ids: string[], status: "ready" | "pending" = "ready",
  overrides: Record<string, number> = {}, coverage = ids): PropertyAggregate {
  return { project_id: projectId, entries: [{ source: structuredClone(source), binding_key: "b".repeat(64), status, reason: null,
    progress: status === "ready" ? 100 : 25, report: { schema_version: 1, input_hash: "c".repeat(64), ...registry.descriptor_method,
      created_at: "2026-11-17T00:00:00Z", model_status: "qualified", model_reason: null, contains_formally_charged_atoms: false,
      provenance: ["Qualified current source"], coverage, values: coverage.map(id => ({ descriptor_id: id, status: "ready", reason: null,
        value: overrides[id] ?? baseValues[id] })) } }] };
}
beforeEach(() => {
  vi.spyOn(ligandProfileApi, "registry").mockResolvedValue(registry);
  vi.spyOn(ligandPropertyApi, "registry").mockResolvedValue(descriptorRegistry);
  vi.spyOn(ligandPropertyApi, "preferences").mockResolvedValue({ ...propertyPreferences, enabled_categories: [] });
  vi.spyOn(ligandPropertyApi, "allocate").mockImplementation(id => Promise.resolve(propertyAllocation(id)));
  vi.spyOn(ligandPropertyApi, "release").mockResolvedValue({});
  vi.spyOn(ligandPropertyApi, "savePreferences");
  vi.spyOn(ligandPropertyApi, "read").mockImplementation((projectId, body) => Promise.resolve(result(projectId, body.entries[0], body.descriptor_ids)));
  vi.spyOn(ligandPropertyApi, "demand").mockImplementation((projectId, _id, body) => Promise.resolve(result(projectId, body.entries[0], body.descriptor_ids, "pending", {}, [])));
});
afterEach(() => {
  cleanup(); sessions.splice(0).forEach(session => session.deactivate()); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks();
});
function setup({ categories = [], strict = false, selected = "" }: {
  categories?: PropertyPreferences["enabled_categories"]; strict?: boolean; selected?: string;
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  client.setQueryData(PROPERTY_PREFERENCES_KEY, { ...propertyPreferences, enabled_categories: categories });
  const selection = new ProfileSelection(client); selection.select(selected);
  const project = propertyProject(); project.entries[0].ligand_designation.atom_ids = Array.from({ length: 18 }, (_, i) => i + 1);
  type Input = { project: Project; entryId: string | null; pausedReason: string | null };
  let input: Input = { project, entryId: project.entries[0].id, pausedReason: null };
  let presentation!: PropertyPresentation;
  const owner = new PropertyInputOwner(() => {
    const definitions = client.getQueryState<DescriptorRegistry>(PROPERTY_REGISTRY_KEY);
    const preferences = client.getQueryState<PropertyPreferences>(PROPERTY_PREFERENCES_KEY);
    const currentRegistry = definitions?.status === "success" ? definitions.data : undefined;
    return { activeProjectId: input.project.id, inspectedEntryId: input.entryId, paused: !!input.pausedReason,
      inputKey: propertyInputKey(input.project.id, input.project.entries.find(entry => entry.id === input.entryId), currentRegistry,
        preferences?.status === "success" ? preferences.data : undefined, selection.dependencies(currentRegistry)) };
  });
  const session = new LigandPropertySession(target => owner.capture(target)); sessions.push(session);
  function Harness({ visible }: { visible: boolean }) {
    useLayoutEffect(() => { owner.activate(); session.activate(); owner.observe(); return () => { owner.deactivate(); session.deactivate(); }; }, []);
    const profiles = useLigandProfiles(true, selection, owner);
    presentation = useLigandProperties({ ...input, session, owner, profileSelection: selection });
    return visible ? <LigandProperties state={presentation} session={session} profiles={profiles} /> : null;
  }
  const tree = (visible: boolean) => <QueryClientProvider client={client}><Tooltip.Provider>
    {strict ? <StrictMode><Harness visible={visible} /></StrictMode> : <Harness visible={visible} />}
  </Tooltip.Provider></QueryClientProvider>;
  const rendered = render(tree(true));
  return { client, owner, session, selection, state: () => presentation,
    evaluate: () => evaluateProfile(selection.registry()!, selection.id(), profileInputAuthority(presentation, session, selection, selection.registry()!, selection.id())),
    update: (change: Partial<Input>, visible = true) => act(() => { input = { ...input, ...change }; owner.observe(); rendered.rerender(tree(visible)); }),
    visibility: (visible: boolean) => act(() => rendered.rerender(tree(visible))),
    change: (id: string) => userEvent.selectOptions(screen.getByRole("combobox", { name: "Profile" }), id),
    externalSelect: (id: string) => act(() => { selection.select(id, owner.observe); rendered.rerender(tree(true)); }),
    ...rendered,
  };
}
const waitCatalog = () => screen.findByRole("option", { name: "Ro5 — all four" });
const currentStatus = () => screen.findByText("Within profile criteria.");

describe("profile and property integration", () => {
  it("starts with No profile and no demand; profile requirements run with categories off without rewriting preferences", async () => {
    const app = setup(); await waitCatalog();
    expect(screen.getByRole("combobox", { name: "Profile" })).toHaveValue(""); expect(ligandPropertyApi.read).not.toHaveBeenCalled();
    await app.change("ro5"); await currentStatus();
    expect(app.state().target?.descriptorIds).toEqual(["molecular_weight", "hbd", "hba", "calculated_logp"]);
    expect(screen.getByText(/Profile-required properties also update/)).toBeVisible();
    expect(app.client.getQueryData<PropertyPreferences>(PROPERTY_PREFERENCES_KEY)?.enabled_categories).toEqual([]);
    expect(ligandPropertyApi.savePreferences).not.toHaveBeenCalled(); expect(ligandPropertyApi.allocate).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Properties" })).queryByRole("heading", { name: "Composition" })).not.toBeInTheDocument();
  });
  it("deduplicates composite and saved-category requirements in registry order without changing display categories", async () => {
    const app = setup({ categories: ["composition"] }); await waitCatalog(); await app.change("ro5-veber"); await currentStatus();
    const ids = app.state().target!.descriptorIds;
    expect(ids).toEqual(descriptorRegistry.definitions.filter(definition => definition.category === "composition"
      || ["hbd", "hba", "calculated_logp", "tpsa", "rotatable_bond_count"].includes(definition.id)).map(definition => definition.id));
    expect(new Set(ids).size).toBe(ids.length); expect(screen.getByRole("heading", { name: "Composition" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Polarity" })).not.toBeInTheDocument();
  });
  it("keeps effective methods and current qualification warnings with categories off, retiring old provenance on preview and source changes", async () => {
    vi.mocked(ligandPropertyApi.read).mockImplementation((projectId, body) => {
      const response = result(projectId, body.entries[0], body.descriptor_ids), report = response.entries[0].report!;
      // The kernel's external-bond guard withholds graph descriptors independently of observed facts.
      report.model_status = "unavailable"; report.model_reason = "candidate_has_external_bond";
      report.provenance = ["contains_inferred_bonds", "contains_inferred_atomic_fields"];
      report.values = report.values.map(value => ({ ...value, status: "unavailable", value: null, reason: report.model_reason }));
      return Promise.resolve(response);
    });
    const app = setup(); await waitCatalog(); await app.change("ro5");
    await screen.findByText("Some properties are unavailable", { selector: "p.ligand-properties-status" });
    const summary = screen.getByText("Methods and limits"), disclosure = summary.closest("details")!;
    expect(screen.getAllByText("Methods and limits")).toHaveLength(1); expect(disclosure).not.toHaveAttribute("open");
    await userEvent.click(summary);
    for (const id of app.state().target!.descriptorIds) {
      const definition = descriptorRegistry.definitions.find(definition => definition.id === id)!;
      expect(within(disclosure).getByText(definition.name + (definition.unit ? ` (${definition.unit})` : ""))).toBeVisible();
      expect(within(disclosure).getByText(definition.method)).toBeVisible();
    }
    expect(within(disclosure).getByText("contains inferred bonds")).toBeVisible();
    expect(within(disclosure).getByText("contains inferred atomic fields")).toBeVisible();
    expect(within(disclosure).getAllByText("candidate has external bond")[0]).toBeVisible();
    expect(disclosure.querySelector("time")).toHaveAttribute("dateTime", "2026-11-17T00:00:00Z");
    expect(screen.queryByRole("heading", { name: "Composition" })).not.toBeInTheDocument();
    expect(app.client.getQueryData<PropertyPreferences>(PROPERTY_PREFERENCES_KEY)?.enabled_categories).toEqual([]);
    expect(ligandPropertyApi.savePreferences).not.toHaveBeenCalled(); expect(ligandPropertyApi.demand).not.toHaveBeenCalled();
    app.update({ pausedReason: "Preview molecule" });
    expect(screen.queryByText("contains inferred bonds")).not.toBeInTheDocument();
    expect(screen.queryByText("candidate has external bond")).not.toBeInTheDocument();
    expect(disclosure.querySelector("time")).not.toBeInTheDocument();
    app.update({ pausedReason: null });
    await screen.findByText("contains inferred bonds");
    const held = deferredProperty<PropertyAggregate>(); vi.mocked(ligandPropertyApi.read).mockReturnValueOnce(held.promise);
    const edited = propertyProject(); edited.entries[0] = propertyEntry("artifact-new"); app.update({ project: edited });
    expect(screen.queryByText("contains inferred bonds")).not.toBeInTheDocument();
    expect(screen.queryByText("contains inferred atomic fields")).not.toBeInTheDocument();
    expect(screen.queryByText("candidate has external bond")).not.toBeInTheDocument();
    expect(disclosure.querySelector("time")).not.toBeInTheDocument();
    const target = app.state().target!;
    await act(async () => { held.resolve(result(target.projectId, target.source, target.descriptorIds)); await held.promise; });
    await currentStatus(); expect(screen.queryByText("contains inferred bonds")).not.toBeInTheDocument();
    expect(within(disclosure).getByText("Qualified current source")).toBeVisible();
  });
  it("supports unavailable and unknown selections without requesting descriptors", async () => {
    const app = setup(); await waitCatalog(); await app.change("cns-mpo");
    expect(screen.getByRole("combobox", { name: "Profile" })).toHaveValue("cns-mpo");
    expect(screen.getByText(registry.profiles.find(item => item.id === "cns-mpo")!.unavailable_reason!, { selector: "p.ligand-profile-status" })).toBeVisible();
    expect(ligandPropertyApi.read).not.toHaveBeenCalled(); app.externalSelect("removed-profile");
    expect(screen.getByRole("combobox", { name: "Profile" })).toHaveValue("removed-profile");
    expect(screen.getByText(/Selected profile is unavailable/)).toBeVisible(); expect(ligandPropertyApi.read).not.toHaveBeenCalled();
  });
  it("renders unrounded criteria, actual limits, adaptations, versions and citations in a collapsed surface", async () => {
    vi.mocked(ligandPropertyApi.read).mockImplementation((projectId, body) => Promise.resolve(result(projectId, body.entries[0], body.descriptor_ids, "ready", { molecular_weight: 500.00000000000006 })));
    const app = setup(); await waitCatalog(); await app.change("ro5"); await screen.findByText("Outside profile criteria.");
    const details = screen.getByText("Criteria and sources").closest("details")!; expect(details).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("Criteria and sources"));
    expect(within(details).getByText("Value: 500.00000000000006 g/mol")).toBeVisible(); expect(within(details).getByText("Criterion: ≤ 500 g/mol")).toBeVisible();
    expect(within(details).getByText(/Definition/)).toHaveTextContent(registry.registry_version);
    expect(within(details).getAllByRole("link")[0]).toHaveAttribute("href", registry.sources[0].url);
    expect(within(details).getByRole("heading", { name: "Adaptations" })).toBeVisible();
  });
  it("keeps Cancel/Retry effective with categories off and equal-coverage profile choices preserve cancellation", async () => {
    const held = deferredProperty<PropertyAggregate>();
    vi.mocked(ligandPropertyApi.read).mockImplementation((id, body) => Promise.resolve(result(id, body.entries[0], body.descriptor_ids, "pending", {}, [])));
    vi.mocked(ligandPropertyApi.demand).mockReturnValue(held.promise);
    const app = setup(); await waitCatalog(); await app.change("ro5"); await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1));
    const epoch = app.owner.snapshot(); await userEvent.click(screen.getByRole("button", { name: "Cancel update" })); await screen.findByText("Profile update cancelled.");
    await app.change("ro3"); expect(app.owner.snapshot()).toBe(epoch); expect(screen.getByText("Profile update cancelled.")).toBeVisible();
    expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1); expect(ligandPropertyApi.allocate).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Retry" })); await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(2));
    expect(ligandPropertyApi.allocate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ligandPropertyApi.demand).mock.calls[1][2].sequence).toBeGreaterThan(vi.mocked(ligandPropertyApi.demand).mock.calls[0][2].sequence);
  });
  it("equal-coverage profile switching uses cached values without new reads or owner retirement", async () => {
    const app = setup(); await waitCatalog(); await app.change("ro5"); await currentStatus();
    const epoch = app.owner.snapshot(), reads = vi.mocked(ligandPropertyApi.read).mock.calls.length;
    await app.change("ro3"); await currentStatus(); expect(app.owner.snapshot()).toBe(epoch); expect(ligandPropertyApi.read).toHaveBeenCalledTimes(reads);
    expect(ligandPropertyApi.allocate).not.toHaveBeenCalled(); expect(app.evaluate().profile_id).toBe("ro3");
  });
  it("profile selection ABA retires only profile authority while unchanged descriptor demand stays current", async () => {
    const app = setup(); await waitCatalog(); await app.change("ro5"); await currentStatus();
    const captured = profileInputAuthority(app.state(), app.session, app.selection, registry, "ro5").capture();
    const epoch = app.owner.snapshot(), reads = vi.mocked(ligandPropertyApi.read).mock.calls.length;
    await app.change("ro3"); await app.change("ro5"); await currentStatus();
    expect(captured.isCurrent()).toBe(false); expect(app.owner.snapshot()).toBe(epoch);
    expect(ligandPropertyApi.read).toHaveBeenCalledTimes(reads); expect(app.evaluate().status).toBe("pass");
  });
  it("expanded coverage reuses known values while missing requirements update and preserves partial failure", async () => {
    const app = setup(); await waitCatalog(); await app.change("gleeson-4-400"); await currentStatus();
    const held = deferredProperty<PropertyAggregate>(); vi.mocked(ligandPropertyApi.read).mockReturnValue(held.promise); await app.change("ro5");
    expect(app.evaluate().status).toBe("pending"); expect(app.evaluate().criteria.find(row => row.constraint.descriptor_id === "molecular_weight")?.value).toBe(250);
    expect(app.evaluate().criteria.find(row => row.constraint.descriptor_id === "hbd")?.value).toBeNull(); expect(ligandPropertyApi.allocate).not.toHaveBeenCalled();
    const target = app.state().target!;
    await act(async () => { held.resolve(result(target.projectId, target.source, target.descriptorIds, "pending", { molecular_weight: 501 }, ["molecular_weight", "calculated_logp"])); await held.promise; });
    await screen.findByText("Outside profile criteria; remaining values are updating or unavailable."); expect(app.evaluate().status).toBe("fail"); expect(app.evaluate().complete).toBe(false);
  });
  it("different effective coverage is a relevant new input after cancellation", async () => {
    vi.mocked(ligandPropertyApi.read).mockImplementation((id, body) => Promise.resolve(result(id, body.entries[0], body.descriptor_ids, "pending", {}, [])));
    const app = setup(); await waitCatalog(); await app.change("ro5"); await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Cancel update" })); await app.change("veber");
    await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(2)); expect(app.state().target!.descriptorIds).toEqual(["tpsa", "rotatable_bond_count"]);
  });
  it("registry failure and held recovery withhold profiles while retaining the explicit cancellation latch", async () => {
    vi.mocked(ligandPropertyApi.read).mockImplementation((id, body) => Promise.resolve(result(id, body.entries[0], body.descriptor_ids, "pending", {}, [])));
    const app = setup(); await waitCatalog(); await app.change("ro5"); await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Cancel update" })); const epoch = app.owner.snapshot();
    const captured = profileInputAuthority(app.state(), app.session, app.selection, registry, "ro5").capture();
    vi.mocked(ligandProfileApi.registry).mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await app.client.refetchQueries({ queryKey: PROFILE_REGISTRY_KEY }); }); await screen.findByRole("button", { name: "Retry profiles" });
    expect(captured.isCurrent()).toBe(false);
    expect(app.state().target?.descriptorIds).toEqual(["molecular_weight", "hbd", "hba", "calculated_logp"]); expect(app.owner.snapshot()).toBe(epoch);
    const held = deferredProperty<ReturnType<typeof parseProfileRegistry>>(); vi.mocked(ligandProfileApi.registry).mockReturnValueOnce(held.promise);
    await userEvent.click(screen.getByRole("button", { name: "Retry profiles" })); app.visibility(false); app.visibility(true);
    await act(async () => { held.resolve(parseProfileRegistry(metadata)); await held.promise; }); await screen.findByText("Profile update cancelled.");
    expect(captured.isCurrent()).toBe(false);
    expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1); expect(app.owner.snapshot()).toBe(epoch);
    expect(app.selection.demandPlan()?.registryVersion).toBe(registry.registry_version);
    expect(app.client.getQueryData<PropertyPreferences>(PROPERTY_PREFERENCES_KEY)?.enabled_categories).toEqual([]);
  });
  it("metadata failure does not purge independently qualified property values", async () => {
    const app = setup({ categories: ["composition"] }); await waitCatalog(); await app.change("ro5"); await currentStatus();
    const value = within(screen.getByRole("region", { name: "Properties" })).getAllByText("250")[0]; expect(value).toBeVisible();
    vi.mocked(ligandProfileApi.registry).mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await app.client.refetchQueries({ queryKey: PROFILE_REGISTRY_KEY }); }); await screen.findByRole("button", { name: "Retry profiles" });
    expect(value).toBeVisible(); expect(screen.queryByText("Within profile criteria.")).not.toBeInTheDocument(); expect(app.session.view(app.state().target!).status).toBe("ready");
  });
  it("updates while presenter hidden and preserves selection across source edits and Undo/Redo", async () => {
    const app = setup(); await waitCatalog(); await app.change("ro5"); await currentStatus(); app.visibility(false);
    const edited = propertyProject(); edited.entries[0] = propertyEntry("artifact-b"); app.update({ project: edited }, false);
    await waitFor(() => expect(vi.mocked(ligandPropertyApi.read).mock.calls.at(-1)?.[1].entries[0].source_artifact_id).toBe("artifact-b"));
    app.visibility(true); await currentStatus(); expect(screen.getByRole("combobox", { name: "Profile" })).toHaveValue("ro5");
    app.update({ project: propertyProject() }); await currentStatus(); expect(app.evaluate().identity?.source.source_artifact_id).toBe("artifact-a");
    app.update({ project: edited }); await currentStatus(); expect(app.evaluate().identity?.source.source_artifact_id).toBe("artifact-b");
  });
  it("rejects late previous entry/project response using independent real ownership", async () => {
    const held = deferredProperty<PropertyAggregate>(); vi.mocked(ligandPropertyApi.read).mockReturnValueOnce(held.promise);
    const app = setup(); await waitCatalog(); await app.change("ro5"); await waitFor(() => expect(ligandPropertyApi.read).toHaveBeenCalledTimes(1));
    const previous = app.state().target!, captured = profileInputAuthority(app.state(), app.session, app.selection, registry, "ro5").capture();
    const next = propertyProject(); next.id = "project-2"; next.entries[0] = { ...propertyEntry("artifact-next"), id: "entry-next" };
    app.update({ project: next, entryId: "entry-next" }); await currentStatus(); expect(captured.isCurrent()).toBe(false);
    await act(async () => { held.resolve(result(previous.projectId, previous.source, previous.descriptorIds, "ready", { molecular_weight: 999 })); await held.promise; });
    expect(app.evaluate().status).toBe("pass"); expect(app.evaluate().identity?.projectId).toBe("project-2"); expect(app.evaluate().identity?.source.entry_id).toBe("entry-next");
  });
  it("preview and batched ABA retire captured authority; resume keeps the selected profile", async () => {
    const app = setup(); await waitCatalog(); await app.change("ro5"); await currentStatus();
    const previous = profileInputAuthority(app.state(), app.session, app.selection, registry, "ro5").capture(); app.update({ pausedReason: "Preview molecule" });
    expect(await screen.findByText("Preview — profile unavailable.")).toBeVisible(); expect(previous.isCurrent()).toBe(false); app.update({ pausedReason: null }); await currentStatus();
    const captured = profileInputAuthority(app.state(), app.session, app.selection, registry, "ro5").capture();
    act(() => { app.update({ entryId: null }); app.update({ entryId: "entry-a" }); });
    expect(captured.isCurrent()).toBe(false); await currentStatus(); expect(app.evaluate().identity?.ownerEpoch).toBeGreaterThan(captured.ownerEpoch);
  });
  for (const variant of ["current source", "original source", "instance", "membership"] as const) {
    it(`retires real ${variant} authority and rejects late old values before the replacement report arrives`, async () => {
      const app = setup(); await waitCatalog(); await app.change("ro5"); await currentStatus();
      const captured = profileInputAuthority(app.state(), app.session, app.selection, registry, "ro5").capture();
      const next = propertyProject(), entry = next.entries[0];
      entry.ligand_designation.atom_ids = Array.from({ length: 18 }, (_, i) => i + 1);
      if (variant === "current source") entry.current_artifact_id = "artifact-new";
      if (variant === "original source") entry.original_artifact_id = "original-new";
      if (variant === "instance") entry.ligand_designation.instance_id = "instance-new";
      if (variant === "membership") entry.ligand_designation.atom_ids = [1, 2, 3];
      const held = deferredProperty<PropertyAggregate>(); vi.mocked(ligandPropertyApi.read).mockReturnValueOnce(held.promise);
      app.update({ project: next });
      expect(captured.isCurrent()).toBe(false); expect(app.evaluate().status).toBe("pending");
      expect(app.evaluate().criteria.every(row => row.value === null)).toBe(true);
      const target = app.state().target!;
      await act(async () => { held.resolve(result(target.projectId, target.source, target.descriptorIds)); await held.promise; });
      await currentStatus();
      expect(app.evaluate().identity?.originalArtifactId).toBe(entry.original_artifact_id);
      expect(app.evaluate().identity?.source).toEqual(target.source);
    });
  }
  it("uses the actual current descriptor definitions to withhold an inconsistent method without extra chemistry work", async () => {
    const app = setup(); await waitCatalog(); await app.change("ro5"); await currentStatus();
    const reads = vi.mocked(ligandPropertyApi.read).mock.calls.length;
    const definitions = descriptorRegistry.definitions.map((definition, index) => index ? definition : { ...definition, method: "Different calculation" });
    act(() => { app.client.setQueryData(PROPERTY_REGISTRY_KEY, { ...descriptorRegistry, definitions }); });
    await screen.findByText("Profile unavailable — the property method does not match this catalog.");
    expect(app.evaluate().reason).toBe("profile_descriptor_method_mismatch");
    expect(ligandPropertyApi.read).toHaveBeenCalledTimes(reads);
  });
  it("method mismatch withholds profiles and source conflict fences every profile coverage mask", async () => {
    const app = setup(); await waitCatalog(); await app.change("ro5"); await currentStatus();
    vi.mocked(ligandPropertyApi.read).mockImplementationOnce((id, body) => {
      const response = result(id, body.entries[0], body.descriptor_ids);
      response.entries[0].report!.policy_version = "different-policy";
      return Promise.resolve(response);
    });
    act(() => { app.client.setQueryData(PROPERTY_REGISTRY_KEY, { ...descriptorRegistry, policy_version: "different-policy" }); });
    await waitFor(() => expect(app.session.view(app.state().target!).status).toBe("ready"));
    await screen.findByText("Profile unavailable — the property method does not match this catalog."); expect(app.evaluate().reason).toBe("profile_descriptor_method_mismatch");
    act(() => { app.client.setQueryData(PROPERTY_REGISTRY_KEY, descriptorRegistry); }); await currentStatus();
    vi.mocked(ligandPropertyApi.read).mockRejectedValueOnce(new ApiError(409, "structure_artifact_conflict", "Changed")); await app.change("veber");
    await waitFor(() => expect(app.session.view(app.state().target!).status).toBe("unavailable"));
    const held = deferredProperty<PropertyAggregate>(); vi.mocked(ligandPropertyApi.read).mockReturnValueOnce(held.promise); await app.change("ro5");
    expect(app.evaluate().criteria.every(row => row.value === null)).toBe(true); expect(screen.queryByText("Within profile criteria.")).not.toBeInTheDocument();
  });
  it("new parsed catalog retains compiled constraint authority and removed selected ID stays explicit", async () => {
    const app = setup(); await waitCatalog(); await app.change("ro5"); await currentStatus();
    const document = structuredClone(metadata); document.registry_version = "ligand-profiles-v2";
    vi.mocked(ligandProfileApi.registry).mockResolvedValueOnce(parseProfileRegistry(document));
    await act(async () => { await app.client.refetchQueries({ queryKey: PROFILE_REGISTRY_KEY }); }); await currentStatus(); expect(app.evaluate().registry_version).toBe("ligand-profiles-v2");
    const reduced = structuredClone(metadata); reduced.profiles = reduced.profiles.filter(profile => profile.id !== "gleeson-4-400");
    await app.change("gleeson-4-400"); await currentStatus(); vi.mocked(ligandProfileApi.registry).mockResolvedValueOnce(parseProfileRegistry(reduced));
    await act(async () => { await app.client.refetchQueries({ queryKey: PROFILE_REGISTRY_KEY }); });
    expect(await screen.findByText(/Selected profile is unavailable/)).toBeVisible(); expect(screen.getByRole("combobox", { name: "Profile" })).toHaveValue("gleeson-4-400"); expect(app.state().target?.descriptorIds).toEqual([]);
  });
  it("retains native selector focus/open criteria across updates and StrictMode presenter remount", async () => {
    const app = setup({ strict: true }); await waitCatalog(); await app.change("ro5"); await currentStatus(); await userEvent.click(screen.getByText("Criteria and sources"));
    const select = screen.getByRole("combobox", { name: "Profile" }); select.focus();
    act(() => { app.client.setQueryData(PROPERTY_PREFERENCES_KEY, { ...propertyPreferences, revision: 1, enabled_categories: [] }); });
    expect(select).toHaveFocus(); expect(screen.getByText("Criteria and sources").closest("details")).toHaveAttribute("open");
    const reads = vi.mocked(ligandPropertyApi.read).mock.calls.length; app.visibility(false); app.visibility(true); await currentStatus();
    expect(ligandPropertyApi.read).toHaveBeenCalledTimes(reads); expect(screen.getByRole("combobox", { name: "Profile" })).toHaveValue("ro5");
  });
});
