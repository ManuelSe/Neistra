import AxeBuilder from "@axe-core/playwright";
import { browserRssKiB } from "./support/process-memory";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { AtomReference, Project, StructureProjection } from "../../apps/web/src/api/types";

declare global { interface Window { pocketPicks: AtomReference[] } }
let memoryTimer: ReturnType<typeof setInterval> | undefined;
test.afterEach(() => clearInterval(memoryTimer));

for (const file of ["complex/1stp.pdb", "hydrogens/polar_hydrogens_protein.pdb", "surfaces/1aon.cif"]) {
  test(`qualifies native full-protein pocket geometry and independent display for ${file}`, async ({ page, request }, info) => {
    test.setTimeout(240_000);
    const initial: Project = await (await request.post("/api/v1/projects", { data: { name: `Pocket ${file}` } })).json();
    const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, { timeout: 120_000, multipart: {
      expected_revision: "0", files: { name: file.split("/").at(-1)!, mimeType: "chemical/x-pdb", buffer: readFileSync(`tests/fixtures/${file}`) },
    } });
    expect(imported.status()).toBe(201);
    const project: Project = (await imported.json()).project, entry = project.entries[0];
    const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`, { timeout: 120_000 })).json();
    await page.goto("/selection-surface-test.html");
    const baselineRssKiB = browserRssKiB(); let peakRssKiB = baselineRssKiB;
    memoryTimer = setInterval(() => { peakRssKiB = Math.max(peakRssKiB, browserRssKiB()); }, 100);
    const result = await page.evaluate(async ({ entry, projection, large }) => {
      const harnessPath = "/src/test/selectionSurfaceHarness.ts", geometryPath = "/src/viewer/surface/geometry.ts", componentPath = "/src/selection/components.ts";
      const { mountProductionSurfaceHarness } = await import(/* @vite-ignore */ harnessPath);
      const { computeSurface } = await import(/* @vite-ignore */ geometryPath);
      const { componentAtomIds } = await import(/* @vite-ignore */ componentPath);
      const proteinIds = [...new Set(projection.hierarchy.components.filter((c) => c.category === "protein")
        .flatMap((c) => componentAtomIds(projection.structure, c)))].sort((a, b) => a - b) as number[];
      const proteinSet = new Set(proteinIds);
      const seed = projection.structure.atoms.find((atom) => proteinSet.has(atom.id))!;
      const container = document.createElement("div"); Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
      const settings = structuredClone(entry.viewer_settings); settings.representations = [];
      settings.components.hydrogens = false; settings.selection_hidden_atoms = entry.atom_ids;
      const h = await mountProductionSurfaceHarness(container, { entryId: entry.id, label: entry.name, projection: projection.viewer,
        atomIds: entry.atom_ids, normalized: projection.structure, hierarchy: projection.hierarchy, settings }, 125_000);
      const tasks: number[] = [], observer = new PerformanceObserver((list) => list.getEntries().forEach((task) => tasks.push(task.duration)));
      observer.observe({ type: "longtask", buffered: false });
      h.source.pocket = { radius: 5, seeds: [{ reference: { structure_id: entry.id, atom_id: seed.id }, coordinates: seed.coordinates }], dependencyKey: "initial" };
      const start = performance.now(); await h.sync([h.source]); const readyMs = performance.now() - start;
      await new Promise((resolve) => setTimeout(resolve, 100)); observer.disconnect();
      const patch = h.geometry(entry.id, "pocket");
      if (!patch) throw new Error(JSON.stringify(h.inspect()));
      const original = patch, proteinInput = h.input(entry.id, "pocket");
      // Reference calculation is separate from measured production worker response.
      const full = await computeSurface(proteinInput);
      const triangleKey = (g: typeof full, t: number) => [...g.indices.subarray(t * 3, t * 3 + 3)]
        .flatMap((i) => [...g.vertices.subarray(i * 3, i * 3 + 3), ...g.normals.subarray(i * 3, i * 3 + 3), g.atomIds[g.groups[i]]]).join(",");
      const expected = new Set<string>();
      for (let t = 0; t < full.indices.length / 3; t++) {
        const ids = [...full.indices.subarray(t * 3, t * 3 + 3)];
        const center = [0, 1, 2].map((axis) => ids.reduce((sum, i) => sum + full.vertices[i * 3 + axis], 0) / 3);
        if (Math.hypot(...center.map((value, axis) => value - seed.coordinates[axis])) <= 5) expected.add(triangleKey(full, t));
      }
      const exactReference = patch.indices.length / 3 === expected.size && Array.from({ length: patch.indices.length / 3 }, (_, t) => expected.has(triangleKey(patch, t))).every(Boolean);
      h.source.settings.components.hydrogens = true; h.source.settings.selection_hidden_atoms = [];
      await h.sync([h.source]); const detailIndependent = h.geometry(entry.id, "pocket") === original;
      const camera = h.engine.getCamera();
      await h.engine.setIsolation([{ structure_id: entry.id, atom_id: seed.id }]); await h.wait();
      const isolationIndependent = h.geometry(entry.id, "pocket") === original;
      await h.engine.setIsolation(null); await h.wait();
      const cameraStable = JSON.stringify(h.engine.getCamera()) === JSON.stringify(camera);
      h.source.settings.components.protein = false; await h.sync([h.source]);
      const hidden = h.inspect().statuses.find((s) => s.channel === "pocket")?.state;
      h.source.settings.components.protein = true; await h.sync([h.source]);
      const reshown = h.inspect().statuses.find((s) => s.channel === "pocket")?.state;
      // For small fixtures exercise coexistence and an explained empty patch.
      let coexistence = true, empty = "not exercised", cancelled = "not exercised", cancellationMs = 0, retried = "not exercised";
      if (!large) {
        h.source.settings.selection_surface = { profile: "molecular-v1", atom_ids: [seed.id] };
        await h.sync([h.source]); coexistence = h.inspect().meshes.length === 2;
        const fragment = h.geometry(entry.id);
        h.source.pocket = { ...h.source.pocket!, dependencyKey: "cancel" };
        await h.engine.syncStructures([h.source]);
        const cancelledAt = performance.now(); h.engine.cancelSurface(entry.id, "pocket"); await h.wait();
        cancellationMs = performance.now() - cancelledAt;
        cancelled = h.inspect().statuses.find((s) => s.channel === "pocket")!.state;
        coexistence &&= h.geometry(entry.id) === fragment && h.inspect().statuses.find((s) => s.channel === "fragment")?.state === "ready";
        h.engine.retrySurface(entry.id, "pocket"); await h.wait();
        retried = h.inspect().statuses.find((s) => s.channel === "pocket")!.state;
        h.source.pocket = { ...h.source.pocket!, dependencyKey: "distant", seeds: [{ reference: { structure_id: entry.id, atom_id: seed.id }, coordinates: [1000, 1000, 1000] }] };
        await h.sync([h.source]); empty = h.inspect().statuses.find((s) => s.channel === "pocket")!.state;
        h.source.settings.selection_surface = null;
        h.source.pocket = { ...h.source.pocket, dependencyKey: "restored", seeds: [{ reference: { structure_id: entry.id, atom_id: seed.id }, coordinates: seed.coordinates }] };
        await h.sync([h.source]);
      }
      const uncolored = h.geometry(entry.id, "pocket");
      h.source.settings.selection_colors = [{ color: "#ff00ff", atom_ids: projection.structure.atoms.filter((atom) => atom.element === "C").map((atom) => atom.id) }];
      await h.sync([h.source]); const colorIndependent = h.geometry(entry.id, "pocket") === uncolored;
      h.engine.focusAtoms([{ structure_id: entry.id, atom_id: seed.id }]);
      window.productionSurface = h; window.pocketPicks = [];
      h.engine.subscribeSelection((event) => window.pocketPicks.push(...event.atoms));
      return { readyMs, longestTaskMs: Math.max(0, ...tasks), evidence: patch.evidence, exactReference,
        proteinIds, contextIds: [...patch.atomIds], proteinHydrogens: projection.structure.atoms.filter((a) => proteinSet.has(a.id) && a.element === "H").length,
        detailIndependent, isolationIndependent, colorIndependent, cameraStable, hidden, reshown, coexistence, empty, cancelled, cancellationMs, retried, fullMeshBytes: full.evidence.meshBytes,
        workers: { ...h.workers }, seedId: seed.id };
    }, { entry, projection, large: file.includes("1aon") });
    expect(result.readyMs).toBeLessThan(file.includes("1stp") ? 10_000 : 120_000); expect(result.longestTaskMs).toBeLessThan(750);
    expect(result.exactReference).toBe(true); expect(result.contextIds).toEqual(result.proteinIds);
    expect(result.evidence.keptTriangles).toBeGreaterThan(0);
    expect(result.evidence.keptTriangles).toBeLessThan(result.evidence.sourceTriangles!);
    expect(result.evidence.meshBytes).toBeLessThanOrEqual(512 * 1024 ** 2);
    expect(result.evidence.workingBoundBytes).toBeLessThanOrEqual(2 * 1024 ** 3);
    expect(result.colorIndependent).toBe(true); expect(result.detailIndependent).toBe(true); expect(result.isolationIndependent).toBe(true); expect(result.cameraStable).toBe(true);
    expect(result.hidden).toBe("hidden"); expect(result.reshown).toBe("ready"); expect(result.coexistence).toBe(true);
    expect(result.workers.maximum).toBe(1);
    if (!file.includes("1aon")) {
      expect(result.empty).toBe("empty"); expect(result.cancelled).toBe("cancelled");
      expect(result.cancellationMs).toBeLessThan(500); expect(result.retried).toBe("ready");
    }
    if (file.includes("hydrogens")) expect(result.proteinHydrogens).toBeGreaterThan(0);
    const canvas = page.locator("canvas").first(), box = (await canvas.boundingBox())!;
    await expect.poll(() => canvas.evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl"); if (!gl) return 0;
      gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 50) colored++;
      return colored;
    })).toBeGreaterThan(30);
    // A radius patch may be far from a fixed canvas grid. Locate interior rendered
    // pixels, then use genuine mouse clicks and native picking (no synthetic loci).
    const candidates = await canvas.evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl"); if (!gl) return [];
      gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const colored = (x: number, y: number) => {
        const i = (y * canvas.width + x) * 4;
        return Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 40;
      };
      const points: { x: number; y: number; distance: number }[] = [];
      for (let y = 8; y < canvas.height - 8; y += 8) for (let x = 8; x < canvas.width - 8; x += 8) {
        if ([[0, 0], [-4, -4], [4, 4], [-4, 4], [4, -4]].every(([dx, dy]) => colored(x + dx, y + dy))) {
          points.push({ x: x / canvas.width, y: 1 - y / canvas.height,
            distance: Math.hypot(x / canvas.width - 0.5, y / canvas.height - 0.5) });
        }
      }
      return points.sort((a, b) => a.distance - b.distance).slice(0, 8);
    });
    expect(candidates.length).toBeGreaterThan(0);
    for (const { x, y } of candidates) {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      if (await page.waitForFunction(() => window.pocketPicks.length > 0, undefined, { timeout: 500 }).then(() => true, () => false)) break;
    }
    const picked = await page.evaluate(() => window.pocketPicks);
    expect(picked.length).toBeGreaterThan(0);
    for (const atom of picked) { expect(atom.structure_id).toBe(entry.id); expect(result.proteinIds).toContain(atom.atom_id); }
    await page.screenshot({ path: info.outputPath("pocket-native.png") });
    await page.evaluate(() => window.productionSurface.dispose());
    writeFileSync(info.outputPath("pocket-native.json"), JSON.stringify({ ...result, baselineRssKiB, peakRssKiB, memoryMeasurement: "Linux summed descendant RSS; includes reference calculation and display lifecycle, shared pages may be counted repeatedly" }, null, 2));
  });
}

test("invalidates native pockets for hidden seed and receptor preview, cancel and commit", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const initial: Project = await (await request.post("/api/v1/projects", { data: { name: "Pocket dependencies" } })).json();
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, { multipart: {
    expected_revision: "0", files: { name: "protein_editing.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync("tests/fixtures/formats/protein_editing.pdb") },
  } });
  const project: Project = (await imported.json()).project, entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  await page.goto("/selection-surface-test.html");
  const result = await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/selectionSurfaceHarness.ts";
    const { mountProductionSurfaceHarness } = await import(/* @vite-ignore */ path);
    const container = document.createElement("div"); Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
    const point = projection.structure.atoms[0].coordinates;
    const source = { entryId: entry.id, label: entry.name, projection: projection.viewer, atomIds: entry.atom_ids,
      normalized: projection.structure, hierarchy: projection.hierarchy, settings: structuredClone(entry.viewer_settings),
      pocket: { radius: 5, dependencyKey: "hidden-seed", seeds: [{ reference: { structure_id: "hidden-seed", atom_id: 1 }, coordinates: point }] } };
    source.settings.selection_surface = { profile: "molecular-v1", atom_ids: [1, 2] };
    const h = await mountProductionSurfaceHarness(container, source);
    const original = h.geometry(entry.id, "pocket")!, fragment = h.geometry(entry.id)!;
    const originalVertices = [...original.vertices], camera = h.engine.getCamera();
    h.engine.setSelection([{ structure_id: entry.id, atom_id: 1 }]);
    const patch = { entry_id: "hidden-seed", artifact_id: "moved", atom_ids: [1], coordinates: [[1000, 1000, 1000] as [number, number, number]] };
    await h.engine.applyCoordinatePatch(patch, "preview"); await h.wait();
    const preview = h.inspect();
    if (preview.meshes.includes(`pocket:${entry.id}`)) throw new Error("Obsolete hidden-seed pocket remained visible");
    if (h.geometry(entry.id) !== fragment) throw new Error("Hidden seed preview invalidated fragment");
    await h.engine.clearCoordinatePreview("hidden-seed"); await h.wait();
    const restored = [...h.geometry(entry.id, "pocket")!.vertices];
    await h.engine.applyCoordinatePatch(patch, "commit"); await h.wait();
    const empty = h.inspect().statuses.find((s) => s.channel === "pocket")?.state;
    await h.engine.applyCoordinatePatch({ ...patch, artifact_id: "restored", coordinates: [point] }, "commit"); await h.wait();
    const hiddenCommitRestored = [...h.geometry(entry.id, "pocket")!.vertices];
    const receptorPatch = { entry_id: entry.id, artifact_id: "receptor-moved", atom_ids: entry.atom_ids,
      coordinates: projection.structure.atoms.map((atom) => atom.coordinates.map((c) => c + 1000) as [number, number, number]) };
    await h.engine.applyCoordinatePatch(receptorPatch, "preview"); await h.wait();
    const receptorPreview = h.inspect();
    await h.engine.clearCoordinatePreview(entry.id); await h.wait();
    const receptorRestored = [...h.geometry(entry.id, "pocket")!.vertices];
    await h.engine.applyCoordinatePatch(receptorPatch, "commit"); await h.wait();
    const receptorEmpty = h.inspect().statuses.find((s) => s.channel === "pocket")?.state;
    const beforeRepeatedCommit = h.geometry(entry.id, "pocket"), fragmentBeforeRepeat = h.geometry(entry.id);
    await h.engine.applyCoordinatePatch(receptorPatch, "commit"); await h.wait();
    if (h.geometry(entry.id, "pocket") !== beforeRepeatedCommit || h.geometry(entry.id) !== fragmentBeforeRepeat) {
      throw new Error("An already-applied coordinate commit invalidated geometry again");
    }
    const final = h.inspect(), selection = h.details().selection;
    h.dispose();
    return { originalVertices, restored, hiddenCommitRestored, receptorRestored, empty, receptorEmpty,
      previewMeshes: preview.meshes, receptorPreviewMeshes: receptorPreview.meshes, camera, finalCamera: final.camera,
      workers: final.workers, selection };
  }, { entry, projection });
  expect(result.originalVertices.length).toBeGreaterThan(0);
  expect(result.restored).toEqual(result.originalVertices);
  expect(result.hiddenCommitRestored).toEqual(result.originalVertices);
  expect(result.receptorRestored).toEqual(result.originalVertices);
  expect(result.empty).toBe("empty"); expect(result.receptorEmpty).toBe("empty");
  expect(result.receptorPreviewMeshes).toEqual([]);
  expect(result.finalCamera).toEqual(result.camera);
  expect(result.selection).toEqual([{ structure_id: entry.id, atom_id: 1 }]);
  expect(result.workers.maximum).toBe(1);
  writeFileSync(info.outputPath("pocket-coordinate-dependencies.json"), JSON.stringify(result, null, 2));
});

test("saves pockets through the compact panel and restores hidden seed inputs", async ({ page, request, isMobile }, info) => {
  test.setTimeout(120_000);
  let project: Project = await (await request.post("/api/v1/projects", { data: { name: `Pocket workflow ${Date.now()}` } })).json();
  for (const name of ["protein_editing.pdb", "ethanol.mol"]) {
    const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
      expected_revision: String(project.revision), files: { name, mimeType: "application/octet-stream", buffer: readFileSync(`tests/fixtures/formats/${name}`) },
    } });
    expect(imported.status()).toBe(201); project = (await imported.json()).project;
  }
  const receptor = project.entries.find((e) => e.source_format === "pdb")!, seed = project.entries.find((e) => e.source_format === "mol")!;
  project = await (await request.post(`/api/v1/projects/${project.id}/entries/${seed.id}/visibility`, { data: { expected_revision: project.revision, value: false } })).json();
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  for (const notice of await page.getByRole("button", { name: "Dismiss message" }).all()) await notice.click();
  if (isMobile) await page.getByRole("button", { name: "Project browser", exact: true }).click();
  await page.locator(`.entry-row[data-entry-id="${receptor.id}"] .entry-select`).click();
  if (isMobile) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Style selection" });
  const openPocket = async () => {
    await expect(palette.getByRole("button", { name: "Surface options" })).toBeVisible();
    await palette.getByRole("button", { name: "Surface options" }).click();
    await page.getByRole("menuitem", { name: "Pocket…" }).click();
  };
  await openPocket();
  const pocket = page.getByRole("dialog", { name: "Protein pocket" });
  await expect(pocket.getByRole("combobox", { name: "Pocket receptor" })).toHaveValue(receptor.id);
  await expect(pocket.getByText("22 captured seeds")).toBeVisible();
  await pocket.getByRole("spinbutton", { name: "Pocket radius" }).fill("5.5");
  await pocket.getByRole("button", { name: "Apply pocket" }).focus();
  await page.keyboard.press("Enter");
  await expect(pocket.getByText("Pocket saved.")).toBeVisible();
  await expect(page.getByLabel("Selection surface rendering")).toContainText(/Pocket: .*ready/, { timeout: 30_000 });
  let reads = 0;
  page.on("request", (r) => { if (r.method() === "GET" && /\/entries\/[^/]+\/structure$/.test(r.url())) reads++; });
  project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const saved = project.entries.find((e) => e.id === receptor.id)!.viewer_settings.selection_pocket_surface!;
  expect(saved.radius).toBe(5.5); expect(saved.seed_atom_references).toHaveLength(22);
  // Repeated Apply remains a no-op and uses cached projections.
  await pocket.getByRole("button", { name: "Apply pocket" }).focus();
  await page.keyboard.press("Enter");
  await expect(pocket.getByText("Pocket saved.")).toBeVisible();
  expect((await (await request.get(`/api/v1/projects/${project.id}`)).json()).revision).toBe(project.revision);
  for (const theme of ["light", "dark"]) {
    const switcher = page.getByRole("button", { name: `Use ${theme} theme` });
    if (await switcher.count()) await switcher.click();
    const bounds = await pocket.boundingBox(), viewport = page.viewportSize()!;
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    for (const button of await pocket.getByRole("button").all()) {
      const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    const axe = await new AxeBuilder({ page }).include(".pocket-popover").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${theme}-pocket-workflow.png`) });
  }
  await pocket.getByRole("button", { name: "Close surface panel" }).click();
  await expect(palette.getByRole("button", { name: "Surface options" })).toBeFocused();
  await palette.getByRole("button", { name: "Apply blue color" }).click();
  await expect(palette.getByRole("status")).toContainText("Selection color applied");
  expect(reads).toBe(0);
  // Persist a cross-entry seed, then reload: the hidden ligand must supply its
  // current projection without becoming a visible molecular object.
  project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const response = await request.post(`/api/v1/projects/${project.id}/selection-pocket-surface`, { data: {
    expected_revision: project.revision, receptor_entry_id: receptor.id, action: "apply",
    pocket: { profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: seed.id, atom_id: 1 }] },
  } });
  expect(response.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await expect(page.getByLabel("Selection surface rendering")).toContainText(/Pocket: .*ready/, { timeout: 30_000 });
  for (const notice of await page.getByRole("button", { name: "Dismiss message" }).all()) await notice.click();
  // Saved pockets remain accessible with an empty current selection.
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await openPocket();
  await expect(pocket.getByText("1 captured seeds")).toBeVisible();
  await pocket.getByRole("button", { name: "Remove pocket" }).click();
  await expect(pocket.getByText("Pocket removed.")).toBeVisible();
  await expect(page.getByLabel("Selection surface rendering")).toHaveCount(0);
  project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(project.entries.find((e) => e.id === seed.id)!.visible).toBe(false);
});
