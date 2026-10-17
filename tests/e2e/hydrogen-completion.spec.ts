import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { newEmptyProject, observe, previewState, selectPair } from "./support/modeling";

test("previews additive completion without publication and applies one reversible command", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await newEmptyProject(page, request);
  const created = await (await request.post(`/api/v1/projects/${project.id}/molecules`, { data: { expected_revision: project.revision, name: "Hydrogen building", element: "C", charge: 0 } })).json();
  const entryId = created.entry_id as string;
  const path = `/api/v1/projects/${project.id}`;
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await observe(page);
  await selectPair(page, entryId, [1], info.project.name === "mobile-chromium");
  const before: Project = await (await request.get(path)).json();
  const original = (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure;
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByText("Hydrogen tools", { exact: true }).click();
  await panel.getByRole("button", { name: "Preview completion", exact: true }).click();
  await expect.poll(async () => (await previewState(page)).preview?.atoms.length ?? 0).toBeGreaterThan(0);
  expect((await (await request.get(path)).json()).revision).toBe(before.revision);
  await panel.getByRole("button", { name: "Placement tools", exact: true }).click();
  await expect(panel.getByLabel("Hydrogen completion report")).toContainText("4 H proposed");
  await page.screenshot({ path: info.outputPath("hydrogen-completion-preview.png") });
  await panel.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await (await request.get(path)).json()).revision).toBe(before.revision + 1);
  const after = (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure;
  expect(after.atoms).toHaveLength(5);
  expect(after.atoms[0]).toEqual(original.atoms[0]);
  await panel.getByRole("button", { name: "Close molecular editor" }).click();
  await page.getByRole("button", { name: /^Undo: Complete hydrogens/ }).click();
  await expect.poll(async () => (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure).toEqual(original);
  await page.getByRole("button", { name: /^Redo: Complete hydrogens/ }).click();
  await expect.poll(async () => (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure).toEqual(after);
});

test("explicit H count previews unknown-chemistry drafts and resets on Cancel", async ({ page, request }, info) => {
  test.setTimeout(120000);
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
  await panel.getByText("Hydrogen tools", { exact: true }).click();
  await panel.getByRole("spinbutton", { name: "Hydrogens to add", exact: true }).fill("3");
  await panel.getByRole("button", { name: "Preview added H", exact: true }).click();
  await expect.poll(async () => (await previewState(page)).preview?.atoms.length ?? 0).toBeGreaterThan(0);
  await panel.getByRole("button", { name: "Next orientation", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Cancel placement", exact: true }).click();
  await expect.poll(async () => (await previewState(page)).preview?.atoms.length ?? 0).toBe(0);
  expect((await (await request.get(path)).json()).revision).toBe(created.project.revision);
  await panel.getByRole("button", { name: "Preview added H", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure.atoms.length).toBe(4);
  const after = (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure;
  expect(after.atoms[0].formal_charge).toBeNull();
  expect(after.atoms.filter(a => a.element === "H")).toHaveLength(3);
  await page.screenshot({ path: info.outputPath("explicit-hydrogen-draft.png") });
});

test("applies supported entry sites and explains unresolved sites without a second command", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await newEmptyProject(page, request);
  const created = await (await request.post(`/api/v1/projects/${project.id}/molecules`, { data: { expected_revision: project.revision, name: "Partial hydrogen entry", element: "C", charge: 0 } })).json();
  const entryId = created.entry_id as string;
  const path = `/api/v1/projects/${project.id}`;
  const result = await (await request.post(`${path}/entries/${entryId}/model-edits`, { data: {
    expected_revision: created.project.revision, expected_artifact_id: created.project.entries[0].current_artifact_id,
    selection: { schema_version: 1, atoms: [], granularity: "atom", source: "inspector" },
    action: { operation: "atom.add", element: "O", charge: null, coordinates: [4,0,0] },
  } })).json();
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await observe(page);
  await selectPair(page, entryId, [1], info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await panel.getByText("Hydrogen tools", { exact: true }).click();
  await panel.getByRole("combobox", { name: "Completion scope", exact: true }).selectOption("entry");
  await panel.getByRole("button", { name: "Preview completion", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Placement tools", exact: true }).click();
  await expect(panel.getByLabel("Hydrogen completion report")).toContainText("partial: 4 H proposed");
  await expect(panel.getByLabel("Hydrogen completion report")).toContainText("1 skipped");
  await panel.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await (await request.get(path)).json()).revision).toBe(result.project.revision + 1);
  await panel.getByRole("button", { name: "Preview completion", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Placement tools", exact: true }).click();
  await expect(panel.getByLabel("Hydrogen completion report")).toContainText("unresolved: 0 H proposed");
  await panel.getByText("Hydrogen diagnostics (1)", { exact: true }).click();
  await expect(panel.getByText(/Atom 2: Automatic completion requires an assigned parent formal charge/)).toBeVisible();
  expect((await (await request.get(path)).json()).revision).toBe(result.project.revision + 1);
  const after = (await (await request.get(`${path}/entries/${entryId}/structure`)).json() as StructureProjection).structure;
  expect(after.atoms.find(a => a.id === 2)?.formal_charge).toBeNull();
  await page.screenshot({ path: info.outputPath("partial-hydrogen-diagnostics.png") });
});
