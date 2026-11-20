import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, loadavg, platform, release as osRelease, totalmem } from "node:os";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { Entry, Project } from "../../apps/web/src/api/types";
import type { PropertyAggregate, PropertyPreferences } from "../../apps/web/src/ligandProperties/types";
import type { ProfileRegistry } from "../../apps/web/src/ligandProfiles/types";
import { performanceBudget } from "./support/performance";
import { arm, assertReport, cacheBasis, check, classifyFirstSelection, coldRequirement, COMPOSITE_DESCRIPTORS, consumerState, digest, distribution, durations, evidence,
  expectedCriteria, fixture, fixtureSizes, installObservation, matchingReady, observedReady, observer, preflight, PROFILE_DESCRIPTORS, publishedContext,
  requestCounts, sameSource, source, sourceIdentities, sourceMap, store,
  type WorkerObservation } from "./support/profile-performance";

const preferencePath = "/api/v1/workspace/ligand-property-preferences";
const region = (page: Page) => page.getByRole("region", { name: "Properties", exact: true });
const choice = (page: Page) => region(page).getByRole("combobox", { name: "Profile", exact: true });
const propertyPath = (project: Project) => `/api/v1/projects/${project.id}/ligand-properties`;
const endpoint = (project: Project) => `/api/v1/projects/${project.id}`;

