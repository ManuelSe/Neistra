import type {
  Entry,
  NormalizedStructure,
  Project,
  StructureProjection,
  ViewerSettings,
} from "../api/types";

export function viewerSettings(
  style: ViewerSettings["representations"][number]["style"] = "ball-and-stick",
): ViewerSettings {
  return {
    representations: [
      {
        id: "primary",
        style,
        color_by: "element",
        custom_color: "#3b82f6",
        opacity: 1,
      },
    ],
    components: {
      hydrogens: true,
      solvent: true,
      ions: true,
      ligands: true,
      protein: true,
    },
    labels: { atoms: false, residues: false, chains: false, structure: false },
  };
}

export function molecularEntry(
  id: string,
  name: string,
  structureType: Entry["structure_type"],
  groupId: string | null = null,
): Entry {
  return {
    id,
    group_id: groupId,
    name,
    description: null,
    structure_type: structureType,
    original_filename: `${name.toLocaleLowerCase()}.pdb`,
    source_format: "pdb",
    atom_count: structureType === "protein" ? 3 : 1,
    bond_count: 1,
    residue_count: structureType === "protein" ? 2 : 0,
    conformer_count: 1,
    warnings: [],
    viewer_settings: viewerSettings(structureType === "protein" ? "cartoon" : "ball-and-stick"),
    original_artifact_id: `original-${id}`,
    current_artifact_id: `current-${id}`,
    visible: true,
    locked: false,
    user_metadata: {},
    dirty: false,
    job_links: [],
    generated_results: [],
    created_at: "2026-07-30T10:00:00Z",
    modified_at: "2026-07-30T10:00:00Z",
  };
}

export function molecularProject(entries?: Entry[]): Project {
  return {
    schema_version: 1,
    id: "project-1",
    name: "Selection project",
    description: null,
    revision: 2,
    checkpoint_revision: 1,
    has_uncheckpointed_changes: true,
    created_at: "2026-07-30T10:00:00Z",
    modified_at: "2026-07-30T10:00:00Z",
    entries:
      entries ?? [
        molecularEntry("protein", "Receptor", "protein", "group-1"),
        molecularEntry("ligand", "Ligand", "ligand"),
      ],
    groups: [
      {
        id: "group-1",
        parent_id: null,
        name: "Target",
        created_at: "2026-07-30T10:00:00Z",
        modified_at: "2026-07-30T10:00:00Z",
      },
    ],
    saved_selections: [],
    measurements: [],
    scenes: [],
    structure_patches: [],
    history: {
      can_undo: true,
      can_redo: false,
      undo_description: "Import structures",
      redo_description: null,
      retained_commands: 2,
      limit: 200,
    },
  };
}

export function proteinStructure(): NormalizedStructure {
  return {
    schema_version: 1,
    title: "Receptor",
    structure_type: "protein",
    chains: [{ id: 1, name: "A", entity_type: "polymer" }],
    residues: [
      {
        id: 1,
        chain_id: 1,
        name: "GLY",
        author_number: 10,
        label_number: 1,
        insertion_code: null,
        component_type: "polymer",
      },
      {
        id: 2,
        chain_id: 1,
        name: "ALA",
        author_number: 11,
        label_number: 2,
        insertion_code: null,
        component_type: "polymer",
      },
    ],
    atoms: [
      {
        id: 1,
        name: "CA",
        element: "C",
        coordinates: [0, 0, 0],
        residue_id: 1,
        formal_charge: null,
        source_index: 0,
        alternate_location: null,
        occupancy: 1,
        b_factor: 10,
        inferred_fields: [],
      },
      {
        id: 2,
        name: "N",
        element: "N",
        coordinates: [1, 0, 0],
        residue_id: 1,
        formal_charge: null,
        source_index: 1,
        alternate_location: null,
        occupancy: 1,
        b_factor: 10,
        inferred_fields: [],
      },
      {
        id: 3,
        name: "CA",
        element: "C",
        coordinates: [5, 0, 0],
        residue_id: 2,
        formal_charge: null,
        source_index: 2,
        alternate_location: null,
        occupancy: 1,
        b_factor: 10,
        inferred_fields: [],
      },
    ],
    bonds: [],
    conformers: [],
    warnings: [],
  };
}

export function proteinProjection(): StructureProjection {
  return {
    entry_id: "protein",
    structure: proteinStructure(),
    viewer: { format: "mmcif", data: "viewer projection" },
  };
}
