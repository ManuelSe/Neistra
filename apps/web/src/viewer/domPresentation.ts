/** Label the vendor's CSS-only attribution link, including later remounts. */
export function observeViewerAttribution(target: HTMLElement): () => void {
  const label = (node: Node) => {
    if (!(node instanceof Element)) return;
    const links = node.matches("a.msp-logo") ? [node] : node.querySelectorAll("a.msp-logo");
    for (const link of links) {
      link.setAttribute("aria-label", "Mol* molecular viewer (opens in a new tab)");
      link.setAttribute("rel", "noopener noreferrer");
    }
  };
  label(target);
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) label(node);
  });
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
}
