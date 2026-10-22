import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { QuickTiming } from "../../apps/web/src/test/quickMinimizationHarness";
import type { Job, QuickMinimizationProposal } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { coordinateEntries, coordinateSummary, current, panel } from "./support/minimization";

declare global { interface Window { quickPublicationTiming: Promise<QuickTiming> } }

for (const copies of [0, 1, 8]) test(`bounds cold quick publication for ${copies === 0 ? "a supplied small molecule" : copies === 1 ? "a 1STP pocket" : "an 18k scene"}`, async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Cold timing uses pinned desktop Chromium; mobile workflows are independently exercised.");
  test.setTimeout(180000);
  let fixtures: (string | { name: string; mimeType: string; buffer: Buffer })[];
  if (!copies) fixtures = ["tests/fixtures/quick-minimization/New_molecule.sdf"];
  else {
    const protein = await readFile("tests/fixtures/minimization/1stp-protein-prepared.pdb", "utf8");
    fixtures = Array.from({ length: copies }, (_, i) => ({ name: `protein-${i}.pdb`, mimeType: "chemical/x-pdb", buffer: Buffer.from(protein.split("\n").map(line => {
      if (!line.startsWith("ATOM  ") && !line.startsWith("HETATM")) return line;
      return line.slice(0, 30) + (Number(line.slice(30, 38)) + 60 * i).toFixed(3).padStart(8) + line.slice(38);
    }).join("\n")) }));
    fixtures.push({ name: "biotin.mol", mimeType: "chemical/x-mdl-molfile", buffer: await readFile("tests/fixtures/minimization/1stp-biotin-prepared.mol") });
  }
  const p = await prepare(page, request, fixtures, `Cold quick ${copies}`);
  const ligand = p.entries.find(e => e.structure_type === "ligand")!;
  expect(ligand).toBeDefined();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("structure");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(ligand.id);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await page.locator(".molstar-host canvas").first().focus();
  const atoms = ligand.atom_ids.map(atom_id => ({ structure_id: ligand.id, atom_id }));
  for (const phase of ["cold", "repeat"]) {
  const before = await current(request, p.id);
  await page.evaluate(async atoms => {
    const { measureQuickPublication } = await import("/src/test/quickMinimizationHarness.ts");
    window.quickPublicationTiming = measureQuickPublication(window.interactionEngines.at(-1)!, atoms);
  }, atoms);
  let job: Job | undefined, proposal: QuickMinimizationProposal | undefined;
  const stages: { path: string; at: number; kind: string }[] = [];
  page.on("request", r => { if (r.url().includes("quick-minimizations")) stages.push({ path: new URL(r.url()).pathname, at: Date.now(), kind: "request" }); });
  page.on("response", async r => {
    if (r.url().includes("quick-minimizations") && r.ok()) {
      stages.push({ path: new URL(r.url()).pathname, at: Date.now(), kind: "response" });
      if (r.request().method() === "POST" && !r.url().endsWith("/apply")) job = await r.json() as Job;
      if (r.url().endsWith("/proposal")) proposal = await r.json() as QuickMinimizationProposal;
    }
  });
  await page.keyboard.press("Control+m");
  await expect(panel(page)).toContainText("Quick coordinates applied", { timeout: 20000 });
  const timing = await page.evaluate(() => window.quickPublicationTiming);
  const after = await current(request, p.id);
  for (const entry of p.entries) if (entry.id !== ligand.id) expect(after.entries.find(e => e.id === entry.id)?.current_artifact_id).toBe(entry.current_artifact_id);
  expect(after.revision).toBe(before.revision + 1);
  expect(proposal?.report.method).toBe("MMFF94");
  expect(proposal?.report.fixed_count ?? 0).toBeGreaterThanOrEqual(copies ? 1 : 0);
  const evidence = { copies, phase, atoms: p.entries.reduce((n, e) => n + e.atom_count, 0), ...timing, stages,
    backend: proposal?.report.timings, elapsedBackendSeconds: proposal?.report.elapsed_seconds, jobId: job?.id };
  await writeFile(info.outputPath(`quick-${phase}-performance.json`), JSON.stringify(evidence, null, 2));
  await info.attach("quick-cold-performance", { body: JSON.stringify(evidence), contentType: "application/json" });
  expect(timing.feedbackMs).toBeGreaterThanOrEqual(0); expect(timing.feedbackMs).toBeLessThanOrEqual(100);
  expect(timing.nativeAppliedMs).toBeLessThanOrEqual(copies ? 5000 : 2000);
  expect(timing.longestTaskMs).toBeLessThan(750);
  await panel(page).getByRole("button", { name: "Close minimization" }).click();
  if (phase === "cold") {
    await page.getByRole("button", { name: /Undo: Quick minimize selection/ }).click();
    await expect(page.getByRole("button", { name: /Redo: Quick minimize selection/ })).toBeEnabled();
    await coordinateEntries(page);
    await page.locator(".molstar-host canvas").first().focus();
  }
  }
});


