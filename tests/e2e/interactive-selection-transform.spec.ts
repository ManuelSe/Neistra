import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import type { mountInteractiveTransformHarness } from "../../apps/web/src/test/interactiveTransformHarness";

declare global {
  interface Window { movementHarness: Awaited<ReturnType<typeof mountInteractiveTransformHarness>> }
}

const read = async (request: APIRequestContext, id: string): Promise<Project> => {
  const response = await request.get(`/api/v1/projects/${id}`);
  expect(response.status()).toBe(200);
  return response.json();
};
const structure = async (request: APIRequestContext, id: string, entry: string): Promise<StructureProjection> => {
  const response = await request.get(`/api/v1/projects/${id}/entries/${entry}/structure`);
  expect(response.status()).toBe(200);
  return response.json();
};

async function select(page: Page, references: { structure_id: string; atom_id: number }[]) {
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByLabel("Select by").selectOption("atom_reference");
  for (const [index, atom] of references.entries()) {
    await page.getByRole("group", { name: "Operation mode" }).getByRole("button", { name: index ? "add" : "replace", exact: true }).click();
    await page.getByLabel("Value", { exact: true }).fill(`${atom.structure_id}:${atom.atom_id}`);
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
  }
  await expect(page.getByLabel("Current selection summary")).toContainText(`Atoms${references.length}`);
}

