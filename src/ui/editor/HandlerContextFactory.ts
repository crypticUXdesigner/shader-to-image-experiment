/**
 * HandlerContextFactory - Builds HandlerContext from canvas/source.
 * Extracted from NodeEditorCanvas to reduce its size.
 */

import type { HandlerContext } from '../interactions/HandlerContext';
import { HandlerContextBuilder, type HandlerContextDependencies } from './canvas/HandlerContextBuilder';
import type { NodeInstance } from '../../data-model/types';

/**
 * Source shape for building handler context (NodeEditorCanvas passes itself).
 */
export interface HandlerContextSource {
  getViewStateInternal(): { zoom: number; panX: number; panY: number };
  getSelectionState(): { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> };
  readonly graph: import('../../data-model/types').NodeGraph;
  readonly nodeSpecs: Map<string, import('../../types/nodeSpec').NodeSpec>;
  readonly viewStateManager: HandlerContextDependencies['viewStateManager'];
  readonly selectionManager: HandlerContextDependencies['selectionManager'];
  readonly hitTestManager: HandlerContextDependencies['hitTestManager'];
  readonly connectionStateManager: HandlerContextDependencies['connectionStateManager'];
  screenToCanvas(screenX: number, screenY: number): { x: number; y: number };
  canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number };
  readonly canvas: HTMLCanvasElement;
  readonly nodeMetrics: Map<string, import('./NodeRenderer').NodeRenderMetrics>;
  readonly nodeRenderer: { invalidateMetrics: (nodeId: string) => void; calculateMetrics: (node: NodeInstance, spec: import('../../types/nodeSpec').NodeSpec) => import('./NodeRenderer').NodeRenderMetrics };
  readonly renderState: HandlerContextDependencies['renderState'];
  requestRender(): void;
  render(): void;
  setDraggedNodeIds(nodeIds: string[]): void;
  setPanStateInternal(state: {
    isPanning: boolean;
    potentialBackgroundPan: boolean;
    panStartX: number;
    panStartY: number;
    backgroundDragStartX: number;
    backgroundDragStartY: number;
  }): void;
  setSelectionRectangleInternal(rect: { x: number; y: number; width: number; height: number } | null): void;
  readonly onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  readonly onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
  readonly onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
  /** When set, used at invoke time so handlers see the current callback (callbacks are set after context is built). */
  getOnConnectionCreated?: () => HandlerContextSource['onConnectionCreated'];
  readonly onConnectionSelected?: (connectionId: string | null, multiSelect: boolean) => void;
  readonly onParameterChanged?: (
    nodeId: string,
    paramName: string,
    value: import('../../data-model/types').ParameterValue,
    options?: import('../../data-model/types').GraphUndoRecordingOptions
  ) => void;
  readonly onParameterGestureCommit?: () => void;
  readonly onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../types/nodeSpec').ParameterInputMode) => void;
  readonly isSpacePressed: boolean;
  getActiveTool(): import('../../types/editor').ToolType;
}

export function createHandlerContext(source: HandlerContextSource): HandlerContext {
  const deps: HandlerContextDependencies = {
    getViewStateInternal: () => source.getViewStateInternal(),
    getSelectionState: () => source.getSelectionState(),
    graph: source.graph,
    getGraph: () => source.graph,
    nodeSpecs: source.nodeSpecs,
    viewStateManager: source.viewStateManager,
    selectionManager: source.selectionManager,
    hitTestManager: source.hitTestManager,
    connectionStateManager: source.connectionStateManager,
    screenToCanvas: (sx, sy) => source.screenToCanvas(sx, sy),
    canvasToScreen: (cx, cy) => source.canvasToScreen(cx, cy),
    requestRender: () => source.requestRender(),
    render: () => source.render(),
    canvas: source.canvas,
    nodeMetrics: source.nodeMetrics,
    nodeRenderer: source.nodeRenderer,
    getNodeMetricsOrCalculate: (nodeId) => {
      const cached = source.nodeMetrics.get(nodeId);
      if (cached) return cached;
      const node = source.graph.nodes.find((n) => n.id === nodeId);
      if (!node) return undefined;
      const spec = source.nodeSpecs.get(node.type);
      if (!spec) return undefined;
      return source.nodeRenderer.calculateMetrics(node, spec);
    },
    renderState: source.renderState,
    setDraggedNodeIds: (ids) => source.setDraggedNodeIds(ids),
    setPanStateInternal: (s) => source.setPanStateInternal(s),
    setSelectionRectangleInternal: (r) => source.setSelectionRectangleInternal(r),
    onNodeMoved: source.onNodeMoved,
    onNodeSelected: source.onNodeSelected,
    getOnNodeSelected: () => source.onNodeSelected,
    onConnectionCreated: source.onConnectionCreated,
    getOnConnectionCreated: source.getOnConnectionCreated ?? (() => source.onConnectionCreated),
    onConnectionSelected: source.onConnectionSelected,
    onParameterChanged: source.onParameterChanged,
    getOnParameterChanged: () => source.onParameterChanged,
    onParameterGestureCommit: source.onParameterGestureCommit,
    getOnParameterGestureCommit: () => source.onParameterGestureCommit,
    onParameterInputModeChanged: source.onParameterInputModeChanged,
    getOnParameterInputModeChanged: () => source.onParameterInputModeChanged,
    isSpacePressed: source.isSpacePressed,
    getActiveTool: () => source.getActiveTool()
  };
  return new HandlerContextBuilder(deps).build();
}
