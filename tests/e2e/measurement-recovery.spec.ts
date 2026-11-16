import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import { prepareInformationProject } from "./support/viewer-information";

for (const theme of ["light", "dark"] as const) test(`measurement chooser, failed Save and held close preserve recovery (${theme})`, async ({ page, request }) => {
  test.setTimeout(120_000);
  let project = await prepareInformationProject(page, request, `Measurement recovery ${theme}`,
    [resolve("tests/fixtures/formats/measurement-anchor.pdb")]);
  const [hidden, locked] = project.entries;
  const path = `/api/v1/projects/${project.id}`;
  for (const [entry, action, value] of [[hidden, "visibility", false], [locked, "lock", true]] as const) {
    const response = await request.post(`${path}/entries/${entry.id}/${action}`, { data: { expected_revision: project.revision, value } });
    expect(response.status()).toBe(200); project = await response.json();
  }
  const originals = await Promise.all(project.entries.map(async entry => (await request.get(`${path}/entries/${entry.id}/original`)).body()));
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  const themeButton = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await themeButton.count()) await themeButton.click();
  await page.getByRole("button", { name: "Measurements", exact: true }).click();
  const tool = page.getByRole("dialog", { name: "Measurements", exact: true });
  const order = [{ structure_id: locked.id, atom_id: 4 }, { structure_id: hidden.id, atom_id: 1 }];
  for (const [index, reference] of order.entries()) {
    await tool.getByRole("button", { name: `Choose atom for target ${index + 1}`, exact: true }).click();
    const chooser = tool.getByRole("region", { name: "Choose measurement atom", exact: true });
    const entry = project.entries.find(item => item.id === reference.structure_id)!;
    const structures = chooser.getByRole("list", { name: "Available measurement structures", exact: true });
    await structures.getByRole("button").filter({ hasText: entry.name }).click();
    await chooser.getByRole("list", { name: "Available measurement atoms", exact: true })
      .getByRole("button", { name: new RegExp(` · atom ${reference.atom_id}$`) }).click();
    await expect(chooser).toBeHidden();
  }
  await tool.getByLabel("Measurement name", { exact: true }).fill("Cross-entry retained distance");
  const save = tool.getByRole("button", { name: "Save measurement", exact: true });
  await expect(save).toBeEnabled();
  // The failure must retain the actual ordered draft and permit explicit retry.
  await page.route(`**${path}/measurements`, route => route.fulfill({ status: 409,
    json: { detail: { code: "revision_conflict", message: "Review the current project and retry Save." } } }));
  await save.click();
  await expect(tool.getByRole("status")).toContainText("Review the current project and retry Save.");
  await expect(tool.getByLabel("Measurement name", { exact: true })).toHaveValue("Cross-entry retained distance");
  expect((await (await request.get(path)).json() as Project).measurements).toEqual([]);
  await page.unroute(`**${path}/measurements`);

  let committed = false, release!: () => void;
  const held = new Promise<void>(resolveHeld => { release = resolveHeld; });
  await page.route(`**${path}/measurements`, async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    committed = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await save.click();
    await expect.poll(() => committed).toBe(true);
    const stored: Project = await (await request.get(path)).json();
    expect(stored.measurements).toHaveLength(1);
    expect(stored.measurements[0].atom_references).toEqual(order);
    await tool.getByRole("button", { name: "Close measurements", exact: true }).click();
    await page.getByRole("button", { name: "Measurements", exact: true }).click();
    await expect(tool.getByLabel("Measurement name", { exact: true })).toHaveValue("");
    release();
    await expect(tool.getByRole("button", { name: "Distance", exact: true })).toBeEnabled();
    await expect(tool.getByRole("status")).not.toContainText("Saved Cross-entry retained distance.");
    await tool.getByRole("button", { name: "Saved measurements 1", exact: true }).click();
    await expect(tool.getByRole("button", { name: "Inspect measurement Cross-entry retained distance", exact: true })).toBeVisible();
  } finally { release(); }
  await page.unroute(`**${path}/measurements`);
  await tool.getByRole("button", { name: "Close measurements", exact: true }).click();
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await (await request.get(path)).json() as Project).measurements.length).toBe(0);
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await expect.poll(async () => (await (await request.get(path)).json() as Project).measurements[0]?.atom_references).toEqual(order);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await page.getByRole("button", { name: "Measurements", exact: true }).click();
  await tool.getByRole("button", { name: "Saved measurements 1", exact: true }).click();
  await expect(tool.getByRole("button", { name: "Inspect measurement Cross-entry retained distance", exact: true })).toBeVisible();
  for (const [index, entry] of project.entries.entries()) expect(await (await request.get(`${path}/entries/${entry.id}/original`)).body()).toEqual(originals[index]);
});
