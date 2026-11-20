import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Locator, Page, Request } from "@playwright/test";
import type { NormalizedStructure } from "../../../apps/web/src/api/types";
import type { DescriptorReport } from "../../../apps/web/src/ligandProperties/types";
import type { ProfileRegistry } from "../../../apps/web/src/ligandProfiles/types";
import type { LigandCandidatesRead, LigandDepictionRead } from "../../../apps/web/src/ligands/types";
import { check, constraints, digest, type preflight } from "./profile-performance";

export interface ComparisonRowOracle {
  descriptor: string; name: string; value: number; integer: boolean; unit: string; rules: { operator: "lt" | "le" | "gt" | "ge"; limit: number; met: boolean }[]; spans: string[]; x: number; y: number; clipped: "low" | "high" | null;
}
export interface ComparisonOracle { profileId: string; rows: ComparisonRowOracle[]; constraints: number }
const operators = { lt: "<", le: "≤", gt: ">", ge: "≥" };

/** Independent manual operator and display-coordinate oracle; never calls the application evaluator. */
export function comparisonOracle(registry: ProfileRegistry, profileId: string, report: DescriptorReport): ComparisonOracle {
  check(report.model_status === "qualified" && report.model_reason === null, "Only qualified positive specimens use this oracle");
  check(Object.entries(registry.descriptor_method).every(([key, value]) => report[key as keyof DescriptorReport] === value), "Scientific method changed");
  const profile = registry.profiles.find(p => p.id === profileId); check(profile?.availability === "available", "Available profile required");
  check(report.contains_formally_charged_atoms === false, "Only uncharged independently qualified positive specimens use this comparison oracle");
  const rules = constraints(registry, profileId), required = new Set(profile.required_descriptor_ids);
  const axes = registry.axes.filter(a => profile.axis_ids.includes(a.id) && required.has(a.descriptor_id));
  check(axes.length === required.size && [...required].every(id => axes.filter(a => a.descriptor_id === id).length === 1), "Unique complete axes required");
  const rows = axes.map((axis, index) => {
    const definition = registry.descriptors.find(d => d.id === axis.descriptor_id);
    const value = report.values.find(v => v.descriptor_id === axis.descriptor_id);
    check(definition && value?.status === "ready" && typeof value.value === "number" && Number.isFinite(value.value), "Missing values cannot be plotted as zero");
    const n = value.value, [low, high] = axis.domain;
    check(axis.normalization === "linear" && Number.isFinite(low) && Number.isFinite(high) && high > low, "Finite increasing linear domain required");
    check(axis.clipping === "mark_and_clip" && axis.missing === "leave_missing", "Unsupported display policy");
    check(axis.numeric_rule === "finite" || axis.numeric_rule === "nonnegative_integer" && Number.isSafeInteger(n) && n >= 0
      || axis.numeric_rule === "safe_integer" && Number.isSafeInteger(n) || axis.numeric_rule === "fraction_0_1" && n >= 0 && n <= 1, "Invalid scientific axis value");
    const unit = definition.unit ? ` ${definition.unit}` : "";
    const clipped: "low" | "high" | null = n < low ? "low" : n > high ? "high" : null;
    const spans = [`${n}${unit}`, `Scale ${low}–${high}${unit}`];
    if (clipped) spans.push(`Outside display scale (${clipped === "low" ? "below" : "above"}); actual value retained`);
    const rowRules = rules.filter(c => c.descriptor_id === axis.descriptor_id).map(rule => ({ ...rule,
      met: rule.operator === "lt" ? n < rule.limit : rule.operator === "le" ? n <= rule.limit : rule.operator === "gt" ? n > rule.limit : n >= rule.limit }));
    for (const rule of rowRules) {
      const met = rule.operator === "lt" ? n < rule.limit : rule.operator === "le" ? n <= rule.limit : rule.operator === "gt" ? n > rule.limit : n >= rule.limit;
      spans.push(`${operators[rule.operator]} ${rule.limit}${unit} · ${met ? "Met" : "Not met"}`);
    }
    const scaled = Math.max(0, Math.min(1, (n - low) / (high - low))), angle = -Math.PI / 2 + 2 * Math.PI * index / axes.length;
    return { descriptor: axis.descriptor_id, name: definition.name, value: n, integer: definition.value_type === "integer", unit, rules: rowRules, spans, clipped,
      x: 120 + 78 * Math.cos(angle) * scaled, y: 120 + 78 * Math.sin(angle) * scaled };
  });
  return { profileId, rows, constraints: rules.length };
}

