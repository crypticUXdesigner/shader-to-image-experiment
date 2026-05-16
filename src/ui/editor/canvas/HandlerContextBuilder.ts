/**
 * Handler Context Builder
 * 
 * Provides a fluent API for constructing HandlerContext objects.
 * This simplifies the creation of handler contexts and reduces boilerplate code.
 */

import type { HandlerContext } from '../../interactions/HandlerContext';
import type { CanvasState } from '../NodeEditorCanvas';
import type { NodeGraph } from '../../../data-model/types';
import type { NodeSpec } from '../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../NodeRenderer';
import { RenderLayer } from '../rendering/RenderState';
import type { ToolType } from '../../../types/editor';

/**
 * Dependencies needed to build a HandlerContext.
 * These are passed from NodeEditorCanvas to the builder.
 */
export interface HandlerContextDependencies {
  // State access
  getViewStateInternal: () => { zoom: number; panX: number; panY: number };
  getSelectionState: () => { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> };
  graph: NodeGraph;
  /** When set, used so getGraph() always returns the current graph (e.g. after setGraph). */
  getGraph?: () => NodeGraph;
  nodeSpecs: Map<string, NodeSpec>;
  
  // Managers
  viewStateManager: { setViewState: (state: { zoom: number; panX: number; panY: number }) => void };
  selectionManager: {
    getState: () => { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> };
    deselectNode: (nodeId: string) => void;
    selectNode: (nodeId: string, multiSelect: boolean) => void;
    selectNodes: (nodeIds: string[], clearFirst: boolean) => void;
    deselectConnection: (connectionId: string) => void;
    selectConnection: (connectionId: string, multiSelect: boolean) => void;
  };
  hitTestManager: {
    hitTestNode: (screenX: number, screenY: number) => string | null;
    hitTestPort: (screenX: number, screenY: number) => {
      nodeId: string;
      port: string;
      isOutput: boolean;
      parameter?: string;
    } | null;
    hitTestParameter: (screenX: number, screenY: number) => {
      nodeId: string;
      paramName: string;
      isString?: boolean;
    } | null;
    hitTestBezierControlPoint: (screenX: number, screenY: number) => {
      nodeId: string;
      paramNames: [string, string, string, string];
      controlIndex: number;
    } | null;
    hitTestConnection: (screenX: number, screenY: number) => string | null;
  };
  connectionStateManager: {
    setState: (state: Partial<{
      isConnecting: boolean;
      connectionStartNodeId: string | null;
      connectionStartPort: string | null;
      connectionStartParameter: string | null;
      connectionStartIsOutput: boolean;
      connectionMouseX: number;
      connectionMouseY: number;
      hoveredPort: {
        nodeId: string;
        port: string;
        isOutput: boolean;
        parameter?: string;
      } | null;
    }>) => void;
  };
  
  // Coordinate conversion
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  canvasToScreen: (canvasX: number, canvasY: number) => { x: number; y: number };
  
  // Rendering
  requestRender: () => void;
  render: () => void;
  
  // UI updates
  canvas: HTMLCanvasElement;
  
  // Node operations
  nodeMetrics: Map<string, NodeRenderMetrics>;
  nodeRenderer: { invalidateMetrics: (nodeId: string) => void };
  /** When provided, used for marquee selection when nodeMetrics has no cached value (e.g. off-screen nodes) */
  getNodeMetricsOrCalculate?: (nodeId: string) => NodeRenderMetrics | undefined;
  renderState: {
    markNodesDirty: (nodeIds: string[]) => void;
    markConnectionsDirty: (connectionIds: string[]) => void;
    markLayerDirty: (layer: RenderLayer) => void;
  };
  
  // State setters (these modify NodeEditorCanvas instance properties)
  setDraggedNodeIds: (nodeIds: string[]) => void;
  setPanStateInternal: (state: {
    isPanning: boolean;
    potentialBackgroundPan: boolean;
    panStartX: number;
    panStartY: number;
    backgroundDragStartX: number;
    backgroundDragStartY: number;
  }) => void;
  setSelectionRectangleInternal: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  
  // Callbacks (optional). Prefer getters when callbacks may be set after context creation.
  onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
  getOnNodeSelected?: () => HandlerContextDependencies['onNodeSelected'];
  onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
  getOnConnectionCreated?: () => HandlerContextDependencies['onConnectionCreated'];
  onConnectionSelected?: (connectionId: string | null, multiSelect: boolean) => void;
  onParameterChanged?: (nodeId: string, paramName: string, value: import('../../../data-model/types').ParameterValue, options?: import('../../../data-model/types').GraphUndoRecordingOptions) => void;
  getOnParameterChanged?: () => HandlerContextDependencies['onParameterChanged'];
  onParameterGestureCommit?: () => void;
  getOnParameterGestureCommit?: () => HandlerContextDependencies['onParameterGestureCommit'];
  onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../../types/nodeSpec').ParameterInputMode) => void;
  getOnParameterInputModeChanged?: () => HandlerContextDependencies['onParameterInputModeChanged'];
  
  // Keyboard state
  isSpacePressed: boolean;
  
  // Tool state - use getter function to always get current value
  getActiveTool: () => ToolType;
}

/**
 * Builder for creating HandlerContext instances.
 * Provides a fluent API for setting context properties.
 */
export class HandlerContextBuilder {
  private deps: HandlerContextDependencies;

  constructor(dependencies: HandlerContextDependencies) {
    this.deps = dependencies;
  }

