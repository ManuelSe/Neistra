import { useQuery } from "@tanstack/react-query";
import { Pencil, X, Trash2, Plus, Minus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { molecularApi } from "../api/client";
import type { ApplySelectionEdit, MolecularWarning, Project, Selection, SelectionEditAction, ViewerSettings } from "../api/types";
import { useEditingStore } from "../store/editing";
import { smallMoleculeReason } from "../editing/targets";
import { FragmentGlyph } from "./FragmentGlyph";
import { FRAGMENTS } from "../editing/fragments";
import { AMINO_ACIDS, residueMutationTarget } from "../editing/residues";
import { useEditPanelPosition } from "../editing/useEditPanelPosition";

interface Props {
  onOpen?: () => void;
  project: Project;
  selection: Selection;
  busy: boolean;
  unavailable: string | null;
  onEdit: ApplySelectionEdit;
  onSettings?: (entryId: string, settings: ViewerSettings) => Promise<void>;
}

export function MolecularEditPanel({ project, selection, busy, unavailable, onEdit, onSettings, onOpen }: Props) {
  const editing = useEditingStore();
  const { setOpen, setPending, section, setSection } = editing;
  const open = editing.projectId === project.id && editing.open;
  const pending = editing.projectId === project.id && editing.pending;
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEditPanelPosition(open, project.id, launcher, panel);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ entry: string; warnings: MolecularWarning[] } | null>(null);
  const entryIds = useMemo(() => new Set(selection.atoms.map(ref => ref.structure_id)), [selection]);
  const entry = entryIds.size === 1 ? project.entries.find(e => entryIds.has(e.id)) : undefined;
  const artifact = entry?.current_artifact_id;
  const query = useQuery({
    queryKey: ["structure", project.id, entry?.id, artifact],
    queryFn: () => molecularApi.structure(project.id, entry!.id),
    enabled: open && Boolean(entry && artifact),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const atoms = query.data?.structure.atoms;
  const selectedAtom = useMemo(() => selection.atoms.length === 1 ? atoms?.find(a => a.id === selection.atoms[0].atom_id) : undefined, [atoms, selection]);
  const pair = selection.atoms.length === 2 && selection.atoms.every(ref => atoms?.some(atom => atom.id === ref.atom_id && atom.element !== "H"));
  const bond = pair ? query.data?.structure.bonds.find(b => selection.atoms.every(ref => [b.atom_1_id, b.atom_2_id].includes(ref.atom_id))) : undefined;
  const mutationTarget = useMemo(() => residueMutationTarget(query.data, selection), [query.data, selection]);
  const molecularReason = useMemo(() => section !== "residues" ? smallMoleculeReason(query.data, selection) : null, [query.data, selection, section]);
  const reason = unavailable ?? (busy || pending ? "Finish the current operation." : !entry ? "Select atoms in one entry." : entry.locked ? "Unlock the entry before editing." : query.isError ? "The selected molecule could not be loaded." : section === "residues" ? !["protein", "complex"].includes(entry.structure_type) ? "Mutation requires a protein or complex entry." : mutationTarget.reason : molecularReason);
  const close = (owned: boolean) => { setOpen(false); if (owned) launcher.current?.focus(); };
  const execute = async (action: SelectionEditAction) => {
    if (reason || !entry || !artifact || useEditingStore.getState().pending) return;
    const owner = project.id;
    if (panel.current?.contains(document.activeElement)) panel.current.focus();
    setPending(true); setError(null);
    try {
      const result = await onEdit(entry.id, artifact, selection, action);
      if (useEditingStore.getState().projectId === owner) setFeedback({ entry: entry.name, warnings: result.warnings });
    }
    catch (failure) {
      if (useEditingStore.getState().projectId === owner) setError(`${entry.name}: ${failure instanceof Error ? failure.message : "Edit failed."}`);
    } finally {
      if (useEditingStore.getState().projectId === owner) setPending(false);
    }
  };
  const showHydrogens = async () => {
    if (!onSettings || !entry || busy || pending) return;
    const owner = project.id;
    if (panel.current?.contains(document.activeElement)) panel.current.focus();
    try {
      await onSettings(entry.id, { ...entry.viewer_settings, components: {
        ...entry.viewer_settings.components, hydrogens: true, nonpolar_hydrogens: true,
      } });
    } catch (failure) {
      if (useEditingStore.getState().projectId === owner) setError(`${entry.name}: ${String(failure)}`);
    }
  };
  return <div className="molecular-edit-tools">
    <button ref={launcher} type="button" className="viewer-action-button" aria-label="Edit molecule" title={unavailable ?? "Edit selected atoms"}
      aria-haspopup="dialog" aria-expanded={open} aria-disabled={Boolean(unavailable)}
      onClick={event => { if (!unavailable) { useEditingStore.getState().setFocusRequested(!open && event.detail === 0); setOpen(!open); if (!open) onOpen?.(); } }}><Pencil size={16} /></button>
    {open ? createPortal(<section ref={panel} tabIndex={-1} className="molecular-edit-panel" role="dialog" aria-modal="false" aria-label="Edit molecule"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(true); } }}>
      <div className="dialog-heading"><strong>Edit</strong><button type="button" aria-label="Close molecular editor" onClick={() => close(true)}><X size={16} /></button></div>
      <p className="edit-target">{entry?.name ?? "Select a molecular target"} · {selection.atoms.length} selected</p>
      <div className="edit-sections" role="group" aria-label="Editing tools">{(["atoms", "bonds", "fragments", "residues"] as const).map(tool =>
        <button type="button" key={tool} aria-pressed={section === tool} onClick={() => setSection(tool)}>{tool[0].toUpperCase() + tool.slice(1)}</button>)}</div>
      {section === "atoms" ? <fieldset disabled={Boolean(reason)}><legend>Atoms</legend>
        <div className="edit-element-grid">{(["C", "N", "O", "S", "F", "Cl", "Br", "I"] as const).map(element =>
          <button key={element} type="button" aria-label={`Replace selected atom with ${element}`} title={`Replace selected atom with ${element}`}
            disabled={!selectedAtom || selectedAtom.element === element} onClick={() => void execute({ operation: "atom.element", element })}>{element}</button>)}</div>
        <div className="edit-compact-actions">
          <button type="button" aria-label="Decrease formal charge" title="Decrease formal charge" disabled={!selectedAtom} onClick={() => void execute({ operation: "atom.charge", delta: -1 })}><Minus size={16} />q</button>
          <button type="button" aria-label="Increase formal charge" title="Increase formal charge" disabled={!selectedAtom} onClick={() => void execute({ operation: "atom.charge", delta: 1 })}><Plus size={16} />q</button>
          <button type="button" aria-label="Delete selected heavy atoms" title="Delete selected heavy atoms" onClick={() => void execute({ operation: "atom.delete" })}><Trash2 size={16} /></button>
        </div>
      </fieldset> : section === "bonds" ? <fieldset disabled={Boolean(reason)}><legend>Bonds</legend>
        <p>{!pair ? "Select two heavy-atom endpoints." : bond?.aromatic ? "Aromatic bonds are preserved; direct changes are unsupported." : bond ? `Selected bond order: ${bond.order}` : "Selected endpoints are not bonded."}</p>
        <div className="edit-compact-actions">
          <button type="button" disabled={!pair || Boolean(bond)} onClick={() => void execute({ operation: "bond.create" })}>Create bond</button>
          <button type="button" disabled={!bond || bond.aromatic} onClick={() => void execute({ operation: "bond.delete" })}>Break bond</button>
          <button type="button" aria-label="Decrease bond order" title="Decrease bond order" disabled={!bond || bond.aromatic || (bond.order ?? 0) <= 1} onClick={() => { if (bond?.order) void execute({ operation: "bond.order", order: (bond.order - 1) as 1 | 2 | 3 }); }}><Minus size={16} /></button>
          <button type="button" aria-label="Increase bond order" title="Increase bond order" disabled={!bond || bond.aromatic || (bond.order ?? 3) >= 3} onClick={() => { if (bond?.order) void execute({ operation: "bond.order", order: (bond.order + 1) as 1 | 2 | 3 }); }}><Plus size={16} /></button>
        </div>
      </fieldset> : section === "fragments" ? <fieldset disabled={Boolean(reason)}><legend>Fragments</legend>
        <p>Select one terminal H to replace it at its attachment point.</p>
        <div className="edit-fragment-grid">{FRAGMENTS.map(fragment => <button type="button" key={fragment.name} aria-label={`Replace H with ${fragment.label}`} title={`Replace H with ${fragment.label}`}
          disabled={selectedAtom?.element !== "H"} onClick={() => void execute({ operation: "fragment.replace", fragment: fragment.name })}>
          <FragmentGlyph name={fragment.name} /><span>{fragment.label}</span></button>)}</div>
      </fieldset> : <fieldset disabled={Boolean(reason)}><legend>Mutate residue</legend>
        <p>{mutationTarget.residue ? `${mutationTarget.residue.name} · residue ${mutationTarget.residue.author_number ?? mutationTarget.residue.id}` : "Pick a complete amino-acid residue."}</p>
        <div className="edit-element-grid">{AMINO_ACIDS.map(target => <button type="button" key={target} aria-label={`Mutate residue to ${target}`} title={mutationTarget.residue?.name === target ? "Residue already has this type" : `Mutate residue to ${target}`}
          disabled={mutationTarget.residue?.name === target} onClick={() => void execute({ operation: "residue.mutate", target_name: target })}>{target}</button>)}</div>
        <p>One template placement; backbone retained. No rotamer search or automatic protein protonation. Review warnings and use existing protein preparation tools separately.</p>
      </fieldset>}
      {section !== "residues" ? <div className="edit-hydrogens">
        <button type="button" disabled={Boolean(reason)} onClick={() => void execute({ operation: "hydrogens.prepare" })}>Prepare component hydrogens</button>
        {onSettings && entry ? <button type="button" disabled={busy || pending} onClick={() => void showHydrogens()}>Show explicit H</button> : null}
      </div> : null}
      {reason ? <p role="status">{reason}</p> : null}
      {query.isError ? <button type="button" onClick={() => void query.refetch()}>Retry molecule</button> : null}
      {error ? <p role="alert">{error}</p> : null}
      {feedback ? <details className="edit-scientific-note"><summary>{feedback.entry}: {feedback.warnings.length} chemistry warnings</summary>{feedback.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}</details> : null}
      <details className="edit-scientific-note"><summary>Limits and chemistry</summary><p>{section === "residues" ? "Standard-residue template restrictions apply; this is not complete protein preparation." : "Prepared small molecules only. Local H follows valence; protonation and optimized geometry are not determined. Source labels describe the original molecule. Isolation, local H preferences and atom hiding can still hide H."}</p></details>
    </section>, document.body) : null}
  </div>;
}