const formulas: Record<string, readonly [string, string]> = {
  "paired-chromium-10": ["C10H22", "C9H21N"], "paired-chromium-86": ["C86H174", "C85H173N"],
  "paired-mobile-chromium-10": ["C9H20O", "C8H19NO"], "paired-mobile-chromium-86": ["C85H172O", "C84H171NO"],
};
export interface FixtureFacts { atoms: (string | number)[][] }
export function positiveHeaderOracle(id: string, phase: "before" | "after", structure: NormalizedStructure,
  report: DescriptorReport, facts: FixtureFacts, reconciliation: { policy: string; status: string; skipped_count: number; unprocessed_count: number }) {
  const pair = formulas[id]; check(pair, "Only the four frozen positive specimens have analytical formula expectations");
  check(report.model_status === "qualified" && report.model_reason === null && report.contains_formally_charged_atoms === false,
    "Terminal READY does not establish qualified chemistry");
  check(reconciliation.policy === "automatic" && reconciliation.status === "complete" && reconciliation.skipped_count === 0 && reconciliation.unprocessed_count === 0,
    "The independent automatic hydrogen trial must complete");
  check(facts.atoms.length > 0 && facts.atoms.every(a => ["C", "H", "O"].includes(String(a[0])) && a[1] === 0 && a[2] === 0 && a[3] === 0 && a[4] === 0
    && Number.isSafeInteger(a[5]) && Number(a[5]) >= 0), "Frozen positive chemistry must have ordinary neutral nonradical nonisotopic facts");
  const atoms = structure.atoms;
  check(atoms.length > 0 && new Set(atoms.map(a => a.id)).size === atoms.length
    && atoms.every(a => ["C", "H", "N", "O"].includes(a.element) && a.formal_charge === 0), "Explicit ordinary neutral atom membership required");
  const counts = Object.fromEntries(["C", "H", "N", "O"].map(element => [element, atoms.filter(a => a.element === element).length]));
  const formula = ["C", "H", "N", "O"].filter(e => counts[e]).map(e => `${e}${counts[e] === 1 ? "" : counts[e]}`).join("");
  const expected = pair[phase === "before" ? 0 : 1]; check(formula === expected, "Explicit source formula differs from the analytical frozen specimen");
  const originalC = facts.atoms.filter(a => a[0] === "C").length, originalO = facts.atoms.filter(a => a[0] === "O").length;
  const originalH = facts.atoms.filter(a => a[0] === "H").length;
  check(facts.atoms.reduce((n, a) => n + Number(a[5]), 0) === originalH, "Frozen explicit hydrogen membership differs from heavy-atom neighbor counts");
  check(counts.C === originalC - (phase === "after" ? 1 : 0) && counts.O === originalO
    && counts.N === (phase === "after" ? 1 : 0) && counts.H === originalH - (phase === "after" ? 1 : 0), "Formula changed relative to frozen chemistry facts");
  const charge = report.values.find(v => v.descriptor_id === "formal_charge");
  check(charge?.status === "ready" && charge.value === 0, "Independent qualified charge must agree with explicit neutral membership");
  return { formula, charge: "0", atomIds: atoms.map(a => a.id).sort((a, b) => a - b), structure_value_sha256: digest(JSON.stringify(structure)) };
}
export async function headerTrial(qualified: Awaited<ReturnType<typeof preflight>>, fixtureId: string) {
  const directory = resolve(qualified.directory, "qualification");
  const manifest = JSON.parse(await readFile(resolve("tests/fixtures/ligand-properties-performance/editable/manifest.json"), "utf8")) as {
    fixtures: { id: string; chemistry_facts: FixtureFacts }[] };
  const facts = manifest.fixtures.find(f => f.id === fixtureId)?.chemistry_facts; check(facts, "Frozen chemistry facts missing");
  const independent = JSON.parse(await readFile(resolve(directory, "independent-result.json"), "utf8")) as {
    reconciliation: { policy: string; status: string; skipped_count: number; unprocessed_count: number } };
  const beforeBytes = await readFile(resolve(directory, "actual-source.json")), afterBytes = await readFile(resolve(directory, "disposable-edited-source.json"));
  const context = JSON.parse(await readFile(resolve(directory, "source-context.json"), "utf8")) as { disposable_edited_source_sha256: string };
  check(digest(beforeBytes) === qualified.result.source_sha256 && digest(afterBytes) === context.disposable_edited_source_sha256, "Independent retained source bodies changed");
  const before = JSON.parse(beforeBytes.toString()) as NormalizedStructure, after = JSON.parse(afterBytes.toString()) as NormalizedStructure;
  return { before: positiveHeaderOracle(fixtureId, "before", before, qualified.result.before_report, facts, independent.reconciliation),
    after: positiveHeaderOracle(fixtureId, "after", after, qualified.result.after_report, facts, independent.reconciliation) };
}

