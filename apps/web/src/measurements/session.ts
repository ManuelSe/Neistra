import type { AtomReference, Entry, MeasurementKind, NormalizedStructure, Project } from "../api/types";
import type { ProjectCommandContext } from "../coordinates/projectCommand";
import { measurementValue } from "./geometry";

export const measurementTargetCount = { distance: 2, angle: 3, dihedral: 4 } as const;
const key = (ref: AtomReference) => JSON.stringify([ref.structure_id, ref.atom_id]);

export interface MeasurementDraft {
  readonly session: number;
  readonly generation: number;
  readonly open: boolean;
  readonly minimized: boolean;
  readonly kind: MeasurementKind;
  readonly slots: readonly (AtomReference | null)[];
  readonly artifacts: readonly (string | null)[];
  readonly activeSlot: number | null;
  readonly name: string;
  readonly acquiring: boolean;
  readonly saving: boolean;
  readonly notice: string | null;
}

export interface MeasurementContext {
  project: Project | undefined;
  activeProjectId: string | null;
  selectionProjectId: string | null;
  projectEpoch: number;
  paused: boolean;
  busy: boolean;
}

export interface MeasurementSave {
  readonly project: Pick<Project, "id" | "revision">;
  readonly projectEpoch: number;
  readonly session: number;
  readonly generation: number;
  readonly request: number;
  readonly name: string;
  readonly kind: MeasurementKind;
  readonly references: readonly AtomReference[];
  readonly artifacts: readonly string[];
}

export type MeasurementSaveCompletion = "current" | "superseded";

export interface MeasurementPorts {
  context(): MeasurementContext;
  structures(references: readonly AtomReference[]): ReadonlyMap<string, NormalizedStructure>;
  create(capture: MeasurementSave, context: ProjectCommandContext): Promise<MeasurementSaveCompletion>;
}

function empty(session = 0, generation = 0, kind: MeasurementKind = "distance"): MeasurementDraft {
  return Object.freeze({ session, generation, open: false, minimized: false, kind,
    slots: Object.freeze(Array<null>(measurementTargetCount[kind]).fill(null)),
    artifacts: Object.freeze(Array<null>(measurementTargetCount[kind]).fill(null)),
    activeSlot: 0, name: "", acquiring: false, saving: false, notice: null });
}

const members = new WeakMap<Entry, ReadonlySet<number>>();
function hasAtom(entry: Entry, id: number): boolean {
  let ids = members.get(entry);
  if (!ids) { ids = new Set(entry.atom_ids); members.set(entry, ids); }
  return ids.has(id);
}

/** One transient application owner; renderer leases and molecular selection stay separate. */
export class MeasurementSession {
  private state: MeasurementDraft = empty();
  private listeners = new Set<() => void>();
  private owner: { projectId: string; epoch: number } | null = null;
  private request = 0;
  private pending: MeasurementSave | null = null;
  private sourceSignature = "";
  private previewPaused = false;

  constructor(private readonly ports: MeasurementPorts) {}
  snapshot = (): MeasurementDraft => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private patch(patch: Partial<MeasurementDraft>): void {
    this.state = Object.freeze({ ...this.state, ...patch });
    if (patch.slots !== undefined || patch.open) this.sourceSignature = this.currentSourceSignature();
    for (const listener of this.listeners) listener();
  }
  private currentSourceSignature(): string {
    const context = this.ports.context();
    return JSON.stringify(this.state.slots.map(ref => {
      if (!ref) return null;
      const entry = context.project?.entries.find(entry => entry.id === ref.structure_id);
      return [ref.structure_id, entry?.current_artifact_id ?? null, entry ? hasAtom(entry, ref.atom_id) : false];
    }));
  }
  private current(context = this.ports.context()): boolean {
    return this.state.open && this.owner !== null && context.project?.id === this.owner.projectId
      && context.activeProjectId === this.owner.projectId && context.selectionProjectId === this.owner.projectId
      && context.projectEpoch === this.owner.epoch;
  }
  private editable(): boolean {
    this.guardContext();
    const context = this.ports.context();
    return this.current(context) && !context.paused && !context.busy && !this.state.saving;
  }
  private validTarget(reference: AtomReference, artifact: string | null, context = this.ports.context()): boolean {
    const entry = context.project?.entries.find(entry => entry.id === reference.structure_id);
    return Boolean(entry && artifact && entry.current_artifact_id === artifact && hasAtom(entry, reference.atom_id));
  }
  private artifact(reference: AtomReference): string | null {
    return this.ports.context().project?.entries.find(entry => entry.id === reference.structure_id)?.current_artifact_id ?? null;
  }

