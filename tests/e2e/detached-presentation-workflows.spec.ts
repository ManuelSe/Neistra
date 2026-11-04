import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { native, prepare } from "./support/interactions";
import { newEmptyProject, previewState, selectPair } from "./support/modeling";
import { coordinateEntries, current, panel, startAdvanced, structures } from "./support/minimization";
import { expectMirror, frame, openPresentation } from "./support/presentation";
import type { Project } from "../../apps/web/src/api/types";
import type { ViewerStructure } from "../../apps/web/src/viewer/MolecularViewer";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "chromium", "Local detached presentation is qualified on desktop Chromium");
});

test("maps the leader pointer, preserves keyboard access and supports ordinary desktop windows", async ({ page, request }, info) => {
  test.setTimeout(150000);
  const project = await prepare(page, request, ["tests/fixtures/complex/1stp.pdb"], "Presentation pointer");
  await expect(page.getByLabel("Loading molecular structures")).toHaveCount(0);
  const child = await openPresentation(page);
  await child.setViewportSize({ width: 500, height: 900 });
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  for (const theme of ["light", "dark"]) {
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await expectMirror(page, child);
    await page.bringToFront();
    await page.locator(".molstar-host canvas").first().hover({ position: { x: 120, y: 220 } });
    await expect(child.locator(".presentation-pointer")).toBeVisible();
    const mapping = await child.evaluate(() => {
      const video = document.querySelector("video")!;
      const marker = document.querySelector<HTMLElement>(".presentation-pointer")!;
      return { x: parseFloat(marker.style.left), y: parseFloat(marker.style.top),
        sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, width: innerWidth, height: innerHeight };
    });
    const box = (await page.locator(".molstar-host canvas").first().boundingBox())!;
    const scale = Math.min(mapping.width / mapping.sourceWidth, mapping.height / mapping.sourceHeight);
    expect(mapping.x).toBeCloseTo((mapping.width - mapping.sourceWidth * scale) / 2 + 120 / box.width * mapping.sourceWidth * scale, 0);
    expect(mapping.y).toBeCloseTo((mapping.height - mapping.sourceHeight * scale) / 2 + 220 / box.height * mapping.sourceHeight * scale, 0);
    await child.screenshot({ path: info.outputPath(`${theme}-pointer.png`) });
    await expect(child.locator(".presentation-pointer")).toBeHidden({ timeout: 4000 });
    const fullscreen = child.getByRole("button", { name: "Enter fullscreen" });
    await fullscreen.focus();
    await expect.poll(() => fullscreen.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
    await child.waitForTimeout(2100);
    await expect(fullscreen).toBeFocused();
    expect(await fullscreen.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
    expect((await new AxeBuilder({ page: child }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await child.keyboard.press("f");
    await expect(child.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
    await child.evaluate(() => document.exitFullscreen());
  }
  if (info.project.use.headless === false) {
    const cdp = await child.context().newCDPSession(child);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { left: 80, top: 70, width: 1100, height: 750 } });
    const moved = await cdp.send("Browser.getWindowBounds", { windowId });
    expect(moved.bounds.left).toBe(80); expect(moved.bounds.top).toBe(70);
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } });
    const maximized = await cdp.send("Browser.getWindowBounds", { windowId });
    expect(maximized.bounds.windowState).toBe("maximized");
    await info.attach("headed-window-bounds", { body: JSON.stringify({ moved, maximized,
      browser: child.context().browser()?.version(), platform: process.platform }), contentType: "application/json" });
    await cdp.detach();
  }
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
  await child.close();
});

test("mirrors appearance, surfaces, interaction markers, isolation, visibility and named scenes", async ({ page, request }) => {
  test.setTimeout(180000);
  const project = await prepare(page, request, ["tests/fixtures/interactions/ring_a.mol", "tests/fixtures/interactions/ring_b.mol", "tests/fixtures/interactions/positive_ion.mol"], "Presentation display");
  const child = await openPresentation(page);
  await page.getByRole("button", { name: "Interactions", exact: true }).click();
  const interactions = page.getByRole("dialog", { name: "Interactions", exact: true });
  await interactions.getByRole("button", { name: "π–π", exact: true }).click();
  await expect.poll(async () => (await native(page)).records.length).toBe(1);
  await interactions.getByRole("button", { name: "Close interactions" }).click();
  await expectMirror(page, child);
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByLabel("Controlled structure").selectOption(project.entries[0].id);
  const change = async (action: () => Promise<unknown>) => {
    const response = page.waitForResponse(r => r.url().endsWith("/viewer-settings") && r.request().method() === "PUT");
    await action(); const acknowledged = await response; expect(acknowledged.ok()).toBe(true);
    const changed = await acknowledged.json() as Project;
    const settings = changed.entries.find(entry => entry.id === project.entries[0].id)!.viewer_settings;
    await expect.poll(() => page.evaluate(({ id, settings }) => {
      const engine = window.interactionEngines.at(-1)! as unknown as { structures: ViewerStructure[] };
      return JSON.stringify(engine.structures.find(source => source.entryId === id)?.settings) === JSON.stringify(settings);
    }, { id: project.entries[0].id, settings })).toBe(true);
    await expectMirror(page, child);
  };
  await change(() => page.getByLabel(`Representation style for ${project.entries[0].name}`).first().selectOption("space-filling"));
  await change(() => page.getByLabel("Color scheme for space-filling").selectOption("custom"));
  await change(() => page.getByLabel("Custom color for space-filling").fill("#e26632"));
  await change(async () => { await page.locator(".opacity-control input").first().focus(); await page.keyboard.press("ArrowLeft"); });
  await change(() => page.getByRole("checkbox", { name: "Show non-polar hydrogens", exact: true }).click());
  await change(() => page.getByRole("checkbox", { name: "Show hydrogens", exact: true }).click());
  await page.getByLabel("Add representation").selectOption("surface");
  await expect(page.locator(".surface-object-status")).toContainText("Native surface ready", { timeout: 30000 });
  await page.getByRole("button", { name: "Close surfaces" }).click();
  await expectMirror(page, child);
  await page.locator(`[data-entry-id="${project.entries[0].id}"] .entry-select`).first().click();
  await page.getByRole("button", { name: "Isolate selection", exact: true }).click();
  await expect.poll(async () => (await native(page)).records.length).toBe(0);
  await expectMirror(page, child);
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await page.getByPlaceholder("Scene name").fill("Audience scene");
  await page.getByRole("button", { name: "Save current scene" }).click();
  await page.getByRole("button", { name: "orthographic", exact: true }).click();
  await expectMirror(page, child);
  await page.getByRole("button", { name: "Audience scene", exact: true }).click();
  await expectMirror(page, child);
  await page.getByRole("button", { name: "Close viewer controls" }).click();
  const row = page.locator(`[data-entry-id="${project.entries[1].id}"]`);
  await row.getByRole("button", { name: /^Hide / }).click();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
  await expectMirror(page, child);
  await row.getByRole("button", { name: /^Show / }).click();
  await expect(page.locator(".viewer-status")).toContainText("3 visible / 3 loaded");
  await expectMirror(page, child);
  await child.close();
});

test("mirrors placement, atomic edits, undo/redo, interactive movement and numerical preview", async ({ page, request }) => {
  test.setTimeout(180000);
  const initial = await newEmptyProject(page, request);
  await page.locator(".project-stage").getByRole("button", { name: "New molecule", exact: true }).click();
  await page.getByRole("dialog", { name: "New molecule", exact: true }).getByRole("button", { name: "Create molecule", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded / 1 selected");
  const child = await openPresentation(page);
  const editor = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await editor.getByText("Add atom", { exact: true }).click();
  await editor.getByRole("button", { name: "Preview atom", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await expect(child.locator(".presentation-preview")).toBeVisible();
  await expect.poll(async () => (await previewState(page)).objects.length).toBeGreaterThan(0);
  await expectMirror(page, child);
  await editor.getByRole("button", { name: "Cancel placement", exact: true }).click();
  await expect(child.locator(".presentation-preview")).toBeHidden();
  await editor.getByRole("button", { name: "Preview atom", exact: true }).click();
  await editor.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await current(request, initial.id)).entries[0].atom_count).toBe(8);
  await expectMirror(page, child);
  await editor.getByRole("button", { name: "Close molecular editor" }).click();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await current(request, initial.id)).entries[0].atom_count).toBe(1);
  await expectMirror(page, child);
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await expect.poll(async () => (await current(request, initial.id)).entries[0].atom_count).toBe(8);
  await expectMirror(page, child);
  const project = await current(request, initial.id);
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  const withHydrogens = await frame(child);
  await page.getByRole("checkbox", { name: "Show hydrogens", exact: true }).click();
  await expect.poll(async () => (await current(request, initial.id)).entries[0].viewer_settings.components.hydrogens).toBe(false);
  await expectMirror(page, child);
  await expect.poll(async () => (await frame(child)).hash).not.toBe(withHydrogens.hash);
  await page.getByRole("checkbox", { name: "Show hydrogens", exact: true }).click();
  await expect.poll(async () => (await current(request, initial.id)).entries[0].viewer_settings.components.hydrogens).toBe(true);
  await page.getByRole("button", { name: "Close viewer controls" }).click();
  const revision = (await current(request, initial.id)).revision;
  await selectPair(page, project.entries[0].id, [1], false);
  await page.getByRole("button", { name: "Transform selection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel movement", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "More movement tools", exact: true }).click();
  await page.getByRole("dialog", { name: "More movement tools", exact: true }).getByRole("button", { name: "Translate", exact: true }).click();
  await page.getByRole("button", { name: "More movement tools", exact: true }).click();
  await page.locator("[data-movement-canvas]").focus(); await page.keyboard.press("ArrowRight");
  await expect(child.locator(".presentation-preview")).toBeVisible();
  await expectMirror(page, child);
  await page.getByRole("button", { name: "Cancel movement", exact: true }).click();
  await expect(child.locator(".presentation-preview")).toBeHidden();
  await expectMirror(page, child);
  await page.getByRole("tab", { name: "transform", exact: true }).click();
  await page.locator(".gesture-slider input").focus(); await page.keyboard.press("ArrowRight");
  await expect(child.locator(".presentation-preview")).toBeVisible();
  await expectMirror(page, child);
  await page.keyboard.press("ArrowLeft");
  await expect(child.locator(".presentation-preview")).toBeHidden();
  expect((await current(request, initial.id)).revision).toBe(revision);
  await child.close();
});

test("mirrors real native minimization frames and restores committed output on cancel", async ({ page, request }) => {
  test.setTimeout(180000);
  const project = await prepare(page, request, [{ name: "prepared1STP.pdb", mimeType: "chemical/x-pdb",
    buffer: await readFile("tests/fixtures/minimization/1stp-protein-prepared.pdb") }], "Presentation minimization");
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByLabel("Select by").selectOption("residue_number");
  for (const residue of [1, 2, 3, 4]) {
    if (residue > 1) await page.getByRole("group", { name: "Operation mode" }).getByRole("button", { name: "add", exact: true }).click();
    await page.getByLabel("Value", { exact: true }).fill(String(residue));
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
  }
  await page.getByRole("group", { name: "Operation mode" }).getByRole("button", { name: "subtract", exact: true }).click();
  await page.getByLabel("Select by").selectOption("element"); await page.getByLabel("Value", { exact: true }).fill("H");
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  const before = await structures(request, project);
  const child = await openPresentation(page);
  const baseline = await frame(child);
  await startAdvanced(page);
  await expect.poll(async () => (await coordinateEntries(page)).length, { timeout: 60000 }).toBe(1);
  await expect(child.locator(".presentation-preview")).toBeVisible();
  await expect.poll(async () => (await frame(child)).hash).not.toBe(baseline.hash);
  expect(await structures(request, project)).toEqual(before);
  await panel(page).getByRole("button", { name: "Cancel calculation", exact: true }).click();
  await expect.poll(async () => (await coordinateEntries(page)).length).toBe(0);
  await expect(child.locator(".presentation-preview")).toBeHidden();
  await expectMirror(page, child);
  expect(await structures(request, project)).toEqual(before);
  expect((await current(request, project.id)).revision).toBe(project.revision);
  await child.close();
});
