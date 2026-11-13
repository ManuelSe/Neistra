import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  expectWarningBounds, expectWarningRows, prepareWarningProject, readWarningProject,
  stableWarningScene, warningDialog, warningTrigger,
} from "./support/warning-details";

interface ZoomAPI {
  tabs: {
    query(query: object): Promise<{ id: number; url?: string }[]>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
}

test("keeps warning details reachable at actual 100% and 200% browser zoom", async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== "chromium", "Actual desktop browser zoom is qualified separately from mobile touch emulation.");
  test.setTimeout(180_000);
  const extension = resolve("tests/e2e/support/zoom-extension");
  const profile = await mkdtemp(join(tmpdir(), "neistra-warning-zoom-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = context.pages()[0];
    const project = await prepareWarningProject(page, request, "Warning actual zoom");
    const notice = page.getByRole("button", { name: "Dismiss message", exact: true });
    if (await notice.isVisible()) await notice.click();
    const evidence = [];
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
      for (const factor of [1, 2]) {
        const before = await page.evaluate(() => ({ compact: innerWidth <= 840, mounts: window.warningEngines.length }));
        const actual = await worker.evaluate(async ({ url, factor }) => {
          const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
          const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
          if (!tab) throw new Error("Warning-details tab missing from browser zoom qualification");
          await chrome.tabs.setZoom(tab.id, factor);
          return chrome.tabs.getZoom(tab.id);
        }, { url: page.url(), factor });
        expect(actual).toBe(factor);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
        if (before.compact !== (1440 / factor <= 840)) {
          await expect.poll(() => page.evaluate(() => window.warningEngines.length)).toBeGreaterThan(before.mounts);
        }
        await expect(page.locator(".viewer-status")).toContainText("3 visible / 3 loaded", { timeout: 30_000 });
        await stableWarningScene(page, project);
        await warningTrigger(page).focus();
        await page.keyboard.press("Enter");
        await expectWarningRows(page, project);
        const bounds = await expectWarningBounds(page);
        expect((await new AxeBuilder({ page }).include(".viewer-warning-details").include(".viewer-warning-trigger").analyze()).violations).toEqual([]);
        const cdp = await context.newCDPSession(page);
        try {
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          await info.attach(`${theme}-${factor * 100}-warning-zoom`, { body: Buffer.from(data, "base64"), contentType: "image/png" });
        } finally { await cdp.detach(); }
        await warningDialog(page).getByRole("button", { name: "Close structure warnings", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(warningTrigger(page)).toBeFocused();
        evidence.push({ theme, factor, actual, ...bounds });
      }
    }
    expect(await readWarningProject(request, project.id)).toEqual(project);
    await info.attach("actual-warning-browser-zoom", { body: JSON.stringify(evidence), contentType: "application/json" });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
