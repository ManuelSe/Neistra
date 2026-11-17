import { expect, test, type Page } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";

async function selection(page: Page) {
  return page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    const state = useSelectionStore.getState();
    return { selection: state.selection, order: state.inspectionOrder, anchor: state.rangeAnchor };
  });
}

for (const theme of ["light", "dark"] as const) test(`ligand choice retains the stopped measurement draft (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const project = await prepare(page, request, [{ name: "two-occurrences.smi", mimeType: "chemical/x-daylight-smiles",
    buffer: Buffer.from("CCO.CCO exact repeated instances\n") }], `Combined measurement and ligand ${theme}`);
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  const original = await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/original`)).body();
  const before = await selection(page);
  await page.getByRole("button", { name: "Measurements", exact: true }).click();
  const tool = page.getByRole("dialog", { name: "Measurements", exact: true });
  await tool.getByRole("button", { name: "Angle", exact: true }).click();
  await tool.getByLabel("Measurement name", { exact: true }).fill("Retained ordered angle");
  for (const [index, atom] of [3, 1, 2].entries()) {
    await tool.getByRole("button", { name: `Choose atom for target ${index + 1}`, exact: true }).click();
    const chooser = tool.getByRole("region", { name: "Choose measurement atom", exact: true });
    await chooser.getByRole("list", { name: "Available measurement structures", exact: true }).getByRole("button").first().click();
    await chooser.getByRole("list", { name: "Available measurement atoms", exact: true })
      .getByRole("button", { name: new RegExp(` · atom ${atom}$`) }).click();
  }
  const targets = await tool.locator(".measurement-target").allTextContents();
  expect(targets).toHaveLength(3);
  for (const [index, atom] of [3, 1, 2].entries()) expect(targets[index]).toMatch(new RegExp(` · atom ${atom}$`));
  await tool.getByRole("button", { name: "Pick in viewer", exact: true }).click();
  const inspector = page.getByRole("button", { name: "Inspector", exact: true });
  if (await inspector.isVisible()) await inspector.click();
  const controls = page.getByRole("region", { name: "Ligand of interest", exact: true });
  await controls.getByRole("combobox", { name: "Entry", exact: true }).selectOption(project.entries[0].id);
  const launcher = controls.getByRole("button", { name: "Choose", exact: true });
  await launcher.click();
  const choices = page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
  await expect(choices.getByRole("radio")).toHaveCount(2);
  await choices.getByRole("radio").nth(1).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expect(choices).toBeHidden();
  await expect(launcher).toBeFocused();
  await expect(tool).toBeVisible();
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await drawer.isVisible()) { await page.keyboard.press("Escape"); await expect(drawer).toBeHidden(); }
  await expect(tool).toBeVisible();
  await tool.getByRole("button", { name: "Review targets", exact: true }).click();
  await expect(tool.getByLabel("Measurement name", { exact: true })).toHaveValue("Retained ordered angle");
  await expect(tool.locator(".measurement-target")).toHaveText(targets);
  await expect(tool.locator('.measurement-target[aria-pressed="true"]')).toHaveCount(0);
  expect(await selection(page)).toEqual(before);
  const current: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(current).toEqual(project);
  expect(current.measurements).toEqual([]);
  expect(current.entries[0].ligand_designation.status).toBe("selection_required");
  expect(await (await request.get(`/api/v1/projects/${project.id}/entries/${project.entries[0].id}/original`)).body()).toEqual(original);
  await info.attach("retained-ordered-draft", { body: JSON.stringify({ theme, targets, selection: before }), contentType: "application/json" });
});
