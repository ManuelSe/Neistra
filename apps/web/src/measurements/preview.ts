/** One conservative preview predicate for every measurement consumer. */
export function measurementPreviewPaused(state: {
  movement: boolean;
  coordinates: boolean;
  placement: boolean;
  minimization: boolean;
}): boolean {
  return state.movement || state.coordinates || state.placement || state.minimization;
}
