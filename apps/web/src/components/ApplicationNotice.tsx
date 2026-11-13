import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export type NoticeLifetime = "transient" | "persistent";
export interface ApplicationNoticeValue {
  kind: "success" | "error";
  text: string;
  lifetime?: NoticeLifetime;
}

/** One application-owned notice; molecular and vendor status displays stay separate. */
export function ApplicationNotice({ notice, setNotice }: {
  notice: ApplicationNoticeValue | null;
  setNotice: Dispatch<SetStateAction<ApplicationNoticeValue | null>>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const message = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const expired = useRef<ApplicationNoticeValue | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = message.current;
    if (!element) return;
    element.scrollTop = 0;
    const measure = () => setScrollable(element.scrollHeight > element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [notice]);

  useEffect(() => {
    expired.current = null;
    if (!notice) returnFocus.current = null;
    if (!notice || notice.kind === "error" || notice.lifetime === "persistent") return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      expired.current = notice;
      if (!root.current?.contains(document.activeElement)) {
        setNotice(current => current === notice ? null : current);
      }
    }, 10_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      expired.current = null;
    };
  }, [notice, setNotice]);

  if (!notice) return null;
  return <div
    ref={root}
    className={`notice ${notice.kind}`}
    role={notice.kind === "error" ? "alert" : "status"}
    onFocus={event => {
      if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) {
        returnFocus.current = event.relatedTarget;
      }
    }}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget) && expired.current === notice) {
        setNotice(current => current === notice ? null : current);
      }
    }}
  >
    <div ref={message} className={`notice-message${scrollable ? " is-scrollable" : ""}`} role={scrollable ? "region" : undefined}
      aria-label={scrollable ? "Message details" : undefined} tabIndex={scrollable ? 0 : undefined}>
      {notice.text}
    </div>
    <button type="button" aria-label="Dismiss message" onClick={() => {
      if (root.current?.contains(document.activeElement)) {
        const previous = returnFocus.current;
        // A modal owns focus while open. Never restore focus behind it.
        const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"][data-state="open"]');
        const usable = previous?.isConnected && previous !== document.body && !previous.closest('[inert], [hidden], [aria-hidden="true"]')
          && !previous.matches(":disabled") && (!dialog || dialog.contains(previous));
        const fallback = (dialog ?? document.querySelector(".topbar"))
          ?.querySelector<HTMLElement>('button:not(:disabled):not([aria-disabled="true"])');
        (usable ? previous : fallback)?.focus();
      }
      setNotice(current => current === notice ? null : current);
    }}>Close</button>
  </div>;
}
