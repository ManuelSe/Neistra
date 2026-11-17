import type { PropertyPresentation } from "../ligandProperties/useProperties";
import type { LigandPropertySession } from "../ligandProperties/session";
import type { ProfileSelection } from "./context";
import type { ProfileInputAuthority, ProfileInputSnapshot, ProfileRegistry } from "./types";

/** Authority comes from the exact App target and owner, never from a report's identity. */
export function profileInputAuthority(state: PropertyPresentation, session: LigandPropertySession,
  selection: ProfileSelection, registry: ProfileRegistry, profileId: string): ProfileInputAuthority {
  return { capture: () => {
    const target = state.target;
    if (!target) throw new Error("No current property target.");
    const owned = state.owner.capture(target), ownerEpoch = state.owner.snapshot();
    const registryCurrent = selection.captureRegistry(registry, profileId);
    const view = state.owner.matches(target) ? session.view(target) : null;
    const status: ProfileInputSnapshot["status"] = state.pausedReason?.startsWith("Preview") ? "preview"
      : state.pausedReason || !owned() ? "stale" : state.configurationError ? "error"
      : view?.status === "ready" ? "current" : view?.status === "pending" ? "pending"
      : view?.status === "failed" ? "error" : view?.status ?? "pending";
    return { projectId: target.projectId, source: target.source, originalArtifactId: target.originalArtifactId,
      ownerEpoch, profileRegistryVersion: registry.registry_version, status, reason: view?.reason ?? undefined,
      binding: status === "current" || status === "pending" ? view?.current : undefined,
      descriptorRegistry: state.registry ?? target.registry,
      isCurrent: () => owned() && registryCurrent(),
    };
  } };
}
