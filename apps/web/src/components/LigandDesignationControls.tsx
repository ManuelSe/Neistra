import * as Dialog from "@radix-ui/react-dialog";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Hexagon, LoaderCircle, RotateCw, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../api/client";
import type { Entry, Project } from "../api/types";
import { sourceKey, designationKey, inventoryOptions, currentInventory, transientOccurrenceCounts, PAGE_SIZE,
  depictionOptions, currentDepiction, currentDesignatedCandidate, useDesignatedLigandContext, useInventoryQualification,
  type LigandInventoryOwner, type DesignatedLigandContext, type InventoryQualification } from "../ligands/presentation";
import type { LigandCandidate, LigandCandidatesRead, LigandDepictionRead } from "../ligands/types";
import { IconButton } from "./IconButton";
import "./ligand-designation.css";

interface LigandDesignationControlsProps {
  project: Project;
  entryId: string | null;
  onInspectEntry: (id: string) => void;
  pausedReason: string | null;
  busy: boolean;
  onOpenChoices?: () => void;
  inventoryOwner?: LigandInventoryOwner;
  context?: DesignatedLigandContext;
  informationHeader?: boolean;
  outsideCurrentFilters?: boolean;
  onPublication?: () => void;
  ownsContext?: () => boolean;
  onDesignate: (entry: Entry, candidateKey: string | null, inputHash?: string, ownsAttempt?: () => boolean) => Promise<void | "current" | "superseded">;
}

function locationLabel(candidate: LigandCandidate) {
  return candidate.locations.map(location => {
    const number = location.author_number === null ? `residue ${location.residue_id}`
      : `${location.author_number}${location.insertion_code ?? ""}`;
    const chain = location.chain_name ? `chain ${location.chain_name}`
      : location.chain_id === null ? "" : `chain #${location.chain_id}`;
    return `${location.residue_name} ${number}${chain ? ` · ${chain}` : ""}`;
  }).join("; ") || "Location not recorded";
}
function readableReason(reason: string | null | undefined) {
  const labels: Record<string, string> = {
    depiction_cache_capacity: "The stored depiction limit has been reached.",
    depiction_output_too_large: "This depiction exceeds the supported image size.",
    depiction_work_busy: "Other depictions are being prepared.",
    depiction_generation_failed: "A 2D depiction could not be prepared.",
    chemical_representation_not_qualified: "The available chemistry cannot support a reliable depiction.",
    candidate_boundary_not_selectable: "A complete selectable molecule boundary is unavailable.",
  };
  return reason ? labels[reason] ?? reason.replaceAll("_", " ") : "A reliable 2D depiction is unavailable.";
}

function occurrenceReadout(candidate: LigandCandidate): { text: string; detail: string } {
  const count = candidate.occurrence_count;
  if (count !== null && Number.isSafeInteger(count) && count > 0) {
    if (candidate.occurrence_basis === "qualified_representation_v1") {
      return { text: `${count} matching representation${count === 1 ? "" : "s"} in this entry`,
        detail: "Counted across this entry using the same qualified molecular representation." };
    }
    if (candidate.occurrence_basis === "verified_source_entity_v1") {
      return { text: `${count} source instance${count === 1 ? "" : "s"} in this entry`,
        detail: "Counted across this entry using the same verified source entity." };
    }
  }
  const reasons: Record<string, string> = {
    occurrence_inventory_incomplete: "The complete entry inventory is unavailable.",
    occurrence_boundary_not_qualified: "A complete molecule boundary could not be qualified for this count.",
    occurrence_representation_unsupported: "The available molecular representation cannot support this count.",
    occurrence_capacity: "This entry exceeds the supported occurrence-count bounds.",
    occurrence_work_busy: "Other molecular work prevented this occurrence count.",
    occurrence_work_limit: "The occurrence count reached its work limit. Retry counts to try again.",
    occurrence_candidate_limit: "This entry exceeds the supported candidate-count bounds.",
    occurrence_atom_limit: "This entry exceeds the supported atom-count bounds.",
    occurrence_not_applicable: "An occurrence count is not applicable to this instance.",
    occurrence_representation_incomplete: "The molecular representation is incomplete for this count.",
    occurrence_source_identity_unavailable: "A verified source identity is unavailable for this count.",
  };
  return { text: "Occurrence count unavailable", detail: reasons[candidate.occurrence_reason ?? ""]
    ?? "An entry-wide occurrence count could not be qualified for this instance." };
}

