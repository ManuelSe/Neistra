import {
  AlertTriangle,
  Atom,
  Beaker,
  CircleMinus,
  CirclePlus,
  Dna,
  Droplets,
  Hash,
  Move3D,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CoordinateTransform,
  Point3D,
  Project,
  ProteinEdit,
  ProteinEditResult,
  Selection,
  StandardAminoAcid,
} from "../api/types";
import type { StructureMap } from "../selection/selection";

interface ProteinEditorPanelProps {
  project: Project;
  selection: Selection;
  structures: StructureMap;
  busy: boolean;
  onEdit: (entryId: string, edit: ProteinEdit) => Promise<ProteinEditResult>;
  onMove: (transform: CoordinateTransform) => Promise<void>;
}

const aminoAcids: StandardAminoAcid[] = [
  "ALA",
  "ARG",
  "ASN",
  "ASP",
  "CYS",
  "GLN",
  "GLU",
  "GLY",
  "HIS",
  "ILE",
  "LEU",
  "LYS",
  "MET",
  "PHE",
  "PRO",
  "SER",
  "THR",
  "TRP",
  "TYR",
  "VAL",
];

function numeric3(values: [string, string, string]): Point3D | null {
  const parsed = values.map(Number) as Point3D;
  return parsed.every(Number.isFinite) ? parsed : null;
}

