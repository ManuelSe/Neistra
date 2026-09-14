import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { AtomReference, Project, StructureProjection } from "../../apps/web/src/api/types";

declare global { interface Window { visibilityPicks: AtomReference[] } }

async function fixture(request: APIRequestContext, name: string) {
  const initial: Project = await (await request.post("/api/v1/projects", { data: { name: `Visibility ${name} ${Date.now()}` } })).json();
  const response = await request.post(`/api/v1/projects/${initial.id}/imports`, { multipart: {
    expected_revision: "0", files: { name, mimeType: "chemical/x-pdb", buffer: readFileSync(`tests/fixtures/formats/${name}`) },
  } });
  expect(response.status()).toBe(201);
  const project: Project = (await response.json()).project;
  const entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  return { project, entry, projection };
}

test("hiding the middle atom removes every incident native bond and its label", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const { entry, projection } = await fixture(request, "ethanol.mol");
  await page.goto("/selection-surface-test.html");
  const result = await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/selectionSurfaceHarness.ts";
    const { mountProductionSurfaceHarness } = await import(/* @vite-ignore */ path);
    const container = document.createElement("div"); Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
    const source = { entryId: entry.id, label: entry.name, projection: projection.viewer,
      atomIds: entry.atom_ids, normalized: projection.structure, hierarchy: projection.hierarchy, settings: structuredClone(entry.viewer_settings) };
    source.settings.labels.atoms = true;
    const h = await mountProductionSurfaceHarness(container, source);
    const results = [];
    for (const style of ["line", "stick", "thick-stick", "ball-and-stick", "space-filling"] as const) {
      source.settings.representations[0].style = style;
      source.settings.selection_hidden_atoms = [];
      await h.sync([source]);
      const before = h.details(), camera = h.engine.getCamera();
      source.settings.selection_hidden_atoms = [2];
      await h.sync([source]);
      const after = h.details(), afterCamera = h.engine.getCamera();
      source.settings.selection_hidden_atoms = [];
      await h.sync([source]);
      results.push({ style, before, after, restored: h.details(), camera, afterCamera });
    }
    h.dispose(); return results;
  }, { entry, projection });
  for (const state of result) {
    const bonds = (data: typeof state.before) => data.representations.flatMap((r) => r.objects)
      .filter((o) => ["cylinders", "lines"].includes(o.type)).reduce((sum, o) => sum + o.drawCount, 0);
    if (state.style !== "space-filling") expect(bonds(state.before), JSON.stringify(state.before.representations)).toBeGreaterThan(0);
    if (state.style === "line") {
      // Native Line draws crosses for unbonded atoms. Every remaining segment
      // endpoint must stay within the small cross around a visible atom, not
      // reach the hidden middle atom or a former bond midpoint.
      const visible = projection.structure.atoms.filter((atom) => atom.id !== 2);
      for (const object of state.after.representations.flatMap((r) => r.objects).filter((o) => o.type === "lines")) {
        for (const key of ["aStart", "aEnd"]) {
          const values = object.attributes[key];
          for (let i = 0; i < object.drawCount * 2; i += 3) {
            expect(Math.min(...visible.map((atom) => Math.hypot(...atom.coordinates.map((value, axis) => value - values[i + axis]))))).toBeLessThan(0.2);
          }
        }
      }
    } else expect(bonds(state.after)).toBe(0);
    expect(state.before.labels).toBe(3); expect(state.after.labels).toBe(2);
    expect(state.after.representations.flatMap((r) => r.objects).some((o) => o.drawCount > 0)).toBe(true);
    expect(state.restored.representations).toEqual(state.before.representations);
    expect(state.restored.labels).toBe(3);
    expect(state.afterCamera).toEqual(state.camera);
  }
  writeFileSync(info.outputPath("incident-bonds.json"), JSON.stringify(result, null, 2));
});

