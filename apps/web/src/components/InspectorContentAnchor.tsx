import { Component, createRef, type ReactNode } from "react";

interface AnchorProps {
  scope: string | null;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
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
export class InspectorContentAnchor extends Component<AnchorProps, Record<string, never>, ReadingPosition | null> {
  private readonly section = createRef<HTMLElement>();

  getSnapshotBeforeUpdate(previous: AnchorProps): ReadingPosition | null {
    const section = this.section.current, control = section?.ownerDocument.activeElement;
    if (!section?.isConnected || previous.scope !== this.props.scope || !(control instanceof HTMLElement)
      || !control.isConnected || section.contains(control)) return null;
    const owner = section.closest<HTMLElement>(".inspector-scroll"), body = control.closest<HTMLElement>(".inspector-body");
    if (!owner || !body || !owner.contains(body) || control.closest(".inspector-scroll") !== owner) return null;
    const visit = owner.dataset.inspectorVisit;
    if (visit === undefined) return null;
    const offset = control.getBoundingClientRect().top - owner.getBoundingClientRect().top;
    return Number.isFinite(offset) ? { section, owner, body, control, scope: this.props.scope, visit, offset } : null;
  }

  componentDidUpdate(_previous: AnchorProps, _state: Record<string, never>, snapshot: ReadingPosition | null) {
    if (!snapshot) return;
    const { section, owner, body, control, scope, visit, offset } = snapshot;
    if (this.section.current !== section || !section.isConnected || !owner.isConnected || !body.isConnected || !control.isConnected
      || this.props.scope !== scope || section.ownerDocument.activeElement !== control
      || section.closest(".inspector-scroll") !== owner || control.closest(".inspector-scroll") !== owner
      || control.closest(".inspector-body") !== body || !owner.contains(body) || section.contains(control)
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
