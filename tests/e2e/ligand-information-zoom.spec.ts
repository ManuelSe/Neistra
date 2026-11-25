import { chromium, expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Project } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { openInspectorTools, openLigandInformation } from "./support/navigation";

interface ZoomAPI { tabs: { query(query: object): Promise<{ id: number; url?: string }[]>;
  setZoom(id: number, factor: number): Promise<void>; getZoom(id: number): Promise<number> } }
const inspector = (page: Page) => page.getByRole("region", { name: "Project inspector", exact: true });
async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function reading(anchor: Locator) {
  return anchor.evaluate(node => {
    const owner = node.closest(".inspector-scroll");
    if (!(owner instanceof HTMLElement)) throw new Error("Expected Inspector reading owner");
    const bounds = owner.getBoundingClientRect(), rect = node.getBoundingClientRect();
    return { offset: rect.top - bounds.top, bottom: rect.bottom - bounds.top,
      top: owner.scrollTop, viewport: owner.clientHeight, width: owner.clientWidth };
  });
}
async function compositor(page: Page, info: TestInfo, name: string) {
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const body = Buffer.from(data, "base64"); await info.attach(name, { body, contentType: "image/png" });
    return { width: body.readUInt32BE(16), height: body.readUInt32BE(20), bytes: body.length };
  } finally { await session.detach(); }
}

for (const theme of ["light", "dark"] as const) test(`retains reading and visible recovery focus through actual100/200% browser zoom (${theme})`, async ({ request, baseURL }, info) => {
  test.setTimeout(120_000);
  const extension = resolve("tests/e2e/support/zoom-extension"), directory = await mkdtemp(join(tmpdir(), "neistra-sidebar-reading-zoom-"));
  const context = await chromium.launchPersistentContext(directory, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, isMobile: false, hasTouch: false, baseURL,
    args: ["--window-size=900,700", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const records: object[] = [];
  try {
    const page = context.pages()[0], worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const project = await prepare(page, request, [{ name: "zoom-reading.smi", mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCO ethanol\n") }], `Reading zoom ${theme}`);
    const endpoint = `/api/v1/projects/${project.id}`, entry = project.entries[0];
    const before = await (await request.get(endpoint)).json() as Project;
    const original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByRole("separator", { name: "Resize inspector", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-panel-id="inspector-panel"]')).toHaveAttribute("data-panel-size", "17.0");
    await openLigandInformation(page);
    await inspector(page).getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
    await expect(inspector(page).locator(".ligand-properties-groups dt")).toHaveCount(14, { timeout: 30_000 });
    const zoom = async (factor: number) => {
      const actual = await worker.evaluate(async ({ url, factor }) => {
        const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
        const tab = (await chrome.tabs.query({})).find(item => item.url === url);
        if (!tab) throw new Error("Current application tab missing for actual browser zoom");
        await chrome.tabs.setZoom(tab.id, factor); return chrome.tabs.getZoom(tab.id);
      }, { url: page.url(), factor });
      expect(actual).toBe(factor); await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
      const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        visualScale: visualViewport?.scale, touch: navigator.maxTouchPoints, coarse: matchMedia("(any-pointer: coarse)").matches }));
      expect(layout.touch).toBe(0); expect(layout.coarse).toBe(false); return { factor, actual, layout };
    };
    for (const view of ["ligand", "tools"] as const) {
      await zoom(1);
      if (view === "ligand") await openLigandInformation(page); else await openInspectorTools(page);
      const anchor = inspector(page).getByText(view === "ligand" ? "Profile" : "Operation mode", { exact: true });
      await inspector(page).locator(".inspector-scroll").hover(); await page.mouse.wheel(0, 300); await frames(page);
      const initial = await reading(anchor); expect(initial.top).toBeGreaterThan(100);
      expect(initial.offset).toBeGreaterThanOrEqual(0); expect(initial.bottom).toBeLessThanOrEqual(initial.viewport);
      const actualZoom = await zoom(2);
      const launcher = page.getByRole("button", { name: "Inspector", exact: true }); await expect(launcher).toBeVisible();
      if (!await inspector(page).isVisible()) { await launcher.focus(); await page.keyboard.press("Enter"); }
      await expect(inspector(page)).toBeVisible(); await frames(page);
      const compact = await reading(anchor); expect(Math.abs(compact.offset - initial.offset)).toBeLessThanOrEqual(1);
      const heading = inspector(page).getByRole("heading", { name: view === "ligand" ? "Ligand information" : "Selection", exact: true });
      await expect(heading).toBeFocused();
      const focus = await heading.evaluate(node => {
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        const owner = node.closest(".mobile-panel.inspector");
        if (!(owner instanceof HTMLElement)) throw new Error("Expected compact Inspector");
        const drawer = owner.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
          width: innerWidth, height: innerHeight, viewportLeft: Math.max(0, drawer.left), viewportRight: Math.min(innerWidth, drawer.right),
          hit: hit === node || node.contains(hit), outline: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
      expect(focus.top).toBeGreaterThanOrEqual(0); expect(focus.bottom).toBeLessThanOrEqual(focus.height);
      expect(focus.left).toBeGreaterThanOrEqual(focus.viewportLeft); expect(focus.right).toBeLessThanOrEqual(focus.viewportRight);
      expect(focus.hit).toBe(true);
      expect(focus.outline).toBe("solid"); expect(focus.outlineWidth).toBe("2px");
      const capture = await compositor(page, info, `reading-zoom-${theme}-${view}-200`);
      expect(capture.width).toBeGreaterThanOrEqual(actualZoom.layout.width * actualZoom.layout.dpr - 1);
      expect(capture.height).toBeGreaterThanOrEqual(actualZoom.layout.height * actualZoom.layout.dpr - 1);
      await page.keyboard.press("Escape"); await expect(inspector(page)).toBeHidden(); await expect(launcher).toBeFocused();
      await page.keyboard.press("Enter"); await expect(inspector(page)).toBeVisible(); await expect(heading).toBeFocused(); await frames(page);
      const reopened = await reading(anchor); expect(Math.abs(reopened.offset - compact.offset)).toBeLessThanOrEqual(1);
      const restoredZoom = await zoom(1); await expect(launcher).toBeHidden(); await expect(inspector(page)).toBeVisible(); await frames(page);
      const expanded = await reading(anchor); expect(Math.abs(expanded.offset - initial.offset)).toBeLessThanOrEqual(1);
      records.push({ theme, view, initial, actualZoom, compact, focus, capture, reopened, restoredZoom, expanded });
      // Qualify deliberate keyboard navigation after the stationary reading checks.
      await zoom(2); await expect(launcher).toBeVisible();
      if (!await inspector(page).isVisible()) { await launcher.focus(); await page.keyboard.press("Enter"); }
      await expect(heading).toBeFocused(); await page.keyboard.press("Shift+Tab");
      expect(await page.getByRole("dialog", { name: "Inspector panel", exact: true }).evaluate(node => node.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape"); await expect(inspector(page)).toBeHidden(); await zoom(1);
      await expect(launcher).toBeHidden(); await expect(inspector(page)).toBeVisible(); await frames(page);
    }
    expect(await (await request.get(endpoint)).json()).toEqual(before);
    expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
  } finally {
    await info.attach("inspector-actual-zoom-reading", { body: JSON.stringify(records), contentType: "application/json" });
    await context.close(); await rm(directory, { recursive: true, force: true });
  }
});