test("trace, residue and all-atom hiding preserve native polymers, surfaces and measurements", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const { entry, projection } = await fixture(request, "protein_editing.pdb");
  await page.goto("/selection-surface-test.html");
  const result = await page.evaluate(async ({ entry, projection }) => {
    const path = "/src/test/selectionSurfaceHarness.ts";
    const { mountProductionSurfaceHarness } = await import(/* @vite-ignore */ path);
    const container = document.createElement("div"); Object.assign(container.style, { position: "fixed", inset: "0" }); document.body.appendChild(container);
    const source = { entryId: entry.id, label: entry.name, projection: projection.viewer, atomIds: entry.atom_ids,
      normalized: projection.structure, hierarchy: projection.hierarchy, settings: structuredClone(entry.viewer_settings) };
    source.settings.representations = (["ball-and-stick", "cartoon", "backbone"] as const)
      .map((style) => ({ ...entry.viewer_settings.representations[0], id: style, style }));
    source.settings.labels = { atoms: true, residues: true, chains: true, structure: false };
    source.settings.selection_surface = { profile: "molecular-v1", atom_ids: entry.atom_ids };
    const h = await mountProductionSurfaceHarness(container, source);
    await h.engine.setMeasurements([{ id: "distance", name: "Distance", kind: "distance", label: "Distance", visible: true,
      atom_references: [1, 2].map((atom_id) => ({ structure_id: entry.id, atom_id })), warnings: [], created_at: "", modified_at: "" }]);
    h.engine.setSelection([{ structure_id: entry.id, atom_id: 2 }]);
    const before = h.details(), camera = h.engine.getCamera(), geometry = h.geometry(entry.id);
    const stages = [];
    const targets = {
      trace: projection.structure.atoms.filter((a) => a.name === "CA").map((a) => a.id),
      residue: projection.structure.atoms.filter((a) => a.residue_id === projection.structure.residues[0].id).map((a) => a.id),
      all: entry.atom_ids,
    };
    for (const [name, ids] of Object.entries(targets)) {
      source.settings.selection_hidden_atoms = ids;
      await h.sync([source]);
      stages.push({ name, ids, details: h.details(), camera: h.engine.getCamera(), sameSurface: h.geometry(entry.id) === geometry });
    }
    source.settings.selection_hidden_atoms = []; await h.sync([source]);
    const restored = h.details();
    // Leave only native polymer/surface pick targets, with all atom detail hidden.
    source.settings.selection_hidden_atoms = entry.atom_ids;
    source.settings.labels = { atoms: false, residues: false, chains: false, structure: false };
    await h.engine.setMeasurements([]); await h.sync([source]); h.engine.setSelection([]);
    window.productionSurface = h; window.visibilityPicks = [];
    h.engine.subscribeSelection((event) => window.visibilityPicks.push(...event.atoms));
    return { before, stages, restored, camera };
  }, { entry, projection });
  const polymer = (state: typeof result.before) => state.representations.filter((r) => r.tags.some((tag) => /-(cartoon|backbone)$/.test(tag)));
  expect(polymer(result.before)).toHaveLength(2);
  for (const repr of polymer(result.before)) expect(repr.objects.some((o) => o.drawCount > 0)).toBe(true);
  for (const stage of result.stages) {
    expect(polymer(stage.details)).toEqual(polymer(result.before));
    expect(stage.sameSurface).toBe(true);
    expect(stage.details.labels).toBe(result.before.labels - stage.ids.length);
    expect(stage.details.measurements).toBe(1);
    expect(stage.details.selection).toEqual(result.before.selection);
    expect(stage.camera).toEqual(result.camera);
    if (stage.name === "all") expect(stage.details.representations).toHaveLength(2);
  }
  expect(result.restored.representations).toEqual(result.before.representations);
  expect(result.restored.labels).toBe(result.before.labels);
  const canvas = page.locator("canvas").first(), box = (await canvas.boundingBox())!;
  for (const [x, y] of [[0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.4, 0.4], [0.6, 0.6], [0.3, 0.6], [0.7, 0.4]]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    if (await page.waitForFunction(() => window.visibilityPicks.length > 0, undefined, { timeout: 500 }).then(() => true, () => false)) break;
  }
  const picked = await page.evaluate(() => window.visibilityPicks);
  expect(picked.length).toBeGreaterThan(0);
  for (const atom of picked) { expect(atom.structure_id).toBe(entry.id); expect(entry.atom_ids).toContain(atom.atom_id); }
  await page.evaluate(() => window.productionSurface.dispose());
  writeFileSync(info.outputPath("visibility-channels.json"), JSON.stringify(result, null, 2));
});

