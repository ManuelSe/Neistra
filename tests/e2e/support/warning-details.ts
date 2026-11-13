import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../../apps/web/src/api/types";
import type { MolstarEngine } from "../../../apps/web/src/viewer/MolstarEngine";

declare global {
  interface Window {
    warningEngines: MolstarEngine[];
    refetchWarningProject: (projectId: string) => Promise<void>;
  }
}

export const warningTrigger = (page: Page) => page.getByRole("button", { name: /^Inspect \d+ warnings? for visible structures$/ });
export const warningDialog = (page: Page) => page.getByRole("dialog", { name: "Structure warnings", exact: true });

export async function readWarningProject(request: APIRequestContext, id: string): Promise<Project> {
  const response = await request.get(`/api/v1/projects/${id}`);
  expect(response.status()).toBe(200);
  return response.json();
}

export async function openWarningProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true })
    .getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

export async function prepareWarningProject(page: Page, request: APIRequestContext, label = "Warning details") {
  // Expose observation/refetch seams only in the browser-test response, never in
  // production sources. Refetch exercises the real application query ownership.
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
const warningMount = MolstarEngine.prototype.mount;
MolstarEngine.prototype.mount = async function(target) {
  await warningMount.call(this, target);
  (window.warningEngines ??= []).push(this);
};` });
  });
  await page.route("**/src/workspace.tsx*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
window.refetchWarningProject = projectId => queryClient.invalidateQueries({ queryKey: ["project", projectId] });` });
  });
  const created = await request.post("/api/v1/projects", { data: { name: `${label} ${Date.now()}` } });
  expect(created.status()).toBe(201);
  let project: Project = await created.json();
  for (const [filename, fixture] of [
    ["first-protein.pdb", "protein_models_altloc.pdb"],
    ["second-protein.pdb", "protein_models_altloc.pdb"],
    ["ethanol.mol", "ethanol.mol"],
  ]) {
    const imported = await request.post(`/api/v1/projects/${project.id}/imports`, {
      multipart: { expected_revision: String(project.revision), files: {
        name: filename, mimeType: "chemical/x-pdb", buffer: readFileSync(resolve("tests/fixtures/formats", fixture)),
      } },
    });
    expect(imported.status()).toBe(201);
    project = (await imported.json()).project as Project;
  }
  await page.goto("/");
  await openWarningProject(page, project.name);
  await expect(page.locator(".viewer-status")).toContainText("3 visible / 3 loaded", { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.warningEngines?.length ?? 0)).toBeGreaterThan(0);
  return readWarningProject(request, project.id);
}

export async function inspectWarningScene(page: Page, project: Project) {
  return page.evaluate(async entryIds => {
    const { inspectInteractiveTransform } = await import("/src/test/interactiveTransformHarness.ts");
    return {
      mounts: window.warningEngines.length,
      entries: entryIds.map(id => inspectInteractiveTransform(window.warningEngines.at(-1)!, id)),
    };
  }, project.entries.map(entry => entry.id));
}

export async function stableWarningScene(page: Page, project: Project) {
  let previous = await inspectWarningScene(page, project);
  await expect.poll(async () => {
    const current = await inspectWarningScene(page, project);
    const stable = JSON.stringify(previous) === JSON.stringify(current);
    previous = current;
    return stable;
  }).toBe(true);
  return previous;
}

export async function warningMolecularSnapshot(request: APIRequestContext, project: Project) {
  const result: { id: string; projection: StructureProjection; original: string }[] = [];
  for (const entry of project.entries) {
    const structure = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`);
    expect(structure.status()).toBe(200);
    const original = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`);
    expect(original.status()).toBe(200);
    result.push({ id: entry.id, projection: await structure.json(), original: (await original.body()).toString("base64") });
  }
  return result;
}

export async function expectWarningRows(page: Page, project: Project) {
  const entries = project.entries.filter(entry => entry.visible && entry.warnings.length);
  const count = entries.reduce((total, entry) => total + entry.warnings.length, 0);
  await expect(warningTrigger(page)).toHaveAccessibleName(`Inspect ${count} ${count === 1 ? "warning" : "warnings"} for visible structures`);
  const dialog = warningDialog(page);
  await expect(dialog).toHaveAttribute("aria-modal", "false");
  await expect(dialog.locator(".viewer-warning-group")).toHaveCount(entries.length);
  await expect(dialog.locator("li")).toHaveCount(count);
  await expect(dialog.locator(".viewer-warning-message")).toHaveText(entries.flatMap(entry => entry.warnings.map(warning => warning.message)));
  for (const entry of entries) {
    const group = dialog.locator(`[data-warning-entry-id="${entry.id}"]`);
    await expect(group.getByRole("heading", { name: entry.name, exact: true })).toBeVisible();
    await expect(group.locator(".viewer-warning-severity")).toHaveText(entry.warnings.map(warning => ({ info: "Info", warning: "Warning", error: "Error" })[warning.severity]));
  }
}

export async function refreshWarningProject(page: Page, request: APIRequestContext, id: string) {
  await page.evaluate(id => window.refetchWarningProject(id), id);
  return readWarningProject(request, id);
}
