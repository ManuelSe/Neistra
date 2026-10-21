import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { MinimizationLive } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { configure, startAdvanced, coordinateEntries, coordinateSummary, current, panel, prepared, select, structures } from "./support/minimization";

test("acknowledges an eligible unconverged native result and retains exact Undo/Redo", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepared(page, request);
  const before = await structures(request, p);
  await select(page, p.entries[0].atom_ids.map(atom_id => ({ structure_id: p.entries[0].id, atom_id })), info.project.name === "mobile-chromium");
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.getByRole("button", { name: "Inspector", exact: true })).toBeVisible();
  await configure(page);
  await panel(page).getByRole("spinbutton", { name: "Minimization iterations" }).fill("1");
  await panel(page).getByRole("button", { name: "Run minimization" }).click();
  const accept = panel(page).getByRole("button", { name: "Accept unconverged coordinates", exact: true });
  await expect(accept).toBeEnabled({ timeout: 60000 });
  await expect(panel(page)).toContainText("explicitly acknowledges the residual gradient");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    await expect(accept).toBeVisible();
    await expect.poll(async () => {
      const box = await accept.boundingBox();
      return !!box && box.x >= 0 && box.x + box.width <= 320;
    }).toBe(true);
    const axe = await new AxeBuilder({ page }).include(".minimization-panel").analyze();
    expect(axe.violations).toEqual([]);
  }
  expect(await structures(request, p)).toEqual(before);
  await accept.click(); await expect(panel(page)).toBeHidden();
  const after = await structures(request, p);
  expect(after).not.toEqual(before);
  await page.getByRole("button", { name: /Undo: Apply selection minimization/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(before);
  await page.getByRole("button", { name: /Redo: Apply selection minimization/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(after);
});

for (const wholeProtein of [false, true]) test(`renders accepted native steps for ${wholeProtein ? "whole heavy protein" : "partial protein"} and restores immediately on Cancel, initial and repeat`, async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Pinned desktop native timing; mobile controls qualified separately.");
  test.setTimeout(180000);
  const p = await prepare(page, request, [{ name: "prepared1STP.pdb", mimeType: "chemical/x-pdb", buffer: await readFile("tests/fixtures/minimization/1stp-protein-prepared.pdb") }], "Live native protein");
  const before = await structures(request, p), entry = p.entries[0];
  await page.evaluate(() => {
    const native = window.interactionEngines.at(-1)! as unknown as Record<string, (...args: unknown[]) => Promise<void>>;
    const timings: { method: string; ms: number; deliveryMs?: number }[] = [];
    (window as unknown as { nativeMinimizationTimings: typeof timings }).nativeMinimizationTimings = timings;
    const frames: { published_at: number; entries: { atom_ids: number[]; coordinates: number[][] }[] }[] = [];
    const fetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await fetch(...args);
      if (response.url.endsWith("/live") && response.ok) void response.clone().json().then(value => {
        if (value.frame) { frames.push(value.frame); if (frames.length > 16) frames.shift(); }
      });
      return response;
    };
    for (const method of ["updateCoordinates", "restorePreviewRepresentations", "applyCoordinatePatch", "clearCoordinatePreview"]) {
      const original = native[method];
      native[method] = async function(...args) {
        const start = performance.now();
        try { await original.apply(this, args); }
        finally {
          timings.push({ method, ms: performance.now() - start });
          if (method === "updateCoordinates") {
            const coordinates = args[1] as Map<number, number[]>;
            const frame = [...frames].reverse().find(f => f.entries[0].coordinates[0].every((v, axis) => coordinates.get(f.entries[0].atom_ids[0])?.[axis] === v));
            if (frame) requestAnimationFrame(() => timings.push({ method: "accepted-frame-painted", ms: performance.now() - start, deliveryMs: Date.now() - frame.published_at * 1000 }));
          }
        }
      };
    }
  });
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  const query = page.getByRole("combobox", { name: "Select by", exact: true });
  const value = page.getByRole("textbox", { name: "Value", exact: true });
  // A partial protein selection exercises real bonded boundaries and long-running
  // full-chain forces; the approved performance fixtures select32 ligand atoms.
  if (wholeProtein) {
    await query.selectOption("structure"); await value.fill(entry.id);
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
  } else {
  await query.selectOption("residue_number");
  for (const residue of [1, 2, 3, 4]) {
    if (residue > 1) await page.getByRole("group", { name: "Operation mode" }).getByRole("button", { name: "add", exact: true }).click();
    await value.fill(String(residue));
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
  }
  }
  await page.getByRole("group", { name: "Operation mode" }).getByRole("button", { name: "subtract", exact: true }).click();
  await query.selectOption("element"); await value.fill("H");
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  const residues = new Set(before[entry.id].residues.filter(r => Number(r.author_number) >= 1 && Number(r.author_number) <= 4).map(r => r.id));
  const heavy = before[entry.id].atoms.filter(a => a.element !== "H" && (wholeProtein || (a.residue_id !== null && residues.has(a.residue_id))));
  await expect(page.locator(".viewer-status")).toContainText(`/ ${heavy.length} selected`);
  const movable = heavy.map(a => ({ structure_id: entry.id, atom_id: a.id }));
  await coordinateSummary(page, movable);
  const frames: MinimizationLive[] = [];
  page.on("response", async response => { if (response.url().endsWith("/live") && response.ok()) {
    const frame = await response.json() as MinimizationLive; if (frame.frame) frames.push(frame);
  } });
  const timings = [];
  for (const cache of ["initial", "repeat"]) {
    frames.length = 0;
    await page.evaluate(() => { (window as unknown as { nativeMinimizationTimings: unknown[] }).nativeMinimizationTimings.length = 0; });
    await page.locator(".molstar-host canvas").first().focus();
    const started = Date.now(); await startAdvanced(page);
    await expect.poll(async () => (await coordinateEntries(page)).length, { timeout: 60000 }).toBe(1);
    const shown = await coordinateSummary(page, movable), shownAt = Date.now();
    const received = [...frames].reverse().find(f => f.frame?.entries[0].coordinates[0].every((v, axis) => v === shown.firstMovable!.coordinates[axis]));
    expect(received?.status).toBe("running");
    expect(received?.frame).toBeTruthy();
    const deliveryMs = await page.evaluate(() => (window as unknown as { nativeMinimizationTimings: { deliveryMs?: number }[] }).nativeMinimizationTimings.find(t => t.deliveryMs !== undefined)?.deliveryMs);
    expect(deliveryMs).toBeDefined();
    expect(deliveryMs!).toBeLessThan(1000);
    expect(deliveryMs!).toBeGreaterThanOrEqual(0);
    expect(shown.fixedExact).toBe(true); expect(shown.moving).toBeGreaterThan(0);
    expect(await structures(request, p)).toEqual(before);
    const cancel = panel(page).getByRole("button", { name: "Cancel calculation", exact: true });
    await cancel.evaluate(async element => {
      const { measureCoordinatePreviewEvent } = await import("/src/test/modelingHarness.ts");
      window.minimizationPreviewTime = measureCoordinatePreviewEvent(window.interactionEngines.at(-1)!, element, false);
    });
    const cancelledAt = Date.now(); await cancel.click();
    await expect.poll(async () => (await coordinateEntries(page)).length).toBe(0);
    const restoreMs = await page.evaluate(() => window.minimizationPreviewTime);
    const nativeTimings = await page.evaluate(() => (window as unknown as { nativeMinimizationTimings: { method: string; ms: number }[] }).nativeMinimizationTimings);
    await info.attach(`native-${cache}-timings`, { body: JSON.stringify({ restoreMs, nativeTimings }), contentType: "application/json" });
    expect(restoreMs).toBeLessThan(500);
    await expect(panel(page).getByRole("status").filter({ hasText: /^cancelled/ })).toBeVisible({ timeout: 5000 });
    expect(Date.now() - cancelledAt).toBeLessThan(5000);
    const restored = await coordinateSummary(page, movable);
    expect(restored.fixedExact).toBe(true); expect(restored.moving).toBe(0);
    expect((await current(request, p.id)).revision).toBe(p.revision);
    timings.push({ cache, atoms: entry.atom_count, movable: heavy.length, firstVisibleMs: shownAt - started, deliveryMs, restoreMs, frames: frames.length });
    await panel(page).getByRole("button", { name: "Close minimization" }).click();
  }
  await writeFile(info.outputPath("live-native-timings.json"), JSON.stringify(timings, null, 2));
  await info.attach("live-native-timings", { body: JSON.stringify(timings), contentType: "application/json" });
});
