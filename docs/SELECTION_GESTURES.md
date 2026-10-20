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

The issue #90 implementation is checkpointed. This document currently describes
C1 entity toggling; double-click expansion and residue ranges remain pending until
their checkpoints pass. See the
[approved contract](plans/issue-90-selection-gestures.md) for scope and evidence.
