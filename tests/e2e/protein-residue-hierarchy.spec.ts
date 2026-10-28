import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { AtomReference, Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { observe } from "./support/modeling";
import { browseComponents } from "./support/navigation";

// Observed-residue navigation fixture only; no claim of complete protein chemistry.
function proteinFixture(count = 4, large = false): Buffer {
  const lines: string[] = []; let id = 0;
  const add = (name: string, chain: string, number: number, code: string, x: number, y: number, element: string) =>
    lines.push(`ATOM  ${String(++id).padStart(5)} ${name.padStart(4)} GLY ${chain}${String(number).padStart(4)}${code || " "}   ${x.toFixed(3).padStart(8)}${y.toFixed(3).padStart(8)}${"0.000".padStart(8)}  1.00 20.00          ${element.padStart(2)}`);
  for (let i = 0; i < count; i++) {
    const number = large ? i % 9999 + 1 : [10, 10, 24, 3][i];
    const code = large ? i >= 9999 ? "A" : "" : i === 1 ? "A" : "";
    const x = large ? (i % 100) * 3 : -15 + i * 10;
    const y = large ? Math.floor(i / 100) * 3 : 0;
    add("N", "A", number, code, x - 1, y, "N");
    add("CA", "A", number, code, x, y, "C");
    add("C", "A", number, code, x + 1, y, "C");
    if (!large) add("H", "A", number, code, x - 1, y + 1, "H");
  }
  if (!large) { lines.push("TER"); add("CA", "B", 10, "", 0, 12, "C"); }
  lines.push("END"); return Buffer.from(lines.join("\n") + "\n");
}
const refs = (entry: string, ids: number[]) => ids.map(atom_id => ({ structure_id: entry, atom_id }));
const selected = (page: Page): Promise<AtomReference[]> => page.evaluate(async () => {
  const path = "/src/store/selection.ts";
  return (await import(/* @vite-ignore */ path)).useSelectionStore.getState().selection.atoms;
});
const selectionState = (page: Page) => page.evaluate(async () => {
  const path = "/src/store/selection.ts";
  const state = (await import(/* @vite-ignore */ path)).useSelectionStore.getState();
  return { anchor: state.rangeAnchor, mode: state.pickingGranularity };
});

for (const theme of ["light", "dark"] as const) test(`selects complete residues across Components, Sequence and native picks (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120000);
  let project = await prepare(page, request, [{ name: "residue-hierarchy.pdb", mimeType: "chemical/x-pdb", buffer: proteinFixture() }], "Residue hierarchy");
  const entry = project.entries[0];
  const response = await request.put(`/api/v1/projects/${project.id}/entries/${entry.id}/viewer-settings`, { data: {
    expected_revision: project.revision, settings: { ...entry.viewer_settings,
      components: { ...entry.viewer_settings.components, hydrogens: false },
      representations: [{ id: "residue-test", style: "ball-and-stick", color_by: "element", custom_color: "#3b82f6", opacity: 1 }] },
  } }); expect(response.ok()).toBe(true);
  project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  const a = projection.hierarchy.components.find(c => c.chain_ids.includes(1) && c.category === "protein")!;
  const b = projection.hierarchy.components.find(c => c.chain_ids.includes(2) && c.category === "protein")!;
  await page.reload(); await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  const themeButton = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await themeButton.count()) await themeButton.click();
  await observe(page);
  await page.evaluate(async entryId => {
    const path = "/src/test/selectionGestureHarness.ts";
    await (await import(/* @vite-ignore */ path)).settleSelectionScene(window.interactionEngines.at(-1)!, { structure_id: entryId, atom_id: 2 });
  }, entry.id);
  const mobile = info.project.name === "mobile-chromium";
  const canvas = page.locator(".molstar-host canvas").first();
  const point = (id: number) => page.evaluate(xyz => window.editingPicks.point(xyz), projection.structure.atoms.find(atom => atom.id === id)!.coordinates);
  const camera = await page.evaluate(() => window.editingPicks.camera());
  const reads: string[] = [], writes: string[] = [];
  page.on("request", r => { if (r.url().endsWith("/structure")) reads.push(r.url()); if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method())) writes.push(r.url()); });
  await canvas.click({ position: await point(6) });
  await expect.poll(() => selected(page)).toEqual(refs(entry.id, [6]));
  if (mobile) await page.getByRole("button", { name: "Project browser", exact: true }).click();
  await browseComponents(page, entry.name);
  const category = page.getByRole("button", { name: `Select Protein in ${entry.name}`, exact: true });
  await page.getByRole("button", { name: `Expand Protein in ${entry.name}`, exact: true }).click();
  const chainA = page.getByRole("button", { name: `Select ${a.display_label} in ${entry.name}`, exact: true });
  const expandA = page.getByRole("button", { name: `Expand ${a.display_label} in ${entry.name}`, exact: true });
  await expandA.click();
  const residue = (label: string, component = a) => page.getByRole("button", { name: `Select ${label} · ${component.display_label} in ${entry.name}`, exact: true });
  await expect(residue("GLY 10A")).toHaveAttribute("aria-pressed", "mixed");
  expect(await selected(page)).toEqual(refs(entry.id, [6]));
  await residue("GLY 10A").click({ modifiers: ["Control"] });
  await expect.poll(() => selected(page)).toEqual(refs(entry.id, [5, 6, 7, 8]));
  await residue("GLY 3").click({ modifiers: ["Shift"] });
  await expect.poll(() => selected(page)).toEqual(refs(entry.id, Array.from({ length: 12 }, (_, i) => i + 5)));
  const scrollBefore = await page.locator(".component-scroll").evaluate(e => e.scrollTop);
  if (mobile) await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Protein sequence viewer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^GLY 10A · chain A/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^GLY 10 · chain A/ }).click();
  await canvas.click({ position: await point(14), modifiers: ["Shift"] });
  await expect.poll(() => selected(page)).toEqual(refs(entry.id, Array.from({ length: 16 }, (_, i) => i + 1)));
  if (mobile) { await page.getByRole("button", { name: "Project browser", exact: true }).click(); await page.getByRole("tab", { name: "Components", exact: true }).click(); }
  await expect(page.getByRole("button", { name: `Collapse ${a.display_label} in ${entry.name}`, exact: true })).toBeVisible();
  expect(await page.locator(".component-scroll").evaluate(e => e.scrollTop)).toBe(scrollBefore);
  await page.getByRole("button", { name: `Expand ${b.display_label} in ${entry.name}`, exact: true }).click();
  await residue("GLY 10", b).click({ modifiers: ["Shift"] });
  await expect.poll(() => selected(page)).toEqual(refs(entry.id, Array.from({ length: 17 }, (_, i) => i + 1)));
  expect((await selectionState(page)).anchor.residueId).toBe(1);
  await residue("GLY 10", b).click({ modifiers: ["Meta"] });
  await expect.poll(() => selected(page)).toEqual(refs(entry.id, Array.from({ length: 16 }, (_, i) => i + 1)));
  await residue("GLY 10").focus(); await page.keyboard.press("ArrowLeft"); await expect(chainA).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(residue("GLY 10")).toHaveCount(0);
  await page.keyboard.press("ArrowRight"); await expect(residue("GLY 10")).toBeVisible();
  await page.keyboard.press("Home"); await expect(category).toBeFocused();
  expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(camera);
  if (mobile) {
    await page.setViewportSize({ width: 320, height: 700 });
    await expect(residue("GLY 10")).toBeVisible();
  }
  expect((await selectionState(page)).mode).toBe("atom");
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(project);
  expect(reads).toEqual([]); expect(writes).toEqual([]);
  expect((await new AxeBuilder({ page }).include(".component-pane").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`residue-hierarchy-${theme}.png`) });
});

test("virtualizes 10000 observed residues and selects complete off-screen ranges", async ({ page, request }, info) => {
  test.setTimeout(240000);
  let project: Project = await (await request.post("/api/v1/projects", { data: { name: `Large residues ${Date.now()}` } })).json();
  const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
    expected_revision: String(project.revision), files: { name: "synthetic-residues.pdb", mimeType: "chemical/x-pdb", buffer: proteinFixture(10000, true) },
  } }); expect(imported.ok()).toBe(true); project = (await imported.json()).project;
  const entry = project.entries[0]; expect(entry.atom_count).toBe(30000);
  const hidden = await request.post(`/api/v1/projects/${project.id}/entries/${entry.id}/visibility`, { data: { expected_revision: project.revision, value: false } });
  expect(hidden.ok()).toBe(true); project = await hidden.json();
  const baseline = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  const component = projection.hierarchy.components.find(c => c.category === "protein")!;
  expect(component.residue_ids).toHaveLength(10000);
  const reads: string[] = []; page.on("request", r => { if (r.url().endsWith("/structure")) reads.push(r.url()); });
  await page.goto("/"); await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  const mobile = info.project.name === "mobile-chromium";
  // Profile navigation independently of the existing unvirtualized atom property table.
  if (!mobile) await page.getByRole("tab", { name: "History", exact: true }).click();
  if (mobile) await page.getByRole("button", { name: "Project browser", exact: true }).click();
  await browseComponents(page, entry.name);
  await page.getByRole("button", { name: `Expand Protein in ${entry.name}`, exact: true }).click();
  await page.getByRole("button", { name: `Expand ${component.display_label} in ${entry.name}`, exact: true }).waitFor();
  const initialReads = reads.length;
  await page.evaluate(() => {
    const tasks: number[] = []; Object.assign(window, { residueTasks: tasks });
    new PerformanceObserver(list => { for (const item of list.getEntries()) tasks.push(item.duration); }).observe({ type: "longtask" });
  });
  const now = () => page.evaluate(() => performance.now());
  const started = await now();
  await page.getByRole("button", { name: `Expand ${component.display_label} in ${entry.name}`, exact: true }).click();
  const first = page.getByRole("button", { name: `Select GLY 1 · ${component.display_label} in ${entry.name}`, exact: true });
  await first.press("Enter"); await expect.poll(() => selected(page)).toEqual(refs(entry.id, [1, 2, 3]));
  const firstMs = await now() - started;
  const endStart = await now(); await page.keyboard.press("End");
  const last = page.getByRole("button", { name: `Select GLY 1A · ${component.display_label} in ${entry.name}`, exact: true });
  await expect(last).toBeFocused(); const endMs = await now() - endStart;
  const profiler = process.env.MOLWEAVE_RESIDUE_PROFILE ? await page.context().newCDPSession(page) : null;
  if (profiler) { await profiler.send("Profiler.enable"); await profiler.send("Profiler.start"); }
  const rangeStart = await now(); await last.press("Shift+Enter");
  await expect.poll(async () => (await selected(page)).length).toBe(30000);
  const rangeMs = await now() - rangeStart;
  if (profiler) {
    const profile = await profiler.send("Profiler.stop"); await profiler.detach();
    await info.attach("residue-cpu-profile", { body: JSON.stringify(profile), contentType: "application/json" });
  }
  expect(await selected(page)).toEqual(refs(entry.id, Array.from({ length: 30000 }, (_, i) => i + 1)));
  const windowSize = await page.locator(".component-scroll").evaluate(e => ({ mounted: e.querySelectorAll('.hierarchy-row').length,
    bound: Math.ceil(e.clientHeight / e.querySelector('.hierarchy-row')!.getBoundingClientRect().height) + 16 + 2,
    scroll: e.scrollTop }));
  expect(windowSize.mounted).toBeLessThanOrEqual(windowSize.bound); expect(windowSize.scroll).toBeGreaterThan(10000);
  expect(firstMs).toBeLessThan(5000); expect(endMs).toBeLessThan(5000); expect(rangeMs).toBeLessThan(5000);
  const longest = await page.evaluate(() => Math.max(0, ...(window as unknown as { residueTasks: number[] }).residueTasks));
  expect(longest).toBeLessThan(750); expect(reads.length).toBe(initialReads);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(baseline);
  await info.attach("residue-navigation-performance", { body: JSON.stringify({ count: 10000, atoms: 30000,
    firstMs, endMs, rangeMs, longest, ...windowSize, repeatedReads: reads.length - initialReads,
    propertyTable: "not mounted; navigation-only qualification" }), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("large-residue-hierarchy.png") });
});
