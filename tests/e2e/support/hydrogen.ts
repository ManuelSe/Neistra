import { expect, type Locator, type Page } from "@playwright/test";

/** Explicit entry scope, read-only proposal, then one command publication. */
export async function completeHydrogens(page: Page, panel: Locator = page.getByRole("dialog", { name: "Edit molecule", exact: true })) {
  if (!await panel.getByRole("button", { name: "Preview completion", exact: true }).isVisible()) {
    await panel.getByText("Hydrogen tools", { exact: true }).click();
  }
  await panel.getByRole("combobox", { name: "Completion scope", exact: true }).selectOption("entry");
  await panel.getByRole("button", { name: "Preview completion", exact: true }).click();
  await panel.getByRole("button", { name: "Placement tools", exact: true }).click();
  const apply = panel.getByRole("button", { name: "Apply placement", exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();
}
