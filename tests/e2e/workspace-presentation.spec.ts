import { readFileSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page, Route } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import type { SessionCamera, WorkspacePresentationV1 } from "../../apps/web/src/workspacePresentation/types";
import { connectPresentationContext, observeCameraEngine, test, expect } from "./support/workspace-presentation";

declare global {
  interface Window {
    cameraSurfaceWaiting?: boolean;
    releaseCameraSurface?: () => void;
  }
}

const endpoint = "/api/v1/workspace/presentation";
const mirrorKey = "neistra.workspace-presentation.v1";
const knownCamera = (mode: SessionCamera["mode"] = "perspective"): SessionCamera => ({
  mode, position: [3, -2, 35], target: [3, -2, 0], up: [0.5, Math.sqrt(3) / 2, 0], radius: 8, fov: 0.62,
});

async function createProject(request: APIRequestContext, name: string, count = 1) {
  const response = await request.post("/api/v1/projects", { data: { name } });
  expect(response.status()).toBe(201);
  let project = await response.json() as Project;
  for (let index = 0; index < count; index++) {
    const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
      expected_revision: String(project.revision), files: { name: `camera-${index}.mol`, mimeType: "chemical/x-mdl-molfile",
        buffer: readFileSync("tests/fixtures/formats/ethanol.mol") },
    } });
    expect(imported.status()).toBe(201); project = (await imported.json() as { project: Project }).project;
  }
  return project;
}

async function openProject(page: Page, project: Project, waitForDrawable = true) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true })
    .getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.getByRole("dialog", { name: "Projects", exact: true })).toBeHidden();
  if (project.entries.length && waitForDrawable) {
    const ids = project.entries.filter(entry => entry.visible).map(entry => entry.id);
    await expect.poll(() => page.evaluate(ids => {
      const refs = window.workspaceCameraEngine?.getRenderedAtomReferences() ?? [];
      const native = window.workspaceCameraEngine as unknown as { drawable?: boolean } | undefined;
      return ids.every(id => refs.some(atom => atom.structure_id === id)) && Boolean(native?.drawable)
        && Boolean(window.workspaceCameraController?.getSnapshot().camera);
    }, ids)).toBe(true);
  } else if (!project.entries.length) await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible();
}

async function camera(page: Page) {
  return page.evaluate(() => window.workspaceCameraEngine?.getSessionCamera() ?? null);
}

async function saved(request: APIRequestContext, expected: SessionCamera) {
  await expect.poll(async () => {
    const state = await (await request.get(endpoint)).json() as WorkspacePresentationV1;
    return state.camera;
  }).toEqual(expected);
  return await (await request.get(endpoint)).json() as WorkspacePresentationV1;
}

async function navigate(page: Page, mobile: boolean) {
  const box = (await page.locator(".molstar-host canvas").boundingBox())!;
  const x = Math.round(box.x + box.width * 0.52), y = Math.round(box.y + box.height * 0.6);
  const before = await camera(page);
  if (mobile) {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      for (let step = 1; step <= 5; step++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 6 * step, y: y - 3 * step, id: 1 }] });
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } finally { await session.detach(); }
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 30, y - 15, { steps: 5 }); await page.mouse.up();
  }
  await expect.poll(() => camera(page)).not.toEqual(before);
  // Observe actual native damping; no fixed sleep substitutes for a stable pose.
  let previous = "", stable = 0;
  await expect.poll(async () => {
    const current = JSON.stringify(await camera(page));
    stable = current === previous ? stable + 1 : 0; previous = current;
    return stable;
  }, { intervals: [100] }).toBeGreaterThanOrEqual(3);
  return (await camera(page))!;
}

async function witness(page: Page) {
  return page.evaluate(async () => {
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const engine = window.workspaceCameraEngine as unknown as {
      getSessionCamera(): SessionCamera;
      plugin: { canvas3d: { camera: { viewport: { width: number; height: number }; zoom: number;
        project(out: number[], point: number[]): number[] } } };
    };
    const native = engine.plugin.canvas3d.camera;
    const points = [[1, 0, 0], [3, 2, 1], [-2, -1, -2]];
    return { pose: engine.getSessionCamera(), viewport: { ...native.viewport }, zoom: native.zoom,
      landmarks: points.map(point => [...native.project([0, 0, 0], point)]) };
  });
}