test("captures hidden multi-entry targets, previews multiple drags, cancels, and applies one reversible command", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const initial: Project = await (await request.post("/api/v1/projects", { data: { name: `Interactive movement ${info.project.name} ${Date.now()}` } })).json();
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, {
    multipart: { expected_revision: "0", files: { name: "1stp.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync(resolve("tests/fixtures/complex/1stp.pdb")) } },
  });
  expect(imported.status()).toBe(201);
  let project: Project = (await imported.json()).project;
  project = await (await request.post(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/duplicate`, { data: { expected_revision: project.revision } })).json();
  const [visible, hidden] = project.entries;
  const visibility = await request.post(`/api/v1/projects/${project.id}/entries/${hidden.id}/visibility`, { data: { expected_revision: project.revision, value: false } });
  expect(visibility.status()).toBe(200);
  project = await read(request, project.id);
  const originals = await Promise.all(project.entries.map(entry => structure(request, project.id, entry.id)));
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  const compact = info.project.name === "mobile-chromium";
  if (compact) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  const targets = [{ structure_id: visible.id, atom_id: 1 }, { structure_id: visible.id, atom_id: 2 }, { structure_id: hidden.id, atom_id: 1 }];
  await select(page, targets);
  await page.getByRole("tab", { name: "transform", exact: true }).click();
  await page.getByRole("button", { name: "Move selection", exact: true }).click();
  await expect(page.getByRole("region", { name: "Move selection controls" })).toContainText("3 atoms · 1 hidden");
  if (compact) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  const revision = project.revision;
  let applyRequests = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/selection-transform")) applyRequests++; });
  const banner = page.getByRole("region", { name: "Move selection controls" });
  const surface = page.getByTestId("movement-pointer-surface");
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.85);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.9, { steps: 8 });
  await page.mouse.up();
  await banner.getByRole("button", { name: "Translate", exact: true }).click();
  await banner.getByRole("button", { name: "Step right", exact: true }).click();
  await banner.getByRole("button", { name: "Depth", exact: true }).click();
  await banner.getByRole("button", { name: "Step away", exact: true }).click();
  expect((await read(request, project.id)).revision).toBe(revision);
  expect(applyRequests).toBe(0);
  await banner.getByRole("button", { name: "Cancel movement", exact: true }).click();
  await expect(surface).toBeHidden();
  for (const [index, entry] of project.entries.entries()) expect(await structure(request, project.id, entry.id)).toEqual(originals[index]);
  if (compact) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "transform", exact: true }).click();
  await page.getByRole("button", { name: "Move selection", exact: true }).click();
  if (compact) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  await banner.getByRole("button", { name: "Rotate", exact: true }).click();
  await banner.getByRole("button", { name: "Step right", exact: true }).click();
  await banner.getByRole("button", { name: "Translate", exact: true }).click();
  await banner.getByRole("button", { name: "Step right", exact: true }).click();
  await banner.getByRole("button", { name: "Step up", exact: true }).click();
  await banner.getByRole("button", { name: "Apply movement", exact: true }).click();
  await expect(banner).toBeHidden();
  expect(applyRequests).toBe(1);
  project = await read(request, project.id);
  expect(project.revision).toBe(revision + 1);
  expect(project.history.retained_commands).toBe(revision + 1);
  expect(project.entries.find(entry => entry.id === hidden.id)?.visible).toBe(false);
  for (const [index, entry] of project.entries.entries()) {
    const after = await structure(request, project.id, entry.id);
    const selected = new Set(targets.filter(atom => atom.structure_id === entry.id).map(atom => atom.atom_id));
    after.structure.atoms.forEach((atom, atomIndex) => {
      if (selected.has(atom.id)) expect(atom.coordinates).not.toEqual(originals[index].structure.atoms[atomIndex].coordinates);
      else expect(atom.coordinates).toEqual(originals[index].structure.atoms[atomIndex].coordinates);
    });
  }
  await page.getByRole("button", { name: /Undo: Move 3 selected atoms/ }).click();
  await expect.poll(async () => (await structure(request, project.id, visible.id)).structure.atoms).toEqual(originals[0].structure.atoms);
  await expect(page.locator(".viewer-error")).toBeHidden();
});

test("qualifies native proper-rotation previews, camera suspension, zoom and surface restoration in both projections", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const initial: Project = await (await request.post("/api/v1/projects", { data: { name: `Native movement ${info.project.name} ${Date.now()}` } })).json();
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, {
    multipart: { expected_revision: "0", files: { name: "1stp.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync(resolve("tests/fixtures/complex/1stp.pdb")) } },
  });
  expect(imported.status()).toBe(201);
  const project: Project = (await imported.json()).project;
  const entry = project.entries[0];
  const projection = await structure(request, project.id, entry.id);
  await page.goto("/selection-surface-test.html");
  const evidence = await page.evaluate(async ({ project, entry, projection }) => {
    const path = "/src/test/interactiveTransformHarness.ts";
    const mathPath = "/src/coordinates/interactiveTransform.ts";
    const { mountInteractiveTransformHarness } = await import(/* @vite-ignore */ path);
    const { captureMovement, initialMovementPose, movePose, movementPreview } = await import(/* @vite-ignore */ mathPath);
    const target = document.createElement("div");
    Object.assign(target.style, { position: "fixed", inset: "0" }); document.body.appendChild(target);
    window.movementHarness = await mountInteractiveTransformHarness(target, {
      entryId: entry.id, label: entry.name, projection: projection.viewer,
      normalized: projection.structure, hierarchy: projection.hierarchy,
      atomIds: entry.atom_ids, settings: { ...entry.viewer_settings, representations: [{ ...entry.viewer_settings.representations[0], style: "surface" }] },
    });
    const h = window.movementHarness;
    const before = h.inspect();
    const selection = { schema_version: 1, atoms: [1, 2, 7].map(atom_id => ({ structure_id: entry.id, atom_id })), granularity: "atom", source: "inspector" };
    h.engine.setSelection(selection.atoms);
    const capture = captureMovement(project, selection, new Map([[entry.id, projection]]), h.engine.getRenderedAtomReferences());
    const results = [];
    for (const mode of ["perspective", "orthographic"] as const) {
      h.engine.setCameraMode(mode);
      const camera = h.engine.getCamera();
      h.engine.setMovementMode(true);
      const view = h.engine.getMovementView()!;
      const translated = movePose(capture, initialMovementPose(), "translate", 24, -12, view);
      const pose = movePose(capture, translated, "rotate", 30, -15, view);
      const expected = movementPreview(capture, pose)[0];
      await h.engine.applyCoordinatePatch(expected, "preview");
      const preview = h.inspect();
      h.engine.focusAtoms(selection.atoms); h.engine.fitVisible(); h.engine.setCameraMode(mode === "perspective" ? "orthographic" : "perspective");
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const heldCamera = h.engine.getCamera();
      h.engine.zoom(0.85);
      const zoomed = h.engine.getMovementView()!;
      await h.engine.applyCoordinatePatch(movementPreview(capture, movePose(capture, pose, "depth", 0, -20, zoomed))[0], "preview");
      const depth = h.inspect();
      let rejected = false;
      try {
        await h.engine.applyCoordinatePatch({ ...expected, atom_ids: [Number.MAX_SAFE_INTEGER], coordinates: [[1, 2, 3]] }, "preview");
      } catch { rejected = true; }
      if (!rejected) throw new Error("The viewer accepted an invalid atom patch.");
      await h.engine.clearCoordinatePreview(entry.id);
      h.engine.setMovementMode(false);
      results.push({ mode, camera, heldCamera, preview, depth, expected, restored: h.inspect() });
    }
    await h.engine.syncStructures([{ ...h.source, settings: { ...entry.viewer_settings,
      representations: [], selection_surface: { profile: "molecular-v1", atom_ids: entry.atom_ids } } }]);
    const waitForRendered = async () => {
      const deadline = performance.now() + 20_000;
      while (!h.engine.getRenderedAtomReferences().length) {
        if (performance.now() > deadline) throw new Error("Fragment-only rendering did not become inspectable.");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    await waitForRendered();
    const rendered = h.engine.getRenderedAtomReferences();
    const fragmentSelection = { ...selection, atoms: [rendered[0]] };
    h.engine.setSelection(fragmentSelection.atoms);
    const fragmentCapture = captureMovement(project, fragmentSelection, new Map([[entry.id, projection]]), rendered);
    h.engine.setMovementMode(true);
    const fragmentPose = movePose(fragmentCapture, initialMovementPose(), "translate", 20, -10, h.engine.getMovementView()!);
    await h.engine.applyCoordinatePatch(movementPreview(fragmentCapture, fragmentPose)[0], "preview");
    const fragmentPreview = h.inspect();
    await h.engine.clearCoordinatePreview(entry.id);
    h.engine.setMovementMode(false);
    await waitForRendered();
    return { before, results, fragment: { rendered: rendered.length, preview: fragmentPreview, restored: h.inspect() }, cachedOriginals: projection.structure.atoms.map(atom => [atom.id, atom.coordinates]) };
  }, { project, entry, projection });
  expect(evidence.before.inheritedSurfaces).toBeGreaterThan(0);
  for (const result of evidence.results) {
    expect(result.heldCamera).toEqual(result.camera);
    expect(result.preview.inheritedSurfaces).toBe(0);
    expect(result.preview.previewCues).toBe(1);
    const coords = new Map(result.preview.coordinates);
    result.expected.atom_ids.forEach((id: number, index: number) => result.expected.coordinates[index].forEach((value: number, axis: number) => expect(coords.get(id)![axis]).toBeCloseTo(value, 8)));
    expect(result.depth.camera?.target).toEqual(result.camera?.target);
    expect(result.depth.camera?.up).toEqual(result.camera?.up);
    expect(result.depth.coordinates).not.toEqual(result.preview.coordinates);
    expect(result.restored.coordinates).toEqual(evidence.before.coordinates);
    expect(result.restored.inheritedSurfaces).toBeGreaterThan(0);
    expect(result.restored.previewCues).toBe(0);
  }
  expect(evidence.cachedOriginals).toEqual(projection.structure.atoms.map(atom => [atom.id, atom.coordinates]));
  expect(evidence.fragment.rendered).toBeGreaterThan(0);
  expect(evidence.fragment.preview.inheritedSurfaces).toBe(0);
  expect(evidence.fragment.preview.previewCues).toBe(1);
  expect(evidence.fragment.restored.previewCues).toBe(0);
  expect(evidence.fragment.restored.coordinates).toEqual(evidence.before.coordinates);
  await page.evaluate(() => window.movementHarness.dispose());
});
