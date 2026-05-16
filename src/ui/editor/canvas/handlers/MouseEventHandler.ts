/**
 * MouseEventHandler
 * 
 * Handles all mouse events for the node editor canvas.
 * Extracted from NodeEditorCanvas to improve separation of concerns.
 */

import type { HandlerContext } from '../../../interactions/HandlerContext';
import type { InteractionManager } from '../../../interactions/InteractionManager';
import { InteractionType } from '../../../interactions/InteractionTypes';
import type { InteractionEvent } from '../../../interactions/InteractionHandler';
import type { UIElementManager } from '../UIElementManager';
import type { HitTestManager } from '../HitTestManager';
import type { EdgeScrollManager } from '../EdgeScrollManager';
import type { SelectionManager } from '../SelectionManager';
import type { ViewStateManager } from '../ViewStateManager';
import type { NodeGraph } from '../../../../data-model/types';
import type { NodeSpec } from '../../../../types/nodeSpec';
import type { NodeRenderMetrics, NodeRenderer } from '../../NodeRenderer';
import type { ToolType } from '../../../../types/editor';
import type { RenderState } from '../../rendering/RenderState';
import type { ConnectionLayerRenderer } from '../../rendering/layers/ConnectionLayerRenderer';
import type { ParameterConnectionLayerRenderer } from '../../rendering/layers/ParameterConnectionLayerRenderer';
import type { InteractionEventTarget } from '../../../interactions/InteractionHandler';
import type { MouseEventMoveContext, MouseEventFullState } from './MouseEventHandlerTypes';
import { runMouseDownHandlers } from './MouseEventDownHandlers';
import {
  runInteractionUpdatesAndHover,
  applyPotentialPanAndNodeDragStart,
  applyPortHoverAndCursor,
  applyNodeDragPosition,
  applyParameterDrag,
  applyBezierDrag,
  applyConnectionHover
} from './MouseEventMoveHandlers';
import { completeConnectionOnMouseUp, endAllInteractionsAndClearGuides, resetInteractionState } from './MouseEventUpHandlers';
import { createStrictDoubleClickNoteHandler } from '../../../../lib/utils/strictDoubleClick';

export interface MouseEventHandlerDependencies {
  handlerContext: HandlerContext;
  interactionManager: InteractionManager | null;
  uiElementManager: UIElementManager;
  hitTestManager: HitTestManager;
  edgeScrollManager: EdgeScrollManager;
  selectionManager: SelectionManager;
  viewStateManager: ViewStateManager;
  graph: NodeGraph;
  /** When set, used so the handler always sees the current graph (avoids stale ref after setGraph). */
  getGraph?: () => NodeGraph;
  nodeSpecs: Map<string, NodeSpec>;
  nodeMetrics: Map<string, NodeRenderMetrics>;
  nodeRenderer: NodeRenderer;
  renderState: RenderState;
  connectionLayerRenderer: ConnectionLayerRenderer;
  parameterConnectionLayerRenderer: ParameterConnectionLayerRenderer;
  activeTool: ToolType;
  /** When set, used so the handler always sees the current tool (avoids stale value after setActiveTool). */
  getActiveTool?: () => ToolType;
  isSpacePressed: boolean;
  /** When set, used so the handler always sees the current spacebar state (avoids stale value). */
  getIsSpacePressed?: () => boolean;
  canvas: HTMLCanvasElement;
  
