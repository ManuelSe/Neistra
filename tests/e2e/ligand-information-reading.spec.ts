import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import type { PropertyPreferences } from "../../apps/web/src/ligandProperties/types";
import { prepare } from "./support/interactions";
import { openInspectorTools, openLigandInformation } from "./support/navigation";

const inspector = (page: Page) => page.getByRole("region", { name: "Project inspector", exact: true });
async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function reading(anchor: Locator) {
  return anchor.evaluate(node => {
    const owner = node.closest(".inspector-scroll");
    if (!(owner instanceof HTMLElement)) throw new Error("Expected Inspector reading owner");
    const bounds = owner.getBoundingClientRect(), rect = node.getBoundingClientRect();
    return { offset: rect.top - bounds.top, bottom: rect.bottom - bounds.top,
      top: owner.scrollTop, viewport: owner.clientHeight, width: owner.clientWidth, label: node.textContent };
  });
}

test("retains the logical reading point through actual responsive reflow and clears hidden entry visits", async ({ page, request }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 900, height: 600 });
  const project = await prepare(page, request, [
    { name: "reading-boundary-a.smi", mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCO ethanol\n") },
    { name: "reading-boundary-b.smi", mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCC propane\n") },
  ], "Inspector responsive reading boundaries");
  const endpoint = `/api/v1/projects/${project.id}`, [a, b] = project.entries;
  expect(project.entries).toHaveLength(2);
  const before = await (await request.get(endpoint)).json() as Project;
  const originals = await Promise.all(project.entries.map(async entry => (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()));
  await page.getByRole("separator", { name: "Resize inspector", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-panel-id="inspector-panel"]')).toHaveAttribute("data-panel-size", "17.0");
  await openLigandInformation(page);
  await inspector(page).getByRole("combobox", { name: "Entry", exact: true }).selectOption(a.id);
  await expect(inspector(page).locator(".ligand-properties-groups dt")).toHaveCount(14, { timeout: 30_000 });
  const records: object[] = [];
  try {
    for (const theme of ["light", "dark"] as const) {
      const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await toggle.isVisible()) await toggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      for (const view of ["ligand", "tools"] as const) {
        if (view === "ligand") await openLigandInformation(page); else await openInspectorTools(page);
        const anchor = inspector(page).getByText(view === "ligand" ? "Profile" : "Operation mode", { exact: true });
        await inspector(page).locator(".inspector-scroll").hover();
        await page.mouse.wheel(0, 300); await frames(page);
        const initial = await reading(anchor);
        expect(initial.top).toBeGreaterThan(100); expect(initial.offset).toBeGreaterThanOrEqual(0);
        expect(initial.bottom).toBeLessThanOrEqual(initial.viewport);
        await page.setViewportSize({ width: 393, height: 600 });
        await expect(page.getByRole("button", { name: "Inspector", exact: true })).toBeVisible();
        if (!await inspector(page).isVisible()) {
          await page.getByRole("button", { name: "Inspector", exact: true }).focus();
          await page.keyboard.press("Enter");
        }
        await expect(inspector(page)).toBeVisible(); await frames(page);
        const narrow = await reading(anchor);
        records.push({ theme, view, initial, narrow });
        expect(narrow.width).not.toBe(initial.width);
        expect(Math.abs(narrow.offset - initial.offset)).toBeLessThanOrEqual(1);
        const heading = inspector(page).getByRole("heading", { name: view === "ligand" ? "Ligand information" : "Selection", exact: true });
        await expect(heading).toBeFocused();
        await page.setViewportSize({ width: 900, height: 600 });
        await expect(page.getByRole("button", { name: "Inspector", exact: true })).toBeHidden();
        await expect(inspector(page)).toBeVisible(); await frames(page);
        const expanded = await reading(anchor);
        records.push({ theme, view, expanded });
        expect(Math.abs(expanded.offset - initial.offset)).toBeLessThanOrEqual(1);
        await expect(page.locator('[data-panel-id="inspector-panel"]')).toHaveAttribute("data-panel-size", "17.0");
      }
    }
    await openLigandInformation(page);
    await inspector(page).locator(".inspector-scroll").hover(); await page.mouse.wheel(0, 300); await frames(page);
    await inspector(page).getByRole("button", { name: "Collapse inspector", exact: true }).focus();
    await page.keyboard.press("Enter"); await expect(inspector(page)).toBeHidden();
    for (const entry of [b, a]) {
      const row = page.locator(`.entry-row[data-entry-id="${entry.id}"]`);
      await row.locator(".entry-select").click(); await expect(row).toHaveAttribute("data-inspected", "true");
    }
    await page.getByRole("button", { name: "Expand inspector", exact: true }).focus();
    await page.keyboard.press("Enter"); await expect(inspector(page)).toBeVisible(); await frames(page);
    expect(await inspector(page).locator(".inspector-scroll").evaluate(node => node.scrollTop)).toBe(0);
    await expect(inspector(page).getByRole("combobox", { name: "Entry", exact: true })).toHaveValue(a.id);
    expect(await (await request.get(endpoint)).json()).toEqual(before);
    for (let i = 0; i < project.entries.length; i++) {
      expect(await (await request.get(`${endpoint}/entries/${project.entries[i].id}/original`)).body()).toEqual(originals[i]);
    }
  } finally {
    await info.attach("inspector-responsive-reading-boundaries", { body: JSON.stringify(records), contentType: "application/json" });
  }
});

for (const theme of ["light", "dark"] as const) test(`retains connected edit reading when properties precede the current header (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 900, height: 600 });
  const preferencePath = "/api/v1/workspace/ligand-property-preferences";
  const originalPreferences = await (await request.get(preferencePath)).json() as PropertyPreferences;
  if (!originalPreferences.enabled_categories.includes("composition")) {
    expect((await request.put(preferencePath, { data: { expected_revision: originalPreferences.revision,
      enabled_categories: [...originalPreferences.enabled_categories, "composition"] } })).ok()).toBe(true);
  }
  let release!: () => void, captured!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { captured = resolve; });
  const records: object[] = [];
  try {
    const project = await prepare(page, request, [{ name: "connected-reading.smi", mimeType: "chemical/x-daylight-smiles",
      buffer: Buffer.from("CCO ethanol\n") }], `Connected edit reading ${theme}`);
    const entry = project.entries[0], endpoint = `/api/v1/projects/${project.id}`;
    const original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await openInspectorTools(page);
    await inspector(page).getByRole("tab", { name: "selection", exact: true }).click();
    await inspector(page).getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
    await inspector(page).getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:1`);
    await inspector(page).getByRole("button", { name: "Apply query", exact: true }).click();
    await openLigandInformation(page);
    await inspector(page).getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
    const carbon = page.locator(".ligand-information .ligand-properties-groups dt").filter({ hasText: /^Carbon atoms$/ });
    const value = carbon.locator("..").locator("dd");
    await expect(value).toHaveText("2", { timeout: 30_000 });
    await expect(page.locator(".ligand-designated-composition")).toContainText("C2H6O");
    await expect(page.locator(".ligand-candidate-depiction")).toBeVisible();
    await carbon.scrollIntoViewIfNeeded();
    const owner = inspector(page).locator(".inspector-scroll");
    await owner.hover(); await page.mouse.wheel(0, Math.round((await reading(carbon)).offset - 8)); await frames(page);
    const before = await reading(carbon);
    expect(before.top).toBeGreaterThan(100); expect(before.offset).toBeGreaterThanOrEqual(0);
    expect(before.bottom).toBeLessThanOrEqual(before.viewport);
    await page.route(url => url.pathname === `${endpoint}/entries/${entry.id}/ligand-candidates`
      && url.searchParams.get("expected_artifact_id") !== entry.current_artifact_id, async route => {
      const response = await route.fetch(); captured(); await held; await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit molecule", exact: true });
    const accepted = page.waitForResponse(response => response.request().method() === "POST"
      && response.url().endsWith(`/entries/${entry.id}/model-edits`));
    await editor.getByRole("button", { name: "Replace selected atom with N", exact: true }).click();
    const acknowledgement = await accepted; expect(acknowledgement.ok()).toBe(true);
    const next = (await acknowledgement.json() as { project: Project }).project;
    const changed = next.entries.find(item => item.id === entry.id);
    expect(changed?.current_artifact_id).not.toBe(entry.current_artifact_id);
    expect(changed?.ligand_designation.instance_id).toBe(entry.ligand_designation.instance_id);
    await requested;
    await expect(value).toHaveText("1", { timeout: 30_000 });
    await expect(page.locator(".ligand-designated-composition")).toHaveCount(0);
    await editor.getByRole("button", { name: "Close molecular editor", exact: true }).click();
    expect(await page.evaluate(() => !!document.activeElement?.closest(".inspector-scroll"))).toBe(false);
    records.push({ phase: "properties-ready-header-held", before, current: await reading(carbon), entry: changed });
    await info.attach(`connected-edit-${theme}-header-held`, { body: await page.screenshot(), contentType: "image/png" });
    release();
    await expect(page.locator(".ligand-designated-composition")).toContainText("CH5NO", { timeout: 30_000 });
    await expect(page.locator(".ligand-candidate-depiction")).toBeVisible(); await frames(page);
    const after = await reading(carbon); records.push({ phase: "header-settled", after });
    expect(Math.abs(after.offset - before.offset)).toBeLessThanOrEqual(1);
    expect(after.offset).toBeGreaterThanOrEqual(0); expect(after.bottom).toBeLessThanOrEqual(after.viewport);
    await expect(value).toHaveText("1");
    expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
    await info.attach(`connected-edit-${theme}-settled`, { body: await page.screenshot(), contentType: "image/png" });
  } finally {
    release(); await page.unrouteAll({ behavior: "wait" });
    const current = await (await request.get(preferencePath)).json() as PropertyPreferences;
    if (JSON.stringify(current.enabled_categories) !== JSON.stringify(originalPreferences.enabled_categories)) {
      expect((await request.put(preferencePath, { data: { expected_revision: current.revision,
        enabled_categories: originalPreferences.enabled_categories } })).ok()).toBe(true);
    }
    await info.attach("connected-edit-reading", { body: JSON.stringify(records), contentType: "application/json" });
  }
});
