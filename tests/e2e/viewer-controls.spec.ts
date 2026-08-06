import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const FIXTURES = resolve("tests/fixtures/formats");

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  entries: {
    id: string;
    name: string;
    source_format: string;
    visible: boolean;
    viewer_settings: unknown;
  }[];
  scenes: { id: string; name: string }[];
}

async function createProject(
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<ProjectRead> {
  const response = await request.post("/api/v1/projects", {
    data: { name: `Viewer controls ${testInfo.project.name} ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as ProjectRead;
}

async function openProject(page: Page, project: ProjectRead): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Projects" }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${project.name}`) })
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

test("applies complete representations, navigation, isolation, and named scenes", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Full WebGL control matrix is desktop-only.");
  test.setTimeout(120_000);
  const project = await createProject(request, testInfo);
  await openProject(page, project);
  await importStructures(page);

  let current = (await (
    await request.get(`/api/v1/projects/${project.id}`)
  ).json()) as ProjectRead;
  const protein = current.entries.find((entry) => entry.source_format === "pdb");
  expect(protein).toBeDefined();
  const styles = [
    "cartoon",
    "backbone",
    "line",
    "stick",
    "ball-and-stick",
    "space-filling",
    "surface",
  ];
  const colors = [
    "element",
    "chain",
    "residue",
    "secondary-structure",
    "structure",
    "custom",
    "element",
  ];
  const settings = {
    representations: styles.map((style, index) => ({
      id: `representation-${index}`,
      style,
      color_by: colors[index],
      custom_color: index === 5 ? "#e11d48" : "#3b82f6",
      opacity: style === "surface" ? 0.35 : 1,
    })),
    components: {
      hydrogens: false,
      solvent: true,
      ions: true,
      ligands: true,
      protein: true,
    },
    labels: {
      atoms: false,
      residues: true,
      chains: true,
      structure: true,
    },
  };
  const configured = await request.put(
    `/api/v1/projects/${project.id}/entries/${protein!.id}/viewer-settings`,
    { data: { expected_revision: current.revision, settings } },
  );
  expect(configured.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 30_000,
  });
  await expect(page.locator(".viewer-error")).toBeHidden();
  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  const pixels = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!context) return 0;
    const data = new Uint8Array(4);
    context.readPixels(
      Math.floor(element.width / 2),
      Math.floor(element.height / 2),
      1,
      1,
      context.RGBA,
      context.UNSIGNED_BYTE,
      data,
    );
    return data[0] + data[1] + data[2] + data[3];
  });
  expect(pixels).toBeGreaterThan(0);

  const backgroundLuminance = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext("webgl2") ?? element.getContext("webgl");
      if (!context) return -1;
      const data = new Uint8Array(4);
      context.readPixels(
        2,
        2,
        1,
        1,
        context.RGBA,
        context.UNSIGNED_BYTE,
        data,
      );
      return data[0] + data[1] + data[2];
    });
  await expect.poll(backgroundLuminance).toBeGreaterThan(600);
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(backgroundLuminance).toBeLessThan(150);
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(backgroundLuminance).toBeGreaterThan(600);

  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByLabel("Controlled structure").selectOption(protein!.id);
  await expect(page.getByLabel(`Representation style for ${protein!.name}`)).toHaveCount(7);
  await expect(page.getByLabel("Color scheme for surface")).toHaveValue("element");
  await expect(page.getByLabel("Custom color for space-filling")).toHaveValue("#e11d48");
  await expect(page.getByLabel("Viewer navigation")).toBeVisible();

  const navigation = page.getByLabel("Viewer navigation");
  await navigation.getByRole("button", { name: "orthographic" }).click();
  await expect(
    navigation.getByRole("button", { name: "orthographic" }),
  ).toHaveAttribute("aria-pressed", "true");
  await navigation.getByRole("button", { name: "Zoom in" }).click();
  await navigation.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Close viewer controls" }).click();
  await page.getByRole("button", { name: "Fit all visible" }).click();

  const proteinRow = page.locator(`.entry-row[data-entry-id="${protein!.id}"]`);
  await proteinRow.click();
  await page.getByRole("button", { name: "Focus selection" }).click();
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await navigation.getByRole("button", { name: "Isolate selection" }).click();
  await expect(navigation.getByRole("button", { name: "Show all" })).toBeVisible();
  await navigation.getByRole("button", { name: "Show all" }).click();

  await page.getByPlaceholder("Scene name").fill("Inspection scene");
  await page.getByRole("button", { name: "Save current scene" }).click();
  await expect(
    page.getByRole("button", { name: "Inspection scene", exact: true }),
  ).toBeVisible();
  current = (await (
    await request.get(`/api/v1/projects/${project.id}`)
  ).json()) as ProjectRead;
  expect(current.scenes).toHaveLength(1);

  const hidden = await request.post(
    `/api/v1/projects/${project.id}/entries/${protein!.id}/visibility`,
    { data: { expected_revision: current.revision, value: false } },
  );
  expect(hidden.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByRole("button", { name: "Inspection scene", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 30_000,
  });
  current = (await (
    await request.get(`/api/v1/projects/${project.id}`)
  ).json()) as ProjectRead;
  expect(current.entries.find((entry) => entry.id === protein!.id)?.visible).toBe(true);
  expect(
    (
      current.entries.find((entry) => entry.id === protein!.id)
        ?.viewer_settings as typeof settings
    ).representations,
  ).toHaveLength(7);

  await page.getByRole("button", { name: "Delete scene Inspection scene" }).click();
  await expect(
    page.getByRole("button", { name: "Inspection scene", exact: true }),
  ).toBeHidden();
});

test("shows a usable WebGL failure instead of a blank viewer", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Failure injection runs once.");
  const project = await createProject(request, testInfo);
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await openProject(page, project);
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(resolve(FIXTURES, "ethanol.mol"));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".viewer-error")).toContainText(/WebGL|viewer could not start/i, {
    timeout: 20_000,
  });
  await expect(page.locator(".viewer-status")).toContainText("1 visible");
});
