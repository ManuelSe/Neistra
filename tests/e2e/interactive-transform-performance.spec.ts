import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";

test("bounds native protein/ligand preview work and measures exact cancellation", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Timing budgets use pinned desktop Chromium; touch has separate qualification.");
  test.setTimeout(120_000);
  const created: Project = await (await request.post("/api/v1/projects", { data: { name: `Movement profile ${Date.now()}` } })).json();
  const imported = await request.post(`/api/v1/projects/${created.id}/imports`, {
    multipart: { expected_revision: "0", files: { name: "1stp.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync(resolve("tests/fixtures/complex/1stp.pdb")) } },
  });
  expect(imported.status()).toBe(201);
  const project: Project = (await imported.json()).project;
  const entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  const requests: string[] = [];
  page.on("request", r => { if (/\/entries\/[^/]+\/structure$|\/selection-transform$|\/jobs$/.test(new URL(r.url()).pathname)) requests.push(r.url()); });
  await page.goto("/selection-surface-test.html");
  const profiler = process.env.MOVEMENT_CPU_PROFILE === "1" ? await page.context().newCDPSession(page) : null;
  if (profiler) { await profiler.send("Profiler.enable"); await profiler.send("Profiler.start"); }
  const evidence = await page.evaluate(async ({ project, entry, projection }) => {
    const harnessPath = "/src/test/interactiveTransformHarness.ts", mathPath = "/src/coordinates/interactiveTransform.ts", queuePath = "/src/viewer/CoordinatePreviewQueue.ts";
    const { mountInteractiveTransformHarness } = await import(/* @vite-ignore */ harnessPath);
    const { captureMovement, initialMovementPose, movePose, movementPreview } = await import(/* @vite-ignore */ mathPath);
    const { CoordinatePreviewQueue } = await import(/* @vite-ignore */ queuePath);
    const target = document.createElement("div"); Object.assign(target.style, { position: "fixed", inset: "0" }); document.body.appendChild(target);
    const h = await mountInteractiveTransformHarness(target, { entryId: entry.id, label: entry.name, projection: projection.viewer,
      normalized: projection.structure, hierarchy: projection.hierarchy, atomIds: entry.atom_ids, settings: entry.viewer_settings });
    const original = h.inspect().coordinates;
    const wait = async (predicate: () => boolean) => {
      const deadline = performance.now() + 15_000;
      while (!predicate()) { if (performance.now() > deadline) throw new Error("Timed out waiting for native coordinates."); await new Promise(requestAnimationFrame); }
    };
    const tasks: { start: number; duration: number }[] = [];
    await wait(() => h.engine.getCamera() !== null);
    // Qualify movement on the rendered scene, after its initial presentation.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))));
    observer.observe({ type: "longtask" });
    const ligandResidues = new Set(projection.structure.residues.filter(r => r.name === "BTN" && r.component_type === "ligand").map(r => r.id));
    const ligand = { atom_ids: projection.structure.atoms.filter(a => a.residue_id !== null && ligandResidues.has(a.residue_id)).map(a => a.id) };
    if (!ligand.atom_ids.length) throw new Error("The ordinary complex must contain biotin.");
    const cases = [];
    for (const [name, atomIds] of [["protein-fragment", [1, 2, 7]], ["bound-ligand", ligand.atom_ids]] as const) {
      const selection = { schema_version: 1, atoms: atomIds.map(atom_id => ({ structure_id: entry.id, atom_id })), granularity: "atom", source: "inspector" };
      h.engine.setSelection(selection.atoms);
      const capture = captureMovement(project, selection, new Map([[entry.id, projection]]), h.engine.getRenderedAtomReferences());
      h.engine.setMovementMode(true);
      const started = performance.now();
      let coordinatePreviewMs = -1;
      const unsubscribePreview = h.onCoordinatesUpdated(() => { coordinatePreviewMs = performance.now() - started; });
      const preview = movementPreview(capture, movePose(capture, initialMovementPose(), "translate", 20, -10, h.engine.getMovementView()!))[0];
      await h.engine.applyCoordinatePatch(preview, "preview");
      const previewMs = performance.now() - started;
      unsubscribePreview();
      const changed = h.inspect().coordinates;
      let active = 0, maxActive = 0, calls = 0;
      const errors: string[] = [];
      const queue = new CoordinatePreviewQueue({
        applyCoordinatePatch: async (patch, kind) => { calls++; active++; maxActive = Math.max(maxActive, active); try { await h.engine.applyCoordinatePatch(patch, kind); } finally { active--; } },
        clearCoordinatePreview: id => h.engine.clearCoordinatePreview(id),
      }, error => errors.push(String(error)));
      for (let frame = 1; frame <= 40; frame++) queue.set(movementPreview(capture, movePose(capture, initialMovementPose(), "translate", 20 + frame, -10, h.engine.getMovementView()!)));
      const final = movementPreview(capture, movePose(capture, initialMovementPose(), "translate", 60, -10, h.engine.getMovementView()!))[0];
      await wait(() => active === 0 && final.atom_ids.every((id, i) => {
        const point = new Map(h.inspect().coordinates).get(id)!;
        return point.every((v, axis) => Math.abs(v - final.coordinates[i][axis]) < 1e-8);
      }));
      const cancelStarted = performance.now();
      let coordinateCancelMs = -1;
      const canceled = new Promise<void>(resolve => {
        const unsubscribe = h.onCoordinatesUpdated(() => {
          if (JSON.stringify(h.inspect().coordinates) !== JSON.stringify(original)) return;
          coordinateCancelMs = performance.now() - cancelStarted; unsubscribe(); resolve();
        });
      });
      queue.set([]);
      await canceled;
      h.engine.setMovementMode(false); queue.dispose();
      await new Promise(resolve => setTimeout(resolve, 100));
      cases.push({ name, atoms: atomIds.length, previewMs, coordinatePreviewMs, coordinateCancelMs, maxActive, submittedFrames: 40, renderedFrames: calls,
        longestTaskMs: Math.max(0, ...tasks.filter(t => t.start >= started && t.start < cancelStarted + coordinateCancelMs).map(t => t.duration)),
        changed: JSON.stringify(changed) !== JSON.stringify(original), exactRestore: JSON.stringify(h.inspect().coordinates) === JSON.stringify(original), errors });
    }
    // Expensive surface regeneration is reported separately from coordinate restoration.
    await h.engine.syncStructures([{ ...h.source, settings: { ...entry.viewer_settings, representations: [{ ...entry.viewer_settings.representations[0], style: "surface" }] } }]);
    const selection = { schema_version: 1, atoms: ligand.atom_ids.map(atom_id => ({ structure_id: entry.id, atom_id })), granularity: "atom", source: "inspector" };
    const capture = captureMovement(project, selection, new Map([[entry.id, projection]]), h.engine.getRenderedAtomReferences());
    h.engine.setMovementMode(true);
    await h.engine.applyCoordinatePatch(movementPreview(capture, movePose(capture, initialMovementPose(), "translate", 20, -10, h.engine.getMovementView()!))[0], "preview");
    const started = performance.now();
    let coordinateCancelMs = -1;
    const canceled = new Promise<void>(resolve => {
      const unsubscribe = h.onCoordinatesUpdated(() => {
        if (JSON.stringify(h.inspect().coordinates) !== JSON.stringify(original)) return;
        coordinateCancelMs = performance.now() - started; unsubscribe(); resolve();
      });
    });
    const restoration = h.engine.clearCoordinatePreview(entry.id);
    await canceled;
    await restoration;
    const regenerationCompleteMs = performance.now() - started;
    const surface = { coordinateCancelMs, regenerationCompleteMs, inheritedRestored: h.inspect().inheritedSurfaces > 0 };
    h.engine.setMovementMode(false); observer.disconnect(); h.dispose();
    return { fixture: "RCSB 1STP", atoms: projection.structure.atoms.length, renderer: "pinned Chromium / SwiftShader", cases, surface };
  }, { project, entry, projection });
  if (profiler) { const { profile } = await profiler.send("Profiler.stop"); writeFileSync(info.outputPath("movement-cpu.json"), JSON.stringify(profile)); await profiler.detach(); }
  writeFileSync(info.outputPath("movement-performance.json"), JSON.stringify({ ...evidence, requests }, null, 2));
  await info.attach("movement-performance", { body: JSON.stringify({ ...evidence, requests }, null, 2), contentType: "application/json" });
  expect(evidence.atoms).toBe(1001); expect(requests).toEqual([]);
  for (const c of evidence.cases) {
    expect(c.changed).toBe(true); expect(c.exactRestore).toBe(true); expect(c.errors).toEqual([]);
    expect(c.previewMs).toBeLessThan(500); expect(c.coordinateCancelMs).toBeLessThan(500);
    expect(c.longestTaskMs).toBeLessThan(750); expect(c.maxActive).toBe(1); expect(c.renderedFrames).toBe(2);
  }
  expect(evidence.surface.coordinateCancelMs).toBeLessThan(500); expect(evidence.surface.inheritedRestored).toBe(true);
});
