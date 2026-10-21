import { useShallow } from "zustand/react/shallow";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { jobApi, minimizationApi, quickMinimizationApi } from "../api/client";
import type { Job, MinimizationProposal, Project, Selection, QuickMinimizationProposal, QuickMinimizationRequest, MinimizationCapabilities, QuickMinimizationCapabilities } from "../api/types";
import { useWorkspaceStore } from "../store/workspace";
import { calculationComponents, minimizationRequest, type CalculationSource } from "./context";
import { type MinimizationProfile, useMinimizationStore } from "./store";

export function useMinimization(project: Project | undefined, selection: Selection,
  commit: (operation: () => Promise<Project>) => Promise<Project>, beforeStart?: () => void) {
  // High-rate preview presentation subscribes inside the viewer. App owns commands,
  // capture and job lifecycle without rerendering unrelated inspectors for frames/Cancel.
  const state = useMinimizationStore(useShallow(({ preview, live, autoApply, ...session }) => {
    void preview; void live; void autoApply;
    return session;
  }));
  const query = useQueryClient();
  const open = state.open && state.projectId === project?.id;
  const owner = (id: string, generation: number) => useWorkspaceStore.getState().activeProjectId === id &&
    useMinimizationStore.getState().projectId === id && useMinimizationStore.getState().generation === generation;
  const capabilities = useQuery<MinimizationCapabilities | QuickMinimizationCapabilities>({ queryKey: [state.profile === "quick" ? "quick-minimization-capabilities" : "minimization-capabilities"], queryFn: state.profile === "quick" ? quickMinimizationApi.capabilities : minimizationApi.capabilities, enabled: open, retry: false, staleTime: 30_000 });
  const components = useMemo(() => state.draft ? calculationComponents(state.draft.project, state.draft.sources, state.draft.selection) : [], [state.draft]);
  const chosen = components.filter(c => c.mandatory || (state.draft?.mode === "environment" && state.draft.included.has(c.key)));
  // Tool/project ownership is presentation state. Leaving it cancels computation,
  // while retained Jobs/report inspection never resumes a live session.
  useEffect(() => {
    const unsubscribe = useMinimizationStore.subscribe((next, previous) => {
    if (previous.live && previous.jobId && (next.jobId !== previous.jobId || !next.open || next.projectId !== previous.projectId)) {
      void jobApi.cancel(previous.jobId).then(result => query.setQueryData(["job", result.id], result)).catch(() => { /* Jobs retains terminal/running status. */ });
    }
    });
    return () => {
      const current = useMinimizationStore.getState();
      if (current.autoApply) current.dismiss();
      unsubscribe();
    };
  }, [query]);
  const load = async (snapshot: Project, ids: string[]): Promise<Map<string, CalculationSource>> => new Map(await Promise.all(ids.map(async id => {
    const artifactId = snapshot.entries.find(e => e.id === id)?.current_artifact_id;
    if (!artifactId) throw new Error("A selected/context entry is unavailable.");
    const structure = await query.fetchQuery({ queryKey: ["normalized-artifact", artifactId], queryFn: () => minimizationApi.source(artifactId), staleTime: Infinity });
    return [id, { artifactId, structure }] as const;
  })));
  const message = (error: unknown) => error instanceof Error ? error.message : "Minimization request failed.";
  const quickRequest = (snapshot: Project, draft: NonNullable<typeof state.draft>): QuickMinimizationRequest => {
    if (!draft.selection.atoms.length) throw new Error("Select atoms before minimizing.");
    if (draft.selection.atoms.some(a => snapshot.entries.find(e => e.id === a.structure_id)?.locked)) throw new Error("Unlock selected entries before minimizing.");
    if (!Number.isInteger(draft.iterations) || draft.iterations < 1 || draft.iterations > 2000) throw new Error("Maximum iterations must be between 1 and 2000.");
    return { expected_revision: draft.project.revision, selection: draft.selection, mode: draft.mode,
      context_entry_ids: draft.mode === "environment" ? [...draft.included].sort() : [], expand_hydrogens: draft.expandHydrogens,
      allow_repair: draft.allowRepair, max_iterations: draft.iterations };
  };
  const begin = async (immediate = false, replacing = false, profile: MinimizationProfile = "amber") => {
    if (!project || useWorkspaceStore.getState().activeProjectId !== project.id) return;
    const current = useMinimizationStore.getState();
    const job = query.getQueryData<Job>(["job", current.jobId]);
    if (current.loading || current.applying || (!replacing && open && job && ["queued", "running"].includes(job.status))) return;
    beforeStart?.();
    const generation = state.begin(project, selection, profile, immediate ? "quick" : "settings");
    try {
      const sources = profile === "quick" ? new Map<string, CalculationSource>() : await load(project, [...new Set(selection.atoms.map(a => a.structure_id))]);
      if (!owner(project.id, generation)) return;
      const draft = useMinimizationStore.getState().draft!;
      state.patch(generation, { draft: { ...draft, sources }, loading: immediate });
      if (immediate) {
        const capabilities = await query.fetchQuery({ queryKey: ["quick-minimization-capabilities"], queryFn: quickMinimizationApi.capabilities, staleTime: 30_000 });
        if (!owner(project.id, generation)) return;
        if (!capabilities.available) throw new Error(capabilities.unavailable_reason ?? "The local minimization model is unavailable.");
        const submitted = await quickMinimizationApi.submit(project.id, quickRequest(project, draft));
        void query.invalidateQueries({ queryKey: ["jobs", project.id] });
        if (owner(project.id, generation) && useMinimizationStore.getState().autoApply) {
          query.setQueryData(["job", submitted.id], submitted);
          state.patch(generation, { jobId: submitted.id, loading: false, draft: null });
        } else { void jobApi.cancel(submitted.id).catch(() => {}); }
      }
    } catch (error) { if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) }); }
  };
  const mode = async (mode: "isolated" | "environment" | "automatic") => {
    const draft = state.draft;
    if (!project || !draft || !owner(project.id, state.generation)) return;
    const generation = state.generation;
    state.patch(generation, { draft: { ...draft, mode }, error: null, loading: mode === "environment" && !draft.loadedAll });
    if (mode !== "environment" || draft.loadedAll || state.profile === "quick") { state.patch(generation, { loading: false }); return; }
    try {
      const sources = await load(draft.project, draft.project.entries.map(e => e.id));
      if (!owner(project.id, generation)) return;
      const current = useMinimizationStore.getState().draft;
      if (current) state.patch(generation, { draft: { ...current, sources, loadedAll: true }, loading: false });
    } catch (error) { if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) }); }
  };
  let requestError: string | null = null;
  try {
    if (project && state.draft && !state.loading) {
      if (state.profile === "quick") quickRequest(project, state.draft);
      else minimizationRequest(project, state.draft.selection, state.draft.sources, components, state.draft.included, state.draft.mode, state.draft.iterations);
    }
  } catch (error) { requestError = message(error); }
  const run = async () => {
    if (!project || !state.draft || useMinimizationStore.getState().loading || !owner(project.id, state.generation)) return;
    const generation = state.generation;
    try {
      state.patch(generation, { loading: true, error: null, preview: true, live: true, autoApply: state.profile === "quick" });
      let job: Job;
      if (state.profile === "quick") job = await quickMinimizationApi.submit(project.id, quickRequest(project, state.draft));
      else {
        const payload = minimizationRequest(project, state.draft.selection, state.draft.sources, components, state.draft.included, state.draft.mode, state.draft.iterations);
        payload.acceptance_policy = state.draft.strict ? "strict" : "interactive";
        job = await minimizationApi.submit(project.id, payload);
      }
      void query.invalidateQueries({ queryKey: ["jobs", project.id] });
      if (owner(project.id, generation)) { query.setQueryData(["job", job.id], job); state.patch(generation, { jobId: job.id, loading: false, draft: null }); }
      else { void jobApi.cancel(job.id).catch(() => {}); }
    } catch (error) { if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) }); }
  };
  const apply = async () => {
    const proposal = query.getQueryData<MinimizationProposal | QuickMinimizationProposal>(["minimization-proposal", project?.id, state.jobId]);
    if (!project || !proposal?.applicable || useMinimizationStore.getState().applying || !owner(project.id, state.generation)) return;
    const generation = state.generation;
    state.patch(generation, { applying: true, preview: false, error: null });
    try {
      await commit(() => proposal.report.model === "quick-local-v1"
        ? quickMinimizationApi.apply(project.id, proposal.job_id, project.revision, proposal.proposal_sha256)
        : minimizationApi.apply(project.id, proposal.job_id, project.revision, proposal.proposal_sha256, proposal.report.outcome === "non_converged"));
      void query.invalidateQueries({ queryKey: ["jobs", project.id] });
      if (owner(project.id, generation)) state.dismiss();
    } catch (error) {
      if (owner(project.id, generation)) state.patch(generation, { applying: false, error: message(error) });
      void query.invalidateQueries({ queryKey: ["minimization-proposal", project.id, proposal.job_id] });
    }
  };
  const finishQuick = async (proposal: QuickMinimizationProposal) => {
    const current = useMinimizationStore.getState();
    if (!project || !current.autoApply || !current.live || !current.open || current.jobId !== proposal.job_id || current.applying || !owner(project.id, current.generation)) return;
    const generation = current.generation;
    state.patch(generation, { autoApply: false, live: false, preview: false });
    if (!proposal.applicable) return;
    state.patch(generation, { applying: true });
    try {
      await commit(() => {
        if (!owner(project.id, generation)) throw new Error("Quick minimization session ended.");
        return quickMinimizationApi.apply(project.id, proposal.job_id, project.revision, proposal.proposal_sha256);
      });
      if (owner(project.id, generation)) state.patch(generation, { applying: false, applied: true });
      void query.invalidateQueries({ queryKey: ["jobs", project.id] });
    } catch (error) {
      if (owner(project.id, generation)) state.patch(generation, { applying: false, error: message(error) });
    }
  };
  const cancel = async () => {
    const job = query.getQueryData<Job>(["job", state.jobId]);
    if (!project) return;
    if (!job) { state.dismiss(); return; }
    const generation = state.generation;
    state.patch(generation, { preview: false, live: false, autoApply: false });
    try { const result = await jobApi.cancel(job.id); query.setQueryData<Job>(["job", job.id], result); }
    catch (error) { if (owner(project.id, generation)) state.patch(generation, { error: message(error) }); }
  };
  const configure = async (profile: MinimizationProfile = "quick") => {
    if (!project || state.loading || state.applying) return;
    const generation = state.generation;
    const job = query.getQueryData<Job>(["job", state.jobId]);
    try {
      if (job && ["queued", "running"].includes(job.status)) {
        try { const result = await jobApi.cancel(job.id); query.setQueryData(["job", job.id], result); }
        catch (error) {
          const result = await jobApi.get(job.id);
          if (["queued", "running"].includes(result.status)) throw error;
        }
      }
      if (!owner(project.id, generation)) return;
      state.dismiss();
      await begin(false, true, profile);
    } catch (error) { if (owner(project.id, generation)) state.patch(generation, { error: message(error) }); }
  };
  return { state, open, capabilities: capabilities.data, capabilitiesLoading: capabilities.isPending,
    components, chosen,
    error: state.error ?? requestError ?? (capabilities.error ? message(capabilities.error) : null),
    requestError,
    begin: () => begin(false, false, state.profile), quick: () => begin(true, false, "quick"), configure, mode, run, apply, cancel, finishQuick,
    expandHydrogens: (expandHydrogens: boolean) => { if (state.draft) state.patch(state.generation, { draft: { ...state.draft, expandHydrogens } }); },
    allowRepair: (allowRepair: boolean) => { if (state.draft) state.patch(state.generation, { draft: { ...state.draft, allowRepair } }); },
    include: (key: string, include: boolean) => { if (!state.draft) return; const included = new Set(state.draft.included); if (include) included.add(key); else included.delete(key); state.patch(state.generation, { draft: { ...state.draft, included } }); },
    strict: (strict: boolean) => { if (state.draft) state.patch(state.generation, { draft: { ...state.draft, strict } }); },
    iterations: (iterations: number) => { if (state.draft) state.patch(state.generation, { draft: { ...state.draft, iterations } }); },
    preview: (preview: boolean) => state.patch(state.generation, { preview, live: false }),
    dismiss: state.dismiss,
  };
}
export type MinimizationWorkflow = ReturnType<typeof useMinimization>;
