import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef } from "react";
import type { Entry } from "../api/types";
import { IconButton } from "./IconButton";

export function EntryDetails({ entry, onClose, onReturnFocus }: {
  entry: Entry | undefined;
  onClose: () => void;
  onReturnFocus: () => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  return <Dialog.Root open={Boolean(entry)} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Content ref={content} className="dialog-content entry-details" aria-describedby={undefined}
      onOpenAutoFocus={event => { event.preventDefault(); content.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }}>
      <div className="dialog-heading"><Dialog.Title>Entry details</Dialog.Title>
        <Dialog.Close asChild><IconButton label="Close entry details"><X size={18} /></IconButton></Dialog.Close>
      </div>
      {entry ? <div className="entry-details-body">
        <dl>
          <dt>Name</dt><dd>{entry.name}</dd>
          <dt>Description</dt><dd>{entry.description || "None"}</dd>
          <dt>Original filename</dt><dd>{entry.original_filename ?? "Not available"}</dd>
          <dt>Format</dt><dd>{entry.source_format ?? "Not available"}</dd>
          <dt>Structure type</dt><dd>{entry.structure_type}</dd>
          <dt>Atoms</dt><dd>{entry.atom_count}</dd>
          <dt>Status</dt><dd>{entry.dirty ? "Modified" : "Unmodified"}; {entry.locked ? "Locked" : "Unlocked"}; {entry.visible ? "Visible" : "Hidden"}</dd>
          <dt>Created</dt><dd>{entry.created_at}</dd>
          <dt>Modified</dt><dd>{entry.modified_at}</dd>
        </dl>
        <h3>Warnings ({entry.warnings.length})</h3>
        {entry.warnings.length ? <ul>{entry.warnings.map((warning, index) =>
          <li key={`${warning.code}:${index}`}>{warning.message}</li>)}</ul> : <p>No entry warnings.</p>}
      </div> : null}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
