import { useQuery } from "@tanstack/react-query";
import { Pencil, X, Trash2, Plus, Minus } from "lucide-react";
import { useRef, useState } from "react";
import { molecularApi } from "../api/client";
import type { ApplySelectionEdit, Project, Selection, SelectionEditAction, ViewerSettings } from "../api/types";
import { useEditingStore } from "../store/editing";
import { smallMoleculeReason } from "../editing/targets";

interface Props {
  project: Project;
  selection: Selection;
  busy: boolean;
  unavailable: string | null;
  onEdit: ApplySelectionEdit;
  onSettings?: (entryId: string, settings: ViewerSettings) => Promise<void>;
}

export function MolecularEditPanel({ project, selection, busy, unavailable, onEdit, onSettings }: Props) {
  const { open, setOpen, pending, setPending } = useEditingStore();
  const launcher = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const entryIds = new Set(selection.atoms.map(ref => ref.structure_id));
  const entry = entryIds.size === 1 ? project.entries.find(e => entryIds.has(e.id)) : undefined;
  const artifact = entry?.current_artifact_id;
  const query = useQuery({
    queryKey: ["structure", project.id, entry?.id, artifact],
    queryFn: () => molecularApi.structure(project.id, entry!.id),
    enabled: open && Boolean(entry && artifact),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const atoms = query.data?.structure.atoms;
  const selectedAtom = selection.atoms.length === 1 ? atoms?.find(a => a.id === selection.atoms[0].atom_id) : undefined;
  const reason = unavailable ?? (busy || pending ? "Finish the current operation." : !entry ? "Select atoms in one entry." : entry.locked ? "Unlock the entry before editing." : query.isError ? "The selected molecule could not be loaded." : smallMoleculeReason(query.data, selection));
  const close = (owned: boolean) => { setOpen(false); if (owned) launcher.current?.focus(); };
  const execute = async (action: SelectionEditAction) => {
    if (reason || !entry || !artifact) return;
    const owner = project.id;
    setPending(true); setError(null);
    try { await onEdit(entry.id, artifact, selection, action); }
    catch (failure) {
      if (useEditingStore.getState().projectId === owner) setError(failure instanceof Error ? failure.message : "Edit failed.");
    } finally {
      if (useEditingStore.getState().projectId === owner) setPending(false);
    }
  };
  return <div className="molecular-edit-tools">
    <button ref={launcher} type="button" className="viewer-action-button" aria-label="Edit molecule" title={unavailable ?? "Edit selected atoms"}
      aria-haspopup="dialog" aria-expanded={open} aria-disabled={Boolean(unavailable)}
      onClick={() => { if (!unavailable) setOpen(!open); }}><Pencil size={16} /></button>
    {open ? <section className="molecular-edit-panel" role="dialog" aria-modal="false" aria-label="Edit molecule"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(true); } }}>
      <div className="dialog-heading"><strong>Edit</strong><button type="button" aria-label="Close molecular editor" onClick={() => close(true)}><X size={16} /></button></div>
      <p className="edit-target">{entry?.name ?? "Select a molecular target"} · {selection.atoms.length} selected</p>
      <fieldset disabled={Boolean(reason)}><legend>Atoms</legend>
        <div className="edit-element-grid">{(["C", "N", "O", "S", "F", "Cl", "Br", "I"] as const).map(element =>
          <button key={element} type="button" aria-label={`Replace selected atom with ${element}`} title={`Replace selected atom with ${element}`}
            disabled={!selectedAtom} onClick={() => void execute({ operation: "atom.element", element })}>{element}</button>)}</div>
        <div className="edit-compact-actions">
          <button type="button" aria-label="Decrease formal charge" title="Decrease formal charge" disabled={!selectedAtom} onClick={() => void execute({ operation: "atom.charge", delta: -1 })}><Minus size={16} />q</button>
          <button type="button" aria-label="Increase formal charge" title="Increase formal charge" disabled={!selectedAtom} onClick={() => void execute({ operation: "atom.charge", delta: 1 })}><Plus size={16} />q</button>
          <button type="button" aria-label="Delete selected heavy atoms" title="Delete selected heavy atoms" onClick={() => void execute({ operation: "atom.delete" })}><Trash2 size={16} /></button>
        </div>
        <button type="button" onClick={() => void execute({ operation: "hydrogens.prepare" })}>Prepare component hydrogens</button>
        {onSettings && entry ? <button type="button" onClick={() => void onSettings(entry.id, { ...entry.viewer_settings, components: { ...entry.viewer_settings.components, hydrogens: true, nonpolar_hydrogens: true } }).catch(failure => setError(String(failure)))}>Show explicit H</button> : null}
      </fieldset>
      {reason ? <p role="status">{reason}</p> : null}
      {query.isError ? <button type="button" onClick={() => void query.refetch()}>Retry molecule</button> : null}
      {error ? <p role="alert">{error}</p> : null}
      <p className="edit-scientific-note">Prepared small molecules only. Local H follows valence; protonation and optimized geometry are not determined. Source labels describe the original molecule. Isolation and atom hiding can still hide H.</p>
    </section> : null}
  </div>;
}
