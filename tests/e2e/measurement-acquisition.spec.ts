import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepareInformationProject } from "./support/viewer-information";

async function atomPixel(page: Page, source: StructureProjection, id: number) {
  return page.evaluate(async ({ coordinates, reference }) => {
    const { atomPickPixel, settleSelectionScene } = await import("/src/test/selectionGestureHarness.ts");
    const engine = window.interactionEngines.at(-1)!;
    await settleSelectionScene(engine, reference);
    return atomPickPixel(engine, window.editingPicks.point(coordinates), reference);
  }, { coordinates: source.structure.atoms.find(atom => atom.id === id)!.coordinates,
    reference: { structure_id: source.entry_id, atom_id: id } });
}

async function selectionState(page: Page) {
  return page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    const state = useSelectionStore.getState();
    return { selection: state.selection, inspectionOrder: state.inspectionOrder, rangeAnchor: state.rangeAnchor,
      projectId: state.projectId, projectEpoch: state.projectEpoch, pickingGranularity: state.pickingGranularity };
  });
}

async function pickingMode(page: Page, mode: "atom" | "residue" | "chain") {
  const compact = page.getByRole("combobox", { name: "Viewer picking mode", exact: true });
  if (await compact.isVisible()) await compact.selectOption(mode);
  else await page.getByRole("button", { name: `Pick ${mode === "atom" ? "atoms" : mode === "residue" ? "residues" : "chains"}`, exact: true }).click();
}

async function installedTargets(page: Page) {
  return page.evaluate(async () => {
    const engine = window.interactionEngines.at(-1)! as unknown as {
      syncQueue: Promise<void>;
      measurementTargetRefs: Map<string, { props: { customText?: string }; state: { visible: boolean; pickable: boolean } }>;
      measurementTargets: { index: number; reference: { structure_id: string; atom_id: number } }[];
    };
    await engine.syncQueue;
    return { desired: engine.measurementTargets.map(target => ({ index: target.index, reference: target.reference })),
      installed: [...engine.measurementTargetRefs.values()].map(representation => ({ text: representation.props.customText,
        visible: representation.state.visible, pickable: representation.state.pickable })) };
  });
}

