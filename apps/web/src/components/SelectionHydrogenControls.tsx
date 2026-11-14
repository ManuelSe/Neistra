import { Check, RotateCcw } from "lucide-react";
import { useId, useMemo } from "react";
import type { ChangeHydrogenTarget, Entry, Selection, StructureProjection } from "../api/types";
import { resolveHydrogenTargets } from "../selection/hydrogenTargets";
import { IconButton } from "./IconButton";

export function SelectionHydrogenControls({ selection, entries, structures, loading = false, error, busy, onChange }: {
  selection: Selection;
  entries: Entry[];
  structures: ReadonlyMap<string, StructureProjection>;
  busy: boolean;
  loading?: boolean;
  error?: string | null;
  onChange: ChangeHydrogenTarget;
}) {
  const descriptionId = useId(), resetDescriptionId = useId();
  const resolved = useMemo(() => {
    if (loading || error) return { target: null, error: null };
    try { return { target: resolveHydrogenTargets(selection, structures), error: null }; }
    catch (failure) { return { target: null, error: failure instanceof Error ? failure.message : "Hydrogen targets are unavailable." }; }
  }, [selection, structures, loading, error]);
  const preferences = useMemo(() => {
    const byEntry = new Map(entries.map(entry => [entry.id, entry]));
    const overrides = new Map(entries.map(entry => [entry.id,
      new Map(entry.viewer_settings.selection_nonpolar_hydrogens.flatMap(item => item.atom_ids.map(id => [id, item.show] as const))),
    ]));
    const states = new Set<boolean>();
    let overrideCount = 0, hiddenByMaster = false, missingEntry = false;
    for (const atom of resolved.target?.atoms ?? []) {
      const entry = byEntry.get(atom.structure_id);
      if (!entry) { missingEntry = true; continue; }
      const override = overrides.get(atom.structure_id)?.get(atom.atom_id);
      if (override !== undefined) overrideCount++;
      states.add(override ?? entry.viewer_settings.components.nonpolar_hydrogens);
      hiddenByMaster ||= !entry.viewer_settings.components.hydrogens;
    }
    return { mode: states.size > 1 ? "mixed" as const : states.has(true) ? "all" as const : "polar" as const,
      overrideCount, hiddenByMaster, missingEntry };
  }, [entries, resolved.target]);
  const count = resolved.target?.atoms.length ?? 0;
  const unavailable = error ?? resolved.error ?? (loading ? "Checking existing hydrogen targets…"
    : preferences.missingEntry ? "Selection entries are unavailable. Reopen the styling panel."
      : !count ? "No existing hydrogens in this target." : null);
  const disabled = busy || unavailable !== null;
  const mode = preferences.mode;
  const modeText = mode === "all" ? "Hydrogens: All. Show polar only." : mode === "polar" ? "Hydrogens: Polar. Show all." : "Hydrogens: Mixed. Show all.";
  const inherited = count > preferences.overrideCount ? preferences.overrideCount ? " Includes entry settings." : " Uses entry setting." : "";
  const description = unavailable ?? `${modeText}${inherited}${busy ? " Applying change." : ""}`;
  const resetDescription = unavailable ?? (busy ? "Applying change." : preferences.overrideCount ? "Restore the entry hydrogen setting for this target." : "This target already uses entry settings.");
  return <fieldset className="selection-style-group selection-hydrogens" aria-label="Hydrogens">
    <div className="selection-hydrogen-row">
      <span className="selection-hydrogen-label">Hydrogens</span>
      <IconButton label="Show non-polar hydrogens" tooltip={description} className="selection-hydrogen-toggle"
        aria-pressed={mode === "mixed" ? "mixed" : mode === "all"} aria-disabled={disabled}
        aria-describedby={descriptionId} onClick={() => {
          if (!disabled && resolved.target) void onChange({ property: "nonpolar_hydrogens", action: "set", show: mode !== "all" }, resolved.target);
        }}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <path d="M5 3v12M13 3v12M5 9h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {mode === "all" && !unavailable ? <Check className="selection-hydrogen-state" size={10} aria-hidden="true" />
          : mode === "mixed" && !unavailable ? <span className="selection-hydrogen-state" aria-hidden="true">−</span> : null}
      </IconButton>
      <IconButton label="Use entry hydrogen setting" tooltip={resetDescription} className="selection-hydrogen-reset"
        aria-disabled={disabled || preferences.overrideCount === 0} aria-describedby={unavailable ? descriptionId : resetDescriptionId}
        onClick={() => { if (!disabled && preferences.overrideCount && resolved.target) void onChange({ property: "nonpolar_hydrogens", action: "reset" }, resolved.target); }}>
        <RotateCcw size={14} aria-hidden="true" />
      </IconButton>
    </div>
    <p id={descriptionId} className={unavailable ? "selection-style-help" : "sr-only"}>{description}</p>
    {!unavailable ? <p id={resetDescriptionId} className="sr-only">{resetDescription}</p> : null}
    {!unavailable && preferences.hiddenByMaster ? <p className="selection-style-help">Show hydrogens is off; local preferences are retained.</p> : null}
    <details className="selection-help"><summary>Hydrogen help</summary>
      <p>{!unavailable ? `${count} existing hydrogens in the target. ` : ""}Selected hydrogens and hydrogens directly bonded to selected heavy atoms are included.
        Only non-polar hydrogen visibility changes. Entry visibility, Show hydrogens, components and isolation still apply.
        This control does not add hydrogens or change the selection.</p>
    </details>
  </fieldset>;
}