const originalRecovery = "The original file could not be verified. Reimport the structure, then choose the new entry.";
const molecularRecovery = "A molecular file could not be verified. Reimport the structure, then choose the new entry.";
const changedChoiceRecovery = "The structure changed and this ligand choice needs review. Choose an instance again or clear the choice.";
const inventoryRetry = "Ligand instances could not be loaded. Try again.";

function designationRecovery(entry: Entry): string | null {
  const designation = entry.ligand_designation;
  if (designation.status !== "stale" && designation.status !== "unresolved") return null;
  if (designation.reason_code === "original_ligand_source_unavailable") return originalRecovery;
  if (designation.status === "stale") return changedChoiceRecovery;
  if (designation.reason_code === "molecular_boundary_not_qualified") {
    return "A complete ligand instance could not be established. Review the current instances or leave this entry unassigned.";
  }
  return designation.reason_code
    ? "The molecular source could not be checked. The ligand choice remains unassigned." : null;
}

function inventoryFailure(error: unknown, entry: Entry): string {
  if (error === "source_conflict" || (error instanceof ApiError && error.status === 409 && error.code === "structure_artifact_conflict")) {
    return "The structure input changed. Reload the page, then review the ligand choice for the current structure.";
  }
  if (error === "artifact_unavailable" || (error instanceof ApiError && ["artifact_integrity_error", "artifact_not_found"].includes(error.code))) {
    return entry.ligand_designation.reason_code === "original_ligand_source_unavailable"
      ? originalRecovery : molecularRecovery;
  }
  return inventoryRetry;
}

export function LigandDesignationControls(props: LigandDesignationControlsProps) {
  const entry = props.project.entries.find(item => item.id === props.entryId);
  const names = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of props.project.entries) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
    return new Map(props.project.entries.map(item => [item.id,
      `${item.name}${counts.get(item.name)! > 1 ? ` (${item.id})` : ""}${!item.visible ? " · hidden" : ""}`]));
  }, [props.project.entries]);
  return <section className="ligand-designation-controls" aria-label="Ligand of interest">
    <div className="ligand-designation-heading"><Hexagon size={15} aria-hidden="true" /><strong>Ligand of interest</strong></div>
    <label className="ligand-entry-choice">Entry<select value={entry?.id ?? ""}
      onChange={event => { if (event.target.value) props.onInspectEntry(event.target.value); }}>
      <option value="">Choose an entry</option>
      {props.project.entries.map(item => <option key={item.id} value={item.id}>{names.get(item.id)}</option>)}
    </select></label>
    {entry && props.informationHeader && props.outsideCurrentFilters
      ? <p className="ligand-designation-notice">Outside current filters</p> : null}
    {entry ? <EntryDesignation key={sourceKey(props.project, entry)} {...props} entry={entry} />
      : <p className="ligand-designation-empty">Choose an entry to inspect its ligand choice.</p>}
  </section>;
}

