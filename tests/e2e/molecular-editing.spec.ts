import { expect, test, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";

async function selectAtom(page: Page, entryId: string, atomId: number, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entryId}:${atomId}`);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
}

test("performs one selection-driven atom/H edit with exact undo and unchanged original", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Molecular edit");
  const entry = initial.entries[0];
  const path = `/api/v1/projects/${initial.id}`;
  const projection = async () => (await (await request.get(`${path}/entries/${entry.id}/structure`)).json()) as StructureProjection;
  const original = await (await request.get(`${path}/entries/${entry.id}/original`)).body();
  await selectAtom(page, entry.id, 1, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Prepare component hydrogens", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.atoms.length).toBe(9);
  const prepared = (await projection()).structure;
  await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  const h = prepared.atoms.find(atom => atom.element === "H" && prepared.bonds.some(bond =>
    (bond.atom_1_id === 1 && bond.atom_2_id === atom.id) || (bond.atom_2_id === 1 && bond.atom_1_id === atom.id)))!;
  await selectAtom(page, entry.id, h.id, info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Replace selected atom with C", exact: true }).click();
  await expect.poll(async () => (await projection()).structure.atoms.filter(atom => atom.element === "C").length).toBe(3);
  await expect(panel).toBeVisible();
  const after = (await projection()).structure;
  for (const atom of prepared.atoms.filter(atom => atom.id !== h.id)) expect(after.atoms.find(candidate => candidate.id === atom.id)).toEqual(atom);
  const state: Project = await (await request.get(path)).json();
  expect(state.revision).toBe(initial.revision + 2);
  await page.screenshot({ path: info.outputPath("c1-open-atom-editor.png") });
  await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await projection()).structure).toEqual(prepared);
  expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(original);
  await page.screenshot({ path: info.outputPath("c1-atom-edit.png") });
});
