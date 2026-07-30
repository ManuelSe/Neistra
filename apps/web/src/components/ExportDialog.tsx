import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, FileOutput } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, molecularApi } from "../api/client";
import type {
  Artifact,
  Entry,
  FormatCapability,
  MolecularWarning,
  Project,
} from "../api/types";
import { Modal } from "./Modal";

interface ExportDialogProps {
  open: boolean;
  project: Project | undefined;
  initialEntry: Entry | null;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({
  open,
  project,
  initialEntry,
  onOpenChange,
}: ExportDialogProps) {
  const [entryId, setEntryId] = useState("");
  const [format, setFormat] = useState<FormatCapability["format"]>("pdb");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<MolecularWarning[]>([]);
  const [acknowledgeLosses, setAcknowledgeLosses] = useState(false);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const formatsQuery = useQuery({
    queryKey: ["formats"],
    queryFn: molecularApi.formats,
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    setEntryId(initialEntry?.id ?? project?.entries[0]?.id ?? "");
    setError(null);
    setWarnings([]);
    setAcknowledgeLosses(false);
    setArtifact(null);
  }, [initialEntry, open, project?.entries]);

  const generate = () => {
    if (!project || !entryId || pending) return;
    setPending(true);
    setError(null);
    setArtifact(null);
    void molecularApi
      .exportStructure(project.id, entryId, format, acknowledgeLosses)
      .then((result) => {
        setWarnings(result.warnings);
        setArtifact(result.artifact);
      })
      .catch((caught: unknown) => {
        const failure = caught instanceof ApiError ? caught : null;
        setError(failure?.message ?? "The structure could not be exported.");
        setWarnings(failure?.warnings ?? []);
      })
      .finally(() => setPending(false));
  };

  const blockingWarnings = warnings.filter((warning) => warning.blocking);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Export structure"
      description="Generate one structure file from the normalized molecular model."
    >
      <div className="export-dialog">
        <label>
          Structure
          <select
            value={entryId}
            disabled={pending}
            onChange={(event) => {
              setEntryId(event.target.value);
              setArtifact(null);
              setWarnings([]);
              setAcknowledgeLosses(false);
            }}
          >
            {project?.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Format
          <select
            value={format}
            disabled={pending || formatsQuery.isLoading}
            onChange={(event) => {
              setFormat(event.target.value as FormatCapability["format"]);
              setArtifact(null);
              setWarnings([]);
              setAcknowledgeLosses(false);
            }}
          >
            {(formatsQuery.data ?? []).filter((item) => item.can_export).map((item) => (
              <option key={item.format} value={item.format}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {formatsQuery.isError ? (
          <div className="dialog-error" role="alert">
            <AlertTriangle size={16} />
            <span>Supported formats could not be loaded.</span>
          </div>
        ) : null}
        {error ? (
          <div className="dialog-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="warning-list" aria-label="Export warnings">
            {warnings.map((warning, index) => (
              <div key={`${warning.code}-${index}`}>
                <AlertTriangle size={14} />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        ) : null}
        {blockingWarnings.length > 0 && !artifact ? (
          <label className="acknowledge-losses">
            <input
              type="checkbox"
              checked={acknowledgeLosses}
              onChange={(event) => setAcknowledgeLosses(event.target.checked)}
            />
            <span>I understand that this format cannot preserve the listed information.</span>
          </label>
        ) : null}
        {artifact ? (
          <div className="export-ready" role="status">
            <FileOutput size={18} />
            <div>
              <strong>{artifact.filename}</strong>
              <small>{artifact.size.toLocaleString()} bytes</small>
            </div>
            <a className="primary-button" href={artifact.download_url} download>
              <Download size={15} /> Download
            </a>
          </div>
        ) : null}

        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
          {!artifact ? (
            <button
              type="button"
              className="primary-button"
              disabled={
                pending ||
                !entryId ||
                formatsQuery.isLoading ||
                formatsQuery.isError ||
                (blockingWarnings.length > 0 && !acknowledgeLosses)
              }
              onClick={generate}
            >
              <FileOutput size={15} /> {pending ? "Generating" : "Generate"}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
