import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import type { AtomReference, Project, StructureProjection } from "../../apps/web/src/api/types";
import type { InteractionRecord, InteractionResult } from "../../apps/web/src/interactions/types";
import { frameFixture, native, prepare } from "./support/interactions";

const displayLimitMessage = "Interaction markers exceed the display geometry limit. Detected contacts remain available in Contacts. Narrow the target or show fewer types.";
const canonical = (references: AtomReference[]) => [...new Map(references.map(reference =>
  [JSON.stringify([reference.structure_id, reference.atom_id]), reference])).values()]
  .sort((a, b) => a.structure_id.localeCompare(b.structure_id) || a.atom_id - b.atom_id);

async function current(request: APIRequestContext, projectId: string) {
  const response = await request.get(`/api/v1/projects/${projectId}`);
  expect(response.ok()).toBe(true);
  return await response.json() as Project;
}

async function source(request: APIRequestContext, project: Project) {
  const entry = project.entries[0];
  const response = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`);
  const original = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`);
  expect(response.ok()).toBe(true); expect(original.ok()).toBe(true);
  return { projection: await response.json() as StructureProjection, original: (await original.body()).toString("base64") };
}

async function reachable(action: Locator) {
  await action.scrollIntoViewIfNeeded();
  await expect.poll(() => action.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
  })).toBe(true);
}

async function selectedAtoms(page: Page) {
  return page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    return useSelectionStore.getState().selection.atoms;
  });
}

function contactKey(record: InteractionRecord) {
  const groups = record.participants.map(group => canonical(group).map(atom => [atom.structure_id, atom.atom_id]));
  groups.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([record.kind, record.scope, groups]);
}

