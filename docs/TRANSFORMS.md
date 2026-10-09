# Coordinate transforms

Neistra keeps original uploads unchanged. Applied transforms create immutable
normalized snapshots and reversible project commands. These are coordinate
operations, without minimization, restraints, chemistry repair or docking scoring.

## Move selection

Select atoms, open the **Transform** inspector task and choose **Move selection**.
The mode captures the complete selection across structures, its project revision
and original coordinates. Hidden selected atoms remain targets and are counted
in the viewer banner. At least some selected material must be visible; show it
before activation. A locked or missing target prevents the entire operation.

The banner remains available when the inspector is collapsed or its mobile drawer
is closed. Choose Rotate, Translate or Depth:

- Primary drag rotates around the captured arithmetic centroid, carried along
  by translation. Rotation does not orbit a fixed original world location.
- Secondary drag or Ctrl-primary drag translates in the screen plane.
- Depth uses a primary vertical drag along the viewing direction; upward moves
  away from the camera. Screen-plane upward movement follows camera up.
- Arrow keys on the movement canvas and the named step buttons use the same
  preview transaction. Touch users can choose a mode and use step buttons.
- Wheel and named Zoom in/out controls change view scale. Other navigation,
  focus and picking are suspended. The next drag captures the updated scale.
- Sensitivity is bounded from 0.25 to 4; changes take effect on the next drag.

Pointer release finishes a drag and keeps the preview. Multiple drags and steps
accumulate into one pose. **Apply movement** sends one atomic command and produces
one undo step; identity/coordinate no-ops preserve revision, artifacts and redo.
**Cancel movement** or Escape discards the entire unapplied pose. A cancelled
pointer or lost capture restores the start of that drag while retaining earlier
drags. Normal viewer controls return when the session ends.

Changing selection, inspector task, project or conflicting project state discards
an unapplied preview with feedback. Closing the inspector alone retains it.
Apply cannot be duplicated during submission. A stale revision discards the
preview and refreshes its captured project. An interrupted response is reconciled
before retry; an unknown outcome pauses changes until **Refresh project** succeeds.
Neistra never replays a pose automatically against a refreshed revision.

Affected surfaces and dependent pockets pause during preview. Visible selected
atoms receive transient preview cues; durable visibility and styles are preserved.
Measurements pause visibly until coordinates are restored or applied. Preview
rendering keeps one active update and the latest pending frame; pointer movement
does not run surface jobs or refetch normalized molecular state.

## Scientific semantics and limits

Every captured atom receives the same proper rigid world transform across all
conformers. The active conformer supplies the captured centroid. Unselected
coordinates, connectivity, charges, metadata, warnings and original bytes remain
unchanged. A partial selection may stretch bonds to unselected atoms or create
clashes. The banner reports known crossing bonds where records exist; absent bond
records do not prove safety. This workflow does not validate a pose for docking
or preparation.

Previews are transient operation inputs, never authoritative cache state. They
are excluded from exports, archives and job inputs. Applied coordinates participate
in ordinary persistence, export, checkpoints, scenes and history. Previously
submitted jobs retain their immutable inputs. No database migration or schema
major change is introduced by interactive movement.

## Numerical controls

Existing per-structure numerical fields and axis sliders remain available outside
Move selection. Numerical rotation applies X, then Y, then Z, with the existing
structure/scope/custom pivot choices. Existing sliders commit on release; this is
separate from the explicit Apply/Cancel transaction of Move selection. Protein
superposition retains its existing correspondence and RMSD reporting.

The additive API accepts a proper world rotation matrix and affine translation;
see [API contract](API.md#atomic-selection-transform). Release qualification and
device/performance limits are recorded in the
[issue #4 plan](plans/issue-4-interactive-selection-transform.md).
