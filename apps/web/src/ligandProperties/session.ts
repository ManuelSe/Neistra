import { ApiError } from "../api/client";
import type { Entry } from "../api/types";
import { sameVerifiedArtifactSource, type InventoryVerificationFailure, type VerifiedArtifactSource, type VerifiedSourceFailure } from "../ligands/inventoryQualification";
import { ligandPropertyApi } from "./api";
import type { DescriptorRegistry, LigandPropertyApi, PropertyAggregate, PropertyCurrent, PropertySource } from "./types";

export interface PropertyTarget {
  projectId: string; source: PropertySource; originalArtifactId: string | null;
  descriptorIds: string[]; registry: DescriptorRegistry;
}
export function propertySourceIdentity(target: PropertyTarget): VerifiedArtifactSource {
  return { projectId: target.projectId, entryId: target.source.entry_id,
    currentArtifactId: target.source.source_artifact_id, originalArtifactId: target.originalArtifactId };
}
export interface PropertyView { status: PropertyCurrent["status"]; current?: PropertyCurrent; reason?: string; retryable?: boolean }
export function propertySource(entry: Entry | undefined): PropertySource | null {
  const designation = entry?.ligand_designation;
  return entry?.current_artifact_id && designation?.status === "resolved" && designation.instance_id && designation.atom_ids.length
    ? { entry_id: entry.id, source_artifact_id: entry.current_artifact_id,
      instance_id: designation.instance_id, atom_ids: [...designation.atom_ids] } : null;
}
export function samePropertySource(left: PropertySource | null, right: PropertySource | null): boolean {
  return !!left && !!right && left.entry_id === right.entry_id && left.source_artifact_id === right.source_artifact_id
    && left.instance_id === right.instance_id && left.atom_ids.length === right.atom_ids.length
    && left.atom_ids.every((id, index) => id === right.atom_ids[index]);
}
export function propertyTargetKey(target: PropertyTarget): string {
  return JSON.stringify([target.projectId, target.source, target.originalArtifactId, target.descriptorIds,
    target.registry.implementation_version, target.registry.policy_version, target.registry.library_version]);
}
export function propertyBaseKey(target: PropertyTarget): string {
  return JSON.stringify([target.projectId, target.source, target.originalArtifactId,
    target.registry.implementation_version, target.registry.policy_version, target.registry.library_version]);
}
const PENDING: PropertyView = { status: "pending" };
const MAX_CACHED_BINDINGS = 64;
const POLL_MS = 750;
const RENEW_MS = 20_000;
interface Lease { id: string; sequence: number; expiresAt: number }
interface ProjectLease { lease?: Lease; allocation?: Promise<Lease> }
type ActiveTarget = {
  target: PropertyTarget; key: string; generation: number; owns: () => boolean; abort: AbortController;
  renewed: number; demanded: boolean; waitingForLease: boolean; lease: Lease | null; demandSequence: number | null; recovered: boolean; working: boolean; requiresVerifiedRead: boolean;
};
interface RequestState {
  identity: VerifiedArtifactSource; inputKey: string; status: PropertyCurrent["status"]; reason: string | null;
}

interface CachedBinding { identity: VerifiedArtifactSource; current: PropertyCurrent }
interface SourceFailure { identity: VerifiedArtifactSource; view: PropertyView; verificationToken?: object }
function verificationKey(source: VerifiedArtifactSource): string {
  return JSON.stringify([source.projectId, source.entryId, source.currentArtifactId, source.originalArtifactId]);
}

