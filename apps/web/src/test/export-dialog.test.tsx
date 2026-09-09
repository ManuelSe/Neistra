import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, molecularApi } from "../api/client";
import type {
  ArchiveExportResult,
  ArchiveImportResult,
  BatchExportResult,
  FormatCapability,
} from "../api/types";
import { ArchiveImportDialog } from "../components/ArchiveImportDialog";
import { ExportDialog } from "../components/ExportDialog";
import { molecularProject } from "./molecular-fixtures";

const formats: FormatCapability[] = [
  {
    format: "pdb",
    label: "PDB",
    extensions: [".pdb"],
    media_types: ["chemical/x-pdb"],
    can_import: true,
    can_export: true,
    multi_record: false,
  },
  {
    format: "sdf",
    label: "SDF",
    extensions: [".sdf"],
    media_types: ["chemical/x-mdl-sdfile"],
    can_import: true,
    can_export: true,
    multi_record: true,
  },
];

const artifact = {
  id: "artifact-1",
  filename: "selection-project-export.zip",
  media_type: "application/zip",
  sha256: "abc",
  size: 2048,
  download_url: "/api/v1/artifacts/artifact-1?filename=selection-project-export.zip",
};

function renderWithQuery(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Tooltip.Provider>{element}</Tooltip.Provider>
    </QueryClientProvider>,
  );
}

function exportResult(): BatchExportResult {
  return {
    artifact,
    scope: "visible",
    source_revision: 2,
    format: "sdf",
    mode: "multi_record",
    reports: [
      {
        entry_id: "protein",
        entry_name: "Receptor",
        output_filename: "selection-project.sdf",
        record_index: 0,
        warnings: [],
      },
      {
        entry_id: "ligand",
        entry_name: "Ligand",
        output_filename: "selection-project.sdf",
        record_index: 1,
        warnings: [],
      },
    ],
  };
}

