import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MolecularEditingPorts } from "../editing/ports";
import { WorkspaceCanvas } from "../components/WorkspaceCanvas";
import { molecularEntry, molecularProject } from "./molecular-fixtures";
const observed = vi.hoisted(() => vi.fn());
vi.mock("../components/StructureViewer", () => ({ StructureViewer: (props: MolecularEditingPorts) => { observed(props); return <div>{props.editAttempt?.phase}</div>; } }));
afterEach(() => { cleanup(); observed.mockClear(); });
it("forwards every App-owned editing port through the workspace bridge and replaces state on project change", () => {
  const project = molecularProject([molecularEntry("ligand", "Ligand", "ligand")]);
  const ports: Required<MolecularEditingPorts> = { onEdit: vi.fn(), editAttempt: { phase: "submitting", identity: null, error: null },
    onCheckEdit: vi.fn(), onReviewEdit: vi.fn(), onContinueEdit: vi.fn(), editReviewCurrent: true, onGeometry: vi.fn(), onRecoverResidue: vi.fn() };
  const common = { theme: "light" as const, selection: { schema_version: 1 as const, atoms: [], granularity: "atom" as const, source: "viewer" as const },
    pickingGranularity: "atom" as const, onPickingGranularity: vi.fn(), onViewerSelection: vi.fn(), loading: false, onCreate: vi.fn(), onImport: vi.fn(),
    selectionColorMode: "all" as const, onSelectionColorModeChange: vi.fn() };
  const view = render(<WorkspaceCanvas {...common} {...ports} project={project} />);
  expect(screen.getByText("submitting")).toBeVisible(); expect(observed).toHaveBeenLastCalledWith(expect.objectContaining(ports));
  const next = { ...ports, editAttempt: { phase: "unknown" as const, identity: null, error: "Check this project" }, editReviewCurrent: false };
  view.rerender(<WorkspaceCanvas {...common} {...next} project={{ ...project, id: "other" }} />);
  expect(screen.getByText("unknown")).toBeVisible(); expect(observed).toHaveBeenLastCalledWith(expect.objectContaining(next));
});
it("keeps App-owned recovery reachable when the current project has no structure viewer", () => {
  const check = vi.fn().mockResolvedValue(undefined), review = vi.fn().mockResolvedValue(undefined);
  render(<WorkspaceCanvas project={molecularProject([])} theme="light" selection={{ schema_version: 1, atoms: [], granularity: "atom", source: "viewer" }}
    pickingGranularity="atom" onPickingGranularity={vi.fn()} onViewerSelection={vi.fn()} loading={false} busy
    onCreate={vi.fn()} onImport={vi.fn()} onNewMolecule={vi.fn()} selectionColorMode="all" onSelectionColorModeChange={vi.fn()}
    editAttempt={{ phase: "unknown", identity: null, error: "Earlier edit information is unreadable", canReview: true,
      journalRecovery: { kind: "invalid", markerId: "private-marker", acknowledged: false } }} onCheckEdit={check} onReviewEdit={review} />);
  expect(screen.getByLabelText("Molecular edit recovery")).toBeVisible(); expect(screen.getByRole("button", { name: "Review current state" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "New molecule" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Import structures" })).toBeDisabled();
});
