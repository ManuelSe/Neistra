import { AlignCenter, Move3d, Rotate3d } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CoordinateTransform,
  PivotMode,
  Point3D,
  Project,
  Selection,
  SuperpositionRequest,
  SuperpositionResult,
  TransformScope,
} from "../api/types";

interface TransformPanelProps {
  project: Project;
  selection: Selection;
  busy: boolean;
  onPreview: (transform: CoordinateTransform) => Promise<void>;
  onClearPreview: () => void;
  onTransform: (transform: CoordinateTransform) => Promise<void>;
  onSuperpose: (
    payload: SuperpositionRequest,
  ) => Promise<SuperpositionResult["report"] | null>;
}

const zero: Point3D = [0, 0, 0];

function vectorValue(values: string[]): Point3D | null {
  const parsed = values.map(Number);
  return parsed.length === 3 && parsed.every(Number.isFinite)
    ? (parsed as Point3D)
    : null;
}

function VectorInput({
  label,
  values,
  step,
  onChange,
}: {
  label: string;
  values: string[];
  step: string;
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="vector-input">
      <legend>{label}</legend>
      {(["X", "Y", "Z"] as const).map((axis, index) => (
        <label key={axis}>
          {axis}
          <input
            type="number"
            step={step}
            value={values[index]}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
        </label>
      ))}
    </fieldset>
  );
}

