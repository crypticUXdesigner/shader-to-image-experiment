// Node Editor Canvas Component
// Implements infinite canvas with pan/zoom, grid, and node/connection rendering

import type { NodeGraph, NodeInstance } from '../../types/nodeGraph';
import type { NodeSpec } from '../../types/nodeSpec';
import { NodeRenderer, type NodeRenderMetrics } from './NodeRenderer';
import { getCSSColor } from '../../utils/cssTokens';
import type { IAudioManager } from '../../runtime/types';
import { RenderState } from './rendering/RenderState';
// Feature flags removed - all refactored features are now always enabled
import { GraphChangeDetector } from '../../utils/changeDetection/GraphChangeDetector';
import { NodeComponent } from './node/NodeComponent';
import { LayerManager } from './rendering/LayerManager';
import {
  GridLayerRenderer,
  ConnectionLayerRenderer,
  ParameterConnectionLayerRenderer,
  NodeLayerRenderer,
  PortLayerRenderer,
  OverlayLayerRenderer
} from './rendering/layers';
import type { HandlerContext } from '../interactions/HandlerContext';
import { InteractionManager } from '../interactions/InteractionManager';
import { InteractionType } from '../interactions/InteractionTypes';
import type { InteractionEvent } from '../interactions/InteractionHandler';
import {
  CanvasPanHandler,
  CanvasZoomHandler,
  NodeDragHandler,
  PortConnectHandler,
  ParameterDragHandler,
  BezierControlDragHandler,
  ConnectionSelectHandler,
  HandToolHandler,
  SelectionToolHandler
} from '../interactions/handlers';
import type { ToolType } from './BottomBar';
import {
  ViewStateManager,
  SelectionManager,
  SmartGuidesManager,
  EdgeScrollManager,
  KeyboardShortcutHandler,
  UIElementManager,
  HitTestManager,
  ConnectionStateManager,
  OverlayManager,
  MetricsManager
} from './canvas';
import { RenderingOrchestrator } from './canvas/RenderingOrchestrator';
import { HandlerContextBuilder } from './canvas/HandlerContextBuilder';
import { MouseEventHandler, WheelEventHandler } from './canvas/handlers';

export interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  selectedNodeIds: Set<string>;
  selectedConnectionIds: Set<string>;
}

