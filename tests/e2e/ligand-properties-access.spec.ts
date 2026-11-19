import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Project } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";

interface Preferences {
  revision: number;
  enabled_categories: string[];
  default_categories: string[];
}

for (const theme of ["light", "dark"] as const) test(`keeps legacy query focus and access through property completion and expanded methods (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const mobile = info.project.name === "mobile-chromium";
  await page.setViewportSize({ width: mobile ? 320 : 1280, height: mobile ? 700 : 600 });
  let release!: () => void, capture!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const captured = new Promise<void>(resolve => { capture = resolve; });
  let projectId = "", holdReady = true;
  await page.route(url => url.pathname.endsWith("/ligand-properties/read"), async route => {
    const response = await route.fetch();
    if (holdReady && projectId && new URL(route.request().url()).pathname
      === `/api/v1/projects/${projectId}/ligand-properties/read` && response.ok()) {
      const payload = await response.json() as { entries: { status: string; report: unknown }[] };
      if (payload.entries.some(entry => entry.status === "ready" && entry.report)) {
        holdReady = false; capture(); await held;
      }
    }
    await route.fulfill({ response });
  });
  try {
    const project = await prepare(page, request, [{ name: "property-task-access.smi", mimeType: "chemical/x-daylight-smiles",
      buffer: Buffer.from("CCO ethanol\n") }], `Property task access ${theme}`);
    projectId = project.id;
    const entry = project.entries[0], endpoint = `/api/v1/projects/${project.id}`;
    const before = await (await request.get(endpoint)).json() as Project;
    const original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
    await page.getByRole("region", { name: "Ligand of interest", exact: true })
      .getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
    const frame = page.getByRole("region", { name: "Project inspector", exact: true });
    const selectionTab = frame.getByRole("tab", { name: "selection", exact: true });
    await selectionTab.click();
    const panel = frame.getByRole("tabpanel", { name: "selection", exact: true });
    await panel.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
    const input = panel.getByRole("textbox", { name: "Value", exact: true });
    await input.fill(`${entry.id}:1`); await input.focus();
    const focusedInput = await input.elementHandle();
    await captured;
    // Establish a fully visible, trusted input before testing result insertion.
    await input.scrollIntoViewIfNeeded();
    await input.click();
    const inputGeometry = () => input.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      const owner = node.closest(".inspector-scroll")!;
      const viewport = owner.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
        viewportTop: Math.max(0, viewport.top), viewportBottom: Math.min(innerHeight, viewport.bottom),
        viewportLeft: Math.max(0, viewport.left), viewportRight: Math.min(innerWidth, viewport.right),
        hit: document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === node };
    });
    const assertVisibleInput = (geometry: Awaited<ReturnType<typeof inputGeometry>>) => {
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.viewportTop - 1);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportBottom + 1);
      expect(geometry.left).toBeGreaterThanOrEqual(geometry.viewportLeft - 1);
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewportRight + 1);
      expect(geometry.hit).toBe(true);
    };
    const inputBefore = await inputGeometry();
    assertVisibleInput(inputBefore);
    release();
    const properties = page.getByRole("region", { name: "Properties", exact: true });
    await expect(properties.getByRole("status")).toHaveText("Properties current", { timeout: 30_000 });
    await expect(properties.locator(".ligand-properties-groups dt")).toHaveCount(14);
    expect(await focusedInput!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true);
    const inputAfter = await inputGeometry();
    await info.attach("property-task-input-position", { contentType: "application/json",
      body: JSON.stringify({ before: inputBefore, after: inputAfter }) });
    assertVisibleInput(inputAfter);
    expect(Math.abs(inputAfter.top - inputBefore.top)).toBeLessThanOrEqual(1);
    await panel.getByRole("button", { name: "Apply query", exact: true }).click();
    await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");

    const methods = properties.locator(".ligand-property-methods");
    await methods.locator("summary").click();
    await expect(methods).toHaveAttribute("open", "");
    await selectionTab.click();
    await expect(input).toHaveValue(`${entry.id}:1`);
    await panel.getByRole("button", { name: "Apply query", exact: true }).click();
    await selectionTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(frame.getByRole("tab", { name: "inspect", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(selectionTab).toBeFocused();
    await input.click();
    const header = await frame.locator(".inspector-header").boundingBox();
    expect(header!.y).toBeGreaterThanOrEqual(0);
    expect(header!.y + header!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
    expect(await frame.evaluate(node => node.scrollTop)).toBe(0);
    expect((await new AxeBuilder({ page }).include(".project-inspector")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    expect(await (await request.get(endpoint)).json()).toEqual(before);
    expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
    await page.screenshot({ path: info.outputPath(`property-legacy-task-access-${theme}.png`) });
  } finally { release(); }
});

for (const theme of ["light", "dark"] as const) test(`keeps property options accessible and installation-owned at 320px (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  const project = await prepare(page, request, [{ name: "property-options.smi", mimeType: "chemical/x-daylight-smiles",
    buffer: Buffer.from("CCO ethanol\n") }], `Property options ${theme}`);
  const entry = project.entries[0], base = `/api/v1/projects/${project.id}`;
  const endpoint = "/api/v1/workspace/ligand-property-preferences";
  const preferences = async () => await (await request.get(endpoint)).json() as Preferences;
  const originalPreferences = await preferences();
  const readProject = async () => await (await request.get(base)).json() as Project;
  const before = await readProject();
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("region", { name: "Ligand of interest", exact: true })
    .getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
  const region = page.getByRole("region", { name: "Properties", exact: true });
  const trigger = region.getByRole("button", { name: "Property options", exact: true });
  const dialog = page.getByRole("dialog", { name: "Property options", exact: true });
  try {
    await trigger.focus(); await page.keyboard.press("Enter");
    await expect(dialog).toContainText("Applies to all projects on this installation.");
    await expect(dialog.getByRole("checkbox")).toHaveCount(4);
    const composition = dialog.getByRole("checkbox", { name: "Composition", exact: true });
    const wasChecked = await composition.isChecked();
    await composition.setChecked(!wasChecked);
    await dialog.getByRole("button", { name: "Restore defaults", exact: true }).click();
    expect(await preferences()).toEqual(originalPreferences);
    await expect(dialog.getByRole("button", { name: "Close property options", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save options", exact: true })).toBeVisible();
    const bounds = await dialog.evaluate(element => {
      const panel = element.getBoundingClientRect();
      const header = element.querySelector(".ligand-property-options-header")!.getBoundingClientRect();
      const footer = element.querySelector(".ligand-property-options-footer")!.getBoundingClientRect();
      return { top: panel.top, bottom: panel.bottom, headerTop: header.top, headerBottom: header.bottom,
        footerTop: footer.top, footerBottom: footer.bottom, scrollTop: element.scrollTop, viewportHeight: innerHeight };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
    expect(bounds.headerTop).toBeGreaterThanOrEqual(bounds.top);
    expect(bounds.headerBottom).toBeLessThanOrEqual(bounds.bottom);
    expect(bounds.footerTop).toBeGreaterThanOrEqual(bounds.top);
    expect(bounds.footerBottom).toBeLessThanOrEqual(bounds.bottom);
    expect(bounds.scrollTop).toBe(0);
    expect((await new AxeBuilder({ page }).include(".ligand-property-options")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`property-options-320-${theme}.png`) });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
    expect(await preferences()).toEqual(originalPreferences);

    await trigger.click();
    await composition.setChecked(!originalPreferences.enabled_categories.includes("composition"));
    await dialog.getByRole("button", { name: "Save options", exact: true }).click();
    await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
    const saved = await preferences();
    expect(saved.revision).toBe(originalPreferences.revision + 1);
    expect(saved.enabled_categories.includes("composition")).toBe(!originalPreferences.enabled_categories.includes("composition"));
    expect(await readProject()).toEqual(before);

    await trigger.click();
    await dialog.getByRole("button", { name: "Restore defaults", exact: true }).click();
    await dialog.getByRole("button", { name: "Save options", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await preferences()).enabled_categories).toEqual(originalPreferences.default_categories);
    expect(await readProject()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    // Restore only this installation preference after a failed assertion too;
    // subsequent workflows must not inherit an incomplete options experiment.
    const current = await preferences();
    if (JSON.stringify(current.enabled_categories) !== JSON.stringify(originalPreferences.default_categories)) {
      const restored = await request.put(endpoint, { data: { expected_revision: current.revision,
        enabled_categories: originalPreferences.default_categories } });
      expect(restored.ok()).toBe(true);
    }
  }
});

for (const theme of ["light", "dark"] as const) test(`keeps a replacement options draft through a real delayed save acknowledgement (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const initial = await prepare(page, request, [{ name: "property-options-ack.smi", mimeType: "chemical/x-daylight-smiles",
    buffer: Buffer.from("CCO ethanol\n") }], `Property option acknowledgements ${theme}`);
  const endpoint = "/api/v1/workspace/ligand-property-preferences";
  const preferences = async () => await (await request.get(endpoint)).json() as Preferences;
  const original = await preferences();
  const before = await (await request.get(`/api/v1/projects/${initial.id}`)).json() as Project;
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  if (await page.evaluate(() => innerWidth <= 840)) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("region", { name: "Ligand of interest", exact: true })
    .getByRole("combobox", { name: "Entry", exact: true }).selectOption(initial.entries[0].id);
  const region = page.getByRole("region", { name: "Properties", exact: true });
  await expect(region.getByRole("status")).toHaveText("Properties current", { timeout: 30_000 });
  const background = await region.elementHandle();
  const trigger = region.getByRole("button", { name: "Property options", exact: true });
  const dialog = page.getByRole("dialog", { name: "Property options", exact: true });
  let release!: () => void, capture!: (saved: Preferences) => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const saved = new Promise<Preferences>(resolve => { capture = resolve; });
  let holdNext = true;
  await page.route(url => url.pathname === endpoint, async route => {
    if (!holdNext || route.request().method() !== "PUT") { await route.continue(); return; }
    holdNext = false;
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    capture(await response.json() as Preferences); await held; await route.fulfill({ response });
  });
  try {
    await trigger.click();
    await dialog.getByRole("checkbox", { name: "Composition", exact: true })
      .setChecked(!original.enabled_categories.includes("composition"));
    await dialog.getByRole("button", { name: "Save options", exact: true }).click();
    const acknowledged = await saved;
    expect(acknowledged.revision).toBe(original.revision + 1);
    await expect(dialog.getByRole("status")).toHaveText("Saving options… Changes may finish after closing.");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
    await trigger.click();
    const replacement = await dialog.elementHandle();
    const lipophilicity = dialog.getByRole("checkbox", { name: "Lipophilicity", exact: true });
    const checkbox = await lipophilicity.elementHandle();
    const draftValue = !original.enabled_categories.includes("lipophilicity");
    await lipophilicity.setChecked(draftValue); await lipophilicity.focus();
    release();
    // The modal deliberately hides its background from accessible interaction.
    // Observe the saved category through the existing DOM, then verify the
    // active replacement dialog retains its own draft, identity and focus.
    await expect.poll(async () => background!.evaluate(element => [...element.querySelectorAll(".ligand-properties-group h3")]
      .some(heading => heading.textContent === "Composition"))).toBe(acknowledged.enabled_categories.includes("composition"));
    expect(await replacement!.evaluate(element => element.isConnected)).toBe(true);
    expect(await checkbox!.evaluate(element => element.isConnected)).toBe(true);
    await expect(lipophilicity).toBeChecked({ checked: draftValue });
    await expect(lipophilicity).toBeFocused();
    await expect(dialog.getByRole("checkbox", { name: "Composition", exact: true }))
      .toBeChecked({ checked: original.enabled_categories.includes("composition") });
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`property-options-late-save-${theme}.png`) });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await (await request.get(`/api/v1/projects/${initial.id}`)).json()).toEqual(before);
  } finally {
    release();
    const current = await preferences();
    if (JSON.stringify(current.enabled_categories) !== JSON.stringify(original.default_categories)) {
      expect((await request.put(endpoint, { data: { expected_revision: current.revision,
        enabled_categories: original.default_categories } })).ok()).toBe(true);
    }
  }
});

interface ZoomAPI {
  tabs: {
    query(query: object): Promise<{ id: number; url?: string }[]>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
}

test("qualifies property options at actual desktop 100% and 200% zoom in both themes", async ({ request, baseURL }, info) => {
  test.setTimeout(180_000);
  const extension = resolve("tests/e2e/support/zoom-extension");
  const profile = await mkdtemp(join(tmpdir(), "neistra-property-zoom-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, isMobile: false, hasTouch: false, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = context.pages()[0];
    const project = await prepare(page, request, [{ name: "property-zoom.smi", mimeType: "chemical/x-daylight-smiles",
      buffer: Buffer.from("CCO ethanol\n") }], "Property desktop zoom");
    const evidence = [];
    for (const theme of ["light", "dark"] as const) {
      const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await toggle.count()) await toggle.click();
      for (const factor of [1, 2]) {
        const actual = await worker.evaluate(async ({ url, factor }) => {
          const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
          const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
          if (!tab) throw new Error("Property tab missing from actual desktop zoom qualification");
          await chrome.tabs.setZoom(tab.id, factor); return chrome.tabs.getZoom(tab.id);
        }, { url: page.url(), factor });
        expect(actual).toBe(factor);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
        const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
        if (await page.evaluate(() => innerWidth <= 840) && !await drawer.isVisible()) {
          await page.getByRole("button", { name: "Inspector", exact: true }).click();
        }
        await page.getByRole("region", { name: "Ligand of interest", exact: true })
          .getByRole("combobox", { name: "Entry", exact: true }).selectOption(project.entries[0].id);
        const region = page.getByRole("region", { name: "Properties", exact: true });
        await expect(region.getByRole("status")).toHaveText("Properties current", { timeout: 30_000 });
        await region.getByRole("button", { name: "Property options", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Property options", exact: true });
        await expect(dialog.getByRole("button", { name: "Close property options", exact: true })).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Save options", exact: true })).toBeVisible();
        await dialog.evaluate(async element => {
          await Promise.all(element.getAnimations().map(animation => animation.finished));
        });
        const bounds = await dialog.boundingBox();
        const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
        expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
        expect((await new AxeBuilder({ page }).include(".ligand-property-options")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
        await page.screenshot({ path: info.outputPath(`property-options-real-${factor * 100}-${theme}.png`) });
        const cdp = await context.newCDPSession(page);
        try {
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          await info.attach(`property-options-compositor-${factor * 100}-${theme}`, {
            body: Buffer.from(data, "base64"), contentType: "image/png" });
        } finally { await cdp.detach(); }
        evidence.push({ actual_context: "desktop persistent Chromium", theme, factor, actual, size, bounds });
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      }
    }
    await info.attach("actual-property-zoom", { body: JSON.stringify(evidence), contentType: "application/json" });
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
