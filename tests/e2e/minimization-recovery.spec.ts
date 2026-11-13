import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Job, Project, QuickMinimizationProposal } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { current, panel, structures } from "./support/minimization";

async function prepared(page: Page, request: APIRequestContext, mobile: boolean, label: string) {
  const p = await prepare(page, request, ["tests/fixtures/quick-minimization/New_molecule.sdf"], label);
  if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("structure");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(p.entries[0].id);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText(`/ ${p.entries[0].atom_count} selected`);
  if (mobile) await page.getByRole("button", { name: "Close panel", exact: true }).click({ position: { x: 2, y: 100 } });
  await page.locator(".molstar-host canvas").first().focus();
  return p;
}
async function start(page: Page): Promise<Job> {
  const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/quick-minimizations"));
  await page.keyboard.press("Control+m");
  const submitted = await response;
  expect(submitted.status()).toBe(201);
  return submitted.json() as Promise<Job>;
}
async function openProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
const recovery = (page: Page) => panel(page).getByRole("region", { name: "Coordinate application recovery", exact: true });

for (const fault of ["abort", "malformed", "503"] as const) test(`reconciles a real committed quick Apply after ${fault} without replay and retains exact Undo/Redo`, async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepared(page, request, info.project.name === "mobile-chromium", `Quick recovery ${fault}`);
  const before = await structures(request, p);
  let applications = 0;
  await page.route("**/quick-minimizations/*/apply", async route => {
    applications++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (fault === "abort") await route.abort("failed");
    else if (fault === "malformed") await route.fulfill({ status: 200, contentType: "application/json", body: "{" });
    else await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Injected lost Apply response" }) });
  });
  const job = await start(page);
  await expect(page.getByRole("button", { name: /Undo: Quick minimize selection/ })).toBeEnabled({ timeout: 30000 });
  await expect(panel(page)).toBeHidden();
  const updated = await current(request, p.id), after = await structures(request, updated);
  expect(updated.revision).toBe(p.revision + 1);
  expect(updated.history.retained_commands).toBe(p.history.retained_commands + 1);
  expect(after).not.toEqual(before);
  expect(after[p.entries[0].id].bonds).toEqual(before[p.entries[0].id].bonds);
  expect(applications).toBe(1);
  const retained = await (await request.get(`/api/v1/jobs/${job.id}`)).json() as Job;
  expect(retained.provenance.quick_minimization_application).toMatchObject({ revision: p.revision + 1 });
  await page.getByRole("button", { name: /Undo: Quick minimize selection/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(before);
  await page.getByRole("button", { name: /Redo: Quick minimize selection/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(after);
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  expect(await structures(request, p)).toEqual(after);
  expect(applications).toBe(1);
});

for (const committed of [false, true]) test(`retains ${committed ? "committed" : "unconfirmed"} recovery across close, project switch and reload and retries explicitly once`, async ({ page, request }, info) => {
  test.setTimeout(150000);
  const other = await (await request.post("/api/v1/projects", { data: { name: `Other recovery ${Date.now()}` } })).json() as Project;
  const p = await prepared(page, request, info.project.name === "mobile-chromium", `Pending quick ${committed}`);
  const before = await structures(request, p);
  let applications = 0, faulted = false, blockJobReads = true;
  const attempts: unknown[] = [];
  await page.route("**/api/v1/jobs/*", async route => {
    if (faulted && blockJobReads && route.request().method() === "GET") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Injected recovery read failure" }) });
    } else await route.continue();
  });
  await page.route("**/quick-minimizations/*/apply", async route => {
    applications++; attempts.push(route.request().postDataJSON() as unknown);
    if (applications === 1) {
      if (committed) expect((await route.fetch()).status()).toBe(200);
      faulted = true;
      await route.abort("failed");
    } else {
      const response = await route.fetch();
      expect(response.status()).toBe(committed ? 409 : 200);
      blockJobReads = false;
      await route.fulfill({ response });
    }
  });
  await start(page);
  await expect(page.locator(".notice.error")).toContainText("Open minimization to check", { timeout: 30000 });
  expect((await current(request, p.id)).revision).toBe(p.revision + (committed ? 1 : 0));
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Save checkpoint", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await expect(recovery(page)).toContainText("Couldn’t confirm whether coordinates were applied");
  await expect(recovery(page).getByRole("button", { name: "Retry application", exact: true })).toBeEnabled();
  await panel(page).getByRole("button", { name: "Close minimization", exact: true }).click();
  await openProject(page, other.name);
  await expect(page.locator(".project-switcher-label")).toHaveText(other.name);
  await openProject(page, p.name);
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30000 });
  await expect(page.locator(".notice.error")).toContainText("Open minimization to check");
  await expect(panel(page)).toBeHidden();
  expect(applications).toBe(1);
  await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await recovery(page).getByRole("button", { name: "Refresh result", exact: true }).click();
  await expect(recovery(page).getByRole("button", { name: "Retry application", exact: true })).toBeEnabled();
  expect(applications).toBe(1);
  await recovery(page).getByRole("button", { name: "Retry application", exact: true }).click();
  await expect(recovery(page)).toContainText("Quick coordinates applied", { timeout: 30000 });
  expect(applications).toBe(2);
  expect(attempts[1]).toEqual(attempts[0]);
  const after = await current(request, p.id);
  expect(after.revision).toBe(p.revision + 1);
  expect(after.history.retained_commands).toBe(p.history.retained_commands + 1);
  await panel(page).getByRole("button", { name: "Close minimization", exact: true }).click();
  await page.getByRole("button", { name: /Undo: Quick minimize selection/ }).click();
  await expect.poll(() => structures(request, p)).toEqual(before);
});

