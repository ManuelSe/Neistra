import * as Dialog from "@radix-ui/react-dialog";
import { HelpCircle, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import { useInteractionStore } from "../store/interactions";
import { INTERACTION_LABELS, type InteractionChoices, type InteractionKind, type InteractionResult } from "../interactions/types";

const available: InteractionKind[] = ["hydrogen_bond", "hydrophobic", "pi_pi", "cation_pi", "salt_bridge", "clash"];

export function InteractionPanel({ open, onOpenChange, choices, result, status, onRetry, restoreFocus = true }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  choices: InteractionChoices; result: InteractionResult | null; status: string;
  onRetry?: () => void;
  restoreFocus?: boolean;
}) {
  const [help, setHelp] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const position = useCallback(() => {
    const panel = content.current;
    if (!panel) return;
    const launcher = returnFocus.current?.closest(".structure-viewer")?.querySelector(".viewer-toolbar");
    const box = launcher?.getBoundingClientRect();
    panel.style.setProperty("--interaction-left", `${Math.max(8, Math.min(box?.left ?? 8, innerWidth - panel.offsetWidth - 8))}px`);
    panel.style.setProperty("--interaction-top", `${Math.max(8, Math.min((box?.bottom ?? 50) + 8, innerHeight - panel.offsetHeight - 8))}px`);
  }, []);
  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(position);
    if (content.current) observer.observe(content.current);
    window.addEventListener("resize", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); };
  }, [open, position]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
    <Dialog.Portal><Dialog.Content ref={content} className="dialog-content interaction-panel" aria-describedby={undefined}
      onInteractOutside={event => event.preventDefault()}
      onEscapeKeyDown={event => { if (!content.current?.contains(document.activeElement)) event.preventDefault(); }}
      onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; position(); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus && returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
      <div className="dialog-heading"><Dialog.Title>Interactions</Dialog.Title>
        <div className="interaction-actions"><IconButton label="Interaction help" onClick={() => setHelp(!help)}><HelpCircle size={17} /></IconButton>
          <Dialog.Close asChild><IconButton label="Close interactions"><X size={17} /></IconButton></Dialog.Close></div></div>
      <div role="group" aria-label="Interaction scope" className="interaction-scopes">
        {(["inter", "intra"] as const).map(scope => <button type="button" key={scope} aria-label={`${scope === "inter" ? "Intermolecular" : "Intramolecular"} interactions`} aria-pressed={choices[scope]} onClick={() => useInteractionStore.getState().toggleScope(scope)}>{scope === "inter" ? "Inter" : "Intra"}</button>)}
      </div>
      <div role="group" aria-label="Interaction types" className="interaction-types">
        {available.map(kind => <button type="button" key={kind} aria-pressed={choices.types.includes(kind)} onClick={() => useInteractionStore.getState().toggleType(kind)}><span className={`interaction-swatch interaction-${kind}`} aria-hidden="true" />{INTERACTION_LABELS[kind]}</button>)}
      </div>
      <p className="interaction-status" role="status">{status}</p>
      {onRetry ? <IconButton label="Retry interaction analysis" onClick={onRetry}><RotateCcw size={16} /></IconButton> : null}
      {help ? <div className="interaction-help">
        <p>Fixed interaction-v1 geometry in the current workspace. This is geometric screening, not binding energy. Uncertain sites are skipped.</p>
        <p>Clashes use element radii and ≥0.4 Å overlap, excluding up to three covalent bonds. Metal coordination is unsupported.</p>
        <p>H bonds need explicit H, donor angle ≥130° and applicable acceptor angle ≥90°. π contacts require complete planar aromatic rings and directional geometry. Salt bridges use opposite charged groups within 4.5 Å.</p>
        <p>Prepare explicit hydrogens using the existing editing tools. Resolve alternate locations; raw PDB/mmCIF ligand chemistry may require preparation.</p>
        {result?.warnings.map((warning, index) => <p key={index}>{warning.message}</p>)}
      </div> : null}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