test("renders genuine quick steps and clears native preview within500ms on Cancel", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Pinned desktop native timing; mobile controls are independently exercised.");
  test.setTimeout(120000);
  const p = await prepare(page, request, ["tests/fixtures/minimization/long-alkane.mol"], "Live quick");
  const entry = p.entries[0];
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("structure");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(entry.id);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await panel(page).getByRole("spinbutton", { name: "Minimization iterations" }).fill("2000");
  const run = panel(page).getByRole("button", { name: "Run quick minimization", exact: true });
  const frames: import("../../apps/web/src/api/types").MinimizationLive[] = [];
  page.on("response", async r => { if (r.ok() && r.url().endsWith("/live")) { const value = await r.json(); if (value.frame) frames.push(value); } });
  await run.evaluate(async element => {
    const { measureCoordinatePreviewEvent } = await import("/src/test/modelingHarness.ts");
    element.addEventListener('click', () => { (window as unknown as { quickRunWall: number }).quickRunWall = Date.now(); }, { once: true, capture: true });
    window.minimizationPreviewTime = measureCoordinatePreviewEvent(window.interactionEngines.at(-1)!, element, true, "click");
  });
  await run.click();
  await expect.poll(async () => (await coordinateEntries(page)).length, { timeout: 15000 }).toBe(1);
  const firstFrameMs = await page.evaluate(() => window.minimizationPreviewTime);
  expect(frames.length).toBeGreaterThan(0);
  const selected = entry.atom_ids.map(atom_id => ({ structure_id: entry.id, atom_id }));
  const shown = await coordinateSummary(page, selected);
  expect(shown.moving).toBeGreaterThan(0); expect(shown.fixedExact).toBe(true);
  const cancel = panel(page).getByRole("button", { name: "Cancel calculation", exact: true });
  await cancel.evaluate(async element => {
    const { measureCoordinatePreviewEvent } = await import("/src/test/modelingHarness.ts");
    window.minimizationPreviewTime = measureCoordinatePreviewEvent(window.interactionEngines.at(-1)!, element, false);
  });
  await cancel.click();
  await expect.poll(async () => (await coordinateEntries(page)).length).toBe(0);
  const cancelMs = await page.evaluate(() => window.minimizationPreviewTime);
  expect((await current(request, p.id)).revision).toBe(p.revision);
  await expect(panel(page).getByRole("status").filter({ hasText: /^cancelled/ })).toBeVisible({ timeout: 5000 });
  const evidence = { firstFrameMs, cancelMs, startedWall: await page.evaluate(() => (window as unknown as { quickRunWall: number }).quickRunWall), frames: frames.map(f => ({ sequence: f.frame!.sequence, iteration: f.frame!.iteration, published_at: f.frame!.published_at })) };
  await writeFile(info.outputPath("quick-live-performance.json"), JSON.stringify(evidence, null, 2));
  expect(firstFrameMs).toBeLessThanOrEqual(1000); expect(cancelMs).toBeLessThanOrEqual(500);
});
