# Selection gestures

Selection stays synchronized across the viewer, project browser, Components panel
and Sequence tab. Picking does not
change the camera, molecular data, project revision, or edit history. Save a named
selection or scene explicitly to retain its references; ordinary selection clears
when changing projects or reloading.

## Clicks and modifiers

| Input | Selection effect |
| --- | --- |
| Click | Replace with the picked entity. |
| Ctrl-click / Cmd-click | Remove a fully selected entity; otherwise add its complete membership. |
| Shift-click | Add the entity, or an eligible viewer protein-residue range. |
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

Residue-mode ordinary picks use the complete normalized protein residue or the
complete individual assigned nonpolymer component, including explicit component
atom membership. Other residue targets retain native residue picking. Atom picks
target one directly hit atom; bond hits retain their existing endpoint selection.
Chain and Structure picking retain their existing native grouping. None of these
operations reveals hidden members or infers new molecule boundaries.

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

## Inclusive protein-residue ranges

In Residue mode, click a protein residue to establish the range start. Shift-click
another residue in the same entry, chain and protein component to add both
endpoints and every existing residue between them. Forward and reverse ranges use
normalized source sequence order, including numbering gaps and insertion codes;
they do not use residue-number arithmetic or spatial distance. Missing residues
are not reconstructed. Other selected atoms remain selected.

Repeated Shift-clicks keep the same start. Ctrl/Cmd-click that adds a complete
protein residue establishes a new start in Residue mode. Alt/Shift clicks never
establish or advance the start. In Atom mode, double-click a protein residue first,
then Shift-click an atom of another residue to add its complete inclusive range.
Without a valid start, Shift-click adds the ordinary active-granularity target.
Across entries, chains, or separate source protein components, it also adds only
that ordinary target.

Clear, a new replacement selection, picking-mode changes, project changes, source
artifact changes, or removal of any start-residue atom clear the start. Responsive
viewer remounts preserve a still-valid start; reload clears it. Changing the camera
or explicitly fitting the view does not change this application selection state.

The project browser, Components panel and existing Sequence tab share toggling and
selection highlighting. They do not establish range starts or implement range
gestures in this issue. Additive/subtractive/toggle panel actions preserve a start
only while its complete residue remains selected. Loading a saved selection or
scene restores its references without establishing a range start. No anchor is
stored in a selection, scene, project archive, preferences or edit history.

Explicit inspector expansion and keyboard-operable sequence/component selection
remain available alternatives to double-click. No custom touch double-tap gesture
is introduced. Selection includes hidden atoms without changing their visibility.
The existing classification warnings remain authoritative: selecting a component
is not a claim of complete chemistry, biological role or covalent connectivity.

Released in [v0.22.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.22.0),
with complete candidate/exact-master and actual preceding-reader qualification.
See the [approved contract](plans/issue-90-selection-gestures.md).
