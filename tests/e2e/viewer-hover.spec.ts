import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import type { AtomReference, SelectionGranularity, StructureProjection } from "../../apps/web/src/api/types";
import type { observeHover } from "../../apps/web/src/test/viewerHoverHarness";
import { prepare } from "./support/interactions";
import { observe } from "./support/modeling";

declare global { interface Window {
  hoverObservation: ReturnType<typeof observeHover>;
  releaseHoverRebuild?: () => void;
  hoverTransition?: Promise<void>;
} }
const refs = (entry: string, ids: number[]) => ids.sort((a, b) => a - b).map(atom_id => ({ structure_id: entry, atom_id }));
const inspect = (page: Page) => page.evaluate(() => window.hoverObservation.inspect());
const selection = (page: Page) => page.evaluate(async () => {
  const path = "/src/store/selection.ts";
  const { useSelectionStore } = await import(/* @vite-ignore */ path);
  const { selection, rangeAnchor } = useSelectionStore.getState();
  return { selection, rangeAnchor };
});
async function mode(page: Page, value: SelectionGranularity) {
  // Use the actual responsive control, never call the store directly.
  const compact = page.getByRole("combobox", { name: "Viewer picking mode", exact: true });
  if (await compact.isVisible()) await compact.selectOption(value);
  else await page.getByRole("button", { name: { atom: "Pick atoms", residue: "Pick residues", chain: "Pick chains", structure: "Pick structures" }[value], exact: true }).click();
}
async function point(page: Page, projection: StructureProjection, entryId: string, atomId: number) {
  return page.evaluate(async ({ coordinates, reference }) => {
    const path = "/src/test/selectionGestureHarness.ts";
    const { atomPickPixel, settleSelectionScene } = await import(/* @vite-ignore */ path);
    const engine = window.interactionEngines.at(-1)!;
    await settleSelectionScene(engine, reference);
    return atomPickPixel(engine, window.editingPicks.point(coordinates), reference);
  }, { coordinates: projection.structure.atoms.find(atom => atom.id === atomId)!.coordinates,
    reference: { structure_id: entryId, atom_id: atomId } });
}
async function hoverAt(page: Page, position: { x: number; y: number }, expected: AtomReference[]) {
  const canvas = page.locator(".molstar-host canvas").first();
  const box = (await canvas.boundingBox())!;
  // Native picking runs on changed in-canvas coordinates. Observe an empty
  // sample before re-entering the same atom after a toolbar/ownership change;
  // teleporting back to the identical last pixel produces no native sample.
  const samples = (await inspect(page)).hoverSamples;
  await page.mouse.move(box.x + box.width - 40, box.y + box.height - 25);
  await expect.poll(async () => (await inspect(page)).hoverSamples).toBeGreaterThan(samples);
  const emptySample = (await inspect(page)).hoverSamples;
  await page.mouse.move(box.x + position.x, box.y + position.y);
  await expect.poll(async () => (await inspect(page)).hoverSamples).toBeGreaterThan(emptySample);
  try { await expect.poll(async () => (await inspect(page)).highlighted).toEqual(expected); }
  catch (error) { console.error("Native hover observation", JSON.stringify(await inspect(page))); throw error; }
}

