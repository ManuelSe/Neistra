import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { AtomReference, Project, SurfaceCreateItem } from "../../apps/web/src/api/types";
import type * as SelectionStoreModule from "../../apps/web/src/store/selection";
import type * as MolstarEngineModule from "../../apps/web/src/viewer/MolstarEngine";
import type { MolecularViewer } from "../../apps/web/src/viewer/MolecularViewer";

declare global { interface Window { surfaceWorkflowEngine: MolecularViewer } }
interface AlphaCell { obj?: { data: { repr?: { renderObjects: { values: { uAlpha: { ref: { value: number } } } }[] } } } }
interface SurfaceInspection {
  surfaceBindings: Map<string, { surfaceId: string; representationRef?: string }>;
  plugin?: { state: { data: { cells: Map<string, AlphaCell> } } };
}


async function createProject(request: APIRequestContext, entries: number) {
  const response = await request.post("/api/v1/projects", { data: { name: `Surface session ${Date.now()} ${entries}` } });
  expect(response.status()).toBe(201);
  let project = await response.json() as Project;
  for (let index = 0; index < entries; index++) {
    const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
      expected_revision: String(project.revision), files: { name: `entry-${index}.mol`, mimeType: "chemical/x-mdl-molfile",
        buffer: readFileSync("tests/fixtures/formats/ethanol.mol") },
    } });
    expect(imported.status()).toBe(201); project = (await imported.json() as { project: Project }).project;
  }
  return project;
}
async function openProject(page: Page, project: Project) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.getByRole("dialog", { name: "Projects", exact: true })).toBeHidden();
  const visibleEntry = project.entries.find(entry => entry.visible && entry.current_artifact_id);
  if (!visibleEntry) throw new Error("The workflow fixture needs one visible entry");
  await expect.poll(() => page.evaluate(id => window.surfaceWorkflowEngine?.getRenderedAtomReferences()
    .some(atom => atom.structure_id === id) ?? false, visibleEntry.id)).toBe(true);
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
}
async function selectAtoms(page: Page, atoms: AtomReference[]) {
  await page.evaluate(async atoms => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path) as typeof SelectionStoreModule;
    useSelectionStore.getState().replace({ schema_version: 1, atoms, granularity: "atom", source: "inspector" });
  }, atoms);
  await expect(page.locator(".viewer-status")).toContainText(`${atoms.length} selected`);
}
async function openManager(page: Page) {
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await page.getByRole("dialog", { name: "Style selection", exact: true }).getByRole("button", { name: /^Manage surfaces/ }).click();
}

async function observeViewer(page: Page) {
  // Observe the actual production viewer, without publishing application globals.
  await page.evaluate(async () => {
    const path = "/src/viewer/MolstarEngine.ts";
    const { MolstarEngine } = await import(/* @vite-ignore */ path) as typeof MolstarEngineModule;
    const descriptor = Object.getOwnPropertyDescriptor(MolstarEngine.prototype, "setActiveSurface");
    if (typeof descriptor?.value !== "function") throw new Error("Missing native selection observer seam");
    const original = descriptor.value as typeof MolstarEngine.prototype.setActiveSurface;
    MolstarEngine.prototype.setActiveSurface = function(...args: Parameters<typeof original>) {
      window.surfaceWorkflowEngine = this;
      return original.apply(this, args);
    };
  });
}
async function nativeAlpha(page: Page, surfaceId: string) {
  return page.evaluate(id => {
    const engine = window.surfaceWorkflowEngine as unknown as SurfaceInspection;
    const binding = [...engine.surfaceBindings.values()].find(value => value.surfaceId === id);
    if (!binding?.representationRef) return [];
    return engine.plugin?.state.data.cells.get(binding.representationRef)?.obj?.data.repr?.renderObjects
      .map(object => object.values.uAlpha.ref.value) ?? [];
  }, surfaceId);
}
async function expectAlpha(page: Page, surfaceId: string, alpha: number) {
  await expect.poll(async () => {
    const values = await nativeAlpha(page, surfaceId);
    return values.length > 0 && values.every(value => Math.abs(value - alpha) < 1e-6);
  }).toBe(true);
}

