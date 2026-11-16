import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AtomReference, Project, StructureProjection } from "../../apps/web/src/api/types";
import type { InteractionKind, InteractionRecord, InteractionResult } from "../../apps/web/src/interactions/types";
import { frameFixture, native, prepare } from "./support/interactions";
import { select } from "./support/minimization";

const kinds: InteractionKind[] = ["hydrogen_bond", "hydrophobic", "pi_pi", "cation_pi", "salt_bridge", "clash"];
const panel = (page: Page) => page.getByRole("dialog", { name: "Interactions", exact: true });
const launcher = (page: Page) => page.getByRole("button", { name: "Interactions", exact: true });

test("keeps coincident ring contacts detected without claiming an installed marker", async ({ page, request }, info) => {
  const project = await prepare(page, request, ["tests/fixtures/interactions/ring_a.mol", "tests/fixtures/interactions/ring_a.mol"], "Coincident contact endpoints");
  await frameFixture(page);
  const before = await current(request, project), source = await sources(request, project);
  const observed = watchRequests(page, project.id);
  const response = page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith("/interactions") && reply.request().method() === "POST");
  await launcher(page).click();
  await panel(page).getByRole("button", { name: "π–π", exact: true }).click();
  const reply = await response;
  expect(reply.status()).toBe(200);
  const analysis = await reply.json() as InteractionResult;
  const records = analysis.records.filter(record => record.kind === "pi_pi" && record.scope === "inter");
  expect(records).toHaveLength(1);
  expect(records[0].participants.map(group => group.length)).toEqual([6, 6]);
  expect(records[0].endpoints[0]).toEqual(records[0].endpoints[1]);
  expect(records[0].geometry.distance).toBe(0);
  await expect(panel(page).getByRole("status")).toContainText("0 shown · 1 detected");
  await expect.poll(async () => {
    const value = await native(page);
    return { status: value.display.status, keys: value.display.installedRecordKeys, count: value.display.countsByKind.pi_pi,
      current: value.display.displayKey === value.requestedDisplayKey && value.display.sceneGeneration === value.sceneGeneration,
      drawCount: value.objects.reduce((count, object) => count + object.drawCount, 0) };
  }).toEqual({ status: "ready", keys: [], count: 0, current: true, drawCount: 0 });
  await panel(page).locator(".interaction-contacts > summary").click();
  await panel(page).locator(".interaction-contact-row").click();
  const details = panel(page).getByRole("region", { name: "Contact details", exact: true });
  await expect(details).toContainText("coincident interaction endpoints");
  await expect(details.getByRole("button", { name: "Focus", exact: true })).toHaveAttribute("aria-disabled", "true");
  const selectAtoms = details.getByRole("button", { name: "Select atoms", exact: true });
  await expectReachableAction(selectAtoms);
  await selectAtoms.click();
  await expect.poll(async () => (await session(page)).selection).toEqual(canonical(records[0].participants.flat()));
  expect((await session(page)).selection).toHaveLength(12);
  expect(observed).toEqual({ analyses: 1, structureGets: 0, molecularWrites: [] });
  await expectUnchanged(request, before, source);
  writeFileSync(info.outputPath("coincident-contact-endpoints.json"), JSON.stringify({ records, observed, native: await native(page) }, null, 2));
});

const canonical = (references: AtomReference[]) => [...new Map(references.map(reference =>
  [JSON.stringify([reference.structure_id, reference.atom_id]), reference])).values()]
  .sort((a, b) => a.structure_id.localeCompare(b.structure_id) || a.atom_id - b.atom_id);

async function session(page: Page) {
  return page.evaluate(async () => {
    const [{ useInteractionStore }, { useSelectionStore }] = await Promise.all([
      import("/src/store/interactions.ts"), import("/src/store/selection.ts"),
    ]);
    const interactions = useInteractionStore.getState();
    return {
      selection: useSelectionStore.getState().selection.atoms,
      targetMode: interactions.targetMode,
      selectionTarget: interactions.selectionTarget,
      ligandTarget: interactions.ligandTarget,
      show: interactions.show,
      choices: interactions.choices,
      appearance: interactions.appearance,
    };
  });
}

async function current(request: APIRequestContext, project: Project) {
  const response = await request.get(`/api/v1/projects/${project.id}`);
  expect(response.ok()).toBe(true);
  return await response.json() as Project;
}

async function sources(request: APIRequestContext, project: Project) {
  return Object.fromEntries(await Promise.all(project.entries.map(async entry => {
    const response = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`);
    expect(response.ok()).toBe(true);
    const projection = await response.json() as StructureProjection;
    const original = await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`);
    expect(original.ok()).toBe(true);
    return [entry.id, { projection, original: (await original.body()).toString("base64") }];
  })));
}

