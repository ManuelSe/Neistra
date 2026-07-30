import { readFile } from "node:fs/promises";
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
}

interface ProjectRead extends ProjectSummary {
  revision: number;
  entries: ProjectEntry[];
}

function uniqueName(prefix: string, testInfo: TestInfo): string {
  return `${prefix} ${testInfo.project.name} ${Date.now()}`;
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
  await dialog.getByRole("button", { name: new RegExp(`^${escapeRegex(name)}`) }).click();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

async function importFiles(page: Page, filenames: string[]): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(
    filenames.map((filename) => resolve(FIXTURES, filename)),
  );
  for (const filename of filenames) {
    await expect(dialog.getByText(filename, { exact: true })).toBeVisible();
  }
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test("imports protein and ligand, renders both after reload, and exports with loss consent", async ({
  page,
  request,
}, testInfo) => {
  const project = await createProject(request, uniqueName("Molecular slice", testInfo));
  await page.goto("/");
  await openProject(page, project.name);

  await importFiles(page, ["protein_models_altloc.pdb", "ethanol.mol"]);
  await expect(page.locator(".notice[role='status']")).toContainText(
    "2 structures imported",
  );
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 20_000,
  });
  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(200);
  expect(canvasBox?.height).toBeGreaterThan(200);

  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 20_000,
  });
  await expect(page.locator(".molstar-host canvas").first()).toBeVisible();

  if (testInfo.project.name !== "chromium") return;

  const projectResponse = await request.get(`/api/v1/projects/${project.id}`);
  const current = (await projectResponse.json()) as ProjectRead;
  const ligand = current.entries.find((entry) => entry.source_format === "mol");
  expect(ligand).toBeDefined();
  const ligandRow = page.locator(".entry-row").filter({ hasText: ligand?.name ?? "" });

  await ligandRow.getByRole("button", { name: `Actions for ${ligand?.name}` }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export structure" });
  await exportDialog.getByLabel("Format").selectOption("xyz");
  await exportDialog.getByRole("button", { name: "Generate" }).click();
  await expect(exportDialog.getByRole("alert")).toContainText(
    "Export would lose molecular information",
  );
  await expect(exportDialog.getByLabel("Export warnings")).toContainText(
    "connectivity",
  );
  await exportDialog
    .getByLabel("I understand that this format cannot preserve the listed information.")
    .check();
  await exportDialog.getByRole("button", { name: "Generate" }).click();
  const exportDownload = page.waitForEvent("download");
  await exportDialog.getByRole("link", { name: "Download" }).click();
  const exported = await exportDownload;
  expect(exported.suggestedFilename()).toMatch(/\.xyz$/);
  expect((await downloadBytes(exported)).length).toBeGreaterThan(20);
  await exportDialog.getByRole("button", { name: "Close", exact: true }).click();

  await ligandRow.getByRole("button", { name: `Actions for ${ligand?.name}` }).click();
  const originalDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download original" }).click();
  const original = await originalDownload;
  expect(original.suggestedFilename()).toBe("ethanol.mol");
  expect(await downloadBytes(original)).toEqual(
    await readFile(resolve(FIXTURES, "ethanol.mol")),
  );

  await ligandRow.getByRole("button", { name: `Hide ${ligand?.name}` }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await ligandRow.getByRole("button", { name: `Show ${ligand?.name}` }).click();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
});

test("reports malformed input and can cancel an import before commit", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Failure and cancellation coverage runs once in desktop Chromium.",
  );
  const project = await createProject(request, uniqueName("Import failures", testInfo));
  await page.goto("/");
  await openProject(page, project.name);

  await page.getByRole("button", { name: "Import structures" }).first().click();
  let releaseRoute: (() => void) | undefined;
  await page.route(`**/api/v1/projects/${project.id}/imports`, async (route) => {
    await new Promise<void>((resolveRoute) => {
      releaseRoute = resolveRoute;
    });
    await route.continue().catch(() => undefined);
  });
  let dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(resolve(FIXTURES, "ethanol.mol"));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Cancel import" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel import" }).click();
  releaseRoute?.();
  await expect(dialog.getByRole("alert")).toContainText("Import cancelled before commit");
  await page.unroute(`**/api/v1/projects/${project.id}/imports`);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  let state = (await (await request.get(`/api/v1/projects/${project.id}`)).json()) as ProjectRead;
  expect(state.revision).toBe(0);
  expect(state.entries).toHaveLength(0);

  await page.getByRole("button", { name: "Import structures" }).first().click();
  dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(resolve(FIXTURES, "malformed.pdb"));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "contains no molecular atom records",
  );
  state = (await (await request.get(`/api/v1/projects/${project.id}`)).json()) as ProjectRead;
  expect(state.revision).toBe(0);
  expect(state.entries).toHaveLength(0);
});
