import type { KeyboardEvent } from "react";

export function activateTabFromKeyboard(event: KeyboardEvent<HTMLElement>): void {
  const current = event.target;
  if (!(current instanceof HTMLButtonElement) || current.getAttribute("role") !== "tab") {
    return;
  }
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
  );
  const currentIndex = tabs.indexOf(current);
  if (currentIndex < 0 || tabs.length === 0) return;

  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  }

  if (nextIndex === null) return;
  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}