function EntryDesignation(props: LigandDesignationControlsProps & { entry: Entry }) {
  return props.context ? <EntryDesignationContent {...props} designatedContext={props.context} /> : <EntryDesignationReader {...props} />;
}
function EntryDesignationReader(props: LigandDesignationControlsProps & { entry: Entry }) {
  const context = useDesignatedLigandContext({ project: props.project, entryId: props.entry.id, pausedReason: props.pausedReason,
    owner: props.inventoryOwner, depiction: !!props.informationHeader, onPublication: props.onPublication });
  return <EntryDesignationContent {...props} designatedContext={context} />;
}
function EntryDesignationContent({ project, entry, pausedReason, busy, onDesignate, onOpenChoices, ownsContext,
  designatedContext, informationHeader, onPublication }: LigandDesignationControlsProps & { entry: Entry; designatedContext: DesignatedLigandContext }) {
  const designation = entry.ligand_designation;
  const context = `${sourceKey(project, entry)}:${designationKey(entry)}`;
  // Returning to the same durable choice is a new visit, not a restoration of
  // an earlier attempt's failure or authority to close the current dialog.
  const mutationContext = useRef({ context });
  if (mutationContext.current.context !== context) mutationContext.current = { context };
  const visit = mutationContext.current;
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const chooserVisit = useRef({});
  const changeOpen = (next: boolean) => {
    if (openRef.current !== next) chooserVisit.current = {};
    openRef.current = next;
    setOpen(next);
  };
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ visit: typeof visit; message: string } | null>(null);
  const error = failure?.visit === visit ? failure.message : null;
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const source = sourceKey(project, entry);
  const current = useRef({ context, source, pausedReason, busy });
  current.current = { context, source, pausedReason, busy };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const fallbackQualification = useInventoryQualification(project, entry, designatedContext.owner);
  const matchingContext = designatedContext.key === context;
  const qualification = matchingContext ? designatedContext.qualification : fallbackQualification;
  const inventory = !matchingContext || designatedContext.error || qualification.blocked ? undefined : currentInventory(designatedContext.inventory, project, entry);
  const designated = currentDesignatedCandidate(inventory, project, entry);
  const text = designation.status === "resolved" ? designated?.label ?? "Ligand designated"
    : designation.status === "cleared" ? "Left unassigned"
      : designation.status === "stale" ? "Ligand choice needs review"
        : designation.status === "selection_required" ? "Choose a ligand"
          : designation.status === "not_applicable" ? "No eligible ligand"
            : "Ligand not assessed";
  const blocked = pausedReason ?? (busy || pending ? "Another change is being saved." : null);
  const recovery = (matchingContext && designatedContext.error) || qualification.blocked
    ? inventoryFailure((matchingContext ? designatedContext.error : undefined) ?? qualification.error, entry) : designationRecovery(entry);
  const perform = async (candidateKey: string | null, inputHash?: string) => {
    if (submitting.current || mutationContext.current !== visit || current.current.context !== context
      || current.current.pausedReason || current.current.busy || (ownsContext && !ownsContext())) return;
    const chooserOwner = chooserVisit.current;
    const ownsAttempt = () => mounted.current && chooserVisit.current === chooserOwner
      && current.current.source === source && (!ownsContext || ownsContext());
    submitting.current = true;
    setPending(true); setFailure(null);
    try {
      const outcome = await onDesignate(entry, candidateKey, inputHash, ownsAttempt);
      if (!ownsAttempt()) return;
      if (outcome === "superseded") {
        if (mutationContext.current === visit) setFailure({ visit,
          message: "The project changed while saving. Review the current ligand choice." });
      } else if (outcome === "current" || mutationContext.current === visit) changeOpen(false);
    } catch (error) {
      if (mounted.current && mutationContext.current === visit && current.current.context === context
        && ownsAttempt()) {
        setFailure({ visit, message: error instanceof Error ? error.message : "The ligand choice could not be saved. Try again." });
        throw error;
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return <>
    <div className="ligand-designation-summary"><span className="ligand-designation-current" title={designated ? locationLabel(designated) : text}>
      <strong>{text}</strong>{designation.status === "resolved" && designated ? <span>{locationLabel(designated)}</span> : null}
    </span><button ref={trigger} type="button" className="secondary-button" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { onOpenChoices?.(); setFailure(null); changeOpen(true); }}>{designation.status === "resolved" || designation.status === "stale" ? "Change" : "Choose"}</button>
      <button type="button" className="ligand-designation-clear" disabled={Boolean(blocked) || designation.status === "cleared"}
        title={blocked ?? "Leave this entry without a ligand of interest"}
        onClick={() => { trigger.current?.focus({ preventScroll: true }); void perform(null).catch(() => undefined); }}>
        {designation.status === "resolved" || designation.status === "stale" ? "Clear" : "Leave unassigned"}
      </button>
    </div>
    {informationHeader ? <DesignatedHeader entry={entry} candidate={designated} context={matchingContext ? designatedContext : undefined}
      pausedReason={pausedReason} onPublication={onPublication ?? designatedContext.onPublication}
      returnFocus={() => trigger.current?.focus({ preventScroll: true })} /> : null}
    {recovery ? <p className="ligand-candidate-warning" role={open ? undefined : "status"}>{recovery}</p> : null}
    {pausedReason ? <p className="ligand-designation-notice">Preview: ligand composition and 2D unavailable. {pausedReason}</p> : null}
    {pending ? <p className="ligand-designation-notice" role={open ? undefined : "status"}>Saving ligand choice…</p> : null}
    {error ? <p className="ligand-designation-error" role={open ? undefined : "alert"}>{error}</p> : null}
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      {open ? <CandidateDialog project={project} entry={entry} pausedReason={pausedReason}
        busy={busy || pending} pending={pending} error={error} onUse={perform} ownsContext={ownsContext} qualification={qualification}
        onPublication={onPublication ?? designatedContext.onPublication} returnFocus={() => trigger.current?.focus({ preventScroll: true })} /> : null}
    </Dialog.Root>
  </>;
}

function CandidateDialog({ project, entry, pausedReason, busy, pending, error, onUse, returnFocus, ownsContext, qualification, onPublication }: {
  project: Project; entry: Entry; pausedReason: string | null; busy: boolean; pending: boolean;
  error: string | null; onUse: (key: string, hash: string) => Promise<void>; returnFocus: () => void;
  ownsContext?: () => boolean; qualification: InventoryQualification; onPublication?: () => void;
}) {
  const groupId = useId();
  const [offset, setOffset] = useState(0);
  const [chosen, setChosen] = useState<{ key: string; label: string; hash: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const pageContext = (page: number) => JSON.stringify([sourceKey(project, entry), designationKey(entry), page, Boolean(pausedReason)]);
  const visitRef = useRef({ context: pageContext(offset) });
  if (visitRef.current.context !== pageContext(offset)) visitRef.current = { context: pageContext(offset) };
  const visit = visitRef.current;
  const retrying = useRef<{ visit: typeof visit } | null>(null);
  const [countNotice, setCountNotice] = useState<{ visit: typeof visit; text: string } | null>(null);
  const client = useQueryClient();
  const options = inventoryOptions(project, entry, offset, qualification);
  const query = useQuery({ ...options,
    // A durable choice changes the response's designation fields, not its source
    // inventory. Keep verified rows mounted while checking the new query key.
    // Retained data from a failed check must never become a placeholder.
    placeholderData: (previous, previousQuery) => !qualification.blocked && previousQuery?.state.status === "success"
      && previous?.offset === offset && currentInventory(previous, project, entry) ? previous : undefined,
  });
  // A failed recheck leaves cached data in the query. It no longer qualifies
  // composition, depictions or a commit until a current check succeeds.
  const inventory = query.isError || qualification.blocked ? undefined : currentInventory(query.data, project, entry);
  const candidates = inventory?.candidates ?? [];
  const selectable = new Set(inventory?.selectable_candidate_keys ?? []);
  const active = useRef(true);
  const current = useRef({ project, entry, pausedReason, busy, inventory });
  current.current = { project, entry, pausedReason, busy, inventory };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // Query ownership retires page/source work. A preview uses separate disabled
  // slots so old observers detach without cancelling independent consumers.
  const drawings = useQueries({ queries: Array.from({ length: PAGE_SIZE }, (_, index) => {
    const candidate = candidates[index];
    return depictionOptions(project, entry, inventory, candidate, !!pausedReason, index,
      !!candidate && selectable.has(candidate.candidate_key));
  }) });
  const pages = inventory ? Math.ceil(inventory.total / PAGE_SIZE) : 0;
  const currentChosen = chosen && inventory && chosen.hash === inventory.input_hash
    && selectable.has(chosen.key) ? chosen : null;
  const recovery = query.isError || qualification.blocked ? inventoryFailure(query.error ?? qualification.error, entry) : designationRecovery(entry);
  const use = async () => {
    const latest = current.current;
    const state = client.getQueryState<LigandCandidatesRead>(options.queryKey);
    const checked = state?.status === "success" ? currentInventory(state.data, project, entry) : undefined;
    if (!active.current || !currentChosen || qualification.blocked || query.isPlaceholderData || latest.pausedReason || latest.busy
      || latest.entry.id !== entry.id || latest.entry.current_artifact_id !== entry.current_artifact_id
      || latest.project.id !== project.id || latest.inventory?.input_hash !== currentChosen.hash
      || checked?.input_hash !== currentChosen.hash || !checked.selectable_candidate_keys.includes(currentChosen.key)) return;
    heading.current?.focus({ preventScroll: true });
    await onUse(currentChosen.key, currentChosen.hash).catch(() => undefined);
  };
  const ownsVisit = (owner: typeof visit, contextOwner: typeof ownsContext) => active.current
    && visitRef.current === owner && !current.current.pausedReason && (!contextOwner || contextOwner());
  const retryCounts = async () => {
    const latest = current.current;
    if (!ownsVisit(visit, ownsContext) || latest.busy || !transientOccurrenceCounts(latest.inventory)
      || retrying.current?.visit === visit || client.getQueryState(options.queryKey)?.fetchStatus === "fetching") return;
    const attempt = { visit };
    retrying.current = attempt;
    const requester = retryButton.current;
    const requestedFocus = document.activeElement === requester;
    setCountNotice(null);
    try {
      const result = await query.refetch({ cancelRefetch: false });
      if (!ownsVisit(visit, ownsContext)) return;
      const checked = result.isError ? undefined : currentInventory(result.data, project, entry);
      setCountNotice({ visit, text: !checked ? "Occurrence counts could not be checked."
        : transientOccurrenceCounts(checked) ? "Occurrence counts remain unavailable. Retry counts to try again."
          : checked.candidates.some(candidate => candidate.occurrence_count !== null)
            ? "Occurrence counts updated." : "Occurrence counts are unavailable. See instance details." });
      if (requestedFocus && !transientOccurrenceCounts(checked)) requestAnimationFrame(() => {
        if (!ownsVisit(visit, ownsContext) || (requester?.isConnected && !requester.disabled)) return;
        const dialog = heading.current?.closest(".ligand-candidate-dialog");
        // The modal focus trap may replace a removed button with its container.
        // Deliberate focus on another control must remain untouched.
        if (document.activeElement !== requester && document.activeElement !== document.body
          && document.activeElement !== dialog) return;
        const selected = dialog?.querySelector<HTMLInputElement>('input[type="radio"]:checked:not(:disabled)');
        (selected ?? heading.current)?.focus({ preventScroll: true });
      });
    } finally {
      if (retrying.current === attempt) retrying.current = null;
    }
  };
  const changePage = (next: number) => {
    const owner = { context: pageContext(next) };
    visitRef.current = owner;
    setOffset(next);
    requestAnimationFrame(() => {
      if (ownsVisit(owner, ownsContext)) heading.current?.focus({ preventScroll: true });
    });
  };
  return <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content ligand-candidate-dialog"
    onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}
    onCloseAutoFocus={event => {
      event.preventDefault();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected
        && !focused.hasAttribute("data-radix-focus-guard") && !focused.closest(".ligand-candidate-dialog")) return;
      returnFocus();
    }}>
    <header className="ligand-candidate-header"><div><Dialog.Title ref={heading} tabIndex={-1}>Choose ligand of interest</Dialog.Title>
      <Dialog.Description>{entry.name} · Choose one exact instance.</Dialog.Description></div>
      <Dialog.Close asChild><IconButton label="Close ligand choices"><X size={18} aria-hidden="true" /></IconButton></Dialog.Close>
    </header>
    <div className="ligand-candidate-body" aria-busy={query.isFetching}>
      {pausedReason ? <p className="ligand-candidate-warning">Preview: composition and 2D unavailable. Choices describe the committed entry. {pausedReason}</p> : null}
      {query.isPending ? <p className="ligand-candidate-loading" role="status"><LoaderCircle size={17} aria-hidden="true" /> Loading ligand instances…</p> : null}
      {query.isPlaceholderData ? <p className="ligand-candidate-loading" role="status"><LoaderCircle size={17} aria-hidden="true" /> Checking current choices…</p> : null}
      {recovery ? <div className="ligand-candidate-warning" role={query.isError || qualification.blocked ? "alert" : undefined}><p>{recovery}</p>
        {query.isError || qualification.blocked ? <button type="button" className="secondary-button" onClick={() => { void query.refetch({ cancelRefetch: false }); }}>Try again</button> : null}</div> : null}
      {!query.isError && !qualification.blocked && query.data && !inventory ? <p className="ligand-candidate-warning" role="alert">The ligand information no longer matches this entry. Close and reopen choices.</p> : null}
      {inventory && !inventory.total ? <p>No eligible ligand instances were found.</p> : null}
      {inventory?.warnings.length ? <details className="ligand-candidate-information"><summary>Input warnings ({inventory.warnings.length})</summary>
        <ul>{inventory.warnings.map((warning, i) => <li key={i}>{readableReason(warning)}</li>)}</ul></details> : null}
      <fieldset className="ligand-candidate-fieldset"><legend className="sr-only">Exact ligand instances</legend>
        <div className="ligand-candidate-grid">{candidates.map((candidate, index) => {
          const label = `${candidate.label} · ${locationLabel(candidate)} · instance ${offset + index + 1}`;
          const isCurrent = entry.ligand_designation.status === "resolved"
            && candidate.atom_ids.length === entry.ligand_designation.atom_ids.length
            && candidate.atom_ids.every((id, i) => id === entry.ligand_designation.atom_ids[i]);
          const occurrence = occurrenceReadout(candidate);
          const drawing = drawings[index];
          const response = drawing.data;
          const currentDrawing = currentDepiction(response, entry, candidate, !!pausedReason);
          const imageSource = JSON.stringify([
            sourceKey(project, entry), offset, inventory?.input_hash, Boolean(pausedReason),
            candidate.candidate_key, currentDrawing?.input_hash, currentDrawing?.artifact?.id,
            currentDrawing?.artifact?.sha256, currentDrawing?.artifact?.download_url, drawing.isError,
          ]);
          return <DepictionRecovery key={candidate.candidate_key} source={imageSource} onPublication={onPublication}>{recovery =>
            <article className="ligand-candidate-card" data-checked={currentChosen?.key === candidate.candidate_key || undefined}>
            <label className="ligand-candidate-choice"><span className="ligand-candidate-choice-title"><input type="radio" name={groupId}
              aria-label={label} checked={currentChosen?.key === candidate.candidate_key}
              disabled={!selectable.has(candidate.candidate_key) || busy || Boolean(pausedReason)}
              onChange={() => { if (inventory) setChosen({ key: candidate.candidate_key, label, hash: inventory.input_hash }); }} />
              <span><strong>{candidate.label}</strong><span>{locationLabel(candidate)}</span><small>Instance {offset + index + 1}</small></span></span>
              {isCurrent ? <span className="ligand-candidate-current">Current designation</span> : null}
              <Depiction candidate={candidate} drawing={currentDrawing} pending={drawing.isFetching}
                failed={drawing.isError} paused={Boolean(pausedReason)} recovery={recovery} />
              <span className="ligand-candidate-composition">{pausedReason ? "Composition unavailable during preview"
                : candidate.formula ?? "Formula unavailable"}</span>
              <span className="ligand-candidate-facts">{pausedReason ? "Atom counts unavailable during preview" : <>
                {candidate.molecular_weight !== null ? `MW ${candidate.molecular_weight.toFixed(2)} g/mol · ` : ""}
                {candidate.heavy_atom_count === null ? `${candidate.atom_ids.length} atom sites` : `${candidate.heavy_atom_count} heavy atoms`}
                {candidate.formal_charge !== null ? ` · charge ${candidate.formal_charge > 0 ? "+" : ""}${candidate.formal_charge}` : ""}
              </>}</span>
              <span className="ligand-candidate-facts">{pausedReason ? "Occurrence count unavailable during preview" : occurrence.text}</span>
            </label>
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {recovery.announcement ? `${recovery.announcement} ${label}.` : ""}
            </span>
            {!selectable.has(candidate.candidate_key) ? <p className="ligand-candidate-warning">Not selectable: {candidate.reason_codes.map(readableReason).join("; ") || "A complete molecule boundary is unavailable."}</p> : null}
            {(drawing.isError || currentDrawing?.status === "busy" || recovery.failed) && !pausedReason ? <button type="button" className="ligand-candidate-retry"
              disabled={drawing.isFetching} onClick={event => {
                if (recovery.failed) {
                  if (recovery.retry()) {
                    const radio = event.currentTarget.closest("article")?.querySelector<HTMLInputElement>("input[type=radio]");
                    if (radio && !radio.disabled) radio.focus({ preventScroll: true });
                    else heading.current?.focus({ preventScroll: true });
                  }
                } else void drawing.refetch();
              }}><RotateCw size={14} aria-hidden="true" /> Retry 2D</button> : null}
            <details className="ligand-candidate-information"><summary>Instance details</summary><dl>
              <dt>Boundary</dt><dd>{candidate.boundary_status === "qualified" ? "Qualified molecule" : candidate.boundary_status === "source_instance" ? "Source-assigned instance" : "Unsupported boundary"}</dd>
              <dt>Components</dt><dd>{candidate.component_ids.join(", ") || "Not recorded"}</dd>
              <dt>Source</dt><dd>{entry.original_filename ?? entry.source_format ?? "Not recorded"}</dd>
              <dt>Atoms</dt><dd>{candidate.atom_ids.slice(0, 48).join(", ")}{candidate.atom_ids.length > 48 ? ` … (${candidate.atom_ids.length} total)` : ""}</dd>
              <dt>Provenance</dt><dd>{candidate.provenance.map(readableReason).join("; ") || "Not recorded"}</dd>
              <dt>Occurrence count</dt><dd>{pausedReason ? "Unavailable during preview." : occurrence.detail}</dd>
              {!pausedReason && candidate.chemistry_status !== "qualified" ? <><dt>Chemistry</dt><dd>{readableReason(candidate.chemistry_reason)}</dd></> : null}
              {!pausedReason && currentDrawing?.reason ? <><dt>2D</dt><dd>{readableReason(currentDrawing.reason)}</dd></> : null}
              {candidate.reason_codes.length ? <><dt>Warnings</dt><dd>{candidate.reason_codes.map(readableReason).join("; ")}</dd></> : null}
            </dl></details>
          </article>}</DepictionRecovery>;
        })}</div>
      </fieldset>
    </div>
    <footer className="ligand-candidate-footer"><div className="ligand-candidate-pagination" aria-label="Ligand instance pages">
      <IconButton label="Previous ligand page" disabled={!inventory || offset === 0 || busy} onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft size={17} aria-hidden="true" /></IconButton>
      <span>{pages ? `Page ${Math.floor(offset / PAGE_SIZE) + 1} of ${pages}` : "No pages"}</span>
      <IconButton label="Next ligand page" disabled={!inventory || offset + PAGE_SIZE >= inventory.total || busy} onClick={() => changePage(offset + PAGE_SIZE)}><ChevronRight size={17} aria-hidden="true" /></IconButton>
    </div>
      {!pausedReason && transientOccurrenceCounts(inventory) ? <div className="ligand-candidate-pagination">
        <button ref={retryButton} type="button" className="ligand-candidate-retry" disabled={query.isFetching || busy}
          onClick={() => { void retryCounts(); }}><RotateCw size={14} aria-hidden="true" /> Retry counts</button>
      </div> : null}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {!pausedReason && !query.isError && !qualification.blocked && countNotice?.visit === visit ? countNotice.text : ""}
      </span>
      {currentChosen ? <p className="ligand-candidate-draft" title={currentChosen.label}>Chosen: {currentChosen.label}</p>
        : <p className="ligand-candidate-draft">{chosen ? inventory ? "Choose a current instance" : "Choice awaits an input check" : "No new choice selected"}</p>}
      {error ? <p className="ligand-designation-error" role="alert">{error}</p> : null}
      {pending ? <p role="status">Saving ligand choice…</p> : null}
      <div className="ligand-candidate-actions"><Dialog.Close asChild><button type="button" className="secondary-button">{pending ? "Close" : "Cancel"}</button></Dialog.Close>
        <button type="button" className="primary-button" disabled={!currentChosen || query.isPlaceholderData || busy || Boolean(pausedReason)} onClick={() => { void use(); }}>Use ligand</button></div>
    </footer>
  </Dialog.Content></Dialog.Portal>;
}

