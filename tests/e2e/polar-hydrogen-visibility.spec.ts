import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const HYDROGEN_FIXTURES = resolve("tests/fixtures/hydrogens");
const FORMAT_FIXTURES = resolve("tests/fixtures/formats");

interface ViewerSettings {
  representations: {
    id: string;
    style: string;
    color_by: string;
    custom_color: string;
    opacity: number;
  }[];
  selection_representations: { style: string; atom_ids: number[] }[];
  components: {
    hydrogens: boolean;
    nonpolar_hydrogens: boolean;
    solvent: boolean;
    ions: boolean;
    ligands: boolean;
    protein: boolean;
  };
  labels: {
    atoms: boolean;
    residues: boolean;
    chains: boolean;
    structure: boolean;
  };
}

interface ProjectEntry {
  id: string;
  name: string;
  atom_count: number;
  atom_ids: number[];
  bond_count: number;
  conformer_count: number;
  warnings: unknown[];
  current_artifact_id: string;
  original_artifact_id: string;
  viewer_settings: ViewerSettings;
}

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
  checkpoint_revision: number;
  has_uncheckpointed_changes: boolean;
  entries: ProjectEntry[];
  scenes: {
    id: string;
    name: string;
    camera: CameraRead;
    entry_states: { entry_id: string; viewer_settings: ViewerSettings }[];
  }[];
}

interface StructureRead {
  structure: {
    atoms: {
      id: number;
      name: string;
      element: string;
      coordinates: [number, number, number];
      inferred_fields: string[];
    }[];
    bonds: { atom_1_id: number; atom_2_id: number; order: number | null }[];
    conformers: unknown[];
    warnings: unknown[];
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    .getByRole("button", { name: new RegExp(`^${escapeRegex(project.name)}`) })
    .click();
  return project;
}

async function importFixture(page: Page, path: string): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles(path);
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

async function canvasSignature(page: Page): Promise<number> {
  const canvas = page.locator(".molstar-host canvas").first();
  await expect(canvas).toBeVisible();
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!context) return 0;
    context.finish();
    const pixels = new Uint8Array(element.width * element.height * 4);
    context.readPixels(
      0,
      0,
      element.width,
      element.height,
      context.RGBA,
      context.UNSIGNED_BYTE,
      pixels,
    );
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 1) {
      hash ^= pixels[index];
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  });
}

async function waitForDifferentSignature(page: Page, previous: number): Promise<number> {
  await expect
    .poll(() => canvasSignature(page), { timeout: 15_000 })
    .not.toBe(previous);
  return canvasSignature(page);
}

async function waitForSignature(page: Page, expected: number): Promise<void> {
  await expect.poll(() => canvasSignature(page), { timeout: 15_000 }).toBe(expected);
}

async function openViewerControls(page: Page): Promise<void> {
  const open = page.getByRole("button", { name: "Open viewer controls" });
  if (await open.isVisible()) await open.click();
}

async function setHydrogenControl(
  page: Page,
  request: APIRequestContext,
  projectId: string,
  label: "Show hydrogens" | "Show non-polar hydrogens",
  checked: boolean,
): Promise<ProjectRead> {
  await openViewerControls(page);
  const control = page.getByRole("checkbox", { name: label });
  if ((await control.isChecked()) !== checked) await control.click();
  await expect.poll(async () => {
    const state = await readProject(request, projectId);
    const components = state.entries[0].viewer_settings.components;
    return label === "Show hydrogens"
      ? components.hydrogens
      : components.nonpolar_hydrogens;
  }).toBe(checked);
  await page.waitForTimeout(500);
  return readProject(request, projectId);
}

