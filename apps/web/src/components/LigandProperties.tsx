import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle, RotateCw, SlidersHorizontal, X } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { ApiError } from "../api/client";
import { ligandPropertyApi } from "../ligandProperties/api";
import type { LigandPropertySession } from "../ligandProperties/session";
import { PROPERTY_PREFERENCES_KEY } from "../ligandProperties/context";
import type { PropertyPresentation } from "../ligandProperties/useProperties";
import type { DescriptorCategory, DescriptorDefinition, DescriptorRegistry, DescriptorValue, PropertyPreferences } from "../ligandProperties/types";
import { IconButton } from "./IconButton";
import "./ligand-properties.css";

const preferencesKey = PROPERTY_PREFERENCES_KEY;
const categories: { id: DescriptorCategory; name: string }[] = [
  { id: "composition", name: "Composition" }, { id: "polarity", name: "Polarity" },
  { id: "lipophilicity", name: "Lipophilicity" }, { id: "flexibility", name: "Flexibility and rings" },
];
function readableReason(reason: string | null | undefined): string {
  return reason ? reason.replaceAll("_", " ") : "A reliable value is unavailable for this input.";
}
function valueText(value: DescriptorValue | undefined, definition: DescriptorDefinition, updating: boolean): string {
  if (!value && updating) return "Updating…";
  if (value?.status !== "ready" || value.value === null || !Number.isFinite(value.value)) return "Unavailable";
  return definition.value_type === "integer" ? String(value.value) : new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value.value);
}

