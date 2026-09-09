Build **Neistra**, a clean and modern web application for interactive molecular visualization and basic molecular modeling. It should be inspired by the core workflow of applications such as Schrödinger Maestro, but it must have an original interface, branding, architecture, and visual design. Do not copy Maestro’s layout, icons, terminology, or other proprietary design elements.

## Product goal

Neistra should allow a scientist to create a project, import multiple protein and small-molecule structures, inspect and edit them in an interactive 3D workspace, and export the resulting structures in common molecular file formats.

The application must also provide a generic Python job architecture that will later be used to integrate a separately developed docking and molecular-modeling package. Docking itself is not part of this version.

Prioritize a coherent, polished, working application over a large number of incomplete scientific tools.

## Core user interface

Create a desktop-style responsive interface with:

1. A top application bar containing project, import, export, undo, redo, and job actions.
2. A left-side project browser containing every imported structure.
3. A large central 3D molecular workspace.
4. A right-side inspector for selections, representations, structure information, editing tools, and measurements.
5. An optional lower panel for a property table, job progress, results, and logs.
6. Resizable and collapsible panels.
7. A clean light and dark theme.
8. Original styling and icons.

## Project model

A project contains multiple structure entries.

Each structure entry must have:

* A stable unique identifier.
* Name and optional description.
* Structure type such as protein, ligand, complex, solvent, or unknown.
* Original filename and source format.
* Current normalized structure data.
* Visibility and locked state.
* User-defined metadata.
* Dirty or modified state.
* Creation and modification timestamps.
* Links to jobs and generated results.

Users must be able to:

* Create, save, reopen, and export projects.
* Import several files at once.
* Rename, duplicate, group, hide, isolate, lock, and delete entries.
* Select multiple entries.
* Sort, filter, and search entries.
* Recover unsaved work after an interrupted session.
* Export a portable project archive containing a versioned manifest and required structure files.

Use a documented, versioned internal project schema.

## Supported formats

Implement import and export adapters for:

* PDB
* mmCIF or CIF
* SDF
* MOL
* MOL2
* XYZ
* SMILES where technically appropriate

Design the adapter system so PDBQT and other formats can be added later.

Format conversion and normalization should occur in the Python backend. Return structured warnings when the selected output format cannot preserve properties such as bond orders, formal charges, metadata, multiple conformers, or chain information.

The export interface must support:

* Exporting all structures.
* Exporting selected structures.
* Exporting only visible structures.
* Separate files or supported multi-record files.
* Optional inclusion or removal of hydrogens, waters, and ions.
* Safe filename handling and overwrite protection.

## 3D molecular workspace

Use a suitable WebGL-based molecular visualization library, preferably Mol*, behind an application-specific viewer abstraction.

The viewer must support:

* Simultaneous display of multiple structures.
* Protein cartoon and backbone representations.
* Line, stick, ball-and-stick, and space-filling representations.
* At least one molecular surface representation if practical.
* Coloring by element, chain, residue, secondary structure, structure, and custom color.
* Representation-specific opacity.
* Showing and hiding hydrogens, solvent, ions, ligands, and protein components.
* Atom, residue, chain, and structure labels.
* Perspective and orthographic cameras.
* Orbit, pan, zoom, focus, center, and reset-view operations.
* Isolation of a structure or selection.
* Named views or scenes if this can be implemented without compromising the core features.

Keep the application’s molecular state separate from the viewer’s internal state. The viewer should render application state rather than becoming the authoritative data store.

## Selection

Implement a central selection model synchronized across the 3D viewer, project browser, sequence view, and inspector.

Support:

* Atom selection.
* Residue selection.
* Chain selection.
* Whole-structure selection.
* Additive and subtractive selection using keyboard modifiers.
* Clear and invert selection.
* Expand a selection to its residue, chain, or structure.
* Select by atom name, element, residue name, residue number, chain, and structure.
* Spatial selection such as atoms or residues within a specified distance of another selection.
* Named saved selections.
* A visible summary of the current selection.

All tools must consume the same selection representation.

## Navigation and coordinate transformations

Clearly distinguish camera movement from structure-coordinate editing.

Support:

* Camera orbit, pan, zoom, center, and reset.
* Focus on the current selection.
* Translate an entire structure.
* Rotate an entire structure around its center.
* Translate selected atoms.
* Rotate selected atoms around a configurable pivot.
* Numerical entry for translation and rotation values.
* Protein superposition using selected atoms or backbone atoms.
* Undo and redo for all coordinate-changing operations.

## Measurements and inspection

Implement:

* Distance measurements between two atoms.
* Bond-angle measurements using three atoms.
* Dihedral-angle measurements using four atoms.
* Measurement labels in the 3D view.
* A list where measurements can be renamed, shown, hidden, or deleted.
* Atom information including name, element, coordinates, residue, chain, formal charge, and index.
* Residue and chain information.
* A protein sequence panel linked bidirectionally to 3D residue selection.
* Basic close-contact or steric-clash detection if practical.

## Molecular editing

Editing operations must modify the authoritative molecular model and then update the viewer.

For small molecules, implement:

* Add atom.
* Delete atom.
* Add bond.
* Delete bond.
* Change bond order.
* Change element.
* Change formal charge.
* Add and remove hydrogens.
* Move selected atoms.
* Rotate a rotatable bond.
* Basic valence validation.
* Basic stereochemistry preservation or warnings.
* 3D coordinate cleanup or local minimization using a backend chemistry library where available.

For proteins, implement a deliberately limited but reliable set of operations:

* Delete atom.
* Delete residue.
* Delete chain.
* Delete waters or ions.
* Rename a chain.
* Renumber residues.
* Mutate a standard amino-acid residue using templates.
* Select from a limited set of side-chain rotamers if practical.
* Add or remove hydrogens.
* Move selected atoms or residues.

Show clear warnings for unsupported residues, invalid valence, missing template atoms, severe clashes, or operations that may produce chemically questionable geometry.

Do not pretend that simple coordinate editing constitutes a complete protein-preparation workflow.

## Edit history

Use a command-based editing model.

Every state-changing user action must:

* Be undoable and redoable.
* Have a human-readable description.
* Record the affected structure and selection.
* Mark the appropriate project entries as modified.
* Preserve enough information to reverse the operation reliably.

Set a reasonable bounded history size and warn before destructive operations that cannot be reversed.

## Backend architecture

Use a Python backend with a documented HTTP API and WebSocket or server-event channel for job updates.

Separate the backend into:

* API layer.
* Project and persistence layer.
* Molecular domain model.
* File-format adapters.
* Validation and chemistry services.
* Job orchestration layer.
* Artifact storage.
* Plugin registry.

Do not put docking-specific concepts into the core project or API models.

Define stable abstractions for:

* `StructureAdapter`
* `MolecularEditor`
* `StructureValidator`
* `JobDefinition`
* `JobRunner`
* `JobResult`
* `Artifact`
* `JobPlugin`

The user’s future Python package should be integrable as a plugin implementing these interfaces.

## Job system

Implement a complete generic job lifecycle even though docking is not included.

A job must have:

* Stable ID.
* Job type and implementation version.
* Input structure IDs.
* Immutable input snapshots or artifacts.
* Validated parameter object.
* Queued, running, completed, failed, and cancelled states.
* Progress from zero to one hundred percent where available.
* Status message.
* Creation, start, and completion timestamps.
* Standard output and error logs.
* Result artifacts.
* Structured error information.
* Provenance metadata.
* Parent-project relationship.

Implement:

* Job submission.
* Background execution outside the web request.
* Progress reporting.
* Log streaming or polling.
* Cancellation.
* Error handling.
* Result download.
* Importing returned structures into the current project.
* Linking result entries to the originating job and inputs.

Include at least one demonstration job that exercises the entire infrastructure. For example, it may calculate simple structure statistics, sleep in several cancellable steps while reporting progress, and return a copied or transformed structure.

Provide clear documentation showing exactly how a future docking plugin would be registered, receive receptor and ligand artifacts, execute Python code, publish logs and progress, and return poses and scores.

## Persistence

For the first version, a local deployment is sufficient.

Use:

* A relational store such as SQLite for projects, entries, metadata, jobs, and artifact records.
* A managed filesystem directory for uploaded and generated files.
* Content hashes or stable artifact IDs.
* Database migrations.
* Atomic writes where practical.
* Validation of uploaded files, extensions, and maximum sizes.
* Safe handling of filenames and paths.

Keep storage interfaces replaceable so a future deployment can use PostgreSQL and object storage.

## Scientific correctness and safety

* Never silently discard parsing, conversion, or validation errors.
* Associate warnings with the affected structure and operation.
* Preserve original uploads.
* Do not assume a PDB file contains reliable ligand bond orders.
* Distinguish missing data from inferred data.
* Record when atoms, bonds, hydrogens, coordinates, or residue templates were inferred.
* Make file conversions deterministic where possible.
* Do not run arbitrary user commands.
* Execute job plugins through a controlled runner interface.
* Validate paths, resource limits, and job parameters.

## Performance

The application should remain responsive with ordinary protein–ligand complexes.

Use:

* Lazy loading for non-visible structures.
* Web workers where expensive browser-side processing would block rendering.
* Debounced viewer updates.
* Efficient typed molecular data structures.
* Cancellation for long imports and exports.
* Visible loading indicators.
* Graceful degradation for structures that exceed recommended limits.

Avoid premature optimization, but do not repeatedly serialize complete structures for minor viewer interactions.

## Testing

Provide:

* Unit tests for file adapters.
* Round-trip format tests where the formats support them.
* Unit tests for selection operations.
* Unit tests for edit commands and undo/redo.
* Validation tests for malformed structures.
* API integration tests.
* Job lifecycle and cancellation tests.
* End-to-end browser tests covering import, display, selection, editing, project save, project reload, and export.
* Small fixture files for each supported format.
* At least one example protein–ligand complex.

## Documentation

Create:

* A concise README with local setup and architecture.
* Development commands.
* A diagram of frontend, backend, viewer, storage, and job-runner relationships.
* API documentation.
* Internal project-schema documentation.
* Supported-format matrix.
* Known scientific limitations.
* Plugin-development guide.
* Example implementation of the demonstration job.
* A checklist describing how the future docking package will be integrated.

## Definition of done

The first version is complete when a user can:

1. Start the application locally using documented commands.
2. Create a project.
3. Import multiple protein and small-molecule files.
4. Display them simultaneously using different representations.
5. Select atoms, residues, chains, and complete structures.
6. Use selections from both the 3D view and sequence or project panels.
7. Measure distances, angles, and dihedrals.
8. Move and rotate structures or selected atoms.
9. Perform the specified basic ligand and protein edits.
10. Undo and redo edits.
11. Save and reopen the project.
12. Export selected structures into supported formats.
13. Submit, monitor, cancel, and inspect a demonstration backend job.
14. Import the demonstration job’s result into the project.
15. Follow the plugin documentation to identify exactly where the future docking package will be connected.

Deliver a working vertical slice rather than placeholder buttons. Features not implemented must be visibly disabled or omitted, not represented as functioning controls.
