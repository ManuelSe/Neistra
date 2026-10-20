import { expect, test, type Page } from "@playwright/test";
import type { AtomReference, Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { observe } from "./support/modeling";

// Synthetic selection-only fixture. Record order, gaps and insertion codes are
// deliberate; no assertion of biological sequence or inferred chemistry.
function fixture(): Buffer {
  const lines: string[] = [];
  let id = 0;
  const atom = (record: string, name: string, residue: string, chain: string, number: number, code: string, x: number, y: number, element: string) => {
    lines.push(`${record.padEnd(6)}${String(++id).padStart(5)} ${name.padStart(4)} ${residue} ${chain}${String(number).padStart(4)}${code || " "}   ${x.toFixed(3).padStart(8)}${y.toFixed(3).padStart(8)}${"0.000".padStart(8)}  1.00 20.00          ${element.padStart(2)}`);
  };
  for (const [index, [number, code]] of ([[10, ""], [10, "A"], [24, ""], [3, ""]] as const).entries()) {
    const x = -15 + index * 10;
    atom("ATOM", "N", "GLY", "A", number, code, x - 1.5, 0, "N");
    atom("ATOM", "CA", "GLY", "A", number, code, x, 0, "C");
    atom("ATOM", "C", "GLY", "A", number, code, x + 1.5, 0, "C");
    atom("ATOM", "H", "GLY", "A", number, code, x - 1.5, 1, "H");
  }
  lines.push("TER");
  atom("ATOM", "N", "ALA", "B", 10, "", -1.5, 12, "N");
  atom("ATOM", "CA", "ALA", "B", 10, "", 0, 12, "C");
  atom("ATOM", "C", "ALA", "B", 10, "", 1.5, 12, "C");
  lines.push("TER");
  for (const [index, x] of [-9, 9].entries()) {
    atom("HETATM", "C1", "LIG", "L", 201 + index, "", x, -10, "C");
    atom("HETATM", "O1", "LIG", "L", 201 + index, "", x + 1.5, -10, "O");
  }
  lines.push("END");
  return Buffer.from(lines.join("\n") + "\n");
}

async function setup(page: Page, request: Parameters<typeof prepare>[1]) {
  let project = await prepare(page, request, [{ name: "selection-sequence.pdb", mimeType: "chemical/x-pdb", buffer: fixture() }], "Selection gestures");
  const entry = project.entries[0];
  const response = await request.put(`/api/v1/projects/${project.id}/entries/${entry.id}/viewer-settings`, {
    data: { expected_revision: project.revision, settings: { ...entry.viewer_settings,
      components: { ...entry.viewer_settings.components, hydrogens: false },
      representations: [{ id: "selection-test", style: "ball-and-stick", color_by: "element", custom_color: "#3b82f6", opacity: 1 }] } },
  });
  expect(response.ok()).toBe(true); project = await response.json() as Project;
  const projection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json() as StructureProjection;
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await observe(page);
  return { project, entry, projection };
}

const selection = (page: Page): Promise<AtomReference[]> => page.evaluate(async () => {
  const path = "/src/store/selection.ts";
  const { useSelectionStore } = await import(/* @vite-ignore */ path);
  return useSelectionStore.getState().selection.atoms;
});
async function point(page: Page, coordinates: [number, number, number]) {
  return page.evaluate(xyz => window.editingPicks.point(xyz), coordinates);
}
const refs = (entryId: string, ids: number[]) => ids.map(atom_id => ({ structure_id: entryId, atom_id }));

for (const theme of ["light", "dark"] as const) test(`expands native protein and individual ligand double-clicks without camera movement (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(90000);
  const { project, entry, projection } = await setup(page, request);
  const themeButton = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await themeButton.count()) await themeButton.click();
  await page.evaluate(() => window.editingPicks.settled());
  const camera = await page.evaluate(() => window.editingPicks.camera());
  const canvas = page.locator(".molstar-host canvas").first();
  for (const atomId of [2, 20, 22]) {
    const atom = projection.structure.atoms.find(a => a.id === atomId)!;
    const position = await point(page, atom.coordinates);
    await canvas.click({ position });
    await expect.poll(() => selection(page)).toEqual(refs(entry.id, [atomId]));
    await canvas.dblclick({ position });
    const expected = projection.structure.atoms.filter(a => a.residue_id === atom.residue_id).map(a => a.id);
    await expect.poll(() => selection(page)).toEqual(refs(entry.id, expected));
    expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(camera);
    await canvas.click({ position, modifiers: ["Control"] });
    await expect.poll(() => selection(page)).toEqual(refs(entry.id, expected.filter(id => id !== atomId)));
    await canvas.click({ position, modifiers: ["Meta"] });
    await expect.poll(() => selection(page)).toEqual(refs(entry.id, expected));
  }
  expect((await (await request.get(`/api/v1/projects/${project.id}`)).json()).revision).toBe(project.revision);
  await page.screenshot({ path: info.outputPath(`selection-gestures-${theme}.png`) });
});

test("expands a standalone SDF ligand through its individual component", async ({ page, request }) => {
  test.setTimeout(60000);
  const project = await prepare(page, request, ["tests/fixtures/editing/ethanol-3d.mol"], "Standalone double-click");
  const entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  await observe(page);
  const oxygen = projection.structure.atoms.find(atom => atom.element === "O")!;
  const position = await point(page, oxygen.coordinates);
  const camera = await page.evaluate(() => window.editingPicks.camera());
  await page.locator(".molstar-host canvas").first().dblclick({ position });
  await expect.poll(() => selection(page)).toEqual(refs(entry.id, projection.structure.atoms.map(atom => atom.id)));
  expect(await page.evaluate(() => window.editingPicks.camera())).toEqual(camera);
});
