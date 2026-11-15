import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from "@playwright/test";
import type { Project, Selection, StructureProjection } from "../../apps/web/src/api/types";
import type * as SelectionStore from "../../apps/web/src/store/selection";
import type { observeEditPicks } from "../../apps/web/src/test/molecularEditHarness";
import { frameFixture, prepare } from "./support/interactions";

declare global { interface Window { editingPicks: Awaited<ReturnType<typeof observeEditPicks>> } }
interface Appearance { selection: Selection; property: string; action: string; show?: boolean; expected_revision: number }
const ownedBrowsers: { context: BrowserContext; profile: string }[] = [];
// Keep the external browser alive through test-fixture screenshots and traces.
test.afterAll(async () => {
  for (const { context, profile } of ownedBrowsers.splice(0)) {
    try { await context.close(); } finally { await rm(profile, { recursive: true, force: true }); }
  }
});
interface ZoomAPI { tabs: { query(query: object): Promise<{ id: number; url?: string }[]>; setZoom(id: number, factor: number): Promise<void>; getZoom(id: number): Promise<number> } }
const panel = (page: Page) => page.getByRole("dialog", { name: "Edit molecule", exact: true });
const toggle = (page: Page) => panel(page).getByRole("button", { name: "Show non-polar hydrogens", exact: true });
const reset = (page: Page) => panel(page).getByRole("button", { name: "Use entry hydrogen setting", exact: true });
async function seed(page: Page, entry: string, ids: number[]) {
  const selection: Selection = { schema_version: 1, atoms: ids.map(atom_id => ({ structure_id: entry, atom_id })), granularity: "atom", source: "inspector" };
  await page.evaluate(async selection => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path) as typeof SelectionStore;
    useSelectionStore.getState().replace(selection);
  }, selection);
  await expect(page.locator(".viewer-status")).toContainText(`/ ${ids.length} selected`);
  return selection;
}
async function selected(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/store/selection.ts";
    return ((await import(/* @vite-ignore */ path)) as typeof SelectionStore).useSelectionStore.getState().selection;
  });
}
async function openEditor(page: Page) {
  if (!await panel(page).isVisible()) await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
  await expect(page.getByRole("dialog", { name: "Style selection", exact: true })).toHaveCount(0);
}
async function observe(page: Page) {
  await page.evaluate(async () => {
    const path = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ path);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
    await window.editingPicks.settled();
  });
}
const rendered = (page: Page) => page.evaluate(() => window.interactionEngines.at(-1)!.getRenderedAtomReferences().map(atom => atom.atom_id).sort((a, b) => a - b));
async function master(page: Page, show: boolean) {
  await panel(page).getByRole("button", { name: "Close molecular editor" }).click();
  await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
  const input = page.getByRole("checkbox", { name: "Show hydrogens", exact: true });
  if (await input.isChecked() !== show) await input.click();
  await expect(input).toBeChecked({ checked: show });
  await page.getByRole("button", { name: "Close viewer controls", exact: true }).click();
  await openEditor(page);
}

