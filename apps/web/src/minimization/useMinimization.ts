import { useEffect, useRef } from "react";
import type { ApplicationNoticeValue } from "../components/ApplicationNotice";
import { useQueryClient } from "@tanstack/react-query";
import { jobApi, minimizationApi, quickMinimizationApi } from "../api/client";
import type { Job, MinimizationProposal, Project, Selection, QuickMinimizationProposal, QuickMinimizationRequest } from "../api/types";
import { useWorkspaceStore } from "../store/workspace";
import { calculationComponents, minimizationRequest, type CalculationSource } from "./context";
import { type MinimizationDraft, type MinimizationProfile, useMinimizationStore } from "./store";
import type { QuickPublicationAttempt, QuickPublicationController } from "./publication";
import { quickSelectionError } from "./presentation";
import type { MinimizationCapabilities, QuickMinimizationCapabilities } from "../api/types";
import { useSelectionStore } from "../store/selection";
import { assertSelectionTargetCurrent, captureSelectionTarget, type SelectionTargetCapture, type SelectionTargetContext } from "../selection/capture";

const quickReviewNotice = "Quick minimization needs review. See Jobs → Inspect minimization.";

export function quickRequest(snapshot: Project, draft: MinimizationDraft): QuickMinimizationRequest {
    if (snapshot.id !== draft.project.id || snapshot.revision !== draft.project.revision) throw new Error("Project changed. Use current selection to refresh this setup.");
    const selectionError = quickSelectionError(snapshot, draft.selection);
    if (selectionError) throw new Error(selectionError);
    if (!Number.isInteger(draft.iterations) || draft.iterations < 1 || draft.iterations > 2000) throw new Error("Maximum iterations must be between 1 and 2000.");
    return { expected_revision: draft.project.revision, selection: draft.selection, mode: draft.mode,
      context_entry_ids: draft.mode === "environment" ? [...draft.included].sort() : [], expand_hydrogens: draft.expandHydrogens,
      allow_repair: draft.allowRepair, max_iterations: draft.iterations };
}

