import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const FIXTURES = resolve("tests/fixtures/formats");

interface ProjectRead {
  id: string;
  name: string;
}

async function createAndOpenProject(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<ProjectRead> {
  const response = await request.post("/api/v1/projects", {
    data: { name: `Release hardening ${testInfo.project.name} ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const project = (await response.json()) as ProjectRead;

  await page.goto("/");
  await page.getByRole("button", { name: "Projects" }).click();
  await page
    .getByRole("dialog", { name: "Projects" })
    .getByRole("button", { name: new RegExp(`^${project.name}`) })
    .click();
  return project;
}

async function importRepresentativeProject(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog.locator('input[type="file"]').setInputFiles([
    resolve(FIXTURES, "protein_models_altloc.pdb"),
    resolve(FIXTURES, "ethanol.mol"),
  ]);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", {
    timeout: 30_000,
  });
}

async function accessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .include("#root")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

test("passes automated accessibility checks in both themes", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await createAndOpenProject(page, request, testInfo);
  await importRepresentativeProject(page);

  expect(await accessibilityViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await accessibilityViolations(page)).toEqual([]);
});

test("supports keyboard focus and bounded responsive controls", async ({
  page,
  request,
}, testInfo) => {
  await createAndOpenProject(page, request, testInfo);
  await importRepresentativeProject(page);

  const projectButton = page.getByRole("button", { name: "Projects", exact: true });
  await projectButton.focus();
  await page.keyboard.press("Enter");
  const projectsDialog = page.getByRole("dialog", { name: "Projects" });
  await expect(projectsDialog).toBeVisible();
  expect(
    await projectsDialog.evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(projectsDialog).toBeHidden();
  await expect(projectButton).toBeFocused();

  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  await exportButton.focus();
  await page.keyboard.press("Enter");
  const exportDialog = page.getByRole("dialog", { name: "Export" });
  await expect(exportDialog).toBeVisible();
  expect(await exportDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(exportDialog).toBeHidden();
  await expect(exportButton).toBeFocused();

  if (testInfo.project.name === "mobile-chromium") {
    const inspectorButton = page.getByRole("button", { name: "Inspector" });
    await inspectorButton.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Inspector panel" });
    await expect(drawer).toBeVisible();
    const selectionTab = drawer.getByRole("tab", { name: "selection" });
    await expect(selectionTab).toBeFocused();
    await selectionTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(drawer.getByRole("tab", { name: "inspect" })).toBeFocused();
    await expect(drawer.getByRole("tab", { name: "inspect" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(inspectorButton).toBeFocused();
  } else {
    const selectionTab = page.getByRole("tab", { name: "selection" });
    await selectionTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "inspect" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "inspect" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const propertiesTab = page.getByRole("tab", { name: "Properties" });
    await propertiesTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "History", exact: true })).toBeFocused();
    await expect(page.getByRole("tab", { name: "History", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  const clippedControls = await page.locator("button:visible, input:visible, select:visible").evaluateAll(
    (controls) =>
      controls.flatMap((control) => {
        const box = control.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1
          ? [control.getAttribute("aria-label") ?? control.textContent?.trim() ?? control.tagName]
          : [];
      }),
  );
  expect(clippedControls).toEqual([]);
});

test("keeps representative-project interactions responsive and projection-scoped", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Performance budgets use desktop Chromium.");
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const durations: number[] = [];
    Object.defineProperty(window, "__molweaveLongTasks", {
      configurable: true,
      value: durations,
    });
    new PerformanceObserver((entries) => {
      durations.push(...entries.getEntries().map((entry) => entry.duration));
    }).observe({ type: "longtask", buffered: true });
  });
  await createAndOpenProject(page, request, testInfo);

  const importStarted = Date.now();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import structures" });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(resolve("tests/fixtures/complex/1stp.pdb"));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", {
    timeout: 45_000,
  });
  const importAndViewerMs = Date.now() - importStarted;
  expect(importAndViewerMs).toBeLessThan(30_000);

  await page.evaluate(() => {
    (window as Window & { __molweaveLongTasks: number[] }).__molweaveLongTasks.length = 0;
  });
  const structureRequests: string[] = [];
  page.on("request", (outgoing) => {
    if (/\/entries\/[^/]+\/structure$/.test(new URL(outgoing.url()).pathname)) {
      structureRequests.push(outgoing.url());
    }
  });

  const interactionStarted = Date.now();
  await page.locator(".entry-select").click();
  await page.getByRole("button", { name: "Open viewer controls" }).click();
  const navigation = page.getByLabel("Viewer navigation");
  await navigation.getByRole("button", { name: "Zoom in" }).click();
  await navigation.getByRole("button", { name: "Zoom out" }).click();
  await navigation.getByRole("button", { name: "Center and reset view" }).click();
  await page.getByLabel(/Representation style for/).selectOption("line");
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await page.waitForTimeout(750);
  const interactionMs = Date.now() - interactionStarted;
  expect(interactionMs).toBeLessThan(5_000);
  expect(structureRequests).toEqual([]);

  const longTasks = await page.evaluate(
    () => (window as Window & { __molweaveLongTasks: number[] }).__molweaveLongTasks,
  );
  const maxInteractionLongTaskMs = Math.max(0, ...longTasks);
  expect(maxInteractionLongTaskMs).toBeLessThan(750);
  await testInfo.attach("performance-profile.json", {
    body: JSON.stringify(
      {
        fixture: "RCSB PDB 1STP",
        atoms: 1001,
        importAndViewerMs,
        interactionMs,
        maxInteractionLongTaskMs,
        repeatedStructureRequests: structureRequests.length,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
