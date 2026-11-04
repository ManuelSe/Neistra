import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepare } from "./support/interactions";
import { openPresentation } from "./support/presentation";

interface ZoomAPI {
  tabs: {
    query(query: object): Promise<{ id: number; url?: string }[]>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
}

test("keeps presentation and its launcher usable at actual 100% and 200% browser zoom", async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== "chromium", "Actual browser zoom is qualified separately from mobile emulation");
  test.setTimeout(180000);
  const extension = resolve("tests/e2e/support/zoom-extension");
  const profile = await mkdtemp(join(tmpdir(), "neistra-presentation-zoom-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = context.pages()[0];
    await prepare(page, request, ["tests/fixtures/hydrogens/butane-reconciliation.mol"], "Presentation zoom");
    const child = await openPresentation(page);
    const initial = await child.evaluate(() => innerWidth);
    const evidence = [];
    for (const factor of [1, 2]) {
      const actual = await worker.evaluate(async ({ url, factor }) => {
        const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
        if (!tab) throw new Error("Presentation tab missing from real zoom qualification");
        await chrome.tabs.setZoom(tab.id, factor);
        return chrome.tabs.getZoom(tab.id);
      }, { url: child.url(), factor });
      expect(actual).toBe(factor);
      if (factor === 2) await expect.poll(() => child.evaluate(() => innerWidth)).toBeLessThan(initial * 0.6);
      await expect(child.locator("video")).toBeVisible();
      const button = child.getByRole("button", { name: "Enter fullscreen" });
      await button.focus();
      const bounds = await button.boundingBox();
      const size = await child.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      await child.keyboard.press("f");
      await expect(child.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
      await child.evaluate(() => document.exitFullscreen());
      expect((await new AxeBuilder({ page: child }).analyze()).violations).toEqual([]);
      const cdp = await context.newCDPSession(child);
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await info.attach(`presentation-${factor * 100}-zoom`, { body: Buffer.from(data, "base64"), contentType: "image/png" });
      await cdp.detach();
      evidence.push({ factor, actual, size, bounds });
      const launcher = page.getByRole("button", { name: "Detach viewer", exact: true });
      await expect(launcher).toBeVisible();
      const launcherBounds = await launcher.boundingBox();
      expect(launcherBounds!.x).toBeGreaterThanOrEqual(0);
    }
    await info.attach("actual-presentation-zoom", { body: JSON.stringify(evidence), contentType: "application/json" });
  } finally { await context.close(); }
});
