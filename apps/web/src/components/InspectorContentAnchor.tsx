import { Component, createRef, type ReactNode } from "react";
import type { InspectorPublications } from "./inspectorPublications";

interface AnchorProps {
  scope: string | null;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  includeDescendants?: boolean;
  publications?: InspectorPublications;
}
interface ReadingPosition {
  section: HTMLElement;
  owner: HTMLElement;
  body: HTMLElement;
  control: HTMLElement;
  scope: string | null;
  visit: string;
  offset: number;
}

/** Preserve a focused inspector task across this section's local publications.
 * The snapshot belongs to this commit only; user and task navigation stay authoritative.
 */
export class InspectorContentAnchor extends Component<AnchorProps, { revision: number }, ReadingPosition | null> {
  private readonly section = createRef<HTMLElement>();
  state = { revision: 0 };
  private release: (() => void) | undefined;
  private observe = () => { this.setState({ revision: this.props.publications?.snapshot() ?? 0 }); };

  componentDidMount() { this.release = this.props.publications?.subscribe(this.observe); }
  componentWillUnmount() { this.release?.(); }

  getSnapshotBeforeUpdate(previous: AnchorProps): ReadingPosition | null {
    const section = this.section.current, control = section?.ownerDocument.activeElement;
    if (!section?.isConnected || previous.scope !== this.props.scope || !(control instanceof HTMLElement)
      || !control.isConnected || (!this.props.includeDescendants && section.contains(control))) return null;
    const owner = section.closest<HTMLElement>(".inspector-scroll"), body = control.closest<HTMLElement>(".inspector-body");
    if (!owner || !body || !owner.contains(body) || control.closest(".inspector-scroll") !== owner) return null;
    const visit = owner.dataset.inspectorVisit;
    if (visit === undefined) return null;
    const offset = control.getBoundingClientRect().top - owner.getBoundingClientRect().top;
    return Number.isFinite(offset) ? { section, owner, body, control, scope: this.props.scope, visit, offset } : null;
  }

  componentDidUpdate(previous: AnchorProps, _state: { revision: number }, snapshot: ReadingPosition | null) {
    if (previous.publications !== this.props.publications) {
      this.release?.(); this.release = this.props.publications?.subscribe(this.observe);
    }
    if (!snapshot) return;
    const { section, owner, body, control, scope, visit, offset } = snapshot;
    if (this.section.current !== section || !section.isConnected || !owner.isConnected || !body.isConnected || !control.isConnected
      || this.props.scope !== scope || section.ownerDocument.activeElement !== control
      || section.closest(".inspector-scroll") !== owner || control.closest(".inspector-scroll") !== owner
      || control.closest(".inspector-body") !== body || !owner.contains(body) || (!this.props.includeDescendants && section.contains(control))
      || owner.dataset.inspectorVisit !== visit) return;
    const residual = control.getBoundingClientRect().top - owner.getBoundingClientRect().top - offset;
    if (Number.isFinite(residual) && residual !== 0) owner.scrollTop += residual;
  }

  render() {
    return <section ref={this.section} className={this.props.className} aria-label={this.props["aria-label"]}>
      {this.props.children}
    </section>;
  }
}
