import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectInspector } from "../components/ProjectInspector";
import { emptySelection } from "../selection/selection";
import { structureQueryKey } from "../structures/query";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("makes the retained inspector measurement unavailable after a failed current-source recheck", async () => {
  const source = proteinProjection();
  source.structure.atoms[0] = { ...source.structure.atoms[0], coordinates: [0, 0, 0] };
  source.structure.atoms[1] = { ...source.structure.atoms[1], coordinates: [0, 0, 3] };
  const project = molecularProject([molecularEntry("protein", "Protein", "protein")]);
  project.measurements = [{ id: "saved", name: "Saved distance", kind: "distance", visible: true,
    atom_references: [1, 2].map(atom_id => ({ structure_id: "protein", atom_id })), warnings: [],
    created_at: project.created_at, modified_at: project.modified_at }];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = structureQueryKey(project.id, "protein", project.entries[0].current_artifact_id);
  client.setQueryData(key, source);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Current coordinates unavailable"));
  const noop = () => undefined;
  render(<QueryClientProvider client={client}><Tooltip.Provider><ProjectInspector project={project} selection={emptySelection()}
    pickingGranularity="atom" busy={false} onApply={noop} onApplySelection={noop} onPickingGranularity={noop}
    onClearSelection={noop} onExpandSelection={noop} onInvertSelection={noop} onPredicateSelection={noop}
    onSpatialSelection={noop} onSaveSelection={noop} onLoadSelection={noop} onDeleteSelection={noop} />
  </Tooltip.Provider></QueryClientProvider>);
  await userEvent.setup().click(screen.getByRole("tab", { name: "measurements" }));
  const row = screen.getByLabelText("Name for Saved distance").closest(".measurement-row");
  await waitFor(() => expect(row).toHaveTextContent("3.00 Å"));
  await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
  expect(client.getQueryState(key)?.status).toBe("error");
  expect(client.getQueryData(key)).toBe(source);
  await waitFor(() => expect(row).toHaveTextContent("Unavailable"));
  expect(project.measurements).toHaveLength(1);
  act(() => { client.setQueryData(key, { ...source }); });
  await waitFor(() => expect(row).toHaveTextContent("3.00 Å"));
});
