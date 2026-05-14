/**
 * Drag rate multipliers shared with Knob: Shift = fine, Ctrl/Meta = coarse.
 * Used by ValueInput vertical drag; keep in sync with Knob pointer-move logic.
 */
export function pointerModifierDragMultiplier(
  e: Pick<PointerEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>
): number {
  if (e.shiftKey) return 0.1;
  if (e.ctrlKey || e.metaKey) return 10;
  return 1;
}
