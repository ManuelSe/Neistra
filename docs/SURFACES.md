# Independent surfaces

Open **Style selection → Surface → Create** to capture a fragment. A selection
spanning several entries creates one object per entry in one undoable action.
Creating again makes another object. Changing selection does not retarget an
existing object. Use **Display → Add representation → Surface** for a whole-entry
surface, or **Surface options → Pocket… → Create pocket** for a protein pocket.
An entry can own up to sixteen objects.

Open **Manage surfaces** whenever objects exist, including with no atom selection.
The compact nonmodal manager groups named objects by parent entry. Activate a row
to edit its controls. An unmodified primary click/tap on surface geometry activates
that whole object and opens the manager, leaving molecular selection and camera
unchanged. Modifier clicks retain the existing molecular add/subtract semantics.
The list reaches overlapping or zero-opacity surfaces that cannot be picked.

Each object has an independent name, requested visibility and appearance. Hide
keeps its definition; Remove is undoable. Parent visibility remains an upper bound.
Removing the last display does not invent a replacement. Status describes actual
rendering: saving a definition does not guarantee that it fits rendering limits.
Fragment/pocket calculations offer per-object Cancel and Retry; failures keep the
saved definition. Native entry calculations do not offer worker cancellation.

Select **Element**, **Chain**, **Residue**, **Secondary structure**, **Structure**,
or **Uniform**, set opacity from 0 to 1, and choose **Solid** or **Mesh**. Then
**Apply appearance** stores one reversible change. New surfaces use element colors,
opacity 0.45 and solid display. Changing theme enables independent surface colors;
**Inherit atom colors** reapplies saved atom color overrides to that object.
Migrated surfaces keep their prior appearance and inheritance. Appearance changes
never recolor atoms or neighboring objects; worker geometry is reused.

**Select source atoms** explicitly replaces molecular selection with the labeled
source and count: current entry atoms, captured fragment membership, or complete
protein calculation context. Pocket seeds locate the crop and are not membership.
This action does not alter a surface or camera. Hidden source atoms remain valid.

**Replace fragment source** captures a nonempty current selection belonging only
to that owner. It preserves object identity. Pocket controls retain the named
receptor, expose the captured seed count, and separately **Apply radius** or
**Replace seeds from selection**. Radius is 2–12 Å in 0.5 Å steps. Changing receptor
requires creating a new owner-bound object. Unavailable definitions remain hideable
and removable. Added atoms never silently join captured sources; deleted references
are pruned reversibly from live/scenes with persistent explanatory notices.

Fragments enclose only their effective captured atoms and may have artificial cut
faces. Pockets crop complete current protein geometry by triangle-centroid distance
to captured seed centers; open edges, disconnected pieces and empty output are
possible. These displays do not discover cavities, measure area/volume or establish
binding significance. Mesh is presentation of existing triangles. Fragment/pocket
profiles stay fixed: 1.4 Å probe, 0.5 Å grid, 36 probe positions; whole-entry
surfaces retain their existing native geometry path. Charge coloring,
electrostatic potential, arbitrary profiles and mesh export are outside this release.
See [scientific limitations](SCIENTIFIC_LIMITATIONS.md).

Fragment/pocket work uses one serial worker with lazy input allocation: 100,000
effective atoms, 64 million cells, 512 MiB mesh allocation, 1 GiB retained output
including mesh-line/isolation buffers, 2 GiB accounted active buffers and 120 seconds.
These limits do not cap native entry calculations, total browser memory or GPU
memory. Native entry reduced-detail behavior remains at 250,000 atoms.

Undo/Redo, scenes, save/reload, duplication and archives retain complete definitions.
Transient activation and generated geometry are excluded. Back up database and
artifacts before migration 0014. Project/viewer payloads and new archive exports are
schema 2; validated schema-1 archives import with conversion. Upgrade client and
server together. Older readers cannot read schema-2 exports. Downgrade refuses
retained surface objects or empty ordinary representation sets, including history;
restore the full pre-upgrade backup for rollback. See [API](API.md),
[project schema](PROJECT_SCHEMA.md), and [development](DEVELOPMENT.md).
