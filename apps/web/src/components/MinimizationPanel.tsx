import * as Tooltip from "@radix-ui/react-tooltip";
import { IconButton } from "./IconButton";
import type { QuickMinimizationReport } from "../api/types";
import type { MinimizationPreviewPresentation } from "../minimization/useMinimizationPreview";
import * as Dialog from "@radix-ui/react-dialog";
import { Zap, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MinimizationWorkflow } from "../minimization/useMinimization";
import { fieldOmissionLabels, quickMethodName } from "../minimization/presentation";

const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 3 });

export function MinimizationPanel({ workflow: w, unavailable, onOpen }: {
  workflow: MinimizationWorkflow & MinimizationPreviewPresentation; unavailable: string | null; onOpen: () => void;
}) {
  const launcher = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [help, setHelp] = useState(false);
  const draft = w.state.draft;
  const report = w.proposal?.report;
  const expandHydrogens = draft?.expandHydrogens ?? (report && "method" in report
    ? report.parameters.expand_hydrogens : typeof w.job?.parameters.expand_hydrogens === "boolean" ? w.job.parameters.expand_hydrogens : true);
  const working = w.state.loading || w.job?.status === "queued" || w.job?.status === "running" || w.publicationPending;
  const recovery = w.state.recovery || w.publicationPending;
  const canClose = !w.state.applying || w.publicationPending;
  const position = useCallback(() => {
    const target = panel.current, button = launcher.current;
    if (!target) return;
    const workspace = button?.closest(".structure-viewer")?.getBoundingClientRect();
    const anchor = button?.getBoundingClientRect();
    const leftBound = Math.max(8, workspace?.left ?? 8);
    const rightBound = Math.min(innerWidth - 8, workspace?.right ?? innerWidth - 8);
    const width = Math.max(120, Math.min(320, rightBound - leftBound));
    const left = Math.max(leftBound, Math.min(anchor?.left ?? leftBound, rightBound - width));
    let top = (anchor?.bottom ?? 50) + 6;
    const notice = document.querySelector(".notice")?.getBoundingClientRect();
    if (notice && left < notice.right && left + width > notice.left && top < notice.bottom + 8) top = notice.bottom + 8;
    top = Math.max(8, Math.min(top, innerHeight - 100));
    Object.assign(target.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${Math.max(80, innerHeight - top - 12)}px` });
  }, []);
  useEffect(() => {
    if (!w.open) return;
    let frame: number | null = null;
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(() => { frame = null; position(); }); };
    const resize = new ResizeObserver(schedule);
    if (panel.current) resize.observe(panel.current);
    const notice = document.querySelector(".notice"); if (notice) resize.observe(notice);
    const mutation = new MutationObserver(schedule); mutation.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule); position();
    return () => { if (frame !== null) cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); window.removeEventListener("resize", schedule); };
  }, [w.open, position]);
  const close = () => { if (canClose) w.dismiss(); };
  const chosenCount = w.chosen.reduce((sum, c) => sum + c.atomIds.length, 0);
  const selectedCount = draft?.selection.atoms.length ?? report?.movable_count ?? 0;
  const canReveal = w.state.live || w.state.loading || w.state.applying || w.publicationPending;
  const calculating = w.state.loading || w.job?.status === "queued" || w.job?.status === "running" || (w.state.autoApply && w.state.live);
  const launcherHint = w.publicationPending ? "Open minimization to check the coordinate application"
    : calculating ? "Minimization running; open to inspect or cancel"
    : !canReveal && unavailable ? unavailable : "Open minimization settings; Ctrl+M runs quick minimization";
  return <Tooltip.Provider><div className="minimization-tools">
    <IconButton ref={launcher} className="viewer-action-button viewer-modeling-action" label="Minimize selection" tooltip={launcherHint} tooltipClassName="viewer-toolbar-tooltip"
      aria-disabled={!w.open && !canReveal && !!unavailable} aria-haspopup="dialog" aria-expanded={w.open}
      onClick={() => { if (w.open) close(); else if (canReveal || !unavailable) { onOpen(); void w.show(); } }}><Zap size={16} aria-hidden="true" /></IconButton>
    <Dialog.Root open={w.open} onOpenChange={open => { if (!open) close(); }} modal={false}>
      <Dialog.Portal><Dialog.Content ref={panel} className="minimization-panel" tabIndex={-1}
        onInteractOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => { if (!canClose || !panel.current?.contains(document.activeElement)) event.preventDefault(); }}
        onOpenAutoFocus={event => { event.preventDefault(); returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; position(); panel.current?.focus(); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const active = document.activeElement;
          if (active?.isConnected && active !== document.body && active !== launcher.current && !panel.current?.contains(active)) return;
          const target = returnFocus.current;
          if (target?.isConnected && target !== document.body) target.focus();
          else launcher.current?.focus();
        }}>
        <div className="minimization-heading"><Dialog.Title>Minimize selection</Dialog.Title><button type="button" aria-label="Close minimization" disabled={!canClose} onClick={close}><X size={17} /></button></div>
        <Dialog.Description>{recovery ? "Check the recorded coordinate application. Closing this panel keeps recovery available." : w.isQuick ? !expandHydrogens ? "Only captured selected atoms move. Unselected atoms stay fixed." : "Selected atoms and attached terminal hydrogens move. Unselected binding-site atoms stay fixed." : "Only captured selected atoms move. Every included unselected atom, including H, stays fixed."}</Dialog.Description>
        {recovery ? <PublicationRecovery workflow={w} /> : draft && w.isQuick ? <QuickSetup workflow={w} working={working} /> : draft ? <>
          <p className="minimization-capture">Captured selection: <strong>{selectedCount} atoms</strong>. Later selection changes do not retarget this calculation.</p>
          <button type="button" disabled={working} onClick={() => void w.begin()}>Use current selection</button>
          <fieldset disabled={working}><legend>Calculation context</legend>
            <label>Mode<select aria-label="Minimization mode" value={draft.mode} onChange={e => void w.mode(e.target.value as "isolated" | "environment" | "automatic")}>
              <option value="automatic">Automatic environment</option><option value="isolated">Isolated molecule</option><option value="environment">Explicit environment</option>
            </select></label>
            <p>{draft.mode === "automatic" ? "The server includes complete nearby chains and molecules within 12 Å of the complete selected components, including hidden entries." : draft.mode === "isolated" ? "The complete selected molecule is included." : "Choose complete chains and molecules. Nearby means within 12 Å; chosen chains are included in full."}</p>
            <div className="minimization-context" aria-label="Calculation components">
              {w.components.filter(c => c.mandatory || draft.included.has(c.key) || (draft.mode === "environment" && (showAll || c.nearby))).map(c =>
                <label key={c.key} className="minimization-check"><input type="checkbox" checked={c.mandatory || draft.included.has(c.key)} disabled={c.mandatory || draft.mode !== "environment"}
                  onChange={e => w.include(c.key, e.target.checked)} /><span>{c.name}<small>{c.atomIds.length} atoms · {c.mandatory ? "required" : c.nearby ? "nearby" : "outside discovery radius"}{c.hidden ? " · hidden" : ""}</small></span></label>)}
            </div>
            {draft.mode === "environment" ? <><label className="minimization-check"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Show all components</label>
              <p>{w.components.filter(c => !c.mandatory && !draft.included.has(c.key)).length} candidates excluded. Display visibility does not choose physical context.</p></> : null}
            <p><strong>{selectedCount} movable / {Math.max(0, chosenCount - selectedCount)} fixed</strong> atoms, including H.</p>
            <p>Active conformers: {[...new Set(w.chosen.map(c => c.entryId))].map(id => `${draft.project.entries.find(e => e.id === id)?.name ?? id}: ${draft.sources.get(id)?.structure.active_conformer_id ?? (draft.sources.has(id) ? 1 : "loading")}`).join("; ") || "loading"}.</p>
            <label className="minimization-check"><input type="checkbox" checked={draft.strict} onChange={e => w.strict(e.target.checked)} />Require convergence before acceptance</label>
            <label>Maximum iterations<input aria-label="Minimization iterations" type="number" min={1} max={2000} step={1} value={draft.iterations} onChange={e => w.iterations(Number(e.target.value))} /></label>
          </fieldset>
          <p>Model: AMBER ff14SB / GAFF 1.81, AM1-BCC; explicit complete waters use TIP3P. Preparation is separate.</p>
          <CapabilityStatus workflow={w} />
          <button type="button" className="primary-button" disabled={working || !w.capabilitiesReady || !!w.requestError} onClick={() => void w.run()}>Run minimization</button>
        </> : null}
        {!recovery && w.job ? <div className="minimization-job">
          {w.isQuick ? <QuickTargets workflow={w} /> : null}
          {!w.job.provenance.archive_source_job_id && w.job.parameters?.context_policy === "automatic" ? <p>Automatic context: {Array.isArray(w.job.parameters.captured_inputs) ? w.job.parameters.captured_inputs.map((c: { entry_id: string; atom_ids: number[]; conformer_id: number }) => `${w.job?.inputs?.find(i => i.entry_id === c.entry_id)?.entry_name ?? c.entry_id}: ${c.atom_ids.length} atoms, conformer ${c.conformer_id}`).join("; ") : "captured"}. {w.job.parameters.mode === "isolated" ? "No additional nearby components; isolated model." : "Complete fixed environment included."}</p> : null}
          <p role="status">{report ? report.outcome.replace("_", " ") : w.job.status === "completed" ? "Loading scientific report" : w.job.status} · {w.job.status_message}</p>
          {working && w.previewUnavailable ? <p role="status">{w.previewUnavailable}</p> : null}
          {w.liveIteration ? <p>Live accepted iteration {w.liveIteration}; temporary, not a validated final result.</p> : null}
          {working ? <><progress aria-label="Minimization progress" max={100} value={w.job.progress} /><button type="button" disabled={w.job.cancellation_requested} onClick={() => void w.cancel()}>{w.job.cancellation_requested ? "Cancellation requested" : "Cancel calculation"}</button><p>Closing this panel discards preview and requests cancellation. The report remains in Jobs.</p></> : null}
          {w.job.error ? <p role="alert">{String(w.job.error.message ?? "The calculation failed.")}</p> : null}
        </div> : null}
        {!recovery && report && "method" in report ? <QuickResult report={report} workflow={w} /> : !recovery && report ? <>
          <p role="status">{report.reason}</p>
          {report.outcome === "non_converged" && w.canApply ? <p className="minimization-warning" role="status">Iteration limit reached without convergence. Accepting explicitly acknowledges the residual gradient shown below and that further relaxation may be needed.</p> : null}
          <dl className="minimization-metrics">
            <dt>Initial energy</dt><dd>{number(report.initial_energy)} kJ/mol</dd><dt>Final energy</dt><dd>{number(report.final_energy)} kJ/mol</dd>
            <dt>Maximum gradient</dt><dd>{number(report.maximum_gradient)} kJ/(mol nm)</dd><dt>Convergence threshold</dt><dd>≤ {number(report.gradient_tolerance)} kJ/(mol nm)</dd>
            <dt>Iterations / evaluations</dt><dd>{report.iterations} / {report.evaluations}</dd><dt>Max / RMS movement</dt><dd>{number(report.maximum_displacement)} / {number(report.rms_displacement)} Å</dd>
            <dt>Residual close pairs</dt><dd>{report.residual_clashes}</dd><dt>Movable / fixed</dt><dd>{report.movable_count} / {report.fixed_count}</dd>
          </dl>
          <label className="minimization-check"><input type="checkbox" checked={w.state.preview} disabled={!!w.previewUnavailable || w.state.applying} onChange={e => w.preview(e.target.checked)} />Show coordinate preview</label>
          {w.previewUnavailable ? <p>{w.previewUnavailable}</p> : null}{w.previewLoading ? <p role="status">Loading captured preview…</p> : null}
          <p>Preview moves the selected display coordinates temporarily. Measurements are paused; exports use saved coordinates until acceptance.</p>
          {w.proposal?.unavailable_reason ? <p role="status">{w.proposal.unavailable_reason}</p> : null}
          {report.warnings.map((warning, i) => <p className="minimization-warning" key={i}>{warning}</p>)}
          <div className="minimization-actions"><button type="button" className="primary-button" disabled={!w.canApply || w.state.applying} onClick={() => void w.apply()}>{w.state.applying ? "Applying…" : report.outcome === "non_converged" && w.canApply ? "Accept unconverged coordinates" : "Apply coordinates"}</button>
            <button type="button" disabled={w.state.applying} onClick={close}>Discard</button></div>
        </> : null}
        {!draft ? <button type="button" disabled={w.state.loading || w.state.applying || w.publicationPending} onClick={() => void w.configure()}>Minimization settings</button> : null}
        <button type="button" disabled={working || w.state.applying} onClick={() => void w.configure("amber")}>Advanced AMBER</button>
        {w.state.loading && !w.job ? <button type="button" onClick={() => void w.cancel()}>Cancel calculation</button> : null}
        {w.state.loading ? <p role="status">{draft ? "Capturing complete context…" : "Submitting calculation…"}</p> : null}
        {!recovery && w.error ? <p role="alert">{w.error}</p> : null}
        <button type="button" aria-expanded={help} onClick={() => setHelp(!help)}>Model and prerequisites</button>
        {help && w.isQuick ? <div className="minimization-help"><p>Ctrl+M quickly relaxes selected atoms and attached terminal H inside visible surroundings. Display-hidden atoms still contribute. A usable result is applied once as a single Undo/Redo edit. Cancel or closing the panel stops calculation. An application already sent remains available for recovery.</p><p>Temporary interpretation, protein states, hydrogens and boundary caps do not change saved chemistry. Unsupported drafts may use explicitly approximate repair. Local improvement does not certify a binding pose. Reports remain in Jobs.</p></div> : help ? <div className="minimization-help"><p>Advanced AMBER calculates a prepared environment for the exact selection. Watch temporary relaxation, then explicitly accept or discard the result. Isolation and manual environment controls are retained.</p><p>Complete existing topology, explicit H, supported standard protein states and assigned ligand charges/orders are required. No atoms, bonds or protonation are repaired.</p>
          <p>Local convergence does not certify a native conformation or binding pose. Unsupported ions, metals, cofactors, crosslinks and covalent protein–ligand adducts refuse. Only improving, validated iteration-limit results may be accepted with an explicit warning; require convergence in settings for stricter acceptance. Abnormal or cancelled calculations cannot Apply.</p>
          <p>Environment uses a nonperiodic 12 Å cutoff, 10 Å LJ switch and reaction-field dielectric 78.3. Isolated molecules use NoCutoff. Complete chosen chains remain intact.</p>
          <p>Resolve prerequisites with separate preparation actions. Native model installation: <a href="https://github.com/ManuelSe/Neistra/blob/master/tools/README.md" target="_blank" rel="noreferrer">setup guide</a>.</p></div> : null}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div></Tooltip.Provider>;
}


type Workflow = MinimizationWorkflow & MinimizationPreviewPresentation;
function CapabilityStatus({ workflow: w }: { workflow: Workflow }) {
  const [rechecked, setRechecked] = useState(false);
  const paused = w.capabilitiesPaused;
  const checking = w.capabilitiesLoading;
  const error = w.capabilitiesError;
  return <>
    {paused ? <p role="status">Availability check is paused. Reconnect to complete the check.</p>
      : checking ? <p role="status">Checking minimization availability…</p>
      : error ? <p role="alert">Couldn’t check minimization availability. {error}</p>
      : !w.capabilities?.available ? <p role="status">{w.capabilities?.unavailable_reason ?? "Minimization is unavailable."}</p> : null}
    {rechecked || (!checking && !paused && !w.capabilitiesReady) ? <button type="button" aria-disabled={checking || paused}
      onClick={() => { if (checking || paused) return; setRechecked(true); void w.recheckCapabilities(); }}>
      {error && !rechecked ? "Retry check" : "Check again"}
    </button> : null}
  </>;
}

function QuickTargets({ workflow: w }: { workflow: Workflow }) {
  const summary = w.quickSummary;
  return <section aria-label="Captured minimization targets">
    {summary.requested !== null ? <p>Requested selection: <strong>{summary.requested} {summary.requested === 1 ? "atom" : "atoms"}</strong>.</p> : null}
    {summary.movable !== null ? <p>Resolved movers: <strong>{summary.movable}</strong> · {summary.expandedHydrogens} attached H added to the selection.</p> : null}
    {summary.fixed !== null ? <p>Actual context: <strong>{summary.movable} movable / {summary.fixed} fixed</strong> · {summary.modeledEntries.length} modeled entries.</p>
      : <p>{w.proposal ? "No local context summary is available for this result." : "Local context is determined during calculation."}</p>}
    {summary.issue ? <p role="status">{summary.issue}</p> : null}
  </section>;
}

function PublicationRecovery({ workflow: w }: { workflow: Workflow }) {
  const recovery = w.publicationState;
  const busy = recovery.phase === "submitting" || recovery.phase === "reconciling";
  const recorded = recovery.receipt;
  return <section aria-label="Coordinate application recovery" aria-busy={busy}>
    {busy ? <p role="status">{recovery.phase === "submitting" ? "Applying quick coordinates…" : "Checking whether coordinates were applied…"}</p>
      : recorded ? <p role="status">{recorded.revision === w.projectRevision
        ? "Quick coordinates applied. Undo restores the previous coordinates."
        : "This coordinate application was recorded previously. The current project has been refreshed; later Undo or edits remain in effect."}</p>
      : recovery.phase === "uncertain" ? <p role="status">Couldn’t confirm whether coordinates were applied. Refresh to check the recorded result.</p>
      : <p role="status">The project has changed. Run a new calculation before applying coordinates.</p>}
    {recovery.error ? <p role="alert">{recovery.error}</p> : null}
    {w.publicationPending ? <div className="minimization-actions">
      <button type="button" disabled={busy} onClick={() => void w.refreshPublication()}>Refresh result</button>
      <button type="button" disabled={busy || !recovery.attempt} onClick={() => void w.retryPublication()}>Retry application</button>
    </div> : null}
    {recovery.phase === "uncertain" && recovery.attempt ? <p>Retry uses this captured result and creates at most one coordinate edit.</p> : null}
  </section>;
}
function QuickSetup({ workflow: w, working }: { workflow: Workflow; working: boolean }) {
  const draft = w.state.draft!;
  const selected = new Set(draft.selection.atoms.map(a => a.structure_id));
  return <>
    <p>Requested selection: <strong>{draft.selection.atoms.length} {draft.selection.atoms.length === 1 ? "atom" : "atoms"}</strong>. Selection changes do not retarget this calculation.</p>
    <button type="button" disabled={working || !!w.currentSelectionError} onClick={w.recapture}>Use current selection</button>
    {w.currentSelectionError ? <p role="status">{w.currentSelectionError}</p> : null}
    <fieldset disabled={working}><legend>Quick minimization settings</legend>
      <label>Mode<select aria-label="Minimization mode" value={draft.mode} onChange={e => void w.mode(e.target.value as typeof draft.mode)}>
        <option value="automatic">Visible surroundings</option><option value="isolated">Selected molecules only</option><option value="environment">Choose surroundings</option>
      </select></label>
      <p>{draft.mode === "automatic" ? "Visible entries supply nearby fixed context, including atoms hidden by display settings. Selected entries always participate." : draft.mode === "isolated" ? "Retain bonded context; disconnected neighbors are excluded, even inside the same entry." : "Choose participating entries, including hidden entries. Only nearby context is modeled."}</p>
      {draft.mode === "environment" ? <div className="minimization-context">{draft.project.entries.map(entry => <label key={entry.id} className="minimization-check">
        <input type="checkbox" checked={selected.has(entry.id) || draft.included.has(entry.id)} disabled={selected.has(entry.id)} onChange={e => w.include(entry.id, e.target.checked)} />{entry.name}{!entry.visible ? " · hidden" : ""}
      </label>)}</div> : null}
      <label className="minimization-check"><input type="checkbox" checked={draft.expandHydrogens} onChange={e => w.expandHydrogens(e.target.checked)} />Move attached terminal hydrogens</label>
      <details><summary>More settings</summary>
        <label className="minimization-check"><input type="checkbox" checked={draft.allowRepair} onChange={e => w.allowRepair(e.target.checked)} />Allow warned approximate repair</label>
        <label>Maximum iterations<input aria-label="Minimization iterations" type="number" min={1} max={2000} step={1} value={draft.iterations} onChange={e => w.iterations(Number(e.target.value))} /></label>
      </details>
    </fieldset>
    <p>{draft.expandHydrogens ? "Attached terminal H are resolved when the selection is captured." : "Exact selection: attached H are not added to the movable set."} Usable coordinates apply as one undoable edit.</p>
    <CapabilityStatus workflow={w} />
    <button type="button" className="primary-button" disabled={working || !!w.requestError || !w.capabilitiesReady} onClick={() => void w.run()}>Run quick minimization</button>
  </>;
}
function QuickResult({ report, workflow: w }: { report: QuickMinimizationReport; workflow: Workflow }) {
  const method = quickMethodName(report.method);
  return <>
    <p role="status">{w.state.applied ? "Quick coordinates applied. Undo restores the previous coordinates." : report.reason}</p>
    <p>{report.coverage === "approximate" ? `Approximate model · ${method}` : method}</p>
    {report.warnings.map((text, i) => <p key={i} className="minimization-warning">{text}</p>)}
    <details><summary>Calculation details</summary>
      <dl className="minimization-metrics">
        <dt>Initial / final objective</dt><dd>{number(report.initial_energy)} / {number(report.final_energy)} {report.units.energy}</dd>
        {report.energy_reference === "captured_geometry" ? <><dt>Energy reference</dt><dd>Captured geometry = 0</dd></> : null}
        {report.termination_kind === "geometry_settled" ? <><dt>Geometry settling</dt><dd>{report.geometry_step_tolerance} Å · {report.settled_geometry_steps} accepted steps</dd></> : null}
        <dt>Maximum gradient</dt><dd>{number(report.maximum_gradient)} {report.units.gradient}</dd>
        <dt>Force threshold</dt><dd>{number(report.gradient_tolerance)} {report.units.gradient}</dd>
        <dt>Iterations / evaluations</dt><dd>{report.iterations} / {report.evaluations}</dd>
        <dt>Max / RMS movement</dt><dd>{number(report.maximum_displacement)} / {number(report.rms_displacement)} Å</dd>
        <dt>Temporary helper atoms (including cap atoms)</dt><dd>{report.helper_count}</dd>
        <dt>Boundary cap groups</dt><dd>{report.cap_count}</dd>
      </dl>
      {w.quickSummary.modeledEntries.length ? <><p>Modeled entries</p><dl className="minimization-metrics minimization-context">
        {w.quickSummary.modeledEntries.map(entry => <div key={entry.entryId}>
          <dt>{w.job?.inputs.find(input => input.entry_id === entry.entryId)?.entry_name ?? entry.entryId}</dt><dd>{entry.count} canonical atoms</dd>
        </div>)}
      </dl></> : null}
      <EffectiveField workflow={w} />
      {report.assumptions.map((text, i) => <p key={i}>{text}</p>)}
    </details>
    {!w.state.applied && w.proposal?.unavailable_reason ? <p role="status">{w.proposal.unavailable_reason}</p> : null}
    {!w.state.applied && w.canApply && !w.state.autoApply ? <button type="button" disabled={w.state.applying} onClick={() => void w.apply()}>Apply quick coordinates</button> : null}
  </>;
}

function EffectiveField({ workflow: w }: { workflow: Workflow }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(25);
  if (w.effectiveField.kind === "missing") return <p>Detailed method information was not recorded for this result. The stored method and assumptions remain available.</p>;
  if (w.effectiveField.kind === "invalid") return <p role="status">Detailed method information is invalid or unsupported. The stored report remains available.</p>;
  const field = w.effectiveField.value;
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Effective model methods ({field.components.length} components)</summary>
    {open ? <>
      <p>Coverage describes the disclosed local objective, not physical completeness.</p>
      <div className="minimization-context">{field.components.slice(0, limit).map(component => <div key={component.component_id}>
        <strong>{w.job?.inputs.find(input => input.entry_id === component.entry_id)?.entry_name ?? component.entry_id} · {quickMethodName(component.method)}</strong>
        <p>{component.atom_ids.length} canonical atoms · {component.coverage === "complete" ? "Covered by the selected local model" : "Approximate local model"}</p>
        {component.omissions.map(omission => <p key={omission}>{fieldOmissionLabels[omission]}.</p>)}
        <details><summary>Canonical atom IDs</summary><p>{component.atom_ids.join(", ")}</p></details>
      </div>)}</div>
      {field.components.length > limit ? <button type="button" onClick={() => setLimit(value => value + 25)}>Show more components ({field.components.length - limit} remaining)</button> : null}
    </> : null}
  </details>;
}
