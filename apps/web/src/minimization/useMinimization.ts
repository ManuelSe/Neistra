import { useEffect } from "react";
import type { ApplicationNoticeValue } from "../components/ApplicationNotice";
import { useQueryClient } from "@tanstack/react-query";
import { jobApi, minimizationApi, quickMinimizationApi } from "../api/client";
import type { Job, MinimizationProposal, Project, Selection, QuickMinimizationProposal, QuickMinimizationRequest } from "../api/types";
import { useWorkspaceStore } from "../store/workspace";
import { calculationComponents, minimizationRequest, type CalculationSource } from "./context";
import { type MinimizationDraft, type MinimizationProfile, useMinimizationStore } from "./store";

export function quickRequest(snapshot: Project, draft: MinimizationDraft): QuickMinimizationRequest {
    if (!draft.selection.atoms.length) throw new Error("Select atoms before minimizing.");
    if (draft.selection.atoms.some(a => snapshot.entries.find(e => e.id === a.structure_id)?.locked)) throw new Error("Unlock selected entries before minimizing.");
    if (!Number.isInteger(draft.iterations) || draft.iterations < 1 || draft.iterations > 2000) throw new Error("Maximum iterations must be between 1 and 2000.");
    return { expected_revision: draft.project.revision, selection: draft.selection, mode: draft.mode,
      context_entry_ids: draft.mode === "environment" ? [...draft.included].sort() : [], expand_hydrogens: draft.expandHydrogens,
      allow_repair: draft.allowRepair, max_iterations: draft.iterations };
}

