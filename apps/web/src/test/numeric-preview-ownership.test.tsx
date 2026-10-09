import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import type { ProjectInspector } from "../components/ProjectInspector";
import type { WorkspaceCanvas } from "../components/WorkspaceCanvas";
import { canonicalSelection } from "../selection/selection";
import { useSelectionStore } from "../store/selection";
import { useWorkspaceStore } from "../store/workspace";
import { molecularProject, proteinProjection } from "./molecular-fixtures";

const seen = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("../components/WorkspaceCanvas", () => ({
  WorkspaceCanvas: function Canvas(props: ComponentProps<typeof WorkspaceCanvas>) {
    seen.preview(props.coordinatePreview);
    const { onRenderedMovementAtoms } = props;
    useEffect(() => {
      onRenderedMovementAtoms?.(() => [{ structure_id: "protein", atom_id: 1 }]);
    }, [onRenderedMovementAtoms]);
    return <output data-testid="phase">{props.movement?.state.phase}</output>;
  },
}));
vi.mock("../components/ProjectInspector", () => ({
  ProjectInspector: function Inspector(props: ComponentProps<typeof ProjectInspector>) {
    return <>
      <button onClick={() => { void props.onPreviewTransform?.({ entry_id: "protein", scope: "structure",
        selection: props.selection, translation: [1, 0, 0], rotation_degrees: [0, 0, 0], pivot_mode: "structure_centroid", pivot: null }); }}>Numerical preview</button>
      <button onClick={() => { props.onClearTransformPreview?.(); props.movement?.start(); }}>Start movement</button>
      <button onClick={() => props.movement?.cancel()}>Cancel movement</button>
      <button onClick={props.onClearTransformPreview}>Clear preview</button>
    </>;
  },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
it("discards a delayed numerical preview cleared by movement while retaining valid numerical previews", async () => {
  const project = molecularProject();
  const projection = proteinProjection();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(["project", project.id], project);
  useWorkspaceStore.setState({ activeProjectId: project.id, mobilePanel: null, theme: "light" });
  let finish!: () => void;
  let requested = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(input => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (path.endsWith("/entries/protein/structure")) {
      requested = true;
      return new Promise<Response>(resolve => { finish = () => resolve(Response.json(projection)); });
    }
    return Promise.resolve(Response.json(path.endsWith(`/projects/${project.id}`) ? project
      : path === "/api/v1/projects" ? [{ ...project, entry_count: project.entries.length }] : []));
  });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Start movement" });
  await waitFor(() => expect(document.querySelector(".project-switcher-label")).toHaveTextContent(project.name));
  act(() => useSelectionStore.getState().replace(canonicalSelection([{ structure_id: "protein", atom_id: 1 }])));
  await user.click(screen.getByRole("button", { name: "Numerical preview" }));
  await waitFor(() => expect(requested).toBe(true));
  await user.click(screen.getByRole("button", { name: "Start movement" }));
  await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("loading"));
  seen.preview.mockClear();
  await act(async () => { finish(); await Promise.resolve(); });
  await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("active"));
  await user.click(screen.getByRole("button", { name: "Cancel movement" }));
  await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("idle"));
  expect(seen.preview.mock.calls.every(([preview]) => preview == null)).toBe(true);
  expect(client.getQueryData(["structure", project.id, "protein", "current-protein"])).toEqual(projection);
  await user.click(screen.getByRole("button", { name: "Numerical preview" }));
  await waitFor(() => expect(seen.preview.mock.calls.some(([preview]) => preview != null)).toBe(true));
  seen.preview.mockClear();
  await user.click(screen.getByRole("button", { name: "Clear preview" }));
  expect(seen.preview.mock.calls.at(-1)?.[0]).toBeNull();
  expect(client.getQueryData(["structure", project.id, "protein", "current-protein"])).toEqual(projection);
  client.clear();
});
