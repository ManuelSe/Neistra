import { openInspectorTools } from "./support/navigation";
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
  await openInspectorTools(page);
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
  page, request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Full inspector workflow is desktop-only.");
  test.setTimeout(120_000);
  const { project, entryId, atoms } = await setup(page, request, testInfo);
  const tool = page.getByRole("dialog", { name: "Measurements", exact: true });
  const saved = () => tool.getByRole("list", { name: "Saved measurements", exact: true });
  const row = (name: string) => saved().locator(".measurement-saved-row").filter({ has: page.getByRole("button", { name: `Inspect measurement ${name}`, exact: true }) });
  const open = async () => {
    await page.getByRole("button", { name: "Measurements", exact: true }).click();
    await expect(tool).toBeVisible();
  };
  const close = async () => { await tool.getByRole("button", { name: "Close measurements", exact: true }).click(); await expect(tool).toBeHidden(); };
  const showSaved = async () => { await tool.getByRole("button", { name: /^Saved measurements/ }).click(); await expect(saved()).toBeVisible(); };
  const create = async (name: string, kind: "distance" | "angle" | "dihedral", count: number) => {
    if (await tool.isVisible()) await close();
    const ids = atoms.slice(0, count).map(atom => atom.id);
    await selectAtoms(page, entryId, ids);
    // The inspector is a bridge to the same App-owned tool, with no second creator.
    await openInspectorTools(page);
    await page.getByRole("tab", { name: "measurements" }).click();
    await page.getByRole("button", { name: "Open measurements", exact: true }).click();
    await expect(tool).toBeVisible();
    await tool.getByRole("button", { name: kind === "dihedral" ? "Torsion" : kind === "angle" ? "Angle" : "Distance", exact: true }).click();
    await tool.getByRole("button", { name: "Use selection", exact: true }).click();
    if (count > 2) {
      const order = tool.getByRole("region", { name: "Confirm measurement order" });
      await expect(order).toBeVisible();
      for (let i = 0; i < count; i++) await order.getByLabel(new RegExp(`^Ordered target ${i + 1}`)).selectOption(JSON.stringify([entryId, ids[i]]));
      await order.getByRole("button", { name: "Use target order", exact: true }).click();
    }
    await tool.getByLabel("Measurement name", { exact: true }).fill(name);
    await tool.getByRole("button", { name: "Save measurement", exact: true }).click();
    await expect(tool.getByLabel("Measurement name", { exact: true })).toHaveValue("");
    const state = (await (await request.get(`/api/v1/projects/${project.id}`)).json()) as ProjectRead;
    expect(state.measurements.find(item => item.name === name)?.atom_references).toEqual(ids.map(atom_id => ({ structure_id: entryId, atom_id })));
    await showSaved();
  };
  await create("Carbon distance", "distance", 2);
  const distance = Math.hypot(...atoms[1].coordinates.map((value, i) => value - atoms[0].coordinates[i]));
  await expect(row("Carbon distance")).toContainText(`${distance.toFixed(2)} Å`);
  await create("Bond angle", "angle", 3);
  await expect(row("Bond angle")).toContainText(/°/);
  await create("Torsion", "dihedral", 4);
  await expect(row("Torsion")).toContainText(/°/);
  await expect(page.locator(".property-table tbody tr")).toHaveCount(4);

  await row("Carbon distance").getByRole("button", { name: "Inspect measurement Carbon distance", exact: true }).click();
  await row("Carbon distance").getByLabel("Name for Carbon distance", { exact: true }).fill("C-C reference");
  await row("Carbon distance").getByRole("button", { name: "Save name", exact: true }).click();
  await expect(row("C-C reference")).toBeVisible();
  await row("C-C reference").getByRole("button", { name: "Hide C-C reference", exact: true }).click();
  let state = (await (await request.get(`/api/v1/projects/${project.id}`)).json()) as ProjectRead;
  expect(state.measurements.find(item => item.name === "C-C reference")?.visible).toBe(false);
  await row("C-C reference").getByRole("button", { name: "Show C-C reference", exact: true }).click();

  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 20_000 });
  await open(); await showSaved();
  await expect(row("C-C reference")).toContainText(`${distance.toFixed(2)} Å`);
  await close();
  await selectAtoms(page, entryId, [atoms[0].id]);
  await openInspectorTools(page);
  await page.getByRole("tab", { name: "inspect" }).click();
  await expect(page.locator(".inspect-panel")).toContainText("Full name");
  await expect(page.locator(".inspect-panel")).toContainText(atoms[0].element);
  await expect(page.locator(".inspect-panel")).toContainText("Coordinates");
  await open();
  // Kinds are deliberate choices; an insufficient selection cannot be adopted/saved.
  await expect(tool.getByRole("button", { name: "Use selection", exact: true })).toBeDisabled();
  await expect(tool.getByRole("button", { name: "Save measurement", exact: true })).toBeDisabled();
  await tool.getByRole("button", { name: "Close contacts", exact: true }).click();
  const contacts = tool.getByRole("region", { name: "Close contacts", exact: true });
  const contactEntry = project.entries.find(entry => entry.id !== entryId)!;
  await contacts.getByRole("combobox", { name: "Structure", exact: true }).selectOption(contactEntry.id);
  await contacts.getByLabel("Cutoff (Å)").fill("0");
  await contacts.getByRole("button", { name: "Find contacts", exact: true }).click();
  await expect(contacts.locator(".inline-error")).toBeVisible();
  await contacts.getByLabel("Cutoff (Å)").fill("3");
  await contacts.getByRole("button", { name: "Find contacts", exact: true }).click();
  await expect(contacts.locator(".contact-results button").first()).toBeVisible();
  await contacts.locator(".contact-results button").first().click();
  await expect(page.locator(".viewer-status")).toContainText("/ 2 selected");
  state = (await (await request.get(`/api/v1/projects/${project.id}`)).json()) as ProjectRead;
  expect(state.measurements.map(item => item.kind).sort()).toEqual(["angle", "dihedral", "distance"]);
  await showSaved();
  await row("Torsion").getByRole("button", { name: "Inspect measurement Torsion", exact: true }).click();
  await row("Torsion").getByRole("button", { name: "Delete measurement Torsion", exact: true }).click();
  await expect(row("Torsion")).toBeHidden();
});
