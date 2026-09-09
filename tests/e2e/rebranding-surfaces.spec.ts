import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { StructureProjection } from "../../apps/web/src/api/types";

async function review(page: Page, info: TestInfo, name: string, scope = "#root") {
  await page.locator(scope).first().waitFor({ state: "visible" });
  // Audit the settled UI, not a partially transparent entrance-animation frame.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation =>
      animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  const violations = await new AxeBuilder({ page }).include(scope)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), name).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
  const clipped = await page.locator(scope).locator(".inspector-tabs button, .project-facts dt, .selection-summary dt").evaluateAll(nodes =>
    nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
  expect(clipped, `${name}: tab and summary labels fit`).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

async function panel(page: Page, kind: "Project browser" | "Inspector" | "History") {
  const trigger = page.getByRole("button", { name: kind, exact: true });
  if (await trigger.isVisible()) await trigger.click();
}

async function closePanel(page: Page) {
  const drawer = page.locator(".mobile-panel");
  if (await drawer.isVisible()) {
    // As with dialogs, target the drawer rather than an active icon tooltip.
    const target = drawer.locator('input:not(:disabled), [role="tab"]').first();
    await target.focus();
    await expect(target).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }
}

async function closeDialog(page: Page) {
  const dialog = page.locator(".dialog-content");
  // Focus the dialog itself: a focused icon tooltip legitimately consumes the
  // first Escape before the dialog. Test the dialog's own Escape contract.
  await dialog.focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

test("reviews all Neistra workflow surfaces in both themes", async ({ page, request }, info) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const created = await request.post("/api/v1/projects", { data: { name: `Brand surfaces ${info.project.name} ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const project = await created.json() as { id: string; name: string };
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const importer = page.getByRole("dialog", { name: "Import structures" });
  await importer.locator('input[type="file"]').setInputFiles([
    resolve("tests/fixtures/complex/component_hierarchy.pdb"), resolve("tests/fixtures/formats/ethanol.mol"),
  ]);
  await importer.getByRole("button", { name: "Import", exact: true }).click();
  await expect(importer).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 45_000 });
  const notice = page.getByRole("button", { name: "Dismiss message" });
  if (await notice.isVisible()) await notice.click();

  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    await closePanel(page);
    for (const title of ["Screenshot / State Snapshot", "Settings / Controls Info"]) {
      const trigger = page.locator(`.msp-viewport-controls button[title="${title}"]`);
      await trigger.click();
      const popup = page.locator(".msp-viewport-controls-panel");
      await expect(popup).toBeVisible();
      await popup.locator(".msp-control-group-header > button").first().click({ trial: true });
      expect(await popup.evaluate(node => {
        const box = node.getBoundingClientRect();
        const host = node.closest(".structure-viewer")!.getBoundingClientRect();
        return box.left >= host.left && box.right <= host.right && box.bottom <= host.bottom;
      })).toBe(true);
      await review(page, info, `${theme}-vendor-${title.startsWith("Screenshot") ? "screenshot" : "settings"}`);
      await trigger.click();
      await expect(popup).toBeHidden();
    }
    await panel(page, "Project browser");
    await page.locator(".entry-select").filter({ hasText: "Ethanol" }).click();
    const hierarchy = page.locator(".structure-hierarchy").first();
    if (await hierarchy.getAttribute("open") === null) await hierarchy.locator("summary").first().click();
    const category = hierarchy.locator("details.hierarchy-category").first();
    await expect(category).toBeVisible();
    if (await category.getAttribute("open") === null) await category.locator("summary").click();
    await review(page, info, `${theme}-hierarchy`);
    await page.getByRole("button", { name: "Actions for Ethanol", exact: true }).click();
    await review(page, info, `${theme}-entry-menu`, '[role="menu"]');
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await review(page, info, `${theme}-rename`, '.dialog-content');
    await closeDialog(page);
    await closePanel(page);

    await panel(page, "Inspector");
    const tabs = page.getByRole("tablist", { name: "Inspector views" });
    for (const name of ["selection", "inspect", "measurements", "transform", "ligand", "protein", "sequence", "details"]) {
      const tab = tabs.getByRole("tab", { name, exact: true });
      await tab.focus();
      await page.keyboard.press("Enter");
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await review(page, info, `${theme}-inspector-${name}`);
    }
    await tabs.getByRole("tab", { name: "details", exact: true }).focus();
    await page.keyboard.press("Home");
    await expect(tabs.getByRole("tab", { name: "selection", exact: true })).toHaveAttribute("aria-selected", "true");
    await closePanel(page);

    await page.getByRole("button", { name: "Style selection", exact: true }).click();
    const style = page.getByRole("dialog", { name: "Style selection" });
    await expect(style.getByRole("button", { name: "Cartoon", exact: true })).toBeDisabled();
    await review(page, info, `${theme}-selection-style`, '.dialog-content');
    await closeDialog(page);
    await page.getByRole("button", { name: "Open viewer controls" }).click();
    await review(page, info, `${theme}-viewer-controls`);
    await page.getByRole("button", { name: "Close viewer controls" }).click();

    await panel(page, "History");
    for (const name of ["Properties", "History", "Jobs"]) {
      await page.getByRole("tablist", { name: "Lower panel views" }).getByRole("tab", { name, exact: true }).click();
      await review(page, info, `${theme}-lower-${name.toLowerCase()}`);
    }
    await closePanel(page);
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Run job" })).toBeVisible();
    await review(page, info, `${theme}-job-parameters`, '.dialog-content');
    await closeDialog(page);
    await closePanel(page);

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const exporter = page.getByRole("dialog", { name: "Export" });
    await review(page, info, `${theme}-export`, '.dialog-content');
    await exporter.getByRole("tab", { name: "Project archive" }).click();
    await expect(exporter).toContainText("Neistra Archives use the existing .molweave.zip format.");
    await review(page, info, `${theme}-archive-export`, '.dialog-content');
    await closeDialog(page);
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await review(page, info, `${theme}-project-chooser`, '.dialog-content');
    await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: "Import project archive" }).click();
    const archive = page.getByRole("dialog", { name: "Import project archive" });
    await expect(archive.locator('input[type="file"]')).toHaveAttribute("accept", ".molweave.zip");
    await expect(archive).toContainText("Existing MolWeave archives remain supported.");
    await review(page, info, `${theme}-archive-import`, '.dialog-content');
    await closeDialog(page);
    await page.getByRole("button", { name: "Import structures" }).first().click();
    await review(page, info, `${theme}-structure-import`, '.dialog-content');
    await closeDialog(page);
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`reviews warning, failure, recovery and job states in ${theme}`, async ({ page, request }, info) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    const created = await request.post("/api/v1/projects", { data: { name: `Brand states ${theme} ${info.project.name} ${Date.now()}` } });
    expect(created.status()).toBe(201);
    const project = await created.json() as { id: string; name: string };
    const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
      expected_revision: "0", generate_3d: "true", infer_bonds: "true",
      files: { name: "ethanol.mol", mimeType: "chemical/x-mdl-molfile", buffer: readFileSync(resolve("tests/fixtures/formats/ethanol.mol")) },
    } });
    expect(imported.status()).toBe(201);
    await page.goto("/");
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
    await page.getByRole("button", { name: "Import structures" }).first().click();
    const importer = page.getByRole("dialog", { name: "Import structures" });
    await importer.locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/formats/malformed.pdb"));
    await importer.getByRole("button", { name: "Import", exact: true }).click();
    await expect(importer.getByRole("alert")).toBeVisible();
    await review(page, info, `${theme}-parse-failure`, '.dialog-content');
    await closeDialog(page);

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const exporter = page.getByRole("dialog", { name: "Export" });
    await exporter.getByRole("combobox", { name: "Format", exact: true }).selectOption("pdb");
    await exporter.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(exporter.getByRole("alert")).toBeVisible();
    await expect(exporter.getByRole("link", { name: "Download" })).toBeHidden();
    await review(page, info, `${theme}-blocked-export-loss`, '.dialog-content');
    await exporter.getByLabel("I understand that this format cannot preserve the listed information.").check();
    await exporter.getByRole("button", { name: "Generate anyway" }).click();
    await expect(exporter.getByRole("link", { name: "Download" })).toBeVisible();
    await review(page, info, `${theme}-export-ready-with-warnings`, '.dialog-content');
    await closeDialog(page);

    for (const outcome of ["completed", "failed", "cancelled"] as const) {
      await closePanel(page);
      await page.getByRole("button", { name: "Jobs", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Run job" });
      await dialog.getByLabel(/^Ethanol/).check();
      await dialog.getByLabel("Steps", { exact: true }).fill(outcome === "cancelled" ? "100" : "3");
      await dialog.getByLabel("Delay per step (ms)").fill(outcome === "cancelled" ? "100" : "20");
      await dialog.getByLabel("Fail at step").fill(outcome === "failed" ? "2" : "");
      await dialog.getByRole("button", { name: "Queue job" }).click();
      await expect(dialog).toBeHidden();
      const detail = page.locator(".job-detail-pane");
      await detail.getByRole("tab", { name: "Overview", exact: true }).click();
      if (outcome === "cancelled") {
        await expect(detail.locator(".job-status.running")).toBeVisible();
        await review(page, info, `${theme}-job-running`);
        await detail.getByRole("button", { name: "Cancel", exact: true }).click();
        const cancel = page.getByRole("dialog", { name: "Cancel job" });
        await review(page, info, `${theme}-job-cancel-confirmation`, '.dialog-content');
        await cancel.getByRole("button", { name: "Cancel job", exact: true }).click();
      }
      await expect(detail.locator(`.job-status.${outcome}`)).toBeVisible({ timeout: 20_000 });
      if (outcome === "failed") await expect(detail.getByRole("alert")).toContainText("Demonstration failure at step 2");
      for (const summary of await detail.locator("details > summary").all()) {
        if (await summary.locator("..").getAttribute("open") === null) await summary.click();
      }
      await review(page, info, `${theme}-job-${outcome}`);
      await detail.getByRole("tab", { name: "Logs", exact: true }).click();
      await review(page, info, `${theme}-job-${outcome}-logs`);
      if (outcome === "completed") {
        await detail.getByRole("tab", { name: /Results/ }).click();
        await expect(detail.getByRole("button", { name: "Import", exact: true })).toBeVisible();
        await review(page, info, `${theme}-job-results`);
      }
    }
    await closePanel(page);
    let unavailable = true;
    await page.route("**/api/v1/projects", async route => unavailable ? route.abort("failed") : route.continue());
    await page.reload();
    const failure = page.locator(".api-failure");
    await expect(failure).toContainText("Neistra could not reach the local API.", { timeout: 20_000 });
    await review(page, info, `${theme}-api-failure`);
    unavailable = false;
    await failure.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(failure).toBeHidden();
    await review(page, info, `${theme}-api-recovered`);
  });
}

test("keeps ambiguous classification warnings and legacy user copy visible", async ({ page, request }, info) => {
  test.setTimeout(60_000);
  const created = await request.post("/api/v1/projects", { data: { name: `MolWeave user-named project ${info.project.name} ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const project = await created.json() as { id: string; name: string };
  const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
    expected_revision: "0", generate_3d: "true", infer_bonds: "true",
    files: { name: "ethanol.mol", mimeType: "chemical/x-mdl-molfile", buffer: readFileSync(resolve("tests/fixtures/formats/ethanol.mol")) },
  } });
  expect(imported.status()).toBe(201);
  const warning = "MolWeave diagnostic fixture: source facts are insufficient for a narrower classification.";
  // Deliberately synthetic UI-warning response, not a claim about ethanol
  // chemistry. Molecular atoms/bonds and the real server state remain intact.
  await page.route(`**/api/v1/projects/${project.id}/entries/*/structure`, async route => {
    const response = await route.fetch();
    const data = await response.json() as StructureProjection;
    const component = data.hierarchy.components[0];
    component.category = "unclassified";
    component.classification_source = "ambiguous";
    component.classification_status = "ambiguous";
    component.warnings = [{ code: "component_classification_ambiguous", message: warning,
      severity: "warning", operation: "component_detection", field: "component.category", blocking: false }];
    data.hierarchy.warnings = component.warnings;
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme" }).click();
    await panel(page, "Project browser");
    const hierarchy = page.locator(".structure-hierarchy");
    if (await hierarchy.getAttribute("open") === null) await hierarchy.locator("summary").first().click();
    const category = page.locator(".hierarchy-category");
    if (await category.getAttribute("open") === null) await category.locator("summary").click();
    await expect(page.locator(".classification-source.ambiguous")).toBeVisible();
    await expect(page.locator(".component-warning")).toContainText(warning);
    await expect(page.locator(".project-switcher")).toContainText(project.name);
    await page.getByRole("button", { name: "Lock Ethanol", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unlock Ethanol", exact: true })).toBeVisible();
    await review(page, info, `${theme}-ambiguous-locked-fixture`);
    await page.getByRole("button", { name: "Unlock Ethanol", exact: true }).click();
    await closePanel(page);
  }
});
