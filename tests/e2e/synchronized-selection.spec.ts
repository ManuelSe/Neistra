import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const FIXTURES = resolve("tests/fixtures/formats");

interface ProjectSummary {
  id: string;
  name: string;
}

interface ProjectEntry {
  id: string;
  name: string;
  source_format: string;
  atom_count: number;
}

interface ProjectRead extends ProjectSummary {
  entries: ProjectEntry[];
}

function uniqueName(testInfo: TestInfo): string {
  return `Synchronized selection ${testInfo.project.name} ${Date.now()}`;
}

async function createProject(
  request: APIRequestContext,
  name: string,
): Promise<ProjectSummary> {
  const response = await request.post("/api/v1/projects", { data: { name } });
  expect(response.status()).toBe(201);
  return (await response.json()) as ProjectSummary;
}

async function openProject(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Projects" }).click();
  const dialog = page.getByRole("dialog", { name: "Projects" });
  await dialog
    .getByRole("button", {
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    })
    .click();
}

async function importStructures(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles([
    resolve(FIXTURES, "protein_models_altloc.pdb"),
    resolve(FIXTURES, "ethanol.mol"),
  ]);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 20_000,
  });
}

async function expectSummary(
  page: Page,
  expected: { atoms: number; residues: number; chains: number; structures: number },
): Promise<void> {
  const summary = page.getByLabel("Current selection summary");
  await expect(summary).toContainText(`Atoms${expected.atoms}`);
  await expect(summary).toContainText(`Residues${expected.residues}`);
  await expect(summary).toContainText(`Chains${expected.chains}`);
  await expect(summary).toContainText(`Structures${expected.structures}`);
}

async function pickVisibleStructure(page: Page): Promise<number> {
  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const offsets = [
    [0.5, 0.5],
    [0.45, 0.5],
    [0.55, 0.5],
    [0.5, 0.45],
    [0.5, 0.55],
    [0.4, 0.5],
    [0.6, 0.5],
    [0.5, 0.4],
    [0.5, 0.6],
  ];
  for (const [x, y] of offsets) {
    await canvas.click({
      position: { x: box!.width * x, y: box!.height * y },
    });
    const status = (await page.locator(".viewer-status").textContent()) ?? "";
    const match = status.match(/\/ (\d+) selected/);
    if (match && Number(match[1]) > 0) return Number(match[1]);
  }
  return 0;
}

test("keeps browser, sequence, inspector, viewer, and saved selection synchronized", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The full three-panel synchronized-selection workflow runs on desktop.",
  );

  const project = await createProject(request, uniqueName(testInfo));
  await page.goto("/");
  await openProject(page, project.name);
  await importStructures(page);

  const state = (await (
    await request.get(`/api/v1/projects/${project.id}`)
  ).json()) as ProjectRead;
  const protein = state.entries.find((entry) => entry.source_format === "pdb");
  const ligand = state.entries.find((entry) => entry.source_format === "mol");
  expect(protein).toBeDefined();
  expect(ligand).toBeDefined();
  const proteinRow = page.locator(`.entry-row[data-entry-id="${protein!.id}"]`);
  const ligandRow = page.locator(`.entry-row[data-entry-id="${ligand!.id}"]`);

  await proteinRow.click();
  await expect(proteinRow).toHaveAttribute("aria-selected", "true");
  await expectSummary(page, {
    atoms: protein!.atom_count,
    residues: 1,
    chains: 1,
    structures: 1,
  });
  await expect(page.locator(".viewer-status")).toContainText(
    `/ ${protein!.atom_count} selected`,
  );

  await ligandRow.click({ modifiers: ["Control"] });
  await expect(ligandRow).toHaveAttribute("aria-selected", "true");
  await expectSummary(page, {
    atoms: protein!.atom_count + ligand!.atom_count,
    residues: 2,
    chains: 2,
    structures: 2,
  });
  await page.waitForTimeout(500);
  await expectSummary(page, {
    atoms: protein!.atom_count + ligand!.atom_count,
    residues: 2,
    chains: 2,
    structures: 2,
  });
  await ligandRow.click({ modifiers: ["Alt"] });
  await expect(ligandRow).toHaveAttribute("aria-selected", "false");
  await expectSummary(page, {
    atoms: protein!.atom_count,
    residues: 1,
    chains: 1,
    structures: 1,
  });

  await page.getByRole("tab", { name: "sequence" }).click();
  const residue = page.getByRole("button", { name: /GLY 10/ });
  await residue.click();
  await expect(residue).toHaveAttribute("aria-pressed", "true");
  await expect(proteinRow).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "selection" }).click();
  await expect(page.locator(".selection-meta")).toContainText("from sequence");

  await page.getByLabel("Select by").selectOption("element");
  await page.getByLabel("Value").fill("O");
  await page.getByRole("button", { name: "Apply query" }).click();
  await expectSummary(page, { atoms: 2, residues: 2, chains: 2, structures: 2 });
  await page.getByLabel("Within (angstrom)").fill("0");
  await page.getByRole("button", { name: "Run distance selection" }).click();
  await expect(page.getByLabel("Running selection operation")).toBeHidden();
  await expectSummary(page, { atoms: 2, residues: 2, chains: 2, structures: 2 });

  await page
    .getByRole("group", { name: "Viewer pick" })
    .getByRole("button", { name: "structure", exact: true })
    .click();
  const pickedAtoms = await pickVisibleStructure(page);
  expect(pickedAtoms).toBeGreaterThan(0);
  await expect(page.locator(".selection-meta")).toContainText("from viewer");
  const stableViewerStatus = await page.locator(".viewer-status").textContent();
  await page.waitForTimeout(400);
  await expect(page.locator(".viewer-status")).toHaveText(stableViewerStatus ?? "");

  await proteinRow.click();
  const nameInput = page.getByPlaceholder("Selection name");
  await nameInput.fill("Glycine site");
  await page.getByRole("button", { name: "Save current selection" }).click();
  const saved = page
    .locator(".saved-selection-row")
    .filter({ hasText: "Glycine site" });
  await expect(saved).toContainText(`${protein!.atom_count} atoms`);

  await nameInput.fill("Glycine site");
  await page.getByRole("button", { name: "Save current selection" }).click();
  await expect(page.locator(".notice[role='alert']")).toContainText(
    'A saved selection named "Glycine site" already exists',
  );
  await expect(page.locator(".saved-selection-row")).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("/ 0 selected", {
    timeout: 20_000,
  });
  const persisted = page
    .locator(".saved-selection-row")
    .filter({ hasText: "Glycine site" });
  await expect(persisted).toBeVisible();
  await persisted.getByRole("button").first().click();
  await expect(page.locator(".viewer-status")).toContainText(
    `/ ${protein!.atom_count} selected`,
  );
  await expect(proteinRow).toHaveAttribute("aria-selected", "true");

  await page.getByPlaceholder("Search structures").fill("does-not-exist");
  await expect(page.getByText("No matching structures")).toBeVisible();
  await page.getByPlaceholder("Search structures").clear();

  await proteinRow.getByRole("button", { name: `Actions for ${protein!.name}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete structure" });
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect(proteinRow).toBeHidden();
  await expect(page.locator(".viewer-status")).toContainText("/ 0 selected");
  await expect(persisted).toContainText("0 atoms");
  await expect(
    persisted.getByLabel("1 saved selection warnings"),
  ).toHaveAttribute(
    "title",
    /atom references were removed/i,
  );
});
