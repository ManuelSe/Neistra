import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { Entry, Project } from "../../../apps/web/src/api/types";
import type { DescriptorReport, PropertyAggregate, PropertySource } from "../../../apps/web/src/ligandProperties/types";
import type { ProfileConstraint, ProfileRegistry } from "../../../apps/web/src/ligandProfiles/types";
import { createObserverSnapshotReader } from "./observer-snapshot";

export const PROFILE_DESCRIPTORS = ["molecular_weight", "hbd", "hba", "calculated_logp"];
export const COMPOSITE_DESCRIPTORS = [...PROFILE_DESCRIPTORS.slice(0, 3), "tpsa", "calculated_logp", "rotatable_bond_count"];
export const fixtureSizes = [10, 26, 46, 66, 86];
export const digest = (body: string | Uint8Array) => createHash("sha256").update(body).digest("hex");

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function distribution(samples: readonly number[], target: number) {
  check(samples.length > 0 && samples.every(n => Number.isFinite(n) && n >= 0), "Every timing sample must be observed, finite and nonnegative");
  const ordered = [...samples].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  return { n: ordered.length, median: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2,
    p95_nearest_rank: ordered[Math.ceil(ordered.length * .95) - 1], max: ordered.at(-1)!, target,
    misses: ordered.filter(n => n > target).length };
}
export function source(entry: Entry): PropertySource {
  const d = entry.ligand_designation;
  check(d.status === "resolved" && d.instance_id && entry.current_artifact_id, "An exact resolved current ligand is required");
  return { entry_id: entry.id, source_artifact_id: entry.current_artifact_id, instance_id: d.instance_id, atom_ids: [...d.atom_ids] };
}
export function sameSource(a: PropertySource, b: PropertySource) {
  return a.entry_id === b.entry_id && a.source_artifact_id === b.source_artifact_id && a.instance_id === b.instance_id
    && a.atom_ids.length === b.atom_ids.length && a.atom_ids.every((id, i) => id === b.atom_ids[i]);
}
export function cacheBasis(body: PropertyAggregate, wanted: PropertySource, ids: readonly string[]) {
  check(body.entries.length === 1 && sameSource(body.entries[0].source, wanted), "Read-only cache baseline must match the complete exact source");
  const row = body.entries[0];
  const ready = ids.filter(id => row.report?.values.some(v => v.descriptor_id === id && v.status === "ready" && typeof v.value === "number" && Number.isFinite(v.value)));
  return { status: row.status, binding_key: row.binding_key, input_hash: row.report?.input_hash ?? null,
    ready_descriptor_ids: ready, missing_descriptor_ids: ids.filter(id => !ready.includes(id)),
    numerical_cache: ready.length === ids.length && row.status === "ready" ? "matching-ready"
      : ready.length === 0 ? "missing-required-coverage" : "partial-required-coverage" };
}
export function coldRequirement(raw: string | undefined) {
  check(raw === undefined || raw === "0" || raw === "1", "NEISTRA_PROFILE_REQUIRE_COLD must be 0 or 1");
  return raw === "1";
}
export function classifyFirstSelection(basis: ReturnType<typeof cacheBasis>, requireCold: boolean) {
  const classification = basis.numerical_cache === "matching-ready" ? "shared-cache-ready"
    : basis.ready_descriptor_ids.length === 0 && basis.missing_descriptor_ids.length > 0 ? "numerical-cold-missing"
    : "shared-cache-partial";
  check(!requireCold || classification === "numerical-cold-missing",
    "Focused cold qualification requires genuinely missing numerical coverage; fresh context is insufficient");
  return classification;
}
export function constraints(registry: ProfileRegistry, id: string): ProfileConstraint[] {
  const found = new Map<string, ProfileConstraint>(), visited = new Set<string>();
  const visit = (key: string) => {
    check(!visited.has(key), "Profile component cycle or duplicate traversal"); visited.add(key);
    const p = registry.profiles.find(p => p.id === key); check(p, "Missing profile definition");
    for (const cid of p.constraint_ids) {
      const c = registry.constraints.find(c => c.id === cid); check(c, "Missing constraint"); found.set(cid, c);
    }
    for (const child of p.component_ids) visit(child);
  };
  visit(id); return [...found.values()];
}
export interface CriterionRow { name: string; value: string; criterion: string; outcome: string }
export function expectedCriteria(registry: ProfileRegistry, profileId: string, report: DescriptorReport): CriterionRow[] {
  check(report.model_status === "qualified", "Performance specimen requires independently qualified chemistry");
  check(Object.entries(registry.descriptor_method).every(([key, value]) => report[key as keyof DescriptorReport] === value), "Descriptor method mismatch");
  const operators = { lt: "<", le: "≤", gt: ">", ge: "≥" };
  return constraints(registry, profileId).map(c => {
    const definition = registry.descriptors.find(d => d.id === c.descriptor_id);
    const value = report.values.find(v => v.descriptor_id === c.descriptor_id);
    check(definition && value?.status === "ready" && typeof value.value === "number" && Number.isFinite(value.value), "A missing or failed value cannot become a criterion number");
    const n = value.value, met = c.operator === "lt" ? n < c.limit : c.operator === "le" ? n <= c.limit : c.operator === "gt" ? n > c.limit : n >= c.limit;
    const unit = definition.unit ? ` ${definition.unit}` : "";
    return { name: definition.name, value: `Value: ${n}${unit}`, criterion: `Criterion: ${operators[c.operator]} ${c.limit}${unit}`, outcome: met ? "Met" : "Not met" };
  });
}
export function assertReport(actual: DescriptorReport, independent: DescriptorReport, ids: readonly string[], context: DescriptorReport = independent) {
  check(actual.model_status === "qualified" && independent.model_status === "qualified" && context.model_status === "qualified"
    && /^[a-f0-9]{64}$/.test(actual.input_hash) && /^[a-f0-9]{64}$/.test(independent.input_hash), "Current and independent reports must be qualified");
  check(actual.input_hash === context.input_hash, "Current input hash differs from independently qualified source context");
  check(JSON.stringify(actual.provenance) === JSON.stringify(context.provenance), "Current qualification provenance differs from source context");
  check(actual.contains_formally_charged_atoms === context.contains_formally_charged_atoms
    && actual.contains_formally_charged_atoms === independent.contains_formally_charged_atoms, "Current charge-presence fact differs from independent preflight");
  for (const key of ["implementation_version", "library_version", "policy_version"] as const) {
    check(actual[key] === independent[key] && actual[key] === context[key], `Changed ${key}`);
  }
  const integerIds = new Set(["heavy_atom_count", "heteroatom_count", "carbon_count", "formal_charge", "hbd", "hba",
    "rotatable_bond_count", "ring_count", "aromatic_ring_count"]);
  for (const id of ids) {
    const a = actual.values.find(v => v.descriptor_id === id), b = independent.values.find(v => v.descriptor_id === id);
    check(a?.status === "ready" && b?.status === "ready" && typeof a.value === "number" && typeof b.value === "number"
      && Number.isFinite(a.value) && Number.isFinite(b.value)
      && (integerIds.has(id) ? Number.isInteger(a.value) && Number.isInteger(b.value) && a.value === b.value
        : Math.abs(a.value - b.value) <= 1e-10), `Current value differs from independent preflight: ${id}`);
  }
}
export interface Clock { timeOrigin: number; dateBeforeMs: number; performanceNowMs: number; dateAfterMs: number }
export interface Snapshot { profileId: string | null; status: string | null; rows: CriterionRow[]; visible: boolean;
  statusVisible: boolean; profileControlVisible: boolean }