export function LigandProperties({ state, session }: {
  state: PropertyPresentation; session: LigandPropertySession;
}) {
  const { entry, target, registry, preferences, enabledDefinitions, configurationError, pausedReason, tooLarge } = state;
  useSyncExternalStore(session.subscribe, session.snapshot);
  const descriptorIds = enabledDefinitions.map(definition => definition.id);
  const view = target && state.owner.matches(target) ? session.view(target) : null;
  const current = !pausedReason && !configurationError
    && (view?.status === "ready" || view?.status === "pending") && view.current?.report ? view.current : undefined;
  const values = current?.report?.values;
  const warning = current?.report?.model_status === "unavailable" || values?.some(value => value.status !== "ready");
  const configured = registry && preferences && !configurationError;
  let status: string;
  if (pausedReason) status = pausedReason.startsWith("Preview") ? "Preview — properties unavailable" : "Properties unavailable while the molecular change is reconciled.";
  else if (!entry) status = "Choose an entry to inspect its properties.";
  else if (entry.ligand_designation.status !== "resolved" || !entry.current_artifact_id) status = entry.ligand_designation.status === "stale" ? "Review the ligand choice to see its properties." : "Choose a ligand to see its properties.";
  else if (tooLarge) status = "Properties unavailable — this ligand exceeds the supported input limit.";
  else if (configurationError) status = "Property options could not be loaded.";
  else if (!configured) status = "Loading property options…";
  else if (!descriptorIds.length) status = "No property categories selected.";
  else if (view?.status === "cancelled") status = "Update cancelled";
  else if (view?.status === "failed") status = view.reason ?? "Properties could not be calculated.";
  else if (view?.status === "unavailable") status = readableReason(view.reason);
  else if (view?.status === "pending") status = "Updating properties…";
  else if (current) status = warning ? "Some properties are unavailable" : "Properties current";
  else status = "Updating properties…";
  const updating = !!configured && !!target && descriptorIds.length > 0 && !pausedReason && view?.status === "pending";
  const retryable = !pausedReason && !!target && (view?.status === "cancelled" || view?.retryable);
  return <section className="ligand-properties" aria-label="Properties">
    <div className="ligand-properties-heading"><strong>Properties</strong>
      {configured ? <PropertyOptions registry={registry} preferences={preferences} /> : null}
    </div>
    <div className="ligand-properties-status-row">
      {updating ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : warning ? <AlertTriangle size={13} aria-hidden="true" /> : null}
      <p role="status" className={warning ? "ligand-properties-status warning" : "ligand-properties-status"}>{status}</p>
      {updating ? <button type="button" className="ligand-properties-action" onClick={() => session.cancel(target)}>Cancel update</button> : null}
      {retryable ? <button type="button" className="ligand-properties-action" onClick={() => session.retry(target)}><RotateCw size={12} aria-hidden="true" />Retry</button> : null}
      {configurationError && !pausedReason ? <button type="button" className="ligand-properties-action" onClick={state.retryOptions}>Retry options</button> : null}
    </div>
    {current && values ? <div className="ligand-properties-groups">{categories.map(category => {
      const definitions = enabledDefinitions.filter(definition => definition.category === category.id);
      return definitions.length ? <div key={category.id} className="ligand-properties-group">
        <h3>{category.name}</h3><dl>{definitions.map(definition => {
          const value = values.find(item => item.descriptor_id === definition.id);
          return <div key={definition.id}><dt>{definition.name}</dt>
            <dd data-unavailable={value?.status !== "ready"}>{valueText(value, definition, updating)}
              {value?.status === "ready" && definition.unit ? <span className="ligand-properties-unit"> {definition.unit}</span> : null}</dd></div>;
        })}</dl>
      </div> : null;
    })}</div> : null}
    {configured && descriptorIds.length > 0 ? <details className="ligand-property-methods"><summary>Methods and limits</summary>
      <p>Values describe the exact designated molecule in its current representation.</p>
      {current?.report?.model_reason ? <p className="warning">{readableReason(current.report.model_reason)}</p> : null}
      <dl>{enabledDefinitions.map(definition => {
        const value = values?.find(item => item.descriptor_id === definition.id);
        return <div key={definition.id}><dt>{definition.name}{definition.unit ? ` (${definition.unit})` : ""}</dt>
          <dd>{definition.description} <span className="ligand-property-method">{definition.method}</span>
            {value && value.status !== "ready" ? <span className="ligand-property-reason">{readableReason(value.reason)}</span>
              : !value && updating ? <span>Updating…</span> : null}</dd></div>;
      })}</dl>
      <p>Method {registry.implementation_version} · Policy {registry.policy_version} · Library {registry.library_version}</p>
      {current?.report ? <><p>Latest report <time dateTime={current.report.created_at}>{new Date(current.report.created_at).toLocaleString()}</time></p>
        {current.report.provenance.length ? <ul>{current.report.provenance.map((item, index) => <li key={index}>{readableReason(item)}</li>)}</ul> : null}</> : null}
    </details> : null}
  </section>;
}

