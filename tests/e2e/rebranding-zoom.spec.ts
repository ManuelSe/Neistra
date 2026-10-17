import { completeHydrogens } from "./support/hydrogen";
import { prepare } from "./support/interactions";
import { browseComponents, showEntries } from "./support/navigation";
import type { Project } from "../../apps/web/src/api/types";
import AxeBuilder from "@axe-core/playwright";
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
  const bounds = await page.locator('.topbar button:visible, .viewer-toolbar button:visible, .viewer-toolbar select:visible, .transform-launcher button:visible')
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
  test.setTimeout(240_000);
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
    const project = await created.json() as { id: string; name: string };
    await page.goto(baseURL!);
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
    await page.getByRole("button", { name: "Import structures" }).first().click();
    const importer = page.getByRole("dialog", { name: "Import structures" });
    await importer.locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/formats/ethanol.mol"));
    await importer.getByRole("button", { name: "Import", exact: true }).click();
    await expect(importer).toBeHidden();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
    const imported = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
    const grouped = await request.post(`/api/v1/projects/${project.id}/groups`, { data: { expected_revision: imported.revision, name: "Zoom destination", entry_ids: imported.entries.map(entry => entry.id) } });
    expect(grouped.status()).toBe(200);
    await page.reload();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
      for (const factor of [1, 2]) {
        expect(await setZoom(worker, baseURL!, factor)).toBe(factor);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
        await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
        await expectBoundedActions(page);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-workspace.png`);
        if (factor === 2) await page.getByRole("button", { name: "Project browser", exact: true }).click();
        await browseComponents(page, imported.entries[0].name);
        const navigation = page.locator(".project-browser");
        await expect(page.locator(".hierarchy-category").first()).toBeVisible();
        expect((await new AxeBuilder({ page }).include(".project-browser").analyze()).violations).toEqual([]);
        expect(await navigation.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-navigation.png`);
        await showEntries(page);
        await page.getByRole("button", { name: `Actions for ${imported.entries[0].name}`, exact: true }).click();
        await page.getByRole("menuitem", { name: "Details", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Entry details" })).toContainText(imported.entries[0].original_filename!);
        await page.keyboard.press("Escape");
        if (factor === 2) await page.getByRole("button", { name: "Close panel", exact: true }).click();
        const interactionsLauncher = page.getByRole("button", { name: "Interactions", exact: true });
        await interactionsLauncher.focus(); await page.keyboard.press("Enter");
        const interactions = page.getByRole("dialog", { name: "Interactions", exact: true });
        await expect(interactions).toBeVisible();
        expect(await interactions.evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && node.scrollWidth <= node.clientWidth + 1; })).toBe(true);
        // Contrast measurements must sample the settled panel, not its opacity
        // transition. Keep the actual WCAG assertions unchanged.
        await expect(interactions).toHaveCSS("opacity", "1");
        expect((await new AxeBuilder({ page }).include(".interaction-panel").analyze()).violations).toEqual([]);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-interactions.png`);
        await interactions.getByRole("button", { name: "Interaction help" }).click();
        await interactions.getByRole("button", { name: "Close interactions" }).focus(); await page.keyboard.press("Enter");
        await expect(interactionsLauncher).toBeFocused();
        if (factor === 2) await page.getByRole("button", { name: "Inspector", exact: true }).click();
        await page.getByRole("tab", { name: "selection", exact: true }).click();
        await page.getByLabel("Select by").selectOption("structure");
        await page.getByLabel("Value", { exact: true }).fill(imported.entries[0].id);
        await page.getByRole("button", { name: "Apply query", exact: true }).click();
        await page.getByRole("tab", { name: "transform", exact: true }).click();
        await page.getByRole("button", { name: "Move selection", exact: true }).focus();
        await page.keyboard.press("Enter");
        const movement = page.getByRole("region", { name: "Move selection controls" });
        await expect(movement).toBeVisible();
        if (factor === 2) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
        await page.getByRole("group", { name: "Move selection canvas" }).focus();
        await page.keyboard.down("Space");
        await expect(movement).toContainText("Adjusting camera");
        await page.keyboard.up("Space");
        await expect(movement).toContainText("Transforming selection");
        await movement.getByRole("button", { name: "Adjust view" }).focus();
        await page.keyboard.press("Space");
        await expect(movement).toContainText("Adjusting camera");
        await movement.getByRole("button", { name: "Resume transform" }).focus();
        await page.keyboard.press("Space");
        await expect(movement).toContainText("Transforming selection");
        expect((await new AxeBuilder({ page }).include(".movement-banner").include(".movement-pointer-surface").include(".movement-panel")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
        await movement.getByRole("button", { name: "More movement tools", exact: true }).click();
        const statusBox = (await page.locator(".viewer-status").boundingBox())!;
        const movementBox = (await movement.boundingBox())!;
        expect(movementBox.y).toBeGreaterThan(statusBox.y + statusBox.height);
        for (const control of await page.locator(".movement-banner button, .movement-panel button, .movement-panel input").all()) {
          await control.scrollIntoViewIfNeeded();
          const box = (await control.boundingBox())!;
          const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
          expect(box.height).toBeGreaterThanOrEqual(await control.evaluate(node => !node.classList.contains("movement-action") || matchMedia("(pointer: coarse)").matches ? 44 : 32));
          for (const name of ["Apply movement", "Cancel movement"]) {
            expect(await movement.getByRole("button", { name }).evaluate(node => {
              const box = node.getBoundingClientRect();
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return hit === node || Boolean(hit && node.contains(hit));
            })).toBe(true);
          }
        }
        await page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Translate", exact: true }).focus(); await page.keyboard.press("Enter");
        await page.getByRole("group", { name: "Move selection canvas" }).focus(); await page.keyboard.press("ArrowRight");
        await page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Depth", exact: true }).click();
        await page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Step away" }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await movement.evaluate(element => { element.scrollTop = 0; });
        await captureZoomPage(page, info, `${theme}-${factor * 100}-interactive-movement.png`);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "More movement tools" })).toBeHidden();
        await expect(movement).toBeVisible();
        await page.keyboard.press("Escape"); await expect(movement).toBeHidden();
        await expect(page.getByRole("button", { name: factor === 2 ? "Transform selection" : "Move selection", exact: true })).toBeFocused();
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
        const browser = page.getByRole("button", { name: "Project browser", exact: true });
        if (await browser.isVisible()) await browser.click();
        await page.locator(".entry-row .entry-select").click();
        await page.locator(".entry-menu-trigger").focus();
        await page.keyboard.press("Enter");
        await page.getByRole("menuitem", { name: "Move to group…", exact: true }).click();
        const membership = page.getByRole("dialog", { name: "Move to group", exact: true });
        await expect(membership).toContainText("1 complete structure.");
        await expect(membership.getByLabel("Destination group")).toBeFocused();
        for (const control of await membership.locator("button:visible, select:visible").all()) {
          await control.scrollIntoViewIfNeeded();
          const bounds = await control.boundingBox();
          const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
        }
        await captureZoomPage(page, info, `${theme}-${factor * 100}-group-membership.png`);
        await membership.getByRole("button", { name: "Move structures" }).click();
        await expect(membership).toBeHidden();
        await expect(page.locator(".entry-menu-trigger")).toBeFocused();
        await page.keyboard.press("Enter");
        await page.getByRole("menuitem", { name: "Remove from group", exact: true }).click();
        await expect(page.locator('.entry-group[data-group-id="ungrouped"] .entry-row')).toBeVisible();
        // Membership relocates/remounts the row. Escape belongs to its drawer
        // only after the captured action's scheduled focus restoration completes.
        await expect(page.getByRole("menu")).toBeHidden();
        await expect(page.locator(".entry-menu-trigger")).toBeFocused();

        if (await page.locator(".mobile-panel").isVisible()) {
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog", { name: "Project browser panel" })).toBeHidden();
          await expect(browser).toBeFocused();
        }
        const launcher = page.getByRole("button", { name: "Style selection", exact: true });
        await expect(launcher).toBeEnabled();
        await launcher.focus();
        await expect(launcher).toBeFocused();
        await page.keyboard.press("Enter");
        const appearance = page.getByRole("dialog", { name: "Style selection" });
        for (const control of await appearance.locator("button:visible, input:visible, select:visible").all()) {
          await control.scrollIntoViewIfNeeded();
          const bounds = await control.boundingBox();
          const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
        }
        for (const name of ["Hide atom detail", "Show atom detail"]) {
          const action = appearance.getByRole("button", { name, exact: true });
          await action.scrollIntoViewIfNeeded();
          const bounds = await action.boundingBox();
          expect(bounds!.width).toBeGreaterThanOrEqual(44);
          expect(bounds!.height).toBeGreaterThanOrEqual(44);
          await action.focus(); await page.keyboard.press("Enter");
          await expect(appearance.getByRole("status")).toContainText("Atom detail");
        }
        const createSurface = appearance.getByRole("button", { name: "Create fragment surface" });
        await createSurface.scrollIntoViewIfNeeded();
        await createSurface.focus(); await page.keyboard.press("Enter");
        await expect(appearance.getByRole("status")).toContainText("Surface definition saved");
        await appearance.getByRole("button", { name: /^Manage surfaces/ }).focus(); await page.keyboard.press("Enter");
        const manager = page.getByRole("dialog", { name: "Surfaces", exact: true });
        await expect(manager).toBeFocused();
        await manager.getByRole("button", { name: /Captured fragment/ }).focus(); await page.keyboard.press("Enter");
        await manager.getByLabel("Surface color scheme").selectOption("custom");
        await manager.getByLabel("Surface opacity").fill("0.3");
        await manager.getByLabel("Surface display").selectOption("mesh");
        await manager.getByRole("button", { name: "Apply appearance" }).focus(); await page.keyboard.press("Enter");
        await expect.poll(() => manager.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
        expect((await new AxeBuilder({ page }).include(".surface-manager").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
        for (const control of await manager.locator("button:visible, input:visible, select:visible").all()) {
          await control.scrollIntoViewIfNeeded();
          const box = (await control.boundingBox())!;
          const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
        }
        expect(await manager.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await manager.getByLabel("Surface name").scrollIntoViewIfNeeded();
        await captureZoomPage(page, info, `${theme}-${factor * 100}-surface-manager.png`);
        await manager.getByRole("button", { name: /^Remove surface/ }).focus(); await page.keyboard.press("Enter");
        await expect(manager.getByText(/No saved surfaces/)).toBeVisible();
        await manager.getByRole("button", { name: "Close surfaces" }).focus(); await page.keyboard.press("Enter");
        await expect(launcher).toBeFocused();
        await page.keyboard.press("Enter");
        const surfaceOptions = appearance.getByRole("button", { name: "Surface options" });
        await surfaceOptions.focus(); await page.keyboard.press("Enter");
        await page.getByRole("menuitem", { name: "About surfaces" }).click();
        const surfaceHelp = page.getByRole("dialog", { name: "About surfaces" });
        await expect(surfaceHelp.getByText(/Cut boundaries can create artificial faces/)).toBeVisible();
        await surfaceHelp.getByRole("button", { name: "Close surface panel" }).click();
        await surfaceOptions.click();
        await page.getByRole("menuitem", { name: "Pocket…" }).click();
        const pocket = page.getByRole("dialog", { name: "Protein pocket" });
        await expect(pocket).toBeVisible();
        expect(await pocket.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight &&
            node.scrollWidth <= node.clientWidth + 1;
        })).toBe(true);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-pocket.png`);
        await pocket.getByRole("button", { name: "Close surface panel" }).click();
        await captureZoomPage(page, info, `${theme}-${factor * 100}-selection-appearance.png`);
        await page.keyboard.press("Escape");
        await expect(launcher).toBeFocused();
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

