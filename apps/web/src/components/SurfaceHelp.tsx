export function SurfaceHelp() {
  return <div className="surface-explanation">
    <p>Selected atoms captures a fragment independently. Cut boundaries can create artificial faces.</p>
    <p>Around selection crops the complete protein molecular surface near captured seed atoms. Radius measures
      triangle-centroid distance to seed centers. Cut edges stay open; disconnected or empty patches are possible.</p>
    <p>Protein context includes supplied protein hydrogens even when atom detail is hidden.
      Other ligands, waters, ions and cofactors are excluded. Hidden seeds still supply coordinates.
      No alignment, preparation, cavity detection, scoring or binding significance is inferred.</p>
    <p>Each surface belongs to its named entry. Hide keeps its definition; Remove is undoable.
      Object selection leaves molecular atom selection and the camera unchanged.</p>
  </div>;
}
