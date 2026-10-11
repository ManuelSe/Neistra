import { useCallback, useLayoutEffect, useState } from "react";
import type { Project } from "../api/types";
import { groupReturnFocus, type GroupScope } from "./membership";

interface FocusRequest { scope: GroupScope; groupId: string | null; revision: number }

/** Resolve remounted action targets after the accepted server revision renders. */
export function useGroupActionFocus(project: Pick<Project, "id" | "revision"> | undefined, activeProjectId: string | null) {
  const [request, setRequest] = useState<FocusRequest | null>(null);
  useLayoutEffect(() => {
    if (!request) return;
    if (activeProjectId !== request.scope.projectId || project?.id !== request.scope.projectId || project.revision > request.revision) {
      setRequest(null);
      return;
    }
    if (project.revision !== request.revision) return;
    const focused = document.activeElement;
    // A later interaction elsewhere keeps its focus. Menu teardown still handles
    // the fast-response case; this also covers updates arriving after teardown.
    if (focused === document.body || focused?.closest('[role="menu"]')
      || focused?.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId === request.scope.originEntryId) {
      groupReturnFocus(request.scope, request.groupId)?.focus();
    }
    setRequest(null);
  }, [request, project, activeProjectId]);
  return useCallback((scope: GroupScope, groupId: string | null, revision: number) => {
    setRequest({ scope, groupId, revision });
  }, []);
}