test("toggles compact existing-H targets with exact scope, native picking, history and contained accessible controls", async ({ page: defaultPage, request, baseURL }, info) => {
  test.setTimeout(180_000);
  let page = defaultPage, context: BrowserContext | undefined, zoom: Worker | undefined, profile: string | undefined;
  if (info.project.name === "chromium") {
    profile = await mkdtemp(join(tmpdir(), "neistra147-h-toggle-"));
    const extension = resolve("tests/e2e/support/zoom-extension");
    context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, baseURL,
      args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    ownedBrowsers.push({ context, profile });
    page = context.pages()[0]; zoom = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  }
  {
    let project = await prepare(page, request, ["tests/fixtures/hydrogens/polar_hydrogens_ligand.mol"], "Compact hydrogen toggle");
    const entry = project.entries[0], path = `/api/v1/projects/${project.id}`, entryPath = `${path}/entries/${entry.id}`;
    const operand = (ids: number[]): Selection => ({ schema_version: 1, atoms: ids.map(atom_id => ({ structure_id: entry.id, atom_id })), granularity: "atom", source: "inspector" });
    // A local off override must win over the entry's on default before this action.
    const hidden = await request.post(`${path}/selection-appearance`, { data: { expected_revision: project.revision, selection: operand([2, 4]), property: "nonpolar_hydrogens", action: "set", show: false } });
    expect(hidden.ok()).toBe(true); project = await hidden.json() as Project;
    await page.reload();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
    await frameFixture(page); await observe(page);
    const carbon = await seed(page, entry.id, [1]);
    const before = await (await request.get(`${entryPath}/structure`)).json() as StructureProjection;
    const original = await (await request.get(`${entryPath}/original`)).body();
    const current = async () => await (await request.get(path)).json() as Project;
    const settings = async () => (await current()).entries[0].viewer_settings;
    const baselineSettings = await settings(), baselineHistory = (await current()).history.retained_commands;
    const camera = await page.evaluate(() => window.editingPicks.camera());
    const changes: Appearance[] = [];
    page.on("request", message => { if (new URL(message.url()).pathname.endsWith("/selection-appearance")) changes.push(message.postDataJSON() as Appearance); });
    await openEditor(page);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => rendered(page)).toEqual([1, 3, 4]);
    await toggle(page).focus(); await page.keyboard.press("Enter");
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
    await expect(toggle(page)).toBeFocused();
    await expect.poll(() => rendered(page)).toEqual([1, 2, 3, 4]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ property: "nonpolar_hydrogens", action: "set", show: true, selection: operand([2]) });
    expect((await settings()).selection_nonpolar_hydrogens).toEqual([{ atom_ids: [4], show: false }, { atom_ids: [2], show: true }]);
    expect({ ...await settings(), selection_nonpolar_hydrogens: [] }).toEqual({ ...baselineSettings, selection_nonpolar_hydrogens: [] });
    expect((await current()).history.retained_commands).toBe(baselineHistory + 1);
    expect(await selected(page)).toEqual(carbon);
    expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(camera);
    expect((await current()).entries[0].current_artifact_id).toBe(entry.current_artifact_id);
    expect((await (await request.get(`${entryPath}/structure`)).json() as StructureProjection).structure).toEqual(before.structure);
    expect(await (await request.get(`${entryPath}/original`)).body()).toEqual(original);
    await page.getByRole("button", { name: /^Undo:/ }).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => rendered(page)).toEqual([1, 3, 4]);
    await page.getByRole("button", { name: /^Redo:/ }).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => rendered(page)).toEqual([1, 2, 3, 4]);
    // Prove an actual atom representation: one real canvas pick must resolve H2.
    await panel(page).getByRole("button", { name: "Close molecular editor" }).click();
    await page.evaluate(() => window.editingPicks.settled());
    const point = await page.evaluate(coordinates => window.editingPicks.point(coordinates), before.structure.atoms.find(atom => atom.id === 2)!.coordinates);
    const eventCount = await page.evaluate(() => window.editingPicks.events.length);
    await page.locator(".molstar-host canvas").first().click({ position: point });
    await expect.poll(() => page.evaluate(() => window.editingPicks.events.length)).toBeGreaterThan(eventCount);
    await expect.poll(() => selected(page)).toMatchObject({ atoms: [{ structure_id: entry.id, atom_id: 2 }] });
    expect(await page.evaluate(() => window.editingPicks.events.at(-1)?.kind)).toBe("element-loci");
    await seed(page, entry.id, [1]); await openEditor(page);
    await toggle(page).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    expect(changes.at(-1)).toMatchObject({ selection: operand([2]), show: false });
    await reset(page).click(); await expect(reset(page)).toHaveAttribute("aria-disabled", "true");
    expect(changes.at(-1)).toMatchObject({ action: "reset", selection: operand([2]) });
    expect((await settings()).selection_nonpolar_hydrogens).toEqual([{ atom_ids: [4], show: false }]);
    const heavy = await seed(page, entry.id, [1, 3]);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "mixed");
    await toggle(page).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    expect(changes.at(-1)).toMatchObject({ show: true, selection: operand([2, 4]) });
    await reset(page).click(); await expect(reset(page)).toHaveAttribute("aria-disabled", "true");
    expect((await settings()).selection_nonpolar_hydrogens).toEqual([]);
    await master(page, false);
    await expect(panel(page).getByText("Show hydrogens is off; local preferences are retained.")).toBeVisible();
    await toggle(page).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await toggle(page).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    expect((await settings()).components.hydrogens).toBe(false);
    await expect.poll(() => rendered(page)).toEqual([1, 3]);
    await master(page, true);
    await toggle(page).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    expect(await selected(page)).toEqual(heavy);
    await page.reload(); await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
    await seed(page, entry.id, [1, 3]); await openEditor(page);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    const settleResponsiveWorkspace = async () => {
      const compact = await page.evaluate(() => matchMedia("(max-width: 840px)").matches);
      await expect(page.locator("#workspace-horizontal-panels")).toHaveCount(compact ? 0 : 1);
      await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
      await expect.poll(() => rendered(page)).toEqual([1, 3, 4]);
      await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
    };
    const visuals: unknown[] = [];
    for (const theme of ["light", "dark"]) {
      const switcher = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await switcher.isVisible()) await switcher.click();
      for (const factor of zoom ? [1, 2] : [1]) {
        if (zoom) {
          expect(await zoom.evaluate(async ({ url, factor }) => {
            const api = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
            const tab = (await api.tabs.query({})).find(tab => tab.url === url);
            if (!tab) throw new Error("Compact zoom tab missing");
            await api.tabs.setZoom(tab.id, factor); return api.tabs.getZoom(tab.id);
          }, { url: page.url(), factor })).toBe(factor);
          await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
          await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
        }
        await settleResponsiveWorkspace();
        await toggle(page).scrollIntoViewIfNeeded();
        await toggle(page).focus(); await page.keyboard.press(" ");
        await expect(toggle(page)).toHaveAttribute("aria-pressed", "true"); await expect(toggle(page)).toBeFocused();
        await toggle(page).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
        for (const control of [toggle(page), reset(page)]) {
          const box = (await control.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
          await expect(control).toBeInViewport();
          const contained = await control.evaluate(node => { const b = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); });
          expect(contained).toBe(true); visuals.push({ theme, factor, box });
        }
        expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").analyze()).violations).toEqual([]);
        if (context) {
          const cdp = await context.newCDPSession(page);
          try {
            const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
            await info.attach(`compact-hydrogen-${theme}-${factor * 100}-native-zoom`, { body: Buffer.from(data, "base64"), contentType: "image/png" });
          } finally { await cdp.detach(); }
        } else await page.screenshot({ path: info.outputPath(`compact-hydrogen-${theme}-${factor * 100}.png`) });
      }
    }
    if (zoom) {
      await zoom.evaluate(async url => {
        const api = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
        const tab = (await api.tabs.query({})).find(tab => tab.url === url); if (!tab) throw new Error("Compact tab missing"); await api.tabs.setZoom(tab.id, 1);
      }, page.url());
      await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(1);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
      await settleResponsiveWorkspace();
    }
    await page.setViewportSize({ width: 320, height: 850 });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(320);
    await settleResponsiveWorkspace();
    await toggle(page).scrollIntoViewIfNeeded();
    await expect(toggle(page)).toBeInViewport();
    for (const control of [toggle(page), reset(page)]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(321);
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await toggle(page).focus(); await page.keyboard.press(" "); await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await toggle(page).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({ path: info.outputPath("compact-hydrogen-320.png") });
    await info.attach("compact-hydrogen-evidence.json", { body: JSON.stringify({ carbon, heavy, changes, visuals, settings: await settings(), camera }, null, 2), contentType: "application/json" });
  }
});