export function useMinimization(project: Project | undefined, selection: Selection,
  commit: (operation: () => Promise<Project>, quick?: QuickPublicationAttempt) => Promise<Project>, beforeStart?: () => void, onNotice?: (notice: ApplicationNoticeValue) => void,
  publication?: QuickPublicationController, targetContext?: () => SelectionTargetContext, assertWritable?: (projectId: string) => void) {
  // Commands read the current session at invocation. Presentation subscribes in the
  // viewer, so opening/progress/settings never rerender the whole molecular workspace.
  const state = useMinimizationStore.getState();
  const query = useQueryClient();
  const contextRef = useRef<() => SelectionTargetContext>(() => { throw new Error("Selection context unavailable."); });
  contextRef.current = targetContext ?? (() => ({ activeProjectId: useWorkspaceStore.getState().activeProjectId,
    selectionProjectId: project?.id ?? null, projectEpoch: useSelectionStore.getState().projectEpoch, project, selection }));
  const guardRef = useRef(assertWritable); guardRef.current = assertWritable;
  const assertToolWritable = (id: string) => { publication?.assertWritable(id); guardRef.current?.(id); };
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
  const startReason = (allowDraft = false): string | null => {
    const current = useMinimizationStore.getState();
    if (project && publication && publication.snapshot(project.id).phase !== "idle") return "Resolve the pending coordinate application before starting another tool.";
    if (current.loading || current.applying || current.autoApply) return "Finish or cancel the current minimization before starting another tool.";
    if (current.recovery) return "Resolve minimization recovery before starting another tool.";
    const job = query.getQueryData<Job>(["job", current.jobId]);
    if (current.jobId && (!job || ["queued", "running"].includes(job.status))) return "Inspect or cancel the current minimization before starting another tool.";
    if (job?.status === "completed" && !current.applied) return "Apply or discard the completed minimization before starting another tool.";
    if (!allowDraft && current.draft) return "Finish or close the current minimization setup before starting another tool.";
    return null;
  };
  const begin = async (immediate = false, profile: MinimizationProfile = "amber", requested?: SelectionTargetCapture): Promise<boolean> => {
    if (!project || useWorkspaceStore.getState().activeProjectId !== project.id) return false;
    if (publication && publication.snapshot(project.id).phase !== "idle") {
      onNotice?.({ kind: "error", text: "Resolve the pending coordinate application before starting another calculation. Open minimization to check." });
      return false;
    }
    try { assertToolWritable(project.id); }
    catch (error) { onNotice?.({ kind: "error", text: message(error) }); return false; }
    if (immediate) {
      const capability = query.getQueryState<QuickMinimizationCapabilities>(["quick-minimization-capabilities"]);
      if ((capability && capability.fetchStatus !== "idle") || capability?.status === "error") {
        onNotice?.({ kind: "error", text: capability.fetchStatus === "paused" ? "The availability check is paused. Reconnect before running minimization."
          : capability.fetchStatus === "fetching" ? "Wait for the minimization availability check before running."
          : "Retry the availability check before running minimization." });
        return false;
      }
    }
    const current = useMinimizationStore.getState();
    const unavailable = startReason(true);
    if (unavailable) { onNotice?.({ kind: "error", text: unavailable }); return false; }
    let capture: SelectionTargetCapture;
    try {
      const context = contextRef.current();
      if (!context.project) return false;
      capture = requested ?? captureSelectionTarget(context.project, context.selection, context.projectEpoch);
      assertSelectionTargetCurrent(capture, context);
      if (current.draft && (current.draft.project.id !== capture.projectId || current.draft.project.revision !== capture.expectedRevision
        || JSON.stringify(current.draft.selection.atoms) !== JSON.stringify(capture.selection.atoms)
        || Object.entries(capture.artifacts).some(([id, artifact]) => current.draft!.project.entries.find(entry => entry.id === id)?.current_artifact_id !== artifact))) {
        throw new Error("Finish or close the existing minimization setup before choosing another target.");
      }
      beforeStart?.();
      assertSelectionTargetCurrent(capture, contextRef.current());
    } catch (error) { onNotice?.({ kind: "error", text: message(error) }); return false; }
    const snapshot = capture.project;
    const generation = state.begin(snapshot, capture.selection, profile, !immediate || current.open);
    try {
      const sources = profile === "quick" ? new Map<string, CalculationSource>() : await load(snapshot, [...new Set(capture.selection.atoms.map(a => a.structure_id))]);
      if (!owner(snapshot.id, generation)) return false;
      assertSelectionTargetCurrent(capture, contextRef.current());
      const draft = useMinimizationStore.getState().draft!;
      state.patch(generation, { draft: { ...draft, sources }, loading: immediate, autoApply: immediate && profile === "quick" });
      if (immediate) {
        const capabilities = await query.fetchQuery({ queryKey: ["quick-minimization-capabilities"], queryFn: quickMinimizationApi.capabilities, staleTime: 30_000 });
        if (!owner(snapshot.id, generation)) return false;
        assertSelectionTargetCurrent(capture, contextRef.current());
        if (!capabilities.available) throw new Error(capabilities.unavailable_reason ?? "The local minimization model is unavailable.");
        assertToolWritable(snapshot.id);
        const submitted = await quickMinimizationApi.submit(snapshot.id, quickRequest(snapshot, draft));
        void query.invalidateQueries({ queryKey: ["jobs", project.id] });
        if (owner(project.id, generation) && useMinimizationStore.getState().autoApply) {
          query.setQueryData(["job", submitted.id], submitted);
          state.patch(generation, { jobId: submitted.id, loading: false, draft: null });
        } else { void jobApi.cancel(submitted.id).catch(() => {}); }
      }
      return true;
    } catch (error) {
      if (immediate) failQuick(generation, message(error));
      else if (owner(project.id, generation)) state.patch(generation, { loading: false, error: message(error) });
      return false;
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
      beforeStart?.();
      assertToolWritable(project.id);
      if (state.profile === "quick") {
        const capability = query.getQueryState<QuickMinimizationCapabilities>(["quick-minimization-capabilities"]);
        if (capability?.fetchStatus === "paused") throw new Error("The availability check is paused. Reconnect before running minimization.");
        if (!capability || capability.fetchStatus !== "idle" || capability.status === "pending") throw new Error("Check minimization availability before running.");
        if (capability.status === "error") throw new Error("Retry the availability check before running minimization.");
        if (!capability.data?.available) throw new Error(capability.data?.unavailable_reason ?? "Quick minimization is unavailable.");
      }
      const quickPayload = state.profile === "quick" ? quickRequest(project, state.draft) : null;
      state.patch(generation, { loading: true, error: null, preview: true, live: true, autoApply: state.profile === "quick" });
      let job: Job;
      if (quickPayload) job = await quickMinimizationApi.submit(project.id, quickPayload);
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
        : minimizationApi.apply(project.id, proposal.job_id, project.revision, proposal.proposal_sha256, proposal.report.outcome === "non_converged"),
        proposal.report.model === "quick-local-v1" ? { projectId: project.id, jobId: proposal.job_id, proposalSha256: proposal.proposal_sha256, expectedRevision: project.revision, origin: "manual" } : undefined);
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
    if (!proposal.applicable) {
      if (proposal.report.outcome !== "unchanged" && owner(project.id, generation) && !useMinimizationStore.getState().open) {
        onNotice?.({ kind: "error", lifetime: "persistent", text: quickReviewNotice });
      }
      return;
    }
    state.patch(generation, { applying: true });
    try {
      const updated = await commit(() => {
        if (!owner(project.id, generation)) throw new Error("Quick minimization session ended.");
        return quickMinimizationApi.apply(project.id, proposal.job_id, project.revision, proposal.proposal_sha256);
      }, { projectId: project.id, jobId: proposal.job_id, proposalSha256: proposal.proposal_sha256, expectedRevision: project.revision, origin: "automatic" });
      if (owner(project.id, generation)) {
        const receipt = publication?.snapshot(project.id).receipt;
        const currentApplication = !receipt || receipt.revision === updated.revision;
        state.patch(generation, { applying: false, applied: currentApplication, recovery: !currentApplication });
      }
      void query.invalidateQueries({ queryKey: ["jobs", project.id] });
    } catch (error) {
      if (owner(project.id, generation)) {
        state.patch(generation, { applying: false, error: message(error) });
        if (!useMinimizationStore.getState().open && (!publication || publication.snapshot(project.id).phase === "idle")) onNotice?.({ kind: "error", text: message(error) });
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
  const configure = async (profile: MinimizationProfile = "quick", requested?: SelectionTargetCapture): Promise<boolean> => {
    const state = useMinimizationStore.getState();
    if (project && publication && publication.snapshot(project.id).phase !== "idle") {
      onNotice?.({ kind: "error", text: "Resolve the pending coordinate application before opening a new setup." });
      return false;
    }
    if (!project) return false;
    const unavailable = startReason(true);
    if (unavailable) { onNotice?.({ kind: "error", text: unavailable }); return false; }
    try {
      const context = contextRef.current();
      if (!context.project) return false;
      const capture = requested ?? captureSelectionTarget(context.project, context.selection, context.projectEpoch);
      assertSelectionTargetCurrent(capture, context);
      if (state.draft && (state.draft.project.id !== capture.projectId || state.draft.project.revision !== capture.expectedRevision
        || JSON.stringify(state.draft.selection.atoms) !== JSON.stringify(capture.selection.atoms)
        || Object.entries(capture.artifacts).some(([id, artifact]) => state.draft!.project.entries.find(entry => entry.id === id)?.current_artifact_id !== artifact))) {
        throw new Error("Finish or close the existing minimization setup before choosing another target.");
      }
      if (state.draft && state.profile === profile) { state.patch(state.generation, { open: true }); return true; }
      return await begin(false, profile, capture);
    } catch (error) { onNotice?.({ kind: "error", text: message(error) }); return false; }
  };
  const show = async () => {
    const current = useMinimizationStore.getState();
    if (!project || useWorkspaceStore.getState().activeProjectId !== project.id) return;
    if (publication && publication.snapshot(project.id).phase !== "idle") {
      current.revealRecovery(project.id);
      return;
    }
    if (!owner(project.id, current.generation)) return;
    const job = query.getQueryData<Job>(["job", current.jobId]);
    if (current.draft || current.jobId || current.loading || current.applying || current.autoApply || (current.live && job && ["queued", "running"].includes(job.status))) {
      current.patch(current.generation, { open: true });
    } else await configure("quick");
  };
  const updateDraft = (patch: Partial<MinimizationDraft>) => {
    const current = useMinimizationStore.getState();
    if (current.draft) current.patch(current.generation, { draft: { ...current.draft, ...patch } });
  };
  const recapture = () => {
    const current = useMinimizationStore.getState();
    if (!project || !current.draft || current.profile !== "quick" || current.loading || current.applying || current.autoApply || !owner(project.id, current.generation)) return;
    try {
      publication?.assertWritable(project.id);
      const error = quickSelectionError(project, selection);
      if (error) throw new Error(error);
      current.recapture(project, selection);
    } catch (error) { current.patch(current.generation, { error: message(error) }); }
  };
  const recheckCapabilities = async () => {
    const current = useMinimizationStore.getState();
    if (!project || !current.draft || current.loading || current.applying || !owner(project.id, current.generation)) return;
    const quick = current.profile === "quick";
    const queryKey = [quick ? "quick-minimization-capabilities" : "minimization-capabilities"];
    const pending = query.getQueryState(queryKey)?.fetchStatus;
    if (pending && pending !== "idle") return;
    current.patch(current.generation, { error: null });
    try { await query.fetchQuery<MinimizationCapabilities | QuickMinimizationCapabilities>({ queryKey,
      queryFn: quick ? quickMinimizationApi.capabilities : minimizationApi.capabilities, staleTime: 0, retry: false }); }
    catch { /* The capability query owns its visible check error. */ }
  };
  const recoverPublication = async (retry: boolean) => {
    if (!project || !publication) return;
    try {
      if (retry) await publication.retry(project.id);
      else await publication.refresh(project.id);
    } catch { /* The application-owned transaction retains its diagnostic and guard. */ }
  };
  return {
    publication,
    startReason,
    recapture, recheckCapabilities, currentSelectionError: project ? quickSelectionError(project, selection) : "Open a project before selecting atoms.",
    refreshPublication: () => recoverPublication(false), retryPublication: () => recoverPublication(true),
    begin: async () => { await begin(false, useMinimizationStore.getState().profile); },
    quick: async () => { await begin(true, "quick"); }, configure, show, mode, run, apply, cancel, finishQuick, failQuick,
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
