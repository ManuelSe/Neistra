import { resolve } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Project } from "../../../apps/web/src/api/types";
import type { MolstarEngine } from "../../../apps/web/src/viewer/MolstarEngine";

declare global { interface Window { interactionEngines: MolstarEngine[] } }

export async function prepare(page: Page, request: APIRequestContext, fixtures: string[], label: string) {
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
  await imports.locator('input[type="file"]').setInputFiles(fixtures.map(path => resolve(path)));
  await imports.getByRole("button", { name: "Import", exact: true }).click();
  await expect(imports).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText(`${fixtures.length} visible / ${fixtures.length} loaded`, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.length ?? 0)).toBeGreaterThan(0);
  return await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
}

export const native = (page: Page) => page.evaluate(async () => {
  const { inspectInteractions } = await import("/src/test/interactionHarness.ts");
  return inspectInteractions(window.interactionEngines.at(-1)!);
});
export const cyanPixels = (page: Page) => page.locator(".molstar-host canvas").first().evaluate((canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) throw new Error("WebGL required");
  gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 90 && pixels[i + 1] > 100 && pixels[i + 2] > 120) count++;
  return count;
});
