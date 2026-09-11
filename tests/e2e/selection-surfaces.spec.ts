import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import type { mountProductionSurfaceHarness, mountSurfaceHarness } from "../../apps/web/src/test/selectionSurfaceHarness";

declare global {
  interface Window { productionSurface: Awaited<ReturnType<typeof mountProductionSurfaceHarness>>; surfaceHarness: Awaited<ReturnType<typeof mountSurfaceHarness>> }
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
  const other: Project = await (await request.post("/api/v1/projects", { data: { name: `Other surface context ${Date.now()}` } })).json();
  const otherImport = await request.post(`/api/v1/projects/${other.id}/imports`, { multipart: {
    expected_revision: "0", files: { name: "ethanol.mol", mimeType: "chemical/x-mdl-molfile", buffer: readFileSync(resolve("tests/fixtures/formats/ethanol.mol")) },
  } });
  expect(otherImport.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 45_000 });
  const row = page.locator(`.entry-row[data-entry-id="${entry.id}"]`);
  await row.locator(".entry-select").click();
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Style selection" });
  let structureGets = 0;
  page.on("request", (req) => { if (req.method() === "GET" && /\/entries\/[^/]+\/structure(?:\?|$)/.test(req.url())) structureGets++; });
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
  expect(structureGets).toBe(0);
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
  // Returning to an already cached project must dispose the previous viewer too.
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${other.name}`) }).click();
  await expect(page.getByLabel("Selection surface rendering")).toHaveCount(0);
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  const otherCanvas = await page.locator(".molstar-host canvas").first().elementHandle();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.getByLabel("Selection surface rendering")).toContainText("ready");
  expect(await otherCanvas!.evaluate((canvas) => canvas.isConnected)).toBe(false);
});

for (const fixture of ["formats/ethanol.mol", "hydrogens/polar_hydrogens_ligand.mol"]) {
  test(`qualifies production surface lifecycle for ${fixture}`, async ({ page, request }, info) => {
    test.setTimeout(90_000);
    const created = await request.post("/api/v1/projects", { data: { name: `Surface production ${Date.now()}` } });
    const initial: Project = await created.json();
    const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, { multipart: {
      expected_revision: "0", files: { name: fixture.split("/").at(-1)!, mimeType: "chemical/x-mdl-molfile", buffer: readFileSync(resolve(`tests/fixtures/${fixture}`)) },
    } });
    expect(imported.status()).toBe(201);
    const project: Project = (await imported.json()).project;
    const entry = project.entries[0];
    const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
    const hydrogen = fixture.includes("hydrogens/");
    await page.goto("/selection-surface-test.html");
    const initialState = await page.evaluate(async ({ entry, projection, hydrogen }) => {
      const path = "/src/test/selectionSurfaceHarness.ts";
      const { mountProductionSurfaceHarness } = await import(/* @vite-ignore */ path);
      const container = document.createElement("div");
      Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
      const settings = structuredClone(entry.viewer_settings);
      settings.representations = [];
      settings.components.hydrogens = true; settings.components.nonpolar_hydrogens = false;
      settings.selection_surface = { profile: "molecular-v1", atom_ids: hydrogen ? [2, 4] : entry.atom_ids };
      if (!hydrogen) settings.selection_colors = [{ color: "#ff00ff", atom_ids: [1, 2] }, { color: "element", atom_ids: [3] }];
      window.productionSurface = await mountProductionSurfaceHarness(container, { entryId: entry.id, label: entry.name,
        projection: projection.viewer, atomIds: entry.atom_ids, normalized: projection.structure, hierarchy: projection.hierarchy, settings });
      return window.productionSurface.inspect();
    }, { entry, projection, hydrogen });
    expect(initialState.meshes).toEqual([entry.id]);
    expect(initialState.geometry[0].atomIds).toEqual(hydrogen ? [4] : [1, 2, 3]);
    expect(initialState.workers.maximum).toBe(1);
    expect(initialState.workers.active).toBe(0);
    expect(initialState.threshold).toBe(0.45);
    if (hydrogen) {
      const states = await page.evaluate(async () => {
        const h = window.productionSurface;
        h.source.settings.selection_nonpolar_hydrogens = [{ atom_ids: [2], show: true }];
        await h.sync([h.source]); const local = h.inspect();
        h.source.settings.components.hydrogens = false;
        await h.sync([h.source]); const hidden = h.inspect();
        h.source.settings.components.hydrogens = true;
        const invalid = structuredClone(h.source);
        invalid.entryId = "separate-entry";
        invalid.normalized.atoms.find((a) => a.id === 2)!.coordinates[0] = 1e8;
        await h.sync([invalid, h.source]);
        return { local, hidden, multiple: h.inspect(), membership: h.source.settings.selection_surface };
      });
      expect(states.local.geometry[0].atomIds).toEqual([2, 4]);
      expect(states.hidden.meshes).toEqual([]);
      expect(states.hidden.statuses[0].state).toBe("hidden");
      expect(states.hidden.threshold).toBe(0.5);
      expect(states.multiple.statuses.map((s) => s.state)).toEqual(["fallback", "ready"]);
      expect(states.multiple.meshes).toEqual([entry.id]);
      expect(states.membership!.atom_ids).toEqual([2, 4]);
      // Removing the last mesh restores the threshold even while another entry is in fallback.
      const fallbackOnly = await page.evaluate(async () => {
        const h = window.productionSurface; h.source.settings.components.hydrogens = false;
        await h.engine.applyCoordinatePatch({ entry_id: h.source.entryId, artifact_id: "test-projection", atom_ids: [1], coordinates: [[0, 0, 0]] }, "preview");
        return h.inspect();
      });
      expect(fallbackOnly.threshold).toBe(0.5);
    } else {
      const colors = () => page.locator("canvas").first().evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL unavailable");
        gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let red = 0, magenta = 0, blue = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const [r, g, b] = pixels.slice(i, i + 3);
          if (r > g + 30 && r > b + 30) red++;
          if (r > g + 30 && b > g + 30) magenta++;
          if (b > r + 30 && b > g + 30) blue++;
        }
        return { red, magenta, blue };
      });
      await expect.poll(async () => (await colors()).magenta).toBeGreaterThan(50);
      await expect.poll(async () => (await colors()).red).toBeGreaterThan(50);
      const recolored = await page.evaluate(async () => {
        const h = window.productionSurface, geometry = h.geometry(h.source.entryId), camera = h.engine.getCamera();
        h.source.settings.selection_colors[0].color = "#0000ff";
        await h.sync([h.source]);
        return { reused: geometry === h.geometry(h.source.entryId), camera, state: h.inspect() };
      });
      expect(recolored.reused).toBe(true);
      expect(recolored.state.workers.created).toBe(1);
      expect(recolored.state.camera).toEqual(recolored.camera);
      await expect.poll(async () => (await colors()).blue).toBeGreaterThan(50);
      await expect.poll(async () => (await colors()).red).toBeGreaterThan(50);
      const edits = await page.evaluate(async () => {
        const h = window.productionSurface, id = h.source.entryId;
        const original = [...h.geometry(id)!.vertices];
        const atom = h.source.normalized.atoms[0];
        const patch = { entry_id: id, artifact_id: "test-projection", atom_ids: [atom.id], coordinates: [[atom.coordinates[0] + 5, atom.coordinates[1], atom.coordinates[2]] as [number, number, number]] };
        await h.engine.applyCoordinatePatch(patch, "preview");
        await h.sync([h.source]); // A style rebuild during an active preview must preserve it.
        const preview = h.inspect(), previewX = h.input(id).x[0];
        await h.engine.clearCoordinatePreview(id); await h.wait(); const restored = [...h.geometry(id)!.vertices];
        await h.engine.applyCoordinatePatch(patch, "commit"); await h.wait(); const committed = [...h.geometry(id)!.vertices];
        await h.engine.setIsolation([{ structure_id: id, atom_id: 1 }]); await h.wait();
        return { original, preview, previewX, restored, committed, editedCenter: patch.coordinates[0], sourceCoordinates: h.source.normalized.atoms[0].coordinates, isolated: h.inspect(), membership: h.source.settings.selection_surface };
      });
      expect(edits.preview.meshes).toEqual([]);
      expect(edits.previewX).toBeCloseTo(edits.editedCenter[0], 5);
      expect(edits.restored).toEqual(edits.original);
      expect(edits.committed).not.toEqual(edits.original);
      expect(edits.isolated.geometry[0].atomIds).toEqual([1]);
      for (let axis = 0; axis < 3; axis++) {
        const positions = edits.isolated.geometry[0].vertices.filter((_, i) => i % 3 === axis);
        const center = (Math.min(...positions) + Math.max(...positions)) / 2;
        expect(Math.abs(center - edits.editedCenter[axis])).toBeLessThan(0.5);
      }
      expect(edits.sourceCoordinates).toEqual(projection.structure.atoms[0].coordinates);
      expect(edits.membership!.atom_ids).toEqual([1, 2, 3]);
      const cancellation = await page.evaluate(async () => {
        const h = window.productionSurface;
        await h.engine.setIsolation(null);
        const started = performance.now(); h.engine.cancelSurface(h.source.entryId);
        const cancelMs = performance.now() - started, activeAfterCancel = h.workers.active;
        await h.wait();
        const cancelled = h.inspect(), fallbackReadyMs = performance.now() - started;
        h.engine.retrySurface(h.source.entryId); await h.wait();
        return { cancelled, cancelMs, activeAfterCancel, fallbackReadyMs, retried: h.inspect() };
      });
      expect(cancellation.cancelled.statuses[0].state).toBe("cancelled");
      expect(cancellation.cancelled.meshes).toEqual([]);
      expect(cancellation.cancelled.workers.active).toBe(0);
      expect(cancellation.cancelMs).toBeLessThan(500);
      expect(cancellation.activeAfterCancel).toBe(0);
      expect(cancellation.retried.statuses[0].state).toBe("ready");
      expect(cancellation.retried.meshes).toEqual([entry.id]);
      expect(cancellation.retried.geometry[0].vertices).toEqual(edits.committed);
      const uploadFailure = await page.evaluate(async () => {
        const h = window.productionSurface;
        const restore = h.failRepresentations(2);
        h.engine.retrySurface(h.source.entryId); await h.wait(); const failed = h.inspect();
        restore(); h.engine.retrySurface(h.source.entryId); await h.wait();
        return { failed, recovered: h.inspect() };
      });
      expect(uploadFailure.failed.meshes).toEqual([]);
      expect(uploadFailure.failed.statuses[0].message).toBe("Surface and line rendering failed. Membership kept.");
      expect(uploadFailure.recovered.meshes).toEqual([entry.id]);
    }
    const cleanup = await page.evaluate(async () => {
      const h = window.productionSurface; await h.sync([]); const empty = h.inspect(); h.dispose(); return empty;
    });
    expect(cleanup.statuses).toEqual([]); expect(cleanup.meshes).toEqual([]); expect(cleanup.components).toBe(0);
    expect(cleanup.workers.active).toBe(0); expect(cleanup.workers.created).toBe(cleanup.workers.terminated);
    expect(cleanup.threshold).toBe(0.5);
    expect(await page.locator("canvas").count()).toBe(0);
    writeFileSync(info.outputPath("production-surface.json"), JSON.stringify({ fixture, initialState, cleanup }, null, 2));
  });
}

test("qualifies production 1STP surface response and partial-fragment boundaries", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const initial: Project = await (await request.post("/api/v1/projects", { data: { name: `Surface complex ${Date.now()}` } })).json();
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, { multipart: {
    expected_revision: "0", files: { name: "1stp.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync(resolve("tests/fixtures/complex/1stp.pdb")) },
  } });
  expect(imported.status()).toBe(201);
  const project: Project = (await imported.json()).project;
  const entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  await page.goto("/selection-surface-test.html");
  const result = await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/selectionSurfaceHarness.ts";
    const { mountProductionSurfaceHarness } = await import(/* @vite-ignore */ path);
    const container = document.createElement("div"); Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
    const settings = structuredClone(entry.viewer_settings); settings.representations = [];
    settings.components.solvent = true; settings.components.ions = true; settings.components.hydrogens = true; settings.components.nonpolar_hydrogens = true;
    const h = await mountProductionSurfaceHarness(container, { entryId: entry.id, label: entry.name,
      projection: projection.viewer, atomIds: entry.atom_ids, normalized: projection.structure, hierarchy: projection.hierarchy, settings });
    const tasks: number[] = [];
    const observer = new PerformanceObserver((list) => list.getEntries().forEach((task) => tasks.push(task.duration)));
    observer.observe({ type: "longtask", buffered: false });
    const started = performance.now();
    h.source.settings.selection_surface = { profile: "molecular-v1", atom_ids: entry.atom_ids };
    await h.sync([h.source]);
    const readyMs = performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 100)); observer.disconnect();
    const full = h.geometry(entry.id)!;
    const fullSummary = { ...full.evidence, atoms: [...full.atomIds], groups: [...new Set(full.groups)] };
    const first = entry.atom_ids[0];
    h.source.settings.selection_surface.atom_ids = [first];
    await h.sync([h.source]);
    const fragment = h.geometry(entry.id)!;
    const center = h.source.normalized.atoms.find((atom) => atom.id === first)!.coordinates;
    const distances: number[] = [];
    for (let i = 0; i < fragment.vertices.length; i += 3) distances.push(Math.hypot(...center.map((v, axis) => v - fragment.vertices[i + axis])));
    const partial = { atoms: [...fragment.atomIds], maxRadius: Math.max(...distances), groups: [...new Set(fragment.groups)], triangles: fragment.indices.length / 3 };
    h.dispose();
    return { readyMs, longestSurfaceTaskMs: Math.max(0, ...tasks), full: fullSummary, partial };
  }, { entry, projection });
  expect(result.readyMs).toBeLessThan(10_000);
  expect(result.longestSurfaceTaskMs).toBeLessThan(750);
  expect(result.full.atoms).toEqual(entry.atom_ids);
  expect(result.full.groups.length).toBeGreaterThan(20);
  expect(result.partial.atoms).toEqual([entry.atom_ids[0]]);
  expect(result.partial.groups).toEqual([0]);
  // First atom is N; its fragment is a closed atomic envelope, not a retained context patch.
  expect(projection.structure.atoms[0].element).toBe("N");
  expect(result.partial.maxRadius).toBeLessThan(1.55 + 0.5);
  expect(result.partial.triangles).toBeGreaterThan(100);
  writeFileSync(info.outputPath("production-1stp-surface.json"), JSON.stringify(result, null, 2));
});
