import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type Locator, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareInformationProject, setInformationSelection } from "./support/viewer-information";

interface ZoomAPI {
  tabs: {
    query(query: object): Promise<{ id: number; url?: string }[]>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
}

const strip = (page: Page) => page.getByRole("region", { name: "Viewer information", exact: true });
const dialog = (page: Page, name: "Atom details" | "Measurement targets") => page.getByRole("dialog", { name, exact: true });
const referenceValue = (entryId: string, id: number) => JSON.stringify([entryId, id]);

async function chooseUsingKeyboard(select: Locator, value: string) {
  const index = await select.evaluate((node, expected) =>
    Array.from((node as HTMLSelectElement).options).findIndex(option => option.value === expected), value);
  expect(index).toBeGreaterThan(0);
  await select.focus();
  await select.press("Home");
  for (let step = 0; step < index; step++) await select.press("ArrowDown");
  await expect(select).toHaveValue(value);
}

async function expectDialogBounds(page: Page, panel: Locator) {
  const frames = await panel.evaluate(async element => {
    const frames = [];
    for (let frame = 0; frame < 8; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const bounds = element.getBoundingClientRect();
      frames.push({ left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: innerWidth, height: innerHeight });
    }
    return frames;
  });
  for (const bounds of frames) {
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
  }
  expect((await new AxeBuilder({ page }).include(".viewer-information-strip").include(".viewer-info-dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  return frames;
}

async function expectReservedLayout(page: Page) {
  const sequence = page.getByRole("region", { name: "Protein sequence viewer", exact: true });
  await expect(sequence).toBeVisible();
  const bounds = await page.locator(".sequence-workspace").evaluate(element => {
    const rect = (selector: string) => {
      const node = element.querySelector(selector);
      if (!node) throw new Error(`Viewer layout is missing ${selector}`);
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    return { canvas: rect(".structure-viewer"), strip: rect(".viewer-information-strip"), sequence: rect(".sequence-viewer"),
      viewport: { width: visualViewport?.width ?? innerWidth, height: visualViewport?.height ?? innerHeight },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(bounds.horizontalOverflow).toBe(false);
  expect(bounds.canvas.height).toBeGreaterThan(0);
  expect(bounds.strip.height).toBeGreaterThan(0);
  expect(bounds.sequence.height).toBeGreaterThan(0);
  expect(bounds.canvas.bottom).toBeLessThanOrEqual(bounds.strip.y + 1);
  expect(bounds.strip.bottom).toBeLessThanOrEqual(bounds.sequence.y + 1);
  for (const box of [bounds.canvas, bounds.strip, bounds.sequence]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(bounds.viewport.width);
    expect(box.bottom).toBeLessThanOrEqual(bounds.viewport.height);
  }
  await expect(page.locator(".molstar-host canvas").first()).toBeVisible();
  return bounds;
}

async function selectTheme(page: Page, theme: "light" | "dark") {
  const button = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await button.count()) await button.click();
}

test("keeps viewer information and ordered geometry usable at actual 100% and 200% browser zoom", async ({ request, baseURL }, info) => {
  test.setTimeout(240_000);
  const extension = resolve("tests/e2e/support/zoom-extension");
  const profile = await mkdtemp(join(tmpdir(), "neistra-information-zoom-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, isMobile: false, hasTouch: false, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = context.pages()[0];
    const project = await prepareInformationProject(page, request, "Information actual zoom", ["tests/fixtures/formats/protein_editing.pdb"]);
    const entry = project.entries.find(entry => entry.source_format === "xyz");
    expect(entry, "The qualified four-point entry must be present").toBeDefined();
    const entryId = entry!.id;
    const evidence = [];
    for (const theme of ["light", "dark"] as const) {
      await selectTheme(page, theme);
      for (const factor of [1, 2]) {
        const actual = await worker.evaluate(async ({ url, factor }) => {
          const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
          const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
          if (!tab) throw new Error("Viewer-information tab missing from browser zoom qualification");
          await chrome.tabs.setZoom(tab.id, factor);
          return chrome.tabs.getZoom(tab.id);
        }, { url: page.url(), factor });
        expect(actual).toBe(factor);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
        await expect(page.locator(".viewer-status")).toContainText(`${project.entries.length} visible / ${project.entries.length} loaded`, { timeout: 30_000 });
        await setInformationSelection(page, entryId, [1, 2, 3], 1440 / factor <= 840);
        await expect(page.getByTestId("viewer-selection-geometry")).toHaveText("Order targets");
        const layout = await expectReservedLayout(page);
        const detailsTrigger = strip(page).getByRole("button", { name: "Atom details", exact: true });
        await detailsTrigger.focus();
        await page.keyboard.press("Enter");
        const details = dialog(page, "Atom details");
        await expect(details).toBeFocused();
        const chooser = details.getByRole("combobox", { name: "Selected atom", exact: true });
        await expect(chooser).toHaveValue("");
        const emptyDetailsBounds = await expectDialogBounds(page, details);
        await chooseUsingKeyboard(chooser, referenceValue(entryId, 2));
        await expect(details.getByText("Atom ID", { exact: true }).locator("..").locator("dd")).toHaveText("2");
        const detailsBounds = await expectDialogBounds(page, details);
        expect(detailsBounds[0].bottom - detailsBounds[0].top).toBeGreaterThan(emptyDetailsBounds[0].bottom - emptyDetailsBounds[0].top);
        expect(detailsBounds[0].bottom).toBeCloseTo(emptyDetailsBounds[0].bottom, 0);
        const cdp = await context.newCDPSession(page);
        try {
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          await info.attach(`${theme}-${factor * 100}-atom-details`, { body: Buffer.from(data, "base64"), contentType: "image/png" });
        } finally { await cdp.detach(); }
        await page.keyboard.press("Escape");
        await expect(details).toBeHidden();
        await expect(detailsTrigger).toBeFocused();
        const orderTrigger = strip(page).getByRole("button", { name: "Order measurement targets", exact: true });
        await orderTrigger.focus();
        await page.keyboard.press("Space");
        const targets = dialog(page, "Measurement targets");
        await expect(targets).toBeFocused();
        for (const [slot, id] of [3, 2, 1].entries()) {
          await chooseUsingKeyboard(targets.getByRole("combobox").nth(slot), referenceValue(entryId, id));
        }
        await expect(targets.getByRole("combobox").nth(1)).toHaveAccessibleName("Measurement target 2, angle vertex");
        const orderBounds = await expectDialogBounds(page, targets);
        const useOrder = targets.getByRole("button", { name: "Use order", exact: true });
        await useOrder.focus();
        await page.keyboard.press("Enter");
        await expect(targets).toBeHidden();
        await expect(page.getByTestId("viewer-selection-geometry")).toHaveText("Angle 90.0°");
        await expect(strip(page).getByRole("button", { name: "Inspect measurement targets", exact: true })).toBeFocused();
        const finalLayout = await expectReservedLayout(page);
        const readoutCapture = await context.newCDPSession(page);
        try {
          const { data } = await readoutCapture.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          await info.attach(`${theme}-${factor * 100}-ordered-readout`, { body: Buffer.from(data, "base64"), contentType: "image/png" });
        } finally { await readoutCapture.detach(); }
        evidence.push({ theme, factor, actual, layout, emptyDetailsBounds, detailsBounds, orderBounds, finalLayout });
      }
    }
    const retained = await request.get(`/api/v1/projects/${project.id}`);
    expect(retained.status()).toBe(200);
    expect(await retained.json()).toEqual(project);
    await info.attach("actual-information-browser-zoom", { body: JSON.stringify(evidence), contentType: "application/json" });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("retains viewer information, target ordering and sequence access at 320 pixels", async ({ page, request }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 320, height: 700 });
  const project = await prepareInformationProject(page, request, "Information narrow access", ["tests/fixtures/formats/protein_editing.pdb"]);
  const entry = project.entries.find(entry => entry.source_format === "xyz");
  expect(entry, "The qualified four-point entry must be present").toBeDefined();
  const evidence = [];
  const activate = async (button: Locator) => info.project.name === "mobile-chromium" ? button.tap() : button.click();
  for (const theme of ["light", "dark"] as const) {
    await selectTheme(page, theme);
    await setInformationSelection(page, entry!.id, [1, 2, 3], true);
    const layout = await expectReservedLayout(page);
    const detailsTrigger = strip(page).getByRole("button", { name: "Atom details", exact: true });
    await activate(detailsTrigger);
    const details = dialog(page, "Atom details");
    const emptyDetailsBounds = await expectDialogBounds(page, details);
    await details.getByRole("combobox", { name: "Selected atom", exact: true }).selectOption(referenceValue(entry!.id, 1));
    const detailsBounds = await expectDialogBounds(page, details);
    expect(detailsBounds[0].bottom - detailsBounds[0].top).toBeGreaterThan(emptyDetailsBounds[0].bottom - emptyDetailsBounds[0].top);
    expect(detailsBounds[0].bottom).toBeCloseTo(emptyDetailsBounds[0].bottom, 0);
    await info.attach(`${theme}-320-atom-details`, { body: await page.screenshot(), contentType: "image/png" });
    await activate(details.getByRole("button", { name: "Close viewer information", exact: true }));
    await expect(detailsTrigger).toBeFocused();
    await activate(strip(page).getByRole("button", { name: "Order measurement targets", exact: true }));
    const targets = dialog(page, "Measurement targets");
    for (const [slot, id] of [1, 2, 3].entries()) await targets.getByRole("combobox").nth(slot).selectOption(referenceValue(entry!.id, id));
    const orderBounds = await expectDialogBounds(page, targets);
    await activate(targets.getByRole("button", { name: "Use order", exact: true }));
    await expect(page.getByTestId("viewer-selection-geometry")).toHaveText("Angle 90.0°");
    const sequence = page.getByRole("region", { name: "Protein sequence viewer", exact: true });
    await activate(sequence.getByRole("button", { name: "Collapse sequences", exact: true }));
    const collapsedLayout = await expectReservedLayout(page);
    await activate(sequence.getByRole("button", { name: "Expand sequences", exact: true }));
    await expectReservedLayout(page);
    await info.attach(`${theme}-320-ordered-readout`, { body: await page.screenshot(), contentType: "image/png" });
    evidence.push({ theme, layout, emptyDetailsBounds, detailsBounds, orderBounds, collapsedLayout });
  }
  const retained = await request.get(`/api/v1/projects/${project.id}`);
  expect(retained.status()).toBe(200);
  expect(await retained.json()).toEqual(project);
  await info.attach("narrow-information-access", { body: JSON.stringify(evidence), contentType: "application/json" });
});
