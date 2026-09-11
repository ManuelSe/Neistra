import { SelectionHydrogenControls } from "./SelectionHydrogenControls";
import { SelectionColorControls } from "./SelectionColorControls";
import type { ChangeSelectionAppearance } from "../api/types";
import type { ExpandSelection } from "../selection/expansion";
import { SelectionExpansion } from "./SelectionExpansion";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  Entry,
  Selection,
  SelectionRepresentationStyle,
  StructureProjection,
} from "../api/types";
import { polymerStyleUnavailableReason } from "../viewer/selectionStyleEligibility";
import {
  atomicRepresentationStyles,
  polymerRepresentationStyles,
} from "../viewer/settings";
import { SelectionPalette } from "./SelectionPalette";

const LABELS: Record<SelectionRepresentationStyle, string> = {
  line: "Line",
  stick: "Thin sticks",
  "thick-stick": "Thick sticks",
  "ball-and-stick": "Ball and stick",
  "space-filling": "Space filling",
  backbone: "Backbone",
  cartoon: "Cartoon",
};

interface SelectionStyleDialogProps {
  open: boolean;
  selection: Selection;
  entries: Entry[];
  structures: ReadonlyMap<string, StructureProjection>;
  eligibilityBusy: boolean;
  eligibilityError?: string | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onExpandDistance?: ExpandSelection;
  onAppearance?: ChangeSelectionAppearance;
  onAction: (
    action: "apply" | "reset",
    style?: SelectionRepresentationStyle,
  ) => Promise<void>;
}

export function SelectionStyleDialog({
  open,
  selection,
  entries,
  structures,
  eligibilityBusy,
  eligibilityError,
  busy,
  onOpenChange,
  onAction,
  onExpandDistance,
  onAppearance,
}: SelectionStyleDialogProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string; context: string } | null>(
    null,
  );
  const context = JSON.stringify([open, selection.atoms, entries.map((entry) => [entry.id, entry.current_artifact_id])]);
  const entryCount = new Set(selection.atoms.map((atom) => atom.structure_id)).size;
  const polymerReason = eligibilityBusy
    ? "Checking complete-residue compatibility"
    : eligibilityError ?? polymerStyleUnavailableReason(selection, structures);
  const assignedStyles = useMemo(() => {
    const byEntry = new Map(entries.map((entry) => [entry.id,
      new Map(entry.viewer_settings.selection_representations.map((assignment) =>
        [assignment.style, new Set(assignment.atom_ids)] as const)),
    ]));
    return new Set(
      [...atomicRepresentationStyles, ...polymerRepresentationStyles].filter((style) =>
        selection.atoms.every((reference) =>
          byEntry
            .get(reference.structure_id)
            ?.get(style)?.has(reference.atom_id),
        ),
      ),
    );
  }, [entries, selection.atoms]);

  const run = async (
    action: "apply" | "reset",
    style?: SelectionRepresentationStyle,
  ) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.closest<HTMLElement>(".selection-palette")?.focus();
    }
    const key = style ?? "reset";
    setActiveAction(key);
    setMessage(null);
    try {
      await onAction(action, style);
      setMessage({
        kind: "success", context,
        text:
          action === "reset"
            ? `Reset ${selection.atoms.length} selected atom${selection.atoms.length === 1 ? "" : "s"} to entry defaults.`
            : `Applied ${style ? LABELS[style] : "representation"} to ${selection.atoms.length} selected atom${selection.atoms.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setMessage({
        kind: "error", context,
        text: error instanceof Error ? error.message : "The selection style could not be changed.",
      });
    } finally {
      setActiveAction(null);
    }
  };

  const renderStyle = (style: SelectionRepresentationStyle, unavailable: string | null) => (
    <button
      key={style}
      type="button"
      className="selection-style-option"
      aria-pressed={assignedStyles.has(style)}
      disabled={busy || activeAction !== null || !selection.atoms.length || unavailable !== null}
      title={unavailable ?? undefined}
      onClick={() => void run("apply", style)}
    >
      <span>{LABELS[style]}</span>
      {activeAction === style ? <small>Applying…</small> : null}
    </button>
  );

  return (
    <SelectionPalette
      open={open}
      onOpenChange={(next) => {
        if (!next) setMessage(null);
        onOpenChange(next);
      }}
    >
      <div className="selection-style-dialog">
        <dl className="selection-style-summary" aria-label="Current selection summary">
          <div>
            <dt>Atoms</dt>
            <dd>{selection.atoms.length}</dd>
          </div>
          <div>
            <dt>Entries</dt>
            <dd>{entryCount}</dd>
          </div>
        </dl>
        {open && onExpandDistance ? <SelectionExpansion
          expand={onExpandDistance}
          disabled={busy || selection.atoms.length === 0}
          contextKey={JSON.stringify([selection, entries.map((entry) =>
            [entry.id, entry.current_artifact_id])])}
        /> : null}
        <p className="selection-style-help">
          Entry representations remain the default. A selection style replaces only the same
          atom-detail or polymer channel on these atoms.
        </p>
        <fieldset className="selection-style-group">
          <legend>Atom detail</legend>
          <div className="selection-style-grid">
            {atomicRepresentationStyles.map((style) =>
              renderStyle(style, null),
            )}
          </div>
        </fieldset>
        <fieldset className="selection-style-group">
          <legend>Polymer</legend>
          <div className="selection-style-grid polymer">
            {polymerRepresentationStyles.map((style) =>
              renderStyle(style, polymerReason),
            )}
          </div>
          {polymerReason ? <p className="selection-style-reason">{polymerReason}</p> : null}
        </fieldset>
        {eligibilityError ? <p role="alert">{eligibilityError}</p> : null}
        {onAppearance && !eligibilityError ? <SelectionHydrogenControls selection={selection} entries={entries}
          structures={structures} loading={eligibilityBusy} busy={busy || eligibilityBusy} onChange={onAppearance} /> : null}
        {onAppearance ? <SelectionColorControls selection={selection} entries={entries}
          busy={busy} onChange={onAppearance} /> : null}
        <button
          type="button"
          className="secondary-button selection-style-reset"
          disabled={busy || activeAction !== null || !selection.atoms.length}
          onClick={() => void run("reset")}
        >
          <RotateCcw size={15} />
          {activeAction === "reset" ? "Resetting…" : "Reset representation"}
        </button>
        {message?.context === context ? (
          <p className={`selection-style-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </div>
    </SelectionPalette>
  );
}
