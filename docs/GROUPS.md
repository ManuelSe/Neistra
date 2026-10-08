# Structure groups

Groups organize complete structure entries. They do not extract molecular
components, prepare a receptor or ligand, or change scientific data.

In a structure's **Actions** menu:

- **Move to group…** selects an existing destination, including empty or collapsed
  groups. Repeated names have distinct display labels; stored names stay intact.
- **Remove from group** moves the affected entries to Ungrouped. It appears when
  at least one affected entry belongs to a group.
- **Add to new group** creates a named group and moves the affected entries into it.

If the initiating structure is highlighted by the current atom selection, the
operation includes all highlighted structures. Otherwise it affects only that
structure. A partial atom selection still moves the complete structure, retaining
that atom selection. Scope text shows the complete structure count and selected
structures hidden by search or type filters. Scope and revision are captured when
the action starts; a conflict requires starting a fresh action.

The named menus and native dialog controls work with keyboard and touch. Escape
cancels dialogs. Focus returns to the initiating row, the destination heading if
that row is collapsed, or search if neither is visible. Pending actions cannot be
submitted twice. Failed actions remain visible with an error.

Empty source groups remain available. Organization is a reversible, atomic
project command and survives unsaved recovery, save/reopen and archive import.
Moving to the current destination makes no history or revision change. Locked
structures can be organized. Name, type, atom-count and modified-date sorts remain
local derived views with deterministic ties; no manual order is stored.

Grouping preserves original and normalized files, atom identities, coordinates,
visibility, locks, representations, surfaces, camera, canonical selection,
measurements, scenes and job provenance. Dirty/checkpoint state can change because
organization itself is project data. Archives capture current membership and
remap group/entry IDs; command history stays in the local database.

Group lifecycle management, nested or multiple membership, automatic grouping,
manual order, saved filters and live synchronization between browser tabs are
outside this workflow. Another session sees membership on its next project read;
a stale mutation receives a revision conflict.
