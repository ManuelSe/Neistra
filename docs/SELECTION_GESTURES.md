# Selection gestures

All selection views use the same canonical atom references. Picking does not
change the camera, molecular data, project revision, or edit history. Save a named
selection or scene explicitly to retain its references; ordinary selection clears
when changing projects or reloading.

## Clicks and modifiers

| Input | Selection effect |
| --- | --- |
| Click | Replace with the picked entity. |
| Ctrl-click / Cmd-click | Remove a fully selected entity; otherwise add its complete membership. |
| Shift-click | Add the entity. |
| Alt-click | Subtract the entity. |

The viewer uses the active Atom, Residue, Chain, or Structure picking mode. Project
entries, groups, component categories, individual components, and Sequence-tab
chain/residue buttons use their own displayed membership. A group/category is one
operand: partial membership becomes complete rather than inverting each child.
Unrelated selected atoms remain selected during modifier clicks.

For combined modifiers, Alt takes priority, then Ctrl/Cmd, then Shift. Clicking
empty viewer space clears selection only without modifiers. Camera dragging and
explicit focus controls keep their existing behavior. Inspector operations retain
their explicit replace/add/subtract controls.

## Double-click expansion

In Atom mode, an unmodified double-click replaces selection with the complete
protein residue or individual assigned small-molecule component. This includes
hidden atoms and explicit hydrogens without revealing them. A ligand inside a
complex selects individually; other ligands and protein chains are excluded.
Protein bond hits expand only when both endpoints belong to the same residue;
nonpolymer bond hits must stay within one component.

Single clicks remain immediate. Modified double-clicks retain ordinary modifier
behavior. Ambiguous/unclassified material and unsupported polymers retain ordinary
picking, with existing classification warnings preserved. No connectivity or
proximity guesses establish molecule boundaries. Camera focus remains explicit.

The issue #90 implementation is checkpointed. C1 toggles and C2 double-click
expansion pass focused qualification; residue ranges and final release gates remain
pending. See the [approved contract](plans/issue-90-selection-gestures.md).
