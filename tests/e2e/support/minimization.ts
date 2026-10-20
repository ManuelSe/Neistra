import { readFile } from "node:fs/promises";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { NormalizedStructure, Project, Selection } from "../../../apps/web/src/api/types";

export async function prepared(page: Page, request: APIRequestContext, specimen = "isolated") {
  const imported = await request.post("/api/v1/projects/import-archive", { multipart: {
    operation_id: `min-${specimen}-${Date.now()}`, file: { name: `${specimen}.molweave.zip`, mimeType: "application/vnd.molweave.project+zip", buffer: await readFile(`tests/fixtures/minimization/${specimen}.molweave.zip`) },
  } });
  expect(imported.status()).toBe(201);
  let project = (await imported.json()).project as Project;
  project = await (await request.patch(`/api/v1/projects/${project.id}`, { data: { expected_revision: project.revision, name: `Minimization ${specimen} ${Date.now()}` } })).json() as Project;
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst minimizationMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await minimizationMount.call(this,target); (window.interactionEngines ??= []).push(this); };` });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText(`${project.entries.length} visible / ${project.entries.length} loaded`, { timeout: 30000 });
  return project;
}
export async function select(page: Page, atoms: Selection["atoms"], mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  const mode = page.getByRole("group", { name: "Operation mode" });
  await mode.getByRole("button", { name: "replace", exact: true }).click();
  for (const [index, atom] of atoms.entries()) {
    if (index) await mode.getByRole("button", { name: "add", exact: true }).click();
    await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${atom.structure_id}:${atom.atom_id}`);
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
  }
  await expect(page.locator(".viewer-status")).toContainText(`/ ${atoms.length} selected`);
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  await page.locator(".molstar-host canvas").first().focus();
}
export const current = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/projects/${id}`)).json()) as Project;
export async function structures(request: APIRequestContext, p: Project) {
  return Object.fromEntries(await Promise.all(p.entries.map(async e => [e.id, (await (await request.get(`/api/v1/projects/${p.id}/entries/${e.id}/structure`)).json()).structure as NormalizedStructure])));
}
export const panel = (page: Page) => page.getByRole("dialog", { name: "Minimize selection", exact: true });

export async function configure(page: Page) {
  const settings = panel(page).getByRole("button", { name: "Minimization settings", exact: true });
  await expect(settings).toBeEnabled({ timeout: 30000 });
  await settings.click();
  await expect(panel(page).getByRole("button", { name: "Run minimization", exact: true })).toBeEnabled({ timeout: 30000 });
}
