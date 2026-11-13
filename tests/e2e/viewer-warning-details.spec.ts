import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  expectWarningRows, inspectWarningScene, openWarningProject, prepareWarningProject,
  readWarningProject, refreshWarningProject, stableWarningScene, warningDialog,
  warningMolecularSnapshot, warningTrigger,
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
  for (const focusClose of [false, true]) {
    await warningTrigger(page).click();
    await expect(warningDialog(page)).toBeFocused();
    if (focusClose) await warningDialog(page).getByRole("button", { name: "Close structure warnings", exact: true }).focus();
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
