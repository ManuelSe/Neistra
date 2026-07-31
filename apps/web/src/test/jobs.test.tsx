import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jobApi } from "../api/client";
import type { Job, JobDefinition } from "../api/types";
import { JobSubmitDialog } from "../components/JobSubmitDialog";
import { JobsPanel } from "../components/JobsPanel";
import { molecularProject } from "./molecular-fixtures";

const definition: JobDefinition = {
  plugin_name: "molweave.demo",
  job_type: "molweave.demo.structure_statistics",
  implementation_version: "1.0.0",
  label: "Structure statistics",
  description: "Calculate statistics and return a translated copy.",
  parameter_schema: {
    properties: {
      step_count: { type: "integer", title: "Steps", default: 5, minimum: 1, maximum: 100 },
      delay_ms: { type: "integer", title: "Delay per step (ms)", default: 100 },
      fail_at_step: { title: "Fail at step", default: null, anyOf: [] },
      translation: { type: "array", title: "Result translation", default: [0, 0, 0] },
    },
  },
  input_roles: [
    {
      role: "structure",
      label: "Structures",
      minimum: 1,
      maximum: 2,
      structure_types: ["protein", "ligand", "complex", "solvent", "unknown"],
    },
  ],
  result_roles: [
    {
      role: "structure",
      label: "Structure copy",
      media_types: ["application/vnd.molweave.normalized-structure+json"],
      importable_structure: true,
    },
  ],
};

function job(status: Job["status"] = "completed"): Job {
  return {
    id: "job-1",
    project_id: "project-1",
    plugin_name: "molweave.demo",
    job_type: definition.job_type,
    implementation_version: "1.0.0",
    status,
    parameters: { step_count: 2, delay_ms: 0 },
    progress: status === "completed" ? 100 : 35,
    status_message: status === "failed" ? "Demonstration failure" : "Statistics completed",
    result_values: { atom_count: 3 },
    warnings: [],
    error: status === "failed" ? { code: "plugin_execution_failed", message: "Configured failure" } : null,
    provenance: {},
    cancellation_requested: false,
    inputs: [
      {
        id: "input-1",
        ordinal: 0,
        role: "structure",
        entry_id: "ligand",
        entry_name: "Ligand",
        structure_type: "ligand",
        artifact_id: "artifact-input",
        artifact_sha256: "a".repeat(64),
        artifact_size: 100,
        media_type: "application/json",
        filename: "ligand.json",
      },
    ],
    results: status === "completed" ? [
      {
        id: "result-1",
        role: "structure",
        filename: "result.normalized.json",
        media_type: "application/vnd.molweave.normalized-structure+json",
        metadata: {},
        importable_structure: true,
        imported_entry_ids: [],
        created_at: "2026-07-31T10:00:01Z",
        artifact: {
          id: "artifact-result",
          filename: "result.normalized.json",
          media_type: "application/vnd.molweave.normalized-structure+json",
          sha256: "b".repeat(64),
          size: 2048,
          download_url: "/api/v1/artifacts/artifact-result",
        },
      },
    ] : [],
    created_at: "2026-07-31T10:00:00Z",
    started_at: "2026-07-31T10:00:00Z",
    completed_at: status === "running" ? null : "2026-07-31T10:00:01Z",
    modified_at: "2026-07-31T10:00:01Z",
  };
}

function renderWithQuery(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Tooltip.Provider>{element}</Tooltip.Provider>
    </QueryClientProvider>,
  );
}

describe("jobs", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("submits validated generic parameters and immutable role inputs", async () => {
    const user = userEvent.setup();
    vi.spyOn(jobApi, "definitions").mockResolvedValue([definition]);
    const submit = vi.spyOn(jobApi, "submit").mockResolvedValue(job("queued"));
    const onSubmitted = vi.fn();
    renderWithQuery(
      <JobSubmitDialog
        open
        project={molecularProject()}
        onOpenChange={vi.fn()}
        onSubmitted={onSubmitted}
      />,
    );

    await user.click(await screen.findByLabelText(/^Ligand/));
    await user.clear(screen.getByLabelText("Steps"));
    await user.type(screen.getByLabelText("Steps"), "2");
    await user.clear(screen.getByLabelText("Result translation X"));
    await user.type(screen.getByLabelText("Result translation X"), "1.5");
    await user.click(screen.getByRole("button", { name: "Queue job" }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith(
      "project-1",
      definition.job_type,
      expect.objectContaining({ step_count: 2, translation: [1.5, 0, 0] }),
      [{ role: "structure", entry_id: "ligand" }],
    ));
    expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }));
  });

  it("inspects logs, downloads and imports a completed structure result", async () => {
    const user = userEvent.setup();
    vi.spyOn(jobApi, "list").mockResolvedValue([job()]);
    vi.spyOn(jobApi, "events").mockResolvedValue([
      {
        id: 1,
        job_id: "job-1",
        sequence: 1,
        kind: "log",
        stream: "stdout",
        message: "Calculated statistics",
        data: {},
        created_at: "2026-07-31T10:00:00Z",
      },
    ]);
    const nextProject = { ...molecularProject(), revision: 3 };
    const importResult = vi.spyOn(jobApi, "importResult").mockResolvedValue({
      project: nextProject,
      imported_entry_id: "generated-entry",
    });
    const onProjectUpdate = vi.fn();
    renderWithQuery(
      <JobsPanel
        project={molecularProject()}
        onNewJob={vi.fn()}
        onProjectUpdate={onProjectUpdate}
        onNotice={vi.fn()}
      />,
    );

    expect((await screen.findAllByText("Statistics completed")).length).toBe(2);
    await user.click(screen.getByRole("tab", { name: "Logs" }));
    expect(await screen.findByText("Calculated statistics")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Results (1)" }));
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/v1/artifacts/artifact-result",
    );
    await user.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(importResult).toHaveBeenCalled());
    expect(onProjectUpdate).toHaveBeenCalledWith(nextProject);
  });

  it("shows structured failures and confirms running-job cancellation", async () => {
    const user = userEvent.setup();
    vi.spyOn(jobApi, "list").mockResolvedValue([job("failed"), { ...job("running"), id: "job-2" }]);
    vi.spyOn(jobApi, "events").mockResolvedValue([]);
    const cancel = vi.spyOn(jobApi, "cancel").mockResolvedValue({ ...job("cancelled"), id: "job-2" });
    renderWithQuery(
      <JobsPanel
        project={molecularProject()}
        onNewJob={vi.fn()}
        onProjectUpdate={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    expect(await screen.findByText("plugin_execution_failed")).toBeInTheDocument();
    await user.click(screen.getByText("running"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Cancel job" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel job" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("job-2"));
  });
});
