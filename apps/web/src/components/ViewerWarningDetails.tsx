import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Entry, MolecularWarning } from "../api/types";

type WarningEntry = Pick<Entry, "id" | "name" | "warnings">;

const severityPresentation = {
  info: { label: "Info", Icon: Info },
  warning: { label: "Warning", Icon: AlertTriangle },
  error: { label: "Error", Icon: AlertCircle },
} satisfies Record<MolecularWarning["severity"], { label: string; Icon: typeof Info }>;

/** A transient view of the same visible-entry warnings represented by the count. */
export function ViewerWarningDetails({ entries, returnFocus }: {
  entries: readonly WarningEntry[];
  returnFocus: () => HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const outsideInteraction = useRef(false);
  const groups = entries.filter(entry => entry.warnings.length > 0);
  const count = groups.reduce((total, entry) => total + entry.warnings.length, 0);
  const noun = count === 1 ? "warning" : "warnings";

  const position = useCallback(() => {
    const panel = content.current;
    const source = anchor.current;
    if (!panel || !source) return;
    const box = (trigger.current ?? source.parentElement ?? source).getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(box.left, window.innerWidth - bounds.width - 8));
    const top = Math.max(8, Math.min(box.bottom + 8, window.innerHeight - bounds.height - 8));
    panel.style.setProperty("--warning-details-left", `${left}px`);
    panel.style.setProperty("--warning-details-top", `${top}px`);
  }, []);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, entries, position]);

  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    const observer = new ResizeObserver(position);
    if (anchor.current?.parentElement) observer.observe(anchor.current.parentElement);
    if (content.current) observer.observe(content.current);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      observer.disconnect();
    };
  }, [open, position]);

  return <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
    <span ref={anchor} className="viewer-warning-anchor">
      {count > 0 ? <Dialog.Trigger asChild>
        <button ref={trigger} type="button" className="viewer-warning viewer-warning-trigger"
          aria-label={`Inspect ${count} ${noun} for visible structures`}>
          <AlertTriangle size={13} aria-hidden="true" /> {count} {noun}
        </button>
      </Dialog.Trigger> : null}
    </span>
    {open ? <Dialog.Portal><Dialog.Content ref={content}
      className="dialog-content viewer-warning-details" data-viewer-warning-details="true"
      aria-modal="false" aria-describedby={undefined}
      onOpenAutoFocus={event => {
        event.preventDefault();
        outsideInteraction.current = false;
        position();
        content.current?.focus();
      }}
      onInteractOutside={() => { outsideInteraction.current = true; }}
      onEscapeKeyDown={event => {
        if (!content.current?.contains(document.activeElement)) event.preventDefault();
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (outsideInteraction.current || !anchor.current?.isConnected) return;
        const destination = trigger.current ?? returnFocus();
        if (destination?.isConnected) destination.focus({ preventScroll: true });
      }}>
      <div className="dialog-heading">
        <Dialog.Title>Structure warnings</Dialog.Title>
        <Dialog.Close asChild><button type="button" className="icon-button" aria-label="Close structure warnings">
          <X size={18} aria-hidden="true" />
        </button></Dialog.Close>
      </div>
      <div className="viewer-warning-details-body" tabIndex={0} role="region" aria-label="Structure warning list">
        {groups.length ? groups.map(entry => <div key={entry.id} role="group" aria-label={entry.name}
          className="viewer-warning-group" data-warning-entry-id={entry.id}>
          <h3>{entry.name}</h3>
          <ul>{entry.warnings.map((warning, index) => {
            const { label, Icon } = severityPresentation[warning.severity];
            return <li key={index}>
              <span className={`viewer-warning-severity severity-${warning.severity}`}>
                <Icon size={14} aria-hidden="true" /><span>{label}</span>
              </span>
              <span className="viewer-warning-message">{warning.message}</span>
            </li>;
          })}</ul>
        </div>) : <p className="viewer-warning-empty">No warnings for visible structures</p>}
      </div>
    </Dialog.Content></Dialog.Portal> : null}
  </Dialog.Root>;
}
