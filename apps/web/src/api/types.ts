export type StructureType = "protein" | "ligand" | "complex" | "solvent" | "unknown";

export interface Entry {
  id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  structure_type: StructureType;
  original_filename: string | null;
  source_format: string | null;
  normalized_data: Record<string, unknown>;
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
  } | string;
}

