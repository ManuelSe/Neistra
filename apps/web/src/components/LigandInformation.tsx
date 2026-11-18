import type { ReactNode } from "react";
import { InspectorContentAnchor } from "./InspectorContentAnchor";
import type { InspectorPublications } from "./inspectorPublications";

/** Reserved exact-input boundary. No protein target is inferred or generated. */
export interface LigandInteractionContext {
  readonly projectId: string;
  readonly ligand: { readonly entryId: string; readonly instanceId: string; readonly atomIds: readonly number[];
    readonly artifactId: string; readonly revision: number };
  readonly protein: { readonly entryId: string; readonly atomIds: readonly number[];
    readonly artifactId: string; readonly revision: number };
  readonly generator: { readonly id: string; readonly version: string; readonly artifactId: string | null } | null;
}

export function LigandInformation({ scope, publications, children, complex, interactionContext = null }: {
  scope: string | null; publications: InspectorPublications; children: ReactNode; complex: boolean;
  interactionContext?: LigandInteractionContext | null;
}) {
  return <InspectorContentAnchor className="ligand-information" aria-label="Ligand information" scope={scope}
    publications={publications} includeDescendants>
    {children}
    {complex ? <details className="ligand-interaction-unavailable"><summary>Interactions</summary>
      <p>{interactionContext ? "Interaction diagram unavailable for these inputs." : "Interaction diagram unavailable — choose exact ligand and protein inputs when this tool is available."}</p>
    </details> : null}
  </InspectorContentAnchor>;
}
