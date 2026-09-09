import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const FIXTURES = resolve("tests/fixtures/formats");

interface ProjectEntry {
  id: string;
  name: string;
  source_format: string;
  atom_count: number;
  current_artifact_id: string;
  viewer_settings: unknown;
}

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  entries: ProjectEntry[];
  scenes: { name: string; camera: unknown }[];
}

async function createProject(
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<ProjectRead> {
  const response = await request.post("/api/v1/projects", {
    data: { name: `Viewer theme ${testInfo.project.name} ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as ProjectRead;
}

async function readProject(
  request: APIRequestContext,
  projectId: string,
): Promise<ProjectRead> {
  const response = await request.get(`/api/v1/projects/${projectId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ProjectRead;
}

async function openProject(page: Page, project: ProjectRead): Promise<void> {
  await page.getByRole("button", { name: "Projects" }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${project.name}`) })
    .click();
}

async function importStructure(page: Page, filename: string): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(resolve(FIXTURES, filename));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

function canvas(page: Page) {
  return page.locator(".molstar-host canvas").first();
}

async function expectViewerTheme(page: Page, theme: "light" | "dark") {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(canvas(page)).toBeVisible({ timeout: 30_000 });
  const backgroundPixel = () =>
    canvas(page).evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext("webgl2") ?? element.getContext("webgl");
      if (!context) return [];
      const pixel = new Uint8Array(4);
      context.readPixels(
        2,
        2,
        1,
        1,
        context.RGBA,
        context.UNSIGNED_BYTE,
        pixel,
      );
      return Array.from(pixel);
    });
  if (theme === "dark") {
    await expect.poll(backgroundPixel, { timeout: 30_000 }).toEqual([23, 26, 31, 255]);
  } else {
    await expect.poll(backgroundPixel, { timeout: 30_000 }).toEqual([244, 241, 235, 255]);
  }
  await expect(page.locator(".structure-viewer")).toHaveCSS("background-color",
    theme === "dark" ? "rgb(23, 26, 31)" : "rgb(244, 241, 235)");
}

async function saveThemeCamera(page: Page, request: APIRequestContext, projectId: string, name: string) {
  await page.getByPlaceholder("Scene name").fill(name);
  await page.getByRole("button", { name: "Save current scene" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  const project = await readProject(request, projectId);
  return project.scenes.find((scene) => scene.name === name)!.camera;
}

test("keeps the persisted theme through the real viewer lifecycle", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The real WebGL lifecycle runs once.");
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);

  await page.goto("/");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const created = await createProject(request, testInfo);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await openProject(page, created);

  let structureRequests = 0;
  page.on("request", (browserRequest) => {
    if (
      browserRequest.method() === "GET" &&
      /\/api\/v1\/projects\/[^/]+\/entries\/[^/]+\/structure$/.test(
        new URL(browserRequest.url()).pathname,
      )
    ) {
      structureRequests += 1;
    }
  });

  await importStructure(page, "ethanol.mol");
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 30_000,
  });
  await expectViewerTheme(page, "dark");

  await importStructure(page, "protein_models_altloc.pdb");
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 30_000,
  });
  await expectViewerTheme(page, "dark");

  let current = await readProject(request, created.id);
  const ligand = current.entries.find((entry) => entry.source_format === "mol");
  expect(ligand).toBeDefined();
  const originalAtomCount = ligand!.atom_count;
  const originalArtifactId = ligand!.current_artifact_id;

  await page.getByRole("tab", { name: "ligand" }).click();
  await page
    .getByRole("combobox", { name: "Element", exact: true })
    .selectOption("C");
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("3.2");
  await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("1");
  await page.getByRole("spinbutton", { name: "Z", exact: true }).fill("0");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect
    .poll(async () => {
      current = await readProject(request, created.id);
      return current.entries.find((entry) => entry.id === ligand!.id)?.atom_count;
    })
    .toBe(originalAtomCount + 1);
  expect(
    current.entries.find((entry) => entry.id === ligand!.id)?.current_artifact_id,
  ).not.toBe(originalArtifactId);
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
  await expectViewerTheme(page, "dark");

  const desktopCanvas = await canvas(page).elementHandle();
  expect(desktopCanvas).not.toBeNull();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect
    .poll(() => desktopCanvas!.evaluate((element) => element.isConnected))
    .toBe(false);
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 30_000,
  });
  await expectViewerTheme(page, "dark");

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 30_000,
  });
  await expectViewerTheme(page, "dark");

  const restoredPage = await page.context().newPage();
  await restoredPage.goto("/");
  await expect(restoredPage.locator(".viewer-status")).toContainText(
    "2 visible / 2 loaded",
    { timeout: 30_000 },
  );
  await expectViewerTheme(restoredPage, "dark");
  await restoredPage.close();

  const ligandRow = page.locator(`.entry-row[data-entry-id="${ligand!.id}"]`);
  await ligandRow.locator(".entry-select").click();
  const selectedCount = originalAtomCount + 1;
  await expect(page.locator(".viewer-status")).toContainText(
    `/ ${selectedCount} selected`,
  );
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByRole("button", { name: "Isolate selection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show all", exact: true })).toBeVisible();
  const cameraBeforeTheme = await saveThemeCamera(page, request, created.id, "Before theme change");
  await page.getByRole("button", { name: "Close viewer controls" }).click();
  const statusBeforeThemeChange = await page.locator(".viewer-status").textContent();
  const stateBeforeThemeChange = await readProject(request, created.id);
  const requestsBeforeThemeChange = structureRequests;
  await canvas(page).evaluate((element) => {
    element.dataset.themeLifecycle = "existing";
  });

  await page.getByRole("button", { name: "Use light theme" }).click();
  await expectViewerTheme(page, "light");
  await expect(canvas(page)).toHaveAttribute("data-theme-lifecycle", "existing");
  await expect(page.locator(".viewer-status")).toHaveText(statusBeforeThemeChange ?? "");
  await expect(ligandRow.locator(".entry-select")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await readProject(request, created.id)).toEqual(
    stateBeforeThemeChange,
  );
  expect(structureRequests).toBe(requestsBeforeThemeChange);
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await expect(page.getByRole("button", { name: "Show all", exact: true })).toBeVisible();
  expect(await saveThemeCamera(page, request, created.id, "After theme change")).toEqual(cameraBeforeTheme);
  await page.getByRole("button", { name: "Close viewer controls" }).click();

  const lightCanvas = await canvas(page).elementHandle();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect
    .poll(() => lightCanvas!.evaluate((element) => element.isConnected))
    .toBe(false);
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 30_000,
  });
  await expect(page.locator(".viewer-status")).toContainText(
    `/ ${selectedCount} selected`,
  );
  await expectViewerTheme(page, "light");
});
