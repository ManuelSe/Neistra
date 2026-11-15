import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AtomReference, Project, Selection, StructureProjection } from "../api/types";
import { useInteractionStore } from "../store/interactions";
import type { MolecularViewer, ViewerStructure } from "../viewer/MolecularViewer";
import type { ViewerVisibilitySource } from "../viewer/componentVisibility";
import { filterInteractions } from "./filter";
import type { InteractionCategoryView, InteractionContactDetails, InteractionPanelProps, InteractionStatusView } from "./panelModel";
import { createInteractionPresentationContext, groupInteractionWarnings, interactionMetrics, interactionParticipants, interactionRecordKey } from "./presentation";
import { defaultInteractionAppearance, interactionHasDisplayGeometry } from "./styles";
import { captureLigandTarget, captureSelectionTarget, filterTargetInteractions, resolveInteractionLigands, validateInteractionTarget, type InteractionTarget } from "./target";
import { INTERACTION_KINDS, type InteractionChoices, type InteractionDisplayState } from "./types";
import { interactionKey, useInteractions } from "./useInteractions";

const ALL: InteractionTarget = { kind: "all" };
const EMPTY_SELECTION: InteractionTarget = { kind: "selection", atoms: [] };
const EMPTY_LIGAND: InteractionTarget = { kind: "ligand", entryId: "", componentId: "", atoms: [] };
const DEFAULT_CHOICES: InteractionChoices = { types: [], intra: false, inter: true };
const DEFAULT_APPEARANCE = defaultInteractionAppearance();

export interface InteractionNativeState { viewer: MolecularViewer; state: InteractionDisplayState }
export interface InteractionRenderFailure { viewer: MolecularViewer; displayKey: string; message: string }
interface InspectionInput {
  project: Project;
  selection: Selection;
  projections: ReadonlyMap<string, StructureProjection>;
  structures: ViewerStructure[];
  isolation: AtomReference[] | null;
  paused: boolean;
  busy: boolean;
  viewerReady: boolean;
  viewReady: boolean;
  viewer: RefObject<MolecularViewer | undefined>;
  native: InteractionNativeState | null;
  renderFailure: InteractionRenderFailure | null;
  onSelect: (atoms: AtomReference[]) => void;
}

