/** Accessible presentation for vendor attribution and otherwise unlabelled controls. */
export function observeViewerAttribution(target: HTMLElement): () => void {
  const label = (node: Node) => {
    if (!(node instanceof Element)) return;
    const links = node.matches("a.msp-logo") ? [node] : node.querySelectorAll("a.msp-logo");
    for (const link of links) {
      link.setAttribute("aria-label", "Mol* molecular viewer (opens in a new tab)");
      link.setAttribute("rel", "noopener noreferrer");
    }
    // Mol* renders these form labels as adjacent spans. Use the actual row
    // label without changing values, events, scientific colors or vendor source.
    const controls = node.matches("input, button.msp-combined-color-button")
      ? [node] : node.querySelectorAll("input, button.msp-combined-color-button");
    for (const control of controls) {
      if (!control.closest(".msp-viewport-controls-panel")
        || control.hasAttribute("aria-label") || control.hasAttribute("aria-labelledby")
        || control.hasAttribute("title") || control.closest("label")
        || (control instanceof HTMLInputElement && control.labels?.length)) continue;
      const rowLabel = control.closest(".msp-control-row")
        ?.querySelector(":scope > .msp-control-row-label")?.textContent?.trim();
      if (rowLabel) control.setAttribute("aria-label", rowLabel);
    }
  };
  label(target);
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) label(node);
  });
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
}
