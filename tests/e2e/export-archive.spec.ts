import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Download,
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
  original_artifact_id: string;
  atom_count: number;
  bond_count: number;
  residue_count: number;
  visible: boolean;
  locked: boolean;
  viewer_settings: unknown;
}

interface ProjectRead extends ProjectSummary {
  description: string | null;
  revision: number;
  checkpoint_revision: number;
  entries: ProjectEntry[];
  groups: unknown[];
  saved_selections: unknown[];
  measurements: unknown[];
  scenes: unknown[];
}

function uniqueName(prefix: string, testInfo: TestInfo): string {
  return `${prefix} ${testInfo.project.name} ${Date.now()}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function createProject(
  request: APIRequestContext,
  name: string,
): Promise<ProjectSummary> {
  const response = await request.post("/api/v1/projects", {
    data: { name, description: "Milestone 8 browser project" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as ProjectSummary;
}

async function openProject(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Projects" }).click();
  const dialog = page.getByRole("dialog", { name: "Projects" });
  await dialog
    .getByRole("button", { name: new RegExp(`^${escapeRegex(name)}`) })
    .click();
}

async function importFiles(page: Page, filenames: string[]): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(
    filenames.map((filename) => resolve(FIXTURES, filename)),
  );
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

async function downloadArtifact(
  page: Page,
  dialog: ReturnType<Page["getByRole"]>,
): Promise<{ filename: string; bytes: Buffer }> {
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download" }).click();
  const download = await downloadPromise;
  return {
    filename: download.suggestedFilename(),
    bytes: await downloadBytes(download),
  };
}

async function generateWithLossConsent(
  dialog: ReturnType<Page["getByRole"]>,
): Promise<void> {
  await dialog.getByRole("button", { name: "Generate", exact: true }).click();
  const download = dialog.getByRole("link", { name: "Download" });
  const alert = dialog.getByRole("alert");
  await expect(download.or(alert)).toBeVisible({ timeout: 15_000 });
  if (await alert.isVisible()) {
    await dialog
      .getByLabel("I understand that this format cannot preserve the listed information.")
      .check();
    await dialog.getByRole("button", { name: "Generate anyway" }).click();
    await expect(download).toBeVisible({ timeout: 15_000 });
  }
}

async function projectState(
  request: APIRequestContext,
  projectId: string,
): Promise<ProjectRead> {
  const response = await request.get(`/api/v1/projects/${projectId}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as ProjectRead;
}

test("exports all, selected, and visible structures with deterministic filters and records", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Complete artifact inspection runs once in desktop Chromium.",
  );
  const created = await createProject(request, uniqueName("Complete export", testInfo));
  await page.goto("/");
  await openProject(page, created.name);
  await importFiles(page, [
    "protein_editing.pdb",
    "ethanol.mol",
    "tripos_benzene.mol2",
  ]);
  const state = await projectState(request, created.id);
  const protein = state.entries.find((entry) => entry.source_format === "pdb");
  const ligands = state.entries.filter((entry) => entry.source_format !== "pdb");
  expect(protein).toBeDefined();
  expect(ligands).toHaveLength(2);

  for (const ligand of ligands) {
    const row = page.locator(".entry-row").filter({ hasText: ligand.name }).first();
    await row.getByRole("button", { name: `Hide ${ligand.name}` }).click();
  }
  await page.getByRole("button", { name: "Export", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: "Visible 1" }).click();
  await dialog.getByLabel("Waters").uncheck();
  await dialog.getByLabel("Ions").uncheck();
  await generateWithLossConsent(dialog);
  await expect(dialog.getByLabel("Export report")).toContainText(protein?.name ?? "");
  const filtered = await downloadArtifact(page, dialog);
  expect(filtered.filename).toMatch(/\.pdb$/);
  const filteredText = filtered.bytes.toString("utf8");
  expect(filteredText).not.toContain(" HOH ");
  expect(filteredText).not.toMatch(/\bZN\b/);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  for (const ligand of ligands) {
    const row = page.locator(".entry-row").filter({ hasText: ligand.name }).first();
    await row.getByRole("button", { name: `Show ${ligand.name}` }).click();
  }
  const proteinRow = page.locator(".entry-row").filter({ hasText: protein?.name ?? "" }).first();
  await proteinRow.getByRole("button", { name: `Hide ${protein?.name}` }).click();

  const multiRecordDownloads: Buffer[] = [];
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Export" });
    await dialog.getByRole("button", { name: "Visible 2" }).click();
    await dialog.getByLabel("Format").selectOption("sdf");
    await dialog.getByLabel("Output").selectOption("multi_record");
    await generateWithLossConsent(dialog);
    const result = await downloadArtifact(page, dialog);
    expect(result.filename).toMatch(/\.sdf$/);
    expect(result.bytes.toString("utf8").match(/\$\$\$\$/g)).toHaveLength(2);
    multiRecordDownloads.push(result.bytes);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
  expect(multiRecordDownloads[1]).toEqual(multiRecordDownloads[0]);

  const selectedLigand = ligands[0];
  const selectedRow = page
    .locator(".entry-row")
    .filter({ hasText: selectedLigand.name })
    .first();
  await selectedRow
    .getByRole("button", { name: `Actions for ${selectedLigand.name}` })
    .click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByRole("button", { name: "Selected 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByLabel("Format").selectOption("sdf");
  await generateWithLossConsent(dialog);
  const selected = await downloadArtifact(page, dialog);
  expect(selected.filename).toMatch(/\.sdf$/);
  expect(selected.filename).not.toMatch(/\.zip$/);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: "All 3" }).click();
  await generateWithLossConsent(dialog);
  await expect(dialog.getByLabel("Export report").locator("> div")).toHaveCount(3);
  const all = await downloadArtifact(page, dialog);
  expect(all.filename).toMatch(/\.zip$/);
  expect(all.bytes.length).toBeGreaterThan(100);
});

