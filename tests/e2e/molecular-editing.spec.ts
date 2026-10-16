import { expect, test, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import type { observeEditPicks } from "../../apps/web/src/test/molecularEditHarness";
import AxeBuilder from "@axe-core/playwright";

declare global { interface Window { editingPicks: Awaited<ReturnType<typeof observeEditPicks>> } }

test.beforeEach(({ page }) => page.setDefaultTimeout(10000));

async function selectAtom(page: Page, entryId: string, atomId: number, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entryId}:${atomId}`);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
}

test("performs one selection-driven atom/H edit with exact undo and unchanged original", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Molecular edit");
  const entry = initial.entries[0];
  const path = `/api/v1/projects/${initial.id}`;
  const projection = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const original = await (await request.get(`${path}/entries/${entry.id}/original`)).body();
  await selectAtom(page, entry.id, 1, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Prepare component hydrogens", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.atoms.length).toBe(9);
  const prepared = (await projection()).structure;
  await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  const h = prepared.atoms.find(atom => atom.element === "H" && prepared.bonds.some(bond =>
    (bond.atom_1_id === 1 && bond.atom_2_id === atom.id) || (bond.atom_2_id === 1 && bond.atom_1_id === atom.id)))!;
  await selectAtom(page, entry.id, h.id, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Replace selected atom with C", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.atoms.filter(atom => atom.element === "C").length).toBe(3);
  await expect(panel).toBeVisible();
  const after = (await projection()).structure;
  for (const atom of prepared.atoms.filter(atom => atom.id !== h.id)) expect(after.atoms.find(candidate => candidate.id === atom.id)).toEqual(atom);
  const state: Project = await (await request.get(path)).json();
  expect(state.revision).toBe(initial.revision + 2);
  await page.screenshot({ path: info.outputPath("c1-open-atom-editor.png") });
  await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await projection()).structure).toEqual(prepared);
  expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(original);
  await page.screenshot({ path: info.outputPath("c1-atom-edit.png") });
});

test("maps a native bond hit to canonical endpoints and changes its order from the panel", async ({ page, request }) => {
  test.setTimeout(90000);
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Bond edit");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection: StructureProjection = await (await request.get(`${path}/entries/${entry.id}/structure`)).json();
  const midpoint = [0, 1, 2].map(axis => (projection.structure.atoms[0].coordinates[axis] + projection.structure.atoms[1].coordinates[axis]) / 2) as [number, number, number];
  const beforeCamera = await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
    return window.editingPicks.camera();
  });
  const point = await page.evaluate(point => window.editingPicks.point(point), midpoint);
  const canvas = page.locator(".molstar-host canvas").first();
  await canvas.click({ position: point });
  await expect.poll(() => page.evaluate(() => window.editingPicks.events.some(e => e.kind === "bond-loci"))).toBe(true);
  await expect(page.locator(".viewer-status")).toContainText("/ 2 selected");
  expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(beforeCamera);
  const picks = await page.evaluate(() => window.editingPicks.events.flatMap(e => e.selection?.atoms ?? []));
  expect(picks.map(ref => ref.atom_id).sort()).toEqual([1, 2]);
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Bonds", exact: true }).click();
  await panel.getByRole("button", { name: "Increase bond order", exact: true }).click();
  await expect.poll(async () => {
    const result: StructureProjection = await (await request.get(`${path}/entries/${entry.id}/structure`)).json();
    return result.structure.bonds.find(b => b.id === 1)?.order;
  }).toBe(2);
  await expect(panel).toBeVisible();
});

test("substitutes a selected H with illustrated COOH without an attachment mode", async ({ page, request }, info) => {
  test.setTimeout(90000);
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Fragment edit");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  await selectAtom(page, entry.id, 1, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Prepare component hydrogens" }).click();
  await expect.poll(async () => (await projection()).structure.atoms.length).toBe(9);
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  const before = (await projection()).structure;
  const h = before.atoms.find(a => a.element === "H" && before.bonds.some(b => [b.atom_1_id, b.atom_2_id].includes(a.id) && [b.atom_1_id, b.atom_2_id].includes(1)))!;
  await selectAtom(page, entry.id, h.id, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Fragments", exact: true }).click();
  await expect(panel.locator(".edit-fragment-grid svg")).toHaveCount(6);
  await panel.getByRole("button", { name: "Replace H with Carboxylic acid", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.atoms.filter(a => a.element !== "H").length).toBe(6);
  const after = (await projection()).structure;
  expect(after.atoms.filter(a => a.element === "H")).toHaveLength(6);
  for (const atom of before.atoms.filter(a => a.id !== h.id)) expect(after.atoms.find(a => a.id === atom.id)).toEqual(atom);
  await page.screenshot({ path: info.outputPath("c2-fragment-editor.png") });
});

test("mutates a natively picked residue successively and preserves exact backbone and undo", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, ["tests/fixtures/formats/protein_editing.pdb"], "Residue edit");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const original = (await projection()).structure;
  const anchor = original.atoms.find(a => a.name === "CA")!;
  if (info.project.name === "mobile-chromium") await page.getByRole("combobox", { name: "Viewer picking mode" }).selectOption("residue");
  else await page.getByRole("button", { name: "Pick residues", exact: true }).click();
  await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
  });
  const point = await page.evaluate(point => window.editingPicks.point(point), anchor.coordinates);
  await page.locator(".molstar-host canvas").first().click({ position: point });
  const target = original.atoms.filter(a => a.residue_id === anchor.residue_id);
  await expect(page.locator(".viewer-status")).toContainText(`/ ${target.length} selected`);
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Residues", exact: true }).click();
  await expect(panel.getByRole("button", { name: /^Mutate residue to / })).toHaveCount(20);
  await expect(panel.getByRole("button", { name: /Grow/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Mutate residue to VAL", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.residues.find(r => r.id === anchor.residue_id)?.name).toBe("VAL");
  const valine = (await projection()).structure;
  await expect(page.locator(".viewer-status")).toContainText(`/ ${valine.atoms.filter(a => a.residue_id === anchor.residue_id).length} selected`);
  await expect(panel.getByRole("button", { name: "Mutate residue to VAL", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Mutate residue to LEU", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.residues.find(r => r.id === anchor.residue_id)?.name).toBe("LEU");
  const leucine = (await projection()).structure;
  for (const atom of target.filter(a => ["N", "CA", "C", "O"].includes(a.name))) expect(leucine.atoms.find(a => a.id === atom.id)).toEqual(atom);
  for (const atom of original.atoms.filter(a => a.residue_id !== anchor.residue_id)) expect(leucine.atoms.find(a => a.id === atom.id)).toEqual(atom);
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await projection()).structure).toEqual(valine);
  await page.screenshot({ path: info.outputPath("c3-residue-editor.png") });
});

test("keeps tool focus, notices and all controls accessible in both themes and narrow layouts", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Accessible edit");
  await selectAtom(page, project.entries[0].id, 1, info.project.name === "mobile-chromium");
  const launcher = page.getByRole("button", { name: "Edit molecule", exact: true });
  if (info.project.name === "mobile-chromium") {
    const box = (await launcher.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await launcher.focus(); await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await expect(panel).toBeFocused();
  for (const dark of [false, true]) {
    const theme = await page.locator("html").getAttribute("data-theme");
    if ((theme === "dark") !== dark) await page.getByRole("button", { name: /Use (dark|light) theme/ }).click();
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
    await panel.getByRole("button", { name: "Atoms", exact: true }).click();
    if (!dark) await panel.getByRole("button", { name: "Prepare component hydrogens" }).click();
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      if (!box) return false;
      const viewport = page.viewportSize()!;
      return box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
    }).toBe(true);
    const close = panel.getByRole("button", { name: "Close molecular editor" });
    await expect.poll(() => close.evaluate(node => {
      const b = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
    })).toBe(true);
    expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await panel.getByRole("button", { name: "Bonds", exact: true }).focus();
  await page.keyboard.press("Escape"); await expect(launcher).toBeFocused();
  await launcher.click();
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await expect(panel).toBeHidden();
  await launcher.focus(); await page.keyboard.press("Enter");
  await expect(panel).toBeFocused();
  await page.screenshot({ path: info.outputPath("c3-accessible-editor.png") });
});
