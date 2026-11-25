import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { expect, test, type APIRequestContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { Entry, Project } from "../../apps/web/src/api/types";
import { performanceBudget } from "./support/performance";
import { maintainConsumerHeartbeats } from "./support/consumer-heartbeat";
import { collectBulkPropertyValidationErrors } from "./support/bulk-property-validation";
import { createObserverSnapshotReader } from "./support/observer-snapshot";
import { openInspectorTools, openLigandInformation } from "./support/navigation";

interface Source { entry_id: string; source_artifact_id: string; instance_id: string; atom_ids: number[] }
interface Report { input_hash: string; model_status: string; values: { descriptor_id: string; status: string; value: number | null }[] }
interface StageTiming { semantic_fingerprint: string; raw_proof_seconds: number; prepare_seconds: number; calculate_seconds: number; capture_bytes: number }
interface Current { source: Source; status: string; report: Report | null }
interface JobRecord {
  id: string; project_id: string; job_type: string; purpose: string; status: string; started_at: string | null;
  completed_at: string | null; execution_id: string | null; reaped: boolean;
  child_pid: number | null; captures: { targets: { source: Source }[] }[] | null;
  provenance: { source_capture?: Record<string, number>; input_materialization?: Record<string, number>; publication_verification?: Record<string, number> }; result_values: { stage_timings?: StageTiming[] };
}
interface SourceStamp { entry_id: string; source_artifact_id: string; instance_id: string; atom_count: number; membership_sha256: string }
interface ActiveOwner { id: string; project_id: string; generation: number; sequence: number; accepted_updated_at: string; source: SourceStamp }
interface TraceTarget { project_id: string; source: SourceStamp; source_key: string; active: boolean; consumers: { id: string; generation: number; descriptor_ids: string[] }[] }
interface TraceJob { id: string; project_id: string; purpose: string; job_type: string; created_at: string }
interface Materialization { kind: "True" | "False" | "None" | "Job" | "exception"; prefer_bulk: boolean; admitted: TraceTarget[]; job?: TraceJob; metrics?: Record<string, number> }
interface WorkRecord { record: number; event: string; turn: number | null; epoch_us: number; monotonic_ns: string;
  owners?: ActiveOwner[]; target?: TraceTarget; input_hash?: string; kind?: Materialization["kind"];
  admitted?: TraceTarget[]; job?: TraceJob; worked?: boolean; materialize?: Materialization; ordinary_claims?: TraceJob[];
  active_owners?: ActiveOwner[]; format_version?: number; database?: string }
interface WorkOrder { complete: boolean; observed_records: string; observed_sha256: string; start_record: number; last_record: number; records: number; header: WorkRecord }
interface Observation { complete: boolean; samples: number; jobs: Record<string, JobRecord>; retained: Record<string, number>; max_running_property_jobs: number; work_order?: WorkOrder }
interface BrowserClockCalibration { timeOrigin: number; dateBeforeMs: number; performanceNowMs: number; dateAfterMs: number }
interface BrowserClockEvidence { installed: BrowserClockCalibration; observed: BrowserClockCalibration }
interface AppReadyProof { timeOrigin: number; source: Source; inputHash: string; report: Report; requestAt: number; responseAt: number; observedAt: number; consumerId?: string; sequence?: number }
interface FetchSample { timeOrigin: number; at: number; method: string; path: string; sources: Source[]; carbon: string | null; rawCarbon: string | null; carbonVisible: boolean; status?: number; finished?: number;
  observedAt?: number; consumerId?: string; sequence?: number; results?: { source: Source; status: string; inputHash: string | null; report: Report | null }[] }
interface CarbonSnapshot { rawValue: string | null; visibleValue: string | null; visible: boolean }
interface DomSample { timeOrigin: number; started?: number; armed?: number; retired?: number; ready?: number; visibleReady?: number; presentationOpened?: number;
  networkReadyAt?: number; inputHash?: string; feedback?: number; feedbackKind?: string; changedPreviewObserved?: boolean;
  retirementObservation?: "observable" | "unobserved_hidden_at_start" | "unobserved_old_value_not_displayed";
  startSnapshot?: CarbonSnapshot; oldValue: string; nextValue: string }
declare global {
  interface Window {
    ligandPropertyPerformance: { clock: BrowserClockCalibration; readClock: () => BrowserClockCalibration; requests: FetchSample[]; sample?: DomSample; observer?: MutationObserver; control?: Element; readCarbon: () => CarbonSnapshot };
  }
}

const region = (page: Page) => page.getByRole("region", { name: "Properties", exact: true });
const carbon = (page: Page) => region(page).locator(".ligand-properties-groups dt").filter({ hasText: /^Carbon atoms$/ }).locator("..").locator("dd");
const propertyPath = (project: Project) => `/api/v1/projects/${project.id}/ligand-properties`;
const source = (entry: Entry): Source => {
  const designation = entry.ligand_designation;
  expect(designation.status).toBe("resolved");
  expect(designation.instance_id).toBeTruthy();
  return { entry_id: entry.id, source_artifact_id: entry.current_artifact_id!,
    instance_id: designation.instance_id!, atom_ids: designation.atom_ids };
};

async function installObservation(page: Page) {
  await page.addInitScript(() => {
    // Each document gets its own basis before measured work, including navigations.
    const readClock = (): BrowserClockCalibration => {
      const dateBeforeMs = Date.now(), performanceNowMs = globalThis.performance.now(), dateAfterMs = Date.now();
      return { timeOrigin: globalThis.performance.timeOrigin, dateBeforeMs, performanceNowMs, dateAfterMs };
    };
    const visible = (element: Element | null | undefined) => {
      if (!element?.isConnected || element.closest('[aria-hidden="true"], [inert]')) return false;
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.left < innerWidth
        && bounds.bottom > 0 && bounds.top < innerHeight && style.visibility !== "hidden" && style.display !== "none";
    };
    const labels = () => [...document.querySelectorAll(".ligand-properties-groups dt")].filter(node => node.textContent === "Carbon atoms");
    const snapshot = (): CarbonSnapshot => {
      const candidates = labels(), shown = candidates.find(visible);
      return { rawValue: candidates[0]?.parentElement?.querySelector("dd")?.textContent?.trim() ?? null,
        visibleValue: shown?.parentElement?.querySelector("dd")?.textContent?.trim() ?? null, visible: !!shown };
    };
    const state: Window["ligandPropertyPerformance"] = { clock: readClock(), readClock, requests: [], readCarbon: snapshot };
    window.ligandPropertyPerformance = state;
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      let sources: Source[] = [];
      if (typeof init?.body === "string") {
        try { sources = (JSON.parse(init.body) as { entries?: Source[] }).entries ?? []; } catch { /* Non-JSON requests are not descriptor demands. */ }
      }
      const before = snapshot();
      const record: FetchSample = { at: globalThis.performance.now(), method, path: url.pathname, sources, timeOrigin: state.clock.timeOrigin,
        carbon: before.visibleValue, rawCarbon: before.rawValue, carbonVisible: before.visible };
      if (url.pathname.includes("/ligand-properties") || /\/(model-edits|history\/undo|history\/redo)$/.test(url.pathname)) state.requests.push(record);
      const response = await original(...args);
      Object.assign(record, { status: response.status, finished: globalThis.performance.now() });
      if (/\/ligand-properties\/(read|consumers\/[^/]+)$/.test(url.pathname) && response.ok) {
        void response.clone().json().then((body: { entries?: Current[]; consumer_id?: string; sequence?: number }) => {
          record.results = body.entries?.map(item => ({ source: item.source, status: item.status, inputHash: item.report?.input_hash ?? null, report: item.report }));
          record.consumerId = body.consumer_id; record.sequence = body.sequence; record.observedAt = globalThis.performance.now();
        }).catch(() => { /* Original application parsing owns response errors. */ });
      }
      return response;
    };
    const install = () => {
      let frame: number | null = null;
      const check = () => {
        frame = null;
        const sample = state.sample;
        if (sample?.started === undefined) return;
        const current = snapshot();
        // A closed/offscreen presentation cannot supply a retirement latency.
        if (sample.retirementObservation === "observable" && current.visibleValue !== sample.oldValue && sample.retired === undefined) sample.retired = globalThis.performance.now();
        if (current.rawValue === sample.nextValue && sample.ready === undefined) sample.ready = globalThis.performance.now();
        if (current.visibleValue === sample.nextValue && sample.visibleReady === undefined) sample.visibleReady = globalThis.performance.now();
        if (sample.feedback === undefined && visible(state.control) && state.control!.matches(":disabled")) {
          sample.feedback = globalThis.performance.now(); sample.feedbackKind = "visible-command-disabled";
        }
        if (visible(document.querySelector(".edit-preview-status"))) sample.changedPreviewObserved = true;
        if (current.rawValue === sample.nextValue && sample.visibleReady === undefined && globalThis.performance.now() - sample.started < 30_000) frame = requestAnimationFrame(check);
      };
      state.observer = new MutationObserver(() => { if (frame !== null) cancelAnimationFrame(frame); check(); });
      state.observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ["disabled", "aria-busy", "aria-hidden", "class", "style"] });
    };
    if (document.body) install(); else document.addEventListener("DOMContentLoaded", install, { once: true });
  });
}

