import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { prepare } from "./support/interactions";
import { configure, coordinateEntries, coordinateSummary, current, panel, select } from "./support/minimization";

declare global { interface Window { minimizationTasks: { longest: number; observer: PerformanceObserver; longestTasks: { start: number; duration: number }[] }; minimizationPreviewTime: Promise<number> } }

for (const copies of [1, 8]) test(`bounds real ${copies === 1 ? "prepared1STP pocket" : "18k-atom assembly"} minimization and native preview work`, async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Performance uses pinned desktop Chromium; C4 qualifies mobile/touch controls.");
  test.setTimeout(240000);
  const protein = await readFile("tests/fixtures/minimization/1stp-protein-prepared.pdb", "utf8");
  // Explicit fixture construction: preserve every complete chain, translate copies
  // by60Å in their upload frame, never crop or alter the calculation's membership.
  const fixtures = Array.from({ length: copies }, (_, i) => ({ name: `protein-${i}.pdb`, mimeType: "chemical/x-pdb", buffer: Buffer.from(protein.split("\n").map(line => {
    if (!line.startsWith("ATOM  ") && !line.startsWith("HETATM")) return line;
    return line.slice(0, 30) + (Number(line.slice(30, 38)) + 60 * i).toFixed(3).padStart(8) + line.slice(38);
  }).join("\n")) }));
  fixtures.push({ name: "biotin.mol", mimeType: "chemical/x-mdl-molfile", buffer: await readFile("tests/fixtures/minimization/1stp-biotin-prepared.mol") });
  const p = await prepare(page, request, fixtures, `Minimization performance ${copies}`);
  const ligand = p.entries.find(e => e.structure_type === "ligand")!;
  expect(p.entries.reduce((n, e) => n + e.atom_count, 0)).toBe(2272 * copies + 32);
  await select(page, ligand.atom_ids.map(atom_id => ({ structure_id: ligand.id, atom_id })), false);
  const movable = ligand.atom_ids.map(atom_id => ({ structure_id: ligand.id, atom_id }));
  const before = await coordinateSummary(page, movable); // Load/read before measuring UI work.
  const writes: { path: string; body: unknown }[] = [];
  page.on("request", request => { if (request.method() === "POST") writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() }); });
  await configure(page);
  await panel(page).getByRole("combobox", { name: "Minimization mode" }).selectOption("environment");
  await panel(page).getByRole("checkbox", { name: "Show all components" }).check();
  const optional = panel(page).locator(".minimization-context").getByRole("checkbox", { checked: false });
  await expect(optional).toHaveCount(copies);
  for (let i = 0; i < copies; i++) await optional.first().check();
  await expect(panel(page)).toContainText(`32 movable / ${2272 * copies}`);
  await page.evaluate(() => {
    const value = { longest: 0, longestTasks: [] as { start: number; duration: number }[], observer: null as unknown as PerformanceObserver };
    value.observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) {
      value.longest = Math.max(value.longest, entry.duration); value.longestTasks.push({ start: entry.startTime, duration: entry.duration });
      value.longestTasks.sort((a, b) => b.duration - a.duration); if (value.longestTasks.length > 8) value.longestTasks.pop();
    } });
    value.observer.observe({ type: "longtask", buffered: false }); window.minimizationTasks = value;
  });
  writes.length = 0;
  const start = Date.now(); await panel(page).getByRole("button", { name: "Run minimization" }).click();
  await expect(panel(page).getByRole("button", { name: "Apply coordinates" })).toBeEnabled({ timeout: 180000 });
  const calculation = Date.now() - start;
  expect(calculation).toBeLessThan(180000);
  expect(writes).toHaveLength(1); expect(writes[0].path).toBe(`/api/v1/projects/${p.id}/minimizations`);
  const payload = writes[0].body as { selection: { atoms: unknown[] }; context: { atom_ids: number[] }[]; captured_inputs?: unknown };
  expect(payload.selection.atoms).toHaveLength(32); expect(payload.context.reduce((n, c) => n + c.atom_ids.length, 0)).toBe(2272 * copies + 32);
  expect(payload.captured_inputs).toBeUndefined();
  await panel(page).getByRole("checkbox", { name: "Show coordinate preview" }).uncheck();
  await expect.poll(async () => (await coordinateEntries(page)).length).toBe(0);
  const checkbox = panel(page).getByRole("checkbox", { name: "Show coordinate preview" }); await checkbox.scrollIntoViewIfNeeded();
  await checkbox.evaluate(async element => {
    const { measureCoordinatePreviewEvent } = await import("/src/test/modelingHarness.ts");
    window.minimizationPreviewTime = measureCoordinatePreviewEvent(window.interactionEngines.at(-1)!, element, true);
  });
  const previewStarted = Date.now(); await checkbox.check();
  await expect.poll(async () => (await coordinateEntries(page)).length > 0, { intervals: [10, 20, 30] }).toBe(true);
  const previewAutomationMs = Date.now() - previewStarted;
  const previewMs = await page.evaluate(() => window.minimizationPreviewTime);
  const shown = await coordinateSummary(page, movable); expect(shown.canonicalCount).toBe(before.canonicalCount);
  expect(shown.fixedExact).toBe(true); expect(shown.moving).toBeGreaterThan(0);
  expect(shown.previews).toEqual([ligand.id]);
  const discard = panel(page).getByRole("button", { name: "Discard", exact: true }); await discard.scrollIntoViewIfNeeded();
  await discard.evaluate(async element => {
    const { measureCoordinatePreviewEvent } = await import("/src/test/modelingHarness.ts");
    window.minimizationPreviewTime = measureCoordinatePreviewEvent(window.interactionEngines.at(-1)!, element, false);
  });
  const cancelStarted = Date.now(); await discard.click();
  await expect.poll(async () => (await coordinateEntries(page)).length, { intervals: [10, 20, 30] }).toBe(0);
  const discardAutomationMs = Date.now() - cancelStarted;
  const discardMs = await page.evaluate(() => window.minimizationPreviewTime);
  const longestTaskMs = await page.evaluate(() => { window.minimizationTasks.observer.disconnect(); return window.minimizationTasks.longest; });
  const evidence = { copies, atoms: 2272 * copies + 32, calculationMs: calculation, previewMs, discardMs, previewAutomationMs, discardAutomationMs, longestTaskMs, longestTasks: await page.evaluate(() => window.minimizationTasks.longestTasks), writes };
  await writeFile(info.outputPath("minimization-performance.json"), JSON.stringify(evidence, null, 2));
  await info.attach("minimization-performance", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  expect(previewMs).toBeLessThan(500); expect(discardMs).toBeLessThan(500); expect(longestTaskMs).toBeLessThan(750);
  const after = await current(request, p.id); expect(after.revision).toBe(p.revision); expect(after.entries.map(e => e.current_artifact_id)).toEqual(p.entries.map(e => e.current_artifact_id));
});
