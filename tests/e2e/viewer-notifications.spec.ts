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

test("expires after ten real seconds without changing molecular data, camera or renderer", async ({ page, request }, info) => {
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
    // Camera preference saves have their own qualification; observe project work.
    if (new URL(r.url()).pathname !== "/api/v1/workspace/presentation"
      && (r.method() !== "GET" || /\/entries\/[^/]+\/structure$/.test(new URL(r.url()).pathname))) requests.push(`${r.method()} ${r.url()}`);
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

test("keeps viewer controls clickable beneath a persistent short import notice", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const { project } = await prepare(page, request);
  await page.getByRole("button", { name: "Import structures", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures", exact: true });
  await dialog.locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/formats/protein_models_altloc.pdb"));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
  await expect(notice(page)).toContainText("imported with");
  const summary = await notice(page).textContent();
  const baseline = await readProject(request, project.id);
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
    const close = page.getByRole("button", { name: "Close viewer controls", exact: true });
    const body = notice(page).locator(".notice-message");
    await expect(body).not.toHaveAttribute("role");
    const messageBounds = (await body.boundingBox())!;
    const closeBounds = (await close.boundingBox())!;
    const x = closeBounds.x + closeBounds.width / 2, y = closeBounds.y + closeBounds.height / 2;
    expect(x).toBeGreaterThan(messageBounds.x);
    expect(x).toBeLessThan(messageBounds.x + messageBounds.width);
    expect(y).toBeGreaterThan(messageBounds.y);
    expect(y).toBeLessThan(messageBounds.y + messageBounds.height);
    await info.attach(`${theme}-short-notice-control-overlap`, {
      body: JSON.stringify({ messageBounds, closeBounds, x, y }), contentType: "application/json",
    });
    await close.click();
    await expect(page.getByRole("button", { name: "Open viewer controls", exact: true })).toBeVisible();
    await expect(notice(page)).toBeVisible();
    expect(await notice(page).textContent()).toBe(summary);
    expect(await readProject(request, project.id)).toEqual(baseline);
  }
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

test("keeps long diagnostics scrollable and Close reachable in narrow and short viewports", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const { project } = await prepare(page, request);
  const text = `${Array.from({ length: 60 }, (_, i) =>
    `Diagnostic ${i + 1}: ${"00000000-0000-4000-8000-000000000001".repeat(8)}\nKeep the complete detail available.`,
  ).join("\n\n")}\nEnd of diagnostic. Retry when ready.`;
  let responseReady: Promise<void>;
  let responseText = text;
  await page.route(`**/api/v1/projects/${project.id}/save`, async route => {
    await responseReady;
    await route.fulfill({ status: 503, json: { detail: { code: "test_unavailable", message: responseText } } });
  });
  const baseline = await readProject(request, project.id);
  const loadedAt = await page.evaluate(() => performance.timeOrigin);
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 1280, height: 900 });
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    responseText = text;
    let release!: () => void;
    responseReady = new Promise<void>(resolve => { release = resolve; });
    const saveButton = page.getByRole("button", { name: "Save checkpoint", exact: true });
    await saveButton.click();
    const focusOrigin = page.getByRole("button", { name: theme === "light" ? "Use dark theme" : "Use light theme" });
    await focusOrigin.focus();
    release();
    await expect(notice(page)).toHaveAttribute("role", "alert");
    await expect(focusOrigin).toBeFocused();
    const details = notice(page).getByRole("region", { name: "Message details" });
    const close = notice(page).getByRole("button", { name: "Dismiss message" });
    expect(await details.textContent()).toBe(text);
    for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 568 }, { width: 320, height: 180 }]) {
      await page.setViewportSize(viewport);
      await expect(details).toBeVisible();
      await expect(close).toBeInViewport();
      const bounds = await notice(page).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      expect(bounds!.height).toBeLessThanOrEqual(240);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await details.evaluate(element => { element.scrollTop = 0; });
      await details.hover();
      await page.mouse.wheel(0, 500);
      await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      if (info.project.name === "mobile-chromium") {
        await details.evaluate(element => { element.scrollTop = 0; });
        const region = (await details.boundingBox())!;
        const touch = await page.context().newCDPSession(page);
        try {
          const x = region.x + region.width / 2, y = region.y + region.height * 0.8;
          await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
          for (let step = 1; step <= 5; step++) {
            await touch.send("Input.dispatchTouchEvent", {
              type: "touchMove", touchPoints: [{ x, y: y - Math.min(100, region.height * 0.6) * step / 5, id: 1 }],
            });
            await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => done())));
          }
          await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } finally { await touch.detach(); }
        await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      }
      await details.evaluate(element => { element.scrollTop = 0; });
      await details.focus();
      await page.keyboard.press("PageDown");
      await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await page.keyboard.press("Control+End");
      await expect.poll(() => details.evaluate(element =>
        element.scrollHeight - element.clientHeight - element.scrollTop,
      )).toBeLessThanOrEqual(1);
      await expect(close).toBeInViewport();
      if (viewport.width === 320) {
        const target = await close.boundingBox();
        expect(target!.width).toBeGreaterThanOrEqual(44);
        expect(target!.height).toBeGreaterThanOrEqual(44);
      }
      expect((await new AxeBuilder({ page }).include(".notice").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await info.attach(`${theme}-${viewport.width}x${viewport.height}-long-notice`, {
        body: await page.screenshot(), contentType: "image/png",
      });
    }
    // Reading position survives ResizeObserver measurements and unrelated theme renders.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await focusOrigin.click();
    await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.getByRole("button", { name: theme === "light" ? "Use light theme" : "Use dark theme" }).click();
    await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const replacementText = `New diagnostic begins.\n\n${text}`;
    responseText = replacementText;
    responseReady = new Promise<void>(resolve => { release = resolve; });
    await saveButton.click();
    await focusOrigin.focus();
    release();
    await expect.poll(() => details.textContent()).toBe(replacementText);
    await expect.poll(() => details.evaluate(element => element.scrollTop)).toBe(0);
    await expect(focusOrigin).toBeFocused();
    await expect(close).toBeInViewport();
    if (info.project.name === "mobile-chromium") await close.tap();
    else await close.click();
    await expect(notice(page)).toBeHidden();
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(loadedAt);
    expect(await readProject(request, project.id)).toEqual(baseline);
  }
});
