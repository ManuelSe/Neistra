import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";

/** Non-modal workspace tool: outside interactions belong to the workspace. */
export function SelectionPalette({ open, onOpenChange, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
    <Dialog.Content ref={content} className="dialog-content selection-palette"
      aria-describedby={undefined}
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => {
        if (!content.current?.contains(document.activeElement)) event.preventDefault();
      }}
      onOpenAutoFocus={(event) => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        event.preventDefault();
        const first = content.current?.querySelector<HTMLElement>(
          '.selection-style-dialog button:not(:disabled), .selection-style-dialog input:not(:disabled)',
        );
        (first ?? content.current)?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (returnFocus.current?.isConnected) returnFocus.current.focus();
      }}>
      <div className="dialog-heading">
        <Dialog.Title>Style selection</Dialog.Title>
        <Dialog.Close asChild><IconButton label="Close dialog"><X size={18} /></IconButton></Dialog.Close>
      </div>
      {children}
    </Dialog.Content>
  </Dialog.Root>;
}
