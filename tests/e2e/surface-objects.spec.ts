import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import type { mountSurfaceObjectsHarness } from "../../apps/web/src/test/surfaceObjectsHarness";

declare global {
  interface Window { surfaceObjectsHarness: Awaited<ReturnType<typeof mountSurfaceObjectsHarness>> }
}

test("native same-entry surface objects have independent identity, colors, mesh and whole-object activation", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const created = await request.post("/api/v1/projects", { data: { name: `Surface objects C1 ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const initial: Project = await created.json();
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, {
    multipart: { expected_revision: "0", files: { name: "1stp.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync(resolve("tests/fixtures/complex/1stp.pdb")) } },
  });
  expect(imported.status()).toBe(201);
  const project: Project = (await imported.json()).project;
  const entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  const persisted = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  await page.goto("/selection-surface-test.html");
  await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/surfaceObjectsHarness.ts";
    const { mountSurfaceObjectsHarness } = await import(/* @vite-ignore */ path);
    const container = document.createElement("div");
    Object.assign(container.style, { position: "fixed", inset: "0", zIndex: "9999" });
    document.body.appendChild(container);
    window.surfaceObjectsHarness = await mountSurfaceObjectsHarness(container, {
      entryId: entry.id, label: entry.name, projection: projection.viewer, normalized: projection.structure,
      atomIds: projection.structure.atoms.map(atom => atom.id), hierarchy: projection.hierarchy, settings: entry.viewer_settings,
    });
  }, { entry, projection });
  // Wait for the explicit fit's native animation before measuring camera neutrality.
  await expect.poll(() => page.evaluate(() => window.surfaceObjectsHarness.inspect().objects.every(o => o.drawCounts.some(n => n > 0)))).toBe(true);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.surfaceObjectsHarness.inspect());
  expect(before.workers).toEqual({ created: 2, terminated: 2, active: 0, maximum: 1, inputs: 2 });
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  const candidates = await canvas.evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!gl) throw new Error("WebGL unavailable");
    gl.finish(); const w = element.width, h = element.height;
    const pixels = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const result: { id: string; x: number; y: number }[] = [];
    for (const [id, red] of [["first", true], ["second", false]] as const) {
      const matches = (x: number, y: number) => {
        const offset = (y * w + x) * 4, r = pixels[offset], b = pixels[offset + 2];
        return red ? r > b + 60 : b > r + 60;
      };
      for (let y = 8; y < h - 8 && result.filter(v => v.id === id).length < 20; y += 5) {
        for (let x = 8; x < w - 8; x += 5) {
          if (matches(x, y) && matches(x + 2, y) && matches(x - 2, y) && matches(x, y + 2) && matches(x, y - 2)) {
            result.push({ id, x: x / w, y: 1 - y / h });
            if (result.filter(v => v.id === id).length >= 20) break;
          }
        }
      }
    }
    return result;
  });
  for (const id of ["first", "second"]) {
    const targets = candidates.filter(candidate => candidate.id === id);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const identified = await page.evaluate(target => window.surfaceObjectsHarness.identify(target.x, target.y), target);
      if (identified?.surfaceId !== id) continue;
      if (info.project.name === "mobile-chromium") await page.touchscreen.tap(box.x + target.x * box.width, box.y + target.y * box.height);
      else {
        await page.mouse.move(box.x + target.x * box.width, box.y + target.y * box.height);
        await page.waitForTimeout(80);
        await page.mouse.click(box.x + target.x * box.width, box.y + target.y * box.height);
      }
      const hit = await page.waitForFunction(id => window.surfaceObjectsHarness.inspect().events.some(event => event.surfaceId === id), id, { timeout: 300 }).then(() => true, () => false);
      if (hit) break;
    }
    expect(await page.evaluate(id => window.surfaceObjectsHarness.inspect().events.some(event => event.surfaceId === id), id)).toBe(true);
  }
  const selected = await page.evaluate(() => window.surfaceObjectsHarness.inspect());
  expect(selected.molecularEvents).toEqual([]);
  expect(selected.camera).toEqual(before.camera);
  const active = selected.objects.find(o => o.id === "second")!;
  expect(active.markers.some(markers => markers.length >= active.atoms.length &&
    markers.slice(0, active.atoms.length).every(value => (value & 1) === 1))).toBe(true);
  await page.evaluate(async () => {
    const harness = window.surfaceObjectsHarness;
    harness.clearActive();
    await harness.setAppearance("first", { mode: "mesh", color: 0x20ff20, alpha: 0.6 });
  });
  const changed = await page.evaluate(() => window.surfaceObjectsHarness.inspect());
  expect(changed.objects[0]).toMatchObject({ mode: "mesh", color: 0x20ff20, alpha: 0.6 });
  expect(changed.objects[0].displayBytes).toBeGreaterThan(0);
  expect(changed.objects[1]).toMatchObject({ mode: "solid", color: 0x2040ff, alpha: 0.8, displayBytes: 0 });
  expect(changed.workers).toEqual(before.workers);
  expect(changed.objects.map(o => o.atoms)).toEqual(before.objects.map(o => o.atoms));
  expect(changed.camera).toEqual(before.camera);
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext("webgl2") ?? element.getContext("webgl"); if (!gl) return 0;
    gl.finish(); const pixels = new Uint8Array(element.width * element.height * 4);
    gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let green = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i] + 30 && pixels[i + 1] > pixels[i + 2] + 30) green++;
    return green;
  })).toBeGreaterThan(20);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(persisted);
  const evidence = JSON.stringify({ before, selected, changed });
  writeFileSync(info.outputPath("surface-object-primitives.json"), evidence);
  await info.attach("surface-object-primitives.json", { body: evidence, contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("surface-object-primitives.png") });
  await page.evaluate(() => window.surfaceObjectsHarness.dispose());
  await expect(canvas).toHaveCount(0);
});
