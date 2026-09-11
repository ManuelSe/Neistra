import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";

/** Non-modal workspace tool: outside interactions belong to the workspace. */
export function SelectionPalette({ open, onOpenChange, children, count }: {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const anchor = useRef<Element | null>(null);
  const position = useCallback(() => {
    const box = anchor.current?.getBoundingClientRect();
    const left = Math.max(8, Math.min(box?.left ?? 10, window.innerWidth - 352));
    const top = Math.max(8, Math.min((box?.bottom ?? 50) + 8, window.innerHeight - 120));
    content.current?.style.setProperty("--palette-left", `${left}px`);
    content.current?.style.setProperty("--palette-top", `${top}px`);
  }, []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", position);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    if (anchor.current) observer?.observe(anchor.current);
    return () => { window.removeEventListener("resize", position); observer?.disconnect(); };
  }, [open, position]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
    <Dialog.Portal><Dialog.Content ref={content} className="dialog-content selection-palette"
      aria-describedby={undefined}
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => {
        if (!content.current?.contains(document.activeElement)) event.preventDefault();
      }}
      onOpenAutoFocus={(event) => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        anchor.current = returnFocus.current?.closest(".structure-viewer")?.querySelector(".viewer-toolbar") ?? null;
        position();
        event.preventDefault();
        const first = content.current?.querySelector<HTMLElement>(
          '.selection-style-option:not(:disabled), .selection-style-dialog input:not(:disabled)',
        );
        (first ?? content.current)?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (returnFocus.current?.isConnected) returnFocus.current.focus();
      }}>
      <div className="dialog-heading">
        <div><Dialog.Title>Style selection</Dialog.Title>
          <span className="selection-style-summary">{count} {count === 1 ? "atom" : "atoms"}</span></div>
        <Dialog.Close asChild><IconButton label="Close dialog"><X size={18} /></IconButton></Dialog.Close>
      </div>
      {children}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
