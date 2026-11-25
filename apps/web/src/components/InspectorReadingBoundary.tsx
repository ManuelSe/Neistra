import { Component, type ReactNode, type RefObject } from "react";
import { captureInspectorReadingPosition, inspectorReadingTarget,
  type InspectorReadingContext, type ReadingPosition } from "./inspectorReadingPosition";

interface Props {
  owner: RefObject<HTMLDivElement | null>;
  context?: InspectorReadingContext;
  children: ReactNode;
}
interface Hold {
  token: symbol;
  owner: HTMLDivElement;
  context: InspectorReadingContext;
  visit: string | undefined;
  position: ReadingPosition;
  focused: HTMLElement | null;
}

/** Pre-mutation reading intent for one connected presenter, never scientific state. */
export class InspectorReadingBoundary extends Component<Props, { revision: number }, Hold | null> {
  state = { revision: 0 };
  private pending: Hold | null = null;
  private release: (() => void) | undefined;
  private resize: ResizeObserver | undefined;
  private mutations: MutationObserver | undefined;
  private attached: HTMLDivElement | null = null;
  private cancelled = false;
  private userIntent = () => { if (this.pending) this.cancelled = true; this.stop(); };
  private observe = () => { this.setState(({ revision }) => ({ revision: revision + 1 })); };

  componentDidMount() {
    this.release = this.props.context?.publications?.subscribe(this.observe);
    this.bindOwner();
  }
  private bindOwner() {
    const owner = this.props.owner.current;
    if (owner === this.attached) return;
    for (const name of ["focusin", "wheel", "touchstart", "pointerdown", "keydown"] as const) {
      this.attached?.removeEventListener(name, this.userIntent, true);
    }
    this.attached = owner;
    for (const name of ["focusin", "wheel", "touchstart", "pointerdown", "keydown"] as const) {
      owner?.addEventListener(name, this.userIntent, { capture: true, passive: true });
    }
  }
  componentWillUnmount() {
    this.release?.(); this.stop();
    const owner = this.attached;
    for (const name of ["focusin", "wheel", "touchstart", "pointerdown", "keydown"] as const) {
      owner?.removeEventListener(name, this.userIntent, true);
    }
    this.attached = null;
  }

  private stop() {
    this.resize?.disconnect(); this.mutations?.disconnect();
    this.resize = undefined; this.mutations = undefined;
    if (this.pending) this.pending.context.session.release(this.pending.token);
    this.pending = null;
  }

  getSnapshotBeforeUpdate(previous: Props): Hold | null {
    // A parent host ref is attached after its children's mount lifecycles.
    // The first pre-mutation update has that ref before any hold can begin.
    this.bindOwner();
    const owner = previous.owner.current, old = previous.context, next = this.props.context;
    if (!owner?.isConnected || !old || !next || old.session !== next.session
      || !old.continuityKey || old.continuityKey !== next.continuityKey) {
      this.cancelled = false; this.stop(); return null;
    }
    if (this.pending && !old.session.owns(this.pending.token)) this.stop();
    if (this.pending) return this.pending;
    if (this.cancelled && old.scope === next.scope) {
      if (!next.isPending?.()) this.cancelled = false;
      return null;
    }
    if (old.scope === next.scope && !next.isPending?.()) return null;
    const position = captureInspectorReadingPosition(owner, old.session.read(old.scope)?.landmark);
    if (position.top <= 0) return null;
    const active = owner.ownerDocument.activeElement;
    const hold: Hold = { owner, context: old, position, token: Symbol("connected Inspector reading"),
      visit: owner.dataset.inspectorVisit,
      focused: active instanceof HTMLElement && owner.contains(active) ? active : null };
    if (!old.session.retain(old.scope, hold.token, position)) return null;
    this.pending = hold;
    return hold;
  }

  componentDidUpdate(previous: Props, _state: { revision: number }, hold: Hold | null) {
    this.bindOwner();
    if (previous.context?.publications !== this.props.context?.publications) {
      this.release?.(); this.release = this.props.context?.publications?.subscribe(this.observe);
    }
    const next = this.props.context;
    if (!hold || !next) return;
    const { owner, context, token } = hold;
    if (this.props.owner.current !== owner || !owner.isConnected || owner.dataset.inspectorVisit !== hold.visit
      || context.session !== next.session || context.continuityKey !== next.continuityKey
      || !context.session.transfer(context.scope, next.scope, token)) {
      this.stop(); next.session.save(next.scope, captureInspectorReadingPosition(owner)); return;
    }
    hold.context = next;
    // The focused-control publication boundary already owns this geometry.
    if (this.cancelled || (hold.focused?.isConnected && owner.ownerDocument.activeElement === hold.focused
      && hold.focused.closest(".inspector-scroll") === owner)) {
      this.stop(); next.session.save(next.scope, captureInspectorReadingPosition(owner));
      if (!next.isPending?.()) this.cancelled = false;
      return;
    }
    this.attempt();
    if (this.pending && !this.resize) {
      this.resize = new ResizeObserver(this.attempt); this.resize.observe(owner);
      for (const body of owner.querySelectorAll(".inspector-body")) this.resize.observe(body);
      this.mutations = new MutationObserver(this.attempt);
      this.mutations.observe(owner, { childList: true, characterData: true, subtree: true });
    }
  }

  private attempt = () => {
    const hold = this.pending;
    if (!hold) return;
    const { owner, context, token, position } = hold;
    const latest = this.props.context;
    if (!owner.isConnected || owner !== this.props.owner.current || owner.dataset.inspectorVisit !== hold.visit
      || latest?.session !== context.session || latest.scope !== context.scope
      || latest.continuityKey !== context.continuityKey || !context.session.owns(token)) {
      this.stop(); return;
    }
    if (context.isPending?.()) return;
    const target = inspectorReadingTarget(owner, position);
    owner.scrollTop = Math.max(0, target.top);
    owner.dataset.inspectorReadingResumed = owner.scrollTop > 0 ? "true" : "false";
    // A terminal missing landmark uses the available numeric fallback once.
    this.stop();
    context.session.save(context.scope, captureInspectorReadingPosition(owner, target.found ? position.landmark : null));
  };

  render() { return this.props.children; }
}
