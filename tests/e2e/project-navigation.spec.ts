import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import { browseComponents, showEntries } from "./support/navigation";

async function setup(page: Page, request: APIRequestContext, info: TestInfo) {
  const project = await (await request.post("/api/v1/projects", { data: { name: `Navigation ${info.project.name} ${Date.now()}` } })).json() as Project;
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const importer = page.getByRole("dialog", { name: "Import structures" });
  await importer.locator('input[type="file"]').setInputFiles([
    resolve("tests/fixtures/complex/component_hierarchy.pdb"), resolve("tests/fixtures/formats/ethanol.mol"),
  ]);
  await importer.getByRole("button", { name: "Import", exact: true }).click();
  await expect(importer).toBeHidden({ timeout: 30000 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 45000 });
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "Project browser", exact: true }).click();
  return await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
}

test("keeps compact entries independent from component expansion, selection and metadata", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await setup(page, request, info);
  const entry = project.entries.find(entry => entry.source_format === "pdb")!;
  const normalizedRequests: string[] = [];
  const mutations: string[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/structure")) normalizedRequests.push(request.url());
    if (["POST", "PATCH", "DELETE"].includes(request.method())) mutations.push(request.url());
  });
  const baseline = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const entryList = page.getByLabel("Project structures", { exact: true });
  const beforeBounds = await entryList.boundingBox();
  await browseComponents(page, entry.name);
  await expect(page.locator(".hierarchy-category").first()).toBeVisible();
  await expect(page.locator(".viewer-status")).toContainText("/ 0 selected");
  const protein = page.locator(".hierarchy-category").filter({ has: page.locator("summary span", { hasText: /^Protein$/ }) });
  await protein.locator("summary").click();
  await expect(protein.locator(".hierarchy-component").first()).toBeVisible();
  if (info.project.name === "chromium") expect(await entryList.boundingBox()).toEqual(beforeBounds);
  await page.getByLabel(`Select Protein in ${entry.name}`, { exact: true }).click();
  await expect(page.locator(".viewer-status")).not.toContainText("/ 0 selected");
  await expect(page.locator(".component-parent")).toContainText(entry.name);
  await showEntries(page);
  await page.getByPlaceholder("Search structures").fill("Ethanol");
  if (info.project.name === "mobile-chromium") await page.getByRole("tab", { name: "Components", exact: true }).click();
  await expect(page.getByText("Outside displayed entry list", { exact: true })).toBeVisible();
  await showEntries(page);
  await page.getByPlaceholder("Search structures").fill("");
  await page.getByRole("button", { name: `Actions for ${entry.name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Details", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Entry details" });
  await expect(details).toContainText(entry.original_filename!);
  await expect(details.getByText("Warnings", { exact: false }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: `Actions for ${entry.name}`, exact: true })).toBeFocused();
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(baseline);
  expect(normalizedRequests).toEqual([]);
  expect(mutations).toEqual([]);
  expect((await new AxeBuilder({ page }).include(".project-browser").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("navigation.png") });
});
