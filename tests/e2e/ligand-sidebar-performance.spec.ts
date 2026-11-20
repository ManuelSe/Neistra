import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { cpus, loadavg, platform, totalmem } from "node:os";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { Entry, Project, SelectionEditResult } from "../../apps/web/src/api/types";
import type { PropertyAggregate, PropertyPreferences } from "../../apps/web/src/ligandProperties/types";
import type { ProfileRegistry } from "../../apps/web/src/ligandProfiles/types";
import { openInspectorTools, openLigandInformation } from "./support/navigation";
import { assertReport, arm, check, COMPOSITE_DESCRIPTORS, consumerState, digest, evidence, expectedCriteria, fixture, installObservation,
  observedReady, observer, preflight, PROFILE_DESCRIPTORS, publishedContext, source, sourceIdentities, sourceMap, store,
  type WorkerObservation } from "./support/profile-performance";
import { armPrimary, beginClosedInterval, closedIntervalProof, confirmPrimaryAbsent, comparisonMatches, comparisonOracle, currentDrawing, currentInventory, elapsedFrom, headerTrial,
  installPrimaryObservation, passiveTraffic, primaryEvidence, trafficCounts, type ComparisonOracle, type PrimarySnapshot } from "./support/ligand-information-performance";

const preferencePath = "/api/v1/workspace/ligand-property-preferences";
const primary = (page: Page) => page.getByRole("region", { name: "Ligand information", exact: true });
const entryChoice = (page: Page) => primary(page).getByRole("combobox", { name: "Entry", exact: true });
const profileChoice = (page: Page) => primary(page).getByRole("combobox", { name: "Profile", exact: true });
const endpoint = (project: Project) => `/api/v1/projects/${project.id}`;
async function preferences(request: APIRequestContext) {
  const response = await request.get(preferencePath); expect(response.ok()).toBe(true); return await response.json() as PropertyPreferences;
}
async function imported(request: APIRequestContext, specimen: Awaited<ReturnType<typeof fixture>>) {
  const created = await request.post("/api/v1/projects", { data: { name: `Primary measurement ${specimen.id} ${randomUUID()}` } });
  expect(created.status()).toBe(201); const project = await created.json() as Project;
  const form = new FormData(); form.set("expected_revision", String(project.revision)); form.set("generate_3d", "false");
  form.append("files", new Blob([new Uint8Array(specimen.data)], { type: "chemical/x-mdl-sdfile" }), specimen.filename);
  const response = await request.post(`${endpoint(project)}/imports`, { multipart: form }); expect(response.ok()).toBe(true);
  const result = (await response.json() as { project: Project }).project; expect(result.entries).toHaveLength(1); return result;
}
async function selectNative(control: Locator, value: string) {
  const index = await control.evaluate((node, wanted) => [...(node as HTMLSelectElement).options].findIndex(option => option.value === wanted), value);
  expect(index).toBeGreaterThanOrEqual(0); await control.focus(); await control.press("Space"); await control.press("Home");
  for (let step = 0; step < index; step++) await control.press("ArrowDown");
  await control.press("Enter"); await expect(control).toHaveValue(value);
}
async function openProject(page: Page, project: Project) {
  await page.goto("/"); await page.getByRole("button", { name: "Projects", exact: true }).click();
  const escaped = project.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${escaped}(?:\\s|$)`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
  await openLigandInformation(page); await expect(entryChoice(page)).toHaveValue("");
}
async function closePrimary(page: Page) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await drawer.isVisible()) {
    const header = drawer.getByRole("button", { name: "Inspector tools", exact: true });
    await header.focus(); await expect(header).toBeFocused(); await page.keyboard.press("Escape"); await expect(drawer).toBeHidden();
  } else await page.getByRole("button", { name: "Collapse inspector", exact: true }).click();
  await expect(primary(page)).not.toBeVisible();
}
async function reopenPrimary(page: Page, label: string) {
  const mobile = page.getByRole("button", { name: "Inspector", exact: true });
  const control = await mobile.isVisible() ? mobile : page.getByRole("button", { name: "Expand inspector", exact: true });
  await armPrimary(page, control, label, "click"); await control.click(); await openLigandInformation(page);
}
function jobs(observation: WorkerObservation, projectId: string) {
  return Object.values(observation.jobs).filter(job => job.project_id === projectId).map(job => job.id).sort();
}
function bounded(observation: WorkerObservation) {
  expect(observation.max_running_property_jobs).toBeLessThanOrEqual(1);
  for (const [key, limit] of Object.entries({ content_bytes: 16 * 1024 * 1024, ligand_property_content: 2048,
    ligand_property_proofs: 4096, ligand_property_executions: 33, ligand_property_consumers: 256 })) {
    expect(observation.retained[key], key).toBeLessThanOrEqual(limit);
  }
}
async function read(request: APIRequestContext, project: Project, entry: Entry, ids: readonly string[]) {
  const response = await request.post(`${endpoint(project)}/ligand-properties/read`, { data: { entries: [source(entry)], descriptor_ids: ids } });
  expect(response.ok()).toBe(true); const body = await response.json() as PropertyAggregate;
  expect(body.project_id).toBe(project.id); expect(body.entries).toHaveLength(1); expect(body.entries[0].source).toEqual(source(entry));
  return body.entries[0];
}
async function visibleComparison(page: Page, oracle: ComparisonOracle) {
  const comparison = primary(page).getByRole("region", { name: "Profile comparison", exact: true });
  await expect.poll(async () => comparisonMatches((await primaryEvidence(page)).snapshots.at(-1)!, oracle), { timeout: 30_000 }).toBe(true);
  const svg = comparison.getByRole("img", { name: "Current ligand profile comparison", exact: true });
  const deliberateSvgScrollAt = await page.evaluate(() => performance.now()); await svg.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await primaryEvidence(page)).snapshots.at(-1)?.svgVisible).toBe(true);
  const details = comparison.locator(".comparison-table"), summary = details.locator("summary");
  if (await details.getAttribute("open") !== null) await summary.click();
  const label = `table-${randomUUID()}`; await armPrimary(page, summary, label, "click"); await summary.click();
  await expect(comparison.getByRole("table")).toBeVisible();
  const first = comparison.locator("tbody tr").first(), last = comparison.locator("tbody tr").last();
  const bounds = async (control: Locator) => {
    await control.scrollIntoViewIfNeeded();
    return control.evaluate(node => { const b = node.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right,
      width: innerWidth, height: innerHeight, at: performance.now() }; });
  };
  const firstBounds = await bounds(first), lastBounds = await bounds(last);
  for (const value of [firstBounds, lastBounds]) {
    expect(value.top).toBeGreaterThanOrEqual(-1); expect(value.bottom).toBeLessThanOrEqual(value.height + 1);
    expect(value.left).toBeGreaterThanOrEqual(-1); expect(value.right).toBeLessThanOrEqual(value.width + 1);
  }
  const observed = await primaryEvidence(page), trigger = observed.triggers.find(t => t.label === label)!;
  const visibleTable = observed.snapshots.find(s => s.at >= trigger.at && s.tableVisible && comparisonMatches(s, oracle));
  expect(visibleTable).toBeDefined(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const frameObservation = await page.evaluate(() => new Promise<{ first: number; second: number }>(done => requestAnimationFrame(first => requestAnimationFrame(second => done({ first, second })))));
  return { deliberate_svg_scroll_at: deliberateSvgScrollAt, table_open: trigger, table_visible_ms: elapsedFrom(trigger, visibleTable),
    first_row_bounds: firstBounds, last_row_bounds: lastBounds, frame_observation: frameObservation,
    frame_limit: "Frame callbacks and DOM observations do not prove compositor presentation" };
}
async function readyPrimary(page: Page, traffic: ReturnType<typeof passiveTraffic>, project: Project, entry: Entry,
  header: { formula: string; charge: string }, label: string, oracle?: ComparisonOracle) {
  const matchesHeader = (s: PrimarySnapshot) => s.entry === entry.id && s.instance === entry.ligand_designation.instance_id
    && s.formula === header.formula && s.charge === header.charge && s.primaryVisible;
  await expect.poll(async () => matchesHeader((await primaryEvidence(page)).snapshots.at(-1)!), { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => { await traffic.settle(); return !!currentDrawing(traffic.records, entry.id, entry.current_artifact_id!); }, { timeout: 30_000 }).toBe(true);
  await traffic.settle(); const inventory = currentInventory(traffic.records, entry.id, entry.current_artifact_id!);
  const drawing = currentDrawing(traffic.records, entry.id, entry.current_artifact_id!)!;
  expect(inventory?.project_id).toBe(project.id); expect(inventory?.designation).toEqual(entry.ligand_designation);
  expect(inventory?.designated_candidate).toMatchObject({ atom_ids: entry.ligand_designation.atom_ids, chemistry_status: "qualified",
    formula: header.formula, formal_charge: 0 });
  expect(drawing.candidate_key).toBe(inventory!.designated_candidate!.candidate_key);
  expect(drawing.input_hash).toBe(inventory!.designated_candidate!.chemical_input_hash);
  expect(drawing.formula).toBe(header.formula); expect(drawing.formal_charge).toBe(0); expect(drawing.artifact).not.toBeNull();
  const imageUrl = new URL(drawing.artifact!.download_url, page.url()).href;
  await expect.poll(async () => { const s = (await primaryEvidence(page)).snapshots.at(-1)!;
    return matchesHeader(s) && s.image?.src === imageUrl && s.image.complete && s.image.width > 0; }, { timeout: 30_000 }).toBe(true);
  await traffic.settle(); const image = traffic.records.find(r => r.kind === "image" && r.url === imageUrl && r.status === 200 && r.sha256 === drawing.artifact!.sha256);
  expect(image, "Actual passive image bytes must match the exact-source depiction artifact").toBeDefined();
  const observed = await primaryEvidence(page), trigger = observed.triggers.find(t => t.label === label)!;
  expect(trigger).toBeDefined(); const snapshots = observed.snapshots.filter(s => s.at >= trigger.at);
  const headerReady = snapshots.find(matchesHeader), decoded = snapshots.find(s => matchesHeader(s) && s.image?.src === imageUrl && s.image.complete && s.image.width > 0);
  expect(headerReady).toBeDefined(); expect(decoded).toBeDefined();
  if (oracle) await expect.poll(async () => comparisonMatches((await primaryEvidence(page)).snapshots.at(-1)!, oracle), { timeout: 30_000 }).toBe(true);
  const comparisonSnapshots = oracle ? (await primaryEvidence(page)).snapshots.filter(s => s.at >= trigger.at && matchesHeader(s) && comparisonMatches(s, oracle)) : [];
  const visibleHeader = snapshots.find(s => matchesHeader(s) && s.headerVisible);
  const visibleImage = snapshots.find(s => matchesHeader(s) && s.imageVisible && s.image?.src === imageUrl && s.image.complete && s.image.width > 0);
  return { trigger, source: source(entry), header_dom_ms: elapsedFrom(trigger, headerReady), decoded_image_dom_ms: elapsedFrom(trigger, decoded),
    header_visible_ms: elapsedFrom(trigger, visibleHeader), decoded_image_visible_ms: elapsedFrom(trigger, visibleImage),
    comparison_dom_ms: elapsedFrom(trigger, comparisonSnapshots[0]), comparison_visible_ms: elapsedFrom(trigger, comparisonSnapshots.find(s => s.svgVisible)),
    visibility_limit: "Null when not observed in the viewport; DOM readiness does not establish visible/compositor presentation",
    image: { artifact: drawing.artifact, passive_transfer: image, server_drawing_cache: "unknown; no nonwarming server-cache proof" },
    inventory, depiction: drawing };
}
async function companions(directory: string, prefix = ""): Promise<{ path: string; sha256: string; bytes: number }[]> {
  const rows: { path: string; sha256: string; bytes: number }[] = [];
  for (const entry of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rows.push(...await companions(directory, path));
    else { expect(entry.isFile() && !entry.isSymbolicLink()).toBe(true); const body = await readFile(resolve(directory, path)); rows.push({ path, sha256: digest(body), bytes: body.length }); }
  }
  return rows;
}

test("measures exact primary header/image and comparison readiness, settled reopening and hidden automatic edit", async ({ browser, request }, info) => {
  test.setTimeout(300_000);
  const directory = resolve(".issue-11-evidence/issue161-primary-performance", `${info.project.name}-${randomUUID()}`); await mkdir(directory, { recursive: true });
  const identity = sourceIdentities(), beforeSources = await sourceMap(identity.paths), beforePreferences = await preferences(request);
  const registryResponse = await request.get("/api/v1/ligand-profiles/registry"); expect(registryResponse.ok()).toBe(true);
  const registry = await registryResponse.json() as ProfileRegistry; await writeFile(resolve(directory, "registry.json"), JSON.stringify(registry, null, 2));
  const projects: string[] = [], records: unknown[] = [], failures: string[] = [], cleanup: Record<string, unknown> = {};
  let firstFailure: Error | undefined, observation: WorkerObservation | undefined;
  let worker: ReturnType<typeof observer> | undefined, hiddenPreferences: PropertyPreferences | undefined;
  const boundary = async () => {
    check(worker, "Worker observer has not started");
    const activeWorker = worker;
    const previous = await activeWorker.read(); await expect.poll(async () => (await activeWorker.read())?.samples ?? 0).toBeGreaterThan(previous?.samples ?? 0);
    const current = await activeWorker.read(); expect(current).not.toBeNull(); bounded(current!); return current!;
  };
  const contextOptions = { baseURL: info.project.use.baseURL, userAgent: info.project.use.userAgent,
    viewport: info.project.name === "mobile-chromium" ? { width: 320, height: 700 } : info.project.use.viewport,
    deviceScaleFactor: info.project.use.deviceScaleFactor, isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch,
    colorScheme: info.project.use.colorScheme };
  type CapturedContext = { context: BrowserContext; page: Page; traffic: ReturnType<typeof passiveTraffic>; label: string; closed: boolean };
  const contexts: CapturedContext[] = [];
  const closeContext = async (capture: CapturedContext) => {
    if (capture.closed) return;
    const { context, page, traffic, label } = capture;
    try {
      await openLigandInformation(page); await entryChoice(page).selectOption("");
      await writeFile(resolve(directory, `${label}-primary.json`), JSON.stringify(await primaryEvidence(page), null, 2));
      await writeFile(resolve(directory, `${label}-numerical.json`), JSON.stringify(await evidence(page), null, 2));
    } catch (error) { failures.push(`Browser cleanup ${label}: ${String(error)}`); }
    finally {
      try { await context.close(); capture.closed = true; } catch (error) { failures.push(`Context close ${label}: ${String(error)}`); }
      try { await traffic.save(`${label}-network.json`); } catch (error) { failures.push(`Traffic capture ${label}: ${String(error)}`); }
    }
  };
  try {
    const response = await request.put(preferencePath, { data: { expected_revision: beforePreferences.revision, enabled_categories: [] } });
    expect(response.ok()).toBe(true); hiddenPreferences = await response.json() as PropertyPreferences;
    worker = observer(directory);
    for (const size of [10, 86]) {
      const specimen = await fixture(info.project.name, size), project = await imported(request, specimen), entry = project.entries[0]; projects.push(project.id);
      const qualified = await preflight(project, specimen, directory), headers = await headerTrial(qualified, specimen.id);
      expect(headers.before.atomIds).toEqual(source(entry).atom_ids);
      expect(digest(await (await request.get(`${endpoint(project)}/entries/${entry.id}/original`)).body())).toBe(specimen.sha256);
      const context = await browser.newContext(contextOptions), page = await context.newPage(), traffic = passiveTraffic(page, directory);
      const capture = { context, page, traffic, label: specimen.id, closed: false }; contexts.push(capture);
      try {
      await installObservation(page); await installPrimaryObservation(page); await openProject(page, project);
      const start = traffic.records.length, activationJobs = jobs(await boundary(), project.id); await armPrimary(page, entryChoice(page), "first-entry", "change"); await selectNative(entryChoice(page), entry.id);
      const headerObservation = await readyPrimary(page, traffic, project, entry, headers.before, "first-entry");
      const activationWork = trafficCounts(traffic.records.slice(start)); expect(activationWork.allocations).toBe(0); expect(activationWork.demands).toBe(0);
      expect(jobs(await boundary(), project.id)).toEqual(activationJobs);
      expect(await profileChoice(page).inputValue()).toBe(""); records.push({ phase: "first-primary", fixture: specimen.id, ...headerObservation, requests: activationWork });
      const profileId = size === 10 ? "ro5" : "ro5-veber", ids = size === 10 ? PROFILE_DESCRIPTORS : COMPOSITE_DESCRIPTORS;
      const oracle = comparisonOracle(registry, profileId, qualified.result.before_report);
      const comparisonJobs = jobs(await boundary(), project.id);
      await armPrimary(page, profileChoice(page), "first-comparison", "change"); await selectNative(profileChoice(page), profileId);
      await expect.poll(async () => comparisonMatches((await primaryEvidence(page)).snapshots.at(-1)!, oracle), { timeout: 30_000 }).toBe(true);
      const observed = await primaryEvidence(page), trigger = observed.triggers.find(t => t.label === "first-comparison")!;
      const complete = observed.snapshots.find(s => s.at >= trigger.at && comparisonMatches(s, oracle)); expect(complete).toBeDefined();
      const actual = await read(request, project, entry, ids); assertReport(actual.report!, qualified.result.before_report, ids, qualified.context.before_report);
      const comparisonNewJobs = jobs(await boundary(), project.id).filter(id => !comparisonJobs.includes(id)); expect(comparisonNewJobs.length).toBeLessThanOrEqual(1);
      const visible = await visibleComparison(page, oracle);
      records.push({ phase: "primary-comparison", fixture: specimen.id, source: source(entry), expected: oracle,
        trigger, dom_ready_ms: elapsedFrom(trigger, complete), new_jobs: comparisonNewJobs, visible, actual, independent: qualified.result.before_report });
      if (size === 86) {
        const retentionStarted = await page.evaluate(() => performance.now());
        for (let cycle = 0; cycle < 3; cycle++) {
          const mark = traffic.records.length, beforeJobs = jobs(await boundary(), project.id);
          await closePrimary(page); await reopenPrimary(page, `reopen-${cycle}`);
          const reopened = await readyPrimary(page, traffic, project, entry, headers.before, `reopen-${cycle}`, oracle);
          await traffic.settle(); const delta = trafficCounts(traffic.records.slice(mark));
          expect(delta.allocations).toBe(0); expect(delta.demands).toBe(0); expect(delta.depiction).toBe(0);
          expect(jobs(await boundary(), project.id)).toEqual(beforeJobs); expect(await preferences(request)).toEqual(hiddenPreferences);
          expect(await profileChoice(page).inputValue()).toBe(profileId);
          records.push({ phase: "settled-reopen", fixture: specimen.id, cycle, ...reopened, requests: delta,
            structural_counts: { axes: oracle.rows.length, criteria: oracle.constraints, polygon: 1 } });
        }
        expect(await page.evaluate(() => performance.now()) - retentionStarted).toBeLessThan(60_000);
        await openInspectorTools(page); await page.getByRole("tab", { name: "selection", exact: true }).click();
        await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
        await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:1`); await page.getByRole("button", { name: "Apply query", exact: true }).click();
        await openLigandInformation(page);
        const hiddenTrafficStart = traffic.records.length;
        await beginClosedInterval(page, "hidden-edit-primary", "after-hidden-edit");
        await closePrimary(page); await confirmPrimaryAbsent(page, "hidden-edit-primary");
        const primaryClosedAt = await page.evaluate(() => performance.now());
        await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
        const editor = page.getByRole("dialog", { name: "Edit molecule", exact: true });
        const button = editor.getByRole("button", { name: "Replace selected atom with N", exact: true }); await expect(button).toBeEnabled({ timeout: 30_000 });
        await expect(primary(page)).not.toBeVisible(); const mark = hiddenTrafficStart, fetchStart = (await evidence(page)).requests.length;
        const hiddenJobsBefore = jobs(await boundary(), project.id);
        await arm(page, button, "hidden-edit", profileId, expectedCriteria(registry, profileId, qualified.result.after_report), "click");
        const accepted = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(`/entries/${entry.id}/model-edits`));
        await button.click(); const acknowledgement = await accepted; expect(acknowledgement.ok()).toBe(true);
        const payload = acknowledgement.request().postDataJSON() as { action: { operation: string; element: string }; hydrogen_policy: string;
          expected_revision: number; expected_artifact_id: string; selection: { atoms: { structure_id: string; atom_id: number }[] } };
        expect(payload).toMatchObject({ action: { operation: "atom.element", element: "N" }, hydrogen_policy: "automatic",
          expected_revision: project.revision, expected_artifact_id: entry.current_artifact_id, selection: { atoms: [{ structure_id: entry.id, atom_id: 1 }] } });
        const ack = await acknowledgement.json() as SelectionEditResult, changed = ack.project, next = changed.entries.find(e => e.id === entry.id)!;
        expect(changed.revision).toBe(project.revision + 1); expect(next.current_artifact_id).not.toBe(entry.current_artifact_id);
        expect(ack.hydrogen_reconciliation_report).toMatchObject({ policy: "automatic", status: "complete", skipped_count: 0, unprocessed_count: 0 });
        expect(source(next).atom_ids).toEqual(headers.after.atomIds);
        await expect.poll(async () => observedReady((await evidence(page)).requests.slice(fetchStart), source(next)) !== null, { timeout: 30_000 }).toBe(true);
        await expect(primary(page)).not.toBeVisible(); const hidden = await evidence(page), ready = observedReady(hidden.requests.slice(fetchStart), source(next))!;
        const sample = hidden.samples.find(s => s.label === "hidden-edit")!; expect(sample.eventTrusted).toBe(true);
        expect(ready.timeOrigin).toBe(hidden.clock.timeOrigin); expect(ready.observed_at).toBeGreaterThanOrEqual(sample.startedAt!);
        await traffic.settle(); const hiddenWorkAtReady = trafficCounts(traffic.records.slice(mark)); expect(hiddenWorkAtReady.depiction).toBe(0);
        const hiddenNewJobs = jobs(await boundary(), project.id).filter(id => !hiddenJobsBefore.includes(id)); expect(hiddenNewJobs.length).toBeLessThanOrEqual(1);
        const proof = await publishedContext(changed, next, qualified, "after", directory, `hidden-${specimen.id}`);
        assertReport(ready.report, qualified.result.after_report, ids, proof.result.report);
        await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
        await expect(primary(page)).not.toBeVisible(); await traffic.settle();
        const hiddenWork = trafficCounts(traffic.records.slice(mark)); expect(hiddenWork.depiction).toBe(0);
        const afterOracle = comparisonOracle(registry, profileId, qualified.result.after_report);
        await reopenPrimary(page, "after-hidden-edit");
        const closedProof = closedIntervalProof(await primaryEvidence(page), "hidden-edit-primary", "after-hidden-edit");
        const reopened = await readyPrimary(page, traffic, changed, next, headers.after, "after-hidden-edit", afterOracle);
        const afterVisible = await visibleComparison(page, afterOracle);
        records.push({ phase: "hidden-edit", fixture: specimen.id, request: payload, acknowledgement: ack, source: source(next),
          automatic_ready_ms: ready.observed_at - sample.startedAt!, automatic_ready: ready, retirement_ms: null,
          retirement_unavailable_reason: "Primary absent at command; hidden retirement is unobservable", primary_closed_at: primaryClosedAt,
          hidden_requests_at_READY: hiddenWorkAtReady, hidden_requests_before_reopen_helper: hiddenWork, closed_interval_proof: closedProof,
          new_jobs: hiddenNewJobs, cache_classification: hiddenNewJobs.length ? "New owned project property job observed" : "No new owned project property job observed; no cold-cache claim",
          published_context: proof, reopening: reopened, visible: afterVisible, expected: afterOracle });
      }
      expect(digest(await (await request.get(`${endpoint(project)}/entries/${entry.id}/original`)).body())).toBe(specimen.sha256);
      expect(await preferences(request)).toEqual(hiddenPreferences);
      } finally { await closeContext(capture); }
      expect(capture.closed).toBe(true);
    }
    expect(records).toHaveLength(8);
  } catch (error) { firstFailure = error instanceof Error ? error : new Error(String(error)); failures.push(String(error)); }
  finally {
    for (const capture of contexts) await closeContext(capture);
    if (worker) {
      const activeWorker = worker;
      try {
        await expect.poll(async () => { const current = await activeWorker.read(); return !!current && Object.values(current.jobs).filter(j => j.execution_id).every(j => j.reaped); }, { timeout: 15_000 }).toBe(true);
      } catch (error) { failures.push(String(error)); }
      try { cleanup.consumers = await consumerState(directory, projects); } catch (error) { failures.push(String(error)); }
      try { observation = await activeWorker.finish(); bounded(observation); cleanup.observer_closed = true; }
      catch (error) { failures.push(String(error)); }
    }
    try { const current = await preferences(request); const restored = await request.put(preferencePath, { data: {
      expected_revision: current.revision, enabled_categories: beforePreferences.enabled_categories } }); expect(restored.ok()).toBe(true);
      expect((await restored.json() as PropertyPreferences).enabled_categories).toEqual(beforePreferences.enabled_categories); cleanup.preferences_restored = true;
    } catch (error) { failures.push(String(error)); }
    const finalIdentity = sourceIdentities(), afterSources = await sourceMap(finalIdentity.paths);
    const unchanged = identity.candidate === finalIdentity.candidate && JSON.stringify(beforeSources) === JSON.stringify(afterSources);
    if (!unchanged) failures.push("Qualification source changed during measurement");
    await writeFile(resolve(directory, "source-map.json"), JSON.stringify({ initial_candidate: identity.candidate, final_candidate: finalIdentity.candidate,
      initial: beforeSources, final: afterSources }, null, 2));
    const output = { format: "ligand-information-primary-performance-v1", candidate: identity.candidate, sources_unchanged: unchanged,
      store: store(), context: contextOptions, host: { platform: platform(), cpu: cpus()[0]?.model, logical_cpus: cpus().length,
        total_memory_bytes: totalmem(), load_after: loadavg(), browser: browser.version(), policy: "Portable observations; no controlled-host or speedup claim" },
      registry_version: registry.registry_version, descriptor_method: registry.descriptor_method, records, cleanup, failures,
      inherited_workloads: "Existing five-cold/twenty-warm, twenty-pair/four1000 and D201 controls remain separate and unchanged in scientific scope",
      cache_classification: "Fresh context is not proof of cold server drawing cache", targets: "No new depiction/reopen latency limits; D148 numerical targets remain unchanged",
      companions: await companions(directory) };
    await writeFile(resolve(directory, "primary-performance-v1.json"), JSON.stringify(output, null, 2));
    await info.attach("ligand-information-primary-performance-v1", { body: JSON.stringify(output, null, 2), contentType: "application/json" });
  }
  if (firstFailure) throw firstFailure;
  if (failures.length) throw new Error(failures.join("\n"));
});
