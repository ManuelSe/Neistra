import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { molecularApi } from "../api/client";
import type {
  ComponentHierarchy,
  NormalizedStructure,
  Selection,
  StructureProjection,
  ViewerSettings,
} from "../api/types";
import { ProjectBrowser } from "../components/ProjectBrowser";
import {
  categorySelection,
  componentSelection,
  selectedState,
} from "../selection/components";
import { emptySelection } from "../selection/selection";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { visibleComponentAtomIds } from "../viewer/componentVisibility";
import {
  molecularEntry,
  molecularProject,
  proteinStructure,
  viewerSettings,
} from "./molecular-fixtures";

function complexProjection(): StructureProjection {
  const base = proteinStructure();
  const residues: NormalizedStructure["residues"] = [
    ...base.residues,
    {
      id: 3,
      chain_id: 1,
      name: "LIG",
      author_number: 20,
      label_number: 3,
      insertion_code: null,
      component_type: "ligand",
    },
    {
      id: 4,
      chain_id: 1,
      name: "HOH",
      author_number: 21,
      label_number: 4,
      insertion_code: null,
      component_type: "water",
    },
    {
      id: 5,
      chain_id: 1,
      name: "ZN",
      author_number: 22,
      label_number: 5,
      insertion_code: null,
      component_type: "ion",
    },
    {
      id: 6,
      chain_id: 1,
      name: "UNK",
      author_number: 23,
      label_number: 6,
      insertion_code: null,
      component_type: "unknown",
    },
    {
      id: 7,
      chain_id: 1,
      name: "NAG",
      author_number: 24,
      label_number: 7,
      insertion_code: null,
      component_type: "ligand",
    },
    {
      id: 8,
      chain_id: 1,
      name: "HOH",
      author_number: 25,
      label_number: 8,
      insertion_code: null,
      component_type: "water",
    },
  ];
  const atoms = [
    ...base.atoms,
    ...[3, 4, 5, 6, 7, 8].map((residueId, index) => ({
      ...base.atoms[0],
      id: index + 4,
      name: residueId === 5 ? "ZN" : `X${index + 1}`,
      element: residueId === 5 ? "Zn" : "C",
      residue_id: residueId,
      source_index: index + 3,
    })),
  ];
  const structure: NormalizedStructure = {
    ...base,
    structure_type: "complex",
    residues,
    atoms,
  };
  const hierarchy: ComponentHierarchy = {
    schema_version: 1,
    components: [
      {
        id: "protein-a",
        category: "protein",
        display_label: "Protein chain A",
        chain_ids: [1],
        residue_ids: [1, 2],
        atom_ids: [],
        classification_source: "source",
        classification_status: "assigned",
        warnings: [],
      },
      ...[
        ["ligand", "LIG 20", 3, "fallback"],
        ["water", "HOH 21", 4, "source"],
        ["ion", "ZN 22", 5, "fallback"],
        ["unclassified", "UNK 23", 6, "ambiguous"],
        ["other_heterogen", "NAG 24", 7, "source"],
        ["water", "HOH 25", 8, "source"],
      ].map(([category, label, residueId, source]) => ({
        id: `${category}-${residueId}`,
        category: category as ComponentHierarchy["components"][number]["category"],
        display_label: String(label),
        chain_ids: [1],
        residue_ids: [Number(residueId)],
        atom_ids: [],
        classification_source:
          source as ComponentHierarchy["components"][number]["classification_source"],
        classification_status:
          source === "ambiguous" ? ("ambiguous" as const) : ("assigned" as const),
        warnings:
          source === "ambiguous"
            ? [
                {
                  code: "component_classification_ambiguous",
                  message: "UNK 23 could not be assigned more narrowly.",
                  operation: "component_detection",
                  severity: "warning" as const,
                  field: "component.category",
                  blocking: false,
                },
              ]
            : [],
      })),
    ],
    warnings: [
      {
        code: "component_classification_ambiguous",
        message: "1 component assignment remains unclassified.",
        operation: "component_detection",
        severity: "warning",
        field: "components",
        blocking: false,
      },
    ],
  };
  return {
    entry_id: "complex",
    structure,
    hierarchy,
    viewer: { format: "mmcif", data: "projection" },
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Tooltip.Provider>{children}</Tooltip.Provider>
    </QueryClientProvider>
  );
}

