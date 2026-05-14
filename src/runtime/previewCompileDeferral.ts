import type { CompilationResult } from './types';

/** True when the graph gained or lost at least one node (not connection-only). */
export function graphNodesAddedOrRemoved(changes: {
  addedNodes: readonly string[];
  removedNodes: readonly string[];
}): boolean {
  return changes.addedNodes.length > 0 || changes.removedNodes.length > 0;
}

/**
 * After a successful preview compile, show the toast and double-rAF deferral when nodes are
 * added or removed so the shell can paint before heavy compile work.
 */
export function shouldDeferPreviewCompileToast(
  previousResult: CompilationResult | null | undefined,
  changes: { addedNodes: readonly string[]; removedNodes: readonly string[] }
): boolean {
  return (
    previousResult != null &&
    graphNodesAddedOrRemoved(changes) &&
    typeof requestAnimationFrame === 'function'
  );
}
