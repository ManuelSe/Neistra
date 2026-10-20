import { expect, test } from "@playwright/test";
import { configure, coordinateState, current, panel, prepared, select, structures } from "./support/minimization";
import { prepare } from "./support/interactions";

for (const scenario of ["isolated", "isolated-whole", "same-entry", "separate", "pocket-ligand"]) test(`minimizes ${scenario} captured selections with disposable preview and atomic Undo/Redo`, async ({ page, request }, info) => {
  test.setTimeout(180000);
  const specimen = scenario === "isolated-whole" ? "isolated" : scenario === "pocket-ligand" ? "separate" : scenario;
  const p = await prepared(page, request, specimen);
  const before = await structures(request, p);
  const refs = scenario === "isolated-whole" ? p.entries[0].atom_ids.map(atom_id => ({ structure_id: p.entries[0].id, atom_id }))
    : scenario === "pocket-ligand" ? p.entries.filter(e => e.structure_type === "ligand").flatMap(e => e.atom_ids.map(atom_id => ({ structure_id: e.id, atom_id })))
    : specimen === "isolated" ? [{ structure_id: p.entries[0].id, atom_id: 3 }]
    : specimen === "same-entry" ? [7, 34].map(atom_id => ({ structure_id: p.entries[0].id, atom_id }))
    : p.entries.flatMap(e => e.structure_type === "protein" ? before[e.id].atoms.filter(a => a.residue_id === 2).map(a => ({ structure_id: e.id, atom_id: a.id })) : [{ structure_id: e.id, atom_id: 3 }]);
  await select(page, refs, info.project.name === "mobile-chromium");
  // Adjacent controls are real native buttons, and Ctrl+M starts without another Run.
  const actions = page.locator(".viewer-edit-transform-actions");
  await expect(actions.getByRole("button", { name: "Edit molecule", exact: true })).toBeVisible();
  const min = actions.getByRole("button", { name: "Minimize selection", exact: true });
  await expect(min).toHaveAttribute("aria-keyshortcuts", "Control+m");
  if (specimen === "isolated") await page.keyboard.press("Control+m");
  else {
    await min.click();
  }
  const apply = panel(page).getByRole("button", { name: "Apply coordinates" });
  await expect(apply).toBeEnabled({ timeout: 60000 });
  expect(await structures(request, p)).toEqual(before);
  expect((await current(request, p.id)).revision).toBe(p.revision);
  await panel(page).getByRole("checkbox", { name: "Show coordinate preview" }).check();
  await expect.poll(async () => (await coordinateState(page)).previews.length > 0).toBe(true);
  const preview = await coordinateState(page);
  for (const entry of preview.entries) for (const atom of entry.atoms) {
    if (!refs.some(r => r.structure_id === entry.id && r.atom_id === atom.atom_id)) expect(atom.displayed).toEqual(atom.base);
  }
  expect(preview.canonicalAtoms).toHaveLength(p.entries.reduce((sum, e) => sum + e.atom_count, 0));
  expect(await structures(request, p)).toEqual(before);
  await apply.click(); await expect(panel(page)).toBeHidden();
  const applied = await current(request, p.id); expect(applied.revision).toBe(p.revision + 1);
  const after = await structures(request, applied);
  for (const entry of p.entries) {
    const old = before[entry.id], updated = after[entry.id];
    expect(updated.bonds).toEqual(old.bonds); expect(updated.residues).toEqual(old.residues);
    for (const atom of old.atoms) if (!refs.some(ref => ref.structure_id === entry.id && ref.atom_id === atom.id)) expect(updated.atoms.find(a => a.id === atom.id)).toEqual(atom);
  }
  await page.getByRole("button", { name: /Undo: Apply selection minimization/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(before);
  await page.getByRole("button", { name: /Redo: Apply selection minimization/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(after);
  await page.screenshot({ path: info.outputPath(`minimization-${scenario}.png`) });
});

test("inspects non-convergence and discards a native preview without a canonical edit", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepared(page, request);
  const before = await structures(request, p);
  await select(page, p.entries[0].atom_ids.map(atom_id => ({ structure_id: p.entries[0].id, atom_id })), info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await configure(page);
  await panel(page).getByRole("checkbox", { name: "Require convergence before acceptance" }).check();
  await panel(page).getByRole("spinbutton", { name: "Minimization iterations" }).fill("1");
  await panel(page).getByRole("button", { name: "Run minimization" }).click();
  await expect(panel(page).getByText("non converged", { exact: false })).toBeVisible({ timeout: 60000 });
  await expect(panel(page).getByRole("button", { name: "Apply coordinates" })).toBeDisabled();
  await panel(page).getByRole("checkbox", { name: "Show coordinate preview" }).check();
  await expect.poll(async () => (await coordinateState(page)).previews.length > 0).toBe(true);
  await panel(page).getByRole("button", { name: "Discard", exact: true }).click();
  await expect.poll(async () => (await coordinateState(page)).previews.length).toBe(0);
  expect(await structures(request, p)).toEqual(before); expect((await current(request, p.id)).revision).toBe(p.revision);
});

test("cancels native parameter generation without editing coordinates and can inspect the retained job", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepare(page, request, ["tests/fixtures/minimization/long-alkane.mol"], "Cancellation");
  const before = await structures(request, p);
  await select(page, [{ structure_id: p.entries[0].id, atom_id: 3 }], info.project.name === "mobile-chromium");
  await page.keyboard.press("Control+m");
  const cancel = panel(page).getByRole("button", { name: "Cancel calculation", exact: true });
  await expect(cancel).toBeVisible();
  await expect(panel(page).getByRole("status").filter({ hasText: "Preparing GAFF" })).toBeVisible({ timeout: 15000 });
  const started = Date.now(); await cancel.click();
  await expect(panel(page).getByRole("status").filter({ hasText: /^cancelled/ })).toBeVisible({ timeout: 5000 });
  expect(Date.now() - started).toBeLessThan(5000);
  expect(await structures(request, p)).toEqual(before); expect((await current(request, p.id)).revision).toBe(p.revision);
  await panel(page).getByRole("button", { name: "Close minimization" }).click();
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs", exact: true }).click();
  await page.getByRole("button", { name: "Inspect minimization", exact: true }).click();
  await expect(panel(page)).toBeFocused();
  await expect(panel(page).getByRole("status").filter({ hasText: /^cancelled/ })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Apply coordinates" })).toHaveCount(0);
});
