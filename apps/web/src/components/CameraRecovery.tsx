import { Camera, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { WorkspacePresentationController } from "../workspacePresentation/controller";
import type { WorkspacePresentationSnapshot } from "../workspacePresentation/types";

type ProblemKind = NonNullable<WorkspacePresentationSnapshot["problem"]>;
interface Issue { owner: WorkspacePresentationController; kind: ProblemKind; message: string | null }
interface PendingAction { owner: WorkspacePresentationController; issue: Issue }
const labels: Record<ProblemKind, string> = {
  save: "View not saved",
  conflict: "Saved view changed elsewhere",
  recovery: "View recovery unavailable",
  display: "View unavailable. Adjust the view or use Fit.",
};

function restoreWorkspaceFocus(previous: Element | null) {
  const active = document.activeElement;
  if (active && active !== document.body && active !== previous) return;
  const modal = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')]
    .some(element => element.dataset.state !== "closed" && !element.closest('[hidden], [inert], [aria-hidden="true"]')
      && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden");
  if (modal) return;
  for (const selector of ['[data-movement-canvas]', 'button[aria-label="Fit all visible"]', 'button[aria-label="Projects"]']) {
    for (const target of document.querySelectorAll<HTMLElement>(selector)) {
      if (!target.isConnected || target.matches(':disabled, [aria-disabled="true"]') || target.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
      if (getComputedStyle(target).display === "none" || getComputedStyle(target).visibility === "hidden") continue;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
  }
}

/** Installation-wide recovery; routine camera navigation and successful saves stay quiet. */
export function CameraRecovery({ cameraPresentation }: { cameraPresentation: WorkspacePresentationController }) {
  const readStatus = useMemo(() => {
    let selected: Pick<WorkspacePresentationSnapshot, "status" | "problem" | "message"> | undefined;
    return () => {
      const value = cameraPresentation.getSnapshot();
      if (!selected || selected.status !== value.status || selected.problem !== value.problem || selected.message !== value.message) {
        selected = { status: value.status, problem: value.problem, message: value.message };
      }
      return selected;
    };
  }, [cameraPresentation]);
  const snapshot = useSyncExternalStore(cameraPresentation.subscribe, readStatus, readStatus);
  const currentIssue = useMemo<Issue | null>(() => snapshot.problem
    ? { owner: cameraPresentation, kind: snapshot.problem, message: snapshot.message } : null,
  [cameraPresentation, snapshot.problem, snapshot.message]);
  const [retained, setRetained] = useState<Issue | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [failure, setFailure] = useState<Issue | null>(null);
  const gate = useRef<PendingAction | null>(null);
  const mounted = useRef(true);
  const root = useRef<HTMLDivElement | null>(null);
  const activePending = pending?.owner === cameraPresentation ? pending : null;
  const retainedIssue = retained?.owner === cameraPresentation ? retained : null;
  const failedIssue = failure?.owner === cameraPresentation ? failure : null;
  const busy = Boolean(activePending) || snapshot.status === "saving";
  const issue = activePending?.issue ?? (busy ? retainedIssue ?? currentIssue : currentIssue ?? failedIssue);
  const shown = Boolean(issue);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!busy || !retainedIssue) setRetained(currentIssue);
  }, [busy, retainedIssue, currentIssue]);
  const bindRoot = useCallback((element: HTMLDivElement | null) => {
    if (!element && root.current?.contains(document.activeElement)) {
      const previous = document.activeElement;
      queueMicrotask(() => restoreWorkspaceFocus(previous));
    }
    root.current = element;
  }, []);
  useLayoutEffect(() => {
    const element = root.current;
    if (!shown || !element) return;
    const style = document.documentElement.style, property = "--camera-recovery-height";
    const previous = style.getPropertyValue(property), priority = style.getPropertyPriority(property);
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      if (Number.isFinite(height)) style.setProperty(property, `${Math.max(0, height)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => {
      observer.disconnect();
      if (previous) style.setProperty(property, previous, priority); else style.removeProperty(property);
    };
  }, [shown]);
  if (!issue) return null;
  const conflict = issue.kind === "conflict";
  return <div ref={bindRoot} className="camera-recovery" role="status" aria-live="polite" aria-atomic="true" data-problem={issue.kind}>
    {busy ? <LoaderCircle size={17} className="camera-recovery-spinner" aria-hidden="true" /> : <Camera size={17} aria-hidden="true" />}
    <span className="camera-recovery-message">{busy ? "Saving view…" : labels[issue.kind]}</span>
    {!busy && issue.message ? <span className="sr-only">{issue.message}</span> : null}
    <button type="button" aria-label={conflict ? "Save current view" : "Retry saving view"} aria-disabled={busy}
      onClick={() => {
        if (busy || gate.current?.owner === cameraPresentation) return;
        const action = { owner: cameraPresentation, issue };
        gate.current = action; setPending(action); setFailure(null);
        void Promise.resolve().then(() => conflict ? cameraPresentation.saveCurrentView() : cameraPresentation.retry())
          .catch(() => { if (mounted.current && gate.current === action) setFailure({ ...issue, message: "View recovery could not be confirmed. Try again." }); })
          .finally(() => {
            if (gate.current === action) gate.current = null;
            if (mounted.current) setPending(current => current === action ? null : current);
          });
      }}>
      {conflict ? "Save current view" : "Retry"}
    </button>
  </div>;
}
