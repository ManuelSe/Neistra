import { useLayoutEffect, type RefObject } from "react";

/** Reserve the actual wrapping application header above vendor popups. */
export function useChromeClearance(target: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = target.current?.closest<HTMLElement>(".structure-viewer");
    const header = root?.querySelector<HTMLElement>(".viewer-header");
    if (!root || !header) return;
    const update = () => {
      const bounds = root.getBoundingClientRect();
      const bottom = header.getBoundingClientRect().bottom - bounds.top + 8;
      root.style.setProperty("--viewer-chrome-bottom", `${Math.max(8, Math.min(bottom, bounds.height - 100))}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(root); observer.observe(header); update();
    return () => { observer.disconnect(); root.style.removeProperty("--viewer-chrome-bottom"); };
  }, [target]);
}
