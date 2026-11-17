import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Project } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";

interface Preferences { revision: number; enabled_categories: string[] }
interface ZoomAPI {
  tabs: {
    query(query: object): Promise<{ id: number; url?: string }[]>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
}
interface HeldReport {
  entryId: string; waiting: boolean; captured: Promise<void>; capture: () => void; release: () => void; held: Promise<void>;
}
function holdReport(entryId: string): HeldReport {
  let release!: () => void, capture!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const captured = new Promise<void>(resolve => { capture = resolve; });
  return { entryId, waiting: true, held, captured, release, capture };
}
async function keyboardProfile(page: Page, choice: Locator) {
  await choice.scrollIntoViewIfNeeded(); await choice.focus();
  if (await choice.inputValue() !== "ro5") {
    const index = await choice.evaluate(node => [...(node as HTMLSelectElement).options].findIndex(option => option.value === "ro5"));
    expect(index).toBeGreaterThan(0);
    await page.keyboard.press("Home");
    for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
  }
  await expect(choice).toHaveValue("ro5"); await expect(choice).toBeFocused();
}
async function expandWithKeyboard(page: Page, details: Locator) {
  const summary = details.locator("summary");
  await summary.scrollIntoViewIfNeeded(); await summary.focus();
  if (await details.getAttribute("open") === null) await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", ""); await expect(summary).toBeFocused();
}
async function geometry(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  return control.evaluate(node => {
    const bounds = node.getBoundingClientRect(), owner = node.closest(".inspector-scroll")!;
    const viewport = owner.getBoundingClientRect(), hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
      viewportTop: Math.max(0, viewport.top), viewportBottom: Math.min(innerHeight, viewport.bottom),
      viewportLeft: Math.max(0, viewport.left), viewportRight: Math.min(innerWidth, viewport.right),
      hit: hit === node || node.contains(hit), scrollTop: owner.scrollTop, horizontalOverflow: owner.scrollWidth > owner.clientWidth + 1 };
  });
}
function expectReachable(bounds: Awaited<ReturnType<typeof geometry>>) {
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.viewportTop - 1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportBottom + 1);
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.viewportLeft - 1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportRight + 1);
  expect(bounds.hit).toBe(true); expect(bounds.horizontalOverflow).toBe(false);
}
async function compositor(page: Page, info: TestInfo, label: string) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const png = Buffer.from(data, "base64");
    await info.attach(label, { contentType: "image/png", body: png });
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  } finally { await cdp.detach(); }
}