async function preferences(request: APIRequestContext) {
  const response = await request.get(preferencePath); expect(response.ok()).toBe(true);
  return await response.json() as PropertyPreferences;
}
async function imported(request: APIRequestContext, specimen: Awaited<ReturnType<typeof fixture>>) {
  const created = await request.post("/api/v1/projects", { data: { name: `Profile measurement ${specimen.id} ${randomUUID()}` } });
  expect(created.ok()).toBe(true); const project = await created.json() as Project;
  const form = new FormData(); form.set("expected_revision", String(project.revision)); form.set("generate_3d", "false");
  form.append("files", new Blob([new Uint8Array(specimen.data)], { type: "chemical/x-mdl-sdfile" }), specimen.filename);
  const response = await request.post(`${endpoint(project)}/imports`, { multipart: form }); expect(response.ok()).toBe(true);
  const result = (await response.json() as { project: Project }).project;
  expect(result.entries).toHaveLength(1); return result;
}
async function inspect(page: Page, entry: Entry) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await page.evaluate(() => innerWidth <= 840) && !await drawer.isVisible()) await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("region", { name: "Ligand of interest", exact: true }).getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
}
async function closeInspector(page: Page) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await drawer.isVisible()) { await drawer.focus(); await page.keyboard.press("Escape"); await expect(drawer).toBeHidden(); }
}
async function open(page: Page, project: Project) {
  await page.goto("/"); await page.getByRole("button", { name: "Projects", exact: true }).click();
  const escaped = project.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${escaped}(?:\\s|$)`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await inspect(page, project.entries[0]);
}
async function showCriteria(page: Page) {
  const details = region(page).locator(".ligand-profile-details");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await region(page).locator(".ligand-profile-criteria").scrollIntoViewIfNeeded();
}
async function selectProfile(page: Page, id: string) {
  const select = choice(page);
  const index = await select.evaluate((node, id) => [...(node as HTMLSelectElement).options].findIndex(option => option.value === id), id);
  expect(index).toBeGreaterThanOrEqual(0);
  // Native popup navigation commits one trusted change, without intermediate
  // profile demands. selectOption dispatches an untrusted synthetic change.
  await select.focus(); await select.press("Space"); await select.press("Home");
  for (let step = 0; step < index; step++) await select.press("ArrowDown");
  await select.press("Enter"); await expect(select).toHaveValue(id);
}
async function read(request: APIRequestContext, project: Project, entry: Entry, ids: readonly string[]) {
  const response = await request.post(`${propertyPath(project)}/read`, { data: { entries: [source(entry)], descriptor_ids: ids } });
  expect(response.ok()).toBe(true); const result = await response.json() as PropertyAggregate;
  expect(result.project_id).toBe(project.id); expect(result.entries).toHaveLength(1);
  expect(result.entries[0].source).toEqual(source(entry)); return result;
}
async function readyRows(page: Page, rows: ReturnType<typeof expectedCriteria>) {
  await expect.poll(() => page.evaluate(() => window.profilePerformance.readSnapshot().rows), { timeout: 30_000 }).toEqual(rows);
  await expect(region(page).locator(".ligand-profile-status")).toContainText(/Within profile criteria\.|Outside profile criteria\./);
  await expect.poll(() => page.evaluate(() => window.profilePerformance.sample?.currentAt !== undefined)).toBe(true);
}
function jobs(observation: WorkerObservation, project: Project) {
  return Object.values(observation.jobs).filter(job => job.project_id === project.id).map(job => job.id).sort();
}
function bounded(observation: WorkerObservation) {
  expect(observation.max_running_property_jobs).toBeLessThanOrEqual(1);
  expect(observation.retained.content_bytes).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(observation.retained.ligand_property_content).toBeLessThanOrEqual(2048);
  expect(observation.retained.ligand_property_proofs).toBeLessThanOrEqual(4096);
  expect(observation.retained.ligand_property_executions).toBeLessThanOrEqual(33);
  expect(observation.retained.ligand_property_consumers).toBeLessThanOrEqual(256);
}

test("measures first profile selection, warm shared dependencies, source reevaluation and metadata recovery", async ({ browser, request }, info) => {
  test.setTimeout(600_000);
  const runId = randomUUID(), mobile = info.project.name === "mobile-chromium";
  const directory = resolve(".issue-11-evidence/issue160-profile-performance", `${info.project.name}-${runId}`);
  await mkdir(directory, { recursive: true });
  const identity = sourceIdentities(), initialSources = await sourceMap(identity.paths);
  const originalPreferences = await preferences(request);
  const hiddenResponse = await request.put(preferencePath, { data: { expected_revision: originalPreferences.revision, enabled_categories: [] } });
  expect(hiddenResponse.ok()).toBe(true); const hiddenPreferences = await hiddenResponse.json() as PropertyPreferences;
  const registryResponse = await request.get("/api/v1/ligand-profiles/registry"); expect(registryResponse.ok()).toBe(true);
  const registry = await registryResponse.json() as ProfileRegistry;
  const rawRegistry = JSON.stringify(registry); await writeFile(resolve(directory, "registry.json"), rawRegistry);
  const worker = observer(directory);
  const records: Record<string, unknown>[] = [], browserFiles: { path: string; sha256: string }[] = [];
  const ownedProjectIds: string[] = [];
  const failures: string[] = [], cleanup: Record<string, unknown> = { contexts: [], preferences_restored: false };
  const requireCold = coldRequirement(process.env.NEISTRA_PROFILE_REQUIRE_COLD);
  const cold: number[] = [], warm: number[] = [], cacheReadyFirst: number[] = [], partialFirst: number[] = [];
  const environment = { node: process.version, platform: platform(), release: osRelease(), cpu: cpus()[0]?.model ?? null,
    logical_cpus: cpus().length, total_memory_bytes: totalmem(), load_before: loadavg(), browser: browser.version(),
    project: info.project.name, viewport: mobile ? { width: 320, height: 700 } : info.project.use.viewport,
    host_policy: "Portable measurements; absolute latency enforced only by existing performanceBudget opt-in" };
  const contextOptions = { baseURL: info.project.use.baseURL, userAgent: info.project.use.userAgent,
    viewport: mobile ? { width: 320, height: 700 } : info.project.use.viewport,
    deviceScaleFactor: info.project.use.deviceScaleFactor, isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch, colorScheme: info.project.use.colorScheme };
  let observation: WorkerObservation | undefined;
  let firstFailure: Error | undefined;
  const closeContext = async (page: Page, context: BrowserContext, label: string, path: string) => {
    try {
      let captured: unknown;
      try { captured = await evidence(page); }
      catch (error) { failures.push(String(error)); captured = { unavailable_reason: String(error) }; }
      const body = JSON.stringify(captured, null, 2);
      await writeFile(resolve(directory, path), body); browserFiles.push({ path, sha256: digest(body) });
    } finally {
      await context.close(); (cleanup.contexts as string[]).push(label);
    }
  };
  const sampleBoundary = async () => {
    const previous = await worker.read();
    await expect.poll(async () => (await worker.read())?.samples ?? 0).toBeGreaterThan(previous?.samples ?? 0);
    const current = await worker.read(); check(current, "Worker observer has not published"); bounded(current); return current;
  };
  try {
    for (const size of fixtureSizes) {
      const specimen = await fixture(info.project.name, size), project = await imported(request, specimen), entry = project.entries[0];
      ownedProjectIds.push(project.id);
      const qualified = await preflight(project, specimen, directory);
      const before = qualified.result.before_report, after = qualified.result.after_report;
      const original = await (await request.get(`${endpoint(project)}/entries/${entry.id}/original`)).body(); expect(digest(original)).toBe(specimen.sha256);
      // These options retain the configured desktop/mobile device and rendering flags.
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage(); await installObservation(page);
      try {
        await open(page, project);
        await expect(choice(page)).toHaveValue(""); await expect(choice(page).locator('option[value="ro5"]')).toHaveCount(1);
        expect(requestCounts((await evidence(page)).requests).demands).toBe(0);
        expect(requestCounts((await evidence(page)).requests).allocations).toBe(0);
        expect(await region(page).locator(".ligand-properties-groups dt").count()).toBe(0);
        const baselineRead = await read(request, project, entry, PROFILE_DESCRIPTORS);
        const baseline = cacheBasis(baselineRead, source(entry), PROFILE_DESCRIPTORS);
        const firstClass = classifyFirstSelection(baseline, requireCold);
        const initialJobs = jobs(await sampleBoundary(), project), start = (await evidence(page)).requests.length;
        const rows = expectedCriteria(registry, "ro5", before);
        await arm(page, choice(page), `first-${size}`, "ro5", rows); await selectProfile(page, "ro5");
        await readyRows(page, rows);
        await expect.poll(async () => matchingReady((await evidence(page)).requests.slice(start), source(entry), before, PROFILE_DESCRIPTORS, qualified.context.before_report) !== null).toBe(true);
        const firstEvidence = await evidence(page), first = firstEvidence.samples.at(-1)!;
        const proof = matchingReady(firstEvidence.requests.slice(start), source(entry), before, PROFILE_DESCRIPTORS, qualified.context.before_report)!;
        const times = durations(first); check(times.current_criteria_ms !== null && times.feedback_ms !== null, "First-selection measurements unavailable");
        performanceBudget(times.feedback_ms, 100, "profile first selection feedback ms", true);
        if (firstClass === "numerical-cold-missing") {
          cold.push(times.current_criteria_ms);
          performanceBudget(times.current_criteria_ms, 2000, "profile cold first selection to current criteria ms", true);
        } else if (firstClass === "shared-cache-ready") {
          cacheReadyFirst.push(times.current_criteria_ms);
          performanceBudget(times.current_criteria_ms, 100, "profile cache-ready first selection to current criteria ms", true);
        } else partialFirst.push(times.current_criteria_ms);
        const settledJobs = jobs(await sampleBoundary(), project), newJobs = settledJobs.filter(id => !initialJobs.includes(id));
        expect(newJobs.length).toBeLessThanOrEqual(1);
        const firstCounts = requestCounts(firstEvidence.requests.slice(start)); expect(firstCounts.allocations).toBeLessThanOrEqual(1);
        if (firstClass === "shared-cache-ready") { expect(newJobs).toHaveLength(0); expect(firstCounts.allocations).toBe(0); expect(firstCounts.demands).toBe(0); }
        if (requireCold) { expect(newJobs).toHaveLength(1); expect(firstCounts.allocations).toBe(1); }
        const firstDemands = firstEvidence.requests.slice(start).filter(r => r.method === "PUT");
        if (requireCold) expect(firstDemands.length).toBeGreaterThan(0);
        expect(firstDemands.every(r => JSON.stringify((r.body as { descriptor_ids: string[] }).descriptor_ids) === JSON.stringify(PROFILE_DESCRIPTORS))).toBe(true);
        records.push({ phase: "first-selection", specimen: { id: specimen.id, sha256: specimen.sha256, manifest_sha256: specimen.manifest_sha256,
          heavy_atoms: size, geometry: "Frozen idealized unoptimized SDF; no runtime embedding" },
          project_id: project.id, source: source(entry), original_artifact_id: entry.original_artifact_id,
          cache: baseline, cache_read: baselineRead, cache_classification: firstClass,
          context: "Fresh browser context, not a cache classification", sample: first, durations: times,
          proof, profile_id: "ro5", profile_version: registry.profiles.find(p => p.id === "ro5")!.definition_version,
          request_delta: requestCounts(firstEvidence.requests.slice(start)), new_jobs: newJobs,
          preflight: { directory: qualified.directory, result_sha256: qualified.result_sha256, source_sha256: qualified.result.source_sha256 } });
        await showCriteria(page);
        for (const [index, profileId] of ["ro3", "ro5", "ro3", "ro5"].entries()) {
          const beforeRequests = (await evidence(page)).requests.length, beforeJobs = jobs(await sampleBoundary(), project);
          const expected = expectedCriteria(registry, profileId, before);
          await arm(page, choice(page), `warm-${size}-${index}`, profileId, expected); await selectProfile(page, profileId);
          await readyRows(page, expected);
          const observed = await evidence(page), timing = durations(observed.samples.at(-1)!);
          check(timing.current_criteria_ms !== null && timing.feedback_ms !== null, "Warm measurements unavailable");
          warm.push(timing.current_criteria_ms);
          performanceBudget(timing.feedback_ms, 100, "profile warm selection feedback ms", true);
          performanceBudget(timing.current_criteria_ms, 100, "profile warm selection to current criteria ms", true);
          const deltas = requestCounts(observed.requests.slice(beforeRequests)), afterJobs = jobs(await sampleBoundary(), project);
          expect(deltas.allocations).toBe(0); expect(deltas.demands).toBe(0); expect(deltas.metadata).toBe(0); expect(afterJobs).toEqual(beforeJobs);
          records.push({ phase: "warm-switch", specimen_id: specimen.id, project_id: project.id, source: source(entry), profile_id: profileId,
            profile_version: registry.profiles.find(p => p.id === profileId)!.definition_version, input_hash: proof.input_hash,
            cache: "App-owned current matching four-descriptor binding", sample: observed.samples.at(-1), durations: timing,
            descriptor_ids: PROFILE_DESCRIPTORS, request_delta: deltas, new_jobs: [] });
        }
        if (size === fixtureSizes.at(-1)) {
          const beforeExpansion = (await evidence(page)).requests.length, expansionJobs = jobs(await sampleBoundary(), project);
          const expansionRead = await read(request, project, entry, COMPOSITE_DESCRIPTORS);
          const expansionCache = cacheBasis(expansionRead, source(entry), COMPOSITE_DESCRIPTORS);
          const expected = expectedCriteria(registry, "ro5-veber", before);
          await arm(page, choice(page), "composite-expansion", "ro5-veber", expected); await selectProfile(page, "ro5-veber");
          await readyRows(page, expected);
          const expanded = await evidence(page), requests = expanded.requests.slice(beforeExpansion);
          const expansionTiming = durations(expanded.samples.at(-1)!);
          check(expansionTiming.feedback_ms !== null && expansionTiming.current_criteria_ms !== null, "Expansion measurements unavailable");
          performanceBudget(expansionTiming.feedback_ms, 100, "profile composite expansion feedback ms", true);
          performanceBudget(expansionTiming.current_criteria_ms, expansionCache.numerical_cache === "matching-ready" ? 100 : 2000,
            "profile composite expansion to current criteria ms", true);
          const demands = requests.filter(r => r.method === "PUT").map(r => r.body as { descriptor_ids: string[] });
          expect(demands.length).toBeGreaterThan(0); expect(demands.every(d => JSON.stringify(d.descriptor_ids) === JSON.stringify(COMPOSITE_DESCRIPTORS))).toBe(true);
          const current = (await read(request, project, entry, COMPOSITE_DESCRIPTORS)).entries[0]; assertReport(current.report!, before, COMPOSITE_DESCRIPTORS, qualified.context.before_report);
          const afterJobs = jobs(await sampleBoundary(), project), newJobs = afterJobs.filter(id => !expansionJobs.includes(id));
          expect(newJobs.length).toBeLessThanOrEqual(1); expect(requestCounts(requests).allocations).toBe(0);
          records.push({ phase: "composite-expansion", source: source(entry), descriptor_ids: COMPOSITE_DESCRIPTORS,
            added_descriptor_ids: ["tpsa", "rotatable_bond_count"], cache_before: expansionCache, cache_read: expansionRead, profile_id: "ro5-veber",
            sample: expanded.samples.at(-1), durations: expansionTiming, request_delta: requestCounts(requests), new_jobs: newJobs });
          for (const profileId of ["cns-mpo", ""]) {
            const requestStart = (await evidence(page)).requests.length, previousJobs = jobs(await sampleBoundary(), project);
            const completion = profileId ? registry.profiles.find(p => p.id === profileId)!.unavailable_reason! : "No profile selected.";
            await arm(page, choice(page), profileId ? "unavailable-preset" : "clear", profileId, [], "change", completion); await selectProfile(page, profileId);
            await expect(region(page).locator(".ligand-profile-criteria > div")).toHaveCount(0);
            await expect(region(page).locator(".ligand-profile-status")).toContainText(profileId ? registry.profiles.find(p => p.id === profileId)!.unavailable_reason! : "No profile selected.");
            const observed = await evidence(page), deltas = requestCounts(observed.requests.slice(requestStart));
            expect(deltas.allocations).toBe(0); expect(deltas.demands).toBe(0); expect(jobs(await sampleBoundary(), project)).toEqual(previousJobs);
            records.push({ phase: profileId ? "unavailable-preset" : "clear", profile_id: profileId, source: source(entry),
              sample: observed.samples.at(-1), durations: durations(observed.samples.at(-1)!), request_delta: deltas, new_jobs: [] });
          }
          await choice(page).selectOption("ro5");
          await expect.poll(() => page.evaluate(() => window.profilePerformance.readSnapshot().rows)).toEqual(rows);
          await showCriteria(page);
          let currentProject = project;
          let editedCanonicalSha256: string | undefined;
          for (const action of ["edit", "undo", "redo"] as const) {
            let button: Locator;
            if (action === "edit") {
              await page.getByRole("tab", { name: "selection", exact: true }).click();
              await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
              await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:1`);
              await page.getByRole("button", { name: "Apply query", exact: true }).click(); await closeInspector(page);
              await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
              button = page.getByRole("dialog", { name: "Edit molecule", exact: true }).getByRole("button", { name: "Replace selected atom with N", exact: true });
            } else { await closeInspector(page); button = page.getByRole("button", { name: action === "undo" ? /^Undo:/ : /^Redo:/ }); }
            await expect(button).toBeEnabled({ timeout: 30_000 });
            const expectedReport = action === "undo" ? before : after, expectedRows = expectedCriteria(registry, "ro5", expectedReport);
            const requestStart = (await evidence(page)).requests.length, previousJobs = jobs(await sampleBoundary(), project);
            await arm(page, button, action, "ro5", expectedRows, "click");
            const accepted = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(action === "edit" ? `/entries/${entry.id}/model-edits` : `/history/${action}`));
            await button.click(); const ack = await accepted; expect(ack.ok()).toBe(true);
            const decoded = await ack.json() as { project?: Project } & Project;
            currentProject = decoded.project ?? decoded; expect(currentProject.id).toBe(project.id);
            const currentEntry = currentProject.entries.find(e => e.id === entry.id)!;
            // Wait for the automatic exact-source App result before opening a hidden presenter.
            await expect.poll(async () => observedReady((await evidence(page)).requests.slice(requestStart), source(currentEntry)) !== null,
              { timeout: 30_000 }).toBe(true);
            const automatic = await evidence(page);
            // The browser's observed READY timestamp closes the latency sample.
            // Scientific source-context verification runs afterwards and cannot
            // certify itself from the API report's hash or numbers.
            const contextual = await publishedContext(currentProject, currentEntry, qualified, action === "undo" ? "before" : "after",
              directory, action, action === "redo" ? editedCanonicalSha256 : undefined);
            if (action === "edit") editedCanonicalSha256 = contextual.result.source_sha256;
            const proof = matchingReady(automatic.requests.slice(requestStart), source(currentEntry), expectedReport, PROFILE_DESCRIPTORS, contextual.result.report)!;
            const presentationOpenedAt = await page.evaluate(() => performance.now());
            if (action === "edit") await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
            await inspect(page, currentEntry); await readyRows(page, expectedRows); await showCriteria(page);
            const observed = await evidence(page), sample = observed.samples.at(-1)!;
            const command = observed.requests.slice(requestStart).find(r => r.path.endsWith(action === "edit" ? "/model-edits" : `/history/${action}`));
            const times = durations(sample, command?.responseAt), currentMs = proof.observed_at - sample.startedAt!;
            if (times.feedback_ms !== null) performanceBudget(times.feedback_ms, 100, `profile ${action} feedback ms`, true);
            performanceBudget(currentMs, 2000, `profile ${action} to automatic current App values ms`, true);
            if (times.retirement_ms !== null) performanceBudget(times.retirement_ms, 100, `profile ${action} old criteria retirement ms`, true);
            const verified = (await read(request, currentProject, currentEntry, PROFILE_DESCRIPTORS)).entries[0]; assertReport(verified.report!, expectedReport, PROFILE_DESCRIPTORS, contextual.result.report);
            const newJobs = jobs(await sampleBoundary(), project).filter(id => !previousJobs.includes(id)); expect(newJobs.length).toBeLessThanOrEqual(1);
            const requests = observed.requests.slice(requestStart), currentRequests = requests.filter(r => (r.body as { entries?: { source_artifact_id: string }[] } | null)?.entries?.some(s => s.source_artifact_id === currentEntry.current_artifact_id));
            expect(currentRequests.length).toBeGreaterThan(0);
            expect(currentRequests.every(r => !r.snapshot?.rows.some(row => row.value !== "Value: Unavailable") || JSON.stringify(r.snapshot.rows) === JSON.stringify(expectedRows))).toBe(true);
            records.push({ phase: action, source: source(currentEntry), profile_id: "ro5", independent_report: expectedReport, published_context: contextual, proof,
              sample, durations: times, automatic_current_ms: currentMs, presentation_opened_at: presentationOpenedAt,
              presentation_delay_after_app_ready_ms: presentationOpenedAt - proof.observed_at,
              request_delta: requestCounts(requests), new_jobs: newJobs, source_qualified_current: verified });
          }
          expect(await (await request.get(`${endpoint(project)}/entries/${entry.id}/original`)).body()).toEqual(original);
        }
        expect(await preferences(request)).toEqual(hiddenPreferences);
      } finally {
        await closeContext(page, context, specimen.id, `${specimen.id}-browser.json`);
      }
    }
    // Metadata failure is a separate fresh context; its second response is genuine,
    // fetched before the edit and held only at HTTP delivery.
    const specimen = await fixture(info.project.name, fixtureSizes[0]), project = await imported(request, specimen), entry = project.entries[0];
    ownedProjectIds.push(project.id);
    await mkdir(resolve(directory, "metadata"));
    const qualified = await preflight(project, specimen, resolve(directory, "metadata"));
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage(); await installObservation(page);
    let release!: () => void, capture!: () => void, attempts = 0, holdStartedAt: number | null = null;
    const held = new Promise<void>(done => { release = done; }), captured = new Promise<void>(done => { capture = done; });
    await page.route(url => url.pathname === "/api/v1/ligand-profiles/registry", async route => {
      attempts++;
      if (attempts === 1) { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Injected metadata outage" }) }); return; }
      expect(attempts).toBe(2); const response = await route.fetch(); expect(response.ok()).toBe(true);
      expect(await response.json()).toEqual(registry); holdStartedAt = await page.evaluate(() => performance.now()); capture(); await held; await route.fulfill({ response });
    });
    try {
      await open(page, project); await expect(region(page).getByRole("button", { name: "Retry profiles", exact: true })).toBeVisible();
      const beforeRetry = await evidence(page), jobsBefore = jobs(await sampleBoundary(), project);
      expect(requestCounts(beforeRetry.requests).metadata).toBe(1); expect(requestCounts(beforeRetry.requests).demands).toBe(0);
      const retry = region(page).getByRole("button", { name: "Retry profiles", exact: true });
      await arm(page, retry, "metadata-retry", "", [], "click"); await retry.click(); await captured;
      await page.getByRole("tab", { name: "selection", exact: true }).click();
      await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
      await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:1`); await page.getByRole("button", { name: "Apply query", exact: true }).click();
      await closeInspector(page); await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
      const edit = page.getByRole("dialog", { name: "Edit molecule", exact: true }).getByRole("button", { name: "Replace selected atom with N", exact: true });
      await expect(edit).toBeEnabled({ timeout: 30_000 });
      const accepted = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(`/entries/${entry.id}/model-edits`));
      await edit.click(); const ack = await accepted; expect(ack.ok()).toBe(true); const changed = (await ack.json() as { project: Project }).project;
      const currentEntry = changed.entries.find(e => e.id === entry.id)!; expect(sameSource(source(currentEntry), source(entry))).toBe(false);
      await page.getByRole("button", { name: "Close molecular editor", exact: true }).click(); await inspect(page, currentEntry);
      expect(await region(page).locator(".ligand-profile-criteria > div").count()).toBe(0);
      const beforeRelease = await evidence(page); expect(requestCounts(beforeRelease.requests).demands).toBe(0);
      expect(jobs(await sampleBoundary(), project)).toEqual(jobsBefore);
      const releasedAt = await page.evaluate(() => performance.now()); release();
      await expect(choice(page).locator('option[value="ro5"]')).toHaveCount(1); await expect(choice(page)).toHaveValue("");
      const recoveredAt = await page.evaluate(() => performance.now());
      const rows = expectedCriteria(registry, "ro5", qualified.result.after_report);
      await arm(page, choice(page), "metadata-recovered-selection", "ro5", rows); await selectProfile(page, "ro5"); await readyRows(page, rows); await showCriteria(page);
      const contextual = await publishedContext(changed, currentEntry, qualified, "after", directory, "metadata-edit");
      const verified = (await read(request, changed, currentEntry, PROFILE_DESCRIPTORS)).entries[0]; assertReport(verified.report!, qualified.result.after_report, PROFILE_DESCRIPTORS, contextual.result.report);
      const observed = await evidence(page); expect(attempts).toBe(2); expect(requestCounts(observed.requests).metadata).toBe(2);
      const staleRows = expectedCriteria(registry, "ro5", qualified.result.before_report);
      expect(observed.snapshots.filter(s => s.at >= releasedAt).some(s => JSON.stringify(s.snapshot.rows) === JSON.stringify(staleRows))).toBe(false);
      expect(observed.samples.at(-1)!.expectedRows).not.toEqual(expectedCriteria(registry, "ro5", qualified.result.before_report));
      const retrySample = observed.samples.find(s => s.label === "metadata-retry")!;
      const retryTiming = durations(retrySample);
      if (retryTiming.feedback_ms !== null) performanceBudget(retryTiming.feedback_ms, 100, "profile explicit metadata Retry feedback ms", true);
      const failedMetadata = observed.requests.find(r => r.path === "/api/v1/ligand-profiles/registry" && r.status === 503)!;
      check(holdStartedAt !== null && releasedAt >= holdStartedAt, "Actual injected hold boundary is required");
      records.push({ phase: "metadata-recovery", attempts, source_before: source(entry), source: source(currentEntry),
        sample: retrySample, retry_durations: retryTiming, first_metadata_failure_ms: failedMetadata.responseAt! - failedMetadata.at,
        recovery_total_ms: recoveredAt - retrySample.startedAt!, injected_hold_ms: releasedAt - holdStartedAt,
        recovery_excluding_injected_hold_ms: recoveredAt - retrySample.startedAt! - (releasedAt - holdStartedAt),
        phase_boundaries: { held_at: holdStartedAt, released_at: releasedAt, recovered_at: recoveredAt },
        recovered_selection_sample: observed.samples.at(-1), recovered_selection_durations: durations(observed.samples.at(-1)!),
        request_delta: requestCounts(observed.requests.slice(beforeRetry.requests.length)), source_qualified_current: verified, published_context: contextual,
        no_old_criteria_resurrection: observed.samples.at(-1)!.expectedRows });
      expect(await preferences(request)).toEqual(hiddenPreferences);
      expect(digest(await (await request.get(`${endpoint(project)}/entries/${entry.id}/original`)).body())).toBe(specimen.sha256);
    } finally {
      release(); await closeContext(page, context, "metadata", "metadata-browser.json");
    }
    expect(cold.length + cacheReadyFirst.length + partialFirst.length).toBe(5);
    if (requireCold) expect(cold).toHaveLength(5);
    expect(warm).toHaveLength(20);
  } catch (error) { failures.push(String(error)); firstFailure = error instanceof Error ? error : new Error("Non-Error benchmark failure; see retained failures"); }
  finally {
    try {
      await expect.poll(async () => {
        const current = await worker.read(); return !!current && Object.values(current.jobs).filter(job => job.execution_id).every(job => job.reaped);
      }, { timeout: 15_000 }).toBe(true);
    } catch (error) { failures.push(String(error)); }
    try { cleanup.consumer_state = await consumerState(directory, ownedProjectIds); }
    catch (error) { failures.push(String(error)); }
    try {
      observation = await worker.finish(); cleanup.observer_closed = true; bounded(observation);
      expect(Object.values(observation.jobs).filter(job => job.execution_id).every(job => job.reaped)).toBe(true);
      cleanup.worker_reaped = true;
    } catch (error) { failures.push(String(error)); }
    try {
      const current = await preferences(request);
      const restored = await request.put(preferencePath, { data: { expected_revision: current.revision, enabled_categories: originalPreferences.enabled_categories } });
      expect(restored.ok()).toBe(true); expect((await restored.json() as PropertyPreferences).enabled_categories).toEqual(originalPreferences.enabled_categories);
      cleanup.preferences_restored = true;
    } catch (error) { failures.push(String(error)); }
    const finalIdentity = sourceIdentities(), finalSources = await sourceMap(finalIdentity.paths);
    const sourcesUnchanged = identity.candidate === finalIdentity.candidate && JSON.stringify(initialSources) === JSON.stringify(finalSources);
    if (!sourcesUnchanged) failures.push("Source changed during measurement; candidate qualification refused");
    await writeFile(resolve(directory, "source-map.json"), JSON.stringify({ initial_candidate: identity.candidate,
      final_candidate: finalIdentity.candidate, initial: initialSources, final: finalSources }, null, 2));
    const companions = [...browserFiles, { path: "registry.json", sha256: digest(rawRegistry) },
      { path: "source-map.json", sha256: digest(await readFile(resolve(directory, "source-map.json"))) }];
    if (observation) companions.push({ path: "worker-observation.json", sha256: digest(await readFile(worker.output)) });
    const output = { format: "profile-performance-v1", run_id: runId, candidate: identity.candidate, sources_unchanged: sourcesUnchanged,
      store: store(), environment: { ...environment, load_after: loadavg() }, registry_version: registry.registry_version,
      descriptor_method: registry.descriptor_method, require_cold: requireCold, records,
      summary: { cold: cold.length ? distribution(cold, 2000) : null,
        cold_unavailable_reason: cold.length ? null : "No genuinely missing-coverage first selections observed",
        cache_ready_first: cacheReadyFirst.length ? distribution(cacheReadyFirst, 100) : null,
        partial_first: { n: partialFirst.length, raw_ms: partialFirst, target: null,
          reason: "Partial or pending coverage is reported separately from cold and cache-ready samples" },
        warm: warm.length ? distribution(warm, 100) : null }, cleanup, failures, companions,
      targets: info.annotations.filter(a => a.type === "performance").map(a => JSON.parse(a.description!) as unknown),
      timing_definitions: { selection: "Trusted native change to actual current exact unrounded criterion DOM; visibility is recorded separately",
        edit: "Trusted command click to automatic App exact-source READY; deliberate presenter reopening is separate",
        request_counts: "Actual App fetches; explicit read-only setup/verification API requests are excluded",
        sampling: "Five first selections classified by actual cache basis and twenty warm switches per browser; focused REQUIRE_COLD=1 proves five numerical-cold samples; singleton/edit records remain separate" },
      measurement_gaps: { browser_gpu_peak_memory: "Unavailable; read-only observer supplies discrete worker/store samples only",
        simultaneous_peak_memory: "Unavailable; no simultaneous-memory claim", strict_host_certification: "Not inferred from portable run",
        inherited_bulk: "Unchanged property benchmarks independently qualify scheduler; one active profile evaluator adds no extra bulk campaign" } };
    await writeFile(resolve(directory, "profile-performance-v1.json"), JSON.stringify(output, null, 2));
    await info.attach("profile-performance-v1", { body: JSON.stringify(output, null, 2), contentType: "application/json" });
  }
  if (firstFailure) throw firstFailure;
  if (failures.length) throw new Error(failures.join("\n"));
});
