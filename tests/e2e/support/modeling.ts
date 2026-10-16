import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Project } from "../../../apps/web/src/api/types";

export async function selectPair(page: Page, entry: string, ids: number[], mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  const mode = page.getByRole("group", { name: "Operation mode" });
  await mode.getByRole("button", { name: "replace", exact: true }).click();
  for (const [index, id] of ids.entries()) {
    if (index) await mode.getByRole("button", { name: "add", exact: true }).click();
    await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry}:${id}`);
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
    await expect(page.locator(".viewer-status")).toContainText(`/ ${index + 1} selected`);
  }
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
}

export async function bonds(page: Page, entry: string) {
  return page.evaluate(async id => {
    const path = "/src/test/modelingHarness.ts";
    const { displayedBonds } = await import(/* @vite-ignore */ path);
    return displayedBonds(window.interactionEngines.at(-1)!, id);
  }, entry);
}

export async function observe(page: Page) {
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.length ?? 0)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const path = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ path);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
    await window.editingPicks.settled();
  });
}


export async function previewState(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/test/modelingHarness.ts";
    const { inspectModelPreview } = await import(/* @vite-ignore */ path);
    return inspectModelPreview(window.interactionEngines.at(-1)!);
  });
}

export async function newEmptyProject(page: Page, request: APIRequestContext) {
  const project = await (await request.post("/api/v1/projects", { data: { name: `Molecule from scratch ${Date.now()}` } })).json() as Project;
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst buildingMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await buildingMount.call(this,target); (window.interactionEngines ??= []).push(this); };` });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  return project;
}

