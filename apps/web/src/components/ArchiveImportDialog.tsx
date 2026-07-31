import { AlertTriangle, ArchiveRestore, FileUp, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  molecularApi,
  type CancellableOperation,
} from "../api/client";
import type { ArchiveImportResult } from "../api/types";
import { Modal } from "./Modal";

interface ArchiveImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (result: ArchiveImportResult) => void;
}

type ImportPhase = "idle" | "uploading" | "processing" | "failed";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function ArchiveImportDialog({
  open,
  onOpenChange,
  onImported,
}: ArchiveImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<CancellableOperation<ArchiveImportResult> | null>(null);

  useEffect(() => {
    if (open) return;
    uploadRef.current?.cancel();
    uploadRef.current = null;
    setFile(null);
    setPhase("idle");
    setProgress({ loaded: 0, total: 0 });
    setError(null);
  }, [open]);

  const active = phase === "uploading" || phase === "processing";
  const percent =
    phase === "processing"
      ? 100
      : progress.total > 0
        ? Math.round((progress.loaded / progress.total) * 100)
        : 0;

  const startImport = () => {
    if (!file || active) return;
    setError(null);
    setPhase("uploading");
    const upload = molecularApi.importArchive(file, {
      onProgress: (loaded, total) => setProgress({ loaded, total }),
      onProcessing: () => setPhase("processing"),
    });
    uploadRef.current = upload;
    void upload.promise
      .then((result) => {
        uploadRef.current = null;
        onImported(result);
        onOpenChange(false);
      })
      .catch((caught: unknown) => {
        uploadRef.current = null;
        const failure = caught instanceof ApiError ? caught : null;
        setError(failure?.message ?? "The project archive could not be imported.");
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
      title="Import project archive"
      description=".molweave.zip"
    >
      <div className="import-dialog">
        <label className="file-picker">
          <FileUp size={22} />
          <span>{file ? "Choose another archive" : "Choose project archive"}</span>
          <input
            type="file"
            accept=".molweave.zip"
            disabled={active}
            onChange={(event) => {
              setFile(event.target.files?.item(0) ?? null);
              setError(null);
              setPhase("idle");
              event.target.value = "";
            }}
          />
        </label>

        {file ? (
          <div className="archive-summary" aria-label="Selected project archive">
            <ArchiveRestore size={18} />
            <div>
              <strong title={file.name}>{file.name}</strong>
              <small>{formatBytes(file.size)}</small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove project archive"
              disabled={active}
              onClick={() => setFile(null)}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        {active ? (
          <div className="import-progress" aria-live="polite">
            <div>
              <span>{phase === "processing" ? "Validating archive" : "Uploading archive"}</span>
              <strong>{percent}%</strong>
            </div>
            <progress max={100} value={percent} />
          </div>
        ) : null}

        {error ? (
          <div className="dialog-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

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
                disabled={!file}
                onClick={startImport}
              >
                {phase === "failed" ? <LoaderCircle size={15} /> : <ArchiveRestore size={15} />}
                {phase === "failed" ? "Try again" : "Import project"}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
