import { addOneHydrogen } from "./support/hydrogen";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import type { observeEditPicks } from "../../apps/web/src/test/molecularEditHarness";
import AxeBuilder from "@axe-core/playwright";

declare global { interface Window { editingPicks: Awaited<ReturnType<typeof observeEditPicks>> } }

test.beforeEach(({ page }) => page.setDefaultTimeout(10000));

async function selectAtom(page: Page, entryId: string, atomId: number, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entryId}:${atomId}`);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
}

test("performs one selection-driven atom/H edit with exact undo and unchanged original", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Molecular edit");
  const entry = initial.entries[0];
  const path = `/api/v1/projects/${initial.id}`;
  const projection = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const original = await (await request.get(`${path}/entries/${entry.id}/original`)).body();
  await selectAtom(page, entry.id, 1, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await addOneHydrogen(page);
  await expect.poll(async () => (await projection()).structure.atoms.length).toBe(4);
  const prepared = (await projection()).structure;
  await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  const h = prepared.atoms.find(atom => atom.element === "H" && prepared.bonds.some(bond =>
    (bond.atom_1_id === 1 && bond.atom_2_id === atom.id) || (bond.atom_2_id === 1 && bond.atom_1_id === atom.id)))!;
  await selectAtom(page, entry.id, h.id, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Replace selected atom with C", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.atoms.filter(atom => atom.element === "C").length).toBe(3);
  await expect(panel).toBeVisible();
  const after = (await projection()).structure;
  for (const atom of prepared.atoms.filter(atom => atom.id !== h.id)) expect(after.atoms.find(candidate => candidate.id === atom.id)).toEqual(atom);
  const state: Project = await (await request.get(path)).json();
  expect(state.revision).toBe(initial.revision + 2);
  await page.screenshot({ path: info.outputPath("c1-open-atom-editor.png") });
  await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await projection()).structure).toEqual(prepared);
  expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(original);
  await page.screenshot({ path: info.outputPath("c1-atom-edit.png") });
});

test("maps a native bond hit to canonical endpoints and changes its order from the panel", async ({ page, request }) => {
  test.setTimeout(90000);
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Bond edit");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection: StructureProjection = await (await request.get(`${path}/entries/${entry.id}/structure`)).json();
  const midpoint = [0, 1, 2].map(axis => (projection.structure.atoms[0].coordinates[axis] + projection.structure.atoms[1].coordinates[axis]) / 2) as [number, number, number];
  const beforeCamera = await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
    return window.editingPicks.camera();
  });
  const point = await page.evaluate(point => window.editingPicks.point(point), midpoint);
  const canvas = page.locator(".molstar-host canvas").first();
  await canvas.click({ position: point });
  await expect.poll(() => page.evaluate(() => window.editingPicks.events.some(e => e.kind === "bond-loci"))).toBe(true);
  await expect(page.locator(".viewer-status")).toContainText("/ 2 selected");
  expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(beforeCamera);
  const picks = await page.evaluate(() => window.editingPicks.events.flatMap(e => e.selection?.atoms ?? []));
  expect(picks.map(ref => ref.atom_id).sort()).toEqual([1, 2]);
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Bonds", exact: true }).click();
  await panel.getByRole("button", { name: "Increase bond order", exact: true }).click();
  await expect.poll(async () => {
    const result: StructureProjection = await (await request.get(`${path}/entries/${entry.id}/structure`)).json();
    return result.structure.bonds.find(b => b.id === 1)?.order;
  }).toBe(2);
  await expect(panel).toBeVisible();
});

test("previews and substitutes a selected H with illustrated COOH", async ({ page, request }, info) => {
  test.setTimeout(90000);
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Fragment edit");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  await selectAtom(page, entry.id, 1, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await addOneHydrogen(page);
  await expect.poll(async () => (await projection()).structure.atoms.length).toBe(4);
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  const before = (await projection()).structure;
  const h = before.atoms.find(a => a.element === "H" && before.bonds.some(b => [b.atom_1_id, b.atom_2_id].includes(a.id) && [b.atom_1_id, b.atom_2_id].includes(1)))!;
  await selectAtom(page, entry.id, h.id, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Fragments", exact: true }).click();
  await expect(panel.locator(".edit-fragment-grid svg")).toHaveCount(6);
  await panel.getByRole("button", { name: "Replace H with Carboxylic acid", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.atoms.filter(a => a.element !== "H").length).toBe(6);
  const after = (await projection()).structure;
  expect(after.atoms.filter(a => a.element === "H")).toHaveLength(3);
  for (const atom of before.atoms.filter(a => a.id !== h.id)) expect(after.atoms.find(a => a.id === atom.id)).toEqual(atom);
  await page.screenshot({ path: info.outputPath("c2-fragment-editor.png") });
});

test("mutates a natively picked residue successively and preserves exact backbone and undo", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, ["tests/fixtures/formats/protein_editing.pdb"], "Residue edit");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const original = (await projection()).structure;
  const anchor = original.atoms.find(a => a.name === "CA")!;
  if (info.project.name === "mobile-chromium") await page.getByRole("combobox", { name: "Viewer picking mode" }).selectOption("residue");
  else await page.getByRole("button", { name: "Pick residues", exact: true }).click();
  await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
  });
  const point = await page.evaluate(point => window.editingPicks.point(point), anchor.coordinates);
  await page.locator(".molstar-host canvas").first().click({ position: point });
  const target = original.atoms.filter(a => a.residue_id === anchor.residue_id);
  await expect(page.locator(".viewer-status")).toContainText(`/ ${target.length} selected`);
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Residues", exact: true }).click();
  await expect(panel.getByRole("button", { name: /^Mutate residue to / })).toHaveCount(20);
  await expect(panel.getByRole("button", { name: /Grow/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Mutate residue to VAL", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.residues.find(r => r.id === anchor.residue_id)?.name).toBe("VAL");
  const valine = (await projection()).structure;
  await expect(page.locator(".viewer-status")).toContainText(`/ ${valine.atoms.filter(a => a.residue_id === anchor.residue_id).length} selected`);
  await expect(panel.getByRole("button", { name: "Mutate residue to VAL", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Mutate residue to LEU", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.residues.find(r => r.id === anchor.residue_id)?.name).toBe("LEU");
  const leucine = (await projection()).structure;
  for (const atom of target.filter(a => ["N", "CA", "C", "O"].includes(a.name))) expect(leucine.atoms.find(a => a.id === atom.id)).toEqual(atom);
  for (const atom of original.atoms.filter(a => a.residue_id !== anchor.residue_id)) expect(leucine.atoms.find(a => a.id === atom.id)).toEqual(atom);
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await projection()).structure).toEqual(valine);
  await page.screenshot({ path: info.outputPath("c3-residue-editor.png") });
});

test("keeps tool focus, notices and all controls accessible in both themes and narrow layouts", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Accessible edit");
  await selectAtom(page, project.entries[0].id, 1, info.project.name === "mobile-chromium");
  const launcher = page.getByRole("button", { name: "Edit molecule", exact: true });
  if (info.project.name === "mobile-chromium") {
    const box = (await launcher.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await launcher.focus(); await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await expect(panel).toBeFocused();
  for (const dark of [false, true]) {
    const theme = await page.locator("html").getAttribute("data-theme");
    if ((theme === "dark") !== dark) await page.getByRole("button", { name: /Use (dark|light) theme/ }).click();
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
    await panel.getByRole("button", { name: "Atoms", exact: true }).click();
    if (!dark) await addOneHydrogen(page);
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      if (!box) return false;
      const viewport = page.viewportSize()!;
      return box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
    }).toBe(true);
    const close = panel.getByRole("button", { name: "Close molecular editor" });
    await expect.poll(() => close.evaluate(node => {
      const b = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
    })).toBe(true);
    expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await panel.getByRole("button", { name: "Bonds", exact: true }).focus();
  await page.keyboard.press("Escape"); await expect(launcher).toBeFocused();
  await launcher.click();
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await expect(panel).toBeHidden();
  await launcher.focus(); await page.keyboard.press("Enter");
  await expect(panel).toBeFocused();
  await page.screenshot({ path: info.outputPath("c3-accessible-editor.png") });
});

test("edits a prepared complex with native H/new-atom picks, fixed camera and one affected reload", async ({ page, request }, info) => {
  test.setTimeout(150000);
  const imported = await request.post("/api/v1/projects/import-archive", { multipart: {
    operation_id: `complex-browser-${Date.now()}`,
    file: { name: "prepared.molweave.zip", mimeType: "application/vnd.molweave.project+zip", buffer: await readFile("tests/fixtures/editing/prepared-complex.molweave.zip") },
  } });
  expect(imported.status()).toBe(201);
  const archived = (await imported.json()).project as Project;
  const renamed = await request.patch(`/api/v1/projects/${archived.id}`, { data: { expected_revision: archived.revision, name: `Native complex ${info.project.name} ${Date.now()}` } });
  expect(renamed.status()).toBe(200);
  const named = await renamed.json() as Project;
  // Cartoon-only protein defaults do not render atomic H detail. Use the
  // ordinary persisted representation API before qualifying native atom picks.
  const styled = await request.put(`/api/v1/projects/${named.id}/entries/${named.entries[0].id}/viewer-settings`, { data: {
    expected_revision: named.revision, settings: { ...named.entries[0].viewer_settings,
      representations: named.entries[0].viewer_settings.representations.map(r => ({ ...r, style: "ball-and-stick" })),
    },
  } });
  expect(styled.status()).toBe(200);
  const project = await styled.json() as Project;
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst editMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await editMount.call(this,target); (window.interactionEngines ??= []).push(this); };` });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const projection = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const source = (await projection()).structure;
  const target = source.atoms.find(a => a.element === "C" && a.formal_charge === 0 && a.coordinates[0] > 15)!;
  await selectAtom(page, entry.id, target.id, info.project.name === "mobile-chromium");
  const launcher = page.getByRole("button", { name: "Edit molecule", exact: true });
  await launcher.click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  // This historical archive intentionally lacks recoverable isotope/radical facts.
  // Keep its native-picking regression without pretending +H admits that identity:
  // prepare the fixture explicitly through the retained additive HTTP operation.
  const preparedResponse = await request.post(`${path}/entries/${entry.id}/model-edits`, { data: {
    expected_revision: project.revision, expected_artifact_id: entry.current_artifact_id,
    selection: { schema_version: 1, atoms: [{ structure_id: entry.id, atom_id: target.id }], granularity: "atom", source: "inspector" },
    action: { operation: "hydrogens.complete", scope: "entry" },
  } });
  expect(preparedResponse.ok()).toBe(true);
  expect((await preparedResponse.json()).hydrogen_report.added_hydrogen_count).toBe(6);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await selectAtom(page, entry.id, target.id, info.project.name === "mobile-chromium");
  await launcher.click();
  await expect.poll(async () => (await projection()).structure.atoms.length).toBe(source.atoms.length + 6);
  await expect(panel.getByRole("button", { name: "Show explicit H" })).toBeEnabled();
  await panel.getByRole("button", { name: "Show explicit H" }).click();
  await expect.poll(async () => (await (await request.get(path)).json()).entries[0].viewer_settings.components.nonpolar_hydrogens).toBe(true);
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  const prepared = (await projection()).structure;
  await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
  });
  // Fit the ligand through normal focus selection so its H are separately pickable.
  await selectAtom(page, entry.id, target.id, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Focus selection", exact: true }).click();
  await page.evaluate(() => window.editingPicks.settled());
  const camera = await page.evaluate(() => window.editingPicks.camera());
  let hydrogen = 0;
  const attempts: unknown[] = [];
  for (const atom of prepared.atoms.filter(a => a.element === "H")) {
    const point = await page.evaluate(p => window.editingPicks.point(p), atom.coordinates);
    const beforeEvents = await page.evaluate(() => window.editingPicks.events.length);
    await page.locator(".molstar-host canvas").first().click({ position: point });
    await expect.poll(() => page.evaluate(() => window.editingPicks.events.length)).toBeGreaterThan(beforeEvents);
    const picks = await page.evaluate(() => window.editingPicks.events.filter(event => event.selection).at(-1)?.selection?.atoms ?? []);
    attempts.push({ target: atom.id, point, picks });
    if (picks.length === 1 && picks[0].atom_id === atom.id) { hydrogen = atom.id; break; }
  }
  expect(hydrogen, JSON.stringify(attempts)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(camera);
  const reads: string[] = [];
  page.on("request", req => { if (req.url().endsWith("/structure")) reads.push(req.url()); });
  await launcher.focus(); await page.keyboard.press("Enter");
  for (const section of ["Bonds", "Fragments", "Atoms"]) await panel.getByRole("button", { name: section, exact: true }).click();
  // Cross a responsive layout boundary with owned keyboard focus and open state.
  await panel.getByRole("button", { name: "Atoms", exact: true }).focus();
  await page.setViewportSize(info.project.name === "chromium" ? { width: 700, height: 800 } : { width: 1100, height: 800 });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
  expect(reads).toEqual([]);
  await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
    await window.editingPicks.settled();
  });
  expect(await page.evaluate(() => window.editingPicks.camera()), "camera after responsive remount").toEqual(camera);
  await panel.getByRole("button", { name: "Replace selected atom with C", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.atoms.filter(a => a.element === "C").length).toBe(source.atoms.filter(a => a.element === "C").length + 1);
  await expect.poll(() => reads.length).toBe(1);
  const after = (await projection()).structure;
  for (const atom of prepared.atoms.filter(a => a.id !== hydrogen)) expect(after.atoms.find(a => a.id === atom.id)).toEqual(atom);
  const newCarbon = after.atoms.find(a => a.id === hydrogen)!;
  expect(newCarbon.element).toBe("C");
  expect(newCarbon.coordinates).toEqual(prepared.atoms.find(a => a.id === hydrogen)!.coordinates);
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  await expect.poll(() => page.evaluate(id => window.interactionEngines.at(-1)!.getRenderedAtomReferences().some(a => a.atom_id === id), newCarbon.id)).toBe(true);
  await page.evaluate(() => window.editingPicks.settled());
  const point = await page.evaluate(p => window.editingPicks.point(p), newCarbon.coordinates);
  await page.locator(".molstar-host canvas").first().click({ position: point });
  await expect.poll(() => page.evaluate(() => window.editingPicks.events.filter(event => event.selection).at(-1)?.selection?.atoms.map(a => a.atom_id))).toEqual([newCarbon.id]);
  expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(camera);
});