async function saveScene(page: Page, name: string): Promise<void> {
  await openViewerControls(page);
  await page.getByPlaceholder("Scene name").fill(name);
  await page.getByRole("button", { name: "Save current scene" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
}

function molecularSnapshot(entry: ProjectEntry, structure: StructureRead) {
  return {
    atom_count: entry.atom_count,
    atom_ids: entry.atom_ids,
    bond_count: entry.bond_count,
    conformer_count: entry.conformer_count,
    warnings: entry.warnings,
    current_artifact_id: entry.current_artifact_id,
    original_artifact_id: entry.original_artifact_id,
    structure: structure.structure,
  };
}

async function qualifyThreeModes(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
  fixture: string,
): Promise<void> {
  testInfo.setTimeout(180_000);
  const project = await createAndOpen(
    page,
    request,
    testInfo,
    `Polar hydrogen ${fixture}`,
  );
  const structureRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(outgoing.url()).pathname)) {
      structureRequests.push(outgoing.url());
    }
  });
  await importFixture(page, resolve(HYDROGEN_FIXTURES, fixture));
  const initial = await readProject(request, project.id);
  const entry = initial.entries[0];
  const structure = await readStructure(request, project.id, entry.id);
  expect(structure.structure.atoms.map((atom) => atom.element)).toEqual([
    "C",
    "H",
    "O",
    "H",
  ]);
  expect(
    structure.structure.bonds.map((bond) => [bond.atom_1_id, bond.atom_2_id]),
  ).toEqual([
    [1, 2],
    [1, 3],
    [3, 4],
  ]);
  const before = molecularSnapshot(entry, structure);
  const original = await (
    await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)
  ).body();

  if (entry.viewer_settings.representations[0].style !== "ball-and-stick") {
    await openViewerControls(page);
    await page
      .getByLabel(`Representation style for ${entry.name}`)
      .selectOption("ball-and-stick");
    await expect.poll(async () => {
      const state = await readProject(request, project.id);
      return state.entries[0].viewer_settings.representations[0].style;
    }).toBe("ball-and-stick");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Close viewer controls" }).click();
  }

  await page.getByRole("button", { name: "Fit all visible" }).click();
  await page.waitForTimeout(500);
  const all = await canvasSignature(page);
  expect(all).not.toBe(0);

  await setHydrogenControl(
    page,
    request,
    project.id,
    "Show non-polar hydrogens",
    false,
  );
  const polarOnly = await waitForDifferentSignature(page, all);

  await setHydrogenControl(page, request, project.id, "Show hydrogens", false);
  const none = await waitForDifferentSignature(page, polarOnly);
  await expect(
    page.getByRole("checkbox", { name: "Show non-polar hydrogens" }),
  ).toBeDisabled();

  await setHydrogenControl(page, request, project.id, "Show hydrogens", true);
  await waitForSignature(page, polarOnly);
  await setHydrogenControl(
    page,
    request,
    project.id,
    "Show non-polar hydrogens",
    true,
  );
  const restoredAll = await waitForDifferentSignature(page, polarOnly);
  expect(restoredAll).not.toBe(none);
  expect(structureRequests).toHaveLength(1);

  const after = await readProject(request, project.id);
  const afterStructure = await readStructure(request, project.id, entry.id);
  expect(molecularSnapshot(after.entries[0], afterStructure)).toEqual(before);
  expect(
    await (
      await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)
    ).body(),
  ).toEqual(original);
}

for (const fixture of [
  "polar_hydrogens_protein.pdb",
  "polar_hydrogens_ligand.mol",
]) {
  test(`${fixture} renders all, polar-only, and no-hydrogen modes`, async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Scientific pixel qualification runs once in desktop Chromium.",
    );
    await qualifyThreeModes(page, request, testInfo, fixture);
  });
}