describe("export dialog", () => {
  beforeEach(() => {
    vi.spyOn(molecularApi, "formats").mockResolvedValue(formats);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("submits scope, supported output mode, and molecular filters then exposes the artifact", async () => {
    const user = userEvent.setup();
    const exportSpy = vi.spyOn(molecularApi, "exportProject").mockReturnValue({
      promise: Promise.resolve(exportResult()),
      cancel: vi.fn(),
    });
    renderWithQuery(
      <ExportDialog
        open
        project={molecularProject()}
        initialEntry={null}
        selectedEntryIds={new Set(["protein"])}
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Visible 2" }));
    await user.selectOptions(screen.getByLabelText("Format"), "sdf");
    await user.selectOptions(screen.getByLabelText("Output"), "multi_record");
    await user.click(screen.getByLabelText("Hydrogens"));
    await user.click(screen.getByLabelText("Waters"));
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(exportSpy).toHaveBeenCalledWith("project-1", {
        scope: "visible",
        entryIds: [],
        format: "sdf",
        mode: "multi_record",
        includeHydrogens: false,
        includeWaters: false,
        includeIons: true,
        acknowledgeLosses: false,
      }),
    );
    expect(await screen.findByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      artifact.download_url,
    );
    expect(screen.getByLabelText("Export report")).toHaveTextContent("Receptor");
    expect(screen.getByLabelText("Export report")).toHaveTextContent("Ligand");
  });

  it("attributes blocking loss reports and requires explicit confirmation", async () => {
    const user = userEvent.setup();
    const reports = [
      {
        entry_id: "protein",
        entry_name: "Receptor",
        output_filename: "receptor.pdb",
        record_index: null,
        warnings: [
          {
            code: "alternate_locations_unsupported",
            message: "PDB cannot preserve this alternate-location metadata.",
            severity: "warning" as const,
            operation: "export",
            field: "alternate_location",
            blocking: true,
          },
        ],
      },
    ];
    const exportSpy = vi
      .spyOn(molecularApi, "exportProject")
      .mockImplementationOnce(() => ({
        promise: Promise.reject(
          new ApiError(409, "export_loss_confirmation_required", "Confirm export losses.", [], reports),
        ),
        cancel: vi.fn(),
      }))
      .mockReturnValueOnce({
        promise: Promise.resolve({ ...exportResult(), reports }),
        cancel: vi.fn(),
      });
    renderWithQuery(
      <ExportDialog
        open
        project={molecularProject()}
        initialEntry={molecularProject().entries[0]}
        selectedEntryIds={new Set()}
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confirm export losses.");
    expect(screen.getByLabelText("Export report")).toHaveTextContent(
      "PDB cannot preserve this alternate-location metadata.",
    );
    expect(screen.getByRole("button", { name: "Generate anyway" })).toBeDisabled();

    await user.click(
      screen.getByLabelText(
        "I understand that this format cannot preserve the listed information.",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Generate anyway" }));
    await waitFor(() =>
      expect(exportSpy.mock.calls[1]?.[1].acknowledgeLosses).toBe(true),
    );
  });

  it("cancels in-flight work when the user cancels export", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    const never = new Promise<BatchExportResult>(() => undefined);
    vi.spyOn(molecularApi, "exportProject").mockReturnValue({ promise: never, cancel });
    const onOpenChange = vi.fn();
    renderWithQuery(
      <ExportDialog
        open
        project={molecularProject()}
        initialEntry={null}
        selectedEntryIds={new Set()}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Cancel export" }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("generates a portable project archive from the archive tab", async () => {
    const user = userEvent.setup();
    const result: ArchiveExportResult = {
      artifact: {
        ...artifact,
        filename: "selection-project.molweave.zip",
        download_url:
          "/api/v1/artifacts/artifact-1?filename=selection-project.molweave.zip",
      },
      manifest_schema_version: 1,
      source_revision: 2,
    };
    const archiveSpy = vi.spyOn(molecularApi, "exportArchive").mockReturnValue({
      promise: Promise.resolve(result),
      cancel: vi.fn(),
    });
    renderWithQuery(
      <ExportDialog
        open
        project={molecularProject()}
        initialEntry={null}
        selectedEntryIds={new Set()}
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Project archive" }));
    expect(screen.getByText("2 structures · revision 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(archiveSpy).toHaveBeenCalledWith("project-1");
    expect(await screen.findByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      result.artifact.download_url,
    );
  });
});

describe("archive import dialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("imports a selected archive and returns the restored project", async () => {
    const user = userEvent.setup();
    const restored: ArchiveImportResult = {
      project: { ...molecularProject(), id: "restored-project", revision: 0 },
      source_project_id: "project-1",
      source_revision: 2,
    };
    vi.spyOn(molecularApi, "importArchive").mockReturnValue({
      promise: Promise.resolve(restored),
      cancel: vi.fn(),
    });
    const onImported = vi.fn();
    renderWithQuery(
      <ArchiveImportDialog open onOpenChange={vi.fn()} onImported={onImported} />,
    );

    expect(screen.getByText(/Neistra Archives use the existing/)).toHaveTextContent(".molweave.zip");
    expect(screen.getByLabelText("Choose project archive")).toHaveAttribute("accept", ".molweave.zip");

    await user.upload(
      screen.getByLabelText("Choose project archive"),
      new File(["archive"], "workspace.molweave.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Import project" }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(restored));
  });

  it("surfaces rejected archives without switching projects", async () => {
    const user = userEvent.setup();
    vi.spyOn(molecularApi, "importArchive").mockImplementation(() => ({
      promise: Promise.reject(
        new ApiError(422, "unsafe_archive_path", "Archive contains an unsafe path."),
      ),
      cancel: vi.fn(),
    }));
    const onImported = vi.fn();
    renderWithQuery(
      <ArchiveImportDialog open onOpenChange={vi.fn()} onImported={onImported} />,
    );

    await user.upload(
      screen.getByLabelText("Choose project archive"),
      new File(["bad"], "unsafe.molweave.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Import project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Archive contains an unsafe path.",
    );
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("cancels an archive upload without importing a project", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    const never = new Promise<ArchiveImportResult>(() => undefined);
    vi.spyOn(molecularApi, "importArchive").mockReturnValue({ promise: never, cancel });
    renderWithQuery(
      <ArchiveImportDialog open onOpenChange={vi.fn()} onImported={vi.fn()} />,
    );

    await user.upload(
      screen.getByLabelText("Choose project archive"),
      new File(["archive"], "workspace.molweave.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "Import project" }));
    await user.click(screen.getByRole("button", { name: "Cancel import" }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
