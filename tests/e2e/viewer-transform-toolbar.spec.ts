import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";

async function projectRead(request: APIRequestContext, id: string): Promise<Project> {
  const response = await request.get(`/api/v1/projects/${id}`);
  expect(response.status()).toBe(200);
  return response.json();
}

async function prepare(page: Page, request: APIRequestContext, mobile: boolean) {
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
const toolbarNativeMount = MolstarEngine.prototype.mount;
MolstarEngine.prototype.mount = async function(target) {
  await toolbarNativeMount.call(this, target);
  (window.movementEngines ??= []).push(this);
};` });
  });
  const initial: Project = await (await request.post("/api/v1/projects", { data: { name: `Transform toolbar ${Date.now()}` } })).json();
  const response = await request.post(`/api/v1/projects/${initial.id}/imports`, {
    multipart: { expected_revision: "0", files: { name: "ethanol.mol", mimeType: "chemical/x-mdl-molfile", buffer: readFileSync(resolve("tests/fixtures/formats/ethanol.mol")) } },
  });
  expect(response.status()).toBe(201);
  const project = await projectRead(request, initial.id);
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  const launcher = page.getByRole("button", { name: "Transform selection", exact: true });
  await expect(launcher).toHaveAttribute("aria-disabled", "true");
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByLabel("Select by").selectOption("structure");
  await page.getByLabel("Value", { exact: true }).fill(project.entries[0].id);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  await expect(launcher).toHaveAttribute("aria-disabled", "false");
  const inspect = () => page.evaluate(async entryId => {
    const { inspectInteractiveTransform } = await import("/src/test/interactiveTransformHarness.ts");
    return inspectInteractiveTransform(window.movementEngines.at(-1)!, entryId);
  }, project.entries[0].id);
  const original = await inspect();
  return { project, launcher, inspect, original };
}

async function drag(page: Page, button: "left" | "right", dx: number, dy: number, camera = false) {
  const box = (await page.getByTestId("structure-viewer").boundingBox())!;
  const x = box.x + box.width * 0.8, y = box.y + box.height * 0.8;
  expect(await page.evaluate(point => point.camera
    ? Boolean(document.elementFromPoint(point.x, point.y)?.closest(".molstar-host"))
    : document.elementFromPoint(point.x, point.y)?.getAttribute("data-testid") === "movement-pointer-surface", { x, y, camera })).toBe(true);
  await page.mouse.move(x, y); await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up({ button });
  if (camera) await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test("transforms from the viewer with fixed mouse gestures, exact Cancel and one Apply/undo/redo", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const { project, launcher, inspect, original } = await prepare(page, request, info.project.name === "mobile-chromium");
  let applies = 0;
  const unexpected: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/selection-transform")) applies++;
    if (/\/entries\/[^/]+\/structure$/.test(new URL(request.url()).pathname) || request.method() === "POST" && request.url().endsWith("/jobs")) unexpected.push(request.url());
  });
  await launcher.click();
  const controls = page.getByRole("region", { name: "Move selection controls" });
  await expect(controls).toBeVisible();
  await expect(page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Step right" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Fit all visible" })).toHaveAttribute("aria-disabled", "true");
  await controls.getByRole("button", { name: "More movement tools", exact: true }).click();
  await page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Depth", exact: true }).click();
  await controls.getByRole("button", { name: "More movement tools", exact: true }).click();
  await drag(page, "left", 25, 10);
  await expect.poll(async () => (await inspect()).coordinates).not.toEqual(original.coordinates);
  const rotated = await inspect();
  expect(rotated.camera).toEqual(original.camera);
  // Mouse remains rotation even when the touch/keyboard preference is Depth.
  const centroid = (coordinates: typeof original.coordinates) => coordinates.reduce((sum, [, point]) => sum.map((v, i) => v + point[i] / coordinates.length), [0, 0, 0]);
  centroid(rotated.coordinates).forEach((value, i) => expect(value).toBeCloseTo(centroid(original.coordinates)[i], 5));
  await drag(page, "right", 15, -12);
  await expect.poll(async () => (await inspect()).coordinates).not.toEqual(rotated.coordinates);
  expect((await inspect()).camera).toEqual(original.camera);
  expect(await projectRead(request, project.id)).toEqual(project);
  expect(applies).toBe(0); expect(unexpected).toEqual([]);
  await controls.getByRole("button", { name: "Cancel movement" }).click();
  await expect(controls).toBeHidden(); await expect(launcher).toBeFocused();
  await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
  await launcher.click();
  await drag(page, "right", 15, 0);
  await controls.getByRole("button", { name: "Apply movement" }).click();
  await expect(controls).toBeHidden();
  const moved = await projectRead(request, project.id);
  expect(moved.revision).toBe(project.revision + 1); expect(applies).toBe(1);
  const movedProjection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/structure`)).json();
  await page.getByRole("button", { name: /^Undo: Move / }).click();
  await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
  await page.getByRole("button", { name: /^Redo: Move / }).click();
  await expect.poll(async () => (await projectRead(request, project.id)).revision).toBe(moved.revision + 2);
  const redone: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/structure`)).json();
  expect(redone.structure).toEqual(movedProjection.structure);
  await expect(page.locator(".viewer-error")).toBeHidden();
});

test("temporarily navigates the native camera with Space and the view toggle without changing the captured preview", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const { project, launcher, inspect, original } = await prepare(page, request, info.project.name === "mobile-chromium");
  const selection = () => page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    return useSelectionStore.getState().selection;
  });
  const capturedSelection = await selection();
  const molecularRequests: string[] = [];
  page.on("request", r => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(r.url()).pathname) || r.method() === "POST" && /\/(jobs|selection-transform)$/.test(r.url())) molecularRequests.push(r.url());
  });
  const controls = page.getByRole("region", { name: "Move selection controls" });
  for (const projection of ["perspective", "orthographic"] as const) {
    await page.evaluate(mode => window.movementEngines.at(-1)!.setCameraMode(mode), projection);
    await expect.poll(async () => (await inspect()).camera?.mode).toBe(projection);
    await launcher.click();
    await drag(page, "left", 20, -10);
    await expect.poll(async () => (await inspect()).coordinates).not.toEqual(original.coordinates);
    const preview = (await inspect()).coordinates;
    const initialCamera = (await inspect()).camera;
    const triggersBefore = (await inspect()).navigationTriggers;
    const canvas = page.getByRole("group", { name: "Move selection canvas" });
    for (let i = 0; i < 2; i++) {
      // Natural focus from transformation/previous native drag; no focus injection.
      await expect(canvas).toBeFocused(); await page.keyboard.down("Space");
      await expect.poll(async () => (await inspect()).movementInteraction).toBe("camera");
      await drag(page, "left", -45, 25, true);
      await expect.poll(async () => (await inspect()).camera).not.toEqual(initialCamera);
      expect((await inspect()).coordinates).toEqual(preview);
      await expect(canvas).toBeFocused();
      await page.keyboard.up("Space");
      await expect.poll(async () => (await inspect()).movementInteraction).toBe("transform");
      expect((await inspect()).navigationTriggers).toBe(triggersBefore);
    }
    await controls.getByRole("button", { name: "Adjust view" }).click();
    await expect.poll(async () => (await inspect()).movementInteraction).toBe("camera");
    await canvas.focus(); await page.keyboard.down("Space"); await page.keyboard.up("Space");
    await expect(controls.getByRole("button", { name: "Resume transform" })).toHaveAttribute("aria-pressed", "true");
    const beforePan = (await inspect()).camera;
    await drag(page, "right", -20, -10, true);
    await expect.poll(async () => (await inspect()).camera?.target).not.toEqual(beforePan?.target);
    const panned = await inspect();
    await drag(page, "left", 0, 0, true); // Empty primary click must not clear selection.
    await drag(page, "right", 0, 0, true); // Secondary click must not focus/reset.
    expect((await inspect()).camera).toEqual(panned.camera);
    await page.mouse.wheel(0, -60);
    await expect.poll(async () => (await inspect()).camera).not.toEqual(panned.camera);
    expect((await inspect()).coordinates).toEqual(preview);
    expect(await selection()).toEqual(capturedSelection);
    await controls.getByRole("button", { name: "Resume transform" }).click();
    await expect.poll(async () => (await inspect()).movementInteraction).toBe("transform");
    const camera = (await inspect()).camera!;
    await drag(page, "right", 25, 0);
    await expect.poll(async () => (await inspect()).coordinates).not.toEqual(preview);
    const translated = (await inspect()).coordinates;
    const displacement = translated[0][1].map((v, i) => v - preview[0][1][i]);
    const forward = camera.target.map((v, i) => v - camera.position[i]);
    expect(displacement.reduce((sum, v, i) => sum + v * forward[i], 0)).toBeCloseTo(0, 5);
    const cross = [forward[1] * camera.up[2] - forward[2] * camera.up[1], forward[2] * camera.up[0] - forward[0] * camera.up[2], forward[0] * camera.up[1] - forward[1] * camera.up[0]];
    expect(displacement.reduce((sum, v, i) => sum + v * cross[i], 0)).toBeGreaterThan(0);
    expect((await inspect()).camera).toEqual(camera);
    expect(await projectRead(request, project.id)).toEqual(project);
    expect(molecularRequests).toEqual([]);
    await controls.getByRole("button", { name: "Cancel movement" }).click();
    await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
    await expect.poll(async () => (await inspect()).movementInteraction).toBe("inactive");
    expect((await inspect()).navigationTriggers).toBeGreaterThan(0);
  }
});

test("returns the mouse from movement tools for Space without stealing editable or unrelated focus", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const { project, launcher, inspect, original } = await prepare(page, request, info.project.name === "mobile-chromium");
  const selection = () => page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    return useSelectionStore.getState().selection;
  });
  const captured = await selection();
  const requests: string[] = [];
  page.on("request", r => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(r.url()).pathname) || r.method() === "POST" && /\/(jobs|selection-transform)$/.test(r.url())) requests.push(r.url());
  });
  await launcher.click();
  const controls = page.getByRole("region", { name: "Move selection controls" });
  const more = controls.getByRole("button", { name: "More movement tools", exact: true });
  const panel = page.getByRole("dialog", { name: "More movement tools", exact: true });
  const canvas = page.getByRole("group", { name: "Move selection canvas" });
  const returnMouse = async () => {
    const box = (await page.getByTestId("structure-viewer").boundingBox())!;
    // Actual pointer movement, including an idle move while a panel stays open.
    await page.mouse.move(box.x + box.width * 0.91, box.y + box.height * 0.89);
    await page.mouse.move(box.x + box.width * 0.92, box.y + box.height * 0.9);
  };
  const navigate = async () => {
    const before = await inspect();
    await returnMouse(); await expect(canvas).toBeFocused();
    await page.keyboard.down("Space");
    await expect.poll(async () => (await inspect()).movementInteraction).toBe("camera");
    await drag(page, "left", -35, 20, true);
    await expect.poll(async () => (await inspect()).camera).not.toEqual(before.camera);
    expect((await inspect()).coordinates).toEqual(before.coordinates);
    await expect(canvas).toBeFocused();
    await page.keyboard.up("Space");
    await expect.poll(async () => (await inspect()).movementInteraction).toBe("transform");
  };
  await more.click();
  await panel.getByRole("button", { name: "Translate", exact: true }).click();
  await panel.getByRole("button", { name: "Step right" }).click();
  await expect.poll(async () => (await inspect()).coordinates).not.toEqual(original.coordinates);
  await navigate(); // Mode/step focus while More stays open.
  await more.click(); await navigate(); // Closed More trigger focus.
  await controls.getByRole("button", { name: "Adjust view" }).click();
  await drag(page, "left", 20, -15, true);
  await controls.getByRole("button", { name: "Resume transform" }).click();
  await navigate(); // Explicit Resume transform focus.
  const preview = (await inspect()).coordinates;
  await more.click();
  const slider = panel.getByRole("slider", { name: "Sensitivity" });
  await slider.click(); await returnMouse(); await expect(slider).toBeFocused();
  await page.keyboard.press("Space");
  expect((await inspect()).movementInteraction).toBe("transform");
  expect((await inspect()).coordinates).toEqual(preview);
  await more.click();
  const projects = page.getByRole("button", { name: "Projects", exact: true });
  await projects.focus(); await returnMouse(); await expect(projects).toBeFocused();
  await page.keyboard.press("Space"); // Preserve native button activation.
  const modal = page.getByRole("dialog", { name: "Projects", exact: true });
  await expect(modal).toBeVisible();
  await returnMouse();
  expect(await modal.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden(); await expect(controls).toBeVisible();
  expect(await selection()).toEqual(captured);
  expect(await projectRead(request, project.id)).toEqual(project);
  expect(requests).toEqual([]);
  await controls.getByRole("button", { name: "Cancel movement" }).click();
  await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
});

test("ends held mouse gestures at accepted coordinates and camera before ownership changes", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const { project, launcher, inspect, original } = await prepare(page, request, info.project.name === "mobile-chromium");
  await launcher.click();
  const box = (await page.getByTestId("structure-viewer").boundingBox())!;
  const x = box.x + box.width * 0.8, y = box.y + box.height * 0.8;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 25, y - 10, { steps: 6 });
  await expect.poll(async () => (await inspect()).coordinates).not.toEqual(original.coordinates);
  const accepted = await inspect();
  await page.keyboard.down("Space");
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("camera");
  await page.mouse.move(x - 45, y - 20, { steps: 6 });
  expect((await inspect()).coordinates).toEqual(accepted.coordinates);
  expect((await inspect()).camera).toEqual(accepted.camera);
  await page.mouse.up();
  // Fresh camera down works; releasing Space while held accepts its current view.
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 40, y + 15, { steps: 8 });
  await expect.poll(async () => (await inspect()).camera).not.toEqual(accepted.camera);
  const camera = (await inspect()).camera;
  await page.keyboard.up("Space");
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("transform");
  await page.mouse.move(x - 55, y + 25, { steps: 6 });
  expect((await inspect()).coordinates).toEqual(accepted.coordinates);
  expect((await inspect()).camera).toEqual(camera);
  await page.mouse.up();
  // Blur with a transform drag also preserves its accepted pose, without navigation.
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 15, y - 5, { steps: 5 });
  await expect.poll(async () => (await inspect()).coordinates).not.toEqual(accepted.coordinates);
  const beforeBlur = (await inspect()).coordinates;
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.move(x + 30, y - 15, { steps: 5 }); await page.mouse.up();
  expect((await inspect()).coordinates).toEqual(beforeBlur);
  await drag(page, "right", 10, 0);
  await expect.poll(async () => (await inspect()).coordinates).not.toEqual(beforeBlur);
  expect(await projectRead(request, project.id)).toEqual(project);
  await page.getByRole("button", { name: "Cancel movement" }).click();
  await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
});

test("clears temporary navigation on interruption and remount while preserving preview and camera", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const mobile = info.project.name === "mobile-chromium";
  const { project, launcher, inspect, original } = await prepare(page, request, mobile);
  await launcher.click(); await drag(page, "left", 20, 10);
  await expect.poll(async () => (await inspect()).coordinates).not.toEqual(original.coordinates);
  const preview = (await inspect()).coordinates;
  const controls = page.getByRole("region", { name: "Move selection controls" });
  const canvas = page.getByRole("group", { name: "Move selection canvas" });
  await canvas.focus(); await page.keyboard.down("Shift"); await page.keyboard.press("Space"); await page.keyboard.up("Shift");
  expect((await inspect()).movementInteraction).toBe("transform");
  await page.keyboard.down("Space");
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("camera");
  await controls.getByRole("button", { name: "More movement tools", exact: true }).focus();
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("transform");
  await page.keyboard.up("Space");
  await page.keyboard.press("Space"); // Native disclosure activation, not the shortcut.
  await expect(page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Depth", exact: true })).toBeVisible();
  await controls.getByRole("button", { name: "More movement tools", exact: true }).click();
  for (const interruption of ["blur", "hidden", "modal"] as const) {
    await controls.getByRole("button", { name: "Adjust view" }).click();
    await drag(page, "left", 15, -10, true);
    const camera = (await inspect()).camera;
    if (interruption === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (interruption === "hidden") await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      delete (document as unknown as { hidden?: boolean }).hidden;
    });
    else {
      await page.getByRole("button", { name: "Projects", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Projects", exact: true })).toBeVisible();
      await page.getByRole("dialog", { name: "Projects", exact: true }).focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Projects", exact: true })).toBeHidden();
    }
    await expect.poll(async () => (await inspect()).movementInteraction).toBe("transform");
    expect((await inspect()).camera).toEqual(camera);
    expect((await inspect()).coordinates).toEqual(preview);
    await expect(controls.getByRole("button", { name: "Adjust view" })).toHaveAttribute("aria-pressed", "false");
  }
  // Keyboard Space activates the explicit native button, and remount clears it.
  await controls.getByRole("button", { name: "Adjust view" }).focus(); await page.keyboard.press("Space");
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("camera");
  await drag(page, "left", 25, -15, true);
  const before = await inspect();
  const count = await page.evaluate(() => window.movementEngines.length);
  await page.setViewportSize({ width: mobile ? 1440 : 393, height: 900 });
  await expect.poll(() => page.evaluate(() => window.movementEngines.length)).toBeGreaterThan(count);
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("transform");
  await expect.poll(async () => (await inspect()).coordinates).toEqual(before.coordinates);
  await expect.poll(async () => (await inspect()).camera).toEqual(before.camera);
  await expect(controls.getByRole("button", { name: "Adjust view" })).toHaveAttribute("aria-pressed", "false");
  expect(await projectRead(request, project.id)).toEqual(project);
  await controls.getByRole("button", { name: "Adjust view" }).click();
  await controls.getByRole("button", { name: "Apply movement" }).click();
  await expect(controls).toBeHidden();
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("inactive");
  expect((await projectRead(request, project.id)).revision).toBe(project.revision + 1);
  await page.getByRole("button", { name: /^Undo: Move / }).click();
  await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
});

async function touchDrag(page: Page, dx: number, dy: number) {
  const box = (await page.getByTestId("structure-viewer").boundingBox())!;
  const x = box.x + box.width * 0.8, y = box.y + box.height * 0.8;
  const input = await page.context().newCDPSession(page);
  try {
    await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 8; i++) await input.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8, id: 1 }] });
    await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await input.detach(); }
}

test("qualifies native touch navigation, secondary tools and accessible theme layouts", async ({ page, request }, info) => {
  test.skip(info.project.name !== "mobile-chromium", "Touch qualification uses Pixel 7; desktop has native mouse and real zoom evidence.");
  test.setTimeout(120_000);
  const { project, launcher, inspect, original } = await prepare(page, request, true);
  const controls = page.getByRole("region", { name: "Move selection controls" });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    expect(await launcher.textContent()).toBe("");
    await launcher.tap();
    for (const button of await controls.getByRole("button").all()) expect(await button.textContent()).toBe("");
    await controls.getByRole("button", { name: "Movement help and scientific limits" }).tap();
    const help = page.getByRole("dialog", { name: "Movement help and scientific limits", exact: true });
    await expect(help).toContainText(`${project.entries[0].atom_count} captured atoms · 0 hidden`);
    await expect(help).toContainText("Missing bond records do not establish safety");
    await expect(help).toContainText("without minimization, chemistry repair or docking validation");
    expect((await new AxeBuilder({ page }).include(".viewer-header").include(".movement-panel")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`toolbar-${theme}-touch-help.png`) });
    await help.getByRole("button", { name: "Close movement panel" }).tap();
    await expect(controls).toBeVisible();
    await controls.getByRole("button", { name: "More movement tools", exact: true }).tap();
    await page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Translate", exact: true }).tap();
    await controls.getByRole("button", { name: "More movement tools", exact: true }).tap();
    await touchDrag(page, 20, -10);
    await expect.poll(async () => (await inspect()).coordinates).not.toEqual(original.coordinates);
    const preview = (await inspect()).coordinates;
    await controls.getByRole("button", { name: "Adjust view" }).tap();
    const beforeCamera = (await inspect()).camera;
    await touchDrag(page, -35, 20);
    await expect.poll(async () => (await inspect()).camera).not.toEqual(beforeCamera);
    expect((await inspect()).coordinates).toEqual(preview);
    await page.screenshot({ path: info.outputPath(`toolbar-${theme}-touch-camera.png`) });
    await controls.getByRole("button", { name: "Resume transform" }).tap();
    await controls.getByRole("button", { name: "More movement tools", exact: true }).tap();
    await page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Depth", exact: true }).tap();
    await page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Step away" }).tap();
    expect((await new AxeBuilder({ page }).include(".viewer-header").include(".movement-pointer-surface").include(".movement-panel")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    for (const control of await page.locator(".movement-banner button, .movement-panel button, .movement-panel input").all()) {
      await control.scrollIntoViewIfNeeded();
      const box = (await control.boundingBox())!;
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(box.height, await control.getAttribute("aria-label") ?? await control.textContent() ?? "movement control").toBeGreaterThanOrEqual(44);
      for (const name of ["Apply movement", "Cancel movement"]) {
        expect(await controls.getByRole("button", { name }).evaluate(node => {
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return hit === node || Boolean(hit && node.contains(hit));
        })).toBe(true);
      }
    }
    await controls.getByRole("button", { name: "More movement tools", exact: true }).tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`toolbar-${theme}-touch-transform.png`) });
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ ...viewport, width: 320 });
    for (const action of await controls.getByRole("button").all()) {
      const box = (await action.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(await action.evaluate(node => {
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit === node || Boolean(hit && node.contains(hit));
      })).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`toolbar-${theme}-320-transform.png`) });
    await page.setViewportSize(viewport);
    expect(await projectRead(request, project.id)).toEqual(project);
    await controls.getByRole("button", { name: "Cancel movement" }).tap();
    await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
  }
});

for (const owner of ["camera", "transform"] as const) test(`ignores a held ${owner} pointer release after Cancel and restores selection on a fresh click`, async ({ page, request }, info) => {
  test.setTimeout(60_000);
  const { launcher, inspect, original } = await prepare(page, request, info.project.name === "mobile-chromium");
  const selected = () => page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    return useSelectionStore.getState().selection;
  });
  const before = await selected();
  await launcher.click();
  if (owner === "camera") await page.getByRole("button", { name: "Adjust view" }).click();
  const box = (await page.getByTestId("structure-viewer").boundingBox())!;
  const x = box.x + box.width * 0.8, y = box.y + box.height * 0.8;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.getByRole("button", { name: "Cancel movement" }).focus(); await page.keyboard.press("Enter");
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("inactive");
  await page.mouse.up();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await selected()).toEqual(before);
  await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
  await page.mouse.click(x, y);
  await expect.poll(async () => (await selected()).atoms.length).toBe(0);
});

test("keeps viewer errors readable and primary transform actions reachable", async ({ page, request }, info) => {
  const { project, launcher, inspect, original } = await prepare(page, request, info.project.name === "mobile-chromium");
  await page.evaluate(() => {
    window.movementEngines.at(-1)!.setMeasurements = async () => {
      throw new Error("Measurement display unavailable; captured movement is retained.");
    };
  });
  await launcher.click();
  const controls = page.getByRole("region", { name: "Move selection controls" });
  const error = page.locator(".viewer-error");
  await expect(error).toContainText("Measurement display unavailable");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    const alert = (await error.boundingBox())!, toolbar = (await page.locator(".viewer-toolbar").boundingBox())!;
    expect(alert.y + alert.height).toBeLessThanOrEqual(toolbar.y);
    expect(await error.evaluate(node => {
      const box = node.getBoundingClientRect();
      return Boolean(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest(".viewer-error"));
    })).toBe(true);
    for (const name of ["Apply movement", "Cancel movement"]) expect(await controls.getByRole("button", { name }).evaluate(node => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit === node || Boolean(hit && node.contains(hit));
    })).toBe(true);
  }
  expect(await projectRead(request, project.id)).toEqual(project);
  await controls.getByRole("button", { name: "Cancel movement" }).click();
  await expect.poll(async () => (await inspect()).coordinates).toEqual(original.coordinates);
});

test("releases native navigation keys held before movement starts", async ({ page, request }, info) => {
  const { project, launcher, inspect, original } = await prepare(page, request, info.project.name === "mobile-chromium");
  const box = (await page.getByTestId("structure-viewer").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await page.locator("body").evaluate(body => { body.tabIndex = -1; body.focus(); });
  await page.keyboard.down("w");
  await expect.poll(async () => (await inspect()).camera).not.toEqual(original.camera);
  await launcher.click();
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("transform");
  const camera = (await inspect()).camera;
  await page.getByRole("group", { name: "Move selection canvas" }).focus();
  await page.keyboard.down("Space");
  await expect.poll(async () => (await inspect()).movementInteraction).toBe("camera");
  const frames = await page.evaluate(async entryId => {
    const { inspectInteractiveTransform } = await import("/src/test/interactiveTransformHarness.ts");
    const cameras = [];
    for (let i = 0; i < 8; i++) {
      await new Promise(requestAnimationFrame);
      cameras.push(inspectInteractiveTransform(window.movementEngines.at(-1)!, entryId).camera);
    }
    return cameras;
  }, project.entries[0].id);
  expect(frames).toEqual(Array.from({ length: 8 }, () => camera));
  expect((await inspect()).coordinates).toEqual(original.coordinates);
  await page.keyboard.up("Space"); await page.keyboard.up("w");
  await page.getByRole("button", { name: "Cancel movement" }).click();
  expect(await projectRead(request, project.id)).toEqual(project);
});