test("persists polar-only mode across viewer workflows without transient or molecular drift", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Complete durability and representation qualification runs once.",
  );
  test.setTimeout(240_000);
  const project = await createAndOpen(
    page,
    request,
    testInfo,
    "Polar hydrogen durability",
  );
  const structureRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(outgoing.url()).pathname)) {
      structureRequests.push(outgoing.url());
    }
  });
  await importFixture(
    page,
    resolve(HYDROGEN_FIXTURES, "polar_hydrogens_ligand.mol"),
  );
  let state = await readProject(request, project.id);
  const entry = state.entries[0];
  const structure = await readStructure(request, project.id, entry.id);
  const before = molecularSnapshot(entry, structure);
  const original = await (
    await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)
  ).body();

  await page.getByRole("button", { name: "Pick residues" }).click();
  await page.getByRole("tab", { name: "selection" }).click();
  await page
    .getByRole("group", { name: "Operation mode" })
    .getByRole("button", { name: "replace" })
    .click();
  await page.getByLabel("Select by").selectOption("atom_reference");
  await page.getByLabel("Value").fill(`${entry.id}:1`);
  await page.getByRole("button", { name: "Apply query" }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 selected");
  await openViewerControls(page);
  await page
    .getByLabel("Viewer navigation")
    .getByRole("button", { name: "Isolate selection" })
    .click();
  await expect(
    page.getByLabel("Viewer navigation").getByRole("button", { name: "Show all" }),
  ).toBeVisible();
  await saveScene(page, "Camera before hydrogen toggle");
  state = await readProject(request, project.id);
  const cameraBefore = state.scenes.find(
    (scene) => scene.name === "Camera before hydrogen toggle",
  )!.camera;

  state = await setHydrogenControl(
    page,
    request,
    project.id,
    "Show non-polar hydrogens",
    false,
  );
  await expect(page.getByRole("button", { name: "Pick residues" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".viewer-status")).toContainText("1 selected");
  await expect(
    page.getByLabel("Viewer navigation").getByRole("button", { name: "Show all" }),
  ).toBeVisible();
  await saveScene(page, "Polar-only scene");
  state = await readProject(request, project.id);
  expect(state.scenes.find((scene) => scene.name === "Polar-only scene")!.camera).toEqual(
    cameraBefore,
  );
  expect(structureRequests).toHaveLength(1);

  const selection = {
    schema_version: 1,
    atoms: entry.atom_ids.map((atomId) => ({
      structure_id: entry.id,
      atom_id: atomId,
    })),
    granularity: "atom",
    source: "inspector",
  };
  for (const style of [
    "line",
    "stick",
    "thick-stick",
    "ball-and-stick",
    "space-filling",
  ]) {
    const response = await request.post(
      `/api/v1/projects/${project.id}/selection-representations`,
      {
        data: {
          expected_revision: state.revision,
          selection,
          action: "apply",
          style,
        },
      },
    );
    expect(response.status()).toBe(200);
    state = (await response.json()) as ProjectRead;
    await page.reload();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
      timeout: 45_000,
    });
    expect(await canvasSignature(page)).not.toBe(0);
  }

  const reset = await request.post(
    `/api/v1/projects/${project.id}/selection-representations`,
    {
      data: {
        expected_revision: state.revision,
        selection,
        action: "reset",
      },
    },
  );
  expect(reset.status()).toBe(200);
  state = (await reset.json()) as ProjectRead;
  for (const style of [
    "line",
    "stick",
    "thick-stick",
    "ball-and-stick",
    "space-filling",
    "surface",
  ]) {
    const settings = state.entries[0].viewer_settings;
    const response = await request.put(
      `/api/v1/projects/${project.id}/entries/${entry.id}/viewer-settings`,
      {
        data: {
          expected_revision: state.revision,
          settings: {
            ...settings,
            representations: [
              {
                ...settings.representations[0],
                id: "qualification",
                style,
              },
            ],
          },
        },
      },
    );
    expect(response.status()).toBe(200);
    state = (await response.json()) as ProjectRead;
    await page.reload();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
      timeout: 45_000,
    });
    expect(await canvasSignature(page)).not.toBe(0);
  }

  const polarScene = state.scenes.find((scene) => scene.name === "Polar-only scene")!;
  const allSettings = state.entries[0].viewer_settings;
  let response = await request.put(
    `/api/v1/projects/${project.id}/entries/${entry.id}/viewer-settings`,
    {
      data: {
        expected_revision: state.revision,
        settings: {
          ...allSettings,
          components: {
            ...allSettings.components,
            nonpolar_hydrogens: true,
          },
        },
      },
    },
  );
  state = (await response.json()) as ProjectRead;
  response = await request.post(
    `/api/v1/projects/${project.id}/scenes/${polarScene.id}/apply`,
    { data: { expected_revision: state.revision } },
  );
  state = (await response.json()) as ProjectRead;
  expect(state.entries[0].viewer_settings.components.nonpolar_hydrogens).toBe(false);
  response = await request.post(`/api/v1/projects/${project.id}/history/undo`, {
    data: { expected_revision: state.revision },
  });
  state = (await response.json()) as ProjectRead;
  expect(state.entries[0].viewer_settings.components.nonpolar_hydrogens).toBe(true);
  response = await request.post(`/api/v1/projects/${project.id}/history/redo`, {
    data: { expected_revision: state.revision },
  });
  state = (await response.json()) as ProjectRead;
  expect(state.entries[0].viewer_settings.components.nonpolar_hydrogens).toBe(false);
  response = await request.post(`/api/v1/projects/${project.id}/save`, {
    data: { expected_revision: state.revision },
  });
  state = (await response.json()) as ProjectRead;
  expect(state.checkpoint_revision).toBe(state.revision);
  expect(state.has_uncheckpointed_changes).toBe(false);

  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 45_000,
  });
  await openViewerControls(page);
  await expect(
    page.getByRole("checkbox", { name: "Show non-polar hydrogens" }),
  ).not.toBeChecked();

  const archiveResponse = await request.post(`/api/v1/projects/${project.id}/archive`, {
    data: { operation_id: `polar-hydrogen-${Date.now()}` },
  });
  expect(archiveResponse.status()).toBe(201);
  const archive = (await archiveResponse.json()) as {
    artifact: { filename: string; download_url: string };
  };
  const archiveBytes = await (await request.get(archive.artifact.download_url)).body();
  const importResponse = await request.post("/api/v1/projects/import-archive", {
    multipart: {
      operation_id: `polar-hydrogen-import-${Date.now()}`,
      file: {
        name: archive.artifact.filename,
        mimeType: "application/vnd.molweave.project+zip",
        buffer: archiveBytes,
      },
    },
  });
  expect(importResponse.status()).toBe(201);
  const restored = ((await importResponse.json()) as { project: ProjectRead }).project;
  expect(restored.entries[0].viewer_settings.components.nonpolar_hydrogens).toBe(false);

  const finalStructure = await readStructure(request, project.id, entry.id);
  expect(molecularSnapshot(state.entries[0], finalStructure)).toEqual(before);
  expect(
    await (
      await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)
    ).body(),
  ).toEqual(original);
});