test("refuses oversized interaction geometry atomically and recovers affordable cached markers", async ({ page, request }, info) => {
  // This intentionally distorted charge group tests drawing admission, not a physical pose.
  const filename = "tests/fixtures/interactions/long_charge_group.mol";
  const raw = readFileSync(resolve(filename));
  expect(createHash("sha256").update(raw).digest("hex")).toBe("244761f1eba7ac041f0d9e9f8a076abbeeb2ed5a039593a402ddf01da25358c1");
  expect(raw.toString()).toContain("V3000");
  const project = await prepare(page, request, [filename], "Bounded interaction drawing");
  await frameFixture(page);
  const before = await current(request, project.id), originalSource = await source(request, before);
  const entry = before.entries[0];
  expect(originalSource.projection.structure.atoms).toHaveLength(48);
  expect(originalSource.projection.structure.bonds).toHaveLength(38);
  const originalPoints = readFileSync(resolve("tests/fixtures/interactions/six_types.mol"), "utf8").split(/\r?\n/).slice(4, 52)
    .map(line => [0, 10, 20].map(offset => Number(line.slice(offset, offset + 10))));
  expect(originalSource.projection.structure.atoms.map(atom => atom.coordinates)).toEqual(originalPoints.map((point, index) => index === 38 ? [1_000_000, point[1], point[2]] : point));

  const observed = { analyses: 0, structureGets: 0, molecularWrites: [] as string[] };
  page.on("request", outgoing => {
    const path = new URL(outgoing.url()).pathname;
    if (path.endsWith("/interactions") && outgoing.method() === "POST") observed.analyses++;
    if (/\/entries\/[^/]+\/structure$/.test(path)) observed.structureGets++;
    if (path.startsWith(`/api/v1/projects/${project.id}`) && !path.endsWith("/interactions")
      && !["GET", "HEAD", "OPTIONS"].includes(outgoing.method())) observed.molecularWrites.push(`${outgoing.method()} ${path}`);
  });
  const response = page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith("/interactions") && reply.request().method() === "POST");
  await page.getByRole("button", { name: "Interactions", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Interactions", exact: true });
  await panel.getByRole("button", { name: "Salt bridges", exact: true }).click();
  const reply = await response;
  expect(reply.status()).toBe(200);
  const analysis = await reply.json() as InteractionResult;
  expect(analysis.profile).toBe("interaction-v1");
  const salts = analysis.records.filter(record => record.kind === "salt_bridge" && record.scope === "inter");
  expect(salts).toHaveLength(1);
  const salt = salts[0];
  expect(salt.participants.map(group => group.map(atom => atom.atom_id))).toEqual([[32], [37, 39]]);
  expect(salt.participants.flat().every(atom => atom.structure_id === entry.id)).toBe(true);
  expect(salt.geometry.distance).toBeCloseTo(2.8, 12);
  expect(salt.endpoints).toEqual([[24, 0, 0], [500013.4, 0.6, 0]]);
  const markerDistance = Math.hypot(...salt.endpoints[0].map((coordinate, axis) => salt.endpoints[1][axis] - coordinate));
  expect(markerDistance).toBeCloseTo(499989.40000036004, 6);
  const sceneGeneration = (await native(page)).sceneGeneration;

  const expectRefused = async () => {
    await expect(panel.getByRole("status")).toHaveText(displayLimitMessage);
    await expect.poll(async () => {
      const value = await native(page);
      return { status: value.display.status, error: value.display.error, queueError: value.queueError, queueErrorCode: value.queueErrorCode, keys: value.display.installedRecordKeys,
        counts: Object.values(value.display.countsByKind), currentRequest: value.display.displayKey === value.requestedDisplayKey,
        sceneGeneration: value.display.sceneGeneration, installedObjects: value.objects.filter(object => object.installed).length };
    }).toEqual({ status: "error", error: displayLimitMessage, queueError: null, queueErrorCode: null, keys: [], counts: [0, 0, 0, 0, 0, 0],
      currentRequest: true, sceneGeneration, installedObjects: 0 });
    await expect(page.locator(".structure-viewer .viewer-error")).toHaveCount(0);
  };
  await expectRefused();
  await expect(panel.getByRole("button", { name: "Salt bridges", exact: true })).toHaveAttribute("aria-description", /1 detected/);
  const firstRefusal = await native(page);
  await panel.locator(".interaction-contacts > summary").click();
  await expect(panel.locator(".interaction-contact-row")).toHaveCount(1);
  await panel.locator(".interaction-contact-row").click();
  const details = panel.getByRole("region", { name: "Contact details", exact: true });
  await expect(details.getByText("Nearest charge-site distance", { exact: true })).toBeVisible();
  await expect(details.getByText("2.800 Å", { exact: true })).toBeVisible();
  const focus = details.getByRole("button", { name: "Focus", exact: true });
  await expect(focus).toHaveAttribute("aria-disabled", "true");
  await expect(details).toContainText("Interaction display is unavailable.");
  await expect(details).not.toContainText("Wait for current interaction rendering.");
  const selectAtoms = details.getByRole("button", { name: "Select atoms", exact: true });
  await expect(selectAtoms).toHaveAttribute("aria-disabled", "false");
  await reachable(selectAtoms); await selectAtoms.click();
  await expect.poll(() => selectedAtoms(page)).toEqual(canonical(salt.participants.flat()));
  expect(await selectedAtoms(page)).toHaveLength(3);
  await page.screenshot({ path: info.outputPath("interaction-budget-error.png") });

  // Recovery filters cached classification; it does not rebuild molecular source.
  await panel.getByRole("button", { name: "Salt bridges", exact: true }).click();
  await panel.getByRole("button", { name: "H bonds", exact: true }).click();
  const hydrogenBonds = analysis.records.filter(record => record.kind === "hydrogen_bond" && record.scope === "inter");
  expect(hydrogenBonds).toHaveLength(2);
  await expect(panel.getByRole("status")).toContainText("2 shown · 2 detected");
  await expect.poll(async () => {
    const value = await native(page);
    return { status: value.display.status, keys: value.display.installedRecordKeys, hBonds: value.display.countsByKind.hydrogen_bond,
      currentRequest: value.display.displayKey === value.requestedDisplayKey,
      sceneGeneration: value.display.sceneGeneration, installedObjects: value.objects.filter(object => object.installed).length };
  }).toEqual({ status: "ready", keys: hydrogenBonds.map(contactKey), hBonds: 2,
    currentRequest: true, sceneGeneration, installedObjects: 1 });
  const recovered = await native(page);
  await expect(page.locator(".structure-viewer .viewer-error")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("interaction-budget-recovered.png") });
  expect(recovered.records).toEqual(hydrogenBonds);
  expect(recovered.objects.every(object => !object.pickable && object.drawCount > 0 && object.drawCount <= object.indexCapacity)).toBe(true);

  // A mixed batch must refuse atomically, without mutating the affordable buffers.
  await panel.getByRole("button", { name: "Salt bridges", exact: true }).click();
  await expectRefused();
  await expect(panel.locator(".interaction-contact-row")).toHaveCount(3);
  const mixedRefusal = await native(page);
  expect(mixedRefusal.objects.map(object => Object.fromEntries(Object.entries(object).filter(([key]) => key !== "installed"))))
    .toEqual(recovered.objects.map(object => Object.fromEntries(Object.entries(object).filter(([key]) => key !== "installed"))));
  expect(mixedRefusal.records).toEqual(analysis.records.filter(record => record.scope === "inter"
    && (record.kind === "salt_bridge" || record.kind === "hydrogen_bond")));
  await panel.locator(".interaction-contact-row").filter({ hasText: "Salt bridges" }).click();
  await expect(details).toContainText("Nearest charge-site distance");
  await expect(details.getByRole("button", { name: "Select atoms", exact: true })).toHaveAttribute("aria-disabled", "false");
  expect(salt.endpoints).toEqual([[24, 0, 0], [500013.4, 0.6, 0]]);
  expect(observed).toEqual({ analyses: 1, structureGets: 0, molecularWrites: [] });
  const after = await current(request, project.id);
  expect(after.revision).toBe(before.revision); expect(after.history).toEqual(before.history);
  expect(after.entries.map(item => ({ id: item.id, original: item.original_artifact_id,
    current: item.current_artifact_id, settings: item.viewer_settings, atomIds: item.atom_ids })))
    .toEqual(before.entries.map(item => ({ id: item.id, original: item.original_artifact_id,
      current: item.current_artifact_id, settings: item.viewer_settings, atomIds: item.atom_ids })));
  expect(await source(request, after)).toEqual(originalSource);
  writeFileSync(info.outputPath("interaction-geometry-budget.json"), JSON.stringify({
    fixture: filename, scientificRecord: salt, markerDistance, observed,
    firstRefusal, recovered, mixedRefusal,
  }, null, 2));
});