async function arm(page: Page, control: Locator, oldValue: string, nextValue: string, event = "click") {
  await page.evaluate(({ oldValue, nextValue }) => {
    window.ligandPropertyPerformance.sample = { oldValue, nextValue, armed: globalThis.performance.now(), timeOrigin: window.ligandPropertyPerformance.clock.timeOrigin };
  }, { oldValue, nextValue });
  await control.evaluate((element, event) => {
    const state = window.ligandPropertyPerformance;
    state.control = element;
    element.addEventListener(event, () => {
      const sample = state.sample!, current = state.readCarbon();
      sample.started = globalThis.performance.now(); sample.startSnapshot = current;
      sample.retirementObservation = !current.visible ? "unobserved_hidden_at_start"
        : current.visibleValue === sample.oldValue ? "observable" : "unobserved_old_value_not_displayed";
      if (event === "change" && element instanceof HTMLSelectElement) {
        sample.feedback = globalThis.performance.now(); sample.feedbackKind = "visible-entry-choice-changed";
      }
    }, { once: true, capture: true });
  }, event);
}

async function automaticReady(page: Page, expected: Source, expectedHash?: string): Promise<AppReadyProof> {
  await expect.poll(() => page.evaluate(({ expected, expectedHash }) => {
    const state = window.ligandPropertyPerformance, started = state.sample!.started!;
    const same = (value: Source) => value.entry_id === expected.entry_id && value.source_artifact_id === expected.source_artifact_id
      && value.instance_id === expected.instance_id && value.atom_ids.length === expected.atom_ids.length
      && value.atom_ids.every((id, index) => id === expected.atom_ids[index]);
    return state.requests.some(request => request.at >= started && request.results?.some(result => result.status === "ready"
      && same(result.source) && result.report?.model_status === "qualified"
      && result.report.values.length === 14 && result.report.values.every(value => value.status === "ready" && Number.isFinite(value.value))
      && result.inputHash && (!expectedHash || result.inputHash === expectedHash)));
  }, { expected, expectedHash }), { timeout: 30_000 }).toBe(true);
  const proof = await page.evaluate(({ expected, expectedHash }) => {
    const state = window.ligandPropertyPerformance, started = state.sample!.started!;
    const same = (value: Source) => value.entry_id === expected.entry_id && value.source_artifact_id === expected.source_artifact_id
      && value.instance_id === expected.instance_id && value.atom_ids.length === expected.atom_ids.length
      && value.atom_ids.every((id, index) => id === expected.atom_ids[index]);
    for (const request of state.requests) {
      if (request.at < started || request.observedAt === undefined || request.finished === undefined) continue;
      const result = request.results?.find(item => item.status === "ready" && same(item.source)
        && item.report?.model_status === "qualified" && (!expectedHash || item.inputHash === expectedHash));
      if (result?.inputHash && result.report) {
        state.sample!.networkReadyAt = request.observedAt; state.sample!.inputHash = result.inputHash;
        return { source: result.source, inputHash: result.inputHash, report: result.report, timeOrigin: request.timeOrigin,
          requestAt: request.at, responseAt: request.finished, observedAt: request.observedAt,
          consumerId: request.consumerId, sequence: request.sequence };
      }
    }
    throw new Error("No matching automatic App response was observed");
  }, { expected, expectedHash });
  expect(proof.source).toEqual(expected); expect(proof.inputHash).toMatch(/^[a-f0-9]{64}$/);
  expect(proof.report.values).toHaveLength(14);
  expect(proof.report.values.every(value => value.status === "ready" && Number.isFinite(value.value))).toBe(true);
  return proof;
}

async function openCachedPresentation(page: Page, entryId: string) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await page.evaluate(() => innerWidth <= 840)) {
    await expect(drawer).toBeHidden();
    const show = page.getByRole("button", { name: "Inspector", exact: true });
    await show.evaluate(element => element.addEventListener("click", () => {
      const sample = window.ligandPropertyPerformance.sample!;
      sample.presentationOpened = globalThis.performance.now(); sample.visibleReady = undefined;
    }, { once: true, capture: true }));
    await show.click();
  }
  await expect(page.getByRole("region", { name: "Ligand of interest", exact: true }).getByRole("combobox", { name: "Entry", exact: true })).toHaveValue(entryId);
}

async function timing(page: Page, command: boolean): Promise<DomSample & {
  clock: BrowserClockEvidence; currentMs: number; domCurrentMs: number | null; networkCurrentMs: number | null; ackToNetworkReadyMs: number | null;
  retirementMs: number | null; retirementRelativeToResponseMs: number | null; retirementQualification: string;
  responseToCurrentMs: number | null; responseToVisibleCurrentMs: number | null; feedbackMs: number | null; cachedPresentationMs: number | null }> {
  await expect.poll(() => page.evaluate(() => window.ligandPropertyPerformance.sample?.visibleReady)).toBeDefined();
  const { sample, requests, clock } = await page.evaluate(() => ({ sample: window.ligandPropertyPerformance.sample!, requests: window.ligandPropertyPerformance.requests,
    clock: { installed: window.ligandPropertyPerformance.clock, observed: window.ligandPropertyPerformance.readClock() } }));
  expect(sample.started).toBeDefined(); expect(sample.visibleReady).toBeDefined();
  const currentMs = sample.visibleReady! - sample.started!;
  expect(Number.isFinite(currentMs) && currentMs >= 0).toBe(true);
  const acknowledgement = [...requests].reverse().find(item => /\/(model-edits|history\/undo|history\/redo)$/.test(item.path)
    && item.at >= sample.started! && item.finished !== undefined);
  let retirementQualification = sample.retirementObservation ?? "unobserved";
  if (command) {
    expect(acknowledgement?.finished, "A direct acknowledged edit/Undo must establish the input boundary").toBeDefined();
    expect(sample.changedPreviewObserved).not.toBe(true);
    expect(sample.feedback, "Observe actual visible command feedback independently of input retirement").toBeDefined();
    performanceBudget(sample.feedback! - sample.started!, 100, "trusted click to visible disabled feedback ms", true);
    if (sample.retirementObservation === "observable") {
      expect(sample.retired).toBeDefined(); expect(sample.retired!).toBeLessThanOrEqual(sample.visibleReady!);
      const relative = sample.retired! - acknowledgement!.finished!;
      if (relative >= 0) performanceBudget(relative, 100, "acknowledged input to observed retired DOM ms", true);
      else retirementQualification = "observed_withheld_before_acknowledgement";
    }
  }
  return { ...sample, currentMs, clock,
    domCurrentMs: sample.ready === undefined ? null : sample.ready - sample.started!,
    networkCurrentMs: sample.networkReadyAt === undefined ? null : sample.networkReadyAt - sample.started!,
    ackToNetworkReadyMs: acknowledgement?.finished === undefined || sample.networkReadyAt === undefined ? null : sample.networkReadyAt - acknowledgement.finished,
    retirementMs: sample.retired === undefined ? null : sample.retired - sample.started!,
    retirementRelativeToResponseMs: acknowledgement?.finished === undefined || sample.retired === undefined ? null : sample.retired - acknowledgement.finished,
    retirementQualification,
    responseToCurrentMs: acknowledgement?.finished === undefined || sample.ready === undefined ? null : sample.ready - acknowledgement.finished,
    responseToVisibleCurrentMs: acknowledgement?.finished === undefined ? null : sample.visibleReady! - acknowledgement.finished,
    feedbackMs: sample.feedback === undefined ? null : sample.feedback - sample.started!,
    cachedPresentationMs: sample.presentationOpened === undefined ? null : sample.visibleReady! - sample.presentationOpened };
}

