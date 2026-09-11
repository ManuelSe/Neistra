import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import type { mountSurfaceHarness } from "../../apps/web/src/test/selectionSurfaceHarness";

declare global {
  interface Window { surfaceHarness: Awaited<ReturnType<typeof mountSurfaceHarness>> }
}

// Linux qualification accounting: sum browser-descendant RSS (shared pages can be
// counted more than once). This is measured process memory, not a worker heap cap.
let memoryTimer: ReturnType<typeof setInterval> | undefined;
test.afterEach(() => clearInterval(memoryTimer));
function browserRssKiB() {
  const processes = new Map<number, { parent: number; rss: number }>();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const status = readFileSync(`/proc/${name}/status`, "utf8");
      processes.set(Number(name), { parent: Number(status.match(/^PPid:\s+(\d+)/m)?.[1]),
        rss: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) });
    } catch { /* Process exited while sampling. */ }
  }
  let sum = 0;
  for (const data of processes.values()) {
    let parent = data.parent;
    while (parent > 1 && parent !== process.pid) parent = processes.get(parent)?.parent ?? 0;
    if (parent === process.pid) sum += data.rss;
  }
  return sum;
}

test("qualifies worker geometry, real element colors, picking and cancellation", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const created = await request.post("/api/v1/projects", { data: { name: `Surface C1 ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const initial: Project = await created.json();
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, {
    multipart: { expected_revision: "0", files: { name: "1stp.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync(resolve("tests/fixtures/complex/1stp.pdb")) } },
  });
  expect(imported.status()).toBe(201);
  const project: Project = (await imported.json()).project;
  const entry = project.entries[0];
  const response = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`);
  expect(response.status()).toBe(200);
  const projection: StructureProjection = await response.json();
  await page.goto("/selection-surface-test.html");
  const baselineRssKiB = browserRssKiB();
  let peakRssKiB = baselineRssKiB;
  memoryTimer = setInterval(() => { peakRssKiB = Math.max(peakRssKiB, browserRssKiB()); }, 100);
  const evidence = await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/selectionSurfaceHarness.ts";
    const { mountSurfaceHarness } = await import(/* @vite-ignore */ path);
    const container = document.createElement("div");
    container.id = "surface-harness";
    Object.assign(container.style, { position: "fixed", inset: "0", zIndex: "9999" });
    document.body.appendChild(container);
    const tasks: number[] = [];
    const observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => tasks.push(e.duration)));
    observer.observe({ type: "longtask", buffered: false });
    window.surfaceHarness = await mountSurfaceHarness(container, {
      entryId: entry.id, label: entry.name, projection: projection.viewer,
      atomIds: projection.structure.atoms.map((a) => a.id), normalized: projection.structure,
      hierarchy: projection.hierarchy, settings: entry.viewer_settings,
    });
    observer.disconnect();
    const h = window.surfaceHarness;
    return { ...h.geometry.evidence, readyMs: h.readyMs, units: h.units, partitionUnits: h.partitionUnits, partitionInvariant: h.partitionInvariant, longestSurfaceTaskMs: h.longestSurfaceTaskMs,
      vertices: h.geometry.vertices.length / 3, triangles: h.geometry.indices.length / 3,
      groups: new Set(h.geometry.groups).size, atoms: h.input.atomIds.length,
      // Module/plugin startup is measured separately from steady worker interaction.
      observedStartupTaskMs: Math.max(0, ...tasks),
    };
  }, { entry, projection });
  expect(evidence.atoms).toBe(1001);
  expect(evidence.partitionUnits).toBeGreaterThan(1);
  expect(evidence.partitionInvariant).toBe(true);
  expect(evidence.longestSurfaceTaskMs).toBeLessThan(750);
  expect(evidence.vertices).toBeGreaterThan(100);
  expect(evidence.groups).toBeGreaterThan(20);
  expect(evidence.meshBytes).toBeLessThan(64 * 1024 * 1024);
  expect(evidence.readyMs).toBeLessThan(10_000);
  const canvas = page.locator("#surface-harness canvas").first();
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return 0;
    gl.finish();
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 50) colored++;
    }
    return colored;
  })).toBeGreaterThan(100);
  const box = (await canvas.boundingBox())!;
  // Find a real surface hit. There are no atomic/polymer/entry-surface layers here.
  for (const dx of [0, -0.12, 0.12, -0.24, 0.24]) {
    await page.mouse.click(box.x + box.width * (0.5 + dx), box.y + box.height * 0.5);
    if (await page.evaluate(() => window.surfaceHarness.events.some((e) => e.atoms.length > 0))) break;
  }
  const picked = await page.evaluate(() => window.surfaceHarness.events.flatMap((e) => e.atoms));
  expect(picked.length).toBeGreaterThan(0);
  const ids = new Set(entry.atom_ids);
  for (const atom of picked) { expect(atom.structure_id).toBe(entry.id); expect(ids.has(atom.atom_id)).toBe(true); }
  const cancellation = await page.evaluate(async () => {
    const h = window.surfaceHarness;
    const controller = new AbortController();
    const start = performance.now();
    const pending = h.calculator.compute(h.input, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    try { await pending; return { cancelled: false, elapsed: performance.now() - start }; }
    catch (e) { return { cancelled: e instanceof DOMException && e.name === "AbortError", elapsed: performance.now() - start }; }
  });
  expect(cancellation.cancelled).toBe(true);
  expect(cancellation.elapsed).toBeLessThan(500);
  clearInterval(memoryTimer);
  const report = JSON.stringify({ ...evidence, cancellation, baselineRssKiB, peakRssKiB,
    memoryMeasurement: "Linux summed descendant RSS, sampled every 100 ms; includes browser and shared pages" }, null, 2);
  writeFileSync(info.outputPath("surface-feasibility.json"), report);
  await info.attach("surface-feasibility.json", { body: report, contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("selection-surface.png") });
  await page.evaluate(() => window.surfaceHarness.dispose());
  await expect(page.locator("#surface-harness canvas")).toHaveCount(0);
});

