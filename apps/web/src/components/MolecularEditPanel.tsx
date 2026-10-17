import { placementContext } from "../editing/placement";
import { useQuery } from "@tanstack/react-query";
import { Pencil, X, Trash2, Plus, Minus, ChevronRight, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { molecularApi, projectApi } from "../api/client";
import type { ApplySelectionEdit, HydrogenReport, HydrogenReconciliationReport, HydrogenGeometry, ModelPlacementAction, MolecularWarning, Project, Selection, SelectionEditAction, ViewerSettings } from "../api/types";
import { useEditingStore } from "../store/editing";
import { isBondAction, isHydrogenAction, nextPlacement, placementLabel } from "../editing/hydrogen";
import { HydrogenReconciliationDetails } from "./HydrogenReconciliationDetails";
import { HydrogenReportDetails } from "./HydrogenReportDetails";
import { FragmentGlyph } from "./FragmentGlyph";
import { FRAGMENTS } from "../editing/fragments";
import { AMINO_ACIDS, residueMutationTarget } from "../editing/residues";
import { ELEMENTS } from "../editing/elements";
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
  const { element: addElement, charge: addCharge, unknown: addUnknown } = editing.atomDraft;
  const [elementChoice, setElementChoice] = useState("P");
  const [chargeChoice, setChargeChoice] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ entry: string; warnings: MolecularWarning[]; report?: HydrogenReport | null; reconciliation?: HydrogenReconciliationReport | null; projectId: string; generation: number } | null>(null);
  const entryIds = useMemo(() => new Set(selection.atoms.map(ref => ref.structure_id)), [selection]);
  const entry = entryIds.size === 1 ? project.entries.find(e => entryIds.has(e.id)) : selection.atoms.length === 0 ? project.entries.find(e => e.id === editing.targetEntryId) : undefined;
  const artifact = entry?.current_artifact_id;
  const query = useQuery({
    queryKey: ["structure", project.id, entry?.id, artifact],
    queryFn: () => molecularApi.structure(project.id, entry!.id),
    enabled: open && Boolean(entry && artifact),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const atoms = query.data?.structure.atoms;
  const selectedAtom = useMemo(() => selection.atoms.length === 1 ? atoms?.find(a => a.id === selection.atoms[0].atom_id) : undefined, [atoms, selection]);
  const pair = selection.atoms.length === 2 && selection.atoms.every(ref => atoms?.some(atom => atom.id === ref.atom_id));
  const bond = pair ? query.data?.structure.bonds.find(b => selection.atoms.every(ref => [b.atom_1_id, b.atom_2_id].includes(ref.atom_id))) : undefined;
  const mutationTarget = useMemo(() => residueMutationTarget(query.data, selection), [query.data, selection]);
  const directReason = !query.data ? "Loading selected molecule…" : !selection.atoms.every(ref => atoms?.some(atom => atom.id === ref.atom_id)) ? "Some selected atoms are no longer present." : null;
  const reason = unavailable ?? (busy || pending ? "Finish the current operation." : !entry ? "Select atoms in one entry." : entry.locked ? "Unlock the entry before editing." : query.isError ? "The selected molecule could not be loaded." : section === "residues" ? !["protein", "complex"].includes(entry.structure_type) ? "Mutation requires a protein or complex entry." : mutationTarget.reason : directReason);
  const { placement: ownedPlacement, setPlacement } = editing;
  const hydrogenPolicy = section === "bonds" ? editing.bondHydrogenPolicy : editing.hydrogenPolicy;
  const context = placementContext(project, entry?.id, selection, editing.generation, hydrogenPolicy);
  const draft = editing.placement?.context === context ? editing.placement : null;
  const inspecting = Boolean(draft && editing.inspectingPlacement && !draft.error);
  const noStandaloneHydrogens = Boolean(draft && isHydrogenAction(draft.action) && draft.result?.hydrogen_report?.added_hydrogen_count === 0);
  useEditPanelPosition(open, project.id, launcher, panel, inspecting);
  useEffect(() => {
    const current = ownedPlacement;
    if (!current) return;
    if (!open || current.context !== context || unavailable || query.isError) {
      if (useEditingStore.getState().placement === current) setPlacement(null);
      return;
    }
    if (current.result || current.error || !entry || !artifact) return;
    const controller = new AbortController();
    void projectApi.modelPreview(project, entry.id, artifact, selection, current.action, isHydrogenAction(current.action) ? "preserve" : hydrogenPolicy, controller.signal)
      .then(result => { if (!controller.signal.aborted && useEditingStore.getState().placement === current) setPlacement({ ...current, result }); })
      .catch((failure: unknown) => { if (!controller.signal.aborted && useEditingStore.getState().placement === current) setPlacement({ ...current, error: failure instanceof Error ? failure.message : "Placement preview failed." }); });
    return () => controller.abort();
  }, [artifact, context, ownedPlacement, hydrogenPolicy, setPlacement, entry, open, project, selection, unavailable, query.isError]);
  const preview = (action: ModelPlacementAction) => {
    if (reason || pending || !entry || !artifact) return;
    if (panel.current?.contains(document.activeElement)) panel.current.focus();
    setError(null); setFeedback(null); editing.setPlacement({ context, action }); editing.setInspectingPlacement(true);
  };
  const close = (owned: boolean) => { setOpen(false); if (owned) launcher.current?.focus(); };
  const execute = async (action: SelectionEditAction) => {
    if (reason || !entry || !artifact || useEditingStore.getState().pending) return;
    const owner = project.id;
    const generation = useEditingStore.getState().generation;
    if (panel.current?.contains(document.activeElement)) panel.current.focus();
    setPending(true); setError(null); setFeedback(null);
    try {
      const direct = !["hydrogens.prepare", "residue.mutate", "fragment.replace"].includes(action.operation);
      const policy = isBondAction(action) ? editing.bondHydrogenPolicy : direct && !["hydrogens.complete", "hydrogens.add"].includes(action.operation) ? editing.hydrogenPolicy : "preserve";
      const result = await (policy !== "preserve" || isBondAction(action)
        ? onEdit(entry.id, artifact, selection, action, policy)
        : onEdit(entry.id, artifact, selection, action));
      if (useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation) editing.setPlacement(null);
      if (useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation) setFeedback({ entry: entry.name, warnings: result.warnings, report: result.hydrogen_report, reconciliation: result.hydrogen_reconciliation_report, projectId: owner, generation });
    }
    catch (failure) {
      if (useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation) setError(`${entry.name}: ${failure instanceof Error ? failure.message : "Edit failed."}`);
    } finally {
      if (useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation) setPending(false);
    }
  };
  const bondEdit = (action: ModelPlacementAction) => {
    if (editing.previewBondChanges) preview(action);
    else void execute(action);
  };
  const visibleFeedback = feedback?.projectId === project.id && feedback.generation === editing.generation ? feedback : null;
  const showHydrogens = async () => {
    if (!onSettings || !entry || busy || pending) return;
    const owner = project.id;
    const generation = useEditingStore.getState().generation;
    if (panel.current?.contains(document.activeElement)) panel.current.focus();
    try {
      await onSettings(entry.id, { ...entry.viewer_settings, components: {
        ...entry.viewer_settings.components, hydrogens: true, nonpolar_hydrogens: true,
      } });
    } catch (failure) {
      if (useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation) setError(`${entry.name}: ${String(failure)}`);
    }
  };
  return <div className="molecular-edit-tools">
    <button ref={launcher} type="button" className="viewer-action-button" aria-label="Edit molecule" title={unavailable ?? "Edit selected atoms"}
      aria-haspopup="dialog" aria-expanded={open} aria-disabled={Boolean(unavailable)}
      onClick={event => { if (!unavailable) { useEditingStore.getState().setFocusRequested(!open && event.detail === 0); setOpen(!open); if (!open) onOpen?.(); } }}><Pencil size={16} /></button>
    {open ? createPortal(<section ref={panel} tabIndex={-1} className={`molecular-edit-panel${inspecting ? " is-inspecting" : ""}`} role="dialog" aria-modal="false" aria-label="Edit molecule"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(true); } }}>
      <div hidden={inspecting}>
      <div className="dialog-heading"><strong>Edit</strong><button type="button" aria-label="Close molecular editor" onClick={() => close(true)}><X size={16} /></button></div>
      <p className="edit-target">{entry?.name ?? "Select a molecular target"} · {selection.atoms.length} selected</p>
      {!selection.atoms.length && project.entries.length > 0 ? <label>Target entry<select disabled={busy || pending || Boolean(unavailable)} value={entry?.id ?? ""} onChange={event => editing.setTargetEntryId(event.target.value || null)}><option value="">Choose an entry…</option>{project.entries.map(e => <option key={e.id} value={e.id}>{e.name}{e.locked ? " (locked)" : ""}</option>)}</select></label> : null}
      <div className="edit-sections" role="group" aria-label="Editing tools">{(["atoms", "bonds", "fragments", "residues"] as const).map(tool =>
        <button type="button" key={tool} aria-pressed={section === tool} onClick={() => setSection(tool)}>{tool[0].toUpperCase() + tool.slice(1)}</button>)}</div>
      {section === "atoms" ? <fieldset disabled={Boolean(reason)}><legend>Atoms</legend>
        <div className="edit-element-grid">{(["C", "N", "O", "S", "F", "Cl", "Br", "I"] as const).map(element =>
          <button key={element} type="button" aria-label={`Replace selected atom with ${element}`} title={`Replace selected atom with ${element}`}
            disabled={!selectedAtom || selectedAtom.element === element} onClick={() => void execute({ operation: "atom.element", element })}>{element}</button>)}</div>
        <div className="edit-compact-actions">
          <button type="button" aria-label="Decrease formal charge" title="Decrease formal charge" disabled={!selectedAtom || selectedAtom.formal_charge === null} onClick={() => { if (selectedAtom?.formal_charge !== null && selectedAtom) void execute({ operation: "atom.charge.set", charge: selectedAtom.formal_charge - 1 }); }}><Minus size={16} />q</button>
          <button type="button" aria-label="Increase formal charge" title="Increase formal charge" disabled={!selectedAtom || selectedAtom.formal_charge === null} onClick={() => { if (selectedAtom?.formal_charge !== null && selectedAtom) void execute({ operation: "atom.charge.set", charge: selectedAtom.formal_charge + 1 }); }}><Plus size={16} />q</button>
          <button type="button" aria-label="Delete selected atoms" title="Delete selected atoms" disabled={!selection.atoms.length} onClick={() => void execute({ operation: "atom.delete" })}><Trash2 size={16} /></button>
        </div>
        <details><summary>Add atom</summary>
          <p>{selectedAtom ? `Attach to atom ${selectedAtom.id}; existing H are preserved.` : entry?.atom_count === 0 ? "Place the first atom of this empty entry at the origin." : "Select one attachment atom."}</p>
          <label>Added element<input list="added-elements" value={addElement} onChange={event => { editing.setAtomDraft({ element: event.target.value }); }} /></label>
          <datalist id="added-elements">{ELEMENTS.map(element => <option key={element} value={element} />)}</datalist>
          <label>Added formal charge<input type="number" step="1" disabled={addUnknown} value={addCharge} onChange={event => { editing.setAtomDraft({ charge: event.target.value }); }} /></label>
          <label className="modeling-check"><input type="checkbox" checked={addUnknown} onChange={event => { editing.setAtomDraft({ unknown: event.target.checked }); }} />Added charge unknown</label>
          <button type="button" disabled={(!selectedAtom && entry?.atom_count !== 0) || !ELEMENTS.includes(addElement) || (!addUnknown && (!addCharge.trim() || !Number.isSafeInteger(Number(addCharge))))} onClick={() => preview({ operation: "atom.add", element: addElement, charge: addUnknown ? null : Number(addCharge), direction: 0 })}>Preview atom</button>
        </details>
        <details><summary>More elements and formal charge</summary>
          <label>Element<input list="modeling-elements" value={elementChoice} onChange={event => setElementChoice(event.target.value)} /></label>
          <datalist id="modeling-elements">{ELEMENTS.map(element => <option key={element} value={element} />)}</datalist>
          <button type="button" disabled={!selectedAtom || !ELEMENTS.includes(elementChoice) || selectedAtom.element === elementChoice} onClick={() => void execute({ operation: "atom.element", element: elementChoice })}>Assign element</button>
          <p>Formal charge: {selectedAtom ? selectedAtom.formal_charge ?? "unknown" : "select one atom"}</p>
          <label>Absolute formal charge<input type="number" step="1" value={chargeChoice} onChange={event => setChargeChoice(event.target.value)} /></label>
          <button type="button" disabled={!selectedAtom || !chargeChoice.trim() || !Number.isSafeInteger(Number(chargeChoice)) || selectedAtom.formal_charge === Number(chargeChoice)} onClick={() => void execute({ operation: "atom.charge.set", charge: Number(chargeChoice) })}>Assign charge</button>
          <button type="button" disabled={!selectedAtom || selectedAtom.formal_charge === null} onClick={() => void execute({ operation: "atom.charge.set", charge: null })}>Set charge unknown</button>
        </details>
      </fieldset> : section === "bonds" ? <fieldset disabled={Boolean(reason)}><legend>Bonds</legend>
        <label>Bond hydrogens<select aria-label="Bond hydrogens" value={editing.bondHydrogenPolicy} onChange={event => editing.setBondHydrogenPolicy(event.target.value as "preserve" | "reconcile_if_possible")}>
          <option value="reconcile_if_possible">Reconcile local H — may add, remove or move H</option><option value="preserve">Preserve H</option>
        </select></label>
        <p>{editing.bondHydrogenPolicy === "reconcile_if_possible" ? "May add, remove or move local H." : "Existing H and their coordinates stay fixed."}</p>
        <label className="modeling-check"><input type="checkbox" checked={editing.previewBondChanges} onChange={event => editing.setPreviewBondChanges(event.target.checked)} />Preview changes before applying</label>
        <p>{!pair ? "Select two distinct atom endpoints in one entry." : bond ? `Selected bond order: ${bond.aromatic ? "aromatic" : bond.order ?? "unknown"}` : "No authored bond. Displayed connectivity may be inferred; Break bond records its removal."}</p>
        <div className="edit-compact-actions">
          <button type="button" disabled={!pair || Boolean(bond)} onClick={() => bondEdit({ operation: "bond.set", order: 1 })}>Create bond</button>
          <button type="button" disabled={!pair} onClick={() => bondEdit({ operation: "bond.delete" })}>Break bond</button>
          <button type="button" aria-label="Decrease bond order" title="Decrease bond order" disabled={!bond || bond.aromatic || (bond.order ?? 0) <= 1} onClick={() => { if (bond?.order) bondEdit({ operation: "bond.set", order: (bond.order - 1) as 1 | 2 | 3 }); }}><Minus size={16} /></button>
          <button type="button" aria-label="Increase bond order" title="Increase bond order" disabled={!bond || bond.aromatic || (bond.order ?? 3) >= 3} onClick={() => { if (bond?.order) bondEdit({ operation: "bond.set", order: (bond.order + 1) as 1 | 2 | 3 }); }}><Plus size={16} /></button>
        </div>
        <label>Assign bond order<select aria-label="Assign bond order" disabled={!pair} value="" onChange={event => { if (event.target.value) bondEdit({ operation: "bond.set", order: event.target.value === "unknown" ? null : Number(event.target.value) }); }}>
          <option value="">Choose order…</option><option value="unknown">Unknown</option><option value="1">Single</option><option value="2">Double</option><option value="3">Triple</option><option value="1.5">Aromatic</option>
        </select></label>
      </fieldset> : section === "fragments" ? <fieldset disabled={Boolean(reason)}><legend>Fragments</legend>
        <p>Select a heavy atom to attach a fragment, or a terminal H to replace. Existing parent geometry and other H stay fixed.</p>
        <div className="edit-fragment-grid">{FRAGMENTS.map(fragment => <button type="button" key={fragment.name} aria-label={`${selectedAtom?.element === "H" ? "Replace H with" : "Attach"} ${fragment.label}`} title={`${selectedAtom?.element === "H" ? "Replace H with" : "Attach"} ${fragment.label}`}
          disabled={!selectedAtom} onClick={() => preview({ operation: "fragment.attach", fragment: fragment.name, direction: 0, rotation: 0 })}>
          <FragmentGlyph name={fragment.name} /><span>{fragment.label}</span></button>)}</div>
      </fieldset> : <fieldset disabled={Boolean(reason)}><legend>Mutate residue</legend>
        <p>{mutationTarget.residue ? `${mutationTarget.residue.name} · residue ${mutationTarget.residue.author_number ?? mutationTarget.residue.id}` : "Pick a complete amino-acid residue."}</p>
        <div className="edit-element-grid">{AMINO_ACIDS.map(target => <button type="button" key={target} aria-label={`Mutate residue to ${target}`} title={mutationTarget.residue?.name === target ? "Residue already has this type" : `Mutate residue to ${target}`}
          disabled={mutationTarget.residue?.name === target} onClick={() => void execute({ operation: "residue.mutate", target_name: target })}>{target}</button>)}</div>
        <p>One template placement; backbone retained. No rotamer search or automatic protein protonation. Review warnings and use existing protein preparation tools separately.</p>
      </fieldset>}
      {draft ? <fieldset disabled={busy || pending || Boolean(unavailable)}><legend>Placement preview</legend>
        <p>{placementLabel(draft.action)}. {isBondAction(draft.action) ? "Markers show proposed H moves/removals; Apply saves the bond and H together." : "Ghost atoms are proposals; Apply saves the edit."}</p>
        <div className="edit-compact-actions">
          <button type="button" onClick={() => { panel.current?.focus(); editing.setInspectingPlacement(true); }}>Inspect placement</button>
          {!isBondAction(draft.action) ? <button type="button" disabled={draft.action.operation === "hydrogens.complete" || isBondAction(draft.action)} onClick={() => preview(nextPlacement(draft.action))}>{draft.action.operation === "hydrogens.add" ? "Next orientation" : "Next direction"}</button> : null}
          {draft.action.operation === "fragment.attach" ? <button type="button" onClick={() => { if (draft.action.operation === "fragment.attach") preview({ ...draft.action, rotation: (draft.action.rotation + 1) % 6 }); }}>Rotate fragment</button> : null}
          <button type="button" disabled={!draft.result || noStandaloneHydrogens} onClick={() => void execute(draft.action)}>Apply placement</button>
          <button type="button" onClick={() => editing.setPlacement(null)}>Cancel placement</button>
        </div>
        {!draft.result && !draft.error ? <p role="status">Computing placement preview…</p> : null}
        {draft.error ? <p role="alert">{draft.error}</p> : null}
        {draft.result?.hydrogen_reconciliation_report ? <HydrogenReconciliationDetails report={draft.result.hydrogen_reconciliation_report} /> : null}
        {draft.result?.hydrogen_report ? <HydrogenReportDetails report={draft.result.hydrogen_report} /> : null}
        {draft.result?.warnings.length ? <details><summary>Placement warnings ({draft.result.warnings.length})</summary>{draft.result.warnings.map((warning, i) => <p key={i}>{warning.message}</p>)}</details> : null}
      </fieldset> : null}
      {section !== "residues" && section !== "bonds" ? <label className="modeling-check"><input type="checkbox" disabled={busy || pending} checked={editing.hydrogenPolicy === "complete_if_possible"} onChange={event => editing.setHydrogenPolicy(event.target.checked ? "complete_if_possible" : "preserve")} />Complete hydrogens when possible</label> : null}
      {section !== "residues" ? <div className="edit-hydrogens">
        <details><summary>Hydrogen tools</summary>
          <p>Additive, unoptimized building. Existing atoms and H remain fixed.</p>
          <fieldset disabled={Boolean(reason)}><legend>Complete hydrogens</legend>
            <label>Completion scope<select value={editing.hydrogenDraft.scope} onChange={event => editing.setHydrogenDraft({ scope: event.target.value as "selection" | "entry" })}><option value="selection">Selection</option><option value="entry">Whole entry</option></select></label>
            <button type="button" disabled={editing.hydrogenDraft.scope === "selection" && !selection.atoms.length} onClick={() => preview({ operation: "hydrogens.complete", scope: editing.hydrogenDraft.scope })}>Preview completion</button>
          </fieldset>
          <fieldset disabled={Boolean(reason)}><legend>Add a chosen number of H</legend>
            <p>Select one heavy parent; count and geometry apply to this operation only.</p>
            <label>Hydrogens to add<input type="number" min="1" max="4" step="1" value={editing.hydrogenDraft.count} onChange={event => editing.setHydrogenDraft({ count: event.target.value })} /></label>
            <label>Hydrogen geometry<select value={editing.hydrogenDraft.geometry} onChange={event => editing.setHydrogenDraft({ geometry: event.target.value as HydrogenGeometry })}><option value="linear">Linear</option><option value="trigonal_planar">Trigonal planar</option><option value="tetrahedral">Tetrahedral</option></select></label>
            <button type="button" disabled={!selectedAtom || selectedAtom.element === "H" || !Number.isInteger(Number(editing.hydrogenDraft.count)) || Number(editing.hydrogenDraft.count) < 1 || Number(editing.hydrogenDraft.count) > 4} onClick={() => preview({ operation: "hydrogens.add", count: Number(editing.hydrogenDraft.count), geometry: editing.hydrogenDraft.geometry, orientation: 0 })}>Preview added H</button>
          </fieldset>
        </details>
        {onSettings && entry ? <button type="button" disabled={busy || pending} onClick={() => void showHydrogens()}>Show explicit H</button> : null}
      </div> : null}
      {reason ? <p role="status">{reason}</p> : null}
      {query.isError ? <button type="button" onClick={() => void query.refetch()}>Retry molecule</button> : null}
      {error ? <p role="alert">{error}</p> : null}
      {visibleFeedback?.report ? <HydrogenReportDetails report={visibleFeedback.report} /> : null}
      {visibleFeedback?.reconciliation ? <HydrogenReconciliationDetails report={visibleFeedback.reconciliation} /> : null}
      {visibleFeedback ? <details className="edit-scientific-note"><summary>{visibleFeedback.entry}: {visibleFeedback.warnings.length} chemistry warnings</summary>{visibleFeedback.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}</details> : null}
      <details className="edit-scientific-note"><summary>Limits and chemistry</summary><p>{section === "residues" ? "Standard-residue template restrictions apply; this is not complete protein preparation." : "Direct edits preserve incomplete chemistry. Bond reconciliation may add, remove or move local H; Preserve H retains literal H. Review warnings; protonation and optimized geometry are not determined. Chemistry helpers have separate prerequisites. Source labels describe the original molecule. Isolation, local H preferences and atom hiding can still hide H."}</p></details>
      </div>
      {inspecting && draft ? <div className="edit-placement-inspection" role="group" aria-label="Placement inspection">
        <p className="sr-only" role="status">{draft.result ? `Placement ready with ${draft.result.warnings.length} warnings. Open Placement tools to review inputs and warnings.` : "Computing placement preview…"}</p>
        <button type="button" aria-label="Placement tools" title="Placement tools and warnings" onClick={() => { panel.current?.focus(); editing.setInspectingPlacement(false); }}><Pencil size={16} /></button>
        {!isBondAction(draft.action) ? <button type="button" aria-label={draft.action.operation === "hydrogens.add" ? "Next orientation" : "Next direction"} title="Next placement orientation" disabled={Boolean(reason) || draft.action.operation === "hydrogens.complete" || isBondAction(draft.action)} onClick={() => preview(nextPlacement(draft.action))}><ChevronRight size={16} /></button> : null}
        {draft.action.operation === "fragment.attach" ? <button type="button" aria-label="Rotate fragment" title="Rotate fragment" disabled={Boolean(reason)} onClick={() => { if (draft.action.operation === "fragment.attach") preview({ ...draft.action, rotation: (draft.action.rotation + 1) % 6 }); }}><RotateCw size={16} /></button> : null}
        <button type="button" aria-label="Apply placement" disabled={!draft.result || noStandaloneHydrogens || Boolean(reason)} onClick={() => void execute(draft.action)}>Apply</button>
        <button type="button" aria-label="Cancel placement" disabled={pending} onClick={() => { panel.current?.focus(); editing.setPlacement(null); }}>Cancel</button>
      </div> : null}
    </section>, document.body) : null}
  </div>;
}
