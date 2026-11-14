import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import type { ImportResult, Project, StructureProjection } from "../../apps/web/src/api/types";
import type { mountSurfaceObjectsHarness } from "../../apps/web/src/test/surfaceObjectsHarness";
import type * as SurfaceObjectsHarnessModule from "../../apps/web/src/test/surfaceObjectsHarness";
import type * as SelectionSurfaceHarnessModule from "../../apps/web/src/test/selectionSurfaceHarness";
import type * as MolstarEngineModule from "../../apps/web/src/viewer/MolstarEngine";
import type * as SurfaceClientModule from "../../apps/web/src/viewer/surface/client";
import type { ViewerStructure } from "../../apps/web/src/viewer/MolecularViewer";
import type { SurfaceVisualRegistry } from "../../apps/web/src/viewer/surface/objects";
import type { PluginUIContext } from "../../apps/web/node_modules/molstar/lib/mol-plugin-ui/context";
import type { Vec2 } from "../../apps/web/node_modules/molstar/lib/mol-math/linear-algebra";

type WorkerPostMessage = (this: Worker, message: unknown, ...args: [Transferable[]] | [StructuredSerializeOptions?]) => void;

declare global {
  interface Window { surfaceObjectsHarness: Awaited<ReturnType<typeof mountSurfaceObjectsHarness>> }
}

async function openSource(manager: Locator) {
  const source = manager.locator(".surface-source-details");
  if (!await source.evaluate(node => (node as HTMLDetailsElement).open)) await source.locator("summary").click();
}
async function appearanceSaved(manager: Locator) {
  await expect(manager.getByLabel("Surface color scheme")).toHaveAttribute("aria-disabled", "false");
}

