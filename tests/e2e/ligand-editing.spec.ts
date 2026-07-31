import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const ETHANOL = resolve("tests/fixtures/formats/ethanol.mol");

interface AtomRead {
  id: number;
  element: string;
  formal_charge: number | null;
  coordinates: [number, number, number];
}

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  entries: {
    id: string;
    name: string;
    atom_count: number;
    atom_ids: number[];
    bond_count: number;
    current_artifact_id: string;
    locked: boolean;
  }[];
}

async function project(
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
): Promise<AtomRead[]> {
  const response = await request.get(
    `/api/v1/projects/${projectId}/entries/${entryId}/structure`,
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { structure: { atoms: AtomRead[] } })
    .structure.atoms;
}

async function openImportedLigand(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<{ state: ProjectRead; entryId: string }> {
  const created = await request.post("/api/v1/projects", {
    data: { name: `Ligand editing ${testInfo.project.name} ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const initial = (await created.json()) as ProjectRead;
  await page.goto("/");
  await page.getByRole("button", { name: "Projects" }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${initial.name}`) })
    .click();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(ETHANOL);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const state = await project(request, initial.id);
  await expect(page.locator(".viewer-status")).toContainText(
    "1 visible / 1 loaded",
    { timeout: 30_000 },
  );
  return { state, entryId: state.entries[0].id };
}

async function selectAtoms(
  page: Page,
  entryId: string,
  atomIds: number[],
): Promise<void> {
  await page.getByRole("tab", { name: "selection" }).click();
  const mode = page.getByRole("group", { name: "Operation mode" });
  await mode.getByRole("button", { name: "replace" }).click();
  await page.getByLabel("Select by").selectOption("atom_reference");
  for (let index = 0; index < atomIds.length; index += 1) {
    if (index === 1) await mode.getByRole("button", { name: "add" }).click();
    await page.getByLabel("Value").fill(`${entryId}:${atomIds[index]}`);
    await page.getByRole("button", { name: "Apply query" }).click();
  }
  await expect(page.getByLabel("Current selection summary")).toContainText(
    `Atoms${atomIds.length}`,
  );
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

test("edits ligand chemistry, validates failures, and round-trips history", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The complete ligand editor uses the desktop three-panel workspace.",
  );
  test.setTimeout(180_000);
  page.setDefaultTimeout(10_000);
  const opened = await openImportedLigand(page, request, testInfo);
  let state = opened.state;
  const entryId = opened.entryId;
  const original = await atoms(request, state.id, entryId);
  await expectNonblankCanvas(page);

  await page.getByRole("tab", { name: "ligand" }).click();
  await page
    .getByRole("combobox", { name: "Existing bond" })
    .selectOption("2");
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption("3");
  await page.getByRole("button", { name: "Apply order" }).click();
  await expect(page.locator(".notice[role='alert']")).toContainText(
    "Invalid valence",
  );
  expect((await project(request, state.id)).revision).toBe(state.revision);
  expect(await atoms(request, state.id, entryId)).toEqual(original);

  await page
    .getByRole("combobox", { name: "Element", exact: true })
    .selectOption("C");
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("3.2");
  await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("1");
  await page.getByRole("spinbutton", { name: "Z", exact: true }).fill("0");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].atom_ids)
    .toEqual([1, 2, 3, 4]);
  state = await project(request, state.id);
  await expect(page.locator(".viewer-error")).toBeHidden();
  await expectNonblankCanvas(page);

  await page.getByRole("spinbutton", { name: "Atom A" }).fill("3");
  await page.getByRole("spinbutton", { name: "Atom B" }).fill("4");
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption("1");
  await page.getByRole("button", { name: "Add bond" }).click();
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].bond_count)
    .toBe(3);
  state = await project(request, state.id);

  await selectAtoms(page, entryId, [3, 4]);
  await page.getByRole("tab", { name: "ligand" }).click();
  await page
    .getByRole("combobox", { name: "Rotatable bond" })
    .selectOption("2");
  const beforeRotation = await atoms(request, state.id, entryId);
  await page.getByRole("button", { name: "Rotate selected side" }).click();
  await expect
    .poll(async () => (await project(request, state.id)).revision)
    .toBe(state.revision + 1);
  const rotated = await atoms(request, state.id, entryId);
  expect(rotated[3].coordinates).not.toEqual(beforeRotation[3].coordinates);
  state = await project(request, state.id);
  await page.getByRole("button", { name: /Undo: Rotate bond/ }).click();
  await expect
    .poll(async () => atoms(request, state.id, entryId))
    .toEqual(beforeRotation);
  await page.getByRole("button", { name: /Redo: Rotate bond/ }).click();
  await expect.poll(async () => atoms(request, state.id, entryId)).toEqual(rotated);
  state = await project(request, state.id);

  await selectAtoms(page, entryId, [1]);
  await page.getByRole("tab", { name: "ligand" }).click();
  await page
    .getByRole("combobox", { name: "Rotatable bond" })
    .selectOption("1");
  await page.getByRole("button", { name: "Rotate selected side" }).click();
  await expect(page.locator(".notice[role='alert']")).toContainText(
    "Terminal bond rotation is ambiguous",
  );
  expect((await project(request, state.id)).revision).toBe(state.revision);

  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Add H" }).click();
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].atom_count)
    .toBeGreaterThan(4);
  state = await project(request, state.id);
  await page.getByRole("button", { name: "Remove H" }).click();
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].atom_count)
    .toBe(4);
  state = await project(request, state.id);

  await page.getByRole("combobox", { name: "Force field" }).selectOption("auto");
  await page.getByRole("button", { name: "Minimize coordinates" }).click();
  await expect(page.locator(".edit-report")).toContainText(
    /coordinates\.cleanup \/ (MMFF|UFF)/,
  );
  state = await project(request, state.id);

  await selectAtoms(page, entryId, [4]);
  await page.getByRole("tab", { name: "ligand" }).click();
  const beforeMove = (await atoms(request, state.id, entryId))[3].coordinates;
  await page.getByRole("spinbutton", { name: "dX" }).fill("1");
  await page.getByRole("button", { name: "Move selected" }).click();
  await expect
    .poll(async () => (await atoms(request, state.id, entryId))[3].coordinates[0])
    .toBeCloseTo(beforeMove[0] + 1, 8);
  state = await project(request, state.id);

  const locked = await request.post(
    `/api/v1/projects/${state.id}/entries/${entryId}/lock`,
    { data: { expected_revision: state.revision, value: true } },
  );
  expect(locked.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText(
    "1 visible / 1 loaded",
    { timeout: 30_000 },
  );
  await page.getByRole("tab", { name: "ligand" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete selected" })).toBeDisabled();
  await expect(page.locator(".viewer-error")).toBeHidden();
  await expectNonblankCanvas(page);
});
