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
  // Whole-object activation must survive native hover cleanup as the pointer leaves.
  await page.mouse.move(box.x + 2, box.y + 2);
  await page.waitForTimeout(100);
  const afterHover = await page.evaluate(() => window.surfaceObjectsHarness.inspect());
  const highlighted = afterHover.objects.find(o => o.id === "second")!;
  expect(highlighted.markers.some(markers => markers.length >= highlighted.atoms.length && markers.slice(0, highlighted.atoms.length).every(value => (value & 1) === 1))).toBe(true);
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

test("manages production object appearance and explicit sources independently through reload and undo", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    (window as unknown as { surfaceCalculations: number }).surfaceCalculations = 0;
    Worker.prototype.postMessage = function(message: unknown, ...args: [Transferable[]] | [StructuredSerializeOptions] | []) {
      if (message && typeof message === "object" && "x" in message && message.x instanceof Float64Array) (window as unknown as { surfaceCalculations: number }).surfaceCalculations++;
      return Reflect.apply(original, this, [message, ...args]);
    };
  });
  let project: Project = await (await request.post("/api/v1/projects", { data: { name: `Managed surfaces ${Date.now()}` } })).json();
  const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
    expected_revision: "0", files: { name: "protein_editing.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync("tests/fixtures/formats/protein_editing.pdb") },
  } });
  expect(imported.status()).toBe(201); project = (await imported.json()).project;
  const entry = project.entries[0];
  const created = await request.post(`/api/v1/projects/${project.id}/surfaces`, { data: { expected_revision: project.revision, surfaces: [
    { entry_id: entry.id, name: "Whole receptor", source: { kind: "entry" } },
    { entry_id: entry.id, name: "Fragment A", source: { kind: "fragment", profile: "molecular-v1", atom_ids: [1, 2, 3, 4, 5] } },
    { entry_id: entry.id, name: "Fragment B", source: { kind: "fragment", profile: "molecular-v1", atom_ids: [7, 8, 9, 10, 11] } },
    { entry_id: entry.id, name: "Pocket A", source: { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: entry.id, atom_id: 1 }] } },
  ] } });
  expect(created.status()).toBe(200); project = await created.json();
  const saved = structuredClone(project.entries[0].viewer_settings.surface_objects);
  const originalBytes = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body();
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await page.getByRole("button", { name: /^Manage surfaces/ }).click();
  const manager = page.getByRole("dialog", { name: "Surfaces", exact: true });
  await expect(manager.locator(".surface-object-status").filter({ hasText: /ready/ })).toHaveCount(4);
  const calculations = () => page.evaluate(() => (window as unknown as { surfaceCalculations: number }).surfaceCalculations);
  const initialCalculations = await calculations(); expect(initialCalculations).toBe(3);
  let reads = 0; page.on("request", r => { if (r.method() === "GET" && /\/structure(?:\?|$)/.test(r.url())) reads++; });
  await manager.getByRole("button", { name: "Fragment A Captured fragment", exact: true }).click();
  await manager.getByLabel("Surface color scheme").selectOption("custom");
  await manager.getByLabel("Surface opacity").fill("0.3");
  await manager.getByLabel("Surface display").selectOption("mesh");
  await manager.getByRole("button", { name: "Apply appearance" }).click();
  await expect(manager.getByRole("button", { name: "Apply appearance" })).toBeDisabled();
  await expect(manager.locator(".surface-object-status").filter({ hasText: /ready/ })).toHaveCount(4);
  expect(await calculations()).toBe(initialCalculations); expect(reads).toBe(0);
  let current: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const objects = current.entries[0].viewer_settings.surface_objects;
  expect(objects[1].appearance).toMatchObject({ color_by: "custom", mode: "mesh", opacity: 0.3, inherit_atom_colors: false });
  expect([objects[0], objects[2], objects[3]]).toEqual([saved[0], saved[2], saved[3]]);
  await manager.getByRole("button", { name: "Select source atoms" }).click();
  await expect(page.locator(".viewer-status")).toContainText("5 selected");
  await manager.getByRole("button", { name: "Whole receptor Whole entry", exact: true }).click();
  await manager.getByRole("button", { name: "Select source atoms" }).click();
  await expect(page.locator(".viewer-status")).toContainText("22 selected");
  await manager.getByRole("button", { name: "Fragment A Captured fragment", exact: true }).click();
  await manager.getByRole("button", { name: "Replace fragment source" }).click();
  await expect.poll(async () => {
    current = await (await request.get(`/api/v1/projects/${project.id}`)).json();
    const source = current.entries[0].viewer_settings.surface_objects[1].source;
    return source.kind === "fragment" ? source.atom_ids.length : 0;
  }).toBe(22);
  expect(current.entries[0].viewer_settings.surface_objects[1].id).toBe(saved[1].id);
  await manager.getByRole("button", { name: "Pocket A Protein pocket", exact: true }).click();
  await expect(manager.getByText(/20 atoms · complete protein calculation context/)).toBeVisible();
  await manager.getByRole("button", { name: "Select source atoms" }).click();
  await expect(page.locator(".viewer-status")).toContainText("20 selected");
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => {
    const restored: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
    return restored.entries[0].viewer_settings.surface_objects[1].source;
  }).toEqual(saved[1].source);
  const readsBeforeReload = reads;
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await page.getByRole("button", { name: /^Manage surfaces/ }).click();
  await manager.getByRole("button", { name: "Fragment A Captured fragment", exact: true }).click();
  await expect(manager.getByLabel("Surface display")).toHaveValue("mesh");
  await expect(manager.getByLabel("Surface opacity")).toHaveValue("0.3");
  expect(await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body()).toEqual(originalBytes);
  // Inspect native pick identity in this test only, then send a real pointer event.
  await page.evaluate(async () => {
    const path = "/src/viewer/MolstarEngine.ts";
    const { MolstarEngine } = await import(/* @vite-ignore */ path);
    const original = MolstarEngine.prototype.setActiveSurface;
    MolstarEngine.prototype.setActiveSurface = function(...args) {
      (window as unknown as { managedEngine: unknown }).managedEngine = this;
      return original.apply(this, args);
    };
  });
  await manager.getByRole("button", { name: "Whole receptor Whole entry", exact: true }).click();
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  const selectionBeforeClick = await page.locator(".viewer-status").textContent();
  const persistedBeforeClick: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const pick = await page.evaluate(() => {
    const engine = (window as unknown as { managedEngine: {
      getCamera(): unknown;
      plugin: import("molstar/lib/mol-plugin-ui/context").PluginUIContext;
      surfaceVisuals: import("../../apps/web/src/viewer/surface/objects").SurfaceVisualRegistry;
    } }).managedEngine;
    const canvas = engine.plugin.canvas3d!;
    const element = canvas.webgl.gl.canvas as HTMLCanvasElement;
    for (let y = 0.15; y < 0.85; y += 0.05) for (let x = 0.15; x < 0.85; x += 0.05) {
      const pixel = new Float32Array([x * element.clientWidth, y * element.clientHeight]) as import("molstar/lib/mol-math/linear-algebra").Vec2;
      const hit = canvas.identify(pixel);
      const identity = engine.surfaceVisuals.identityFor(canvas.getLoci(hit?.id).repr);
      if (identity) return { x, y, identity, camera: engine.getCamera() };
    }
    return null;
  });
  expect(pick).not.toBeNull();
  const canvasBox = (await page.locator(".molstar-host canvas").first().boundingBox())!;
  if (info.project.name === "mobile-chromium") await page.touchscreen.tap(canvasBox.x + pick!.x * canvasBox.width, canvasBox.y + pick!.y * canvasBox.height);
  else await page.mouse.click(canvasBox.x + pick!.x * canvasBox.width, canvasBox.y + pick!.y * canvasBox.height);
  await expect(manager).toBeVisible();
  const pickedName = saved.find(surface => surface.id === pick!.identity.surfaceId)!.name;
  await expect(manager.locator('.surface-object[data-active="true"] .surface-object-label')).toContainText(pickedName);
  expect(await page.locator(".viewer-status").textContent()).toBe(selectionBeforeClick);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(persistedBeforeClick);
  expect(await page.evaluate(() => (window as unknown as { managedEngine: { getCamera(): unknown } }).managedEngine.getCamera())).toEqual(pick!.camera);
  await page.screenshot({ path: info.outputPath("managed-surface-appearance.png") });
  writeFileSync(info.outputPath("managed-surface-appearance.json"), JSON.stringify({ initialCalculations, readsBeforeReload, savedObjectIds: saved.map(surface => surface.id), finalObjectIds: current.entries[0].viewer_settings.surface_objects.map(surface => surface.id) }, null, 2));
});
