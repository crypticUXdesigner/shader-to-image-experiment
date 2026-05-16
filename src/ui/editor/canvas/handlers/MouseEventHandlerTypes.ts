/**
 * Shared state and context types for MouseEventHandler and its handler modules.
 * Keeps the main handler's public API in MouseEventHandler.ts; these are for internal delegation.
 */

import type { MouseEventHandlerDependencies } from './MouseEventHandler';

export interface MouseEventFullState {
  pan: {
    isPanning: boolean;
    potentialBackgroundPan: boolean;
    panStartX: number;
    panStartY: number;
    backgroundDragStartX: number;
    backgroundDragStartY: number;
  };
  interaction: {
    isDraggingNode: boolean;
    draggingNodeId: string | null;
    draggingNodeInitialPos: { x: number; y: number } | null;
    selectedNodesInitialPositions: Map<string, { x: number; y: number }>;
    isDraggingParameter: boolean;
    draggingParameterNodeId: string | null;
    draggingParameterName: string | null;
    dragParamStartX: number;
    dragParamStartY: number;
    dragParamStartValue: number;
    draggingFrequencyBand: { bandIndex: number; field: 'start' | 'end' | 'sliderLow' | 'sliderHigh'; scale: 'linear' | 'audio' } | null;
    isDraggingBezierControl: boolean;
    draggingBezierNodeId: string | null;
    draggingBezierControlIndex: number | null;
    dragBezierStartValues: { x1: number; y1: number; x2: number; y2: number } | null;
    potentialNodeDrag: boolean;
    potentialNodeDragId: string | null;
    nodeDragStartX: number;
    nodeDragStartY: number;
    dragOffsetX: number;
    dragOffsetY: number;
  };
  connection: {
    isConnecting: boolean;
    connectionStartNodeId: string | null;
    connectionStartPort: string | null;
    connectionStartParameter: string | null;
    connectionStartIsOutput: boolean;
    connectionMouseX: number;
    connectionMouseY: number;
    hoveredPort: { nodeId: string; port: string; isOutput: boolean; parameter?: string } | null;
  };
}

export type MouseEventStateUpdates = {
  pan?: Partial<MouseEventFullState['pan']>;
  interaction?: Partial<MouseEventFullState['interaction']>;
  connection?: Partial<MouseEventFullState['connection']>;
};

/** Context passed to move/up handlers: deps + getState/setState + optional flush callback */
export interface MouseEventMoveContext {
  deps: MouseEventHandlerDependencies;
  getState: () => MouseEventFullState;
  setState: (u: MouseEventStateUpdates) => void;
  flushParameterChangeAndRender: (
    nodeId: string,
    paramName: string,
    value: import('../../../../data-model/types').ParameterValue,
    recordUndo?: boolean
  ) => void;
}

export interface MouseEventDownContext {
  deps: MouseEventHandlerDependencies;
  getState: () => MouseEventFullState;
  setState: (u: MouseEventStateUpdates) => void;
}
