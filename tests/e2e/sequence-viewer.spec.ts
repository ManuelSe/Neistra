import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { AtomReference, Project } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { sequenceFixture } from "./support/sequence";

const selected = (page: Page): Promise<AtomReference[]> => page.evaluate(async () => {
  const path = "/src/store/selection.ts";
  return (await import(/* @vite-ignore */ path)).useSelectionStore.getState().selection.atoms;
});
const sequence = (page: Page) => page.getByRole("region", { name: "Protein sequence viewer", exact: true });
const setup = (page: Page, request: Parameters<typeof prepare>[1], count = 4, chains = 2, entries = 1) =>
  prepare(page, request, Array.from({ length: entries }, (_, index) => ({ name: `sequences-${index + 1}.pdb`, mimeType: "chemical/x-pdb", buffer: sequenceFixture(count, chains) })), "Protein sequences");
const canvasCamera = (page: Page) => page.evaluate(() => window.interactionEngines.at(-1)!.getCamera());

for (const theme of ["light", "dark"] as const) test(`stacks visible chains and independently collapses, hides and restores sequences (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await setup(page, request, 4, 2, 2);
  const themeButton = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await themeButton.count()) await themeButton.click();
  await expect(sequence(page).getByRole("list", { name: "Displayed protein chains", exact: true })).toBeVisible();
  await expect(sequence(page).locator(".sequence-chain-row")).toHaveCount(4);
  await expect(page.getByRole("tab", { name: "sequence", exact: true })).toHaveCount(0);
  const camera = await canvasCamera(page);
  const engines = await page.evaluate(() => window.interactionEngines.length);
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const reads: string[] = [], writes: string[] = [];
  page.on("request", r => { if (r.url().endsWith("/structure")) reads.push(r.url()); if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method())) writes.push(r.url()); });
  const first = sequence(page).getByRole("button", { name: /GLY 10A · chain A/ }).first();
  await first.click(); await expect(first).toHaveAttribute("aria-pressed", "true");
  const references = await selected(page);
  expect(references).toHaveLength(3);
  if (info.project.name === "chromium") {
    await page.getByRole("button", { name: "Collapse lower panel", exact: true }).click();
    await expect(first).toBeVisible();
  }
  await page.getByRole("button", { name: "Collapse sequences", exact: true }).click();
  await expect(sequence(page).locator(".sequence-chain-scroll")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand sequences", exact: true }).click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Hide sequences", exact: true }).click();
  await expect(sequence(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show sequences", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Show sequences", exact: true }).click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  expect(await selected(page)).toEqual(references);
  expect(await canvasCamera(page)).toEqual(camera);
  expect(await page.evaluate(() => window.interactionEngines.length)).toBe(engines);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
  expect(reads).toEqual([]); expect(writes).toEqual([]);
  if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await sequence(page).evaluate(element => ({ height: element.getBoundingClientRect().height,
    parent: element.parentElement!.getBoundingClientRect().height }));
  expect(bounds.height).toBeLessThanOrEqual(bounds.parent / 3 + 1);
  expect((await new AxeBuilder({ page }).include(".sequence-viewer").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`sequences-${theme}.png`) });
  await page.getByRole("button", { name: "Collapse sequences", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sequences", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide sequences", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Show sequences", exact: true })).toBeVisible();
});

test("follows application visibility and isolation while retaining whole-chain context", async ({ page, request }) => {
  test.setTimeout(120000);
  const project = await setup(page, request);
  await sequence(page).getByRole("button", { name: /GLY 10A · chain A/ }).click();
  await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
  await page.getByRole("button", { name: "Isolate selection", exact: true }).click();
  await page.getByRole("button", { name: "Close viewer controls", exact: true }).click();
  await expect(sequence(page).locator(".sequence-chain-row")).toHaveCount(1);
  await expect(sequence(page).getByRole("button", { name: /GLY 3 · chain A/ })).toBeVisible();
  await page.getByRole("button", { name: "Open viewer controls", exact: true }).click();
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(sequence(page).locator(".sequence-chain-row")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "protein", exact: true }).click();
  await expect(sequence(page)).toContainText("No displayed protein chains");
  await page.getByRole("checkbox", { name: "protein", exact: true }).click();
  await page.getByRole("button", { name: "Close viewer controls", exact: true }).click();
  await expect(sequence(page).locator(".sequence-chain-row")).toHaveCount(2);
  const state: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const entry = state.entries[0];
  const hidden = await request.post(`/api/v1/projects/${project.id}/entries/${entry.id}/visibility`, { data: { expected_revision: state.revision, value: false } });
  expect(hidden.ok()).toBe(true);
  await page.reload();
  await expect(sequence(page)).toContainText("No displayed protein chains");
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect(sequence(page).locator(".sequence-chain-row")).toHaveCount(2);
});

test("navigates long rows without selecting or following unrelated selection and preserves scrolling across remount", async ({ page, request }, info) => {
  test.setTimeout(120000);
  await setup(page, request, 100, 2);
  const row = sequence(page).locator(".sequence-chain-row").first();
  const first = row.getByRole("button", { name: /^GLY 1 ·/ });
  await first.focus(); await first.press("End");
  const last = row.getByRole("button", { name: /^GLY 100 ·/ });
  await expect(last).toBeFocused();
  expect(await selected(page)).toEqual([]);
  const horizontal = await row.locator(".sequence-residue-scroll").evaluate(element => element.scrollLeft);
  expect(horizontal).toBeGreaterThan(0);
  await last.press("Enter"); expect(await selected(page)).toHaveLength(3);
  await last.press("Home"); await expect(first).toBeFocused();
  await first.press("Shift+Enter"); expect(await selected(page)).toHaveLength(300);
  await first.press("ArrowDown");
  await expect(sequence(page).getByRole("button", { name: /^GLY 1 · chain B/ })).toBeFocused();
  expect(await selected(page)).toHaveLength(300);
  await page.getByRole("button", { name: "Collapse sequences", exact: true }).click();
  await page.getByRole("button", { name: "Expand sequences", exact: true }).click();
  await expect(sequence(page).locator(".sequence-chain-row").first().locator(".sequence-residue-scroll")).toHaveJSProperty("scrollLeft", 0);
  await sequence(page).getByRole("button", { name: /^GLY 1 · chain B/ }).focus();
  await page.keyboard.press("End");
  const second = sequence(page).locator(".sequence-chain-row").nth(1).locator(".sequence-residue-scroll");
  const saved = await second.evaluate(element => element.scrollLeft);
  const target = info.project.name === "chromium" ? { width: 700, height: 800 } : { width: 1200, height: 800 };
  await page.setViewportSize(target);
  await expect(sequence(page).getByRole("button", { name: /^GLY 100 · chain B/ })).toBeFocused();
  await expect.poll(() => sequence(page).locator(".sequence-chain-row").nth(1).locator(".sequence-residue-scroll").evaluate((element, saved) => element.scrollLeft === Math.min(saved, element.scrollWidth - element.clientWidth), saved)).toBe(true);
  await sequence(page).getByRole("button", { name: /^GLY 100 · chain B/ }).click();
  const before = await second.evaluate(element => element.scrollLeft);
  // Trusted entry selection elsewhere must leave sequence browsing in place.
  const compact = await page.getByRole("button", { name: "Project browser", exact: true }).isVisible();
  if (compact) await page.getByRole("button", { name: "Project browser", exact: true }).click();
  await page.locator(".entry-select").first().click();
  if (compact) await page.keyboard.press("Escape");
  expect(await selected(page)).toHaveLength(600);
  expect(await second.evaluate(element => element.scrollLeft)).toBe(before);
});

test("bounds virtual DOM and complete selection for a displayed 10000-residue protein", async ({ page, request }, info) => {
  test.setTimeout(240000);
  const project = await setup(page, request, 10000, 1);
  // Keep the unrelated unvirtualized property table out of this navigation profile.
  if (info.project.name === "chromium") await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(sequence(page).getByRole("button", { name: /^GLY 1 ·/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.interactionEngines.at(-1)!.getRenderedAtomReferences().length), { timeout: 30000 }).toBeGreaterThan(0);
  const reads: string[] = []; page.on("request", r => { if (r.url().endsWith("/structure")) reads.push(r.url()); });
  await page.evaluate(() => {
    const tasks: number[] = []; Object.assign(window, { sequenceTasks: tasks });
    new PerformanceObserver(list => { for (const item of list.getEntries()) tasks.push(item.duration); }).observe({ type: "longtask" });
  });
  const start = Date.now();
  const first = sequence(page).getByRole("button", { name: /^GLY 1 ·/ });
  await first.click(); await first.press("End");
  const last = sequence(page).getByRole("button", { name: /^GLY 1A ·/ });
  await expect(last).toBeFocused();
  await last.press("Shift+Enter");
  await expect.poll(async () => (await selected(page)).length).toBe(30000);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(5000);
  const metrics = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".sequence-residue-scroll")!;
    return { mounted: document.querySelectorAll(".sequence-residue").length,
      bound: Math.ceil(scroller.clientWidth / 52) + 16 + 1,
      longest: Math.max(0, ...(window as unknown as { sequenceTasks: number[] }).sequenceTasks) };
  });
  expect(metrics.mounted).toBeLessThanOrEqual(metrics.bound);
  expect(metrics.longest).toBeLessThan(750); expect(reads).toEqual([]);
  const current: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(current.revision).toBe(project.revision);
  await info.attach("sequence-performance", { body: JSON.stringify({ ...metrics, elapsed, repeatedReads: reads.length, atoms: 30000, residues: 10000, entryVisible: true, propertyTable: "unmounted" }), contentType: "application/json" });
});

test("scrolls a bounded stack of many displayed protein chains", async ({ page, request }) => {
  test.setTimeout(120000);
  await setup(page, request, 4, 24);
  const scroller = sequence(page).getByRole("list", { name: "Displayed protein chains", exact: true });
  await sequence(page).getByRole("button", { name: /^GLY 10 · chain A/ }).focus();
  for (let i = 0; i < 23; i++) await page.keyboard.press("ArrowDown");
  await expect(sequence(page).getByRole("button", { name: /^GLY 10 · chain X/ })).toBeFocused();
  expect(await selected(page)).toEqual([]);
  const metrics = await scroller.evaluate(element => ({ mounted: element.querySelectorAll(".sequence-chain-row").length,
    bound: Math.ceil(element.clientHeight / (matchMedia("(any-pointer: coarse), (max-width: 840px)").matches ? 64 : 52)) + 8 + 1, scroll: element.scrollTop }));
  expect(metrics.mounted).toBeLessThanOrEqual(metrics.bound); expect(metrics.scroll).toBeGreaterThan(0);
});
