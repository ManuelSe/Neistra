import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type APIRequestContext, type Locator, type Page, type Worker } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepare } from "./support/interactions";

interface ZoomAPI { tabs: {
  query(query: object): Promise<{ id: number; url?: string }[]>;
  setZoom(id: number, factor: number): Promise<void>;
  getZoom(id: number): Promise<number>;
} }
const fixture = { name: "exact-occurrences.smi", mimeType: "chemical/x-daylight-smiles",
  buffer: Buffer.from("CCO.CCO same molecule in two occurrences\n") };
const controls = (page: Page) => page.getByRole("region", { name: "Ligand of interest", exact: true });
const choices = (page: Page) => page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
const changedChoiceRecovery = "The structure changed and this ligand choice needs review. Choose an instance again or clear the choice.";

async function openChoices(page: Page, entryId: string, count = 2, recovery?: string) {
  const inspector = page.getByRole("button", { name: "Inspector", exact: true });
  if (await page.evaluate(() => innerWidth <= 840)) {
    await expect(inspector).toBeVisible();
    await inspector.click();
    await expect(page.getByRole("dialog", { name: "Inspector panel", exact: true })).toBeVisible();
  } else {
    await expect(inspector).toBeHidden();
  }
  await controls(page).getByRole("combobox", { name: "Entry", exact: true }).selectOption(entryId);
  if (recovery) {
    const warning = controls(page).getByRole("status");
    await expect(warning).toHaveText(recovery);
    await warning.scrollIntoViewIfNeeded();
    await expect(warning).toBeVisible();
    const box = await warning.boundingBox();
    const viewport = await page.evaluate(() => ({ width: visualViewport?.width ?? innerWidth,
      height: visualViewport?.height ?? innerHeight }));
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect((await new AxeBuilder({ page }).include(".ligand-designation-controls")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  const launcher = controls(page).getByRole("button", { name: /^(Choose|Change)$/, exact: true });
  await launcher.focus(); await page.keyboard.press("Enter");
  await expect(choices(page).getByRole("radio")).toHaveCount(count);
  if (recovery) await expect(choices(page).getByText(recovery, { exact: true })).toBeVisible();
  return launcher;
}

async function setBrowserZoom(page: Page, worker: Worker, factor: number) {
  const actual = await worker.evaluate(async ({ url, factor }) => {
    const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
    if (!tab) throw new Error("Ligand choice tab missing from zoom qualification");
    await chrome.tabs.setZoom(tab.id, factor);
    return chrome.tabs.getZoom(tab.id);
  }, { url: page.url(), factor });
  expect(actual).toBe(factor);
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
  return actual;
}

async function splitChosenInstance(page: Page, request: APIRequestContext, project: Project) {
  const entry = project.entries[0], path = `/api/v1/projects/${project.id}`;
  const response = await request.get(`${path}/entries/${entry.id}/ligand-candidates`, {
    params: { expected_artifact_id: entry.current_artifact_id! },
  });
  expect(response.ok()).toBe(true);
  const inventory = await response.json();
  const candidate = inventory.candidates[0];
  const designated = await request.put(`${path}/entries/${entry.id}/ligand-designation`, {
    data: { expected_revision: project.revision, expected_artifact_id: entry.current_artifact_id,
      expected_input_hash: inventory.input_hash, candidate_key: candidate.candidate_key },
  });
  expect(designated.ok()).toBe(true);
  const selected: Project = await designated.json();
  const original = await (await request.get(`${path}/entries/${entry.id}/original`)).body();
  const projection: StructureProjection = await (await request.get(`${path}/entries/${entry.id}/structure`)).json();
  const members = new Set<number>(candidate.atom_ids);
  const heavy = new Set(projection.structure.atoms.filter(atom => atom.element !== "H").map(atom => atom.id));
  const bond = projection.structure.bonds.find(bond => members.has(bond.atom_1_id)
    && members.has(bond.atom_2_id) && heavy.has(bond.atom_1_id) && heavy.has(bond.atom_2_id));
  expect(bond).toBeDefined();
  const edited = await request.post(`${path}/entries/${entry.id}/ligand-edits`, {
    data: { expected_revision: selected.revision, operation: "bond.delete", bond_id: bond!.id },
  });
  expect(edited.ok()).toBe(true);
  const changed: Project = (await edited.json()).project;
  expect(changed.revision).toBe(project.revision + 2);
  expect(changed.entries[0].ligand_designation.status).toBe("stale");
  expect(changed.entries[0].ligand_designation.instance_id).toBe(selected.entries[0].ligand_designation.instance_id);
  expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(original);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  return await (await request.get(path)).json() as Project;
}
async function closeInspector(page: Page) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await drawer.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }
}
async function bounds(page: Page, panel: Locator) {
  // Inspect the presented state, after finite entry/theme animations. Sampling
  // the inherited opacity/translate entrance midway gives neither final bounds
  // nor the theme's actual contrast. The exact containment/Axe oracles remain.
  await page.evaluate(async () => {
    const animations = document.getAnimations().filter(animation =>
      animation.effect?.getTiming().iterations !== Infinity);
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
  });
  const observed = await panel.evaluate(element => {
    const box = element.getBoundingClientRect();
    const footer = element.querySelector(".ligand-candidate-footer")!.getBoundingClientRect();
    const body = element.querySelector(".ligand-candidate-body")!.getBoundingClientRect();
    return { panel: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      footer: { top: footer.top, bottom: footer.bottom }, bodyHeight: body.height,
      width: visualViewport?.width ?? innerWidth, height: visualViewport?.height ?? innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(observed.panel.left).toBeGreaterThanOrEqual(0);
  expect(observed.panel.top).toBeGreaterThanOrEqual(0);
  expect(observed.panel.right).toBeLessThanOrEqual(observed.width);
  expect(observed.panel.bottom).toBeLessThanOrEqual(observed.height);
  expect(observed.footer.top).toBeGreaterThanOrEqual(observed.panel.top);
  expect(observed.footer.bottom).toBeLessThanOrEqual(observed.panel.bottom);
  expect(observed.bodyHeight).toBeGreaterThan(0);
  expect(observed.overflow).toBe(false);
  expect((await new AxeBuilder({ page }).include(".ligand-candidate-dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  return observed;
}

test("keeps exact ligand choices usable at actual 100% and 200% browser zoom", async ({ request, baseURL }, info) => {
  test.setTimeout(180_000);
  const extension = resolve("tests/e2e/support/zoom-extension");
  const profile = await mkdtemp(join(tmpdir(), "neistra-ligand-zoom-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined,
    isMobile: false, hasTouch: false, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = context.pages()[0];
    const project = await prepare(page, request, [fixture], "Ligand real zoom");
    const evidence = [];
    for (const theme of ["light", "dark"] as const) {
      const button = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await button.count()) await button.click();
      for (const factor of [1, 2]) {
        const actual = await setBrowserZoom(page, worker, factor);
        const launcher = await openChoices(page, project.entries[0].id);
        const panel = choices(page);
        const radio = panel.getByRole("radio").nth(1);
        await radio.focus(); await page.keyboard.press("Space");
        await expect(radio).toBeChecked();
        const observed = await bounds(page, panel);
        const cdp = await context.newCDPSession(page);
        try {
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          await info.attach(`${theme}-${factor * 100}-ligand-choices`, { body: Buffer.from(data, "base64"), contentType: "image/png" });
        } finally { await cdp.detach(); }
        await panel.getByRole("button", { name: "Cancel", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(panel).toBeHidden();
        await expect(launcher).toBeFocused();
        await closeInspector(page);
        evidence.push({ theme, factor, actual, observed });
      }
    }
    expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(project);
    const stale = await splitChosenInstance(page, request, project);
    for (const theme of ["light", "dark"] as const) {
      const button = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await button.count()) await button.click();
      for (const factor of [1, 2]) {
        const actual = await setBrowserZoom(page, worker, factor);
        const launcher = await openChoices(page, stale.entries[0].id, 3, changedChoiceRecovery);
        const panel = choices(page), observed = await bounds(page, panel);
        const cdp = await context.newCDPSession(page);
        try {
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          await info.attach(`stale-${theme}-${factor * 100}-ligand-choices`, {
            body: Buffer.from(data, "base64"), contentType: "image/png",
          });
        } finally { await cdp.detach(); }
        await panel.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(panel).toBeHidden(); await expect(launcher).toBeFocused();
        await closeInspector(page);
        evidence.push({ theme, factor, actual, observed });
      }
    }
    expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(stale);
    await info.attach("actual-ligand-browser-zoom", { body: JSON.stringify(evidence), contentType: "application/json" });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("keeps exact ligand draft, scrolling, cancellation and focus usable at 320 pixels", async ({ page, request }, info) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 320, height: 700 });
  const project = await prepare(page, request, [fixture], "Ligand narrow choices");
  const evidence = [];
  for (const theme of ["light", "dark"] as const) {
    const button = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await button.count()) await button.click();
    const launcher = await openChoices(page, project.entries[0].id);
    const panel = choices(page), radio = panel.getByRole("radio").nth(1);
    if (info.project.name === "mobile-chromium") await radio.tap(); else await radio.click();
    await expect(radio).toBeChecked();
    const observed = await bounds(page, panel);
    await info.attach(`${theme}-320-ligand-choices`, { body: await page.screenshot(), contentType: "image/png" });
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toBeHidden(); await expect(launcher).toBeFocused();
    await closeInspector(page);
    evidence.push({ theme, observed });
  }
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(project);
  const stale = await splitChosenInstance(page, request, project);
  for (const theme of ["light", "dark"] as const) {
    const button = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await button.count()) await button.click();
    const launcher = await openChoices(page, stale.entries[0].id, 3, changedChoiceRecovery);
    const panel = choices(page), observed = await bounds(page, panel);
    await info.attach(`stale-${theme}-320-ligand-choices`, {
      body: await page.screenshot(), contentType: "image/png",
    });
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toBeHidden(); await expect(launcher).toBeFocused();
    await closeInspector(page);
    evidence.push({ theme, observed });
  }
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(stale);
  await info.attach("narrow-ligand-access", { body: JSON.stringify(evidence), contentType: "application/json" });
});
