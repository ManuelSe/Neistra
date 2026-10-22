import { useMinimizationStore } from "./store";
import { useEffect, useMemo, useRef } from "react";
import { replaceEqualDeep, useQuery, useQueryClient } from "@tanstack/react-query";
import { jobApi, minimizationApi, quickMinimizationApi } from "../api/client";
import type { MinimizationLive, MinimizationProposal, QuickMinimizationProposal, Project, MinimizationCapabilities, QuickMinimizationCapabilities } from "../api/types";
import { coordinatePatches } from "./preview";
import { quickRequest, type MinimizationWorkflow } from "./useMinimization";
import { calculationComponents, minimizationRequest } from "./context";

/** Render-local subscription; frames never rerender App or its selection inspector. */
export function useMinimizationPreview(project: Project, workflow?: MinimizationWorkflow) {
  const query = useQueryClient();
  const state = useMinimizationStore();
  const owned = !!workflow && state.projectId === project.id && (state.open || state.live || state.applying);
  const open = owned && state.open;
  const capabilities = useQuery<MinimizationCapabilities | QuickMinimizationCapabilities>({ queryKey: [state.profile === "quick" ? "quick-minimization-capabilities" : "minimization-capabilities"], queryFn: state.profile === "quick" ? quickMinimizationApi.capabilities : minimizationApi.capabilities, enabled: open, retry: false, staleTime: 30_000 });
  const components = useMemo(() => state.draft && state.profile === "amber" ? calculationComponents(state.draft.project, state.draft.sources, state.draft.selection) : [], [state.draft, state.profile]);
  const chosen = components.filter(c => c.mandatory || (state.draft?.mode === "environment" && state.draft.included.has(c.key)));
  let requestError: string | null = null;
  try {
    if (state.draft && !state.loading) {
      if (state.profile === "quick") quickRequest(project, state.draft);
      else minimizationRequest(project, state.draft.selection, state.draft.sources, components, state.draft.included, state.draft.mode, state.draft.iterations);
    }
  } catch (error) { requestError = error instanceof Error ? error.message : "Invalid minimization request"; }
  const jobQuery = useQuery({ queryKey: ["job", state.jobId], queryFn: () => jobApi.get(state.jobId!), enabled: owned && !!state.jobId,
    retry: false, refetchInterval: q => q.state.data && ["queued", "running"].includes(q.state.data.status) ? (state.profile === "quick" ? 200 : 400) : false });
  const job = owned && jobQuery.data?.id === state.jobId ? jobQuery.data : undefined;
  const quick = job?.job_type === "coordinates.quick_minimize" || state.profile === "quick";
  const reportQuery = useQuery<MinimizationProposal | QuickMinimizationProposal>({ queryKey: ["minimization-proposal", project?.id, job?.id],
    queryFn: () => quick ? quickMinimizationApi.proposal(project.id, job!.id) : minimizationApi.proposal(project.id, job!.id), enabled: owned && job?.status === "completed", retry: false });
  const lastRevision = useRef<{ jobId: string | undefined; revision: number | undefined }>({ jobId: undefined, revision: undefined });
  useEffect(() => {
    const before = lastRevision.current;
    if (owned && job?.status === "completed" && before.jobId === job.id && before.revision !== project?.revision) {
      void query.invalidateQueries({ queryKey: ["minimization-proposal", project?.id, job.id] });
    }
    lastRevision.current = { jobId: job?.id, revision: project?.revision };
  }, [owned, job?.id, job?.status, project?.id, project?.revision, query]);
  const proposal = job?.status === "completed" && reportQuery.data?.job_id === job.id ? reportQuery.data : undefined;
  useEffect(() => {
    if (quick && proposal?.report.model === "quick-local-v1" && state.autoApply && state.live && owned) {
      void workflow?.finishQuick(proposal as QuickMinimizationProposal);
    }
  }, [quick, proposal, state.autoApply, state.live, owned, workflow]);
  useEffect(() => {
    if (!owned || !state.autoApply) return;
    const error = jobQuery.error ?? reportQuery.error;
    if (error) workflow?.failQuick(state.generation, error instanceof Error ? error.message : "Quick minimization could not be inspected.");
    else if (job && ["failed", "cancelled"].includes(job.status)) {
      workflow?.failQuick(state.generation, String(job.error?.message ?? job.status_message ?? "Quick minimization ended without applying coordinates."), job.status !== "cancelled");
    }
  }, [owned, state.autoApply, state.generation, jobQuery.error, reportQuery.error, job, workflow]);
  const running = !!job && ["queued", "running"].includes(job.status);
  const liveOwned = owned && state.live && running && project?.revision === job?.provenance?.project_revision;
  const liveQuery = useQuery({ queryKey: ["minimization-live", project?.id, state.jobId, state.generation],
    queryFn: () => quick ? quickMinimizationApi.live(project.id, state.jobId!) : minimizationApi.live(project.id, state.jobId!), enabled: liveOwned,
    retry: false, refetchInterval: q => quick && !q.state.data?.frame ? 100 : 200,
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
    }))), enabled: owned && state.preview && !!captured.length && !previewUnavailable, retry: false, staleTime: Infinity });
  const previewResult = useMemo(() => {
    if (!owned || !state.preview || previewUnavailable || !frameEntries || !previewSelection || !previewSources.data) return { patches: [], error: null };
    try { return { patches: coordinatePatches(previewSelection, frameEntries, previewSources.data), error: null }; }
    catch (error) { return { patches: [], error: error instanceof Error ? error.message : "Invalid coordinate preview." }; }
  }, [owned, state.preview, previewUnavailable, frameEntries, previewSelection, previewSources.data]);
  const canApply = !!proposal?.applicable && !reportQuery.isError && !previewResult.error && !reportQuery.isFetching && !previewUnavailable &&
    proposal.report.parameters.selection.atoms.every(ref => !project.entries.find(e => e.id === ref.structure_id)?.locked);
  const message = (error: unknown) => error instanceof Error ? error.message : null;
  return { state, open, components, chosen, capabilities: capabilities.data, capabilitiesLoading: capabilities.isPending, requestError, error: state.error ?? requestError ?? message(capabilities.error), isQuick: quick, job, proposal, canApply, patches: previewResult.patches, liveIteration: live?.frame?.iteration, previewUnavailable,
    previewLoading: state.preview && previewSources.isPending && !!captured.length && !previewUnavailable,
    previewError: previewResult.error ?? message(jobQuery.error) ?? message(reportQuery.error) ?? message(previewSources.error) };
}
export type MinimizationPreviewPresentation = ReturnType<typeof useMinimizationPreview>;
