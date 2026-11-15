import * as Tooltip from "@radix-ui/react-tooltip";
import { placementContext, placementHydrogenPolicy, type PlacementAction } from "../editing/placement";
import { useQuery } from "@tanstack/react-query";
import { Pencil, X, Trash2, Plus, Minus, ChevronRight, RotateCw, Link, Unlink, Hexagon, Eye, Move3D, LoaderCircle, CircleHelp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { projectApi } from "../api/client";
import { isCompleteProjection, structureQueryOptions } from "../structures/query";
import type { ApplySelectionEdit, HydrogenReport, HydrogenReconciliationReport, MolecularWarning, Project, Selection, SelectionEditAction, ViewerSettings } from "../api/types";
import { useEditingStore } from "../store/editing";
import { isBondAction, nextPlacement, placementLabel } from "../editing/hydrogen";
import { HydrogenReconciliationDetails } from "./HydrogenReconciliationDetails";
import { HydrogenReportDetails } from "./HydrogenReportDetails";
import { IconButton } from "./IconButton";
import { FragmentGlyph } from "./FragmentGlyph";
import { FRAGMENTS } from "../editing/fragments";
import { AMINO_ACIDS, residueMutationTarget, wholeResidueSelection } from "../editing/residues";
import { ELEMENTS } from "../editing/elements";
import { useEditPanelPosition } from "../editing/useEditPanelPosition";
import { preparePreview } from "../editing/preview";
import { previewReadiness } from "../editing/feedback";
import { bondRotationTarget, qualifiedRotation } from "../editing/rotation";
import { captureSelectionTarget, type SelectionTargetCapture } from "../selection/capture";
import { useSelectionStore } from "../store/selection";
import { EditApplyError, editAttemptBlocksWrites, type EditAttemptSnapshot } from "../editing/attempt";
import { EditAttemptStatus } from "./EditAttemptStatus";

interface Props {
  onOpen?: () => boolean | void;
  project: Project;
  selection: Selection;
  busy: boolean;
  unavailable: string | null;
  onEdit: ApplySelectionEdit;
  onSettings?: (entryId: string, settings: ViewerSettings) => Promise<void>;
  attempt?: EditAttemptSnapshot;
  onCheckEdit?: () => Promise<void>;
  onReviewEdit?: () => Promise<void>;
  onContinueEdit?: () => Promise<void>;
  editReviewCurrent?: boolean;
  onGeometry?: (kind: "move" | "quick" | "advanced", capture: SelectionTargetCapture) => Promise<boolean>;
  geometryUnavailable?: string | null;
  onRecoverResidue?: (capture: SelectionTargetCapture) => void;
}

export function MolecularEditPanel({ project, selection, busy, unavailable, onEdit, onSettings, onOpen, attempt, onCheckEdit, onReviewEdit, onContinueEdit, editReviewCurrent, onGeometry, geometryUnavailable, onRecoverResidue }: Props) {
  const editing = useEditingStore();
  const { setOpen, setPending, section, setSection } = editing;
  const open = editing.projectId === project.id && editing.open;
  const journalRecovery = Boolean(attempt?.journalRecovery && !attempt.journalRecovery.acknowledged);
  const applying = attempt?.phase === "submitting" || attempt?.phase === "reconciling";
  const unresolved = attempt ? editAttemptBlocksWrites(attempt) : false;
  const pending = unresolved || (editing.projectId === project.id && editing.pending);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const { element: addElement, charge: addCharge, unknown: addUnknown } = editing.atomDraft;
  const [elementChoice, setElementChoice] = useState("P");
  const [chargeChoice, setChargeChoice] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [showPreviewDetails, setShowPreviewDetails] = useState(false);
  const [feedback, setFeedback] = useState<{ entry: string; warnings: MolecularWarning[]; report?: HydrogenReport | null; reconciliation?: HydrogenReconciliationReport | null; projectId: string; generation: number } | null>(null);
  const entryIds = useMemo(() => new Set(selection.atoms.map(ref => ref.structure_id)), [selection]);
  const entry = entryIds.size === 1 ? project.entries.find(e => entryIds.has(e.id)) : selection.atoms.length === 0 ? project.entries.find(e => e.id === editing.targetEntryId) : undefined;
  const artifact = entry?.current_artifact_id;
  const query = useQuery({
    ...structureQueryOptions(project.id, entry?.id ?? "", artifact),
    enabled: open && Boolean(entry && artifact),
  });
  const projection = isCompleteProjection(query.data, entry?.id ?? "", artifact) ? query.data : undefined;
  const atoms = projection?.structure.atoms;
  const atomIds = useMemo(() => new Set(atoms?.map(atom => atom.id)), [atoms]);
  const selectedAtom = useMemo(() => selection.atoms.length === 1 ? atoms?.find(a => a.id === selection.atoms[0].atom_id) : undefined, [atoms, selection]);
  const pair = selection.atoms.length === 2 && selection.atoms.every(ref => atomIds.has(ref.atom_id));
  const bond = pair ? projection?.structure.bonds.find(b => selection.atoms.every(ref => [b.atom_1_id, b.atom_2_id].includes(ref.atom_id))) : undefined;
  const canStepBondOrder = Boolean(bond && !bond.aromatic && [1, 2, 3].includes(bond.order ?? 0));
  const mutationTarget = useMemo(() => residueMutationTarget(projection, selection), [projection, selection]);
  const recoverableResidue = useMemo(() => projection ? wholeResidueSelection(projection, selection) : null, [projection, selection]);
  const residue = mutationTarget.residue;
  const chain = projection?.structure.chains.find(value => value.id === residue?.chain_id);
  const chainLabel = chain?.name || "unnamed";
  const ambiguousChain = residue && projection?.structure.residues.some(value => value.id !== residue.id && value.chain_id !== residue.chain_id
    && value.name === residue.name && (value.author_number ?? value.label_number ?? value.id) === (residue.author_number ?? residue.label_number ?? residue.id)
    && (value.insertion_code ?? "") === (residue.insertion_code ?? "")
    && (projection.structure.chains.find(item => item.id === value.chain_id)?.name || "unnamed") === chainLabel);
  const residueLabel = residue ? `${residue.name} ${residue.author_number ?? residue.label_number ?? residue.id}${residue.insertion_code ?? ""} · chain ${chainLabel}${ambiguousChain ? ` (id ${residue.chain_id})` : ""}` : null;
  const targetLabel = !entry ? selection.atoms.length ? `${selection.atoms.length} atoms · ${entryIds.size} entries` : "No atom selected"
    : !projection ? "Loading current target…" : selectedAtom
    ? `${selectedAtom.name || selectedAtom.element} · ${selectedAtom.element} · q ${selectedAtom.formal_charge === null ? "unknown" : selectedAtom.formal_charge > 0 ? `+${selectedAtom.formal_charge}` : selectedAtom.formal_charge}${residueLabel ? ` · ${residueLabel}` : ""}${projection.structure.atoms.some(atom => atom.id !== selectedAtom.id && atom.name === selectedAtom.name) ? ` · atom ${selectedAtom.id}` : ""}`
    : residueLabel ?? `${selection.atoms.length} atoms selected`;
  const rotationContext = JSON.stringify([project.id, entry?.id, artifact, selection.atoms]);
  const rotationDraft = editing.rotationDraft?.context === rotationContext ? editing.rotationDraft : null;
  const rotationOpen = Boolean(rotationDraft?.open);
  const rotationTarget = useMemo(() => bondRotationTarget(projection, selection), [projection, selection]);
  const directReason = !projection ? "Loading selected molecule…" : !selection.atoms.every(ref => atomIds.has(ref.atom_id)) ? "Some selected atoms are no longer present." : null;
  const reason = unavailable ?? (busy || pending ? "Finish the current operation." : !entry ? "Select atoms in one entry." : entry.locked ? "Unlock the entry before editing." : query.isError ? "The selected molecule could not be loaded." : section === "residues" ? !["protein", "complex"].includes(entry.structure_type) ? "Mutation requires a protein or complex entry." : mutationTarget.reason : directReason);
  const geometryReason = geometryUnavailable ?? unavailable ?? (busy || pending ? "Finish the current operation before opening geometry." : !selection.atoms.length ? "Select atoms before opening geometry." : null);
  const rotationReason = geometryReason ?? rotationTarget.reason;
  const { placement: ownedPlacement, setPlacement } = editing;
  const context = placementContext(project, entry?.id, selection, editing.generation, ownedPlacement?.action);
  const draft = editing.placement?.context === context ? editing.placement : null;
  const inspecting = Boolean(draft && editing.inspectingPlacement);
  const placementAttempt = draft?.submittedAttemptId && attempt?.identity?.id === draft.submittedAttemptId ? attempt : undefined;
  const showAttempt = Boolean(attempt && (unresolved || !draft || placementAttempt));
  const visibleError = placementAttempt?.error ? null : error;
  const qualified = draft?.action.operation === "bond.rotate" && qualifiedRotation(draft.result, draft.action, selection, projection?.structure.atoms.length) ? draft.result?.rotation : null;
  const axisLabel = (id: number) => {
    const atom = projection?.structure.atoms.find(value => value.id === id);
    const name = atom?.name || atom?.element || "Atom";
    return projection?.structure.atoms.some(value => value.id !== id && (value.name || value.element) === name) ? `${name} (atom ${id})` : name;
  };
  const rotationSummary = qualified ? <div className="edit-rotation-scope" aria-label="Qualified bond rotation">
    <p>{axisLabel(qualified.axis_atom_ids[0])} → {axisLabel(qualified.axis_atom_ids[1])} · {qualified.angle_degrees > 0 ? "+" : ""}{qualified.angle_degrees}° relative</p>
    <p>{qualified.rotating_atom_count} moving · {qualified.fixed_atom_count} fixed</p><p>Including all H; both axis atoms fixed.</p>
  </div> : null;
  const readiness = previewReadiness(draft?.result, draft?.error);
  const canApply = Boolean(draft?.result && placementAttempt?.phase !== "not_applied" && !(draft.action.operation === "bond.rotate" ? rotationReason : reason) && (draft.action.operation !== "bond.rotate"
    || (qualifiedRotation(draft.result, draft.action, selection, projection?.structure.atoms.length) && !draft.result.rotation?.no_op && draft.action.angle_degrees % 360 !== 0)));
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
    void preparePreview(() => projectApi.modelPreview(project, entry.id, artifact, selection, current.action, placementHydrogenPolicy(current.action), controller.signal), controller.signal)
      .then(result => {
        if (result.entry_id !== entry.id || result.expected_artifact_id !== artifact || result.expected_revision !== project.revision) throw new Error("The preview belongs to an earlier target. Select the current target and preview again.");
        if (current.action.operation === "bond.rotate" && !qualifiedRotation(result, current.action, selection, projection?.structure.atoms.length)) throw new Error("The rotation scope could not be verified. Retry the preview before applying.");
        if (!controller.signal.aborted && useEditingStore.getState().placement === current) setPlacement({ ...current, result });
      })
      .catch((failure: unknown) => { if (!controller.signal.aborted && useEditingStore.getState().placement === current) setPlacement({ ...current, error: failure instanceof Error ? failure.message : "Placement preview failed." }); });
    return () => controller.abort();
  }, [artifact, context, ownedPlacement, setPlacement, entry, open, project, selection, unavailable, query.isError, projection?.structure.atoms.length]);
  const preview = (action: PlacementAction) => {
    if ((action.operation === "bond.rotate" ? busy || unavailable || rotationTarget.reason : reason) || pending || !entry || !artifact) return;
    if (panel.current?.contains(document.activeElement)) panel.current.focus();
    setError(null); setFeedback(null); setShowPreviewDetails(false);
    editing.setPlacement({ id: crypto.randomUUID(), context: placementContext(project, entry.id, selection, editing.generation, action), action }); editing.setInspectingPlacement(true);
  };
  const close = (owned: boolean) => { setOpen(false); if (owned) launcher.current?.focus(); };
  const execute = async (action: SelectionEditAction) => {
    if ((action.operation === "bond.rotate" ? rotationReason : reason) || !entry || !artifact || useEditingStore.getState().pending) return;
    const owner = project.id;
    const generation = useEditingStore.getState().generation;
    const submittedPlacement = useEditingStore.getState().placement;
    if (panel.current?.contains(document.activeElement)) panel.current.focus();
    if (!attempt) setPending(true);
    setError(null); setFeedback(null);
    try {
      const direct = !["hydrogens.prepare", "residue.mutate", "fragment.replace", "hydrogens.add_one"].includes(action.operation);
      const result = await (direct
        ? onEdit(entry.id, artifact, selection, action, placementHydrogenPolicy(action))
        : onEdit(entry.id, artifact, selection, action));
      if (useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation
        && (submittedPlacement ? useEditingStore.getState().placement?.id === submittedPlacement.id : !useEditingStore.getState().placement)) editing.setPlacement(null);
      if (!attempt && useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation) setFeedback({ entry: entry.name, warnings: result.warnings, report: result.hydrogen_report, reconciliation: result.hydrogen_reconciliation_report, projectId: owner, generation });
    }
    catch (failure) {
      if (!(failure instanceof EditApplyError && failure.attemptId) && useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation
        && (submittedPlacement ? useEditingStore.getState().placement?.id === submittedPlacement.id : !useEditingStore.getState().placement)) {
        setError(`${entry.name}: ${failure instanceof Error ? failure.message : "Edit failed."}`);
      }
    } finally {
      if (!attempt && useEditingStore.getState().projectId === owner && useEditingStore.getState().generation === generation) setPending(false);
    }
  };
  const bondEdit = (action: PlacementAction) => {
    if (editing.previewBondChanges) preview(action);
    else void execute(action);
  };
  const visibleFeedback = showAttempt && attempt?.feedback ? { ...attempt.feedback, entry: attempt.identity?.targetLabel ?? entry?.name ?? "Molecular target" }
    : feedback?.projectId === project.id && feedback.generation === editing.generation ? feedback : null;
  const openDetails = () => { panel.current?.focus(); setShowPreviewDetails(true); editing.setInspectingPlacement(false); };
  const runGeometry = async (kind: "move" | "quick" | "advanced") => {
    if (!onGeometry || geometryReason) return;
    if (draft) { setError("Apply or cancel the current preview before opening another tool."); return; }
    try {
      const generation = editing.generation;
      const capture = captureSelectionTarget(project, selection, useSelectionStore.getState().projectEpoch);
      if (!(await onGeometry(kind, capture))) throw new Error("Finish or close the current geometry setup before opening another target.");
      if (useEditingStore.getState().projectId === project.id && useEditingStore.getState().generation === generation) setOpen(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The geometry tool could not open."); }
  };
  const recoverResidue = () => {
    if (!onRecoverResidue || !recoverableResidue || pending || busy || unavailable || entry?.locked) return;
    try { panel.current?.focus(); onRecoverResidue(captureSelectionTarget(project, selection, useSelectionStore.getState().projectEpoch)); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The residue selection could not be recovered."); }
  };
  const openRotation = () => {
    if (rotationReason) return;
    if (draft && draft.action.operation !== "bond.rotate") { setError("Apply or cancel the current preview before opening bond rotation."); return; }
    editing.setRotationDraft(rotationDraft ?? { context: rotationContext, open: true, movingEndpointId: null, angle: "30" });
    setError(null);
  };
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
  return <Tooltip.Provider><div className="molecular-edit-tools">
    <IconButton ref={launcher} className="viewer-action-button viewer-modeling-action" label="Edit molecule" tooltip={applying ? "Edit applying; closing the tool keeps the request active" : attempt?.phase === "unknown" || journalRecovery ? "Edit status unknown; open to check" : unavailable ?? "Edit selected atoms"} tooltipClassName="viewer-toolbar-tooltip"
      aria-haspopup="dialog" aria-expanded={open} aria-disabled={Boolean(unavailable) && !unresolved} aria-busy={applying}
      onClick={event => { if ((!unavailable || unresolved) && (open || onOpen?.() !== false)) { useEditingStore.getState().setFocusRequested(!open && event.detail === 0); setOpen(!open); } }}>
      {applying ? <LoaderCircle className="edit-progress-icon" size={16} aria-hidden="true" /> : attempt?.phase === "unknown" || journalRecovery ? <CircleHelp size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}</IconButton>
    {open ? createPortal(<section ref={panel} tabIndex={-1} className={`molecular-edit-panel${inspecting ? " is-inspecting" : ""}`} role="dialog" aria-modal="false" aria-label="Edit molecule"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(true); } }}>
      <div hidden={inspecting}>
      <div className="dialog-heading"><strong>Edit</strong><IconButton label="Close molecular editor" onClick={() => close(true)}><X size={16} /></IconButton></div>
      <div className="edit-target"><strong>{entry?.name ?? "Select a molecular target"}</strong><span aria-label="Current target chemistry">{targetLabel}</span></div>
      {attempt && showAttempt ? <EditAttemptStatus attempt={attempt} onCheck={onCheckEdit} onReview={onReviewEdit} onContinue={onContinueEdit} reviewCurrent={editReviewCurrent} /> : null}
      {!selection.atoms.length && project.entries.length > 0 ? <label>Target entry<select disabled={busy || pending || Boolean(unavailable)} value={entry?.id ?? ""} onChange={event => editing.setTargetEntryId(event.target.value || null)}><option value="">Choose an entry…</option>{project.entries.map(e => <option key={e.id} value={e.id}>{e.name}{e.locked ? " (locked)" : ""}</option>)}</select></label> : null}
      <div className="edit-sections" role="group" aria-label="Editing tools">{(["atoms", "bonds", "fragments", "residues"] as const).map(tool =>
        <button type="button" key={tool} aria-pressed={section === tool} onClick={() => setSection(tool)}>{tool[0].toUpperCase() + tool.slice(1)}</button>)}</div>
      {onGeometry ? <details className="edit-geometry"><summary><Move3D size={14} aria-hidden="true" /> Geometry</summary>
        <div className="edit-geometry-actions" role="group" aria-label="Geometry tools">
          <button type="button" disabled={Boolean(geometryReason)} onClick={() => void runGeometry("move")}>Move / rotate selection</button>
          <button type="button" disabled={Boolean(geometryReason)} onClick={() => void runGeometry("quick")}>Quick minimization setup</button>
          <button type="button" disabled={Boolean(geometryReason)} onClick={() => void runGeometry("advanced")}>Advanced minimization setup</button>
          <button type="button" disabled={Boolean(rotationReason)} onClick={openRotation}>Rotate bond</button>
        </div><p className="edit-prerequisite">{geometryReason ?? rotationTarget.reason ?? "Opening a tool does not change coordinates."}</p>
      </details> : null}
      {rotationOpen && rotationDraft ? <fieldset disabled={Boolean(rotationReason)}><legend>Rotate bond</legend>
        <p>{rotationTarget.endpoints.map(atom => atom.name || atom.element).join(" — ")}. Both axis atoms stay fixed.</p>
        <label>Moving side<select value={rotationDraft.movingEndpointId ?? ""} onChange={event => editing.setRotationDraft({ ...rotationDraft, movingEndpointId: event.target.value ? Number(event.target.value) : null })}>
          <option value="">Choose a side…</option>{rotationTarget.endpoints.map(atom => <option key={atom.id} value={atom.id}>{atom.name || atom.element} side · {atom.element}{rotationTarget.endpoints[0].name === rotationTarget.endpoints[1].name ? ` · atom ${atom.id}` : ""}</option>)}</select></label>
        <label>Rotation (degrees)<input type="number" step="1" value={rotationDraft.angle} onChange={event => editing.setRotationDraft({ ...rotationDraft, angle: event.target.value })} /></label>
        <button type="button" disabled={!rotationDraft.movingEndpointId || !rotationDraft.angle.trim() || !Number.isFinite(Number(rotationDraft.angle))}
          onClick={() => { if (rotationDraft.movingEndpointId) preview({ operation: "bond.rotate", moving_endpoint_id: rotationDraft.movingEndpointId, angle_degrees: Number(rotationDraft.angle) }); }}>Preview rotation</button>
        <p className="edit-scientific-note">The chosen side rotates around the fixed → moving-side axis. No geometry optimization is performed.</p>
      </fieldset> : section === "atoms" ? <fieldset disabled={Boolean(reason)}><legend>Atoms</legend>
        <div className="edit-element-grid">{(["C", "N", "O", "S", "F", "Cl", "Br", "I"] as const).map(element =>
          <button key={element} type="button" aria-label={`Replace selected atom with ${element}`} title={`Replace selected atom with ${element}`}
            disabled={!selectedAtom || selectedAtom.element === element} onClick={() => void execute({ operation: "atom.element", element })}>{element}</button>)}</div>
        <div className="edit-compact-actions">
          <IconButton label="Add hydrogen (+H)" disabled={!selectedAtom || ["H", "D", "T"].includes(selectedAtom.element)} onClick={() => void execute({ operation: "hydrogens.add_one" })}><Plus size={16} />H</IconButton>
          <IconButton label="Decrease formal charge" disabled={!selectedAtom || selectedAtom.formal_charge === null} onClick={() => { if (selectedAtom?.formal_charge !== null && selectedAtom) void execute({ operation: "atom.charge.set", charge: selectedAtom.formal_charge - 1 }); }}><Minus size={16} />q</IconButton>
          <IconButton label="Increase formal charge" disabled={!selectedAtom || selectedAtom.formal_charge === null} onClick={() => { if (selectedAtom?.formal_charge !== null && selectedAtom) void execute({ operation: "atom.charge.set", charge: selectedAtom.formal_charge + 1 }); }}><Plus size={16} />q</IconButton>
          <IconButton label="Delete selected atoms" disabled={!selection.atoms.length} onClick={() => void execute({ operation: "atom.delete" })}><Trash2 size={16} /></IconButton>
        </div>
        <details><summary>Add atom</summary>
          <p>{selectedAtom ? `Attach to atom ${selectedAtom.id}.` : entry?.atom_count === 0 ? "Place the first atom of this empty entry at the origin." : "Select one attachment atom."}</p>
          <label>Added element<input list="added-elements" value={addElement} onChange={event => { editing.setAtomDraft({ element: event.target.value }); }} /></label>
          <datalist id="added-elements">{ELEMENTS.map(element => <option key={element} value={element} />)}</datalist>
          <label>Added formal charge<input type="number" step="1" disabled={addUnknown} value={addCharge} onChange={event => { editing.setAtomDraft({ charge: event.target.value }); }} /></label>
          <label className="modeling-check"><input type="checkbox" checked={addUnknown} onChange={event => { editing.setAtomDraft({ unknown: event.target.checked }); }} />Added charge unknown</label>
          <button type="button" disabled={(!selectedAtom && entry?.atom_count !== 0) || !ELEMENTS.includes(addElement) || (!addUnknown && (!addCharge.trim() || !Number.isSafeInteger(Number(addCharge))))} onClick={() => preview({ operation: "atom.add", element: addElement, charge: addUnknown ? null : Number(addCharge), direction: 0 })}>Preview atom</button>
        </details>
        <details><summary>Advanced atom details</summary>
          <label>Element<input list="modeling-elements" value={elementChoice} onChange={event => setElementChoice(event.target.value)} /></label>
          <datalist id="modeling-elements">{ELEMENTS.map(element => <option key={element} value={element} />)}</datalist>
          <button type="button" disabled={!selectedAtom || !ELEMENTS.includes(elementChoice) || selectedAtom.element === elementChoice} onClick={() => void execute({ operation: "atom.element", element: elementChoice })}>Assign element</button>
          <p>Formal charge: {selectedAtom ? selectedAtom.formal_charge ?? "unknown" : "select one atom"}</p>
          <label>Absolute formal charge<input type="number" step="1" value={chargeChoice} onChange={event => setChargeChoice(event.target.value)} /></label>
          <button type="button" disabled={!selectedAtom || !chargeChoice.trim() || !Number.isSafeInteger(Number(chargeChoice)) || selectedAtom.formal_charge === Number(chargeChoice)} onClick={() => void execute({ operation: "atom.charge.set", charge: Number(chargeChoice) })}>Assign charge</button>
          <button type="button" disabled={!selectedAtom || selectedAtom.formal_charge === null} onClick={() => void execute({ operation: "atom.charge.set", charge: null })}>Set charge unknown</button>
        </details>
      </fieldset> : section === "bonds" ? <fieldset disabled={Boolean(reason)}><legend>Bonds</legend>
        <output className="edit-bond-order" aria-label="Current bond order">{!pair ? "Select two atoms" : bond ? `Order: ${bond.aromatic ? "aromatic" : bond.order ?? "unknown"}` : "No authored bond"}</output>
        <div className="edit-compact-actions">
          <IconButton label="Create bond" disabled={!pair || Boolean(bond)} onClick={() => bondEdit({ operation: "bond.set", order: 1 })}><Link size={16} /></IconButton>
          <IconButton label="Break bond" disabled={!pair} onClick={() => bondEdit({ operation: "bond.delete" })}><Unlink size={16} /></IconButton>
          <IconButton label="Decrease bond order" disabled={!canStepBondOrder || (bond?.order ?? 0) <= 1} onClick={() => { if (bond?.order) bondEdit({ operation: "bond.set", order: (bond.order - 1) as 1 | 2 | 3 }); }}><Minus size={16} /></IconButton>
          <IconButton label="Increase bond order" disabled={!canStepBondOrder || (bond?.order ?? 3) >= 3} onClick={() => { if (bond?.order) bondEdit({ operation: "bond.set", order: (bond.order + 1) as 1 | 2 | 3 }); }}><Plus size={16} /></IconButton>
          <IconButton label="Aromatic bond" aria-pressed={Boolean(bond?.aromatic)} disabled={!pair} onClick={() => bondEdit({ operation: "bond.set", order: bond?.aromatic ? 1 : 1.5 })}><Hexagon size={16} /></IconButton>
        </div>
        <details><summary>Advanced bond details</summary>
          <label>Assign bond order<select aria-label="Assign bond order" disabled={!pair} value="" onChange={event => { if (event.target.value) bondEdit({ operation: "bond.set", order: event.target.value === "unknown" ? null : Number(event.target.value) }); }}>
            <option value="">Choose order…</option><option value="unknown">Unknown</option><option value="1">Single</option><option value="2">Double</option><option value="3">Triple</option>
          </select></label>
          <label className="modeling-check"><input type="checkbox" checked={editing.previewBondChanges} onChange={event => editing.setPreviewBondChanges(event.target.checked)} />Preview changes before applying</label>
          <p>Displayed connectivity may be inferred. Break bond records its removal.</p>
        </details>
      </fieldset> : section === "fragments" ? <fieldset disabled={Boolean(reason)}><legend>Fragments</legend>
        <p>Select a heavy atom to attach a fragment, or a terminal H to replace.</p>
        <div className="edit-fragment-grid">{FRAGMENTS.map(fragment => <button type="button" key={fragment.name} aria-label={`${selectedAtom?.element === "H" ? "Replace H with" : "Attach"} ${fragment.label}`} title={`${selectedAtom?.element === "H" ? "Replace H with" : "Attach"} ${fragment.label}`}
          disabled={!selectedAtom} onClick={() => preview({ operation: "fragment.attach", fragment: fragment.name, direction: 0, rotation: 0 })}>
          <FragmentGlyph name={fragment.name} /><span>{fragment.label}</span></button>)}</div>
      </fieldset> : <fieldset disabled={Boolean(reason)}><legend>Mutate residue</legend>
        <p>{mutationTarget.residue ? `${mutationTarget.residue.name} · residue ${mutationTarget.residue.author_number ?? mutationTarget.residue.id}` : "Pick a complete amino-acid residue."}</p>
        <div className="edit-element-grid">{AMINO_ACIDS.map(target => <button type="button" key={target} aria-label={`Mutate residue to ${target}`} title={mutationTarget.residue?.name === target ? "Residue already has this type" : `Mutate residue to ${target}`}
          disabled={mutationTarget.residue?.name === target} onClick={() => void execute({ operation: "residue.mutate", target_name: target })}>{target}</button>)}</div>
        <p>One template placement; backbone retained. No rotamer search or automatic protein protonation. Review warnings and use existing protein preparation tools separately.</p>
      </fieldset>}
      {!rotationOpen && section === "atoms" && selectedAtom?.formal_charge === null ? <p className="edit-prerequisite">Charge is unknown. Use Advanced atom details to assign it before using charge +/−.</p>
        : !rotationOpen && section === "atoms" && !selectedAtom ? <p className="edit-prerequisite">Select one atom to change its element or charge.</p> : null}
      {!rotationOpen && section === "residues" && recoverableResidue && onRecoverResidue ? <button type="button" className="edit-residue-recovery"
        disabled={busy || pending || Boolean(unavailable) || entry?.locked} onClick={recoverResidue}>Select whole residue</button> : null}
      {draft ? <fieldset disabled={busy || pending || Boolean(unavailable)}><legend>Placement preview</legend>
        <p>{placementLabel(draft.action)}. {draft.action.operation === "bond.rotate" ? "The highlighted moving side is a coordinate proposal. Axis atoms and the fixed side remain unchanged." : isBondAction(draft.action) ? "Markers show proposed H moves/removals; Apply saves the bond and H together." : "Ghost atoms are proposals; Apply saves the edit."}</p>
        <p className="edit-preview-status" role="status">{applying ? "Applying…" : readiness.label}</p>
        {draft.result?.rotation ? <p>Rotating: {draft.result.rotation.rotating_atom_count} atoms · fixed: {draft.result.rotation.fixed_atom_count} atoms, including both axis atoms.</p> : null}
        <div className="edit-compact-actions">
          <button type="button" onClick={() => { panel.current?.focus(); editing.setInspectingPlacement(true); }}>Inspect placement</button>
          {draft.action.operation === "atom.add" || draft.action.operation === "fragment.attach" ? <button type="button" onClick={() => preview(nextPlacement(draft.action))}>Next direction</button> : null}
          {draft.action.operation === "fragment.attach" ? <button type="button" onClick={() => { if (draft.action.operation === "fragment.attach") preview({ ...draft.action, rotation: (draft.action.rotation + 1) % 6 }); }}>Rotate fragment</button> : null}
          <button type="button" disabled={!canApply} onClick={() => void execute(draft.action)}>{applying ? "Applying…" : "Apply placement"}</button>
          {!pending ? <button type="button" onClick={() => editing.setPlacement(null)}>Cancel placement</button> : null}
        </div>
        {!draft.result && !draft.error ? <p role="status">Computing placement preview…</p> : null}
        {draft.error ? <p role="alert">{draft.error}</p> : null}
        {draft.result?.hydrogen_reconciliation_report ? <HydrogenReconciliationDetails report={draft.result.hydrogen_reconciliation_report} /> : null}
        {draft.result?.hydrogen_report ? <HydrogenReportDetails report={draft.result.hydrogen_report} /> : null}
        {draft.result?.warnings.length ? <details open={showPreviewDetails} onToggle={event => setShowPreviewDetails(event.currentTarget.open)}><summary>Placement warnings ({draft.result.warnings.length})</summary>{draft.result.warnings.map((warning, i) => <p key={i}>{warning.message}</p>)}</details> : null}
      </fieldset> : null}
      {!rotationOpen && section !== "residues" && onSettings && entry ? <IconButton className="edit-hydrogen-display" label="Show explicit H" disabled={busy || pending} onClick={() => void showHydrogens()}><Eye size={16} /><span aria-hidden="true">H</span></IconButton> : null}
      {rotationOpen ? rotationReason ? <p role="status">{rotationReason}</p> : null : reason ? <p role="status">{reason}</p> : null}
      {query.isError ? <button type="button" onClick={() => void query.refetch()}>Retry molecule</button> : null}
      {visibleError ? <p role="alert">{visibleError}</p> : null}
      {visibleFeedback?.report ? <details><summary>Hydrogen addition details</summary><HydrogenReportDetails report={visibleFeedback.report} /></details> : null}
      {visibleFeedback?.reconciliation ? <details><summary>Automatic hydrogen details</summary><HydrogenReconciliationDetails report={visibleFeedback.reconciliation} /></details> : null}
      {visibleFeedback ? <details className="edit-scientific-note"><summary>{visibleFeedback.entry}: {visibleFeedback.warnings.length} chemistry warnings</summary>{visibleFeedback.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}</details> : null}
      <details className="edit-scientific-note"><summary>Limits and chemistry</summary><p>{rotationOpen ? "Bond rotation changes supported ligand coordinates only. Both axis atoms, the fixed side and disconnected atoms remain fixed. Review the qualified preview and warnings before applying." : section === "residues" ? "Standard-residue template restrictions apply; this is not complete protein preparation." : "Edits maintain supported local H automatically. Unsupported sites remain drafts with warnings. +H adds one hydrogen using bounded C/N/O/S rules. These operations do not predict protonation states or optimize geometry. Source labels describe the original molecule. Display settings can still hide H."}</p></details>
      </div>
      {inspecting && draft ? <div className="edit-placement-inspection" role="group" aria-label="Placement inspection">
        {attempt && showAttempt ? <EditAttemptStatus attempt={attempt} onCheck={onCheckEdit} onReview={onReviewEdit} onContinue={onContinueEdit} reviewCurrent={editReviewCurrent} /> : <p className="edit-preview-status" role="status">{pending ? "Applying…" : readiness.label}</p>}
        {draft.error ? <p className="edit-preview-error" role="alert">{draft.error}</p> : null}
        {visibleError ? <p className="edit-preview-error" role="alert">{visibleError}</p> : null}
        {rotationSummary}
        <IconButton label="Placement tools" onClick={openDetails}><Pencil size={16} /></IconButton>
        <button type="button" aria-label="Placement details" onClick={openDetails}>Details</button>
        {draft.action.operation === "atom.add" || draft.action.operation === "fragment.attach" ? <IconButton label="Next direction" disabled={Boolean(reason)} onClick={() => preview(nextPlacement(draft.action))}><ChevronRight size={16} /></IconButton> : null}
        {draft.action.operation === "fragment.attach" ? <IconButton label="Rotate fragment" disabled={Boolean(reason)} onClick={() => { if (draft.action.operation === "fragment.attach") preview({ ...draft.action, rotation: (draft.action.rotation + 1) % 6 }); }}><RotateCw size={16} /></IconButton> : null}
        <button type="button" aria-label="Apply placement" disabled={!canApply} onClick={() => void execute(draft.action)}>{applying || (!attempt && editing.pending) ? "Applying…" : "Apply"}</button>
        {draft.error && !pending ? <button type="button" disabled={Boolean(draft.action.operation === "bond.rotate" ? rotationReason : reason)} onClick={() => preview(draft.action)}>Retry preview</button> : null}
        {placementAttempt?.phase === "not_applied" && !pending ? <button type="button" onClick={() => preview(draft.action)}>Prepare preview again</button> : null}
        {pending ? <button type="button" aria-label="Close molecular editor" onClick={() => close(true)}>Close</button>
          : <button type="button" aria-label="Cancel placement" onClick={() => { panel.current?.focus(); editing.setPlacement(null); }}>Cancel</button>}
      </div> : null}
    </section>, document.body) : null}
  </div></Tooltip.Provider>;
}