  /**
   * Builds and returns a complete HandlerContext instance.
   */
  build(): HandlerContext {
    return {
      getState: () => {
        const viewState = this.deps.getViewStateInternal();
        const selection = this.deps.getSelectionState();
        return {
          zoom: viewState.zoom,
          panX: viewState.panX,
          panY: viewState.panY,
          selectedNodeIds: new Set(selection.selectedNodeIds),
          selectedConnectionIds: new Set(selection.selectedConnectionIds)
        };
      },
      setState: (updater) => {
        const viewState = this.deps.getViewStateInternal();
        const selection = this.deps.getSelectionState();
        const currentState: CanvasState = {
          zoom: viewState.zoom,
          panX: viewState.panX,
          panY: viewState.panY,
          selectedNodeIds: new Set(selection.selectedNodeIds),
          selectedConnectionIds: new Set(selection.selectedConnectionIds)
        };
        const newState = updater(currentState);
        this.deps.viewStateManager.setViewState({
          zoom: newState.zoom,
          panX: newState.panX,
          panY: newState.panY
        });
        // Update selection - use bulk replace for nodes to ensure correct multi-selection
        this.deps.selectionManager.selectNodes(Array.from(newState.selectedNodeIds), true);
        // selectNodes with clearFirst clears connections too, so re-add desired connections
        for (const connId of newState.selectedConnectionIds) {
          this.deps.selectionManager.selectConnection(connId, true);
        }
        this.deps.getViewStateInternal(); // Sync to state
        this.deps.getSelectionState(); // Sync to state
      },
      getGraph: () => (this.deps.getGraph != null ? this.deps.getGraph!() : this.deps.graph),
      getNodeSpecs: () => this.deps.nodeSpecs,
      screenToCanvas: (screenX, screenY) => this.deps.screenToCanvas(screenX, screenY),
      canvasToScreen: (canvasX, canvasY) => this.deps.canvasToScreen(canvasX, canvasY),
      requestRender: () => this.deps.requestRender(),
      render: () => this.deps.render(),
      setCursor: (cursor) => { this.deps.canvas.style.cursor = cursor; },
      onNodeMoved: this.deps.onNodeMoved,
      onNodeSelected: (nodeId, multiSelect) => {
        const fn = this.deps.getOnNodeSelected?.() ?? this.deps.onNodeSelected;
        fn?.(nodeId, multiSelect);
      },
      onConnectionCreated: (...args) => {
        const fn = this.deps.getOnConnectionCreated?.() ?? this.deps.onConnectionCreated;
        if (fn) fn(...args);
      },
      onParameterChanged: (nodeId, paramName, value, options) => {
        const fn = this.deps.getOnParameterChanged?.() ?? this.deps.onParameterChanged;
        if (fn) fn(nodeId, paramName, value, options);
      },
      onParameterGestureCommit: () => {
        const fn = this.deps.getOnParameterGestureCommit?.() ?? this.deps.onParameterGestureCommit;
        fn?.();
      },
      onParameterInputModeChanged: (nodeId, paramName, mode) => {
        const fn = this.deps.getOnParameterInputModeChanged?.() ?? this.deps.onParameterInputModeChanged;
        if (fn) fn(nodeId, paramName, mode);
      },
      isSpacePressed: () => this.deps.isSpacePressed,
      hitTestNode: (screenX, screenY) => this.deps.hitTestManager.hitTestNode(screenX, screenY),
      getNodeMetrics: (nodeId) => {
        const cached = this.deps.nodeMetrics.get(nodeId);
        if (cached) return cached;
        return this.deps.getNodeMetricsOrCalculate?.(nodeId);
      },
      invalidateNodeMetrics: (nodeId) => {
        this.deps.nodeMetrics.delete(nodeId);
        this.deps.nodeRenderer.invalidateMetrics(nodeId);
      },
      setDraggedNodeIds: (nodeIds: string[]) => {
        this.deps.setDraggedNodeIds(nodeIds);
      },
      markNodesDirty: (nodeIds) => {
        this.deps.renderState.markNodesDirty(nodeIds);
      },
      markConnectionsDirty: (connectionIds) => {
        this.deps.renderState.markConnectionsDirty(connectionIds);
      },
      markLayerDirty: (layer) => {
        this.deps.renderState.markLayerDirty(layer);
      },
      hitTestPort: (screenX, screenY) => this.deps.hitTestManager.hitTestPort(screenX, screenY),
      hitTestParameter: (screenX, screenY) => this.deps.hitTestManager.hitTestParameter(screenX, screenY),
      hitTestBezierControlPoint: (screenX, screenY) => this.deps.hitTestManager.hitTestBezierControlPoint(screenX, screenY),
      hitTestConnection: (screenX, screenY) => this.deps.hitTestManager.hitTestConnection(screenX, screenY),
      onConnectionSelected: this.deps.onConnectionSelected,
      setConnectionState: (state) => {
        this.deps.connectionStateManager.setState(state);
      },
      setPanState: (state) => {
        this.deps.setPanStateInternal(state);
      },
      getCanvasRect: () => this.deps.canvas.getBoundingClientRect(),
      getActiveTool: () => this.deps.getActiveTool(),
      setSelectionRectangle: (rect) => {
        this.deps.setSelectionRectangleInternal(rect);
        this.deps.renderState.markLayerDirty(RenderLayer.Overlays);
        this.deps.requestRender();
      }
    };
  }
}
