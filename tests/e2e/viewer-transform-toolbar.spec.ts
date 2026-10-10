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

async function drag(page: Page, button: "left" | "right", dx: number, dy: number) {
  const box = (await page.getByTestId("structure-viewer").boundingBox())!;
  const x = box.x + box.width * 0.8, y = box.y + box.height * 0.8;
  expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.getAttribute("data-testid") === "movement-pointer-surface", { x, y })).toBe(true);
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
