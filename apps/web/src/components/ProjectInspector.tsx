import { useQueries } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  FilePenLine,
  LoaderCircle,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { molecularApi } from "../api/client";
import type {
  Project,
  SavedSelection,
  Selection,
  SelectionGranularity,
  SelectionMode,
} from "../api/types";
import {
  chainSelection,
  residueSelection,
  selectedEntryIds,
  selectionMode,
  selectionSummary,
  type PredicateField,
  type StructureMap,
} from "../selection/selection";
import { IconButton } from "./IconButton";

interface ProjectInspectorProps {
  project: Project | undefined;
  selection: Selection;
  pickingGranularity: SelectionGranularity;
  busy: boolean;
  selectionBusy?: boolean;
  onApply: (name: string, description: string | null) => void;
  onApplySelection: (selection: Selection, mode: SelectionMode) => void;
  onPickingGranularity: (granularity: SelectionGranularity) => void;
  onClearSelection: () => void;
  onExpandSelection: (granularity: SelectionGranularity) => void;
  onInvertSelection: () => void;
  onPredicateSelection: (
    field: PredicateField,
    value: string,
    mode: SelectionMode,
  ) => void;
  onSpatialSelection: (
    distance: number,
    granularity: "atom" | "residue",
    mode: SelectionMode,
  ) => void;
  onSaveSelection: (name: string) => void;
  onLoadSelection: (saved: SavedSelection) => void;
  onDeleteSelection: (saved: SavedSelection) => void;
  onCollapse?: () => void;
}

const residueCodes: Record<string, string> = {
  ALA: "A",
  ARG: "R",
  ASN: "N",
  ASP: "D",
  CYS: "C",
  GLN: "Q",
  GLU: "E",
  GLY: "G",
  HIS: "H",
  ILE: "I",
  LEU: "L",
  LYS: "K",
  MET: "M",
  PHE: "F",
  PRO: "P",
  SER: "S",
  THR: "T",
  TRP: "W",
  TYR: "Y",
  VAL: "V",
};

function DetailsPanel({
  project,
  busy,
  onApply,
}: Pick<ProjectInspectorProps, "project" | "busy" | "onApply">) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
  }, [project?.description, project?.id, project?.name]);
  if (!project) {
    return (
      <div className="empty-panel">
        <FilePenLine size={28} />
        <p>No project selected</p>
      </div>
    );
  }
  const changed =
    name !== project.name || description !== (project.description ?? "");
  return (
    <form
      className="inspector-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() && changed) onApply(name.trim(), description.trim() || null);
      }}
    >
      <label>
        Name
        <input
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label>
        Description
        <textarea
          value={description}
          maxLength={2000}
          rows={4}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <dl className="project-facts">
        <div>
          <dt>Structures</dt>
          <dd>{project.entries.length}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{project.revision}</dd>
        </div>
        <div>
          <dt>Checkpoint</dt>
          <dd>{project.checkpoint_revision}</dd>
        </div>
      </dl>
      <button
        className="primary-button"
        type="submit"
        disabled={!changed || busy || !name.trim()}
      >
        Apply changes
      </button>
    </form>
  );
}

