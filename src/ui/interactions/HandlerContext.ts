/**
 * Handler Context
 * 
 * Provides access to canvas state and methods needed by interaction handlers.
 * This allows handlers to be decoupled from NodeEditorCanvas while still
 * having access to necessary functionality.
 */

import type { CanvasState } from '../editor/NodeEditorCanvas';
import type { NodeGraph } from '../../data-model/types';
import type { NodeSpec } from '../../types/nodeSpec';
import type { NodeRenderMetrics } from '../editor/NodeRenderer';
import { RenderLayer } from '../editor/rendering/RenderState';
import type { ToolType } from '../../types/editor';

export interface HandlerContext {
  // State access
  getState(): CanvasState;
  setState(updater: (state: CanvasState) => CanvasState): void;
  getGraph(): NodeGraph;
  getNodeSpecs(): Map<string, NodeSpec>;
  
  // Coordinate conversion
  screenToCanvas(screenX: number, screenY: number): { x: number; y: number };
  canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number };
  
  // Rendering
  requestRender(): void;
  render(): void;
  
  // UI updates
  setCursor(cursor: string): void;
  
  // Callbacks (optional - handlers can trigger these)
  onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
  onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
  onParameterChanged?: (
    nodeId: string,
    paramName: string,
    value: import('../../data-model/types').ParameterValue,
    options?: import('../../data-model/types').GraphUndoRecordingOptions
  ) => void;
  onParameterGestureCommit?: () => void;
  onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../types/nodeSpec').ParameterInputMode) => void;
  
  // Keyboard state
  isSpacePressed?(): boolean;
  
  // Node operations (for NodeDragHandler)
  hitTestNode?(screenX: number, screenY: number): string | null;
  getNodeMetrics?(nodeId: string): NodeRenderMetrics | undefined;
  invalidateNodeMetrics?(nodeId: string): void;
  setDraggedNodeIds?(nodeIds: string[]): void;
  markNodesDirty?(nodeIds: string[]): void;
  markConnectionsDirty?(connectionIds: string[]): void;
  markLayerDirty?(layer: RenderLayer): void;
  
  // Hit testing methods (for various handlers)
  hitTestPort?(screenX: number, screenY: number): {
    nodeId: string;
    port: string;
    isOutput: boolean;
    parameter?: string;
    snapPosition?: { x: number; y: number };
  } | null;
  hitTestParameter?(screenX: number, screenY: number): {
    nodeId: string;
    paramName: string;
    isString?: boolean;
    isModeButton?: boolean;
    frequencyBand?: { bandIndex: number; field: 'start' | 'end' | 'sliderLow' | 'sliderHigh' };
    scale?: 'linear' | 'audio';
  } | null;
  hitTestBezierControlPoint?(screenX: number, screenY: number): {
    nodeId: string;
    paramNames: [string, string, string, string];
    controlIndex: number;
  } | null;
  hitTestConnection?(screenX: number, screenY: number): string | null;
  
  // Connection selection callback
  onConnectionSelected?: (connectionId: string, multiSelect: boolean) => void;
  
  // Connection state management (for PortConnectHandler to update NodeEditorCanvas state)
  setConnectionState?: (state: Partial<{
    isConnecting: boolean;
    connectionStartNodeId: string | null;
    connectionStartPort: string | null;
    connectionStartParameter: string | null;
    connectionStartIsOutput: boolean;
    connectionStartSnapPosition?: { x: number; y: number };
    connectionMouseX: number;
    connectionMouseY: number;
    hoveredPort: {
      nodeId: string;
      port: string;
      isOutput: boolean;
      parameter?: string;
    } | null;
  }>) => void;
  
  // Pan state management (for CanvasPanHandler to update NodeEditorCanvas state)
  setPanState?: (state: {
    isPanning: boolean;
    potentialBackgroundPan: boolean;
    panStartX: number;
    panStartY: number;
    backgroundDragStartX: number;
    backgroundDragStartY: number;
  }) => void;
  
  // Canvas dimensions (for edge scrolling)
  getCanvasRect?: () => DOMRect;
  
  // Active tool (for tool-specific handlers)
  getActiveTool?(): ToolType;
  
  // Selection rectangle state (for SelectionToolHandler)
  setSelectionRectangle?: (rect: { x: number; y: number; width: number; height: number } | null) => void;
}
