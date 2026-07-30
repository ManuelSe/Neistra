import { AlertTriangle, FileUp, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, molecularApi, type ImportUpload } from "../api/client";
import type { ImportResult, MolecularWarning, Project } from "../api/types";
import { Modal } from "./Modal";

interface ImportDialogProps {
  open: boolean;
  project: Project | undefined;
  onOpenChange: (open: boolean) => void;
  onImported: (result: ImportResult) => void;
}

type ImportPhase = "idle" | "uploading" | "processing" | "failed";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function WarningList({ warnings }: { warnings: MolecularWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="warning-list" aria-label="Import warnings">
      {warnings.map((warning, index) => (
        <div key={`${warning.code}-${index}`}>
          <AlertTriangle size={14} />
          <span>{warning.message}</span>
        </div>
      ))}
    </div>
  );
}

export function ImportDialog({
  open,
  project,
  onOpenChange,
  onImported,
}: ImportDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [generate3d, setGenerate3d] = useState(true);
  const [inferBonds, setInferBonds] = useState(true);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<MolecularWarning[]>([]);
  const uploadRef = useRef<ImportUpload | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      uploadRef.current?.cancel();
      uploadRef.current = undefined;
      setFiles([]);
      setPhase("idle");
      setProgress({ loaded: 0, total: 0 });
      setError(null);
      setWarnings([]);
    }
  }, [open]);

  const active = phase === "uploading" || phase === "processing";
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const percent =
    phase === "processing"
      ? 100
      : progress.total > 0
        ? Math.round((progress.loaded / progress.total) * 100)
        : 0;

  const startImport = () => {
    if (!project || files.length === 0 || active) return;
    setError(null);
    setWarnings([]);
    setPhase("uploading");
    const upload = molecularApi.importStructures(
      project,
      files,
      { generate3d, inferBonds },
      {
        onProgress: (loaded, total) => setProgress({ loaded, total }),
        onProcessing: () => setPhase("processing"),
      },
    );
    uploadRef.current = upload;
    void upload.promise
      .then((result) => {
        uploadRef.current = undefined;
        setWarnings(result.warnings);
        onImported(result);
        onOpenChange(false);
      })
      .catch((caught: unknown) => {
        uploadRef.current = undefined;
        const apiFailure = caught instanceof ApiError ? caught : null;
        setError(
          apiFailure?.message ?? "The selected structures could not be imported.",
        );
        setWarnings(apiFailure?.warnings ?? []);
        setPhase("failed");
      });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && active) uploadRef.current?.cancel();
        onOpenChange(nextOpen);
      }}
      title="Import structures"
      description="PDB, mmCIF, SDF, MOL, MOL2, XYZ, and SMILES"
    >
      <div className="import-dialog">
        <label className="file-picker">
          <FileUp size={22} />
          <span>{files.length > 0 ? "Add more files" : "Choose structure files"}</span>
          <input
            type="file"
            multiple
            accept=".pdb,.ent,.cif,.mmcif,.sdf,.mol,.mol2,.xyz,.smi,.smiles"
            disabled={active}
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              setFiles((current) => [
                ...current,
                ...selected.filter(
                  (candidate) =>
                    !current.some(
                      (existing) =>
                        existing.name === candidate.name &&
                        existing.size === candidate.size &&
                        existing.lastModified === candidate.lastModified,
                    ),
                ),
              ]);
              event.target.value = "";
            }}
          />
        </label>

        {files.length > 0 ? (
          <div className="selected-files" aria-label="Selected structure files">
            {files.map((file, index) => (
              <div key={`${file.name}-${file.lastModified}`}>
                <span title={file.name}>{file.name}</span>
                <small>{formatBytes(file.size)}</small>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  disabled={active}
                  onClick={() =>
                    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <p>
              {files.length} file{files.length === 1 ? "" : "s"} / {formatBytes(totalBytes)}
            </p>
          </div>
        ) : null}

        <div className="import-options">
          <label>
            <input
              type="checkbox"
              checked={generate3d}
              disabled={active}
              onChange={(event) => setGenerate3d(event.target.checked)}
            />
            <span>
              Generate 3D coordinates for SMILES
              <small>Uses deterministic ETKDG coordinates.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={inferBonds}
              disabled={active}
              onChange={(event) => setInferBonds(event.target.checked)}
            />
            <span>
              Infer XYZ connectivity
              <small>Inferred bonds retain unknown bond order.</small>
            </span>
          </label>
        </div>

        {active ? (
          <div className="import-progress" aria-live="polite">
            <div>
              <span>{phase === "processing" ? "Validating structures" : "Uploading files"}</span>
              <strong>{percent}%</strong>
            </div>
            <progress max={100} value={percent} />
            {phase === "processing" ? (
              <small>Parsing and chemistry validation must finish before commit.</small>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="dialog-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
        <WarningList warnings={warnings} />

        <div className="dialog-actions">
          {active ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => uploadRef.current?.cancel()}
            >
              <X size={15} /> Cancel import
            </button>
          ) : (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!project || files.length === 0}
                onClick={startImport}
              >
                {phase === "failed" ? <LoaderCircle size={15} /> : <FileUp size={15} />}
                {phase === "failed" ? "Try again" : "Import"}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