export function useMinimization(project: Project | undefined, selection: Selection,
  commit: (operation: () => Promise<Project>) => Promise<Project>, beforeStart?: () => void, onNotice?: (notice: ApplicationNoticeValue) => void) {
  // Commands read the current session at invocation. Presentation subscribes in the
  // viewer, so opening/progress/settings never rerender the whole molecular workspace.
  const state = useMinimizationStore.getState();
  const query = useQueryClient();
  const owner = (id: string, generation: number) => useWorkspaceStore.getState().activeProjectId === id &&
    useMinimizationStore.getState().projectId === id && useMinimizationStore.getState().generation === generation;
  // Tool/project ownership is presentation state. Leaving it cancels computation,
  // while retained Jobs/report inspection never resumes a live session.
  useEffect(() => {
    const unsubscribe = useMinimizationStore.subscribe((next, previous) => {
    if (previous.live && previous.jobId && (next.generation !== previous.generation || next.jobId !== previous.jobId || next.projectId !== previous.projectId)) {
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
  const failQuick = (generation: number, error: string, announce = true) => {
    const current = useMinimizationStore.getState();
    if (!project || !owner(project.id, generation) || !current.autoApply) return;
    state.patch(generation, { loading: false, applying: false, autoApply: false, live: false, preview: false, error });
    const job = query.getQueryData<Job>(["job", current.jobId]);
    if (job && ["queued", "running"].includes(job.status)) {
      void jobApi.cancel(job.id).then(result => query.setQueryData(["job", result.id], result)).catch(() => { /* Jobs retains the diagnostic if transport remains unavailable. */ });
    }
    if (announce && !current.open) onNotice?.({ kind: "error", text: error });
  };
  const begin = async (immediate = false, replacing = false, profile: MinimizationProfile = "amber") => {
    if (!project || useWorkspaceStore.getState().activeProjectId !== project.id) return;
    const current = useMinimizationStore.getState();
    const job = query.getQueryData<Job>(["job", current.jobId]);
    if (current.loading || current.applying || (!replacing && (current.autoApply || (job && ["queued", "running"].includes(job.status))))) return;
    beforeStart?.();
    const generation = state.begin(project, selection, profile, !immediate || current.open);
    try {
      const sources = profile === "quick" ? new Map<string, CalculationSource>() : await load(project, [...new Set(selection.atoms.map(a => a.structure_id))]);
      if (!owner(project.id, generation)) return;
      const draft = useMinimizationStore.getState().draft!;
      state.patch(generation, { draft: { ...draft, sources }, loading: immediate, autoApply: immediate && profile === "quick" });
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
    } catch (error) {
      if (immediate) failQuick(generation, message(error));
      else if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) });
    }
  };
  const mode = async (mode: "isolated" | "environment" | "automatic") => {
    const state = useMinimizationStore.getState();
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
  const run = async () => {
    const state = useMinimizationStore.getState();
    if (!project || !state.draft || useMinimizationStore.getState().loading || !owner(project.id, state.generation)) return;
    const generation = state.generation;
    try {
      state.patch(generation, { loading: true, error: null, preview: true, live: true, autoApply: state.profile === "quick" });
      let job: Job;
      if (state.profile === "quick") job = await quickMinimizationApi.submit(project.id, quickRequest(project, state.draft));
      else {
        const payload = minimizationRequest(project, state.draft.selection, state.draft.sources, calculationComponents(state.draft.project, state.draft.sources, state.draft.selection), state.draft.included, state.draft.mode, state.draft.iterations);
        payload.acceptance_policy = state.draft.strict ? "strict" : "interactive";
        job = await minimizationApi.submit(project.id, payload);
      }
      void query.invalidateQueries({ queryKey: ["jobs", project.id] });
      if (owner(project.id, generation)) { query.setQueryData(["job", job.id], job); state.patch(generation, { jobId: job.id, loading: false, draft: null }); }
      else { void jobApi.cancel(job.id).catch(() => {}); }
    } catch (error) { if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) }); }
  };
  const apply = async () => {
    const state = useMinimizationStore.getState();
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
    if (!project || !current.autoApply || !current.live || current.jobId !== proposal.job_id || current.applying || !owner(project.id, current.generation)) return;
    const generation = current.generation;
    state.patch(generation, { autoApply: false, live: false, preview: false });
    const warn = () => {
      if (!owner(project.id, generation) || useMinimizationStore.getState().open) return;
      const warnings = proposal.report.warnings;
      if ((!proposal.applicable && proposal.report.outcome !== "unchanged") || warnings.length) onNotice?.({ kind: "success", lifetime: "persistent",
        text: [proposal.unavailable_reason ?? proposal.report.reason, ...warnings, "Details remain in Jobs → Inspect minimization."].join(" ") });
    };
    if (!proposal.applicable) { warn(); return; }
    state.patch(generation, { applying: true });
    try {
      await commit(() => {
        if (!owner(project.id, generation)) throw new Error("Quick minimization session ended.");
        return quickMinimizationApi.apply(project.id, proposal.job_id, project.revision, proposal.proposal_sha256);
      });
      if (owner(project.id, generation)) { state.patch(generation, { applying: false, applied: true }); warn(); }
      void query.invalidateQueries({ queryKey: ["jobs", project.id] });
    } catch (error) {
      if (owner(project.id, generation)) {
        state.patch(generation, { applying: false, error: message(error) });
        if (!useMinimizationStore.getState().open) onNotice?.({ kind: "error", text: message(error) });
      }
    }
  };
  const cancel = async () => {
    const state = useMinimizationStore.getState();
    const job = query.getQueryData<Job>(["job", state.jobId]);
    if (!project) return;
    if (!job) { state.dismiss(); return; }
    const generation = state.generation;
    state.patch(generation, { preview: false, live: false, autoApply: false });
    try { const result = await jobApi.cancel(job.id); query.setQueryData<Job>(["job", job.id], result); }
    catch (error) { if (owner(project.id, generation)) state.patch(generation, { error: message(error) }); }
  };
  const configure = async (profile: MinimizationProfile = "quick") => {
    const state = useMinimizationStore.getState();
    if (!project || state.loading || state.applying) return;
    const generation = state.generation;
    const job = query.getQueryData<Job>(["job", state.jobId]);
    // Changing tools ends publication ownership before any network cancellation.
    state.patch(generation, { autoApply: false, live: false, preview: false });
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
  const show = async () => {
    const current = useMinimizationStore.getState();
    if (!project || !owner(project.id, current.generation)) return;
    const job = query.getQueryData<Job>(["job", current.jobId]);
    if (current.loading || current.applying || current.autoApply || (current.live && job && ["queued", "running"].includes(job.status))) {
      current.patch(current.generation, { open: true });
    } else await configure("quick");
  };
  const updateDraft = (patch: Partial<MinimizationDraft>) => {
    const current = useMinimizationStore.getState();
    if (current.draft) current.patch(current.generation, { draft: { ...current.draft, ...patch } });
  };
  return {
    begin: () => begin(false, false, useMinimizationStore.getState().profile), quick: () => begin(true, false, "quick"), configure, show, mode, run, apply, cancel, finishQuick, failQuick,
    expandHydrogens: (expandHydrogens: boolean) => updateDraft({ expandHydrogens }),
    allowRepair: (allowRepair: boolean) => updateDraft({ allowRepair }),
    include: (key: string, include: boolean) => {
      const draft = useMinimizationStore.getState().draft;
      if (!draft) return;
      const included = new Set(draft.included);
      if (include) included.add(key); else included.delete(key);
      updateDraft({ included });
    },
    strict: (strict: boolean) => updateDraft({ strict }),
    iterations: (iterations: number) => updateDraft({ iterations }),
    preview: (preview: boolean) => { const current = useMinimizationStore.getState(); current.patch(current.generation, { preview, live: false }); },
    dismiss: state.dismiss,
  };
}
export type MinimizationWorkflow = ReturnType<typeof useMinimization>;
