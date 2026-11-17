import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { StructureProjection } from "../../apps/web/src/api/types";
import { prepareInformationProject } from "./support/viewer-information";

interface ZoomAPI {
  tabs: { query(query: object): Promise<{ id: number; url?: string }[]>;
    setZoom(id: number, factor: number): Promise<void>; getZoom(id: number): Promise<number> };
}

async function exercise(page: Page, source: StructureProjection, theme: "light" | "dark", touch: boolean) {
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  const ruler = page.getByRole("button", { name: "Measurements", exact: true });
  const launcher = await ruler.boundingBox();
  expect(launcher?.width).toBeGreaterThanOrEqual(44);
  expect(launcher?.height).toBeGreaterThanOrEqual(44);
  await ruler.focus(); await page.keyboard.press("Enter");
  const tool = page.getByRole("dialog", { name: "Measurements", exact: true });
  await expect(tool).toBeVisible();
  await tool.getByLabel("Measurement name", { exact: true }).fill("Retained accessible draft");
  await tool.getByRole("button", { name: "Pick in viewer", exact: true }).click();
  await expect(tool.getByRole("button", { name: "Review targets", exact: true })).toBeFocused();
  const before = await page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    const state = useSelectionStore.getState();
    return { selection: state.selection, inspectionOrder: state.inspectionOrder, rangeAnchor: state.rangeAnchor };
  });
  const position = await page.evaluate(async projection => {
    const { atomPickPixel, settleSelectionScene } = await import("/src/test/selectionGestureHarness.ts");
    const reference = { structure_id: projection.entry_id, atom_id: 1 }, engine = window.interactionEngines.at(-1)!;
    await settleSelectionScene(engine, reference);
    const { observeEditPicks } = await import("/src/test/molecularEditHarness.ts");
    const observer = await observeEditPicks(engine);
    try {
      return atomPickPixel(engine, observer.point(projection.structure.atoms.find(atom => atom.id === 1)!.coordinates), reference);
    } finally { observer.dispose(); }
  }, source);
  const canvas = page.locator(".molstar-host canvas").first();
  if (touch) await canvas.tap({ position }); else await canvas.click({ position });
  await expect(page.getByTestId("viewer-selection-geometry")).toHaveText("Distance: choose target 2 (1/2).");
  const after = await page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    const state = useSelectionStore.getState();
    return { selection: state.selection, inspectionOrder: state.inspectionOrder, rangeAnchor: state.rangeAnchor };
  });
  expect(after).toEqual(before);
  const compact = await tool.evaluate(node => {
    const box = node.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight };
  });
  expect(compact.left).toBeGreaterThanOrEqual(0); expect(compact.top).toBeGreaterThanOrEqual(0);
  expect(compact.right).toBeLessThanOrEqual(compact.width); expect(compact.bottom).toBeLessThanOrEqual(compact.height);
  await tool.getByRole("button", { name: "Review targets", exact: true }).click();
  await expect(tool.getByRole("button", { name: "Pick target 2", exact: true })).toBeFocused();
  await expect(tool.getByLabel("Measurement name", { exact: true })).toHaveValue("Retained accessible draft");
  const choose = tool.getByRole("button", { name: "Choose atom for target 2", exact: true });
  await choose.focus(); await page.keyboard.press("Enter");
  await expect(tool.getByRole("region", { name: "Choose measurement atom", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(choose).toBeFocused();
  expect((await new AxeBuilder({ page }).include(".measurement-tool")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape"); // Stop acquisition, retain the draft.
  await expect(tool).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tool).toBeHidden(); await expect(ruler).toBeFocused();
  return compact;
}

test("keeps measurement acquisition and keyboard recovery usable at 320 pixels", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  const project = await prepareInformationProject(page, request, "Measurement narrow access");
  const source: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/structure`)).json();
  const observations = [];
  for (const theme of ["light", "dark"] as const) observations.push({ theme,
    compact: await exercise(page, source, theme, info.project.name === "mobile-chromium") });
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(project);
  await info.attach("measurement-320-native-keyboard", { body: JSON.stringify(observations), contentType: "application/json" });
});

test("keeps measurement acquisition and keyboard recovery usable at actual browser zoom", async ({ request, baseURL }, info) => {
  test.setTimeout(180_000);
  const extension = resolve("tests/e2e/support/zoom-extension"), profile = await mkdtemp(join(tmpdir(), "neistra-measurement-zoom-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, isMobile: false, hasTouch: false, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), page = context.pages()[0];
    const project = await prepareInformationProject(page, request, "Measurement actual zoom");
    const source: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/structure`)).json();
    const observations = [];
    for (const theme of ["light", "dark"] as const) for (const factor of [1, 2]) {
      const actual = await worker.evaluate(async ({ url, factor }) => {
        const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
        if (!tab) throw new Error("Owned measurement qualification tab is missing");
        await chrome.tabs.setZoom(tab.id, factor); return chrome.tabs.getZoom(tab.id);
      }, { url: page.url(), factor });
      expect(actual).toBe(factor);
      await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
      await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
      observations.push({ theme, factor, actual, compact: await exercise(page, source, theme, false) });
    }
    expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(project);
    await info.attach("measurement-actual-zoom-native-keyboard", { body: JSON.stringify(observations), contentType: "application/json" });
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});


test("keeps paged contact controls at 44 pixel targets in the narrow application", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  const project = await prepareInformationProject(page, request, "Contact target access", ["tests/fixtures/complex/1stp.pdb"]);
  const entry = project.entries.find(item => item.source_format === "pdb")!;
  const tool = page.getByRole("dialog", { name: "Measurements", exact: true });
  const observations = [];
  for (const theme of ["light", "dark"] as const) {
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await page.getByRole("button", { name: "Measurements", exact: true }).click();
    await tool.getByRole("button", { name: "Close contacts", exact: true }).click();
    await tool.getByRole("combobox", { name: "Structure", exact: true }).selectOption(entry.id);
    await tool.getByRole("spinbutton", { name: "Cutoff (Å)", exact: true }).fill("10");
    await tool.getByRole("button", { name: "Find contacts", exact: true }).click();
    const previous = tool.getByRole("button", { name: "Previous contact page", exact: true });
    const next = tool.getByRole("button", { name: "Next contact page", exact: true });
    await expect(next).toBeEnabled();
    const targets = tool.locator(".contact-results button");
    await expect(targets).toHaveCount(50);
    const dimensions = [];
    for (const target of [previous, next, targets.first()]) {
      await target.scrollIntoViewIfNeeded();
      const box = (await target.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      dimensions.push({ width: box.width, height: box.height });
    }
    if (info.project.name === "mobile-chromium") await next.tap(); else await next.click();
    await expect(tool.getByText(/^Page 2 of /)).toBeVisible();
    await expect(previous).toBeEnabled();
    observations.push({ theme, dimensions });
    await tool.getByRole("button", { name: "Close measurements", exact: true }).click();
  }
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(project);
  await info.attach("current-contact-hit-targets", { body: JSON.stringify(observations), contentType: "application/json" });
});
