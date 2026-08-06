import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const FIXTURE = resolve("tests/fixtures/complex/component_hierarchy.pdb");

interface ProjectRead {
  id: string;
  name: string;
  revision: number;
  entries: {
    id: string;
    name: string;
    current_artifact_id: string;
    viewer_settings: { components: { solvent: boolean } };
  }[];
  saved_selections: { name: string; atom_references: unknown[] }[];
  scenes: { name: string; camera: unknown }[];
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
    atoms: { id: number; residue_id: number | null }[];
  };
}

async function createAndOpen(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<ProjectRead> {
  const created = await request.post("/api/v1/projects", {
    data: { name: `Structure hierarchy ${testInfo.project.name} ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const project = (await created.json()) as ProjectRead;
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${project.name}`) })
    .click();
  return project;
}

async function importFixture(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(FIXTURE);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 30_000,
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

async function saveScene(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  await page.getByPlaceholder("Scene name").fill(name);
  await page.getByRole("button", { name: "Save current scene" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close viewer controls" }).click();
}

function categoryDetails(page: Page, label: string) {
  return page
    .locator("details.hierarchy-category")
    .filter({ has: page.locator("summary", { hasText: label }) });
}

function componentMembers(payload: StructureRead, category: string): number[] {
  const components = payload.hierarchy.components.filter(
    (component) => component.category === category,
  );
  const residueIds = new Set(components.flatMap((component) => component.residue_ids));
  const explicitIds = new Set(components.flatMap((component) => component.atom_ids));
  return payload.structure.atoms
    .filter(
      (atom) =>
        explicitIds.has(atom.id) ||
        (atom.residue_id !== null && residueIds.has(atom.residue_id)),
    )
    .map((atom) => atom.id);
}

async function expectSelectionAtoms(page: Page, count: number): Promise<void> {
  await expect(page.getByLabel("Current selection summary")).toContainText(
    `Atoms${count}`,
  );
  await expect(page.locator(".viewer-status")).toContainText(`/ ${count} selected`);
}

test("synchronizes hierarchy selection, visibility, focus, persistence, and WebGL", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Full hierarchy qualification is desktop-only.");
  test.setTimeout(120_000);
  const project = await createAndOpen(page, request, testInfo);
  const structureRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(outgoing.url()).pathname)) {
      structureRequests.push(outgoing.url());
    }
  });
  await importFixture(page);
  let current = await readProject(request, project.id);
  const entry = current.entries[0];
  const structure = (await (
    await request.get(
      `/api/v1/projects/${project.id}/entries/${entry.id}/structure`,
    )
  ).json()) as StructureRead;
  const ligandAtoms = componentMembers(structure, "ligand");
  expect(ligandAtoms).toEqual([5, 6]);

  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  const meaningfulPixel = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!context) return 0;
    const pixel = new Uint8Array(4);
    context.readPixels(
      Math.floor(element.width / 2),
      Math.floor(element.height / 2),
      1,
      1,
      context.RGBA,
      context.UNSIGNED_BYTE,
      pixel,
    );
    return pixel[0] + pixel[1] + pixel[2] + pixel[3];
  });
  expect(meaningfulPixel).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Fit all visible" }).click();
  await page.waitForTimeout(750);
  await saveScene(page, "Before hierarchy selection");
  const beforeSelection = await readProject(request, project.id);

  await page.getByLabel(`Component hierarchy for ${entry.name}`).click();
  await expect(page.getByText("Polymers", { exact: true })).toBeVisible();
  await expect(page.getByText("Other heterogens", { exact: true })).toBeVisible();
  expect(structureRequests).toHaveLength(1);

  const ions = categoryDetails(page, "Ions / metals");
  await ions.locator("summary").click();
  await ions.getByRole("button", { name: /ZN 401/ }).click();
  await expectSelectionAtoms(page, 1);
  const water = categoryDetails(page, "Water");
  await water.locator("summary").click();
  await water.getByRole("button", { name: /HOH 201/ }).click({ modifiers: ["Control"] });
  await expectSelectionAtoms(page, 2);
  await water.getByRole("button", { name: /HOH 201/ }).click({ modifiers: ["Alt"] });
  await expectSelectionAtoms(page, 1);

  const ligands = categoryDetails(page, "Ligands / cofactors");
  await ligands.locator("summary").click();
  await page.getByLabel(`Select Ligands / cofactors in ${entry.name}`).click();
  await expectSelectionAtoms(page, ligandAtoms.length);
  expect(await readProject(request, project.id)).toEqual(beforeSelection);
  expect(structureRequests).toHaveLength(1);

  await saveScene(page, "After hierarchy selection");
  current = await readProject(request, project.id);
  const beforeCamera = current.scenes.find(
    (scene) => scene.name === "Before hierarchy selection",
  )?.camera;
  const afterCamera = current.scenes.find(
    (scene) => scene.name === "After hierarchy selection",
  )?.camera;
  expect(afterCamera).toEqual(beforeCamera);
  await page.getByRole("button", { name: "Focus selection" }).click();
  await page.waitForTimeout(750);
  await saveScene(page, "Focused hierarchy selection");
  current = await readProject(request, project.id);
  expect(
    current.scenes.find((scene) => scene.name === "Focused hierarchy selection")
      ?.camera,
  ).not.toEqual(afterCamera);

  const solvent = categoryDetails(page, "Other solvent / additives");
  await solvent.locator("summary").click();
  await page
    .getByLabel(`Hide Other solvent / additives visibility group in ${entry.name}`)
    .click();
  await expect
    .poll(async () => (await readProject(request, project.id)).entries[0].viewer_settings.components.solvent)
    .toBe(false);
  await expect(page.locator(".viewer-error")).toBeHidden();
  await page
    .getByLabel(`Show Other solvent / additives visibility group in ${entry.name}`)
    .click();
  await expect
    .poll(async () => (await readProject(request, project.id)).entries[0].viewer_settings.components.solvent)
    .toBe(true);
  expect(structureRequests).toHaveLength(1);

  await page.getByPlaceholder("Selection name").fill("Hierarchy ligand");
  await page.getByRole("button", { name: "Save current selection" }).click();
  await expect(
    page.locator(".saved-selection-row").filter({ hasText: "Hierarchy ligand" }),
  ).toContainText("2 atoms");
  expect(
    (await readProject(request, project.id)).saved_selections[0].atom_references,
  ).toHaveLength(2);

  const accessibility = await new AxeBuilder({ page })
    .include(".project-browser")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("/ 0 selected", {
    timeout: 30_000,
  });
  const saved = page
    .locator(".saved-selection-row")
    .filter({ hasText: "Hierarchy ligand" });
  await expect(saved).toBeVisible();
  await saved.getByRole("button").first().click();
  await expectSelectionAtoms(page, 2);
});

