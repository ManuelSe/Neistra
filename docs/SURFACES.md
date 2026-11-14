# Independent surfaces

Open **Create surface** from Style selection, Display, or the Surfaces manager.
The same chooser offers **Selected atoms**, **Around selection**, and **Whole entry**.
Selected atoms captures one fragment per affected entry in one undoable action.
Around selection uses an explicit protein receptor, captured seeds and radius;
Whole entry uses the named current entry. Selection changes never silently retarget
an open capture. **Use current selection** explicitly recaptures it. Each entry
can own up to sixteen independent objects. Repeated creation makes new objects.

Creation reveals the new rows, activates the first requested object and announces
the count without changing molecular selection, parent visibility or camera.
The nonmodal manager keeps Create/Close above a scrollable list and separate
details. Rows show name, source kind, requested visibility and current display
status; a check marks the active object. The list reaches overlapping, hidden or
zero-opacity objects. Clicking rendered geometry activates that object; modified
clicks retain molecular add/subtract semantics. Obsolete surface hits are ignored.

Hide keeps a definition; Remove is undoable. Parent visibility remains an upper
bound. Removing the last display does not invent a replacement. All source kinds
offer per-object Cancel/Retry. Ready follows installation of the current display;
isolation, filters, zero opacity, empty crops and coordinate previews have their
own explanation. Saving a definition does not guarantee that it fits rendering
limits. Failures keep the saved definition.

Appearance applies immediately: choose a color scheme, Uniform color, opacity,
or Solid/Mesh. Advanced appearance contains **Inherit atom colors**. Theme/mode/
inheritance choices save once; opacity/color gestures preview locally and save
once when completed. Escape or pointer cancellation restores current confirmed
appearance without history. Undo reverses one completed gesture. Controls retain
focus while saving; interrupted responses refresh current settings rather than
replaying a mutation. **Check again** resolves an unavailable confirmation.
New objects use element colors, opacity 0.45 and solid display. Inherited atom
colors apply saved atom-color overrides to that object. Other objects and atom
colors remain independent. Appearance updates reuse scientific geometry.

Open **Source** to inspect or edit membership. **Select source atoms** selects
current entry content or captured fragment atoms. Pockets instead offer **Select
seeds** and **Select protein context**; the seeds locate the crop and are not
surface membership. Hidden source atoms remain valid. Selection actions change
neither the definition nor the camera.

**Capture fragment from selection** and **Capture seeds from selection** stage a
source draft. Radius edits also remain drafts. **Apply source** publishes one
undoable command; **Revert** discards the draft. Unapplied drafts survive row
changes, closing the manager and responsive viewer remounts while that project
remains open. Switching projects discards them with a notice. Deleted/stale atom
references require explicit recapture. Changing appearance never overwrites a
source draft. Rename uses the pencil action and explicit Save/Cancel.

Pocket radius is 2–12 Å in 0.5 Å steps. Changing receptor requires a new owner-bound
object. Unavailable definitions remain hideable and removable. Added atoms never
silently join captured sources; deleted references are pruned reversibly from
live/scenes with persistent explanatory notices. An interrupted creation refreshes
saved objects and keeps its uncertainty visible; inspect the list before explicitly
creating again. There is no automatic resubmission or guessed result identity.

Fragments enclose only their effective captured atoms and may have artificial cut
faces. Pockets crop complete current protein geometry by triangle-centroid distance
to captured seed centers; open edges, disconnected pieces and empty output are
possible. These displays do not discover cavities, measure area/volume or establish
binding significance. Mesh is presentation of existing triangles. Fragment/pocket
and whole-entry profiles stay fixed: 1.4 Å probe, 0.5 Å grid, 36 probe positions.
Whole-entry calculations combine all included units, avoiding independent shells
inside contacting units. No adaptive grid coarsening is performed. Charge coloring,
electrostatic potential, arbitrary profiles and mesh export are outside this release.
See [scientific limitations](SCIENTIFIC_LIMITATIONS.md).

All surface kinds share one serial worker with lazy input allocation. Fragment
and pocket sources admit at most 100,000 effective atoms; entry sources admit
fewer than 250,000. A normalized parent with at least 250,000 atoms still uses
reduced detail before input extraction. Shared limits are 64 million cells,
512 MiB mesh allocation, 1 GiB retained output including display ownership,
mesh-line and isolation buffers, 2 GiB accounted active buffers and 120 seconds.
These are independent admission/resource ceilings, not universal capacity promises
or total browser/GPU memory limits. Refusal preserves the definition; entry and
fragment fallback uses exact-source lines, while pockets have no line fallback.

Undo/Redo, scenes, save/reload, duplication and archives retain complete definitions.
Transient activation and generated geometry are excluded. Back up database and
artifacts before migration 0014. Project/viewer payloads and new archive exports are
schema 2; validated schema-1 archives import with conversion. Upgrade client and
server together. Older readers cannot read schema-2 exports. Downgrade refuses
retained surface objects or empty ordinary representation sets, including history;
restore the full pre-upgrade backup for rollback. See [API](API.md),
[project schema](PROJECT_SCHEMA.md), and [development](DEVELOPMENT.md).
