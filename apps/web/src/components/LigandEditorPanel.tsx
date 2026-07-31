import {
  Atom,
  Beaker,
  CircleMinus,
  CirclePlus,
  Eraser,
  Link,
  Rotate3D,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CoordinateTransform,
  LigandEdit,
  LigandEditResult,
  Point3D,
  Project,
  Selection,
} from "../api/types";
import type { StructureMap } from "../selection/selection";

interface LigandEditorPanelProps {
  project: Project;
  selection: Selection;
  structures: StructureMap;
  busy: boolean;
  onEdit: (entryId: string, edit: LigandEdit) => Promise<LigandEditResult>;
  onMove: (transform: CoordinateTransform) => Promise<void>;
}

const commonElements = ["C", "N", "O", "S", "P", "F", "Cl", "Br", "I", "H"];

function numeric3(values: [string, string, string]): Point3D | null {
  const parsed = values.map(Number) as Point3D;
  return parsed.every(Number.isFinite) ? parsed : null;
}

export function LigandEditorPanel({
  project,
  selection,
  structures,
  busy,
  onEdit,
  onMove,
}: LigandEditorPanelProps) {
  const ligands = project.entries.filter((entry) => entry.structure_type === "ligand");
  const selectedLigand = selection.atoms.find((reference) =>
    ligands.some((entry) => entry.id === reference.structure_id),
  )?.structure_id;
  const [entryId, setEntryId] = useState(selectedLigand ?? ligands[0]?.id ?? "");
  const [element, setElement] = useState("C");
  const [charge, setCharge] = useState("0");
  const [coordinates, setCoordinates] = useState<[string, string, string]>([
    "0",
    "0",
    "0",
  ]);
  const [bondId, setBondId] = useState("");
  const [atom1, setAtom1] = useState("1");
  const [atom2, setAtom2] = useState("2");
  const [bondOrder, setBondOrder] = useState("1");
  const [translation, setTranslation] = useState<[string, string, string]>([
    "0",
    "0",
    "0",
  ]);
  const [angle, setAngle] = useState("30");
  const [forceField, setForceField] =
    useState<"auto" | "mmff" | "uff">("auto");
  const [maxIterations, setMaxIterations] = useState("200");
  const [scope, setScope] = useState<"all" | "selection">("all");
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<LigandEditResult | null>(null);

  useEffect(() => {
    if (!ligands.some((entry) => entry.id === entryId)) {
      setEntryId(ligands[0]?.id ?? "");
    }
  }, [entryId, ligands]);

  const entry = ligands.find((item) => item.id === entryId);
  const structure = structures.get(entryId);
  const selectedAtomIds = useMemo(
    () =>
      selection.atoms
        .filter((reference) => reference.structure_id === entryId)
        .map((reference) => reference.atom_id),
    [entryId, selection.atoms],
  );
  const selectedAtom = selectedAtomIds.length === 1
    ? structure?.atoms.find((atom) => atom.id === selectedAtomIds[0])
    : undefined;
  const bonds = useMemo(() => structure?.bonds ?? [], [structure]);

  useEffect(() => {
    if (selectedAtom) {
      setElement(selectedAtom.element);
      setCharge(String(selectedAtom.formal_charge ?? 0));
      setCoordinates(selectedAtom.coordinates.map(String) as [string, string, string]);
    }
  }, [selectedAtom]);

  useEffect(() => {
    if (!bonds.some((bond) => String(bond.id) === bondId)) {
      setBondId(bonds[0] ? String(bonds[0].id) : "");
    }
  }, [bondId, bonds]);

  const execute = async (edit: LigandEdit) => {
    if (!entryId) return;
    setPending(true);
    try {
      setLastResult(await onEdit(entryId, edit));
    } finally {
      setPending(false);
    }
  };
  const disabled = busy || pending || !entry || entry.locked || !structure;
  const selectedScope = scope === "selection" ? selectedAtomIds : null;
  const selectedBond = bonds.find((bond) => String(bond.id) === bondId);

  if (ligands.length === 0) {
    return <p className="empty-label">Import a ligand to edit molecular topology.</p>;
  }

  return (
    <div className="ligand-editor" aria-label="Ligand editor">
      <label>
        Ligand
        <select value={entryId} onChange={(event) => setEntryId(event.target.value)}>
          {ligands.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <div className="ligand-status">
        <span>{structure ? `${structure.atoms.length} atoms / ${bonds.length} bonds` : "Loading"}</span>
        <span>{selectedAtomIds.length} selected</span>
        {entry?.locked ? <strong>Locked</strong> : null}
      </div>

      <fieldset className="edit-section">
        <legend><Atom size={15} /> Atoms</legend>
        <div className="form-row">
          <label>
            Element
            <select value={element} onChange={(event) => setElement(event.target.value)}>
              {commonElements.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Charge
            <input
              type="number"
              min="-8"
              max="8"
              value={charge}
              onChange={(event) => setCharge(event.target.value)}
            />
          </label>
        </div>
        <div className="coordinate-grid">
          {(["X", "Y", "Z"] as const).map((axis, index) => (
            <label key={axis}>
              {axis}
              <input
                type="number"
                step="0.1"
                value={coordinates[index]}
                onChange={(event) =>
                  setCoordinates((current) =>
                    current.map((value, item) =>
                      item === index ? event.target.value : value,
                    ) as [string, string, string],
                  )
                }
              />
            </label>
          ))}
        </div>
        <div className="edit-actions">
          <button
            type="button"
            disabled={disabled || !numeric3(coordinates)}
            onClick={() => {
              const point = numeric3(coordinates);
              if (point) {
                void execute({
                  operation: "atom.add",
                  element,
                  formal_charge: Number(charge),
                  coordinates: point,
                });
              }
            }}
          >
            <CirclePlus size={15} /> Add
          </button>
          <button
            type="button"
            disabled={disabled || !selectedAtom}
            onClick={() =>
              selectedAtom &&
              void execute({
                operation: "atom.element",
                atom_id: selectedAtom.id,
                element,
              })
            }
          >
            Apply element
          </button>
          <button
            type="button"
            disabled={disabled || !selectedAtom}
            onClick={() =>
              selectedAtom &&
              void execute({
                operation: "atom.charge",
                atom_id: selectedAtom.id,
                formal_charge: Number(charge),
              })
            }
          >
            Apply charge
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={disabled || selectedAtomIds.length === 0}
            onClick={() =>
              void execute({ operation: "atom.delete", atom_ids: selectedAtomIds })
            }
          >
            <Trash2 size={15} /> Delete selected
          </button>
        </div>
      </fieldset>

      <fieldset className="edit-section">
        <legend><Link size={15} /> Bonds</legend>
        <div className="form-row three">
          <label>
            Atom A
            <input type="number" min="1" value={atom1} onChange={(event) => setAtom1(event.target.value)} />
          </label>
          <label>
            Atom B
            <input type="number" min="1" value={atom2} onChange={(event) => setAtom2(event.target.value)} />
          </label>
          <label>
            Order
            <select value={bondOrder} onChange={(event) => setBondOrder(event.target.value)}>
              <option value="1">Single</option>
              <option value="1.5">Aromatic</option>
              <option value="2">Double</option>
              <option value="3">Triple</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            void execute({
              operation: "bond.add",
              atom_1_id: Number(atom1),
              atom_2_id: Number(atom2),
              order: Number(bondOrder),
            })
          }
        >
          <CirclePlus size={15} /> Add bond
        </button>
        <div className="form-row">
          <label>
            Existing bond
            <select
              value={bondId}
              onChange={(event) => {
                setBondId(event.target.value);
                const bond = bonds.find((item) => String(item.id) === event.target.value);
                if (bond) {
                  setAtom1(String(bond.atom_1_id));
                  setAtom2(String(bond.atom_2_id));
                  setBondOrder(String(bond.order ?? 1));
                }
              }}
            >
              {bonds.map((bond) => (
                <option key={bond.id} value={bond.id}>
                  {bond.id}: {bond.atom_1_id}-{bond.atom_2_id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="edit-actions">
          <button
            type="button"
            disabled={disabled || !selectedBond}
            onClick={() =>
              selectedBond &&
              void execute({
                operation: "bond.order",
                bond_id: selectedBond.id,
                order: Number(bondOrder),
              })
            }
          >
            Apply order
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={disabled || !selectedBond}
            onClick={() =>
              selectedBond &&
              void execute({ operation: "bond.delete", bond_id: selectedBond.id })
            }
          >
            <CircleMinus size={15} /> Delete bond
          </button>
        </div>
      </fieldset>

      <fieldset className="edit-section">
        <legend><Beaker size={15} /> Hydrogens</legend>
        <div className="segmented-control">
          <button type="button" className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>All</button>
          <button type="button" className={scope === "selection" ? "active" : ""} onClick={() => setScope("selection")}>Selection</button>
        </div>
        <div className="edit-actions">
          <button
            type="button"
            disabled={disabled || (scope === "selection" && selectedAtomIds.length === 0)}
            onClick={() => void execute({ operation: "hydrogen.add", atom_ids: selectedScope })}
          >
            <CirclePlus size={15} /> Add H
          </button>
          <button
            type="button"
            disabled={disabled || (scope === "selection" && selectedAtomIds.length === 0)}
            onClick={() => void execute({ operation: "hydrogen.remove", atom_ids: selectedScope })}
          >
            <CircleMinus size={15} /> Remove H
          </button>
        </div>
      </fieldset>

      <fieldset className="edit-section">
        <legend><Rotate3D size={15} /> Geometry</legend>
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
          disabled={disabled || selectedAtomIds.length === 0 || !numeric3(translation)}
          onClick={() => {
            const vector = numeric3(translation);
            if (vector) {
              void onMove({
                entry_id: entryId,
                scope: "selection",
                selection: {
                  schema_version: 1,
                  atoms: selectedAtomIds.map((atom_id) => ({
                    structure_id: entryId,
                    atom_id,
                  })),
                  granularity: "atom",
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
          Move selected
        </button>
        <div className="form-row">
          <label>
            Rotatable bond
            <select value={bondId} onChange={(event) => setBondId(event.target.value)}>
              {bonds.map((bond) => (
                <option key={bond.id} value={bond.id}>
                  {bond.id}: {bond.atom_1_id}-{bond.atom_2_id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Angle (degrees)
            <input type="number" step="1" value={angle} onChange={(event) => setAngle(event.target.value)} />
          </label>
        </div>
        <button
          type="button"
          disabled={disabled || !selectedBond || selectedAtomIds.length === 0}
          onClick={() =>
            selectedBond &&
            void execute({
              operation: "bond.rotate",
              bond_id: selectedBond.id,
              movable_atom_ids: selectedAtomIds,
              angle_degrees: Number(angle),
            })
          }
        >
          <Rotate3D size={15} /> Rotate selected side
        </button>
      </fieldset>

      <fieldset className="edit-section">
        <legend><Sparkles size={15} /> Coordinate cleanup</legend>
        <div className="form-row">
          <label>
            Force field
            <select value={forceField} onChange={(event) => setForceField(event.target.value as typeof forceField)}>
              <option value="auto">Auto (MMFF, then UFF)</option>
              <option value="mmff">MMFF only</option>
              <option value="uff">UFF only</option>
            </select>
          </label>
          <label>
            Max iterations
            <input type="number" min="1" max="10000" value={maxIterations} onChange={(event) => setMaxIterations(event.target.value)} />
          </label>
        </div>
        <button
          type="button"
          disabled={disabled || (scope === "selection" && selectedAtomIds.length === 0)}
          onClick={() =>
            void execute({
              operation: "coordinates.cleanup",
              force_field: forceField,
              max_iterations: Number(maxIterations),
              atom_ids: selectedScope,
            })
          }
        >
          <Eraser size={15} /> Minimize coordinates
        </button>
      </fieldset>

      {lastResult ? (
        <section className="edit-report" aria-live="polite">
          <h3>Last edit</h3>
          <p>
            {lastResult.report.operation}
            {lastResult.report.force_field
              ? ` / ${lastResult.report.force_field} ${
                  lastResult.report.converged ? "converged" : "not converged"
                }`
              : ""}
          </p>
          {lastResult.warnings.map((warning, index) => (
            <div className="edit-warning" key={`${warning.code}-${index}`}>
              {warning.message}
            </div>
          ))}
          {lastResult.warnings.length === 0 ? <small>No chemistry warnings</small> : null}
        </section>
      ) : null}
    </div>
  );
}
