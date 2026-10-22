import { type Locator, type Page } from "@playwright/test";

/** Immediate +H through the real primary workflow, including held-response tests. */
export async function addOneHydrogen(page: Page, panel: Locator = page.getByRole("dialog", { name: "Edit molecule", exact: true })) {
  await panel.getByRole("button", { name: "Add hydrogen (+H)", exact: true }).click();
}
