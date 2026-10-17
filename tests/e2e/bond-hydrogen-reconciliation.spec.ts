import AxeBuilder from "@axe-core/playwright";
import { cyanPixels } from "./support/interactions";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { newEmptyProject, observe, previewState, selectPair } from "./support/modeling";

async function seed(page: Parameters<typeof newEmptyProject>[0], request: Parameters<typeof newEmptyProject>[1]) {
  const project = await newEmptyProject(page, request);
  const source = readFileSync("tests/fixtures/hydrogens/butane-reconciliation.mol");
  const response = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
    expected_revision: String(project.revision), generate_3d: "false", infer_bonds: "false",
    files: { name: "butane.mol", mimeType: "chemical/x-mdl-molfile", buffer: source },
  } });
  expect(response.ok()).toBe(true);
  const current = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await observe(page);
  return { project: current, entry: current.entries[0], source };
}

test("immediately reconciles bond closure, restores exact Undo/Redo, and offers Preserve H", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const { project, entry, source } = await seed(page, request);
  const path = `/api/v1/projects/${project.id}`;
  const getStructure = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json() as StructureProjection).structure;
  const before = await getStructure();
  await selectPair(page, entry.id, [1,4], info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Bonds", exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Bond hydrogens" })).toHaveValue("reconcile_if_possible");
  await panel.getByRole("button", { name: "Create bond", exact: true }).click();
  await expect(panel.getByLabel("Hydrogen reconciliation report")).toContainText("2 removed, 4 moved");
  const after = await getStructure();
  expect(after.atoms).toHaveLength(12);
  expect(after.atoms.filter(a => a.element !== "H")).toEqual(before.atoms.filter(a => a.element !== "H"));
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  await page.getByRole("button", { name: /^Undo: Assign bond order/ }).click();
  await expect.poll(getStructure).toEqual(before);
  await page.getByRole("button", { name: /^Redo: Assign bond order/ }).click();
  await expect.poll(getStructure).toEqual(after);
  await page.getByRole("button", { name: /^Undo: Assign bond order/ }).click();
  await expect.poll(getStructure).toEqual(before);
  await selectPair(page, entry.id, [1,4], info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("combobox", { name: "Bond hydrogens" }).selectOption("preserve");
  await panel.getByRole("button", { name: "Create bond", exact: true }).click();
  await expect.poll(async () => (await getStructure()).bonds.length).toBe(before.bonds.length + 1);
  expect((await getStructure()).atoms).toEqual(before.atoms);
  expect((await getStructure()).conformers).toEqual(before.conformers);
  expect(Buffer.from(await (await request.get(`${path}/entries/${entry.id}/original`)).body())).toEqual(source);
});

test("optional native preview shows H movements/removals without publication and cancels cleanly", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const { project, entry } = await seed(page, request);
  const path = `/api/v1/projects/${project.id}`;
  await selectPair(page, entry.id, [1,4], info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Bonds", exact: true }).click();
  await panel.getByRole("checkbox", { name: "Preview changes before applying" }).check();
  await panel.getByRole("button", { name: "Create bond", exact: true }).click();
  await expect.poll(async () => (await previewState(page)).preview?.removed_atoms?.length ?? 0).toBe(2);
  const ghost = await previewState(page);
  expect(ghost.preview?.moved_atoms).toHaveLength(4);
  expect(ghost.objects.length).toBeGreaterThan(0);
  expect(ghost.objects.every(o => !o.pickable && o.drawCount > 0)).toBe(true);
  expect(ghost.canonicalAtoms).toHaveLength(14);
  expect((await (await request.get(path)).json()).revision).toBe(project.revision);
  await page.screenshot({ path: info.outputPath("bond-h-preview.png") });
  await panel.getByRole("button", { name: "Cancel placement", exact: true }).click();
  await expect.poll(async () => (await previewState(page)).preview).toBeNull();
  expect((await (await request.get(path)).json()).revision).toBe(project.revision);
  await panel.getByRole("button", { name: "Create bond", exact: true }).click();
  await panel.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await (await request.get(path)).json()).revision).toBe(project.revision + 1);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  const retained = (await (await request.get(`${path}/entries/${entry.id}/structure`)).json() as StructureProjection).structure;
  expect(retained.atoms).toHaveLength(12);
});


test("keeps bond policy and H changes accessible in both themes and narrow layouts", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const { entry } = await seed(page, request);
  await selectPair(page, entry.id, [1,4], info.project.name === "mobile-chromium");
  if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Bonds", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Use ${theme} theme`, exact: true }).click();
    const policy = panel.getByRole("combobox", { name: "Bond hydrogens" });
    await policy.focus(); await expect(policy).toBeFocused();
    expect(await policy.evaluate(node => { const box = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(box.x + box.width/2, box.y + box.height/2)); })).toBe(true);
    const bounds = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await panel.getByRole("checkbox", { name: "Preview changes before applying" }).check();
    await panel.getByRole("button", { name: "Create bond", exact: true }).click();
    await expect.poll(async () => (await previewState(page)).preview?.removed_atoms?.length ?? 0).toBe(2);
    await expect.poll(() => cyanPixels(page)).toBeGreaterThan(20);
    for (const control of await panel.getByRole("button").all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      await control.focus(); await expect(control).toBeFocused();
      expect(await control.evaluate(node => { const box = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(box.x + box.width/2,box.y + box.height/2)); })).toBe(true);
    }
    await panel.getByRole("button", { name: "Placement tools", exact: true }).click();
    await expect(panel.getByLabel("Hydrogen reconciliation report")).toContainText("2 removed, 4 moved");
    expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${theme}-bond-tools.png`) });
    await panel.getByRole("button", { name: "Cancel placement", exact: true }).click();
  }
});