function watchRequests(page: Page, projectId: string) {
  const observations = { analyses: 0, structureGets: 0, molecularWrites: [] as string[] };
  page.on("request", outgoing => {
    const path = new URL(outgoing.url()).pathname;
    if (path.endsWith("/interactions") && outgoing.method() === "POST") observations.analyses++;
    if (/\/entries\/[^/]+\/structure$/.test(path)) observations.structureGets++;
    if (path.startsWith(`/api/v1/projects/${projectId}`) && !path.endsWith("/interactions")
      && !["GET", "HEAD", "OPTIONS"].includes(outgoing.method())) {
      observations.molecularWrites.push(`${outgoing.method()} ${path}`);
    }
  });
  return observations;
}

async function expectInstalled(page: Page, records: InteractionRecord[]) {
  const keys = records.map(record => {
    const groups = record.participants.map(group => canonical(group).map(atom => [atom.structure_id, atom.atom_id]));
    groups.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return JSON.stringify([record.kind, record.scope, groups]);
  });
  await expect.poll(async () => (await native(page)).records).toEqual(records);
  await expect.poll(async () => {
    const value = await native(page);
    return { status: value.display.status, keys: value.display.installedRecordKeys,
      currentRequest: value.display.displayKey === value.requestedDisplayKey,
      currentScene: value.display.sceneGeneration === value.sceneGeneration,
      counts: value.display.countsByKind };
  }).toEqual({ status: "ready", keys, currentRequest: true, currentScene: true,
    counts: Object.fromEntries(kinds.map(kind => [kind, records.filter(record => record.kind === kind).length])) });
  if (records.length) {
    const value = await native(page);
    expect(value.objects).toHaveLength(1);
    expect(value.objects[0].pickable).toBe(false);
    expect(value.objects[0].drawCount).toBeGreaterThan(0);
    expect(value.objects[0].drawCount).toBeLessThanOrEqual(value.objects[0].indexCapacity);
    expect(new Set(value.objects[0].groups).size).toBe(records.length);
  }
}

async function expectAnchoredPanel(page: Page) {
  await expect.poll(async () => panel(page).evaluate(element => {
    const box = element.getBoundingClientRect();
    const trigger = document.querySelector('[aria-label="Interactions"]')?.getBoundingClientRect();
    if (!trigger) throw new Error("Interaction launcher required");
    const expectedLeft = Math.max(8, Math.min(trigger.left, innerWidth - box.width - 8));
    const expectedTop = Math.max(8, Math.min(trigger.bottom + 8, innerHeight - box.height - 8));
    return { widthBounded: box.width <= Math.min(336, innerWidth - 16) + 1,
      anchored: Math.abs(box.left - expectedLeft) <= 1 && Math.abs(box.top - expectedTop) <= 1,
      contained: box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1,
      untransformed: getComputedStyle(element).transform === "none" };
  })).toEqual({ widthBounded: true, anchored: true, contained: true, untransformed: true });
}

async function expectReachableAction(action: Locator) {
  await action.scrollIntoViewIfNeeded();
  await expect.poll(() => action.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
  })).toBe(true);
}

async function expectUnchanged(request: APIRequestContext, before: Project, source: Awaited<ReturnType<typeof sources>>) {
  const after = await current(request, before);
  expect(after.revision).toBe(before.revision);
  expect(after.history).toEqual(before.history);
  expect(after.entries.map(entry => ({ id: entry.id, original: entry.original_artifact_id,
    current: entry.current_artifact_id, settings: entry.viewer_settings, atomIds: entry.atom_ids })))
    .toEqual(before.entries.map(entry => ({ id: entry.id, original: entry.original_artifact_id,
      current: entry.current_artifact_id, settings: entry.viewer_settings, atomIds: entry.atom_ids })));
  expect(await sources(request, after)).toEqual(source);
}

