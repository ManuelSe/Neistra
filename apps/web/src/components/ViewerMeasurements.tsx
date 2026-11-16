import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import type { AtomReference, Measurement, Project, StructureProjection } from "../api/types";
import type { MeasurementSession } from "../measurements/session";
import { measurementCoordinates, measurementValue } from "../measurements/geometry";
import { inspectMeasurementDraft } from "../selection/inspection";
import { canonicalSelection } from "../selection/selection";
import { useNavigationStore } from "../store/navigation";
import { useWorkspaceStore } from "../store/workspace";
import { isCompleteProjection, structureQueryKey, structureQueryOptions } from "../structures/query";
import type { ViewerMeasurementTarget } from "../viewer/MolecularViewer";
import { MeasurementTool } from "./MeasurementTool";
import { MeasurementContacts } from "./MeasurementContacts";
import { ViewerInspection } from "./ViewerInspection";

type InspectionProps = ComponentProps<typeof ViewerInspection>;
export interface ViewerMeasurementsProps {
  session: MeasurementSession;
  project: Project;
  inspection: InspectionProps;
  sceneAvailable: boolean;
  busy: boolean;
  onUpdate: (measurement: Measurement, name: string, visible: boolean) => Promise<void>;
  onDelete: (measurement: Measurement) => Promise<void>;
  onSelect: (references: AtomReference[]) => void;
  onReturnFocus: () => void;
}

