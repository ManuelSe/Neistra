import { useQueries } from "@tanstack/react-query";
import { BriefcaseBusiness, ChevronDown, History, TableProperties } from "lucide-react";
import { useMemo } from "react";
import { molecularApi } from "../api/client";
import type { Project, Selection } from "../api/types";
import { canonicalSelection } from "../selection/selection";
import { HistoryPanel } from "./HistoryPanel";
import { IconButton } from "./IconButton";
import { JobsPanel } from "./JobsPanel";

export type LowerPanelTab = "properties" | "history" | "jobs";

interface LowerPanelProps {
  project: Project | undefined;
  selection: Selection;
  onSelection: (selection: Selection) => void;
  tab: LowerPanelTab;
  onTabChange: (tab: LowerPanelTab) => void;
  onNewJob: () => void;
  onProjectUpdate: (project: Project) => void;
  onNotice: (kind: "success" | "error", text: string) => void;
  onCollapse?: () => void;
}

export function LowerPanel({
  project,
  selection,
  onSelection,
  tab,
  onTabChange,
  onNewJob,
  onProjectUpdate,
  onNotice,
  onCollapse,
}: LowerPanelProps) {
  const entryIds = useMemo(
    () => [...new Set(selection.atoms.map((atom) => atom.structure_id))],
    [selection.atoms],
  );
  const queries = useQueries({
    queries: entryIds.map((entryId) => {
      const entry = project?.entries.find((item) => item.id === entryId);
      return {
        queryKey: ["structure", project?.id, entryId, entry?.current_artifact_id],
        queryFn: () => molecularApi.structure(project?.id ?? "", entryId),
        enabled: !!entry?.current_artifact_id,
        staleTime: Number.POSITIVE_INFINITY,
      };
    }),
  });
  const structures = new Map(
    queries.flatMap((query) =>
      query.data ? [[query.data.entry_id, query.data.structure] as const] : [],
    ),
  );

  return (
    <section className="panel-content lower-panel" aria-label="Properties and history">
      <div className="lower-panel-header">
        <div className="lower-tabs" role="tablist" aria-label="Lower panel views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "properties"}
            onClick={() => onTabChange("properties")}
          >
            <TableProperties size={15} /> Properties
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => onTabChange("history")}
          >
            <History size={15} /> History
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "jobs"}
            onClick={() => onTabChange("jobs")}
          >
            <BriefcaseBusiness size={15} /> Jobs
          </button>
        </div>
        {onCollapse ? (
          <IconButton label="Collapse lower panel" onClick={onCollapse}>
            <ChevronDown size={17} />
          </IconButton>
        ) : null}
      </div>
      {tab === "jobs" ? (
        <JobsPanel
          project={project}
          onNewJob={onNewJob}
          onProjectUpdate={onProjectUpdate}
          onNotice={onNotice}
        />
      ) : tab === "history" ? (
        <HistoryPanel project={project} embedded />
      ) : (
        <div className="property-table-wrap">
          <table className="property-table">
            <thead>
              <tr>
                <th>Structure</th>
                <th>Index</th>
                <th>Atom</th>
                <th>Element</th>
                <th>Residue</th>
                <th>Chain</th>
                <th>Charge</th>
                <th>X</th>
                <th>Y</th>
                <th>Z</th>
              </tr>
            </thead>
            <tbody>
              {selection.atoms.map((reference) => {
                const entry = project?.entries.find(
                  (item) => item.id === reference.structure_id,
                );
                const structure = structures.get(reference.structure_id);
                const atom = structure?.atoms.find(
                  (item) => item.id === reference.atom_id,
                );
                const residue = structure?.residues.find(
                  (item) => item.id === atom?.residue_id,
                );
                const chain = structure?.chains.find(
                  (item) => item.id === residue?.chain_id,
                );
                if (!entry || !atom) return null;
                return (
                  <tr
                    key={`${reference.structure_id}:${reference.atom_id}`}
                    onClick={() =>
                      onSelection(
                        canonicalSelection([reference], "atom", "inspector"),
                      )
                    }
                  >
                    <td>{entry.name}</td>
                    <td>{atom.id}</td>
                    <td>{atom.name}</td>
                    <td>{atom.element}</td>
                    <td>{residue ? `${residue.name} ${residue.author_number ?? residue.label_number ?? residue.id}` : "-"}</td>
                    <td>{chain?.name || "-"}</td>
                    <td>{atom.formal_charge ?? "-"}</td>
                    {atom.coordinates.map((value, index) => (
                      <td key={index}>{value.toFixed(3)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selection.atoms.length === 0 ? (
            <p className="empty-label">Select atoms to inspect their properties.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