test("keeps the hierarchy keyboard-operable and bounded in the Pixel 7 drawer", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Compact hierarchy qualification runs in the Pixel 7 project.",
  );
  test.setTimeout(90_000);
  const project = await createAndOpen(page, request, testInfo);
  await importFixture(page);
  const current = await readProject(request, project.id);
  const entry = current.entries[0];

  const trigger = page.getByRole("button", { name: "Project browser", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Project browser panel" });
  await expect(drawer).toBeVisible();
  const hierarchy = drawer.getByLabel(`Component hierarchy for ${entry.name}`);
  await hierarchy.focus();
  await page.keyboard.press("Enter");
  await expect(drawer.getByText("Polymers", { exact: true })).toBeVisible();
  const ligandSummary = categoryDetails(page, "Ligands / cofactors").locator("summary");
  await ligandSummary.focus();
  await page.keyboard.press("Enter");
  const ligand = drawer.getByRole("button", { name: /LIG 101/ });
  await ligand.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".viewer-status")).toContainText("/ 2 selected");

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  const clipped = await drawer.locator("button:visible, summary:visible").evaluateAll(
    (controls) =>
      controls.flatMap((control) => {
        const box = control.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1
          ? [control.getAttribute("aria-label") ?? control.textContent]
          : [];
      }),
  );
  expect(clipped).toEqual([]);
  const accessibility = await new AxeBuilder({ page })
    .include(".mobile-panel")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});
