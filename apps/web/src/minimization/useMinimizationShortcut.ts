import { useEffect } from "react";

/** A calculation shortcut never steals typing or a modal's keyboard ownership. */
export function useMinimizationShortcut(enabled: boolean, run: () => void) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!enabled || event.defaultPrevented || event.isComposing || event.repeat || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== "m") return;
      const target = event.target instanceof Element ? event.target : document.activeElement;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='textbox']") || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      run();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [enabled, run]);
}
