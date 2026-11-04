import { expect, test, type Page } from "@playwright/test";
import { prepare } from "./support/interactions";

async function frame(page: Page) {
  return page.locator("video").evaluate((video: HTMLVideoElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(video, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      hash = Math.imul(hash ^ data[i], 16777619);
      if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 35) colored++;
    }
    return { width: canvas.width, height: canvas.height, hash: hash >>> 0, colored };
  });
}

async function matchesSource(child: Page, source: Buffer) {
  return child.locator("video").evaluate(async (video: HTMLVideoElement, png: string) => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const expected = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    ctx.drawImage(video, 0, 0);
    const actual = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let matching = 0, content = 0;
    for (let i = 0; i < expected.length; i += 4) {
      if (Math.max(...[0, 1, 2].map(c => Math.abs(expected[i + c] - expected[c]))) < 25) continue;
      content++;
      if (Math.max(...[0, 1, 2].map(c => Math.abs(expected[i + c] - actual[i + c]))) < 30) matching++;
    }
    return { content, fraction: matching / Math.max(1, content) };
  }, source.toString("base64"));
}

async function sourceRaster(page: Page) {
  const encoded = await page.evaluate(async () => {
    const engine = window.interactionEngines.at(-1)! as unknown as {
      plugin: { canvas3d: { requestDraw(): void } };
    };
    const canvas = document.querySelector<HTMLCanvasElement>(".molstar-host canvas")!;
    engine.plugin.canvas3d.requestDraw();
    // Read the actual canvas, excluding application controls composited above it.
    return await new Promise<string>(resolve => requestAnimationFrame(() => resolve(canvas.toDataURL().split(",")[1])));
  });
  return Buffer.from(encoded, "base64");
}

async function openPresentation(page: Page) {
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Detach viewer", exact: true }).click();
  const child = await opened;
  await expect(child.locator("video")).toBeVisible();
  return child;
}

async function openProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

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
  expect(childRequests).toEqual([]);
  await child.close();
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
  expect(await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/original`)).body()).toEqual(original);
  await expect(page.locator(".molstar-host canvas").first()).toBeVisible();
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
  const measured = await request.post(`${path}/measurements`, { data: {
    expected_revision: project.revision, name: "Presentation distance", kind: "distance",
    atom_references: projection.structure.atoms.slice(0, 2).map(atom => ({ structure_id: entry.id, atom_id: atom.id })),
  } });
  expect(measured.ok()).toBe(true);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { inspectViewerAnnotations } = await import("/src/test/viewerInterfaceHarness.ts");
    return (await inspectViewerAnnotations(window.interactionEngines.at(-1)!)).filter(a => a.textDrawCount > 0).length;
  })).toBe(2);
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
