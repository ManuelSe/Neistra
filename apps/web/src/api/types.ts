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
  atom_ids: number[];
  bond_count: number;
  residue_count: number;
  conformer_count: number;
  warnings: MolecularWarning[];
  viewer_settings: ViewerSettings;
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

export type SelectionGranularity = "atom" | "residue" | "chain" | "structure";
export type SelectionSource = "viewer" | "project" | "sequence" | "inspector" | "saved";
export type SelectionMode = "replace" | "add" | "subtract";

export interface AtomReference {
  structure_id: string;
  atom_id: number;
}

export interface Selection {
  schema_version: 1;
  atoms: AtomReference[];
  granularity: SelectionGranularity;
  source: SelectionSource;
}

export interface SavedSelection {
  id: string;
  name: string;
  atom_references: AtomReference[];
  granularity: SelectionGranularity;
  warnings: MolecularWarning[];
  created_at: string;
  modified_at: string;
}

export type RepresentationStyle =
  | "cartoon"
  | "backbone"
  | "line"
  | "stick"
  | "thick-stick"
  | "ball-and-stick"
  | "space-filling"
  | "surface";
export type ColorScheme =
  | "element"
  | "chain"
  | "residue"
  | "secondary-structure"
  | "structure"
  | "custom";

export interface RepresentationSettings {
  id: string;
  style: RepresentationStyle;
  color_by: ColorScheme;
  custom_color: string;
  opacity: number;
}

export interface ViewerSettings {
  representations: RepresentationSettings[];
  selection_representations: SelectionRepresentation[];
  components: {
    hydrogens: boolean;
    nonpolar_hydrogens: boolean;
    solvent: boolean;
    ions: boolean;
    ligands: boolean;
    protein: boolean;
  };
  labels: {
    atoms: boolean;
    residues: boolean;
    chains: boolean;
    structure: boolean;
  };
}

export type SelectionRepresentationStyle = Exclude<RepresentationStyle, "surface">;

export interface SelectionRepresentation {
  style: SelectionRepresentationStyle;
  atom_ids: number[];
}

export type MeasurementKind = "distance" | "angle" | "dihedral";

export interface Measurement {
  id: string;
  name: string;
  kind: MeasurementKind;
  atom_references: AtomReference[];
  visible: boolean;
  warnings: MolecularWarning[];
  created_at: string;
  modified_at: string;
}

export interface CameraState {
  mode: "perspective" | "orthographic";
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  radius: number;
}

export interface Scene {
  id: string;
  name: string;
  camera: CameraState;
  entry_states: {
    entry_id: string;
    visible: boolean;
    viewer_settings: ViewerSettings;
  }[];
  selection: Selection;
  created_at: string;
  modified_at: string;
}