export interface FetchRecord { at: number; timeOrigin: number; method: string; path: string; body: unknown;
  snapshot?: Snapshot; responseAt?: number; observedAt?: number; status?: number; response?: PropertyAggregate; error?: string }
export interface Sample { label: string; event: "change" | "click"; armedAt: number; startedAt?: number; eventTrusted?: boolean;
  feedbackAt?: number; currentAt?: number; visibleCurrentAt?: number; retiredAt?: number; targetProfile: string; expectedRows: CriterionRow[];
  feedbackBasis?: "native-selected-value" | "visible-status" | "disabled-command";
  completionStatus?: string; oldRows: CriterionRow[]; initial?: Snapshot; retirementUnavailable?: string; currentVisible?: boolean }
export interface BrowserEvidence { clock: Clock; observedClock?: Clock; requests: FetchRecord[]; samples: Sample[]; sample?: Sample;
  snapshots: { at: number; snapshot: Snapshot }[]; control?: Element; readSnapshot: () => Snapshot; observer: MutationObserver }
declare global { interface Window { profilePerformance: BrowserEvidence } }

/** Observation has overhead; it does not modify application state or add network reads. */
export async function installObservation(page: Page) {
  await page.addInitScript(() => {
    const clock = (): Clock => { const dateBeforeMs = Date.now(), performanceNowMs = performance.now(), dateAfterMs = Date.now();
      return { timeOrigin: performance.timeOrigin, dateBeforeMs, performanceNowMs, dateAfterMs }; };
    const visibleElement = (node: Element | null | undefined) => {
      const bounds = node?.getBoundingClientRect();
      return !!node && !!bounds && bounds.width > 0 && bounds.height > 0 && bounds.top < innerHeight && bounds.bottom > 0
        && bounds.left < innerWidth && bounds.right > 0 && getComputedStyle(node).visibility !== "hidden"
        && !node.closest('[aria-hidden="true"], [inert]');
    };
    const snapshot = (): Snapshot => {
      const root = document.querySelector(".ligand-profile"), criteria = root?.querySelector(".ligand-profile-criteria"), status = root?.querySelector('[role="status"]');
      return { profileId: root?.querySelector("select")?.value ?? null, status: root?.querySelector('[role="status"]')?.textContent ?? null,
        visible: visibleElement(criteria), statusVisible: visibleElement(status), profileControlVisible: visibleElement(root?.querySelector("select")),
        rows: [...(root?.querySelectorAll(".ligand-profile-criteria > div") ?? [])].map(row => {
          const spans = row.querySelectorAll("dd > span");
          return { name: row.querySelector("dt")?.textContent ?? "", value: spans[0]?.textContent ?? "", criterion: spans[1]?.textContent ?? "", outcome: spans[2]?.textContent ?? "" };
        }) };
    };
    const state = { clock: clock(), requests: [], samples: [], snapshots: [], readSnapshot: snapshot } as unknown as BrowserEvidence;
    const equal = (a: CriterionRow[], b: CriterionRow[]) => a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));
    const observe = () => {
      const now = performance.now(), current = snapshot();
      if (JSON.stringify(state.snapshots.at(-1)?.snapshot) !== JSON.stringify(current)) state.snapshots.push({ at: now, snapshot: current });
      const s = state.sample; if (!s || s.startedAt === undefined || s.eventTrusted !== true) return;
      if (s.feedbackAt === undefined) {
        if (current.statusVisible && /Updating|Loading|unavailable|cancelled/i.test(current.status ?? "")) {
          s.feedbackAt = now; s.feedbackBasis = "visible-status";
        } else if (s.event === "change" && current.profileId === s.targetProfile && current.profileControlVisible) {
          s.feedbackAt = now; s.feedbackBasis = "native-selected-value";
        } else if (state.control?.matches(":disabled") && visibleElement(state.control)) {
          s.feedbackAt = now; s.feedbackBasis = "disabled-command";
        }
      }
      if (s.initial?.visible && s.oldRows.length && s.retiredAt === undefined && !equal(current.rows, s.oldRows)) s.retiredAt = now;
      if (current.profileId === s.targetProfile && equal(current.rows, s.expectedRows)
        && (s.completionStatus ? current.status?.includes(s.completionStatus)
          : /Within profile criteria\.|Outside profile criteria\.|No profile selected\./.test(current.status ?? ""))) {
        if (s.currentAt === undefined) { s.currentAt = now; s.currentVisible = current.visible; }
        if (current.visible && s.visibleCurrentAt === undefined) s.visibleCurrentAt = now;
      }
    };
    state.observer = new MutationObserver(observe); state.observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    window.profilePerformance = state;
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args, url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      const selected = url.pathname.includes("/ligand-properties") || url.pathname === "/api/v1/ligand-profiles/registry"
        || /\/(model-edits|history\/undo|history\/redo)$/.test(url.pathname);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      let body: unknown = null; if (typeof init?.body === "string") { try { body = JSON.parse(init.body); } catch { body = "non-JSON"; } }
      const record: FetchRecord = { at: performance.now(), timeOrigin: state.clock.timeOrigin, method, path: url.pathname, body, snapshot: snapshot() };
      if (selected) state.requests.push(record);
      try {
        const response = await original(...args); record.responseAt = performance.now(); record.status = response.status;
        if (selected && /\/ligand-properties\/(read|consumers\/[^/]+)$/.test(url.pathname) && ["POST", "PUT"].includes(method)) {
          void response.clone().json().then((body: PropertyAggregate) => { record.response = body; record.observedAt = performance.now(); }, error => { record.error = String(error); });
        }
        return response;
      } catch (error) { record.error = String(error); throw error; }
    };
    document.addEventListener("change", observe, true);
  });
}
export async function arm(page: Page, control: Locator, label: string, targetProfile: string, expectedRows: CriterionRow[], event: "change" | "click" = "change", completionStatus?: string) {
  await control.evaluate((node, arg) => {
    const state = window.profilePerformance;
    state.control = node;
    const sample: Sample = { ...arg, armedAt: performance.now(), oldRows: state.readSnapshot().rows };
    state.sample = sample; state.samples.push(sample);
    node.addEventListener(arg.event, e => {
      sample.startedAt = performance.now(); sample.eventTrusted = e.isTrusted; sample.initial = state.readSnapshot();
      if (!sample.initial.visible) sample.retirementUnavailable = "Profile criteria hidden at trigger; no visible retirement latency";
      else if (!sample.oldRows.length) sample.retirementUnavailable = "No old criteria at trigger";
      const bounds = node.getBoundingClientRect();
      if (arg.event === "change" && e.isTrusted && node instanceof HTMLSelectElement && node.value === arg.targetProfile
        && bounds.width > 0 && bounds.height > 0 && bounds.top < innerHeight && bounds.bottom > 0
        && bounds.left < innerWidth && bounds.right > 0 && getComputedStyle(node).visibility !== "hidden"
        && !node.closest('[aria-hidden="true"], [inert]')) {
        sample.feedbackAt = performance.now(); sample.feedbackBasis = "native-selected-value";
      }
    }, { capture: true, once: true });
  }, { label, targetProfile, expectedRows, event, completionStatus });
}
export async function evidence(page: Page) {
  return page.evaluate(() => { const state = window.profilePerformance, dateBeforeMs = Date.now(), performanceNowMs = performance.now(), dateAfterMs = Date.now();
    return { clock: state.clock, observedClock: { timeOrigin: performance.timeOrigin, dateBeforeMs, performanceNowMs, dateAfterMs },
      requests: state.requests, samples: state.samples, snapshots: state.snapshots }; });
}
export function durations(sample: Sample, ackAt?: number) {
  check(sample.startedAt !== undefined && sample.eventTrusted === true, "A trusted browser trigger is mandatory");
  const elapsed = (at: number | undefined) => {
    if (at === undefined) return null;
    check(Number.isFinite(at) && at >= sample.startedAt!, "Observation precedes browser trigger");
    return at - sample.startedAt!;
  };
  return { feedback_ms: elapsed(sample.feedbackAt), feedback_basis: sample.feedbackBasis ?? null, current_criteria_ms: elapsed(sample.currentAt),
    visible_current_criteria_ms: elapsed(sample.visibleCurrentAt), retirement_ms: elapsed(sample.retiredAt),
    retirement_relative_to_ack_ms: sample.retiredAt !== undefined && ackAt !== undefined ? sample.retiredAt - ackAt : null,
    retirement_unavailable_reason: sample.retiredAt === undefined
      ? sample.retirementUnavailable ?? "No changed old criteria observation" : null,
    feedback_unavailable_reason: sample.feedbackAt === undefined ? "No feedback DOM observation" : null,
    current_criteria_unavailable_reason: sample.currentAt === undefined ? "No matching completed criteria DOM observation" : null,
    visible_current_unavailable_reason: sample.visibleCurrentAt === undefined ? "Current criteria not observed in visible viewport" : null };
}
export function requestCounts(requests: readonly FetchRecord[]) {
  return { requests: requests.length,
    metadata: requests.filter(r => r.path === "/api/v1/ligand-profiles/registry").length,
    allocations: requests.filter(r => r.method === "POST" && /\/ligand-properties\/consumers$/.test(r.path)).length,
    demands: requests.filter(r => r.method === "PUT" && /\/ligand-properties\/consumers\/[^/]+$/.test(r.path)).length,
    reads: requests.filter(r => r.method === "POST" && /\/ligand-properties\/read$/.test(r.path)).length,
    releases: requests.filter(r => r.method === "DELETE" && /\/ligand-properties\/consumers\/[^/]+$/.test(r.path)).length };
}
/** Timing observation only; independent scientific qualification is still mandatory. */
export function observedReady(requests: readonly FetchRecord[], wanted: PropertySource) {
  for (const request of requests) {
    if (request.status !== 200 || request.observedAt === undefined || request.responseAt === undefined) continue;
    const current = request.response?.entries?.find(row => sameSource(row.source, wanted) && row.status === "ready" && row.report);
    if (!current?.report) continue;
    return { timeOrigin: request.timeOrigin, request_at: request.at, response_at: request.responseAt, observed_at: request.observedAt,
      source: current.source, binding_key: current.binding_key, input_hash: current.report.input_hash, report: current.report,
      consumer_id: request.response?.consumer_id ?? null, sequence: request.response?.sequence ?? null };
  }
  return null;
}
export function matchingReady(requests: readonly FetchRecord[], wanted: PropertySource, independent: DescriptorReport, ids: readonly string[], context: DescriptorReport = independent) {
  const observed = observedReady(requests, wanted);
  if (observed) assertReport(observed.report, independent, ids, context);
  return observed;
}
export async function fixture(profile: string, size: number) {
  const dir = resolve("tests/fixtures/ligand-properties-performance/editable"), bytes = await readFile(resolve(dir, "manifest.json"));
  const manifest = JSON.parse(bytes.toString()) as { fixtures: { id: string; intended_smiles: string; filename: string; bytes: number; sha256: string }[] };
  const id = `paired-${profile}-${size}`, rows = manifest.fixtures.filter(row => row.id === id); check(rows.length === 1, "One frozen specimen required");
  const row = rows[0]; check(row.filename === `${id}.sdf`, "Unsafe fixture filename");
  const data = await readFile(resolve(dir, row.filename)); check(data.length === row.bytes && digest(data) === row.sha256, "Frozen original changed");
  return { ...row, data, manifest_sha256: digest(bytes) };
}
export function store() {
  const legacy = process.env.NEISTRA_E2E_DATA_DIR === undefined && process.env.MOLWEAVE_E2E_DATA_DIR !== undefined;
  const data = resolve(process.env.NEISTRA_E2E_DATA_DIR ?? process.env.MOLWEAVE_E2E_DATA_DIR ?? ".neistra-e2e");
  return { data, database: resolve(data, legacy ? "molweave.db" : "neistra.db") };
}
async function runSetupActor(args: string[], directory: string, label: string) {
  const started = performance.now(), interpreter = resolve(".venv/bin/python");
  const child = spawn(interpreter, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  let stdout = "", stderr = ""; child.stdout.on("data", x => { stdout += String(x); }); child.stderr.on("data", x => { stderr += String(x); });
  const completion = await new Promise<{ code: number | null; signal: string | null }>((done, fail) => { child.once("error", fail); child.once("close", (code, signal) => done({ code, signal })); });
  await writeFile(resolve(directory, "stdout.log"), stdout); await writeFile(resolve(directory, "stderr.log"), stderr);
  await writeFile(resolve(directory, "execution.json"), JSON.stringify({ argv: [interpreter, ...args], ...completion, setup_ms_excluded: performance.now() - started }, null, 2));
  check(completion.code === 0 && completion.signal === null, `${label} failed: ${stderr}`);
}
export async function preflight(project: Project, row: Awaited<ReturnType<typeof fixture>>, directory: string) {
  const out = resolve(directory, `preflight-${row.id}`); await mkdir(out);
  const entry = project.entries[0], requirements = resolve(out, "requirements.json");
  await writeFile(requirements, JSON.stringify({ project_id: project.id, source: source(entry), original_artifact_id: entry.original_artifact_id,
    smiles: row.intended_smiles, fixture_id: row.id }, null, 2));
  const owned = store(), args = ["-m", "tests.support.ligand_profiles_performance_preflight", "preflight", "--database", owned.database,
    "--data-dir", owned.data, "--requirements", requirements, "--output-dir", resolve(out, "qualification")];
  await runSetupActor(args, out, "Independent paired preflight");
  const resultBytes = await readFile(resolve(out, "qualification/result.json"));
  const paired = JSON.parse(resultBytes.toString()) as { schema: string; independent_no_original: {
    source: PropertySource; original_sha256: string; source_sha256: string; before_report: DescriptorReport; after_report: DescriptorReport;
    original_recovery_disabled: boolean; no_shared_cache_or_API_descriptor_work: boolean };
    source_context: { source: PropertySource; original_sha256: string; source_sha256: string; before_report: DescriptorReport; disposable_after_report: DescriptorReport;
      independent_no_original_vectors_reproduced: boolean; context_vectors_match_independent_numerical_oracle: boolean; no_shared_cache_or_API_descriptor_work: boolean };
    independent_result_sha256: string; source_context_sha256: string };
  const result = paired.independent_no_original, context = paired.source_context;
  check(paired.schema === "profile-performance-paired-preflight-v1", "Paired independent/source-context preflight required");
  check(sameSource(result.source, source(entry)) && result.original_sha256 === row.sha256 && /^[a-f0-9]{64}$/.test(result.source_sha256)
    && result.original_recovery_disabled && result.no_shared_cache_or_API_descriptor_work, "Preflight source/setup authority mismatch");
  for (const report of [result.before_report, result.after_report]) check(report.model_status === "qualified" && report.values.length === 14
    && report.values.every(v => v.status === "ready" && typeof v.value === "number" && Number.isFinite(v.value)), "Preflight must independently qualify both complete vectors");
  check(sameSource(context.source, result.source) && context.original_sha256 === result.original_sha256 && context.source_sha256 === result.source_sha256
    && context.independent_no_original_vectors_reproduced && context.context_vectors_match_independent_numerical_oracle
    && context.no_shared_cache_or_API_descriptor_work, "Source-context proof differs from retained independent source");
  for (const phase of ["before_report", "after_report"] as const) {
    const contextual = phase === "before_report" ? context.before_report : context.disposable_after_report;
    assertReport(contextual, result[phase], result[phase].coverage, contextual);
  }
  check(digest(await readFile(resolve(out, "qualification/independent-result.json"))) === paired.independent_result_sha256
    && digest(await readFile(resolve(out, "qualification/source-context.json"))) === paired.source_context_sha256, "Paired preflight artifact hashes changed");
  return { directory: out, result, context, result_sha256: digest(resultBytes) };
}
export async function publishedContext(project: Project, entry: Entry, qualified: Awaited<ReturnType<typeof preflight>>,
  phase: "before" | "after", directory: string, label: string, expectedCanonicalSha256?: string) {
  const out = resolve(directory, `published-${label}`); await mkdir(out);
  const requirements = resolve(out, "requirements.json"), owned = store();
  await writeFile(requirements, JSON.stringify({ project_id: project.id, source: source(entry), original_artifact_id: entry.original_artifact_id,
    preflight_directory: qualified.directory, preflight_sha256: qualified.result_sha256, phase,
    ...(expectedCanonicalSha256 ? { expected_canonical_sha256: expectedCanonicalSha256 } : {}) }, null, 2));
  const args = ["-m", "tests.support.ligand_profiles_performance_preflight", "current-context", "--database", owned.database,
    "--data-dir", owned.data, "--requirements", requirements, "--output-dir", resolve(out, "qualification")];
  await runSetupActor(args, out, "Published source-context proof");
  const bytes = await readFile(resolve(out, "qualification/result.json"));
  const result = JSON.parse(bytes.toString()) as { schema: string; source: PropertySource; source_sha256: string; original_sha256: string;
    preflight_sha256: string; report: DescriptorReport; no_shared_cache_or_API_descriptor_work: boolean;
    actual_published_graph_ids_coordinates_match_independent_trial: boolean };
  check(result.schema === "profile-performance-published-context-v1" && sameSource(result.source, source(entry))
    && result.preflight_sha256 === qualified.result_sha256 && result.original_sha256 === qualified.result.original_sha256
    && result.no_shared_cache_or_API_descriptor_work && result.actual_published_graph_ids_coordinates_match_independent_trial,
  "Published context does not qualify the exact accepted source");
  check(digest(await readFile(resolve(out, "qualification/actual-source.json"))) === result.source_sha256
    && digest(await readFile(resolve(out, "qualification/actual-original.sdf"))) === result.original_sha256, "Published retained bodies changed");
  if (expectedCanonicalSha256) check(result.source_sha256 === expectedCanonicalSha256, "Redo did not restore edited canonical bytes");
  return { directory: out, result, result_sha256: digest(bytes) };
}
export async function consumerState(directory: string, projectIds: string[]) {
  const out = resolve(directory, "consumer-state"); await mkdir(out);
  const projects = resolve(out, "projects.json"), output = resolve(out, "result.json"), owned = store();
  await writeFile(projects, JSON.stringify(projectIds));
  const args = ["-m", "tests.support.ligand_profiles_performance_preflight", "consumer-state", "--database", owned.database,
    "--data-dir", owned.data, "--projects", projects, "--output", output];
  await runSetupActor(args, out, "Read-only consumer proof");
  const body = await readFile(output), result = JSON.parse(body.toString()) as {
    schema: string; project_ids: string[]; retained_total: number; owned_live_count: number;
    owned_records: { id: string; project_id: string; released: number; expired: boolean; live: boolean }[] };
  check(result.schema === "profile-performance-consumer-state-v1" && JSON.stringify(result.project_ids) === JSON.stringify(projectIds), "Consumer proof scope differs");
  check(Number.isSafeInteger(result.retained_total) && result.retained_total >= 0 && result.retained_total <= 256, "Retained consumer record bound exceeded");
  check(result.owned_live_count === 0 && result.owned_records.every(row => projectIds.includes(row.project_id) && !row.live
    && (row.released === 1 || row.expired)), "Owned property consumer demand remains live");
  return { directory: out, result_sha256: digest(body), ...result };
}
export interface JobObservation { id: string; project_id: string; purpose: string; job_type: string; status: string; execution_id: string | null;
  reaped: boolean; provenance: { source_capture?: Record<string, number>; input_materialization?: Record<string, number>; publication_verification?: Record<string, number> } }
export interface WorkerObservation { complete: boolean; samples: number; jobs: Record<string, JobObservation>; retained: Record<string, number>; max_running_property_jobs: number }
export function observer(directory: string) {
  const owned = store(), output = resolve(directory, "worker-observation.json"), stop = resolve(directory, "observer.stop");
  const trace = process.env.NEISTRA_PROPERTY_WORKER_TRACE;
  if (trace) check(resolve(trace) === resolve(owned.data, "qualification/worker-turns.jsonl"), "Unowned worker trace");
  const args = ["-m", "tests.support.ligand_property_performance_qualification", "observe", "--database", owned.database,
    "--output", output, "--stop-file", stop, ...(trace ? ["--turn-trace", resolve(trace)] : [])];
  const child = spawn(resolve(".venv/bin/python"), args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout.on("data", b => { stdout += String(b); }); child.stderr.on("data", b => { stderr += String(b); });
  const completion = new Promise<{ code: number | null; signal: string | null }>((done, fail) => { child.once("error", fail); child.once("close", (code, signal) => done({ code, signal })); });
  const read = createObserverSnapshotReader<WorkerObservation>(() => readFile(output, "utf8"));
  return { read, output, async finish() {
    await writeFile(stop, "stop\n");
    const timeout = Symbol("timeout"); let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([completion, new Promise<typeof timeout>(done => { timer = setTimeout(() => done(timeout), 15_000); })]);
    if (timer) clearTimeout(timer);
    if (result === timeout) { child.kill("SIGTERM"); await completion; }
    await writeFile(resolve(directory, "observer.stdout"), stdout); await writeFile(resolve(directory, "observer.stderr"), stderr);
    await writeFile(resolve(directory, "observer-execution.json"), JSON.stringify({ argv: [resolve(".venv/bin/python"), ...args], completion: result === timeout ? "timeout" : result }, null, 2));
    check(result !== timeout && result.code === 0 && result.signal === null, "Observer must close positively");
    const final = await read(); check(final?.complete, "Closed observer proof required"); return final;
  } };
}
export function sourceIdentities() {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "apps", "packages", "tests/support", "tests/e2e", "tests/fixtures", "scripts", "pyproject.toml", "uv.lock", "pnpm-lock.yaml", "playwright.config.ts"], { encoding: "utf8" }).split("\0").filter(Boolean);
  return { candidate: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), paths: [...new Set(paths)].sort() };
}
export async function sourceMap(paths: string[]): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(resolve(path)))] as const)));
}
