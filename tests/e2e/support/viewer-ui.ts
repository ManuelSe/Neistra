import { expect, type Page } from "@playwright/test";

export const nativeUiSelector = [
  ".msp-viewport-controls", ".msp-viewport-controls-panel", ".msp-viewport-top-left-controls",
  ".msp-selection-viewport-controls", ".msp-animation-viewport-controls", ".msp-traj-controls",
  ".msp-state-snapshot-viewport-controls", ".msp-snapshot-description-wrapper",
  ".msp-highlight-info", ".msp-highlight-toast-wrapper", ".msp-toast-container", ".msp-toast-entry",
  ".msp-background-tasks", ".msp-overlay-tasks", ".msp-task-state", ".msp-drag-drop-overlay",
  ".msp-logo", ".msp-no-webgl", ".msp-plugin-init-error",
].join(", ");

declare global { interface Window { nativeUiAppearances: string[] } }

export async function watchNativeUi(page: Page) {
  await page.addInitScript(selector => {
    window.nativeUiAppearances = [];
    const inspect = (node: Node) => {
      if (!(node instanceof Element)) return;
      for (const found of [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]) {
        window.nativeUiAppearances.push(found.className);
      }
    };
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) inspect(node);
    }).observe(document, { childList: true, subtree: true });
  }, nativeUiSelector);
}

export async function expectApplicationViewer(page: Page, mounted = true) {
  await expect(page.locator(nativeUiSelector)).toHaveCount(0);
  expect(await page.evaluate(() => window.nativeUiAppearances)).toEqual([]);
  const viewer = page.getByRole("region", { name: "3D molecular viewer", exact: true });
  if (mounted) await expect(viewer).toBeVisible();
  else await expect(viewer).toHaveCount(0);
}