export interface Contact {
  atom_1: AtomReference;
  atom_2: AtomReference;
  distance: number;
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
  saved_selections: SavedSelection[];
  measurements: Measurement[];
  scenes: Scene[];
  history: History;
  structure_patches: CoordinatePatch[];
  topology_patches: TopologyPatch[];
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

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobInputRole {
  role: string;
  label: string;
  minimum: number;
  maximum: number;
  structure_types: StructureType[];
}

export interface JobResultRole {
  role: string;
  label: string;
  media_types: string[];
  importable_structure: boolean;
}

export interface JobDefinition {
  plugin_name: string;
  job_type: string;
  implementation_version: string;
  label: string;
  description: string;
  parameter_schema: {
    properties?: Record<string, {
      type?: string;
      title?: string;
      default?: unknown;
      minimum?: number;
      maximum?: number;
      anyOf?: unknown[];
    }>;
    required?: string[];
  };
  input_roles: JobInputRole[];
  result_roles: JobResultRole[];
}

export interface JobInput {
  id: string;
  ordinal: number;
  role: string;
  entry_id: string;
  entry_name: string;
  structure_type: StructureType;
  artifact_id: string;
  artifact_sha256: string;
  artifact_size: number;
  media_type: string;
  filename: string;
}

export interface ArtifactDownload {
  id: string;
  filename: string;
  media_type: string;
  sha256: string;
  size: number;
  download_url: string;
}

export interface JobResultArtifact {
  id: string;
  role: string;
  artifact: ArtifactDownload;
  filename: string;
  media_type: string;
  metadata: Record<string, unknown>;
  importable_structure: boolean;
  imported_entry_ids: string[];
  created_at: string;
}

export interface Job {
  id: string;
  project_id: string;
  plugin_name: string;
  job_type: string;
  implementation_version: string;
  status: JobStatus;
  parameters: Record<string, unknown>;
  progress: number;
  status_message: string;
  result_values: Record<string, unknown>;
  warnings: Record<string, unknown>[];
  error: { code: string; message: string } | null;
  provenance: Record<string, unknown>;
  cancellation_requested: boolean;
  inputs: JobInput[];
  results: JobResultArtifact[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  modified_at: string;
}

export interface JobEvent {
  id: number;
  job_id: string;
  sequence: number;
  kind: string;
  stream: string | null;
  message: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface JobResultImport {
  project: Project;
  imported_entry_id: string;
}

export interface ApiErrorBody {
  detail?: {
    code?: string;
    message?: string;
    filename?: string;
    operation?: string;
    record_index?: number;
    warnings?: MolecularWarning[];
    reports?: ExportEntryReport[];
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

export interface MolecularChain {
  id: number;
  name: string;
  entity_type: string;
}

export interface MolecularResidue {
  id: number;
  chain_id: number;
  name: string;
  author_number: number | null;
  label_number: number | null;
  insertion_code: string | null;
  component_type: "polymer" | "ligand" | "water" | "ion" | "unknown";
  source_entity_id?: string | null;
  source_subchain_id?: string | null;
  source_entity_type?: string | null;
  source_polymer_type?: string | null;
  source_residue_kind?: string | null;
}

export interface MolecularAtom {
  id: number;
  name: string;
  element: string;
  coordinates: [number, number, number];
  residue_id: number | null;
  formal_charge: number | null;
  source_index: number;
  alternate_location: string | null;
  occupancy: number | null;
  b_factor: number | null;
  stereo?: string | null;
  inferred_fields: string[];
}

export interface MolecularBond {
  id: number;
  atom_1_id: number;
  atom_2_id: number;
  order: number | null;
  aromatic: boolean;
  stereo: string | null;
  inferred: boolean;
}

export interface NormalizedStructure {
  schema_version: 1;
  title: string;
  structure_type: StructureType;
  chains: MolecularChain[];
  residues: MolecularResidue[];
  atoms: MolecularAtom[];
  bonds: MolecularBond[];
  conformers: unknown[];
  warnings: MolecularWarning[];
}

export type ComponentCategory =
  | "protein"
  | "dna"
  | "rna"
  | "other_polymer"
  | "ligand"
  | "water"
  | "solvent"
  | "ion"
  | "other_heterogen"
  | "unclassified";

export interface MolecularComponent {
  id: string;
  category: ComponentCategory;
  display_label: string;
  chain_ids: number[];
  residue_ids: number[];
  atom_ids: number[];
  classification_source: "source" | "fallback" | "ambiguous";
  classification_status: "assigned" | "ambiguous";
  warnings: MolecularWarning[];
}

export interface ComponentHierarchy {
  schema_version: 1;
  components: MolecularComponent[];
  warnings: MolecularWarning[];
}

export interface StructureProjection {
  entry_id: string;
  structure: NormalizedStructure;
  hierarchy: ComponentHierarchy;
  viewer: {
    format: "pdb" | "mmcif" | "sdf" | "mol";
    data: string;
  };
}

export type Point3D = [number, number, number];

export interface CoordinatePatch {
  entry_id: string;
  artifact_id: string;
  atom_ids: number[];
  coordinates: Point3D[];
}

export interface TopologyPatch {
  entry_id: string;
  artifact_id: string;
}

export type LigandEdit =
  | {
      operation: "atom.add";
      element: string;
      formal_charge: number;
      coordinates: Point3D;
    }
  | { operation: "atom.delete"; atom_ids: number[] }
  | {
      operation: "bond.add";
      atom_1_id: number;
      atom_2_id: number;
      order: number;
    }
  | { operation: "bond.delete"; bond_id: number }
  | { operation: "bond.order"; bond_id: number; order: number }
  | { operation: "atom.element"; atom_id: number; element: string }
  | { operation: "atom.charge"; atom_id: number; formal_charge: number }
  | { operation: "hydrogen.add"; atom_ids: number[] | null }
  | { operation: "hydrogen.remove"; atom_ids: number[] | null }
  | {
      operation: "bond.rotate";
      bond_id: number;
      movable_atom_ids: number[];
      angle_degrees: number;
    }
  | {
      operation: "coordinates.cleanup";
      force_field: "auto" | "mmff" | "uff";
      max_iterations: number;
      atom_ids: number[] | null;
    };

export interface LigandEditResult {
  project: Project;
  warnings: MolecularWarning[];
  report: {
    operation: LigandEdit["operation"];
    created_atom_ids: number[];
    created_bond_ids: number[];
    deleted_atom_ids: number[];
    deleted_bond_ids: number[];
    changed_atom_ids: number[];
    force_field: "MMFF" | "UFF" | null;
    converged: boolean | null;
  };
}

export type StandardAminoAcid =
  | "ALA"
  | "ARG"
  | "ASN"
  | "ASP"
  | "CYS"
  | "GLN"
  | "GLU"
  | "GLY"
  | "HIS"
  | "ILE"
  | "LEU"
  | "LYS"
  | "MET"
  | "PHE"
  | "PRO"
  | "SER"
  | "THR"
  | "TRP"
  | "TYR"
  | "VAL";

export type ProteinEdit =
  | { operation: "protein.atom.delete"; atom_ids: number[] }
  | { operation: "protein.residue.delete"; residue_ids: number[] }
  | { operation: "protein.chain.delete"; chain_ids: number[] }
  | { operation: "protein.water.delete" }
  | { operation: "protein.ion.delete" }
  | { operation: "protein.chain.rename"; chain_id: number; name: string }
  | {
      operation: "protein.residue.renumber";
      chain_id: number;
      start: number;
      step: number;
    }
  | {
      operation: "protein.residue.mutate";
      residue_id: number;
      target_name: StandardAminoAcid;
    }
  | {
      operation: "protein.hydrogen.add";
      residue_ids: number[] | null;
      ph: number;
    }
  | {
      operation: "protein.hydrogen.remove";
      residue_ids: number[] | null;
    };

export interface ProteinEditResult {
  project: Project;
  warnings: MolecularWarning[];
  report: {
    operation: ProteinEdit["operation"];
    created_atom_ids: number[];
    created_bond_ids: number[];
    deleted_atom_ids: number[];
    deleted_bond_ids: number[];
    changed_atom_ids: number[];
    changed_residue_ids: number[];
    deleted_residue_ids: number[];
    changed_chain_ids: number[];
    deleted_chain_ids: number[];
  };
}

export type TransformScope = "structure" | "selection";
export type PivotMode = "selection_centroid" | "structure_centroid" | "custom";

export interface CoordinateTransform {
  entry_id: string;
  scope: TransformScope;
  selection: Selection;
  translation: Point3D;
  rotation_degrees: Point3D;
  pivot_mode: PivotMode;
  pivot: Point3D | null;
}

export interface SuperpositionRequest {
  moving_entry_id: string;
  reference_entry_id: string;
  mode: "selection" | "backbone";
  selection: Selection;
}

export interface SuperpositionResult {
  project: Project;
  report: {
    moving_entry_id: string;
    reference_entry_id: string;
    mode: "selection" | "backbone";
    atom_count: number;
    rmsd: number;
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

export type ExportScope = "all" | "selected" | "visible";
export type ExportMode = "separate" | "multi_record";

export interface ExportEntryReport {
  entry_id: string;
  entry_name: string;
  output_filename: string;
  record_index: number | null;
  warnings: MolecularWarning[];
}

export interface BatchExportResult {
  artifact: Artifact;
  scope: ExportScope;
  source_revision: number;
  format: FormatCapability["format"];
  mode: ExportMode;
  reports: ExportEntryReport[];
}

export interface ArchiveExportResult {
  artifact: Artifact;
  manifest_schema_version: 1;
  source_revision: number;
}

export interface ArchiveImportResult {
  project: Project;
  source_project_id: string;
  source_revision: number;
}