  // Callbacks
  onNodeDeleted?: (nodeId: string) => void;
  onTypeLabelClick?: (portType: string, screenX: number, screenY: number, typeLabelBounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => void;
  onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../../../types/nodeSpec').ParameterInputMode) => void;
  onParameterChanged?: (
    nodeId: string,
    paramName: string,
    value: import('../../../../data-model/types').ParameterValue,
    options?: import('../../../../data-model/types').GraphUndoRecordingOptions
  ) => void;
  onParameterGestureCommit?: () => void;
  onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
  /** When set, used at invoke time so the current callback is used (callbacks are set after handler is built). */
  getOnConnectionCreated?: () => MouseEventHandlerDependencies['onConnectionCreated'];
  onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
  /** Empty-canvas add flow: show picker anchored at screen position. */
  onRequestAddNodeAtCanvas?: (screenX: number, screenY: number) => void;
  
  // Methods
  attachDocumentListeners: () => void;
  detachDocumentListeners: () => void;
  createInteractionEvent: (type: InteractionType, e: MouseEvent | WheelEvent, target?: InteractionEventTarget) => InteractionEvent;
  handleFileParameterClick: (nodeId: string, paramName: string, screenX: number, screenY: number) => void;
  handleEnumParameterClick: (nodeId: string, paramName: string, screenX: number, screenY: number) => void;
  handleColorPickerClick?: (nodeId: string, screenX: number, screenY: number) => void;
  handleSignalPickerClick?: (screenX: number, screenY: number, targetNodeId: string, targetParameter: string) => void;
  getViewStateInternal: () => { panX: number; panY: number; zoom: number };
  getSelectionState: () => { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> };
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  
  // Connection state getters/setters (via HandlerContext)
  getConnectionState: () => {
    isConnecting: boolean;
    connectionStartNodeId: string | null;
    connectionStartPort: string | null;
    connectionStartParameter: string | null;
    connectionStartIsOutput: boolean;
    connectionMouseX: number;
    connectionMouseY: number;
    hoveredPort: { nodeId: string; port: string; isOutput: boolean; parameter?: string } | null;
  };
  setConnectionState: (state: Partial<{
    isConnecting: boolean;
    connectionStartNodeId: string | null;
    connectionStartPort: string | null;
    connectionStartParameter: string | null;
    connectionStartIsOutput: boolean;
    connectionMouseX: number;
    connectionMouseY: number;
    hoveredPort: { nodeId: string; port: string; isOutput: boolean; parameter?: string } | null;
  }>) => void;
  
  // Pan state getters/setters
  getPanState: () => {
    isPanning: boolean;
    potentialBackgroundPan: boolean;
    panStartX: number;
    panStartY: number;
    backgroundDragStartX: number;
    backgroundDragStartY: number;
  };
  setPanState: (state: Partial<{
    isPanning: boolean;
    potentialBackgroundPan: boolean;
    panStartX: number;
    panStartY: number;
    backgroundDragStartX: number;
    backgroundDragStartY: number;
  }>) => void;
  
  // Interaction state getters/setters (for syncing handler state with NodeEditorCanvas)
  getInteractionState: () => {
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
  setInteractionState: (state: Partial<{
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
  }>) => void;
  
  // Mouse position updater
  updateMousePosition: (x: number, y: number) => void;
}

export class MouseEventHandler {
  private deps: MouseEventHandlerDependencies;

  /** Pairs successive parameter mouse-ups for future overlay (replacing OS-timed `mouseup.detail`). */
  private readonly paramCandidateDoubleNotes = createStrictDoubleClickNoteHandler((evt: MouseEvent) => {
    const hit = this.deps.hitTestManager.hitTestParameter(evt.clientX, evt.clientY);
    if (!hit) return;
    // TODO: Implement text input overlay for parameter editing
  });
  
  /** Current graph (use getGraph when set so mode button and other ops see latest state after setGraph). */
  private get graph(): NodeGraph {
    return this.deps.getGraph?.() ?? this.deps.graph;
  }
  
  // Interaction state (managed locally, synced with NodeEditorCanvas)
  private backgroundDragThreshold: number = 5;
  private nodeDragThreshold: number = 5;
  private currentMouseX: number = 0;
  private currentMouseY: number = 0;
  
  // Helper methods to get/set state (delegates to NodeEditorCanvas)
  private getState() {
    return {
      pan: this.deps.getPanState(),
      interaction: this.deps.getInteractionState(),
      connection: this.deps.getConnectionState()
    };
  }
  
  private setState(updates: {
    pan?: Partial<{
      isPanning: boolean;
      potentialBackgroundPan: boolean;
      panStartX: number;
      panStartY: number;
      backgroundDragStartX: number;
      backgroundDragStartY: number;
    }>;
    interaction?: Partial<{
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
    }>;
    connection?: Partial<{
      isConnecting: boolean;
      connectionStartNodeId: string | null;
      connectionStartPort: string | null;
      connectionStartParameter: string | null;
      connectionStartIsOutput: boolean;
      hoveredPort: { nodeId: string; port: string; isOutput: boolean; parameter?: string } | null;
      connectionMouseX: number;
      connectionMouseY: number;
    }>;
  }) {
    if (updates.pan) this.deps.setPanState(updates.pan);
    if (updates.interaction) this.deps.setInteractionState(updates.interaction);
    if (updates.connection) this.deps.setConnectionState(updates.connection);
  }
  
  constructor(dependencies: MouseEventHandlerDependencies) {
    this.deps = dependencies;
  }

  private getActiveTool(): ToolType {
    return this.deps.getActiveTool?.() ?? this.deps.activeTool;
  }

  /** Build context for delegated move/down/up handlers. */
  private getMoveContext(): MouseEventMoveContext {
    return {
      deps: this.deps,
      getState: () => this.getState() as MouseEventFullState,
      setState: (u) => this.setState(u),
      flushParameterChangeAndRender: (nodeId, paramName, value) => this.flushParameterChangeAndRender(nodeId, paramName, value)
    };
  }

      /**
       * Notify parameter change and then render. If the callback returns a Promise (e.g. async
       * runtime sync for audio-driven parameters), wait for it so the next paint sees the updated state.
       */
  private flushParameterChangeAndRender(
    nodeId: string,
    paramName: string,
    value: import('../../../../data-model/types').ParameterValue,
    recordUndo = true
  ): void {
    const opts = recordUndo ? undefined : ({ recordUndo: false } as const);
    const result = this.deps.onParameterChanged?.(nodeId, paramName, value, opts);
    if (result != null && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(() => this.deps.handlerContext.render());
    } else {
      this.deps.handlerContext.render();
    }
  }

  /**
   * Handle mouse down event
   */
  handleMouseDown(e: MouseEvent): void {
    if (runMouseDownHandlers(this.getMoveContext(), e)) return;
  }
  
  /**
   * Handle mouse move event
   */
  handleMouseMove(e: MouseEvent): void {
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // If dropdown is open, don't process other interactions
    if (this.deps.uiElementManager.isEnumDropdownVisible()) {
      return;
    }
    
    // Store current mouse position for edge scrolling (sync with NodeEditorCanvas)
    this.currentMouseX = mouseX;
    this.currentMouseY = mouseY;
    this.deps.updateMousePosition(mouseX, mouseY);
    
    if (runInteractionUpdatesAndHover(this.getMoveContext(), e, mouseX, mouseY, () => this.getActiveTool(), () => this.deps.getIsSpacePressed?.() ?? this.deps.isSpacePressed)) {
      return;
    }

    applyPotentialPanAndNodeDragStart(
      this.getMoveContext(),
      this.graph,
      mouseX,
      mouseY,
      this.backgroundDragThreshold,
      this.nodeDragThreshold
    );

    const currentState = this.getState();
    if (!currentState.pan.isPanning && !currentState.interaction.isDraggingNode && !currentState.connection.isConnecting && !currentState.interaction.isDraggingParameter && !currentState.interaction.isDraggingBezierControl && !currentState.pan.potentialBackgroundPan && !currentState.interaction.potentialNodeDrag) {
      applyPortHoverAndCursor(
        this.getMoveContext(),
        mouseX,
        mouseY,
        () => this.getActiveTool(),
        () => this.deps.getIsSpacePressed?.() ?? this.deps.isSpacePressed,
        e.altKey
      );
    }
    
    const currentStateForScroll = this.getState();
    const shouldEdgeScroll = (currentStateForScroll.interaction.isDraggingNode || currentStateForScroll.connection.isConnecting) && !currentStateForScroll.pan.isPanning;
    if (shouldEdgeScroll) {
      this.currentMouseX = mouseX;
      this.currentMouseY = mouseY;
      this.deps.updateMousePosition(mouseX, mouseY);
      this.deps.edgeScrollManager.updateVelocity(mouseX, mouseY);
      this.deps.edgeScrollManager.start();
    } else {
      this.deps.edgeScrollManager.stop();
    }
    
    const moveCtx = this.getMoveContext();
    const currentStateForDrag = this.getState() as MouseEventFullState;
    if (currentStateForDrag.interaction.isDraggingNode && currentStateForDrag.interaction.draggingNodeId && currentStateForDrag.interaction.draggingNodeInitialPos) {
      applyNodeDragPosition(moveCtx, this.graph, mouseX, mouseY);
    } else {
      const currentStateForParam = this.getState() as MouseEventFullState;
      if (currentStateForParam.interaction.isDraggingParameter && currentStateForParam.interaction.draggingParameterNodeId && currentStateForParam.interaction.draggingParameterName) {
        applyParameterDrag(moveCtx, currentStateForParam, e, mouseX, mouseY);
      } else {
        const currentStateForBezier = this.getState() as MouseEventFullState;
        if (currentStateForBezier.interaction.isDraggingBezierControl && currentStateForBezier.interaction.draggingBezierNodeId !== null && currentStateForBezier.interaction.draggingBezierControlIndex !== null) {
          applyBezierDrag(moveCtx, currentStateForBezier, mouseX, mouseY);
        } else {
          const currentStateForConn = this.getState() as MouseEventFullState;
          if (currentStateForConn.connection.isConnecting) {
            applyConnectionHover(moveCtx, currentStateForConn, mouseX, mouseY);
          }
        }
      }
    }
  }

  /**
   * Handle mouse up event
   */
  handleMouseUp(e: MouseEvent): void {
    const stateBefore = this.getState() as MouseEventFullState;
    const wasDraggingParameter = stateBefore.interaction.isDraggingParameter;
    const wasDraggingBezier = stateBefore.interaction.isDraggingBezierControl;
    this.deps.detachDocumentListeners();
    // Complete connection first while state.connection.isConnecting is still true (has hoveredPort / last position).
    completeConnectionOnMouseUp(this.getMoveContext(), e);
    endAllInteractionsAndClearGuides(this.deps, e);

    const finalState = this.getState();
    if (finalState.interaction.potentialNodeDrag && !finalState.interaction.isDraggingNode && finalState.interaction.potentialNodeDragId) {
      // Selection was already handled in mouseDown; no need to change selection here
    }
    if (!finalState.pan.isPanning && !finalState.interaction.isDraggingNode && !finalState.connection.isConnecting && !finalState.interaction.isDraggingParameter) {
      const paramHit = this.deps.hitTestManager.hitTestParameter(e.clientX, e.clientY);
      if (paramHit) this.paramCandidateDoubleNotes(e);
    }

    resetInteractionState(this.getMoveContext());
    if (wasDraggingParameter || wasDraggingBezier) {
      this.deps.onParameterGestureCommit?.();
    }
    const space = this.deps.getIsSpacePressed?.() ?? this.deps.isSpacePressed;
    const t = this.getActiveTool();
    if (space) {
      this.deps.canvas.style.cursor = 'grab';
    } else if (t === 'add') {
      this.deps.canvas.style.cursor = 'crosshair';
    } else {
      this.deps.canvas.style.cursor = 'default';
    }
  }
  
  /**
   * Handle mouse leave event
   */
  handleMouseLeave(): void {
    // Clear port hover when mouse leaves canvas
    const currentState = this.getState();
    if (currentState.connection.hoveredPort && !currentState.connection.isConnecting) {
      this.setState({ connection: { hoveredPort: null } });
      this.deps.handlerContext.render();
    }
  }
  
  /**
   * Get current mouse position
   */
  getCurrentMousePosition(): { x: number; y: number } {
    return { x: this.currentMouseX, y: this.currentMouseY };
  }
}
