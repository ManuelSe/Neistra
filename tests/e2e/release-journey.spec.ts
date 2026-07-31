import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const FIXTURES = resolve("tests/fixtures/formats");

interface ProjectEntry {
  id: string;
  name: string;
  original_filename: string;
  atom_count: number;
  viewer_settings: { representations: { style: string }[] };
}

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  checkpoint_revision: number;
  entries: ProjectEntry[];
  measurements: { kind: string }[];
}

interface StructureRead {
  atoms: { id: number; coordinates: [number, number, number] }[];
  residues: { id: number; name: string }[];
}

async function currentProject(
  request: APIRequestContext,
  projectId: string,
): Promise<ProjectRead> {
  const response = await request.get(`/api/v1/projects/${projectId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ProjectRead;
}

async function structure(
  request: APIRequestContext,
  projectId: string,
  entryId: string,
): Promise<StructureRead> {
  const response = await request.get(
    `/api/v1/projects/${projectId}/entries/${entryId}/structure`,
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { structure: StructureRead }).structure;
}

async function selectAtomReferences(
  page: Page,
  references: { entryId: string; atomId: number }[],
): Promise<void> {
  await page.getByRole("tab", { name: "selection" }).click();
  const mode = page.getByRole("group", { name: "Operation mode" });
  await mode.getByRole("button", { name: "replace" }).click();
  await page.getByLabel("Select by").selectOption("atom_reference");
  for (let index = 0; index < references.length; index += 1) {
    if (index === 1) await mode.getByRole("button", { name: "add" }).click();
    await page
      .getByLabel("Value")
      .fill(`${references[index].entryId}:${references[index].atomId}`);
    await page.getByRole("button", { name: "Apply query" }).click();
  }
  await expect(page.getByLabel("Current selection summary")).toContainText(
    `Atoms${references.length}`,
  );
}

async function createMeasurement(
  page: Page,
  entryId: string,
  atomIds: number[],
  kind: "distance" | "angle" | "dihedral",
): Promise<void> {
  await selectAtomReferences(
    page,
    atomIds.map((atomId) => ({ entryId, atomId })),
  );
  await page.getByRole("tab", { name: "measurements" }).click();
  await page.getByPlaceholder("Measurement name").fill(`Release ${kind}`);
  await page.getByRole("button", { name: kind, exact: true }).click();
  await expect(
    page.locator(".measurement-row").filter({
      has: page.getByLabel(`Name for Release ${kind}`),
    }),
  ).toBeVisible();
}

async function expectNonblankCanvas(page: Page): Promise<void> {
  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  const sum = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!context) return 0;
    const pixel = new Uint8Array(4);
    let total = 0;
    for (let x = 2; x < 9; x += 2) {
      for (let y = 2; y < 9; y += 2) {
        context.readPixels(
          Math.floor((element.width * x) / 10),
          Math.floor((element.height * y) / 10),
          1,
          1,
          context.RGBA,
          context.UNSIGNED_BYTE,
          pixel,
        );
        total += pixel[0] + pixel[1] + pixel[2] + pixel[3];
      }
    }
    return total;
  });
  expect(sum).toBeGreaterThan(0);
}

async function dismissNotice(page: Page): Promise<void> {
  const dismiss = page.getByRole("button", { name: "Dismiss message" });
  if (await dismiss.isVisible()) await dismiss.click();
}

async function pickVisibleStructure(page: Page): Promise<void> {
  const canvas = page.locator(".molstar-host canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  for (const [x, y] of [
    [0.4, 0.65],
    [0.68, 0.27],
    [0.5, 0.5],
    [0.45, 0.5],
    [0.55, 0.5],
    [0.5, 0.45],
    [0.5, 0.55],
    [0.4, 0.5],
    [0.6, 0.5],
    [0.5, 0.4],
    [0.5, 0.6],
    [0.45, 0.65],
    [0.55, 0.65],
  ]) {
    await canvas.click({ position: { x: box!.width * x, y: box!.height * y } });
    await page.waitForTimeout(100);
    if (((await page.locator(".viewer-status").textContent()) ?? "").match(/\/ [1-9]\d* selected/)) {
      return;
    }
  }
  throw new Error("The rendered molecular structure could not be picked.");
}

test("completes the MolWeave v0.1 definition-of-done journey", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The complete release journey is desktop-only.");
  test.setTimeout(240_000);
  page.setDefaultTimeout(12_000);
  const projectName = `MolWeave v0.1 release ${Date.now()}`;

  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "Create project" }).click();
  const createDialog = page.getByRole("dialog", { name: "Create project" });
  await createDialog.getByLabel("Name").fill(projectName);
  await createDialog.getByLabel("Description").fill("Definition-of-done project");
  await createDialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: projectName })).toBeVisible();

  const projectsResponse = await request.get("/api/v1/projects");
  const project = ((await projectsResponse.json()) as ProjectRead[]).find(
    (item) => item.name === projectName,
  );
  expect(project).toBeDefined();

  await page.getByRole("button", { name: "Import structures" }).first().click();
  const importDialog = page.getByRole("dialog", { name: "Import structures" });
  await importDialog.locator('input[type="file"]').setInputFiles([
    resolve(FIXTURES, "protein_editing.pdb"),
    resolve(FIXTURES, "ethanol.mol"),
  ]);
  await importDialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(importDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 45_000,
  });
  await expectNonblankCanvas(page);

  let state = await currentProject(request, project!.id);
  const protein = state.entries.find((entry) => entry.original_filename === "protein_editing.pdb");
  const ligand = state.entries.find((entry) => entry.original_filename === "ethanol.mol");
  expect(protein).toBeDefined();
  expect(ligand).toBeDefined();

  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByLabel("Controlled structure").selectOption(protein!.id);
  await page.getByLabel("Add representation").selectOption("surface");
  await expect(page.getByLabel(`Representation style for ${protein!.name}`)).toHaveCount(2);
  await page.getByLabel("Controlled structure").selectOption(ligand!.id);
  await page.getByLabel("Add representation").selectOption("space-filling");
  await expect(page.getByLabel(`Representation style for ${ligand!.name}`)).toHaveCount(2);
  await expectNonblankCanvas(page);
  state = await currentProject(request, project!.id);
  expect(state.entries.find((entry) => entry.id === protein!.id)?.viewer_settings.representations)
    .toEqual(expect.arrayContaining([expect.objectContaining({ style: "surface" })]));
  expect(state.entries.find((entry) => entry.id === ligand!.id)?.viewer_settings.representations)
    .toEqual(expect.arrayContaining([expect.objectContaining({ style: "space-filling" })]));
  await dismissNotice(page);
  await page.getByRole("button", { name: "Close viewer controls" }).click();

  const ligandRow = page.locator(`.entry-row[data-entry-id="${ligand!.id}"]`);
  await ligandRow.locator(".entry-select").click();
  await expect(ligandRow.locator(".entry-select")).toHaveAttribute("aria-pressed", "true");
  await selectAtomReferences(page, [{ entryId: protein!.id, atomId: 1 }]);
  await page.getByRole("group", { name: "Expand current" }).getByRole("button", { name: "residue" }).click();
  await expect(page.getByLabel("Current selection summary")).toContainText("Residues1");
  await page.getByRole("group", { name: "Expand current" }).getByRole("button", { name: "chain" }).click();
  await expect(page.getByLabel("Current selection summary")).toContainText("Chains1");
  await page.getByRole("group", { name: "Expand current" }).getByRole("button", { name: "structure" }).click();
  await expect(page.getByLabel("Current selection summary")).toContainText("Structures1");

  await page.getByRole("tab", { name: "sequence" }).click();
  await page.getByRole("button", { name: "ALA 1", exact: true }).click();
  await page.getByRole("tab", { name: "selection" }).click();
  await expect(page.locator(".selection-meta")).toContainText("from sequence");
  await page.getByRole("group", { name: "Viewer pick" }).getByRole("button", { name: "structure" }).click();
  await pickVisibleStructure(page);
  await expect(page.locator(".selection-meta")).toContainText("from viewer");

  await createMeasurement(page, protein!.id, [1, 2], "distance");
  await createMeasurement(page, protein!.id, [1, 2, 3], "angle");
  await createMeasurement(page, protein!.id, [1, 2, 3, 4], "dihedral");
  state = await currentProject(request, project!.id);
  expect(state.measurements.map((measurement) => measurement.kind).sort()).toEqual([
    "angle",
    "dihedral",
    "distance",
  ]);

  const ligandBefore = await structure(request, project!.id, ligand!.id);
  await page.getByRole("tab", { name: "transform" }).click();
  const transformPanel = page.locator(".transform-panel");
  const transformStructure = transformPanel.locator(".coordinate-section select").first();
  await transformStructure.selectOption(ligand!.id);
  await transformPanel.getByRole("group", { name: "Translation (angstrom)" }).getByLabel("X").fill("1");
  await transformPanel.getByRole("group", { name: "Rotation (degrees)" }).getByLabel("Z").fill("10");
  await transformPanel.getByRole("button", { name: "Apply transform" }).click();
  await expect.poll(async () => (await structure(request, project!.id, ligand!.id)).atoms[0].coordinates)
    .not.toEqual(ligandBefore.atoms[0].coordinates);
  await page.getByRole("button", { name: /Undo: Transform structure/ }).click();
  await expect.poll(async () => (await structure(request, project!.id, ligand!.id)).atoms[0].coordinates)
    .toEqual(ligandBefore.atoms[0].coordinates);
  await page.getByRole("button", { name: /Redo: Transform structure/ }).click();

  await selectAtomReferences(page, [{ entryId: ligand!.id, atomId: 1 }]);
  await page.getByRole("tab", { name: "transform" }).click();
  await transformStructure.selectOption(ligand!.id);
  await transformPanel.getByRole("group", { name: "Scope" }).getByRole("button", { name: "selection" }).click();
  await transformPanel.getByRole("group", { name: "Translation (angstrom)" }).getByLabel("X").fill("0.5");
  await transformPanel.getByRole("group", { name: "Rotation (degrees)" }).getByLabel("Z").fill("15");
  await transformPanel.getByRole("button", { name: "Apply transform" }).click();
  await expect(page.locator(".notice[role='status']")).toContainText("Change stored locally");

  await page.getByRole("tab", { name: "ligand" }).click();
  await page.getByRole("combobox", { name: "Ligand", exact: true }).selectOption(ligand!.id);
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("4");
  await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("1");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(async () => (await currentProject(request, project!.id)).entries.find((entry) => entry.id === ligand!.id)?.atom_count)
    .toBe(4);
  await expect(page.locator(".viewer-error")).toBeHidden({ timeout: 30_000 });

  await page.getByRole("tab", { name: "protein" }).click();
  await page.getByRole("combobox", { name: "Protein", exact: true }).selectOption(protein!.id);
  const targetAminoAcid = page.getByRole("combobox", { name: "Target amino acid" });
  await expect(targetAminoAcid).toHaveValue("ARG");
  await page.getByRole("button", { name: "Apply mutation" }).click();
  await expect.poll(async () => (await structure(request, project!.id, protein!.id)).residues.find((residue) => residue.id === 1)?.name)
    .toBe("ARG");
  await expect(page.locator(".edit-report")).toContainText("not searched across rotamers");
  await expect(page.locator(".viewer-error")).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: /Undo: Mutate residue/ }).click();
  await expect.poll(async () => (await structure(request, project!.id, protein!.id)).residues.find((residue) => residue.id === 1)?.name)
    .toBe("ALA");
  await page.getByRole("button", { name: /Redo: Mutate residue/ }).click();
  await expect.poll(async () => (await structure(request, project!.id, protein!.id)).residues.find((residue) => residue.id === 1)?.name)
    .toBe("ARG");

  await dismissNotice(page);
  await page.getByRole("button", { name: "Save checkpoint" }).click();
  await expect(page.locator(".notice[role='status']")).toContainText("Checkpoint saved");
  await page.reload();
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 45_000 });

  await page.locator(`.entry-row[data-entry-id="${ligand!.id}"] .entry-select`).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export" });
  await exportDialog.getByRole("button", { name: "Selected 1" }).click();
  await exportDialog.getByLabel("Format").selectOption("sdf");
  await exportDialog.getByRole("button", { name: "Generate" }).click();
  const acknowledgement = exportDialog.getByText(/I understand that this format/);
  const download = exportDialog.getByRole("link", { name: "Download" });
  await expect(acknowledgement.or(download)).toBeVisible({ timeout: 20_000 });
  if (await acknowledgement.isVisible()) {
    await acknowledgement.click();
    await exportDialog.getByRole("button", { name: "Generate anyway" }).click();
  }
  await expect(download).toBeVisible({ timeout: 20_000 });
  const downloadPromise = page.waitForEvent("download");
  await download.click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.sdf$/);
  await exportDialog.getByRole("button", { name: "Close", exact: true }).click();

  await dismissNotice(page);
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  let jobDialog = page.getByRole("dialog", { name: "Run job" });
  await jobDialog.getByLabel(new RegExp(`^${ligand!.name}`)).first().check();
  await jobDialog.getByLabel("Steps").fill("2");
  await jobDialog.getByLabel("Delay per step (ms)").fill("20");
  await jobDialog.getByRole("button", { name: "Queue job" }).click();
  const jobDetails = page.locator(".job-detail-pane");
  await expect(jobDetails.locator(".job-status.completed")).toBeVisible({ timeout: 20_000 });
  await jobDetails.getByRole("tab", { name: /Results/ }).click();
  await jobDetails.getByRole("button", { name: "Import" }).click();
  await expect(page.locator(".notice[role='status']")).toContainText("Job result imported");
  await expect(page.locator(".viewer-status")).toContainText("3 visible / 3 loaded", { timeout: 30_000 });

  await page.locator(".jobs-toolbar").getByRole("button", { name: "New" }).click();
  jobDialog = page.getByRole("dialog", { name: "Run job" });
  await jobDialog.getByLabel(new RegExp(`^${ligand!.name}`)).first().check();
  await jobDialog.getByLabel("Steps").fill("100");
  await jobDialog.getByLabel("Delay per step (ms)").fill("5000");
  await jobDialog.getByRole("button", { name: "Queue job" }).click();
  await jobDetails.getByRole("tab", { name: "Overview" }).click();
  await expect(jobDetails.locator(".job-status.running")).toBeVisible({ timeout: 10_000 });
  await jobDetails.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog", { name: "Cancel job" }).getByRole("button", { name: "Cancel job" }).click();
  await expect(jobDetails.locator(".job-status.cancelled")).toBeVisible({ timeout: 15_000 });

  await dismissNotice(page);
  await page.getByRole("button", { name: "Save checkpoint" }).click();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${projectName}`) }).click();
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();
  state = await currentProject(request, project!.id);
  expect(state.checkpoint_revision).toBe(state.revision);
  await expect(page.getByRole("button", { name: /docking|PDBQT|rotamer/i })).toHaveCount(0);
});