test("creates exact multi-entry objects and retains captured source drafts through viewer remounts", async ({ page, request }, info) => {
  test.setTimeout(150_000);
  let project = await createProject(request, 2);
  const other = await createProject(request, 1);
  const [visible, hidden] = project.entries;
  const hiddenResponse = await request.post(`/api/v1/projects/${project.id}/entries/${hidden.id}/visibility`, {
    data: { expected_revision: project.revision, value: false },
  });
  expect(hiddenResponse.status()).toBe(200); project = await hiddenResponse.json() as Project;
  await page.goto("/");
  await observeViewer(page);
  await openProject(page, project);
  const captured = [visible, hidden].flatMap(entry => entry.atom_ids.slice(0, 2).map(atom_id => ({ structure_id: entry.id, atom_id })));
  await selectAtoms(page, captured);
  const camera = await page.evaluate(() => window.surfaceWorkflowEngine.getCamera());
  const creates: SurfaceCreateItem[][] = [];
  page.on("request", event => {
    if (event.method() === "POST" && event.url().endsWith(`/projects/${project.id}/surfaces`)) {
      creates.push((event.postDataJSON() as { surfaces: SurfaceCreateItem[] }).surfaces);
    }
  });
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await page.getByRole("dialog", { name: "Style selection", exact: true }).getByRole("button", { name: "Create surface", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "Surfaces", exact: true });
  await manager.getByRole("button", { name: "Create fragment", exact: true }).click();
  await expect(manager.getByText("2 surfaces created.", { exact: true })).toBeVisible();
  await expect(manager.locator(".surface-object[data-created=true]")).toHaveCount(2);
  const saved = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  expect(creates).toHaveLength(1); expect(creates[0]).toHaveLength(2);
  const first = saved.entries.find(entry => entry.id === creates[0][0].entry_id)!;
  await expect(manager.locator(".surface-object[data-active=true]")).toHaveAttribute("data-surface-key", JSON.stringify([first.id, first.viewer_settings.surface_objects[0].id]));
  expect(saved.entries.find(entry => entry.id === hidden.id)!.visible).toBe(false);
  expect(await page.evaluate(() => window.surfaceWorkflowEngine.getCamera())).toEqual(camera);
  await expect(page.locator(".viewer-status")).toContainText("4 selected");
  const owner = saved.entries.find(entry => entry.id === visible.id)!, object = owner.viewer_settings.surface_objects[0];
  const ownerRow = manager.locator(`.surface-object[data-surface-key='${JSON.stringify([owner.id, object.id])}'] .surface-object-label`);
  await ownerRow.click();
  await selectAtoms(page, [{ structure_id: owner.id, atom_id: owner.atom_ids[0] }]);
  await manager.locator(".surface-source-details > summary").click();
  await manager.getByRole("button", { name: "Capture fragment from selection", exact: true }).click();
  await expect(manager.getByText("1 captured atom in draft", { exact: true })).toBeVisible();
  const beforeGesture = saved.revision;
  const opacity = manager.getByLabel("Surface opacity", { exact: true });
  await opacity.fill("0.7"); await opacity.press("Escape");
  await expect(manager).toBeVisible(); await expect(opacity).toHaveValue(String(object.appearance.opacity));
  expect((await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project).revision).toBe(beforeGesture);
  // Exercise a fresh trusted pointer gesture after Escape, including the native
  // desktop spinner rather than relying exclusively on keyboard replacement.
  if (info.project.name === "chromium") {
    await opacity.hover();
    const box = (await opacity.boundingBox())!;
    await page.mouse.click(Math.round(box.x + box.width - 8), Math.round(box.y + box.height / 2 - 4));
  } else {
    const slider = manager.getByLabel("Surface opacity slider", { exact: true });
    await slider.scrollIntoViewIfNeeded(); const box = (await slider.boundingBox())!;
    await page.touchscreen.tap(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
  }
  await expect(opacity).toHaveValue("0.5");
  await expect(manager.getByLabel("Surface color scheme")).toHaveAttribute("aria-disabled", "false");
  expect((await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project).revision).toBe(beforeGesture + 1);
  await opacity.fill("0.3"); await opacity.press("Enter");
  await expect(manager.getByLabel("Surface color scheme")).toHaveAttribute("aria-disabled", "false");
  await expect(opacity).toBeFocused();
  await opacity.fill("0.6"); await opacity.press("Enter");
  await expect(manager.getByLabel("Surface color scheme")).toHaveAttribute("aria-disabled", "false");
  const styled = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  expect(styled.revision).toBe(beforeGesture + 3);
  expect(styled.entries.find(entry => entry.id === owner.id)!.viewer_settings.surface_objects[0].source).toEqual(object.source);
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await openManager(page); await ownerRow.click();
  await expect(manager.getByLabel("Surface opacity", { exact: true })).toHaveValue("0.3");
  await expect(manager.getByText("1 captured atom in draft", { exact: true })).toBeVisible();
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  // Changing layout replaces the disposable viewer, while App retains this session.
  await page.setViewportSize({ width: info.project.name === "chromium" ? 393 : 1366, height: 850 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await openManager(page); await ownerRow.click();
  await expect(manager.getByText("1 captured atom in draft", { exact: true })).toBeVisible();
  await expect(manager.getByRole("button", { name: "Apply source", exact: true })).toBeEnabled();
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  await openProject(page, other);
  await expect(page.getByText("Unapplied surface source changes were discarded when switching projects.", { exact: true })).toHaveCount(1);
  await openProject(page, saved);
  await openManager(page); await ownerRow.click();
  await expect(manager.getByText(/Unapplied changes/)).toHaveCount(0);
  await manager.getByRole("button", { name: "Close surfaces" }).click();
  const beforeDisplay = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  const displayCamera = await page.evaluate(() => window.surfaceWorkflowEngine.getCamera());
  await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
  await page.getByRole("combobox", { name: "Controlled structure", exact: true }).selectOption(hidden.id);
  await page.getByRole("combobox", { name: "Add representation", exact: true }).selectOption("surface");
  await expect(manager.getByRole("button", { name: "Whole entry", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(manager.getByRole("combobox", { name: "Surface entry", exact: true })).toHaveValue(hidden.id);
  expect((await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project).revision).toBe(beforeDisplay.revision);
  await manager.getByRole("button", { name: "Create entry surface", exact: true }).click();
  await expect(manager.getByText("1 surface created.", { exact: true })).toBeVisible();
  const afterDisplay = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  const displayOwner = afterDisplay.entries.find(entry => entry.id === hidden.id)!;
  expect(displayOwner.visible).toBe(false); expect(displayOwner.viewer_settings.surface_objects).toHaveLength(2);
  expect(displayOwner.viewer_settings.surface_objects[1].source).toEqual({ kind: "entry" });
  expect(afterDisplay.revision).toBe(beforeDisplay.revision + 1); expect(creates).toHaveLength(2);
  expect(await page.evaluate(() => window.surfaceWorkflowEngine.getCamera())).toEqual(displayCamera);
  writeFileSync(info.outputPath("surface-session-workflow.json"), JSON.stringify({ projectId: project.id,
    createdRequest: creates[0], created: saved.entries.map(entry => ({ id: entry.id, visible: entry.visible, surfaces: entry.viewer_settings.surface_objects })),
    camera, beforeGesture, afterThreeCompletedGestures: styled.revision, displayRequest: creates[1], displayCamera,
    beforeDisplayRevision: beforeDisplay.revision, afterDisplayRevision: afterDisplay.revision,
    afterLayoutWidth: page.viewportSize()?.width }, null, 2));
});

test("rebinds inactive saving and uncertain appearance previews after responsive remounts", async ({ page, request }, info) => {
  test.setTimeout(150_000);
  let project = await createProject(request, 1);
  const entry = project.entries[0];
  const created = await request.post(`/api/v1/projects/${project.id}/surfaces`, { data: { expected_revision: project.revision, surfaces: [
    { entry_id: entry.id, source: { kind: "entry" } },
    { entry_id: entry.id, source: { kind: "fragment", profile: "molecular-v1", atom_ids: entry.atom_ids.slice(0, 2) } },
  ] } });
  expect(created.status()).toBe(200); project = await created.json() as Project;
  const object = project.entries[0].viewer_settings.surface_objects[0];
  await page.goto("/"); await observeViewer(page); await openProject(page, project); await openManager(page);
  const manager = page.getByRole("dialog", { name: "Surfaces", exact: true });
  const rows = manager.locator(".surface-object-label"); await rows.first().click();
  await expectAlpha(page, object.id, object.appearance.opacity);
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { seen = resolve; });
  let patches = 0, abortNextPatch = false, abortNextRead = false;
  await page.route(`**/api/v1/projects/${project.id}/entries/${entry.id}/surfaces/${object.id}`, async route => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    patches++;
    if (abortNextPatch) { abortNextPatch = false; await route.abort("failed"); return; }
    if (patches !== 1) { await route.continue(); return; }
    const response = await route.fetch(); seen(); await held; await route.fulfill({ response });
  });
  await page.route(`**/api/v1/projects/${project.id}`, async route => {
    if (route.request().method() === "GET" && abortNextRead) { abortNextRead = false; await route.abort("failed"); }
    else await route.continue();
  });
  try {
    const opacity = manager.getByLabel("Surface opacity", { exact: true });
    await opacity.fill("0.2"); await opacity.press("Enter"); await requested;
    await rows.last().click(); // Leave this object's publication inactive.
    await page.setViewportSize({ width: info.project.name === "chromium" ? 393 : 1366, height: 850 });
    await expectAlpha(page, object.id, 0.2);
    const pendingAlpha = await nativeAlpha(page, object.id);
    release();
    await expect.poll(async () => (await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project).revision).toBe(project.revision + 1);
    await expect(page.getByRole("button", { name: "Style selection", exact: true })).toBeEnabled();
    await openManager(page); await rows.first().click();
    await expect(opacity).toHaveValue("0.2"); await expect(opacity).not.toHaveAttribute("readonly");
    await expectAlpha(page, object.id, 0.2);
    abortNextPatch = true; abortNextRead = true;
    await opacity.fill("0.65"); await opacity.press("Enter");
    await expect(manager.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
    await expect(opacity).toHaveAttribute("readonly");
    await rows.last().click();
    await page.setViewportSize({ width: info.project.name === "chromium" ? 1366 : 393, height: 850 });
    await expectAlpha(page, object.id, 0.65);
    const uncertainAlpha = await nativeAlpha(page, object.id);
    await openManager(page); await rows.first().click();
    await expect(opacity).toHaveValue("0.65");
    await manager.getByRole("button", { name: "Check again", exact: true }).click();
    await expect(opacity).toHaveValue("0.2"); await expect(opacity).not.toHaveAttribute("readonly");
    await expectAlpha(page, object.id, 0.2);
    await opacity.fill("0.4"); await opacity.press("Enter");
    await expect(manager.getByLabel("Surface color scheme")).toHaveAttribute("aria-disabled", "false");
    await expectAlpha(page, object.id, 0.4);
    const final = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
    expect(final.revision).toBe(project.revision + 2); expect(patches).toBe(3);
    writeFileSync(info.outputPath("surface-preview-remount.json"), JSON.stringify({ projectId: project.id,
      pendingAlpha, uncertainAlpha, finalAlpha: await nativeAlpha(page, object.id), patches,
      initialRevision: project.revision, finalRevision: final.revision }, null, 2));
  } finally { release(); await page.unrouteAll({ behavior: "ignoreErrors" }); }
});