for (const theme of ["light", "dark"] as const) test(`deliberate native targets preserve selection, order and residue anchor (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const project = await prepareInformationProject(page, request, `Deliberate acquisition ${theme}`,
    [resolve("tests/fixtures/formats/measurement-anchor.pdb")]);
  const themeButton = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await themeButton.count()) await themeButton.click();
  const xyz = project.entries[0], protein = project.entries[1];
  const source: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${xyz.id}/structure`)).json();
  const proteinSource: StructureProjection = await (await request.get(`/api/v1/projects/${project.id}/entries/${protein.id}/structure`)).json();
  const originals = await Promise.all(project.entries.map(async entry => (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body()));
  const initial: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const canvas = page.locator(".molstar-host canvas").first(), touch = info.project.name !== "chromium";
  const activate = async (projection: StructureProjection, id: number) => {
    const position = await atomPixel(page, projection, id);
    if (touch) await canvas.tap({ position }); else await canvas.click({ position });
  };
  await pickingMode(page, "atom");
  // Seed an ordered canonical selection with one consistent pointer stream.
  // Acquisition below uses real taps on the touch profile.
  await canvas.click({ position: await atomPixel(page, source, 4) });
  await canvas.click({ position: await atomPixel(page, source, 2), modifiers: ["Shift"] });
  await expect.poll(() => selectionState(page)).toMatchObject({ inspectionOrder: [4, 2].map(atom_id => ({ structure_id: xyz.id, atom_id })) });
  await pickingMode(page, "chain");
  const orderedBefore = await selectionState(page);
  const tool = page.getByRole("dialog", { name: "Measurements", exact: true });
  await page.getByRole("button", { name: "Measurements", exact: true }).click();
  await tool.getByRole("button", { name: "Torsion", exact: true }).click();
  await tool.getByLabel("Measurement name", { exact: true }).fill("Ordered torsion");
  await tool.getByRole("button", { name: "Pick in viewer", exact: true }).click();
  await expect(tool.getByRole("button", { name: "Review targets", exact: true })).toBeVisible();
  const order = [4, 2, 3, 1];
  for (const [index, id] of order.entries()) {
    await activate(source, id);
    await expect.poll(async () => (await installedTargets(page)).installed.length).toBe(index + 1);
    expect(await selectionState(page)).toEqual(orderedBefore);
    if (index < 3) await expect(page.getByTestId("viewer-selection-geometry")).toContainText(`Torsion: choose target ${index + 2}`);
  }
  await expect(page.getByTestId("viewer-selection-geometry")).toHaveText("Torsion 45.0°");
  const markers = await installedTargets(page);
  expect(markers.desired).toEqual(order.map((atom_id, index) => ({ index: index + 1, reference: { structure_id: xyz.id, atom_id } })));
  expect(markers.installed.map(marker => marker.text)).toEqual(["1", "2", "3", "4"]);
  expect(markers.installed.every(marker => marker.visible && !marker.pickable)).toBe(true);
  // Two primary activations and native dblclick expansion stay within the lease.
  if (touch) { await activate(source, 1); await activate(source, 1); }
  else await canvas.dblclick({ position: await atomPixel(page, source, 1) });
  expect(await selectionState(page)).toEqual(orderedBefore);
  expect((await installedTargets(page)).desired).toEqual(markers.desired);
  if (touch) await canvas.tap({ position: { x: 5, y: 5 } }); else await canvas.click({ position: { x: 5, y: 5 } });
  expect(await selectionState(page)).toEqual(orderedBefore);
  expect((await installedTargets(page)).desired).toEqual(markers.desired);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(initial);
  await tool.getByRole("button", { name: "Review targets", exact: true }).click();
  await expect(tool.getByLabel("Measurement name", { exact: true })).toHaveValue("Ordered torsion");
  await tool.getByRole("button", { name: "Save measurement", exact: true }).click();
  await expect(tool.getByLabel("Measurement name", { exact: true })).toHaveValue("");
  const first: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(first.measurements.find(item => item.name === "Ordered torsion")?.atom_references).toEqual(order.map(atom_id => ({ structure_id: xyz.id, atom_id })));
  expect(first.revision).toBe(initial.revision + 1);
  await tool.getByRole("button", { name: "Close measurements", exact: true }).click();

  await pickingMode(page, "residue");
  await activate(proteinSource, proteinSource.structure.atoms[0].id);
  await expect.poll(async () => (await selectionState(page)).rangeAnchor).not.toBeNull();
  const anchoredBefore = await selectionState(page);
  await page.getByRole("button", { name: "Measurements", exact: true }).click();
  await tool.getByLabel("Measurement name", { exact: true }).fill("Anchored distance");
  await tool.getByRole("button", { name: "Pick in viewer", exact: true }).click();
  for (const [index, id] of [3, 1].entries()) {
    await activate(source, id);
    await expect.poll(async () => (await installedTargets(page)).installed.length).toBe(index + 1);
    expect(await selectionState(page)).toEqual(anchoredBefore);
  }
  await expect(page.getByTestId("viewer-selection-geometry")).toHaveText("Distance 4.24 Å");
  await tool.getByRole("button", { name: "Review targets", exact: true }).click();
  await tool.getByRole("button", { name: "Save measurement", exact: true }).click();
  await expect(tool.getByLabel("Measurement name", { exact: true })).toHaveValue("");
  expect(await selectionState(page)).toEqual(anchoredBefore);
  const final: Project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  expect(final.measurements.find(item => item.name === "Anchored distance")?.atom_references).toEqual([3, 1].map(atom_id => ({ structure_id: xyz.id, atom_id })));
  expect(final.revision).toBe(initial.revision + 2);
  for (const [index, entry] of final.entries.entries()) expect(await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/original`)).body()).toEqual(originals[index]);
  await info.attach("native-target-installation", { body: JSON.stringify(markers), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`deliberate-${theme}.png`) });
});
