import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";

async function setup(page: Page, request: APIRequestContext, info: TestInfo) {
  const project = await (await request.post("/api/v1/projects", { data: { name: `Membership ${info.project.name} ${Date.now()}` } })).json() as Project;
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const importer = page.getByRole("dialog", { name: "Import structures" });
  await importer.locator('input[type="file"]').setInputFiles([
    resolve("tests/fixtures/formats/protein_editing.pdb"), resolve("tests/fixtures/formats/ethanol.mol"),
  ]);
  await importer.getByRole("button", { name: "Import", exact: true }).click();
  await expect(importer).toBeHidden({ timeout: 15000 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 30000 });
  let state = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  // Empty destinations and duplicate stored names are valid current project state.
  for (const name of ["Source", "Destination", "Destination"]) {
    const response = await request.post(`/api/v1/projects/${state.id}/groups`, { data: { expected_revision: state.revision, name, entry_ids: state.entries.map(entry => entry.id) } });
    expect(response.status()).toBe(200);
    state = await response.json() as Project;
  }
  const response = await request.post(`/api/v1/projects/${state.id}/group-membership`, { data: { expected_revision: state.revision, entry_ids: state.entries.map(entry => entry.id), group_id: state.groups.find(group => group.name === "Source")!.id } });
  expect(response.status()).toBe(200);
  state = await response.json() as Project;
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 30000 });
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "Project browser", exact: true }).click();
  return state;
}

async function dialogAccessibility(page: Page) {
  await page.locator(".dialog-content").evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations({ subtree: true }).map(animation => animation.finished));
  });
  return (await new AxeBuilder({ page }).include('.dialog-content').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
}

function row(page: Page, entryId: string) { return page.locator(`.entry-row[data-entry-id="${entryId}"]`); }
async function action(page: Page, entryId: string, name: string) {
  const trigger = row(page, entryId).locator(".entry-menu-trigger");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function getProject(request: APIRequestContext, id: string) { return await (await request.get(`/api/v1/projects/${id}`)).json() as Project; }

test("moves filtered selected batches, preserves molecular state, and supports keyboard/touch and history", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const initial = await setup(page, request, info);
  const origin = initial.entries.find(entry => entry.source_format === "mol")!;
  const other = initial.entries.find(entry => entry.id !== origin.id)!;
  await page.locator('[data-group-id]').filter({ has: page.getByText("Source", { exact: true }) }).locator(".group-select").click();
  const selectedStatus = await page.locator(".viewer-status").textContent();
  await page.getByPlaceholder("Search structures").fill(origin.name);
  const requests: string[] = [];
  page.on("request", request => { if (/\/structure(?:\?|$)/.test(request.url())) requests.push(request.url()); });
  let mutationCount = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/group-membership")) mutationCount++; });
  await action(page, origin.id, "Move to group…");
  const dialog = page.getByRole("dialog", { name: "Move to group", exact: true });
  await expect(dialog).toContainText("2 complete structures (1 hidden by the current filter)");
  await expect(dialog.getByLabel("Destination group")).toBeFocused();
  const labels = await dialog.getByLabel("Destination group").locator("option").allTextContents();
  expect(labels.filter(label => label.startsWith("Destination"))).toHaveLength(2);
  expect(new Set(labels).size).toBe(labels.length);
  const target = initial.groups.find(group => group.name === "Destination")!;
  await dialog.getByLabel("Destination group").selectOption(target.id);
  expect(await dialogAccessibility(page)).toEqual([]);
  await dialog.getByRole("button", { name: "Move structures" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, origin.id).locator(".entry-menu-trigger")).toBeFocused();
  await expect(page.locator(".viewer-status")).toHaveText(selectedStatus!);
  let moved = await getProject(request, initial.id);
  expect(moved.entries.map(entry => entry.group_id)).toEqual([target.id, target.id]);
  for (const entry of moved.entries) {
    const before = initial.entries.find(item => item.id === entry.id)!;
    expect({ ...entry, group_id: before.group_id, dirty: before.dirty }).toEqual(before);
  }
  expect(moved.groups.find(group => group.name === "Source")).toBeDefined();
  expect(mutationCount).toBe(1);
  await action(page, origin.id, "Move to group…");
  await page.getByRole("dialog", { name: "Move to group" }).getByLabel("Destination group").selectOption(target.id);
  await page.getByRole("button", { name: "Move structures" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("Group membership unchanged.");
  expect((await getProject(request, initial.id)).revision).toBe(moved.revision);
  await action(page, origin.id, "Remove from group");
  await expect.poll(async () => (await getProject(request, initial.id)).entries.map(entry => entry.group_id)).toEqual([null, null]);
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect.poll(async () => (await getProject(request, initial.id)).entries.map(entry => entry.group_id)).toEqual([target.id, target.id]);
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await expect.poll(async () => (await getProject(request, initial.id)).entries.map(entry => entry.group_id)).toEqual([null, null]);
  await action(page, origin.id, "Add to new group");
  const create = page.getByRole("dialog", { name: "Create group" });
  await expect(create).toContainText("2 complete structures");
  await create.getByLabel("Group name").fill("Batch");
  await create.getByRole("button", { name: "Create group" }).click();
  await expect(create).toBeHidden();
  await expect(page.locator(".viewer-status")).toHaveText(selectedStatus!);
  moved = await getProject(request, initial.id);
  expect(new Set(moved.entries.map(entry => entry.group_id)).size).toBe(1);
  expect(moved.groups.find(group => group.name === "Batch")?.id).toBe(moved.entries[0].group_id);
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Save checkpoint" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("Checkpoint saved");
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 30000 });
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "Project browser", exact: true }).click();
  await expect(page.locator(`[data-group-id="${moved.entries[0].group_id}"] [data-entry-id="${other.id}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await action(page, origin.id, "Move to group…");
  expect(await dialogAccessibility(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Move to group" })).toBeHidden();
});

test("rejects stale-tab actions and keeps a partial selection scoped to its complete entry", async ({ page, request }, info) => {
  const initial = await setup(page, request, info);
  const entry = initial.entries.find(entry => entry.source_format === "pdb")!;
  await page.getByLabel(`Component hierarchy for ${entry.name}`).click();
  const unclassified = page.locator(".hierarchy-category").filter({ has: page.getByText("Protein", { exact: true }) });
  await unclassified.locator("summary").click();
  await unclassified.locator(".hierarchy-component").first().click();
  await action(page, entry.id, "Move to group…");
  const dialog = page.getByRole("dialog", { name: "Move to group" });
  await expect(dialog).toContainText("1 complete structure.");
  const target = initial.groups.find(group => group.name === "Destination")!;
  await dialog.getByLabel("Destination group").selectOption(target.id);
  const current = await getProject(request, initial.id);
  const changed = await request.post(`/api/v1/projects/${initial.id}/group-membership`, { data: { expected_revision: current.revision, entry_ids: [entry.id], group_id: null } });
  expect(changed.status()).toBe(200);
  await dialog.getByRole("button", { name: "Move structures" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: /project changed|revision/i }).first()).toBeVisible();
  expect((await getProject(request, initial.id)).entries.find(item => item.id === entry.id)?.group_id).toBeNull();
  await page.keyboard.press("Escape");
  await action(page, entry.id, "Move to group…");
  await page.getByRole("dialog", { name: "Move to group" }).getByLabel("Destination group").selectOption(target.id);
  await page.getByRole("button", { name: "Move structures" }).click();
  await expect.poll(async () => (await getProject(request, initial.id)).entries.find(item => item.id === entry.id)?.group_id).toBe(target.id);
});