/** Session-owned current bindings; cancellation survives view unmounts. */
export class LigandPropertySession {
  private generation = 0;
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  private readonly values = new Map<string, CachedBinding>();
  private readonly requests = new Map<string, RequestState>();
  private readonly sourceFailures = new Map<string, SourceFailure>();
  private cancelledKey: string | null = null;
  private unknownRequiresRead = false;
  private active: ActiveTarget | null = null;
  private readonly projectLeases = new Map<string, ProjectLease>();
  private allocations = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;
  private connection: object | null = null;
  private sourceFailurePublisher: ((proof: VerifiedSourceFailure) => void) | null = null;
  private connectedKey: string | null = null;
  constructor(private readonly captureOwnership: (target: PropertyTarget) => () => boolean = () => () => true,
    private readonly api: LigandPropertyApi = ligandPropertyApi) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  publishSourceFailuresTo(publish: (proof: VerifiedSourceFailure) => void): () => void {
    this.sourceFailurePublisher = publish;
    return () => { if (this.sourceFailurePublisher === publish) this.sourceFailurePublisher = null; };
  }
  private notify() { this.revision++; for (const listener of this.listeners) listener(); }
  private remember<T>(map: Map<string, T>, key: string, value: T) {
    map.delete(key); map.set(key, value);
    while (map.size > MAX_CACHED_BINDINGS) map.delete(map.keys().next().value!);
  }
  private rememberFailure(key: string, failure: SourceFailure) {
    if (!this.sourceFailures.has(key) && this.sourceFailures.size >= MAX_CACHED_BINDINGS) {
      const oldest = this.sourceFailures.values().next().value;
      // Once an exact verification fact is forgotten, uncached sources must qualify via READ.
      // Never replace that bounded history with an unbounded set of failed identities.
      if (oldest?.verificationToken) this.unknownRequiresRead = true;
    }
    this.remember(this.sourceFailures, key, failure);
  }
  view(target: PropertyTarget): PropertyView {
    const key = propertyTargetKey(target);
    if (key === this.cancelledKey) return { status: "cancelled" };
    const inputKey = propertyBaseKey(target);
    const failure = this.sourceFailures.get(verificationKey(propertySourceIdentity(target))) ?? this.sourceFailures.get(inputKey);
    if (failure) return this.active?.key === key && this.active.working ? PENDING : failure.view;
    const request = this.requests.get(key);
    if (request && ["failed", "unavailable", "cancelled"].includes(request.status)) {
      return { status: request.status, reason: request.reason ?? undefined,
        retryable: request.status === "failed" || request.status === "cancelled" };
    }
    const cached = this.values.get(inputKey)?.current;
    if (!cached?.report) return PENDING;
    const selected = new Set(target.descriptorIds);
    const values = cached.report.values.filter(value => selected.has(value.descriptor_id));
    const coverage = values.map(value => value.descriptor_id);
    const complete = target.descriptorIds.every(id => coverage.includes(id));
    const status = complete ? "ready" : "pending";
    return { status, current: { ...cached, source: target.source, status, reason: null,
      progress: complete ? 100 : 0, report: { ...cached.report, coverage, values } } };
  }
  invalidateSource(source: VerifiedArtifactSource, token: object, reason: InventoryVerificationFailure["reason"], beforeNotify?: () => void) {
    let matched = false;
    for (const [key, binding] of this.values) if (sameVerifiedArtifactSource(binding.identity, source)) { this.values.delete(key); matched = true; }
    for (const [key, request] of this.requests) if (sameVerifiedArtifactSource(request.identity, source)) { this.requests.delete(key); matched = true; }
    for (const [key, failure] of this.sourceFailures) if (sameVerifiedArtifactSource(failure.identity, source)) { this.sourceFailures.delete(key); matched = true; }
    if (this.active && sameVerifiedArtifactSource(propertySourceIdentity(this.active.target), source)) { this.stop(); matched = true; }
    // Do not allocate failure history for sources this session has never used.
    if (!matched) { beforeNotify?.(); return; }
    this.rememberFailure(verificationKey(source), { identity: source, verificationToken: token,
      view: { status: "unavailable", retryable: true, reason: reason === "source_conflict"
        ? "The ligand source changed. Retry to verify its current properties."
        : "The ligand source could not be verified. Retry to verify its current properties." } });
    beforeNotify?.();
    this.notify();
  }
  activate = () => { this.enabled = true; };
  deactivate = () => { this.enabled = false; this.stop(); };
  inputUnavailable = () => { if (this.cancelledKey) { this.cancelledKey = null; this.notify(); } };

