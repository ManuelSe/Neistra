import { expect, test } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import type { LigandCandidatesRead } from "../../apps/web/src/ligands/types";

function heldCandidate() {
  let capture!: (value: LigandCandidatesRead) => void, release!: () => void;
  const captured = new Promise<LigandCandidatesRead>(resolve => { capture = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { capture, release, captured, wait };
}

for (const theme of ["light", "dark"] as const) test(`withholds failed Use source facts until an actual matching recheck (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
  const created = await request.post("/api/v1/projects", { data: { name: `Ligand source recovery ${theme} ${Date.now()}` } });
  expect(created.ok()).toBe(true); const empty = await created.json() as Project;
  await page.goto("/"); await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${empty.name}`) }).click();
  await page.getByRole("button", { name: "Import structures", exact: true }).first().click();
  const importer = page.getByRole("dialog", { name: "Import structures", exact: true });
  await importer.locator('input[type="file"]').setInputFiles([{ name: "source-recovery.smi", mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCO ethanol\n") }]);
  await importer.getByRole("button", { name: "Import", exact: true }).click(); await expect(importer).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  const initial = await (await request.get(`/api/v1/projects/${empty.id}`)).json() as Project;
  const entry = initial.entries[0], base = `/api/v1/projects/${initial.id}`, entryPath = `${base}/entries/${entry.id}`;
  const read = async () => await (await request.get(base)).json() as Project;
  const before = await read();
  const original = await (await request.get(`${entryPath}/original`)).body();
  const normalized = await (await request.get(`/api/v1/artifacts/${entry.current_artifact_id}`)).body();
  const themeButton = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await themeButton.isVisible()) await themeButton.click();
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "Inspector", exact: true }).click();
  const controls = page.getByRole("region", { name: "Ligand of interest", exact: true });
  await controls.getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
  await controls.getByRole("button", { name: "Change", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
  const use = dialog.getByRole("button", { name: "Use ligand", exact: true });
  const facts = async () => {
    await expect(dialog.getByRole("radio")).toHaveCount(1);
    await expect(dialog.locator(".ligand-candidate-composition")).toHaveText("C2H6O");
    await expect(dialog.locator(".ligand-candidate-depiction img")).toHaveCount(1);
    await expect.poll(() => dialog.locator(".ligand-candidate-depiction img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  };
  await facts(); await dialog.getByRole("radio").check(); await expect(use).toBeEnabled();
  type Injected = { status: number; detail: { code: string; message: string; source_verification?: "original";
    source_identity?: { project_id: string; entry_id: string; current_artifact_id: string | null; original_artifact_id: string | null } } };
  let injected: Injected | null = null, putCalls = 0, candidateReads = 0, gate: ReturnType<typeof heldCandidate> | null = null;
  const releases: (() => void)[] = [], evidence: unknown[] = [];
  await page.route(url => url.pathname === `${entryPath}/ligand-designation`, async route => {
    if (route.request().method() !== "PUT") { await route.continue(); return; }
    const payload = route.request().postDataJSON() as { expected_revision: number; expected_artifact_id: string; candidate_key?: string };
    expect(payload.expected_revision).toBe(before.revision);
    expect(payload.expected_artifact_id).toBe(entry.current_artifact_id); expect(payload.candidate_key).toBeTruthy();
    putCalls++;
    if (injected) await route.fulfill({ status: injected.status, contentType: "application/json", body: JSON.stringify({ detail: injected.detail }) });
    else await route.continue();
  });
  await page.route(url => url.pathname === `${entryPath}/ligand-candidates`, async route => {
    candidateReads++;
    expect(new URL(route.request().url()).searchParams.get("expected_artifact_id")).toBe(entry.current_artifact_id);
    const current = gate;
    if (!current) { await route.continue(); return; }
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    const body = await response.json() as LigandCandidatesRead;
    expect(body.project_id).toBe(initial.id); expect(body.entry_id).toBe(entry.id); expect(body.artifact_id).toBe(entry.current_artifact_id);
    current.capture(body); await current.wait; await route.fulfill({ response });
  });
  try {
    // A stale candidate hash is a semantic rejection, not a physical-source failure.
    injected = { status: 409, detail: { code: "structure_artifact_conflict", message: "Controlled candidate inventory changed" } };
    await use.click(); await expect.poll(() => putCalls).toBe(1);
    await expect(use).toBeEnabled(); await facts(); expect(await read()).toEqual(before);
    const failures: Injected[] = [
      { status: 409, detail: { code: "artifact_integrity_error", message: "Controlled legacy Use input integrity failure" } },
      { status: 404, detail: { code: "artifact_not_found", message: "Controlled original input missing", source_verification: "original",
        source_identity: { project_id: initial.id, entry_id: entry.id, current_artifact_id: entry.current_artifact_id, original_artifact_id: entry.original_artifact_id } } },
    ];
    for (const failure of failures) {
      injected = failure; const expectedCalls = putCalls + 1, fresh = heldCandidate(); gate = fresh; releases.push(fresh.release);
      await use.click(); await expect.poll(() => putCalls).toBe(expectedCalls);
      await expect(controls.locator(".ligand-designation-notice").filter({ hasText: "Saving ligand choice…" })).toHaveCount(0);
      await expect(dialog.locator(".ligand-candidate-composition")).toHaveCount(0);
      await expect(dialog.locator(".ligand-candidate-depiction img")).toHaveCount(0); await expect(use).toBeDisabled();
      expect(await read()).toEqual(before);
      await info.attach(`source-withheld-${failure.detail.code}`, { contentType: "image/png", body: await page.screenshot() });
      injected = null; const readsBeforeRetry = candidateReads;
      await dialog.getByRole("button", { name: "Try again", exact: true }).click();
      const checked = await fresh.captured;
      await expect(dialog.locator(".ligand-candidate-composition")).toHaveCount(0); await expect(use).toBeDisabled();
      gate = null; fresh.release(); await facts();
      await dialog.getByRole("radio").check(); await expect(use).toBeEnabled();
      evidence.push({ injected: failure, readsBeforeRetry, readsAfter: candidateReads, actualFreshCheck: checked,
        projectUnchanged: true, input: "Controlled exact-source API faults, not actual file corruption" });
    }
    injected = null; await use.click(); await expect(dialog).toBeHidden();
    const saved = await read(); expect(saved.revision).toBe(before.revision + 1);
    expect(saved.entries[0].ligand_designation.origin).toBe("manual");
    expect(saved.entries[0].current_artifact_id).toBe(entry.current_artifact_id);
    expect(saved.entries[0].original_artifact_id).toBe(entry.original_artifact_id);
    expect(await (await request.get(`${entryPath}/original`)).body()).toEqual(original);
    expect(await (await request.get(`/api/v1/artifacts/${entry.current_artifact_id}`)).body()).toEqual(normalized);
    await info.attach("source-qualified-write-recovery", { contentType: "application/json", body: JSON.stringify({ evidence, saved,
      failedOperationsStoredNoHistory: true, semanticConflictPreservedFacts: true }) });
  } finally { releases.forEach(release => release()); await page.unrouteAll({ behavior: "wait" }); }
});
