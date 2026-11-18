import { expect, type Page } from "@playwright/test";

async function inspector(page: Page) {
  const panel = page.getByRole("region", { name: "Project inspector", exact: true });
  if (!await panel.isVisible()) {
    const mobile = page.getByRole("button", { name: "Inspector", exact: true });
    const expand = page.getByRole("button", { name: "Expand inspector", exact: true });
    if (await mobile.isVisible()) await mobile.click();
    else if (await expand.isVisible()) await expand.click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

/** Deliberately enter the retained tools, including at actual zoom breakpoints. */
export async function openInspectorTools(page: Page) {
  const panel = await inspector(page), tabs = panel.getByRole("tablist", { name: "Inspector views", exact: true });
  if (!await tabs.isVisible()) await panel.getByRole("button", { name: "Inspector tools", exact: true }).click();
  await expect(tabs).toBeVisible();
}

/** Return to the current ligand presenter without retargeting its inspected entry. */
export async function openLigandInformation(page: Page) {
  const panel = await inspector(page), information = panel.getByRole("region", { name: "Ligand information", exact: true });
  if (!await information.isVisible()) await panel.getByRole("button", { name: "Ligand information", exact: true }).click();
  await expect(information).toBeVisible();
}

export async function showEntries(page: Page) {
  const tab = page.getByRole("tab", { name: "Entries", exact: true });
  if (await tab.isVisible()) await tab.click();
}

export async function browseComponents(page: Page, entryName: string) {
  await showEntries(page);
  await page.getByRole("button", { name: `Actions for ${entryName}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Components", exact: true }).click();
  await expect(page.locator(".component-parent")).toContainText(entryName);
  await expect(page.getByRole("region", { name: "Component browser", exact: true })
    .getByRole("heading", { name: "Components", exact: true })).toBeFocused();
}