test("round-trips a deterministic archive and rejects an unsafe archive without switching", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Archive byte/state inspection runs once in desktop Chromium.",
  );
  const created = await createProject(request, uniqueName("Archive round trip", testInfo));
  await page.goto("/");
  await openProject(page, created.name);
  await importFiles(page, ["protein_editing.pdb", "ethanol.mol"]);
  let source = await projectState(request, created.id);
  const hiddenEntry = source.entries[0];
  const hiddenRow = page
    .locator(".entry-row")
    .filter({ hasText: hiddenEntry.name })
    .first();
  await hiddenRow.getByRole("button", { name: `Hide ${hiddenEntry.name}` }).click();
  source = await projectState(request, created.id);

  const archiveDownloads: Buffer[] = [];
  let archiveFilename = "";
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export" });
    await dialog.getByRole("tab", { name: "Project archive" }).click();
    await dialog.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(dialog.getByRole("link", { name: "Download" })).toBeVisible({
      timeout: 15_000,
    });
    const archive = await downloadArtifact(page, dialog);
    archiveFilename = archive.filename;
    archiveDownloads.push(archive.bytes);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
  expect(archiveFilename).toMatch(/\.molweave\.zip$/);
  expect(archiveDownloads[1]).toEqual(archiveDownloads[0]);

  await page.getByRole("button", { name: "Projects" }).click();
  let projectsDialog = page.getByRole("dialog", { name: "Projects" });
  await projectsDialog.getByRole("button", { name: "Import project archive" }).click();
  let importDialog = page.getByRole("dialog", { name: "Import project archive" });
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: archiveFilename,
    mimeType: "application/zip",
    buffer: archiveDownloads[0],
  });
  await importDialog.getByRole("button", { name: "Import project" }).click();
  await expect(importDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".notice[role='status']")).toContainText(
    `Project "${created.name}" imported.`,
  );

  const listResponse = await request.get("/api/v1/projects");
  const summaries = (await listResponse.json()) as ProjectSummary[];
  const restoredSummary = summaries.find(
    (item) => item.name === created.name && item.id !== created.id,
  );
  expect(restoredSummary).toBeDefined();
  const activeBeforeReject = await page.evaluate(() => {
    const stored = localStorage.getItem("molweave-workspace-v1");
    return stored
      ? (JSON.parse(stored) as { state: { activeProjectId: string } }).state.activeProjectId
      : null;
  });
  expect(activeBeforeReject).toBe(restoredSummary?.id);
  const restored = await projectState(request, restoredSummary?.id ?? "");
  expect(restored.revision).toBe(0);
  expect(restored.checkpoint_revision).toBe(0);
  expect(restored.description).toBe(source.description);
  expect(restored.groups).toEqual(source.groups);
  expect(restored.saved_selections).toEqual(source.saved_selections);
  expect(restored.measurements).toEqual(source.measurements);
  expect(restored.scenes).toEqual(source.scenes);
  expect(
    restored.entries.map((entry) => ({
      name: entry.name,
      source_format: entry.source_format,
      atom_count: entry.atom_count,
      bond_count: entry.bond_count,
      residue_count: entry.residue_count,
      visible: entry.visible,
      locked: entry.locked,
      viewer_settings: entry.viewer_settings,
    })),
  ).toEqual(
    source.entries.map((entry) => ({
      name: entry.name,
      source_format: entry.source_format,
      atom_count: entry.atom_count,
      bond_count: entry.bond_count,
      residue_count: entry.residue_count,
      visible: entry.visible,
      locked: entry.locked,
      viewer_settings: entry.viewer_settings,
    })),
  );
  await expect(
    page
      .locator(".entry-row")
      .filter({ hasText: hiddenEntry.name })
      .getByRole("button", { name: `Show ${hiddenEntry.name}` }),
  ).toBeVisible();

  for (let index = 0; index < source.entries.length; index += 1) {
    const sourceBytes = await (
      await request.get(`/api/v1/artifacts/${source.entries[index].original_artifact_id}`)
    ).body();
    const restoredBytes = await (
      await request.get(`/api/v1/artifacts/${restored.entries[index].original_artifact_id}`)
    ).body();
    expect(restoredBytes).toEqual(sourceBytes);
  }

  await page.getByRole("button", { name: "Projects" }).click();
  projectsDialog = page.getByRole("dialog", { name: "Projects" });
  await projectsDialog.getByRole("button", { name: "Import project archive" }).click();
  importDialog = page.getByRole("dialog", { name: "Import project archive" });
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "unsafe.molweave.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not a zip"),
  });
  await importDialog.getByRole("button", { name: "Import project" }).click();
  await expect(importDialog.getByRole("alert")).toContainText(
    "File is not a valid ZIP.",
  );
  await importDialog.getByRole("button", { name: "Cancel" }).click();
  const activeAfterReject = await page.evaluate(() => {
    const stored = localStorage.getItem("molweave-workspace-v1");
    return stored
      ? (JSON.parse(stored) as { state: { activeProjectId: string } }).state.activeProjectId
      : null;
  });
  expect(activeAfterReject).toBe(activeBeforeReject);
  const projectsAfter = (await (await request.get("/api/v1/projects")).json()) as ProjectSummary[];
  expect(projectsAfter).toHaveLength(summaries.length);
});

