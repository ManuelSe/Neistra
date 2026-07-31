import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, FileInput, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, jobApi } from "../api/client";
import type { Job, Project } from "../api/types";
import { Modal } from "./Modal";

interface JobsPanelProps {
  project: Project | undefined;
  onNewJob: () => void;
  onProjectUpdate: (project: Project) => void;
  onNotice: (kind: "success" | "error", text: string) => void;
}

function displayError(error: unknown) {
  return error instanceof ApiError ? error.message : "The job operation failed.";
}

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export function JobsPanel({
  project,
  onNewJob,
  onProjectUpdate,
  onNotice,
}: JobsPanelProps) {
  const queryClient = useQueryClient();
  const projectId = project?.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "logs" | "results">("overview");
  const [cancelJob, setCancelJob] = useState<Job | null>(null);
  const jobsQuery = useQuery({
    queryKey: ["jobs", project?.id],
    queryFn: () => jobApi.list(project?.id ?? ""),
    enabled: !!project,
    retry: false,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((job) => job.status === "queued" || job.status === "running")
        ? 500
        : 3000,
  });
  const jobs = jobsQuery.data ?? [];
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];
  const eventsQuery = useQuery({
    queryKey: ["job-events", selected?.id],
    queryFn: () => jobApi.events(selected?.id ?? ""),
    enabled: !!selected,
    retry: false,
    refetchInterval: selected?.status === "queued" || selected?.status === "running" ? 500 : false,
  });

  useEffect(() => {
    if (!projectId) return;
    let socket: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${window.location.host}/ws/jobs?project_id=${encodeURIComponent(projectId)}`,
      );
      socket.onmessage = () => {
        void queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
        if (selectedId) void queryClient.invalidateQueries({ queryKey: ["job-events", selectedId] });
      };
    } catch {
      socket = null;
    }
    return () => socket?.close();
  }, [projectId, queryClient, selectedId]);

  const cancel = useMutation({
    mutationFn: (job: Job) => jobApi.cancel(job.id),
    onSuccess: (job) => {
      queryClient.setQueryData<Job[]>(["jobs", project?.id], (current = []) =>
        current.map((item) => (item.id === job.id ? job : item)),
      );
      setCancelJob(null);
      onNotice("success", "Cancellation requested.");
    },
    onError: (error) => onNotice("error", displayError(error)),
  });
  const importResult = useMutation({
    mutationFn: ({ job, resultId }: { job: Job; resultId: string }) =>
      jobApi.importResult(job.id, resultId, project!),
    onSuccess: (result) => {
      onProjectUpdate(result.project);
      void queryClient.invalidateQueries({ queryKey: ["jobs", project?.id] });
      onNotice("success", "Job result imported into the project.");
    },
    onError: (error) => onNotice("error", displayError(error)),
  });
  const orderedEvents = useMemo(
    () => [...(eventsQuery.data ?? [])].sort((a, b) => a.sequence - b.sequence),
    [eventsQuery.data],
  );

  if (!project) return <p className="empty-label">Open a project to inspect jobs.</p>;
  return (
    <div className="jobs-workspace">
      <div className="jobs-list-pane">
        <div className="jobs-toolbar">
          <strong>Jobs</strong>
          <button type="button" className="secondary-button compact-button" onClick={onNewJob}>
            <Plus size={14} /> New
          </button>
        </div>
        {jobsQuery.isError ? (
          <div className="job-query-error" role="alert">
            <span>Jobs unavailable</span>
            <button type="button" onClick={() => void jobsQuery.refetch()}><RefreshCw size={14} /> Retry</button>
          </div>
        ) : jobs.length === 0 ? (
          <p className="empty-label">No jobs in this project.</p>
        ) : (
          <div className="job-list">
            {jobs.map((job) => (
              <button
                type="button"
                key={job.id}
                className={job.id === selected?.id ? "active" : ""}
                onClick={() => setSelectedId(job.id)}
              >
                <span className="job-list-title">{job.job_type.split(".").at(-1)?.replaceAll("_", " ")}</span>
                <span className={`job-status ${job.status}`}>{job.status}</span>
                <small>{job.status_message}</small>
                <progress value={job.progress} max={100} aria-label={`${job.progress}% complete`} />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="job-detail-pane">
        {!selected ? (
          <p className="empty-label">Select or submit a job.</p>
        ) : (
          <>
            <div className="job-detail-header">
              <div>
                <strong>{selected.job_type.split(".").at(-1)?.replaceAll("_", " ")}</strong>
                <span>{selected.id}</span>
              </div>
              {selected.status === "queued" || selected.status === "running" ? (
                <button type="button" className="danger-button compact-button" onClick={() => setCancelJob(selected)}>
                  <Ban size={14} /> Cancel
                </button>
              ) : null}
            </div>
            <div className="job-detail-tabs" role="tablist" aria-label="Job details">
              {(["overview", "logs", "results"] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={detailTab === tab} onClick={() => setDetailTab(tab)}>
                  {tab[0].toUpperCase() + tab.slice(1)}
                  {tab === "results" && selected.results.length ? ` (${selected.results.length})` : ""}
                </button>
              ))}
            </div>
            {detailTab === "logs" ? (
              <div className="job-log" aria-label="Job logs">
                {orderedEvents.length === 0 ? <p>No events.</p> : orderedEvents.map((event) => (
                  <div key={event.id} className={event.stream === "stderr" ? "stderr" : ""}>
                    <time>{new Date(event.created_at).toLocaleTimeString()}</time>
                    <span>{event.stream ?? event.kind}</span>
                    <p>{event.message}</p>
                  </div>
                ))}
              </div>
            ) : detailTab === "results" ? (
              <div className="job-results">
                {selected.results.length === 0 ? <p className="empty-label">No result artifacts.</p> : selected.results.map((result) => (
                  <div key={result.id}>
                    <div>
                      <strong>{result.filename}</strong>
                      <span>{result.role} - {(result.artifact.size / 1024).toFixed(1)} KiB</span>
                    </div>
                    <a className="secondary-button compact-button" href={result.artifact.download_url} download={result.filename}>
                      <Download size={14} /> Download
                    </a>
                    {result.importable_structure ? (
                      <button
                        type="button"
                        className="primary-button compact-button"
                        disabled={importResult.isPending}
                        onClick={() => importResult.mutate({ job: selected, resultId: result.id })}
                      >
                        <FileInput size={14} /> Import
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="job-overview">
                <div className="job-progress-row">
                  <span className={`job-status ${selected.status}`}>{selected.status}</span>
                  <progress value={selected.progress} max={100} />
                  <strong>{selected.progress.toFixed(0)}%</strong>
                </div>
                <p>{selected.status_message}</p>
                {selected.error ? (
                  <div className="job-error" role="alert"><strong>{selected.error.code}</strong><span>{selected.error.message}</span></div>
                ) : null}
                <dl>
                  <dt>Plugin</dt><dd>{selected.plugin_name}</dd>
                  <dt>Version</dt><dd>{selected.implementation_version}</dd>
                  <dt>Created</dt><dd>{timestamp(selected.created_at)}</dd>
                  <dt>Started</dt><dd>{timestamp(selected.started_at)}</dd>
                  <dt>Completed</dt><dd>{timestamp(selected.completed_at)}</dd>
                  <dt>Inputs</dt><dd>{selected.inputs.map((item) => `${item.role}: ${item.entry_name}`).join(", ")}</dd>
                </dl>
                <details><summary>Parameters</summary><pre>{JSON.stringify(selected.parameters, null, 2)}</pre></details>
                {Object.keys(selected.result_values).length ? <details><summary>Result values</summary><pre>{JSON.stringify(selected.result_values, null, 2)}</pre></details> : null}
              </div>
            )}
          </>
        )}
      </div>
      <Modal
        open={cancelJob !== null}
        onOpenChange={(open) => !open && setCancelJob(null)}
        title="Cancel job"
        description="Stop queued or running plugin work."
      >
        <div className="confirm-dialog">
          <p>Cancel this job? Running plugin work will be stopped and cannot be resumed.</p>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setCancelJob(null)}>Keep running</button>
            <button type="button" className="danger-button" disabled={cancel.isPending} onClick={() => cancelJob && cancel.mutate(cancelJob)}>Cancel job</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
