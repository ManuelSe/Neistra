import type { QuickMinimizationReport } from "../api/types";
import type { MinimizationPreviewPresentation } from "../minimization/useMinimizationPreview";
import * as Dialog from "@radix-ui/react-dialog";
import { Settings2, Zap, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MinimizationWorkflow } from "../minimization/useMinimization";

const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 3 });

export function MinimizationPanel({ workflow: w, unavailable, onOpen }: {
  workflow: MinimizationWorkflow & MinimizationPreviewPresentation; unavailable: string | null; onOpen: () => void;
}) {
  const launcher = useRef<HTMLButtonElement>(null);
  const settingsLauncher = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef(w.state.focusTarget);
  if (w.open) focusTarget.current = w.state.focusTarget;
  const returnFocus = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [help, setHelp] = useState(false);
  const draft = w.state.draft;
  const report = w.proposal?.report;
  const working = w.state.loading || w.job?.status === "queued" || w.job?.status === "running";
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
  const close = () => { if (!w.state.applying) w.dismiss(); };
  const chosenCount = w.chosen.reduce((sum, c) => sum + c.atomIds.length, 0);
  const selectedCount = draft?.selection.atoms.length ?? report?.movable_count ?? 0;
  return <div className="minimization-tools">
    <button ref={launcher} type="button" className="viewer-action-button" aria-label="Minimize selection" aria-keyshortcuts="Control+m" title={unavailable ?? "Minimize selected atoms (Ctrl+M)"}
      aria-disabled={!w.open && !!unavailable} aria-haspopup="dialog" aria-expanded={w.open}
      onClick={() => { if (w.open) close(); else if (!unavailable) { onOpen(); void w.quick(); } }}><Zap size={17} /></button>
    <button ref={settingsLauncher} type="button" className="viewer-action-button" aria-label="Minimization settings" title={unavailable ?? "Quick settings and Advanced AMBER"}
      aria-disabled={!!unavailable} aria-haspopup="dialog" onClick={() => { if (!unavailable) { onOpen(); void w.configure("quick"); } }}><Settings2 size={17} /></button>
    <Dialog.Root open={w.open} onOpenChange={open => { if (!open) close(); }} modal={false}>
      <Dialog.Portal><Dialog.Content ref={panel} className="minimization-panel" tabIndex={-1}
        aria-describedby="minimization-description" onInteractOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => { if (w.state.applying || !panel.current?.contains(document.activeElement)) event.preventDefault(); }}
        onOpenAutoFocus={event => { event.preventDefault(); returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; position(); panel.current?.focus(); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const active = document.activeElement;
          if (active?.isConnected && active !== document.body && active !== launcher.current && !panel.current?.contains(active)) return;
          const target = returnFocus.current;
          if (target?.isConnected && target !== document.body) target.focus();
          else (focusTarget.current === "settings" ? settingsLauncher.current : launcher.current)?.focus();
        }}>
        <div className="minimization-heading"><Dialog.Title>Minimize selection</Dialog.Title><button type="button" aria-label="Close minimization" disabled={w.state.applying} onClick={close}><X size={17} /></button></div>
        <Dialog.Description id="minimization-description">{w.isQuick ? "Selected atoms and attached hydrogens move by default. Unselected binding-site atoms stay fixed." : "Only captured selected atoms move. Every included unselected atom, including H, stays fixed."}</Dialog.Description>
        {draft && w.isQuick ? <QuickSetup workflow={w} working={working} /> : draft ? <>
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
          {w.capabilitiesLoading ? <p role="status">Checking local model…</p> : w.capabilities && !w.capabilities.available ? <p role="status">{w.capabilities.unavailable_reason}</p> : null}
          <button type="button" className="primary-button" disabled={working || !w.capabilities?.available || !!w.requestError} onClick={() => void w.run()}>Run minimization</button>
        </> : null}
        {w.job ? <div className="minimization-job">
          {!w.job.provenance.archive_source_job_id && w.job.parameters?.context_policy === "automatic" ? <p>Automatic context: {Array.isArray(w.job.parameters.captured_inputs) ? w.job.parameters.captured_inputs.map((c: { entry_id: string; atom_ids: number[]; conformer_id: number }) => `${w.job?.inputs?.find(i => i.entry_id === c.entry_id)?.entry_name ?? c.entry_id}: ${c.atom_ids.length} atoms, conformer ${c.conformer_id}`).join("; ") : "captured"}. {w.job.parameters.mode === "isolated" ? "No additional nearby components; isolated model." : "Complete fixed environment included."}</p> : null}
          <p role="status">{report ? report.outcome.replace("_", " ") : w.job.status === "completed" ? "Loading scientific report" : w.job.status} · {w.job.status_message}</p>
          {working && w.previewUnavailable ? <p role="status">{w.previewUnavailable}</p> : null}
          {w.liveIteration ? <p>Live accepted iteration {w.liveIteration}; temporary, not a validated final result.</p> : null}
          {working ? <><progress aria-label="Minimization progress" max={100} value={w.job.progress} /><button type="button" disabled={w.job.cancellation_requested} onClick={() => void w.cancel()}>{w.job.cancellation_requested ? "Cancellation requested" : "Cancel calculation"}</button><p>Closing this panel discards preview and requests cancellation. The report remains in Jobs.</p></> : null}
          {w.job.error ? <p role="alert">{String(w.job.error.message ?? "The calculation failed.")}</p> : null}
        </div> : null}
        {report && "method" in report ? <QuickResult report={report} workflow={w} /> : report ? <>
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
        {!draft ? <button type="button" disabled={w.state.loading || w.state.applying} onClick={() => void w.configure()}>Minimization settings</button> : null}
        <button type="button" disabled={working || w.state.applying} onClick={() => void w.configure("amber")}>Advanced AMBER</button>
        {w.state.loading && !w.job ? <button type="button" onClick={() => void w.cancel()}>Cancel calculation</button> : null}
        {w.state.loading ? <p role="status">{draft ? "Capturing complete context…" : "Submitting calculation…"}</p> : null}
        {w.error ? <p role="alert">{w.error}</p> : null}
        <button type="button" aria-expanded={help} onClick={() => setHelp(!help)}>Model and prerequisites</button>
        {help && w.isQuick ? <div className="minimization-help"><p>Ctrl+M quickly relaxes selected atoms and attached terminal H inside visible surroundings. Display-hidden atoms still contribute. A usable result is applied once as a single Undo/Redo edit; Cancel or closing the panel ends the owning session.</p><p>Temporary interpretation, protein states, hydrogens and boundary caps do not change saved chemistry. Unsupported drafts may use explicitly approximate repair. Local improvement does not certify a binding pose. Reports remain in Jobs.</p></div> : help ? <div className="minimization-help"><p>Advanced AMBER calculates a prepared environment for the exact selection. Watch temporary relaxation, then explicitly accept or discard the result. Isolation and manual environment controls are retained.</p><p>Complete existing topology, explicit H, supported standard protein states and assigned ligand charges/orders are required. No atoms, bonds or protonation are repaired.</p>
          <p>Local convergence does not certify a native conformation or binding pose. Unsupported ions, metals, cofactors, crosslinks and covalent protein–ligand adducts refuse. Only improving, validated iteration-limit results may be accepted with an explicit warning; require convergence in settings for stricter acceptance. Abnormal or cancelled calculations cannot Apply.</p>
          <p>Environment uses a nonperiodic 12 Å cutoff, 10 Å LJ switch and reaction-field dielectric 78.3. Isolated molecules use NoCutoff. Complete chosen chains remain intact.</p>
          <p>Resolve prerequisites with separate preparation actions. Native model installation: <a href="https://github.com/ManuelSe/Neistra/blob/master/tools/README.md" target="_blank" rel="noreferrer">setup guide</a>.</p></div> : null}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}