export function ProteinEditorPanel({
  project,
  selection,
  structures,
  busy,
  onEdit,
  onMove,
}: ProteinEditorPanelProps) {
  const proteins = project.entries.filter(
    (entry) =>
      entry.structure_type === "protein" || entry.structure_type === "complex",
  );
  const selectedProtein = selection.atoms.find((reference) =>
    proteins.some((entry) => entry.id === reference.structure_id),
  )?.structure_id;
  const [entryId, setEntryId] = useState(selectedProtein ?? proteins[0]?.id ?? "");
  const [residueId, setResidueId] = useState("");
  const [chainId, setChainId] = useState("");
  const [targetName, setTargetName] = useState<StandardAminoAcid>("ALA");
  const [chainName, setChainName] = useState("");
  const [renumberStart, setRenumberStart] = useState("1");
  const [renumberStep, setRenumberStep] = useState("1");
  const [hydrogenScope, setHydrogenScope] =
    useState<"all" | "selection">("all");
  const [ph, setPh] = useState("7");
  const [moveScope, setMoveScope] = useState<"atoms" | "residues">("atoms");
  const [translation, setTranslation] = useState<[string, string, string]>([
    "0",
    "0",
    "0",
  ]);
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<ProteinEditResult | null>(null);

  useEffect(() => {
    if (!proteins.some((entry) => entry.id === entryId)) {
      setEntryId(proteins[0]?.id ?? "");
    }
  }, [entryId, proteins]);

  const entry = proteins.find((item) => item.id === entryId);
  const structure = structures.get(entryId);
  const polymerResidues = useMemo(
    () =>
      structure?.residues.filter(
        (residue) => residue.component_type === "polymer",
      ) ?? [],
    [structure],
  );
  const chains = useMemo(() => structure?.chains ?? [], [structure]);
  const selectedAtomIds = useMemo(
    () =>
      selection.atoms
        .filter((reference) => reference.structure_id === entryId)
        .map((reference) => reference.atom_id),
    [entryId, selection.atoms],
  );
  const selectedResidueIds = useMemo(() => {
    const ids = new Set(
      selectedAtomIds.flatMap((atomId) => {
        const residue = structure?.atoms.find((atom) => atom.id === atomId)
          ?.residue_id;
        return residue === null || residue === undefined ? [] : [residue];
      }),
    );
    return [...ids].sort((left, right) => left - right);
  }, [selectedAtomIds, structure]);
  const selectedResidueAtomIds = useMemo(() => {
    const residueIds = new Set(selectedResidueIds);
    return (
      structure?.atoms
        .filter((atom) => atom.residue_id !== null && residueIds.has(atom.residue_id))
        .map((atom) => atom.id) ?? []
    );
  }, [selectedResidueIds, structure]);

  useEffect(() => {
    const selected = selectedResidueIds.find((id) =>
      polymerResidues.some((residue) => residue.id === id),
    );
    if (selected !== undefined) {
      setResidueId(String(selected));
    } else if (!polymerResidues.some((residue) => String(residue.id) === residueId)) {
      setResidueId(polymerResidues[0] ? String(polymerResidues[0].id) : "");
    }
  }, [polymerResidues, residueId, selectedResidueIds]);

  useEffect(() => {
    const selectedResidue = structure?.residues.find(
      (residue) => selectedResidueIds.includes(residue.id),
    );
    const selectedChain = selectedResidue?.chain_id;
    if (selectedChain !== undefined) {
      setChainId(String(selectedChain));
    } else if (!chains.some((chain) => String(chain.id) === chainId)) {
      setChainId(chains[0] ? String(chains[0].id) : "");
    }
  }, [chainId, chains, selectedResidueIds, structure]);

  const chain = chains.find((item) => String(item.id) === chainId);
  const residue = polymerResidues.find((item) => String(item.id) === residueId);
  useEffect(() => {
    if (chain) {
      setChainName(chain.name);
      const first = structure?.residues.find(
        (item) => item.chain_id === chain.id,
      );
      setRenumberStart(String(first?.author_number ?? 1));
    }
  }, [chain, structure]);
  useEffect(() => {
    if (residue && aminoAcids.includes(residue.name as StandardAminoAcid)) {
      const alternative = aminoAcids.find((item) => item !== residue.name);
      setTargetName(alternative ?? "ALA");
    }
  }, [residue]);

  const execute = async (edit: ProteinEdit) => {
    if (!entryId) return;
    setPending(true);
    try {
      setLastResult(await onEdit(entryId, edit));
    } catch {
      // The application mutation surface provides visible API error feedback.
    } finally {
      setPending(false);
    }
  };
  const disabled = busy || pending || !entry || entry.locked || !structure;
  const selectedHydrogenResidues =
    hydrogenScope === "selection" ? selectedResidueIds : null;
  const moveAtomIds =
    moveScope === "atoms" ? selectedAtomIds : selectedResidueAtomIds;
  const hasWater = structure?.residues.some(
    (item) => item.component_type === "water",
  );
  const hasIon = structure?.residues.some(
    (item) => item.component_type === "ion",
  );

  if (proteins.length === 0) {
    return <p className="empty-label">Import a protein or complex to edit it.</p>;
  }

  return (
    <div className="protein-editor" aria-label="Protein editor">
      <label>
        Protein
        <select value={entryId} onChange={(event) => setEntryId(event.target.value)}>
          {proteins.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <div className="ligand-status">
        <span>
          {structure
            ? `${structure.atoms.length} atoms / ${structure.residues.length} residues`
            : "Loading"}
        </span>
        <span>{selectedAtomIds.length} selected</span>
        {entry?.locked ? <strong>Locked</strong> : null}
      </div>

      <div className="scientific-note">
        <AlertTriangle size={15} />
        <span>
          Template mutation is deterministic. No rotamer search, protonation
          analysis, or full protein preparation is performed.
        </span>
      </div>

      <fieldset className="edit-section">
        <legend><Trash2 size={15} /> Remove</legend>
        <div className="edit-actions">
          <button
            type="button"
            className="danger-button"
            disabled={disabled || selectedAtomIds.length === 0}
            onClick={() =>
              void execute({
                operation: "protein.atom.delete",
                atom_ids: selectedAtomIds,
              })
            }
          >
            <Atom size={15} /> Delete selected atoms
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={disabled || selectedResidueIds.length === 0}
            onClick={() =>
              void execute({
                operation: "protein.residue.delete",
                residue_ids: selectedResidueIds,
              })
            }
          >
            <Dna size={15} /> Delete selected residues
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={disabled || !chain}
            onClick={() =>
              chain &&
              void execute({
                operation: "protein.chain.delete",
                chain_ids: [chain.id],
              })
            }
          >
            Delete chain
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={disabled || !hasWater}
            onClick={() => void execute({ operation: "protein.water.delete" })}
          >
            <Droplets size={15} /> Remove water
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={disabled || !hasIon}
            onClick={() => void execute({ operation: "protein.ion.delete" })}
          >
            <CircleMinus size={15} /> Remove ions
          </button>
        </div>
      </fieldset>

      <fieldset className="edit-section">
        <legend><Tag size={15} /> Hierarchy</legend>
        <label>
          Chain
          <select value={chainId} onChange={(event) => setChainId(event.target.value)}>
            {chains.map((item) => (
              <option key={item.id} value={item.id}>{item.name || "(blank)"}</option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            New chain name
            <input
              value={chainName}
              maxLength={160}
              onChange={(event) => setChainName(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={
              disabled ||
              !chain ||
              !chainName.trim() ||
              chainName.trim() === chain.name
            }
            onClick={() =>
              chain &&
              void execute({
                operation: "protein.chain.rename",
                chain_id: chain.id,
                name: chainName.trim(),
              })
            }
          >
            Apply name
          </button>
        </div>
        <div className="form-row three">
          <label>
            Start
            <input
              type="number"
              value={renumberStart}
              onChange={(event) => setRenumberStart(event.target.value)}
            />
          </label>
          <label>
            Step
            <input
              type="number"
              value={renumberStep}
              onChange={(event) => setRenumberStep(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={
              disabled ||
              !chain ||
              !Number.isInteger(Number(renumberStart)) ||
              !Number.isInteger(Number(renumberStep)) ||
              Number(renumberStep) === 0
            }
            onClick={() =>
              chain &&
              void execute({
                operation: "protein.residue.renumber",
                chain_id: chain.id,
                start: Number(renumberStart),
                step: Number(renumberStep),
              })
            }
          >
            <Hash size={15} /> Renumber
          </button>
        </div>
      </fieldset>

      <fieldset className="edit-section">
        <legend><Dna size={15} /> Mutation</legend>
        <label>
          Residue
          <select
            value={residueId}
            onChange={(event) => setResidueId(event.target.value)}
          >
            {polymerResidues.map((item) => {
              const itemChain = chains.find((chainItem) => chainItem.id === item.chain_id);
              return (
                <option key={item.id} value={item.id}>
                  {itemChain?.name}:{item.name}{" "}
                  {item.author_number ?? item.label_number ?? item.id}
                </option>
              );
            })}
          </select>
        </label>
        <div className="form-row">
          <label>
            Target amino acid
            <select
              value={targetName}
              onChange={(event) =>
                setTargetName(event.target.value as StandardAminoAcid)
              }
            >
              {aminoAcids.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button
            type="button"
            disabled={disabled || !residue || residue.name === targetName}
            onClick={() =>
              residue &&
              void execute({
                operation: "protein.residue.mutate",
                residue_id: residue.id,
                target_name: targetName,
              })
            }
          >
            Apply mutation
          </button>
        </div>
      </fieldset>

      <fieldset className="edit-section">
        <legend><Beaker size={15} /> Hydrogens</legend>
        <div className="segmented-control">
          <button
            type="button"
            className={hydrogenScope === "all" ? "active" : ""}
            onClick={() => setHydrogenScope("all")}
          >
            All
          </button>
          <button
            type="button"
            className={hydrogenScope === "selection" ? "active" : ""}
            onClick={() => setHydrogenScope("selection")}
          >
            Selected residues
          </button>
        </div>
        <label>
          Placement pH
          <input
            type="number"
            min="0"
            max="14"
            step="0.1"
            value={ph}
            onChange={(event) => setPh(event.target.value)}
          />
        </label>
        <div className="edit-actions">
          <button
            type="button"
            disabled={
              disabled ||
              !Number.isFinite(Number(ph)) ||
              Number(ph) < 0 ||
              Number(ph) > 14 ||
              (hydrogenScope === "selection" &&
                selectedResidueIds.length === 0)
            }
            onClick={() =>
              void execute({
                operation: "protein.hydrogen.add",
                residue_ids: selectedHydrogenResidues,
                ph: Number(ph),
              })
            }
          >
            <CirclePlus size={15} /> Add H
          </button>
          <button
            type="button"
            disabled={
              disabled ||
              (hydrogenScope === "selection" &&
                selectedResidueIds.length === 0)
            }
            onClick={() =>
              void execute({
                operation: "protein.hydrogen.remove",
                residue_ids: selectedHydrogenResidues,
              })
            }
          >
            <CircleMinus size={15} /> Remove H
          </button>
        </div>
      </fieldset>

      <fieldset className="edit-section">
        <legend><Move3D size={15} /> Move</legend>
        <div className="segmented-control">
          <button
            type="button"
            className={moveScope === "atoms" ? "active" : ""}
            onClick={() => setMoveScope("atoms")}
          >
            Selected atoms
          </button>
          <button
            type="button"
            className={moveScope === "residues" ? "active" : ""}
            onClick={() => setMoveScope("residues")}
          >
            Whole residues
          </button>
        </div>
        <div className="coordinate-grid">
          {(["dX", "dY", "dZ"] as const).map((axis, index) => (
            <label key={axis}>
              {axis}
              <input
                type="number"
                step="0.1"
                value={translation[index]}
                onChange={(event) =>
                  setTranslation((current) =>
                    current.map((value, item) =>
                      item === index ? event.target.value : value,
                    ) as [string, string, string],
                  )
                }
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled || moveAtomIds.length === 0 || !numeric3(translation)}
          onClick={() => {
            const vector = numeric3(translation);
            if (vector) {
              void onMove({
                entry_id: entryId,
                scope: "selection",
                selection: {
                  schema_version: 1,
                  atoms: moveAtomIds.map((atom_id) => ({
                    structure_id: entryId,
                    atom_id,
                  })),
                  granularity: moveScope === "atoms" ? "atom" : "residue",
                  source: "inspector",
                },
                translation: vector,
                rotation_degrees: [0, 0, 0],
                pivot_mode: "selection_centroid",
                pivot: null,
              });
            }
          }}
        >
          Move {moveScope === "atoms" ? "atoms" : "residues"}
        </button>
      </fieldset>

      {lastResult ? (
        <section className="edit-report" aria-live="polite">
          <h3>Last protein edit</h3>
          <p>{lastResult.report.operation}</p>
          {lastResult.warnings.map((warning, index) => (
            <div className="edit-warning" key={`${warning.code}-${index}`}>
              {warning.message}
            </div>
          ))}
          {lastResult.warnings.length === 0 ? (
            <small>No new protein warnings</small>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