export function TransformPanel({
  project,
  selection,
  busy,
  onPreview,
  onClearPreview,
  onTransform,
  onSuperpose,
}: TransformPanelProps) {
  const [entryId, setEntryId] = useState(project.entries[0]?.id ?? "");
  const [scope, setScope] = useState<TransformScope>("structure");
  const [translation, setTranslation] = useState(["0", "0", "0"]);
  const [rotation, setRotation] = useState(["0", "0", "0"]);
  const [pivotMode, setPivotMode] = useState<PivotMode>("structure_centroid");
  const [pivot, setPivot] = useState(["0", "0", "0"]);
  const [gestureMode, setGestureMode] = useState<"translate" | "rotate">(
    "translate",
  );
  const [gestureAxis, setGestureAxis] = useState<0 | 1 | 2>(0);
  const [gestureValue, setGestureValue] = useState(0);
  const [movingId, setMovingId] = useState(project.entries[0]?.id ?? "");
  const [referenceId, setReferenceId] = useState(project.entries[1]?.id ?? "");
  const [fitMode, setFitMode] = useState<"backbone" | "selection">("backbone");
  const [report, setReport] = useState<SuperpositionResult["report"] | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!project.entries.some((entry) => entry.id === entryId)) {
      setEntryId(project.entries[0]?.id ?? "");
    }
    if (!project.entries.some((entry) => entry.id === movingId)) {
      setMovingId(project.entries[0]?.id ?? "");
    }
    if (
      !project.entries.some((entry) => entry.id === referenceId) ||
      referenceId === movingId
    ) {
      setReferenceId(
        project.entries.find((entry) => entry.id !== movingId)?.id ?? "",
      );
    }
  }, [entryId, movingId, project.entries, referenceId]);

  useEffect(() => onClearPreview, [entryId, onClearPreview]);

  const entry = project.entries.find((item) => item.id === entryId);
  const selectedForEntry = selection.atoms.filter(
    (atom) => atom.structure_id === entryId,
  ).length;
  const numericTranslation = vectorValue(translation);
  const numericRotation = vectorValue(rotation);
  const numericPivot = vectorValue(pivot);
  const numericValid =
    !!entry &&
    !!numericTranslation &&
    !!numericRotation &&
    (pivotMode !== "custom" || !!numericPivot) &&
    (scope === "structure" || selectedForEntry > 0) &&
    [...numericTranslation, ...numericRotation].some(
      (value, index) => (index < 3 ? value !== 0 : value % 360 !== 0),
    );

  const transform = (
    nextTranslation: Point3D,
    nextRotation: Point3D,
  ): CoordinateTransform => ({
    entry_id: entryId,
    scope,
    selection,
    translation: nextTranslation,
    rotation_degrees: nextRotation,
    pivot_mode: pivotMode,
    pivot: pivotMode === "custom" ? numericPivot : null,
  });

  const gestureTransform = (value: number) => {
    const values: Point3D = [0, 0, 0];
    values[gestureAxis] = value;
    return transform(
      gestureMode === "translate" ? values : zero,
      gestureMode === "rotate" ? values : zero,
    );
  };

  const correspondenceReady = useMemo(() => {
    const selected = new Set(selection.atoms.map((atom) => atom.structure_id));
    return selected.has(movingId) && selected.has(referenceId);
  }, [movingId, referenceId, selection.atoms]);
  const moving = project.entries.find((item) => item.id === movingId);
  const canFit =
    !!moving &&
    !!referenceId &&
    movingId !== referenceId &&
    !moving.locked &&
    (fitMode === "backbone" || correspondenceReady);

  return (
    <div className="transform-panel">
      <section className="coordinate-section">
        <div className="section-title">
          <Move3d size={16} />
          <h3>Coordinate transform</h3>
        </div>
        <label>
          Structure
          <select value={entryId} onChange={(event) => setEntryId(event.target.value)}>
            {project.entries.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Scope</legend>
          <div className="segmented-control">
            {(["structure", "selection"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={scope === item ? "active" : ""}
                aria-pressed={scope === item}
                onClick={() => setScope(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>
        {scope === "selection" ? (
          <p className="coordinate-context">{selectedForEntry} selected atoms</p>
        ) : null}
        {entry?.locked ? (
          <p className="inline-error" role="alert">
            Unlock {entry.name} before changing coordinates.
          </p>
        ) : null}
        <VectorInput
          label="Translation (angstrom)"
          values={translation}
          step="0.1"
          onChange={setTranslation}
        />
        <VectorInput
          label="Rotation (degrees)"
          values={rotation}
          step="1"
          onChange={setRotation}
        />
        <label>
          Rotation pivot
          <select
            value={pivotMode}
            onChange={(event) => setPivotMode(event.target.value as PivotMode)}
          >
            <option value="structure_centroid">Structure centroid</option>
            <option value="selection_centroid">Scope centroid</option>
            <option value="custom">Custom point</option>
          </select>
        </label>
        {pivotMode === "custom" ? (
          <VectorInput
            label="Pivot coordinates"
            values={pivot}
            step="0.1"
            onChange={setPivot}
          />
        ) : null}
        <button
          type="button"
          className="primary-button"
          disabled={!numericValid || entry?.locked || busy}
          onClick={() => {
            if (!numericTranslation || !numericRotation) return;
            setLocalError(null);
            void onTransform(transform(numericTranslation, numericRotation))
              .then(() => {
                setTranslation(["0", "0", "0"]);
                setRotation(["0", "0", "0"]);
              })
              .catch((error: unknown) =>
                setLocalError(
                  error instanceof Error ? error.message : "Transform failed.",
                ),
              );
          }}
        >
          Apply transform
        </button>
      </section>

      <section className="coordinate-section">
        <div className="section-title">
          <Rotate3d size={16} />
          <h3>Interactive transform</h3>
        </div>
        <div className="segmented-control">
          {(["translate", "rotate"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={gestureMode === item ? "active" : ""}
              aria-pressed={gestureMode === item}
              onClick={() => {
                setGestureMode(item);
                setGestureValue(0);
                onClearPreview();
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="segmented-control three">
          {(["X", "Y", "Z"] as const).map((axis, index) => (
            <button
              key={axis}
              type="button"
              className={gestureAxis === index ? "active" : ""}
              aria-pressed={gestureAxis === index}
              onClick={() => {
                setGestureAxis(index as 0 | 1 | 2);
                setGestureValue(0);
                onClearPreview();
              }}
            >
              {axis}
            </button>
          ))}
        </div>
        <label className="gesture-slider">
          <span>
            {gestureMode === "translate" ? "angstrom" : "degrees"}
            <output>{gestureValue.toFixed(gestureMode === "translate" ? 1 : 0)}</output>
          </span>
          <input
            type="range"
            min={gestureMode === "translate" ? -10 : -180}
            max={gestureMode === "translate" ? 10 : 180}
            step={gestureMode === "translate" ? 0.1 : 1}
            value={gestureValue}
            disabled={
              !entry ||
              entry.locked ||
              busy ||
              (scope === "selection" && selectedForEntry === 0) ||
              (pivotMode === "custom" && !numericPivot)
            }
            onChange={(event) => {
              const value = Number(event.target.value);
              setGestureValue(value);
              if (value === 0) onClearPreview();
              else void onPreview(gestureTransform(value));
            }}
            onPointerUp={() => {
              if (gestureValue === 0) return;
              const pending = gestureTransform(gestureValue);
              setGestureValue(0);
              setLocalError(null);
              void onTransform(pending).catch((error: unknown) =>
                setLocalError(
                  error instanceof Error ? error.message : "Transform failed.",
                ),
              );
            }}
          />
        </label>
      </section>

      <section className="coordinate-section">
        <div className="section-title">
          <AlignCenter size={16} />
          <h3>Protein superposition</h3>
        </div>
        <label>
          Moving
          <select value={movingId} onChange={(event) => setMovingId(event.target.value)}>
            {project.entries.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reference
          <select
            value={referenceId}
            onChange={(event) => setReferenceId(event.target.value)}
          >
            {project.entries
              .filter((item) => item.id !== movingId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset>
          <legend>Correspondence</legend>
          <div className="segmented-control">
            {(["backbone", "selection"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={fitMode === item ? "active" : ""}
                aria-pressed={fitMode === item}
                onClick={() => setFitMode(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>
        {fitMode === "selection" && !correspondenceReady ? (
          <p className="inline-error" role="alert">
            Select corresponding atoms from both structures.
          </p>
        ) : null}
        <button
          type="button"
          className="primary-button"
          disabled={!canFit || busy}
          onClick={() => {
            setLocalError(null);
            setReport(null);
            void onSuperpose({
              moving_entry_id: movingId,
              reference_entry_id: referenceId,
              mode: fitMode,
              selection,
            })
              .then(setReport)
              .catch((error: unknown) =>
                setLocalError(
                  error instanceof Error ? error.message : "Superposition failed.",
                ),
              );
          }}
        >
          Superpose structure
        </button>
        {report ? (
          <dl className="fit-report" aria-label="Superposition result">
            <div>
              <dt>Matched atoms</dt>
              <dd>{report.atom_count}</dd>
            </div>
            <div>
              <dt>RMSD</dt>
              <dd>{report.rmsd.toFixed(4)} angstrom</dd>
            </div>
          </dl>
        ) : null}
      </section>
      {localError ? (
        <p className="inline-error" role="alert">
          {localError}
        </p>
      ) : null}
    </div>
  );
}
