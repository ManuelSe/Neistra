import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { newEmptyProject, observe, selectPair } from "./support/modeling";

// Retained HTTP operations remain compatible although their UI launchers retired.
test("retains additive completion preview and exact history through the legacy API", async ({ page, request }) => {
  const project = await newEmptyProject(page, request);
  const created = await (await request.post(`/api/v1/projects/${project.id}/molecules`, { data: { expected_revision: project.revision, name: "Legacy hydrogen API", element: "C", charge: 0 } })).json();
  const entryId = created.entry_id as string;
  const path = `/api/v1/projects/${project.id}`;
  const payload = { expected_revision: created.project.revision, expected_artifact_id: created.project.entries[0].current_artifact_id,
    selection: { schema_version: 1, atoms: [{ structure_id: entryId, atom_id: 1 }], granularity: "atom", source: "inspector" },
    action: { operation: "hydrogens.complete", scope: "entry" } };
  const original = (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure;
  const preview = await request.post(`${path}/entries/${entryId}/model-edits/preview`, { data: payload });
  expect(preview.ok()).toBe(true);
  expect((await preview.json()).hydrogen_report.added_hydrogen_count).toBe(4);
  expect((await (await request.get(path)).json()).revision).toBe(created.project.revision);
  const result = await request.post(`${path}/entries/${entryId}/model-edits`, { data: payload });
  expect(result.ok()).toBe(true);
  const current = (await result.json()).project as Project;
  expect(current.revision).toBe(created.project.revision + 1);
  const after = (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure;
  expect(after.atoms).toHaveLength(5);
  expect(after.atoms[0]).toEqual(original.atoms[0]);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await page.getByRole("button", { name: /^Undo: Complete hydrogens/ }).click();
  await expect.poll(async () => (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure).toEqual(original);
  await page.getByRole("button", { name: /^Redo: Complete hydrogens/ }).click();
  await expect.poll(async () => (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure).toEqual(after);
});

test("refuses unknown-charge +H without mutation and retains direct drafting", async ({ page, request }, info) => {
  const project = await newEmptyProject(page, request);
  const created = await (await request.post(`/api/v1/projects/${project.id}/molecules`, { data: { expected_revision: project.revision, name: "Unknown carbon", element: "C", charge: null } })).json();
  const entryId = created.entry_id as string;
  const path = `/api/v1/projects/${project.id}`;
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await observe(page);
  await selectPair(page, entryId, [1], info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Add hydrogen (+H)" }).click();
  await expect(panel.getByRole("alert")).toContainText(/charge/i);
  expect((await (await request.get(path)).json()).revision).toBe(created.project.revision);
  await panel.getByRole("button", { name: "Replace selected atom with N" }).click();
  await expect.poll(async () => (await (await request.get(path)).json()).revision).toBe(created.project.revision + 1);
  await panel.getByText("Automatic hydrogen details", { exact: true }).click();
  await expect(panel.getByLabel("Hydrogen reconciliation report")).toContainText("1 skipped");
  const after = (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure;
  expect(after.atoms).toHaveLength(1);
  expect(after.atoms[0].element).toBe("N");
  expect(after.atoms[0].formal_charge).toBeNull();
});

test("does not refill an explicitly deleted H and cascades hidden terminal H with a heavy parent", async ({ page, request }, info) => {
  const project = await newEmptyProject(page, request);
  const created = await (await request.post(`/api/v1/projects/${project.id}/molecules`, { data: { expected_revision: project.revision, name: "Hydrogen deletion", element: "C", charge: 0 } })).json();
  const entryId = created.entry_id as string;
  const path = `/api/v1/projects/${project.id}`;
  const settings = created.project.entries[0].viewer_settings;
  const hidden = await request.put(`${path}/entries/${entryId}/viewer-settings`, { data: {
    expected_revision: created.project.revision,
    settings: { ...settings, components: { ...settings.components, hydrogens: false, nonpolar_hydrogens: false } },
  } });
  expect(hidden.ok()).toBe(true);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await observe(page);
  await selectPair(page, entryId, [1], info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByRole("button", { name: "Add hydrogen (+H)" }).click();
  const structure = async () => (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure;
  await expect.poll(async () => (await structure()).atoms.length).toBe(2);
  const hydrogen = (await structure()).atoms.find(atom => atom.element === "H")!;
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  await selectPair(page, entryId, [hydrogen.id], info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Delete selected atoms" }).click();
  await expect.poll(async () => (await structure()).atoms.length).toBe(1);
  expect((await structure()).atoms[0].formal_charge).toBe(0);
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  await selectPair(page, entryId, [1], info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Add hydrogen (+H)" }).click();
  await expect.poll(async () => (await structure()).atoms.length).toBe(2);
  await panel.getByRole("button", { name: "Delete selected atoms" }).click();
  await expect.poll(async () => (await structure()).atoms.length).toBe(0);
});
