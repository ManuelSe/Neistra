# Selection styling

Select atoms, residues or entries, then activate **Style selection** in the viewer
toolbar. The palette stays open while you pick atoms, change selection in other
panels, or move the camera. Its count always describes the current selection.

- Click a representation illustration to apply it. Atom detail and polymer are
  independent channels. A solid pressed button applies throughout the selection;
  a dashed border and dash mark partial membership. Unavailable polymer styles
  have a **Why unavailable?** disclosure explaining their complete-residue rule.
- Use **Hide** in Atom detail to hide the selected atoms and incident bonds.
  Polymer Backbone/Cartoon and surfaces stay visible. If every selected atom is
  hidden, the same tile offers **Show**, restoring its previous styles. A dash
  and dashed border mean mixed visibility; **Hide** then hides the whole target.
  Applying an atomic style also shows its target. Entry/component/isolation and
  hydrogen visibility still bound what can appear; hidden atoms remain selectable.
- Choose **All atoms** or **Carbon only**, then click a color swatch. Mode changes
  alone do not alter atoms. Carbon-only uses the chosen color on selected carbon
  and element colors on other selected atoms; outside atoms are unchanged.
- Open **Custom…** to choose a custom color and press **Apply color**. Mode and
  custom color are remembered while open and reset when you reopen the palette.
- Use the representation or color **Reset** independently. Representation reset
  restores both representation channels to entry defaults and shows the target. Color reset restores
  the underlying entry theme, including removal of explicit element overrides.
- **Non-polar H** stores Show/Hide/Use entry setting for explicit selected H.
  Selecting heavy atoms does not include attached hydrogens. Master hydrogen,
  entry/component visibility and isolation still apply; help explains these limits.
- Open **Expand by distance** to search all entries, including hidden entries,
  with a positive cutoff (default 4 Å). Choose matching atoms or complete residues.
  The search preserves seeds, assumes a common Cartesian frame, and can be cancelled.

Representation, atom-detail visibility, color and hydrogen edits use undo/redo.
While an action is pending, its target remains the selection captured at activation.
You may change the selection, but further palette mutations wait until it finishes.
Errors for an older target are labeled **Previous selection**. Empty selection
keeps the palette open with its actions disabled.

Close with the close button, toolbar toggle, or Escape while focus is inside the
palette. Outside clicks do not close it. Switching projects closes it. Help and
secondary actions use keyboard-operable disclosures. On narrow screens the palette
sits at the bottom and scrolls; the rest of the workspace remains available.

## Visual comparison

These actual 1366×768 browser captures use the same ethanol/hidden-copy fixture.
The original 460×680 dialog hid color controls below its initial scroll position;
the compact 340 px palette exposes representation and color controls immediately.
Scientific rendering, data and control behavior are verified separately from these
screenshots; the expanded instructions are intentionally not always visible.

| v0.6.0 | Compact palette |
| --- | --- |
| ![Original styling dialog](assets/selection-styling/before-desktop.png) | ![Compact styling palette](assets/selection-styling/after-desktop.png) |

Additional capture: [Pixel 7, dark](assets/selection-styling/after-mobile-dark.png).

Qualification uses pinned Chromium/SwiftShader and Pixel 7 emulation, light/dark
and actual 100%/200% desktop zoom. It does not establish physical-device or other
browser support. These v0.6.1 comparison captures predate the later surface and Hide/Show additions.
The compact-layout release itself added no persisted setting or public API; current
surface and visibility behavior is described here. No presets or hover previews are added.

## Selection surfaces

In **Style selection → Surface**, **Add surface** adds the selected atoms to a
saved surface membership; **Remove surface** subtracts them. The count reports how
many currently selected atoms are members (including mixed selections). Each
entry has one membership and its own geometry. Changing or clearing the current
selection does not retarget it. Representation, color and hydrogen resets remain
independent. Entry-level surfaces can coexist; overlapping translucent surfaces
can obscure each other.

The surface encloses the member atoms alone, with a fixed molecular profile
(1.4 Å probe, 0.5 Å grid, opacity 0.45). It is a fragment surface: cut boundaries
can produce artificial faces. It is not a context-aware patch, a solvent-accessible
surface, or a chemistry repair. **About surfaces** explains this in the palette.
Element colors and selection color overrides, including carbon-only coloring,
apply. Entry/component visibility, isolation and hydrogen preferences filter the
visible fragment without changing saved membership.

Rendering runs asynchronously, with status outside the palette. **Cancel** stops
rendering and keeps membership; **Retry** retries a cancelled or failed request.
Failures or resource limits show lines for the same target. Smaller memberships
can fit limits of 100,000 visible atoms, 64 million padded grid cells, 512 MiB mesh
allocation per surface and 1 GiB retained meshes per viewer. Each active calculation
is admitted against a 2 GiB buffer budget and stops after 120 seconds. Entries with at least 250,000 atoms retain reduced-detail behavior.
These are allocation/work limits, not a browser or GPU memory guarantee.

Coordinate previews hide stale geometry. Committing coordinates or cancelling a
preview regenerates the appropriate surface. Undo/redo, scenes, project saves and
archives retain memberships. Deleted atoms are pruned reversibly; newly added atoms
do not automatically join. Migration 0011 and rollback restrictions are documented
in [Development](DEVELOPMENT.md).

C4 visual qualification: [light, 100% zoom](assets/selection-surfaces/palette-light-100.png)
and [dark, actual 200% browser zoom](assets/selection-surfaces/palette-dark-200.png).
These show the compact action row after a removal; the narrow palette scrolls
within its bounds with its close control retained in the sticky header.


## Hiding, saving and exporting

Hide suppresses atomic representations and atom labels, including bonds incident
to hidden atoms. It preserves residue/chain labels, measurements and their atom
references, molecular coordinates, topology, supplied conformers and warnings.
It does not remove a ribbon/cartoon trace when its CA or other atoms are hidden.
Surface memberships and geometry remain independent.

Hidden IDs survive undo/redo, saved scenes, checkpoints/restart, duplication and
project archives. Deleting atoms prunes the mask with undo support; adding atoms
does not hide them automatically. Hierarchy, sequence, queries and saved selections
remain ways to select hidden atoms; visible polymer/surface picks can select them.

**Visible** molecular export still exports visible entries. Atom-detail hiding
does not create an atom-subset export or remove atoms from original files. New
archives with visibility state require a compatible reader; migration/backup
instructions are in DEVELOPMENT. The feature plan records actual verification.
