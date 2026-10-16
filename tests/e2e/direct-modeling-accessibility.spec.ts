import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Project } from "../../apps/web/src/api/types";
import { newEmptyProject, observe, previewState } from "./support/modeling";
import { cyanPixels } from "./support/interactions";

test("reveals a nonpickable placement with reachable controls in both themes and narrow layouts", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await newEmptyProject(page, request);
  await page.locator(".project-stage").getByRole("button", { name: "New molecule", exact: true }).click();
  const creation = page.getByRole("dialog", { name: "New molecule", exact: true });
  expect((await new AxeBuilder({ page }).include(".new-molecule-form").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await creation.getByRole("button", { name: "Create molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await expect(panel).toBeVisible();
  const current = await (await request.get(`/api/v1/projects/${initial.id}`)).json() as Project;
  await panel.getByText("Add atom", { exact: true }).click();
  await panel.getByRole("button", { name: "Preview atom", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Use ${theme} theme`, exact: true }).click();
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
    await expect(panel.getByRole("group", { name: "Placement inspection" })).toBeVisible();
    await observe(page);
    const native = await previewState(page);
    expect(native.objects.length).toBeGreaterThan(0);
    expect(native.objects.every(object => !object.pickable && object.drawCount > 0)).toBe(true);
    await expect.poll(() => cyanPixels(page)).toBeGreaterThan(20);
    const point = await page.evaluate(p => window.editingPicks.point(p), native.preview!.atoms[0].coordinates);
    const canvas = (await page.locator(".molstar-host canvas").first().boundingBox())!;
    expect(await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest(".molecular-edit-panel, .notice"), { x: canvas.x + point.x, y: canvas.y + point.y })).toBe(true);
    const bounds = (await panel.boundingBox())!;
    expect(bounds.height).toBeLessThanOrEqual(70);
    for (const control of await panel.getByRole("button").all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      await control.focus(); await expect(control).toBeFocused();
      expect(await control.evaluate(node => { const box = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); })).toBe(true);
    }
    expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${theme}-unobstructed-placement.png`) });
    await panel.getByRole("button", { name: "Placement tools", exact: true }).click();
    const more = panel.getByText("More elements and formal charge", { exact: true });
    if (!(await more.evaluate(node => node.closest("details")!.open))) await more.click();
    expect((await new AxeBuilder({ page }).include(".molecular-edit-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await panel.getByRole("button", { name: "Inspect placement", exact: true }).click();
  }
  await panel.getByRole("button", { name: "Cancel placement", exact: true }).click();
  expect((await (await request.get(`/api/v1/projects/${initial.id}`)).json()).revision).toBe(current.revision);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Edit molecule", exact: true })).toBeFocused();
  if (info.project.name === "chromium") {
    // Closed launcher ownership survives the actual desktop/mobile viewer swap.
    for (const width of [800, 1000]) {
      await page.setViewportSize({ width, height: 720 });
      await expect(page.getByRole("button", { name: "Edit molecule", exact: true })).toBeFocused();
    }
  }
});
