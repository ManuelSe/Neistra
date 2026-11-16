import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { projectApi } from "../api/client";
import type { AtomReference, Contact, Project } from "../api/types";
import type { MeasurementSession } from "../measurements/session";
import { useWorkspaceStore } from "../store/workspace";
import { useSelectionStore } from "../store/selection";

interface ContactOwner {
  controller: AbortController;
  entryId: string;
  artifactId: string;
  session: number;
  epoch: number;
}

/** A disposable complete read; result buttons retain the exact request owner. */
export function MeasurementContacts({ project, session, preferredEntryId, paused, onSelect, openSignal }: {
  project: Project;
  session: MeasurementSession;
  preferredEntryId: string | null;
  paused: boolean;
  onSelect: (references: AtomReference[]) => void;
  openSignal?: AbortSignal;
}) {
  const query = useQueryClient();
  const [entryId, setEntryId] = useState(() => project.entries.some(entry => entry.id === preferredEntryId && entry.current_artifact_id) ? preferredEntryId! : "");
  const [cutoff, setCutoff] = useState("2");
  const [result, setResult] = useState<{ owner: ContactOwner; rows: Contact[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [page, setPage] = useState(0);
  const active = useRef<ContactOwner | null>(null);
  const mounted = useRef(true);
  const selected = project.entries.find(entry => entry.id === entryId && entry.current_artifact_id);
  const retirementKey = JSON.stringify([project.id, session.snapshot().session, entryId, selected?.current_artifact_id, cutoff, paused]);
  const retire = useCallback(() => {
    active.current?.controller.abort(); active.current = null;
    setResult(null); setError(null); setBusy(false); setPage(0);
  }, []);
  useLayoutEffect(() => { retire(); }, [retirementKey, retire]);
  useLayoutEffect(() => {
    if (openSignal?.aborted) retire();
    openSignal?.addEventListener("abort", retire);
    return () => { openSignal?.removeEventListener("abort", retire); };
  }, [openSignal, retire]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.controller.abort(); active.current = null; }; }, []);

  const owns = useCallback((owner: ContactOwner) => {
    if (!mounted.current || active.current !== owner || owner.controller.signal.aborted || openSignal?.aborted
      || !session.ownsSession(owner.session) || !session.inspectionAvailable()
      || useWorkspaceStore.getState().activeProjectId !== project.id
      || useSelectionStore.getState().projectEpoch !== owner.epoch) return false;
    const current = query.getQueryData<Project>(["project", project.id]);
    return current?.entries.some(entry => entry.id === owner.entryId && entry.current_artifact_id === owner.artifactId) ?? false;
  }, [project.id, query, session, openSignal]);
  useLayoutEffect(() => {
    const check = () => { if (active.current && !owns(active.current)) retire(); };
    const release = [session.subscribe(check), query.getQueryCache().subscribe(check),
      useWorkspaceStore.subscribe(check), useSelectionStore.subscribe(check)];
    return () => { for (const stop of release) stop(); };
  }, [owns, query, retire, session]);
  const find = () => {
    if (openSignal?.aborted || !mounted.current) return;
    retire();
    if (!selected?.current_artifact_id || paused || !session.inspectionAvailable()) return;
    const radius = Number(cutoff);
    if (!Number.isFinite(radius) || radius <= 0.5 || radius > 10) {
      setError("Set a cutoff greater than 0.5 and at most 10 Å."); return;
    }
    const owner: ContactOwner = { controller: new AbortController(), entryId: selected.id,
      artifactId: selected.current_artifact_id, session: session.snapshot().session,
      epoch: useSelectionStore.getState().projectEpoch };
    active.current = owner; setBusy(true);
    void projectApi.contacts({ id: project.id }, owner.entryId, radius, 0.5, {
      expectedArtifactId: owner.artifactId, signal: owner.controller.signal,
    }).then(rows => { if (owns(owner)) setResult({ owner, rows }); })
      .catch((error: unknown) => { if (owns(owner)) setError(error instanceof Error ? error.message : "Contact search failed."); })
      .finally(() => { if (owns(owner)) setBusy(false); });
  };
  const currentResult = result && owns(result.owner) ? result : null;
  const pages = Math.max(1, Math.ceil((currentResult?.rows.length ?? 0) / 50));
  const shownPage = Math.min(page, pages - 1);
  const rows = currentResult?.rows.slice(shownPage * 50, (shownPage + 1) * 50) ?? [];
  return <section className="contacts-panel" aria-label="Close contacts">
    <div className="form-row"><label>Structure<select value={selected?.id ?? ""} disabled={paused}
      onChange={event => { retire(); setEntryId(event.target.value); }}>
      <option value="">Choose a structure</option>
      {project.entries.filter(entry => entry.current_artifact_id).map(entry => <option key={entry.id} value={entry.id}>
        {entry.name}{project.entries.some(other => other.id !== entry.id && other.name === entry.name) ? ` (${entry.id})` : ""}
      </option>)}
    </select></label>
    <label>Cutoff (Å)<input type="number" min="0.6" max="10" step="0.1" value={cutoff} disabled={paused}
      onChange={event => { retire(); setCutoff(event.target.value); }} /></label></div>
    <button type="button" disabled={!selected || busy || paused} onClick={find}>
      {busy ? <LoaderCircle size={15} aria-hidden="true" /> : null}{busy ? "Finding contacts…" : "Find contacts"}
    </button>
    {paused ? <p className="measurement-secondary">Contacts are paused during preview.</p> : null}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
    {currentResult ? <p className="measurement-secondary">{currentResult.rows.length} contacts</p> : null}
    <div className="contact-results">{rows.map(contact => <button type="button" key={`${contact.atom_1.atom_id}-${contact.atom_2.atom_id}`}
      onClick={() => {
        if (!currentResult || !owns(currentResult.owner)) return;
        const current = query.getQueryData<Project>(["project", project.id]);
        const entry = current?.entries.find(entry => entry.id === currentResult.owner.entryId);
        if (!entry || !entry.atom_ids.includes(contact.atom_1.atom_id) || !entry.atom_ids.includes(contact.atom_2.atom_id)) return;
        onSelect([{ ...contact.atom_1 }, { ...contact.atom_2 }]);
      }}>Atoms {contact.atom_1.atom_id}–{contact.atom_2.atom_id}<span>{contact.distance.toFixed(2)} Å</span></button>)}</div>
    {pages > 1 ? <div className="measurement-pagination">
      <button type="button" className="measurement-icon" aria-label="Previous contact page" disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}><ChevronLeft size={17} /></button>
      <span>Page {shownPage + 1} of {pages}</span>
      <button type="button" className="measurement-icon" aria-label="Next contact page" disabled={shownPage + 1 >= pages} onClick={() => setPage(shownPage + 1)}><ChevronRight size={17} /></button>
    </div> : null}
  </section>;
}
