# Project navigation

The entry list manages whole structures. The separate Components pane browses
one named entry while the current molecular selection can span other entries.
The inspected entry is marked separately from selected entries.

Click an entry name to select that structure and inspect its components. Existing
Ctrl/Meta whole-operand toggle, Shift addition, and Alt subtraction still apply. Choose **Components**
from an entry's action menu to inspect it without changing molecular selection.
Viewer picks, category/component selections, group selection, and surface
activation leave the inspected entry unchanged.

On desktop, drag the divider or use its keyboard controls to resize the entry and
component panes. Collapse Components to give the entry list more room; its compact
restore control keeps it available. Narrow layouts use **Entries** and
**Components** tabs in the project drawer. Panel layout and collapse preferences
survive reload where browser storage is available. Inspected entry, expansion, and
scroll position remain session navigation state, including through responsive
remounts, and reset on project change. Deleting an inspected entry clears it;
Undo restores the entry without automatically inspecting it.

Search stays visible. Open **Filter and sort** for the existing structure-type
filter and name/type/atom-count/modified sorting. Filtering or collapsing a group
does not change the component context; the pane identifies an entry outside the
displayed list. Hidden parent entries remain inspectable.

Entry rows show the name, visibility, lock, warning and modified indicators, and
action menu. Choose **Details** for complete filenames, descriptions, counts,
timestamps, and warning messages. Details is keyboard and touch accessible;
Escape closes it and restores the entry action launcher when available. Group
movement, duplication, rename, isolation, export, original download, and deletion
retain their existing whole-entry semantics.

Components come from the existing conservative application classifier. Source,
fallback, and ambiguous assignments do not establish biological function or
binding significance. Unclassified material and scientific warnings remain
accessible. Protein, Ligands, Solvent, and Ions are the existing shared visibility
groups; Water and other solvent/additives share one Solvent preference. A hidden
parent can prevent a requested-visible category from rendering. No individual
persisted component visibility or classification override is introduced.

Categories, components, and protein residues use single-line rows. Click a label to select its exact
members, including members outside the visible scroll window. Disclosure arrows only expand/collapse; a category's eye only changes the named
shared visibility group. Category and component Details actions exposes full labels, counts, provenance and warnings.
Hierarchy warnings have a separate Details launcher above the list.

Expand Protein, then a protein-chain component, to browse its observed residues.
Separate source chain instances stay separate even when chain names repeat.
Residues show recorded names, author numbering (label numbering when absent) and
insertion codes in normalized sequence order. Missing numbers show an explicit
internal ID; missing residues are not reconstructed. Colliding chain labels have
an instance qualifier. Unknown/nonstandard names remain identifiable.

A residue label selects all its existing normalized atoms, including hidden H,
without revealing them or changing the viewer's picking mode or camera. Plain
activation replaces; Ctrl/Meta completes a partial residue or removes a complete
one; Shift adds the inclusive same-entry/component/chain range from the shared
fixed start, or only that residue when no matching start exists; Alt subtracts.
Sequence and eligible native viewer picks share the same start. Full and partial
coverage have distinct pressed/mixed states and a partial border cue. Selection
never scrolls, expands, or retargets the component browser automatically. See
[selection gestures](SELECTION_GESTURES.md) for precedence and invalidation.

Focus a row label and use Up/Down or Home/End to reach every expanded row, including
off-screen components and residues. Right expands or enters a child; Left
collapses or returns to the parent. Focus movement and scrolling do not select; Enter/Space
activates the focused control. Tab reaches the active row's disclosure, visibility,
and Details controls. Virtual scrolling renders the visible window plus bounded
overscan and retains focused/Details rows while they need to remain available.

Browsing, disclosure, search, scrolling, and resizing create no project command
or molecular edit. Explicit selection uses canonical atom references; durable
visibility and entry actions retain their existing history and revision rules.
Original uploads, molecular files, chemistry, jobs, schemas, and surface objects
retain their existing owners.
