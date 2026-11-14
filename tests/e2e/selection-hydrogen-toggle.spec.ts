import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type APIRequestContext, type BrowserContext, type Page, type Worker } from "@playwright/test";
import type { ImportResult, Project, Selection, StructureProjection } from "../../apps/web/src/api/types";
import type * as SelectionStoreModule from "../../apps/web/src/store/selection";
import type * as EngineModule from "../../apps/web/src/viewer/MolstarEngine";

declare global { interface Window { hydrogenToggleEngine: InstanceType<typeof EngineModule.MolstarEngine> } }
interface AppearanceRequest { expected_revision: number; selection: Selection; property: string; action: string; show?: boolean }
interface ZoomAPI { tabs: { query(query: object): Promise<{ id: number; url?: string }[]>; setZoom(id: number, factor: number): Promise<void>; getZoom(id: number): Promise<number> } }

async function importedProject(request: APIRequestContext, name: string, entries = 1) {
  const created = await request.post("/api/v1/projects", { data: { name } });
  expect(created.status()).toBe(201);
  let project = await created.json() as Project;
  for (let index = 0; index < entries; index++) {
    const response = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
      expected_revision: String(project.revision), files: { name: `hydrogen-${index}.mol`, mimeType: "chemical/x-mdl-molfile",
        buffer: readFileSync("tests/fixtures/hydrogens/polar_hydrogens_ligand.mol") },
    } });
    expect(response.status()).toBe(201); project = (await response.json() as ImportResult).project;
  }
  return project;
}
async function currentProject(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/v1/projects/${id}`); expect(response.ok()).toBe(true);
  return await response.json() as Project;
}
async function seed(page: Page, entry: string, ids: number[]) {
  const value: Selection = { schema_version: 1, atoms: ids.map(atom_id => ({ structure_id: entry, atom_id })), granularity: "atom", source: "inspector" };
  await page.evaluate(async value => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path) as typeof SelectionStoreModule;
    useSelectionStore.getState().replace(value);
  }, value);
  await expect(page.locator(".viewer-status")).toContainText(`/ ${ids.length} selected`);
  return value;
}
async function selected(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path) as typeof SelectionStoreModule;
    return useSelectionStore.getState().selection;
  });
}
async function open(page: Page, project: Project) {
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst hOriginalSync = MolstarEngine.prototype.syncStructures;\nMolstarEngine.prototype.syncStructures = function(...args) { window.hydrogenToggleEngine = this; return hOriginalSync.apply(this,args); };` });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  const count = project.entries.filter(entry => entry.visible).length;
  await expect(page.locator(".viewer-status")).toContainText(`${count} visible / ${count} loaded`);
  const notice = page.getByRole("button", { name: "Dismiss message", exact: true });
  if (await notice.isVisible()) await notice.click();
  await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
}
const palette = (page: Page) => page.getByRole("dialog", { name: "Style selection", exact: true });
const toggle = (page: Page) => palette(page).getByRole("button", { name: "Show non-polar hydrogens", exact: true });
const reset = (page: Page) => palette(page).getByRole("button", { name: "Use entry hydrogen setting", exact: true });
async function openPalette(page: Page) {
  if (!await palette(page).isVisible()) await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
}
async function rendered(page: Page) {
  return page.evaluate(() => window.hydrogenToggleEngine.getRenderedAtomReferences().map(atom => atom.atom_id).sort((a, b) => a - b));
}
async function master(page: Page, checked: boolean) {
  if (await palette(page).isVisible()) await palette(page).getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "Show hydrogens", exact: true });
  if (await checkbox.isChecked() !== checked) await checkbox.click();
  await expect(checkbox).toBeChecked({ checked });
  await page.getByRole("button", { name: "Close viewer controls", exact: true }).click();
  await openPalette(page);
}