export interface PrimarySnapshot {
  at: number; entry: string | null; instance: string | null; formula: string | null; charge: string | null;
  image: { src: string; complete: boolean; width: number } | null; profile: string | null;
  primaryVisible: boolean; headerVisible: boolean; imageVisible: boolean; svgVisible: boolean; tableVisible: boolean; spokes: number; points: { x: number; y: number; clipped: string | null }[];
  polygons: string[]; legend: string[]; rows: { descriptor: string; spans: string[] }[]; criteria: number;
}
export interface PrimaryTrigger { label: string; at: number; trusted: boolean; event: string; initial: PrimarySnapshot }
export interface ClosedIntervalEvent {
  sequence: number; at: number; kind: "start" | "absent" | "depiction" | "reopen"; label: string | null;
  primaryVisible?: boolean; trusted?: boolean; triggerLabel?: string; event?: string; url?: string;
}
export interface PrimaryEvidence { timeOrigin: number; snapshots: PrimarySnapshot[]; triggers: PrimaryTrigger[]; imageResources: unknown[]; intervalEvents: ClosedIntervalEvent[] }
/** All boundaries and initiations share browser ordering; equal clock values do not collapse events. */
export function closedIntervalProof(evidence: Pick<PrimaryEvidence, "timeOrigin" | "intervalEvents">, label: string, reopenLabel: string) {
  check(Number.isFinite(evidence.timeOrigin) && evidence.timeOrigin > 0, "Browser clock identity missing");
  const events = evidence.intervalEvents;
  check(events.every((event, index) => event.sequence === index + 1 && Number.isFinite(event.at) && event.at >= 0
    && (index === 0 || event.at >= events[index - 1].at)), "Closed-interval event ordering invalid");
  const boundary = (kind: ClosedIntervalEvent["kind"]) => {
    const matches = events.filter(event => event.kind === kind && event.label === label);
    check(matches.length === 1, `Closed-interval ${kind} marker missing or duplicated`); return matches[0];
  };
  const start = boundary("start"), absent = boundary("absent"), reopen = boundary("reopen");
  check(start.sequence < absent.sequence && absent.sequence < reopen.sequence && start.primaryVisible === true
    && absent.primaryVisible === false && reopen.primaryVisible === false && reopen.trusted === true
    && reopen.triggerLabel === reopenLabel && reopen.event === "click", "Closed-interval visibility or trusted reopening marker mismatch");
  const initiations = events.filter(event => event.kind === "depiction" && event.sequence > start.sequence && event.sequence < reopen.sequence);
  check(initiations.length === 0, "Drawing initiated before trusted reopening");
  return { timeOrigin: evidence.timeOrigin, start, absent, reopen, depiction_initiations: initiations,
    boundary_policy: "Conservative pre-close marker through actual trusted reopening; browser sequence resolves equal timestamps" };
}
declare global { interface Window { ligandInformationPerformance: {
  timeOrigin: number; snapshots: PrimarySnapshot[]; triggers: PrimaryTrigger[]; read: () => PrimarySnapshot; observe: () => void;
  intervalEvents: ClosedIntervalEvent[]; closedInterval: { label: string; reopenLabel: string } | null;
  appendInterval: (event: Omit<ClosedIntervalEvent, "sequence" | "at">) => void;
} } }
export async function installPrimaryObservation(page: Page) {
  await page.addInitScript(() => {
    const visible = (node: Element | null) => {
      const b = node?.getBoundingClientRect(); return !!node && !!b && b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight
        && b.right > 0 && b.left < innerWidth && getComputedStyle(node).visibility !== "hidden" && !node.closest('[aria-hidden="true"], [inert]');
    };
    const read = (): PrimarySnapshot => {
      const root = document.querySelector(".ligand-information"), header = root?.querySelector(".ligand-designated-information");
      const fieldNode = (label: string) => [...(header?.querySelectorAll("dl > div") ?? [])].find(n => n.querySelector("dt")?.textContent === label)?.querySelector("dd") ?? null;
      const field = (label: string) => fieldNode(label)?.textContent ?? null;
      const image = header?.querySelector<HTMLImageElement>("img"), comparison = root?.querySelector(".profile-comparison");
      return { at: performance.now(), entry: root?.querySelector<HTMLSelectElement>(".ligand-entry-choice select")?.value ?? null,
        instance: field("Instance"), formula: field("Formula"), charge: field("Formal charge"),
        image: image ? { src: image.currentSrc || image.src, complete: image.complete, width: image.naturalWidth } : null,
        profile: root?.querySelector<HTMLSelectElement>(".ligand-profile-choice select")?.value ?? null,
        primaryVisible: visible(root), headerVisible: ["Instance", "Formula", "Formal charge"].every(label => visible(fieldNode(label))),
        imageVisible: visible(image ?? null), svgVisible: visible(comparison?.querySelector("svg") ?? null),
        tableVisible: visible(comparison?.querySelector(".comparison-table[open] table") ?? null),
        spokes: comparison?.querySelectorAll("svg > g").length ?? 0,
        points: [...(comparison?.querySelectorAll(".comparison-point") ?? [])].map(n => ({ x: Number(n.getAttribute("cx")), y: Number(n.getAttribute("cy")), clipped: n.getAttribute("data-clipped") })),
        polygons: [...(comparison?.querySelectorAll("polygon.comparison-shape") ?? [])].map(n => n.getAttribute("points") ?? ""),
        legend: [...(comparison?.querySelectorAll(".comparison-legend li") ?? [])].map(n => n.textContent ?? ""),
        rows: [...(comparison?.querySelectorAll("tbody tr") ?? [])].map(n => ({ descriptor: (n as HTMLElement).dataset.descriptor ?? "", spans: [...n.querySelectorAll("td > span")].map(s => s.textContent ?? "") })),
        criteria: [...(comparison?.querySelectorAll("tbody tr td > span") ?? [])].filter(n => / · (Met|Not met)$/.test(n.textContent ?? "")).length };
    };
    const state = { timeOrigin: performance.timeOrigin, snapshots: [], triggers: [], read, observe: () => undefined,
      intervalEvents: [], closedInterval: null, appendInterval: () => undefined } as Window["ligandInformationPerformance"];
    state.appendInterval = event => state.intervalEvents.push({ ...event, sequence: state.intervalEvents.length + 1, at: performance.now() });
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      const input = args[0], url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname.endsWith("/depiction")) state.appendInterval({ kind: "depiction", label: state.closedInterval?.label ?? null, url: url.href });
      return originalFetch.apply(this, args);
    };
    state.observe = () => {
      const snapshot = read(), previous = state.snapshots.at(-1);
      if (!previous || JSON.stringify({ ...previous, at: 0 }) !== JSON.stringify({ ...snapshot, at: 0 })) state.snapshots.push(snapshot);
    };
    window.ligandInformationPerformance = state;
    new MutationObserver(state.observe).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    for (const event of ["load", "scroll", "resize", "change"]) document.addEventListener(event, state.observe, true);
  });
}
export async function armPrimary(page: Page, control: Locator, label: string, event: "change" | "click") {
  await control.evaluate((node, args) => node.addEventListener(args.event, e => {
    const state = window.ligandInformationPerformance;
    if (state.closedInterval?.reopenLabel === args.label) {
      state.appendInterval({ kind: "reopen", label: state.closedInterval.label, triggerLabel: args.label, event: args.event, trusted: e.isTrusted, primaryVisible: state.read().primaryVisible });
      state.closedInterval = null;
    }
    state.triggers.push({ label: args.label, at: performance.now(), trusted: e.isTrusted, event: args.event, initial: state.read() });
    state.observe();
  }, { capture: true, once: true }), { label, event });
}
export async function beginClosedInterval(page: Page, label: string, reopenLabel: string) {
  await page.evaluate(args => {
    const state = window.ligandInformationPerformance;
    if (state.closedInterval) throw new Error("Closed interval already active");
    state.closedInterval = args; state.appendInterval({ kind: "start", label: args.label, primaryVisible: state.read().primaryVisible });
  }, { label, reopenLabel });
}
export async function confirmPrimaryAbsent(page: Page, label: string) {
  await page.evaluate(expected => {
    const state = window.ligandInformationPerformance;
    if (state.closedInterval?.label !== expected || state.read().primaryVisible) throw new Error("Closed interval absence mismatch");
    state.appendInterval({ kind: "absent", label: expected, primaryVisible: false });
  }, label);
}
export async function primaryEvidence(page: Page): Promise<PrimaryEvidence> {
  return page.evaluate(() => {
    const state = window.ligandInformationPerformance; state.observe();
    return { timeOrigin: state.timeOrigin, snapshots: state.snapshots, triggers: state.triggers, intervalEvents: state.intervalEvents,
      imageResources: performance.getEntriesByType("resource").filter(r => (r as PerformanceResourceTiming).initiatorType === "img").map(r => {
        const p = r as PerformanceResourceTiming; return { name: p.name, startTime: p.startTime, responseEnd: p.responseEnd,
          transferSize: p.transferSize, encodedBodySize: p.encodedBodySize, decodedBodySize: p.decodedBodySize };
      }) };
  });
}
export function comparisonMatches(snapshot: PrimarySnapshot, expected: ComparisonOracle) {
  if (snapshot.profile !== expected.profileId || snapshot.spokes !== expected.rows.length || snapshot.points.length !== expected.rows.length
    || snapshot.polygons.length !== (expected.rows.length >= 3 ? 1 : 0) || snapshot.criteria !== expected.constraints
    || JSON.stringify(snapshot.legend) !== JSON.stringify(expected.rows.map(r => r.name)) || snapshot.rows.length !== expected.rows.length) return false;
  if (!snapshot.rows.every((row, i) => {
    const wanted = expected.rows[i], displayed = row.spans[0];
    if (row.descriptor !== wanted.descriptor || !displayed || wanted.unit && !displayed.endsWith(wanted.unit)
      || JSON.stringify(row.spans.slice(1)) !== JSON.stringify(wanted.spans.slice(1))) return false;
    const value = Number(wanted.unit ? displayed.slice(0, -wanted.unit.length) : displayed);
    const decisionsMatch = wanted.rules.every(rule => (rule.operator === "lt" ? value < rule.limit : rule.operator === "le" ? value <= rule.limit
      : rule.operator === "gt" ? value > rule.limit : value >= rule.limit) === rule.met);
    return Number.isFinite(value) && decisionsMatch && (wanted.integer ? Number.isSafeInteger(value) && value === wanted.value : Math.abs(value - wanted.value) <= 1e-10);
  })) return false;
  const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) => Number.isFinite(a.x) && Number.isFinite(a.y)
    && Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6;
  if (!snapshot.points.every((p, i) => samePoint(p, expected.rows[i]) && p.clipped === expected.rows[i].clipped)) return false;
  if (snapshot.polygons.length) {
    const polygon = snapshot.polygons[0].trim().split(/\s+/).map(p => { const [x, y] = p.split(",").map(Number); return { x, y }; });
    if (polygon.length !== expected.rows.length || !polygon.every((p, i) => samePoint(p, expected.rows[i]))) return false;
  }
  return true;
}
export function elapsedFrom(trigger: PrimaryTrigger, snapshot: PrimarySnapshot | undefined) {
  check(trigger.trusted, "Trusted browser activation required");
  if (!snapshot) return null;
  check(Number.isFinite(snapshot.at) && snapshot.at >= trigger.at, "Readiness observation precedes its trigger");
  return snapshot.at - trigger.at;
}

