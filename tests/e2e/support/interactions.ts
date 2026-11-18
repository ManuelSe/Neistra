import { resolve } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Project } from "../../../apps/web/src/api/types";
import type { MolstarEngine } from "../../../apps/web/src/viewer/MolstarEngine";

declare global { interface Window { interactionEngines: MolstarEngine[] } }

type FixturePayload = { name: string; mimeType: string; buffer: Buffer };
export async function prepare(page: Page, request: APIRequestContext, fixtures: (string | FixturePayload)[], label: string) {
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst interactionMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await interactionMount.call(this,target); (window.interactionEngines ??= []).push(this); };` });
  });
  const created = await request.post("/api/v1/projects", { data: { name: `${label} ${Date.now()}` } });
  const project: Project = await created.json();
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const imports = page.getByRole("dialog", { name: "Import structures" });
  const paths = fixtures.filter((fixture): fixture is string => typeof fixture === "string");
  if (paths.length > 0 && paths.length !== fixtures.length) throw new Error("Use either file paths or file payloads for one fixture import.");
  const files = paths.length === fixtures.length ? paths.map(path => resolve(path))
    : fixtures.filter((fixture): fixture is FixturePayload => typeof fixture !== "string");
  await imports.locator('input[type="file"]').setInputFiles(files);
  await imports.getByRole("button", { name: "Import", exact: true }).click();
  await expect(imports).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText(`${fixtures.length} visible / ${fixtures.length} loaded`, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.length ?? 0)).toBeGreaterThan(0);
  return await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
}

// Pixel and picking fixtures request their own framing; preparation and inspection
// leave the shared application camera untouched.
export async function frameFixture(page: Page) {
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.at(-1)?.getRenderedAtomReferences().length ?? 0)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

export const native = (page: Page, options: { allowQueueError?: boolean } = {}) => page.evaluate(async options => {
  const modulePath = "/src/test/interactionHarness.ts";
  const { inspectInteractions } = await import(/* @vite-ignore */ modulePath);
  return inspectInteractions(window.interactionEngines.at(-1)!, options);
}, options);
export interface CyanPixelMask { width: number; height: number; indices: number[] }
export const cyanPixelMask = (page: Page) => page.locator(".molstar-host canvas").first().evaluate((canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) throw new Error("WebGL required");
  gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const indices: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 90 && pixels[i + 1] > 100 && pixels[i + 2] > 120) indices.push(i / 4);
  return { width: canvas.width, height: canvas.height, indices };
});
export const cyanPixels = async (page: Page) => (await cyanPixelMask(page)).indices.length;

/** Freeze unrelated molecular/axis pixels before installing any interaction. */
export async function settledCyanBackground(page: Page): Promise<CyanPixelMask> {
  let previous: CyanPixelMask | undefined;
  let settled: CyanPixelMask | undefined;
  await expect.poll(async () => {
    const current = await cyanPixelMask(page);
    const equal = previous?.width === current.width && previous.height === current.height
      && previous.indices.length === current.indices.length
      && previous.indices.every((index, i) => index === current.indices[i]);
    if (equal) settled = current;
    previous = current;
    return equal;
  }).toBe(true);
  return settled!;
}

export async function cyanPixelsOutsideBackground(page: Page, background: CyanPixelMask): Promise<number> {
  const current = await cyanPixelMask(page);
  expect([current.width, current.height]).toEqual([background.width, background.height]);
  const baseline = new Set(background.indices);
  return current.indices.filter(index => !baseline.has(index)).length;
}
