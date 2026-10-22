import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";

const notice = (page: Page) => page.locator(".notice");
async function readProject(request: APIRequestContext, id: string): Promise<Project> {
  const response = await request.get(`/api/v1/projects/${id}`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function openProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true })
    .getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
async function prepare(page: Page, request: APIRequestContext) {
  // Native inspection stays test-only, using the existing movement harness.
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch({ headers: { ...route.request().headers(), "if-none-match": "" } });
    await route.fulfill({ response, body: `${await response.text()}
const notificationMount = MolstarEngine.prototype.mount;
MolstarEngine.prototype.mount = async function(target) {
  await notificationMount.call(this, target);
  (window.notificationEngines ??= []).push(this);
};` });
  });
  const created = await request.post("/api/v1/projects", { data: { name: `Notification ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const initial: Project = await created.json();
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, {
    multipart: { expected_revision: "0", files: {
      name: "ethanol.mol", mimeType: "chemical/x-mdl-molfile",
      buffer: readFileSync(resolve("tests/fixtures/formats/ethanol.mol")),
    } },
  });
  expect(imported.status()).toBe(201);
  await page.goto("/");
  await openProject(page, initial.name);
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.notificationEngines?.length ?? 0)).toBeGreaterThan(0);
  const project = await readProject(request, initial.id);
  const inspect = () => page.evaluate(async id => {
    const { inspectInteractiveTransform } = await import("/src/test/interactiveTransformHarness.ts");
    return { scene: inspectInteractiveTransform(window.notificationEngines.at(-1), id), mounts: window.notificationEngines.length };
  }, project.entries[0].id);
  let previous = await inspect();
  await expect.poll(async () => {
    const current = await inspect();
    const same = JSON.stringify(current) === JSON.stringify(previous); previous = current;
    return same;
  }).toBe(true);
  return { project: await readProject(request, initial.id), inspect };
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save checkpoint", exact: true }).click();
  await expect(notice(page)).toHaveText("Checkpoint saved.Close");
}

test("expires after ten real seconds without molecular, camera, network or renderer changes", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const { project, inspect } = await prepare(page, request);
  await page.evaluate(() => {
    window.notificationTimes = [];
    let shown = false;
    new MutationObserver(() => {
      const visible = Boolean(document.querySelector(".notice"));
      if (shown !== visible) { window.notificationTimes.push({ visible, time: performance.now() }); shown = visible; }
    }).observe(document.querySelector("#root"), { childList: true, subtree: true });
    // Exclude the earlier recovery notice from this measured emission.
    document.querySelector('.notice button')?.click();
  });
  await save(page);
  const baseline = await readProject(request, project.id);
  const native = await inspect();
  const requests: string[] = [];
  page.on("request", r => {
    if (r.method() !== "GET" || /\/entries\/[^/]+\/structure$/.test(new URL(r.url()).pathname)) requests.push(`${r.method()} ${r.url()}`);
  });
  await info.attach("light notice", { body: await page.screenshot(), contentType: "image/png" });
  // Inspection and screenshot overhead consume the notice's real lifetime.
  // Measure from the observed emission below, rather than assuming the driver
  // can still observe it 8.5 seconds after that work. Keep the same total wait.
  await expect(notice(page)).toBeHidden({ timeout: 13_500 });
  const times = await page.evaluate(() => window.notificationTimes as { visible: boolean; time: number }[]);
  const shown = times.findLast(x => x.visible)!;
  const removed = times.findLast(x => !x.visible)!;
  expect(removed.time - shown.time).toBeGreaterThanOrEqual(10_000);
  expect(await readProject(request, project.id)).toEqual(baseline);
  expect(await inspect()).toEqual(native);
  expect(requests).toEqual([]);
  await info.attach("real-time-expiration", { body: JSON.stringify({ elapsedMs: removed.time - shown.time, noUnexpectedRequests: true, projectUnchanged: true, nativeUnchanged: true }), contentType: "application/json" });
});

test("successive identical confirmations receive fresh deadlines across theme changes", async ({ page, request }) => {
  test.setTimeout(90_000);
  await prepare(page, request);
  await page.clock.install();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect(notice(page)).toContainText("Change stored locally.");
  await page.clock.fastForward(9_000);
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await expect(notice(page)).toContainText("Change stored locally.");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.clock.fastForward(1_000);
  await expect(notice(page)).toBeVisible();
  await page.clock.fastForward(9_000);
  await expect(notice(page)).toBeHidden();
});

test("warning summaries and actionable errors persist with unchanged styling and accessible dismissal", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const { project } = await prepare(page, request);
  await page.clock.install();
  await page.getByRole("button", { name: "Import structures", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures", exact: true });
  await dialog.locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/formats/protein_models_altloc.pdb"));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(notice(page)).toContainText("warnings");
  const baseline = await readProject(request, project.id);
  expect(baseline.entries.some(entry => entry.warnings.length > 0)).toBe(true);
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.clock.fastForward(60_000);
    await expect(notice(page)).toHaveAttribute("role", "status");
    await expect(notice(page)).toHaveClass("notice success");
    expect((await new AxeBuilder({ page }).include(".notice").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await info.attach("dark warning notice", { body: await page.screenshot(), contentType: "image/png" });
  expect(await readProject(request, project.id)).toEqual(baseline);
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await page.route(`**/api/v1/projects/${project.id}/save`, route => route.fulfill({ status: 503, json: { detail: { code: "test_unavailable", message: "Checkpoint unavailable; retry required." } } }));
  await page.getByRole("button", { name: "Save checkpoint", exact: true }).click();
  await expect(notice(page)).toHaveText("Checkpoint unavailable; retry required.Close");
  await page.clock.fastForward(60_000);
  await expect(notice(page)).toHaveAttribute("role", "alert");
  await expect(notice(page)).toHaveClass("notice error");
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await expect(notice(page)).toBeHidden();
  expect(await readProject(request, project.id)).toEqual(baseline);
});

test("keyboard focus defers expiration, departure preserves focus, and manual dismissal returns it", async ({ page, request }) => {
  test.setTimeout(90_000);
  await prepare(page, request);
  await page.clock.install();
  await save(page);
  const origin = page.locator(".topbar button:visible").last();
  await origin.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Dismiss message" })).toBeFocused();
  await page.clock.fastForward(10_000);
  await expect(notice(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(notice(page)).toBeHidden();
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect(notice(page)).toContainText("Change stored locally.");
  await origin.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(notice(page)).toBeHidden();
  await expect(origin).toBeFocused();
});

test("viewer remounts retain the deadline and project changes invalidate old notices", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  // Seed before navigation so the application's initial project list knows this target.
  const response = await request.post("/api/v1/projects", { data: { name: `Other notification ${Date.now()}` } });
  expect(response.status()).toBe(201);
  const other: Project = await response.json();
  await prepare(page, request);
  await page.clock.install();
  await save(page);
  await page.clock.fastForward(5_000);
  await page.setViewportSize(info.project.name === "chromium" ? { width: 412, height: 915 } : { width: 1280, height: 900 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await page.clock.fastForward(5_000);
  await expect(notice(page)).toBeHidden();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect(notice(page)).toBeVisible();
  await openProject(page, other.name);
  await expect(notice(page)).toBeHidden();
  await page.clock.fastForward(60_000);
  await expect(notice(page)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
