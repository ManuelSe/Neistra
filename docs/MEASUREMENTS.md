# Measurements

Open the ruler button in the viewer toolbar. Choose **Distance**, **Angle** or
**Torsion**, then fill its numbered targets. The angle vertex is target 2; torsion
sign follows targets 1 → 2 → 3 → 4.

**Pick in viewer** keeps the draft in a compact panel. Click or tap individual
atoms; numbered markers identify visible targets. **Review targets** returns to
the retained fields. Ordinary molecular selection and its picking mode are
preserved. **Stop picking** ends acquisition. Removing a target leaves its numbered
slot empty; choose that slot to correct it. Changing kind starts an empty draft.

**Use selection** imports exactly the required number of distinct atoms. Angles
and torsions use an established pick order or ask you to confirm numbered targets.
The atom chooser also includes hidden and locked structures. Hidden targets can
have valid numerical geometry while their native drawing is absent.

Enter a name and press **Save measurement**. Save creates an undoable project
record. A failed Save retains the name and targets for review and retry. Closing
while a Save is finishing leaves the server operation running; check **Saved
measurements** for its result. A response belonging to an earlier visit cannot
clear a newer draft or announce success for superseded state.

Expand **Saved measurements** to inspect, rename, show/hide, select participants,
focus, or delete a record. The list pages through 50 summaries at a time and opens
one record's controls. Records survive reload and project archives. Live project
Undo/Redo retains commands; portable archives retain their established current-state
snapshot contract. Invalid references remain recoverable records, with unavailable
geometry explained. Coordinate, model, placement and minimization previews pause
measurements; current committed geometry returns after preview ends.

Expand **Close contacts**, choose a structure and set the cutoff. The initial
choice follows a deliberately inspected structure when valid. **Find contacts**
returns sorted nonbonded pairs in that structure, with a default 2 Å cutoff and
0.5 Å minimum. Selecting a result selects its current participants. Changing inputs,
closing the disclosure, switching projects or entering a preview retires its request
and result actions. Capacity failure reports the complete search as unavailable.

Geometry uses the current complete finite Cartesian coordinates. The tool does
not align separate structures or apply periodic images. Contact proximity is a
geometric screen. Conflicting stored coordinate frames are unavailable with a
reason; no frame is silently substituted. See [scientific limits](SCIENTIFIC_LIMITATIONS.md#measurements-and-close-contacts)
and the [API contract](API.md#measurements-and-close-contacts).
