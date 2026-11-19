import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Project } from "../api/types";
import { LigandProperties } from "../components/LigandProperties";
import { ProjectInspector } from "../components/ProjectInspector";
import { emptySelection } from "../selection/selection";
import { ligandPropertyApi } from "../ligandProperties/api";
import { LigandPropertySession } from "../ligandProperties/session";
import { PropertyInputOwner } from "../ligandProperties/ownership";
import { PROPERTY_PREFERENCES_KEY, PROPERTY_REGISTRY_KEY, propertyInputKey } from "../ligandProperties/context";
import { useLigandProperties } from "../ligandProperties/useProperties";
import type { DescriptorRegistry, PropertyAggregate, PropertyPreferences } from "../ligandProperties/types";
import { deferredProperty, pendingPropertySubset, propertyAllocation, propertyEntry, propertyPreferences, propertyProject, propertyRegistry, propertyResult, propertyTarget } from "./ligand-properties-fixtures";

const sessions: LigandPropertySession[] = [], clients: QueryClient[] = [];
beforeEach(() => {
  vi.spyOn(ligandPropertyApi, "registry").mockResolvedValue(propertyRegistry);
  vi.spyOn(ligandPropertyApi, "preferences").mockResolvedValue(propertyPreferences);
  vi.spyOn(ligandPropertyApi, "allocate").mockResolvedValue(propertyAllocation());
  vi.spyOn(ligandPropertyApi, "savePreferences").mockImplementation((_revision, categories) => Promise.resolve({ ...propertyPreferences, revision: 1, enabled_categories: categories }));
  vi.spyOn(ligandPropertyApi, "read").mockResolvedValue(propertyResult());
  vi.spyOn(ligandPropertyApi, "demand").mockResolvedValue(propertyResult(propertyTarget(), "pending"));
  vi.spyOn(ligandPropertyApi, "release").mockResolvedValue({});
});
afterEach(() => { cleanup(); sessions.splice(0).forEach(session => session.deactivate()); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
function setup(project = propertyProject(), strict = false, inspector = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  type Props = { project: Project; entryId: string | null; pausedReason: string | null };
  let props: Props = { project, entryId: "entry-a", pausedReason: null };
  const owner = new PropertyInputOwner(() => {
    const registry = client.getQueryState<DescriptorRegistry>(PROPERTY_REGISTRY_KEY);
    const preferences = client.getQueryState<PropertyPreferences>(PROPERTY_PREFERENCES_KEY);
    return { activeProjectId: props.project.id, inspectedEntryId: props.entryId, paused: !!props.pausedReason,
      inputKey: propertyInputKey(props.project.id, props.project.entries.find(entry => entry.id === props.entryId),
        registry?.status === "success" ? registry.data : undefined, preferences?.status === "success" ? preferences.data : undefined) };
  });
  const session = new LigandPropertySession(target => owner.capture(target)); sessions.push(session);
  const applyDetails = vi.fn(), taskChanged = vi.fn();
  function Harness({ visible }: { visible: boolean }) {
    useLayoutEffect(() => {
      owner.activate(); session.activate(); owner.observe();
      return () => { owner.deactivate(); session.deactivate(); };
    }, []);
    const state = useLigandProperties({ ...props, session, owner });
    const properties = <LigandProperties state={state} session={session} />;
    return !visible ? null : inspector ? <ProjectInspector project={props.project} selection={emptySelection()} pickingGranularity="atom" busy={false}
      ligandControls={properties} onApply={applyDetails} onInspectorTaskChange={taskChanged}
      onApplySelection={() => {}} onPickingGranularity={() => {}} onClearSelection={() => {}}
      onExpandSelection={() => {}} onInvertSelection={() => {}} onPredicateSelection={() => {}}
      onSpatialSelection={() => {}} onSaveSelection={() => {}} onLoadSelection={() => {}} onDeleteSelection={() => {}} /> : properties;
  }
  const view = (visible = true) => {
    const content = <QueryClientProvider client={client}><Tooltip.Provider><Harness visible={visible} /></Tooltip.Provider></QueryClientProvider>;
    return strict ? <StrictMode>{content}</StrictMode> : content;
  };
  const rendered = render(view());
  return { ...rendered, client, session, applyDetails, taskChanged,
    update(next: Partial<Props>, visible = true) { act(() => { props = { ...props, ...next }; owner.observe(); rendered.rerender(view(visible)); }); },
    batch(...transitions: Partial<Props>[]) { act(() => { for (const next of transitions) { props = { ...props, ...next }; owner.observe(); } rendered.rerender(view()); }); } };
}
const properties = () => within(screen.getByRole("region", { name: "Properties" }));
const rows = () => screen.getByRole("region", { name: "Properties" }).querySelectorAll(".ligand-properties-group dl > div");

describe("compact current ligand properties", () => {
  it("renders grouped semantic values, units and advanced methods", async () => {
    setup(); await screen.findByText("Properties current");
    expect(rows()[0].querySelector("dt")).toHaveTextContent("Heavy atoms");
    expect(properties().getByText("46.069")).toHaveTextContent("g/mol");
    expect(properties().getByText("20.23")).toHaveTextContent("Å²");
    expect(rows()).toHaveLength(3);
    await userEvent.click(screen.getByText("Methods and limits"));
    expect(screen.getByText(/Method descriptor-v1/)).toBeVisible();
    expect(ligandPropertyApi.demand).not.toHaveBeenCalled();
  });
  it("shows partial known values without inventing zeros and exposes the reason", async () => {
    const partial = propertyResult(); partial.entries[0].report!.model_status = "unavailable";
    partial.entries[0].report!.model_reason = "isotope_model_unavailable";
    partial.entries[0].report!.values[1] = { descriptor_id: "molecular_weight", status: "unavailable", value: null, reason: "isotope_model_unavailable" };
    vi.mocked(ligandPropertyApi.read).mockResolvedValueOnce(partial);
    setup(); await screen.findByText("Some properties are unavailable");
    expect(properties().getByText("3")).toBeVisible(); expect(properties().getByText("Unavailable")).toBeVisible();
    await userEvent.click(screen.getByText("Methods and limits"));
    expect(screen.getAllByText("isotope model unavailable").length).toBeGreaterThan(0);
    expect(ligandPropertyApi.demand).not.toHaveBeenCalled();
  });
  it("retires values for preview and restores the qualified committed binding on Cancel", async () => {
    const app = setup(); await screen.findByText("Properties current");
    app.update({ pausedReason: "Preview — values unavailable." });
    expect(properties().getByRole("status")).toHaveTextContent("Preview — properties unavailable"); expect(rows()).toHaveLength(0);
    const held = deferredProperty<PropertyAggregate>(); vi.mocked(ligandPropertyApi.read).mockReturnValueOnce(held.promise);
    app.update({ pausedReason: null }); expect(properties().getByText("46.069")).toBeVisible();
    await act(async () => { held.resolve(propertyResult()); await held.promise; });
  });
  it("hides old values before held source C arrives and rejects a held partial B", async () => {
    const app = setup(); await screen.findByText("Properties current");
    const b = deferredProperty<PropertyAggregate>(), c = deferredProperty<PropertyAggregate>();
    vi.mocked(ligandPropertyApi.read).mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise);
    const next = (artifact: string) => ({ ...propertyProject(), entries: [propertyEntry(artifact)] });
    app.update({ project: next("source-b") }); expect(rows()).toHaveLength(0);
    app.update({ project: next("source-c") }); expect(rows()).toHaveLength(0);
    const oldPartial = pendingPropertySubset(propertyTarget("source-b")); oldPartial.entries[0].report!.values[1].value = 77.123;
    await act(async () => { b.resolve(oldPartial); await b.promise; }); expect(rows()).toHaveLength(0);
    expect(properties().queryByText("77.123")).not.toBeInTheDocument();
    const current = propertyResult(propertyTarget("source-c")); current.entries[0].report!.values[1].value = 60.096;
    await act(async () => { c.resolve(current); await c.promise; }); expect(properties().getByText("60.096")).toBeVisible(); expect(properties().queryByText("46.069")).not.toBeInTheDocument();
  });
  it("keeps cancellation through panel reopening and resumes only after Retry", async () => {
    vi.mocked(ligandPropertyApi.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    const app = setup(); await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1));
    await userEvent.click(properties().getByRole("button", { name: "Cancel update" }));
    expect(properties().getByRole("status")).toHaveTextContent("Update cancelled");
    app.update({}, false); app.update({});
    expect(properties().getByRole("status")).toHaveTextContent("Update cancelled");
    expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1);
    await userEvent.click(properties().getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(2));
  });
  it("does not submit, poll or truncate a ligand above the input cap", async () => {
    const project = propertyProject(); project.entries[0].ligand_designation.atom_ids = Array.from({ length: 16_385 }, (_, index) => index + 1);
    setup(project); await screen.findByText(/exceeds the supported input limit/);
    expect(ligandPropertyApi.read).not.toHaveBeenCalled(); expect(ligandPropertyApi.demand).not.toHaveBeenCalled();
  });
  it("retains the workflow through a logical StrictMode mount replay", async () => {
    setup(propertyProject(), true); await screen.findByText("Properties current"); expect(properties().getByText("46.069")).toBeVisible();
  });
  it("keeps qualified old coverage while newly selected categories update", async () => {
    const composition = propertyTarget(); composition.descriptorIds = ["heavy_atom_count", "molecular_weight"];
    vi.mocked(ligandPropertyApi.preferences).mockResolvedValueOnce({ ...propertyPreferences, enabled_categories: ["composition"] });
    const read = deferredProperty<PropertyAggregate>();
    vi.mocked(ligandPropertyApi.read).mockResolvedValueOnce(propertyResult(composition)).mockReturnValueOnce(read.promise);
    const held = deferredProperty<PropertyAggregate>(); vi.mocked(ligandPropertyApi.demand).mockReturnValueOnce(held.promise);
    setup(); await screen.findByText("Properties current"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Property options" }));
    await user.click(screen.getByRole("checkbox", { name: "Polarity" })); await user.click(screen.getByRole("button", { name: "Save options" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(properties().getByRole("status")).toHaveTextContent("Updating properties…");
    expect(properties().getByText("46.069")).toBeVisible(); expect(properties().getByText("3")).toBeVisible();
    const pendingRow = Array.from(rows()).find(row => row.querySelector("dt")?.textContent === "Polar surface area");
    expect(pendingRow?.querySelector("dd")).toHaveTextContent("Updating…");
    expect(pendingRow?.querySelector("dd")).not.toHaveTextContent("Unavailable");
    expect(ligandPropertyApi.demand).not.toHaveBeenCalled();
    await act(async () => { read.resolve(pendingPropertySubset()); await read.promise; });
    await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1));
    await act(async () => { held.resolve(propertyResult()); await held.promise; });
    expect(properties().getByRole("status")).toHaveTextContent("Properties current"); expect(properties().getByText("20.23")).toBeVisible();
  });
  it("immediately reuses a held subset and cannot resurrect it through another mask after source failure", async () => {
    const app = setup(); await screen.findByText("Properties current");
    const subset = deferredProperty<PropertyAggregate>(), full = deferredProperty<PropertyAggregate>();
    vi.mocked(ligandPropertyApi.read).mockReturnValueOnce(subset.promise).mockReturnValueOnce(full.promise);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Property options" }));
    await user.click(screen.getByRole("checkbox", { name: "Polarity" })); await user.click(screen.getByRole("button", { name: "Save options" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(properties().getByRole("status")).toHaveTextContent("Properties current"); expect(properties().getByText("46.069")).toBeVisible();
    expect(ligandPropertyApi.demand).not.toHaveBeenCalled();
    await act(async () => { subset.reject(new ApiError(409, "structure_artifact_conflict", "changed")); await subset.promise.catch(() => {}); });
    await waitFor(() => expect(properties().getByRole("status")).toHaveTextContent("ligand input changed")); expect(rows()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Property options" }));
    await user.click(screen.getByRole("checkbox", { name: "Polarity" })); await user.click(screen.getByRole("button", { name: "Save options" }));
    await waitFor(() => expect(ligandPropertyApi.read).toHaveBeenCalledTimes(3));
    expect(properties().queryByText("46.069")).not.toBeInTheDocument(); expect(rows()).toHaveLength(0);
    await act(async () => { full.resolve(propertyResult()); await full.promise; });
    expect(properties().getByRole("status")).toHaveTextContent("Properties current"); expect(rows()).toHaveLength(3);
    expect(app.session.view({ ...propertyTarget(), originalArtifactId: propertyEntry().original_artifact_id }).status).toBe("ready");
  });
  it("does not reconnect pending work for cloned, renamed, visibility or appearance DTOs", async () => {
    vi.mocked(ligandPropertyApi.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    const app = setup(); await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1));
    for (const change of ["clone", "rename", "visibility", "appearance"]) {
      const project = propertyProject(); project.revision++;
      project.entries = project.entries.map(entry => ({ ...entry,
        name: change === "rename" ? "Renamed ethanol" : entry.name,
        visible: change === "visibility" ? false : entry.visible,
        viewer_settings: { ...entry.viewer_settings, components: { ...entry.viewer_settings.components, ions: change !== "appearance" } },
        ligand_designation: { ...entry.ligand_designation, atom_ids: [...entry.ligand_designation.atom_ids] } }));
      app.update({ project });
    }
    expect(ligandPropertyApi.read).toHaveBeenCalledTimes(1); expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1);
    expect(ligandPropertyApi.release).not.toHaveBeenCalled();
  });
  it("keeps pending work across presenter hiding and automatically requests hidden relevant edits", async () => {
    vi.mocked(ligandPropertyApi.read).mockResolvedValueOnce(propertyResult(propertyTarget(), "pending"))
      .mockResolvedValueOnce(propertyResult(propertyTarget("new-hidden-source"), "pending"));
    vi.mocked(ligandPropertyApi.demand).mockResolvedValueOnce(propertyResult(propertyTarget(), "pending"))
      .mockResolvedValueOnce(propertyResult(propertyTarget("new-hidden-source"), "pending"));
    const app = setup(); await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1));
    app.update({}, false); expect(ligandPropertyApi.release).not.toHaveBeenCalled();
    const project = propertyProject(); project.entries[0] = propertyEntry("new-hidden-source");
    app.update({ project }, false); await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(2));
    app.update({}); expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(2);
    expect(vi.mocked(ligandPropertyApi.demand).mock.calls.at(-1)?.[2].entries[0].source_artifact_id).toBe("new-hidden-source");
  });
  it.each(["source ABA", "preview ABA"])("automatically resumes after same-batched %s and rejects the old held read", async mode => {
    const held = deferredProperty<PropertyAggregate>();
    vi.mocked(ligandPropertyApi.read).mockReturnValueOnce(held.promise).mockResolvedValueOnce(propertyResult());
    const project = propertyProject(), app = setup(project);
    await waitFor(() => expect(ligandPropertyApi.read).toHaveBeenCalledTimes(1));
    if (mode === "source ABA") {
      const other = propertyProject(); other.entries[0] = propertyEntry("other-source");
      app.batch({ project: other }, { project });
    } else app.batch({ pausedReason: "Preview — properties unavailable." }, { pausedReason: null });
    await waitFor(() => expect(ligandPropertyApi.read).toHaveBeenCalledTimes(2));
    await screen.findByText("Properties current");
    const stale = propertyResult(); stale.entries[0].report!.values[1].value = 999;
    await act(async () => { held.resolve(stale); await held.promise; });
    expect(properties().queryByText("999")).not.toBeInTheDocument(); expect(properties().getByText("46.069")).toBeVisible();
  });
});