test("captures explicit ligand and selection targets independently of inspected contact selection", async ({ page, request }, info) => {
  test.setTimeout(150_000);
  const project = await prepare(page, request, ["tests/fixtures/interactions/ring_a.mol", "tests/fixtures/interactions/ring_b.mol", "tests/fixtures/interactions/positive_ion.mol"], "Targeted interaction inspection");
  await frameFixture(page);
  const before = await current(request, project), source = await sources(request, project);
  const first = project.entries.find(entry => entry.original_filename === "ring_a.mol")!;
  const second = project.entries.find(entry => entry.original_filename === "ring_b.mol")!;
  expect(first.atom_ids).toHaveLength(6); expect(second.atom_ids).toHaveLength(6);
  const observed = watchRequests(page, project.id);
  const response = page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith("/interactions") && reply.request().method() === "POST");
  await launcher(page).click();
  await panel(page).getByRole("button", { name: "π–π", exact: true }).click();
  await panel(page).getByRole("button", { name: "Cation–π", exact: true }).click();
  const reply = await response; expect(reply.status()).toBe(200);
  const analysis = await reply.json() as InteractionResult;
  const expected = analysis.records.filter(record => record.scope === "inter" && ["pi_pi", "cation_pi"].includes(record.kind));
  expect(expected.filter(record => record.kind === "pi_pi")).toHaveLength(1);
  expect(expected.filter(record => record.kind === "cation_pi")).toHaveLength(2);
  await expectInstalled(page, expected);
  await expect(panel(page).getByRole("status")).toContainText("3 shown · 3 detected");

  await panel(page).getByRole("combobox", { name: "Interaction target", exact: true }).selectOption("ligand");
  await expect(panel(page).getByRole("status")).toHaveText("Choose a ligand instance");
  const ligand = panel(page).getByRole("combobox", { name: "Interaction ligand instance", exact: true });
  await expect(ligand).toHaveValue("");
  const choices = await ligand.locator("option").evaluateAll(options => options.map(option => ({ value: option.value, disabled: option.disabled })));
  expect(choices.filter(choice => choice.value && !choice.disabled)).toHaveLength(3);
  const firstChoice = choices.find(choice => choice.value && JSON.parse(choice.value)[0] === first.id)!;
  await ligand.selectOption(firstChoice.value);
  const firstContacts = expected.filter(record => record.participants.flat().some(atom => atom.structure_id === first.id));
  expect(firstContacts).toHaveLength(2);
  await expectInstalled(page, firstContacts);
  expect((await session(page)).ligandTarget?.atoms).toEqual(first.atom_ids.map(atom_id => ({ structure_id: first.id, atom_id })));

  await panel(page).locator(".interaction-contacts > summary").click();
  await expectAnchoredPanel(page);
  const cationRow = panel(page).locator(".interaction-contact-row").filter({ hasText: "Cation–π" });
  await expect(cationRow).toHaveCount(1);
  await cationRow.click();
  expect((await session(page)).selection).toEqual([]);
  const details = panel(page).getByRole("region", { name: "Contact details", exact: true });
  await expect(details.getByText("Charge-center–ring-center distance", { exact: true })).toBeVisible();
  await expect(details.getByText("4 Å", { exact: true })).toBeVisible();
  await expectAnchoredPanel(page);
  const cationContact = firstContacts.find(record => record.kind === "cation_pi")!;
  const beforeFocus = (await native(page)).camera;
  const focus = details.getByRole("button", { name: "Focus", exact: true });
  await expectReachableAction(focus);
  await focus.click();
  await expect.poll(async () => (await native(page)).camera).not.toEqual(beforeFocus);
  const focused = (await native(page)).camera;
  const selectContact = details.getByRole("button", { name: "Select atoms", exact: true });
  await expectReachableAction(selectContact);
  await selectContact.click();
  await expect.poll(async () => (await session(page)).selection).toEqual(canonical(cationContact.participants.flat()));
  expect((await native(page)).camera).toEqual(focused);
  expect((await session(page)).ligandTarget?.atoms).toHaveLength(6);

  await panel(page).getByRole("button", { name: "Close interactions", exact: true }).click();
  await expect(launcher(page).locator('[data-interaction-status="partial"]')).toBeVisible();
  await select(page, [{ structure_id: first.id, atom_id: first.atom_ids[0] }], info.project.name === "mobile-chromium");
  await launcher(page).click();
  await panel(page).getByRole("combobox", { name: "Interaction target", exact: true }).selectOption("selection");
  await expect(panel(page).getByRole("status")).toHaveText("Capture a selection");
  await panel(page).getByRole("button", { name: "Use current selection", exact: true }).click();
  await expectInstalled(page, firstContacts);
  expect((await session(page)).selectionTarget?.atoms).toEqual([{ structure_id: first.id, atom_id: first.atom_ids[0] }]);
  await panel(page).locator(".interaction-contacts > summary").click();
  await panel(page).locator(".interaction-contact-row").filter({ hasText: "Cation–π" }).click();
  await panel(page).getByRole("region", { name: "Contact details" }).getByRole("button", { name: "Select atoms", exact: true }).click();
  await expect.poll(async () => (await session(page)).selection).toEqual(canonical(cationContact.participants.flat()));
  expect((await session(page)).selectionTarget?.atoms).toEqual([{ structure_id: first.id, atom_id: first.atom_ids[0] }]);
  await expectInstalled(page, firstContacts);

  await panel(page).getByRole("button", { name: "Close interactions", exact: true }).click();
  await select(page, [{ structure_id: second.id, atom_id: second.atom_ids[0] }], info.project.name === "mobile-chromium");
  await launcher(page).click();
  await expect(panel(page).getByText("Current selection differs. The captured target is retained.", { exact: true })).toBeVisible();
  await expectInstalled(page, firstContacts);
  await panel(page).getByRole("button", { name: "Update from selection", exact: true }).click();
  const secondContacts = expected.filter(record => record.participants.flat().some(atom => atom.structure_id === second.id));
  expect(secondContacts).toHaveLength(2);
  expect(secondContacts).not.toEqual(firstContacts);
  await expectInstalled(page, secondContacts);
  expect((await session(page)).selectionTarget?.atoms).toEqual([{ structure_id: second.id, atom_id: second.atom_ids[0] }]);
  expect(observed).toEqual({ analyses: 1, structureGets: 0, molecularWrites: [] });
  await expectUnchanged(request, before, source);
  await page.screenshot({ path: info.outputPath("targeted-contact-inspection.png") });
  writeFileSync(info.outputPath("targeted-contact-inspection.json"), JSON.stringify({ project: info.project.name, expected, firstContacts, secondContacts, observed, state: await session(page), native: await native(page) }, null, 2));
});

