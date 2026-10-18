import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { jobApi, minimizationApi } from "../api/client";
import type { Job, Project, Selection } from "../api/types";
import { useWorkspaceStore } from "../store/workspace";
import { calculationComponents, minimizationRequest, type CalculationSource } from "./context";
import { proposalGeometry } from "./preview";
import { useMinimizationStore } from "./store";

export function useMinimization(project: Project | undefined, selection: Selection,
  commit: (operation: () => Promise<Project>) => Promise<Project>, beforeStart?: () => void) {
  const state = useMinimizationStore();
  const query = useQueryClient();
  const open = state.open && state.projectId === project?.id;
  const owner = (id: string, generation: number) => useWorkspaceStore.getState().activeProjectId === id &&
    useMinimizationStore.getState().projectId === id && useMinimizationStore.getState().generation === generation;
  const capabilities = useQuery({ queryKey: ["minimization-capabilities"], queryFn: minimizationApi.capabilities, enabled: open, retry: false, staleTime: 30_000 });
  const jobQuery = useQuery({ queryKey: ["job", state.jobId], queryFn: () => jobApi.get(state.jobId!), enabled: open && !!state.jobId,
    retry: false, refetchInterval: q => q.state.data && ["queued", "running"].includes(q.state.data.status) ? 400 : false });
  const job = open && jobQuery.data?.id === state.jobId ? jobQuery.data : undefined;
  const reportQuery = useQuery({ queryKey: ["minimization-proposal", project?.id, job?.id],
    queryFn: () => minimizationApi.proposal(project!.id, job!.id), enabled: open && job?.status === "completed", retry: false });
  const lastRevision = useRef<{ jobId: string | undefined; revision: number | undefined }>({ jobId: undefined, revision: undefined });
  useEffect(() => {
    const before = lastRevision.current;
    if (open && job?.status === "completed" && before.jobId === job.id && before.revision !== project?.revision) {
      void query.invalidateQueries({ queryKey: ["minimization-proposal", project?.id, job.id] });
    }
    lastRevision.current = { jobId: job?.id, revision: project?.revision };
  }, [open, job?.id, job?.status, project?.id, project?.revision, query]);
  const proposal = job?.status === "completed" && reportQuery.data?.job_id === job.id ? reportQuery.data : undefined;
  const components = useMemo(() => state.draft ? calculationComponents(state.draft.project, state.draft.sources, state.draft.selection) : [], [state.draft]);
  const chosen = components.filter(c => c.mandatory || (state.draft?.mode === "environment" && state.draft.included.has(c.key)));
  const captured = proposal?.report.parameters.captured_inputs ?? [];
  const previewUnavailable = !proposal?.entries.length ? "No coordinate proposal is available."
    : job?.provenance.archive_source_job_id ? "Archived results are historical; preview is unavailable."
    : captured.some(c => project?.entries.find(e => e.id === c.entry_id)?.current_artifact_id !== c.artifact_id)
      ? "Source/context changed; run a new calculation before previewing." : null;
  const previewSources = useQuery({ queryKey: ["minimization-preview-inputs", job?.id],
    queryFn: async () => {
      const entries = await Promise.all(captured.map(async c => {
        const structure = await query.fetchQuery({ queryKey: ["normalized-artifact", c.artifact_id], queryFn: () => minimizationApi.source(c.artifact_id), staleTime: Infinity });
        return [c.entry_id, { artifactId: c.artifact_id, structure }] as const;
      }));
      return new Map(entries);
    }, enabled: open && state.preview && !previewUnavailable, retry: false });
  const previewResult = useMemo(() => {
    if (!open || !state.preview || previewUnavailable || !proposal || !previewSources.data) return { geometry: null, error: null };
    try { return { geometry: proposalGeometry(proposal, previewSources.data), error: null }; }
    catch (error) { return { geometry: null, error: error instanceof Error ? error.message : "Invalid coordinate preview." }; }
  }, [open, state.preview, previewUnavailable, proposal, previewSources.data]);
  const load = async (snapshot: Project, ids: string[]): Promise<Map<string, CalculationSource>> => new Map(await Promise.all(ids.map(async id => {
    const artifactId = snapshot.entries.find(e => e.id === id)?.current_artifact_id;
    if (!artifactId) throw new Error("A selected/context entry is unavailable.");
    const structure = await query.fetchQuery({ queryKey: ["normalized-artifact", artifactId], queryFn: () => minimizationApi.source(artifactId), staleTime: Infinity });
    return [id, { artifactId, structure }] as const;
  })));
  const message = (error: unknown) => error instanceof Error ? error.message : "Minimization request failed.";
  const begin = async (immediate = false) => {
    if (!project || useWorkspaceStore.getState().activeProjectId !== project.id) return;
    const current = useMinimizationStore.getState();
    if (current.loading || current.applying || (open && job && ["queued", "running"].includes(job.status))) return;
    beforeStart?.();
    const generation = state.begin(project, selection);
    try {
      const sources = await load(project, [...new Set(selection.atoms.map(a => a.structure_id))]);
      if (!owner(project.id, generation)) return;
      const draft = useMinimizationStore.getState().draft!;
      state.patch(generation, { draft: { ...draft, sources }, loading: immediate });
      if (immediate) {
        const capabilities = await query.fetchQuery({ queryKey: ["minimization-capabilities"], queryFn: minimizationApi.capabilities, staleTime: 30_000 });
        if (!owner(project.id, generation)) return;
        if (!capabilities.available) throw new Error(capabilities.unavailable_reason ?? "The local minimization model is unavailable.");
        const payload = minimizationRequest(project, draft.selection, sources,
          calculationComponents(project, sources, draft.selection), draft.included, "isolated", 500);
        const submitted = await minimizationApi.submit(project.id, payload);
        void query.invalidateQueries({ queryKey: ["jobs", project.id] });
        if (owner(project.id, generation)) {
          query.setQueryData(["job", submitted.id], submitted);
          state.patch(generation, { jobId: submitted.id, loading: false, draft: null });
        }
      }
    } catch (error) { if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) }); }
  };
  const mode = async (mode: "isolated" | "environment") => {
    const draft = state.draft;
    if (!project || !draft || !owner(project.id, state.generation)) return;
    const generation = state.generation;
    state.patch(generation, { draft: { ...draft, mode }, error: null, loading: mode === "environment" && !draft.loadedAll });
    if (mode !== "environment" || draft.loadedAll) return;
    try {
      const sources = await load(draft.project, draft.project.entries.map(e => e.id));
      if (!owner(project.id, generation)) return;
      const current = useMinimizationStore.getState().draft;
      if (current) state.patch(generation, { draft: { ...current, sources, loadedAll: true }, loading: false });
    } catch (error) { if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) }); }
  };
  let requestError: string | null = null;
  try {
    if (project && state.draft && !state.loading) minimizationRequest(project, state.draft.selection, state.draft.sources, components, state.draft.included, state.draft.mode, state.draft.iterations);
  } catch (error) { requestError = message(error); }
  const run = async () => {
    if (!project || !state.draft || useMinimizationStore.getState().loading || !owner(project.id, state.generation)) return;
    const generation = state.generation;
    try {
      const payload = minimizationRequest(project, state.draft.selection, state.draft.sources, components, state.draft.included, state.draft.mode, state.draft.iterations);
      state.patch(generation, { loading: true, error: null, preview: false });
      const job = await minimizationApi.submit(project.id, payload);
      void query.invalidateQueries({ queryKey: ["jobs", project.id] });
      if (owner(project.id, generation)) { query.setQueryData(["job", job.id], job); state.patch(generation, { jobId: job.id, loading: false, draft: null }); }
    } catch (error) { if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) }); }
  };
  const apply = async () => {
    if (!project || !proposal?.applicable || useMinimizationStore.getState().applying || !owner(project.id, state.generation)) return;
    const generation = state.generation;
    state.patch(generation, { applying: true, preview: false, error: null });
    try {
      await commit(() => minimizationApi.apply(project.id, proposal.job_id, project.revision, proposal.proposal_sha256));
      void query.invalidateQueries({ queryKey: ["jobs", project.id] });
      if (owner(project.id, generation)) state.dismiss();
    } catch (error) {
      if (owner(project.id, generation)) state.patch(generation, { applying: false, error: message(error) });
      void query.invalidateQueries({ queryKey: ["minimization-proposal", project.id, proposal.job_id] });
    }
  };
  const cancel = async () => {
    if (!project || !job) return;
    const generation = state.generation;
    try { const result = await jobApi.cancel(job.id); query.setQueryData<Job>(["job", job.id], result); }
    catch (error) { if (owner(project.id, generation)) state.patch(generation, { error: message(error) }); }
  };
  return { state, open, capabilities: capabilities.data, capabilitiesLoading: capabilities.isPending,
    job, proposal, components, chosen, geometry: previewResult.geometry, previewUnavailable,
    canApply: !!proposal?.applicable && !reportQuery.isFetching && !previewUnavailable &&
      proposal.report.parameters.selection.atoms.every(ref => !project?.entries.find(e => e.id === ref.structure_id)?.locked),
    error: state.error ?? requestError ?? previewResult.error ?? (capabilities.error ? message(capabilities.error) : jobQuery.error ? message(jobQuery.error) : reportQuery.error ? message(reportQuery.error) : previewSources.error ? message(previewSources.error) : null),
    requestError, previewLoading: state.preview && previewSources.isPending && !previewUnavailable,
    begin: () => begin(), quick: () => begin(true), mode, run, apply, cancel,
    include: (key: string, include: boolean) => { if (!state.draft) return; const included = new Set(state.draft.included); if (include) included.add(key); else included.delete(key); state.patch(state.generation, { draft: { ...state.draft, included } }); },
    iterations: (iterations: number) => { if (state.draft) state.patch(state.generation, { draft: { ...state.draft, iterations } }); },
    preview: (preview: boolean) => state.patch(state.generation, { preview }),
    dismiss: state.dismiss,
  };
}
export type MinimizationWorkflow = ReturnType<typeof useMinimization>;
