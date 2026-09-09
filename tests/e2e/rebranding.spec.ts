import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("uses the Neistra identity through project creation and import", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  const oldAssetRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.url().includes("molweave-mark")) oldAssetRequests.push(outgoing.url());
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Neistra");
  await expect(page.getByText("Shape molecular structure.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No project open" })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^Neistra is a local molecular workspace/);
  for (const link of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').all()) {
    const asset = await request.get((await link.getAttribute("href"))!);
    expect(asset.ok()).toBe(true);
    expect((await asset.body()).length).toBeGreaterThan(100);
  }
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    const visibleBrand = page.locator(`.topbar .brand-art-${theme}:visible`);
    await expect(visibleBrand).toHaveCount(1);
    expect(await visibleBrand.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`welcome-${theme}.png`) });
  }
  const projects = page.getByRole("button", { name: "Projects", exact: true });
  await projects.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Projects" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(projects).toBeFocused();
  await page.getByRole("main").getByRole("button", { name: "Create project" }).click();
  const create = page.getByRole("dialog", { name: "Create project" });
  const name = `Neistra identity ${testInfo.project.name} ${Date.now()}`;
  await create.getByLabel("Name", { exact: true }).fill(name);
  await create.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("empty-project.png") });
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const importer = page.getByRole("dialog", { name: "Import structures" });
  await importer.locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/complex/1stp.pdb"));
  await importer.getByRole("button", { name: "Import", exact: true }).click();
  await expect(importer).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 45_000 });
  await expect(page.locator(".molstar-host canvas").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace-dark.png") });
  await page.getByRole("button", { name: "Use light theme" }).click();
  await page.screenshot({ path: testInfo.outputPath("workspace-light.png") });
  expect(oldAssetRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
