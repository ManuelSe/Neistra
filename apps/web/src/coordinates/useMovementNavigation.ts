import { useCallback, useEffect, useRef, useState } from "react";

const modalOpen = () => document.querySelector('[role="dialog"]:not([aria-modal="false"]):not([aria-hidden="true"])') !== null;
const canvasFocused = () => document.activeElement?.matches('[data-movement-canvas="true"]') === true;

/** Transient input ownership only; never touches capture, pose or persistence. */
export function useMovementNavigation(active: boolean) {
  const [heldSpace, setHeldSpace] = useState(false);
  const [viewToggle, setViewToggle] = useState(false);
  const [inputEpoch, setInputEpoch] = useState(0);
  const enabled = useRef(active);
  enabled.current = active;
  const clear = useCallback(() => {
    setHeldSpace(false); setViewToggle(false);
    if (enabled.current) setInputEpoch(epoch => epoch + 1);
  }, []);
  useEffect(() => { if (!active) clear(); }, [active, clear]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        || !enabled.current || !canvasFocused() || modalOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      setHeldSpace(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setHeldSpace(false);
    };
    const focus = () => { if (!canvasFocused()) setHeldSpace(false); };
    const visibility = () => { if (document.hidden) clear(); };
    let hadModal = modalOpen();
    const observer = new MutationObserver(() => {
      const hasModal = modalOpen();
      if (hasModal && !hadModal) clear();
      hadModal = hasModal;
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-hidden", "aria-modal"] });
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    document.addEventListener("focusin", focus);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clear]);
  return { cameraNavigation: active && (heldSpace || viewToggle), viewToggle, inputEpoch,
    clearNavigation: clear,
    toggleView: () => { if (enabled.current && !modalOpen()) setViewToggle(value => !value); } };
}