function sameView(actual: Awaited<ReturnType<typeof witness>>, expected: Awaited<ReturnType<typeof witness>>) {
  expect(actual.pose).toEqual(expected.pose);
  expect(actual.viewport).toEqual(expected.viewport);
  expect(actual.zoom).toBeCloseTo(expected.zoom, 10);
  for (const [index, point] of actual.landmarks.entries()) {
    for (const [axis, value] of point.slice(0, 2).entries()) expect(value).toBeCloseTo(expected.landmarks[index][axis], 8);
  }
}

for (const mode of ["perspective", "orthographic"] as const) {
  test(`keeps the shared ${mode} camera across projects, reload, API restart and a fresh browser`, async ({ page, browser, presentationApi }, info) => {
    test.setTimeout(180_000);
    const { request } = presentationApi;
    let a = await createProject(request, `Camera A ${mode}`, 2);
    const renamed = await request.patch(`/api/v1/projects/${a.id}`, { data: { expected_revision: a.revision, name: `${a.name} renamed`, description: null } });
    expect(renamed.status()).toBe(200); a = await renamed.json() as Project;
    const undone = await request.post(`/api/v1/projects/${a.id}/history/undo`, { data: { expected_revision: a.revision } });
    expect(undone.status()).toBe(200); a = await undone.json() as Project;
    expect(a.history.can_redo).toBe(true);
    const b = await createProject(request, `Camera B ${mode}`);
    const empty = await createProject(request, `Camera empty ${mode}`, 0);
    await page.goto("/"); await openProject(page, a);
    await expect.poll(() => page.evaluate(() => window.workspaceCameraFits)).toBe(1);
    await page.evaluate(pose => { window.workspaceCameraEngine.setSessionCamera(pose); window.workspaceCameraEngine.zoom(1); }, knownCamera(mode));
    const pose = await navigate(page, info.project.name === "mobile-chromium");
    await saved(request, pose);
    const baseline = await (await request.get(`/api/v1/projects/${a.id}`)).text();
    const before = await witness(page);
    await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
    for (const entry of [a.entries[1], a.entries[0]]) {
      await page.getByRole("combobox", { name: "Controlled structure", exact: true }).selectOption(entry.id);
      expect(await camera(page)).toEqual(pose);
    }
    await page.getByRole("button", { name: "Close viewer controls", exact: true }).click();
    await openProject(page, b); expect(await camera(page)).toEqual(pose);
    await openProject(page, empty);
    await openProject(page, a); sameView(await witness(page), before);
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: info.project.name === "chromium" ? 393 : 1100, height: viewport.height });
    await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
    await page.setViewportSize(viewport);
    await expect.poll(() => camera(page)).toEqual(pose);
    sameView(await witness(page), before);
    expect(await page.evaluate(() => window.workspaceCameraFits)).toBe(1);
    expect(await (await request.get(`/api/v1/projects/${a.id}`)).text()).toBe(baseline);
    await page.reload();
    await expect.poll(() => camera(page)).toEqual(pose);
    await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
    sameView(await witness(page), before);
    expect(await page.evaluate(() => window.workspaceCameraFits ?? 0)).toBe(0);
    await presentationApi.restart();
    await page.reload();
    await expect.poll(() => camera(page)).toEqual(pose);
    await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
    sameView(await witness(page), before);
    const ratio = await page.evaluate(() => window.devicePixelRatio);
    const fresh = await browser.newContext({ viewport, deviceScaleFactor: ratio,
      isMobile: info.project.name === "mobile-chromium", hasTouch: info.project.name === "mobile-chromium" });
    try {
      await connectPresentationContext(fresh, presentationApi.baseUrl);
      const reopened = await fresh.newPage(); await reopened.goto("/"); await openProject(reopened, a);
      sameView(await witness(reopened), before);
      expect(await reopened.evaluate(() => window.workspaceCameraFits ?? 0)).toBe(0);
      expect(await reopened.evaluate(key => localStorage.getItem(key), mirrorKey)).toContain('"dirty":false');
    } finally { await fresh.close(); }
    writeFileSync(info.outputPath(`shared-camera-${mode}.json`), JSON.stringify({ before,
      afterRestart: await witness(page), presentation: await (await request.get(endpoint)).json() as WorkspacePresentationV1, projectBytesUnchanged: true }, null, 2));
  });
}