function SelectionPanel({
  project,
  selection,
  pickingGranularity,
  structures,
  busy,
  onClearSelection,
  onPickingGranularity,
  onExpandSelection,
  onInvertSelection,
  onPredicateSelection,
  onSpatialSelection,
  onSaveSelection,
  onLoadSelection,
  onDeleteSelection,
}: Pick<
  ProjectInspectorProps,
  | "project"
  | "selection"
  | "pickingGranularity"
  | "onClearSelection"
  | "onPickingGranularity"
  | "onExpandSelection"
  | "onInvertSelection"
  | "onPredicateSelection"
  | "onSpatialSelection"
  | "onSaveSelection"
  | "onLoadSelection"
  | "onDeleteSelection"
> & { structures: StructureMap; busy: boolean }) {
  const [mode, setMode] = useState<SelectionMode>("replace");
  const [field, setField] = useState<PredicateField>("atom_name");
  const [value, setValue] = useState("");
  const [distance, setDistance] = useState("4");
  const [distanceGranularity, setDistanceGranularity] =
    useState<"atom" | "residue">("atom");
  const [savedName, setSavedName] = useState("");
  const summary = selectionSummary(selection, structures);

  return (
    <div className="selection-panel">
      <dl className="selection-summary" aria-label="Current selection summary">
        <div><dt>Atoms</dt><dd>{summary.atoms}</dd></div>
        <div><dt>Residues</dt><dd>{summary.residues}</dd></div>
        <div><dt>Chains</dt><dd>{summary.chains}</dd></div>
        <div><dt>Structures</dt><dd>{summary.structures}</dd></div>
      </dl>
      <div className="selection-meta">
        <span>{selection.granularity}</span>
        <span>from {selection.source}</span>
        {busy ? <LoaderCircle size={14} aria-label="Running selection operation" /> : null}
      </div>
      <div className="selection-toolbar">
        <button type="button" onClick={onClearSelection} disabled={selection.atoms.length === 0}>
          <X size={15} /> Clear
        </button>
        <button type="button" onClick={onInvertSelection} disabled={!project?.entries.length || busy}>
          Invert
        </button>
      </div>

      <fieldset className="selection-section">
        <legend>Operation mode</legend>
        <div className="segmented-control">
          {(["replace", "add", "subtract"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={mode === item ? "active" : ""}
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="selection-section">
        <legend>Viewer pick</legend>
        <div className="segmented-control four">
          {(["atom", "residue", "chain", "structure"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={pickingGranularity === item ? "active" : ""}
              aria-pressed={pickingGranularity === item}
              onClick={() => onPickingGranularity(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="selection-section">
        <legend>Expand current</legend>
        <div className="selection-toolbar three">
          {(["residue", "chain", "structure"] as const).map((granularity) => (
            <button
              type="button"
              key={granularity}
              disabled={selection.atoms.length === 0 || busy}
              onClick={() => onExpandSelection(granularity)}
            >
              {granularity}
            </button>
          ))}
        </div>
      </fieldset>

      <form
        className="selection-section selection-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onPredicateSelection(field, value, mode);
        }}
      >
        <label>
          Select by
          <select value={field} onChange={(event) => setField(event.target.value as PredicateField)}>
            <option value="atom_name">Atom name</option>
            <option value="element">Element</option>
            <option value="residue_name">Residue name</option>
            <option value="residue_number">Residue number</option>
            <option value="chain">Chain</option>
            <option value="structure">Structure ID</option>
          </select>
        </label>
        <label>
          Value
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <button className="secondary-button" type="submit" disabled={!value.trim() || busy}>
          Apply query
        </button>
      </form>

      <form
        className="selection-section selection-form"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Number(distance);
          if (Number.isFinite(parsed) && parsed >= 0) {
            onSpatialSelection(parsed, distanceGranularity, mode);
          }
        }}
      >
        <div className="form-row">
          <label>
            Within (angstrom)
            <input
              type="number"
              min="0"
              step="0.1"
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
            />
          </label>
          <label>
            Result
            <select
              value={distanceGranularity}
              onChange={(event) =>
                setDistanceGranularity(event.target.value as "atom" | "residue")
              }
            >
              <option value="atom">Atoms</option>
              <option value="residue">Residues</option>
            </select>
          </label>
        </div>
        <button
          className="secondary-button"
          type="submit"
          disabled={selection.atoms.length === 0 || busy}
        >
          Run distance selection
        </button>
      </form>

      <form
        className="selection-section save-selection"
        onSubmit={(event) => {
          event.preventDefault();
          if (savedName.trim()) {
            onSaveSelection(savedName.trim());
            setSavedName("");
          }
        }}
      >
        <label>
          Saved selections
          <span className="input-with-button">
            <input
              value={savedName}
              maxLength={120}
              placeholder="Selection name"
              onChange={(event) => setSavedName(event.target.value)}
            />
            <button
              type="submit"
              className="icon-submit"
              aria-label="Save current selection"
              disabled={!savedName.trim() || selection.atoms.length === 0 || busy}
            >
              <Save size={15} />
            </button>
          </span>
        </label>
        <div className="saved-selection-list">
          {project?.saved_selections?.length ? (
            project.saved_selections.map((saved) => (
              <div key={saved.id} className="saved-selection-row">
                <button type="button" onClick={() => onLoadSelection(saved)}>
                  <span>{saved.name}</span>
                  <small>{saved.atom_references.length} atoms</small>
                </button>
                {saved.warnings.length > 0 ? (
                  <span
                    className="saved-warning"
                    title={saved.warnings.map((warning) => warning.message).join("\n")}
                    aria-label={`${saved.warnings.length} saved selection warnings`}
                  >
                    <AlertTriangle size={14} />
                  </span>
                ) : null}
                <IconButton
                  label={`Delete saved selection ${saved.name}`}
                  onClick={() => onDeleteSelection(saved)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))
          ) : (
            <p className="empty-label">No saved selections</p>
          )}
        </div>
      </form>
    </div>
  );
}

function SequencePanel({
  project,
  selection,
  structures,
  loading,
  onApplySelection,
}: Pick<ProjectInspectorProps, "project" | "selection" | "onApplySelection"> & {
  structures: StructureMap;
  loading: boolean;
}) {
  const selected = new Set(selection.atoms.map((reference) => `${reference.structure_id}:${reference.atom_id}`));
  if (loading) {
    return <div className="sequence-loading"><LoaderCircle size={18} /> Loading sequence</div>;
  }
  const proteinEntries = project?.entries.filter((entry) => {
    const structure = structures.get(entry.id);
    return structure?.residues.some((residue) => residue.component_type === "polymer");
  }) ?? [];
  if (proteinEntries.length === 0) {
    return <p className="empty-label">No visible protein sequence</p>;
  }
  const isResidueSelected = (entryId: string, atomIds: number[]) =>
    atomIds.length > 0 && atomIds.every((atomId) => selected.has(`${entryId}:${atomId}`));

  return (
    <div className="sequence-panel">
      {proteinEntries.map((entry) => {
        const structure = structures.get(entry.id);
        if (!structure) return null;
        return (
          <section key={entry.id} className="sequence-entry">
            <h3>{entry.name}</h3>
            {structure.chains.map((chain) => {
              const residues = structure.residues.filter(
                (residue) =>
                  residue.chain_id === chain.id && residue.component_type === "polymer",
              );
              if (residues.length === 0) return null;
              return (
                <div key={chain.id} className="sequence-chain">
                  <button
                    type="button"
                    className="chain-label"
                    onClick={(event) =>
                      onApplySelection(
                        chainSelection(entry.id, structure, chain.id, "sequence"),
                        selectionMode(event.nativeEvent),
                      )
                    }
                  >
                    Chain {chain.name || "-"}
                  </button>
                  <div className="residue-strip">
                    {residues.map((residue) => {
                      const atomIds = structure.atoms
                        .filter((atom) => atom.residue_id === residue.id)
                        .map((atom) => atom.id);
                      return (
                        <button
                          type="button"
                          key={residue.id}
                          className={isResidueSelected(entry.id, atomIds) ? "selected" : ""}
                          aria-pressed={isResidueSelected(entry.id, atomIds)}
                          aria-label={`${residue.name} ${residue.author_number ?? residue.label_number ?? residue.id}`}
                          title={`${residue.name} ${residue.author_number ?? residue.label_number ?? residue.id}`}
                          onClick={(event: MouseEvent<HTMLButtonElement>) =>
                            onApplySelection(
                              residueSelection(entry.id, structure, residue.id, "sequence"),
                              selectionMode(event.nativeEvent),
                            )
                          }
                        >
                          <span>{residueCodes[residue.name] ?? "X"}</span>
                          <small>{residue.author_number ?? residue.label_number ?? residue.id}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

export function ProjectInspector(props: ProjectInspectorProps) {
  const { project, selection, onCollapse } = props;
  const [tab, setTab] = useState<"selection" | "sequence" | "details">("selection");
  const relevantIds = useMemo(() => {
    const ids = new Set(
      project?.entries.filter((entry) => entry.visible).map((entry) => entry.id),
    );
    for (const entryId of selectedEntryIds(selection)) ids.add(entryId);
    return [...ids];
  }, [project?.entries, selection]);
  const structureQueries = useQueries({
    queries: relevantIds.map((entryId) => {
      const entry = project?.entries.find((item) => item.id === entryId);
      return {
        queryKey: ["structure", project?.id, entryId, entry?.current_artifact_id],
        queryFn: () => molecularApi.structure(project?.id ?? "", entryId),
        enabled: !!project && !!entry?.current_artifact_id,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      };
    }),
  });
  const structures = useMemo(
    () =>
      new Map(
        structureQueries.flatMap((query) =>
          query.data ? [[query.data.entry_id, query.data.structure] as const] : [],
        ),
      ),
    [structureQueries],
  );
  const loading = structureQueries.some((query) => query.isPending);

  return (
    <section className="panel-content project-inspector" aria-label="Project inspector">
      <div className="panel-header inspector-header">
        <div>
          <span className="panel-eyebrow">Inspector</span>
          <h2>{tab === "selection" ? "Selection" : tab === "sequence" ? "Sequence" : "Project"}</h2>
        </div>
        {onCollapse ? (
          <IconButton label="Collapse inspector" onClick={onCollapse}>
            <ChevronRight size={17} />
          </IconButton>
        ) : null}
      </div>
      <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
        {(["selection", "sequence", "details"] as const).map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === item}
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {tab === "selection" ? (
          <SelectionPanel
            {...props}
            structures={structures}
            busy={props.busy || !!props.selectionBusy}
          />
        ) : tab === "sequence" ? (
          <SequencePanel
            project={project}
            selection={selection}
            structures={structures}
            loading={loading}
            onApplySelection={props.onApplySelection}
          />
        ) : (
          <DetailsPanel project={project} busy={props.busy} onApply={props.onApply} />
        )}
      </div>
    </section>
  );
}
