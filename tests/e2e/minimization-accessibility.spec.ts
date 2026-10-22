import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type Page, type Worker } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { configure, panel, prepared, select } from "./support/minimization";

async function bounded(page: Page) {
  const box = await panel(page).boundingBox(); expect(box).not.toBeNull();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth }));
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.width);
  await panel(page).getByRole("button", { name: "Model and prerequisites" }).scrollIntoViewIfNeeded();
  await expect(panel(page).getByRole("button", { name: "Model and prerequisites" })).toBeInViewport();
  const violations = await new AxeBuilder({ page }).include(".minimization-panel").analyze();
  expect(violations.violations).toEqual([]);
}

test("keeps native minimization controls reachable by keyboard and touch at 320px in both themes", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepared(page, request);
  await select(page, [{ structure_id: p.entries[0].id, atom_id: 3 }], info.project.name === "mobile-chromium");
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.getByRole("button", { name: "Inspector", exact: true })).toBeVisible();
  const button = page.getByRole("button", { name: "Minimize selection", exact: true });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    await button.focus(); await page.keyboard.press("Enter");
    await expect(panel(page)).toBeFocused();
    await configure(page);
    await expect(panel(page).getByRole("button", { name: "Run minimization" })).toBeEnabled();
    await bounded(page);
    const help = panel(page).getByRole("button", { name: "Model and prerequisites" });
    if (await help.getAttribute("aria-expanded") === "false") await help.click();
    await expect(panel(page)).toContainText("Advanced AMBER calculates a prepared environment");
    await page.screenshot({ path: info.outputPath(`${theme}-320-minimization.png`) });
    await panel(page).getByRole("button", { name: "Close minimization" }).focus(); await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden(); await expect(button).toBeFocused();
    const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    if (info.project.name === "mobile-chromium") { await button.tap(); await expect(panel(page)).toBeVisible(); await panel(page).getByRole("button", { name: "Close minimization" }).tap(); }
  }
});

interface ZoomAPI { tabs: { query(query: object): Promise<{ id: number; url?: string }[]>; setZoom(id: number, factor: number): Promise<void>; getZoom(id: number): Promise<number> } }
async function zoom(worker: Worker, url: string, factor: number) {
  return worker.evaluate(async ({ url, factor }) => {
    const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
    const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(url));
    if (!tab) throw new Error("Missing native zoom tab");
    await chrome.tabs.setZoom(tab.id, factor); return chrome.tabs.getZoom(tab.id);
  }, { url, factor });
}
test("preserves capture and keyboard focus across responsive remounts at actual 100–200% browser zoom", async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== "chromium", "Native desktop browser zoom qualified separately from mobile touch.");
  test.setTimeout(180000);
  const extension = resolve("tests/e2e/support/zoom-extension");
  const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "neistra-min-zoom-")), {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = context.pages()[0]; await page.goto(baseURL!);
    const p = await prepared(page, request);
    await select(page, [{ structure_id: p.entries[0].id, atom_id: 3 }], false);
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
      await configure(page);
      await expect(panel(page).getByRole("button", { name: "Run minimization" })).toBeEnabled();
      for (const factor of [1, 1.25, 1.5, 2, 1]) {
        expect(await zoom(worker, baseURL!, factor)).toBe(factor);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
        await expect(panel(page)).toContainText("Captured selection: 1 atoms");
        await bounded(page);
        const session = await context.newCDPSession(page);
        const { data } = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        await writeFile(info.outputPath(`${theme}-${factor}-minimization.png`), Buffer.from(data, "base64")); await session.detach();
      }
      await panel(page).getByRole("button", { name: "Close minimization" }).click();
    }
  } finally { await context.close(); }
});