/** Application-owned intent and evidence; the native receipt owns installed counts. */
export function useInteractionInspection(input: InspectionInput) {
  const { project, selection, projections, structures, isolation, paused, busy, viewerReady, viewReady, viewer, native, renderFailure, onSelect } = input;
  const queryClient = useQueryClient();
  const state = useInteractionStore();
  const own = state.projectId === project.id;
  const choices = own ? state.choices : DEFAULT_CHOICES;
  const { inter, intra } = choices;
  const show = own ? state.show : true;
  const mode = own ? state.targetMode : "all";
  const appearance = own ? state.appearance : DEFAULT_APPEARANCE;
  const target = mode === "all" ? ALL : mode === "selection" ? state.selectionTarget ?? EMPTY_SELECTION : state.ligandTarget ?? EMPTY_LIGAND;
  const resolution = useMemo(() => validateInteractionTarget(target, project.entries, projections), [target, project.entries, projections]);
  const candidates = useMemo(() => resolveInteractionLigands(project.entries, projections), [project.entries, projections]);
  const inputs = project.entries.filter(entry => entry.visible && entry.current_artifact_id)
    .map(entry => ({ entry_id: entry.id, artifact_id: entry.current_artifact_id! }));
  const analysis = useInteractions(project.id, inputs, paused, resolution.status === "ready");
  const result = analysis.result;
  const [displayRetry, setDisplayRetry] = useState(0);
  const currentArtifacts = JSON.stringify(project.entries.map(entry => [entry.id, entry.current_artifact_id]));
  const resultIdentity = result ? JSON.stringify([interactionKey(project.id, result.inputs), currentArtifacts]) : null;

  // A cached superset may include hidden inputs. Never describe its obsolete or
  // deleted artifacts as a current detected relationship.
  const records = useMemo(() => {
    if (!result || resolution.status !== "ready") return [];
    const resultArtifacts = new Map(result.inputs.map(source => [source.entry_id, source.artifact_id]));
    const entries = new Map(project.entries.map(entry => [entry.id, entry]));
    const current = result.records.filter(record => record.participants.every(group => group.every(ref => {
      const entry = entries.get(ref.structure_id);
      return entry?.visible && resultArtifacts.get(ref.structure_id) === entry.current_artifact_id;
    })));
    return filterTargetInteractions(current.filter(record => record.scope === "inter" ? inter : intra), target);
  }, [result, resolution.status, project.entries, inter, intra, target]);
  // Query containers and renderer wrappers can change during camera/receipt
  // updates. Retain only immutable visibility inputs, never old pocket/projection
  // resources, and compare every field the typed filter is allowed to consume.
  const visibilitySnapshot = useRef<readonly ViewerVisibilitySource[]>([]);
  if (visibilitySnapshot.current.length !== structures.length || structures.some((source, index) => {
    const previous = visibilitySnapshot.current[index];
    return !previous || source.entryId !== previous.entryId || source.normalized !== previous.normalized
      || source.hierarchy !== previous.hierarchy || source.settings !== previous.settings;
  })) visibilitySnapshot.current = structures.map(({ entryId, normalized, hierarchy, settings }) => ({ entryId, normalized, hierarchy, settings }));
  const visibilitySources = visibilitySnapshot.current;
  const displayRecords = useMemo(() => result && viewReady && !paused && show
    ? filterInteractions(records, choices, visibilitySources, isolation) : [],
  [result, viewReady, paused, show, records, choices, visibilitySources, isolation]);
  const displayKey = useMemo(() => JSON.stringify([project.id, resultIdentity, mode, target, choices, appearance, show, paused, viewReady, displayRetry, displayRecords]),
    [project.id, resultIdentity, mode, target, choices, appearance, show, paused, viewReady, displayRetry, displayRecords]);
  const receipt = native && native.viewer === viewer.current && native.state.displayKey === displayKey ? native.state : null;
  const installed = receipt?.status === "ready" && viewerReady && viewReady && !paused;
  const shownKeys = useMemo(() => new Set(installed ? receipt.installedRecordKeys : []), [installed, receipt]);
  const entries = useMemo(() => new Map(project.entries.map(entry => [entry.id, entry])), [project.entries]);
  const validAtomIds = useMemo(() => new Map(project.entries.map(entry => [entry.id, new Set(entry.atom_ids)])), [project.entries]);
  const analyzedArtifacts = useMemo(() => new Map(result?.inputs.map(source => [source.entry_id, source.artifact_id])), [result]);
  const keyedRecords = useMemo(() => records.map(record => [interactionRecordKey(record), record] as const), [records]);
  const recordMap = useMemo(() => new Map(keyedRecords.filter(([, record]) => choices.types.includes(record.kind))), [keyedRecords, choices.types]);
  const context = useMemo(() => createInteractionPresentationContext(project.entries, projections), [project.entries, projections]);
  const contacts = useMemo(() => [...recordMap].map(([key, record]) => {
    const metric = interactionMetrics(record)[0];
    return { key, kind: record.kind, summary: context.summarize(record),
      primaryMetric: metric ? `${metric.label}: ${metric.value.toFixed(2)} ${metric.unit}` : "Geometry unavailable" };
  }), [recordMap, context]);
  const warningGroups = useMemo(() => groupInteractionWarnings(result?.warnings ?? []), [result]);
  const actionUnavailable = paused ? "Finish the coordinate preview before inspecting current contacts."
    : busy ? "Finish the current project change before selecting interaction atoms." : null;

  const ownsProject = () => useInteractionStore.getState().projectId === project.id;
  const currentResult = () => ownsProject() && useInteractionStore.getState().cache?.result === result;
  const knownCurrentAtoms = (atoms: AtomReference[]) => atoms.length > 0 && atoms.every(ref =>
    entries.get(ref.structure_id)?.current_artifact_id === analyzedArtifacts.get(ref.structure_id)
      && validAtomIds.get(ref.structure_id)?.has(ref.atom_id));
  const currentAtoms = (atoms: AtomReference[]) => {
    if (!currentResult() || !result) return false;
    const currentProject = queryClient.getQueryData<Project>(["project", project.id]) ?? project;
    const artifacts = new Map(result.inputs.map(source => [source.entry_id, source.artifact_id]));
    const currentEntries = new Map(currentProject.entries.map(entry => [entry.id, entry]));
    const ids = new Map([...new Set(atoms.map(ref => ref.structure_id))].map(id => [id, new Set(currentEntries.get(id)?.atom_ids)]));
    return atoms.length > 0 && atoms.every(ref => {
      const entry = currentEntries.get(ref.structure_id);
      return entry && entry.current_artifact_id === artifacts.get(ref.structure_id) && ids.get(ref.structure_id)?.has(ref.atom_id);
    });
  };
  const inspectedKey = own && state.inspectedResultKey === resultIdentity && state.inspectedKey && recordMap.has(state.inspectedKey) ? state.inspectedKey : null;
  const inspectedRecord = inspectedKey ? recordMap.get(inspectedKey) : undefined;
  const rendererError = receipt?.status === "error" ? receipt.error ?? "Interaction rendering failed."
    : renderFailure && renderFailure.viewer === viewer.current && renderFailure.displayKey === displayKey ? renderFailure.message : null;
  const inspected: InteractionContactDetails | null = inspectedRecord && inspectedKey ? {
    key: inspectedKey, participants: context.describe(inspectedRecord), metrics: interactionMetrics(inspectedRecord), scope: inspectedRecord.scope,
    focusUnavailable: actionUnavailable ?? (!show ? "Show interactions before focusing a displayed contact." : rendererError ? "Interaction display is unavailable. Resolve the display error before focusing." : !installed ? "Wait for current interaction rendering." : !interactionHasDisplayGeometry(inspectedRecord) ? "This contact has coincident interaction endpoints; no marker can be drawn. Select its atoms to inspect the site." : !shownKeys.has(inspectedKey) ? "This contact's participants are hidden. Reveal them before focusing." : null),
    selectUnavailable: actionUnavailable ?? (!knownCurrentAtoms(interactionParticipants(inspectedRecord)) ? "These interaction atoms are no longer current." : null),
  } : null;
  useEffect(() => {
    if (own && state.inspectedKey && (state.inspectedResultKey !== resultIdentity || !recordMap.has(state.inspectedKey))) state.setInspectedKey(null);
  }, [own, state, resultIdentity, recordMap]);

  const counts = useMemo(() => {
    const counts = Object.fromEntries(INTERACTION_KINDS.map(kind => [kind, 0]));
    for (const record of records) counts[record.kind]++;
    return counts;
  }, [records]);
  const categories = Object.fromEntries(INTERACTION_KINDS.map(kind => [kind, {
    detected: result && resolution.status === "ready" ? counts[kind] : null,
    shown: installed ? receipt.countsByKind[kind] : null,
    coverage: result?.coverage[kind]?.status ?? null,
  }])) as Record<(typeof INTERACTION_KINDS)[number], InteractionCategoryView>;
  const partial = choices.types.some(kind => result && result.coverage[kind].status !== "complete");
  const allUnavailable = choices.types.length > 0 && choices.types.every(kind => result?.coverage[kind].status === "unavailable");
  let status: InteractionStatusView;
  if (!show) status = { phase: "hidden", message: "Hidden · choices retained", partial };
  else if (!choices.types.length) status = { phase: "off", message: "Choose an interaction type", partial: false };
  else if (!choices.inter && !choices.intra) status = { phase: "off", message: "Choose Inter or Intra", partial };
  else if (resolution.status !== "ready") status = { phase: "target", message: mode === "ligand" && !state.ligandTarget ? "Choose a ligand instance" : mode === "selection" && !state.selectionTarget ? "Capture a selection" : resolution.message ?? "Update the interaction target", partial };
  else if (paused) status = { phase: "paused", message: "Paused during preview", partial };
  else if (!inputs.length) status = { phase: "target", message: "No visible inputs", partial };
  else if (analysis.error) status = { phase: "error", message: analysis.error, partial };
  else if (!result) status = { phase: "loading", message: analysis.loading ? "Analyzing…" : "Waiting for analysis…", partial };
  else if (!viewReady) status = { phase: "rendering", message: "Waiting for current structures…", partial };
  else if (rendererError) status = { phase: "error", message: rendererError, partial };
  else if (!installed) status = { phase: "rendering", message: "Rendering…", partial };
  else {
    const shown = INTERACTION_KINDS.reduce((total, kind) => total + receipt.countsByKind[kind], 0);
    const detected = [...recordMap].length;
    status = { phase: "ready", message: `${allUnavailable ? "Unavailable · " : ""}${shown} shown · ${detected} detected${partial ? " · partial input coverage" : ""}${detected > shown ? " · some markers hidden or unavailable" : ""}`, partial };
  }

  const capturedSelection = useMemo(() => captureSelectionTarget(selection.atoms), [selection.atoms]);
  const selectionValid = useMemo(() => capturedSelection && validateInteractionTarget(capturedSelection, project.entries, projections).status === "ready",
    [capturedSelection, project.entries, projections]);
  const liveKey = useMemo(() => JSON.stringify(capturedSelection?.kind === "selection" ? capturedSelection.atoms : []), [capturedSelection]);
  const capturedKey = useMemo(() => state.selectionTarget ? JSON.stringify(state.selectionTarget.atoms) : "", [state.selectionTarget]);
  const ligandKey = state.ligandTarget ? JSON.stringify([state.ligandTarget.entryId, state.ligandTarget.componentId]) : "";
  const chosenLigand = candidates.find(candidate => candidate.key === ligandKey);
  const targetLabel = mode === "all" ? "All visible" : mode === "selection" ? state.selectionTarget ? `${state.selectionTarget.atoms.length} captured atom${state.selectionTarget.atoms.length === 1 ? "" : "s"}` : "No captured selection" : chosenLigand?.label ?? (state.ligandTarget ? `${state.ligandLabel ?? "Captured ligand"} · unavailable` : "No ligand chosen");
  const panel: Omit<InteractionPanelProps, "open" | "onOpenChange" | "restoreFocus"> = {
    collapsed: own && state.collapsed, onCollapsedChange: value => { if (ownsProject()) state.setCollapsed(value); },
    show, onShowChange: value => { if (ownsProject()) state.setShow(value); }, choices,
    onToggleType: kind => { if (ownsProject()) state.toggleType(kind); },
    onToggleScope: scope => { if (ownsProject()) state.toggleScope(scope); },
    target: { mode, label: targetLabel, message: mode === "selection" && !state.selectionTarget || mode === "ligand" && !state.ligandTarget ? null : resolution.message, ligandKey, candidates,
      canCaptureSelection: Boolean(selectionValid && !actionUnavailable),
      captureUnavailable: actionUnavailable ?? (!selectionValid ? "Select current atoms to capture an interaction target." : null),
      selectionChanged: Boolean(state.selectionTarget && liveKey !== capturedKey),
      needsUpdate: Boolean((mode === "selection" ? state.selectionTarget : state.ligandTarget) && resolution.status === "needs-update") },
    onTargetModeChange: next => { if (ownsProject()) state.setTargetMode(next); },
    onLigandChange: key => {
      const candidate = candidates.find(item => item.key === key);
      const captured = candidate && captureLigandTarget(candidate);
      const currentProject = queryClient.getQueryData<Project>(["project", project.id]) ?? project;
      if (ownsProject() && captured && validateInteractionTarget(captured, currentProject.entries, projections).status === "ready") state.captureTarget(captured, candidate?.label);
    },
    onCaptureSelection: () => {
      const currentProject = queryClient.getQueryData<Project>(["project", project.id]) ?? project;
      if (ownsProject() && capturedSelection && !actionUnavailable && validateInteractionTarget(capturedSelection, currentProject.entries, projections).status === "ready") state.captureTarget(capturedSelection);
    },
    categories, status, contacts, resultIdentity, inspectedKey, inspected,
    onInspectContact: key => { if (ownsProject() && (key === null || recordMap.has(key))) state.setInspectedKey(key, resultIdentity ?? undefined); },
    warnings: warningGroups.map(group => ({ key: group.key, code: group.code, entryLabel: entries.get(group.entryId)?.name ?? group.entryId,
      message: group.message, knownAtomCount: group.atomIds.length, occurrences: group.occurrences,
      selectUnavailable: actionUnavailable ?? (!group.atomIds.length ? "No exact affected atom identities are available." : !knownCurrentAtoms(group.atomIds.map(atom_id => ({ structure_id: group.entryId, atom_id }))) ? "These warning sites are no longer current." : null) })),
    onFocusContact: key => {
      const record = recordMap.get(key);
      if (!actionUnavailable && show && installed && shownKeys.has(key) && record && interactionHasDisplayGeometry(record) && currentAtoms(interactionParticipants(record))) viewer.current?.focusAtoms(interactionParticipants(record));
    },
    onSelectContact: key => { const record = recordMap.get(key); if (!actionUnavailable && record && currentAtoms(interactionParticipants(record))) onSelect(interactionParticipants(record)); },
    onSelectWarning: key => {
      const group = warningGroups.find(value => value.key === key);
      const atoms = group?.atomIds.map(atom_id => ({ structure_id: group.entryId, atom_id })) ?? [];
      if (!actionUnavailable && currentAtoms(atoms)) onSelect(atoms);
    },
    appearance, onAppearanceChange: (kind, patch) => { if (ownsProject()) state.changeAppearance(kind, patch); },
    onResetAppearance: kind => { if (ownsProject()) state.resetAppearance(kind); },
    onRetry: status.phase !== "error" ? undefined : analysis.error ? analysis.retry : rendererError ? () => setDisplayRetry(value => value + 1) : undefined,
    retryLabel: analysis.error ? "Retry interaction analysis" : "Retry interaction display",
  };
  return { panel, displayKey, displayRecords, appearance, configured: choices.types.length > 0, show,
    launcherDescription: `${show && choices.types.length ? "Interactions enabled" : "Interactions hidden"} · ${status.message}` };
}