test("cancels intercepted export and archive import work without a stale result", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Cancellation routing runs once in desktop Chromium.",
  );
  const created = await createProject(request, uniqueName("Export cancellation", testInfo));
  await page.goto("/");
  await openProject(page, created.name);
  await importFiles(page, ["ethanol.mol"]);

  let releaseExport: (() => void) | undefined;
  await page.route(`**/api/v1/projects/${created.id}/exports`, async (route) => {
    await new Promise<void>((resolveRoute) => {
      releaseExport = resolveRoute;
    });
    await route.continue().catch(() => undefined);
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: "Generate", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel export" }).click();
  await expect(dialog).toBeHidden();
  releaseExport?.();
  await page.unroute(`**/api/v1/projects/${created.id}/exports`);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByRole("link", { name: "Download" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  const baseline = (await (await request.get("/api/v1/projects")).json()) as ProjectSummary[];
  let releaseImport: (() => void) | undefined;
  await page.route("**/api/v1/projects/import-archive", async (route) => {
    await new Promise<void>((resolveRoute) => {
      releaseImport = resolveRoute;
    });
    await route.continue().catch(() => undefined);
  });
  await page.getByRole("button", { name: "Projects" }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: "Import project archive" })
    .click();
  const importDialog = page.getByRole("dialog", { name: "Import project archive" });
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "cancelled.molweave.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("intercepted"),
  });
  await importDialog.getByRole("button", { name: "Import project" }).click();
  await importDialog.getByRole("button", { name: "Cancel import" }).click();
  releaseImport?.();
  await expect(importDialog.getByRole("alert")).toContainText("Archive import cancelled.");
  await page.unroute("**/api/v1/projects/import-archive");
  const after = (await (await request.get("/api/v1/projects")).json()) as ProjectSummary[];
  expect(after).toHaveLength(baseline.length);
});

test("keeps complete export and archive controls usable on a mobile viewport", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Responsive export coverage runs in the Pixel 7 project.",
  );
  const created = await createProject(request, uniqueName("Mobile export", testInfo));
  await page.goto("/");
  await openProject(page, created.name);
  await importFiles(page, ["ethanol.mol"]);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog.getByRole("button", { name: "All 1" })).toBeVisible();
  await expect(dialog.getByLabel("Format")).toBeVisible();
  await expect(dialog.getByLabel("Output")).toBeVisible();
  await expect(dialog.getByLabel("Hydrogens")).toBeVisible();
  await dialog.getByRole("tab", { name: "Project archive" }).click();
  await expect(dialog.getByText("1 structures · revision 1")).toBeVisible();
  const fitsViewport = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return (
      box.left >= 0 &&
      box.right <= window.innerWidth &&
      element.scrollWidth <= element.clientWidth
    );
  });
  expect(fitsViewport).toBe(true);
  await dialog.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "Download" })).toBeVisible({
    timeout: 15_000,
  });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Projects" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Projects" })
      .getByRole("button", { name: "Import project archive" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