export type TrafficKind = "properties" | "project" | "inventory" | "depiction" | "image" | "edit";
export interface TrafficRecord {
  kind: TrafficKind; method: string; url: string; path: string; at_utc_ms: number; body: unknown;
  status?: number; response_utc_ms?: number; response?: unknown; bytes?: number; sha256?: string; companion?: string; error?: string;
}
export function passiveTraffic(page: Page, directory: string) {
  const records: TrafficRecord[] = [], pending = new Set<Promise<void>>(), byRequest = new Map<Request, TrafficRecord>();
  const request = (r: Request) => {
    const url = new URL(r.url());
    const kind: TrafficKind | null = r.resourceType() === "image" ? "image" : url.pathname.includes("/ligand-properties") ? "properties"
      : url.pathname.endsWith("/depiction") ? "depiction" : url.pathname.includes("/ligand-candidates") ? "inventory"
      : url.pathname.endsWith("/model-edits") ? "edit" : /^\/api\/v1\/projects(?:\/[^/]+)?$/.test(url.pathname) ? "project" : null;
    if (!kind) return;
    let body: unknown = null; try { body = r.postDataJSON() as unknown; } catch { body = r.postData(); }
    const record: TrafficRecord = { kind, method: r.method(), url: r.url(), path: url.pathname, at_utc_ms: Date.now(), body };
    records.push(record); byRequest.set(r, record);
  };
  page.on("request", request);
  page.on("requestfailed", r => { const record = byRequest.get(r); if (record) record.error = r.failure()?.errorText ?? "Request failed"; });
  page.on("response", response => {
    const record = byRequest.get(response.request()); if (!record) return;
    const capture = async () => {
      record.status = response.status(); record.response_utc_ms = Date.now();
      try {
        if (record.kind === "image") {
          const body = await response.body(); record.bytes = body.length; record.sha256 = digest(body);
          record.companion = `image-${record.sha256}.body`; await writeFile(resolve(directory, record.companion), body);
        } else if ((response.headers()["content-type"] ?? "").includes("json")) record.response = await response.json() as unknown;
      } catch (error) { record.error = String(error); }
    };
    const task = capture(); pending.add(task); void task.finally(() => pending.delete(task));
  });
  return { records, async settle() { while (pending.size) await Promise.all([...pending]); },
    async save(filename: string) { while (pending.size) await Promise.all([...pending]); await writeFile(resolve(directory, filename), JSON.stringify(records, null, 2)); } };
}
export function trafficCounts(records: readonly TrafficRecord[]) {
  return { project: records.filter(r => r.kind === "project").length, inventory: records.filter(r => r.kind === "inventory").length,
    depiction: records.filter(r => r.kind === "depiction").length, images: records.filter(r => r.kind === "image").length,
    propertyReads: records.filter(r => r.kind === "properties" && r.method === "POST" && r.path.endsWith("/read")).length,
    allocations: records.filter(r => r.kind === "properties" && r.method === "POST" && r.path.endsWith("/consumers")).length,
    demands: records.filter(r => r.kind === "properties" && r.method === "PUT").length,
    releases: records.filter(r => r.kind === "properties" && r.method === "DELETE").length };
}
export function currentInventory(records: readonly TrafficRecord[], entry: string, artifact: string) {
  return records.filter(r => r.kind === "inventory" && r.status === 200).map(r => r.response as LigandCandidatesRead | undefined)
    .find(r => r?.entry_id === entry && r.artifact_id === artifact && r.designated_candidate?.chemistry_status === "qualified");
}
export function currentDrawing(records: readonly TrafficRecord[], entry: string, artifact: string) {
  return records.filter(r => r.kind === "depiction" && r.status === 200).map(r => r.response as LigandDepictionRead | undefined)
    .find(r => r?.entry_id === entry && r.artifact_id === artifact && r.status === "ready" && r.artifact);
}
