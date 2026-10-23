# Selection gestures

Issue #94 extends explicit protein-residue actions in Components and the existing
Sequence tab to the shared fixed anchor, insertion-code labels and partial
coverage. Final milestone/release qualification remains in progress.

Whole-entity toggle, double-click expansion and viewer residue ranges were added
in0.22.0. Picking-mode hover and complete individual-molecule Residue alignment
are corrected in0.22.1; see the issue #91 plan for qualification/publication status.

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
| Shift-click | Add the entity, or an eligible protein-residue range. |
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

## Picking targets

Residue-mode ordinary picks use the complete normalized protein residue or the
complete individual assigned nonpolymer component, including explicit component
atom membership. Other residue targets retain native residue picking. Atom picks
target one directly hit atom; bond hits retain their existing endpoint selection.
Chain and Structure picking retain their existing native grouping. None of these
operations reveals hidden members or infers new molecule boundaries.

## Hover previews

With a mouse, hover previews the entity at the active Atom, Residue, Chain, or
Structure mode. Atom hits preview one atom; bond hits retain endpoint semantics.
Residue mode previews a complete protein residue or an assigned individual
nonpolymer component. Classification ambiguity retains ordinary residue picking.
Only existing visible representations are marked; hidden atoms stay hidden.

The transient highlight differs from persistent selection and clears on empty
space, viewer exit, picking-mode changes and scene/navigation/tool transitions.
Hover never changes selection, residue-range starts, camera, molecular data or
project history. Holding Shift/Ctrl/Cmd/Alt still previews only the entity, not
a range or the final toggle/subtraction result. Touch does not require hover;
existing selection controls and gestures remain available.

Managed surfaces retain separate whole-object activation. Molecular hover does
not overwrite their active-object markers. No hover preference or project state
is saved. See the [issue #91 contract](plans/issue-91-selection-mode-hover.md) for
qualification and release status.

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

Components and the existing Sequence tab's explicit protein-residue buttons share the fixed start
with the viewer. They select complete observed residues in every picking mode;
plain activation or Ctrl/Cmd toggle-on without Shift establishes a start. Shift
adds an inclusive same-entry/component/chain range or only the clicked residue
when no matching start exists. Shift and Alt never establish or advance a start.
Selection feedback distinguishes complete, partial and unselected membership.
Labels retain insertion codes and identify an internal-ID fallback explicitly.

Project-browser and category/component actions retain their ordinary operands.
Additive/subtractive/toggle actions preserve a start only while its complete
residue remains selected. The [issue #94 contract](plans/issue-94-protein-residue-hierarchy.md)
records implementation and qualification status. Loading a saved selection or
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
