import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, molecularApi } from "../api/client";
import { ImportDialog } from "../components/ImportDialog";
import { TopBar } from "../components/TopBar";
import { molecularProject } from "./molecular-fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("checks the captured project before upload dispatch even with an enabled button", async () => {
  const user = userEvent.setup();
  const dispatch = vi.spyOn(molecularApi, "importStructures");
  const guard = vi.fn(() => { throw new ApiError(409, "quick_publication_busy", "Confirm pending minimization first."); });
  render(<QueryClientProvider client={new QueryClient()}><Tooltip.Provider><ImportDialog open
    project={molecularProject()} onOpenChange={vi.fn()} onImported={vi.fn()}
    assertWritable={guard} /></Tooltip.Provider></QueryClientProvider>);
  await user.upload(screen.getByLabelText(/Choose structure files/), new File(["sample"], "sample.mol"));
  await user.click(screen.getByRole("button", { name: /^Import$/ }));
  expect(screen.getByRole("alert")).toHaveTextContent("Confirm pending minimization first.");
  expect(guard).toHaveBeenCalledWith("project-1");
  expect(dispatch).not.toHaveBeenCalled();
});

it("disables import while retaining its draft and the ability to close the dialog", async () => {
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient()}><Tooltip.Provider><ImportDialog open writeBlocked
    project={molecularProject()} onOpenChange={vi.fn()} onImported={vi.fn()} /></Tooltip.Provider></QueryClientProvider>);
  await user.upload(screen.getByLabelText(/Choose structure files/), new File(["sample"], "sample.mol"));
  expect(screen.getByRole("button", { name: /^Import$/ })).toBeDisabled();
  expect(screen.getByText("sample.mol")).toBeVisible();
  expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeEnabled();
});

it.each([false, true])("keeps export and Jobs available during a write guard (compact=%s)", compact => {
  const project = molecularProject();
  render(<Tooltip.Provider><TopBar project={{ ...project, has_uncheckpointed_changes: true,
    history: { ...project.history, can_undo: true, can_redo: true } }}
    theme="light" busy readBusy={false} compact={compact} onProjects={vi.fn()}
    onSave={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} onImport={vi.fn()}
    onExport={vi.fn()} onJobs={vi.fn()} onTheme={vi.fn()} onMobilePanel={vi.fn()} /></Tooltip.Provider>);
  expect(screen.getByRole("button", { name: /^Export$/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: /^Jobs$/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: /^Import structures$/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /^Save checkpoint$/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /^Undo/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /^Redo/ })).toBeDisabled();
});
