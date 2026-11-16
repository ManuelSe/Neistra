import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { informationBounds, orderInformationTargets, prepareInformationProject, setInformationSelection } from "./support/viewer-information";

async function atomPixel(page: Page, projection: StructureProjection, entryId: string, id: number) {
  return page.evaluate(async ({ coordinates, reference }) => {
    const { atomPickPixel, settleSelectionScene } = await import("/src/test/selectionGestureHarness.ts");
    const engine = window.interactionEngines.at(-1)!;
    await settleSelectionScene(engine, reference);
    return atomPickPixel(engine, window.editingPicks.point(coordinates), reference);
  }, { coordinates: projection.structure.atoms.find(atom => atom.id === id)!.coordinates,
    reference: { structure_id: entryId, atom_id: id } });
}

for (const theme of ["light", "dark"] as const) test(`ordered quick geometry and accessible atom inspection (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const project = await prepareInformationProject(page, request, `Information ${theme}`), entry = project.entries[0];
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  const mobile = info.project.name !== "chromium";
  const initial: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const original = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body();
  await setInformationSelection(page, entry.id, [1, 2], mobile);
  const readout = page.getByTestId("viewer-selection-geometry");
  await expect(readout).toHaveText("Distance 3.00 Å");
  await setInformationSelection(page, entry.id, [1, 2, 3], mobile);
  await expect(readout).toHaveText("Order targets");
  await orderInformationTargets(page, entry.id, [1, 2, 3]);
  await expect(readout).toHaveText("Angle 90.0°");
  await setInformationSelection(page, entry.id, [1, 2, 3, 4], mobile);
  await expect(readout).toHaveText("Order targets");
  await orderInformationTargets(page, entry.id, [1, 2, 3, 4]);
  await expect(readout).toHaveText("Torsion -45.0°");
  await page.getByRole("button", { name: "Atom details", exact: true }).focus(); await page.keyboard.press("Enter");
  const details = page.getByRole("dialog", { name: "Atom details", exact: true });
  const chooser = details.getByRole("combobox", { name: "Selected atom", exact: true });
  await chooser.selectOption(JSON.stringify([entry.id, 3]));
  await expect(details).toContainText("O");
  await expect(details).toContainText("0.000, 3.000, 0.000");
  await informationBounds(page);
  expect((await new AxeBuilder({ page }).include(".viewer-info-dialog").include(".viewer-information-strip").analyze()).violations).toEqual([]);
  await details.getByRole("button", { name: "Close viewer information", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden(); await expect(page.getByRole("button", { name: "Atom details", exact: true })).toBeFocused();
  await expect(readout).toHaveText("Torsion -45.0°");
  // All operations above are inspection-only; no named measurement or command exists.
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(initial);
  expect(await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body()).toEqual(original);
  await info.attach("information-layout", { body: JSON.stringify(await informationBounds(page)), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`information-${theme}.png`) });
  expect(projection.structure.atoms).toHaveLength(4);
});

test("native atom picks preserve their explicit sequence without saving a measurement", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const project = await prepareInformationProject(page, request, "Native ordered geometry"), entry = project.entries[0];
  const projection: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json();
  const canvas = page.locator(".molstar-host canvas").first();
  // Trusted primary picks with modifiers, never a direct store mutation.
  for (const [index, id] of [4, 2, 3, 1].entries()) {
    const pixel = await atomPixel(page, projection, entry.id, id);
    await canvas.click({ position: pixel, modifiers: index ? ["Shift"] : [] });
    await expect(page.locator(".viewer-status")).toContainText(`/ ${index + 1} selected`);
  }
  await expect(page.getByTestId("viewer-selection-geometry")).toContainText("Torsion");
  await page.getByRole("button", { name: "Inspect measurement targets", exact: true }).click();
  const items = page.getByRole("list", { name: "Current measurement target order", exact: true }).getByRole("listitem");
  await expect(items).toHaveCount(4);
  for (const [index, id] of [4, 2, 3, 1].entries()) await expect(items.nth(index)).toContainText(projection.structure.atoms.find(atom => atom.id === id)!.name);
  const current: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(current.measurements).toEqual([]); expect(current.revision).toBe(project.revision);
  await page.screenshot({ path: info.outputPath("native-ordered-targets.png") });
});