test("adds and removes saved surfaces from the compact palette with reload and undo", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  test.skip(info.project.name !== "chromium", "Desktop project panel workflow; renderer qualified on both viewports.");
  await page.setViewportSize({ width: 1366, height: 768 });
  const created = await request.post("/api/v1/projects", { data: { name: `Surface workflow ${Date.now()}` } });
  let project: Project = await created.json();
  const imported = await request.post(`/api/v1/projects/${project.id}/imports`, {
    multipart: { expected_revision: "0", files: { name: "ethanol.mol", mimeType: "chemical/x-mdl-molfile", buffer: readFileSync(resolve("tests/fixtures/formats/ethanol.mol")) } },
  });
  expect(imported.status()).toBe(201);
  project = (await imported.json()).project;
  const entry = project.entries[0];
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 45_000 });
  const row = page.locator(`.entry-row[data-entry-id="${entry.id}"]`);
  await row.locator(".entry-select").click();
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Style selection" });
  await palette.getByRole("button", { name: "Add surface", exact: true }).click();
  await expect(page.getByLabel("Selection surface rendering")).toContainText("ready");
  await expect(palette.getByRole("button", { name: "Add surface" })).toBeDisabled();
  project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(project.entries[0].viewer_settings.selection_surface).toEqual({ profile: "molecular-v1", atom_ids: entry.atom_ids });
  expect(project.entries[0].current_artifact_id).toBe(entry.current_artifact_id);
  await palette.getByRole("button", { name: "Reset representation" }).click();
  await expect(palette.getByRole("status")).toContainText("Reset representation");
  await expect(page.getByLabel("Selection surface rendering")).toContainText("ready");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByLabel("Selection surface rendering")).toContainText("ready");
  await page.reload();
  await expect(page.getByLabel("Selection surface rendering")).toContainText("ready", { timeout: 30_000 });
  await row.locator(".entry-select").click();
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await palette.getByRole("button", { name: "Remove surface" }).click();
  await expect(page.getByLabel("Selection surface rendering")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect(page.getByLabel("Selection surface rendering")).toContainText("ready");
  await page.screenshot({ path: info.outputPath("selection-surface-workflow.png") });
});
