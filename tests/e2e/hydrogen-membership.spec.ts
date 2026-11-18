import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import type { observeEditPicks } from "../../apps/web/src/test/molecularEditHarness";

declare global { interface Window { editingPicks: Awaited<ReturnType<typeof observeEditPicks>> } }

test("keeps bonded orphan H in the ligand and enables editing an unrelated native atom", async ({ page, request }, info) => {
  test.setTimeout(90000);
  const response = await request.post("/api/v1/projects/import-archive", { multipart: {
    operation_id: `orphan-h-${Date.now()}`,
    file: { name: "paracetamol.molweave.zip", mimeType: "application/vnd.molweave.project+zip", buffer: await readFile("tests/fixtures/modeling/paracetamol-orphan-h.molweave.zip") },
  } });
  expect(response.status()).toBe(201);
  let project = (await response.json()).project as Project;
  project = await (await request.patch(`/api/v1/projects/${project.id}`, { data: {
    expected_revision: project.revision, name: `Orphan H ${info.project.name} ${Date.now()}`,
  } })).json() as Project;
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}/entries/${entry.id}`;
  const initial: StructureProjection = await (await request.get(`${path}/structure`)).json();
  const original = await (await request.get(`${path}/original`)).body();
  expect(entry.ligand_designation.status).toBe("unresolved");
  expect(entry.ligand_designation.assessed_at).toBeNull();
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const source = await route.fetch();
    await route.fulfill({ response: source, body: `${await source.text()}\nconst originalMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await originalMount.call(this,target); (window.interactionEngines ??= []).push(this); };` });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  // Opening this legacy archive completes its first durable ligand assessment.
  // Establish that transition separately from the read-only native operations.
  await expect.poll(async () => ((await (await request.get(`/api/v1/projects/${project.id}`)).json()) as Project)
    .entries[0].ligand_designation.assessed_at).not.toBeNull();
  const assessed = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  expect(assessed.revision).toBe(project.revision + 1);
  expect(assessed.history).toEqual(project.history);
  expect(assessed.entries[0].ligand_designation).toMatchObject({
    status: "resolved", origin: "automatic_single_candidate",
    source_artifact_id: entry.current_artifact_id, assessed_revision: assessed.revision,
    atom_ids: initial.structure.atoms.map(atom => atom.id).sort((a, b) => a - b),
  });
  // Persisted intent differs from the untouched saved checkpoint, so the read
  // model marks the entry dirty. Other source/molecular fields stay identical.
  expect(entry.dirty).toBe(false);
  expect(assessed.entries[0].dirty).toBe(true);
  const entryBeforeAssessment = { ...entry, ligand_designation: null, modified_at: null, dirty: null };
  expect({ ...assessed.entries[0], ligand_designation: null, modified_at: null, dirty: null }).toEqual(entryBeforeAssessment);
  project = assessed;
  const before: StructureProjection = await (await request.get(`${path}/structure`)).json();
  expect(before.structure).toEqual(initial.structure);
  expect(before.hierarchy).toEqual(initial.hierarchy);
  expect(before.artifact_id).toBe(initial.artifact_id);
  expect(before.entry_id).toBe(initial.entry_id);
  expect(before.hierarchy.components).toHaveLength(1);
  expect(before.structure.atoms.filter(atom => atom.residue_id === null)).toHaveLength(3);
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.length ?? 0)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
  await page.evaluate(async () => {
    const modulePath = "/src/test/molecularEditHarness.ts";
    const { observeEditPicks } = await import(/* @vite-ignore */ modulePath);
    window.editingPicks = await observeEditPicks(window.interactionEngines.at(-1)!);
    await window.editingPicks.settled();
  });
  const target = before.structure.atoms.find(atom => atom.element === "O")!;
  const point = await page.evaluate(coordinates => window.editingPicks.point(coordinates), target.coordinates);
  await page.locator(".molstar-host canvas").first().click({ position: point });
  await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await expect(panel.getByRole("button", { name: "Replace selected atom with N", exact: true })).toBeEnabled();
  await expect(panel.getByText("Covalent bonds cross the component boundary.")).toHaveCount(0);
  const after: StructureProjection = await (await request.get(`${path}/structure`)).json();
  expect(after.structure).toEqual(before.structure);
  expect((await (await request.get(`/api/v1/projects/${project.id}`)).json()).revision).toBe(project.revision);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(project);
  expect(await (await request.get(`${path}/original`)).body()).toEqual(original);
  await page.screenshot({ path: info.outputPath("orphan-h-enabled.png") });
});
