import { useEffect, useState } from "react";
import { ViewerInformationStrip, type ViewerInformationStripProps } from "./ViewerInformationStrip";
import type { MolecularViewer, ViewerStructure, ViewerAtomHover } from "../viewer/MolecularViewer";

/** Atom feedback owns its own renders; pointer updates never rebuild the scene. */
export function ViewerInspection({ viewer, projectId, sources, ...props }: Omit<ViewerInformationStripProps, "hover"> & {
  viewer: MolecularViewer | undefined;
  projectId: string;
  sources: readonly ViewerStructure[];
}) {
  const [hover, setHover] = useState<{ viewer: MolecularViewer; projectId: string; event: ViewerAtomHover } | null>(null);
  useEffect(() => {
    if (!viewer) return;
    let active = true;
    const release = viewer.subscribeAtomHover?.(event => {
      if (active) setHover(event ? { viewer, projectId, event } : null);
    });
    return () => { active = false; release?.(); };
  }, [viewer, projectId]);
  const event = hover && hover.viewer === viewer && hover.projectId === projectId ? hover.event : null;
  const entry = event ? props.entries.find(entry => entry.id === event.reference.structure_id) : undefined;
  const source = event ? sources.find(source => source.entryId === event.reference.structure_id) : undefined;
  const reference = !props.paused && event && entry?.visible
    && (!viewer?.getAtomHover || viewer.getAtomHover() === event)
    && event.source.artifactId === entry.current_artifact_id
    && props.structures.get(entry.id) === event.source.normalized
    && source?.settings === event.source.settings ? event.reference : null;
  return <ViewerInformationStrip {...props} hover={reference} />;
}