test("native same-entry surface objects have independent identity, colors, mesh and whole-object activation", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const created = await request.post("/api/v1/projects", { data: { name: `Surface objects C1 ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const initial: Project = await created.json() as Project;
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, {
    multipart: { expected_revision: "0", files: { name: "1stp.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync(resolve("tests/fixtures/complex/1stp.pdb")) } },
  });
  expect(imported.status()).toBe(201);
  const project: Project = (await imported.json() as ImportResult).project;
  const entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json() as StructureProjection;
  const persisted = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  await page.goto("/selection-surface-test.html");
  await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/surfaceObjectsHarness.ts";
    const { mountSurfaceObjectsHarness } = await import(/* @vite-ignore */ path) as typeof SurfaceObjectsHarnessModule;
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
    const activated = await page.evaluate(id => window.surfaceObjectsHarness.inspect().events.some(event => event.surfaceId === id), id);
    if (!activated) console.error("Native surface activation observation", await page.evaluate(() => {
      const { camera, picks, events, molecularEvents } = window.surfaceObjectsHarness.inspect();
      return { camera, picks, events, molecularEvents };
    }));
    expect(activated).toBe(true);
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
  expect(changed.objects[0].displayBytes).toBeGreaterThan(changed.objects[0].mappingBytes);
  expect(changed.objects[1]).toMatchObject({ mode: "solid", color: 0x2040ff, alpha: 0.8 });
  expect(changed.objects[1].displayBytes).toBe(changed.objects[1].mappingBytes);
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
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project).toEqual(persisted);
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
    const original = Reflect.get(Worker.prototype, "postMessage") as WorkerPostMessage;
    const terminate = Reflect.get(Worker.prototype, "terminate") as (this: Worker) => void;
    const active = new Set<Worker>();
    const stats = window as unknown as { surfaceCalculations: number; surfaceActive: number; surfaceMaximum: number };
    stats.surfaceCalculations = 0; stats.surfaceActive = 0; stats.surfaceMaximum = 0;
    Worker.prototype.terminate = function() {
      active.delete(this); stats.surfaceActive = active.size;
      return terminate.call(this);
    };
    Worker.prototype.postMessage = function(message: unknown, ...args: [Transferable[]] | [StructuredSerializeOptions?]) {
      if (message && typeof message === "object" && "x" in message && message.x instanceof Float64Array) {
        stats.surfaceCalculations++; active.add(this); stats.surfaceActive = active.size;
        stats.surfaceMaximum = Math.max(stats.surfaceMaximum, active.size);
      }
      return original.call(this, message, ...args);
    };
  });
  let project: Project = await (await request.post("/api/v1/projects", { data: { name: `Managed surfaces ${Date.now()}` } })).json() as Project;
  const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
    expected_revision: "0", files: { name: "protein_editing.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync("tests/fixtures/formats/protein_editing.pdb") },
  } });
  expect(imported.status()).toBe(201); project = (await imported.json() as ImportResult).project;
  const entry = project.entries[0];
  const created = await request.post(`/api/v1/projects/${project.id}/surfaces`, { data: { expected_revision: project.revision, surfaces: [
    { entry_id: entry.id, name: "Whole receptor", source: { kind: "entry" } },
    { entry_id: entry.id, name: "Fragment A", source: { kind: "fragment", profile: "molecular-v1", atom_ids: [1, 2, 3, 4, 5] } },
    { entry_id: entry.id, name: "Fragment B", source: { kind: "fragment", profile: "molecular-v1", atom_ids: [7, 8, 9, 10, 11] } },
    { entry_id: entry.id, name: "Pocket A", source: { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: entry.id, atom_id: 1 }] } },
    { entry_id: entry.id, name: "Pocket B", source: { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: entry.id, atom_id: 10 }] } },
  ] } });
  expect(created.status()).toBe(200); project = await created.json() as Project;
  const saved = structuredClone(project.entries[0].viewer_settings.surface_objects);
  const originalBytes = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body();
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await page.getByRole("button", { name: /^Manage surfaces/ }).click();
  const manager = page.getByRole("dialog", { name: "Surfaces", exact: true });
  await expect(manager.locator(".surface-object-status").filter({ hasText: /ready/ })).toHaveCount(5);
  const calculations = () => page.evaluate(() => (window as unknown as { surfaceCalculations: number }).surfaceCalculations);
  const initialCalculations = await calculations(); expect(initialCalculations).toBe(5);
  expect(await page.evaluate(() => (window as unknown as { surfaceMaximum: number }).surfaceMaximum)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { surfaceActive: number }).surfaceActive)).toBe(0);
  let reads = 0; page.on("request", r => { if (r.method() === "GET" && /\/structure(?:\?|$)/.test(r.url())) reads++; });
  await manager.getByRole("button", { name: "Fragment A Captured fragment", exact: true }).click();
  await manager.getByLabel("Surface color scheme").selectOption("custom");
  await appearanceSaved(manager);
  await manager.getByLabel("Surface opacity", { exact: true }).fill("0.3");
  await manager.getByLabel("Surface opacity", { exact: true }).press("Enter");
  await appearanceSaved(manager);
  await expect(manager.getByLabel("Surface opacity", { exact: true })).toBeFocused();
  await manager.getByLabel("Surface display").selectOption("mesh");
  await appearanceSaved(manager);
  await expect(manager.locator(".surface-object-status").filter({ hasText: /ready/ })).toHaveCount(5);
  expect(await calculations()).toBe(initialCalculations); expect(reads).toBe(0);
  let current: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  expect(current.revision).toBe(project.revision + 3); // One command per completed control gesture.
  const objects = current.entries[0].viewer_settings.surface_objects;
  expect(objects[1].appearance).toMatchObject({ color_by: "custom", mode: "mesh", opacity: 0.3, inherit_atom_colors: false });
  expect([objects[0], objects[2], objects[3], objects[4]]).toEqual([saved[0], saved[2], saved[3], saved[4]]);
  await openSource(manager);
  await manager.getByRole("button", { name: "Select source atoms" }).click();
  await expect(page.locator(".viewer-status")).toContainText("5 selected");
  await manager.getByRole("button", { name: "Whole receptor Whole entry", exact: true }).click();
  await openSource(manager);
  await manager.getByRole("button", { name: "Select source atoms" }).click();
  await expect(page.locator(".viewer-status")).toContainText("22 selected");
  await manager.getByRole("button", { name: "Fragment A Captured fragment", exact: true }).click();
  await openSource(manager);
  await manager.getByRole("button", { name: "Capture fragment from selection" }).click();
  await expect(manager.getByText("Unapplied changes", { exact: false })).toBeVisible();
  await manager.getByRole("button", { name: "Apply source", exact: true }).click();
  await expect.poll(async () => {
    current = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
    const source = current.entries[0].viewer_settings.surface_objects[1].source;
    return source.kind === "fragment" ? source.atom_ids.length : 0;
  }).toBe(22);
  expect(current.entries[0].viewer_settings.surface_objects[1].id).toBe(saved[1].id);
  await manager.getByRole("button", { name: "Pocket A Protein pocket", exact: true }).click();
  await openSource(manager);
  await expect(manager.getByText(/20 atoms · complete protein calculation context/)).toBeVisible();
  await manager.getByRole("button", { name: "Select seeds", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 selected");
  await manager.getByRole("button", { name: "Select protein context", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText("20 selected");
  await manager.getByLabel("Surface pocket radius").fill("5.5");
  await manager.getByRole("button", { name: "Apply source", exact: true }).click();
  await expect.poll(async () => {
    const latest: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
    const source = latest.entries[0].viewer_settings.surface_objects[3].source;
    return source.kind === "pocket" ? source.radius : 0;
  }).toBe(5.5);
  await manager.getByRole("button", { name: "Capture seeds from selection" }).click();
  await manager.getByRole("button", { name: "Apply source", exact: true }).click();
  await expect.poll(async () => {
    const latest: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
    expect(latest.entries[0].viewer_settings.surface_objects[4]).toEqual(saved[4]);
    const source = latest.entries[0].viewer_settings.surface_objects[3].source;
    return source.kind === "pocket" ? source.seed_atom_references.length : 0;
  }).toBe(20);
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  // Undo explicit seed replacement, radius replacement, then fragment replacement.
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => {
    const restored: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
    return restored.entries[0].viewer_settings.surface_objects[1].source;
  }).toEqual(saved[1].source);
  const readsBeforeReload = reads;
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await page.getByRole("button", { name: /^Manage surfaces/ }).click();
  await manager.getByRole("button", { name: "Fragment A Captured fragment", exact: true }).click();
  await expect(manager.getByLabel("Surface display")).toHaveValue("mesh");
  await expect(manager.getByLabel("Surface opacity", { exact: true })).toHaveValue("0.3");
  expect(await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body()).toEqual(originalBytes);
  // Inspect native pick identity in this test only, then send a real pointer event.
  await page.evaluate(async () => {
    const path = "/src/viewer/MolstarEngine.ts";
    const { MolstarEngine } = await import(/* @vite-ignore */ path) as typeof MolstarEngineModule;
    const original = Reflect.get(MolstarEngine.prototype, "setActiveSurface");
    MolstarEngine.prototype.setActiveSurface = function(...args: Parameters<typeof original>) {
      (window as unknown as { managedEngine: unknown }).managedEngine = this;
      return original.apply(this, args);
    };
  });
  await manager.getByRole("button", { name: "Whole receptor Whole entry", exact: true }).click();
  // Reload starts asynchronous work for all five objects. Measure display-only
  // changes after that initial work is ready, as in the pre-reload assertion.
  await expect(manager.locator(".surface-object-status").filter({ hasText: /ready/ })).toHaveCount(5);
  await expect.poll(() => page.evaluate(() => (window as unknown as { surfaceActive: number }).surfaceActive)).toBe(0);
  const workerCountBeforeNativeStyle = await calculations();
  await manager.getByLabel("Surface color scheme").selectOption("custom");
  await appearanceSaved(manager);
  await manager.getByLabel("Surface opacity", { exact: true }).fill("1");
  await manager.getByLabel("Surface opacity", { exact: true }).press("Enter");
  await appearanceSaved(manager);
  await manager.getByLabel("Surface display").selectOption("mesh");
  await appearanceSaved(manager);
  await manager.getByLabel("Surface uniform color").evaluate((node: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, "#00ff00");
    node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await appearanceSaved(manager);
  await expect.poll(async () => {
    const latest: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
    return latest.entries[0].viewer_settings.surface_objects[0].appearance.custom_color;
  }).toBe("#00ff00");
  const readNativeDisplay = () => page.evaluate(async id => {
    const engine = (window as unknown as { managedEngine: {
      setActiveSurface(value: null): void;
      plugin: PluginUIContext;
      syncQueue: Promise<void>;
    } }).managedEngine;
    await engine.syncQueue;
    engine.setActiveSurface(null); // Measure theme pixels independently of transient highlight.
    const repr = [...engine.plugin.state.data.cells.values()].find(cell => cell.transform.tags?.includes(`neistra-representation-surface-${id}`));
    const data = repr?.obj?.data as { repr: { renderObjects: { type: string; values: { drawCount: { ref: { value: number } } } }[] } } | undefined;
    return data?.repr.renderObjects.map(object => ({ type: object.type, drawCount: object.values.drawCount.ref.value })) ?? [];
  }, saved[0].id);
  await expect.poll(async () => {
    const display = await readNativeDisplay();
    return display.length > 0 && display.every(object => object.type === "lines" && object.drawCount > 0);
  }).toBe(true);
  const nativeDisplay = await readNativeDisplay();
  const nativeGreenPixels = () => page.locator(".molstar-host canvas").first().evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl"); if (!gl) throw new Error("WebGL unavailable");
    gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i] + 40 && pixels[i + 1] > pixels[i + 2] + 40) count++;
    return count;
  });
  await expect.poll(nativeGreenPixels).toBeGreaterThan(20);
  const nativeGreenPixelCount = await nativeGreenPixels();
  expect(await calculations()).toBe(workerCountBeforeNativeStyle);
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  const selectionBeforeClick = await page.locator(".viewer-status").textContent();
  const persistedBeforeClick: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  const pick = await page.evaluate(wantedId => {
    const engine = (window as unknown as { managedEngine: {
      getCamera(): unknown;
      plugin: PluginUIContext;
      surfaceVisuals: SurfaceVisualRegistry;
    } }).managedEngine;
    const canvas = engine.plugin.canvas3d!;
    const element = canvas.webgl.gl.canvas as HTMLCanvasElement;
    const gl = canvas.webgl.gl;
    gl.finish(); const pixels = new Uint8Array(element.width * element.height * 4);
    gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // The independently verified green entry wireframe provides actual visible hit candidates.
    let sampled = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (!(pixels[i + 1] > pixels[i] + 40 && pixels[i + 1] > pixels[i + 2] + 40) || sampled++ % 20) continue;
      const x = ((i / 4) % element.width + 0.5) / element.width;
      const y = 1 - (Math.floor(i / 4 / element.width) + 0.5) / element.height;
      // Native mouse events use integer client coordinates. Validate the same
      // reachable point rather than a half-pixel center on a thin wireframe.
      const rect = element.getBoundingClientRect();
      const clientX = Math.round(rect.left + x * rect.width), clientY = Math.round(rect.top + y * rect.height);
      const point = new Float32Array([clientX - rect.left, clientY - rect.top]) as unknown as Vec2;
      const hit = canvas.identify(point);
      const identity = engine.surfaceVisuals.identityFor(canvas.getLoci(hit?.id).repr);
      if (identity?.surfaceId === wantedId) return { x, y, clientX, clientY, identity, camera: engine.getCamera() };
    }
    return null;
  }, saved[0].id);
  expect(pick).not.toBeNull();
  const canvasBox = (await page.locator(".molstar-host canvas").first().boundingBox())!;
  const clickSurface = async () => {
    if (info.project.name === "mobile-chromium") await page.touchscreen.tap(pick!.clientX, pick!.clientY);
    else await page.mouse.click(pick!.clientX, pick!.clientY);
  };
  // Keep the old native pixels visible while a subsequent structural rebuild waits.
  await page.evaluate(() => {
    const engine = (window as unknown as { managedEngine: {
      syncQueue: Promise<void>; structures: ViewerStructure[];
      syncStructures(value: ViewerStructure[]): Promise<void>;
    } }).managedEngine;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    engine.syncQueue = engine.syncQueue.then(() => gate);
    // A real nonsurface input change exercises conservative full rebuilding;
    // identical surface-only inputs now correctly avoid that work.
    const done = engine.syncStructures(engine.structures.map(source => ({ ...source, label: `${source.label} (rebuild)` })));
    const state = window as unknown as { finishManagedRebuild: () => void; managedRebuildStatus: string };
    state.managedRebuildStatus = "pending";
    state.finishManagedRebuild = () => {
      release();
      void done.then(() => { state.managedRebuildStatus = "complete"; }, (error: unknown) => {
        state.managedRebuildStatus = `failed: ${String(error)}`;
      });
    };
  });
  await clickSurface();
  await page.waitForTimeout(250);
  expect(await page.locator(".viewer-status").textContent()).toBe(selectionBeforeClick);
  await expect(manager).toBeHidden();
  // Observe completion as serializable state rather than transferring the native
  // rebuild promise through one long-lived DevTools execution context.
  await page.evaluate(() => (window as unknown as { finishManagedRebuild: () => void }).finishManagedRebuild());
  await expect.poll(() => page.evaluate(() => (window as unknown as { managedRebuildStatus: string }).managedRebuildStatus)).toBe("complete");
  const rebuildStatusesBeforeInstallation = await page.evaluate(() => (window as unknown as { managedEngine: {
    surfaces: { statuses(): { surfaceId: string; state: string; message: string }[] };
  } }).managedEngine.surfaces.statuses());
  // Structural loading queues the independent worker displays. Completion of
  // syncStructures does not establish that those displays have been installed.
  await expect.poll(() => page.evaluate(entryId => (window as unknown as { managedEngine: {
    surfaces: { statuses(): { entryId: string; state: string }[] };
  } }).managedEngine.surfaces.statuses().filter(status => status.entryId === entryId && status.state === "ready").length, entry.id)).toBe(5);
  await page.evaluate(async () => { await (window as unknown as { managedEngine: { syncQueue: Promise<void> } }).managedEngine.syncQueue; });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const rebuiltNativeHit = await page.evaluate(point => {
    const engine = (window as unknown as { managedEngine: {
      plugin: PluginUIContext;
      surfaceVisuals: SurfaceVisualRegistry;
    } }).managedEngine;
    const canvas = engine.plugin.canvas3d!, element = canvas.webgl.gl.canvas as HTMLCanvasElement;
    const rect = element.getBoundingClientRect();
    const hit = canvas.identify(new Float32Array([point.clientX - rect.left, point.clientY - rect.top]) as unknown as Vec2);
    return engine.surfaceVisuals.identityFor(canvas.getLoci(hit?.id).repr);
  }, pick!);
  expect(rebuiltNativeHit).toEqual(pick!.identity);
  await page.evaluate(() => {
    const engine = (window as unknown as { managedEngine: {
      plugin: PluginUIContext;
      surfaceVisuals: SurfaceVisualRegistry;
    } }).managedEngine;
    const state = window as unknown as { managedClickEvidence: unknown[] };
    state.managedClickEvidence = [];
    engine.plugin.behaviors.interaction.click.subscribe(event => state.managedClickEvidence.push({
      identity: engine.surfaceVisuals.identityFor(event.current.repr), page: event.page ? Array.from(event.page) : undefined,
      camera: engine.plugin.canvas3d?.camera.getSnapshot(),
    }));
  });
  await clickSurface();
  await expect(manager).toBeVisible();
  writeFileSync(info.outputPath("managed-rebuild-click.json"), JSON.stringify({ pick, rebuiltNativeHit, canvasBox,
    clicks: await page.evaluate(() => (window as unknown as { managedClickEvidence: unknown[] }).managedClickEvidence) }, null, 2));
  const pickedName = saved.find(surface => surface.id === pick!.identity.surfaceId)!.name;
  await expect(manager.locator('.surface-object[data-active="true"] .surface-object-label')).toContainText(pickedName);
  expect(await page.locator(".viewer-status").textContent()).toBe(selectionBeforeClick);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project).toEqual(persistedBeforeClick);
  expect(await page.evaluate(() => (window as unknown as { managedEngine: { getCamera(): unknown } }).managedEngine.getCamera())).toEqual(pick!.camera);
  const nativeMarkerCounts = await page.evaluate(id => {
    const engine = (window as unknown as { managedEngine: { plugin: PluginUIContext } }).managedEngine;
    const cell = [...engine.plugin.state.data.cells.values()].find(item => item.transform.tags?.includes(`neistra-representation-surface-${id}`));
    const repr = cell?.obj?.data as { repr: { renderObjects: { values: {
      uGroupCount: { ref: { value: number } }; instanceCount: { ref: { value: number } };
      tMarker: { ref: { value: { array: Uint8Array } } };
    } }[] } };
    return repr.repr.renderObjects.map(object => {
      const count = object.values.uGroupCount.ref.value * object.values.instanceCount.ref.value;
      const markers = Array.from(object.values.tMarker.ref.value.array).slice(0, count);
      return { count, highlighted: markers.filter(value => (value & 1) === 1).length };
    });
  }, saved[0].id);
  expect(nativeMarkerCounts.length).toBeGreaterThan(0);
  expect(nativeMarkerCounts.every(object => object.count > 0 && object.highlighted === object.count)).toBe(true);
  await page.screenshot({ path: info.outputPath("managed-surface-appearance.png") });
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  // Hold a narrow removal while the old pixels remain. Those retired hits must
  // neither activate an object nor fall through to molecular atom selection.
  await page.evaluate(id => {
    const state = window as unknown as { managedEngine: {
      syncQueue: Promise<void>; structures: ViewerStructure[];
      syncStructures(value: ViewerStructure[]): Promise<void>;
      loadStructure(value: ViewerStructure): Promise<void>;
      surfaces: { requests: Map<string, { geometry?: object }>; statuses(): { state: string }[] };
    }; surfaceCalculations: number; narrowRemovalStatus: string; finishNarrowRemoval: () => void;
      restoreNarrowRemoval: () => Promise<{ loads: number; workersBefore: number; workersAfterRemoval: number; workersAfterRestore: number; otherGeometryRetained: boolean }> };
    const engine = state.managedEngine, sources = engine.structures, workersBefore = state.surfaceCalculations;
    const originalLoad = engine.loadStructure.bind(engine); let loads = 0;
    engine.loadStructure = source => { loads++; return originalLoad(source); };
    const geometry = new Map([...engine.surfaces.requests].filter(([key]) => !key.includes(id)).map(([key, value]) => [key, value.geometry]));
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    engine.syncQueue = engine.syncQueue.then(() => gate);
    const done = engine.syncStructures(sources.map(source => ({ ...source, settings: { ...source.settings,
      surface_objects: source.settings.surface_objects.filter(surface => surface.id !== id) } })));
    state.narrowRemovalStatus = "pending";
    state.finishNarrowRemoval = () => { release(); void done.then(() => { state.narrowRemovalStatus = "complete"; }, error => { state.narrowRemovalStatus = `failed: ${String(error)}`; }); };
    state.restoreNarrowRemoval = async () => {
      const workersAfterRemoval = state.surfaceCalculations;
      await engine.syncStructures(sources);
      const deadline = performance.now() + 10_000;
      while (engine.surfaces.statuses().some(status => status.state !== "ready")) {
        if (performance.now() > deadline) throw new Error("Restored surface did not install");
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await engine.syncQueue;
      engine.loadStructure = originalLoad;
      return { loads, workersBefore, workersAfterRemoval, workersAfterRestore: state.surfaceCalculations,
        otherGeometryRetained: [...geometry].every(([key, value]) => engine.surfaces.requests.get(key)?.geometry === value) };
    };
  }, saved[0].id);
  await clickSurface(); await page.waitForTimeout(100);
  await expect(manager).toBeHidden();
  expect(await page.locator(".viewer-status").textContent()).toBe(selectionBeforeClick);
  await page.evaluate(() => (window as unknown as { finishNarrowRemoval: () => void }).finishNarrowRemoval());
  await expect.poll(() => page.evaluate(() => (window as unknown as { narrowRemovalStatus: string }).narrowRemovalStatus)).toBe("complete");
  const narrowRemoval = await page.evaluate(() => (window as unknown as { restoreNarrowRemoval: () => Promise<{
    loads: number; workersBefore: number; workersAfterRemoval: number; workersAfterRestore: number; otherGeometryRetained: boolean;
  }> }).restoreNarrowRemoval());
  expect(narrowRemoval.loads).toBe(0); expect(narrowRemoval.otherGeometryRetained).toBe(true);
  expect(narrowRemoval.workersAfterRemoval).toBe(narrowRemoval.workersBefore);
  expect(narrowRemoval.workersAfterRestore).toBe(narrowRemoval.workersBefore + 1);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project).toEqual(persistedBeforeClick);
  writeFileSync(info.outputPath("managed-surface-appearance.json"), JSON.stringify({ initialCalculations, readsBeforeReload, nativeDisplay, nativeGreenPixels: nativeGreenPixelCount, nativeMarkerCounts, workerCountBeforeNativeStyle, rebuildStatusesBeforeInstallation, rebuiltNativeHit, narrowRemoval, savedObjectIds: saved.map(surface => surface.id), finalObjectIds: current.entries[0].viewer_settings.surface_objects.map(surface => surface.id) }, null, 2));
});

test("keeps manager controls keyboard reachable, bounded and accessible with long names and narrow layouts", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  let project: Project = await (await request.post("/api/v1/projects", { data: { name: `Surface access ${Date.now()}` } })).json() as Project;
  const uploaded = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
    expected_revision: "0", files: { name: "ethanol.mol", mimeType: "chemical/x-mdl-molfile", buffer: readFileSync("tests/fixtures/formats/ethanol.mol") },
  } });
  expect(uploaded.status()).toBe(201); project = (await uploaded.json() as ImportResult).project;
  const name = "Long captured fragment name with meaningful words ".repeat(3).slice(0, 120);
  const created = await request.post(`/api/v1/projects/${project.id}/surfaces`, { data: { expected_revision: project.revision,
    surfaces: Array.from({ length: 16 }, (_, index) => ({ entry_id: project.entries[0].id,
      name: index === 0 ? name : `${index + 1} ${name}`.slice(0, 120),
      source: { kind: "fragment", profile: "molecular-v1", atom_ids: [1, 2, 3] } })) } });
  expect(created.status()).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  const launcher = page.getByRole("button", { name: "Style selection", exact: true });
  const manager = page.getByRole("dialog", { name: "Surfaces", exact: true });
  for (const width of [info.project.name === "chromium" ? 1366 : 393, 320]) {
    await page.setViewportSize({ width, height: 850 });
    for (const theme of ["light", "dark"]) {
      const switcher = page.getByRole("button", { name: `Use ${theme} theme` });
      if (await switcher.count()) await switcher.click();
      await launcher.focus(); await page.keyboard.press("Enter");
      await page.getByRole("button", { name: /^Manage surfaces/ }).focus(); await page.keyboard.press("Enter");
      await expect(manager).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(manager.getByRole("button", { name: "Create surface", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(manager.getByRole("button", { name: "Close surfaces" })).toBeFocused();
      await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
      const rows = manager.locator(".surface-object-label");
      await expect(rows).toHaveCount(16);
      await rows.last().focus(); await page.keyboard.press("Enter");
      await expect(manager.getByRole("button", { name: "Close surfaces" })).toBeInViewport();
      await rows.first().focus(); await page.keyboard.press("Enter");
      await manager.getByRole("button", { name: `Rename surface ${name.trim()}`, exact: true }).click();
      await expect(manager.getByLabel("Surface name")).toHaveValue(name.trim());
      await manager.getByLabel("Surface color scheme").selectOption("custom");
      const outside = page.getByRole("button", { name: "Fit all visible", exact: true });
      await outside.focus(); await page.keyboard.press("Escape");
      await expect(manager).toBeVisible(); await expect(outside).toBeFocused();
      await manager.getByLabel("Surface name").focus();
      await expect.poll(() => manager.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
      // Exercise disclosed controls too. Chromium can expose layout boxes for
      // inputs inside closed details even though scrolling cannot reveal them.
      for (const summary of await manager.locator("details > summary").all()) {
        if (!await summary.evaluate(node => (node.parentElement as HTMLDetailsElement).open)) await summary.click();
      }
      await expect(manager.locator(".surface-object-status")).toHaveText(Array.from({ length: 16 }, () => "3 atoms · ready"));
      const violations = await new AxeBuilder({ page }).include(".surface-manager").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(violations.violations).toEqual([]);
      for (const control of await manager.locator("button:visible, input:visible, select:visible").all()) {
        await control.scrollIntoViewIfNeeded();
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(851);
        if (info.project.name === "mobile-chromium" && await control.evaluate(node => node.tagName !== "INPUT" || (node as HTMLInputElement).type !== "checkbox")) expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(await manager.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await manager.getByLabel("Surface opacity", { exact: true }).scrollIntoViewIfNeeded();
      await manager.getByLabel("Surface opacity", { exact: true }).focus();
      await page.screenshot({ path: info.outputPath(`manager-${theme}-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(manager).toBeVisible(); // The focused appearance gesture owns the first Escape.
      await page.keyboard.press("Escape");
      await expect(manager).toBeHidden(); await expect(launcher).toBeFocused();
    }
  }
});

