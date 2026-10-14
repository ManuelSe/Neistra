import { expect, type Page } from "@playwright/test";

export async function showEntries(page: Page) {
  const tab = page.getByRole("tab", { name: "Entries", exact: true });
  if (await tab.isVisible()) await tab.click();
}

export async function browseComponents(page: Page, entryName: string) {
  await showEntries(page);
  await page.getByRole("button", { name: `Actions for ${entryName}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Components", exact: true }).click();
  await expect(page.locator(".component-parent")).toContainText(entryName);
}
