import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const COMPLEX_FIXTURES = resolve("tests/fixtures/complex");

interface SelectionRepresentation {
  style: string;
  atom_ids: number[];
}

interface CameraRead {
  mode: "perspective" | "orthographic";
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  radius: number;
}

interface ProjectEntry {
  id: string;
  name: string;
  source_format: string;
  current_artifact_id: string;
  original_artifact_id: string;
  viewer_settings: {
    representations: { style: string }[];
    selection_representations: SelectionRepresentation[];
  };
}

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  entries: ProjectEntry[];
  scenes: {
    id: string;
    name: string;
    camera: CameraRead;
    entry_states: { entry_id: string; viewer_settings: ProjectEntry["viewer_settings"] }[];
  }[];
}

interface StructureRead {
  hierarchy: {
    components: {
      category: string;
      residue_ids: number[];
      atom_ids: number[];
    }[];
  };
  structure: {
    atoms: {
      id: number;
      name: string;
      residue_id: number | null;
      coordinates: [number, number, number];
    }[];
    residues: { id: number; name: string }[];
    bonds: { atom_1_id: number; atom_2_id: number }[];
  };
}

async function createAndOpen(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
  label: string,
): Promise<ProjectRead> {
  const response = await request.post("/api/v1/projects", {
    data: { name: `${label} ${testInfo.project.name} ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const project = (await response.json()) as ProjectRead;
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${project.name}`) })
    .click();
  return project;
}

async function importFixture(page: Page, fixture: string): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(resolve(COMPLEX_FIXTURES, fixture));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 45_000,
  });
}

