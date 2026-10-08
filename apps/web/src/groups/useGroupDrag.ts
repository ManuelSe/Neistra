import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { Project } from "../api/types";
import type { GroupScope } from "./membership";

/** Only this browser's transient session authorizes a drop; never read dropped IDs. */
export function useGroupDrag(project: Project | undefined, busy: boolean, onMove?: (scope: GroupScope, groupId: string | null) => void) {
  const session = useRef<GroupScope | null>(null);
  const [draft, setDraft] = useState<GroupScope | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const cancel = useCallback(() => {
    session.current = null;
    setDraft(null);
    setHovered(null);
  }, []);
  useEffect(cancel, [project?.id, project?.revision, busy, cancel]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session.current) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      session.current = null;
    };
  }, [cancel]);
  const valid = (scope: GroupScope | null) => !!scope && !!onMove && !busy &&
    scope.projectId === project?.id && scope.revision === project.revision;
  const scope = valid(draft) ? draft : null;
  return {
    scope,
    hovered,
    cancel,
    start: (captured: GroupScope, event: DragEvent) => {
      if (!valid(captured) || window.matchMedia("(pointer: coarse)").matches) {
        event.preventDefault();
        return;
      }
      session.current = captured;
      setDraft(captured);
      event.dataTransfer.effectAllowed = "move";
      // Marker only. No molecular bytes, selection contents, or entry IDs travel externally.
      event.dataTransfer.setData("text/plain", "Neistra structure group membership");
    },
    target: (groupId: string | null) => {
      const hover = (event: DragEvent) => {
        if (!valid(session.current)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setHovered(groupId ?? "ungrouped");
      };
      return {
      onDragEnter: hover,
      onDragOver: hover,
      onDragLeave: (event: DragEvent) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX >= box.left && event.clientX < box.right && event.clientY >= box.top && event.clientY < box.bottom) return;
        setHovered(current => current === (groupId ?? "ungrouped") ? null : current);
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const captured = session.current;
        const accepted = valid(captured);
        cancel(); // Consume before invoking the mutation; repeated drops cannot duplicate it.
        if (accepted && captured) onMove?.(captured, groupId);
      },
      };
    },
  };
}
