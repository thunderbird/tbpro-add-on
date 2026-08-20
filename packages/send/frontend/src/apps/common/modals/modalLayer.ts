/*
  vue-final-modal gives each modal an inline z-index of 1000 + 2*index and
  teleports it to <body>, so app CSS can't out-specify it and wrapping
  <ModalsContainer /> in a stacking context doesn't contain it either.

  Below the `md` breakpoint HomeView turns the info panel into a full-screen
  overlay at z-1001 and docks the upload bar at z-1000, both of which then won
  against the modal layer: opening a delete confirmation from the mobile info
  panel rendered it *behind* the opaque panel, so the delete button looked
  completely inert (#977 follow-up).

  Start the modal layer above those overlays instead, keeping vfm's 2*index
  offset so nested modals still stack in the right order.
*/
export const MODAL_BASE_Z_INDEX = 1100;

export function modalZIndex({ index }: { index: number }): number {
  return MODAL_BASE_Z_INDEX + 2 * index;
}
