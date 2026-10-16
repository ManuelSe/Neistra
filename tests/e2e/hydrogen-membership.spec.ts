import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import type { observeEditPicks } from "../../apps/web/src/test/molecularEditHarness";

declare global { interface Window { editingPicks: Awaited<ReturnType<typeof observeEditPicks>> } }

test("keeps bonded orphan H in the ligand and enables editing an unrelated native atom", async ({ page, request }, info) => {
  test.setTimeout(90000);
  const response = await request.post("/api/v1/projects/import-archive", { multipart: {
    operation_id: `orphan-h-${Date.now()}`,
    file: { name: "paracetamol.molweave.zip", mimeType: "application/vnd.molweave.project+zip", buffer: await readFile("tests/fixtures/modeling/paracetamol-orphan-h.molweave.zip") },
  } });
  expect(response.status()).toBe(201);
  let project = (await response.json()).project as Project;
  project = await (await request.patch(`/api/v1/projects/${project.id}`, { data: {
    expected_revision: project.revision, name: `Orphan H ${info.project.name} ${Date.now()}`,
  } })).json() as Project;
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const source = await route.fetch();
    await route.fulfill({ response: source, body: `${await source.text()}\nconst originalMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await originalMount.call(this,target); (window.interactionEngines ??= []).push(this); };` });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}/entries/${entry.id}`;
  const before: StructureProjection = await (await request.get(`${path}/structure`)).json();
  expect(before.hierarchy.components).toHaveLength(1);
  expect(before.structure.atoms.filter(atom => atom.residue_id === null)).toHaveLength(3);
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.length ?? 0)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
    await window.editingPicks.settled();
  });
  const target = before.structure.atoms.find(atom => atom.element === "O")!;
  const point = await page.evaluate(coordinates => window.editingPicks.point(coordinates), target.coordinates);
  await page.locator(".molstar-host canvas").first().click({ position: point });
  await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await expect(panel.getByRole("button", { name: "Replace selected atom with N", exact: true })).toBeEnabled();
  await expect(panel.getByText("Covalent bonds cross the component boundary.")).toHaveCount(0);
  const after: StructureProjection = await (await request.get(`${path}/structure`)).json();
  expect(after.structure).toEqual(before.structure);
  expect((await (await request.get(`/api/v1/projects/${project.id}`)).json()).revision).toBe(project.revision);
  await page.screenshot({ path: info.outputPath("orphan-h-enabled.png") });
});
