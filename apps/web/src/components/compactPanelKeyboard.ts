import type { KeyboardEvent } from "react";

/** Keep the shared compact dialog's boundary keys inside its current controls. */
export function containCompactPanelTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab" || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
  const panel = event.currentTarget, target = event.target;
  if (!(target instanceof Element)
    || target.closest('[role="dialog"], [role="menu"], [role="listbox"]') !== panel) return;
  const controls = Array.from(panel.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, summary, a[href], area[href], [contenteditable="true"], [tabindex]',
  )).filter(node => node.tabIndex >= 0 && !node.matches(":disabled")
    && !node.closest("[hidden], [inert]")
    && node.closest('[role="dialog"], [role="menu"], [role="listbox"]') === panel
    && node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible");
  // Positive native tab indices precede the ordinary DOM-order stops.
  controls.sort((left, right) => (left.tabIndex > 0 ? left.tabIndex : Infinity)
    - (right.tabIndex > 0 ? right.tabIndex : Infinity) || 0);
  const first = controls[0], last = controls.at(-1), active = panel.ownerDocument.activeElement;
  if (!first || !last) { event.preventDefault(); panel.focus(); return; }
  const sequential = controls.some(node => node === active);
  const beforeFirst = !sequential && (active === panel || (active instanceof Node && !active.contains(first)
    && !!(active.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)));
  const afterLast = !sequential && active instanceof Node && !last.contains(active)
    && !!(last.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (event.shiftKey ? active === first || beforeFirst : active === last || afterLast) {
    event.preventDefault(); (event.shiftKey ? last : first).focus();
  }
}
