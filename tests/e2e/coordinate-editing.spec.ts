import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const PROTEIN = resolve("tests/fixtures/formats/protein_models_altloc.pdb");

interface Atom {
  id: number;
  coordinates: [number, number, number];
}

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  entries: {
    id: string;
    name: string;
    current_artifact_id: string;
    original_artifact_id: string;
    locked: boolean;
  }[];
}

async function currentProject(
  request: APIRequestContext,
  projectId: string,
): Promise<ProjectRead> {
  const response = await request.get(`/api/v1/projects/${projectId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ProjectRead;
}

async function atoms(
  request: APIRequestContext,
  projectId: string,
  entryId: string,
): Promise<Atom[]> {
  const response = await request.get(
    `/api/v1/projects/${projectId}/entries/${entryId}/structure`,
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { structure: { atoms: Atom[] } }).structure
    .atoms;
}

async function openProject(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<ProjectRead> {
  const created = await request.post("/api/v1/projects", {
    data: { name: `Coordinate editing ${testInfo.project.name} ${Date.now()}` },
  });
  const project = (await created.json()) as ProjectRead;
  await page.goto("/");
  await page.getByRole("button", { name: "Projects" }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${project.name}`) })
    .click();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(PROTEIN);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  let state = await currentProject(request, project.id);
  const duplicated = await request.post(
    `/api/v1/projects/${project.id}/entries/${state.entries[0].id}/duplicate`,
    { data: { expected_revision: state.revision } },
  );
  expect(duplicated.status()).toBe(200);
  state = (await duplicated.json()) as ProjectRead;
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText(
    "2 visible / 2 loaded",
    { timeout: 30_000 },
  );
  await expect(page.locator(".viewer-error")).toBeHidden();
  return state;
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

async function expectNonblankCanvas(page: Page): Promise<void> {
  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  const pixelSum = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!context) return 0;
    const pixel = new Uint8Array(4);
    let sum = 0;
    for (let x = 1; x < 10; x += 1) {
      for (let y = 1; y < 10; y += 1) {
        context.readPixels(
          Math.floor((element.width * x) / 10),
          Math.floor((element.height * y) / 10),
          1,
          1,
          context.RGBA,
          context.UNSIGNED_BYTE,
          pixel,
        );
        sum += pixel[0] + pixel[1] + pixel[2] + pixel[3];
      }
    }
    return sum;
  });
  expect(pixelSum).toBeGreaterThan(0);
}

test("edits coordinates, reverses gestures, and validates protein superposition", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The complete coordinate editor uses the desktop three-panel workspace.",
  );
  test.setTimeout(150_000);
  let project = await openProject(page, request, testInfo);
  const [moving, reference] = project.entries;
  const before = await atoms(request, project.id, moving.id);
  const referenceBefore = await atoms(request, project.id, reference.id);
  const referenceArtifact = reference.current_artifact_id;

  const canvas = page.locator(".molstar-host canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.dragTo(canvas, {
    sourcePosition: { x: box!.width * 0.4, y: box!.height * 0.5 },
    targetPosition: { x: box!.width * 0.6, y: box!.height * 0.55 },
  });
  expect(await atoms(request, project.id, moving.id)).toEqual(before);

  await page.getByRole("tab", { name: "transform" }).click();
  await page
    .getByRole("group", { name: "Translation (angstrom)" })
    .getByLabel("X")
    .fill("4");
  await page
    .getByRole("group", { name: "Rotation (degrees)" })
    .getByLabel("Z")
    .fill("37");
  await page.getByRole("button", { name: "Apply transform" }).click();
  await expect(page.locator(".notice")).toContainText("Change stored locally.");
  project = await currentProject(request, project.id);
  expect(project.revision).toBe(3);
  expect(
    project.entries.find((entry) => entry.id === reference.id)
      ?.current_artifact_id,
  ).toBe(referenceArtifact);
  const transformed = await atoms(request, project.id, moving.id);
  expect(transformed).not.toEqual(before);
  await expect(page.locator(".viewer-error")).toBeHidden();
  await expectNonblankCanvas(page);

  await page.getByRole("button", { name: /Undo: Transform structure/ }).click();
  await expect
    .poll(async () => atoms(request, project.id, moving.id))
    .toEqual(before);
  await page.getByRole("button", { name: /Redo: Transform structure/ }).click();
  await expect
    .poll(async () => atoms(request, project.id, moving.id))
    .toEqual(transformed);

  await selectAtomReferences(page, [{ entryId: moving.id, atomId: 1 }]);
  await page.getByRole("tab", { name: "transform" }).click();
  await page
    .getByRole("group", { name: "Scope" })
    .getByRole("button", { name: "selection" })
    .click();
  const revisionBeforeGesture = (await currentProject(request, project.id))
    .revision;
  const slider = page.getByRole("slider");
  await slider.fill("1.5");
  await slider.dispatchEvent("pointerup");
  await expect
    .poll(async () => (await currentProject(request, project.id)).revision)
    .toBe(revisionBeforeGesture + 1);
  const afterGesture = await atoms(request, project.id, moving.id);
  expect(afterGesture[0].coordinates[0]).toBeCloseTo(
    transformed[0].coordinates[0] + 1.5,
    9,
  );
  expect(afterGesture[1]).toEqual(transformed[1]);
  await page
    .getByRole("button", { name: /Undo: Translate 1 selected atoms/ })
    .click();
  await expect
    .poll(async () => atoms(request, project.id, moving.id))
    .toEqual(transformed);

  await page.getByRole("button", { name: "backbone" }).click();
  await page.getByRole("button", { name: "Superpose structure" }).click();
  const report = page.getByLabel("Superposition result");
  await expect(report).toContainText("Matched atoms5");
  await expect(report).toContainText("RMSD0.0000 angstrom");
  const aligned = await atoms(request, project.id, moving.id);
  aligned.forEach((atom, index) => {
    atom.coordinates.forEach((value, axis) => {
      expect(value).toBeCloseTo(referenceBefore[index].coordinates[axis], 9);
    });
  });

  await selectAtomReferences(page, [
    ...[1, 2, 3].map((atomId) => ({ entryId: moving.id, atomId })),
    ...[1, 2, 4].map((atomId) => ({ entryId: reference.id, atomId })),
  ]);
  await page.getByRole("tab", { name: "transform" }).click();
  await page.getByRole("button", { name: "selection", exact: true }).last().click();
  await page.getByRole("button", { name: "Superpose structure" }).click();
  await expect(page.locator(".notice[role='alert']")).toContainText(
    "equal protein identities",
  );

  project = await currentProject(request, project.id);
  const locked = await request.post(
    `/api/v1/projects/${project.id}/entries/${moving.id}/lock`,
    { data: { expected_revision: project.revision, value: true } },
  );
  expect(locked.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText(
    "2 visible / 2 loaded",
    { timeout: 30_000 },
  );
  await page.getByRole("tab", { name: "transform" }).click();
  await expect(
    page.getByText(/Unlock .* before changing coordinates/),
  ).toBeVisible();
  await expect(page.getByRole("slider")).toBeDisabled();
});
