import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef } from "react";
import type { MolecularComponent, MolecularWarning } from "../api/types";
import { IconButton } from "./IconButton";

const classificationExplanation = {
  source: "Assigned from source entity or polymer metadata",
  fallback: "Assigned by a documented residue or element fallback",
  ambiguous: "The available evidence does not support a narrower assignment",
} as const;

export interface ComponentDetailsContent {
  title: string;
  parent: string;
  atomCount: number;
  components: MolecularComponent[];
  warnings: MolecularWarning[];
  visibility?: string;
}

export function ComponentDetails({ details, onClose, onReturnFocus }: {
  details: ComponentDetailsContent | null; onClose: () => void; onReturnFocus: () => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const sources = new Set(details?.components.map(component => component.classification_source));
  return <Dialog.Root open={Boolean(details)} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Content ref={content} className="dialog-content component-details" aria-describedby={undefined}
      onOpenAutoFocus={event => { event.preventDefault(); content.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }}>
      <div className="dialog-heading"><Dialog.Title>Component details</Dialog.Title>
        <Dialog.Close asChild><IconButton label="Close component details"><X size={18} /></IconButton></Dialog.Close>
      </div>
      {details ? <div className="entry-details-body">
        <h3>{details.title}</h3><p>Entry: {details.parent}</p>
        <p>{details.components.length} components / {details.atomCount} atoms</p>
        {details.visibility ? <p>{details.visibility}</p> : null}
        {[...sources].map(source => <p key={source}>{classificationExplanation[source]}</p>)}
        {details.components.length === 1 ? <dl>
          <dt>Category</dt><dd>{details.components[0].category}</dd>
          <dt>Assignment</dt><dd>{details.components[0].classification_status}</dd>
          <dt>Chains</dt><dd>{details.components[0].chain_ids.join(", ") || "None"}</dd>
          <dt>Residues</dt><dd>{details.components[0].residue_ids.join(", ") || "None"}</dd>
        </dl> : null}
        <h3>Warnings ({details.warnings.length})</h3>
        {details.warnings.length ? <ul>{details.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{warning.message}</li>)}</ul> : <p>No component warnings.</p>}
        <p>Classification does not establish biological function or binding significance.</p>
      </div> : null}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
