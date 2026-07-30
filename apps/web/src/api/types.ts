export type StructureType = "protein" | "ligand" | "complex" | "solvent" | "unknown";

export interface MolecularWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  operation: string;
  field: string | null;
  blocking: boolean;
}

export interface Entry {
  id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  structure_type: StructureType;
  original_filename: string | null;
  source_format: string | null;
  atom_count: number;
  bond_count: number;
  residue_count: number;
  conformer_count: number;
  warnings: MolecularWarning[];
  original_artifact_id: string | null;
  current_artifact_id: string | null;
  visible: boolean;
  locked: boolean;
  user_metadata: Record<string, unknown>;
  dirty: boolean;
  job_links: string[];
  generated_results: string[];
  created_at: string;
  modified_at: string;
}

export interface EntryGroup {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  modified_at: string;
}

export interface History {
  can_undo: boolean;
  can_redo: boolean;
  undo_description: string | null;
  redo_description: string | null;
  retained_commands: number;
  limit: number;
}

export interface Project {
  schema_version: 1;
  id: string;
  name: string;
  description: string | null;
  revision: number;
  checkpoint_revision: number;
  has_uncheckpointed_changes: boolean;
  created_at: string;
  modified_at: string;
  entries: Entry[];
  groups: EntryGroup[];
  history: History;
}

export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  revision: number;
  checkpoint_revision: number;
  has_uncheckpointed_changes: boolean;
  entry_count: number;
  created_at: string;
  modified_at: string;
}

export interface ApiErrorBody {
  detail?: {
    code?: string;
    message?: string;
    filename?: string;
    operation?: string;
    record_index?: number;
    warnings?: MolecularWarning[];
  } | string;
}

export interface FormatCapability {
  format: "pdb" | "mmcif" | "sdf" | "mol" | "mol2" | "xyz" | "smiles";
  label: string;
  extensions: string[];
  media_types: string[];
  can_import: boolean;
  can_export: boolean;
  multi_record: boolean;
}

export interface StructureProjection {
  entry_id: string;
  structure: {
    schema_version: 1;
    title: string;
    structure_type: StructureType;
    atoms: unknown[];
    bonds: unknown[];
    residues: unknown[];
    conformers: unknown[];
    warnings: MolecularWarning[];
  };
  viewer: {
    format: "pdb" | "mmcif" | "sdf" | "mol";
    data: string;
  };
}

export interface ImportResult {
  project: Project;
  imported_entry_ids: string[];
  warnings: MolecularWarning[];
}

export interface Artifact {
  id: string;
  filename: string;
  media_type: string;
  sha256: string;
  size: number;
  download_url: string;
}

export interface ExportResult {
  artifact: Artifact;
  warnings: MolecularWarning[];
}