test("compact Hide/Show preserves selection, styles and cached projections", async ({ page, request, isMobile }, info) => {
  test.setTimeout(120_000);
  const { project, entry } = await fixture(request, "ethanol.mol");
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  for (const notice of await page.getByRole("button", { name: "Dismiss message" }).all()) await notice.click();
  const browser = page.getByRole("button", { name: "Project browser", exact: true });
  if (isMobile) await browser.click();
  await page.locator(".entry-row .entry-select").click();
  if (isMobile) await page.keyboard.press("Escape");
  const launcher = page.getByRole("button", { name: "Style selection", exact: true });
  const openPalette = async () => {
    for (const notice of await page.getByRole("button", { name: "Dismiss message" }).all()) await notice.click();
    await launcher.click();
  };
  await openPalette();
  const palette = page.getByRole("dialog", { name: "Style selection" });
  await expect(palette.getByText("3 atoms", { exact: true })).toBeVisible();
  await expect(palette.getByText("Checking complete-residue compatibility")).toHaveCount(0);
  let reads = 0;
  page.on("request", (r) => { if (r.method() === "GET" && /\/entries\/[^/]+\/structure$/.test(r.url())) reads++; });
  for (const theme of ["light", "dark"]) {
    const switcher = page.getByRole("button", { name: `Use ${theme} theme` });
    if (await switcher.count()) await switcher.click();
    const tiles = palette.getByRole("group", { name: "Atom detail", exact: true }).getByRole("button");
    expect(await tiles.count()).toBe(6);
    const bounds = await tiles.evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
    expect(new Set(bounds.map((b) => b.y)).size).toBe(1);
    for (const box of bounds) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
    await palette.getByRole("button", { name: "Hide atom detail", exact: true }).click();
    await expect(palette.getByRole("button", { name: "Show atom detail", exact: true })).toBeEnabled();
    await expect(palette.getByRole("status")).toContainText("Atom detail hidden");
    await expect(palette).toBeFocused();
    const current: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
    expect(current.entries[0].viewer_settings.selection_hidden_atoms).toEqual(entry.atom_ids);
    expect(current.entries[0].current_artifact_id).toBe(entry.current_artifact_id);
    await palette.getByRole("button", { name: "Thin sticks", exact: true }).click();
    await expect(palette.getByRole("status")).toContainText("Applied Thin sticks");
    await expect(palette.getByRole("button", { name: "Hide atom detail", exact: true })).toBeEnabled();
    await palette.getByRole("button", { name: "Hide atom detail", exact: true }).click();
    await palette.getByRole("button", { name: "Show atom detail", exact: true }).click();
    await expect(palette.getByRole("button", { name: "Thin sticks", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(palette.getByText("3 atoms", { exact: true })).toBeVisible();
    const axe = await new AxeBuilder({ page }).include('.selection-palette').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${theme}-visibility.png`) });
  }
  await palette.getByRole("button", { name: "Hide atom detail", exact: true }).click();
  await expect(palette.getByRole("button", { name: "Show atom detail", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  if (isMobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByLabel("Select by").selectOption("atom_reference");
  await page.getByLabel("Value").fill(`${entry.id}:2`);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apply query", exact: true })).toBeEnabled();
  if (isMobile) {
    await page.getByRole("tab", { name: "selection", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Inspector panel" })).toBeHidden();
  }
  await openPalette();
  await expect(palette.getByText("1 atom", { exact: true })).toBeVisible();
  // Query-selected atom 2 was already hidden. Show only it, leaving 1 and 3 hidden.
  await palette.getByRole("button", { name: "Show atom detail", exact: true }).click();
  await expect(palette.getByRole("button", { name: "Hide atom detail", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  if (isMobile) await browser.click();
  await page.locator(".entry-row .entry-select").click();
  if (isMobile) await page.keyboard.press("Escape");
  await openPalette();
  const mixed = palette.getByRole("button", { name: "Hide atom detail (mixed visibility)", exact: true });
  await expect(mixed).toHaveAttribute("data-mixed", "true");
  await mixed.click();
  await palette.getByRole("button", { name: "Show atom detail", exact: true }).click();
  await expect(palette.getByRole("button", { name: "Hide atom detail", exact: true })).toBeEnabled();
  expect(reads).toBe(0);
  await palette.getByRole("button", { name: "Hide atom detail", exact: true }).click();
  await expect(palette.getByRole("button", { name: "Show atom detail", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  for (const notice of await page.getByRole("button", { name: "Dismiss message" }).all()) await notice.click();
  if (isMobile) await browser.click();
  await page.locator(".entry-row .entry-select").click();
  if (isMobile) await page.keyboard.press("Escape");
  await openPalette();
  await palette.getByRole("button", { name: "Show atom detail", exact: true }).click();
  await expect(palette.getByRole("button", { name: "Thin sticks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await palette.getByRole("button", { name: "Reset representation", exact: true }).click();
  await expect(palette.getByRole("status")).toContainText("Reset representation");
  const current: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(current.entries[0].viewer_settings.selection_hidden_atoms).toEqual([]);
  expect(current.entries[0].viewer_settings.selection_representations).toEqual([]);
  // A project reopened with every atom hidden must render normally after Show.
  await expect.poll(() => page.locator(".molstar-host canvas").first().evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return 0;
    gl.finish(); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 50) colored++;
    }
    return colored;
  })).toBeGreaterThan(30);
});