test("uses the primary hydrogen icon for exact attached targets with inheritance, history and persisted display", async ({ page: defaultPage, request, baseURL }, info) => {
  test.setTimeout(180_000);
  let context: BrowserContext | undefined, zoomWorker: Worker | undefined, profile: string | undefined;
  let page = defaultPage;
  if (info.project.name === "chromium") {
    profile = await mkdtemp(join(tmpdir(), "neistra-hydrogen-zoom-"));
    const extension = resolve("tests/e2e/support/zoom-extension");
    context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, viewport: null,
      deviceScaleFactor: undefined, baseURL, args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`, "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    page = context.pages()[0]; zoomWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  }
  try {
    const project = await importedProject(request, `Hydrogen target ${info.project.name} ${Date.now()}`);
    const entry = project.entries[0], path = `/api/v1/projects/${project.id}/entries/${entry.id}`;
    const before = await (await request.get(`${path}/structure`)).json() as StructureProjection;
    const original = await (await request.get(`${path}/original`)).body();
    expect(before.structure.atoms.map(atom => [atom.id, atom.element])).toEqual([[1, "C"], [2, "H"], [3, "O"], [4, "H"]]);
    expect(before.structure.bonds.map(bond => [bond.atom_1_id, bond.atom_2_id])).toEqual([[1, 2], [1, 3], [3, 4]]);
    await open(page, project);
    const carbonSeed = await seed(page, entry.id, [1]);
    await openPalette(page);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(reset(page)).toHaveAttribute("aria-disabled", "true");
    await expect.poll(() => rendered(page)).toEqual([1, 2, 3, 4]);
    const camera = await page.evaluate(() => window.hydrogenToggleEngine.getCamera());
    const changes: AppearanceRequest[] = [];
    page.on("request", message => { if (new URL(message.url()).pathname.endsWith("/selection-appearance")) changes.push(message.postDataJSON() as AppearanceRequest); });
    const settings = async () => (await currentProject(request, project.id)).entries[0].viewer_settings;
    await toggle(page).focus(); await page.keyboard.press("Enter");
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
    await expect(toggle(page)).toBeFocused();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ property: "nonpolar_hydrogens", action: "set", show: false,
      selection: { atoms: [{ structure_id: entry.id, atom_id: 2 }], granularity: "atom" } });
    expect((await settings()).selection_nonpolar_hydrogens).toEqual([{ show: false, atom_ids: [2] }]);
    expect(await selected(page)).toEqual(carbonSeed);
    await expect.poll(() => rendered(page)).toEqual([1, 3, 4]);
    await page.getByRole("button", { name: /^Undo:/ }).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Redo:/ }).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    const heavySeed = await seed(page, entry.id, [1, 3]);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "mixed");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await settings()).selection_nonpolar_hydrogens).toEqual([{ show: true, atom_ids: [2, 4] }]);
    expect(changes.at(-1)?.selection.atoms).toEqual([{ structure_id: entry.id, atom_id: 2 }, { structure_id: entry.id, atom_id: 4 }]);
    await reset(page).click();
    await expect(reset(page)).toHaveAttribute("aria-disabled", "true");
    expect((await settings()).selection_nonpolar_hydrogens).toEqual([]);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await master(page, false);
    await expect(palette(page).getByText("Show hydrogens is off; local preferences are retained.")).toBeVisible();
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    expect((await settings()).components.hydrogens).toBe(false);
    await expect.poll(() => rendered(page)).toEqual([1, 3]);
    await master(page, true);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    expect(await selected(page)).toEqual(heavySeed);
    expect(await page.evaluate(() => window.hydrogenToggleEngine.getCamera())).toEqual(camera);
    expect((await (await request.get(`${path}/structure`)).json() as StructureProjection).structure).toEqual(before.structure);
    expect(await (await request.get(`${path}/original`)).body()).toEqual(original);
    await page.reload();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
    await seed(page, entry.id, [1, 3]); await openPalette(page);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");

    const visualEvidence: unknown[] = [];
    for (const theme of ["light", "dark"]) {
      const switcher = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await switcher.isVisible()) await switcher.click();
      for (const factor of zoomWorker ? [1, 2] : [1]) {
        if (zoomWorker) {
          const actual = await zoomWorker.evaluate(async ({ url, factor }) => {
            const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
            const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
            if (!tab) throw new Error("Hydrogen zoom tab missing");
            await chrome.tabs.setZoom(tab.id, factor); return chrome.tabs.getZoom(tab.id);
          }, { url: page.url(), factor });
          expect(actual).toBe(factor);
          await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
          await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440 / factor);
          await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
        }
        await openPalette(page);
        await expect(toggle(page)).toBeInViewport();
        await toggle(page).focus(); await page.keyboard.press(" ");
        await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
        await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
        await expect(toggle(page)).toBeFocused();
        await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
        await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
        const h = (await toggle(page).boundingBox())!, polymer = (await palette(page).getByRole("group", { name: "Polymer", exact: true }).boundingBox())!;
        expect(h.y + h.height).toBeLessThanOrEqual(polymer.y);
        const visible = await toggle(page).evaluate(node => {
          const box = node.getBoundingClientRect(), viewport = window.visualViewport;
          return { x: viewport?.offsetLeft ?? 0, y: viewport?.offsetTop ?? 0, width: viewport?.width ?? innerWidth,
            height: viewport?.height ?? innerHeight, scale: viewport?.scale ?? 1,
            centerHitsButton: node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
        });
        expect(h.x).toBeGreaterThanOrEqual(visible.x); expect(h.y).toBeGreaterThanOrEqual(visible.y);
        expect(h.x + h.width).toBeLessThanOrEqual(visible.x + visible.width);
        expect(h.y + h.height).toBeLessThanOrEqual(visible.y + visible.height);
        expect(visible.centerHitsButton).toBe(true);
        expect((await new AxeBuilder({ page }).include(".selection-palette").analyze()).violations).toEqual([]);
        if (context) {
          const cdp = await context.newCDPSession(page);
          try {
            const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
            await info.attach(`hydrogen-${theme}-${factor * 100}-native-zoom`, { body: Buffer.from(data, "base64"), contentType: "image/png" });
          } finally { await cdp.detach(); }
        } else await page.screenshot({ path: info.outputPath(`hydrogen-${theme}-${factor * 100}.png`) });
        visualEvidence.push({ theme, factor, h, visualViewport: visible, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) });
        await palette(page).getByRole("button", { name: "Close dialog", exact: true }).click();
      }
    }
    if (zoomWorker) await zoomWorker.evaluate(async url => {
      const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === url); if (!tab) throw new Error("Hydrogen tab missing");
      await chrome.tabs.setZoom(tab.id, 1);
    }, page.url());
    await page.setViewportSize({ width: 320, height: 850 });
    for (const theme of ["light", "dark"]) {
      const switcher = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await switcher.isVisible()) await switcher.click();
      await openPalette(page);
      await expect(toggle(page)).toBeInViewport();
      await toggle(page).focus(); await page.keyboard.press(" ");
      await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
      await expect(toggle(page)).toBeFocused();
      await toggle(page).click(); await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
      for (const control of [toggle(page), reset(page)]) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(321);
        expect(box.height).toBeGreaterThanOrEqual(info.project.name === "mobile-chromium" ? 44 : 24);
      }
      expect((await new AxeBuilder({ page }).include(".selection-palette").analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`hydrogen-${theme}-320.png`) });
      await palette(page).getByRole("button", { name: "Close dialog", exact: true }).click();
    }
    expect(await selected(page)).toEqual(heavySeed);
    await info.attach("hydrogen-target-evidence.json", { body: JSON.stringify({ carbonSeed, heavySeed, changes, visualEvidence, settings: await settings(), camera }, null, 2), contentType: "application/json" });
  } finally { if (context) await context.close(); if (profile) await rm(profile, { recursive: true, force: true }); }
});

test("retires a held hidden-entry hydrogen load when the selection changes", async ({ page, request }, info) => {
  const initial = await importedProject(request, `Hydrogen stale load ${info.project.name} ${Date.now()}`, 2);
  const [visible, hidden] = initial.entries;
  const hiddenReply = await request.post(`/api/v1/projects/${initial.id}/entries/${hidden.id}/visibility`, { data: { expected_revision: initial.revision, value: false } });
  expect(hiddenReply.ok()).toBe(true);
  const project = await hiddenReply.json() as Project;
  let started = false, release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/projects/${project.id}/entries/${hidden.id}/structure`, async route => {
    started = true; await held; await route.continue();
  }, { times: 1 });
  await open(page, project);
  await seed(page, hidden.id, [1]);
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await expect(toggle(page)).toHaveAttribute("aria-disabled", "true");
  const next = await seed(page, visible.id, [3]);
  try {
    await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
    release();
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => (await currentProject(request, project.id)).entries.find(entry => entry.id === visible.id)!.viewer_settings.selection_nonpolar_hydrogens)
      .toEqual([{ show: false, atom_ids: [4] }]);
    expect((await currentProject(request, project.id)).entries.find(entry => entry.id === hidden.id)!.viewer_settings.selection_nonpolar_hydrogens).toEqual([]);
    expect(await selected(page)).toEqual(next);
    await info.attach("retired-hydrogen-load.json", { body: JSON.stringify({ previousEntry: hidden.id, next, project: await currentProject(request, project.id) }), contentType: "application/json" });
  } finally { release(); }
});