test("keeps late edit responses owned by their original project", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const other = await (await request.post("/api/v1/projects", { data: { name: `Other edit owner ${Date.now()}` } })).json() as Project;
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Pending edit");
  await selectAtom(page, project.entries[0].id, 1, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  let release!: () => void;
  let received!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const committed = new Promise<void>(resolve => { received = resolve; });
  await page.route("**/model-edits", async route => {
    const response = await route.fetch(); received(); await held;
    await route.fulfill({ response });
  });
  await addOneHydrogen(page);
  await committed;
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${other.name}`) }).click();
  await expect(page.getByRole("dialog", { name: "Edit molecule", exact: true })).toBeHidden();
  release();
  await expect.poll(async () => (await (await request.get(`/api/v1/projects/${project.id}`)).json()).entries[0].atom_count).toBe(4);
  await expect(page.getByRole("heading", { name: other.name, exact: true })).toBeVisible();
  await expect(page.getByText(/Molecular edit stored/)).toBeHidden();
  expect((await (await request.get(`/api/v1/projects/${other.id}`)).json()).revision).toBe(other.revision);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await expect(page.locator(".viewer-status")).toContainText("/ 0 selected");
});

test("retains a newer native selection and recovers an affected-artifact refetch failure", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Edit selection owner");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const source = (await (await request.get(`${path}/entries/${entry.id}/structure`)).json() as StructureProjection).structure;
  await selectAtom(page, entry.id, 1, info.project.name === "mobile-chromium");
  await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
  });
  const oxygenPoint = await page.evaluate(p => window.editingPicks.point(p), source.atoms.find(a => a.element === "O")!.coordinates);
  const launcher = page.getByRole("button", { name: "Edit molecule", exact: true });
  await launcher.click();
  let release!: () => void;
  let received!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const committed = new Promise<void>(resolve => { received = resolve; });
  let failReads = true;
  await page.route(`**/entries/${entry.id}/structure`, route => failReads ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Qualification read failure" }) }) : route.continue());
  await page.route("**/model-edits", async route => {
    const response = await route.fetch(); received(); await held; await route.fulfill({ response });
  });
  await addOneHydrogen(page);
  await committed;
  // Close only the nonmodal panel, then use an actual atom pick while pending.
  await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  await page.locator(".molstar-host canvas").first().click({ position: oxygenPoint });
  await expect.poll(() => page.evaluate(() => window.editingPicks.events.filter(e => e.selection).at(-1)?.selection?.atoms.map(a => a.atom_id))).toEqual([3]);
  release();
  await expect(page.getByText(/Molecular edit stored/)).toBeVisible();
  await launcher.click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await expect(panel.getByText("The selected molecule could not be loaded.", { exact: true })).toBeVisible();
  failReads = false;
  await panel.getByRole("button", { name: "Retry molecule", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Replace selected atom with N", exact: true })).toBeEnabled();
  await expect(panel.getByRole("button", { name: "Replace selected atom with O", exact: true })).toBeDisabled();
  const persisted = await (await request.get(path)).json() as Project;
  expect(persisted.revision).toBe(project.revision + 1);
});

test("keeps a newer pending edit owned after leaving and returning to the same project", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const other = await (await request.post("/api/v1/projects", { data: { name: `Roundtrip owner ${Date.now()}` } })).json() as Project;
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Edit visit ownership");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  let releaseFirst!: () => void; let releaseSecond!: () => void;
  let receivedFirst!: () => void; let receivedSecond!: () => void;
  const heldFirst = new Promise<void>(resolve => { releaseFirst = resolve; });
  const heldSecond = new Promise<void>(resolve => { releaseSecond = resolve; });
  const committedFirst = new Promise<void>(resolve => { receivedFirst = resolve; });
  const committedSecond = new Promise<void>(resolve => { receivedSecond = resolve; });
  let requests = 0;
  await page.route(/\/(selection-edits|model-edits)$/, async route => {
    const ordinal = ++requests;
    const response = await route.fetch();
    if (ordinal === 1) { receivedFirst(); await heldFirst; }
    else { receivedSecond(); await heldSecond; }
    await route.fulfill({ response });
  });
  const switchProject = async (name: string) => {
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  };
  await selectAtom(page, entry.id, 1, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await addOneHydrogen(page);
  await committedFirst;
  await switchProject(other.name);
  await expect(page.getByRole("heading", { name: other.name, exact: true })).toBeVisible();
  // Let the existing 10-second project-query freshness interval expire while
  // away so the second valid command captures the committed first revision.
  await page.waitForTimeout(10_100);
  await switchProject(project.name);
  await expect(page.getByRole("button", { name: /^Undo: Add one hydrogen/ })).toBeVisible();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await selectAtom(page, entry.id, 3, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Replace selected atom with N", exact: true }).click();
  await committedSecond;
  try {
    const refreshedList = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/projects" && response.request().method() === "GET");
    releaseFirst(); await refreshedList;
    await expect(panel.getByRole("button", { name: "Replace selected atom with C", exact: true })).toBeDisabled();
    await expect(panel.getByText("Finish the current operation.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Molecular edit stored/)).toBeHidden();
    expect(requests).toBe(2);
  } finally { releaseFirst(); releaseSecond(); }
  await expect(panel.getByRole("button", { name: "Replace selected atom with O", exact: true })).toBeEnabled();
  const result = await (await request.get(path)).json() as Project;
  expect(result.revision).toBe(project.revision + 2);
});
