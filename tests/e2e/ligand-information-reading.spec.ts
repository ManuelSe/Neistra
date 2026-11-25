import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
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
