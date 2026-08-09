import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

const FIXTURES = resolve("tests/fixtures/formats");

interface CameraRead {
  mode: "perspective" | "orthographic";
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  radius: number;
}

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  entries: {
    id: string;
    name: string;
    source_format: string;
    atom_count: number;
    visible: boolean;
    current_artifact_id: string;
    viewer_settings: unknown;
  }[];
  scenes: { id: string; name: string; camera: CameraRead }[];
}

interface CanvasPoint {
  x: number;
  y: number;
}

const hitCandidates = [
  [0.5, 0.5],
  [0.45, 0.5],
  [0.55, 0.5],
  [0.5, 0.45],
  [0.5, 0.55],
  [0.4, 0.5],
  [0.6, 0.5],
  [0.5, 0.4],
  [0.5, 0.6],
  [0.35, 0.5],
  [0.65, 0.5],
] as const;

const emptyCandidates = [
  [0.08, 0.12],
  [0.92, 0.12],
  [0.08, 0.78],
  [0.92, 0.78],
  [0.15, 0.2],
  [0.85, 0.2],
] as const;

async function createProject(
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<ProjectRead> {
  const response = await request.post("/api/v1/projects", {
    data: { name: `Viewer click ${testInfo.project.name} ${Date.now()}` },
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
  await page.goto("/");
  await page.getByRole("button", { name: "Projects" }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${project.name}`) })
    .click();
}

async function importStructure(page: Page, path: string): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(path);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 30_000,
  });
}

async function selectionCount(page: Page): Promise<number> {
  const status = (await page.locator(".viewer-status").textContent()) ?? "";
  const match = status.match(/\/ (\d+) selected/);
  return match ? Number(match[1]) : -1;
}

async function canvasPoint(
  canvas: Locator,
  fraction: readonly [number, number],
): Promise<CanvasPoint> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.width * fraction[0], y: box!.height * fraction[1] };
}

async function clickPoint(
  canvas: Locator,
  point: CanvasPoint,
  modifiers: ("Alt" | "Control" | "Meta" | "Shift")[] = [],
): Promise<void> {
  await canvas.click({ position: point, modifiers });
}

async function findStructuralHit(
  page: Page,
  canvas: Locator,
  options: { modifiers?: ("Alt" | "Control" | "Meta" | "Shift")[]; greaterThan?: number } = {},
): Promise<CanvasPoint> {
  for (const candidate of hitCandidates) {
    const point = await canvasPoint(canvas, candidate);
    await clickPoint(canvas, point, options.modifiers);
    const count = await selectionCount(page);
    if (count > (options.greaterThan ?? 0)) return point;
  }
  throw new Error("No selectable structural pixel was found in the expected viewport region.");
}

async function findEmptyPoint(page: Page, canvas: Locator): Promise<CanvasPoint> {
  for (const candidate of emptyCandidates) {
    const point = await canvasPoint(canvas, candidate);
    await clickPoint(canvas, point);
    if ((await selectionCount(page)) === 0) return point;
  }
  throw new Error("No empty viewer pixel was found in the expected viewport region.");
}

async function saveCamera(
  page: Page,
  request: APIRequestContext,
  projectId: string,
  name: string,
): Promise<CameraRead> {
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByPlaceholder("Scene name").fill(name);
  await page.getByRole("button", { name: "Save current scene" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close viewer controls" }).click();
  const project = await readProject(request, projectId);
  const scene = project.scenes.find((candidate) => candidate.name === name);
  expect(scene).toBeDefined();
  return scene!.camera;
}

async function saveStableCamera(
  page: Page,
  request: APIRequestContext,
  projectId: string,
  prefix: string,
): Promise<CameraRead> {
  let previous = await saveCamera(page, request, projectId, `${prefix} 1`);
  for (let attempt = 2; attempt <= 5; attempt += 1) {
    await page.waitForTimeout(750);
    const current = await saveCamera(
      page,
      request,
      projectId,
      `${prefix} ${attempt}`,
    );
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  }
  throw new Error("The viewer camera did not settle to two identical snapshots.");
}

test("keeps primary selection and empty clearing independent from the camera", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Exact WebGL camera evidence is desktop-only.");
  test.setTimeout(180_000);

  const project = await createProject(request, testInfo);
  await openProject(page, project);
  await importStructure(page, resolve(FIXTURES, "protein_models_altloc.pdb"));

  let current = await readProject(request, project.id);
  const protein = current.entries[0];
  const styles = [
    "cartoon",
    "backbone",
    "line",
    "stick",
    "ball-and-stick",
    "space-filling",
    "surface",
  ];
  const settings = {
    representations: styles.map((style, index) => ({
      id: `click-representation-${index}`,
      style,
      color_by: "element",
      custom_color: "#3b82f6",
      opacity: style === "surface" ? 0.35 : 1,
    })),
    components: {
      hydrogens: true,
      nonpolar_hydrogens: true,
      solvent: true,
      ions: true,
      ligands: true,
      protein: true,
    },
    labels: { atoms: false, residues: false, chains: false, structure: false },
  };
  const configured = await request.put(
    `/api/v1/projects/${project.id}/entries/${protein.id}/viewer-settings`,
    { data: { expected_revision: current.revision, settings } },
  );
  expect(configured.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 30_000,
  });
  current = await readProject(request, project.id);
  expect(
    (
      current.entries[0].viewer_settings as {
        representations: { style: string }[];
      }
    ).representations.map((representation) => representation.style),
  ).toEqual(styles);

  const structureRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(outgoing.url()).pathname)) {
      structureRequests.push(outgoing.url());
    }
  });

  await page.getByRole("button", { name: "Fit all visible" }).click();
  await page.waitForTimeout(750);
  const baselineCamera = await saveStableCamera(
    page,
    request,
    project.id,
    "Stable camera before selection clicks",
  );
  const durableBeforeClicks = await readProject(request, project.id);
  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();

  await page.getByRole("button", { name: "Pick atoms" }).click();
  const firstPoint = await findStructuralHit(page, canvas);
  const atomCount = await selectionCount(page);
  expect(atomCount).toBeGreaterThan(0);

  const additivePoint = await findStructuralHit(page, canvas, {
    modifiers: ["Control"],
    greaterThan: atomCount,
  });
  const additiveCount = await selectionCount(page);
  expect(additiveCount).toBeGreaterThan(atomCount);
  await clickPoint(canvas, additivePoint, ["Alt"]);
  expect(await selectionCount(page)).toBeLessThan(additiveCount);

  const granularityCounts: number[] = [];
  for (const mode of ["atoms", "residues", "chains", "structures"] as const) {
    await page.getByRole("button", { name: `Pick ${mode}` }).click();
    await clickPoint(canvas, firstPoint);
    granularityCounts.push(await selectionCount(page));
  }
  expect(granularityCounts[0]).toBeGreaterThan(0);
  expect(granularityCounts[1]).toBeGreaterThanOrEqual(granularityCounts[0]);
  expect(granularityCounts[2]).toBeGreaterThanOrEqual(granularityCounts[1]);
  expect(granularityCounts[3]).toBe(protein.atom_count);

  const emptyPoint = await findEmptyPoint(page, canvas);
  expect(await selectionCount(page)).toBe(0);
  await clickPoint(canvas, emptyPoint);
  expect(await selectionCount(page)).toBe(0);

  await page.getByRole("button", { name: "Pick atoms" }).click();
  await clickPoint(canvas, firstPoint);
  const selectedBeforeModifiedEmpty = await selectionCount(page);
  expect(selectedBeforeModifiedEmpty).toBeGreaterThan(0);
  await clickPoint(canvas, emptyPoint, ["Control"]);
  expect(await selectionCount(page)).toBe(selectedBeforeModifiedEmpty);
  await clickPoint(canvas, emptyPoint, ["Alt"]);
  expect(await selectionCount(page)).toBe(selectedBeforeModifiedEmpty);

  expect(await readProject(request, project.id)).toEqual(durableBeforeClicks);
  expect(structureRequests).toEqual([]);
  const afterClickCamera = await saveCamera(
    page,
    request,
    project.id,
    "After selection clicks",
  );
  expect(afterClickCamera).toEqual(baselineCamera);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + emptyPoint.x, box!.y + emptyPoint.y);
  await page.mouse.down();
  await page.mouse.move(box!.x + emptyPoint.x + 70, box!.y + emptyPoint.y + 35, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await selectionCount(page)).toBe(selectedBeforeModifiedEmpty);
  const afterDragCamera = await saveCamera(
    page,
    request,
    project.id,
    "After camera drag",
  );
  expect(afterDragCamera).not.toEqual(afterClickCamera);

  await page.getByRole("button", { name: "Focus selection" }).click();
  await page.waitForTimeout(750);
  const focusedCamera = await saveCamera(
    page,
    request,
    project.id,
    "Explicit selection focus",
  );
  expect(focusedCamera).not.toEqual(afterDragCamera);
  await page.getByRole("button", { name: "Fit all visible" }).click();
  await page.waitForTimeout(750);
  const fittedCamera = await saveCamera(
    page,
    request,
    project.id,
    "Explicit fit all visible",
  );
  expect(fittedCamera).not.toEqual(focusedCamera);
});

test("uses the compact trigger path for selection and empty clearing", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Touch activation uses Pixel 7.");
  test.setTimeout(120_000);

  const project = await createProject(request, testInfo);
  await openProject(page, project);
  await importStructure(page, resolve(FIXTURES, "ethanol.mol"));
  const current = await readProject(request, project.id);
  const ligand = current.entries[0];
  await page
    .getByRole("combobox", { name: "Viewer picking mode" })
    .selectOption("structure");

  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  let selected = false;
  for (const candidate of hitCandidates) {
    await page.touchscreen.tap(
      box!.x + box!.width * candidate[0],
      box!.y + box!.height * candidate[1],
    );
    if ((await selectionCount(page)) === ligand.atom_count) {
      selected = true;
      break;
    }
  }
  expect(selected).toBe(true);

  const durableBefore = await readProject(request, project.id);
  let cleared = false;
  for (const candidate of emptyCandidates) {
    await page.touchscreen.tap(
      box!.x + box!.width * candidate[0],
      box!.y + box!.height * candidate[1],
    );
    if ((await selectionCount(page)) === 0) {
      cleared = true;
      break;
    }
  }
  expect(cleared).toBe(true);
  expect(await readProject(request, project.id)).toEqual(durableBefore);
});
