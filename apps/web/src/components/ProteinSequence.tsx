import { LoaderCircle } from "lucide-react";
import { useMemo } from "react";
import type { Project, Selection, SelectionMode, StructureProjection } from "../api/types";
import { membershipSelectedState } from "../selection/componentMembership";
import { residueLabel, residuePosition, type ResidueSelectionRequest } from "../selection/gestures";
import { chainSelection, residueSelection, selectionMode } from "../selection/selection";
import { proteinSequenceRows, residueCode } from "../selection/sequence";
import { useSelectionStore } from "../store/selection";

interface ProteinSequenceProps {
  project: Project | undefined;
  selection: Selection;
  projections: ReadonlyMap<string, StructureProjection>;
  loading: boolean;
  onApplySelection: (selection: Selection, mode: SelectionMode) => void;
  onSelectResidue?: (request: ResidueSelectionRequest) => void;
}

export function ProteinSequence({ project, selection, projections, loading,
  onApplySelection, onSelectResidue }: ProteinSequenceProps) {
  const projectEpoch = useSelectionStore(state => state.projectEpoch);
  const selected = useMemo(() => {
    const result = new Map<string, Set<number>>();
    for (const atom of selection.atoms) {
      const ids = result.get(atom.structure_id) ?? new Set<number>();
      ids.add(atom.atom_id); result.set(atom.structure_id, ids);
    }
    return result;
  }, [selection.atoms]);
  const entries = useMemo(() => (project?.entries ?? []).flatMap(entry => {
    const projection = projections.get(entry.id);
    if (!projection) return [];
    const rows = proteinSequenceRows({ entryId: entry.id, normalized: projection.structure, hierarchy: projection.hierarchy });
    return rows.length ? [{ entry, projection, rows }] : [];
  }), [project?.entries, projections]);
  if (!entries.length) return loading
    ? <div className="sequence-loading" role="status"><LoaderCircle size={18} /> Loading sequence</div>
    : <p className="empty-label">No protein sequence</p>;
  return <div className="sequence-panel">
    {entries.map(({ entry, projection, rows }) => <section key={entry.id} className="sequence-entry">
      <h3>{entry.name}</h3>
      {rows.map(row => <div key={row.key} className="sequence-chain">
        <button type="button" className="chain-label" onClick={event => onApplySelection(
          chainSelection(entry.id, projection.structure, row.chainId, "sequence"), selectionMode(event.nativeEvent))}>
          Chain {row.chainName}{row.qualifier}
        </button>
        <div className="residue-strip">{row.residues.map(residue => {
          const coverage = membershipSelectedState(row.residueAtoms.get(residue.id) ?? [], selected.get(entry.id) ?? new Set());
          const label = `${residueLabel(residue)} · chain ${row.chainName} in ${entry.name}${row.qualifier}`;
          return <button type="button" key={residue.id} className={coverage === false ? "" : "selected"}
            aria-pressed={coverage} aria-label={label} title={label}
            onClick={event => {
              const mode = selectionMode(event.nativeEvent);
              if (onSelectResidue && project && entry.current_artifact_id) {
                onSelectResidue({ projectId: project.id, projectEpoch, entryId: entry.id,
                  artifactId: entry.current_artifact_id, residueId: residue.id, source: "sequence", mode, shift: event.shiftKey });
              } else onApplySelection(residueSelection(entry.id, projection.structure, residue.id, "sequence"), mode);
            }}><span>{residueCode(residue)}</span><small>{residuePosition(residue)}</small></button>;
        })}</div>
      </div>)}
    </section>)}
  </div>;
}
