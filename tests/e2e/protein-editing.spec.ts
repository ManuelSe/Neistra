import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const PROTEIN = resolve("tests/fixtures/formats/protein_editing.pdb");
const AMBIGUOUS = resolve(
  "tests/fixtures/formats/protein_models_altloc.pdb",
);

interface AtomRead {
  id: number;
  name: string;
  residue_id: number | null;
  element: string;
  coordinates: [number, number, number];
}

interface ResidueRead {
  id: number;
  chain_id: number;
  name: string;
  author_number: number | null;
  component_type: "polymer" | "ligand" | "water" | "ion" | "unknown";
}

interface StructureRead {
  chains: { id: number; name: string }[];
  residues: ResidueRead[];
  atoms: AtomRead[];
}

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  entries: {
    id: string;
    name: string;
    original_filename: string;
    atom_count: number;
    atom_ids: number[];
    residue_count: number;
    conformer_count: number;
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

async function openImportedProtein(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<{ state: ProjectRead; entryId: string }> {
  const created = await request.post("/api/v1/projects", {
    data: { name: `Protein editing ${testInfo.project.name} ${Date.now()}` },
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
  await dialog.locator('input[type="file"]').setInputFiles(PROTEIN);
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
    if (index === 1) {
      await mode.getByRole("button", { name: "add" }).click();
    }
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

test("edits protein hierarchy and chemistry with exact history and validation", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The complete protein editor uses the desktop three-panel workspace.",
  );
  test.setTimeout(240_000);
  page.setDefaultTimeout(12_000);

  const opened = await openImportedProtein(page, request, testInfo);
  let state = opened.state;
  const entryId = opened.entryId;
  const original = await structure(request, state.id, entryId);
  const originalBackbone = original.atoms
    .filter(
      (atom) =>
        atom.residue_id === 1 && ["N", "CA", "C", "O"].includes(atom.name),
    )
    .map((atom) => ({
      id: atom.id,
      name: atom.name,
      coordinates: atom.coordinates,
    }));
  await expectNonblankCanvas(page);

  await page.getByRole("tab", { name: "protein" }).click();
  await expect(page.getByLabel("Protein editor")).toContainText(
    "No rotamer search, protonation analysis, or full protein preparation",
  );
  await page
    .getByRole("combobox", { name: "Target amino acid" })
    .selectOption("VAL");
  await page.getByRole("button", { name: "Apply mutation" }).click();
  await expect(page.locator(".edit-report")).toContainText(
    "side chain was not searched across rotamers",
  );
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].atom_ids)
    .toEqual([...original.atoms.map((atom) => atom.id), 23, 24]);
  let changed = await structure(request, state.id, entryId);
  expect(changed.residues.find((residue) => residue.id === 1)?.name).toBe("VAL");
  expect(
    changed.atoms
      .filter(
        (atom) =>
          atom.residue_id === 1 && ["N", "CA", "C", "O"].includes(atom.name),
      )
      .map((atom) => ({
        id: atom.id,
        name: atom.name,
        coordinates: atom.coordinates,
      })),
  ).toEqual(originalBackbone);
  state = await project(request, state.id);
  await expect(page.locator(".viewer-error")).toBeHidden();
  await expectNonblankCanvas(page);

  await page.getByRole("button", { name: /Undo: Mutate residue/ }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).residues.find(
          (residue) => residue.id === 1,
        )?.name,
    )
    .toBe("ALA");
  await page.getByRole("button", { name: /Redo: Mutate residue/ }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).residues.find(
          (residue) => residue.id === 1,
        )?.name,
    )
    .toBe("VAL");
  state = await project(request, state.id);

  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Add H" }).click();
  await expect(page.locator(".edit-report")).toContainText(
    "not a complete protonation-state calculation",
  );
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].atom_count)
    .toBeGreaterThan(24);
  state = await project(request, state.id);
  await page.getByRole("button", { name: "Remove H" }).click();
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].atom_count)
    .toBe(24);
  state = await project(request, state.id);

  await page.getByRole("button", { name: /Remove water/ }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).residues.some(
          (residue) => residue.component_type === "water",
        ),
    )
    .toBe(false);
  state = await project(request, state.id);
  await page.getByRole("button", { name: /Remove ions/ }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).residues.some(
          (residue) => residue.component_type === "ion",
        ),
    )
    .toBe(false);
  state = await project(request, state.id);

  await page.getByLabel("New chain name").fill("X");
  await page.getByRole("button", { name: "Apply name" }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).chains.find(
          (chain) => chain.id === 1,
        )?.name,
    )
    .toBe("X");
  state = await project(request, state.id);
  await page.getByLabel("Start").fill("100");
  await page.getByLabel("Step").fill("10");
  await page.getByRole("button", { name: /Renumber/ }).click();
  await expect
    .poll(async () =>
      (await structure(request, state.id, entryId)).residues
        .filter((residue) => residue.chain_id === 1)
        .map((residue) => residue.author_number),
    )
    .toEqual([100, 110, 120]);
  state = await project(request, state.id);

  await selectAtoms(page, entryId, [15]);
  await page.getByRole("tab", { name: "protein" }).click();
  const beforeAtomMove = (await structure(request, state.id, entryId)).atoms.find(
    (atom) => atom.id === 15,
  )!.coordinates;
  await page.getByLabel("dX").fill("1");
  await page.getByRole("button", { name: "Move atoms" }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).atoms.find(
          (atom) => atom.id === 15,
        )!.coordinates[0],
    )
    .toBeCloseTo(beforeAtomMove[0] + 1, 8);
  state = await project(request, state.id);

  const beforeResidueMove = await structure(request, state.id, entryId);
  await page.getByRole("button", { name: "Whole residues" }).click();
  await page.getByLabel("dX").fill("0.5");
  await page.getByRole("button", { name: "Move residues" }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).atoms.find(
          (atom) => atom.id === 10,
        )!.coordinates[0],
    )
    .toBeCloseTo(
      beforeResidueMove.atoms.find((atom) => atom.id === 10)!.coordinates[0] +
        0.5,
      8,
    );
  state = await project(request, state.id);

  await page.getByRole("button", { name: "Delete selected atoms" }).click();
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].atom_ids)
    .not.toContain(15);
  await page.getByRole("button", { name: /Undo: Delete 1 atoms/ }).click();
  await expect
    .poll(async () => (await project(request, state.id)).entries[0].atom_ids)
    .toContain(15);
  state = await project(request, state.id);

  await selectAtoms(page, entryId, [7]);
  await page.getByRole("tab", { name: "protein" }).click();
  await page.getByRole("button", { name: "Delete selected residues" }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).residues.some(
          (residue) => residue.id === 2,
        ),
    )
    .toBe(false);
  await page.getByRole("button", { name: /Undo: Delete 1 residues/ }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).residues.some(
          (residue) => residue.id === 2,
        ),
    )
    .toBe(true);
  state = await project(request, state.id);

  await page
    .getByRole("combobox", { name: "Chain", exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "Delete chain" }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).chains.some(
          (chain) => chain.id === 2,
        ),
    )
    .toBe(false);
  await page.getByRole("button", { name: /Undo: Delete 1 chains/ }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, state.id, entryId)).chains.some(
          (chain) => chain.id === 2,
        ),
    )
    .toBe(true);
  state = await project(request, state.id);
  await expect(page.locator(".viewer-error")).toBeHidden();
  await expectNonblankCanvas(page);

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
  await page.getByRole("tab", { name: "protein" }).click();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply mutation" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(AMBIGUOUS);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".viewer-status")).toContainText(
    "2 visible / 2 loaded",
    { timeout: 30_000 },
  );
  state = await project(request, state.id);
  const ambiguous = state.entries.find(
    (entry) => entry.original_filename === "protein_models_altloc.pdb",
  );
  expect(ambiguous).toBeDefined();
  await page
    .getByRole("combobox", { name: "Protein" })
    .selectOption(ambiguous!.id);
  await expect(page.getByRole("button", { name: "Apply mutation" })).toBeEnabled();
  const revisionBeforeFailure = state.revision;
  await page.getByRole("button", { name: "Apply mutation" }).click();
  await expect(page.locator(".notice[role='alert']")).toContainText(
    "exactly one conformer",
  );
  expect((await project(request, state.id)).revision).toBe(
    revisionBeforeFailure,
  );
});

test("keeps protein editing usable in the mobile inspector", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Responsive protein-editor coverage uses the mobile project.",
  );
  page.setDefaultTimeout(12_000);
  const opened = await openImportedProtein(page, request, testInfo);
  const { entryId } = opened;

  await page.getByRole("button", { name: "Inspector" }).click();
  const inspector = page.getByRole("region", { name: "Project inspector" });
  await inspector.getByRole("tab", { name: "protein" }).click();
  await expect(inspector.getByLabel("Protein editor")).toBeVisible();
  await expect(inspector).toContainText(
    "No rotamer search, protonation analysis, or full protein preparation",
  );
  await inspector.getByLabel("New chain name").fill("M");
  await inspector.getByRole("button", { name: "Apply name" }).click();
  await expect
    .poll(
      async () =>
        (await structure(request, opened.state.id, entryId)).chains.find(
          (chain) => chain.id === 1,
        )?.name,
    )
    .toBe("M");
  await expect(inspector.getByText("Last protein edit")).toBeVisible();
  expect(
    await page.locator(".mobile-panel").evaluate(
      (panel) => panel.scrollWidth <= panel.clientWidth,
    ),
  ).toBe(true);
});
