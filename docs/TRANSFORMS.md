# Coordinate transforms

Neistra keeps original uploads unchanged. Applied transforms create immutable
normalized snapshots and reversible project commands. These are coordinate
operations, without minimization, restraints, chemistry repair or docking scoring.

## Move selection

Select atoms and choose the **Transform selection** icon in the separate bar
above the viewer; hover or keyboard focus reveals its tooltip.
**Transform → Move selection** in the inspector starts the same operation.
The mode captures the complete selection across structures, its project revision
and original coordinates. Hidden selected atoms remain targets and are counted
in Help, with a compact count on wide desktop layouts. At least some selected
material must be visible; show it before activation. A locked or missing target prevents the entire operation.

The transformation bar keeps Apply/Cancel visible when the inspector is collapsed
or its mobile drawer is closed. The **More** icon exposes sensitivity and
Rotate/Translate/Depth tools for touch dragging, arrow keys and named steps.
The warning/Help icon exposes gesture guidance, full counts and scientific limits:

- Primary mouse drag always rotates around the captured arithmetic centroid, carried along
  by translation. Rotation does not orbit a fixed original world location.
- Secondary drag or Ctrl-primary drag translates in the screen plane.
- Depth uses a vertical touch drag or named steps along the viewing direction; upward moves
  away from the camera. Screen-plane upward movement follows camera up.
- Arrow keys on the movement canvas and the named step buttons use the same
  preview transaction. Touch users can choose a mode and use step buttons. Those
  choices do not change mouse rotation/translation gestures.
- Wheel and named Zoom in/out controls change view scale. Focus and picking stay
  suspended throughout the transaction. The next drag captures the updated scale.
- Sensitivity is bounded from 0.25 to 4; changes take effect on the next drag.

Pointer release finishes a drag and keeps the preview. Multiple drags and steps
accumulate into one pose. **Apply movement** sends one atomic command and produces
one undo step; identity/coordinate no-ops preserve revision, artifacts and redo.
**Cancel movement** or Escape discards the entire unapplied pose. A cancelled
pointer or lost capture restores the start of that drag while retaining earlier
drags. Normal viewer controls return when the session ends.
An open modal dialog or mobile drawer owns focus and Escape: close that panel
first, retaining the preview, then use Escape on the workspace to cancel movement.

Hold **Space** with the movement canvas focused to orbit, pan and zoom the camera
using the viewer's normal navigation. Release Space to resume positioning in the
updated viewing plane. **Adjust view / Resume transform** provides the same
temporary navigation for touch and keyboard users; the explicit toggle stays on
when Space is released. Selection and molecular coordinates remain captured.
Fields, buttons, disclosures and dialogs keep their normal Space behavior.
Each ownership change ends its current drag at the accepted pose/camera; start a
fresh drag afterward. Focus departure clears held Space; blur, hidden documents,
modal takeover, phase changes and renderer remounts clear temporary navigation.
A valid preview and latest camera survive renderer remounts.

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
clashes. The More disclosure reports known crossing bonds where records exist; absent bond
records do not prove safety. This workflow does not validate a pose for docking
or preparation.

Previews are transient operation inputs, never authoritative cache state. They
are excluded from exports, archives and job inputs. Applied coordinates participate
in ordinary persistence, export, checkpoints and history. Scenes store presentation
settings and use current coordinates; they do not store an independent pose. Previously
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
[issue #46 plan](plans/issue-46-viewer-transform-toolbar.md).

Applied coordinates are checked after reload, API restart, checkpoint, molecular
export/reimport and archive import. The actual 0.11.0 reader is qualified against
retained coordinate history and transformed artifacts; see the
[compatibility procedure](DEVELOPMENT.md#viewer-toolbar-compatibility-0120).
Molecular exports retain their format precision, while project archives preserve
exact normalized coordinates and original bytes. Earlier pocket/visibility
migration restrictions continue to apply.


## Compact viewer controls (issue #46 correction)

The Move3d icon starts movement; hover or keyboard focus reveals its tooltip.
The separate icon strip offers Adjust view / Resume transform (camera), Apply
(check), Cancel (cross), More (ellipsis), and Help/scientific limits (warning).
More retains touch/keyboard modes, depth, sensitivity, steps and zoom. Help
contains gesture guidance and complete captured/hidden atom counts and scientific
limits. Movement remains unconstrained and may distort bonds or create clashes.
Errors and uncertain commit outcomes remain visible. Escape in a focused panel
closes that panel first; Escape on the canvas cancels the movement.

Moving the mouse back onto the canvas after using a movement action restores
canvas keyboard focus. Repeated Space camera drags retain it. Editable fields,
sliders, unrelated controls and modal dialogs retain their own focus and normal
Space behavior. The camera toggle remains the touch and keyboard alternative.