  open(): boolean {
    if (this.current()) return true;
    const context = this.ports.context(), project = context.project;
    if (!project || project.id !== context.activeProjectId || project.id !== context.selectionProjectId) return false;
    this.owner = { projectId: project.id, epoch: context.projectEpoch };
    this.previewPaused = context.paused;
    this.state = empty(this.state.session + 1, this.state.generation + 1);
    this.patch({ open: true, acquiring: !context.paused && !context.busy,
      notice: context.paused ? "Measurements are paused during preview." : null });
    return true;
  }
  close(): void {
    if (!this.state.open) return;
    this.owner = null;
    this.sourceSignature = "";
    this.state = empty(this.state.session + 1, this.state.generation + 1);
    for (const listener of this.listeners) listener();
  }
  /** Call at navigation/source/preview boundaries, not just at React effect completion. */
  guardContext(): void {
    if (!this.state.open) return;
    const context = this.ports.context();
    if (!this.current(context)) { this.close(); return; }
    const signature = this.currentSourceSignature();
    const changed = signature !== this.sourceSignature;
    this.sourceSignature = signature;
    const enteredPreview = context.paused && !this.previewPaused;
    this.previewPaused = context.paused;
    if (changed || enteredPreview) this.patch({
      acquiring: false, activeSlot: null, generation: this.state.generation + 1,
      notice: this.state.saving ? "Inputs changed while Save was finishing. Check Saved measurements."
        : context.paused ? "Measurements are paused during preview." : "Targets changed. Choose current atoms again.",
    });
  }
  cancelAcquisition(notice = "Atom picking stopped."): void {
    if (!this.state.open || !this.state.acquiring) return;
    // Stopping native acquisition does not revoke a separately pending Save.
    this.patch({ acquiring: false, activeSlot: null, notice: this.state.saving ? this.state.notice : notice });
  }
  setKind(kind: MeasurementKind): void {
    if (!this.editable() || this.state.kind === kind) return;
    const slots = Array<null>(measurementTargetCount[kind]).fill(null);
    this.patch({ kind, slots: Object.freeze(slots), artifacts: Object.freeze([...slots]), activeSlot: 0,
      acquiring: true, generation: this.state.generation + 1, notice: null });
  }
  setName(name: string): void {
    if (!this.editable()) return;
    this.patch({ name: name.slice(0, 120), notice: null });
  }
  reset(): void {
    if (!this.editable()) return;
    const slots = Array<null>(measurementTargetCount[this.state.kind]).fill(null);
    this.patch({ slots: Object.freeze(slots), artifacts: Object.freeze([...slots]), activeSlot: 0,
      acquiring: true, generation: this.state.generation + 1, notice: null });
  }
  pickInViewer(): void {
    if (!this.editable()) return;
    const firstEmpty = this.state.slots.findIndex(ref => ref === null);
    this.patch({ minimized: true, acquiring: true, activeSlot: this.state.activeSlot ?? (firstEmpty >= 0 ? firstEmpty : null),
      generation: this.state.generation + 1 });
  }
  reviewTargets(): void {
    if (this.current()) this.patch({ minimized: false });
  }
  activate(index: number): void {
    if (!this.editable() || !Number.isInteger(index) || index < 0 || index >= this.state.slots.length) return;
    this.patch({ activeSlot: index, acquiring: true, generation: this.state.generation + 1, notice: null });
  }
  remove(index: number): void {
    if (!this.editable() || !Number.isInteger(index) || index < 0 || index >= this.state.slots.length) return;
    this.patch({ slots: Object.freeze(this.state.slots.map((ref, slot) => slot === index ? null : ref)),
      artifacts: Object.freeze(this.state.artifacts.map((id, slot) => slot === index ? null : id)),
      activeSlot: index, acquiring: true, generation: this.state.generation + 1, notice: null });
  }
  choose(reference: AtomReference, artifact = this.artifact(reference)): boolean {
    if (!this.editable() || !this.state.acquiring || this.state.activeSlot === null) return false;
    if (!this.validTarget(reference, artifact)) return false;
    const index = this.state.activeSlot;
    if (this.state.slots.some((ref, slot) => slot !== index && ref && key(ref) === key(reference))) return false;
    const slots = this.state.slots.map((ref, slot) => slot === index ? Object.freeze({ ...reference }) : ref);
    const artifacts = this.state.artifacts.map((id, slot) => slot === index ? artifact : id);
    const next = slots.findIndex((ref, slot) => slot > index && !ref);
    const first = slots.findIndex(ref => !ref);
    this.patch({ slots: Object.freeze(slots), artifacts: Object.freeze(artifacts),
      activeSlot: next >= 0 ? next : first >= 0 ? first : null,
      generation: this.state.generation + 1, notice: null });
    return true;
  }
  useSelection(references: readonly AtomReference[]): boolean {
    if (!this.editable() || references.length !== this.state.slots.length || new Set(references.map(key)).size !== references.length) return false;
    const artifacts = references.map(ref => this.artifact(ref));
    if (references.some((ref, index) => !this.validTarget(ref, artifacts[index]))) return false;
    this.patch({ slots: Object.freeze(references.map(ref => Object.freeze({ ...ref }))), artifacts: Object.freeze(artifacts),
      activeSlot: null, acquiring: true, generation: this.state.generation + 1, notice: null });
    return true;
  }
  value(): number | null {
    const context = this.ports.context();
    if (!this.current(context) || context.paused || this.state.slots.some((ref, index) => !ref || !this.validTarget(ref, this.state.artifacts[index], context))) return null;
    const refs = this.state.slots as readonly AtomReference[];
    return measurementValue(this.state.kind, refs, this.ports.structures(refs));
  }
  ownsAcquisition(session: number, generation: number): boolean {
    return this.current() && this.state.acquiring && this.state.session === session && this.state.generation === generation
      && !this.ports.context().paused;
  }
  ownsSession(session: number): boolean {
    return this.current() && this.state.session === session;
  }
  inspectionAvailable(): boolean {
    return this.current() && !this.ports.context().paused;
  }
  notify(message: string, session = this.state.session): void {
    if (this.ownsSession(session)) this.patch({ notice: message });
  }
  private owns(capture: MeasurementSave): boolean {
    return this.pending === capture && this.current() && !this.ports.context().paused && this.state.session === capture.session
      && this.state.generation === capture.generation
      && capture.references.every((ref, index) => this.validTarget(ref, capture.artifacts[index]));
  }
  private assertDispatchable(capture: MeasurementSave): void {
    const context = this.ports.context();
    if (!this.owns(capture) || context.paused || context.project?.revision !== capture.project.revision
      || measurementValue(capture.kind, capture.references, this.ports.structures(capture.references)) === null) {
      throw new Error("Measurement inputs changed. Review the targets and save again.");
    }
  }
  async save(): Promise<boolean> {
    if (this.pending || !this.editable() || !this.state.name.trim() || this.value() === null) return false;
    const project = this.ports.context().project!;
    const capture: MeasurementSave = Object.freeze({ project: Object.freeze({ id: project.id, revision: project.revision }),
      projectEpoch: this.owner!.epoch, session: this.state.session, generation: this.state.generation, request: ++this.request,
      name: this.state.name.trim(), kind: this.state.kind,
      references: Object.freeze(this.state.slots.map(ref => Object.freeze({ ...ref! }))), artifacts: this.state.artifacts as readonly string[] });
    this.pending = capture; // Synchronous duplicate guard before the first await.
    this.patch({ saving: true, notice: null });
    try {
      const completion = await this.ports.create(capture, { assertDispatchable: () => this.assertDispatchable(capture), ownsFeedback: () => this.owns(capture) });
      if (completion === "superseded") {
        if (this.owns(capture)) this.patch({ notice: "The project changed while Save was finishing. Check Saved measurements." });
        return false;
      }
      if (this.owns(capture)) {
        const slots = Array<null>(measurementTargetCount[this.state.kind]).fill(null);
        this.patch({ slots: Object.freeze(slots), artifacts: Object.freeze([...slots]), name: "",
          activeSlot: this.state.acquiring ? 0 : null,
          generation: this.state.generation + 1, notice: `Saved ${capture.name}.` });
      }
      return true;
    } catch (error) {
      if (this.owns(capture)) this.patch({ notice: error instanceof Error ? error.message : "Measurement could not be saved." });
      return false;
    } finally {
      if (this.pending === capture) this.pending = null;
      if (this.current() && this.state.session === capture.session && this.state.saving) this.patch({ saving: false });
    }
  }
}