async function inspect(page: Page, entryId: string) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await page.evaluate(() => innerWidth <= 840) && !await drawer.isVisible()) {
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
  }
  await openLigandInformation(page);
  await page.getByRole("region", { name: "Ligand of interest", exact: true }).getByRole("combobox", { name: "Entry", exact: true }).selectOption(entryId);
}

async function closeInspector(page: Page) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await drawer.isVisible()) {
    await drawer.getByRole("combobox", { name: "Entry", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }
}

async function frozenEditableFixture(identity: string, intendedSmiles: string) {
  const directory = resolve("tests/fixtures/ligand-properties-performance/editable");
  const manifestBytes = await readFile(resolve(directory, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { schema_version: number; fixtures: {
    id: string; intended_smiles: string; filename: string; sha256: string; bytes: number }[] };
  expect(manifest.schema_version).toBe(1);
  const matches = manifest.fixtures.filter(row => row.id === identity); expect(matches).toHaveLength(1);
  const fixture = matches[0]; expect(fixture.intended_smiles).toBe(intendedSmiles);
  expect(fixture.filename).toBe(`${identity}.sdf`); expect(fixture.filename).toMatch(/^[a-z0-9-]+\.sdf$/);
  expect(fixture.bytes).toBeGreaterThan(0); expect(fixture.bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  const bytes = await readFile(resolve(directory, fixture.filename));
  expect(bytes.length).toBe(fixture.bytes);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
  return { ...fixture, data: bytes, manifestSha256: createHash("sha256").update(manifestBytes).digest("hex") };
}

async function imported(request: APIRequestContext, name: string, smiles: string[], filename = "capacity.smi",
  editableIndexes: ReadonlyMap<number, string> = new Map()): Promise<Project> {
  const created = await request.post("/api/v1/projects", { data: { name } });
  expect(created.ok()).toBe(true);
  let project = await created.json() as Project;
  for (let offset = 0; offset < smiles.length; offset += 50) {
    // Duplicate field names/filenames are deliberate: repeated input must prove
    // content coalescing rather than merely relabel different normalized sources.
    const form = new FormData();
    const batch = smiles.slice(offset, offset + 50);
    const generated = editableIndexes.has(offset);
    expect(batch.every((_, index) => editableIndexes.has(offset + index) === generated), "Keep frozen editable setup separate from graph-only cohort batches").toBe(true);
    form.set("expected_revision", String(project.revision)); form.set("generate_3d", "false");
    for (const [index, text] of batch.entries()) {
      const fixtureId = editableIndexes.get(offset + index);
      if (fixtureId) {
        const fixture = await frozenEditableFixture(fixtureId, text);
        form.append("files", new Blob([new Uint8Array(fixture.data)], { type: "chemical/x-mdl-sdfile" }), fixture.filename);
      } else form.append("files", new Blob([`${text} capacity\n`], { type: "chemical/x-daylight-smiles" }), filename);
    }
    const response = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: form });
    expect(response.ok(), await response.text()).toBe(true);
    project = (await response.json() as { project: Project }).project;
  }
  expect(project.entries).toHaveLength(smiles.length);
  return project;
}

async function preflightEditableFixture(project: Project, entry: Entry, smiles: string, directory: string, label: string, fixtureId: string) {
  const setupStarted = performance.now();
  const frozen = await frozenEditableFixture(fixtureId, smiles);
  const output = resolve(directory, `fixture-${label}`); await mkdir(output);
  const requirements = resolve(output, "requirements.json");
  expect(entry.original_artifact_id).toBeTruthy();
  await writeFile(requirements, JSON.stringify({ project_id: project.id, source: source(entry),
    original_artifact_id: entry.original_artifact_id, smiles, fixture_id: fixtureId }, null, 2));
  const legacyStore = process.env.NEISTRA_E2E_DATA_DIR === undefined && process.env.MOLWEAVE_E2E_DATA_DIR !== undefined;
  const data = resolve(process.env.NEISTRA_E2E_DATA_DIR ?? process.env.MOLWEAVE_E2E_DATA_DIR ?? ".neistra-e2e");
  const database = resolve(data, legacyStore ? "molweave.db" : "neistra.db");
  const args = ["-m", "tests.support.ligand_property_performance_qualification", "fixture-preflight",
    "--database", database, "--data-dir", data, "--requirements", requirements,
    "--output-dir", resolve(output, "qualification")];
  // Disposable core/editor checks run before demand or the measured trigger.
  // They cannot publish an edit, API descriptor request or shared cache value.
  const child = spawn(resolve(".venv/bin/python"), args, { cwd: process.cwd(), env: process.env,
    stdio: ["ignore", "pipe", "pipe"], timeout: 30_000, killSignal: "SIGTERM" });
  let log = "";
  child.stdout.on("data", chunk => { log += String(chunk); });
  child.stderr.on("data", chunk => { log += String(chunk); });
  const completion = await new Promise<{ code: number | null; signal: string | null }>((done, reject) => {
    child.once("close", (code, signal) => done({ code, signal })); child.once("error", reject);
  });
  await writeFile(resolve(output, "process.log"), log);
  const setupMs = performance.now() - setupStarted;
  await writeFile(resolve(output, "process.json"), JSON.stringify({ scope: "Isolated nonpublishing setup only; outside measured trigger",
    command: [resolve(".venv/bin/python"), ...args], pid: child.pid, ...completion, setupMs, timeoutMs: 30_000 }, null, 2));
  expect(completion.code, log).toBe(0); expect(completion.signal).toBeNull();
  const result = JSON.parse(await readFile(resolve(output, "qualification/result.json"), "utf8")) as {
    source: Source; source_sha256: string; original_sha256: string; before_report: Report; after_report: Report;
    source_atom_ids: number[]; trial_atom_ids: number[]; original_recovery_disabled: boolean;
    no_shared_cache_or_API_descriptor_work: boolean; warnings: unknown[] };
  expect(result.source).toEqual(source(entry));
  expect(result.source_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.original_sha256).toBe(frozen.sha256);
  expect(result.original_recovery_disabled && result.no_shared_cache_or_API_descriptor_work).toBe(true);
  for (const report of [result.before_report, result.after_report]) {
    expect(report.model_status).toBe("qualified"); expect(report.values).toHaveLength(14);
    expect(report.values.every(value => value.status === "ready" && Number.isFinite(value.value))).toBe(true);
  }
  // Generated H can be removed by the real edit. Expected-source matching below
  // always uses actual ACK/Undo membership, never these preflight/previous IDs.
  return { directory: output, setupMs, result, frozenFixture: { id: fixtureId, sha256: frozen.sha256, manifestSha256: frozen.manifestSha256, intendedSmiles: smiles }, geometry: "idealized and unoptimized; frozen SDF original, no runtime embedding" };
}

async function open(page: Page, project: Project) {
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const escaped = project.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${escaped}(?:\\s|$)`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
}

async function checkedRead(request: APIRequestContext, project: Project, entry: Entry): Promise<Current> {
  const expected = source(entry);
  const response = await request.post(`${propertyPath(project)}/read`, { data: { entries: [expected], descriptor_ids: [] } });
  expect(response.ok()).toBe(true);
  const body = await response.json() as { project_id: string; entries: Current[] };
  expect(body.project_id).toBe(project.id); expect(body.entries).toHaveLength(1);
  const current = body.entries[0]; expect(current.source).toEqual(expected); expect(current.status).toBe("ready");
  expect(current.report?.model_status).toBe("qualified");
  expect(current.report?.values).toHaveLength(14);
  expect(current.report?.values.every(value => value.status === "ready" && Number.isFinite(value.value))).toBe(true);
  return current;
}

async function editControls(page: Page, entry: Entry) {
  await openInspectorTools(page);
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:1`);
  await page.getByRole("button", { name: "Apply query", exact: true }).click();
  await openLigandInformation(page);
  if (await page.evaluate(() => innerWidth > 840)) await carbon(page).scrollIntoViewIfNeeded();
  await closeInspector(page);
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  return page.getByRole("dialog", { name: "Edit molecule", exact: true }).getByRole("button", { name: "Replace selected atom with N", exact: true });
}

async function actualEdit(page: Page, request: APIRequestContext, project: Project, oldCarbon: number, preparedButton?: Locator) {
  const entry = project.entries.find(item => item.visible)!;
  const button = preparedButton ?? await editControls(page, entry);
  const requestStart = await page.evaluate(() => window.ligandPropertyPerformance.requests.length);
  await arm(page, button, String(oldCarbon), String(oldCarbon - 1));
  const accepted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/entries/${entry.id}/model-edits`));
  await button.click();
  const acknowledgement = await accepted; expect(acknowledgement.ok()).toBe(true);
  const result = await acknowledgement.json() as { project: Project };
  const next = result.project; expect(next.id).toBe(project.id);
  const changed = next.entries.find(item => item.id === entry.id)!;
  expect(changed.current_artifact_id).not.toBe(entry.current_artifact_id);
  const proof = await automaticReady(page, source(changed));
  const carbonValue = proof.report.values.find(value => value.descriptor_id === "carbon_count");
  expect(carbonValue?.value).toBe(oldCarbon - 1);
  // No direct verification request or reopened presenter can initiate this work:
  // automatic READY is proved from the App's exact-source response above.
  if (await page.evaluate(() => innerWidth <= 840)) await expect(page.getByRole("dialog", { name: "Inspector panel", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  await openCachedPresentation(page, entry.id);
  await expect(carbon(page)).toHaveText(String(oldCarbon - 1), { timeout: 30_000 });
  const times = await timing(page, true);
  const actual = await checkedRead(request, next, changed); expect(actual.report!.input_hash).toBe(proof.inputHash);
  const requests = await page.evaluate(offset => window.ligandPropertyPerformance.requests.slice(offset), requestStart);
  const currentRequests = requests.filter(item => item.sources.some(target => target.source_artifact_id === changed.current_artifact_id));
  expect(currentRequests.length).toBeGreaterThan(0);
  expect(currentRequests.filter(item => item.carbonVisible).every(item => item.carbon !== String(oldCarbon))).toBe(true);
  return { project: next, entry: changed, current: actual, automaticReady: proof, timing: times, requests,
    sourceRetirementObservation: { visibleRequests: currentRequests.filter(item => item.carbonVisible).length,
      hiddenRequests: currentRequests.filter(item => !item.carbonVisible).length } };
}

async function startObserver(info: TestInfo, projectId?: string, requireWorkOrder = false) {
  const directory = resolve(".issue-11-evidence/issue159-performance", `${info.project.name}-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, "worker-observation.json"), stop = resolve(directory, "observer.stop");
  const legacyStore = process.env.NEISTRA_E2E_DATA_DIR === undefined && process.env.MOLWEAVE_E2E_DATA_DIR !== undefined;
  const data = resolve(process.env.NEISTRA_E2E_DATA_DIR ?? process.env.MOLWEAVE_E2E_DATA_DIR ?? ".neistra-e2e");
  const database = resolve(data, legacyStore ? "molweave.db" : "neistra.db");
  const turnTrace = process.env.NEISTRA_PROPERTY_WORKER_TRACE;
  if (requireWorkOrder) expect(turnTrace, "Actual productive-turn qualification requires the explicitly owned worker trace").toBeTruthy();
  if (turnTrace) expect(resolve(turnTrace)).toBe(resolve(data, "qualification/worker-turns.jsonl"));
  const child = spawn(resolve(".venv/bin/python"), ["-m", "tests.support.ligand_property_performance_qualification", "observe",
    "--database", database, "--output", output, "--stop-file", stop,
    ...(projectId ? ["--project-id", projectId] : []), ...(turnTrace ? ["--turn-trace", resolve(turnTrace)] : [])], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", chunk => { log += String(chunk); }); child.stderr.on("data", chunk => { log += String(chunk); });
  const completion = new Promise<number | null>((resolveExit, reject) => { child.once("exit", resolveExit); child.once("error", reject); });
  const readPublished = createObserverSnapshotReader<Observation>(() => readFile(output, "utf8"));
  const read = async (): Promise<Observation> => {
    const observation = await readPublished();
    if (observation === null) throw new Error("Descriptor observer has not published its first snapshot");
    return observation;
  };
  try {
    await expect.poll(async () => (await readPublished())?.samples ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  } catch (error) {
    await writeFile(stop, "stop\n");
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await completion; await writeFile(resolve(directory, "observer.log"), log); throw error;
  }
  return { directory, read, child, async finish() {
    await writeFile(stop, "stop\n");
    const exit = await Promise.race([completion, new Promise<"timeout">(done => { const timer = setTimeout(() => done("timeout"), 15_000); timer.unref(); })]);
    if (exit === "timeout" && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM"); await completion;
    }
    await writeFile(resolve(directory, "observer.log"), log);
    expect(exit, log).toBe(0);
    const result = await read(); expect(result.complete).toBe(true);
    await info.attach("descriptor-worker-observation", { path: output, contentType: "application/json" });
    return result;
  } };
}

function summary(values: number[]) {
  expect(values.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { samples: sorted.length, median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) };
}

function validateWorkerEvidence(observation: Observation) {
  expect(observation.max_running_property_jobs).toBeLessThanOrEqual(1);
  expect(observation.retained.content_bytes).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(observation.retained.ligand_property_content).toBeLessThanOrEqual(2048);
  expect(observation.retained.ligand_property_proofs).toBeLessThanOrEqual(4096);
  // One current execution may coexist with the bounded terminal retention.
  expect(observation.retained.ligand_property_executions).toBeLessThanOrEqual(33);
  for (const job of Object.values(observation.jobs).filter(item => item.execution_id && item.status === "completed")) {
    expect(job.purpose).toBe("ligand_properties"); expect(job.child_pid).toBeGreaterThan(0);
    const capture = job.provenance.source_capture!, materialized = job.provenance.input_materialization!;
    const publication = job.provenance.publication_verification!;
    expect(capture.coordinator_native_preparations).toBe(0);
    expect(capture.source_proofs).toBeGreaterThan(0); expect(capture.source_proofs).toBeLessThanOrEqual(8);
    expect(capture.verified_bytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(capture.source_read_calls).toBeLessThanOrEqual(16);
    expect(capture.source_read_byte_cap).toBeLessThanOrEqual(64 * 1024 * 1024 + 16);
    expect(publication.verified_bytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(publication.source_reads).toBeLessThanOrEqual(16);
    expect(publication.read_byte_cap).toBeLessThanOrEqual(64 * 1024 * 1024 + 16);
    expect(Number.isFinite(publication.seconds) && publication.seconds >= 0).toBe(true);
    expect(materialized.verified_bytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(materialized.envelope_bytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    const stages = job.result_values.stage_timings!;
    expect(stages.length).toBeGreaterThan(0); expect(stages.length).toBeLessThanOrEqual(8);
    expect(new Set(stages.map(stage => stage.semantic_fingerprint)).size).toBe(stages.length);
    for (const stage of stages) {
      expect([stage.raw_proof_seconds, stage.prepare_seconds, stage.calculate_seconds].every(value => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(stage.capture_bytes).toBeGreaterThan(0); expect(stage.capture_bytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    }
  }
}

function sourceStamp(value: Source): SourceStamp {
  return { entry_id: value.entry_id, source_artifact_id: value.source_artifact_id,
    instance_id: value.instance_id, atom_count: value.atom_ids.length,
    membership_sha256: createHash("sha256").update(JSON.stringify(value.atom_ids)).digest("hex") };
}
function sameStamp(left: SourceStamp, right: SourceStamp) {
  return left.entry_id === right.entry_id && left.source_artifact_id === right.source_artifact_id
    && left.instance_id === right.instance_id && left.atom_count === right.atom_count && left.membership_sha256 === right.membership_sha256;
}
function epochMicroseconds(value: string) {
  const [whole, fraction = ""] = value.replace(" ", "T").replace(/(?:Z|\+00:00)$/, "").split(".");
  const result = Date.parse(`${whole}Z`) * 1000 + Number(fraction.padEnd(6, "0").slice(0, 6));
  expect(Number.isSafeInteger(result)).toBe(true); return result;
}
async function workOrderProof(observation: Observation, expected: Source, inputHash: string,
  appRequests: FetchSample[], bulk: Entry[], ordinaryId: string, ordinaryCreated: string, requireOverlap: boolean) {
  const order = observation.work_order;
  expect(order?.complete, "A complete contiguous work-order observation is mandatory").toBe(true);
  const bytes = await readFile(order!.observed_records);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(order!.observed_sha256);
  const [header, ...records] = bytes.toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line) as WorkRecord);
  expect(header.event).toBe("header"); expect(header.format_version).toBe(1);
  expect(records.length).toBe(order!.records);
  records.forEach((record, index) => {
    expect(record.record).toBe(order!.start_record + index + 1);
    expect(Number.isSafeInteger(record.epoch_us)).toBe(true);
    expect(BigInt(record.monotonic_ns)).toBeGreaterThanOrEqual(0n);
    expect(record.event).not.toBe("turn_error");
  });
  const ends = records.filter(record => record.event === "turn_end");
  const completed = new Map(ends.map(record => [record.turn, record]));
  const productive = ends.filter(record => record.worked && record.materialize
    && ["True", "Job", "exception"].includes(record.materialize.kind) && !record.ordinary_claims?.length);
  const ordinaryClaim = records.find(record => record.event === "ordinary_claim" && record.job?.id === ordinaryId);
  expect(ordinaryClaim, "Observe the actual ordinary claim, rather than infer it from child starts").toBeDefined();
  expect(ordinaryClaim!.job?.purpose).toBe("user");
  const ordinaryQueued = epochMicroseconds(ordinaryCreated);
  const preceding = productive.filter(record => record.record < ordinaryClaim!.record && record.epoch_us >= ordinaryQueued);
  expect(preceding.length, "Ordinary claim follows at most four actual productive derived turns, including warm/failure progress").toBeLessThanOrEqual(4);

  const expectedStamp = sourceStamp(expected);
  const demand = appRequests.find(record => record.method === "PUT" && record.consumerId && record.sequence
    && record.sources.some(value => sameStamp(sourceStamp(value), expectedStamp)));
  expect(demand, "The exact new input must have an actual accepted App consumer request").toBeDefined();
  const seen = records.flatMap(record => record.event === "active_owners" ? (record.owners ?? []).map(owner => ({ record, owner })) : [])
    .find(item => item.owner.id === demand!.consumerId && item.owner.sequence === demand!.sequence && sameStamp(item.owner.source, expectedStamp));
  expect(seen, "Observe the actual committed active source/generation in the worker").toBeDefined();
  expect(seen!.record.turn).not.toBeNull();
  const matches = (target: TraceTarget) => target.active && sameStamp(target.source, expectedStamp)
    && target.consumers.some(owner => owner.id === seen!.owner.id && owner.generation === seen!.owner.generation);
  const admission = records.find(record =>
    (record.event === "bind_return" && record.target && matches(record.target) && record.input_hash === inputHash)
    || (record.event === "materialize_return" && record.kind === "Job" && record.admitted?.some(matches)));
  expect(admission, "Actual exact-source admission/binding must be observed").toBeDefined();
  const published = records.find(record => record.event === "bind_return" && record.target
    && matches(record.target) && record.input_hash === inputHash && completed.get(record.turn)?.worked);
  expect(published, "Successful turn plus the matching current App/API report proves publication").toBeDefined();
  expect(completed.get(admission!.turn)?.worked).toBe(true);
  expect(admission!.record).toBeGreaterThanOrEqual(seen!.record.record);
  expect(published!.record).toBeGreaterThanOrEqual(admission!.record);
  const intervening = productive.filter(record => record.turn! >= seen!.record.turn! && record.turn! < admission!.turn!);
  expect(intervening.length, "At most one bulk fairness turn may precede the newly accepted active source").toBeLessThanOrEqual(1);
  expect(intervening.every(record => record.materialize?.prefer_bulk)).toBe(true);

  const bulkIds = new Set(bulk.map(entry => entry.id));
  const overlapping = records.filter(record => record.event === "bind_return" && record.target
    && bulkIds.has(record.target.source.entry_id) && record.record >= seen!.record.record && completed.get(record.turn)?.worked);
  const overlap = overlapping.length > 0;
  if (requireOverlap) expect(overlap, "Distinct bulk must still publish actual already-requested bulk work after the accepted new active generation is observed").toBe(true);
  return { scope: "Actual productive work order; child counts are descriptive only",
    ordinary: { claimRecord: ordinaryClaim!.record, queuedEpochUs: ordinaryQueued, productiveDerivedTurnsBeforeClaim: preceding.length,
      warmProgressTurnsBeforeClaim: preceding.filter(record => record.materialize?.kind === "True").length,
      turns: preceding.map(record => record.turn) },
    active: { source: expected, inputHash, acceptedOwner: seen!.owner, observedRecord: seen!.record.record,
      admissionRecord: admission!.record, publicationRecord: published!.record,
      productiveBulkFairnessTurnsBeforeAdmission: intervening.map(record => record.turn),
      inFlightTurnPolicy: "A turn already claimed before the committed active-generation observation remains nonpreemptive",
      actualPostAcceptanceBulkBindings: overlapping.length, priorityOverlapExercised: overlap,
      qualification: overlap ? "Actual accepted-source overlap and bounded priority proved" : "Repeated bulk finished before this accepted source; coalescing/retention only" },
    trace: { path: order!.observed_records, sha256: order!.observed_sha256, startRecord: order!.start_record, lastRecord: order!.last_record } };
}

test("measures five cold browser contexts and twenty paired actual ligand edits with current-input recovery", async ({ browser, request }, info) => {
  test.setTimeout(1_200_000);
  const observer = await startObserver(info);
  const records: { kind: string; [key: string]: unknown }[] = [];
  const pageClocks: { index: number; clock?: BrowserClockEvidence; unavailable?: string }[] = [];
  try {
    for (let index = 0; index < 25; index++) {
      const context = await browser.newContext({ viewport: info.project.use.viewport, isMobile: info.project.use.isMobile,
        hasTouch: info.project.use.hasTouch, userAgent: info.project.use.userAgent, deviceScaleFactor: info.project.use.deviceScaleFactor,
        baseURL: String(info.project.use.baseURL ?? `http://127.0.0.1:${process.env.NEISTRA_E2E_WEB_PORT ?? process.env.MOLWEAVE_E2E_WEB_PORT ?? "5173"}`) });
      const page = await context.newPage(); await installObservation(page);
      try {
        const mobile = info.project.name.includes("mobile"), size = index < 5 ? 92 + index : 10 + (index - 5) * 4;
        const smiles = mobile ? "C".repeat(Math.floor(size / 2)) + "O" + "C".repeat(size - Math.floor(size / 2) - 1) : "C".repeat(size);
        const initialCarbon = mobile ? size - 1 : size;
        const setup = performance.now();
        let project = await imported(request, `Descriptor samples ${info.project.name} ${index} ${randomUUID()}`, [smiles], "capacity.smi",
          index >= 5 ? new Map([[0, `paired-${info.project.name}-${size}`]]) : new Map());
        const editablePreflight = index >= 5
          ? await preflightEditableFixture(project, project.entries[0], smiles, observer.directory, `paired-${index - 5}`, `paired-${info.project.name}-${size}`) : null;
        await open(page, project);
        const select = page.getByRole("region", { name: "Ligand of interest", exact: true }).getByRole("combobox", { name: "Entry", exact: true });
        if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
        await arm(page, select, "", String(initialCarbon), "change");
        const setupMsExcluded = performance.now() - setup;
        await select.selectOption(project.entries[0].id);
        const firstAutomaticReady = await automaticReady(page, source(project.entries[0]));
        await expect(carbon(page)).toHaveText(String(initialCarbon), { timeout: 30_000 });
        const first = await checkedRead(request, project, project.entries[0]);
        expect(first.report!.input_hash).toBe(firstAutomaticReady.inputHash);
        const firstTiming = await timing(page, false);
        expect(firstTiming.feedbackMs).not.toBeNull();
        performanceBudget(firstTiming.feedbackMs!, 100, "entry-choice visible feedback ms", true);
        expect(firstTiming.networkCurrentMs).not.toBeNull();
        performanceBudget(firstTiming.networkCurrentMs!, 2000, "cold automatic exact-source App READY ms", true);
        if (index < 5) {
          records.push({ kind: "fresh-browser-context-cold-start", index, heavyAtoms: size, setupMsExcluded,
            source: source(project.entries[0]), inputHash: first.report!.input_hash, timing: firstTiming, automaticReady: firstAutomaticReady });
        } else {
          const edited = await actualEdit(page, request, project, initialCarbon);
          expect(edited.timing.networkCurrentMs).not.toBeNull();
          performanceBudget(edited.timing.networkCurrentMs!, 2000, "cold actual-edit automatic current App READY ms", true);
          expect(edited.current.report!.input_hash).not.toBe(first.report!.input_hash);
          project = edited.project;
          let completedSourceObservation: Observation | undefined;
          await expect.poll(async () => {
            const observation = await observer.read();
            const completed = Object.values(observation.jobs).some(job => job.status === "completed"
              && job.captures?.some(capture => capture.targets.some(target => target.source.source_artifact_id === edited.entry.current_artifact_id)));
            if (completed) completedSourceObservation = observation;
            return completed;
          }, { timeout: 15_000 }).toBe(true);
          expect(completedSourceObservation).toBeDefined();
          const beforeWarmJobs = new Set(Object.keys(completedSourceObservation!.jobs));
          await closeInspector(page);
          const undo = page.getByRole("button", { name: /^Undo:/ });
          await arm(page, undo, String(initialCarbon - 1), String(initialCarbon));
          const undone = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/history/undo"));
          await undo.click();
          const undoAcknowledgement = await undone; expect(undoAcknowledgement.ok()).toBe(true);
          project = await undoAcknowledgement.json() as Project;
          const expectedSource = source(project.entries[0]);
          const warmAutomaticReady = await automaticReady(page, expectedSource, first.report!.input_hash);
          // Only after automatic current READY is observed may a deliberately
          // closed presenter reopen. A verification read does not initiate work.
          const restoredBeforeOpening = await checkedRead(request, project, project.entries[0]);
          expect(restoredBeforeOpening.report!.input_hash).toBe(warmAutomaticReady.inputHash);
          await openCachedPresentation(page, edited.entry.id);
          await expect(carbon(page)).toHaveText(String(initialCarbon));
          await expect.poll(() => page.evaluate(() => window.ligandPropertyPerformance.sample?.visibleReady)).toBeDefined();
          const warm = await timing(page, true);
          const projectionMs = mobile ? warm.cachedPresentationMs : warm.responseToCurrentMs;
          expect(projectionMs).not.toBeNull();
          performanceBudget(projectionMs!, 100, mobile ? "Inspector-open to visible matching-cache values ms" : "matching-cache response to current DOM ms", true);
          const restored = await checkedRead(request, project, project.entries[0]);
          expect(restored.report!.input_hash).toBe(first.report!.input_hash);
          const quietAt = await page.evaluate(() => window.ligandPropertyPerformance.requests.length);
          await closeInspector(page); await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
          await page.mouse.move(140, 200); await page.mouse.move(150, 210);
          // Two pending-poll periods expose accidental terminal polling; this is
          // an observation interval, not part of a latency measurement.
          await page.waitForTimeout(1600);
          const afterQuiet = await page.evaluate(() => window.ligandPropertyPerformance.requests.slice(0));
          expect(afterQuiet.slice(quietAt).filter(item => item.path.endsWith("/read") || item.method === "PUT")).toHaveLength(0);
          const warmNewJobs = Object.values((await observer.read()).jobs).filter(job => job.project_id === project.id && !beforeWarmJobs.has(job.id));
          expect(warmNewJobs).toHaveLength(0);
          records.push({ kind: "paired-edit", index: index - 5, heavyAtoms: size, setupMsExcluded,
            editablePreflight,
            cold: edited.timing, warm, oldSource: source(project.entries[0]), changedSource: source(edited.entry),
            firstInputHash: first.report!.input_hash, changedInputHash: edited.current.report!.input_hash,
            matchingQualifiedResultReadyBeforeViewOpen: true, automaticReady: edited.automaticReady,
            warmAutomaticReady, cachedProjectionMs: projectionMs,
            cacheProjectionBoundary: mobile ? "Presentation open; ACK-to-visible includes deliberate view-open delay" : "ACK/current input to DOM",
            warmNewJobs: warmNewJobs.length, requests: afterQuiet });
        }
      } finally {
        try {
          const clock = await page.evaluate(() => ({ installed: window.ligandPropertyPerformance.clock, observed: window.ligandPropertyPerformance.readClock() }));
          pageClocks.push({ index, clock });
        } catch (error) { pageClocks.push({ index, unavailable: String(error) }); }
        await context.close();
      }
    }
  } finally {
    const observation = await observer.finish();
    validateWorkerEvidence(observation);
    const cold = records.filter(row => row.kind === "fresh-browser-context-cold-start");
    const pairs = records.filter(row => row.kind === "paired-edit");
    const evidence = { scope: "Actual browser/production API/real worker; fresh contexts are not cold server or OS-process claims",
      profile: info.project.name, records, pageClocks, coldStarts: cold.length ? summary(cold.map(row => (row.timing as { currentMs: number }).currentMs)) : null,
      coldEdits: pairs.length ? summary(pairs.map(row => (row.cold as { networkCurrentMs: number }).networkCurrentMs)) : null,
      coldEditVisibleIncludingPresentation: pairs.length ? summary(pairs.map(row => (row.cold as { currentMs: number }).currentMs)) : null,
      warmUndo: pairs.length ? summary(pairs.map(row => (row.warm as { currentMs: number }).currentMs)) : null,
      matchingCacheProjection: pairs.length ? summary(pairs.map(row => row.cachedProjectionMs as number)) : null,
      workerObservation: observer.directory, ownedJobsObserved: Object.keys(observation.jobs).length,
      phaseDefinitions: { feedback: "Trusted click to visible command disabled state; entry choice uses native change feedback",
        retirement: "Only an initially visible old value supplies retirement timing. Hidden-at-start is unobserved; signed pre-ACK observations are retained without clamping or a measured zero.",
        current: "Trusted click/ACK to actual automatic exact-source App network READY; visible DOM and deliberate presentation delay are separate",
        mobileCache: "App-owned matching result proved before Inspector open; full ACK-to-visible includes deliberate opening delay",
        requestCounts: "Actual browser property/command requests; explicit verification/setup API calls are outside these counts" },
      targets: info.annotations.filter(item => item.type === "performance").map(item => JSON.parse(item.description!) as unknown) };
    await info.attach("descriptor-edit-performance", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    await writeFile(resolve(observer.directory, "native-edit-performance.json"), JSON.stringify(evidence, null, 2));
  }
  expect(records.filter(row => row.kind === "fresh-browser-context-cold-start")).toHaveLength(5);
  expect(records.filter(row => row.kind === "paired-edit")).toHaveLength(20);
});

test("measures cancellation feedback and retains cancellation after an actual accepted demand replies late", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await installObservation(page);
  const smiles = info.project.name.includes("mobile") ? "C".repeat(98) + "O" : "C".repeat(99);
  const project = await imported(request, `Descriptor cancellation ${info.project.name} ${randomUUID()}`, [smiles]);
  const entry = project.entries[0], base = propertyPath(project);
  const observer = await startObserver(info, project.id);
  let release!: () => void, accepted!: () => void, settled!: () => void;
  const held = new Promise<void>(done => { release = done; });
  const serverAccepted = new Promise<void>(done => { accepted = done; });
  const delivered = new Promise<void>(done => { settled = done; });
  let captured = false;
  await page.route(url => url.pathname.startsWith(`${base}/consumers/`), async route => {
    if (captured || route.request().method() !== "PUT") { await route.continue(); return; }
    captured = true;
    const response = await route.fetch();
    expect(response.ok()).toBe(true); accepted();
    await held;
    await route.fulfill({ response }); settled();
  });
  try {
    await open(page, project); await inspect(page, entry.id); await serverAccepted;
    const cancel = region(page).getByRole("button", { name: "Cancel update", exact: true });
    await arm(page, cancel, "__cancel_before__", "__cancel_after__");
    await cancel.evaluate(element => {
      element.addEventListener("click", () => {
        const observer = new MutationObserver(() => {
          if (document.querySelector(".ligand-properties-status")?.textContent?.trim() === "Update cancelled") {
            window.ligandPropertyPerformance.sample!.ready = globalThis.performance.now(); observer.disconnect();
            window.ligandPropertyPerformance.sample!.visibleReady = globalThis.performance.now();
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      }, { once: true, capture: true });
    });
    await cancel.click();
    await expect(region(page).getByRole("status")).toHaveText("Update cancelled No profile selected.");
    const cancellation = await timing(page, false);
    performanceBudget(cancellation.currentMs, 100, "consumer cancellation feedback ms", true);
    release(); await delivered;
    await closeInspector(page); await inspect(page, entry.id);
    await expect(region(page).getByRole("status")).toHaveText("Update cancelled No profile selected.");
    const quietAt = await page.evaluate(() => window.ligandPropertyPerformance.requests.length);
    await page.waitForTimeout(1600);
    const requests = await page.evaluate(() => window.ligandPropertyPerformance.requests);
    expect(requests.slice(quietAt).filter(row => row.method === "PUT" || row.path.endsWith("/read"))).toHaveLength(0);
    expect(requests.filter(row => row.method === "PUT")).toHaveLength(1);
    await region(page).getByRole("button", { name: "Retry", exact: true }).click();
    await expect(carbon(page)).toHaveText(String(smiles.length - (smiles.endsWith("O") ? 1 : 0)), { timeout: 30_000 });
    await checkedRead(request, project, entry);
    const evidence = { scope: "Real accepted HTTP demand; only its delivery is held. Measures consumer feedback and late-reply retirement, not sole-worker termination latency.",
      profile: info.project.name, source: source(entry), cancellation, requests, observerDirectory: observer.directory,
      targets: info.annotations.filter(item => item.type === "performance").map(item => JSON.parse(item.description!) as unknown) };
    await writeFile(resolve(observer.directory, "native-cancellation-performance.json"), JSON.stringify(evidence, null, 2));
    await info.attach("descriptor-cancellation-performance", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  } finally { release(); validateWorkerEvidence(await observer.finish()); }
});

for (const kind of ["repeated", "distinct"] as const) test(`prioritizes an actual active edit while ${kind} 1000-entry descriptor demand and an ordinary job progress`, async ({ page, request }, info) => {
  test.setTimeout(1_200_000);
  await installObservation(page);
  const smiles = Array.from({ length: 1000 }, (_, index) => kind === "repeated" ? "CCCCCCCCCC"
    : "O" + Array.from({ length: 10 }, (_, bit) => index & (1 << bit) ? "N" : "C").join("") + "C".repeat(10));
  const setup = performance.now();
  const mobile = info.project.name.includes("mobile");
  const activeSmiles = "C".repeat(41) + (kind === "distinct" ? "O" : "N") + (mobile ? "O" : "C");
  const activeCarbon = mobile ? 41 : 42;
  let project = await imported(request, `Descriptor bulk ${kind} ${info.project.name} ${randomUUID()}`, [...smiles, activeSmiles], `capacity-${kind}-${info.project.name}.smi`, new Map([[1000, `bulk-active-${info.project.name}-${kind}`]]));
  const active = project.entries.at(-1)!;
  const isolated = await request.post(`/api/v1/projects/${project.id}/entries/${active.id}/isolate`, { data: { expected_revision: project.revision } });
  expect(isolated.ok()).toBe(true); project = await isolated.json() as Project;
  const bulk = project.entries.filter(entry => entry.id !== active.id);
  expect(new Set(bulk.map(entry => entry.ligand_designation.instance_id)).size).toBe(1000);
  if (kind === "repeated") {
    expect(new Set(bulk.map(entry => entry.original_artifact_id)).size).toBe(1);
    expect(new Set(bulk.map(entry => entry.current_artifact_id)).size).toBe(1);
  } else expect(new Set(bulk.map(entry => entry.current_artifact_id)).size).toBe(1000);
  const observer = await startObserver(info, project.id, true);
  const owners: { id: string; payload: { entries: Source[]; descriptor_ids: string[]; sequence: number; active_entry_id: null }; renewed: number }[] = [];
  const aggregateReads: { at: number; elapsedMs: number; owner: string; entries: number; ready: number; status: number }[] = [];
  const consumerUpdates: { at: number; elapsedMs: number; owner: string; entries: number; sequence: number; kind: string; status: number;
    responseAt?: number; responseBody?: string; expiresAt?: string }[] = [];
  const progress: { at: number; ready: number }[] = [];
  const failures: unknown[] = [];
  const heartbeats = maintainConsumerHeartbeats(() => owners, async owner => {
    const started = performance.now();
    const renewed = await request.put(`${propertyPath(project)}/consumers/${owner.id}`, { data: owner.payload });
    const responseAt = performance.now(), responseBody = await renewed.text();
    let expiresAt: string | undefined;
    try {
      const decoded = JSON.parse(responseBody) as { expires_at?: unknown };
      if (typeof decoded.expires_at === "string") expiresAt = decoded.expires_at;
    } catch { /* Preserve the original body if an unsuccessful response is not JSON. */ }
    consumerUpdates.push({ at: started, elapsedMs: responseAt - started, responseAt, responseBody, expiresAt,
      owner: owner.id, entries: owner.payload.entries.length, sequence: owner.payload.sequence,
      kind: "same-sequence-heartbeat", status: renewed.status() });
    expect(renewed.ok()).toBe(true);
  });
  let evidence: Record<string, unknown> = { kind, profile: info.project.name };
  let completed = false;
  try {
    const editablePreflight = await preflightEditableFixture(project, active, activeSmiles, observer.directory, `bulk-active-${kind}`, `bulk-active-${info.project.name}-${kind}`);
    evidence = { ...evidence, editablePreflight,
      fixtureSetup: "1000 graph-only bulk inputs unchanged; active entry imported separately from a frozen idealized/unoptimized SDF before measured dispatch" };
    await open(page, project); await inspect(page, active.id);
    await expect(carbon(page)).toHaveText(String(activeCarbon), { timeout: 30_000 });
    const initial = await checkedRead(request, project, active);
    const preparedButton = await editControls(page, active);
    const setupMsExcluded = performance.now() - setup;
    for (let offset = 0; offset < 1000; offset += 200) {
      const allocationStarted = performance.now();
      const allocation = await request.post(`${propertyPath(project)}/consumers`);
      heartbeats.check();
      expect(allocation.ok()).toBe(true);
      const id = (await allocation.json() as { consumer_id: string }).consumer_id;
      consumerUpdates.push({ at: allocationStarted, elapsedMs: performance.now() - allocationStarted,
        owner: id, entries: 0, sequence: 0, kind: "allocate", status: allocation.status() });
      const payload = { entries: bulk.slice(offset, offset + 200).map(source), descriptor_ids: [], sequence: 1, active_entry_id: null };
      const submittedAt = performance.now();
      const submitted = await request.put(`${propertyPath(project)}/consumers/${id}`, { data: payload });
      heartbeats.check();
      expect(submitted.ok()).toBe(true);
      consumerUpdates.push({ at: submittedAt, elapsedMs: performance.now() - submittedAt,
        owner: id, entries: payload.entries.length, sequence: 1, kind: "demand", status: submitted.status() });
      owners.push({ id, payload, renewed: performance.now() });
      heartbeats.changed();
    }
    expect(new Set(owners.map(owner => owner.id)).size).toBe(5);
    await expect.poll(async () => Object.values((await observer.read()).jobs).some(job => job.execution_id
      && job.captures?.some(capture => capture.targets.some(target => bulk.some(entry => entry.id === target.source.entry_id)))), { timeout: 30_000 }).toBe(true);
    heartbeats.check();
    const ordinary = await request.post(`/api/v1/projects/${project.id}/jobs`, { data: {
      job_type: "molweave.demo.structure_statistics", parameters: { step_count: 1, delay_ms: 0 }, inputs: [{ role: "structure", entry_id: active.id }],
    } });
    heartbeats.check();
    expect(ordinary.ok()).toBe(true);
    const ordinaryJob = await ordinary.json() as { id: string; created_at: string };
    const dispatchRead = await request.post(`${propertyPath(project)}/read`, { data: { entries: owners.at(-1)!.payload.entries, descriptor_ids: [] } });
    heartbeats.check();
    expect(dispatchRead.ok()).toBe(true);
    const pendingAtDispatch = (await dispatchRead.json() as { entries: Current[] }).entries.filter(row => row.status === "pending").length;
    const changed = await actualEdit(page, request, project, activeCarbon, preparedButton); project = changed.project;
    heartbeats.check();
    expect(changed.current.report!.input_hash).not.toBe(initial.report!.input_hash);
    expect(changed.timing.networkCurrentMs).not.toBeNull();
    performanceBudget(changed.timing.networkCurrentMs!, 5000, "active edit to automatic current App READY during 1000-entry bulk ms", true);
    const deadline = performance.now() + 900_000;
    let readyCount = 0;
    let inputHashes = new Set<string>();
    let finalBindings: { source: Source; inputHash: string }[] = [];
    while (readyCount < 1000) {
      heartbeats.check();
      expect(performance.now()).toBeLessThan(deadline);
      readyCount = 0; inputHashes = new Set<string>(); finalBindings = [];
      for (const owner of owners) {
        const started = performance.now();
        const response = await request.post(`${propertyPath(project)}/read`, { data: { entries: owner.payload.entries, descriptor_ids: [] } });
        heartbeats.check();
        expect(response.ok()).toBe(true);
        const rows = (await response.json() as { entries: Current[] }).entries;
        aggregateReads.push({ at: started, elapsedMs: performance.now() - started, owner: owner.id,
          entries: rows.length, ready: rows.filter(row => row.status === "ready").length, status: response.status() });
        expect(rows.map(row => row.source)).toEqual(owner.payload.entries);
        expect(collectBulkPropertyValidationErrors(rows)).toEqual([]);
        for (const row of rows) {
          if (row.status === "ready") {
            inputHashes.add(row.report!.input_hash);
            finalBindings.push({ source: row.source, inputHash: row.report!.input_hash });
            readyCount++;
          }
        }
      }
      progress.push({ at: performance.now(), ready: readyCount });
      if (readyCount < 1000) await page.waitForTimeout(750);
    }
    const ordinaryRead = await request.get(`/api/v1/jobs/${ordinaryJob.id}`);
    heartbeats.check();
    expect(ordinaryRead.ok()).toBe(true); expect((await ordinaryRead.json() as { status: string }).status).toBe("completed");
    expect(inputHashes.size).toBe(kind === "repeated" ? 1 : 1000);
    evidence = { ...evidence, setupMsExcluded, active: changed.timing, changedSource: source(changed.entry),
      changedInputHash: changed.automaticReady.inputHash,
      ordinaryJobId: ordinaryJob.id, ordinaryQueuedAt: ordinaryJob.created_at, progress, readyCount,
      owners: owners.map(owner => ({ id: owner.id, sequence: owner.payload.sequence, entries: owner.payload.entries.length })),
      qualifiedDistinctInputHashes: inputHashes.size, activeRequests: changed.requests,
      aggregateReads, consumerUpdates, finalBindings,
      targets: info.annotations.filter(item => item.type === "performance").map(item => JSON.parse(item.description!) as unknown),
      pendingInLast200BeforeClickDiagnosticOnly: pendingAtDispatch,
      overlapScope: "Accepted exact-source/generation work-order proof is evaluated separately; pre-click counts do not qualify overlap" };
    completed = true;
  } catch (error) { failures.push(error); }
  finally {
    await finishBulkQualification();
  }

  async function finishBulkQualification() {
    // Await the sole in-flight sequence1 renewal before any sequence2 release.
    // Cleanup failures must not bypass observer/evidence preservation or hide the first error.
    try { await heartbeats.stop(); } catch (error) { failures.push(error); }
    for (const owner of owners) {
      try { expect((await request.delete(`${propertyPath(project)}/consumers/${owner.id}?sequence=2`)).ok()).toBe(true); }
      catch (error) { failures.push(error); }
    }
    if (completed) {
      try { await expect.poll(async () => Object.values((await observer.read()).jobs).filter(job => job.execution_id).every(job => job.reaped), { timeout: 15_000 }).toBe(true); }
      catch (error) { failures.push(error); }
    }
    let observation: Observation | undefined;
    try { observation = await observer.finish(); } catch (error) { failures.push(error); }
    const jobs = Object.values(observation?.jobs ?? {}).sort((left, right) => (left.started_at ?? "").localeCompare(right.started_at ?? ""));
    const output = resolve(observer.directory, "native-bulk-performance.json");
    const browserEvidence = await page.evaluate(() => ({ requests: window.ligandPropertyPerformance.requests,
      clock: { installed: window.ligandPropertyPerformance.clock, observed: window.ligandPropertyPerformance.readClock() } }))
      .catch((error: unknown) => { failures.push(error); return undefined; });
    evidence = { ...evidence, actualOrder: jobs, retained: observation?.retained, observerDirectory: observer.directory,
      allAppRequests: browserEvidence?.requests, browserClock: browserEvidence?.clock,
      aggregateReads, consumerUpdates, progress,
      owners: owners.map(owner => ({ id: owner.id, sequence: owner.payload.sequence, entries: owner.payload.entries.length })),
      leaseMaintenance: "One serial independent20s-due lane; same payload/sequence/60s lease, no retries; stopped and awaited before release",
      failures: failures.map(String),
      hardWorkOrderStatus: completed ? "not_yet_evaluated" : "incomplete_workload" };
    // Keep exact workload/source/request facts even if a hard qualification
    // assertion rejects this run. The raw store and trace remain authoritative.
    await writeFile(output, JSON.stringify(evidence, null, 2));
    try {
      if (!observation) throw new Error("Worker observation did not finish; qualification incomplete");
      validateWorkerEvidence(observation);
      const hardWorkOrder = completed ? await workOrderProof(observation, evidence.changedSource as Source,
        String(evidence.changedInputHash), evidence.activeRequests as FetchSample[], bulk,
        String(evidence.ordinaryJobId), String(evidence.ordinaryQueuedAt), kind === "distinct") : null;
      evidence = { ...evidence, hardWorkOrder, hardWorkOrderStatus: completed ? "passed" : "incomplete_workload" };
    } catch (error) {
      failures.push(error);
      evidence = { ...evidence, hardWorkOrderStatus: "failed", hardWorkOrderError: String(error) };
      await writeFile(output, JSON.stringify(evidence, null, 2));
    }
    if (completed) {
      try {
        expect(jobs.filter(job => job.execution_id).every(job => job.reaped)).toBe(true);
        expect(jobs.filter(job => job.execution_id).length).toBeLessThanOrEqual(Math.ceil(1000 / 8) + 4);
      } catch (error) { failures.push(error); }
    }
    evidence = { ...evidence, failures: failures.map(String) };
    await writeFile(output, JSON.stringify(evidence, null, 2));
    try { await info.attach("descriptor-bulk-performance", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" }); }
    catch (error) { failures.push(error); }
    if (failures.length) throw failures[0];
    // The hard ordinary bound is checked against actual productive coordinator
    // turns above, including warm/failure progress; child starts cannot prove it.

  }
});