function PropertyOptions({ registry, preferences }: { registry: DescriptorRegistry; preferences: PropertyPreferences }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(preferences.enabled_categories);
  const [expectedRevision, setExpectedRevision] = useState(preferences.revision);
  const [pending, setPending] = useState<number | null>(null), [failure, setFailure] = useState<{ visit: number; message: string; conflict?: boolean; reload?: boolean } | null>(null);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const visit = useRef(0), openRef = useRef(false), trigger = useRef<HTMLButtonElement>(null), content = useRef<HTMLDivElement>(null);
  const revisionNeedsRead = useRef(false);
  const changeOpen = (next: boolean) => {
    if (openRef.current !== next) visit.current++;
    openRef.current = next; setOpen(next);
    if (next) {
      setDraft([...preferences.enabled_categories]); setExpectedRevision(preferences.revision);
      setFailure(revisionNeedsRead.current ? { visit: visit.current, conflict: true, reload: true,
        message: "Current property options could not be checked. Reload them before saving." } : null);
    }
  };
  const reloadPreferences = async (owner: number) => {
    try {
      const current = await ligandPropertyApi.preferences();
      revisionNeedsRead.current = false;
      client.setQueryData<PropertyPreferences>(preferencesKey, previous => !previous || current.revision >= previous.revision ? current : previous);
      if (visit.current === owner && openRef.current) setFailure({ visit: owner, conflict: true,
        message: "Property options changed elsewhere. Close and reopen to review the current options." });
    } catch {
      if (visit.current === owner && openRef.current) setFailure({ visit: owner, conflict: true, reload: true,
        message: "Current property options could not be checked. Reload them before saving." });
    }
  };
  const save = async () => {
    const owner = visit.current;
    if (pending === owner) return;
    setPending(owner); setSubmitted(owner); setFailure(null);
    try {
      const saved = await ligandPropertyApi.savePreferences(expectedRevision, draft);
      client.setQueryData<PropertyPreferences>(preferencesKey, previous => !previous || saved.revision >= previous.revision ? saved : previous);
      if (visit.current === owner && openRef.current) changeOpen(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSubmitted(value => value === owner ? null : value);
        revisionNeedsRead.current = true; await reloadPreferences(owner);
      }
      else if (visit.current === owner && openRef.current) setFailure({ visit: owner,
        message: "The save could not be confirmed. Your choices have been kept." });
    } finally {
      setPending(value => value === owner ? null : value);
      setSubmitted(value => value === owner ? null : value);
    }
  };
  const saving = pending === visit.current;
  const submittedHere = submitted === visit.current && saving;
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><IconButton ref={trigger} label="Property options"><SlidersHorizontal size={15} aria-hidden="true" /></IconButton></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content ref={content} className="dialog-content ligand-property-options" onOpenAutoFocus={event => {
        const first = content.current?.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (first) { event.preventDefault(); first.focus(); }
      }} onCloseAutoFocus={event => {
        if (trigger.current?.isConnected) { event.preventDefault(); trigger.current.focus(); }
      }}>
        <div className="ligand-property-options-header"><div><Dialog.Title>Property options</Dialog.Title>
          <Dialog.Description>Applies to all projects on this installation.</Dialog.Description></div>
          <Dialog.Close asChild><IconButton label="Close property options"><X size={17} aria-hidden="true" /></IconButton></Dialog.Close></div>
        <div className="ligand-property-options-body">{categories.map(category => <fieldset key={category.id}>
          <legend><label><input type="checkbox" checked={draft.includes(category.id)} disabled={saving}
            onChange={event => setDraft(value => event.target.checked ? [...value, category.id] : value.filter(id => id !== category.id))} />{category.name}</label></legend>
          <dl>{registry.definitions.filter(definition => definition.category === category.id).sort((a, b) => a.order - b.order).map(definition => <div key={definition.id}>
            <dt>{definition.name}{definition.unit ? ` (${definition.unit})` : ""}</dt><dd>{definition.description}</dd></div>)}</dl>
        </fieldset>)}</div>
        <div className="ligand-property-options-footer">
          {submittedHere ? <p role="status" className="ligand-properties-saving">Saving options… Changes may finish after closing.</p> : null}
          {failure?.visit === visit.current ? <p role="alert" className="ligand-properties-error">{failure.message}</p> : null}
          {failure?.visit === visit.current && failure.reload ? <button type="button" className="secondary-button" disabled={saving} onClick={() => {
            const owner = visit.current; setPending(owner);
            void reloadPreferences(owner).finally(() => setPending(value => value === owner ? null : value));
          }}>Reload current options</button> : null}
          <button type="button" className="secondary-button" disabled={saving} onClick={() => setDraft([...preferences.default_categories])}>Restore defaults</button>
          <div><button type="button" className="secondary-button" onClick={() => changeOpen(false)}>{submittedHere ? "Close" : "Cancel"}</button>
            <button type="button" className="primary-button" disabled={saving || (failure?.visit === visit.current && failure.conflict)} onClick={() => { void save(); }}>{saving ? "Saving…" : "Save options"}</button></div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