interface ImageRecovery {
  token: string | null;
  failed: boolean;
  announcement: string;
  onError: () => void;
  onLoad: () => void;
  retry: () => boolean;
}

function DepictionRecovery({ source, children, onPublication }: { source: string; onPublication?: () => void; children: (state: ImageRecovery) => ReactNode }) {
  const currentOwner = useRef({ source });
  if (currentOwner.current.source !== source) currentOwner.current = { source };
  const owner = currentOwner.current;
  const active = useRef(true);
  type Attempt = { owner: typeof owner; token: string | null; phase: "idle" | "failed" | "retrying" | "loaded" };
  const [state, setState] = useState<Attempt | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const attempt: Attempt = state?.owner === owner ? state : { owner, token: null, phase: "idle" };
  const onError = () => {
    if (!active.current || currentOwner.current !== owner) return;
    onPublication?.();
    setState(previous => {
      const current: Attempt = previous?.owner === owner ? previous : { owner, token: null, phase: "idle" };
      return current.token !== attempt.token || current.phase === "failed" ? previous : { ...current, phase: "failed" };
    });
  };
  const onLoad = () => {
    if (!active.current || currentOwner.current !== owner || !attempt.token) return;
    onPublication?.();
    setState(previous => {
      if (previous?.owner !== owner || previous.token !== attempt.token || previous.phase !== "retrying") return previous;
      return { ...previous, phase: "loaded" };
    });
  };
  const retry = () => {
    if (!active.current || currentOwner.current !== owner) return false;
    onPublication?.();
    setState({ owner, token: crypto.randomUUID(), phase: "retrying" });
    return true;
  };
  const announcement = attempt.phase === "failed" ? "2D could not be loaded. Retry 2D is available for"
    : attempt.phase === "retrying" ? "Retrying 2D for" : attempt.phase === "loaded" ? "2D loaded for" : "";
  return children({ token: attempt.token, failed: attempt.phase === "failed", announcement, onError, onLoad, retry });
}

