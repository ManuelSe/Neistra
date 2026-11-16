import { expect, test, type Page } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { observe } from "./support/modeling";

const selection = (page: Page) => page.evaluate(async () => {
  const path = "/src/store/selection.ts";
  return (await import(/* @vite-ignore */ path)).useSelectionStore.getState().selection;
});

for (const theme of ["light", "dark"] as const) test(`chooses exact repeated ligand instances without changing selection or molecular data (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  let project = await prepare(page, request, [{ name: "repeated.smi", mimeType: "chemical/x-daylight-smiles",
    buffer: Buffer.from("CCO.CCO repeated\n") }], "Exact ligand occurrences");
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}`;
  const read = async () => (await (await request.get(path)).json()) as Project;
  expect(entry.ligand_designation.status).toBe("selection_required");
  const original = await (await request.get(`${path}/entries/${entry.id}/original`)).body();
  const structure = (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()).structure;
  const themeButton = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await themeButton.count()) await themeButton.click();
  await observe(page);
  const camera = await page.evaluate(() => window.editingPicks.camera());
  const initialSelection = await selection(page);
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "Inspector", exact: true }).click();
  const controls = page.getByRole("region", { name: "Ligand of interest", exact: true });
  await controls.getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
  await expect(controls).toContainText("Choose a ligand");
  const initial = await read();
  await controls.getByRole("button", { name: "Choose", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
  const radios = dialog.getByRole("radio");
  await expect(radios).toHaveCount(2);
  expect(await radios.nth(0).getAttribute("aria-label")).not.toBe(await radios.nth(1).getAttribute("aria-label"));
  await expect(dialog.getByRole("button", { name: "Use ligand", exact: true })).toBeDisabled();
  await radios.nth(0).focus();
  await page.keyboard.press("Space");
  await expect(radios.nth(0)).toBeChecked();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await read()).toEqual(initial);
  expect(await selection(page)).toEqual(initialSelection);

  await controls.getByRole("button", { name: "Choose", exact: true }).click();
  await expect(radios).toHaveCount(2);
  await expect(dialog.locator(".ligand-candidate-depiction img")).toHaveCount(2);
  await expect.poll(() => dialog.locator(".ligand-candidate-depiction img").evaluateAll(images =>
    images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await radios.nth(1).check();
  await dialog.getByRole("button", { name: "Use ligand", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await read()).entries[0].ligand_designation.status).toBe("resolved");
  project = await read();
  const chosen = project.entries[0].ligand_designation;
  expect(chosen.origin).toBe("manual");
  expect(chosen.atom_ids.length).toBeGreaterThan(1);
  expect(chosen.atom_ids.length).toBeLessThan(entry.atom_count);
  expect(chosen.source_artifact_id).toBe(entry.current_artifact_id);
  await controls.getByRole("button", { name: "Clear", exact: true }).click();
  await expect.poll(async () => (await read()).entries[0].ligand_designation.status).toBe("cleared");
  if (info.project.name === "mobile-chromium") await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await read()).entries[0].ligand_designation).toEqual(chosen);
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await expect.poll(async () => (await read()).entries[0].ligand_designation.status).toBe("cleared");
  expect(await selection(page)).toEqual(initialSelection);
  expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(camera);
  expect((await read()).entries[0].visible).toBe(entry.visible);
  expect((await read()).entries[0].current_artifact_id).toBe(entry.current_artifact_id);
  expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(original);
  expect((await (await request.get(`${path}/entries/${entry.id}/structure`)).json()).structure).toEqual(structure);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await expect.poll(async () => (await read()).entries[0].ligand_designation.status).toBe("cleared");
  expect((await read()).revision).toBe(project.revision + 3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`ligand-designation-${theme}.png`) });
});
