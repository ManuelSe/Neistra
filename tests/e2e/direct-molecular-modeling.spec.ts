import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";

async function selectPair(page: Page, entry: string, ids: number[], mobile: boolean) {
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

async function bonds(page: Page, entry: string) {
  return page.evaluate(async id => {
    const path = "/src/test/modelingHarness.ts";
    const { displayedBonds } = await import(/* @vite-ignore */ path);
    return displayedBonds(window.interactionEngines.at(-1)!, id);
  }, entry);
}

async function observe(page: Page) {
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.length ?? 0)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const path = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ path);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
    await window.editingPicks.settled();
  });
}

test("breaks an aromatic bond and keeps the incomplete draft visible and pickable", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const imported = await request.post("/api/v1/projects/import-archive", { multipart: {
    operation_id: `direct-aromatic-${Date.now()}`,
    file: { name: "paracetamol.molweave.zip", mimeType: "application/vnd.molweave.project+zip", buffer: await readFile("tests/fixtures/modeling/paracetamol-orphan-h.molweave.zip") },
  } });
  expect(imported.status()).toBe(201);
  let project = (await imported.json()).project as Project;
  project = await (await request.patch(`/api/v1/projects/${project.id}`, { data: {
    expected_revision: project.revision, name: `Aromatic draft ${info.project.name} ${Date.now()}`,
  } })).json() as Project;
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst modelMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await modelMount.call(this,target); (window.interactionEngines ??= []).push(this); };` });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}/entries/${entry.id}/structure`;
  const before = (await (await request.get(path)).json() as StructureProjection).structure;
  const bond = before.bonds.find(b => b.aromatic)!;
  const pair = [bond.atom_1_id, bond.atom_2_id].sort((a, b) => a - b);
  await observe(page);
  expect(await bonds(page, entry.id)).toContainEqual(pair);
  await selectPair(page, entry.id, pair, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Bonds", exact: true }).click();
  await panel.getByRole("button", { name: "Break bond", exact: true }).click();
  await expect.poll(async () => (await (await request.get(path)).json() as StructureProjection).structure.bonds.some(b => b.id === bond.id)).toBe(false);
  await expect.poll(async () => await bonds(page, entry.id)).not.toContainEqual(pair);
  const after = (await (await request.get(path)).json() as StructureProjection).structure;
  expect(after.atoms).toEqual(before.atoms);
  expect(after.bonds).toEqual(before.bonds.filter(b => b.id !== bond.id));
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  await observe(page);
  const atom = before.atoms.find(a => a.element === "O")!;
  const point = await page.evaluate(p => window.editingPicks.point(p), atom.coordinates);
  await page.locator(".molstar-host canvas").first().click({ position: point });
  await expect.poll(() => page.evaluate(() => window.editingPicks.events.flatMap(e => e.selection?.atoms ?? []).map(a => a.atom_id))).toContain(atom.id);
  await page.screenshot({ path: info.outputPath("incomplete-aromatic-draft.png") });
});

test("removes a native inferred protein bond durably and restores it on Undo", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, ["tests/fixtures/formats/protein_editing.pdb"], "Inferred bond draft");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}/entries/${entry.id}/structure`;
  const before = (await (await request.get(path)).json() as StructureProjection).structure;
  await observe(page);
  const pair = (await bonds(page, entry.id)).find(pair => !before.bonds.some(b => [b.atom_1_id, b.atom_2_id].sort((a, b) => a - b).join(":") === pair.join(":")))!;
  expect(pair).toBeDefined();
  await selectPair(page, entry.id, pair, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Bonds", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Break bond", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Break bond", exact: true }).click();
  await expect.poll(async () => await bonds(page, entry.id)).not.toContainEqual(pair);
  const after = (await (await request.get(path)).json() as StructureProjection).structure;
  expect(after.atoms).toEqual(before.atoms);
  expect(after.bonds).toEqual(before.bonds);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await observe(page);
  expect(await bonds(page, entry.id)).not.toContainEqual(pair);
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => await bonds(page, entry.id)).toContainEqual(pair);
  expect((await (await request.get(path)).json() as StructureProjection).structure).toEqual(before);
  await page.screenshot({ path: info.outputPath("native-inferred-removal-undo.png") });
});