describe("properties and legacy inspector task navigation", () => {
  function observeReadingPosition() {
    const inspector = screen.getByRole("region", { name: "Project inspector" });
    const owner = inspector.querySelector<HTMLElement>(".inspector-scroll");
    if (!owner) throw new Error("The inspector content scroll owner is missing.");
    let position = 120;
    const writes = vi.fn((value: number) => { position = value; });
    Object.defineProperty(owner, "scrollTop", { configurable: true, get: () => position, set: writes });
    return { owner, writes };
  }
  it("reaches an active task on pointer activation, including its already-selected tab", async () => {
    const app = setup(propertyProject(), false, true); await screen.findByText("Properties current");
    const { writes } = observeReadingPosition(), user = userEvent.setup();
    const details = screen.getByRole("tab", { name: "details" });
    await user.click(details); expect(details).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "details" })).toBeVisible();
    expect(writes).toHaveBeenCalledTimes(1); expect(app.taskChanged).toHaveBeenCalledTimes(1);
    await user.click(details); expect(writes).toHaveBeenCalledTimes(2); expect(app.taskChanged).toHaveBeenCalledTimes(1);
    const name = screen.getByRole("textbox", { name: /^Name$/ });
    await user.clear(name); await user.type(name, "Draft project"); await user.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(app.applyDetails).toHaveBeenCalledWith("Draft project", null);
  });
  it("keeps roving keyboard tab focus while deliberate activation requests the task", async () => {
    const app = setup(propertyProject(), false, true); await screen.findByText("Properties current");
    const { writes } = observeReadingPosition(), user = userEvent.setup();
    screen.getByRole("tab", { name: "selection" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "inspect" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "inspect" })).toBeVisible(); expect(writes).toHaveBeenCalledTimes(1);
    await user.keyboard("{End}");
    const details = screen.getByRole("tab", { name: "details" });
    expect(details).toHaveFocus(); expect(details).toHaveAttribute("aria-selected", "true"); expect(writes).toHaveBeenCalledTimes(2);
    await user.keyboard("{Enter}"); expect(details).toHaveFocus(); expect(writes).toHaveBeenCalledTimes(3);
    expect(app.taskChanged).toHaveBeenCalledTimes(2);
  });
  it("preserves a focused legacy draft and reading position through asynchronous property growth", async () => {
    const held = deferredProperty<PropertyAggregate>();
    vi.mocked(ligandPropertyApi.read).mockResolvedValue(propertyResult(propertyTarget(), "pending"));
    vi.mocked(ligandPropertyApi.demand).mockReturnValueOnce(held.promise);
    const app = setup(propertyProject(), false, true), user = userEvent.setup();
    await waitFor(() => expect(ligandPropertyApi.demand).toHaveBeenCalledTimes(1));
    const { writes } = observeReadingPosition(); await user.click(screen.getByRole("tab", { name: "details" }));
    await user.click(screen.getByText("Methods and limits"));
    const name = screen.getByRole("textbox", { name: /^Name$/ });
    await user.clear(name); await user.type(name, "Keep this draft"); writes.mockClear();
    await act(async () => { held.resolve(propertyResult()); await held.promise; });
    expect(properties().getByRole("status")).toHaveTextContent("Properties current");
    expect(name).toHaveFocus(); expect(name).toHaveValue("Keep this draft"); expect(writes).not.toHaveBeenCalled();
    const changed = { ...propertyProject(), revision: propertyProject().revision + 1 };
    app.update({ project: changed });
    expect(name).toHaveFocus(); expect(name).toHaveValue("Keep this draft"); expect(writes).not.toHaveBeenCalled();
  });
});

