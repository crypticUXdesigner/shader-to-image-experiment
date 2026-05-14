import type { NodeEditorCanvas } from '../../../ui/editor';

/**
 * Ordering contract: after `graphStore.updateNodeParameter`, push `canvas.setGraph` **before**
 * awaiting `onParameterChanged` (runtime sync), then refresh the canvas again afterward.
 * Otherwise DomNodeLayer can render with new parameters while `getNodeMetrics` still reflects
 * stale layout until runtime finishes.
 */
export async function syncCanvasAfterParameterStoreUpdateThenRuntime(options: {
  canvas: NodeEditorCanvas | null;
  getGraph: () => import('../../../data-model/types').NodeGraph;
  syncViewStateFromCanvas: (canvas: NodeEditorCanvas) => void;
  notifyRuntimeParameterChanged: () => void | Promise<unknown>;
  notifyGraphChanged: () => void;
}): Promise<void> {
  const { canvas, getGraph, syncViewStateFromCanvas, notifyRuntimeParameterChanged, notifyGraphChanged } =
    options;

  if (canvas) {
    syncViewStateFromCanvas(canvas);
    canvas.setGraph(getGraph());
  }

  const result = notifyRuntimeParameterChanged();
  if (result != null && typeof (result as Promise<unknown>).then === 'function') {
    await (result as Promise<unknown>);
  }

  if (canvas) {
    syncViewStateFromCanvas(canvas);
    canvas.setGraph(getGraph());
    canvas.requestRender();
  }
  notifyGraphChanged();
}