test("keeps queued same-entry surface inputs lazy and valid across a renderer rebuild", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const initial: Project = await (await request.post("/api/v1/projects", { data: { name: `Queued surfaces ${Date.now()}` } })).json() as Project;
  const uploaded = await request.post(`/api/v1/projects/${initial.id}/imports`, { multipart: {
    expected_revision: "0", files: { name: "1stp.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync("tests/fixtures/complex/1stp.pdb") },
  } });
  expect(uploaded.status()).toBe(201);
  const project: Project = (await uploaded.json() as ImportResult).project, entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json() as StructureProjection;
  await page.goto("/selection-surface-test.html");
  const result = await page.evaluate(async ({ entry, projection }) => {
    const harnessPath = "/src/test/selectionSurfaceHarness.ts", clientPath = "/src/viewer/surface/client.ts";
    const { mountProductionSurfaceHarness, fixtureSurface } = await import(/* @vite-ignore */ harnessPath) as typeof SelectionSurfaceHarnessModule;
    const { SurfaceCalculator } = await import(/* @vite-ignore */ clientPath) as typeof SurfaceClientModule;
    const container = document.createElement("div"); Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
    const settings = structuredClone(entry.viewer_settings); settings.representations = [];
    const harness = await mountProductionSurfaceHarness(container, { entryId: entry.id, label: entry.name, projection: projection.viewer,
      atomIds: entry.atom_ids, normalized: projection.structure, hierarchy: projection.hierarchy, settings });
    const originalCompute = Reflect.get(SurfaceCalculator.prototype, "compute");
    let descriptors = 0, extractions = 0;
    SurfaceCalculator.prototype.compute = function(input: Parameters<typeof originalCompute>[0], ...args: [signal: AbortSignal, progress?: (message: string) => void]) {
      descriptors++;
      if (typeof input !== "function") throw new Error("Production queued a materialized calculation input");
      return originalCompute.call(this, () => { extractions++; return input(); }, ...args);
    };
    const post = Reflect.get(Worker.prototype, "postMessage") as WorkerPostMessage;
    let release!: () => void, held = false;
    Worker.prototype.postMessage = function(message: unknown, ...args: [Transferable[]] | [StructuredSerializeOptions?]) {
      if (!held && message && typeof message === "object" && "x" in message) {
        held = true; release = () => post.call(this, message, ...args); return;
      }
      return post.call(this, message, ...args);
    };
    const seed = projection.structure.atoms[0];
    harness.source.settings.surface_objects = ["fragmentA", "fragmentB", "pocketA", "pocketB"].map(id => ({
      ...fixtureSurface(id.startsWith("fragment") ? { kind: "fragment", profile: "molecular-v1", atom_ids: entry.atom_ids }
        : { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: entry.id, atom_id: seed.id }] }), id, name: id,
    }));
    harness.source.pockets = Object.fromEntries(["pocketA", "pocketB"].map(id => [id, {
      radius: 5, dependencyKey: id, seeds: [{ reference: { structure_id: entry.id, atom_id: seed.id }, coordinates: seed.coordinates }],
    }]));
    await harness.engine.syncStructures([harness.source]);
    const queued = { descriptors, extractions, states: harness.inspect().statuses.map(status => status.state) };
    if (!held) throw new Error("The first actual worker input was not intercepted");
    harness.source.settings.surface_objects[0].name = "Renamed while queued";
    harness.source.settings.surface_objects[0].appearance = { ...harness.source.settings.surface_objects[0].appearance, opacity: 0.3, mode: "mesh" };
    harness.source.label += " (queued rebuild)";
    await harness.engine.syncStructures([harness.source]); // A nonsurface change rebuilds disposable components.
    harness.engine.cancelSurface(entry.id, "pocket", "pocketB");
    const beforeRelease = { descriptors, extractions };
    release(); await harness.wait();
    const inspected = harness.inspect();
    const final = { statuses: inspected.statuses, workers: inspected.workers, meshes: inspected.meshes };
    const after = { descriptors, extractions };
    harness.dispose(); SurfaceCalculator.prototype.compute = originalCompute;
    return { queued, beforeRelease, after, final };
  }, { entry, projection });
  expect(result.queued.descriptors).toBe(4); expect(result.queued.extractions).toBe(1);
  expect(result.beforeRelease).toEqual({ descriptors: 4, extractions: 1 });
  expect(result.after).toEqual({ descriptors: 4, extractions: 3 });
  expect(result.final.statuses.map(status => [status.surfaceId, status.state])).toEqual([
    ["fragmentA", "ready"], ["fragmentB", "ready"], ["pocketA", "ready"], ["pocketB", "cancelled"],
  ]);
  expect(result.final.workers.maximum).toBe(1); expect(result.final.workers.active).toBe(0);
  writeFileSync(info.outputPath("queued-object-inputs.json"), JSON.stringify(result, null, 2));
});