type Workflow = MinimizationWorkflow & MinimizationPreviewPresentation;
function QuickSetup({ workflow: w, working }: { workflow: Workflow; working: boolean }) {
  const draft = w.state.draft!;
  const selected = new Set(draft.selection.atoms.map(a => a.structure_id));
  return <>
    <p>Captured selection: <strong>{draft.selection.atoms.length} atoms</strong>. Usable coordinates apply as one undoable edit.</p>
    <fieldset disabled={working}><legend>Quick minimization settings</legend>
      <label>Mode<select aria-label="Minimization mode" value={draft.mode} onChange={e => void w.mode(e.target.value as typeof draft.mode)}>
        <option value="automatic">Visible surroundings</option><option value="isolated">Selected molecules only</option><option value="environment">Choose surroundings</option>
      </select></label>
      <p>{draft.mode === "automatic" ? "Visible entries supply nearby fixed context, including atoms hidden by display settings. Selected entries always participate." : draft.mode === "isolated" ? "Retain bonded context inside selected entries." : "Choose participating entries, including hidden entries. Only nearby context is modeled."}</p>
      {draft.mode === "environment" ? <div className="minimization-context">{draft.project.entries.map(entry => <label key={entry.id} className="minimization-check">
        <input type="checkbox" checked={selected.has(entry.id) || draft.included.has(entry.id)} disabled={selected.has(entry.id)} onChange={e => w.include(entry.id, e.target.checked)} />{entry.name}{!entry.visible ? " · hidden" : ""}
      </label>)}</div> : null}
      <label className="minimization-check"><input type="checkbox" checked={draft.expandHydrogens} onChange={e => w.expandHydrogens(e.target.checked)} />Move attached terminal hydrogens</label>
      <label className="minimization-check"><input type="checkbox" checked={draft.allowRepair} onChange={e => w.allowRepair(e.target.checked)} />Allow warned approximate repair</label>
      <label>Maximum iterations<input aria-label="Minimization iterations" type="number" min={1} max={2000} step={1} value={draft.iterations} onChange={e => w.iterations(Number(e.target.value))} /></label>
    </fieldset>
    <button type="button" className="primary-button" disabled={working || !!w.requestError || !w.capabilities?.available} onClick={() => void w.run()}>Run quick minimization</button>
  </>;
}
function QuickResult({ report, workflow: w }: { report: QuickMinimizationReport; workflow: Workflow }) {
  return <>
    <p role="status">{w.state.applied ? "Quick coordinates applied. Undo restores the previous coordinates." : report.reason}</p>
    <p>{report.coverage === "approximate" ? "Approximate repair" : report.method} · {report.movable_count} movable / {report.fixed_count} fixed</p>
    {report.warnings.map((text, i) => <p key={i} className="minimization-warning">{text}</p>)}
    <details><summary>Calculation details</summary>
      <dl className="minimization-metrics">
        <dt>Initial / final objective</dt><dd>{number(report.initial_energy)} / {number(report.final_energy)} {report.units.energy}</dd>
        <dt>Maximum gradient</dt><dd>{number(report.maximum_gradient)} {report.units.gradient}</dd>
        <dt>Force threshold</dt><dd>{number(report.gradient_tolerance)} {report.units.gradient}</dd>
        <dt>Iterations / evaluations</dt><dd>{report.iterations} / {report.evaluations}</dd>
        <dt>Max / RMS movement</dt><dd>{number(report.maximum_displacement)} / {number(report.rms_displacement)} Å</dd>
        <dt>Temporary helpers / caps</dt><dd>{report.helper_count} / {report.cap_count}</dd>
      </dl>
      {report.assumptions.map((text, i) => <p key={i}>{text}</p>)}
    </details>
    {!w.state.applied && w.proposal?.unavailable_reason ? <p role="status">{w.proposal.unavailable_reason}</p> : null}
    {!w.state.applied && w.canApply && !w.state.autoApply ? <button type="button" disabled={w.state.applying} onClick={() => void w.apply()}>Apply quick coordinates</button> : null}
  </>;
}
