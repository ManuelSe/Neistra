import { Eye, EyeOff, Info, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { SurfaceActions, ChangeSelectionAppearance, Entry, Selection, SelectionColorMode, SelectionRepresentationStyle, StructureProjection } from "../api/types";
import type { ExpandSelection } from "../selection/expansion";
import { polymerStyleUnavailableReason } from "../viewer/selectionStyleEligibility";
import { atomicRepresentationStyles, polymerRepresentationStyles } from "../viewer/settings";
import { PocketSurfaceControls } from "./PocketSurfaceControls";
import { SelectionPalette } from "./SelectionPalette";
import { SelectionColorControls } from "./SelectionColorControls";
import { SelectionHydrogenControls } from "./SelectionHydrogenControls";
import { SelectionExpansion } from "./SelectionExpansion";
import { RepresentationGlyph } from "./RepresentationGlyph";

const LABELS: Record<SelectionRepresentationStyle, string> = {
  line: "Line", stick: "Thin sticks", "thick-stick": "Thick sticks",
  "ball-and-stick": "Ball and stick", "space-filling": "Space filling",
  backbone: "Backbone", cartoon: "Cartoon",
};

interface SelectionStyleDialogProps {
  open: boolean;
  restoreFocus?: boolean;
  selection: Selection;
  entries: Entry[];
  structures: ReadonlyMap<string, StructureProjection>;
  eligibilityBusy: boolean;
  eligibilityError?: string | null;
  busy: boolean;
  selectionColorMode: SelectionColorMode;
  onSelectionColorModeChange: (mode: SelectionColorMode) => void;
  onOpenChange: (open: boolean) => void;
  onExpandDistance?: ExpandSelection;
  onAtomVisibility?: (action: "hide" | "show") => Promise<void>;
  onSurfaces?: SurfaceActions;
  onManageSurfaces?: () => void;
  onLoadPocketStructures?: () => Promise<Map<string, StructureProjection>>;
  onCreateFragment?: () => Promise<void>;
  onAppearance?: ChangeSelectionAppearance;
  onAction: (action: "apply" | "reset", style?: SelectionRepresentationStyle) => Promise<void>;
}

export function SelectionStyleDialog(props: SelectionStyleDialogProps) {
  return <SelectionPalette open={props.open} onOpenChange={props.onOpenChange}
    count={props.selection.atoms.length} restoreFocus={props.restoreFocus}>
    {props.open ? <SelectionStyleContent {...props} /> : null}
  </SelectionPalette>;
}

function SelectionStyleContent({ selection, entries, structures, eligibilityBusy,
  eligibilityError, busy, selectionColorMode, onSelectionColorModeChange, onAction, onExpandDistance, onAppearance, onCreateFragment, onAtomVisibility, onSurfaces, onManageSurfaces, onLoadPocketStructures }: SelectionStyleDialogProps) {
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean; context: string } | null>(null);
  const context = JSON.stringify([selection.atoms, entries.map((entry) => [entry.id, entry.current_artifact_id])]);
  const entryCount = new Set(selection.atoms.map((atom) => atom.structure_id)).size;
  const disabled = busy || pending || !selection.atoms.length;
  const polymerReason = eligibilityBusy ? "Checking complete-residue compatibility"
    : eligibilityError ?? polymerStyleUnavailableReason(selection, structures);
  const memberships = useMemo(() => new Map(entries.map((entry) => [entry.id,
    new Map(entry.viewer_settings.selection_representations.map((item) =>
      [item.style, new Set(item.atom_ids)] as const)),
  ])), [entries]);
  const hiddenMemberships = useMemo(() => new Map(entries.map((entry) => [
    entry.id, new Set(entry.viewer_settings.selection_hidden_atoms),
  ])), [entries]);
  const hiddenCount = selection.atoms.filter((atom) => hiddenMemberships.get(atom.structure_id)?.has(atom.atom_id)).length;
  const allHidden = selection.atoms.length > 0 && hiddenCount === selection.atoms.length;
  const mixedHidden = hiddenCount > 0 && !allHidden;
  const surfaceCount = entries.reduce((sum, entry) => sum + entry.viewer_settings.surface_objects.length, 0);
  const assigned = (style: SelectionRepresentationStyle) => {
    const count = selection.atoms.filter((atom) => memberships.get(atom.structure_id)?.get(style)?.has(atom.atom_id)).length;
    return count === 0 ? false : count === selection.atoms.length ? true : "mixed" as const;
  };
  const perform = async (operation: () => Promise<void>, success: string) => {
    if (disabled || locked.current) return;
    locked.current = true;
    // Disabling a focused button otherwise moves browser focus to the document.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.closest<HTMLElement>(".selection-palette")?.focus();
    }
    setPending(true);
    setMessage(null);
    try {
      await operation();
      setMessage({ text: success, failed: false, context });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Selection change failed. Try again.", failed: true, context });
    } finally { locked.current = false; setPending(false); }
  };
  const appearance: ChangeSelectionAppearance = (change) => perform(
    () => onAppearance!(change),
    change.property === "color" ? `Selection color ${change.action === "reset" ? "reset" : "applied"}.`
      : "Selection hydrogen visibility stored.",
  );
  const renderStyle = (style: SelectionRepresentationStyle, reason: string | null) => <button
    key={style} type="button" className="selection-style-option" aria-label={LABELS[style]} aria-pressed={assigned(style)}
    disabled={disabled || reason !== null} aria-describedby={reason ? "selection-polymer-reason" : undefined}
    onClick={() => void perform(() => onAction("apply", style), `Applied ${LABELS[style]}.`)}>
    <RepresentationGlyph style={style} /><span>{style === "ball-and-stick" ? "Ball & stick" : LABELS[style]}</span>
    {assigned(style) === "mixed" ? <span className="selection-mixed-mark" aria-hidden="true">−</span> : null}
  </button>;
  const feedback = message && (message.failed || message.context === context) ? message : null;
  return <div className="selection-style-dialog">
    <div className="selection-section-heading"><span>Representation</span>
      <button type="button" className="selection-reset" aria-label="Reset representation"
        disabled={disabled} onClick={() => void perform(() => onAction("reset"), "Reset representation to entry defaults.")}>
        <RotateCcw size={13} aria-hidden="true" /> Reset
      </button>
    </div>
    <fieldset className="selection-style-group"><legend>Atom detail</legend>
      <div className="selection-style-grid">{atomicRepresentationStyles.map((style) => renderStyle(style, null))}
        <button type="button" className="selection-style-option" data-mixed={mixedHidden || undefined}
          aria-label={allHidden ? "Show atom detail" : `Hide atom detail${mixedHidden ? " (mixed visibility)" : ""}`}
          disabled={disabled || !onAtomVisibility}
          onClick={() => void perform(() => onAtomVisibility!(allHidden ? "show" : "hide"),
            allHidden ? "Atom detail shown." : "Atom detail hidden.")}>
          {allHidden ? <Eye size={25} aria-hidden="true" /> : <EyeOff size={25} aria-hidden="true" />}
          <span>{allHidden ? "Show" : "Hide"}</span>
          {mixedHidden ? <span className="selection-mixed-mark" aria-hidden="true">−</span> : null}
        </button>
      </div>
    </fieldset>
    <fieldset className="selection-style-group"><legend>Polymer</legend>
      <div className="selection-style-grid polymer">{polymerRepresentationStyles.map((style) => renderStyle(style, polymerReason))}</div>
      {polymerReason && !eligibilityError ? <details className="selection-help">
        <summary>Why unavailable?</summary><p id="selection-polymer-reason">{polymerReason}</p>
      </details> : null}
    </fieldset>
    {eligibilityError ? <p role="alert" id="selection-polymer-reason">{eligibilityError}</p> : null}
    {onCreateFragment ? <div className="selection-surface-controls" role="group" aria-label="Surface">
      <span><strong>Surface</strong><br /><span>{surfaceCount} saved</span></span>
      <button type="button" aria-label="Create fragment surface" disabled={disabled}
        onClick={() => void perform(onCreateFragment, "Surface definition saved; check rendering in Surfaces.")}>Create</button>
      <button type="button" aria-label={`Manage surfaces (${surfaceCount})`} disabled={busy || pending}
        onClick={onManageSurfaces}>Manage</button>
      {onSurfaces && onLoadPocketStructures ? <PocketSurfaceControls entries={entries} selection={selection}
        busy={busy || pending} onCreate={onSurfaces.create} load={onLoadPocketStructures} />
        : <details className="selection-help surface-help"><summary aria-label="About surfaces"><Info size={16} aria-hidden="true" /></summary>
          <p>A fragment surface uses only captured atoms. Cut boundaries can create artificial faces.
            Selection changes do not retarget saved surfaces. Atomic and polymer styles remain independent.</p>
        </details>}
    </div> : null}
    {onAppearance ? <SelectionColorControls selection={selection} entries={entries} busy={disabled}
      mode={selectionColorMode} onModeChange={onSelectionColorModeChange} onChange={appearance} /> : null}
    {onAppearance && !eligibilityError ? <SelectionHydrogenControls selection={selection} entries={entries}
      structures={structures} loading={eligibilityBusy} busy={disabled || eligibilityBusy} onChange={appearance} /> : null}
    {onExpandDistance ? <details className="selection-disclosure"><summary>Expand by distance</summary>
      <SelectionExpansion expand={onExpandDistance} disabled={disabled} contextKey={context}
        onMessage={(text, failed) => setMessage(text ? { text, failed, context } : null)} />
    </details> : null}
    <details className="selection-help"><summary>Selection help</summary>
      <p>{entryCount} {entryCount === 1 ? "entry" : "entries"}. Entry representations remain the default.
        Styles replace only their atom-detail or polymer channel. A dash indicates mixed assignments.
        Hide affects atom detail only; polymer and surfaces stay visible. Show restores prior styles.
        Reset representation restores both channels and shows its target; color and hydrogen resets are independent.</p>
    </details>
    <div className="selection-feedback" aria-busy={pending}>
      {pending ? <p role="status">Applying…</p> : feedback ? <p role={feedback.failed ? "alert" : "status"}>
        {feedback.context !== context ? "Previous selection: " : ""}{feedback.text}
      </p> : null}
    </div>
  </div>;
}
