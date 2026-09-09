import { chromium, expect, test, type Page, type TestInfo, type Worker } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface ZoomAPI {
  tabs: {
    query(query: object): Promise<{ id: number; url?: string }[]>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
}

async function setZoom(worker: Worker, url: string, factor: number) {
  return worker.evaluate(async ({ url, factor }) => {
    const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
    const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(url));
    if (!tab) throw new Error("Qualification tab not found");
    await chrome.tabs.setZoom(tab.id, factor);
    return chrome.tabs.getZoom(tab.id);
  }, { url, factor });
}

async function expectBoundedActions(page: Page) {
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const inspector = page.getByRole("button", { name: "Inspector", exact: true });
  if (size.width <= 840) await expect(inspector).toBeVisible();
  else await expect(inspector).toBeHidden();
  const bounds = await page.locator('.topbar button:visible, .viewer-toolbar button:visible, .viewer-toolbar select:visible')
    .evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { name: node.getAttribute("aria-label"), x: box.x, y: box.y, width: box.width, height: box.height };
    }));
  for (const box of bounds) {
    expect(box.x, box.name ?? "action").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, box.name ?? "action").toBeLessThanOrEqual(size.width + 1);
    expect(box.y + box.height, box.name ?? "action").toBeLessThanOrEqual(size.height + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function captureZoomPage(page: Page, info: TestInfo, name: string) {
  // Playwright 1.55 clips real browser-zoom captures using CSS dimensions as
  // device pixels. Capture the full native surface instead, without a clip.
  const session = await page.context().newCDPSession(page);
  try {
    const metrics = await session.send("Page.getLayoutMetrics");
    const { data } = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const png = Buffer.from(data, "base64");
    expect(png.readUInt32BE(16)).toBe(metrics.layoutViewport.clientWidth);
    expect(png.readUInt32BE(20)).toBe(metrics.layoutViewport.clientHeight);
    await writeFile(info.outputPath(name), png);
  } finally { await session.detach(); }
}

test("keeps actions and dialogs reachable at real 100% and 200% browser zoom", async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== "chromium", "Real desktop browser zoom is separate from mobile emulation.");
  test.setTimeout(120_000);
  const extension = resolve("tests/e2e/support/zoom-extension");
  const profile = await mkdtemp(join(tmpdir(), "neistra-zoom-qualification-"));
  // A null emulated viewport is essential: a forced CSS viewport masks real zoom.
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = context.pages()[0];
    page.setDefaultTimeout(15_000);
    const created = await request.post("/api/v1/projects", { data: { name: `Zoom qualification ${Date.now()}` } });
    expect(created.status()).toBe(201);
    const project = await created.json() as { name: string };
    await page.goto(baseURL!);
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
    await page.getByRole("button", { name: "Import structures" }).first().click();
    const importer = page.getByRole("dialog", { name: "Import structures" });
    await importer.locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/formats/ethanol.mol"));
    await importer.getByRole("button", { name: "Import", exact: true }).click();
    await expect(importer).toBeHidden();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
      for (const factor of [1, 2]) {
        expect(await setZoom(worker, baseURL!, factor)).toBe(factor);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
        await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
        await expectBoundedActions(page);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-workspace.png`);
        const settings = page.locator('.msp-viewport-controls button[title="Settings / Controls Info"]');
        await settings.click();
        const popup = page.locator(".msp-viewport-controls-panel");
        await popup.locator(".msp-control-group-header > button").first().click({ trial: true });
        expect(await popup.evaluate(node => {
          const box = node.getBoundingClientRect();
          const host = node.closest(".structure-viewer")!.getBoundingClientRect();
          return box.left >= host.left && box.right <= host.right && box.bottom <= host.bottom;
        })).toBe(true);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-viewer-settings.png`);
        await settings.click();
        const inspector = page.getByRole("button", { name: "Inspector", exact: true });
        if (await inspector.isVisible()) await inspector.click();
        for (const tab of await page.locator('.inspector-tabs [role="tab"]').all()) {
          await tab.click();
          expect(await tab.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        }
        await captureZoomPage(page, info, `${theme}-${factor * 100}-inspector.png`);
        if (await page.locator(".mobile-panel").isVisible()) await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Export", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Export" });
        await dialog.getByRole("tab", { name: "Project archive" }).click();
        await dialog.getByRole("button", { name: "Generate", exact: true }).scrollIntoViewIfNeeded();
        const box = await dialog.boundingBox();
        const height = await page.evaluate(() => innerHeight);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-export.png`);
        await page.keyboard.press("Escape");
      }
      expect(await setZoom(worker, baseURL!, 1)).toBe(1);
      await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(1);
    }
  } finally { await context.close(); }
});

test("keeps shell and inspector controls bounded around both responsive breakpoints", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Exact-width breakpoint sweep runs once; Pixel 7 has its own workflow matrix.");
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "Create project" }).click();
  const create = page.getByRole("dialog", { name: "Create project" });
  await create.getByLabel("Name", { exact: true }).fill(`Breakpoint qualification ${Date.now()}`);
  await create.getByRole("button", { name: "Create project" }).click();
  await expect(create).toBeHidden();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    for (const width of [1440, 841, 840, 839, 521, 520, 519, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await expectBoundedActions(page);
      await page.getByRole("button", { name: "Projects", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Projects" })).toBeVisible();
      await page.getByRole("dialog", { name: "Projects" }).focus();
      await page.keyboard.press("Escape");
      if (width <= 840) await page.getByRole("button", { name: "Inspector", exact: true }).click();
      for (const name of ["selection", "details"]) {
        await page.locator(".inspector-tabs").getByRole("tab", { name, exact: true }).click();
        expect(await page.locator(".project-facts dt, .selection-summary dt").evaluateAll(nodes =>
          nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent))).toEqual([]);
        await page.screenshot({ path: info.outputPath(`${theme}-${width}-${name}.png`) });
      }
      if (width <= 840) {
        await page.locator(".mobile-panel").focus();
        await page.keyboard.press("Escape");
      }
      await page.screenshot({ path: info.outputPath(`${theme}-${width}.png`) });
    }
  }
});
