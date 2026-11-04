import { expect, test } from "@playwright/test";
import { prepare } from "./support/interactions";
import { newEmptyProject } from "./support/modeling";
import { frame, matchesSource, sourceRaster, openPresentation, openProject } from "./support/presentation";

test("mirrors native molecular frames, stays read-only and reuses its window", async ({ page, request, context }, info) => {
  test.skip(info.project.name !== "chromium", "Detached windows are qualified on desktop Chromium");
  test.setTimeout(150000);
  const project = await prepare(page, request, ["tests/fixtures/hydrogens/butane-reconciliation.mol"], "Presentation");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const original = await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/original`)).body();
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Detach viewer", exact: true }).click();
  const child = await opened;
  const childRequests: string[] = [];
  child.on("request", outgoing => { if (/\/(api|ws)\//.test(outgoing.url())) childRequests.push(outgoing.url()); });
  await expect(child.locator("video")).toBeVisible();
  await expect.poll(async () => (await frame(child)).colored).toBeGreaterThan(100);
  const first = await frame(child);
  expect(first.width).toBeGreaterThan(100);
  expect(await child.locator("canvas, .viewer-toolbar, .molstar-host").count()).toBe(0);
  expect(await child.locator("video").evaluate((v: HTMLVideoElement) => v.controls)).toBe(false);
  await page.getByRole("button", { name: "Detach viewer", exact: true }).click();
  expect(context.pages()).toHaveLength(2);
  const snapshot = () => page.evaluate(() => window.interactionEngines.at(-1)!.getCamera());
  const camera = await snapshot();
  await child.mouse.move(400, 300); await child.mouse.down();
  await child.mouse.move(550, 420, { steps: 6 }); await child.mouse.up();
  await child.mouse.wheel(0, 500); await child.keyboard.press("ArrowLeft");
  expect(await snapshot()).toEqual(camera);
  await page.bringToFront();
  await page.locator(".molstar-host canvas").first().hover();
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await frame(child)).hash).not.toBe(first.hash);
  await child.setViewportSize({ width: 500, height: 900 });
  expect(await child.locator("video").evaluate(v => getComputedStyle(v).objectFit)).toBe("contain");
  await child.getByRole("button", { name: "Enter fullscreen" }).focus();
  await child.keyboard.press("Enter");
  await expect.poll(() => child.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await child.evaluate(() => document.exitFullscreen());
  await child.screenshot({ path: info.outputPath("native-presentation.png") });
  await child.evaluate(() => {
    document.getElementById("root")!.requestFullscreen = () => Promise.reject(new Error("Fullscreen denial qualification"));
  });
  await child.keyboard.press("f");
  await expect(child.getByRole("alert")).toContainText("Fullscreen is unavailable");
  await expect(child.locator("video")).toBeVisible();
  expect(childRequests).toEqual([]);
  await child.close();
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
  expect(await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/original`)).body()).toEqual(original);
  await expect(page.locator(".molstar-host canvas").first()).toBeVisible();
});

test("reports viewer initialization failure in the presentation shell", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop failure qualification");
  const project = await newEmptyProject(page, request);
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.reload();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const imports = page.getByRole("dialog", { name: "Import structures" });
  await imports.locator('input[type="file"]').setInputFiles("tests/fixtures/formats/ethanol.mol");
  await imports.getByRole("button", { name: "Import", exact: true }).click();
  await expect(imports).toBeHidden();
  await expect(page.locator(".viewer-error")).toContainText(/WebGL|viewer could not start/i);
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Detach viewer" }).click();
  const child = await opened;
  await expect(child.getByRole("status")).toContainText("could not start");
  await expect(child.locator("video")).toBeHidden();
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
  await child.close();
});

test("keeps two owning workspaces and their presentation sessions isolated", async ({ page, request, context }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop session isolation qualification");
  test.setTimeout(120000);
  const firstProject = await prepare(page, request, ["tests/fixtures/formats/ethanol.mol"], "First presentation owner");
  const first = await openPresentation(page);
  const secondPage = await context.newPage();
  const secondProject = await prepare(secondPage, request, ["tests/fixtures/hydrogens/butane-reconciliation.mol"], "Second presentation owner");
  const second = await openPresentation(secondPage);
  const camera = await secondPage.evaluate(() => window.interactionEngines.at(-1)!.getCamera());
  const firstFrame = await frame(first);
  await page.bringToFront(); await page.locator(".molstar-host canvas").first().hover(); await page.mouse.wheel(0, -180);
  await expect.poll(async () => (await frame(first)).hash).not.toBe(firstFrame.hash);
  expect(await secondPage.evaluate(() => window.interactionEngines.at(-1)!.getCamera())).toEqual(camera);
  await page.getByRole("button", { name: "Detach viewer" }).click();
  expect(context.pages()).toHaveLength(4);
  await first.close(); await page.reload();
  await expect(second.locator("video")).toBeVisible();
  expect((await (await request.get(`/api/v1/projects/${firstProject.id}`)).json()).revision).toBe(firstProject.revision);
  expect((await (await request.get(`/api/v1/projects/${secondProject.id}`)).json()).revision).toBe(secondProject.revision);
  await second.close(); await secondPage.close();
});

