# Project navigation

The entry list manages whole structures. The separate Components pane browses
one named entry while the current molecular selection can span other entries.
The inspected entry is marked separately from selected entries.

Click an entry name to select that structure and inspect its components. Existing
Ctrl/Meta/Shift addition and Alt subtraction still apply. Choose **Components**
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

Browsing, disclosure, search, scrolling, and resizing create no project command
or molecular edit. Explicit selection uses canonical atom references; durable
visibility and entry actions retain their existing history and revision rules.
Original uploads, molecular files, chemistry, jobs, schemas, and surface objects
retain their existing owners.
