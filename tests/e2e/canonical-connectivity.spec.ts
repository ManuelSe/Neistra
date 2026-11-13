import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Job, Project, StructureProjection } from "../../apps/web/src/api/types";
import { bonds, newEmptyProject, selectPair } from "./support/modeling";
import { coordinateEntries } from "./support/minimization";

for (const supplied of [false, true]) test(`keeps ${supplied ? "sparse supplied" : "empty"} protein connectivity exact with import inference off`, async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await newEmptyProject(page, request);
  const original = await readFile("tests/fixtures/formats/protein_editing.pdb", "utf8");
  const text = original.split("\n").filter(line => line.startsWith("ATOM  ") && Number(line.slice(6, 11)) <= 5)
    .concat(supplied ? ["CONECT    1    2", "END"] : ["END"]).join("\n") + "\n";
  await page.getByRole("button", { name: "Import structures", exact: true }).first().click();
  const imports = page.getByRole("dialog", { name: "Import structures", exact: true });
  await imports.locator('input[type="file"]').setInputFiles({ name: "current-protein.pdb", mimeType: "chemical/x-pdb", buffer: Buffer.from(text) });
  await imports.getByRole("checkbox", { name: "Infer missing connectivity" }).uncheck();
  await imports.getByRole("button", { name: "Import", exact: true }).click();
  await expect(imports).toBeHidden({ timeout: 30000 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.length ?? 0)).toBeGreaterThan(0);
  const project = await (await request.get(`/api/v1/projects/${initial.id}`)).json() as Project;
  const entry = project.entries[0];
  const path = `/api/v1/projects/${project.id}/entries/${entry.id}/structure`;
  const before = (await (await request.get(path)).json() as StructureProjection).structure;
  expect(before.bonds).toHaveLength(supplied ? 1 : 0);
  const expected = before.bonds.map(bond => [bond.atom_1_id, bond.atom_2_id].sort((a, b) => a - b));
  await expect.poll(() => bonds(page, entry.id)).toEqual(expected);
  await expect(page.locator(".viewer-error")).toBeHidden();

  await selectPair(page, entry.id, before.atoms.map(atom => atom.id), info.project.name === "mobile-chromium");
  await page.getByRole("button", { name: "Transform selection", exact: true }).click();
  const movement = page.getByRole("region", { name: "Move selection controls", exact: true });
  await movement.getByRole("button", { name: "More movement tools", exact: true }).click();
  const tools = page.getByRole("dialog", { name: "More movement tools", exact: true });
  await tools.getByRole("button", { name: "Translate", exact: true }).click();
  await tools.getByRole("button", { name: "Step right", exact: true }).click();
  await expect.poll(() => coordinateEntries(page)).toHaveLength(1);
  expect(await bonds(page, entry.id)).toEqual(expected);
  await movement.getByRole("button", { name: "Cancel movement", exact: true }).click();
  await expect.poll(() => coordinateEntries(page)).toHaveLength(0);
  expect(await bonds(page, entry.id)).toEqual(expected);
  expect((await (await request.get(path)).json() as StructureProjection).structure).toEqual(before);

  await page.locator(".molstar-host canvas").first().focus();
  const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/quick-minimizations"));
  await page.keyboard.press("Control+m");
  const response = await submitted;
  expect(response.status()).toBe(201);
  const job = await response.json() as Job;
  await expect.poll(async () => (await (await request.get(`/api/v1/jobs/${job.id}`)).json() as Job).status,
    { timeout: 60000 }).toBe("completed");
  // Cleanup may legitimately refuse a disconnected draft; neither outcome can add edges.
  const after = (await (await request.get(path)).json() as StructureProjection).structure;
  expect(after.bonds).toEqual(before.bonds);
  await expect.poll(() => bonds(page, entry.id)).toEqual(expected);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => window.interactionEngines?.length ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => bonds(page, entry.id)).toEqual(expected);
  expect((await (await request.get(path)).json() as StructureProjection).structure.bonds).toEqual(before.bonds);
});
