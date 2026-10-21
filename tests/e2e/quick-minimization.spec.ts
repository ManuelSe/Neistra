import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { prepare } from "./support/interactions";
import { current, panel, select, structures } from "./support/minimization";

for (const filename of ["New_molecule.sdf", "New_molecule.pdb", "paracetamol.pdb"]) test(`quickly applies ${filename} through native selection and exact Undo/Redo`, async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepare(page, request, [`tests/fixtures/quick-minimization/${filename}`], `Quick ${filename}`);
  const before = await structures(request, p), entry = p.entries[0];
  const mobile = info.project.name === "mobile-chromium";
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("structure");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(entry.id);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText(`/ ${entry.atom_count} selected`);
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  await page.locator(".molstar-host canvas").first().focus();
  const writes: string[] = [];
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("/quick-minimizations")) writes.push(new URL(r.url()).pathname); });
  const started = Date.now();
  if (info.project.name === "chromium") await page.keyboard.press("Control+m");
  else await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await expect(panel(page)).toContainText("Quick coordinates applied", { timeout: 10000 });
  const elapsed = Date.now() - started;
  const updated = await current(request, p.id), after = await structures(request, updated);
  expect(updated.revision).toBe(p.revision + 1);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toBe(`/api/v1/projects/${p.id}/quick-minimizations`);
  expect(writes[1]).toMatch(/\/apply$/);
  expect(after[entry.id].bonds).toEqual(before[entry.id].bonds);
  expect(after[entry.id].source).toEqual(before[entry.id].source);
  expect(after[entry.id].atoms.map(a => a.formal_charge)).toEqual(before[entry.id].atoms.map(a => a.formal_charge));
  expect(after[entry.id].atoms.map(a => a.coordinates)).not.toEqual(before[entry.id].atoms.map(a => a.coordinates));
  await panel(page).getByRole("button", { name: "Close minimization" }).click();
  await page.getByRole("button", { name: /Undo: Quick minimize selection/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(before);
  await page.getByRole("button", { name: /Redo: Quick minimize selection/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(after);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  expect(await structures(request, p)).toEqual(after);
  await info.attach("quick-workflow-timing", { body: JSON.stringify({ filename, elapsed }), contentType: "application/json" });
});

test("keeps quick settings and Advanced accessible at 320px in both themes", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepare(page, request, ["tests/fixtures/quick-minimization/New_molecule.sdf"], "Quick settings");
  await select(page, [{ structure_id: p.entries[0].id, atom_id: 1 }], info.project.name === "mobile-chromium");
  await page.setViewportSize({ width: 320, height: 740 });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    const settings = page.getByRole("button", { name: "Minimization settings", exact: true });
    await settings.focus(); await page.keyboard.press("Enter");
    await expect(panel(page)).toBeFocused();
    await expect(panel(page).getByRole("button", { name: "Run quick minimization", exact: true })).toBeEnabled();
    await panel(page).getByRole("checkbox", { name: "Move attached terminal hydrogens" }).uncheck();
    await panel(page).getByRole("combobox", { name: "Minimization mode" }).selectOption("environment");
    await expect(panel(page)).toContainText("Only nearby context is modeled");
    await panel(page).getByRole("button", { name: "Advanced AMBER", exact: true }).scrollIntoViewIfNeeded();
    const box = await panel(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(321);
    expect((await new AxeBuilder({ page }).include(".minimization-panel").analyze()).violations).toEqual([]);
    await panel(page).getByRole("button", { name: "Close minimization" }).focus(); await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden(); await expect(settings).toBeFocused();
  }
  expect((await current(request, p.id)).revision).toBe(p.revision);
});