describe("installation property options", () => {
  it("keeps draft changes and Restore defaults local until Save, returns focus on Cancel", async () => {
    setup(); await screen.findByText("Properties current"); const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Property options" }); await user.click(trigger);
    const dialog = within(screen.getByRole("dialog", { name: "Property options" }));
    expect(dialog.getByText("Applies to all projects on this installation.")).toBeVisible();
    expect(dialog.getByRole("checkbox", { name: "Composition" })).toHaveFocus();
    await user.click(dialog.getByRole("checkbox", { name: "Composition" }));
    await user.click(dialog.getByRole("button", { name: "Restore defaults" }));
    expect(dialog.getByRole("checkbox", { name: "Lipophilicity" })).toBeChecked();
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus()); expect(ligandPropertyApi.savePreferences).not.toHaveBeenCalled();
    await user.click(trigger); expect(screen.getByRole("checkbox", { name: "Lipophilicity" })).not.toBeChecked();
  });
  it("saves an independent preference revision and updates displayed coverage automatically", async () => {
    setup(); await screen.findByText("Properties current"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Property options" }));
    await user.click(screen.getByRole("checkbox", { name: "Polarity" }));
    const reduced = propertyTarget(); reduced.descriptorIds = ["heavy_atom_count", "molecular_weight"];
    vi.mocked(ligandPropertyApi.read).mockResolvedValueOnce(propertyResult(reduced));
    await user.click(screen.getByRole("button", { name: "Save options" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(ligandPropertyApi.savePreferences).toHaveBeenCalledWith(0, ["composition"]);
    await waitFor(() => expect(rows()).toHaveLength(2)); expect(properties().queryByText("Polar surface area")).not.toBeInTheDocument();
  });
  it("preserves draft choices on save failure and explains a revision conflict", async () => {
    vi.mocked(ligandPropertyApi.savePreferences).mockRejectedValue(new ApiError(409, "preference_conflict", "changed"));
    setup(); await screen.findByText("Properties current"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Property options" }));
    await user.click(screen.getByRole("checkbox", { name: "Composition" })); await user.click(screen.getByRole("button", { name: "Save options" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere"); expect(screen.getByRole("checkbox", { name: "Composition" })).not.toBeChecked();
    expect(screen.getByRole("dialog", { name: "Property options" })).toBeVisible();
  });
  it("reads current preferences once after a conflict so reopening can save the actual revision", async () => {
    const fresh = { ...propertyPreferences, revision: 2, enabled_categories: ["composition"] as const };
    vi.mocked(ligandPropertyApi.preferences).mockResolvedValueOnce(propertyPreferences).mockResolvedValueOnce({ ...fresh, enabled_categories: [...fresh.enabled_categories] });
    vi.mocked(ligandPropertyApi.savePreferences).mockRejectedValueOnce(new ApiError(409, "preference_conflict", "changed"))
      .mockResolvedValueOnce({ ...fresh, revision: 3, enabled_categories: [...fresh.enabled_categories] });
    setup(); await screen.findByText("Properties current"); const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Property options" }); await user.click(trigger);
    await user.click(screen.getByRole("checkbox", { name: "Composition" })); await user.click(screen.getByRole("button", { name: "Save options" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(screen.getByRole("checkbox", { name: "Composition" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save options" })).toBeDisabled();
    expect(ligandPropertyApi.preferences).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Cancel" })); await user.click(trigger);
    expect(screen.getByRole("checkbox", { name: "Composition" })).toBeChecked(); expect(screen.getByRole("checkbox", { name: "Polarity" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save options" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(ligandPropertyApi.savePreferences).toHaveBeenLastCalledWith(2, ["composition"]);
  });
  it("a late save cannot close a replacement options visit or roll back a newer preference", async () => {
    const held = deferredProperty<typeof propertyPreferences>(); vi.mocked(ligandPropertyApi.savePreferences).mockReturnValueOnce(held.promise);
    const app = setup(); await screen.findByText("Properties current"); const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Property options" }); await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Save options" }));
    expect(screen.getByRole("dialog", { name: "Property options" })).toHaveTextContent("Changes may finish after closing.");
    expect(within(screen.getByRole("dialog", { name: "Property options" })).getByRole("status")).toHaveTextContent("Saving options…");
    expect(screen.queryByRole("button", { name: /^Cancel$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Close$/ }));
    await user.click(trigger); await user.click(screen.getByRole("checkbox", { name: "Composition" }));
    const replacement = screen.getByRole("dialog", { name: "Property options" });
    const focused = screen.getByRole("checkbox", { name: "Composition" });
    expect(focused).toHaveFocus();
    app.client.setQueryData(["ligand-property-preferences"], { ...propertyPreferences, revision: 3 });
    await act(async () => { held.resolve({ ...propertyPreferences, revision: 1 }); await held.promise; });
    expect(screen.getByRole("dialog", { name: "Property options" })).toBeVisible(); expect(screen.getByRole("checkbox", { name: "Composition" })).not.toBeChecked();
    expect(screen.getByRole("dialog", { name: "Property options" })).toBe(replacement); expect(focused).toHaveFocus();
    expect(app.client.getQueryData<typeof propertyPreferences>(["ligand-property-preferences"])?.revision).toBe(3);
  });
  it("a failed conflict reread remains blocked across reopening until explicit reload succeeds", async () => {
    vi.mocked(ligandPropertyApi.preferences).mockResolvedValueOnce(propertyPreferences).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...propertyPreferences, revision: 2 });
    vi.mocked(ligandPropertyApi.savePreferences).mockRejectedValueOnce(new ApiError(409, "preference_conflict", "changed"));
    setup(); await screen.findByText("Properties current"); const user = userEvent.setup(); const trigger = screen.getByRole("button", { name: "Property options" });
    await user.click(trigger); await user.click(screen.getByRole("button", { name: "Save options" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be checked");
    await user.click(screen.getByRole("button", { name: "Cancel" })); await user.click(trigger);
    expect(screen.getByRole("button", { name: "Save options" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload current options" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Close and reopen");
    await user.click(screen.getByRole("button", { name: "Cancel" })); await user.click(trigger);
    expect(screen.getByRole("button", { name: "Save options" })).toBeEnabled();
    expect(ligandPropertyApi.preferences).toHaveBeenCalledTimes(3); expect(ligandPropertyApi.savePreferences).toHaveBeenCalledTimes(1);
  });
});
