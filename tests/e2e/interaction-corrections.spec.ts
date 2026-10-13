import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { InteractionRecord, InteractionKind } from "../../apps/web/src/interactions/types";
import { INTERACTION_COLORS } from "../../apps/web/src/viewer/interactionGeometry";
import { native, prepare } from "./support/interactions";

const kinds: InteractionKind[] = ["hydrogen_bond", "hydrophobic", "pi_pi", "cation_pi", "salt_bridge", "clash"];
const labels = ["H bonds", "Hydrophobic", "π–π", "Cation–π", "Salt bridges", "Clashes"];

async function pixels(page: Page, baseline = false, kind: InteractionKind = "hydrogen_bond"): Promise<number> {
  const hex = INTERACTION_COLORS[kind];
  const color = [hex >> 16, hex >> 8 & 255, hex & 255];
  return page.locator(".molstar-host canvas").first().evaluate((canvas: HTMLCanvasElement, save) => {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) throw new Error("Native WebGL required");
    gl.finish();
    const rgba = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const host = window as unknown as { correctionPixels?: Uint8Array; correctionRegions?: number[][] };
    if (save.baseline) { host.correctionPixels = rgba; return 0; }
    const old = host.correctionPixels;
    if (!old || old.length !== rgba.length) throw new Error("Stable canvas baseline required");
    const hue = (rgb: number[]) => {
      const [r, g, b] = rgb, high = Math.max(...rgb), low = Math.min(...rgb), span = high - low;
      if (span < 20 || span / Math.max(1, high) < 0.15) return null;
      const sector = high === r ? (g - b) / span : high === g ? 2 + (b - r) / span : 4 + (r - g) / span;
      return (sector * 60 + 360) % 360;
    };
    const wanted = hue(save.color)!;
    const matches = (rgb: number[]) => {
      const value = hue(rgb);
      return value !== null && Math.min(Math.abs(value - wanted), 360 - Math.abs(value - wanted)) < 8;
    };
    let changed = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const x = i / 4 % canvas.width, y = Math.floor(i / 4 / canvas.width);
      if (!host.correctionRegions?.some(([left, bottom, right, top]) =>
        x >= left && x <= right && y >= bottom && y <= top)) continue;
      const currentMatch = matches(Array.from(rgba.slice(i, i + 3)));
      const baselineMatch = matches(Array.from(old.slice(i, i + 3)));
      if (currentMatch && !baselineMatch) changed++;
    }
    return changed;
  }, { baseline, color });
}

async function attached(page: Page, expected: InteractionRecord[]) {
  await expect.poll(async () => (await native(page)).records).toEqual(expected);
  if (!expected.length) return;
  const current = await native(page);
  const object = current.objects[0];
  expect(object.pickable).toBe(false);
  expect(object.drawCount).toBeGreaterThan(0);
  expect(object.drawCount).toBeLessThanOrEqual(object.indexCapacity);
  expect([...new Set(object.groups)]).toEqual(expected.map((_, i) => i));
  for (let group = 0; group < expected.length; group++) {
    const record = expected[group];
    const hex = INTERACTION_COLORS[record.kind];
    expect(object.colors.slice(group * 3, group * 3 + 3)).toEqual([hex >> 16, hex >> 8 & 255, hex & 255]);
    const vertex = object.groups.indexOf(group);
    expect(object.starts.slice(vertex * 3, vertex * 3 + 3)).toEqual(record.endpoints[0].map(Math.fround));
  }
  // Every attached segment belongs to its actual classified endpoints, including
  // after ordering/capacity changes. Checking submitted records alone misses this.
  const invalidSegments: string[] = [];
  for (let vertex = 0; vertex < object.groups.length; vertex += 4) {
    const record = expected[object.groups[vertex]], [a, b] = record.endpoints;
    const direction = b.map((value, axis) => value - a[axis]);
    const length2 = direction.reduce((sum, value) => sum + value * value, 0);
    for (const buffer of [object.starts, object.ends]) {
      const point = buffer.slice(vertex * 3, vertex * 3 + 3);
      const fraction = point.reduce((sum, value, axis) => sum + (value - a[axis]) * direction[axis], 0) / length2;
      if (!Number.isFinite(fraction) || fraction < -1e-5 || fraction > 1 + 1e-5 ||
        point.some((value, axis) => Math.abs(value - a[axis] - fraction * direction[axis]) >= 0.00005)) {
        invalidSegments.push(`${record.kind}:${vertex}`);
      }
    }
  }
  expect(invalidSegments).toEqual([]);
}