function imageUrl(url: string, retryToken: string | null): string {
  if (!retryToken) return url;
  const retry = new URL(url, window.location.href);
  retry.searchParams.set("neistra_image_retry", retryToken);
  return retry.href;
}

function Depiction({ candidate, drawing, pending, failed, paused, recovery }: {
  candidate: LigandCandidate; drawing: LigandDepictionRead | undefined; pending: boolean; failed: boolean; paused: boolean;
  recovery: ImageRecovery;
}) {
  return <span className="ligand-candidate-depiction">
    {!paused && !failed && !recovery.failed && drawing?.status === "ready" && drawing.artifact ? <img
      key={`${drawing.artifact.id}:${recovery.token ?? "initial"}`} src={imageUrl(drawing.artifact.download_url, recovery.token)}
      onError={recovery.onError} onLoad={recovery.onLoad}
      alt={`2D depiction of ${candidate.label}, ${locationLabel(candidate)}`} width={240} height={180} />
      : <span>{paused ? "2D unavailable during preview" : failed || recovery.failed ? "2D could not be loaded" : pending ? "Preparing 2D…"
        : drawing?.status === "busy" ? "2D is busy" : "2D unavailable"}</span>}
  </span>;
}

function DesignatedHeader({ entry, candidate, context, pausedReason, onPublication, returnFocus }: {
  entry: Entry; candidate: LigandCandidate | undefined; context: DesignatedLigandContext | undefined;
  pausedReason: string | null; onPublication?: () => void; returnFocus: () => void;
}) {
  if (entry.ligand_designation.status !== "resolved") return null;
  const designation = entry.ligand_designation;
  const drawing = currentDepiction(context?.drawing, entry, candidate, !!pausedReason);
  const source = JSON.stringify([context?.key, context?.inventory?.input_hash, Boolean(pausedReason), candidate?.candidate_key,
    drawing?.input_hash, drawing?.artifact?.id, drawing?.artifact?.sha256, drawing?.artifact?.download_url, context?.drawingFailed]);
  return <div className="ligand-designated-information" role="group" aria-label="Designated ligand information">
    <dl className="ligand-designated-identity"><div><dt>Instance</dt><dd>{designation.instance_id ?? "Unavailable"}</dd></div>
      <div><dt>Origin</dt><dd>{designation.origin === "manual" ? "Chosen manually" : designation.origin === "automatic_single_candidate" ? "Automatic single instance" : "Not recorded"}</dd></div></dl>
    {candidate && !pausedReason ? <dl className="ligand-designated-composition">
      <div><dt>Formula</dt><dd>{candidate.formula ?? "Unavailable"}</dd></div>
      <div><dt>Formal charge</dt><dd>{candidate.formal_charge !== null && Number.isSafeInteger(candidate.formal_charge)
        ? `${candidate.formal_charge > 0 ? "+" : ""}${candidate.formal_charge}` : "Unavailable"}</dd></div>
    </dl> : <p className="ligand-designation-notice">{pausedReason ? "Composition unavailable during preview."
      : context?.pending ? "Checking designated ligand information…" : "Current ligand composition is unavailable."}</p>}
    {candidate ? <DepictionRecovery source={source} onPublication={onPublication}>{recovery => <>
      <Depiction candidate={candidate} drawing={drawing} pending={!!context?.drawingPending} failed={!!context?.drawingFailed}
        paused={!!pausedReason} recovery={recovery} />
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{recovery.announcement ? `${recovery.announcement} designated ligand.` : ""}</span>
      {!pausedReason && (recovery.failed || context?.drawingFailed || drawing?.status === "busy") ? <button type="button"
        className="ligand-candidate-retry" disabled={context?.drawingPending} onClick={() => {
          if (recovery.failed) { if (recovery.retry()) returnFocus(); } else context?.retryDrawing();
        }}><RotateCw size={14} aria-hidden="true" /> Retry 2D</button> : null}
      {!pausedReason && drawing?.reason ? <p className="ligand-designation-notice">{readableReason(drawing.reason)}</p> : null}
    </>}</DepictionRecovery> : null}
    {!pausedReason && !candidate && !context?.pending && context?.error ? <button type="button" className="ligand-candidate-retry" onClick={context.retry}>
      <RotateCw size={14} aria-hidden="true" /> Retry ligand information</button> : null}
    {!pausedReason && candidate?.chemistry_status === "unavailable" ? <p className="ligand-candidate-warning">{readableReason(candidate.chemistry_reason)}</p> : null}
  </div>;
}