test("keeps profiles, current methods and legacy selection accessible at actual desktop 100% and 200% zoom in both themes", async ({ request, baseURL }, info) => {
  test.setTimeout(240_000);
  const preferencePath = "/api/v1/workspace/ligand-property-preferences";
  const originalPreferences = await (await request.get(preferencePath)).json() as Preferences;
  const hiddenResponse = await request.put(preferencePath, { data: { expected_revision: originalPreferences.revision, enabled_categories: [] } });
  expect(hiddenResponse.ok()).toBe(true);
  const hiddenPreferences = await hiddenResponse.json() as Preferences;
  const extension = resolve("tests/e2e/support/zoom-extension"), profile = await mkdtemp(join(tmpdir(), "neistra-profile-access-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, isMobile: false, hasTouch: false, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  let gate: HeldReport | null = null;
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), page = context.pages()[0];
    let projectId = "";
    await page.route(url => /\/ligand-properties\/(read|consumers\/[^/]+)$/.test(url.pathname), async route => {
      if (!["POST", "PUT"].includes(route.request().method())) { await route.continue(); return; }
      const response = await route.fetch(), current = gate;
      if (current?.waiting && response.ok() && projectId
        && new URL(route.request().url()).pathname.startsWith(`/api/v1/projects/${projectId}/ligand-properties/`)) {
        const payload = await response.json() as { entries: { source: { entry_id: string }; status: string; report: unknown }[] };
        if (payload.entries.some(entry => entry.source.entry_id === current.entryId && entry.status === "ready" && entry.report)) {
          current.waiting = false; current.capture(); await current.held;
        }
      }
      await route.fulfill({ response });
    });
    const project = await prepare(page, request, Array.from({ length: 4 }, (_, index) => ({ name: `profile-access-${index}.smi`,
      mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCO ethanol\n") })), "Profile desktop access");
    projectId = project.id;
    const endpoint = `/api/v1/projects/${project.id}`, before = await (await request.get(endpoint)).json() as Project;
    const originals = await Promise.all(project.entries.map(async entry => ({ id: entry.id,
      bytes: await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body() })));
    const evidence = [];
    let scenario = 0;
    for (const theme of ["light", "dark"] as const) {
      const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await toggle.count()) await toggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      for (const factor of [1, 2]) {
        const actual = await worker.evaluate(async ({ url, factor }) => {
          const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
          const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
          if (!tab) throw new Error("Profile tab missing from desktop zoom qualification");
          await chrome.tabs.setZoom(tab.id, factor); return chrome.tabs.getZoom(tab.id);
        }, { url: page.url(), factor });
        expect(actual).toBe(factor); await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
        expect(await page.evaluate(() => ({ touch: navigator.maxTouchPoints, coarse: matchMedia("(any-pointer: coarse)").matches })))
          .toEqual({ touch: 0, coarse: false });
        const entry = project.entries[scenario++]; gate = holdReport(entry.id);
        const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
        if (await page.evaluate(() => innerWidth <= 840) && !await drawer.isVisible()) await page.getByRole("button", { name: "Inspector", exact: true }).click();
        await page.getByRole("region", { name: "Ligand of interest", exact: true }).getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
        const frame = page.getByRole("region", { name: "Project inspector", exact: true });
        const properties = frame.getByRole("region", { name: "Properties", exact: true });
        const choice = properties.getByRole("combobox", { name: "Profile", exact: true });
        await expect(choice.locator('option[value="ro5"]')).toHaveCount(1); await keyboardProfile(page, choice);
        const choiceBounds = await geometry(choice); expectReachable(choiceBounds); expect(choiceBounds.height).toBeGreaterThanOrEqual(44);
        const criteria = properties.locator(".ligand-profile-details"), methods = properties.locator(".ligand-property-methods");
        await expandWithKeyboard(page, criteria);
        const criteriaBounds = await geometry(criteria.locator("summary")); expectReachable(criteriaBounds); expect(criteriaBounds.height).toBeGreaterThanOrEqual(44);
        const criteriaCapture = await compositor(page, info, `profile-criteria-compositor-${theme}-${factor * 100}`);
        await expandWithKeyboard(page, methods);
        const methodsBounds = await geometry(methods.locator("summary")); expectReachable(methodsBounds);
        await expect(methods.locator("dt")).toHaveCount(4);
        await gate.captured;
        await expect(properties.getByRole("status")).toHaveText("Updating properties… Updating profile…");
        const tab = frame.getByRole("tab", { name: "selection", exact: true }); await tab.click();
        const panel = frame.getByRole("tabpanel", { name: "selection", exact: true });
        await panel.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
        const input = panel.getByRole("textbox", { name: "Value", exact: true });
        await input.fill(`${entry.id}:1`); await input.scrollIntoViewIfNeeded(); await input.click();
        const focusedInput = await input.elementHandle(), inputBefore = await geometry(input); expectReachable(inputBefore);
        gate.release();
        await expect(properties.getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
        expect(await focusedInput!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true);
        // Read after insertion without scrolling; otherwise a clipped input could be hidden by the test itself.
        const inputAfter = await input.evaluate(node => {
          const bounds = node.getBoundingClientRect(), owner = node.closest(".inspector-scroll")!;
          const viewport = owner.getBoundingClientRect(), hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
            viewportTop: Math.max(0, viewport.top), viewportBottom: Math.min(innerHeight, viewport.bottom),
            viewportLeft: Math.max(0, viewport.left), viewportRight: Math.min(innerWidth, viewport.right), hit: hit === node || node.contains(hit),
            scrollTop: owner.scrollTop, horizontalOverflow: owner.scrollWidth > owner.clientWidth + 1 };
        });
        expectReachable(inputAfter); expect(Math.abs(inputAfter.top - inputBefore.top)).toBeLessThanOrEqual(1);
        await panel.getByRole("button", { name: "Apply query", exact: true }).click();
        await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
        await tab.focus(); await page.keyboard.press("ArrowRight");
        await expect(frame.getByRole("tab", { name: "inspect", exact: true })).toBeFocused();
        await page.keyboard.press("ArrowLeft"); await expect(tab).toBeFocused();
        // Deliberate tab changes retain the established SelectionPanel lifecycle:
        // returning mounts a new local query draft. Async READY above must preserve
        // the existing draft/node/focus/position before this explicit navigation.
        const queryKind = panel.getByRole("combobox", { name: "Select by", exact: true });
        await expect(queryKind).toHaveValue("atom_name"); await expect(input).toHaveValue("");
        await queryKind.selectOption("atom_reference"); await input.fill(`${entry.id}:1`);
        await panel.getByRole("button", { name: "Apply query", exact: true }).click();
        await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
        await input.click();
        const queryCapture = await compositor(page, info, `profile-legacy-query-compositor-${theme}-${factor * 100}`);
        await expect(criteria.getByText("Value: 46.069 g/mol", { exact: true })).toBeVisible();
        await expect(criteria.getByText("Criterion: ≤ 500 g/mol", { exact: true })).toBeVisible();
        expect(await criteria.getByRole("link").count()).toBeGreaterThan(0); await expect(methods.locator("time")).toHaveCount(1);
        const header = await frame.locator(".inspector-header").boundingBox(), size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
        expect(header!.y).toBeGreaterThanOrEqual(0); expect(header!.y + header!.height).toBeLessThanOrEqual(size.height);
        expect(await frame.evaluate(node => node.scrollTop)).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include(".project-inspector").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
        await methods.locator("summary").scrollIntoViewIfNeeded();
        const methodsCapture = await compositor(page, info, `profile-current-methods-compositor-${theme}-${factor * 100}`);
        expect(await (await request.get(endpoint)).json()).toEqual(before);
        for (const original of originals) expect(await (await request.get(`${endpoint}/entries/${original.id}/original`)).body()).toEqual(original.bytes);
        expect(await (await request.get(preferencePath)).json()).toEqual(hiddenPreferences);
        expect(await (await request.get(`${endpoint}/jobs`)).json()).toEqual([]);
        evidence.push({ theme, factor, actual, actualContext: "persistent desktop Chromium", runnerProfile: info.project.name,
          size, choiceBounds, criteriaBounds, methodsBounds, inputBefore, inputAfter, compositor: { criteriaCapture, queryCapture, methodsCapture } });
        if (await drawer.isVisible()) { await choice.focus(); await page.keyboard.press("Escape"); await expect(drawer).toBeHidden(); }
      }
    }
    await info.attach("actual-profile-access-zoom", { contentType: "application/json", body: JSON.stringify(evidence) });
  } finally {
    gate?.release(); await context.close(); await rm(profile, { recursive: true, force: true });
    const current = await (await request.get(preferencePath)).json() as Preferences;
    if (JSON.stringify(current.enabled_categories) !== JSON.stringify(originalPreferences.enabled_categories)) {
      expect((await request.put(preferencePath, { data: { expected_revision: current.revision, enabled_categories: originalPreferences.enabled_categories } })).ok()).toBe(true);
    }
  }
});