test("keeps the molecular editor keyboard controls reachable at actual browser zoom", async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop zoom is independent of touch emulation.");
  test.setTimeout(180000);
  const extension = resolve("tests/e2e/support/zoom-extension");
  const profile = await mkdtemp(join(tmpdir(), "neistra-edit-zoom-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = context.pages()[0];
    page.setDefaultTimeout(10000);
    const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Edit zoom");
    const select = async () => {
      if (await page.getByRole("button", { name: "Inspector", exact: true }).isVisible()) await page.getByRole("button", { name: "Inspector", exact: true }).click();
      await page.getByRole("tab", { name: "selection", exact: true }).click();
      await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
      await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${project.entries[0].id}:1`);
      await page.getByRole("button", { name: "Apply query", exact: true }).click();
      if (await page.locator(".mobile-panel").isVisible()) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
    };
    await select();
    const launcher = page.getByRole("button", { name: "Edit molecule", exact: true });
    await launcher.click();
    const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
    await completeHydrogens(page);
    await expect(page.getByText(/Molecular edit stored/)).toBeVisible();
    await panel.getByRole("button", { name: "Close molecular editor" }).click();
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
      for (const factor of [1, 2]) {
        expect(await setZoom(worker, baseURL!, factor)).toBe(factor);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
        await launcher.focus(); await page.keyboard.press("Enter");
        await expect(panel).toBeFocused();
        for (const section of ["Atoms", "Bonds", "Fragments", "Residues"]) {
          await panel.getByRole("button", { name: section, exact: true }).click();
          for (const control of await panel.locator("button:visible:enabled, summary:visible").all()) {
            await control.focus();
            await expect(control).toBeFocused();
            expect(await control.evaluate(node => {
              const b = node.getBoundingClientRect();
              return b.x >= 0 && b.right <= innerWidth && b.y >= 0 && b.bottom <= innerHeight &&
                node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
            })).toBe(true);
          }
        }
        expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-molecular-edit.png`);
        await panel.getByRole("button", { name: "Atoms", exact: true }).click();
        await panel.getByText("Add atom", { exact: true }).click();
        const more = panel.getByText("More elements and formal charge", { exact: true });
        if (!(await more.evaluate(node => node.closest("details")!.open))) await more.click();
        expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
        await panel.getByRole("button", { name: "Preview atom", exact: true }).click();
        await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
        expect((await panel.boundingBox())!.height).toBeLessThanOrEqual(70);
        for (const control of await panel.getByRole("button").all()) {
          await control.focus(); await expect(control).toBeFocused();
          expect(await control.evaluate(node => {
            const b = node.getBoundingClientRect();
            return b.width >= 44 && b.height >= 44 && b.x >= 0 && b.right <= innerWidth &&
              b.y >= 0 && b.bottom <= innerHeight && node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
          })).toBe(true);
        }
        expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
        await captureZoomPage(page, info, `${theme}-${factor * 100}-placement-inspection.png`);
        await panel.getByRole("button", { name: "Cancel placement", exact: true }).click();
        await page.keyboard.press("Escape"); await expect(launcher).toBeFocused();
      }
    }
  } finally { await context.close(); }
});
