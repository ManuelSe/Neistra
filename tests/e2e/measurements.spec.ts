import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const FIXTURE = resolve("tests/fixtures/formats/ethanol.mol");

interface Atom {
  id: number;
  name: string;
  element: string;
  coordinates: [number, number, number];
}

interface ProjectRead {
  id: string;
  name: string;
  entries: { id: string; atom_count: number }[];
  measurements: {
    id: string;
    name: string;
    kind: string;
    visible: boolean;
    atom_references: { structure_id: string; atom_id: number }[];
  }[];
}

async function setup(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<{ project: ProjectRead; entryId: string; atoms: Atom[] }> {
  const created = await request.post("/api/v1/projects", {
    data: { name: `Measurements ${testInfo.project.name} ${Date.now()}` },
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
  await dialog.locator('input[type="file"]').setInputFiles([
    FIXTURE,
    resolve("tests/fixtures/formats/protein_models_altloc.pdb"),
  ]);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 20_000,
  });
  const state = (await (
    await request.get(`/api/v1/projects/${project.id}`)
  ).json()) as ProjectRead;
  const entry = [...state.entries].sort((a, b) => b.atom_count - a.atom_count)[0];
  expect(entry.atom_count).toBeGreaterThanOrEqual(4);
  const structure = (await (
    await request.get(
      `/api/v1/projects/${project.id}/entries/${entry.id}/structure`,
    )
  ).json()) as { structure: { atoms: Atom[] } };
  return { project: state, entryId: entry.id, atoms: structure.structure.atoms };
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

test("creates and manages reference measurements with synchronized inspection", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Full inspector workflow is desktop-only.");
  test.setTimeout(120_000);
  const { project, entryId, atoms } = await setup(page, request, testInfo);
  await selectAtoms(page, entryId, atoms.slice(0, 2).map((atom) => atom.id));
  await page.getByRole("tab", { name: "measurements" }).click();
  await page.getByPlaceholder("Measurement name").fill("Carbon distance");
  await page.getByRole("button", { name: "distance", exact: true }).click();
  const distance = Math.hypot(
    ...atoms[1].coordinates.map(
      (value, index) => value - atoms[0].coordinates[index],
    ),
  );
  const distanceRow = page.locator(".measurement-row").filter({
    has: page.getByLabel("Name for Carbon distance"),
  });
  await expect(distanceRow).toContainText(`${distance.toFixed(2)} Å`);

  await selectAtoms(page, entryId, atoms.slice(0, 3).map((atom) => atom.id));
  await page.getByRole("tab", { name: "measurements" }).click();
  await page.getByPlaceholder("Measurement name").fill("Bond angle");
  await page.getByRole("button", { name: "angle", exact: true }).click();
  await expect(
    page.locator(".measurement-row").filter({
      has: page.getByLabel("Name for Bond angle"),
    }),
  ).toContainText(/°/);

  await selectAtoms(page, entryId, atoms.slice(0, 4).map((atom) => atom.id));
  await page.getByRole("tab", { name: "measurements" }).click();
  await page.getByPlaceholder("Measurement name").fill("Torsion");
  await page.getByRole("button", { name: "dihedral", exact: true }).click();
  await expect(
    page.locator(".measurement-row").filter({
      has: page.getByLabel("Name for Torsion"),
    }),
  ).toContainText(/°/);
  await expect(page.locator(".property-table tbody tr")).toHaveCount(4);

  await distanceRow
    .getByRole("textbox", { name: "Name for Carbon distance", exact: true })
    .fill("C-C reference");
  await distanceRow.getByRole("button", {
    name: "Save name for Carbon distance",
  }).click();
  const renamed = page.locator(".measurement-row").filter({
    has: page.getByLabel("Name for C-C reference"),
  });
  await renamed.getByRole("button", { name: "Hide C-C reference" }).click();
  let state = (await (
    await request.get(`/api/v1/projects/${project.id}`)
  ).json()) as ProjectRead;
  expect(state.measurements.find((item) => item.name === "C-C reference")?.visible).toBe(
    false,
  );
  await renamed.getByRole("button", { name: "Show C-C reference" }).click();

  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "measurements" }).click();
  await expect(
    page.locator(".measurement-row").filter({
      has: page.getByLabel("Name for C-C reference"),
    }),
  ).toContainText(`${distance.toFixed(2)} Å`);

  await selectAtoms(page, entryId, [atoms[0].id]);
  await page.getByRole("tab", { name: "inspect" }).click();
  await expect(page.locator(".inspect-panel")).toContainText("Full name");
  await expect(page.locator(".inspect-panel")).toContainText(atoms[0].element);
  await expect(page.locator(".inspect-panel")).toContainText("Coordinates");
  await page.getByRole("tab", { name: "measurements" }).click();
  await expect(
    page.getByRole("button", { name: "distance", exact: true }),
  ).toBeDisabled();

  await page.getByLabel("Cutoff (Å)").fill("0");
  await page.getByRole("button", { name: "Find contacts" }).click();
  await expect(page.locator(".inline-error")).toBeVisible();
  await page.getByLabel("Cutoff (Å)").fill("3");
  await page.getByRole("button", { name: "Find contacts" }).click();
  await expect(page.locator(".contact-results button").first()).toBeVisible();
  await page.locator(".contact-results button").first().click();
  await expect(page.locator(".viewer-status")).toContainText("/ 2 selected");

  state = (await (
    await request.get(`/api/v1/projects/${project.id}`)
  ).json()) as ProjectRead;
  expect(state.measurements.map((item) => item.kind).sort()).toEqual([
    "angle",
    "dihedral",
    "distance",
  ]);
  const torsion = page.locator(".measurement-row").filter({
    has: page.getByLabel("Name for Torsion"),
  });
  await torsion.getByRole("button", { name: "Delete measurement Torsion" }).click();
  await expect(torsion).toBeHidden();
});
