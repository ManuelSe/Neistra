import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { projectApi } from "../api/client";
import type { Contact, Project } from "../api/types";
import { MeasurementContacts } from "../components/MeasurementContacts";
import { MeasurementSession, type MeasurementContext } from "../measurements/session";
import { useSelectionStore } from "../store/selection";
import { useWorkspaceStore } from "../store/workspace";
import { molecularEntry, molecularProject, proteinStructure } from "./molecular-fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { useSelectionStore.getState().setProject(null); });
const rows: Contact[] = [{ atom_1: { structure_id: "entry", atom_id: 1 }, atom_2: { structure_id: "entry", atom_id: 2 }, distance: 2.4 }];
function setup(preferred: string | null = null) {
  const project = molecularProject([{ ...molecularEntry("entry", "Protein", "protein"), visible: false, locked: true }]);
  const query = new QueryClient(); query.setQueryData(["project", project.id], project);
  useWorkspaceStore.setState({ activeProjectId: project.id }); useSelectionStore.getState().setProject(project.id);
  let paused = false;
  const session = new MeasurementSession({
    context: (): MeasurementContext => ({ project: query.getQueryData<Project>(["project", project.id]), activeProjectId: useWorkspaceStore.getState().activeProjectId,
      selectionProjectId: useSelectionStore.getState().projectId, projectEpoch: useSelectionStore.getState().projectEpoch, paused, busy: false }),
    structures: () => new Map([["entry", proteinStructure()]]), create: () => Promise.resolve(),
  });
  session.open(); const select = vi.fn();
  const view = render(<QueryClientProvider client={query}><MeasurementContacts project={project} session={session} preferredEntryId={preferred} paused={false} onSelect={select} /></QueryClientProvider>);
  return { project, query, session, select, view, pause: (value: boolean) => { paused = value; session.guardContext(); } };
}

it("requires deliberate entry choice and permits a hidden locked protein with current-source binding", async () => {
  const contacts = vi.spyOn(projectApi, "contacts").mockResolvedValue(rows);
  const f = setup(); const user = userEvent.setup();
  expect(screen.getByLabelText("Structure")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Find contacts" })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Structure"), "entry");
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  await screen.findByRole("button", { name: "Atoms 1–2 2.40 Å" });
  expect(contacts).toHaveBeenCalledOnce();
  expect(contacts.mock.calls[0].slice(0, 4)).toEqual([{ id: f.project.id }, "entry", 2, 0.5]);
  expect(contacts.mock.calls[0][4]?.expectedArtifactId).toBe("current-entry");
  expect(contacts.mock.calls[0][4]?.signal).toBeInstanceOf(AbortSignal);
  await user.click(screen.getByRole("button", { name: "Atoms 1–2 2.40 Å" }));
  expect(f.select).toHaveBeenCalledExactlyOnceWith([rows[0].atom_1, rows[0].atom_2]);
});

it("never substitutes the first entry for an invalid inspected target", () => {
  setup("deleted"); expect(screen.getByLabelText("Structure")).toHaveValue("");
});

it("aborts and discards a held completion after settings change without an automatic retry", async () => {
  let finish!: (rows: Contact[]) => void;
  const contacts = vi.spyOn(projectApi, "contacts").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  setup("entry"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  const signal = contacts.mock.calls[0][4]?.signal;
  await user.clear(screen.getByLabelText("Cutoff (Å)")); await user.type(screen.getByLabelText("Cutoff (Å)"), "3");
  expect(signal?.aborted).toBe(true);
  await act(async () => { finish(rows); await Promise.resolve(); });
  expect(screen.queryByRole("button", { name: /^Atoms/ })).toBeNull(); expect(contacts).toHaveBeenCalledOnce();
});

it.each(["source", "preview", "visit"] as const)("permanently retires result actions across %s replacement and restoration before React rerenders", async change => {
  vi.spyOn(projectApi, "contacts").mockResolvedValue(rows);
  const f = setup("entry"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  const button = await screen.findByRole("button", { name: "Atoms 1–2 2.40 Å" });
  act(() => {
    if (change === "source") {
      f.query.setQueryData(["project", f.project.id], { ...f.project, entries: [{ ...f.project.entries[0], current_artifact_id: "replacement" }] });
      f.query.setQueryData(["project", f.project.id], f.project);
    } else if (change === "preview") { f.pause(true); f.pause(false); }
    else { useWorkspaceStore.getState().setActiveProjectId("other"); useWorkspaceStore.getState().setActiveProjectId(f.project.id); }
    fireEvent.click(button);
  });
  expect(f.select).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: /^Atoms/ })).toBeNull();
});

it("shows whole capacity refusal without an empty-success claim and bounds complete result DOM to50", async () => {
  const contacts = vi.spyOn(projectApi, "contacts").mockRejectedValueOnce(new Error("Contact analysis exceeded capacity."))
    .mockResolvedValueOnce(Array.from({ length: 1000 }, (_, i) => ({ ...rows[0], atom_2: { structure_id: "entry", atom_id: i + 2 } })));
  setup("entry"); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("exceeded capacity");
  expect(screen.queryByText("0 contacts")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Find contacts" }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: /^Atoms/ })).toHaveLength(50));
  expect(screen.getByText("1000 contacts")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next contact page" }));
  expect(screen.getAllByRole("button", { name: /^Atoms/ })).toHaveLength(50); expect(contacts).toHaveBeenCalledTimes(2);
});
