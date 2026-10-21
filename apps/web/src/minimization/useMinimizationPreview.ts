import { useMinimizationStore } from "./store";
import { useEffect, useMemo, useRef } from "react";
import { replaceEqualDeep, useQuery, useQueryClient } from "@tanstack/react-query";
import { jobApi, minimizationApi, quickMinimizationApi } from "../api/client";
import type { MinimizationLive, MinimizationProposal, QuickMinimizationProposal, Project } from "../api/types";
import { coordinatePatches } from "./preview";
import type { MinimizationWorkflow } from "./useMinimization";

/** Render-local subscription; frames never rerender App or its selection inspector. */
export function useMinimizationPreview(project: Project, workflow?: MinimizationWorkflow) {
  const query = useQueryClient();
  const state = useMinimizationStore(), open = workflow?.open ?? false;
  const jobQuery = useQuery({ queryKey: ["job", state.jobId], queryFn: () => jobApi.get(state.jobId!), enabled: open && !!state.jobId,
    retry: false, refetchInterval: q => q.state.data && ["queued", "running"].includes(q.state.data.status) ? 400 : false });
  const job = open && jobQuery.data?.id === state.jobId ? jobQuery.data : undefined;
  const quick = job?.job_type === "coordinates.quick_minimize" || state.profile === "quick";
  const reportQuery = useQuery<MinimizationProposal | QuickMinimizationProposal>({ queryKey: ["minimization-proposal", project?.id, job?.id],
    queryFn: () => quick ? quickMinimizationApi.proposal(project.id, job!.id) : minimizationApi.proposal(project.id, job!.id), enabled: open && job?.status === "completed", retry: false });
  const lastRevision = useRef<{ jobId: string | undefined; revision: number | undefined }>({ jobId: undefined, revision: undefined });
  useEffect(() => {
    const before = lastRevision.current;
    if (open && job?.status === "completed" && before.jobId === job.id && before.revision !== project?.revision) {
      void query.invalidateQueries({ queryKey: ["minimization-proposal", project?.id, job.id] });
    }
    lastRevision.current = { jobId: job?.id, revision: project?.revision };
  }, [open, job?.id, job?.status, project?.id, project?.revision, query]);
  const proposal = job?.status === "completed" && reportQuery.data?.job_id === job.id ? reportQuery.data : undefined;
  useEffect(() => {
    if (quick && proposal?.report.model === "quick-local-v1" && state.autoApply && state.live && open) {
      void workflow?.finishQuick(proposal as QuickMinimizationProposal);
    }
  }, [quick, proposal, state.autoApply, state.live, open, workflow]);
  const running = !!job && ["queued", "running"].includes(job.status);
  const liveOwned = open && state.live && running && project?.revision === job?.provenance?.project_revision;
  const liveQuery = useQuery({ queryKey: ["minimization-live", project?.id, state.jobId, state.generation],
    queryFn: () => quick ? quickMinimizationApi.live(project.id, state.jobId!) : minimizationApi.live(project.id, state.jobId!), enabled: liveOwned,
    retry: false, refetchInterval: 200,
    structuralSharing: (before: unknown, after: unknown) => {
      const old = before as MinimizationLive | undefined, next = after as MinimizationLive;
      if (old?.frame && next.frame && old.job_id === next.job_id && old.capture_sha256 === next.capture_sha256 &&
        old.status === next.status && old.unavailable_reason === next.unavailable_reason && old.frame.sequence >= next.frame.sequence) return old;
      return replaceEqualDeep(before, after);
    } });
  const live = liveOwned && liveQuery.data?.job_id === job?.id ? liveQuery.data : undefined;
  const captures = proposal?.report.parameters.captured_inputs ?? live?.sources ?? [];
  const previewSelection = proposal?.report.parameters.selection ?? live?.selection;
  const frameEntries = proposal?.entries ?? live?.frame?.entries;
  const captured = captures.filter(c => previewSelection?.atoms.some(a => a.structure_id === c.entry_id));
  const sourceKey = captured.map(c => `${c.entry_id}/${c.artifact_id}`).join(";");
  const previewUnavailable = job?.provenance?.archive_source_job_id ? "Archived results are historical; preview is unavailable."
    : captures.some(c => project?.entries.find(e => e.id === c.entry_id)?.current_artifact_id !== c.artifact_id)
      ? "Source changed; run a new calculation before previewing."
    : running ? (liveQuery.isError ? "Live preview unavailable; inspect the final report." : null) ?? live?.unavailable_reason ?? (!liveOwned ? "Live preview ended for this session." : null)
    : !proposal?.entries.length ? "No coordinate proposal is available." : null;
  const previewSources = useQuery({ queryKey: ["minimization-preview-inputs", job?.id, sourceKey],
    queryFn: async () => new Map(await Promise.all(captured.map(async c => {
      const structure = await query.fetchQuery({ queryKey: ["normalized-artifact", c.artifact_id], queryFn: () => minimizationApi.source(c.artifact_id), staleTime: Infinity });
      return [c.entry_id, { artifactId: c.artifact_id, structure }] as const;
    }))), enabled: open && state.preview && !!captured.length && !previewUnavailable, retry: false, staleTime: Infinity });
  const previewResult = useMemo(() => {
    if (!open || !state.preview || previewUnavailable || !frameEntries || !previewSelection || !previewSources.data) return { patches: [], error: null };
    try { return { patches: coordinatePatches(previewSelection, frameEntries, previewSources.data), error: null }; }
    catch (error) { return { patches: [], error: error instanceof Error ? error.message : "Invalid coordinate preview." }; }
  }, [open, state.preview, previewUnavailable, frameEntries, previewSelection, previewSources.data]);
  const canApply = !!proposal?.applicable && !reportQuery.isError && !previewResult.error && !reportQuery.isFetching && !previewUnavailable &&
    proposal.report.parameters.selection.atoms.every(ref => !project.entries.find(e => e.id === ref.structure_id)?.locked);
  const message = (error: unknown) => error instanceof Error ? error.message : null;
  return { state, isQuick: quick, job, proposal, canApply, patches: previewResult.patches, liveIteration: live?.frame?.iteration, previewUnavailable,
    previewLoading: state.preview && previewSources.isPending && !!captured.length && !previewUnavailable,
    previewError: previewResult.error ?? message(jobQuery.error) ?? message(reportQuery.error) ?? message(previewSources.error) };
}
export type MinimizationPreviewPresentation = ReturnType<typeof useMinimizationPreview>;
