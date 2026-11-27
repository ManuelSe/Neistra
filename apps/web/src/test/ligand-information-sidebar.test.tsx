import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { molecularApi } from "../api/client";
import { LigandInformation } from "../components/LigandInformation";
import { InspectorPublications } from "../components/inspectorPublications";
import { ProjectInspector, type InspectorTask, type InspectorView } from "../components/ProjectInspector";
import { emptySelection } from "../selection/selection";
import { deferredProperty, propertyProject } from "./ligand-properties-fixtures";
import { proteinProjection } from "./molecular-fixtures";

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const project = propertyProject(), collapse = vi.fn(), apply = vi.fn();
  const response = deferredProperty<ReturnType<typeof proteinProjection>>();
  const read = vi.spyOn(molecularApi, "structure").mockReturnValue(response.promise);
  const publications = new InspectorPublications();
  function Content() {
    const [profile, setProfile] = useState("");
    return <LigandInformation scope="entry-a" publications={publications} complex={false}>
      <label>Entry<select defaultValue="entry-a"><option value="entry-a">Ethanol</option></select></label>
      <p>Exact ligand information</p><p>{profile ? "Deliberately changed comparison" : "Initial comparison"}</p>
      <label>Profile<select value={profile} onChange={event => { publications.publish(); setProfile(event.target.value); }}>
        <option value="">No profile</option><option value="comparison">Comparison</option></select></label>
    </LigandInformation>;
  }
  function Host({ visible }: { visible: boolean }) {
    const [view, setView] = useState<InspectorView>("ligand"), [task, setTask] = useState<InspectorTask>("selection");
    return visible ? <ProjectInspector project={project} view={view} onViewChange={setView} task={task} onTaskChange={setTask}
      selection={emptySelection()} pickingGranularity="atom" busy={false} onCollapse={collapse} onApply={apply}
      ligandControls={<Content />}
      onApplySelection={() => {}} onPickingGranularity={() => {}} onClearSelection={() => {}}
      onExpandSelection={() => {}} onInvertSelection={() => {}} onPredicateSelection={() => {}}
      onSpatialSelection={() => {}} onSaveSelection={() => {}} onLoadSelection={() => {}} onDeleteSelection={() => {}} /> : null;
  }
  const tree = (visible = true) => <QueryClientProvider client={client}><Tooltip.Provider><Host visible={visible} /></Tooltip.Provider></QueryClientProvider>;
  const rendered = render(tree());
  return { project, read, collapse, apply,
    hide: () => rendered.rerender(tree(false)), show: () => rendered.rerender(tree()),
    finishStructure: async () => {
      const projection = { ...proteinProjection(), entry_id: project.entries[0].id, artifact_id: project.entries[0].current_artifact_id! };
      await act(async () => { response.resolve(projection); await response.promise; });
    }, ...rendered };
}

describe("primary ligand information and retained tools", () => {
  it("starts with ligand information, one scroll owner and no normalized molecular reads for the header", () => {
    const app = setup();
    expect(screen.getByRole("heading", { name: "Ligand information" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Entry" })).toBeVisible();
    expect(screen.queryByRole("tablist", { name: "Inspector views" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspector tools" })).toBeVisible();
    expect(app.container.querySelectorAll(".inspector-scroll")).toHaveLength(1); expect(app.read).not.toHaveBeenCalled();
  });
  it("opens retained tools in one action and preserves its mounted selection draft across view changes", async () => {
    const app = setup(); await userEvent.click(screen.getByRole("button", { name: "Inspector tools" }));
    expect(screen.getByRole("tab", { name: "selection" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Exact ligand information")).not.toBeInTheDocument();
    await waitFor(() => expect(app.read).toHaveBeenCalledTimes(1)); await app.finishStructure();
    const query = screen.getByRole("textbox", { name: "Value" }); await userEvent.type(query, "C13");
    await userEvent.click(screen.getByRole("button", { name: "Ligand information" }));
    expect(screen.getByRole("combobox", { name: "Profile" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Value" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Inspector tools" }));
    expect(screen.getByRole("textbox", { name: "Value" })).toBe(query); expect(query).toHaveValue("C13");
    expect(app.read).toHaveBeenCalledTimes(1);
  });
  it("keeps the deliberate view and task above presenter hiding/remounts", async () => {
    const app = setup(); await userEvent.click(screen.getByRole("button", { name: "Inspector tools" }));
    await userEvent.click(screen.getByRole("tab", { name: "details" }));
    app.hide(); expect(screen.queryByRole("region", { name: "Project inspector" })).not.toBeInTheDocument(); app.show();
    expect(screen.getByRole("tab", { name: "details" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Project" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Ligand information" })); app.hide(); app.show();
    expect(screen.getByRole("heading", { name: "Ligand information" })).toBeVisible();
  });
  it("keeps the real collapse action reachable in either view", async () => {
    const app = setup(); await userEvent.click(screen.getByRole("button", { name: "Collapse inspector" }));
    expect(app.collapse).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Inspector tools" }));
    await userEvent.click(screen.getByRole("button", { name: "Collapse inspector" })); expect(app.collapse).toHaveBeenCalledTimes(2);
  });
  it("yields reading-position compensation to a real deliberate profile change in the same publication commit", async () => {
    const app = setup(), owner = app.container.querySelector<HTMLElement>(".inspector-scroll")!;
    const control = screen.getByRole("combobox", { name: "Profile" });
    const rect = (top: number): DOMRect => ({ top, left: 0, width: 300, height: 30, right: 300, bottom: top + 30,
      x: 0, y: top, toJSON: () => ({}) });
    let scroll = 150;
    const writes: number[] = [];
    Object.defineProperty(owner, "scrollTop", { configurable: true, get: () => scroll, set: (value: number) => { scroll = value; writes.push(value); } });
    vi.spyOn(owner, "getBoundingClientRect").mockImplementation(() => rect(50));
    vi.spyOn(control, "getBoundingClientRect").mockImplementation(() => rect(450
      + (screen.queryByText("Deliberately changed comparison") ? 108.4375 : 0) - scroll));
    const visit = owner.dataset.inspectorVisit; control.focus();
    await userEvent.selectOptions(control, "comparison");
    expect(control).toHaveFocus(); expect(owner.dataset.inspectorVisit).not.toBe(visit);
    expect(screen.getByText("Deliberately changed comparison")).toBeVisible(); expect(writes).toEqual([]);
  });
  it("keeps the future interaction boundary complex-only and unavailable without an inferred target", () => {
    const publications = new InspectorPublications();
    const view = render(<LigandInformation scope="entry" publications={publications} complex={false}>Ligand</LigandInformation>);
    expect(screen.queryByText("Interactions")).not.toBeInTheDocument();
    view.rerender(<LigandInformation scope="entry" publications={publications} complex>Ligand</LigandInformation>);
    expect(screen.getByText("Interactions")).toBeInTheDocument();
    expect(screen.getByText(/Interaction diagram unavailable/)).toHaveTextContent("choose exact ligand and protein inputs");
    expect(screen.queryByRole("button", { name: /generat/i })).not.toBeInTheDocument();
  });
});