test("keeps a journal-write failure unapplied and recovers a manually inspected quick result through the same controller", async ({ page, request }, info) => {
  test.setTimeout(150000);
  await page.addInitScript(() => {
    const nativeSet = Storage.prototype.setItem;
    (window as unknown as { rejectPublicationJournal: boolean }).rejectPublicationJournal = true;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("neistra.quick-publication.v1.") && (window as unknown as { rejectPublicationJournal: boolean }).rejectPublicationJournal) throw new Error("Injected journal write failure");
      nativeSet.call(this, key, value);
    };
  });
  const p = await prepared(page, request, info.project.name === "mobile-chromium", "Publication journal failure");
  const before = await structures(request, p);
  let applications = 0;
  await page.route("**/quick-minimizations/*/apply", async route => {
    applications++;
    expect((await route.fetch()).status()).toBe(200);
    await route.abort("failed");
  });
  const job = await start(page);
  await expect(page.locator(".notice.error")).toContainText("Could not save minimization recovery information", { timeout: 30000 });
  expect(applications).toBe(0);
  expect((await current(request, p.id)).revision).toBe(p.revision);
  expect(await structures(request, p)).toEqual(before);
  const proposal = await (await request.get(`/api/v1/projects/${p.id}/quick-minimizations/${job.id}/proposal`)).json() as QuickMinimizationProposal;
  expect(proposal.applicable).toBe(true);
  await page.evaluate(() => { (window as unknown as { rejectPublicationJournal: boolean }).rejectPublicationJournal = false; });
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs", exact: true }).click();
  await page.getByRole("button", { name: "Inspect minimization", exact: true }).click();
  await panel(page).getByRole("button", { name: "Apply quick coordinates", exact: true }).click();
  await expect(page.getByRole("button", { name: /Undo: Quick minimize selection/ })).toBeEnabled({ timeout: 30000 });
  expect(applications).toBe(1);
  const updated = await current(request, p.id);
  expect(updated.revision).toBe(p.revision + 1);
  expect(updated.history.retained_commands).toBe(p.history.retained_commands + 1);
});

test("refreshes a recorded application without claiming it remains applied after another client undoes it", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const p = await prepared(page, request, info.project.name === "mobile-chromium", "Recorded quick Undo");
  const before = await structures(request, p);
  let applications = 0;
  await page.route("**/quick-minimizations/*/apply", async route => {
    applications++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const applied = await response.json() as Project;
    const undone = await request.post(`/api/v1/projects/${p.id}/history/undo`, { data: { expected_revision: applied.revision } });
    expect(undone.status()).toBe(200);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await panel(page).getByRole("button", { name: "Run quick minimization", exact: true }).click();
  await expect(recovery(page)).toContainText("recorded previously", { timeout: 30000 });
  expect(await recovery(page).innerText()).not.toContain("Quick coordinates applied");
  expect((await current(request, p.id)).revision).toBe(p.revision + 2);
  expect(await structures(request, p)).toEqual(before);
  expect(applications).toBe(1);
  await expect(page.getByRole("button", { name: /Redo: Quick minimize selection/ })).toBeEnabled();
});
