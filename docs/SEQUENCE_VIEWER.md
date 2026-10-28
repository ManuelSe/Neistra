# Protein sequence viewer

The sequence area sits below the 3D canvas, above Properties / History / Jobs.
Every displayed protein chain has its own horizontal, nonwrapping row. Entry and
chain labels stay beside the row; scroll horizontally to browse residues and
vertically to reach additional chains. The area initially accommodates up to
three rows and uses at most one-third of the available viewer region.

Use the header arrow to collapse or expand sequences. Close hides the area;
**Show sequences** in the viewer toolbar restores it. These controls are
independent of the lower panel. The expanded/collapsed/hidden preference is saved
in optional browser storage, not in a project or archive.

## Display and molecular identity

Rows follow application display settings: visible entries, protein visibility,
representations, atom-detail masks where applicable, and isolation. A row retains
the complete observed chain while any part of that chain is displayed. Visible
protein surfaces retain their source-chain context. Camera clipping, occlusion,
and cropped surface triangles do not change the listed sequence.

Only assigned protein chains appear. DNA, RNA, other polymers and unclassified
material remain accessible through Components and existing molecular tools.
Classification warnings remain available there and through the viewer's existing
warning/error information; the sequence does not reclassify molecules.

Standard amino acids use one-letter codes. Other residues retain recorded names.
Numbers use author numbering, then label numbering, including insertion codes.
If neither exists, an explicitly marked internal ID is shown. Gaps do not invent
missing residues, atoms, alignment columns or biological sequence. Hover or focus
a residue for its full recorded name, number, chain and entry context.

## Selection and keyboard navigation

- Click replaces selection with all existing atoms of the residue, including
  hidden members, without revealing them or changing the camera/picking mode.
- Ctrl/Cmd-click completes a partial residue or removes a complete residue.
- Shift-click adds the inclusive source-order range from the shared fixed start.
  Across entries, source components or chains, it adds only the target residue.
- Alt-click subtracts. Combined modifiers retain Alt, Ctrl/Cmd, then Shift
  precedence.

Viewer, Components and Sequence share the same selection and residue-range start.
Full and partial selections update together; partial coverage uses a dashed
border as well as the pressed/mixed accessible state.

Tab reaches the active residue. Left/Right and Home/End move within its row;
Up/Down move between chain rows, clamping to an available residue. Enter/Space
selects with the same modifiers. Moving focus reveals its target without
selecting. Selections elsewhere do not automatically scroll the sequence.

Scroll and valid focus context survive responsive remounts within the current
project. Project changes and reload clear transient browsing and range starts;
saved selections/scenes retain their normal explicit reference contracts.
Updating or failed molecular projections cannot publish stale residue actions.

## Compatibility and limits

The issue #95 candidate targets stable 0.26.0. No database migration, molecular or
archive rewrite, API/job change, new chemistry, or dependency upgrade is required.
Alembic remains 0014; project/viewer/archive schemas remain 2 and
normalized/selection/component schemas remain 1. Portable archives retain current
state rather than portable Undo history.

This is observed protein navigation and selection. Alignment, missing-residue
reconstruction, sequence editing/export, secondary-structure annotation and a
dedicated height resize handle are outside this delivery. Qualification and known
limitations are recorded in the [approved feature plan](plans/issue-95-workspace-sequence-viewer.md).