test("changes native appearance and hides or restores retained interactions from the closed panel", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const project = await prepare(page, request, ["tests/fixtures/interactions/hydrogen_pair.mol"], "Interaction appearance and visibility");
  await frameFixture(page);
  const before = await current(request, project), source = await sources(request, project);
  expect(Buffer.from(source[project.entries[0].id].original, "base64")).toEqual(readFileSync(resolve("tests/fixtures/interactions/hydrogen_pair.mol")));
  const observed = watchRequests(page, project.id);
  await launcher(page).click();
  await panel(page).getByRole("button", { name: "H bonds", exact: true }).click();
  await expect(panel(page).getByRole("status")).toContainText("1 shown · 1 detected");
  const initial = await native(page), camera = initial.camera;
  expect(initial.records).toHaveLength(1);
  expect(initial.records[0].endpoints).toEqual([[1, 0, 0], [2.8, 0, 0]]);
  await panel(page).locator(".interaction-appearance > summary").click();
  await panel(page).getByLabel("H bonds color", { exact: true }).fill("#f12b7b");
  await panel(page).getByLabel("H bonds width", { exact: true }).selectOption("4");
  await expectInstalled(page, initial.records);
  await expect.poll(async () => (await native(page)).objects[0].colors.slice(0, 3)).toEqual([241, 43, 123]);
  const styled = await native(page), styleObject = styled.objects[0];
  expect(styleObject.sizeType).toMatch(/group/);
  const encoded = styleObject.sizes[0] * 65_536 + styleObject.sizes[1] * 256 + styleObject.sizes[2] - 1;
  expect(encoded / 100 * styleObject.sizeFactor).toBeCloseTo(4, 5);
  expect(styled.objects[0].starts).toEqual(initial.objects[0].starts);
  expect(styled.objects[0].ends).toEqual(initial.objects[0].ends);
  expect(styled.display.countsByKind).toEqual(initial.display.countsByKind);
  expect(styled.camera).toEqual(camera);
  await expect(panel(page).getByRole("button", { name: "H bonds", exact: true }).locator(".interaction-swatch line")).toHaveAttribute("stroke", "#f12b7b");

  await panel(page).getByRole("button", { name: "Close interactions", exact: true }).click();
  const toggle = page.getByRole("button", { name: "Toggle interaction visibility", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(panel(page)).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expectInstalled(page, []);
  expect((await session(page)).choices.types).toEqual(["hydrogen_bond"]);
  expect((await session(page)).appearance.hydrogen_bond).toEqual({ color: "#f12b7b", width: 4 });
  await toggle.click();
  await expectInstalled(page, initial.records);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect((await native(page)).objects[0].colors.slice(0, 3)).toEqual([241, 43, 123]);

  await launcher(page).click();
  await panel(page).locator(".interaction-appearance > summary").click();
  await panel(page).getByRole("button", { name: "Reset H bonds appearance", exact: true }).click();
  await expectInstalled(page, initial.records);
  await expect.poll(async () => (await native(page)).objects[0].colors.slice(0, 3)).toEqual(initial.objects[0].colors.slice(0, 3));
  expect((await session(page)).appearance.hydrogen_bond).toEqual({ color: "#1597b0", width: 2.5 });
  expect((await native(page)).camera).toEqual(camera);
  expect(observed).toEqual({ analyses: 1, structureGets: 0, molecularWrites: [] });
  await expectUnchanged(request, before, source);
  await page.screenshot({ path: info.outputPath("interaction-appearance.png") });
  writeFileSync(info.outputPath("interaction-appearance.json"), JSON.stringify({ project: info.project.name, observed, initial, styled, restored: await native(page) }, null, 2));
});

test("exposes known preparation sites and retains an accessible collapsed target in narrow themes", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const project = await prepare(page, request, ["tests/fixtures/complex/1stp.pdb"], "Interaction uncertainty and layout");
  const before = await current(request, project), source = await sources(request, project);
  const observed = watchRequests(page, project.id);
  const response = page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith("/interactions") && reply.request().method() === "POST");
  await launcher(page).click();
  await panel(page).getByRole("button", { name: "H bonds", exact: true }).click();
  const reply = await response; expect(reply.status()).toBe(200);
  const analysis = await reply.json() as InteractionResult;
  const warning = analysis.warnings.find(value => value.code === "explicit_hydrogens_required")!;
  expect(warning.atom_ids.length).toBeGreaterThan(0);
  await expect(panel(page).getByRole("status")).toContainText("partial input coverage");
  await panel(page).locator(".interaction-warnings > summary").click();
  const affected = panel(page).getByRole("button", { name: new RegExp(`Select affected atoms: .* · ${warning.code}$`) });
  await expect(affected).toHaveCount(1);
  await expect(affected).toHaveAttribute("aria-disabled", "false");
  await affected.click();
  await expect.poll(async () => (await session(page)).selection).toEqual(canonical(warning.atom_ids.map(atom_id => ({ structure_id: warning.entry_id, atom_id }))));
  await panel(page).getByRole("combobox", { name: "Interaction target", exact: true }).selectOption("selection");
  await panel(page).getByRole("button", { name: "Use current selection", exact: true }).click();
  const label = `${warning.atom_ids.length} captured atom${warning.atom_ids.length === 1 ? "" : "s"}`;
  await expect(panel(page).getByText(label, { exact: true })).toBeVisible();
  await expectInstalled(page, []);
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Use ${theme} theme`, exact: true }).click();
    await expectAnchoredPanel(page);
    expect((await new AxeBuilder({ page }).include(".interaction-panel").analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`interaction-uncertainty-${theme}.png`) });
  }
  await panel(page).getByRole("button", { name: "Collapse interactions", exact: true }).click();
  await expect(panel(page).locator(".interaction-collapsed-target")).toHaveText(label);
  await expect(panel(page).getByRole("button", { name: "H bonds", exact: true })).toBeHidden();
  await page.setViewportSize({ width: 320, height: 640 });
  if (info.project.name === "chromium") await launcher(page).click();
  await expect(panel(page).getByRole("button", { name: "Expand interactions", exact: true })).toBeVisible();
  await expectAnchoredPanel(page);
  await expect(panel(page).locator(".interaction-collapsed-target")).toHaveAttribute("aria-label", `Target: ${label}`);
  const bounded = await panel(page).boundingBox();
  expect(bounded).not.toBeNull();
  expect(bounded!.x).toBeGreaterThanOrEqual(0);
  expect(bounded!.y).toBeGreaterThanOrEqual(0);
  expect(bounded!.x + bounded!.width).toBeLessThanOrEqual(321);
  expect(bounded!.y + bounded!.height).toBeLessThanOrEqual(641);
  expect(bounded!.height).toBeLessThan(180);
  await page.screenshot({ path: info.outputPath("interaction-collapsed-320.png") });
  await panel(page).getByRole("button", { name: "Expand interactions", exact: true }).click();
  await expect(panel(page).getByRole("combobox", { name: "Interaction target", exact: true })).toHaveValue("selection");
  await panel(page).getByRole("button", { name: "Close interactions", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
  expect(observed).toEqual({ analyses: 1, structureGets: 0, molecularWrites: [] });
  await expectUnchanged(request, before, source);
  writeFileSync(info.outputPath("interaction-uncertainty-layout.json"), JSON.stringify({ project: info.project.name, observed, warning, captured: await session(page), collapsedBounds: bounded }, null, 2));
});
