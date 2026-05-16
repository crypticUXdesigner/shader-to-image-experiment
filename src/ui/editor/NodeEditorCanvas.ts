// Node Editor Canvas Component
// Implements infinite canvas with pan/zoom, grid, and node/connection rendering

import type { NodeGraph, NodeInstance } from '../../data-model/types';
import type { NodeSpec } from '../../types/nodeSpec';
import { NodeRenderer, type NodeRenderMetrics } from './NodeRenderer';
import type { IAudioManager } from '../../runtime/types';
import { RenderState, RenderLayer } from './rendering/RenderState';
// Feature flags removed - all refactored features are now always enabled
import { LayerManager } from './rendering/LayerManager';
import type {
  ConnectionLayerRenderer,
  ParameterConnectionLayerRenderer,
  OverlayLayerRenderer
} from './rendering/layers';
import type { HandlerContext } from '../interactions/HandlerContext';
import { InteractionManager } from '../interactions/InteractionManager';
import { InteractionType } from '../interactions/InteractionTypes';
import type { InteractionEvent } from '../interactions/InteractionHandler';
import type { ToolType, CanvasOverlayBridge } from '../../types/editor';
import {
  ViewStateManager,
  SelectionManager,
  EdgeScrollManager,
  KeyboardShortcutHandler,
  UIElementManager,
  HitTestManager,
  ConnectionStateManager,
  OverlayManager,
  MetricsManager
} from './canvas';
import { RenderingOrchestrator } from './canvas/RenderingOrchestrator';
import { MouseEventHandler, WheelEventHandler } from './canvas/handlers';
import { registerCanvasInteractionHandlers } from './canvas/CanvasInteractionHandlerRegistration';
import { setCallbacksImpl, type CanvasCallbacks, type SetCallbacksCanvas } from './setCallbacksImpl';
import { CanvasResizeLifecycle } from './CanvasResizeLifecycle';
import { CanvasOverlayRenderer } from './CanvasOverlayRenderer';
import { applyGraphUpdate, buildGraphUpdateContext } from './graphUpdate';
import { fitToView as fitToViewImpl, setZoom as setZoomImpl, type ViewFitterDeps } from './ViewFitter';
import { setupManagerContexts, buildManagerContextDeps, type ManagerContextSetupDepsSource } from './ManagerContextSetup';
import { CanvasInteractionState } from './CanvasInteractionState';
import { EffectiveValueUpdateRunner } from './EffectiveValueUpdateRunner';
import { initializeCanvas } from './CanvasInitializer';
import * as CanvasCoordinateHelper from './CanvasCoordinateHelper';
import type { createCanvasStateSync, ConnectionStateUpdate } from './CanvasStateSync';
import { createDocumentListeners } from './DocumentListeners';
import {
  buildMouseEventHandlerDeps,
  buildWheelEventHandlerDeps,
  createInteractionEventFromSource,
  type MouseEventHandlerDepsSource,
  type WheelEventHandlerDepsSource
} from './EventHandlerDeps';
import { createHandlerContext, type HandlerContextSource } from './HandlerContextFactory';
import { createNodeEditorCanvasStateBridge } from './NodeEditorCanvasStateBridge';
import { runNodeEditorCanvasPostInit } from './NodeEditorCanvasPostInit';
import { createStrictDoubleClickHandler } from '../../lib/utils/strictDoubleClick';

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
  private renderState: RenderState;
  private layerManager: LayerManager | null = null; // Phase 2.3: Layer system
  private connectionLayerRenderer: ConnectionLayerRenderer | null = null; // Phase 3.3: For cache invalidation
  private parameterConnectionLayerRenderer: ParameterConnectionLayerRenderer | null = null; // Phase 3.3: Rendered to overlay above DOM nodes
  private parameterConnectionsOverlayCanvas: HTMLCanvasElement | null = null; // Rendered above DomNodeLayer so param connections appear on top
  /** When set, used for param port screen→canvas so connection endpoints match DOM node layer. */
  private connectionRectProvider: (() => DOMRect | null) | null = null;
  private topOverlayCanvas: HTMLCanvasElement | null = null; // Temp connection + selection rect – above nodes
  private overlayLayerRenderer: OverlayLayerRenderer | null = null; // Stored for conditional unregister when using top overlay
  private interactionManager: InteractionManager | null = null; // Phase 2.4: Interaction handler system
  // Rendering state is now managed by RenderingOrchestrator
  
  // Resize handling delegated to CanvasResizeLifecycle
  private resizeLifecycle!: CanvasResizeLifecycle;
  private overlayRenderer!: CanvasOverlayRenderer;

  // Interaction state (pan + drag) delegated to CanvasInteractionState
  private interactionState: CanvasInteractionState = new CanvasInteractionState();
  private isSpacePressed: boolean = false; // Synced from KeyboardShortcutHandler
  private draggedNodeIds: Set<string> = new Set();
  private stateSync!: ReturnType<typeof createCanvasStateSync>;
  private stateBridge!: ReturnType<typeof createNodeEditorCanvasStateBridge>;
  private documentListeners = createDocumentListeners();
  private activeToolInternal: ToolType = 'cursor';
  private selectionRectangle: { x: number; y: number; width: number; height: number } | null = null;

  get activeTool(): ToolType {
    return this.activeToolInternal;
  }

  // Callbacks
  private onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  private onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
  private onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
  private onConnectionSelected?: (connectionId: string | null, multiSelect: boolean) => void;
  private onNodeDeleted?: (nodeId: string) => void;
  private onConnectionDeleted?: (connectionId: string) => void;
  /** Used by ManagerContextSetup so Delete key sees current callback (set after setCallbacks). */
  getOnNodeDeleted?: () => NodeEditorCanvas['onNodeDeleted'];
  /** Used by ManagerContextSetup so Delete key sees current callback (set after setCallbacks). */
  getOnConnectionDeleted?: () => NodeEditorCanvas['onConnectionDeleted'];
  /** Used by ManagerContextSetup so Copy/Paste/Duplicate shortcuts see current callbacks (set after setCallbacks). */
  getOnCopySelected?: () => NodeEditorCanvas['onCopySelected'];
  getOnPaste?: () => NodeEditorCanvas['onPaste'];
  getOnDuplicateSelected?: () => NodeEditorCanvas['onDuplicateSelected'];
  getHasClipboard?: () => NodeEditorCanvas['hasClipboard'];
  getOnUndo?: () => NodeEditorCanvas['onUndo'];
  getOnRedo?: () => NodeEditorCanvas['onRedo'];
  private onParameterChanged?: (
    nodeId: string,
    paramName: string,
    value: import('../../data-model/types').ParameterValue,
    options?: import('../../data-model/types').GraphUndoRecordingOptions
  ) => void;
  private onParameterGestureCommit?: () => void;
  private onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
  private onFileDialogOpen?: () => void;
  private onFileDialogClose?: () => void;
  private onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../types/nodeSpec').ParameterInputMode) => void;
  private onNodeLabelChanged?: (nodeId: string, label: string | undefined) => void;
  private onSpacebarStateChange?: (isPressed: boolean) => void;
  private isDialogVisible?: () => boolean;
  private onTypeLabelClick?: (portType: string, screenX: number, screenY: number, typeLabelBounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => void;
  private onNodeContextMenu?: (screenX: number, screenY: number, nodeId: string, nodeType: string) => void;
  private onCopySelected?: () => void;
  private onPaste?: () => void;
  private onDuplicateSelected?: () => void;
  private hasClipboard?: () => boolean;
  private onUndo?: () => void;
  private onRedo?: () => void;
  /** Fired from mouse handler when user triggers add-node on empty canvas (Add tool or Alt+click in Cursor). */
  onRequestAddNodeAtCanvas?: (screenX: number, screenY: number) => void;
  private audioManager?: IAudioManager;
  private effectiveValueUpdateRunner!: EffectiveValueUpdateRunner;

  // Extracted managers (assigned in CanvasInitializer)
  private viewStateManager!: ViewStateManager;
  private selectionManager!: SelectionManager;
  private edgeScrollManager!: EdgeScrollManager;
  private keyboardShortcutHandler!: KeyboardShortcutHandler;
  private uiElementManager!: UIElementManager;
  private hitTestManager!: HitTestManager;
  private overlayManager!: OverlayManager;
  private connectionStateManager!: ConnectionStateManager;
  private metricsManager!: MetricsManager;
  private renderingOrchestrator!: RenderingOrchestrator;
  
  // Event handlers
  private mouseEventHandler!: MouseEventHandler;
  private wheelEventHandler!: WheelEventHandler;
  private canvasStrictDoubleClick!: (e: MouseEvent) => void;
  
  /** Valid virtual node IDs (audio-signal:*) – when provided, connections from virtual nodes not in this set are not drawn. */
  private getValidVirtualNodeIds?: () => Set<string>;
  /** Timeline state for EffectiveValueUpdateRunner (automation-driven dirty when playing). */
  private getTimelineState?: () => import('../../runtime/types').TimelineState | null;

  /** Exposes getTimelineState for CanvasInitializer (runner dependency). */
  getTimelineStateCallback(): (() => import('../../runtime/types').TimelineState | null) | undefined {
    return this.getTimelineState;
  }

  constructor(
    canvas: HTMLCanvasElement,
    graph: NodeGraph,
    nodeSpecs: NodeSpec[] = [],
    audioManager?: IAudioManager,
    overlayBridge?: CanvasOverlayBridge,
    getValidVirtualNodeIds?: () => Set<string>,
    getTimelineState?: () => import('../../runtime/types').TimelineState | null
  ) {
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

    // Store valid virtual node IDs (for filtering orphaned audio connections)
    this.getValidVirtualNodeIds = getValidVirtualNodeIds;
    this.getTimelineState = getTimelineState;

    // Initialize state from graph viewState or defaults
    this.state = {
      zoom: graph.viewState?.zoom ?? 1.0,
      panX: graph.viewState?.panX ?? 0,
      panY: graph.viewState?.panY ?? 0,
      selectedNodeIds: new Set(graph.viewState?.selectedNodeIds ?? []),
      selectedConnectionIds: new Set()
    };

    initializeCanvas(this as unknown as import('./CanvasInitializer').CanvasInitTarget, graph, overlayBridge);
    runNodeEditorCanvasPostInit(this as unknown as import('./NodeEditorCanvasPostInit').NodeEditorCanvasPostInitTarget);
    // Refs used by CanvasInitializer / layer system, EventHandlerDeps or buildManagerContextDeps / post-init (satisfy noUnusedLocals)
    void [this.stateSync, this.setupManagerContexts, this.setupInteractionHandlers, this.initializeEventHandlers, this.setupEventListeners, this.draggedNodeIds, this.getValidVirtualNodeIds, this.onFileParameterChanged, this.onFileDialogOpen, this.onFileDialogClose, this.onNodeLabelChanged, this.onTypeLabelClick, this.getParamPortPositionsFromDOM, this.getHeaderOutputPortPositionsFromDOM, this.getCanvasRectForConnections, this.renderSelectionRectangle, this.getConnectionState, this.setConnectionState, this.getPanState, this.setPanState, this.getInteractionState, this.setInteractionState, this.updateMousePosition, this.detachDocumentListeners, this.onNodeDeleted, this.onConnectionDeleted, this.onSpacebarStateChange, this.isDialogVisible, this.onCopySelected, this.onPaste, this.onDuplicateSelected, this.hasClipboard, this.onUndo, this.onRedo, this.connectionLayerRenderer, this.parameterConnectionLayerRenderer, this.isSpacePressed, this.onNodeMoved, this.onNodeSelected, this.onConnectionSelected, this.onParameterChanged, this.onParameterGestureCommit, this.onParameterInputModeChanged, this.connectionStateManager, this.getSelectionState, this.canvasToScreen, this.setDraggedNodeIds, this.setPanStateInternal, this.setSelectionRectangleInternal, this.renderState, this.screenToCanvas];
  }

  private getViewStateInternal(): { panX: number; panY: number; zoom: number } {
    return this.stateBridge.getViewStateInternal();
  }

  private getSelectionState(): { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> } {
    return this.stateBridge.getSelectionState();
  }

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
    return this.stateBridge.getConnectionState();
  }

  private setConnectionState(state: ConnectionStateUpdate): void {
    this.stateBridge.setConnectionState(state);
  }

  private getPanState() {
    return this.stateBridge.getPanState();
  }

  private setPanState(state: Parameters<CanvasInteractionState['setPanState']>[0]): void {
    this.stateBridge.setPanState(state);
  }

  private getInteractionState() {
    return this.stateBridge.getInteractionState();
  }

  private setInteractionState(state: Parameters<CanvasInteractionState['setInteractionState']>[0]): void {
    this.stateBridge.setInteractionState(state);
  }

  private updateMousePosition(x: number, y: number): void {
    this.stateBridge.updateMousePosition(x, y);
  }

  getSelectionRectangle(): { x: number; y: number; width: number; height: number } | null {
    return this.selectionRectangle;
  }

  private setupManagerContexts(): void {
    // state is the backing store for stateSync and is passed to buildManagerContextDeps via source.state
    void this.state;
    setupManagerContexts(buildManagerContextDeps(this as unknown as ManagerContextSetupDepsSource));
  }

  /**
   * Setup interaction handler system (Phase 2.4)
   */
  private setupInteractionHandlers(): void {
    this.interactionManager = new InteractionManager();
    registerCanvasInteractionHandlers(this.interactionManager, this.createHandlerContext());
  }

  /**
   * Convert native mouse/wheel event to InteractionEvent
   */
  private createInteractionEvent(
    type: InteractionType,
    e: MouseEvent | WheelEvent,
    target: import('../interactions/InteractionHandler').InteractionEventTarget = null
  ): InteractionEvent {
    return createInteractionEventFromSource(this as unknown as import('./EventHandlerDeps').CreateInteractionEventSource, type, e, target);
  }
  
  /**
   * Initialize event handlers
   */
  private initializeEventHandlers(): void {
    const handlerContext = this.createHandlerContext();
    this.mouseEventHandler = new MouseEventHandler(
      buildMouseEventHandlerDeps(this as unknown as MouseEventHandlerDepsSource, handlerContext)
    );
    this.wheelEventHandler = new WheelEventHandler(
      buildWheelEventHandlerDeps(this as unknown as WheelEventHandlerDepsSource, handlerContext)
    );
    this.canvasStrictDoubleClick = createStrictDoubleClickHandler((e: MouseEvent) =>
      this.handleCanvasDoubleClick(e)
    );
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', (e) => this.mouseEventHandler.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.mouseEventHandler.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.mouseEventHandler.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.mouseEventHandler.handleMouseLeave());
    this.canvas.addEventListener('click', (e) => this.canvasStrictDoubleClick(e));
    this.canvas.addEventListener('wheel', (e) => this.wheelEventHandler.handleWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
  }
  
  private attachDocumentListeners(pointerId?: number): void {
    this.documentListeners.attach(
      (e) => this.mouseEventHandler.handleMouseMove(e),
      (e) => this.mouseEventHandler.handleMouseUp(e),
      pointerId
    );
  }

  private detachDocumentListeners(): void {
    this.documentListeners.detach();
  }

  handleFileParameterClick(nodeId: string, paramName: string, screenX: number, screenY: number): void { this.overlayManager.handleFileParameterClick(nodeId, paramName, screenX, screenY); }
  handleEnumParameterClick(nodeId: string, paramName: string, screenX: number, screenY: number): void { this.overlayManager.handleEnumParameterClick(nodeId, paramName, screenX, screenY); }
  handleColorPickerClick(nodeId: string, screenX: number, screenY: number): void { this.overlayManager.handleColorPickerClick(nodeId, screenX, screenY); }
  handleSignalPickerClick(screenX: number, screenY: number, targetNodeId: string, targetParameter: string): void { this.overlayManager.handleSignalPickerClick(screenX, screenY, targetNodeId, targetParameter); }

  private getCoordinateDeps(): CanvasCoordinateHelper.CanvasCoordinateHelperDeps {
    return {
      canvas: this.canvas,
      viewStateManager: this.viewStateManager,
      getConnectionRect: () => this.connectionRectProvider?.() ?? null,
      getFallbackRect: () => (this.parameterConnectionsOverlayCanvas?.getBoundingClientRect() ?? this.canvas.getBoundingClientRect())
    };
  }

  private screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    return CanvasCoordinateHelper.screenToCanvas(this.getCoordinateDeps(), screenX, screenY);
  }

  private getCanvasRectForConnections(): DOMRect {
    return CanvasCoordinateHelper.getCanvasRectForConnections(this.getCoordinateDeps());
  }

  public setConnectionRectProvider(fn: (() => DOMRect | null) | null): void {
    this.connectionRectProvider = fn;
  }

  private getParamPortPositionsFromDOM(): Map<string, { x: number; y: number }> {
    return CanvasCoordinateHelper.getParamPortPositionsFromDOM(this.getCoordinateDeps());
  }

  private getHeaderOutputPortPositionsFromDOM(): Map<string, { x: number; y: number }> {
    return CanvasCoordinateHelper.getHeaderOutputPortPositionsFromDOM(this.getCoordinateDeps());
  }

  private canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number } {
    return CanvasCoordinateHelper.canvasToScreen(this.getCoordinateDeps(), canvasX, canvasY);
  }
  
  // Hit testing is now handled by HitTestManager

  /** Check if click is on a connection. Used when DOM nodes block canvas (e.g. parameter connections over node body). */
  public hitTestConnectionAtScreen(screenX: number, screenY: number): string | null {
    return this.hitTestManager.hitTestConnection(screenX, screenY);
  }

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
   * Handle right-click on canvas: if over a node, show node context menu (Read Guide, Copy node name, Remove).
   */
  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const nodeId = this.hitTestManager.hitTestNode(e.clientX, e.clientY);
    if (!nodeId || !this.onNodeContextMenu) return;
    const node = this.graph.nodes.find((n) => n.id === nodeId);
    if (node) {
      this.onNodeContextMenu(e.clientX, e.clientY, node.id, node.type);
    }
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
  
  private renderSelectionRectangle(ctx?: CanvasRenderingContext2D): void {
    const rect = this.selectionRectangle;
    if (!rect) return;
    const c = ctx ?? this.ctx;
    const { zoom } = this.getViewStateInternal();
    c.save();
    c.fillStyle = 'rgba(100, 150, 255, 0.1)';
    c.strokeStyle = '#4a9eff';
    c.lineWidth = 1 / zoom;
    c.setLineDash([4 / zoom, 4 / zoom]);
    c.fillRect(rect.x, rect.y, rect.width, rect.height);
    c.strokeRect(rect.x, rect.y, rect.width, rect.height);
    c.setLineDash([]);
    c.restore();
  }

  public setActiveTool(tool: ToolType): void {
    this.activeToolInternal = tool;
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

  /**
   * Set the overlay canvas for parameter connections. When set, parameter connections
   * are rendered to this canvas instead of the main canvas, so they appear above DOM nodes.
   */
  public setParameterConnectionsOverlay(canvas: HTMLCanvasElement | null): void {
    this.parameterConnectionsOverlayCanvas = canvas;
    this.overlayRenderer?.updateDependencies({ parameterConnectionsOverlayCanvas: canvas });
  }

  /**
   * Set the top overlay canvas for temporary connection and selection rect.
   * When set, overlay content renders here (above DOM nodes) instead of the main canvas.
   */
  public setTopOverlayCanvas(canvas: HTMLCanvasElement | null): void {
    if (this.topOverlayCanvas === canvas) return;
    this.topOverlayCanvas = canvas;
    this.overlayRenderer?.updateDependencies({ topOverlayCanvas: canvas });
    if (canvas && this.overlayLayerRenderer && this.layerManager) {
      this.layerManager.unregister(RenderLayer.Overlays);
    } else if (!canvas && this.overlayLayerRenderer && this.layerManager) {
      this.layerManager.register(this.overlayLayerRenderer);
    }
  }

  /** Handle wheel for zoom. Public so wrapper can forward events from DOM-overlay area. */
  public handleWheel(e: WheelEvent): void {
    this.wheelEventHandler.handleWheel(e);
  }

  /** Handle mousedown from overlay (e.g. when hand tool active and DOM nodes would block). */
  public handleMouseDownFromOverlay(e: MouseEvent): void {
    this.mouseEventHandler.handleMouseDown(e);
  }
  
  public destroy(): void {
    this.effectiveValueUpdateRunner.stop();
    this.resizeLifecycle.dispose();
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

  public getAudioManager(): IAudioManager | undefined {
    return this.audioManager;
  }
  
  // renderRegularConnections and renderParameterConnections are now handled by ConnectionLayerRenderer and ParameterConnectionLayerRenderer
  
  // renderConnection is now handled by ConnectionLayerRenderer and ParameterConnectionLayerRenderer
  // renderTemporaryConnection is now handled by ConnectionStateManager
  
  /** Used by buildGraphUpdateContext (graphUpdate). */
  getGraph(): NodeGraph {
    return this.graph;
  }

  /** Used by buildGraphUpdateContext (graphUpdate). */
  setGraphInternal(graph: NodeGraph): void {
    this.graph = graph;
  }

  // Public API
  setGraph(
    graph: NodeGraph,
    options?: { preserveViewState?: boolean }
  ): void {
    applyGraphUpdate(buildGraphUpdateContext(this as unknown as import('./graphUpdate').GraphUpdateContextSource), graph, options);
  }
  
  setNodeSpecs(nodeSpecs: NodeSpec[]): void {
    this.nodeSpecs.clear();
    for (const spec of nodeSpecs) {
      this.nodeSpecs.set(spec.id, spec);
    }
    this.metricsManager.updateNodeMetrics();
    this.renderingOrchestrator.render();
  }
  
  fitToView(): void {
    fitToViewImpl(this as unknown as ViewFitterDeps);
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

  setZoom(zoom: number, centerX?: number, centerY?: number): void {
    setZoomImpl(this as unknown as ViewFitterDeps, zoom, centerX, centerY);
  }
  
  getNodeRenderer(): NodeRenderer {
    return this.nodeRenderer;
  }
  
  getNodeMetrics(): Map<string, NodeRenderMetrics> {
    return this.nodeMetrics;
  }

  /** Check if a node is visible in the viewport (for DOM layer culling). */
  isNodeVisible(node: NodeInstance, metrics: NodeRenderMetrics): boolean {
    return this.renderingOrchestrator.isNodeVisible(node, metrics);
  }

  /**
   * Set selection from DOM layer (when user clicks a node in DomNodeLayer).
   * Keeps canvas selection in sync so getViewState() and the wrapper's sync loop don't overwrite the selection.
   */
  public setSelectionFromDOM(nodeIds: string[]): void {
    this.selectionManager.selectNodes(nodeIds, true);
    this.renderingOrchestrator.requestRender();
  }

  /**
   * Select a connection from external UI (e.g. Patch tool cable pick). Matches normal connection-click visuals.
   */
  public setConnectionSelectionFromDOM(connectionId: string): void {
    const prev = this.selectionManager.getState();
    if (prev.selectedNodeIds.size > 0) {
      this.renderState.markNodesDirty(Array.from(prev.selectedNodeIds));
    }
    if (prev.selectedConnectionIds.size > 0) {
      this.renderState.markConnectionsDirty(Array.from(prev.selectedConnectionIds));
    }
    this.selectionManager.selectConnection(connectionId, false);
    this.renderState.markConnectionsDirty([connectionId]);
    this.renderingOrchestrator.requestRender();
  }

  /** Clear connection highlight only (e.g. leaving Patch tool). */
  public clearConnectionSelectionFromDOM(): void {
    const prev = this.selectionManager.getState().selectedConnectionIds;
    if (prev.size === 0) return;
    this.renderState.markConnectionsDirty(Array.from(prev));
    this.selectionManager.clearSelectedConnections();
    this.renderingOrchestrator.requestRender();
  }

  /**
   * Start connection drag from a port (called when DOM port receives pointerdown).
   * DOM nodes capture pointer events, so the canvas never receives port clicks directly.
   * When pointerId is provided, document-level pointer capture is used so the release
   * (pointerup) is guaranteed to be delivered to our document listener.
   */
  public startConnectionFromPort(screenX: number, screenY: number, pointerId?: number): boolean {
    const portHit = this.hitTestManager.hitTestPort(screenX, screenY);
    if (!portHit) return false;
    const syntheticEvent = new MouseEvent('mousedown', {
      clientX: screenX,
      clientY: screenY,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false
    });
    const event = this.createInteractionEvent(InteractionType.PortConnect, syntheticEvent, portHit);
    const started = this.interactionManager?.start(event);
    if (started) {
      this.attachDocumentListeners(pointerId);
    }
    return !!started;
  }

  /**
   * Programmatically center the viewport on a node and select it.
   * Used by timeline/automation UI to "jump to" the driven parameter's node.
   */
  public focusNode(nodeId: string, options?: { zoom?: number; targetScreenYFrac?: number }): void {
    const node = this.graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Ensure we have metrics to compute a reasonable center point.
    let metrics = this.nodeMetrics.get(nodeId);
    if (!metrics) {
      const spec = this.nodeSpecs.get(node.type);
      if (spec) {
        metrics = this.nodeRenderer.calculateMetrics(node, spec);
        this.nodeMetrics.set(nodeId, metrics);
      }
    }

    const w = metrics?.width ?? 240;
    const h = metrics?.height ?? 140;
    const centerCanvasX = node.position.x + w / 2;
    const centerCanvasY = node.position.y + h / 2;

    const rect = this.canvas.getBoundingClientRect();
    const zoom = options?.zoom ?? this.viewStateManager.getState().zoom;
    const targetScreenYFrac = options?.targetScreenYFrac ?? 0.38;
    const targetScreenX = rect.width / 2;
    const targetScreenY = rect.height * targetScreenYFrac;

    const panX = targetScreenX - centerCanvasX * zoom;
    const panY = targetScreenY - centerCanvasY * zoom;

    this.viewStateManager.setViewState({ zoom, panX, panY });
    this.selectionManager.selectNode(nodeId, false);
    this.renderingOrchestrator.requestRender();
  }

  private setDraggedNodeIds(nodeIds: string[]): void {
    this.draggedNodeIds = new Set(nodeIds);
    this.interactionState.setInteractionState({
      isDraggingNode: nodeIds.length > 0,
      draggingNodeId: nodeIds.length > 0 ? nodeIds[0] : null
    });
  }

  private setPanStateInternal(state: Parameters<CanvasInteractionState['setPanState']>[0]): void {
    this.interactionState.setPanState(state);
  }

  private setSelectionRectangleInternal(rect: { x: number; y: number; width: number; height: number } | null): void {
    this.selectionRectangle = rect;
  }

  getOnConnectionCreated(): NodeEditorCanvas['onConnectionCreated'] {
    return this.onConnectionCreated;
  }

  getActiveTool(): ToolType {
    return this.activeToolInternal;
  }

  public createHandlerContext(): HandlerContext {
    return createHandlerContext(this as unknown as HandlerContextSource);
  }

  setCallbacks(callbacks: CanvasCallbacks): void {
    setCallbacksImpl(this as unknown as SetCallbacksCanvas, callbacks);
  }
  
  /**
   * Set the spacebar state change callback (for visual feedback).
   * Pass `undefined` to clear when unwiring the canvas from the app shell.
   */
  public setSpacebarStateChangeCallback(callback: ((isPressed: boolean) => void) | undefined): void {
    this.onSpacebarStateChange = callback;
  }

  /**
   * Handle file parameter click - show file input dialog
   */
}