const browserActions = {
  onRename: vi.fn(),
  onDuplicate: vi.fn(),
  onVisibility: vi.fn(),
  onLock: vi.fn(),
  onIsolate: vi.fn(),
  onGroup: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("component hierarchy", () => {
  it("loads lazily, renders categories lazily, and emits canonical modifier selections", async () => {
    const user = userEvent.setup();
    const projection = complexProjection();
    const request = vi.spyOn(molecularApi, "structure").mockResolvedValue(projection);
    const onSelect = vi.fn();
    const onVisibility = vi.fn();
    const entry = {
      ...molecularEntry("complex", "Complex", "complex"),
      atom_count: projection.structure.atoms.length,
      atom_ids: projection.structure.atoms.map((atom) => atom.id),
    };
    render(
      <ProjectBrowser
        project={molecularProject([entry])}
        selection={emptySelection()}
        onSelectHierarchy={onSelect}
        onHierarchyVisibility={onVisibility}
        {...browserActions}
      />,
      { wrapper: Wrapper },
    );

    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByText("Protein chain A")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Component hierarchy for Complex"));
    await screen.findByText("Polymers");
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 component assignment remains unclassified.")).toBeVisible();
    expect(screen.queryByText("HOH 21")).not.toBeInTheDocument();

    await user.click(screen.getByText("Water"));
    expect(screen.getByText("HOH 21")).toBeVisible();
    expect(screen.getByText("HOH 25")).toBeVisible();
    await user.click(screen.getByLabelText("Select Water in Complex"));
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        granularity: "atom",
        source: "project",
        atoms: [
          { structure_id: "complex", atom_id: 5 },
          { structure_id: "complex", atom_id: 9 },
        ],
      }),
      "replace",
    );

    await user.click(screen.getByText("Ligands / cofactors", { selector: "summary span" }));
    const ligand = screen.getByRole("button", { name: /LIG 20/ });
    fireEvent.click(ligand, { ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        granularity: "residue",
        atoms: [{ structure_id: "complex", atom_id: 4 }],
      }),
      "add",
    );
    expect(screen.getByText("Assigned by a documented residue or element fallback")).toBeVisible();

    await user.click(
      screen.getByLabelText("Hide Water visibility group in Complex"),
    );
    expect(onVisibility).toHaveBeenCalledWith(entry, "solvent");

    await user.click(screen.getByLabelText("Component hierarchy for Complex"));
    await user.click(screen.getByLabelText("Component hierarchy for Complex"));
    await screen.findByText("Polymers");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("derives exact pressed state and never hides other or unclassified material", () => {
    const projection = complexProjection();
    const water = categorySelection(
      "complex",
      projection.structure,
      projection.hierarchy,
      "water",
    );
    const partial: Selection = {
      schema_version: 1,
      atoms: [water.atoms[0]],
      granularity: "atom",
      source: "project",
    };
    expect(water.atoms).toHaveLength(2);
    expect(selectedState(partial, water)).toBe("mixed");
    expect(selectedState(water, water)).toBe(true);
    expect(
      componentSelection(
        "complex",
        projection.structure,
        projection.hierarchy.components[0],
      ).granularity,
    ).toBe("chain");

    const hiddenKnownSettings: ViewerSettings = {
      ...viewerSettings(),
      components: {
        hydrogens: true,
        protein: false,
        ligands: false,
        solvent: false,
        ions: false,
      },
    };
    const viewerStructure: ViewerStructure = {
      entryId: "complex",
      label: "Complex",
      projection: projection.viewer,
      atomIds: projection.structure.atoms.map((atom) => atom.id),
      normalized: projection.structure,
      hierarchy: projection.hierarchy,
      settings: hiddenKnownSettings,
    };
    expect(visibleComponentAtomIds(viewerStructure)).toEqual([7, 8]);
  });
});
