# Architecture

Status: MolWeave v0.1

MolWeave is a local three-process application: a browser client, an HTTP API,
and a coordinating job worker. SQLite and a managed content-addressed artifact
directory provide durable local state.

```mermaid
flowchart TB
  subgraph Browser
    React[React workspace]
    Query[TanStack Query server state]
    Prefs[Zustand preferences]
    Selection[Transient canonical selection]
    Components[Derived component hierarchy]
    Spatial[Spatial-query Web Worker]
    Viewer[Mol* adapter and disposable scene]
    React --> Query
    React --> Prefs
    React --> Selection
    Query --> Components
    Components --> Selection
    Components --> Viewer
    Selection <--> Viewer
    Selection --> Spatial
  end

  Query -->|REST| API[FastAPI API layer]
  Query <-->|durable job events| WS[WebSocket and polling]
  WS --> API
  API --> Project[Project command/service layer]
  API --> Molecular[Format, chemistry, validation, transform services]
  Project --> DB[(SQLite metadata and history)]
  Project --> Store[Content-addressed artifact store]
  Molecular --> Store
  API -->|enqueue and inspect only| DB

  Worker[Coordinating worker] -->|atomic claim/events| DB
  Worker --> Child[Spawned allowlisted plugin child]
  Child -->|controlled progress/log/result protocol| Worker
  Worker -->|validated atomic publication| Store
```

## Ownership Boundaries

- FastAPI owns transport validation and maps domain failures to structured
  HTTP errors; request handlers do not execute plugin work.
- The project service owns revisions, checkpoints, reversible commands,
  history, and relational transactions.
- `NormalizedStructureV1` artifacts own molecular identity, hierarchy,
  chemistry, coordinates, warnings, and inference records. Original upload
  bytes are immutable separate artifacts.
- Gemmi, RDKit, PDBFixer/OpenMM, SciPy, and format writers are adapters or
  services around the normalized model, never alternate project authorities.
- TanStack Query caches API state. Zustand persists only theme, panel layout,
  collapse state, and active-project pointer. Current selection and camera are
  transient unless stored in an application-owned named scene.
- Mol* consumes generated mmCIF/SDF projections plus application settings. Its
  internal tree is disposable and is rebuilt after topology changes; it never
  serializes project state.
- The worker owns job claim/recovery and spawns an allowlisted plugin in a
  controlled child. Only the parent validates and publishes returned bytes.

## Component Hierarchy Ownership

`molweave_core.components` deterministically derives `ComponentHierarchyV1`
from the current `NormalizedStructureV1` artifact. Gemmi contributes optional
source entity, subchain, polymer-type, and tabulated-residue facts only at the
macromolecular adapter boundary; the classifier itself is library-independent.
Source facts take precedence, documented residue/element rules are explicit
fallbacks, and unsupported evidence remains ambiguous and visible.

Component IDs are entry-local opaque hashes over stable source/subchain/chain,
residue, or orphan-atom identity. They never use display labels, coordinates,
array position, proximity, molecular size, recent selection, or Mol* objects.
Polymer source instances and individual non-polymer residues own disjoint
memberships; every normalized atom belongs to exactly one component. Covalent
connectivity does not erase a source residue boundary.

The hierarchy is returned with the artifact-keyed lazy structure response and
is never copied into SQLite, checkpoints, scenes, browser preferences, or
archives. Coordinate-only edits therefore retain exact IDs and membership;
topology edits derive current membership again from retained normalized
identities. Category and component nodes materialize the existing canonical
atom-reference selection. Existing Protein, Ligands, Solvent, and Ions viewer
settings filter application memberships before Mol* receives a disposable
bundle; categories without a mapped setting, including unclassified material,
remain visible.

## Viewer Interaction Semantics

Mol* owns hit testing and the distinction between a click and a camera drag.
MolWeave consumes the resulting primary mouse or touch activation and translates
structural loci immediately into canonical application atom references at the
active Atom, Residue, Chain, or Structure granularity. An unmodified hit replaces
selection, Ctrl/Meta/Shift adds, and Alt subtracts. An unmodified empty hit clears
a non-empty selection; an empty hit with a modifier, or while selection is already
empty, is a no-op.

Primary and primary-equivalent trigger activations are deliberately absent from
Mol* camera-focus and representation-focus bindings. Selection clicks therefore
do not frame a hit or reset the camera. Secondary camera behavior and Mol*'s
trackball gestures remain owned by Mol*, while camera framing occurs only through
explicit application operations such as `focusAtoms` and `fitVisible`.

These interactions update transient viewer/application state only. They do not
issue project commands, refetch normalized structures, mutate molecular data, or
persist ordinary selection or camera state.

## Persistence

SQLite stores projects, entries, groups, checkpoints, bounded command history,
artifact metadata, jobs, inputs, results, and ordered events. Artifact files
are hash-addressed beneath the managed root and published with temporary-file,
`fsync`, and atomic-replace semantics. Project mutations use optimistic
`expected_revision`; artifacts may be orphaned by a failed transaction but a
project never points to unpublished bytes.

Portable `.molweave.zip` archives use `ProjectManifestV1`, checksums, safe
relative member paths, and an allowlisted media/type model. They contain the
current checkpoint-compatible state and required immutable artifacts, not an
executable process or opaque viewer snapshot.

## Jobs And Extension

The API and worker independently discover the same installed, allowlisted
`JobPlugin` definitions. Submission validates a JSON-schema parameter object
and snapshots exact input artifacts. The worker uses atomic database claims,
durable progress/log/state events, cooperative cancellation with termination
fallback, result count/byte limits, and abandoned-worker recovery. Core models
remain docking-neutral; receptor, ligand, pose, score, and engine semantics
belong to a future plugin described in `PLUGIN_GUIDE.md`.

## Dependency Choices

React/Vite provide the typed workspace and build; TanStack Query separates
remote cache from Zustand preferences; Mol* supplies established molecular 3D
rendering; FastAPI/Pydantic provide typed local HTTP contracts; SQLAlchemy and
Alembic provide replaceable persistence and migrations; Gemmi handles
macromolecular hierarchy; RDKit handles small-molecule chemistry; PDBFixer and
OpenMM provide deliberately limited protein templates/hydrogens; SciPy supplies
the contact spatial index; Pytest/Vitest/Playwright/axe cover domain, component,
real-browser, WebGL, and detectable accessibility behavior.