for (const theme of ["light", "dark"] as const) test(`native hover matches all modes and preserves selection (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120000);
  // Pixel7 emulates touch, which intentionally has no persistent hover. Pointer
  // hover is qualified in desktop Chromium; mobile selection regressions remain.
  test.skip(info.project.name !== "chromium", "Hover requires a fine pointer; touch behavior is covered by selection regressions.");
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Hover modes");
  const entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  const button = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await button.count()) await button.click();
  await observe(page);
  await page.evaluate(async () => {
    const path = "/src/test/viewerHoverHarness.ts";
    const { observeHover } = await import(/* @vite-ignore */ path);
    window.hoverObservation = observeHover(window.interactionEngines.at(-1)!);
  });
  const oxygen = projection.structure.atoms.find(atom => atom.element === "O")!;
  const carbon = projection.structure.atoms.find(atom => atom.element === "C")!;
  const canvas = page.locator(".molstar-host canvas").first();
  await mode(page, "atom");
  await canvas.click({ position: await point(page, projection, entry.id, carbon.id) });
  const initial = await selection(page);
  const persisted = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const original = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body();
  const reads: string[] = [];
  page.on("request", r => { if (/\/structure$/.test(new URL(r.url()).pathname)) reads.push(r.url()); });
  const camera = (await inspect(page)).camera;
  const observations: { mode: SelectionGranularity; automationElapsedMs: number; state: Awaited<ReturnType<typeof inspect>> }[] = [];
  for (const granularity of ["atom", "residue", "chain", "structure"] as const) {
    await mode(page, granularity);
    await expect.poll(async () => (await inspect(page)).highlighted).toEqual([]);
    const expected = granularity === "atom" ? refs(entry.id, [oxygen.id]) : refs(entry.id, projection.structure.atoms.map(a => a.id));
    const pixel = await point(page, projection, entry.id, oxygen.id);
    const start = Date.now();
    await hoverAt(page, pixel, expected);
    observations.push({ mode: granularity, automationElapsedMs: Date.now() - start, state: await inspect(page) });
    const before = await inspect(page);
    for (let i = 0; i < 4; i++) await page.mouse.move((await canvas.boundingBox())!.x + pixel.x + i % 2 * 0.2, (await canvas.boundingBox())!.y + pixel.y);
    await page.waitForTimeout(150);
    expect((await inspect(page)).markerActions).toBe(before.markerActions);
    if (granularity === "chain" || granularity === "structure") {
      const otherPixel = await point(page, projection, entry.id, carbon.id);
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.move(bounds.x + otherPixel.x, bounds.y + otherPixel.y);
      await expect.poll(async () => (await inspect(page)).lastHover?.atoms).toEqual(refs(entry.id, [carbon.id]));
      expect((await inspect(page)).resolutions).toBe(before.resolutions);
      expect((await inspect(page)).markerActions).toBe(before.markerActions);
    }
    expect((await inspect(page)).selected).toEqual(refs(entry.id, [carbon.id]));
    // Changing picking mode intentionally clears the anchor, but never selection.
    expect((await selection(page)).selection).toEqual(initial.selection);
    expect((await inspect(page)).camera).toEqual(camera);
    if (granularity === "atom") await page.screenshot({ path: info.outputPath(`viewer-hover-${theme}-atom.png`) });
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await inspect(page)).highlighted).toEqual([]);
    expect((await inspect(page)).selected).toEqual(refs(entry.id, [carbon.id]));
  }
  expect(reads).toEqual([]);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(persisted);
  expect(await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body()).toEqual(original);
  const observationPath = info.outputPath("hover-observations.json");
  writeFileSync(observationPath, JSON.stringify({ theme, timing: "Automation/poll-inclusive elapsed time; not native UI latency or a hardware throughput claim", observations }, null, 2));
  await info.attach("hover-observations", { path: observationPath, contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`viewer-hover-${theme}.png`) });
});

function complexFixture(): Buffer {
  const lines: string[] = [];
  let serial = 0;
  const atom = (record: string, name: string, residue: string, chain: string, number: number, x: number, y: number, element: string) =>
    lines.push(`${record.padEnd(6)}${String(++serial).padStart(5)} ${name.padStart(4)} ${residue} ${chain}${String(number).padStart(4)}    ${x.toFixed(3).padStart(8)}${y.toFixed(3).padStart(8)}${"0.000".padStart(8)}  1.00 20.00          ${element.padStart(2)}`);
  // Selection/visibility fixture only; no claim of prepared molecular geometry.
  for (const [index, x] of [-8, 8].entries()) {
    atom("ATOM", "N", "ALA", "A", 10 + index, x - 1.5, 3, "N");
    atom("ATOM", "CA", "ALA", "A", 10 + index, x, 3, "C");
    atom("ATOM", "C", "ALA", "A", 10 + index, x + 1.5, 3, "C");
    atom("ATOM", "CB", "ALA", "A", 10 + index, x, 1.5, "C");
    atom("ATOM", "H", "ALA", "A", 10 + index, x - 1.5, 4, "H");
  }
  lines.push("TER");
  for (const [index, x] of [-8, 8].entries()) {
    atom("HETATM", "C1", "LIG", "L", 201 + index, x, -6, "C");
    atom("HETATM", "O1", "LIG", "L", 201 + index, x + 1.5, -6, "O");
  }
  return Buffer.from([...lines, "END", ""].join("\n"));
}

test("protein/individual complex hover preserves hidden membership, anchors and lifecycle ownership", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Fine-pointer native hover qualification.");
  test.setTimeout(120000);
  let project = await prepare(page, request, [{ name: "hover-complex.pdb", mimeType: "chemical/x-pdb", buffer: complexFixture() }], "Complex hover");
  const entry = project.entries[0];
  const configured = await request.put(`/api/v1/projects/${project.id}/entries/${entry.id}/viewer-settings`, { data: {
    expected_revision: project.revision, settings: { ...entry.viewer_settings,
      components: { ...entry.viewer_settings.components, hydrogens: false },
      representations: [{ id: "hover", style: "ball-and-stick", color_by: "element", custom_color: "#3b82f6", opacity: 1 }] },
  } });
  expect(configured.ok()).toBe(true); project = await configured.json();
  const persisted = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  await page.reload(); await observe(page);
  await page.evaluate(async () => {
    const path = "/src/test/viewerHoverHarness.ts";
    const { observeHover } = await import(/* @vite-ignore */ path);
    window.hoverObservation = observeHover(window.interactionEngines.at(-1)!);
  });
  const canvas = page.locator(".molstar-host canvas").first();
  await mode(page, "atom");
  await hoverAt(page, await point(page, projection, entry.id, 4), refs(entry.id, [4]));
  await page.mouse.move(0, 0);
  await mode(page, "residue");
  await canvas.click({ position: await point(page, projection, entry.id, 4) });
  const state = await selection(page); expect(state.rangeAnchor).not.toBeNull();
  const events = await page.evaluate(() => window.editingPicks.events.length);
  const camera = (await inspect(page)).camera;
  const pixel = await point(page, projection, entry.id, 9);
  for (const modifier of [null, "Shift", "Control", "Alt", "Meta"] as const) {
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.move(0, 0);
    await hoverAt(page, pixel, refs(entry.id, [6, 7, 8, 9]));
    expect(await selection(page)).toEqual(state);
    if (modifier) await page.keyboard.up(modifier);
  }
  for (const [atomId, expected] of [[11, [11, 12]], [13, [13, 14]]] as const) {
    await hoverAt(page, await point(page, projection, entry.id, atomId), refs(entry.id, [...expected]));
    expect(await selection(page)).toEqual(state);
  }
  expect((await inspect(page)).camera).toEqual(camera);
  expect(await page.evaluate(() => window.editingPicks.events.length)).toBe(events);
  // Exercise real viewer lifecycle boundaries while keeping canonical state exact.
  for (const transition of ["movement", "rebuild", "coordinates"] as const) {
    const retainedPixel = await point(page, projection, entry.id, 11);
    await hoverAt(page, retainedPixel, refs(entry.id, [11, 12]));
    const cleared = await page.evaluate(({ transition, entryId, atom }) => {
      const engine = window.interactionEngines.at(-1)!;
      const native = engine as unknown as { structures: Parameters<typeof engine.replaceStructure>[0][];
        syncQueue: Promise<void>; hoverTarget: unknown };
      if (transition === "movement") engine.setMovementMode("transform");
      if (transition === "rebuild") {
        const barrier = new Promise<void>(resolve => { window.releaseHoverRebuild = resolve; });
        native.syncQueue = native.syncQueue.then(() => barrier);
        window.hoverTransition = engine.replaceStructure(native.structures[0]);
      }
      if (transition === "coordinates") window.hoverTransition = engine.applyCoordinatePatch({ entry_id: entryId,
        artifact_id: "hover-test-preview", atom_ids: [atom.id], coordinates: [atom.coordinates] }, "preview");
      return native.hoverTarget === null;
    }, { transition, entryId: entry.id, atom: projection.structure.atoms[0] });
    expect(cleared, `${transition} clears the owned preview immediately`).toBe(true);
    if (transition !== "coordinates") {
      await hoverAt(page, retainedPixel, []);
      expect((await inspect(page)).lastHover?.atoms).toEqual(refs(entry.id, [11]));
    }
    await page.mouse.move(0, 0);
    await page.evaluate(async () => {
      window.releaseHoverRebuild?.(); window.releaseHoverRebuild = undefined;
      await window.hoverTransition; window.hoverTransition = undefined;
    });
    try { await expect.poll(async () => (await inspect(page)).highlighted).toEqual([]); }
    catch (error) { console.error("Lifecycle hover observation", transition, JSON.stringify(await inspect(page))); throw error; }
    expect(await selection(page)).toEqual(state);
    await page.evaluate(async ({ transition, entryId }) => {
      const engine = window.interactionEngines.at(-1)!;
      if (transition === "movement") engine.setMovementMode("inactive");
      if (transition === "coordinates") await engine.clearCoordinatePreview(entryId);
    }, { transition, entryId: entry.id });
    await page.mouse.move(0, 0);
  }
  for (const granularity of ["chain", "structure"] as const) {
    await mode(page, granularity);
    const visible = granularity === "chain" ? [1, 2, 3, 4, 6, 7, 8, 9] : [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14];
    await hoverAt(page, await point(page, projection, entry.id, 4), refs(entry.id, visible));
    await page.mouse.move(0, 0);
  }
  const engines = await page.evaluate(() => {
    window.hoverObservation.dispose();
    return window.interactionEngines.length;
  });
  await page.setViewportSize({ width: 412, height: 915 });
  await expect.poll(() => page.evaluate(() => window.interactionEngines.length)).toBeGreaterThan(engines);
  expect(await page.evaluate(index => {
    const old = window.interactionEngines[index - 1] as unknown as {
      plugin?: unknown; hoverSubscription?: unknown; stopHoverMarking?: unknown; hoverTarget: unknown };
    return !old.plugin && !old.hoverSubscription && !old.stopHoverMarking && old.hoverTarget === null;
  }, engines)).toBe(true);
  await observe(page);
  await page.evaluate(async () => {
    const path = "/src/test/viewerHoverHarness.ts";
    const { observeHover } = await import(/* @vite-ignore */ path);
    window.hoverObservation = observeHover(window.interactionEngines.at(-1)!);
  });
  await mode(page, "residue");
  await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
  await hoverAt(page, await point(page, projection, entry.id, 11), refs(entry.id, [11, 12]));
  expect((await inspect(page)).markerActions).toBe(1);
  expect((await selection(page)).selection).toEqual(state.selection);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await inspect(page)).highlighted).toEqual([]);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(persisted);
  await page.screenshot({ path: info.outputPath("viewer-hover-complex.png") });
});