async function readProject(
  request: APIRequestContext,
  projectId: string,
): Promise<ProjectRead> {
  const response = await request.get(`/api/v1/projects/${projectId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ProjectRead;
}

async function readStructure(
  request: APIRequestContext,
  projectId: string,
  entryId: string,
): Promise<StructureRead> {
  const response = await request.get(
    `/api/v1/projects/${projectId}/entries/${entryId}/structure`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as StructureRead;
}

function componentMembers(payload: StructureRead, category: string): number[] {
  const components = payload.hierarchy.components.filter(
    (component) => component.category === category,
  );
  const residues = new Set(components.flatMap((component) => component.residue_ids));
  const explicit = new Set(components.flatMap((component) => component.atom_ids));
  return payload.structure.atoms
    .filter(
      (atom) =>
        explicit.has(atom.id) ||
        (atom.residue_id !== null && residues.has(atom.residue_id)),
    )
    .map((atom) => atom.id);
}

async function selectAtom(page: Page, entryId: string, atomId: number): Promise<void> {
  await page.getByRole("tab", { name: "selection" }).click();
  await page.getByRole("group", { name: "Operation mode" }).getByRole("button", {
    name: "replace",
  }).click();
  await page.getByLabel("Select by").selectOption("atom_reference");
  await page.getByLabel("Value").fill(`${entryId}:${atomId}`);
  await page.getByRole("button", { name: "Apply query" }).click();
}

async function styleSelection(page: Page, label: string): Promise<void> {
  const launcher = page.getByRole("button", { name: "Style selection" });
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Style selection" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await expect(dialog.getByRole("status")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
}

async function resetSelectionStyle(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Style selection" }).click();
  const dialog = page.getByRole("dialog", { name: "Style selection" });
  await dialog.getByRole("button", { name: "Reset to entry defaults" }).click();
  await expect(dialog.getByRole("status")).toContainText("Reset");
  await page.keyboard.press("Escape");
}

async function saveScene(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByPlaceholder("Scene name").fill(name);
  await page.getByRole("button", { name: "Save current scene" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close viewer controls" }).click();
}

async function expectNonblank(page: Page): Promise<void> {
  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  const sum = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!context) return 0;
    const pixel = new Uint8Array(4);
    let total = 0;
    for (const [x, y] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]]) {
      context.readPixels(
        Math.floor(element.width * x),
        Math.floor(element.height * y),
        1,
        1,
        context.RGBA,
        context.UNSIGNED_BYTE,
        pixel,
      );
      total += pixel[0] + pixel[1] + pixel[2] + pixel[3];
    }
    return total;
  });
  expect(sum).toBeGreaterThan(0);
}

function closestProteinResidue(payload: StructureRead, ligandIds: number[]): number {
  const ligand = payload.structure.atoms.filter((atom) => ligandIds.includes(atom.id));
  const proteinResidues = new Set(
    payload.hierarchy.components
      .filter((component) => component.category === "protein")
      .flatMap((component) => component.residue_ids),
  );
  const candidates = payload.structure.atoms.filter(
    (atom) => atom.residue_id !== null && proteinResidues.has(atom.residue_id),
  );
  const squaredDistance = (left: number[], right: number[]) =>
    left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
  return candidates.reduce((closest, atom) => {
    const distance = Math.min(
      ...ligand.map((target) => squaredDistance(atom.coordinates, target.coordinates)),
    );
    return distance < closest.distance
      ? { residueId: atom.residue_id!, distance }
      : closest;
  }, { residueId: candidates[0].residue_id!, distance: Number.POSITIVE_INFINITY }).residueId;
}

test("styles a 1STP complex without changing scientific or transient state", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Full 1STP workflow is desktop-only.");
  test.setTimeout(180_000);
  const project = await createAndOpen(page, request, testInfo, "Selection styling 1STP");
  const structureRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(outgoing.url()).pathname)) {
      structureRequests.push(outgoing.url());
    }
  });
  await importFixture(page, "1stp.pdb");
  let current = await readProject(request, project.id);
  const entry = current.entries[0];
  const structure = await readStructure(request, project.id, entry.id);
  const ligandIds = componentMembers(structure, "ligand");
  expect(ligandIds.length).toBeGreaterThan(0);
  const beforeStructure = structure.structure;
  const beforeOriginal = await (
    await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)
  ).body();
  const beforeArtifacts = {
    current: entry.current_artifact_id,
    original: entry.original_artifact_id,
  };

  await page.getByRole("button", { name: "Fit all visible" }).click();
  await saveScene(page, "Before selection styling");
  current = await readProject(request, project.id);
  const cameraBefore = current.scenes.find(
    (scene) => scene.name === "Before selection styling",
  )!.camera;

  await page.getByLabel(`Component hierarchy for ${entry.name}`).click();
  const ligands = page.locator("details.hierarchy-category").filter({ hasText: "Ligands / cofactors" });
  await ligands.locator("summary").click();
  await page.getByLabel(`Select Ligands / cofactors in ${entry.name}`).click();
  const selectedStatus = await page.locator(".viewer-status").textContent();
  await page.getByPlaceholder("Selection name").fill("Biotin styling target");
  await page.getByRole("button", { name: "Save current selection" }).click();

  const revisionBeforeThin = (await readProject(request, project.id)).revision;
  await styleSelection(page, "Thin sticks");
  let styled = await readProject(request, project.id);
  expect(styled.revision).toBe(revisionBeforeThin + 1);
  await expect(page.locator(".viewer-status")).toHaveText(selectedStatus ?? "");
  const thinImage = await page.locator(".molstar-host canvas").first().screenshot();

  const revisionBeforeThick = styled.revision;
  await styleSelection(page, "Thick sticks");
  styled = await readProject(request, project.id);
  expect(styled.revision).toBe(revisionBeforeThick + 1);
  expect(
    styled.entries[0].viewer_settings.selection_representations,
  ).toContainEqual({ style: "thick-stick", atom_ids: ligandIds });
  const thickImage = await page.locator(".molstar-host canvas").first().screenshot();
  expect(thickImage.equals(thinImage)).toBe(false);

  const bindingResidueId = closestProteinResidue(structure, ligandIds);
  const bindingAtoms = structure.structure.atoms
    .filter((atom) => atom.residue_id === bindingResidueId)
    .map((atom) => atom.id);
  await selectAtom(page, entry.id, bindingAtoms[0]);
  await page
    .getByRole("group", { name: "Expand current" })
    .getByRole("button", { name: "residue" })
    .click();
  await expect(page.locator(".viewer-status")).toContainText(`/ ${bindingAtoms.length} selected`);
  const picking = page
    .getByRole("group", { name: "Viewer pick", exact: true })
    .getByRole("button", { name: "residue" });
  await picking.click();
  const revisionBeforeBinding = styled.revision;
  await styleSelection(page, "Thin sticks");
  styled = await readProject(request, project.id);
  expect(styled.revision).toBe(revisionBeforeBinding + 1);
  expect(styled.entries[0].viewer_settings.representations[0].style).toBe("cartoon");
  expect(styled.entries[0].viewer_settings.selection_representations).toEqual([
    { style: "stick", atom_ids: bindingAtoms },
    { style: "thick-stick", atom_ids: ligandIds },
  ]);
  await expect(picking).toHaveAttribute("aria-pressed", "true");
  await expectNonblank(page);

  await saveScene(page, "Styled complex");
  current = await readProject(request, project.id);
  expect(current.scenes.find((scene) => scene.name === "Styled complex")!.camera).toEqual(
    cameraBefore,
  );
  expect(structureRequests).toHaveLength(1);
  expect((await readStructure(request, project.id, entry.id)).structure).toEqual(beforeStructure);
  const unchangedEntry = current.entries[0];
  expect({
    current: unchangedEntry.current_artifact_id,
    original: unchangedEntry.original_artifact_id,
  }).toEqual(beforeArtifacts);
  expect(
    await (
      await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)
    ).body(),
  ).toEqual(beforeOriginal);

  await resetSelectionStyle(page);
  let reset = await readProject(request, project.id);
  expect(reset.entries[0].viewer_settings.selection_representations).toEqual([
    { style: "thick-stick", atom_ids: ligandIds },
  ]);
  const undo = await request.post(`/api/v1/projects/${project.id}/history/undo`, {
    data: { expected_revision: reset.revision },
  });
  expect(undo.status()).toBe(200);
  reset = (await undo.json()) as ProjectRead;
  expect(reset.entries[0].viewer_settings.selection_representations).toEqual([
    { style: "stick", atom_ids: bindingAtoms },
    { style: "thick-stick", atom_ids: ligandIds },
  ]);
  const redo = await request.post(`/api/v1/projects/${project.id}/history/redo`, {
    data: { expected_revision: reset.revision },
  });
  expect(redo.status()).toBe(200);
  reset = (await redo.json()) as ProjectRead;
  expect(reset.entries[0].viewer_settings.selection_representations).toEqual([
    { style: "thick-stick", atom_ids: ligandIds },
  ]);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 45_000,
  });
  await expectNonblank(page);
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByRole("button", { name: "Styled complex", exact: true }).click();
  await page.getByRole("button", { name: "Close viewer controls" }).click();
  await expect(page.locator(".viewer-status")).toContainText(
    `/ ${bindingAtoms.length} selected`,
  );
  const sceneRestored = await readProject(request, project.id);
  expect(sceneRestored.entries[0].viewer_settings.selection_representations).toEqual([
    { style: "stick", atom_ids: bindingAtoms },
    { style: "thick-stick", atom_ids: ligandIds },
  ]);
  const saved = page.locator(".saved-selection-row").filter({ hasText: "Biotin styling target" });
  await saved.getByRole("button").first().click();
  await expect(page.locator(".viewer-status")).toContainText(`/ ${ligandIds.length} selected`);
  await styleSelection(page, "Thick sticks");
  expect(structureRequests).toHaveLength(2);
  await page.goto("about:blank");
});

test("keeps ion, water, and covalent-boundary targets exact", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Boundary qualification is desktop-only.");
  test.setTimeout(120_000);
  const project = await createAndOpen(page, request, testInfo, "Selection styling boundary");
  const structureRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(outgoing.url()).pathname)) {
      structureRequests.push(outgoing.url());
    }
  });
  await importFixture(page, "component_hierarchy.pdb");
  let current = await readProject(request, project.id);
  const entry = current.entries[0];
  const structure = await readStructure(request, project.id, entry.id);
  await page.getByLabel(`Component hierarchy for ${entry.name}`).click();

  const chooseComponent = async (category: string, component: RegExp) => {
    const details = page.locator("details.hierarchy-category").filter({ hasText: category });
    if (!(await details.getAttribute("open"))) await details.locator("summary").click();
    await details.getByRole("button", { name: component }).click();
  };

  await chooseComponent("Ions / metals", /ZN 401/);
  await page.getByRole("button", { name: "Style selection" }).click();
  const ionDialog = page.getByRole("dialog", { name: "Style selection" });
  await expect(ionDialog.getByText(/require complete protein, DNA, or RNA residues/i)).toBeVisible();
  await expect(ionDialog.getByRole("button", { name: "Cartoon" })).toBeDisabled();
  await ionDialog.getByRole("button", { name: "Space filling" }).click();
  await expect(ionDialog.getByRole("status")).toBeVisible();
  await page.keyboard.press("Escape");

  await chooseComponent("Water", /HOH 201/);
  await styleSelection(page, "Ball and stick");
  await chooseComponent("Ligands / cofactors", /LIG 101/);
  await styleSelection(page, "Line");
  current = await readProject(request, project.id);
  expect(current.entries[0].viewer_settings.selection_representations).toEqual([
    { style: "ball-and-stick", atom_ids: [7] },
    { style: "line", atom_ids: [5, 6] },
    { style: "space-filling", atom_ids: [9] },
  ]);
  expect(structure.structure.bonds).toContainEqual(
    expect.objectContaining({ atom_1_id: 3, atom_2_id: 5 }),
  );
  expect(
    current.entries[0].viewer_settings.selection_representations.find(
      (assignment) => assignment.style === "line",
    )!.atom_ids,
  ).not.toContain(3);
  expect(structureRequests).toHaveLength(1);
  await expectNonblank(page);
  const accessibility = await new AxeBuilder({ page })
    .include(".structure-viewer")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.goto("about:blank");
});

test("keeps the selection styling dialog bounded and keyboard-operable on Pixel 7", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Responsive workflow is mobile-only.");
  test.setTimeout(90_000);
  const project = await createAndOpen(page, request, testInfo, "Selection styling mobile");
  await importFixture(page, "component_hierarchy.pdb");
  const current = await readProject(request, project.id);
  const entry = current.entries[0];
  const projectBrowser = page.getByRole("button", {
    name: "Project browser",
    exact: true,
  });
  await projectBrowser.click();
  const drawer = page.getByRole("dialog", { name: "Project browser panel" });
  await drawer.getByLabel(`Component hierarchy for ${entry.name}`).click();
  const ions = drawer
    .locator("details.hierarchy-category")
    .filter({ hasText: "Ions / metals" });
  await ions.locator("summary").click();
  await ions.getByRole("button", { name: /ZN 401/ }).click();
  await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  const launcher = page.getByRole("button", { name: "Style selection" });
  await launcher.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Style selection" });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  const clipped = await dialog.locator("button:visible").evaluateAll((controls) =>
    controls.flatMap((control) => {
      const box = control.getBoundingClientRect();
      return box.left < -1 || box.right > window.innerWidth + 1
        ? [control.getAttribute("aria-label") ?? control.textContent]
        : [];
    }),
  );
  expect(clipped).toEqual([]);
  const accessibility = await new AxeBuilder({ page })
    .include(".dialog-content")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole("button", { name: "Thick sticks" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
  await page.goto("about:blank");
});
