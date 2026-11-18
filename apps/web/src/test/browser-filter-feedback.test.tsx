import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Project } from "../api/types";
import { matchesBrowserFilters } from "../browser/filtering";
import { LigandDesignationControls } from "../components/LigandDesignationControls";
import { LigandInformation } from "../components/LigandInformation";
import { InspectorPublications } from "../components/inspectorPublications";
import { ligandApi } from "../ligands/api";
import { propertyProject } from "./ligand-properties-fixtures";

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
function rect(top: number): DOMRect {
  return { top, left: 0, width: 300, height: 30, right: 300, bottom: top + 30, x: 0, y: top, toJSON: () => ({}) };
}

it("keeps a focused inspector control and task offset when retained filter feedback appears on rename and disappears on Undo", () => {
  const project = propertyProject(); project.entries[0].original_filename = "uploaded.sdf";
  const initial = structuredClone(project), filters = { search: "ethanol", type: "all" } as const;
  vi.spyOn(ligandApi, "candidates").mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const publications = new InspectorPublications();
  const tree = (current: Project) => <QueryClientProvider client={client}><Tooltip.Provider>
    <div className="inspector-scroll" data-inspector-visit="unchanged-current-task" aria-label="Current scroll owner"><div className="inspector-body">
      <LigandInformation scope={project.entries[0].id} publications={publications} complex={false}>
        <LigandDesignationControls project={current} entryId={current.entries[0].id} informationHeader
          outsideCurrentFilters={!matchesBrowserFilters(current.entries[0], filters)} onInspectEntry={() => {}}
          busy={false} pausedReason={null} onDesignate={() => Promise.resolve()} />
        <details><summary>Current methods control</summary><p>Current method details</p></details>
      </LigandInformation>
    </div></div>
  </Tooltip.Provider></QueryClientProvider>;
  const view = render(tree(project));
  const owner = screen.getByLabelText("Current scroll owner"), control = screen.getByText("Current methods control");
  let scroll = 150;
  const writes: number[] = [];
  Object.defineProperty(owner, "scrollTop", { configurable: true, get: () => scroll, set: (value: number) => { scroll = value; writes.push(value); } });
  vi.spyOn(owner, "getBoundingClientRect").mockImplementation(() => rect(50));
  vi.spyOn(control, "getBoundingClientRect").mockImplementation(() => rect(450
    + (screen.queryByText("Outside current filters", { exact: true }) ? 108.4375 : 0) - scroll));
  control.focus(); const before = control.getBoundingClientRect().top;
  view.rerender(tree({ ...project, revision: project.revision + 1,
    entries: [{ ...project.entries[0], name: "Renamed" }] }));
  expect(screen.getByText("Outside current filters", { exact: true })).toBeVisible();
  expect(control).toHaveFocus(); expect(control.getBoundingClientRect().top).toBe(before);
  expect(owner.dataset.inspectorVisit).toBe("unchanged-current-task");
  view.rerender(tree({ ...project, revision: project.revision + 2 }));
  expect(screen.queryByText("Outside current filters", { exact: true })).toBeNull();
  expect(screen.getByText("Current methods control")).toBe(control); expect(control).toHaveFocus();
  expect(control.getBoundingClientRect().top).toBe(before); expect(writes).toEqual([258.4375, 150]);
  expect(project).toEqual(initial);
});