/** Local draft renders never rebuild the enclosing molecular scene. */
export function ViewerMeasurements({ session, project, inspection, sceneAvailable, busy, onUpdate, onDelete, onSelect, onReturnFocus }: ViewerMeasurementsProps) {
  const draft = useSyncExternalStore(session.subscribe, session.snapshot);
  const scope = draft.session;
  const query = useQueryClient();
  const [expandedState, updateExpanded] = useState<{ session: number; id: string | null }>({ session: draft.session, id: null });
  const [contactsState, updateContacts] = useState({ session: draft.session, open: false });
  const contactScope = useRef<AbortController | null>(null);
  const [chooserState, updateChooser] = useState<{ session: number; id: string | null }>({ session: draft.session, id: null });
  const expandedId = expandedState.session === draft.session ? expandedState.id : null;
  const contactsOpen = contactsState.session === draft.session && contactsState.open;
  const chooserEntry = chooserState.session === draft.session ? chooserState.id : null;
  const setExpandedId = (id: string | null) => { if (session.ownsSession(scope)) updateExpanded({ session: scope, id }); };
  const setContactsOpen = (open: boolean) => {
    if (!session.ownsSession(scope)) return;
    contactScope.current?.abort();
    contactScope.current = open ? new AbortController() : null;
    updateContacts({ session: draft.session, open });
  };
  const scopedExpanded = draft.open ? project.measurements.find(item => item.id === expandedId) : undefined;
  const entries = useMemo(() => new Map(project.entries.map(entry => [entry.id, entry])), [project.entries]);
  const draftIds = draft.open ? [...new Set([
    ...draft.slots.flatMap((ref, index) => ref && !(chooserEntry && index === draft.activeSlot) ? [ref.structure_id] : []),
    ...(chooserEntry ? [chooserEntry] : []),
  ])].slice(0, 4) : [];
  const expandedIds = scopedExpanded ? [...new Set(scopedExpanded.atom_references.map(ref => ref.structure_id))].slice(0, 4) : [];
  const draftEntries = draftIds.flatMap(id => { const entry = entries.get(id); return entry?.current_artifact_id ? [entry] : []; });
  const expandedEntries = expandedIds.flatMap(id => { const entry = entries.get(id); return entry?.current_artifact_id ? [entry] : []; });
  // The pinned query observer retains removed trailing entries. Fixed disabled
  // unique slots release the actual source observers on shrink and close.
  const draftQueries = useQueries({ queries: Array.from({ length: 4 }, (_, slot) => {
    const entry = draftEntries[slot];
    return entry ? structureQueryOptions(project.id, entry.id, entry.current_artifact_id)
      : structureQueryOptions(project.id, "", `measurement-draft-unused-${slot}`);
  }) });
  const expandedQueries = useQueries({ queries: Array.from({ length: 4 }, (_, slot) => {
    const entry = expandedEntries[slot];
    return entry ? structureQueryOptions(project.id, entry.id, entry.current_artifact_id)
      : structureQueryOptions(project.id, "", `measurement-expanded-unused-${slot}`);
  }) });
  const structures = new Map(inspection.structures);
  for (const [sources, queries] of [[draftEntries, draftQueries], [expandedEntries, expandedQueries]] as const) {
    sources.forEach((entry, index) => {
      const result = queries[index];
      if (!result.isError && !result.isPlaceholderData && isCompleteProjection(result.data, entry.id, entry.current_artifact_id)) structures.set(entry.id, result.data.structure);
      else structures.delete(entry.id);
    });
  }
  // The temporarily unobserved correction source may still be a current immutable cache hit.
  for (const ref of draft.slots) {
    if (!ref || structures.has(ref.structure_id)) continue;
    const entry = entries.get(ref.structure_id);
    const cached = query.getQueryState<StructureProjection>(structureQueryKey(project.id, ref.structure_id, entry?.current_artifact_id));
    if (cached?.status === "success" && isCompleteProjection(cached.data, ref.structure_id, entry?.current_artifact_id)) structures.set(ref.structure_id, cached.data.structure);
  }
  const basisStructures = new Map(structures);
  draft.slots.forEach((ref, index) => { if (ref && entries.get(ref.structure_id)?.current_artifact_id !== draft.artifacts[index]) basisStructures.delete(ref.structure_id); });
  const basis = draft.open && draft.acquiring ? { kind: draft.kind, slots: draft.slots, structures: basisStructures } : undefined;
  const markerInputs = useRef({ basis, basisStructures });
  markerInputs.current = { basis, basisStructures };
  const geometry = inspectMeasurementDraft(draft.kind, draft.slots, basisStructures, inspection.paused);
  const value = geometry.status === "ready" ? geometry.value ?? null : null;
  const latest = useRef({ inspection, project, sceneAvailable });
  latest.current = { inspection, project, sceneAvailable };
  const leaseOwner = useRef<object | null>(null);
  const viewer = inspection.viewer;

  useEffect(() => {
    if (!draft.open || !draft.acquiring || inspection.paused || !sceneAvailable || !viewer) return;
    if (!viewer.acquireAtomPickLease) { session.cancelAcquisition("Choose targets by name; this viewer does not support atom acquisition."); return; }
    const owner = {}; leaseOwner.current = owner;
    const current = () => leaseOwner.current === owner && latest.current.inspection.viewer === viewer
      && !latest.current.inspection.paused && latest.current.sceneAvailable
      && session.ownsAcquisition(draft.session, draft.generation);
    const release = viewer.acquireAtomPickLease({ owner, isCurrent: current,
      onPick: event => {
        if (!current()) return;
        const now = latest.current;
        const entry = now.project.entries.find(entry => entry.id === event.reference.structure_id);
        const source = now.inspection.sources.find(source => source.entryId === event.reference.structure_id);
        if (!entry?.visible || entry.current_artifact_id !== event.source.artifactId || source?.normalized !== event.source.normalized
          || source.settings !== event.source.settings) return;
        const sourceQuery = query.getQueryState<StructureProjection>(structureQueryKey(now.project.id, entry.id, entry.current_artifact_id));
        if (sourceQuery?.status !== "success" || !isCompleteProjection(sourceQuery.data, entry.id, entry.current_artifact_id)
          || sourceQuery.data.structure !== event.source.normalized
          || measurementCoordinates([event.reference], new Map([[entry.id, event.source.normalized]])).status !== "ready") return;
        session.choose(event.reference, entry.current_artifact_id);
      },
      onRetire: reason => {
        // Responsive renderer retirement releases its lease without discarding
        // the application-owned acquisition intent for the replacement renderer.
        if (reason === "disposed") return;
        const state = session.snapshot();
        if (leaseOwner.current === owner && state.open && state.acquiring
          && state.session === draft.session && state.generation === draft.generation) session.cancelAcquisition(
          reason === "source" ? "Atom picking stopped after the structure changed."
            : reason === "preview" ? "Measurements are paused during preview."
              : "Atom picking stopped. Choose a target to continue.");
      },
    });
    return () => { if (leaseOwner.current === owner) leaseOwner.current = null; release(); };
  }, [session, viewer, draft.open, draft.acquiring, draft.session, draft.generation, inspection.paused, sceneAvailable, query]);

  useEffect(() => {
    const { basis, basisStructures } = markerInputs.current;
    const targets: ViewerMeasurementTarget[] = [];
    if (basis && !inspection.paused && sceneAvailable) draft.slots.forEach((reference, index) => {
      if (!reference) return;
      const source = inspection.sources.find(source => source.entryId === reference.structure_id);
      if (source && source.artifactId === draft.artifacts[index] && source.normalized === basisStructures.get(reference.structure_id)
        && measurementCoordinates([reference], basisStructures).status === "ready") targets.push({ reference, index: index + 1, source });
    });
    void viewer?.setMeasurementTargets?.(targets).catch(() => { session.notify("Measurement targets could not be displayed.", draft.session); });
  }, [viewer, draft.slots, draft.artifacts, draft.session, draft.open, draft.acquiring, inspection.paused, inspection.sources, sceneAvailable, session]);
  useEffect(() => () => { void viewer?.setMeasurementTargets?.([]).catch(() => undefined); }, [viewer]);

  const drawable = useMemo(() => {
    const visible = new Set(inspection.sources.map(source => source.entryId));
    return new Set(sceneAvailable && !inspection.paused ? viewer?.getRenderedAtomReferences()
      .filter(ref => visible.has(ref.structure_id)).map(ref => JSON.stringify([ref.structure_id, ref.atom_id])) : []);
  }, [viewer, sceneAvailable, inspection.paused, inspection.sources]);
  const canFocus = (measurement: Measurement) => !inspection.paused && measurementValue(measurement.kind, measurement.atom_references, structures) !== null
    && measurement.atom_references.every(ref => drawable.has(JSON.stringify([ref.structure_id, ref.atom_id])));
  const savedValues = new Map(project.measurements.map(measurement => [measurement.id, inspection.paused ? null : measurementValue(measurement.kind, measurement.atom_references, structures)]));
  const chooserChanged = useCallback((id: string | null) => { if (session.ownsSession(scope)) updateChooser({ session: scope, id }); }, [scope, session]);
  const preferredEntryId = useNavigationStore(state => state.projectId === project.id ? state.inspectedEntryId : null);
  const load = async (id: string) => {
    const context = latest.current.project;
    const entry = context.entries.find(entry => entry.id === id);
    if (!session.ownsSession(scope) || !entry?.current_artifact_id) throw new Error("This entry has no current molecular artifact.");
    await query.fetchQuery(structureQueryOptions(context.id, id, entry.current_artifact_id));
    if (!session.ownsSession(scope) || latest.current.project.entries.find(item => item.id === id)?.current_artifact_id !== entry.current_artifact_id) throw new Error("The target changed. Choose its current atoms.");
  };
  return <>
    <ViewerInspection {...inspection} structures={structures} measurementBasis={basis} />
    <MeasurementTool draft={draft} entries={project.entries} structures={structures} selection={inspection.selection} inspectionOrder={inspection.order}
      paused={inspection.paused} busy={busy} value={value} unavailableReason={geometry.reason ?? null}
      onClose={() => { if (session.ownsSession(scope)) session.close(); }}
      onCancelAcquisition={() => { if (session.ownsSession(scope)) session.cancelAcquisition(); }}
      onKind={kind => { if (session.ownsSession(scope)) session.setKind(kind); }} onActiveSlot={index => { if (session.ownsSession(scope)) session.activate(index); }}
      onRemove={index => { if (session.ownsSession(scope)) session.remove(index); }} onChooseTarget={ref => {
        if (!session.ownsSession(scope)) return false;
        const accepted = session.choose(ref);
        if (!accepted) session.notify("Choose a different current atom.", scope);
        return accepted;
      }} onUseSelection={refs => { if (session.ownsSession(scope)) session.useSelection(refs); }}
      onName={name => { if (session.ownsSession(scope)) session.setName(name); }} onReset={() => { if (session.ownsSession(scope)) session.reset(); }}
      onSave={() => { if (session.ownsSession(scope)) void session.save(); }}
      onPickInViewer={() => {
        if (!session.ownsSession(scope) || !session.inspectionAvailable()) return;
        // Retire secondary actions before publishing compact presentation state.
        setContactsOpen(false); setExpandedId(null); updateChooser({ session: scope, id: null });
        session.pickInViewer();
      }}
      onReviewTargets={() => { if (session.ownsSession(scope)) session.reviewTargets(); }}
      measurements={project.measurements} savedValues={savedValues} expandedId={scopedExpanded?.id ?? null} onExpand={setExpandedId}
      onUpdate={(measurement, name, visible) => { if (session.ownsSession(scope)) void onUpdate(measurement, name, visible).catch(() => undefined); }}
      onDelete={measurement => { if (session.ownsSession(scope)) void onDelete(measurement).catch(() => undefined); }}
      onSelectParticipants={measurement => {
        if (!session.ownsSession(scope) || !session.inspectionAvailable()) return;
        if (!measurement.atom_references.every(ref => entries.get(ref.structure_id)?.atom_ids.includes(ref.atom_id))) {
          session.notify("Some participants are no longer available.", scope); return;
        }
        session.cancelAcquisition(); onSelect(measurement.atom_references);
      }} canFocus={canFocus}
      onFocusParticipants={measurement => {
        if (!session.ownsSession(scope) || !canFocus(measurement)) return;
        const rendered = new Set(viewer?.getRenderedAtomReferences().map(ref => JSON.stringify([ref.structure_id, ref.atom_id])));
        if (measurement.atom_references.every(ref => rendered.has(JSON.stringify([ref.structure_id, ref.atom_id])))) viewer?.focusAtoms(measurement.atom_references);
      }}
      onLoadEntry={load} onChooserEntryChange={chooserChanged} contactsOpen={draft.open && contactsOpen} onContactsOpenChange={setContactsOpen}
      contactsContent={<MeasurementContacts key={scope} project={project} session={session} preferredEntryId={preferredEntryId} paused={inspection.paused}
        openSignal={contactScope.current?.signal}
        onSelect={references => { session.cancelAcquisition(); onSelect(canonicalSelection(references, "atom", "inspector").atoms); }} />}
      onReturnFocus={() => {
        if (useWorkspaceStore.getState().activeProjectId === project.id && latest.current.project.id === project.id
          && session.snapshot().session === scope + 1) onReturnFocus();
      }} />
  </>;
}
