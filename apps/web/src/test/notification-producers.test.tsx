import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { projectApi } from "../api/client";
import type { ImportResult, MolecularWarning } from "../api/types";
import type { ProjectInspector } from "../components/ProjectInspector";
import { useWorkspaceStore } from "../store/workspace";
import { molecularProject } from "./molecular-fixtures";

// Exercise App's real result handlers; child panels and backend transport are boundaries.
const callbacks = vi.hoisted(() => ({
  inspector: null as Parameters<typeof ProjectInspector>[0] | null,
  imported: null as ((result: ImportResult) => void) | null,
}));
vi.mock("../components/ProjectInspector", () => ({
  ProjectInspector: (props: Parameters<typeof ProjectInspector>[0]) => { callbacks.inspector = props; return null; },
}));
vi.mock("../components/ImportDialog", () => ({
  ImportDialog: (props: { onImported: (result: ImportResult) => void }) => { callbacks.imported = props.onImported; return null; },
}));

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each(["import", "ligand", "protein"] as const)("classifies %s results from structured warnings, independently of success styling", async kind => {
  const project = molecularProject([]);
  useWorkspaceStore.setState({ activeProjectId: project.id, mobilePanel: null });
  vi.spyOn(globalThis, "fetch").mockImplementation(input => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(new Response(JSON.stringify(
      path.endsWith(`/projects/${project.id}`) ? project : [{ ...project, entry_count: 0 }],
    ), { headers: { "Content-Type": "application/json" } }));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  await waitFor(() => expect(callbacks.inspector?.project?.id).toBe(project.id));
  vi.useFakeTimers();

  const emit = async (warnings: MolecularWarning[]) => {
    if (kind === "import") {
      callbacks.imported!({ project, warnings, imported_entry_ids: ["entry"] });
    } else if (kind === "ligand") {
      vi.spyOn(projectApi, "ligandEdit").mockResolvedValue({ project, warnings, report: {
        operation: "hydrogen.remove", created_atom_ids: [], created_bond_ids: [], deleted_atom_ids: [],
        deleted_bond_ids: [], changed_atom_ids: [], force_field: null, converged: null,
      } });
      await callbacks.inspector!.onLigandEdit!("entry", { operation: "hydrogen.remove", atom_ids: null });
    } else {
      vi.spyOn(projectApi, "proteinEdit").mockResolvedValue({ project, warnings, report: {
        operation: "protein.hydrogen.remove", created_atom_ids: [], created_bond_ids: [], deleted_atom_ids: [],
        deleted_bond_ids: [], changed_atom_ids: [], changed_residue_ids: [], deleted_residue_ids: [],
        changed_chain_ids: [], deleted_chain_ids: [],
      } });
      await callbacks.inspector!.onProteinEdit!("entry", { operation: "protein.hydrogen.remove", residue_ids: null });
    }
  };
  await act(async () => { await emit([{ code: "uncertain_chemistry", message: "Check chemistry.", severity: "warning", operation: "test", field: null, blocking: false }]); });
  expect(screen.getByRole("status")).toHaveTextContent(/warning/);
  await act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByRole("status")).toBeInTheDocument();
  await act(async () => { await emit([]); });
  await act(() => vi.advanceTimersByTime(9_999));
  expect(screen.getByRole("status")).toBeInTheDocument();
  await act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  client.clear();
});
