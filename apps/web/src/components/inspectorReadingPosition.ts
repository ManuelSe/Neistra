import { useLayoutEffect, type RefObject } from "react";

interface Landmark {
  tag: string;
  text: string;
  occurrence: number;
  offset: number;
}
interface ReadingPosition { top: number; width: number; height: number; landmark: Landmark | null }

/** One current presentation visit, independent of molecular or persisted state. */
export class InspectorReadingSession {
  private scope: string | null = null;
  private position: ReadingPosition | null = null;

  enter(scope: string) {
    if (scope !== this.scope) { this.scope = scope; this.position = null; }
  }
  read(scope: string) { return scope === this.scope ? this.position : null; }
  save(scope: string, position: ReadingPosition) {
    if (scope === this.scope) this.position = position;
  }
}

export interface InspectorReadingContext {
  session: InspectorReadingSession;
  scope: string;
}

function landmarks(owner: HTMLElement) {
  const counts = new Map<string, number>();
  return Array.from(owner.querySelectorAll<HTMLElement>("h3, h4, dt, legend, label, summary")).flatMap(node => {
    if (node.closest("[hidden], [inert]") || !node.getClientRects().length) return [];
    // A label's first text node excludes option/value text and generated IDs.
    const text = (node.tagName === "LABEL" ? node.firstChild?.textContent : node.textContent)?.trim();
    if (!text) return [];
    const key = JSON.stringify([node.tagName, text]);
    const occurrence = counts.get(key) ?? 0;
    counts.set(key, occurrence + 1);
    return [{ node, tag: node.tagName, text, occurrence }];
  });
}

function capture(owner: HTMLElement): ReadingPosition {
  const bounds = owner.getBoundingClientRect();
  const anchor = landmarks(owner).find(({ node }) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bounds.top && rect.top < bounds.bottom;
  });
  return { top: owner.scrollTop, width: owner.clientWidth, height: owner.clientHeight, landmark: anchor ? {
    tag: anchor.tag, text: anchor.text, occurrence: anchor.occurrence,
    offset: anchor.node.getBoundingClientRect().top - bounds.top,
  } : null };
}

/** Restore only the initial remount; connected updates retain their D190 owner. */
export function useInspectorReadingPosition(
  ref: RefObject<HTMLDivElement | null>, context: InspectorReadingContext | undefined,
) {
  const session = context?.session, scope = context?.scope;
  useLayoutEffect(() => {
    const owner = ref.current;
    if (!owner || !session || scope === undefined) return;
    const bookmark = session.read(scope);
    let pending = !!bookmark && bookmark.top > 0;
    let resize: ResizeObserver | undefined, mutations: MutationObserver | undefined;
    const stop = () => { pending = false; resize?.disconnect(); mutations?.disconnect(); };
    const attempt = () => {
      if (!pending || !bookmark || !owner.isConnected) return;
      const landmark = bookmark.landmark;
      const anchor = landmark ? landmarks(owner).find(item => item.tag === landmark.tag
        && item.text === landmark.text && item.occurrence === landmark.occurrence) : undefined;
      const target = anchor && landmark
        ? owner.scrollTop + anchor.node.getBoundingClientRect().top - owner.getBoundingClientRect().top - landmark.offset
        : bookmark.top;
      owner.scrollTop = Math.max(0, target);
      owner.dataset.inspectorReadingResumed = owner.scrollTop > 0 ? "true" : "false";
      if ((!landmark || anchor) && Math.abs(owner.scrollTop - Math.max(0, target)) <= 1) stop();
    };
    delete owner.dataset.inspectorReadingResumed;
    // Resume intent also covers short loading content that cannot scroll yet.
    // Compact opening focus must remain visible when that content later grows.
    owner.dataset.inspectorReadingResume = pending ? "true" : "false";
    if (pending) {
      attempt();
      if (pending) {
        resize = new ResizeObserver(attempt);
        resize.observe(owner);
        for (const body of owner.querySelectorAll(".inspector-body")) resize.observe(body);
        mutations = new MutationObserver(attempt);
        mutations.observe(owner, { childList: true, characterData: true, subtree: true });
      }
    } else owner.scrollTop = 0;
    const save = () => { if (!pending) session.save(scope, capture(owner)); };
    const userIntent = () => { stop(); save(); };
    owner.addEventListener("scroll", save);
    owner.addEventListener("focusin", userIntent);
    for (const name of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
      owner.addEventListener(name, userIntent, { capture: true, passive: true });
    }
    return () => {
      const last = session.read(scope);
      // A collapsing host can resize this DOM before React removes its child.
      // Retain the last measured reading geometry instead of that transient reflow.
      const hostChanged = last && (last.width !== owner.clientWidth || last.height !== owner.clientHeight);
      session.save(scope, pending && bookmark ? bookmark : hostChanged ? last : capture(owner));
      stop(); owner.removeEventListener("scroll", save);
      owner.removeEventListener("focusin", userIntent);
      for (const name of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
        owner.removeEventListener(name, userIntent, true);
      }
    };
  }, [ref, session, scope]);
}