  connect(target: PropertyTarget): () => void {
    this.enabled = true;
    const connection = {};
    this.connection = connection;
    this.connectedKey = propertyTargetKey(target);
    this.begin(target);
    return () => { if (this.connection === connection) { this.connection = null; this.connectedKey = null; this.stop(); } };
  }
  private begin(target: PropertyTarget) {
    const key = propertyTargetKey(target);
    if (this.cancelledKey && this.cancelledKey !== key) this.cancelledKey = null;
    this.stop();
    if (!this.enabled || key === this.cancelledKey || !target.descriptorIds.length) return;
    this.requests.delete(key);
    const active = { target, key, generation: ++this.generation, owns: this.captureOwnership(target),
      abort: new AbortController(), renewed: 0, demanded: false, waitingForLease: false, lease: null, demandSequence: null, recovered: false, working: true,
      requiresVerifiedRead: !!this.sourceFailures.get(verificationKey(propertySourceIdentity(target)))?.verificationToken
        || (this.unknownRequiresRead && !this.values.has(propertyBaseKey(target))) };
    this.active = active;
    void this.read(active);
  }
  private current(active: NonNullable<LigandPropertySession["active"]>): boolean {
    return this.enabled && this.active === active && active.generation === this.generation
      && !active.abort.signal.aborted && active.owns();
  }
  private stop() {
    const active = this.active;
    this.active = null; this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (active) {
      active.abort.abort();
      if (active.demanded && active.lease) void this.release(active.target.projectId, active.lease);
    }
  }
  private async release(projectId: string, lease: Lease) {
    await this.api.release(projectId, lease.id, ++lease.sequence).catch(() => {
        // The bounded server lease expires even if a release cannot be delivered.
    });
  }
  private pool(projectId: string): ProjectLease {
    let pool = this.projectLeases.get(projectId);
    if (!pool) { pool = {}; this.remember(this.projectLeases, projectId, pool); }
    return pool;
  }
  private ensureLease(projectId: string): Promise<Lease> {
    const pool = this.pool(projectId);
    if (pool.lease && pool.lease.expiresAt > Date.now()) return Promise.resolve(pool.lease);
    if (pool.allocation) return pool.allocation;
    if (this.allocations >= 2) return Promise.reject(new ApiError(503, "property_request_busy", "Other property requests are still retiring. Retry shortly."));
    this.allocations++;
    pool.allocation = this.api.allocate(projectId).then(response => {
      if (response.project_id !== projectId || !response.consumer_id || response.sequence !== 0
        || !response.expires_at || !Number.isFinite(Date.parse(response.expires_at))) throw new Error("Property request ownership could not be established.");
      const lease = { id: response.consumer_id, sequence: 0, expiresAt: Date.parse(response.expires_at) };
      pool.lease = lease; pool.allocation = undefined;
      const active = this.active;
      if (this.projectLeases.get(projectId) !== pool || !active || active.target.projectId !== projectId || !active.waitingForLease || !this.current(active)) {
        pool.lease = undefined;
        void this.release(projectId, lease);
      }
      return lease;
    }).catch(error => { pool.allocation = undefined; throw error; }).finally(() => { this.allocations--; });
    return pool.allocation;
  }
  private async demand(active: ActiveTarget): Promise<PropertyAggregate> {
    active.waitingForLease = true;
    const lease = await this.ensureLease(active.target.projectId);
    active.waitingForLease = false;
    if (!this.current(active)) throw new DOMException("Property request retired", "AbortError");
    const sequence = active.lease === lease && active.demandSequence !== null ? active.demandSequence : ++lease.sequence;
    active.lease = lease; active.demandSequence = sequence; active.demanded = true; active.renewed = Date.now();
    try {
      const response = await this.api.demand(active.target.projectId, lease.id,
        { entries: [active.target.source], descriptor_ids: active.target.descriptorIds,
          sequence, active_entry_id: active.target.source.entry_id }, active.abort.signal);
      if (response.expires_at && Number.isFinite(Date.parse(response.expires_at))) lease.expiresAt = Date.parse(response.expires_at);
      return response;
    } catch (error) {
      if (error instanceof ApiError && error.code === "property_consumer_expired" && !active.recovered && this.current(active)) {
        active.recovered = true;
        const pool = this.pool(active.target.projectId);
        if (pool.lease === lease) pool.lease = undefined;
        return this.demand(active);
      }
      throw error;
    }
  }
  cancel(target: PropertyTarget) {
    const key = propertyTargetKey(target);
    if (this.connectedKey !== key) return;
    this.cancelledKey = key;
    this.stop(); this.notify();
  }
  retry(target: PropertyTarget) {
    if (!this.enabled) return;
    const key = propertyTargetKey(target);
    if (this.connectedKey !== key) return;
    this.cancelledKey = null;
    this.begin(target); this.notify();
  }
  private physicalFailure(result: PropertyCurrent, target: PropertyTarget): VerifiedSourceFailure | null {
    const fact = result.source_failure;
    if (fact === undefined || fact === null) return null;
    const identity = fact.source_identity;
    // Supplied but malformed or contradictory provenance must never become authority.
    if (typeof fact !== "object" || Array.isArray(fact) || !identity || typeof identity !== "object" || Array.isArray(identity)
      || result.status !== "failed" || result.report !== null || fact.reason !== "artifact_unavailable"
      || (fact.source_verification !== "current" && fact.source_verification !== "original")
      || typeof identity.project_id !== "string" || !identity.project_id
      || typeof identity.entry_id !== "string" || !identity.entry_id
      || typeof identity.current_artifact_id !== "string" || !identity.current_artifact_id
      || (identity.original_artifact_id !== null && (typeof identity.original_artifact_id !== "string" || !identity.original_artifact_id))
      || (fact.source_verification === "original" && identity.original_artifact_id === null)) {
      throw new Error("Property physical-source provenance could not be qualified.");
    }
    const source = { projectId: identity.project_id, entryId: identity.entry_id,
      currentArtifactId: identity.current_artifact_id, originalArtifactId: identity.original_artifact_id };
    if (!sameVerifiedArtifactSource(source, propertySourceIdentity(target))) throw new Error("Property physical-source identity does not match this request.");
    return { source, reason: fact.reason };
  }
  private emitPhysicalFailure(result: PropertyCurrent, active: ActiveTarget): boolean {
    const proof = this.physicalFailure(result, active.target);
    if (!proof) return false;
    if (!this.sourceFailurePublisher) throw new Error("Property source verification publication is unavailable.");
    // The canonical event synchronously retires this request and all matching aliases.
    // Its response has no remaining authority to publish, poll, or create demand.
    this.sourceFailurePublisher(proof);
    return true;
  }
  private accept(response: PropertyAggregate, active: NonNullable<LigandPropertySession["active"]>): PropertyCurrent {
    const { target } = active;
    const result = response.entries.find(item => samePropertySource(item.source, target.source));
    if (response.project_id !== target.projectId || !result || !result.binding_key) throw new Error("Property source qualification failed.");
    const report = result.report;
    if (result.status === "ready" && !report) throw new Error("A complete property report is missing.");
    if (report) {
      const registry = target.registry;
      if (report.schema_version !== 1 || typeof report.input_hash !== "string" || !/^[0-9a-f]{64}$/.test(report.input_hash)
        || !Array.isArray(report.coverage) || !Array.isArray(report.values) || !Array.isArray(report.provenance)
        || !report.provenance.every(item => typeof item === "string")
        || !["qualified", "unavailable"].includes(report.model_status) || !Number.isFinite(Date.parse(report.created_at))
        || (report.model_status === "qualified" ? report.model_reason !== null : typeof report.model_reason !== "string" || !report.model_reason.trim())
        || (report.contains_formally_charged_atoms !== null && typeof report.contains_formally_charged_atoms !== "boolean")
        || report.implementation_version !== registry.implementation_version || report.policy_version !== registry.policy_version
        || report.library_version !== registry.library_version
        || report.coverage.length > registry.definitions.length || report.coverage.length !== report.values.length
        || new Set(report.coverage).size !== report.coverage.length
        || (result.status === "ready" && target.descriptorIds.some(id => !report.coverage.includes(id)))) {
        throw new Error("Property method qualification failed.");
      }
      let previousOrder = -1;
      for (const [index, value] of report.values.entries()) {
        const definition = registry.definitions.find(item => item.id === value.descriptor_id);
        if (!definition || value.descriptor_id !== report.coverage[index] || definition.order <= previousOrder
          || !["ready", "unavailable", "error"].includes(value.status)
          || (value.status === "ready" ? value.reason !== null
            : value.value !== null || typeof value.reason !== "string" || !value.reason.trim())) {
          throw new Error("A property outcome could not be qualified.");
        }
        previousOrder = definition.order;
        if (value.status === "ready" && (typeof value.value !== "number" || !Number.isFinite(value.value)
          || (definition.value_type === "integer" && !Number.isSafeInteger(value.value)))) {
          throw new Error("A property result is not finite.");
        }
      }
    }
    return result;
  }
  private forgetRequests(inputKey: string) {
    for (const [key, request] of this.requests) if (request.inputKey === inputKey) this.requests.delete(key);
  }
  private fence(target: PropertyTarget, failure: PropertyView) {
    const inputKey = propertyBaseKey(target);
    this.values.delete(inputKey);
    this.forgetRequests(inputKey);
    this.rememberFailure(inputKey, { identity: propertySourceIdentity(target),
      view: { status: failure.status, reason: failure.reason, retryable: failure.retryable } });
  }
  private publish(result: PropertyCurrent, active: ActiveTarget, propertyRead = false) {
    const inputKey = propertyBaseKey(active.target), identity = propertySourceIdentity(active.target);
    const verifiedKey = verificationKey(identity), verification = this.sourceFailures.get(verifiedKey);
    if (active.requiresVerifiedRead || verification?.verificationToken) {
      if (propertyRead && result.report && ["ready", "pending"].includes(result.status)) {
        active.requiresVerifiedRead = false; this.sourceFailures.delete(verifiedKey);
      } else {
        // Consumer results cannot replace a fresh source-qualified property read.
        this.notify(); return;
      }
    }
    if (["failed", "unavailable"].includes(result.status)) {
      this.fence(active.target, { status: result.status, reason: result.reason ?? undefined, retryable: result.status === "failed" });
    } else if (result.report && (result.status === "ready" || result.status === "pending")) {
      const previous = this.values.get(inputKey)?.current.report;
      const matching = previous?.input_hash === result.report.input_hash ? previous : undefined;
      const latest = new Map(matching?.values.map(value => [value.descriptor_id, value]));
      for (const value of result.report.values) latest.set(value.descriptor_id, value);
      const values = [...active.target.registry.definitions].sort((left, right) => left.order - right.order)
        .flatMap(definition => { const value = latest.get(definition.id); return value ? [value] : []; });
      this.forgetRequests(inputKey);
      this.sourceFailures.delete(inputKey);
      this.remember(this.values, inputKey, { identity, current: { ...result, report: { ...result.report,
        coverage: values.map(value => value.descriptor_id), values } } });
    }
    this.remember(this.requests, active.key, { identity, inputKey, status: result.status, reason: result.reason });
    this.notify();
  }
  private async read(active: NonNullable<LigandPropertySession["active"]>): Promise<void> {
    if (!this.current(active)) return;
    const body = { entries: [active.target.source], descriptor_ids: active.target.descriptorIds };
    try {
      let response = await this.api.read(active.target.projectId, body, active.abort.signal);
      if (!this.current(active)) return;
      let result = this.accept(response, active);
      if (this.emitPhysicalFailure(result, active)) return;
      let propertyRead = true;
      if (result.status === "pending" && (!active.demanded || Date.now() - active.renewed >= RENEW_MS)) {
        this.publish(result, active, true);
        response = await this.demand(active);
        if (!this.current(active)) return;
        result = this.accept(response, active);
        if (this.emitPhysicalFailure(result, active)) return;
        propertyRead = false;
      }
      if (active.requiresVerifiedRead && !propertyRead && result.status === "ready") result = { ...result, status: "pending" };
      active.working = result.status === "pending";
      this.publish(result, active, propertyRead);
      if (result.status === "pending") this.timer = setTimeout(() => { this.timer = null; void this.read(active); }, POLL_MS);
      else if (active.demanded) {
        active.demanded = false;
        if (active.lease) void this.release(active.target.projectId, active.lease);
      }
    } catch (error) {
      if (!this.current(active)) return;
      const changed = error instanceof ApiError && error.status === 409 && error.code === "structure_artifact_conflict";
      if (active.demanded && active.lease) { active.demanded = false; void this.release(active.target.projectId, active.lease); }
      active.working = false;
      this.fence(active.target, { status: changed ? "unavailable" : "failed",
        reason: changed ? "The ligand input changed. Review its current choice."
          : error instanceof ApiError && error.code === "property_consumer_expired" ? "Property request expired. Retry to update this ligand."
            : error instanceof ApiError && error.code === "property_request_busy" ? error.message : "Properties could not be loaded.", retryable: !changed });
      this.notify();
    }
  }
}