test("recovers a same-browser immediate close before the camera write is acknowledged", async ({ page, context, presentationApi }, info) => {
  test.setTimeout(120_000);
  const project = await createProject(presentationApi.request, "Immediate close camera");
  await page.goto("/"); await openProject(page, project);
  expect(await page.evaluate(() => window.workspaceCameraFits)).toBe(1);
  const initial = (await camera(page))!; const acknowledged = await saved(presentationApi.request, initial);
  await page.route(`**${endpoint}`, async route => {
    if (route.request().method() === "PUT") await route.abort("failed"); else await route.fallback();
  });
  const pose = await page.evaluate(() => { window.workspaceCameraEngine.zoom(0.8); return window.workspaceCameraEngine.getSessionCamera(); });
  const mirror = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as unknown, mirrorKey);
  expect(mirror).toMatchObject({ dirty: true, base_revision: acknowledged.revision, camera: pose });
  const closingPose: SessionCamera = { ...pose!, position: [pose!.position[0] + 1e-7, pose!.position[1], pose!.position[2]] };
  await page.evaluate(() => {
    // Capture phase precedes App's closure flush. This injects a last raw native
    // control update with no intervening renderer frame or changed notification.
    window.addEventListener("pagehide", () => {
      const engine = window.workspaceCameraEngine as unknown as { plugin: { canvas3d: { camera: { position: number[] } } } };
      engine.plugin.canvas3d.camera.position[0] += 1e-7;
    }, { capture: true, once: true });
  });
  await page.close();
  const reopened = await context.newPage(); await reopened.goto("/");
  await expect.poll(() => camera(reopened)).toEqual(closingPose);
  await saved(presentationApi.request, closingPose);
  expect(await reopened.evaluate(() => window.workspaceCameraFits ?? 0)).toBe(0);
  writeFileSync(info.outputPath("immediate-close-camera.json"), JSON.stringify({ mirror, closingPose,
    recovered: await camera(reopened), state: await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1 }, null, 2));
});

test("preserves native navigation through late hydration and requires explicit conflict publication", async ({ page, presentationApi }, info) => {
  test.setTimeout(120_000);
  const old = knownCamera();
  expect((await presentationApi.request.put(endpoint, { data: { expected_revision: 0, camera: old } })).status()).toBe(200);
  const project = await createProject(presentationApi.request, "Late camera hydration");
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let captured = false;
  await page.route(`**${endpoint}`, async route => {
    if (route.request().method() !== "GET" || captured) return route.fallback();
    captured = true;
    const response = await route.fetch({ url: `${presentationApi.baseUrl}${endpoint}` });
    await held; await route.fulfill({ response });
  });
  await page.goto("/"); await openProject(page, project, false);
  await expect.poll(() => page.evaluate(() => Boolean(window.workspaceCameraEngine))).toBe(true);
  const pose = await navigate(page, info.project.name === "mobile-chromium");
  release();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  expect(await camera(page)).toEqual(pose);
  expect(await page.evaluate(() => window.workspaceCameraFits ?? 0)).toBe(0);
  await expect(page.getByRole("button", { name: "Save current view", exact: true })).toBeVisible();
  expect((await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1).camera).toEqual(old);
  await page.getByRole("button", { name: "Save current view", exact: true }).click();
  await saved(presentationApi.request, pose);
  writeFileSync(info.outputPath("late-camera-hydration.json"), JSON.stringify({ savedBefore: old, kept: pose,
    state: await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1 }, null, 2));
});

for (const navigateWhilePending of [false, true]) {
  test(`fits the first installed surface once with navigation pending=${navigateWhilePending}`, async ({ page, presentationApi }, info) => {
    test.setTimeout(120_000);
    let project = await createProject(presentationApi.request, `Surface camera pending ${navigateWhilePending}`);
    const entry = project.entries[0];
    const created = await presentationApi.request.post(`/api/v1/projects/${project.id}/surfaces`, { data: {
      expected_revision: project.revision, surfaces: [{ entry_id: entry.id, source: { kind: "entry" } }],
    } });
    expect(created.status()).toBe(200); project = await created.json() as Project;
    const updated = await presentationApi.request.put(`/api/v1/projects/${project.id}/entries/${entry.id}/viewer-settings`, { data: {
      expected_revision: project.revision, settings: { ...project.entries[0].viewer_settings, representations: [] },
    } });
    expect(updated.status()).toBe(200); project = await updated.json() as Project;
    await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
      const response = await route.fetch(); await route.fulfill({ response, body: observeCameraEngine(await response.text(), true) });
    });
    await page.goto("/"); await openProject(page, project, false);
    await expect.poll(() => page.evaluate(() => window.cameraSurfaceWaiting ?? false)).toBe(true);
    expect(await page.evaluate(() => window.workspaceCameraEngine.getRenderedAtomReferences())).toEqual([]);
    expect(await page.evaluate(() => window.workspaceCameraFits ?? 0)).toBe(0);
    const pose = navigateWhilePending ? await navigate(page, info.project.name === "mobile-chromium") : null;
    await page.evaluate(() => window.releaseCameraSurface?.());
    await expect.poll(() => page.evaluate(() => window.workspaceCameraEngine.getRenderedAtomReferences().length)).toBeGreaterThan(0);
    if (pose) {
      expect(await camera(page)).toEqual(pose);
      expect(await page.evaluate(() => window.workspaceCameraFits ?? 0)).toBe(0);
    } else {
      await expect.poll(() => page.evaluate(() => window.workspaceCameraFits)).toBe(1);
      expect((await camera(page))!.radius).toBeGreaterThan(0.01);
      expect((await camera(page))!.position).not.toEqual([0, 0, 100]);
    }
    await saved(presentationApi.request, (await camera(page))!);
    writeFileSync(info.outputPath("first-surface-camera.json"), JSON.stringify({ navigateWhilePending,
      camera: await camera(page), fitCount: await page.evaluate(() => window.workspaceCameraFits ?? 0) }, null, 2));
  });
}

