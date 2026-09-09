import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

interface CreatedProject {
  id: string;
  name: string;
}

function uniqueName(prefix: string, testInfo: TestInfo): string {
  return `${prefix} ${testInfo.project.name} ${Date.now()}`;
}

async function createProject(
  request: APIRequestContext,
  name: string,
  description: string | null = null,
): Promise<CreatedProject> {
  const response = await request.post("/api/v1/projects", {
    data: { name, description },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as CreatedProject;
}

async function seedEntry(
  request: APIRequestContext,
  projectId: string,
  name: string,
  structureType: string,
): Promise<void> {
  const response = await request.post(`/api/v1/testing/projects/${projectId}/entries`, {
    data: { name, structure_type: structureType },
  });
  expect(response.status()).toBe(201);
}

async function openProject(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Projects" }).click();
  const dialog = page.getByRole("dialog", { name: "Projects" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: new RegExp(`^${escapeRegex(name)}`) }).click();
  await expect(page.getByRole("main").getByRole("heading", { name })).toBeVisible();
}

async function openInspector(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "Inspector" }).click();
  }
  await expect(page.getByRole("region", { name: "Project inspector" })).toBeVisible();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("creates, recovers, reverses, saves, and reopens a project", async ({
  page,
}, testInfo) => {
  const originalName = uniqueName("Lifecycle", testInfo);
  const revisedName = `${originalName} revised`;

  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "Create project" }).click();

  const createDialog = page.getByRole("dialog", { name: "Create project" });
  await expect(createDialog.getByRole("button", { name: "Create project" })).toBeDisabled();
  await createDialog.getByLabel("Name").fill(originalName);
  await createDialog.getByLabel("Description").fill("A durable local project");
  await createDialog.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("main").getByRole("heading", { name: originalName })).toBeVisible();
  await expect(page.getByText("Checkpoint saved", { exact: true })).toBeVisible();

  await openInspector(page, testInfo);
  const inspector = page.getByRole("region", { name: "Project inspector" });
  await inspector.getByLabel("Name").fill(revisedName);
  await inspector.getByLabel("Description").fill("Recovered after a browser restart");
  await inspector.getByRole("button", { name: "Apply changes" }).click();

  await expect(page.getByRole("main").getByRole("heading", { name: revisedName })).toBeVisible();
  await expect(page.getByText("Changes stored locally", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("main").getByRole("heading", { name: revisedName })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Recovered locally stored changes.");

  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: originalName })).toBeVisible();
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: revisedName })).toBeVisible();

  await page.getByRole("button", { name: "Save checkpoint" }).click();
  await expect(page.getByRole("status")).toContainText("Checkpoint saved.");
  await expect(page.getByText("Checkpoint saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save checkpoint" })).toBeDisabled();

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("main").getByRole("heading", { name: revisedName })).toBeVisible();

  await page.getByRole("button", { name: "Projects" }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", {
    name: new RegExp(`^${escapeRegex(revisedName)}`),
  }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: revisedName })).toBeVisible();

  if (testInfo.project.name === "chromium") {
    await page.getByRole("button", { name: "Collapse project browser" }).click();
    await expect(page.getByRole("button", { name: "Expand project browser" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand project browser" })).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Project browser" }).click();
    await expect(page.getByRole("region", { name: "Project browser" })).toBeVisible();
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    await page.mouse.click((viewport?.width ?? 412) - 8, 100);
    await expect(page.getByRole("region", { name: "Project browser" })).toBeHidden();
  }

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("reports an unavailable API and recovers after retry", async ({ page }) => {
  let failProjectList = true;
  await page.route("**/api/v1/projects", async (route) => {
    if (failProjectList) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Local API unavailable");
  await expect(alert).toContainText("Neistra could not reach the local API.");

  failProjectList = false;
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toBeHidden();
  await expect(page.getByRole("main").getByRole("heading", { name: "No project open" })).toBeVisible();
});

test("entry commands are durable and reversible through the workspace", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Entry command coverage uses the desktop browser.");

  const projectName = uniqueName("Entry commands", testInfo);
  const project = await createProject(request, projectName);
  await seedEntry(request, project.id, "Alpha", "protein");
  await seedEntry(request, project.id, "Beta", "ligand");

  await page.goto("/");
  await openProject(page, projectName);
  await expect(page.getByText("2 structures", { exact: true })).toBeVisible();

  const alphaRow = page.locator(".entry-row").filter({ hasText: "Alpha" }).first();
  await alphaRow.getByRole("button", { name: "Actions for Alpha" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename structure" });
  await renameDialog.getByLabel("Name").fill("Receptor");
  await renameDialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Receptor", { exact: true })).toBeVisible();

  const receptorRow = page.locator(".entry-row").filter({ hasText: "Receptor" }).first();
  await receptorRow.getByRole("button", { name: "Actions for Receptor" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByText("Receptor copy", { exact: true })).toBeVisible();

  await receptorRow.getByRole("button", { name: "Actions for Receptor" }).click();
  await page.getByRole("menuitem", { name: "Add to new group" }).click();
  const groupDialog = page.getByRole("dialog", { name: "Create group" });
  await groupDialog.getByLabel("Group name").fill("Inputs");
  await groupDialog.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText("Inputs", { exact: true })).toBeVisible();

  await receptorRow.getByRole("button", { name: "Lock Receptor" }).click();
  await expect(receptorRow.getByRole("button", { name: "Unlock Receptor" })).toBeVisible();
  await receptorRow.getByRole("button", { name: "Hide Receptor" }).click();
  await expect(receptorRow.getByRole("button", { name: "Show Receptor" })).toBeVisible();

  const copyRow = page.locator(".entry-row").filter({ hasText: "Receptor copy" });
  await copyRow.getByRole("button", { name: "Actions for Receptor copy" }).click();
  await page.getByRole("menuitem", { name: "Isolate" }).click();
  await expect(copyRow.getByRole("button", { name: "Hide Receptor copy" })).toBeVisible();

  const betaRow = page.locator(".entry-row").filter({ hasText: "Beta" });
  await betaRow.getByRole("button", { name: "Actions for Beta" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete structure" });
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("2 structures", { exact: true })).toBeVisible();
  await expect(page.getByText("Beta", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect(page.getByText("Beta", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await expect(page.getByText("Beta", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Save checkpoint" }).click();
  await expect(page.getByText("Checkpoint saved", { exact: true })).toBeVisible();
  await page.reload();

  await expect(page.getByText("Inputs", { exact: true })).toBeVisible();
  await expect(page.getByText("Receptor copy", { exact: true })).toBeVisible();
  await expect(page.getByText("Beta", { exact: true })).toBeHidden();
  await expect(
    page
      .locator(".entry-row")
      .filter({ hasText: "Receptor" })
      .first()
      .getByRole("button", { name: "Unlock Receptor" }),
  ).toBeVisible();
});
