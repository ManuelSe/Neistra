import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SurfaceActions, Entry, Selection, SelectionPocketSurface, StructureProjection } from "../api/types";
import { IconButton } from "./IconButton";

interface Props {
  entries: Entry[];
  selection: Selection;
  busy: boolean;
  onCreate: SurfaceActions["create"];
  load: () => Promise<Map<string, StructureProjection>>;
}

export function PocketSurfaceControls(props: Props) {
  const [panel, setPanel] = useState<"pocket" | "about" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <Menu.Root modal={false}>
      <Menu.Trigger asChild><button type="button" className="icon-button" ref={trigger} aria-label="Surface options"><MoreHorizontal size={16} /></button></Menu.Trigger>
      <Menu.Portal><Menu.Content className="dropdown-content surface-options-menu" sideOffset={4}>
        <Menu.Item className="dropdown-item" onSelect={() => setPanel("pocket")}>Pocket…</Menu.Item>
        <Menu.Item className="dropdown-item" onSelect={() => setPanel("about")}>About surfaces</Menu.Item>
      </Menu.Content></Menu.Portal>
    </Menu.Root>
    <Dialog.Root open={panel !== null} modal={false} onOpenChange={(open) => { if (!open) setPanel(null); }}>
      <Dialog.Portal><Dialog.Content className="dialog-content pocket-popover" aria-describedby={undefined}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
        <div className="dialog-heading"><Dialog.Title>{panel === "pocket" ? "Protein pocket" : "About surfaces"}</Dialog.Title>
          <Dialog.Close asChild><IconButton label="Close surface panel"><X size={18} /></IconButton></Dialog.Close>
        </div>
        {panel === "pocket" ? <PocketDraft {...props} /> : <SurfaceHelp />}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </>;
}

export function SurfaceHelp() {
  return <div className="surface-explanation">
    <p>Each new fragment captures its selected atoms independently. Cut boundaries can create artificial faces.</p>
    <p>Pocket crops the complete protein molecular surface near captured seed atoms. Radius measures
      triangle-centroid distance to seed centers. Cut edges stay open; disconnected or empty patches are possible.</p>
    <p>Protein context includes supplied protein hydrogens even when atom detail is hidden.
      Other ligands, waters, ions and cofactors are excluded. Hidden seeds still supply coordinates.
      No alignment, preparation, cavity detection, scoring or binding significance is inferred.</p>
    <p>Fragment, pocket and entry surfaces can overlap. Their controls and resets are independent.
      Multiple surfaces can belong to one entry; manage them independently in Surfaces.</p>
  </div>;
}

function PocketDraft({ entries, selection, busy, onCreate, load }: Props) {
  const [projections, setProjections] = useState<Map<string, StructureProjection> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receptorId, setReceptorId] = useState("");
  const [draft, setDraft] = useState<SelectionPocketSurface | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ receptorId: string; text: string } | null>(null);
  const lock = useRef(false);
  const loader = useRef(load); loader.current = load;
  const latestEntries = useRef(entries); latestEntries.current = entries;
  const initialSelection = useRef(selection.atoms);
  const context = JSON.stringify(entries.map((entry) => [entry.id, entry.current_artifact_id]));
  const draftFor = (entry: Entry, seeds: Selection["atoms"]): SelectionPocketSurface =>
    ({ profile: "pocket-v1", radius: 5, seed_atom_references: seeds });
  useEffect(() => {
    let current = true;
    setProjections(null); setError(null);
    void loader.current().then((loaded) => {
      if (!current) return;
      setProjections(loaded);
      const eligible = latestEntries.current.filter((entry) =>
        loaded.get(entry.id)?.hierarchy.components.some((component) => component.category === "protein"));
      if (eligible.length === 1) {
        setReceptorId((previous) => {
          if (previous) return previous;
          setDraft(draftFor(eligible[0], initialSelection.current));
          return eligible[0].id;
        });
      }
    }).catch((failure: unknown) => {
      if (current) setError(failure instanceof Error ? failure.message : "Protein context could not be loaded.");
    });
    return () => { current = false; };
  }, [context]);
  const eligible = entries.filter((entry) =>
    projections?.get(entry.id)?.hierarchy.components.some((component) => component.category === "protein"));
  const receptor = entries.find((entry) => entry.id === receptorId);
  const hasProtein = projections?.get(receptorId)?.hierarchy.components.some((component) => component.category === "protein");
  const validIds = new Map(entries.map((entry) => [entry.id, new Set(entry.atom_ids)]));
  const validSeeds = Boolean(draft?.seed_atom_references.length)
    && draft!.seed_atom_references.every((seed) => validIds.get(seed.structure_id)?.has(seed.atom_id));
  const validRadius = draft !== null && Number.isFinite(draft.radius) && draft.radius >= 2 && draft.radius <= 12 && Number.isInteger(draft.radius * 2);
  const unavailable = error ?? (!projections ? "Loading protein context…" : !eligible.length
    ? "No entry contains protein context." : !receptor ? "Choose a receptor." : !hasProtein
      ? "This receptor has no current protein context." : !validSeeds ? "Capture a valid, nonempty selection." : !validRadius
        ? "Use a radius from 2 to 12 Å in 0.5 Å steps." : null);
  const perform = async (value: SelectionPocketSurface | null) => {
    if (!receptor || !value || lock.current || busy) return;
    lock.current = true; setPending(true); setMessage(null);
    document.activeElement?.closest<HTMLElement>(".pocket-popover")?.focus();
    try {
      await onCreate([{ entry_id: receptor.id, source: { kind: "pocket", ...value } }]);
      setMessage({ receptorId: receptor.id, text: "Pocket definition saved. Check rendering in Surfaces." });
    } catch (failure) {
      setMessage({ receptorId: receptor.id, text: failure instanceof Error ? failure.message : "Pocket change failed." });
    } finally { lock.current = false; setPending(false); }
  };
  return <div className="pocket-draft">
    <label>Receptor<select aria-label="Pocket receptor" value={receptorId} disabled={busy || pending || !projections}
      onChange={(event) => {
        const entry = entries.find((item) => item.id === event.target.value);
        setReceptorId(entry?.id ?? ""); setDraft(entry ? draftFor(entry, selection.atoms) : null);
        setMessage(null);
      }}>
      <option value="">Choose receptor</option>
      {eligible.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select></label>
    <label>Radius (Å)<input aria-label="Pocket radius" type="number" min={2} max={12} step={0.5}
      value={draft && Number.isFinite(draft.radius) ? draft.radius : ""} disabled={!draft || busy || pending}
      onChange={(event) => setDraft((value) => value ? { ...value, radius: event.target.valueAsNumber } : value)} /></label>
    <div className="pocket-seeds"><span aria-live="polite">{draft?.seed_atom_references.length ?? 0} captured seeds</span>
      <button type="button" className="secondary-button" disabled={!draft || !selection.atoms.length || busy || pending}
        onClick={() => setDraft((value) => value ? { ...value, seed_atom_references: selection.atoms } : value)}>Use selection</button></div>
    <div className="dialog-actions">
      <button type="button" className="primary-button" disabled={busy || pending || unavailable !== null}
        onClick={() => void perform(draft)}>Create pocket</button>
    </div>
    {unavailable ? <p role="status">{unavailable}</p> : null}
    {message?.receptorId === receptorId ? <p role="status">{message.text}</p> : null}
    <details className="selection-help"><summary>Pocket help</summary><SurfaceHelp /></details>
  </div>;
}
