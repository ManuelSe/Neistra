import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";

test("expands from styling across hidden entries without durable changes", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Project-wide fixture setup uses desktop panels.");
  const created = await request.post("/api/v1/projects", {
    data: { name: `Selection appearance ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  let project: Project = await created.json();
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const upload = page.getByRole("dialog", { name: "Import structures" });
  await upload.locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/formats/ethanol.mol"));
  await upload.getByRole("button", { name: "Import", exact: true }).click();
  await expect(upload).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 45_000 });
  project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const original = project.entries[0];
  const row = page.locator(`.entry-row[data-entry-id="${original.id}"]`);
  await row.getByRole("button", { name: /actions/i }).click();
  await page.getByRole("menuitem", { name: /duplicate/i }).click();
  await expect(page.locator(".entry-row")).toHaveCount(2);
  project = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const duplicate = project.entries.find((entry) => entry.id !== original.id)!;
  const copyRow = page.locator(`.entry-row[data-entry-id="${duplicate.id}"]`);
  await copyRow.getByRole("button", { name: /hide/i }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await row.locator(".entry-select").click();
  await expect(page.locator(".viewer-status")).toContainText(`/ ${original.atom_count} selected`);
  const before = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Style selection" });
  await expect(dialog.getByLabel("Distance (Å)")).toHaveValue("4");
  await dialog.getByRole("button", { name: "Expand selection", exact: true }).click();
  await expect(dialog.locator(".selection-style-summary")).toContainText(String(original.atom_count * 2));
  await expect(page.locator(".viewer-status")).toContainText(`/ ${original.atom_count * 2} selected`);
  await dialog.getByLabel("Expand to").selectOption("residue");
  await dialog.getByLabel("Distance (Å)").fill("0.1");
  await dialog.getByRole("button", { name: "Expand selection", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Expand selection", exact: true })).toBeEnabled();
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(before);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Style selection", exact: true })).toBeFocused();
});