test("retires stale output across reload, responsive remounts, projects and owner reload", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Detached windows are qualified on desktop Chromium");
  test.setTimeout(150000);
  const empty = await (await request.post("/api/v1/projects", { data: { name: `Empty presentation ${Date.now()}` } })).json() as { name: string };
  const project = await prepare(page, request, ["tests/fixtures/hydrogens/butane-reconciliation.mol"], "Presentation lifecycle");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const child = await openPresentation(page);
  await child.reload();
  await expect(child.locator("video")).toBeVisible();
  await expect.poll(async () => (await frame(child)).colored).toBeGreaterThan(100);
  await page.setViewportSize({ width: 650, height: 900 });
  await expect(child.locator("video")).toBeVisible();
  await expect.poll(async () => (await frame(child)).colored).toBeGreaterThan(100);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openProject(page, empty.name);
  await expect(child.locator("video")).toBeHidden();
  await expect(child.getByRole("status")).toContainText("Waiting for the molecular viewer");
  await openProject(page, project.name);
  await expect(child.locator("video")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(child.locator("video")).toBeHidden();
  await expect(child.getByRole("status")).toContainText("workspace is hidden");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden"); document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(child.locator("video")).toBeVisible();
  await page.reload();
  await expect(child.locator("video")).toBeHidden();
  await expect(child.getByRole("status")).toContainText("Workspace disconnected");
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  const replacement = await openPresentation(page);
  await replacement.close(); await child.close();
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
});

test("reports blocked popups and real WebGL source loss without mutating the project", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Detached windows are qualified on desktop Chromium");
  test.setTimeout(120000);
  const project = await prepare(page, request, ["tests/fixtures/hydrogens/butane-reconciliation.mol"], "Presentation failures");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  await page.evaluate(() => {
    Object.assign(window, { presentationNativeOpen: window.open }); window.open = () => null;
  });
  await page.getByRole("button", { name: "Detach viewer" }).click();
  await expect(page.getByRole("alert")).toContainText("Allow pop-ups");
  await page.getByRole("button", { name: "Dismiss presentation message" }).click();
  await page.evaluate(() => {
    window.open = (window as unknown as { presentationNativeOpen: typeof window.open }).presentationNativeOpen;
  });
  const child = await openPresentation(page);
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".molstar-host canvas")!;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Native loss extension required for source-lifecycle qualification");
    extension.loseContext();
  });
  await expect(child.locator("video")).toBeHidden();
  await expect(child.getByRole("status")).toContainText("source is unavailable");
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
  await child.close();
});

test("captures native molecular annotation raster and coordinate previews", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Detached windows are qualified on desktop Chromium");
  test.setTimeout(150000);
  let project = await prepare(page, request, ["tests/fixtures/hydrogens/butane-reconciliation.mol"], "Presentation annotations");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection = await (await request.get(`${path}/entries/${entry.id}/structure`)).json() as import("../../apps/web/src/api/types").StructureProjection;
  project = await (await request.put(`${path}/entries/${entry.id}/viewer-settings`, { data: {
    expected_revision: project.revision, settings: { ...entry.viewer_settings, labels: { ...entry.viewer_settings.labels, structure: true } },
  } })).json();
  for (const [kind, count] of [["distance", 2], ["angle", 3], ["dihedral", 4]] as const) {
    const measured = await request.post(`${path}/measurements`, { data: {
      expected_revision: project.revision, name: `Presentation ${kind}`, kind,
      atom_references: projection.structure.atoms.slice(0, count).map(atom => ({ structure_id: entry.id, atom_id: atom.id })),
    } });
    expect(measured.ok()).toBe(true); project = await measured.json();
  }
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { inspectViewerAnnotations } = await import("/src/test/viewerInterfaceHarness.ts");
    return (await inspectViewerAnnotations(window.interactionEngines.at(-1)!)).filter(a => a.textDrawCount > 0).length;
  })).toBe(4);
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Detach viewer" }).click();
  const child = await opened;
  await expect(child.locator("video")).toBeVisible();
  const source = await sourceRaster(page);
  await info.attach("source-canvas", { body: source, contentType: "image/png" });
  await expect.poll(async () => (await matchesSource(child, source)).fraction).toBeGreaterThan(0.95);
  const before = await frame(child);
  const patch = { entry_id: entry.id, artifact_id: entry.current_artifact_id!,
    atom_ids: projection.structure.atoms.map(a => a.id),
    coordinates: projection.structure.atoms.map(a => [a.coordinates[0] + 3, a.coordinates[1], a.coordinates[2]] as [number, number, number]) };
  await page.evaluate(patch => window.interactionEngines.at(-1)!.applyCoordinatePatch(patch, "preview"), patch);
  await expect.poll(async () => (await frame(child)).hash).not.toBe(before.hash);
  const preview = await sourceRaster(page);
  await expect.poll(async () => (await matchesSource(child, preview)).fraction).toBeGreaterThan(0.95);
  await page.evaluate(id => window.interactionEngines.at(-1)!.clearCoordinatePreview(id), entry.id);
  await expect.poll(async () => (await matchesSource(child, source)).fraction).toBeGreaterThan(0.95);
  await child.screenshot({ path: info.outputPath("native-annotations.png") });
  await child.close();
});