test("keeps attached-hydrogen toggles bounded in a loaded large molecular scene", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const created = await request.post("/api/v1/projects", { data: { name: `Hydrogen large scene ${info.project.name} ${Date.now()}` } });
  expect(created.status()).toBe(201);
  let project = await created.json() as Project;
  for (const [name, fixture] of [["1aon.cif", "tests/fixtures/surfaces/1aon.cif"], ["ligand.mol", "tests/fixtures/hydrogens/polar_hydrogens_ligand.mol"]]) {
    const response = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
      expected_revision: String(project.revision), files: { name, mimeType: "application/octet-stream", buffer: readFileSync(fixture) },
    } });
    expect(response.status()).toBe(201); project = (await response.json() as ImportResult).project;
  }
  const ligand = project.entries.find(entry => entry.source_format === "mol")!;
  const protein = project.entries.find(entry => entry.id !== ligand.id)!;
  expect(protein.atom_count).toBeGreaterThan(10_000);
  const reads: string[] = [], commands: AppearanceRequest[] = [];
  page.on("request", message => {
    const path = new URL(message.url()).pathname;
    if (message.method() === "GET" && /\/entries\/[^/]+\/structure$/.test(path)) reads.push(path);
    if (path.endsWith("/selection-appearance")) commands.push(message.postDataJSON() as AppearanceRequest);
  });
  await open(page, project);
  expect(reads).toHaveLength(2);
  const target = await seed(page, ligand.id, [1]);
  const baselineReads = [...reads];
  const camera = await page.evaluate(() => window.hydrogenToggleEngine.getCamera());
  const started = await page.evaluate(() => performance.now());
  await openPalette(page);
  const coldOpenMs = await page.evaluate(() => performance.now()) - started;
  expect(reads).toEqual(baselineReads);
  const warmToggleMs: number[] = [];
  for (const pressed of ["false", "true", "false", "true"]) {
    const before = await page.evaluate(() => performance.now());
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", pressed);
    await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");
    warmToggleMs.push(await page.evaluate(() => performance.now()) - before);
  }
  expect(commands).toHaveLength(4);
  for (const command of commands) expect(command.selection.atoms).toEqual([{ structure_id: ligand.id, atom_id: 2 }]);
  expect(reads).toEqual(baselineReads);
  expect(await selected(page)).toEqual(target);
  expect(await page.evaluate(() => window.hydrogenToggleEngine.getCamera())).toEqual(camera);
  const after = await currentProject(request, project.id);
  expect(after.revision).toBe(project.revision + 4);
  for (const entry of after.entries) {
    const before = project.entries.find(candidate => candidate.id === entry.id)!;
    expect([entry.current_artifact_id, entry.original_artifact_id, entry.atom_count, entry.bond_count])
      .toEqual([before.current_artifact_id, before.original_artifact_id, before.atom_count, before.bond_count]);
    expect(entry.viewer_settings.surface_objects).toEqual([]);
  }
  expect(after.entries.find(entry => entry.id === protein.id)!.viewer_settings).toEqual(protein.viewer_settings);
  await info.attach("large-scene-hydrogen-work.json", { body: JSON.stringify({ proteinAtoms: protein.atom_count, ligandAtoms: ligand.atom_count,
    coldOpenMs, warmToggleMs, loadedReads: baselineReads, additionalReads: reads.length - baselineReads.length,
    commands, target, camera, limitations: "Local end-to-end observations only; no reference-host timing or speedup claim." }, null, 2), contentType: "application/json" });
});