test("keeps polar-only controls accessible and bounded on desktop and Pixel 7", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const project = await createAndOpen(
    page,
    request,
    testInfo,
    "Polar hydrogen accessibility",
  );
  await importFixture(
    page,
    resolve(HYDROGEN_FIXTURES, "polar_hydrogens_ligand.mol"),
  );
  await openViewerControls(page);
  const nonpolar = page.getByRole("checkbox", {
    name: "Show non-polar hydrogens",
  });
  await nonpolar.focus();
  await page.keyboard.press("Space");
  await expect.poll(async () => {
    const state = await readProject(request, project.id);
    return state.entries[0].viewer_settings.components.nonpolar_hydrogens;
  }).toBe(false);
  await expect(nonpolar).toHaveAccessibleDescription(
    "Turn off to keep polar hydrogens only. Requires Show hydrogens.",
  );
  const panel = page.locator(".viewer-controls-panel");
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include(".viewer-controls").analyze()).violations,
  ).toEqual([]);
});

test("a hydrogen-free structure remains hydrogen-free in polar-only mode", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Hydrogen-free molecular invariance runs once.",
  );
  const project = await createAndOpen(
    page,
    request,
    testInfo,
    "Hydrogen-free polar mode",
  );
  await importFixture(page, resolve(FORMAT_FIXTURES, "ethanol.mol"));
  const before = await readProject(request, project.id);
  const entry = before.entries[0];
  const structureBefore = await readStructure(request, project.id, entry.id);
  expect(structureBefore.structure.atoms.some((atom) => atom.element === "H")).toBe(false);
  await setHydrogenControl(
    page,
    request,
    project.id,
    "Show non-polar hydrogens",
    false,
  );
  const after = await readProject(request, project.id);
  const structureAfter = await readStructure(request, project.id, entry.id);
  expect(molecularSnapshot(after.entries[0], structureAfter)).toEqual(
    molecularSnapshot(entry, structureBefore),
  );
  expect(await canvasSignature(page)).not.toBe(0);
});