test("keeps unsaved camera recovery visible and reconciles an external writer before explicit Save", async ({ page, presentationApi }, info) => {
  test.setTimeout(180_000);
  const project = await createProject(presentationApi.request, "Camera conflict recovery");
  await page.goto("/"); await openProject(page, project);
  await saved(presentationApi.request, (await camera(page))!);
  const fail = async (route: Route) => {
    if (route.request().method() === "PUT") await route.abort("failed"); else await route.fallback();
  };
  await page.route(`**${endpoint}`, fail);
  const pose = await navigate(page, info.project.name === "mobile-chromium");
  await expect(page.getByRole("button", { name: "Retry saving view", exact: true })).toBeVisible();
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 850 });
  await expect.poll(() => camera(page)).toEqual(pose);
  await expect(page.getByRole("button", { name: "Retry saving view", exact: true })).toBeInViewport();
  const violations = await new AxeBuilder({ page }).include(".camera-recovery").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("camera-unsaved-320.png") });
  await page.unroute(`**${endpoint}`, fail);
  const before = await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1;
  const external = { ...knownCamera("orthographic"), position: [15, 9, 40] as [number, number, number] };
  expect((await presentationApi.request.put(endpoint, { data: { expected_revision: before.revision, camera: external } })).status()).toBe(200);
  let writes = 0; page.on("request", request => { if (request.method() === "PUT" && request.url().endsWith(endpoint)) writes++; });
  await page.getByRole("button", { name: "Retry saving view", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save current view", exact: true })).toBeVisible();
  expect(writes).toBe(0); expect(await camera(page)).toEqual(pose);
  await page.reload();
  await expect(page.getByRole("button", { name: "Save current view", exact: true })).toBeVisible();
  await expect.poll(() => camera(page)).toEqual(pose);
  const dirty = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as unknown, mirrorKey);
  expect(dirty).toMatchObject({ dirty: true, base_revision: before.revision });
  const serverBeforeSave = await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1;
  expect(serverBeforeSave.camera).toEqual(external);
  await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
  await page.getByRole("button", { name: "Manage surfaces", exact: true }).click();
  const recovery = page.getByRole("button", { name: "Save current view", exact: true });
  await expect.poll(() => recovery.evaluate(node => {
    const rect = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  await expect(page.getByRole("button", { name: "Close surfaces", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Close surfaces", exact: true }).click();
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let stored = false;
  await page.route(`**${endpoint}`, async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    const response = await route.fetch({ url: `${presentationApi.baseUrl}${endpoint}` });
    stored = true; await held; await route.fulfill({ response });
  });
  await recovery.click();
  await expect.poll(() => stored).toBe(true);
  await expect(recovery).toBeFocused(); await expect(recovery).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".camera-recovery")).toBeVisible();
  release(); await saved(presentationApi.request, pose);
  await expect(page.locator(".camera-recovery")).toHaveCount(0);
  await page.setViewportSize(viewport);
  await expect.poll(() => camera(page)).toEqual(pose);
  writeFileSync(info.outputPath("camera-conflict-recovery.json"), JSON.stringify({ dirty, serverBeforeSave,
    explicitResult: await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1, camera: await camera(page), automaticWritesAfterConflict: writes - 1 }, null, 2));
});

test("keeps the native viewer usable when a saved pose cannot project in its viewport", async ({ page, presentationApi }, info) => {
  test.setTimeout(120_000);
  const unusable = { ...knownCamera(), fov: 1e-307 };
  const stored = await presentationApi.request.put(endpoint, { data: { expected_revision: 0, camera: unusable } });
  expect(stored.status()).toBe(200);
  const project = await createProject(presentationApi.request, "Viewport camera recovery");
  await page.goto("/"); await openProject(page, project);
  await expect(page.locator(".camera-recovery")).toContainText("View unavailable");
  expect((await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1).camera).toEqual(unusable);
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
  const adjusted = (await camera(page))!;
  expect(adjusted.fov).toBe(Math.PI / 4); expect(adjusted.radius).toBeGreaterThan(0.01);
  await saved(presentationApi.request, adjusted);
  await expect(page.locator(".camera-recovery")).toHaveCount(0);
  writeFileSync(info.outputPath("viewport-camera-recovery.json"), JSON.stringify({ rejected: unusable, adjusted,
    persisted: await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1 }, null, 2));
});

test("applies legacy scenes with current FOV, supersedes delayed scene cameras and captures exact native poses", async ({ page, presentationApi }, info) => {
  test.setTimeout(180_000);
  const project = await createProject(presentationApi.request, "Scene camera ownership");
  await page.goto("/"); await openProject(page, project);
  const authored = knownCamera("orthographic");
  await page.evaluate(pose => { window.workspaceCameraEngine.setSessionCamera(pose); window.workspaceCameraEngine.zoom(1); }, authored);
  await saved(presentationApi.request, authored);
  await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
  await page.getByPlaceholder("Scene name", { exact: true }).fill("Portable view");
  await page.getByRole("button", { name: "Save current scene", exact: true }).click();
  const sceneButton = page.getByRole("button", { name: "Portable view", exact: true });
  await expect(sceneButton).toBeVisible();
  const withScene = await (await presentationApi.request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  expect(withScene.scenes).toHaveLength(1);
  expect(Object.keys(withScene.scenes[0].camera).sort()).toEqual(["mode", "position", "radius", "target", "up"]);
  const changed = { ...authored, fov: 0.9, position: [10, 3, 25] as [number, number, number] };
  await page.evaluate(pose => { window.workspaceCameraEngine.setSessionCamera(pose); window.workspaceCameraEngine.zoom(1); }, changed);
  await sceneButton.click();
  const applied = { ...authored, fov: changed.fov };
  await expect.poll(() => camera(page)).toEqual(applied);
  await saved(presentationApi.request, applied);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let stored = false;
  await page.route(`**/scenes/${withScene.scenes[0].id}/apply`, async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${presentationApi.baseUrl}${url.pathname}` });
    stored = true; await held; await route.fulfill({ response });
  });
  const sceneResponse = page.waitForResponse(response => response.url().endsWith(`/scenes/${withScene.scenes[0].id}/apply`)
    && response.request().method() === "POST").then(response => response.status(), () => 0);
  await sceneButton.click(); await expect.poll(() => stored).toBe(true);
  await page.getByRole("button", { name: "Close viewer controls", exact: true }).click();
  const later = await navigate(page, info.project.name === "mobile-chromium");
  release(); expect(await sceneResponse).toBe(200);
  await expect(page.getByRole("button", { name: "Open viewer controls", exact: true })).toBeEnabled();
  await expect.poll(() => camera(page)).toEqual(later);
  await saved(presentationApi.request, later);
  expect((await witness(page)).pose).toEqual(later);
  const tiny = await page.evaluate(() => {
    const engine = window.workspaceCameraEngine as unknown as { getSessionCamera(): SessionCamera;
      plugin: { canvas3d: { camera: { position: number[]; update(): boolean } } } };
    engine.plugin.canvas3d.camera.position[0] += 1e-9;
    return { matrixChanged: engine.plugin.canvas3d.camera.update(), pose: engine.getSessionCamera() };
  });
  expect(tiny.matrixChanged).toBe(false);
  await saved(presentationApi.request, tiny.pose);
  await page.reload(); await expect.poll(() => camera(page)).toEqual(tiny.pose);
  writeFileSync(info.outputPath("scene-camera-ownership.json"), JSON.stringify({ authored, applied, later,
    tiny, persisted: await (await presentationApi.request.get(endpoint)).json() as WorkspacePresentationV1 }, null, 2));
});
