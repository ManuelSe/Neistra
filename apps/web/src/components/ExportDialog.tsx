import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  Download,
  FileOutput,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, molecularApi } from "../api/client";
import type {
  Artifact,
  Entry,
  ExportEntryReport,
  ExportMode,
  ExportScope,
  FormatCapability,
  Project,
} from "../api/types";
import { Modal } from "./Modal";

interface ExportDialogProps {
  open: boolean;
  project: Project | undefined;
  initialEntry: Entry | null;
  selectedEntryIds: Set<string>;
  onOpenChange: (open: boolean) => void;
}

type ExportTab = "structures" | "archive";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function ExportDialog({
  open,
  project,
  initialEntry,
  selectedEntryIds,
  onOpenChange,
}: ExportDialogProps) {
  const [tab, setTab] = useState<ExportTab>("structures");
  const [scope, setScope] = useState<ExportScope>("all");
  const [format, setFormat] = useState<FormatCapability["format"]>("pdb");
  const [mode, setMode] = useState<ExportMode>("separate");
  const [includeHydrogens, setIncludeHydrogens] = useState(true);
  const [includeWaters, setIncludeWaters] = useState(true);
  const [includeIons, setIncludeIons] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ExportEntryReport[]>([]);
  const [acknowledgeLosses, setAcknowledgeLosses] = useState(false);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const activeOperation = useRef<{ cancel: () => void } | null>(null);
  const operationSequence = useRef(0);
  const formatsQuery = useQuery({
    queryKey: ["formats"],
    queryFn: molecularApi.formats,
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const selectedIds = useMemo(
    () =>
      initialEntry
        ? [initialEntry.id]
        : project?.entries
            .filter((entry) => selectedEntryIds.has(entry.id))
            .map((entry) => entry.id) ?? [],
    [initialEntry, project?.entries, selectedEntryIds],
  );
  const visibleCount = project?.entries.filter((entry) => entry.visible).length ?? 0;
  const scopeCount =
    scope === "all"
      ? (project?.entries.length ?? 0)
      : scope === "visible"
        ? visibleCount
        : selectedIds.length;
  const selectedFormat = formatsQuery.data?.find((item) => item.format === format);
  const reportWarnings = reports.flatMap((report) => report.warnings);
  const blockingWarnings = reportWarnings.filter((warning) => warning.blocking);

  const resetResult = () => {
    setArtifact(null);
    setError(null);
    setReports([]);
    setAcknowledgeLosses(false);
  };

  useEffect(() => {
    if (!open) return;
    setTab("structures");
    setScope(initialEntry || selectedIds.length > 0 ? "selected" : "all");
    setFormat("pdb");
    setMode("separate");
    setIncludeHydrogens(true);
    setIncludeWaters(true);
    setIncludeIons(true);
    setPending(false);
    resetResult();
  }, [initialEntry, open, selectedIds.length]);

  useEffect(() => {
    if (mode === "multi_record" && selectedFormat && !selectedFormat.multi_record) {
      setMode("separate");
    }
  }, [mode, selectedFormat]);

  const close = () => {
    operationSequence.current += 1;
    activeOperation.current?.cancel();
    activeOperation.current = null;
    setPending(false);
    onOpenChange(false);
  };

  const run = () => {
    if (!project || pending || scopeCount === 0) return;
    resetResult();
    setPending(true);
    const sequence = ++operationSequence.current;
    const operation =
      tab === "archive"
        ? molecularApi.exportArchive(project.id)
        : molecularApi.exportProject(project.id, {
            scope,
            entryIds: scope === "selected" ? selectedIds : [],
            format,
            mode,
            includeHydrogens,
            includeWaters,
            includeIons,
            acknowledgeLosses,
          });
    activeOperation.current = operation;
    void operation.promise
      .then((result) => {
        if (operationSequence.current !== sequence) return;
        setArtifact(result.artifact);
        setReports("reports" in result ? result.reports : []);
      })
      .catch((caught: unknown) => {
        if (operationSequence.current !== sequence) return;
        const failure = caught instanceof ApiError ? caught : null;
        setError(failure?.message ?? "The export could not be generated.");
        setReports(failure?.reports ?? []);
      })
      .finally(() => {
        if (operationSequence.current !== sequence) return;
        activeOperation.current = null;
        setPending(false);
      });
  };

  const changeTab = (nextTab: ExportTab) => {
    if (pending || tab === nextTab) return;
    setTab(nextTab);
    resetResult();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}
      title="Export"
      description="Structures and portable project archive"
    >
      <div className="export-dialog">
        <div className="segmented-control" role="tablist" aria-label="Export type">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "structures"}
            disabled={pending}
            onClick={() => changeTab("structures")}
          >
            <FileOutput size={15} /> Structures
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "archive"}
            disabled={pending}
            onClick={() => changeTab("archive")}
          >
            <Archive size={15} /> Project archive
          </button>
        </div>

        {tab === "structures" ? (
          <>
            <fieldset className="export-fieldset">
              <legend>Scope</legend>
              <div className="segmented-control three-up">
                {(
                  [
                    ["all", "All", project?.entries.length ?? 0],
                    ["selected", "Selected", selectedIds.length],
                    ["visible", "Visible", visibleCount],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scope === value}
                    disabled={pending || count === 0}
                    onClick={() => {
                      setScope(value);
                      resetResult();
                    }}
                  >
                    {label} <span>{count}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="export-row">
              <label>
                Format
                <select
                  value={format}
                  disabled={pending || formatsQuery.isLoading}
                  onChange={(event) => {
                    setFormat(event.target.value as FormatCapability["format"]);
                    resetResult();
                  }}
                >
                  {(formatsQuery.data ?? [])
                    .filter((item) => item.can_export)
                    .map((item) => (
                      <option key={item.format} value={item.format}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Output
                <select
                  value={mode}
                  disabled={pending}
                  onChange={(event) => {
                    setMode(event.target.value as ExportMode);
                    resetResult();
                  }}
                >
                  <option value="separate">Separate files</option>
                  <option value="multi_record" disabled={!selectedFormat?.multi_record}>
                    Multi-record file
                  </option>
                </select>
              </label>
            </div>

            <fieldset className="export-fieldset export-filters">
              <legend>Include</legend>
              {[
                ["Hydrogens", includeHydrogens, setIncludeHydrogens],
                ["Waters", includeWaters, setIncludeWaters],
                ["Ions", includeIons, setIncludeIons],
              ].map(([label, checked, setter]) => (
                <label key={label as string}>
                  <input
                    type="checkbox"
                    checked={checked as boolean}
                    disabled={pending}
                    onChange={(event) => {
                      (setter as (value: boolean) => void)(event.target.checked);
                      resetResult();
                    }}
                  />
                  <span>{label as string}</span>
                </label>
              ))}
            </fieldset>
          </>
        ) : (
          <div className="archive-summary">
            <Archive size={18} />
            <div>
              <strong>{project?.name}</strong>
              <small>
                {project?.entries.length ?? 0} structures · revision {project?.revision ?? 0}
              </small>
            </div>
          </div>
        )}

        {formatsQuery.isError && tab === "structures" ? (
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
        {reports.length > 0 ? (
          <div className="export-reports" aria-label="Export report">
            {reports.map((report) => (
              <div key={report.entry_id}>
                <div>
                  <strong>{report.entry_name}</strong>
                  <small>{report.output_filename}</small>
                </div>
                {report.warnings.map((warning, index) => (
                  <p key={`${warning.code}-${index}`}>
                    <AlertTriangle size={13} />
                    <span>{warning.message}</span>
                  </p>
                ))}
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
            {tab === "archive" ? <Archive size={18} /> : <FileOutput size={18} />}
            <div>
              <strong>{artifact.filename}</strong>
              <small>{formatBytes(artifact.size)}</small>
            </div>
            <a className="primary-button" href={artifact.download_url} download>
              <Download size={15} /> Download
            </a>
          </div>
        ) : null}

        <div className="dialog-actions">
          {pending ? (
            <button type="button" className="secondary-button" onClick={close}>
              <X size={15} /> Cancel export
            </button>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={close}>
                Close
              </button>
              {!artifact ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    !project ||
                    scopeCount === 0 ||
                    (tab === "structures" &&
                      (formatsQuery.isLoading ||
                        formatsQuery.isError ||
                        (blockingWarnings.length > 0 && !acknowledgeLosses)))
                  }
                  onClick={run}
                >
                  {pending ? <LoaderCircle size={15} /> : <FileOutput size={15} />}
                  {blockingWarnings.length > 0 ? "Generate anyway" : "Generate"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
