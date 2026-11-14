import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Project, Selection, StructureProjection } from "../../apps/web/src/api/types";

async function selectCanonical(page: Page, selection: Selection) {
  await page.evaluate(async target => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path);
    useSelectionStore.getState().replace(target);
  }, selection);
}

test("explicit residue recovery and channel resets preserve their independent settings through reload", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const created = await request.post("/api/v1/projects", { data: { name: `Styling recovery ${info.project.name} ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const initial: Project = await created.json();
  const imported = await request.post(`/api/v1/projects/${initial.id}/imports`, { multipart: {
    expected_revision: "0", files: { name: "protein_editing.pdb", mimeType: "chemical/x-pdb", buffer: readFileSync("tests/fixtures/formats/protein_editing.pdb") },
  } });
  expect(imported.status()).toBe(201);
  const project: Project = (await imported.json()).project;
  const entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  const residue = projection.structure.residues.find(candidate => {
    const atoms = projection.structure.atoms.filter(atom => atom.residue_id === candidate.id);
    return atoms.length > 1 && atoms.some(atom => atom.name === "CA");
  })!;
  const ids = projection.structure.atoms.filter(atom => atom.residue_id === residue.id).map(atom => atom.id).sort((a, b) => a - b);
  expect(ids.length).toBeGreaterThan(1);
  const complete: Selection = { schema_version: 1, atoms: ids.map(atom_id => ({ structure_id: entry.id, atom_id })), granularity: "residue", source: "inspector" };
  const readSettings = async () => {
    const response = await request.get(`/api/v1/projects/${project.id}`);
    expect(response.status()).toBe(200);
    return ((await response.json()) as Project).entries[0].viewer_settings;
  };
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await selectCanonical(page, { ...complete, atoms: complete.atoms.slice(0, 1), granularity: "atom" });
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Style selection", exact: true });
  await expect(dialog.getByText(`Expand to ${ids.length} atoms in 1 residue.`, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cartoon", exact: true })).toBeDisabled();
  await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
  await dialog.getByRole("button", { name: "Expand to complete residues", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText(`/ ${ids.length} selected`);
  await expect(dialog.getByRole("button", { name: "Cartoon", exact: true })).toBeEnabled();
  expect(await page.evaluate(async () => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path);
    return useSelectionStore.getState().selection;
  })).toEqual(complete);

  const apply = async (label: string, feedback: string) => {
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await expect(dialog.getByRole("status").filter({ hasText: feedback })).toBeVisible();
  };
  await apply("Thin sticks", "Applied Thin sticks.");
  await apply("Cartoon", "Applied Cartoon.");
  await expect.poll(async () => (await readSettings()).selection_representations).toEqual([
    { style: "cartoon", atom_ids: ids }, { style: "stick", atom_ids: ids },
  ]);
  await apply("Hide atom detail", "Atom detail hidden.");
  await expect(dialog.getByLabel("Atom detail state")).toHaveText("Hidden · Selection: Thin sticks");
  await apply("Reset polymer representation", "Polymer representation reset to entry defaults.");
  let settings = await readSettings();
  expect(settings.selection_representations).toEqual([{ style: "stick", atom_ids: ids }]);
  expect(settings.selection_hidden_atoms).toEqual(ids);
  await expect(dialog.getByLabel("Polymer state")).toHaveText("Entry default: Cartoon");
  await apply("Backbone trace", "Applied Backbone trace.");
  await apply("Reset atom detail", "Atom detail reset to entry defaults.");
  settings = await readSettings();
  expect(settings.selection_representations).toEqual([{ style: "backbone", atom_ids: ids }]);
  expect(settings.selection_hidden_atoms).toEqual([]);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  expect(await readSettings()).toEqual(settings);
  await selectCanonical(page, complete);
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await expect(dialog.getByLabel("Atom detail state")).toHaveText("Entry default: None");
  await expect(dialog.getByLabel("Polymer state")).toHaveText("Selection: Backbone trace");
  await page.screenshot({ path: info.outputPath("selection-channel-recovery.png") });
});