for (const fixture of ["polar_hydrogens_ligand.mol", "polar_hydrogens_protein.pdb"]) {
  test(`selection-local hydrogen precedence and full-graph classification: ${fixture}`, async ({ page, request }, info) => {
    test.skip(info.project.name !== "chromium", "Exact atom queries use the desktop inspector.");
    test.setTimeout(120_000);
    const project = await createAndOpen(page, request, info, "Local hydrogens");
    await importFixture(page, resolve(HYDROGEN_FIXTURES, fixture));
    const state = await readProject(request, project.id);
    const entry = state.entries[0];
    const before = await readStructure(request, project.id, entry.id);
    await openViewerControls(page);
    await page.getByLabel(`Representation style for ${entry.name}`).selectOption("space-filling");
    await page.getByRole("button", { name: "Close viewer controls" }).click();
    await page.getByRole("tab", { name: "selection" }).click();
    const clear = page.getByRole("button", { name: "Clear", exact: true });
    if (await clear.isEnabled()) await clear.click();
    await page.getByRole("button", { name: "Fit all visible" }).click();
    await page.waitForTimeout(500);
    const hydrogenPixels = () => page.locator(".molstar-host canvas").first().evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) throw new Error("WebGL required");
      gl.finish();
      const width = Math.floor(canvas.width * 0.6), height = Math.floor(canvas.height * 0.6);
      const data = new Uint8Array(width * height * 4);
      gl.readPixels(Math.floor(canvas.width * 0.2), Math.floor(canvas.height * 0.2), width, height,
        gl.RGBA, gl.UNSIGNED_BYTE, data);
      const counts = [0, 0];
      for (let pixel = 0; pixel < width * height; pixel++) {
        const channels = [data[pixel * 4], data[pixel * 4 + 1], data[pixel * 4 + 2]];
        const lo = Math.min(...channels), hi = Math.max(...channels);
        // Neutral shaded H spheres; excludes colored C/O, cream background and the corner axes.
        if (lo > 80 && hi < 230 && hi - lo < 5) counts[pixel % width < width / 2 ? 0 : 1]++;
      }
      return counts;
    });
    const same = async (expected: number[]) => {
      // Test sphere presence, not lighting/antialias equality after geometry rebuilds.
      await expect.poll(async () => (await hydrogenPixels()).every((count, i) =>
        expected[i] > 100 ? count > 100 : count < 5)).toBe(true);
    };
    const all = await hydrogenPixels();
    expect(all[0]).toBeGreaterThan(100);
    expect(all[1]).toBeGreaterThan(100);
    await page.getByLabel("Select by").selectOption("atom_reference");
    const selectAtom = async (id: number) => {
      await page.getByLabel("Value").fill(`${entry.id}:${id}`);
      await page.getByRole("button", { name: "Apply query" }).click();
      await expect(page.locator(".viewer-status")).toContainText("1 selected");
      await page.getByRole("button", { name: "Style selection", exact: true }).click();
    };
    const local = page.getByRole("dialog", { name: "Style selection" }).getByLabel("Selected non-polar hydrogens");
    const finish = async () => {
      await expect(page.getByRole("status").filter({ hasText: "Selection hydrogen visibility stored" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Clear", exact: true }).click();
    };
    await selectAtom(1);
    await expect(local).toBeDisabled();
    await page.keyboard.press("Escape");
    await selectAtom(4); // O-H remains polar even though its O is outside the selection.
    await local.selectOption("hide");
    await finish();
    await same(all);
    await selectAtom(2); // Only this explicit C-H is hidden.
    await local.selectOption("hide");
    await finish();
    await expect.poll(async () => (await hydrogenPixels())[0]).toBeLessThan(5);
    const hidden = await hydrogenPixels();
    expect(hidden[1]).toBeGreaterThan(100);
    await selectAtom(2);
    await local.selectOption("show");
    await finish();
    await same(all);
    await setHydrogenControl(page, request, project.id, "Show non-polar hydrogens", false);
    await page.getByRole("button", { name: "Close viewer controls" }).click();
    await same(all); // Local Show overrides the entry preference.
    await selectAtom(2);
    await local.selectOption("inherit");
    await finish();
    await same(hidden);
    await selectAtom(2);
    await local.selectOption("show");
    await finish();
    await setHydrogenControl(page, request, project.id, "Show hydrogens", false);
    await page.getByRole("button", { name: "Close viewer controls" }).click();
    await expect.poll(hydrogenPixels).toEqual([0, 0]);
    await selectAtom(2);
    await expect(page.getByRole("dialog", { name: "Style selection" })
      .getByText("Show hydrogens is off; local preferences are retained.", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await setHydrogenControl(page, request, project.id, "Show hydrogens", true);
    await page.getByRole("button", { name: "Close viewer controls" }).click();
    await same(all);
    expect(await readStructure(request, project.id, entry.id)).toEqual(before);
  });
}
