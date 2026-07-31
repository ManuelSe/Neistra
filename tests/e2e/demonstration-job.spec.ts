import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

const ETHANOL = resolve("tests/fixtures/formats/ethanol.mol");

interface ProjectSummary {
  id: string;
  name: string;
}

function uniqueName(prefix: string, testInfo: TestInfo) {
  return `${prefix} ${testInfo.project.name} ${Date.now()}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function createImportedProject(
  request: APIRequestContext,
  name: string,
): Promise<ProjectSummary> {
  const createdResponse = await request.post("/api/v1/projects", {
    data: { name, description: "Demonstration job browser workflow" },
  });
  expect(createdResponse.status()).toBe(201);
  const project = (await createdResponse.json()) as ProjectSummary;
  const imported = await request.post(`/api/v1/projects/${project.id}/imports`, {
    multipart: {
      expected_revision: "0",
      generate_3d: "true",
      infer_bonds: "true",
      files: {
        name: "ethanol.mol",
        mimeType: "chemical/x-mdl-molfile",
        buffer: readFileSync(ETHANOL),
      },
    },
  });
  expect(imported.status()).toBe(201);
  return project;
}

async function openProject(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Projects" }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${escapeRegex(name)}`) })
    .click();
  await expect(page.locator(".project-switcher")).toContainText(name);
}

async function selectEthanolAndQueue(page: Page, values?: { steps?: string; delay?: string; fail?: string }) {
  const dialog = page.getByRole("dialog", { name: "Run job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Ethanol/).check();
  if (values?.steps) await dialog.getByLabel("Steps").fill(values.steps);
  if (values?.delay) await dialog.getByLabel("Delay per step (ms)").fill(values.delay);
  if (values?.fail) await dialog.getByLabel("Fail at step").fill(values.fail);
  await dialog.getByRole("button", { name: "Queue job" }).click();
  await expect(dialog).toBeHidden();
}

test("completes, fails, cancels, downloads, imports, and undoes demonstration jobs", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Full lifecycle runs in desktop Chromium.");
  const project = await createImportedProject(request, uniqueName("Demo jobs", testInfo));
  await openProject(page, project.name);

  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await selectEthanolAndQueue(page, { steps: "3", delay: "20" });
  const details = page.locator(".job-detail-pane");
  await expect(details.locator(".job-status.completed")).toBeVisible({ timeout: 15_000 });
  await details.getByRole("tab", { name: "Logs" }).click();
  await expect(details.getByText("Calculated atom, residue, chain, element, and mass statistics.")).toBeVisible();
  await details.getByRole("tab", { name: /Results/ }).click();
  await expect(details.getByText("structure-statistics.json")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await details.getByRole("link", { name: "Download" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("structure-statistics.json");
  await details.getByRole("button", { name: "Import" }).click();
  await expect(page.locator(".notice[role='status']")).toContainText(
    "Job result imported into the project.",
  );
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded");
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");

  await page.locator(".jobs-toolbar").getByRole("button", { name: "New" }).click();
  await selectEthanolAndQueue(page, { steps: "3", delay: "10", fail: "2" });
  await details.getByRole("tab", { name: "Overview" }).click();
  await expect(details.locator(".job-status.failed")).toBeVisible({ timeout: 15_000 });
  await expect(details.getByRole("alert")).toContainText("plugin_execution_failed");
  await expect(details.getByRole("alert")).toContainText("Demonstration failure at step 2");

  await page.locator(".jobs-toolbar").getByRole("button", { name: "New" }).click();
  await selectEthanolAndQueue(page, { steps: "100", delay: "50" });
  await details.getByRole("tab", { name: "Overview" }).click();
  await expect(details.locator(".job-status.running")).toBeVisible({ timeout: 10_000 });
  await details.getByRole("button", { name: "Cancel" }).click();
  const cancelDialog = page.getByRole("dialog", { name: "Cancel job" });
  await expect(cancelDialog).toContainText("cannot be resumed");
  await cancelDialog.getByRole("button", { name: "Cancel job" }).click();
  await expect(details.locator(".job-status.cancelled")).toBeVisible({ timeout: 10_000 });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("runs a demonstration job in the mobile workspace without overlap", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Responsive workflow runs in mobile Chromium.");
  const project = await createImportedProject(request, uniqueName("Mobile demo", testInfo));
  await openProject(page, project.name);
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await selectEthanolAndQueue(page, { steps: "2", delay: "10" });
  const workspace = page.locator(".jobs-workspace");
  await expect(workspace).toBeVisible();
  await expect(
    workspace.locator(".job-detail-pane .job-status.completed"),
  ).toBeVisible({ timeout: 15_000 });
  await workspace.getByRole("tab", { name: /Results/ }).click();
  await expect(workspace.getByRole("button", { name: "Import" })).toBeVisible();
  const boxes = await page.locator(".topbar, .mobile-panel, .jobs-workspace").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }),
  );
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport?.width ?? 412);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(viewport?.height ?? 915);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