export interface CanvasViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class NodeEditorCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private graph: NodeGraph;
  private state: CanvasState;
  private nodeSpecs: Map<string, NodeSpec> = new Map();
  private nodeRenderer: NodeRenderer;
  private nodeMetrics: Map<string, NodeRenderMetrics> = new Map();
  private nodeComponents: Map<string, NodeComponent> = new Map(); // Phase 2.2: Component system
  private renderState: RenderState;
  private layerManager: LayerManager | null = null; // Phase 2.3: Layer system
  private connectionLayerRenderer: ConnectionLayerRenderer | null = null; // Phase 3.3: For cache invalidation
  private parameterConnectionLayerRenderer: ParameterConnectionLayerRenderer | null = null; // Phase 3.3: For cache invalidation
  private interactionManager: InteractionManager | null = null; // Phase 2.4: Interaction handler system
  // Rendering state is now managed by RenderingOrchestrator
  
  // Resize handling - throttle to animation frame for smooth updates
  private pendingResize: boolean = false;
  private cachedViewportWidth: number = 0;
  private cachedViewportHeight: number = 0;
  private resizeTimeout: number | null = null;
  
  // Interaction state
  private isPanning: boolean = false;
  private _panStartX: number = 0;
  private _panStartY: number = 0;
  private isDraggingNode: boolean = false;
  private draggingNodeId: string | null = null;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private draggingNodeInitialPos: { x: number; y: number } | null = null;
  private selectedNodesInitialPositions: Map<string, { x: number; y: number }> = new Map();
  // Connection state is now managed by ConnectionStateManager
  // Spacebar state is now managed by KeyboardShortcutHandler
  private isSpacePressed: boolean = false; // Synced from KeyboardShortcutHandler
  private isDraggingParameter: boolean = false;
  private draggingParameterNodeId: string | null = null;
  private draggingParameterName: string | null = null;
  private dragParamStartX: number = 0;
  private dragParamStartY: number = 0; // Screen-space Y position
  private dragParamStartValue: number = 0;
  private draggingFrequencyBand: {
    bandIndex: number;
    field: 'start' | 'end' | 'sliderLow' | 'sliderHigh';
    scale: 'linear' | 'audio';
  } | null = null;
  private isDraggingBezierControl: boolean = false;
  private draggingBezierNodeId: string | null = null;
  private draggingBezierControlIndex: number | null = null; // 0 for cp1 (x1,y1), 1 for cp2 (x2,y2)
  private dragBezierStartValues: { x1: number; y1: number; x2: number; y2: number } | null = null;
  // UI elements are now managed by UIElementManager
  private backgroundDragStartX: number = 0;
  private backgroundDragStartY: number = 0;
  private potentialBackgroundPan: boolean = false;
  private nodeDragStartX: number = 0;
  private nodeDragStartY: number = 0;
  private potentialNodeDrag: boolean = false;
  private potentialNodeDragId: string | null = null;
  
  // Smart guides state is now managed by SmartGuidesManager
  private currentSmartGuides: { vertical: Array<{ x: number; startY: number; endY: number }>; horizontal: Array<{ y: number; startX: number; endX: number }> } = { vertical: [], horizontal: [] };
  
  // Phase 3.4: Track dragged nodes for metrics recalculation before connection rendering
  private draggedNodeIds: Set<string> = new Set();
  
  // Edge scrolling state is now managed by EdgeScrollManager
  private currentMouseX: number = 0;
  private currentMouseY: number = 0;
  
  // Tool state
  private activeTool: ToolType = 'cursor';
  private selectionRectangle: { x: number; y: number; width: number; height: number } | null = null;
  
  // Callbacks
  private onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  private onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
  private onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
  private onConnectionSelected?: (connectionId: string | null, multiSelect: boolean) => void;
  private onNodeDeleted?: (nodeId: string) => void;
  private onConnectionDeleted?: (connectionId: string) => void;
  private onParameterChanged?: (nodeId: string, paramName: string, value: number | number[][]) => void;
  private onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
  private onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../types/nodeSpec').ParameterInputMode) => void;
  private onNodeLabelChanged?: (nodeId: string, label: string | undefined) => void;
  private onSpacebarStateChange?: (isPressed: boolean) => void;
  private isDialogVisible?: () => boolean;
  private onTypeLabelClick?: (portType: string, screenX: number, screenY: number, typeLabelBounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => void;
  private audioManager?: IAudioManager;
  private effectiveValueUpdateInterval: number | null = null;
  
  // Extracted managers
  private viewStateManager: ViewStateManager;
  private selectionManager: SelectionManager;
  private smartGuidesManager: SmartGuidesManager;
  private edgeScrollManager: EdgeScrollManager;
  private keyboardShortcutHandler: KeyboardShortcutHandler;
  private uiElementManager: UIElementManager;
  private hitTestManager: HitTestManager;
  private overlayManager: OverlayManager;
  private connectionStateManager: ConnectionStateManager;
  private metricsManager: MetricsManager;
  private renderingOrchestrator: RenderingOrchestrator;
  
  // Event handlers
  private mouseEventHandler!: MouseEventHandler;
  private wheelEventHandler!: WheelEventHandler;
  
  constructor(canvas: HTMLCanvasElement, graph: NodeGraph, nodeSpecs: NodeSpec[] = [], audioManager?: IAudioManager) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;
    this.graph = graph;
    this.nodeRenderer = new NodeRenderer(ctx);
    
    // Initialize render state for dirty tracking
    this.renderState = new RenderState(graph);
    
    // Store node specs
    for (const spec of nodeSpecs) {
      this.nodeSpecs.set(spec.id, spec);
    }
    
    // Store audio manager reference
    this.audioManager = audioManager;
    
    // Initialize state from graph viewState or defaults
    this.state = {
      zoom: graph.viewState?.zoom ?? 1.0,
      panX: graph.viewState?.panX ?? 0,
      panY: graph.viewState?.panY ?? 0,
      selectedNodeIds: new Set(graph.viewState?.selectedNodeIds ?? []),
      selectedConnectionIds: new Set()
    };
    
    // Initialize extracted managers
    const initialViewState = {
      zoom: this.state.zoom,
      panX: this.state.panX,
      panY: this.state.panY
    };
    this.viewStateManager = new ViewStateManager(initialViewState);
    this.selectionManager = new SelectionManager(graph.viewState?.selectedNodeIds);
    this.smartGuidesManager = new SmartGuidesManager();
    this.edgeScrollManager = new EdgeScrollManager();
    this.keyboardShortcutHandler = new KeyboardShortcutHandler();
    this.uiElementManager = new UIElementManager();
    
    // Initialize hit test manager
    this.hitTestManager = new HitTestManager({
      graph: this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      screenToCanvas: (screenX, screenY) => this.screenToCanvas(screenX, screenY),
      getViewState: () => this.getViewStateInternal(),
      getSelectionState: () => this.getSelectionState(),
      ctx: this.ctx,
      canvas: this.canvas,
      viewStateManager: this.viewStateManager
    });
    
    // Initialize connection state manager
    this.connectionStateManager = new ConnectionStateManager({
      graph: this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      screenToCanvas: (screenX, screenY) => this.screenToCanvas(screenX, screenY),
      ctx: this.ctx,
      hitTestPort: (screenX, screenY) => this.hitTestManager.hitTestPort(screenX, screenY)
    });
    
    // Initialize metrics manager
    this.metricsManager = new MetricsManager({
      graph: this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeRenderer: this.nodeRenderer,
      nodeComponents: this.nodeComponents,
      nodeMetrics: this.nodeMetrics,
      hitTestManager: this.hitTestManager,
      connectionStateManager: this.connectionStateManager
    });
    
    // Initialize layer system (needed by RenderingOrchestrator)
    this.setupLayerSystem();
    
    // Initialize rendering orchestrator (overlayManager needs it)
    this.renderingOrchestrator = new RenderingOrchestrator({
      canvas: this.canvas,
      ctx: this.ctx,
      graph: this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      nodeComponents: this.nodeComponents,
      nodeRenderer: this.nodeRenderer,
      layerManager: this.layerManager!,
      renderState: this.renderState,
      viewStateManager: this.viewStateManager,
      connectionStateManager: this.connectionStateManager,
      audioManager: this.audioManager,
      getViewStateInternal: () => this.getViewStateInternal(),
      getSelectionState: () => this.getSelectionState(),
      getCachedViewportDimensions: () => ({
        width: this.cachedViewportWidth,
        height: this.cachedViewportHeight
      }),
      renderSmartGuides: () => this.renderSmartGuides(),
      renderSelectionRectangle: () => this.renderSelectionRectangle(),
      getCurrentSmartGuides: () => this.currentSmartGuides,
      getIsDraggingNode: () => this.isDraggingNode,
      getDraggingNodeId: () => this.draggingNodeId,
      getSelectionRectangle: () => this.selectionRectangle,
      processPendingResize: () => {
        if (this.pendingResize) {
          this.resize();
        }
      }
    });
    
    // Start periodic updates for effective parameter values (after orchestrator exists)
    this.startEffectiveValueUpdates();
    
    // Initialize overlay manager (after renderingOrchestrator since it references it)
    this.overlayManager = new OverlayManager({
      uiElementManager: this.uiElementManager,
      hitTestManager: this.hitTestManager,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      graph: this.graph,
      nodeRenderer: this.nodeRenderer,
      ctx: this.ctx,
      canvasToScreen: (canvasX, canvasY) => this.canvasToScreen(canvasX, canvasY),
      onParameterChanged: this.onParameterChanged,
      onNodeLabelChanged: this.onNodeLabelChanged,
      onFileParameterChanged: this.onFileParameterChanged,
      updateNodeMetrics: () => this.metricsManager.updateNodeMetrics(),
      render: () => this.renderingOrchestrator.render()
    });
    
    // Setup manager contexts
    this.setupManagerContexts();
    
    // Initialize refactored systems
    this.setupInteractionHandlers();
    
    // Calculate node metrics
    this.metricsManager.updateNodeMetrics();
    
    // Initialize event handlers
    this.initializeEventHandlers();
    
    this.setupEventListeners();
    this.resize();
    
    // Fit to view on initial load if no viewState exists or it's using default values
    const hasCustomViewState = graph.viewState && (
      (graph.viewState.zoom !== undefined && graph.viewState.zoom !== 1.0) ||
      (graph.viewState.panX !== undefined && graph.viewState.panX !== 0) ||
      (graph.viewState.panY !== undefined && graph.viewState.panY !== 0)
    );
    if (!hasCustomViewState && graph.nodes.length > 0) {
      // Use requestAnimationFrame to ensure canvas is sized
      requestAnimationFrame(() => {
        this.fitToView();
      });
    } else {
        this.renderingOrchestrator.markFullRedraw();
    }
  }
  
  
  /**
   * Get current view state (helper to sync with managers)
   * Internal method - use public getViewState() for external access
   */
  private getViewStateInternal(): { panX: number; panY: number; zoom: number } {
    const viewState = this.viewStateManager.getState();
    // Sync to state for backward compatibility
    this.state.panX = viewState.panX;
    this.state.panY = viewState.panY;
    this.state.zoom = viewState.zoom;
    return viewState;
  }
  
  /**
   * Get current selection state (helper to sync with managers)
   */
  private getSelectionState(): { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> } {
    const selection = this.selectionManager.getState();
    // Sync to state for backward compatibility
    this.state.selectedNodeIds = selection.selectedNodeIds;
    this.state.selectedConnectionIds = selection.selectedConnectionIds;
    return selection;
  }
  
  /**
   * Get current connection state (for event handlers)
   */
  private getConnectionState(): {
    isConnecting: boolean;
    connectionStartNodeId: string | null;
    connectionStartPort: string | null;
    connectionStartParameter: string | null;
    connectionStartIsOutput: boolean;
    connectionMouseX: number;
    connectionMouseY: number;
    hoveredPort: { nodeId: string; port: string; isOutput: boolean; parameter?: string } | null;
  } {
    const state = this.connectionStateManager.getState();
    return {
      isConnecting: state.isConnecting,
      connectionStartNodeId: state.connectionStartNodeId,
      connectionStartPort: state.connectionStartPort,
      connectionStartParameter: state.connectionStartParameter,
      connectionStartIsOutput: state.connectionStartIsOutput,
      connectionMouseX: state.connectionMouseX,
      connectionMouseY: state.connectionMouseY,
      hoveredPort: state.hoveredPort
    };
  }
  
  /**
   * Set connection state (for event handlers)
   * Now delegates to ConnectionStateManager
   */
  private setConnectionState(state: Partial<{
    isConnecting: boolean;
    connectionStartNodeId: string | null;
    connectionStartPort: string | null;
    connectionStartParameter: string | null;
    connectionStartIsOutput: boolean;
    hoveredPort: { nodeId: string; port: string; isOutput: boolean; parameter?: string } | null;
    connectionMouseX: number;
    connectionMouseY: number;
  }>): void {
    this.connectionStateManager.setState(state);
  }
  
  /**
   * Get current pan state (for event handlers)
   */
  private getPanState(): {
    isPanning: boolean;
    potentialBackgroundPan: boolean;
    panStartX: number;
    panStartY: number;
    backgroundDragStartX: number;
    backgroundDragStartY: number;
  } {
    return {
      isPanning: this.isPanning,
      potentialBackgroundPan: this.potentialBackgroundPan,
      panStartX: this._panStartX,
      panStartY: this._panStartY,
      backgroundDragStartX: this.backgroundDragStartX,
      backgroundDragStartY: this.backgroundDragStartY
    };
  }
  
  /**
   * Set pan state (for event handlers)
   */
  private setPanState(state: Partial<{
    isPanning: boolean;
    potentialBackgroundPan: boolean;
    panStartX: number;
    panStartY: number;
    backgroundDragStartX: number;
    backgroundDragStartY: number;
  }>): void {
    if (state.isPanning !== undefined) this.isPanning = state.isPanning;
    if (state.potentialBackgroundPan !== undefined) this.potentialBackgroundPan = state.potentialBackgroundPan;
    if (state.panStartX !== undefined) this._panStartX = state.panStartX;
    if (state.panStartY !== undefined) this._panStartY = state.panStartY;
    if (state.backgroundDragStartX !== undefined) this.backgroundDragStartX = state.backgroundDragStartX;
    if (state.backgroundDragStartY !== undefined) this.backgroundDragStartY = state.backgroundDragStartY;
  }
  
  /**
   * Set interaction state (for event handlers)
   * This syncs handler state with NodeEditorCanvas state for variables used elsewhere
   */
  private setInteractionState(state: Partial<{
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
  }>): void {
    if (state.isDraggingNode !== undefined) this.isDraggingNode = state.isDraggingNode;
    if (state.draggingNodeId !== undefined) this.draggingNodeId = state.draggingNodeId;
    if (state.draggingNodeInitialPos !== undefined) this.draggingNodeInitialPos = state.draggingNodeInitialPos;
    if (state.selectedNodesInitialPositions !== undefined) this.selectedNodesInitialPositions = state.selectedNodesInitialPositions;
    if (state.isDraggingParameter !== undefined) this.isDraggingParameter = state.isDraggingParameter;
    if (state.draggingParameterNodeId !== undefined) this.draggingParameterNodeId = state.draggingParameterNodeId;
    if (state.draggingParameterName !== undefined) this.draggingParameterName = state.draggingParameterName;
    if (state.dragParamStartX !== undefined) this.dragParamStartX = state.dragParamStartX;
    if (state.dragParamStartY !== undefined) this.dragParamStartY = state.dragParamStartY;
    if (state.dragParamStartValue !== undefined) this.dragParamStartValue = state.dragParamStartValue;
    if (state.draggingFrequencyBand !== undefined) this.draggingFrequencyBand = state.draggingFrequencyBand;
    if (state.isDraggingBezierControl !== undefined) this.isDraggingBezierControl = state.isDraggingBezierControl;
    if (state.draggingBezierNodeId !== undefined) this.draggingBezierNodeId = state.draggingBezierNodeId;
    if (state.draggingBezierControlIndex !== undefined) this.draggingBezierControlIndex = state.draggingBezierControlIndex;
    if (state.dragBezierStartValues !== undefined) this.dragBezierStartValues = state.dragBezierStartValues;
    if (state.potentialNodeDrag !== undefined) this.potentialNodeDrag = state.potentialNodeDrag;
    if (state.potentialNodeDragId !== undefined) this.potentialNodeDragId = state.potentialNodeDragId;
    if (state.nodeDragStartX !== undefined) this.nodeDragStartX = state.nodeDragStartX;
    if (state.nodeDragStartY !== undefined) this.nodeDragStartY = state.nodeDragStartY;
    if (state.dragOffsetX !== undefined) this.dragOffsetX = state.dragOffsetX;
    if (state.dragOffsetY !== undefined) this.dragOffsetY = state.dragOffsetY;
  }
  
  /**
   * Update current mouse position (for event handlers)
   */
  private updateMousePosition(x: number, y: number): void {
    this.currentMouseX = x;
    this.currentMouseY = y;
  }
  
  /**
   * Get interaction state (for event handlers)
   */
  private getInteractionState(): {
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
  } {
    return {
      isDraggingNode: this.isDraggingNode,
      draggingNodeId: this.draggingNodeId,
      draggingNodeInitialPos: this.draggingNodeInitialPos,
      selectedNodesInitialPositions: this.selectedNodesInitialPositions,
      isDraggingParameter: this.isDraggingParameter,
      draggingParameterNodeId: this.draggingParameterNodeId,
      draggingParameterName: this.draggingParameterName,
      dragParamStartX: this.dragParamStartX,
      dragParamStartY: this.dragParamStartY,
      dragParamStartValue: this.dragParamStartValue,
      draggingFrequencyBand: this.draggingFrequencyBand,
      isDraggingBezierControl: this.isDraggingBezierControl,
      draggingBezierNodeId: this.draggingBezierNodeId,
      draggingBezierControlIndex: this.draggingBezierControlIndex,
      dragBezierStartValues: this.dragBezierStartValues,
      potentialNodeDrag: this.potentialNodeDrag,
      potentialNodeDragId: this.potentialNodeDragId,
      nodeDragStartX: this.nodeDragStartX,
      nodeDragStartY: this.nodeDragStartY,
      dragOffsetX: this.dragOffsetX,
      dragOffsetY: this.dragOffsetY
    };
  }
  
  /**
   * Setup contexts for extracted managers
   */
  private setupManagerContexts(): void {
    // Setup edge scroll manager context
    this.edgeScrollManager.setContext({
      getCanvasRect: () => this.canvas.getBoundingClientRect(),
      getMousePosition: () => ({ x: this.currentMouseX, y: this.currentMouseY }),
      onPanChanged: (deltaX, deltaY) => {
        this.viewStateManager.addPan(deltaX, deltaY);
        // Sync to state for backward compatibility
        const newState = this.viewStateManager.getState();
        this.state.panX = newState.panX;
        this.state.panY = newState.panY;
        
        // If dragging a node, update its position to stay under the mouse cursor
        // The pan changed, so we need to recalculate the node's canvas position
        if (this.isDraggingNode && this.draggingNodeId && this.draggingNodeInitialPos) {
          const node = this.graph.nodes.find(n => n.id === this.draggingNodeId);
          if (node) {
            // Convert current mouse position to canvas coordinates
            const canvasPos = this.screenToCanvas(
              this.currentMouseX - this.dragOffsetX,
              this.currentMouseY - this.dragOffsetY
            );
            
            // Calculate smart guides and snap position
            const { snappedX, snappedY } = this.calculateSmartGuides(node, canvasPos.x, canvasPos.y);
            
            // Calculate the delta from initial position
            const deltaX = snappedX - this.draggingNodeInitialPos.x;
            const deltaY = snappedY - this.draggingNodeInitialPos.y;
            
            // Move all selected nodes by the same delta
            const movedNodeIds: string[] = [];
            for (const [nodeId, initialPos] of this.selectedNodesInitialPositions.entries()) {
              const selectedNode = this.graph.nodes.find(n => n.id === nodeId);
              if (selectedNode) {
                selectedNode.position.x = Math.round(initialPos.x + deltaX);
                selectedNode.position.y = Math.round(initialPos.y + deltaY);
                movedNodeIds.push(nodeId);
                this.onNodeMoved?.(nodeId, selectedNode.position.x, selectedNode.position.y);
              }
            }
            
            // Mark moved nodes as dirty
            this.renderState.markNodesDirty(movedNodeIds);
          }
        }
        
        // Mark full redraw needed (pan changed)
        this.renderState.markFullRedraw();
        this.renderingOrchestrator.requestRender();
      }
    });
    
    // Setup UI element manager context
    this.uiElementManager.setContext({
      getCanvas: () => this.canvas,
      getZoom: () => this.viewStateManager.getState().zoom,
      getPanZoom: () => {
        const vs = this.viewStateManager.getState();
        return { panX: vs.panX, panY: vs.panY, zoom: vs.zoom };
      },
      screenToCanvas: (screenX, screenY) => {
        const rect = this.canvas.getBoundingClientRect();
        return this.viewStateManager.screenToCanvas(screenX, screenY, rect);
      },
      canvasToScreen: (canvasX, canvasY) => {
        const rect = this.canvas.getBoundingClientRect();
        return this.viewStateManager.canvasToScreen(canvasX, canvasY, rect);
      }
    });
    
    // Setup keyboard shortcut handler
    this.keyboardShortcutHandler.initialize({
      isInputActive: () => this.uiElementManager.isAnyUIActive(),
      isDialogVisible: () => this.isDialogVisible?.() ?? false,
      onDeleteSelected: () => {
        const selection = this.selectionManager.getState();
        for (const nodeId of selection.selectedNodeIds) {
          const component = this.nodeComponents.get(nodeId);
          if (component) {
            component.unmount();
            this.nodeComponents.delete(nodeId);
          }
          this.onNodeDeleted?.(nodeId);
        }
        for (const connId of selection.selectedConnectionIds) {
          this.onConnectionDeleted?.(connId);
        }
        this.selectionManager.clear();
        // Sync to state for backward compatibility
        const newSelection = this.selectionManager.getState();
        this.state.selectedNodeIds = newSelection.selectedNodeIds;
        this.state.selectedConnectionIds = newSelection.selectedConnectionIds;
        this.renderingOrchestrator.render();
      },
      onSpacebarStateChange: (isPressed) => {
        this.isSpacePressed = isPressed;
        this.onSpacebarStateChange?.(isPressed);
      },
      setCursor: (cursor) => { this.canvas.style.cursor = cursor; },
      isPanning: () => this.isPanning,
      isDraggingNode: () => this.isDraggingNode,
      isConnecting: () => this.connectionStateManager.getIsConnecting()
    });
  }
  
  /**
   * Setup layer system (Phase 2.3)
   */
  private setupLayerSystem(): void {
    this.layerManager = new LayerManager();
    
    // Register grid layer
    this.layerManager.register(new GridLayerRenderer({
      canvas: this.canvas,
      getState: () => {
        const viewState = this.viewStateManager.getState();
        return {
          panX: viewState.panX,
          panY: viewState.panY,
          zoom: viewState.zoom
        };
      }
    }));
    
    // Register connection layer
    this.connectionLayerRenderer = new ConnectionLayerRenderer({
      graph: this.graph,
      getGraph: () => this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      getSelectedConnectionIds: () => this.getSelectionState().selectedConnectionIds,
      isConnectionVisible: (conn) => this.renderingOrchestrator.isConnectionVisible(conn),
      // PERF_VIEWPORT_CULLING: Provide isNodeVisible for efficient culling
      isNodeVisible: (node, metrics) => this.renderingOrchestrator.isNodeVisible(node, metrics),
      // Phase 3.4: Recalculate metrics for dragged nodes before rendering connections
      recalculateMetricsForNodes: (nodeIds) => {
        for (const nodeId of nodeIds) {
          const node = this.graph.nodes.find(n => n.id === nodeId);
          if (node) {
            const spec = this.nodeSpecs.get(node.type);
            if (spec) {
              // Recalculate metrics for this node
              const metrics = this.nodeRenderer.calculateMetrics(node, spec);
              this.nodeMetrics.set(nodeId, metrics);
              
              // Update component metrics
              const component = this.nodeComponents.get(nodeId);
              if (component) {
                component.invalidateMetrics();
                component.calculateMetrics();
                this.nodeMetrics.set(nodeId, component.getNodeMetrics());
              }
            }
          }
        }
      },
      getDraggedNodeIds: () => Array.from(this.draggedNodeIds),
      getPanZoom: () => {
        const vs = this.getViewStateInternal();
        return { panX: vs.panX, panY: vs.panY, zoom: vs.zoom };
      },
      renderState: this.renderState
    });
    this.layerManager.register(this.connectionLayerRenderer);
    
    // Register parameter connection layer
    this.parameterConnectionLayerRenderer = new ParameterConnectionLayerRenderer({
      graph: this.graph,
      getGraph: () => this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      getSelectedConnectionIds: () => this.getSelectionState().selectedConnectionIds,
      isConnectionVisible: (conn) => this.renderingOrchestrator.isConnectionVisible(conn),
      // PERF_VIEWPORT_CULLING: Provide isNodeVisible for efficient culling
      isNodeVisible: (node, metrics) => this.renderingOrchestrator.isNodeVisible(node, metrics),
      // Phase 3.4: Recalculate metrics for dragged nodes before rendering connections
      recalculateMetricsForNodes: (nodeIds) => {
        for (const nodeId of nodeIds) {
          const node = this.graph.nodes.find(n => n.id === nodeId);
          if (node) {
            const spec = this.nodeSpecs.get(node.type);
            if (spec) {
              // Recalculate metrics for this node
              const metrics = this.nodeRenderer.calculateMetrics(node, spec);
              this.nodeMetrics.set(nodeId, metrics);
              
              // Update component metrics
              const component = this.nodeComponents.get(nodeId);
              if (component) {
                component.invalidateMetrics();
                component.calculateMetrics();
                this.nodeMetrics.set(nodeId, component.getNodeMetrics());
              }
            }
          }
        }
      },
      getDraggedNodeIds: () => Array.from(this.draggedNodeIds),
      getPanZoom: () => {
        const vs = this.getViewStateInternal();
        return { panX: vs.panX, panY: vs.panY, zoom: vs.zoom };
      },
      renderState: this.renderState
    });
    this.layerManager.register(this.parameterConnectionLayerRenderer);
    
    // Register node layer
    this.layerManager.register(new NodeLayerRenderer({
      graph: this.graph,
      getGraph: () => this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      selectedNodeIds: this.getSelectionState().selectedNodeIds,
      hoveredPort: this.connectionStateManager.getHoveredPort(),
      isConnecting: this.connectionStateManager.getIsConnecting(),
      connectionStartNodeId: this.connectionStateManager.getConnectionStartNodeId(),
      connectionStartPort: this.connectionStateManager.getConnectionStartPort(),
      connectionStartParameter: this.connectionStateManager.getConnectionStartParameter(),
      audioManager: this.audioManager,
      renderNode: (node, skipPorts) => this.renderingOrchestrator.renderNode(node, skipPorts),
      isNodeVisible: (node, metrics) => this.renderingOrchestrator.isNodeVisible(node, metrics),
      getPanZoom: () => {
        const vs = this.getViewStateInternal();
        return { panX: vs.panX, panY: vs.panY, zoom: vs.zoom };
      },
      renderState: this.renderState
    }));
    
    // Register port layer
    this.layerManager.register(new PortLayerRenderer({
      graph: this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      hoveredPort: this.connectionStateManager.getHoveredPort(),
      isConnecting: this.connectionStateManager.getIsConnecting(),
      connectionStartNodeId: this.connectionStateManager.getConnectionStartNodeId(),
      connectionStartPort: this.connectionStateManager.getConnectionStartPort(),
      connectionStartParameter: this.connectionStateManager.getConnectionStartParameter(),
      renderNodePorts: () => this.renderingOrchestrator.renderNodePorts(),
      isNodeVisible: (node, metrics) => this.renderingOrchestrator.isNodeVisible(node, metrics)
    }));
    
    // Register overlay layer
    this.layerManager.register(new OverlayLayerRenderer({
      getIsConnecting: () => this.connectionStateManager.getIsConnecting(),
      getIsDraggingNode: () => {
        // Check both old state and handler state (Phase 2.4)
        // Check if any handler is currently dragging a node
        // Check if smart guides exist (indicates dragging)
        if (this.interactionManager) {
          return this.currentSmartGuides.vertical.length > 0 || this.currentSmartGuides.horizontal.length > 0 || this.isDraggingNode;
        }
        return this.isDraggingNode;
      },
      getSelectionRectangle: () => this.selectionRectangle,
      renderTemporaryConnection: () => this.connectionStateManager.renderTemporaryConnection(),
      renderSmartGuides: () => this.renderSmartGuides(),
      renderSelectionRectangle: () => this.renderSelectionRectangle()
    }));
  }
  
  /**
   * Setup interaction handler system (Phase 2.4)
   */
  private setupInteractionHandlers(): void {
    this.interactionManager = new InteractionManager();
    const context = this.createHandlerContext();
    
    // Register handlers in priority order (higher priority = checked first)
    // Register node drag handler (priority 50 - highest, most specific)
    this.interactionManager.register(InteractionType.NodeDrag, new NodeDragHandler(context));
    
    // Register port connect handler (priority 45)
    this.interactionManager.register(InteractionType.PortConnect, new PortConnectHandler(context));
    
    // Register parameter drag handler (priority 40)
    this.interactionManager.register(InteractionType.ParameterDrag, new ParameterDragHandler(context));
    
    // Register bezier control drag handler (priority 35)
    this.interactionManager.register(InteractionType.BezierControlDrag, new BezierControlDragHandler(context));
    
    // Register connection select handler (priority 30)
    this.interactionManager.register(InteractionType.NodeSelect, new ConnectionSelectHandler(context));
    
    // Register canvas zoom handler (priority 20)
    this.interactionManager.register(InteractionType.CanvasZoom, new CanvasZoomHandler(context));
    
    // Register hand tool handler (priority 15)
    this.interactionManager.register(InteractionType.CanvasPan, new HandToolHandler(context));
    
    // Register selection tool handler (priority 25)
    this.interactionManager.register(InteractionType.RectangleSelection, new SelectionToolHandler(context));
    
    // Register canvas pan handler (priority 10 - lowest, fallback for empty canvas)
    this.interactionManager.register(InteractionType.CanvasPan, new CanvasPanHandler(context));
  }
  
  /**
   * Convert native mouse/wheel event to InteractionEvent
   */
  private createInteractionEvent(
    type: InteractionType,
    e: MouseEvent | WheelEvent,
    target: any = null
  ): InteractionEvent {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = 'clientX' in e ? e.clientX : rect.left + rect.width / 2;
    const screenY = 'clientY' in e ? e.clientY : rect.top + rect.height / 2;
    
    return {
      type,
      target,
      position: this.screenToCanvas(screenX, screenY),
      screenPosition: { x: screenX, y: screenY },
      modifiers: {
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        meta: e.metaKey
      },
      button: 'button' in e ? e.button : undefined,
      deltaY: 'deltaY' in e ? e.deltaY : undefined,
      originalEvent: e
    };
  }
  
  private resizeObserver: ResizeObserver | null = null;

  private documentMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private documentMouseUpHandler: ((e: MouseEvent) => void) | null = null;

  /**
   * Initialize event handlers
   */
  private initializeEventHandlers(): void {
    const handlerContext = this.createHandlerContext();
    
    // Initialize mouse event handler
    this.mouseEventHandler = new MouseEventHandler({
      handlerContext,
      interactionManager: this.interactionManager,
      uiElementManager: this.uiElementManager,
      hitTestManager: this.hitTestManager,
      edgeScrollManager: this.edgeScrollManager,
      selectionManager: this.selectionManager,
      viewStateManager: this.viewStateManager,
      graph: this.graph,
      getGraph: () => this.graph,
      nodeSpecs: this.nodeSpecs,
      nodeMetrics: this.nodeMetrics,
      nodeComponents: this.nodeComponents,
      nodeRenderer: this.nodeRenderer,
      renderState: this.renderState,
      connectionLayerRenderer: this.connectionLayerRenderer,
      parameterConnectionLayerRenderer: this.parameterConnectionLayerRenderer,
      activeTool: this.activeTool,
      getActiveTool: () => this.activeTool,
      isSpacePressed: this.isSpacePressed,
      canvas: this.canvas,
      onNodeDeleted: this.onNodeDeleted,
      onTypeLabelClick: this.onTypeLabelClick,
      onParameterInputModeChanged: this.onParameterInputModeChanged,
      onParameterChanged: this.onParameterChanged,
      onConnectionCreated: this.onConnectionCreated,
      onNodeMoved: this.onNodeMoved,
      onNodeSelected: this.onNodeSelected,
      attachDocumentListeners: () => this.attachDocumentListeners(),
      detachDocumentListeners: () => this.detachDocumentListeners(),
      createInteractionEvent: (type, e, target) => this.createInteractionEvent(type, e, target),
      handleFileParameterClick: (nodeId, paramName, screenX, screenY) => this.overlayManager.handleFileParameterClick(nodeId, paramName, screenX, screenY),
      handleFrequencyBandsParameterClick: (nodeId, paramName, screenX, screenY) => this.overlayManager.handleFrequencyBandsParameterClick(nodeId, paramName, screenX, screenY),
      handleEnumParameterClick: (nodeId, paramName, screenX, screenY) => this.overlayManager.handleEnumParameterClick(nodeId, paramName, screenX, screenY),
      handleColorPickerClick: (nodeId, screenX, screenY) => this.overlayManager.handleColorPickerClick(nodeId, screenX, screenY),
      calculateSmartGuides: (draggingNode, proposedX, proposedY) => this.calculateSmartGuides(draggingNode, proposedX, proposedY),
      getViewStateInternal: () => this.getViewStateInternal(),
      getSelectionState: () => this.getSelectionState(),
      screenToCanvas: (screenX, screenY) => this.screenToCanvas(screenX, screenY),
      getConnectionState: () => this.getConnectionState(),
      setConnectionState: (state) => this.setConnectionState(state),
      getPanState: () => this.getPanState(),
      setPanState: (state) => this.setPanState(state),
      getInteractionState: () => this.getInteractionState(),
      setInteractionState: (state) => this.setInteractionState(state),
      setSmartGuides: (guides) => { this.currentSmartGuides = guides; },
      updateMousePosition: (x, y) => this.updateMousePosition(x, y)
    });
    
    // Initialize wheel event handler
    this.wheelEventHandler = new WheelEventHandler({
      handlerContext,
      interactionManager: this.interactionManager,
      viewStateManager: this.viewStateManager,
      renderState: this.renderState,
      canvas: this.canvas,
      createInteractionEvent: (type, e, target) => this.createInteractionEvent(type, e, target),
      getViewStateInternal: () => this.getViewStateInternal()
    });
  }

  private setupEventListeners(): void {
    // Pan with middle mouse or space + left mouse
    this.canvas.addEventListener('mousedown', (e) => this.mouseEventHandler.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.mouseEventHandler.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.mouseEventHandler.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.mouseEventHandler.handleMouseLeave());
    this.canvas.addEventListener('dblclick', (e) => this.handleCanvasDoubleClick(e));
    this.canvas.addEventListener('wheel', (e) => this.wheelEventHandler.handleWheel(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Keyboard shortcuts are now handled by KeyboardShortcutHandler (initialized in setupManagerContexts)
    
    // Resize - use ResizeObserver to watch canvas container size changes
    // This handles both window resize and layout changes (e.g., when preview is collapsed)
    // Debounce resize handling to prevent excessive updates during rapid resizing
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.canvas);
    
    // Initialize cached viewport dimensions
    const initialRect = this.canvas.getBoundingClientRect();
    this.cachedViewportWidth = initialRect.width;
    this.cachedViewportHeight = initialRect.height;
  }
  
  /**
   * Attach document-level mouse listeners for dragging outside canvas
   */
  private attachDocumentListeners(): void {
    if (this.documentMouseMoveHandler || this.documentMouseUpHandler) {
      return; // Already attached
    }
    
    this.documentMouseMoveHandler = (e: MouseEvent) => this.mouseEventHandler.handleMouseMove(e);
    this.documentMouseUpHandler = (e: MouseEvent) => this.mouseEventHandler.handleMouseUp(e);
    
    document.addEventListener('mousemove', this.documentMouseMoveHandler);
    document.addEventListener('mouseup', this.documentMouseUpHandler);
  }
  
  /**
   * Detach document-level mouse listeners
   */
  private detachDocumentListeners(): void {
    if (this.documentMouseMoveHandler) {
      document.removeEventListener('mousemove', this.documentMouseMoveHandler);
      this.documentMouseMoveHandler = null;
    }
    
    if (this.documentMouseUpHandler) {
      document.removeEventListener('mouseup', this.documentMouseUpHandler);
      this.documentMouseUpHandler = null;
    }
  }
  
  /**
   * Handle resize event - updates canvas dimensions immediately, then schedules render
   */
  private handleResize(): void {
    // Clear any pending timeout
    if (this.resizeTimeout !== null) {
      cancelAnimationFrame(this.resizeTimeout);
    }
    
    // Update canvas dimensions IMMEDIATELY to prevent visual glitches
    // This ensures canvas internal size matches CSS size right away
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const newWidth = rect.width * dpr;
    const newHeight = rect.height * dpr;
    
    // Update canvas dimensions synchronously to prevent black columns
    if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
      // Reset transform and apply device pixel ratio scaling
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      
      // Clear and fill background immediately to prevent black areas
      this.ctx.clearRect(0, 0, rect.width, rect.height);
      this.renderingOrchestrator.fillBackground();
    }
    
    // Mark resize as pending for full processing
    this.pendingResize = true;
    
    // Process full resize logic and render on next frame
    // This handles pan adjustment and full render
    this.resizeTimeout = requestAnimationFrame(() => {
      // Process full resize (pan adjustment, etc.)
      if (this.pendingResize) {
        this.resize();
        // Request render immediately
        this.renderingOrchestrator.requestRender();
      }
      
      // Final render after resize settles
      this.resizeTimeout = requestAnimationFrame(() => {
        if (this.pendingResize) {
          this.renderingOrchestrator.requestRender();
        }
        this.resizeTimeout = null;
      });
    });
  }
  
  /**
   * Resize canvas and update viewport
   * Maintains visual center during resize for better UX
   */
  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const oldWidth = this.canvas.width;
    const oldHeight = this.canvas.height;
    
    // Initialize cached dimensions if not set (first resize)
    if (this.cachedViewportWidth === 0 && this.cachedViewportHeight === 0) {
      this.cachedViewportWidth = rect.width;
      this.cachedViewportHeight = rect.height;
    }
    
    const oldViewportWidth = this.cachedViewportWidth;
    const oldViewportHeight = this.cachedViewportHeight;
    
    // Calculate new dimensions
    const newWidth = rect.width * dpr;
    const newHeight = rect.height * dpr;
    const newViewportWidth = rect.width;
    const newViewportHeight = rect.height;
    
    // Cache viewport dimensions for consistent calculations
    this.cachedViewportWidth = newViewportWidth;
    this.cachedViewportHeight = newViewportHeight;
    
    // Optional: Adjust pan to maintain visual center during resize
    // This keeps the content visually centered when window resizes
    // Skip this adjustment if we're at minimum zoom to avoid conflicts with zoom constraints
    const MIN_ZOOM = 0.10;
    const viewState = this.getViewStateInternal();
    const isAtMinZoom = Math.abs(viewState.zoom - MIN_ZOOM) < 0.001;
    
    if (oldViewportWidth > 0 && oldViewportHeight > 0 && 
        (oldViewportWidth !== newViewportWidth || oldViewportHeight !== newViewportHeight) &&
        !isAtMinZoom) {
      // Calculate the canvas point that was at the center of the old viewport
      const oldCenterX = oldViewportWidth / 2;
      const oldCenterY = oldViewportHeight / 2;
      const canvasCenterX = (oldCenterX - viewState.panX) / viewState.zoom;
      const canvasCenterY = (oldCenterY - viewState.panY) / viewState.zoom;
      
      // Calculate new pan to keep same canvas point at center of new viewport
      const newCenterX = newViewportWidth / 2;
      const newCenterY = newViewportHeight / 2;
      this.viewStateManager.setPan(
        newCenterX - canvasCenterX * viewState.zoom,
        newCenterY - canvasCenterY * viewState.zoom
      );
      this.getViewStateInternal(); // Sync to state
    }
    
    // Canvas dimensions are already updated in handleResize() to prevent visual glitches
    // Just mark for full redraw if dimensions changed
    if (oldWidth !== newWidth || oldHeight !== newHeight) {
      // Canvas resize requires full redraw (context was reset)
      this.renderState.markFullRedraw();
    }
    
    this.pendingResize = false;
  }
  
  /**
   * Cleanup resize timeout on destroy
   */
  private cleanupResize(): void {
    if (this.resizeTimeout !== null) {
      cancelAnimationFrame(this.resizeTimeout);
      this.resizeTimeout = null;
    }
  }
  
  // Coordinate conversion
  private screenToCanvas(screenX: number, screenY: number): { x: number, y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return this.viewStateManager.screenToCanvas(screenX, screenY, rect);
  }
  
  private canvasToScreen(canvasX: number, canvasY: number): { x: number, y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return this.viewStateManager.canvasToScreen(canvasX, canvasY, rect);
  }
  
  // Hit testing is now handled by HitTestManager

  // Public method to check if a click is on a parameter (for double-click handling)
  public hitTestParameterAtScreen(screenX: number, screenY: number): { nodeId: string, paramName: string } | null {
    return this.hitTestManager.hitTestParameter(screenX, screenY);
  }
  
  // Public method to check if a click is on a type label
  public hitTestTypeLabelAtScreen(screenX: number, screenY: number): { 
    nodeId: string; 
    portName: string; 
    portType: string; 
    isOutput: boolean;
    screenX: number;
    screenY: number;
  } | null {
    return this.hitTestManager.hitTestTypeLabel(screenX, screenY);
  }
  
  // Show text input overlay for parameter editing
  public showParameterInput(screenX: number, screenY: number): boolean {
    return this.overlayManager.showParameterInput(screenX, screenY);
  }
  
  // Hide parameter input overlay
  public hideParameterInput(): void {
    this.overlayManager.hideParameterInput();
  }
  
  /**
   * Handle double-click on canvas: if over a parameter value box, show parameter input overlay;
   * otherwise if over node header label, show label edit overlay.
   * Coordinates must be client (viewport) coordinates; hit test uses screenToCanvas which expects them.
   */
  private handleCanvasDoubleClick(e: MouseEvent): void {
    if (this.showParameterInput(e.clientX, e.clientY)) return;
    this.showLabelInput(e.clientX, e.clientY);
  }

  // Show text input overlay for label editing
  public showLabelInput(screenX: number, screenY: number): boolean {
    return this.overlayManager.showLabelInput(screenX, screenY);
  }

  // Hide label input overlay
  public hideLabelInput(): void {
    this.overlayManager.hideLabelInput();
  }
  
  
  // Event handlers are now handled by MouseEventHandler and WheelEventHandler classes
  
  // handleMouseMove removed - now handled by MouseEventHandler
  
  // Edge scrolling methods are now handled by EdgeScrollManager
  
  // Visibility culling methods (getViewport, isNodeVisible, isConnectionVisible) are now handled by RenderingOrchestrator
  
  /**
   * Calculate smart guides and snap position for a node being dragged
   */
  private calculateSmartGuides(
    draggingNode: NodeInstance,
    proposedX: number,
    proposedY: number
  ): {
    snappedX: number;
    snappedY: number;
    guides: { vertical: Array<{ x: number; startY: number; endY: number }>; horizontal: Array<{ y: number; startX: number; endX: number }> };
  } {
    const viewState = this.viewStateManager.getState();
    const result = this.smartGuidesManager.calculateGuides(
      draggingNode,
      proposedX,
      proposedY,
      {
        // Important: Smart guides need metrics during drag. Some drag paths invalidate metrics caches,
        // so we lazily recompute missing entries here to ensure guides/snapping always work.
        getNodeMetrics: (nodeId) => {
          const cached = this.nodeMetrics.get(nodeId);
          if (cached) return cached;

          const node = this.graph.nodes.find(n => n.id === nodeId);
          if (!node) return undefined;
          const spec = this.nodeSpecs.get(node.type);
          if (!spec) return undefined;

          const metrics = this.nodeRenderer.calculateMetrics(node, spec);
          this.nodeMetrics.set(nodeId, metrics);
          return metrics;
        },
        // Consider all nodes with metrics for alignment; visibility culling can hide nearby alignment targets
        isNodeVisible: () => true,
        getZoom: () => viewState.zoom,
        getNodes: () => this.graph.nodes
      }
    );
    this.currentSmartGuides = result.guides;
    return result;
  }
  
  /**
   * Render selection rectangle
   * Note: This is called from renderContent() which already applies pan/zoom transform,
   * so we render directly in canvas space.
   */
  private renderSelectionRectangle(): void {
    if (!this.selectionRectangle) return;
    
    const { x, y, width, height } = this.selectionRectangle;
    
    // Get selection rectangle color from CSS
    const fillColor = getCSSColor('selection-rectangle-fill', 'rgba(100, 150, 255, 0.1)');
    const strokeColor = getCSSColor('selection-rectangle-stroke', getCSSColor('color-blue-60', '#4a9eff'));
    
    // Draw fill
    this.ctx.fillStyle = fillColor;
    this.ctx.fillRect(x, y, width, height);
    
    // Draw stroke
    this.ctx.strokeStyle = strokeColor;
    const viewState = this.getViewStateInternal();
    this.ctx.lineWidth = 1 / viewState.zoom; // Scale line width with zoom
    this.ctx.setLineDash([4 / viewState.zoom, 4 / viewState.zoom]); // Scale dash with zoom
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.setLineDash([]);
  }
  
  /**
   * Render smart guide lines
   */
  private renderSmartGuides(): void {
    if (this.currentSmartGuides.vertical.length === 0 && this.currentSmartGuides.horizontal.length === 0) {
      return;
    }
    
    const viewState = this.viewStateManager.getState();
    const rect = this.canvas.getBoundingClientRect();
    this.smartGuidesManager.renderGuides(
      this.ctx,
      this.currentSmartGuides,
      { panX: viewState.panX, panY: viewState.panY, zoom: viewState.zoom },
      rect
    );
  }
  
  /**
   * Set the active tool
   */
  public setActiveTool(tool: ToolType): void {
    this.activeTool = tool;
    
    // Update cursor based on tool
    if (tool === 'hand') {
      this.canvas.style.cursor = 'grab';
    } else if (tool === 'select') {
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.canvas.style.cursor = 'default';
    }
  }
  
  // handleMouseUp removed - now handled by MouseEventHandler
  
  // handleWheel removed - now handled by WheelEventHandler
  
  // Keyboard handling is now done by KeyboardShortcutHandler (initialized in setupManagerContexts)
  
  // handleMouseLeave removed - now handled by MouseEventHandler
  
  // Rendering orchestration is now handled by RenderingOrchestrator
  
  /**
   * Public render method - delegates to RenderingOrchestrator
   */
  public render(): void {
    this.renderingOrchestrator.render();
  }
  
  /**
   * Request a canvas redraw on the next animation frame (batched by RenderingOrchestrator).
   * Used by the main loop to drive audio-reactive UI (e.g. remap needles) every frame.
   */
  public requestRender(): void {
    this.renderingOrchestrator.requestRender();
  }
  
  // renderNode, renderNodePorts, and related methods are now handled by RenderingOrchestrator
  
  private startEffectiveValueUpdates(): void {
    // Update effective values periodically (every 100ms for smooth animation)
    if (this.effectiveValueUpdateInterval) {
      clearInterval(this.effectiveValueUpdateInterval);
    }
    
    this.effectiveValueUpdateInterval = window.setInterval(() => {
      // Mark all nodes with animated parameters as dirty
      // Find all nodes with connected float parameters (which may have animated values)
      const nodesWithAnimatedParams = new Set<string>();
      for (const node of this.graph.nodes) {
        const spec = this.nodeSpecs.get(node.type);
        if (!spec) continue;
        for (const [paramName, paramSpec] of Object.entries(spec.parameters)) {
          if (paramSpec.type === 'float') {
            const hasConnection = this.graph.connections.some(
              conn => conn.targetNodeId === node.id && conn.targetParameter === paramName
            );
            if (hasConnection) {
              nodesWithAnimatedParams.add(node.id);
              break;
            }
          }
        }
      }
      if (nodesWithAnimatedParams.size > 0) {
        this.renderState.markNodesDirty(Array.from(nodesWithAnimatedParams));
        this.renderingOrchestrator.requestRender();
      }
    }, 100);
  }
  
  private stopEffectiveValueUpdates(): void {
    if (this.effectiveValueUpdateInterval) {
      clearInterval(this.effectiveValueUpdateInterval);
      this.effectiveValueUpdateInterval = null;
    }
  }
  
  public destroy(): void {
    this.stopEffectiveValueUpdates();
    // Cleanup resize handling
    this.cleanupResize();
    // Cleanup edge scrolling
    this.edgeScrollManager.dispose();
    // Cleanup keyboard shortcuts
    this.keyboardShortcutHandler.dispose();
    // Cleanup UI elements
    this.uiElementManager.dispose();
    // Cancel pending render frame
    this.renderingOrchestrator.cancelPendingRender();
  }
  
  public setAudioManager(audioManager: IAudioManager | undefined): void {
    this.audioManager = audioManager;
    this.renderingOrchestrator.updateDependencies({ audioManager: this.audioManager });
    this.renderingOrchestrator.requestRender();
  }
  
  // renderRegularConnections and renderParameterConnections are now handled by ConnectionLayerRenderer and ParameterConnectionLayerRenderer
  
  // renderConnection is now handled by ConnectionLayerRenderer and ParameterConnectionLayerRenderer
  // renderTemporaryConnection is now handled by ConnectionStateManager
  
  // Public API
  setGraph(graph: NodeGraph): void {
    // Use unified change detection system
    const changeResult = GraphChangeDetector.detectChanges(
      this.graph,
      graph,
      {
        trackAffectedNodes: false,
        includeConnectionIds: true
      }
    );
    
    // Phase 3.3: Invalidate connection path caches when graph structure changes
    // Invalidate caches for removed connections
    for (const connId of changeResult.removedConnectionIds) {
      this.connectionLayerRenderer?.invalidateConnection(connId);
      this.parameterConnectionLayerRenderer?.invalidateConnection(connId);
    }
    
    // Clear all caches if connection count changed significantly (indicates major change)
    if (changeResult.isConnectionsChanged && 
        Math.abs((this.graph?.connections.length || 0) - graph.connections.length) > 5) {
      this.connectionLayerRenderer?.clearCache();
      this.parameterConnectionLayerRenderer?.clearCache();
    }
    
    // Clean up NodeComponents for nodes that no longer exist (Phase 2.2)
    for (const nodeId of changeResult.removedNodeIds) {
      const component = this.nodeComponents.get(nodeId);
      if (component) {
        component.unmount();
        this.nodeComponents.delete(nodeId);
      }
    }
    
    this.graph = graph;
    // Update state from graph viewState
    if (graph.viewState) {
      const currentViewState = this.viewStateManager.getState();
      // const currentSelection = this.selectionManager.getState(); // Unused but kept for potential future use
      this.viewStateManager.setViewState({
        zoom: Math.max(0.10, graph.viewState.zoom ?? currentViewState.zoom),
        panX: graph.viewState.panX ?? currentViewState.panX,
        panY: graph.viewState.panY ?? currentViewState.panY
      });
      if (graph.viewState.selectedNodeIds) {
        this.selectionManager.selectNodes(graph.viewState.selectedNodeIds, true);
      }
      this.getViewStateInternal(); // Sync to state
      this.getSelectionState(); // Sync to state
    }
    this.metricsManager.updateDependencies({ graph: this.graph });
    this.metricsManager.updateNodeMetrics();
    // Update hit test manager so interactions (click, drag) find the new node
    this.hitTestManager.updateDependencies({ graph: this.graph });
    // Update overlay manager so parameter/label overlays on new nodes work
    this.overlayManager.updateDependencies({ graph: this.graph });
    // Update rendering orchestrator so it uses the new graph (it holds dependencies from construction)
    this.renderingOrchestrator.updateDependencies({ graph: this.graph });
    // Update connection state manager dependencies
    this.connectionStateManager.updateDependencies({
      graph: this.graph,
      nodeMetrics: this.nodeMetrics
    });
    // Update render state with new graph
    this.renderState.updateGraph(graph);
    this.renderState.markFullRedraw();
    this.renderingOrchestrator.requestRender();
  }
  
  setNodeSpecs(nodeSpecs: NodeSpec[]): void {
    this.nodeSpecs.clear();
    for (const spec of nodeSpecs) {
      this.nodeSpecs.set(spec.id, spec);
    }
    this.metricsManager.updateNodeMetrics();
    this.renderingOrchestrator.render();
  }
  
  /**
   * Fit the view to show all nodes in the graph
   */
  fitToView(): void {
    if (this.graph.nodes.length === 0) {
      return;
    }
    
    // Calculate bounding box of all nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    for (const node of this.graph.nodes) {
      const metrics = this.nodeMetrics.get(node.id);
      if (!metrics) continue;
      
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + metrics.width);
      maxY = Math.max(maxY, node.position.y + metrics.height);
    }
    
    // If no valid bounding box, return
    if (minX === Infinity || minY === Infinity) {
      return;
    }
    
    // Add padding around the nodes (20% on each side)
    const padding = 0.2;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const paddedWidth = contentWidth * (1 + padding * 2);
    const paddedHeight = contentHeight * (1 + padding * 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Get canvas dimensions
    const rect = this.canvas.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    
    // Calculate zoom to fit content
    const zoomX = canvasWidth / paddedWidth;
    const zoomY = canvasHeight / paddedHeight;
    const zoom = Math.max(0.10, Math.min(zoomX, zoomY)); // Zoom out as much as needed to fit content (min 0.10)
    
    // Calculate pan to center content
    const panX = (canvasWidth / 2) - (centerX * zoom);
    const panY = (canvasHeight / 2) - (centerY * zoom);
    
    // Update state
    this.viewStateManager.setViewState({ zoom, panX, panY });
    this.getViewState(); // Sync to state
    
    // View state change affects everything
    this.renderState.markFullRedraw();
    this.renderingOrchestrator.requestRender();
  }
  
  getViewState() {
    const viewState = this.viewStateManager.getState();
    const selection = this.selectionManager.getState();
    return {
      zoom: viewState.zoom,
      panX: viewState.panX,
      panY: viewState.panY,
      selectedNodeIds: Array.from(selection.selectedNodeIds)
    };
  }
  
  /**
   * Set zoom to a specific value, optionally centering on a point
   * @param zoom - Zoom level (1.0 = 100%)
   * @param centerX - Optional screen X coordinate to center on (default: canvas center)
   * @param centerY - Optional screen Y coordinate to center on (default: canvas center)
   */
  setZoom(zoom: number, centerX?: number, centerY?: number): void {
    const newZoom = Math.max(0.10, Math.min(1.0, zoom));
    const rect = this.canvas.getBoundingClientRect();
    
    // Default to canvas center if no center point provided
    const screenX = centerX ?? rect.width / 2;
    const screenY = centerY ?? rect.height / 2;
    
    // Get mouse position in canvas coordinates before zoom
    const canvasPos = this.screenToCanvas(screenX, screenY);
    
    // Calculate new pan to keep the center point fixed in canvas space
    const newPanX = screenX - canvasPos.x * newZoom;
    const newPanY = screenY - canvasPos.y * newZoom;
    
    // Update state
    this.viewStateManager.setViewState({ zoom: newZoom, panX: newPanX, panY: newPanY });
    this.getViewState(); // Sync to state
    
    // View state change affects everything
    this.renderState.markFullRedraw();
    this.renderingOrchestrator.requestRender();
  }
  
  getNodeRenderer(): NodeRenderer {
    return this.nodeRenderer;
  }
  
  getNodeMetrics(): Map<string, NodeRenderMetrics> {
    return this.nodeMetrics;
  }
  
  /**
   * Create a HandlerContext for interaction handlers (Phase 2.4)
   * This allows handlers to access canvas state and methods without tight coupling
   */
  public createHandlerContext(): HandlerContext {
    const builder = new HandlerContextBuilder({
      getViewStateInternal: () => this.getViewStateInternal(),
      getSelectionState: () => this.getSelectionState(),
      graph: this.graph,
      getGraph: () => this.graph,
      nodeSpecs: this.nodeSpecs,
      viewStateManager: this.viewStateManager,
      selectionManager: this.selectionManager,
      hitTestManager: this.hitTestManager,
      connectionStateManager: this.connectionStateManager,
      screenToCanvas: (screenX, screenY) => this.screenToCanvas(screenX, screenY),
      canvasToScreen: (canvasX, canvasY) => this.canvasToScreen(canvasX, canvasY),
      requestRender: () => this.renderingOrchestrator.requestRender(),
      render: () => this.renderingOrchestrator.render(),
      canvas: this.canvas,
      nodeMetrics: this.nodeMetrics,
      nodeComponents: this.nodeComponents,
      nodeRenderer: this.nodeRenderer,
      calculateSmartGuides: (draggingNode, proposedX, proposedY) => this.calculateSmartGuides(draggingNode, proposedX, proposedY),
      renderState: this.renderState,
      setSmartGuides: (guides) => {
        this.currentSmartGuides = guides;
      },
      setDraggedNodeIds: (nodeIds: string[]) => {
        // Phase 3.4: Track dragged nodes for metrics recalculation before connection rendering
        this.draggedNodeIds = new Set(nodeIds);
        // Keep isDraggingNode/draggingNodeId in sync so overlay/orchestrator see drag state
        // when NodeDragHandler (not MouseEventHandler) drives the drag
        this.isDraggingNode = nodeIds.length > 0;
        this.draggingNodeId = nodeIds.length > 0 ? nodeIds[0] : null;
      },
      setPanStateInternal: (state) => {
        this.isPanning = state.isPanning;
        this.potentialBackgroundPan = state.potentialBackgroundPan;
        this._panStartX = state.panStartX;
        this._panStartY = state.panStartY;
        this.backgroundDragStartX = state.backgroundDragStartX;
        this.backgroundDragStartY = state.backgroundDragStartY;
      },
      setSelectionRectangleInternal: (rect) => {
        this.selectionRectangle = rect;
      },
      onNodeMoved: this.onNodeMoved,
      onNodeSelected: this.onNodeSelected,
      getOnNodeSelected: () => this.onNodeSelected,
      onConnectionCreated: this.onConnectionCreated,
      getOnConnectionCreated: () => this.onConnectionCreated,
      onConnectionSelected: this.onConnectionSelected,
      onParameterChanged: this.onParameterChanged,
      getOnParameterChanged: () => this.onParameterChanged,
      onParameterInputModeChanged: this.onParameterInputModeChanged,
      getOnParameterInputModeChanged: () => this.onParameterInputModeChanged,
      isSpacePressed: this.isSpacePressed,
      getActiveTool: () => this.activeTool
    });
    
    return builder.build();
  }
  
  setCallbacks(callbacks: {
    onNodeMoved?: (nodeId: string, x: number, y: number) => void;
    onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
    onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
    onConnectionSelected?: (connectionId: string | null, multiSelect: boolean) => void;
    onNodeDeleted?: (nodeId: string) => void;
    onConnectionDeleted?: (connectionId: string) => void;
    onParameterChanged?: (nodeId: string, paramName: string, value: number | number[][]) => void;
    onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
    onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../types/nodeSpec').ParameterInputMode) => void;
    onNodeLabelChanged?: (nodeId: string, label: string | undefined) => void;
    onSpacebarStateChange?: (isPressed: boolean) => void;
    isDialogVisible?: () => boolean;
    onTypeLabelClick?: (portType: string, screenX: number, screenY: number, typeLabelBounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => void;
  }): void {
    this.onNodeMoved = callbacks.onNodeMoved;
    this.onNodeSelected = callbacks.onNodeSelected;
    this.onConnectionCreated = callbacks.onConnectionCreated;
    this.onConnectionSelected = callbacks.onConnectionSelected;
    this.onNodeDeleted = callbacks.onNodeDeleted;
    this.onConnectionDeleted = callbacks.onConnectionDeleted;
    this.onParameterChanged = callbacks.onParameterChanged;
    this.onFileParameterChanged = callbacks.onFileParameterChanged;
    this.onParameterInputModeChanged = callbacks.onParameterInputModeChanged;
    this.onNodeLabelChanged = callbacks.onNodeLabelChanged;
    this.onSpacebarStateChange = callbacks.onSpacebarStateChange;
    this.isDialogVisible = callbacks.isDialogVisible;
    this.onTypeLabelClick = callbacks.onTypeLabelClick;
    
    // Update mouse handler's callback references since it was created before callbacks were set
    // The mouse handler stores callbacks in its deps property
    if (this.mouseEventHandler && (this.mouseEventHandler as any).deps) {
      const deps = (this.mouseEventHandler as any).deps;
      deps.onTypeLabelClick = this.onTypeLabelClick;
      deps.onNodeSelected = this.onNodeSelected;
      deps.onParameterChanged = this.onParameterChanged;
    }
    
    // Update OverlayManager's callback references so it uses the latest callbacks
    if (this.overlayManager) {
      this.overlayManager.updateDependencies({
        onFileParameterChanged: this.onFileParameterChanged,
        onParameterChanged: this.onParameterChanged,
        onNodeLabelChanged: this.onNodeLabelChanged
      });
    }
  }
  
  /**
   * Set the spacebar state change callback (for visual feedback)
   */
  public setSpacebarStateChangeCallback(callback: (isPressed: boolean) => void): void {
    this.onSpacebarStateChange = callback;
  }

  /**
   * Handle file parameter click - show file input dialog
   */
}
