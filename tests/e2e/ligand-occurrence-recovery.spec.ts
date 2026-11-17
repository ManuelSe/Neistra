import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { LigandCandidatesRead } from "../../apps/web/src/ligands/types";
import { prepare } from "./support/interactions";

for (const theme of ["light", "dark"] as const) test(`retries unavailable occurrence counts without changing exact choice (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  const project = await prepare(page, request, [{ name: "two-copies.smi", mimeType: "chemical/x-daylight-smiles",
    buffer: Buffer.from("CCO.CCO repeated instances\n") }], `Occurrence recovery ${theme}`);
  const entry = project.entries[0], base = `/api/v1/projects/${project.id}`;
  const original = await (await request.get(`${base}/entries/${entry.id}/original`)).body();
  const before = await page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    const state = useSelectionStore.getState();
    return { selection: state.selection, order: state.inspectionOrder, anchor: state.rangeAnchor };
  });
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  let unavailable = true, metadataCalls = 0;
  await page.route(url => url.pathname === `${base}/entries/${entry.id}/ligand-candidates`, async route => {
    metadataCalls++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const data: LigandCandidatesRead = await response.json();
    if (unavailable) data.candidates = data.candidates.map(candidate => ({ ...candidate,
      occurrence_count: null, occurrence_basis: null, occurrence_reason: "occurrence_work_busy" }));
    await route.fulfill({ response, json: data });
  });
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  const controls = page.getByRole("region", { name: "Ligand of interest", exact: true });
  await controls.getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
  const launcher = controls.getByRole("button", { name: "Choose", exact: true });
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
  const radios = dialog.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(dialog.getByText("Occurrence count unavailable", { exact: true })).toHaveCount(2);
  await radios.nth(1).check();
  await expect(dialog.getByRole("button", { name: "Use ligand", exact: true })).toBeEnabled();
  const retry = dialog.getByRole("button", { name: "Retry counts", exact: true });
  await expect(retry).toHaveCount(1);
  await page.evaluate(async () => {
    const animations = document.getAnimations().filter(animation =>
      animation.effect?.getTiming().iterations !== Infinity);
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
  });
  const size = await retry.boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(44);
  expect(size!.width).toBeGreaterThanOrEqual(44);
  const busyFooter = await dialog.locator(".ligand-candidate-footer").boundingBox();
  const availableHeight = await page.evaluate(() => visualViewport?.height ?? innerHeight);
  expect(busyFooter!.y).toBeGreaterThanOrEqual(0);
  expect(busyFooter!.y + busyFooter!.height).toBeLessThanOrEqual(availableHeight);
  const previousCalls = metadataCalls;
  unavailable = false;
  if (info.project.name === "mobile-chromium") await retry.tap();
  else { await retry.focus(); await page.keyboard.press("Enter"); }
  await expect(dialog.getByText("2 matching representations in this entry", { exact: true })).toHaveCount(2);
  await expect(retry).toBeHidden();
  await expect(radios.nth(1)).toBeChecked();
  await expect(radios.nth(1)).toBeFocused();
  expect(metadataCalls).toBe(previousCalls + 1);
  const bounds = await dialog.evaluate(element => {
    const panel = element.getBoundingClientRect();
    const footer = element.querySelector(".ligand-candidate-footer")!.getBoundingClientRect();
    return { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom,
      footerBottom: footer.bottom, width: innerWidth, height: innerHeight };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
  expect(bounds.footerBottom).toBeLessThanOrEqual(bounds.height);
  expect((await new AxeBuilder({ page }).include(".ligand-candidate-dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden(); await expect(launcher).toBeFocused();
  expect(await (await request.get(base)).json()).toEqual(project);
  expect(await (await request.get(`${base}/entries/${entry.id}/original`)).body()).toEqual(original);
  expect(await page.evaluate(async () => {
    const { useSelectionStore } = await import("/src/store/selection.ts");
    const state = useSelectionStore.getState();
    return { selection: state.selection, order: state.inspectionOrder, anchor: state.rangeAnchor };
  })).toEqual(before);
  await info.attach("count-recovery", { body: JSON.stringify({ theme, metadataCalls, bounds }), contentType: "application/json" });
});