async function markerPixels(page: Page, kind: InteractionKind) {
  const current = await native(page);
  const projected = current.projectedEndpoints.filter((_, index) => current.records[index].kind === kind);
  await page.evaluate(regions => { Object.assign(window, { correctionRegions: regions }); },
    projected.map(points => [Math.min(...points.map(p => p[0])) - 4, Math.min(...points.map(p => p[1])) - 4,
      Math.max(...points.map(p => p[0])) + 4, Math.max(...points.map(p => p[1])) + 4]));
  return pixels(page, false, kind);
}

test("renders genuine six-type records alone, pairwise and together with independent scopes", async ({ page, request }, info) => {
  test.setTimeout(240_000);
  const project = await prepare(page, request, ["tests/fixtures/interactions/six_types.mol"], "Six-type native corrections");
  let analyses = 0, structureGets = 0;
  let records: InteractionRecord[] = [];
  page.on("request", outgoing => {
    if (outgoing.url().endsWith("/interactions")) analyses++;
    if (/\/entries\/[^/]+\/structure$/.test(outgoing.url())) structureGets++;
  });
  const response = page.waitForResponse(reply => reply.url().endsWith("/interactions") && reply.status() === 200);
  await page.getByRole("button", { name: "Interactions", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Interactions", exact: true });
  // Wait for initial scene/shader setup before taking a no-marker baseline.
  // An oblique camera also makes ring-centroid Z segments visible, rather than
  // testing a line viewed exactly along its own axis.
  await panel.getByRole("button", { name: "H bonds", exact: true }).click();
  records = (await (await response).json()).records;
  await attached(page, records.filter(record => record.kind === "hydrogen_bond" && record.scope === "inter"));
  await panel.getByRole("button", { name: "H bonds", exact: true }).click();
  await attached(page, []);
  await page.evaluate(async () => {
    const engine = window.interactionEngines.at(-1)!;
    const camera = engine.getCamera()!;
    const distance = Math.hypot(...camera.position.map((value, axis) => value - camera.target[axis]));
    engine.setCamera({ ...camera, position: [camera.target[0] + distance * 0.3, camera.target[1] + distance * 0.2, camera.target[2] + distance * Math.sqrt(0.87)], up: [0, 1, 0] });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await pixels(page, true);
  const observed: { label: string; changedPixels: number; records: number }[] = [];
  for (const theme of ["light", "dark"]) {
    const currentTheme = await page.locator("html").getAttribute("data-theme");
    if (currentTheme !== theme) await page.getByRole("button", { name: `Use ${theme} theme` }).click();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await pixels(page, true);
  for (let index = 0; index < kinds.length; index++) {
    await panel.getByRole("button", { name: labels[index], exact: true }).click();
    if (!records.length) records = (await (await response).json()).records;
    const expected = records.filter(record => record.kind === kinds[index] && record.scope === "inter");
    expect(expected.length).toBeGreaterThan(0);
    await attached(page, expected);
    const projected = (await native(page)).projectedEndpoints;
    await page.evaluate(regions => { Object.assign(window, { correctionRegions: regions }); },
      projected.map(points => [Math.min(...points.map(p => p[0])) - 4, Math.min(...points.map(p => p[1])) - 4,
        Math.max(...points.map(p => p[0])) + 4, Math.max(...points.map(p => p[1])) + 4]));
    await expect.poll(() => pixels(page, false, kinds[index])).toBeGreaterThan(3);
    observed.push({ label: `${theme}: ${labels[index]}`, changedPixels: await pixels(page, false, kinds[index]), records: expected.length });
    await page.screenshot({ path: info.outputPath(`native-${theme}-${kinds[index]}.png`) });
    await panel.getByRole("button", { name: labels[index], exact: true }).click();
    await attached(page, []);
    await expect.poll(() => pixels(page, false, kinds[index])).toBeLessThanOrEqual(3);
  }
  }
  for (let first = 0; first < kinds.length; first++) for (let second = first + 1; second < kinds.length; second++) {
    await panel.getByRole("button", { name: labels[first], exact: true }).click();
    await panel.getByRole("button", { name: labels[second], exact: true }).click();
    await attached(page, records.filter(record => [kinds[first], kinds[second]].includes(record.kind) && record.scope === "inter"));
    await expect.poll(() => markerPixels(page, kinds[first])).toBeGreaterThan(3);
    await expect.poll(() => markerPixels(page, kinds[second])).toBeGreaterThan(3);
    await panel.getByRole("button", { name: labels[first], exact: true }).click();
    await attached(page, records.filter(record => record.kind === kinds[second] && record.scope === "inter"));
    await panel.getByRole("button", { name: labels[second], exact: true }).click();
  }
  for (const label of labels) await panel.getByRole("button", { name: label, exact: true }).click();
  await attached(page, records.filter(record => record.scope === "inter"));
  for (const kind of kinds) await expect.poll(() => markerPixels(page, kind)).toBeGreaterThan(3);
  await panel.getByRole("button", { name: "Intramolecular interactions" }).click();
  await attached(page, records);
  await panel.getByRole("button", { name: "Intermolecular interactions" }).click();
  await attached(page, records.filter(record => record.scope === "intra"));
  await panel.getByRole("button", { name: "Intramolecular interactions" }).click();
  await attached(page, []); await expect(panel.getByRole("status")).toHaveText("Off");
  await panel.getByRole("button", { name: "Intermolecular interactions" }).click();
  await attached(page, records.filter(record => record.scope === "inter"));
  expect(analyses).toBe(1); expect(structureGets).toBe(0);
  writeFileSync(info.outputPath("six-type-native.json"), JSON.stringify({ project: info.project.name, observed, analyses, structureGets, records }, null, 2));
  await panel.getByRole("button", { name: "Close interactions" }).click();

  // Topology deletion removes the actual donor H, refreshing artifacts and native
  // geometry; original upload remains unchanged and Undo restores that identity.
  const mobile = info.project.name === "mobile-chromium";
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection" }).click();
  await page.getByLabel("Select by").selectOption("atom_reference");
  await page.getByLabel("Value", { exact: true }).fill(`${project.entries[0].id}:2`);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await page.getByRole("tab", { name: "ligand" }).click();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  await expect.poll(() => analyses, { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => (await native(page)).records.filter(record => record.kind === "hydrogen_bond").length).toBe(1);
  expect((await native(page)).records.flatMap(record => record.participants.flat()).some(ref => ref.atom_id === 2)).toBe(false);
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(() => analyses, { timeout: 20_000 }).toBe(3);
  await attached(page, records.filter(record => record.scope === "inter"));
});

test("explains unsupported raw ligand chemistry without claiming complete zero coverage", async ({ page, request }) => {
  test.setTimeout(90_000);
  await prepare(page, request, ["tests/fixtures/complex/1stp.pdb"], "Raw ligand coverage");
  await page.getByRole("button", { name: "Interactions", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Interactions", exact: true });
  await panel.getByRole("button", { name: "H bonds", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("partial coverage", { timeout: 20_000 });
  await panel.getByRole("button", { name: "Interaction help", exact: true }).click();
  await expect(panel).toContainText("Unassigned bond orders or formal charges prevent interaction typing");
  await expect(panel).toContainText("explicit H atoms");
  await expect.poll(async () => (await native(page)).records.length).toBe(0);
});
