import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Eye, EyeOff, Focus, HelpCircle, MousePointer2, RotateCcw, X } from "lucide-react";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import type { InteractionPanelProps } from "../interactions/panelModel";
import { INTERACTION_KINDS, INTERACTION_LABELS } from "../interactions/types";
import { IconButton } from "./IconButton";
import { InteractionSwatch } from "./InteractionSwatch";
import "./interactions.css";

const pageSize = 30;

export function InteractionPanel(props: InteractionPanelProps) {
  const { open, collapsed, show, choices, target, status } = props;
  const [help, setHelp] = useState(false);
  const [contactPage, setContactPage] = useState({ identity: props.resultIdentity, page: 0 });
  const [warningPage, setWarningPage] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null);
  const attachContent = useCallback((node: HTMLDivElement | null) => { content.current = node; setPanelNode(node); }, []);
  const bodyId = useId(), helpId = useId(), captureReasonId = useId();
  const pages = Math.max(1, Math.ceil(props.contacts.length / pageSize));
  const page = contactPage.identity === props.resultIdentity ? Math.min(contactPage.page, pages - 1) : 0;
  const warningsPages = Math.max(1, Math.ceil(props.warnings.length / pageSize));
  const shownWarningPage = Math.min(warningPage, warningsPages - 1);
  const inspected = props.inspected?.key === props.inspectedKey ? props.inspected : null;
  const selectedLigand = target.candidates.find(candidate => candidate.key === target.ligandKey);
  const position = useCallback(() => {
    const panel = content.current;
    if (!panel) return;
    const workspace = returnFocus.current?.closest(".structure-viewer");
    const launcher = workspace?.querySelector('[aria-label="Interactions"]') ?? workspace?.querySelector(".viewer-toolbar");
    const box = launcher?.getBoundingClientRect();
    panel.style.setProperty("--interaction-left", `${Math.max(8, Math.min(box?.left ?? 8, innerWidth - panel.offsetWidth - 8))}px`);
    panel.style.setProperty("--interaction-top", `${Math.max(8, Math.min((box?.bottom ?? 50) + 8, innerHeight - panel.offsetHeight - 8))}px`);
  }, []);
  useLayoutEffect(() => {
    if (!open || !panelNode) return;
    const observer = new ResizeObserver(position);
    observer.observe(panelNode);
    window.addEventListener("resize", position);
    position();
    return () => { observer.disconnect(); window.removeEventListener("resize", position); };
  }, [open, panelNode, position]);

  return <Dialog.Root open={open} onOpenChange={value => props.onOpenChange(value)} modal={false}>
    <Dialog.Portal><Dialog.Content ref={attachContent} className="dialog-content interaction-panel" data-collapsed={collapsed || undefined} aria-describedby={undefined}
      onInteractOutside={event => event.preventDefault()}
      onEscapeKeyDown={event => { if (event.isComposing || event.keyCode === 229 || !content.current?.contains(document.activeElement)) event.preventDefault(); }}
      onKeyDownCapture={event => {
        // A focused icon tooltip can consume the layer's first Escape. Keep the
        // panel's scoped close action without intercepting native picker keys.
        if (event.key !== "Escape" || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
          || !event.currentTarget.contains(document.activeElement)
          || !(event.target instanceof Element) || !event.target.closest(".icon-button")) return;
        event.preventDefault(); event.stopPropagation(); props.onOpenChange(false);
      }}
      onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; position(); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (props.restoreFocus !== false && returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
      <div className="interaction-header">
        <Dialog.Title>Interactions</Dialog.Title>
        <div className="interaction-header-actions">
          <IconButton label="Show interactions" tooltip={show ? "Hide interactions; retain display choices" : "Show interactions with retained choices"} aria-pressed={show} onClick={() => props.onShowChange(!show)}>
            {show ? <Eye size={17} /> : <EyeOff size={17} />}
          </IconButton>
          <IconButton label={collapsed ? "Expand interactions" : "Collapse interactions"} aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => props.onCollapsedChange(!collapsed)}>
            {collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </IconButton>
          <IconButton label="Interaction help" aria-expanded={help && !collapsed} aria-controls={helpId} onClick={() => { setHelp(collapsed || !help); if (collapsed) props.onCollapsedChange(false); }}><HelpCircle size={17} /></IconButton>
          <Dialog.Close asChild><IconButton label="Close interactions"><X size={17} /></IconButton></Dialog.Close>
        </div>
      </div>
      {collapsed && target.mode !== "all" ? <p className="interaction-collapsed-target" title={`Target: ${target.label}`} aria-label={`Target: ${target.label}`}>{target.label}</p> : null}
      <div className="interaction-feedback" data-phase={status.phase}>
        {status.partial ? <AlertTriangle size={14} aria-hidden="true" /> : null}
        <p className="interaction-status" role="status">{status.message}</p>
        {props.onRetry ? <IconButton label={props.retryLabel ?? "Retry interaction analysis"} onClick={() => props.onRetry?.()}><RotateCcw size={16} /></IconButton> : null}
      </div>
      <div id={bodyId} hidden={collapsed} className="interaction-body">
        <div className="interaction-target">
          <label>Target<select aria-label="Interaction target" value={target.mode} onChange={event => props.onTargetModeChange(event.target.value as typeof target.mode)}>
            <option value="all">All visible</option><option value="ligand">Ligand</option><option value="selection">Selection</option>
          </select></label>
          {target.mode === "ligand" ? <label className="interaction-ligand-label">Ligand instance<select aria-label="Interaction ligand instance" value={target.ligandKey} onChange={event => props.onLigandChange(event.target.value)}>
            <option value="">Choose a ligand…</option>
            {target.ligandKey && !selectedLigand ? <option value={target.ligandKey} disabled>{target.label} · unavailable</option> : null}
            {target.candidates.map(candidate => <option key={candidate.key} value={candidate.key} disabled={!candidate.eligible}>{candidate.label}{candidate.reason ? ` · ${candidate.reason}` : ""}</option>)}
          </select></label> : null}
          {target.mode === "ligand" && target.needsUpdate && selectedLigand?.eligible ? <button className="interaction-update-ligand" type="button" onClick={() => props.onLigandChange(target.ligandKey)}>Update ligand target</button> : null}
          {target.mode === "ligand" && selectedLigand?.reason && selectedLigand.reason !== target.message ? <p className="interaction-secondary">{selectedLigand.reason}</p> : null}
          {target.mode === "selection" ? <div className="interaction-selection-target">
            <p className="interaction-target-label">{target.label}</p>
            <button type="button" aria-disabled={!target.canCaptureSelection} aria-describedby={target.captureUnavailable ? captureReasonId : undefined}
              onClick={() => { if (target.canCaptureSelection) props.onCaptureSelection(); }}>{target.selectionChanged || target.needsUpdate ? "Update from selection" : "Use current selection"}</button>
            {target.captureUnavailable ? <p id={captureReasonId} className="interaction-secondary">{target.captureUnavailable}</p> : null}
            {target.selectionChanged ? <p className="interaction-secondary">Current selection differs. The captured target is retained.</p> : null}
          </div> : null}
          {target.message ? <p className="interaction-target-message">{target.message}</p> : null}
          {target.mode === "ligand" && !target.candidates.length ? <p className="interaction-secondary">No assigned ligand instances. Use an explicit selection.</p> : null}
        </div>
        <div role="group" aria-label="Interaction scope" className="interaction-scopes">
          {(["inter", "intra"] as const).map(scope => <button type="button" key={scope} aria-label={`${scope === "inter" ? "Intermolecular" : "Intramolecular"} interactions`} aria-pressed={choices[scope]}
            title={scope === "inter" ? "Between molecules" : "Within a molecule"} onClick={() => props.onToggleScope(scope)}>
            <span className="interaction-check">{choices[scope] ? <Check size={14} aria-hidden="true" /> : null}</span>{scope === "inter" ? "Inter" : "Intra"}
          </button>)}
        </div>
        <div role="group" aria-label="Interaction types" className="interaction-types">
          {INTERACTION_KINDS.map(kind => {
            const category = props.categories[kind], enabled = choices.types.includes(kind);
            const counts = `${category.detected === null ? "Detection pending" : `${category.detected} detected for this target and scopes`}; ${category.shown === null ? "current display not confirmed" : `${category.shown} shown (installed eligible records, including off-screen or occluded markers)`}`;
            const coverage = category.coverage === "partial" ? "Partial input coverage" : category.coverage === "unavailable" ? "Input coverage unavailable" : null;
            return <button type="button" key={kind} aria-label={INTERACTION_LABELS[kind]} aria-description={`${counts}${coverage ? `. ${coverage}` : ""}`} aria-pressed={enabled} title={`${counts}${coverage ? `. ${coverage}` : ""}`} onClick={() => props.onToggleType(kind)}>
              <span className="interaction-kind-heading"><span className="interaction-check">{enabled ? <Check size={14} aria-hidden="true" /> : null}</span><span>{INTERACTION_LABELS[kind]}</span>{coverage ? <AlertTriangle className="interaction-coverage-mark" size={12} aria-label={coverage} /> : null}</span>
              <span className="interaction-kind-metrics"><InteractionSwatch kind={kind} appearance={props.appearance[kind]} /><span>{enabled && category.shown !== null ? `${category.shown} shown` : category.detected !== null ? `${category.detected} detected` : "—"}</span></span>
            </button>;
          })}
        </div>
        {props.warnings.length ? <details className="interaction-disclosure interaction-warnings"><summary><AlertTriangle size={14} aria-hidden="true" />Warnings <span>{props.warnings.length}</span></summary>
          <p className="interaction-secondary">Input coverage does not establish complete interaction detection. Review the affected structures.</p>
          <ul className="interaction-warning-list">{props.warnings.slice(shownWarningPage * pageSize, (shownWarningPage + 1) * pageSize).map(warning => <li key={warning.key}>
            <strong>{warning.entryLabel}</strong><p>{warning.message}</p>
            <p className="interaction-secondary">{warning.knownAtomCount} known affected atoms{warning.occurrences > 1 ? ` · ${warning.occurrences} reports` : ""}</p>
            <button type="button" aria-label={`Select affected atoms: ${warning.entryLabel} · ${warning.code}`} aria-disabled={warning.selectUnavailable !== null} title={warning.selectUnavailable ?? "Select known affected atoms"}
              onClick={() => { if (warning.selectUnavailable === null) props.onSelectWarning(warning.key); }}><MousePointer2 size={14} aria-hidden="true" />Select affected atoms</button>
            {warning.selectUnavailable ? <p className="interaction-secondary">{warning.selectUnavailable}</p> : null}
          </li>)}</ul>
          {warningsPages > 1 ? <div className="interaction-pagination"><button type="button" aria-label="Previous warning page" disabled={shownWarningPage === 0} onClick={() => setWarningPage(shownWarningPage - 1)}>Previous</button>
            <span>{shownWarningPage * pageSize + 1}–{Math.min((shownWarningPage + 1) * pageSize, props.warnings.length)} of {props.warnings.length} groups</span>
            <button type="button" aria-label="Next warning page" disabled={shownWarningPage === warningsPages - 1} onClick={() => setWarningPage(shownWarningPage + 1)}>Next</button></div> : null}
        </details> : null}
        <details className="interaction-disclosure interaction-contacts"><summary>Contacts <span>{props.contacts.length}</span></summary>
          <p className="interaction-secondary">Inspect a contact, then Focus or Select its participants.</p>
          {props.contacts.length ? <>
            <ul className="interaction-contact-list">{props.contacts.slice(page * pageSize, (page + 1) * pageSize).map(contact => <li key={contact.key}>
              <button type="button" className="interaction-contact-row" aria-pressed={props.inspectedKey === contact.key} onClick={() => props.onInspectContact(contact.key)}>
                <span className="interaction-contact-kind"><span className="interaction-check">{props.inspectedKey === contact.key ? <Check size={13} aria-hidden="true" /> : null}</span>{INTERACTION_LABELS[contact.kind]}<span>{contact.primaryMetric}</span></span>
                <span className="interaction-contact-summary">{contact.summary}</span>
              </button>
            </li>)}</ul>
            <div className="interaction-pagination"><button type="button" aria-label="Previous contact page" disabled={page === 0} onClick={() => setContactPage({ identity: props.resultIdentity, page: page - 1 })}>Previous</button>
              <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, props.contacts.length)} of {props.contacts.length}</span>
              <button type="button" aria-label="Next contact page" disabled={page === pages - 1} onClick={() => setContactPage({ identity: props.resultIdentity, page: page + 1 })}>Next</button></div>
          </> : <p className="interaction-secondary">No current contacts to inspect.</p>}
          {inspected ? <section className="interaction-contact-details" aria-label="Contact details">
            <div className="interaction-detail-heading"><h3>Contact details</h3><IconButton label="Clear inspected contact" onClick={() => props.onInspectContact(null)}><X size={15} /></IconButton></div>
            <ul className="interaction-participants">{inspected.participants.map((participant, index) => <li key={index}>{participant}</li>)}</ul>
            <p className="interaction-secondary">{inspected.scope === "inter" ? "Intermolecular" : "Intramolecular"}</p>
            <dl className="interaction-metrics">{inspected.metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{Number.isInteger(metric.value) ? metric.value : metric.value.toFixed(metric.unit === "°" ? 1 : 3)} {metric.unit}</dd></div>)}</dl>
            <div className="interaction-detail-actions">
              <button type="button" aria-disabled={inspected.focusUnavailable !== null} title={inspected.focusUnavailable ?? "Frame this contact"} onClick={() => { if (inspected.focusUnavailable === null) props.onFocusContact(inspected.key); }}><Focus size={15} aria-hidden="true" />Focus</button>
              <button type="button" aria-disabled={inspected.selectUnavailable !== null} title={inspected.selectUnavailable ?? "Select all canonical participants"} onClick={() => { if (inspected.selectUnavailable === null) props.onSelectContact(inspected.key); }}><MousePointer2 size={15} aria-hidden="true" />Select atoms</button>
            </div>
            {inspected.focusUnavailable ? <p className="interaction-secondary">Focus: {inspected.focusUnavailable}</p> : null}
            {inspected.selectUnavailable ? <p className="interaction-secondary">Select: {inspected.selectUnavailable}</p> : null}
          </section> : null}
        </details>
        <details className="interaction-disclosure interaction-appearance"><summary>Advanced appearance</summary>
          {INTERACTION_KINDS.map(kind => <fieldset key={kind}><legend>{INTERACTION_LABELS[kind]}</legend>
            <InteractionSwatch kind={kind} appearance={props.appearance[kind]} />
            <label>Color<input type="color" aria-label={`${INTERACTION_LABELS[kind]} color`} value={props.appearance[kind].color} onChange={event => props.onAppearanceChange(kind, { color: event.target.value })} /></label>
            <label>Width<select aria-label={`${INTERACTION_LABELS[kind]} width`} value={props.appearance[kind].width} onChange={event => props.onAppearanceChange(kind, { width: Number(event.target.value) })}>
              {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map(width => <option key={width} value={width}>{width}</option>)}
            </select></label>
            <IconButton label={`Reset ${INTERACTION_LABELS[kind]} appearance`} onClick={() => props.onResetAppearance(kind)}><RotateCcw size={15} /></IconButton>
          </fieldset>)}
          <button type="button" className="interaction-reset-all" onClick={() => props.onResetAppearance()}>Reset appearance</button>
          <p className="interaction-secondary">Session appearance only. Patterns and scientific criteria remain fixed.</p>
        </details>
        <div id={helpId} hidden={!help} className="interaction-help">
          <h3>Interaction help</h3>
          <p>Geometric screening, not binding energy. Uncertain sites are skipped. Counts describe records, not detection completeness.</p>
          <p>Detected counts use the current target and Inter/Intra scopes. Shown counts confirm installed eligible records; markers can be off-screen or occluded.</p>
          <p>Ligand and Selection show contacts from that target to the rest of the visible workspace. Changing molecular selection does not change a captured target.</p>
          <p>Contacts touching a captured site retain the entire donor, ring or charge group. Contacts with both sites touched are excluded.</p>
          <details><summary>Scientific criteria</summary>
            <p>Fixed interaction-v1 geometry in the current workspace. Clashes use element radii and ≥0.4 Å overlap, excluding up to three covalent bonds. Metal coordination is unsupported.</p>
            <p>H bonds need explicit H, donor angle ≥130° and applicable acceptor angle ≥90°. π contacts require complete planar aromatic rings and directional geometry. Salt bridges use opposite charged groups within 4.5 Å.</p>
            <p>Prepare explicit hydrogens using the editing tools. Resolve alternate locations; raw PDB/mmCIF ligand chemistry may require preparation.</p>
          </details>
        </div>
      </div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
