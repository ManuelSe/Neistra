import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
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
  await expect(controls.getByRole("button", { name: "Step right" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Fit all visible" })).toHaveAttribute("aria-disabled", "true");
  await controls.getByText("More", { exact: true }).click();
  await controls.getByRole("button", { name: "Depth", exact: true }).click();
  await controls.getByText("More", { exact: true }).click();
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
      await canvas.focus(); await page.keyboard.down("Space");
      await expect.poll(async () => (await inspect()).movementInteraction).toBe("camera");
      await drag(page, "left", -45, 25, true);
      await expect.poll(async () => (await inspect()).camera).not.toEqual(initialCamera);
      expect((await inspect()).coordinates).toEqual(preview);
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
