import * as Dialog from "@radix-ui/react-dialog";
import { Zap, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MinimizationWorkflow } from "../minimization/useMinimization";

const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 3 });

export function MinimizationPanel({ workflow: w, unavailable, onOpen }: {
  workflow: MinimizationWorkflow; unavailable: string | null; onOpen: () => void;
}) {
  const launcher = useRef<HTMLButtonElement>(null);
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
          if (target?.isConnected && target !== document.body) target.focus(); else if (launcher.current?.isConnected) launcher.current.focus();
        }}>
        <div className="minimization-heading"><Dialog.Title>Minimize selection</Dialog.Title><button type="button" aria-label="Close minimization" disabled={w.state.applying} onClick={close}><X size={17} /></button></div>
        <Dialog.Description id="minimization-description">Only captured selected atoms move. Every included unselected atom, including H, stays fixed.</Dialog.Description>
        {draft ? <>
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
            <label>Maximum iterations<input aria-label="Minimization iterations" type="number" min={1} max={2000} step={1} value={draft.iterations} onChange={e => w.iterations(Number(e.target.value))} /></label>
          </fieldset>
          <p>Model: AMBER ff14SB / GAFF 1.81, AM1-BCC; explicit complete waters use TIP3P. Preparation is separate.</p>
          {w.capabilitiesLoading ? <p role="status">Checking local model…</p> : w.capabilities && !w.capabilities.available ? <p role="status">{w.capabilities.unavailable_reason}</p> : null}
          <button type="button" className="primary-button" disabled={working || !w.capabilities?.available || !!w.requestError} onClick={() => void w.run()}>Run minimization</button>
        </> : null}
        {w.job ? <div className="minimization-job">
          {w.job.parameters?.context_policy === "automatic" ? <p>Automatic context: {Array.isArray(w.job.parameters.captured_inputs) ? w.job.parameters.captured_inputs.map((c: { entry_id: string; atom_ids: number[]; conformer_id: number }) => `${w.job?.inputs?.find(i => i.entry_id === c.entry_id)?.entry_name ?? c.entry_id}: ${c.atom_ids.length} atoms, conformer ${c.conformer_id}`).join("; ") : "captured"}. {w.job.parameters.mode === "isolated" ? "No additional nearby components; isolated model." : "Complete fixed environment included."}</p> : null}
          <p role="status">{report ? report.outcome.replace("_", " ") : w.job.status === "completed" ? "Loading scientific report" : w.job.status} · {w.job.status_message}</p>
          {working ? <><progress aria-label="Minimization progress" max={100} value={w.job.progress} /><button type="button" disabled={w.job.cancellation_requested} onClick={() => void w.cancel()}>{w.job.cancellation_requested ? "Cancellation requested" : "Cancel calculation"}</button><p>Closing this panel keeps the job in Jobs.</p></> : null}
          {w.job.error ? <p role="alert">{String(w.job.error.message ?? "The calculation failed.")}</p> : null}
        </div> : null}
        {report ? <>
          <p role="status">{report.reason}</p>
          <dl className="minimization-metrics">
            <dt>Initial energy</dt><dd>{number(report.initial_energy)} kJ/mol</dd><dt>Final energy</dt><dd>{number(report.final_energy)} kJ/mol</dd>
            <dt>Maximum gradient</dt><dd>{number(report.maximum_gradient)} kJ/(mol nm)</dd><dt>Required gradient</dt><dd>≤ {number(report.gradient_tolerance)} kJ/(mol nm)</dd>
            <dt>Iterations / evaluations</dt><dd>{report.iterations} / {report.evaluations}</dd><dt>Max / RMS movement</dt><dd>{number(report.maximum_displacement)} / {number(report.rms_displacement)} Å</dd>
            <dt>Residual close pairs</dt><dd>{report.residual_clashes}</dd><dt>Movable / fixed</dt><dd>{report.movable_count} / {report.fixed_count}</dd>
          </dl>
          <label className="minimization-check"><input type="checkbox" checked={w.state.preview} disabled={!!w.previewUnavailable || w.state.applying} onChange={e => w.preview(e.target.checked)} />Show coordinate preview</label>
          {w.previewUnavailable ? <p>{w.previewUnavailable}</p> : null}{w.previewLoading ? <p role="status">Loading captured preview…</p> : null}
          <p>Preview is temporary and cannot be picked. Measurements and exports use current coordinates until Apply.</p>
          {w.proposal?.unavailable_reason ? <p role="status">{w.proposal.unavailable_reason}</p> : null}
          {report.warnings.map((warning, i) => <p className="minimization-warning" key={i}>{warning}</p>)}
          <div className="minimization-actions"><button type="button" className="primary-button" disabled={!w.canApply || w.state.applying} onClick={() => void w.apply()}>{w.state.applying ? "Applying…" : "Apply coordinates"}</button>
            <button type="button" disabled={w.state.applying} onClick={close}>Discard</button></div>
        </> : null}
        {!draft ? <button type="button" disabled={w.state.loading || w.state.applying} onClick={() => void w.configure()}>Minimization settings</button> : null}
        {w.state.loading ? <p role="status">{draft ? "Capturing complete context…" : "Submitting calculation…"}</p> : null}
        {w.error ? <p role="alert">{w.error}</p> : null}
        <button type="button" aria-expanded={help} onClick={() => setHelp(!help)}>Model and prerequisites</button>
        {help ? <div className="minimization-help"><p>Ctrl+M starts an automatic environment calculation for the exact selection using 500 iterations. Review the result and choose Apply coordinates to commit it. Minimization settings retain explicit isolation and manual environment controls.</p><p>Complete existing topology, explicit H, supported standard protein states and assigned ligand charges/orders are required. No atoms, bonds or protonation are repaired.</p>
          <p>Local convergence does not certify a native conformation or binding pose. Unsupported ions, metals, cofactors, crosslinks and covalent protein–ligand adducts refuse. Non-converged results can be inspected but cannot Apply.</p>
          <p>Environment uses a nonperiodic 12 Å cutoff, 10 Å LJ switch and reaction-field dielectric 78.3. Isolated molecules use NoCutoff. Complete chosen chains remain intact.</p>
          <p>Resolve prerequisites with separate preparation actions. Native model installation: <a href="https://github.com/ManuelSe/Neistra/blob/master/tools/README.md" target="_blank" rel="noreferrer">setup guide</a>.</p></div> : null}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}
