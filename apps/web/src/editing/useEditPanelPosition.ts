import { useLayoutEffect, type RefObject } from "react";
import { useEditingStore } from "../store/editing";

/** Viewport-owned tool placement; notification geometry never becomes domain state. */
export function useEditPanelPosition(
  open: boolean, projectId: string, launcher: RefObject<HTMLButtonElement | null>,
  content: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!open || !content.current) return;
    const panel = content.current;
    let frame: number | null = null;
    let observedNotice: Element | null = null;
    const position = () => {
      const anchor = launcher.current?.getBoundingClientRect();
      const workspace = launcher.current?.closest(".structure-viewer")?.getBoundingClientRect();
      const leftBound = Math.max(8, workspace?.left ?? 8);
      const rightBound = Math.min(window.innerWidth - 8, workspace?.right || window.innerWidth - 8);
      const width = Math.max(120, Math.min(300, rightBound - leftBound));
      const left = Math.max(leftBound, Math.min(anchor?.left ?? leftBound, rightBound - width));
      let top = (anchor?.bottom ?? 60) + 6;
      const notice = document.querySelector(".notice");
      if (notice !== observedNotice) {
        if (observedNotice) resize?.unobserve(observedNotice);
        if (notice) resize?.observe(notice);
        observedNotice = notice;
      }
      const noticeBox = notice?.getBoundingClientRect();
      if (noticeBox && left < noticeBox.right && left + width > noticeBox.left && top < noticeBox.bottom + 8) {
        top = noticeBox.bottom + 8;
      }
      top = Math.max(8, Math.min(top, window.innerHeight - 100));
      Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`,
        maxHeight: `${Math.max(80, Math.min(520, window.innerHeight - top - 12))}px` });
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; position(); });
    };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const workspace = launcher.current?.closest(".structure-viewer");
    if (workspace) resize?.observe(workspace);
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    position();
    if (useEditingStore.getState().focusRequested) {
      panel.focus(); useEditingStore.getState().setFocusRequested(false);
    }
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      resize?.disconnect(); mutation.disconnect(); window.removeEventListener("resize", schedule);
      const state = useEditingStore.getState();
      if (state.projectId === projectId && state.open && panel.contains(document.activeElement)) state.setFocusRequested(true);
    };
  }, [open, projectId, launcher, content]);
}
