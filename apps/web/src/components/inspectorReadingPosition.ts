import { useLayoutEffect, type RefObject } from "react";
import type { InspectorPublications } from "./inspectorPublications";

interface Landmark {
  tag: string;
  text: string;
  occurrence: number;
  offset: number;
}
export interface ReadingPosition { top: number; width: number; height: number; landmark: Landmark | null }

/** One current presentation visit, independent of molecular or persisted state. */
export class InspectorReadingSession {
  private scope: string | null = null;
  private position: ReadingPosition | null = null;
  private hold: symbol | null = null;

  enter(scope: string) {
    if (scope !== this.scope) { this.scope = scope; this.position = null; this.hold = null; }
  }
  read(scope: string) { return scope === this.scope ? this.position : null; }
  save(scope: string, position: ReadingPosition) {
    if (scope === this.scope && !this.hold) this.position = position;
  }
  retain(scope: string, token: symbol, position: ReadingPosition) {
    if (scope !== this.scope) return false;
    this.hold = token; this.position = position; return true;
  }
  transfer(from: string, to: string, token: symbol) {
    if (from !== this.scope || this.hold !== token) return false;
    this.scope = to; return true;
  }
  held(scope: string) { return scope === this.scope && this.hold !== null; }
  owns(token: symbol) { return this.hold === token; }
  release(token: symbol) { if (this.hold === token) this.hold = null; }
  cancel(scope: string) { if (scope === this.scope) this.hold = null; }
}

export interface InspectorReadingContext {
  session: InspectorReadingSession;
  scope: string;
  /** Only a continuously mounted presenter may bridge an artifact-only change. */
  continuityKey?: string;
  isPending?: () => boolean;
  publications?: InspectorPublications;
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

export function captureInspectorReadingPosition(owner: HTMLElement, preferred?: Landmark | null): ReadingPosition {
  const bounds = owner.getBoundingClientRect();
  const visible = landmarks(owner).filter(({ node }) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bounds.top && rect.top < bounds.bottom;
  });
  const anchor = (preferred && visible.find(item => item.tag === preferred.tag
    && item.text === preferred.text && item.occurrence === preferred.occurrence)) || visible[0];
  return { top: owner.scrollTop, width: owner.clientWidth, height: owner.clientHeight, landmark: anchor ? {
    tag: anchor.tag, text: anchor.text, occurrence: anchor.occurrence,
    offset: anchor.node.getBoundingClientRect().top - bounds.top,
  } : null };
}

export function inspectorReadingTarget(owner: HTMLElement, bookmark: ReadingPosition) {
  const landmark = bookmark.landmark;
  const anchor = landmark ? landmarks(owner).find(item => item.tag === landmark.tag
    && item.text === landmark.text && item.occurrence === landmark.occurrence) : undefined;
  return { found: !landmark || !!anchor, top: anchor && landmark
    ? owner.scrollTop + anchor.node.getBoundingClientRect().top - owner.getBoundingClientRect().top - landmark.offset
    : bookmark.top };
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
    const connectedHold = session.held(scope);
    let pending = !connectedHold && !!bookmark && bookmark.top > 0;
    let resize: ResizeObserver | undefined, mutations: MutationObserver | undefined;
    const stop = () => { pending = false; resize?.disconnect(); mutations?.disconnect(); };
    const attempt = () => {
      if (!pending || !bookmark || !owner.isConnected) return;
      const { top: target, found } = inspectorReadingTarget(owner, bookmark);
      owner.scrollTop = Math.max(0, target);
      owner.dataset.inspectorReadingResumed = owner.scrollTop > 0 ? "true" : "false";
      if (found && Math.abs(owner.scrollTop - Math.max(0, target)) <= 1) {
        stop(); session.save(scope, captureInspectorReadingPosition(owner, bookmark.landmark));
      }
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
    } else if (!connectedHold) owner.scrollTop = 0;
    const save = () => {
      if (pending || session.held(scope)) return;
      const last = session.read(scope);
      // Resizing can emit browser scroll anchoring before the presenter retires.
      // Keep its previous reading point until restoration or deliberate input.
      if (last && (last.width !== owner.clientWidth || last.height !== owner.clientHeight)) return;
      session.save(scope, captureInspectorReadingPosition(owner, last?.top === owner.scrollTop ? last.landmark : undefined));
    };
    const userIntent = () => { stop(); session.cancel(scope); session.save(scope, captureInspectorReadingPosition(owner)); };
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
      session.save(scope, pending && bookmark ? bookmark : hostChanged ? last
        : captureInspectorReadingPosition(owner, last?.top === owner.scrollTop ? last.landmark : undefined));
      stop(); owner.removeEventListener("scroll", save);
      owner.removeEventListener("focusin", userIntent);
      for (const name of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
        owner.removeEventListener(name, userIntent, true);
      }
    };
  }, [ref, session, scope]);
}
