import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import { performanceBudget } from "./support/performance";
import {
  expectWarningRows, inspectWarningScene, openWarningProject, prepareWarningProject,
  readWarningProject, refreshWarningProject, stableWarningScene, warningDialog,
  warningMolecularSnapshot, warningTrigger, warningStressProject, expectWarningBounds,
  beginWarningMeasurement, finishWarningMeasurement,
} from "./support/warning-details";

test("inspects exact real entry warnings without changing molecular, project or native state", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const project = await prepareWarningProject(page, request);
  const baseline = await readWarningProject(request, project.id);
  const molecules = await warningMolecularSnapshot(request, baseline);
  const scene = await stableWarningScene(page, baseline);
  const warned = baseline.entries.filter(entry => entry.warnings.length > 0);
  expect(warned).toHaveLength(2);
  expect(warned[0].warnings.map(warning => warning.message)).toEqual(warned[1].warnings.map(warning => warning.message));
  const unexpected: string[] = [];
  page.on("request", request => {
    if (request.method() !== "GET" || /\/entries\/[^/]+\/structure$/.test(new URL(request.url()).pathname)) unexpected.push(`${request.method()} ${request.url()}`);
  });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
    await warningTrigger(page).focus();
    await page.keyboard.press("Enter");
    await expectWarningRows(page, baseline);
    await expect(warningDialog(page)).toBeFocused();
    expect((await new AxeBuilder({ page }).include(".viewer-warning-details").include(".viewer-warning-trigger").analyze()).violations).toEqual([]);
    await info.attach(`${theme}-structure-warnings`, { body: await page.screenshot(), contentType: "image/png" });
    await page.keyboard.press("Escape");
    await expect(warningDialog(page)).toBeHidden();
    await expect(warningTrigger(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(warningDialog(page)).toBeVisible();
    await warningDialog(page).getByRole("button", { name: "Close structure warnings", exact: true }).click();
    await expect(warningTrigger(page)).toBeFocused();
  }
  await warningTrigger(page).click();
  const themeButton = page.getByRole("button", { name: "Use light theme", exact: true });
  await themeButton.click();
  await expect(warningDialog(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Use dark theme", exact: true })).toBeFocused();
  expect(await readWarningProject(request, project.id)).toEqual(baseline);
  expect(await warningMolecularSnapshot(request, baseline)).toEqual(molecules);
  expect(await inspectWarningScene(page, baseline)).toEqual(scene);
  expect(unexpected).toEqual([]);
  await info.attach("inspection-invariants", { body: JSON.stringify({ projectUnchanged: true, moleculesAndOriginalsUnchanged: true, nativeUnchanged: true, unexpectedRequests: unexpected }), contentType: "application/json" });
});

test("keeps 500 complete warning records scrollable and read-only in both themes", async ({ page, request }, info) => {
  test.setTimeout(180_000);
  const baseline = await prepareWarningProject(page, request, "Warning presentation workload");
  const original = await warningMolecularSnapshot(request, baseline);
  let displayed: Project = warningStressProject(baseline);
  await page.route(`**/api/v1/projects/${baseline.id}`, route => route.fulfill({ json: displayed }));
  await page.evaluate(id => window.refetchWarningProject(id), baseline.id);
  await expect(warningTrigger(page)).toHaveAccessibleName("Inspect 500 warnings for visible structures");
  const notice = page.getByRole("button", { name: "Dismiss message", exact: true });
  if (await notice.isVisible()) await notice.click();
  const scene = await stableWarningScene(page, displayed);
  const unexpected: string[] = [];
  page.on("request", request => {
    if (request.method() !== "GET" || /\/entries\/[^/]+\/structure$/.test(new URL(request.url()).pathname)) unexpected.push(`${request.method()} ${request.url()}`);
  });
  const measurements: unknown[] = [];
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
    await beginWarningMeasurement(page);
    await warningTrigger(page).click();
    await expect(warningDialog(page)).toBeVisible();
    const opening = await finishWarningMeasurement(page);
    performanceBudget(opening.elapsedMs, 5_000, "warning details 500-record open");
    performanceBudget(opening.longestTaskMs, 750, "warning details open longest task");
    await expectWarningRows(page, displayed);
    const bounds = await expectWarningBounds(page);
    const dialog = warningDialog(page);
    const body = dialog.locator(".viewer-warning-details-body");
    expect(await body.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    await expect(dialog.getByRole("group")).toHaveCount(2);
    await expect(dialog.getByRole("heading", { level: 3 })).toHaveText([displayed.entries.find(entry => entry.warnings.length)!.name, displayed.entries.find(entry => entry.warnings.length)!.name]);
    await expect(dialog.locator(".viewer-warning-message").filter({ hasText: /^Repeated warning record retained independently\.$/ })).toHaveCount(2);
    expect((await new AxeBuilder({ page }).include(".viewer-warning-details").include(".viewer-warning-trigger").analyze()).violations).toEqual([]);
    await info.attach(`${theme}-500-warning-start`, { body: await page.screenshot(), contentType: "image/png" });
    await dialog.getByRole("button", { name: "Close structure warnings", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(body).toBeFocused();
    await page.keyboard.press("End");
    await expect(dialog.locator(".viewer-warning-message").last()).toBeInViewport();
    await page.keyboard.press("Home");
    await expect(dialog.locator(".viewer-warning-message").first()).toBeInViewport();
    await body.hover();
    await page.mouse.wheel(0, 100_000);
    await expect(dialog.locator(".viewer-warning-message").last()).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Close structure warnings", exact: true })).toBeInViewport();
    expect(await inspectWarningScene(page, displayed)).toEqual(scene);
    await info.attach(`${theme}-500-warning-end`, { body: await page.screenshot(), contentType: "image/png" });
    measurements.push({ theme, opening, ...bounds, rows: await dialog.locator("li").count(), scroll: await body.evaluate(node => ({ top: node.scrollTop, total: node.scrollHeight, height: node.clientHeight })) });
    await dialog.getByRole("button", { name: "Close structure warnings", exact: true }).click();
    await expect(warningTrigger(page)).toBeFocused();
    await expect(page.locator("[data-viewer-warning-details]")).toHaveCount(0);
  }

  await warningTrigger(page).click();
  const entries = displayed.entries.filter(entry => entry.warnings.length);
  displayed = { ...displayed, entries: displayed.entries.map(entry => entry.id === entries[0].id ? {
    ...entry, warnings: entry.warnings.slice(1).map((warning, index) => index ? warning : { ...warning, message: "Updated current warning, without closing details." }),
  } : entry) };
  await beginWarningMeasurement(page);
  await page.evaluate(id => window.refetchWarningProject(id), baseline.id);
  await expect(warningTrigger(page)).toHaveAccessibleName("Inspect 499 warnings for visible structures");
  await expectWarningRows(page, displayed);
  const updating = await finishWarningMeasurement(page);
  performanceBudget(updating.elapsedMs, 5_000, "warning details current-record replacement");
  performanceBudget(updating.longestTaskMs, 750, "warning details update longest task");
  await expect(warningDialog(page).getByText("Updated current warning, without closing details.", { exact: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(warningDialog(page)).toBeHidden();

  for (let cycle = 0; cycle < 3; cycle++) {
    await warningTrigger(page).click();
    await expect(warningDialog(page).locator("li")).toHaveCount(499);
    await warningDialog(page).getByRole("button", { name: "Close structure warnings", exact: true }).click();
    await expect(page.locator("[data-viewer-warning-details]")).toHaveCount(0);
  }
  expect(await readWarningProject(request, baseline.id)).toEqual(baseline);
  expect(await warningMolecularSnapshot(request, baseline)).toEqual(original);
  expect(await inspectWarningScene(page, displayed)).toEqual(scene);
  expect(unexpected).toEqual([]);
  await info.attach("warning-presentation-profile", { body: JSON.stringify({ warningRecords: 500, measurements, updating, unexpectedRequests: unexpected, backendAndNativeUnchanged: true }), contentType: "application/json" });
});

test("passes ordinary status input to the canvas and preserves normal canvas navigation after dismissal", async ({ page, request }) => {
  test.setTimeout(120_000);
  const project = await prepareWarningProject(page, request, "Warning pointer ownership");
  const baseline = await readWarningProject(request, project.id);
  const scene = await stableWarningScene(page, project);
  const passThrough = await page.locator(".viewer-status > span").first().evaluate(node => {
    const box = node.getBoundingClientRect();
    const point = { x: box.left + 3, y: box.top + box.height / 2 };
    const target = document.elementFromPoint(point.x, point.y);
    return { point, hitsCanvas: Boolean(target?.closest(".molstar-host")), statusPointerEvents: getComputedStyle(node).pointerEvents };
  });
  expect(passThrough.statusPointerEvents).toBe("none");
  expect(passThrough.hitsCanvas).toBe(true);
  await page.mouse.click(passThrough.point.x, passThrough.point.y);
  await warningTrigger(page).click();
  const body = warningDialog(page).locator(".viewer-warning-details-body");
  await body.hover();
  await page.mouse.wheel(0, 100);
  const paragraph = warningDialog(page).locator(".viewer-warning-message").first();
  await paragraph.click();
  expect(await inspectWarningScene(page, project)).toEqual(scene);
  await page.keyboard.press("Escape");
  await expect(warningDialog(page)).toBeHidden();
  const canvas = page.locator(".molstar-host canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.65, box!.y + box!.height * 0.7);
  await page.mouse.wheel(0, -150);
  await expect.poll(async () => JSON.stringify((await inspectWarningScene(page, project)).entries[0].camera)).not.toBe(JSON.stringify(scene.entries[0].camera));
  expect(await readWarningProject(request, project.id)).toEqual(baseline);
});

test("updates current groups through rename, visibility, deletion and undo, and retains an open empty state", async ({ page, request }) => {
  test.setTimeout(120_000);
  let project = await prepareWarningProject(page, request, "Warning updates");
  const warned = project.entries.filter(entry => entry.warnings.length);
  await warningTrigger(page).click();
  const renamed = await request.patch(`/api/v1/projects/${project.id}/entries/${warned[0].id}`, {
    data: { expected_revision: project.revision, name: "Current warning owner" },
  });
  expect(renamed.status()).toBe(200);
  project = await refreshWarningProject(page, request, project.id);
  await expectWarningRows(page, project);
  await expect(warningDialog(page).getByRole("heading", { name: "Current warning owner", exact: true })).toBeVisible();

  for (const entry of warned) {
    const hidden = await request.post(`/api/v1/projects/${project.id}/entries/${entry.id}/visibility`, {
      data: { expected_revision: project.revision, value: false },
    });
    expect(hidden.status()).toBe(200);
    project = await refreshWarningProject(page, request, project.id);
    if (project.entries.some(entry => entry.visible && entry.warnings.length)) await expectWarningRows(page, project);
  }
  await expect(warningTrigger(page)).toBeHidden();
  await expect(warningDialog(page)).toBeVisible();
  await expect(warningDialog(page)).toContainText("No warnings for visible structures");
  await expect(warningDialog(page).locator("li")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(warningDialog(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body && document.activeElement?.isConnected)).toBe(true);

  const undone = await request.post(`/api/v1/projects/${project.id}/history/undo`, { data: { expected_revision: project.revision } });
  expect(undone.status()).toBe(200);
  project = await refreshWarningProject(page, request, project.id);
  await warningTrigger(page).click();
  await expectWarningRows(page, project);
  const visibleWarned = project.entries.find(entry => entry.visible && entry.warnings.length)!;
  const deleted = await request.delete(`/api/v1/projects/${project.id}/entries/${visibleWarned.id}?expected_revision=${project.revision}`);
  expect(deleted.status()).toBe(200);
  project = await refreshWarningProject(page, request, project.id);
  await expect(warningDialog(page)).toContainText("No warnings for visible structures");
  await expect(warningDialog(page).locator(`[data-warning-entry-id="${visibleWarned.id}"]`)).toHaveCount(0);
});

test("retires warning details on responsive remount and project switch", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const otherResponse = await request.post("/api/v1/projects", { data: { name: `Other warning owner ${Date.now()}` } });
  expect(otherResponse.status()).toBe(201);
  const other = await otherResponse.json() as { name: string };
  const project = await prepareWarningProject(page, request, "Warning ownership");
  await warningTrigger(page).click();
  await expect(warningDialog(page)).toBeVisible();
  await page.setViewportSize(info.project.name === "chromium" ? { width: 412, height: 915 } : { width: 1280, height: 900 });
  await expect(page.locator(".viewer-status")).toContainText("3 visible / 3 loaded", { timeout: 30_000 });
  await expect(warningDialog(page)).toBeHidden();
  await warningTrigger(page).click();
  await expectWarningRows(page, project);
  await openWarningProject(page, other.name);
  await expect(warningDialog(page)).toBeHidden();
  await expect(warningTrigger(page)).toBeHidden();
  await openWarningProject(page, project.name);
  await expect(page.locator(".viewer-status")).toContainText("3 visible / 3 loaded", { timeout: 30_000 });
  await expect(warningDialog(page)).toBeHidden();
});

test("focused warning details own Escape without cancelling an active movement preview", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const project = await prepareWarningProject(page, request, "Warning movement");
  const ligand = project.entries.find(entry => entry.source_format === "mol")!;
  const original = await warningMolecularSnapshot(request, project);
  const mobile = info.project.name === "mobile-chromium";
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByLabel("Select by").selectOption("structure");
  await page.getByLabel("Value", { exact: true }).fill(ligand.id);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await expect(page.getByLabel("Current selection summary")).toContainText(`Atoms${ligand.atom_count}`);
  await page.getByRole("tab", { name: "transform", exact: true }).click();
  await page.getByRole("button", { name: "Move selection", exact: true }).focus();
  await page.keyboard.press("Enter");
  const banner = page.getByRole("region", { name: "Move selection controls", exact: true });
  await expect(banner).toBeVisible();
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  const movement = page.getByRole("group", { name: "Move selection canvas", exact: true });
  await movement.focus();
  await page.keyboard.press("ArrowRight");
  const preview = await stableWarningScene(page, project);
  expect(preview.entries.some(entry => entry.movementActive)).toBe(true);
  for (const focusTarget of ["content", "close", "list"] as const) {
    await warningTrigger(page).click();
    await expect(warningDialog(page)).toBeFocused();
    if (focusTarget === "close") await warningDialog(page).getByRole("button", { name: "Close structure warnings", exact: true }).focus();
    if (focusTarget === "list") await warningDialog(page).getByRole("region", { name: "Structure warning list", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(warningDialog(page)).toBeHidden();
    await expect(banner).toBeVisible();
    expect(await inspectWarningScene(page, project)).toEqual(preview);
  }
  await movement.focus();
  await page.keyboard.press("Escape");
  await expect(banner).toBeHidden();
  expect(await readWarningProject(request, project.id)).toEqual(project);
  expect(await warningMolecularSnapshot(request, project)).toEqual(original);
});
