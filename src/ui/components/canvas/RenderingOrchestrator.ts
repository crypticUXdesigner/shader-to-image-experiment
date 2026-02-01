/**
 * RenderingOrchestrator
 * 
 * Orchestrates rendering operations for the node editor canvas.
 * Handles render loop coordination, dirty region management, and visibility culling.
 */

import type { NodeGraph, NodeInstance, Connection } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../NodeRenderer';
import { NodeRenderer } from '../NodeRenderer';
import { NodeComponent } from '../node/NodeComponent';
import { LayerManager } from '../rendering/LayerManager';
import { RenderState, RenderLayer } from '../rendering/RenderState';
import { ViewStateManager } from './ViewStateManager';
import { ConnectionStateManager } from './ConnectionStateManager';
import { getCSSColor, getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { isRectVisibleWithMargin, type Viewport } from '../../../utils/viewport';
import { computeEffectiveParameterValue, getAudioRemapLiveValues, getAudioAnalyzerBandLiveValues } from '../../../utils/parameterValueCalculator';
import type { IAudioManager } from '../../../runtime/types';

export interface RenderingOrchestratorDependencies {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  graph: NodeGraph;
  nodeSpecs: Map<string, NodeSpec>;
  nodeMetrics: Map<string, NodeRenderMetrics>;
  nodeComponents: Map<string, NodeComponent>;
  nodeRenderer: NodeRenderer;
  layerManager: LayerManager;
  renderState: RenderState;
  viewStateManager: ViewStateManager;
  connectionStateManager: ConnectionStateManager;
  audioManager?: IAudioManager;
  // Callbacks for rendering overlays
  getViewStateInternal: () => { panX: number; panY: number; zoom: number };
  getSelectionState: () => { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> };
  getCachedViewportDimensions: () => { width: number; height: number };
  renderSmartGuides: () => void;
  renderSelectionRectangle: () => void;
  getCurrentSmartGuides: () => { vertical: Array<{ x: number; startY: number; endY: number }>; horizontal: Array<{ y: number; startX: number; endX: number }> };
  getIsDraggingNode: () => boolean;
  getDraggingNodeId: () => string | null;
  getSelectionRectangle: () => { x: number; y: number; width: number; height: number } | null;
  processPendingResize: () => void;
}

export class RenderingOrchestrator {
  private dependencies: RenderingOrchestratorDependencies;
  
  // Rendering state
  private renderRequested: boolean = false;
  private pendingRenderFrame: number | null = null;
  private previousPanX: number = 0;
  private previousPanY: number = 0;
  private previousZoom: number = 1.0;

  constructor(dependencies: RenderingOrchestratorDependencies) {
    this.dependencies = dependencies;
    
    // Initialize previous pan/zoom values
    const viewState = dependencies.viewStateManager.getState();
    this.previousPanX = viewState.panX;
    this.previousPanY = viewState.panY;
    this.previousZoom = viewState.zoom;
  }

  /**
   * Update one or more dependencies (e.g. when graph is replaced via setGraph).
   * Call this from NodeEditorCanvas.setGraph so the orchestrator uses the new graph.
   */
  updateDependencies(updates: Partial<RenderingOrchestratorDependencies>): void {
    Object.assign(this.dependencies, updates);
  }

  /**
   * Request a render on the next animation frame
   * Batches multiple render requests into a single frame
   */
  requestRender(): void {
    if (this.renderRequested) {
      return; // Already scheduled
    }
    
    this.renderRequested = true;
    this.pendingRenderFrame = requestAnimationFrame(() => {
      this.render();
      this.renderRequested = false;
      this.pendingRenderFrame = null;
    });
  }

  /**
   * Mark full redraw needed and request render
   */
  markFullRedraw(): void {
    this.dependencies.renderState.markFullRedraw();
    this.requestRender();
  }

  /**
   * Main render method - orchestrates the entire rendering process
   */
  render(): void {
    // Process pending resize before rendering
    // Resize is handled by handleResize() which processes it on next frame
    // But if we're rendering and resize is pending, process it now for immediate update
    this.dependencies.processPendingResize();
    
    const { width, height } = this.dependencies.canvas;
    
    // Detect pan/zoom changes (require full redraw for incremental rendering)
    const viewState = this.dependencies.getViewStateInternal();
    const panChanged = viewState.panX !== this.previousPanX || viewState.panY !== this.previousPanY;
    const zoomChanged = viewState.zoom !== this.previousZoom;
    
    // PERFORMANCE OPTIMIZATION: Check if this is a pan-only update (no content changes)
    const dirtyNodes = this.dependencies.renderState.getDirtyNodes();
    const dirtyConnections = this.dependencies.renderState.getDirtyConnections();
    const isPanOnly = panChanged && !zoomChanged && dirtyNodes.size === 0 && dirtyConnections.size === 0;
    
    if (panChanged || zoomChanged) {
      // Viewport changed - require full redraw
      this.dependencies.renderState.markFullRedraw();
      
      // Update previous values
      this.previousPanX = viewState.panX;
      this.previousPanY = viewState.panY;
      this.previousZoom = viewState.zoom;
      this.dependencies.viewStateManager.markRendered();
    }
    
    // PERFORMANCE OPTIMIZATION: Skip unnecessary recalculations during pan-only updates
    // When only panning (no nodes/connections changed), we don't need to recalculate
    // metrics or dirty regions - just render with the new pan offset
    if (!isPanOnly) {
      // Recalculate metrics for dirty nodes before calculating dirty regions
      // This ensures metrics are up-to-date when parameters change
      this.recalculateMetricsForDirtyNodes();
      
      // Update dirty regions before rendering (calculate screen-space regions)
      this.updateDirtyRegions();
    }
    
    // Standard rendering: always clear and render everything
    // FrameBuffer removed - getImageData/putImageData was too expensive
    this.dependencies.ctx.clearRect(0, 0, width, height);
    this.fillBackground();
    
    // Always render all visible content
    // Note: Without FrameBuffer, we can't do true incremental rendering (restore previous frame)
    // So we always render everything visible, but layers can use dirty regions as optimization hints
    this.renderContent();
    
    // Clear dirty state after rendering
    this.dependencies.renderState.clear();
  }

  /**
   * Fill canvas background (public for resize handling)
   */
  public fillBackground(): void {
    const canvasBg = getCSSColor('canvas-bg', getCSSColor('color-gray-40', '#0a0a0e'));
    this.dependencies.ctx.fillStyle = canvasBg;
    this.dependencies.ctx.fillRect(0, 0, this.dependencies.canvas.width, this.dependencies.canvas.height);
  }

  /**
   * Render all content (grid, nodes, connections, etc.)
   */
  private renderContent(): void {
    // LayerManager is always initialized in constructor
    if (!this.dependencies.layerManager) {
      console.error('LayerManager not initialized');
      return;
    }
    
    // Save context
    this.dependencies.ctx.save();
    
    // Apply pan/zoom transform
    const viewState = this.dependencies.getViewStateInternal();
    this.dependencies.ctx.translate(viewState.panX, viewState.panY);
    this.dependencies.ctx.scale(viewState.zoom, viewState.zoom);
    
    // Render layers (grid, connections, nodes, ports, overlays)
    this.dependencies.layerManager.render(this.dependencies.ctx, this.dependencies.renderState);
    
    // Render smart guides (if dragging node)
    const smartGuides = this.dependencies.getCurrentSmartGuides();
    if (smartGuides.vertical.length > 0 || smartGuides.horizontal.length > 0 || 
        (this.dependencies.getIsDraggingNode() && this.dependencies.getDraggingNodeId())) {
      this.dependencies.renderSmartGuides();
    }
    
    // Render selection rectangle (if selection tool is active)
    if (this.dependencies.getSelectionRectangle()) {
      this.dependencies.renderSelectionRectangle();
    }
    
    // Restore context
    this.dependencies.ctx.restore();
  }

  /**
   * Render a node
   */
  renderNode(node: NodeInstance, skipPorts: boolean = false): void {
    const spec = this.dependencies.nodeSpecs.get(node.type);
    if (!spec) return;
    
    // Use NodeComponent system
    this.renderNodeWithComponent(node, spec, skipPorts);
  }

  /**
   * Render node using NodeComponent (Phase 2.2)
   */
  private renderNodeWithComponent(node: NodeInstance, spec: NodeSpec, skipPorts: boolean = false): void {
    // Get or create NodeComponent for this node
    let component = this.dependencies.nodeComponents.get(node.id);
    if (!component) {
      component = new NodeComponent(this.dependencies.ctx, node, spec, this.dependencies.nodeRenderer);
      this.dependencies.nodeComponents.set(node.id, component);
      component.mount();
    } else {
      // Sync node reference so parameter/value updates (e.g. during drag) are visible
      component.updateNode(node);
    }
    
    // Update component state
    const selection = this.dependencies.getSelectionState();
    const isSelected = selection.selectedNodeIds.has(node.id);
    const hoveredPort = this.dependencies.connectionStateManager.getHoveredPort();
    const isPortHovered = hoveredPort && hoveredPort.nodeId === node.id;
    const hoveredPortName = isPortHovered ? (hoveredPort!.parameter || hoveredPort!.port) : null;
    const isHoveredParameter = isPortHovered ? !!hoveredPort!.parameter : undefined;
    
    let connectingPortName: string | null = null;
    let isConnectingParameter: boolean | undefined = undefined;
    if (this.dependencies.connectionStateManager.getIsConnecting() && 
        this.dependencies.connectionStateManager.getConnectionStartNodeId() === node.id) {
      connectingPortName = this.dependencies.connectionStateManager.getConnectionStartParameter() || 
                          this.dependencies.connectionStateManager.getConnectionStartPort() || null;
      isConnectingParameter = !!this.dependencies.connectionStateManager.getConnectionStartParameter();
    }
    
    // Compute effective parameter values for parameters with input connections
    const effectiveParameterValues = new Map<string, number | null>();
    const connectedParameters = new Set<string>();
    
    for (const [paramName, paramSpec] of Object.entries(spec.parameters)) {
      if (paramSpec.type === 'float') {
        const effectiveValue = computeEffectiveParameterValue(
          node,
          paramName,
          paramSpec,
          this.dependencies.graph,
          this.dependencies.nodeSpecs,
          this.dependencies.audioManager
        );
        effectiveParameterValues.set(paramName, effectiveValue);
        
        // Check if this parameter has a connection
        const hasConnection = this.dependencies.graph.connections.some(
          conn => conn.targetNodeId === node.id && conn.targetParameter === paramName
        );
        if (hasConnection) {
          connectedParameters.add(paramName);
        }
      }
    }
    
    // Compute live incoming/outgoing values for audio-remap (for needle markers)
    let audioRemapLiveValues: { incoming: number | null; outgoing: number | null } | undefined;
    if (node.type === 'audio-remap') {
      audioRemapLiveValues = getAudioRemapLiveValues(
        node,
        this.dependencies.graph,
        this.dependencies.nodeSpecs,
        this.dependencies.audioManager
      );
    }

    // Compute per-band live values for audio-analyzer band remap UI (needle markers)
    let audioAnalyzerBandLiveValues: Map<number, { incoming: number | null; outgoing: number | null }> | undefined;
    if (node.type === 'audio-analyzer') {
      audioAnalyzerBandLiveValues = getAudioAnalyzerBandLiveValues(
        node,
        this.dependencies.graph,
        this.dependencies.nodeSpecs,
        this.dependencies.audioManager
      );
    }

    // Update component state
    component.setState({
      isSelected,
      hoveredPortName,
      isHoveredParameter,
      effectiveParameterValues,
      connectingPortName,
      isConnectingParameter,
      connectedParameters,
      skipPorts,
      audioRemapLiveValues,
      audioAnalyzerBandLiveValues
    });
    
    // Always invalidate and recalculate metrics - they depend on node.position which changes when dragging
    // The component's cache will handle optimization for non-position changes
    component.invalidateMetrics();
    
    // Recalculate component metrics (bounds) to reflect current node position
    // This ensures the component's bounds are up-to-date for hit testing and viewport culling
    component.calculateMetrics();
    
    // Store metrics for viewport culling (component will recalculate on next getNodeMetrics call)
    const metrics = component.getNodeMetrics();
    this.dependencies.nodeMetrics.set(node.id, metrics);
    
    // Render the component
    component.render();
  }

  /**
   * Render node ports
   */
  renderNodePorts(): void {
    // Use NodeComponent system
    this.renderNodePortsWithComponent();
  }

  /**
   * Render node ports using NodeComponent (Phase 2.2)
   */
  private renderNodePortsWithComponent(): void {
    // Always render all visible node ports - dirty tracking controls when to trigger renders
    // Viewport culling filters out off-screen nodes for performance
    for (const node of this.dependencies.graph.nodes) {
      const component = this.dependencies.nodeComponents.get(node.id);
      if (!component) continue;
      
      const metrics = component.getNodeMetrics();
      
      // Check visibility before rendering (viewport culling)
      if (!this.isNodeVisible(node, metrics)) {
        continue; // Skip off-screen nodes
      }
      
      // Update component state for port rendering
      const hoveredPort = this.dependencies.connectionStateManager.getHoveredPort();
      const isPortHovered = hoveredPort && hoveredPort.nodeId === node.id;
      const hoveredPortName = isPortHovered ? (hoveredPort!.parameter || hoveredPort!.port) : null;
      const isHoveredParameter = isPortHovered ? !!hoveredPort!.parameter : undefined;
      
      let connectingPortName: string | null = null;
      let isConnectingParameter: boolean | undefined = undefined;
      if (this.dependencies.connectionStateManager.getIsConnecting() && 
          this.dependencies.connectionStateManager.getConnectionStartNodeId() === node.id) {
        connectingPortName = this.dependencies.connectionStateManager.getConnectionStartParameter() || 
                            this.dependencies.connectionStateManager.getConnectionStartPort() || null;
        isConnectingParameter = !!this.dependencies.connectionStateManager.getConnectionStartParameter();
      }
      
      // Calculate connected parameters for this node
      const connectedParameters = new Set<string>();
      const spec = component.getSpec();
      for (const [paramName, paramSpec] of Object.entries(spec.parameters)) {
        if (paramSpec.type === 'float') {
          const hasConnection = this.dependencies.graph.connections.some(
            conn => conn.targetNodeId === node.id && conn.targetParameter === paramName
          );
          if (hasConnection) {
            connectedParameters.add(paramName);
          }
        }
      }
      
      // Calculate connected header ports (input/output port names that have a wire)
      const connectedHeaderPorts = new Set<string>();
      for (const conn of this.dependencies.graph.connections) {
        if (conn.sourceNodeId === node.id) {
          connectedHeaderPorts.add(`output:${conn.sourcePort}`);
        }
        if (conn.targetNodeId === node.id && conn.targetPort != null) {
          connectedHeaderPorts.add(`input:${conn.targetPort}`);
        }
      }
      
      // Update component state for ports
      const currentState = component.getState();
      component.setState({
        ...currentState,
        hoveredPortName,
        isHoveredParameter,
        connectingPortName,
        isConnectingParameter,
        connectedParameters,
        connectedHeaderPorts
      });
      
      // Render ports
      component.renderPorts();
    }
  }

  /**
   * Get current viewport information
   */
  private getViewport(): Viewport {
    // Use cached dimensions if available, fallback to getBoundingClientRect
    // This ensures consistent viewport calculations during resize
    const cached = this.dependencies.getCachedViewportDimensions();
    const width = cached.width || this.dependencies.canvas.getBoundingClientRect().width;
    const height = cached.height || this.dependencies.canvas.getBoundingClientRect().height;
    const viewState = this.dependencies.getViewStateInternal();
    
    return {
      x: viewState.panX,
      y: viewState.panY,
      width,
      height,
      zoom: viewState.zoom
    };
  }

  /**
   * Check if a node is visible in the viewport (fully or partially)
   * Uses margin for smooth panning (100px margin by default)
   */
  isNodeVisible(node: NodeInstance, metrics: NodeRenderMetrics): boolean {
    const viewport = this.getViewport();
    // Use margin-based culling for smooth panning (100px margin)
    return isRectVisibleWithMargin(
      node.position.x,
      node.position.y,
      metrics.width,
      metrics.height,
      viewport,
      100 // 100px margin for smooth panning
    );
  }

  /**
   * Check if a connection is visible in the viewport
   * A connection is visible if at least one of its endpoints is visible
   */
  isConnectionVisible(conn: Connection): boolean {
    const sourceNode = this.dependencies.graph.nodes.find(n => n.id === conn.sourceNodeId);
    const targetNode = this.dependencies.graph.nodes.find(n => n.id === conn.targetNodeId);
    
    if (!sourceNode || !targetNode) return false;
    
    const sourceMetrics = this.dependencies.nodeMetrics.get(sourceNode.id);
    const targetMetrics = this.dependencies.nodeMetrics.get(targetNode.id);
    
    // If we don't have metrics yet, render the connection (it will be calculated)
    if (!sourceMetrics || !targetMetrics) return true;
    
    // Connection is visible if either node is visible
    return this.isNodeVisible(sourceNode, sourceMetrics) || this.isNodeVisible(targetNode, targetMetrics);
  }

  /**
   * Phase 3.1: Calculate screen-space dirty region for a node
   * Converts node bounds from canvas space to screen space
   */
  private calculateNodeDirtyRegion(nodeId: string): { x: number; y: number; width: number; height: number } | null {
    const node = this.dependencies.graph.nodes.find(n => n.id === nodeId);
    if (!node) return null;
    
    const metrics = this.dependencies.nodeMetrics.get(nodeId);
    if (!metrics) return null;
    
    // Node bounds in canvas space
    const canvasX = node.position.x;
    const canvasY = node.position.y;
    const canvasWidth = metrics.width;
    const canvasHeight = metrics.height;
    
    // Convert to screen space
    const rect = this.dependencies.canvas.getBoundingClientRect();
    const screenTopLeft = this.dependencies.viewStateManager.canvasToScreen(canvasX, canvasY, rect);
    const screenBottomRight = this.dependencies.viewStateManager.canvasToScreen(canvasX + canvasWidth, canvasY + canvasHeight, rect);
    const screenX = screenTopLeft.x;
    const screenY = screenTopLeft.y;
    const screenWidth = screenBottomRight.x - screenX;
    const screenHeight = screenBottomRight.y - screenY;
    
    // Add padding to account for connections, ports, parameter ports, mode buttons, etc.
    // Nodes with connected parameter ports need extra padding for parameter UI elements
    const hasConnectedParams = this.dependencies.graph.connections.some(
      conn => conn.targetNodeId === nodeId && conn.targetParameter
    );
    const padding = hasConnectedParams ? 100 : 50; // More padding for nodes with parameter connections
    
    return {
      x: Math.max(0, screenX - padding),
      y: Math.max(0, screenY - padding),
      width: Math.min(this.dependencies.canvas.width, screenWidth + padding * 2),
      height: Math.min(this.dependencies.canvas.height, screenHeight + padding * 2)
    };
  }

  /**
   * Phase 3.1: Calculate screen-space dirty region for a connection
   * Estimates connection bounds based on source and target node positions
   */
  private calculateConnectionDirtyRegion(connection: Connection): { x: number; y: number; width: number; height: number } | null {
    const sourceNode = this.dependencies.graph.nodes.find(n => n.id === connection.sourceNodeId);
    const targetNode = this.dependencies.graph.nodes.find(n => n.id === connection.targetNodeId);
    
    if (!sourceNode || !targetNode) return null;
    
    const sourceMetrics = this.dependencies.nodeMetrics.get(connection.sourceNodeId);
    const targetMetrics = this.dependencies.nodeMetrics.get(connection.targetNodeId);
    
    if (!sourceMetrics || !targetMetrics) return null;
    
    // Get actual port positions (not node centers)
    let sourcePortPos: { x: number; y: number } | undefined;
    let targetPortPos: { x: number; y: number } | undefined;
    
    if (connection.targetParameter) {
      // Parameter connection
      sourcePortPos = sourceMetrics.portPositions.get(`output:${connection.sourcePort}`);
      targetPortPos = targetMetrics.parameterInputPortPositions.get(connection.targetParameter);
    } else {
      // Regular connection
      sourcePortPos = sourceMetrics.portPositions.get(`output:${connection.sourcePort}`);
      targetPortPos = targetMetrics.portPositions.get(`input:${connection.targetPort}`);
    }
    
    if (!sourcePortPos || !targetPortPos) return null;
    
    const sourceX = sourcePortPos.x;
    const sourceY = sourcePortPos.y;
    const targetX = targetPortPos.x;
    const targetY = targetPortPos.y;
    
    // Calculate bezier curve control points (matches connection rendering)
    const cp1X = sourceX + 100;
    const cp1Y = sourceY;
    const cp2X = targetX - 100;
    const cp2Y = targetY;
    
    // Convert to screen space
    const rect = this.dependencies.canvas.getBoundingClientRect();
    const sourceScreen = this.dependencies.viewStateManager.canvasToScreen(sourceX, sourceY, rect);
    const targetScreen = this.dependencies.viewStateManager.canvasToScreen(targetX, targetY, rect);
    const cp1Screen = this.dependencies.viewStateManager.canvasToScreen(cp1X, cp1Y, rect);
    const cp2Screen = this.dependencies.viewStateManager.canvasToScreen(cp2X, cp2Y, rect);
    const sourceScreenX = sourceScreen.x;
    const sourceScreenY = sourceScreen.y;
    const targetScreenX = targetScreen.x;
    const targetScreenY = targetScreen.y;
    const cp1ScreenX = cp1Screen.x;
    const cp1ScreenY = cp1Screen.y;
    const cp2ScreenX = cp2Screen.x;
    const cp2ScreenY = cp2Screen.y;
    
    // Calculate bounding box including all bezier curve points
    const minX = Math.min(sourceScreenX, targetScreenX, cp1ScreenX, cp2ScreenX);
    const maxX = Math.max(sourceScreenX, targetScreenX, cp1ScreenX, cp2ScreenX);
    const minY = Math.min(sourceScreenY, targetScreenY, cp1ScreenY, cp2ScreenY);
    const maxY = Math.max(sourceScreenY, targetScreenY, cp1ScreenY, cp2ScreenY);
    
    // Add padding for line width (selected connections are thicker) and anti-aliasing
    const maxLineWidth = getCSSVariableAsNumber('connection-width-selected', 3);
    const padding = Math.max(50, maxLineWidth * 2); // At least 50px, or 2x line width
    
    return {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      width: Math.min(this.dependencies.canvas.width, maxX - minX + padding * 2),
      height: Math.min(this.dependencies.canvas.height, maxY - minY + padding * 2)
    };
  }

  /**
   * Recalculate metrics for dirty nodes before calculating dirty regions
   * This ensures metrics are up-to-date when parameters change
   * 
   * OPTIMIZATION: Uses lazy recalculation - only recalculates when needed.
   * The NodeMetricsCalculator's optimized cache key ensures that value-only
   * parameter changes don't trigger expensive recalculations.
   */
  private recalculateMetricsForDirtyNodes(): void {
    const dirtyNodes = this.dependencies.renderState.getDirtyNodes();
    
    for (const nodeId of dirtyNodes) {
      const node = this.dependencies.graph.nodes.find(n => n.id === nodeId);
      if (!node) continue;
      
      const spec = this.dependencies.nodeSpecs.get(node.type);
      if (!spec) continue;
      
      // Invalidate node cache (metrics or content may have changed)
      // The cache will be regenerated on next render with new metrics
      const oldMetrics = this.dependencies.nodeMetrics.get(nodeId);
      if (oldMetrics) {
        this.dependencies.nodeRenderer.clearNodeCache(node, spec, oldMetrics);
      }
      
      // Recalculate metrics - the NodeMetricsCalculator's optimized cache key
      // will handle value-only parameter changes efficiently (cache hits)
      // Only layout-affecting changes will trigger actual recalculation
      const metrics = this.dependencies.nodeRenderer.calculateMetrics(node, spec);
      this.dependencies.nodeMetrics.set(nodeId, metrics);
      
      // Also update component metrics if component exists
      const component = this.dependencies.nodeComponents.get(nodeId);
      if (component) {
        component.invalidateMetrics();
        this.dependencies.nodeMetrics.set(nodeId, component.getNodeMetrics());
      }
    }
  }

  /**
   * Phase 3.1: Update dirty regions based on dirty nodes and connections
   * Called before rendering to calculate screen-space regions
   */
  private updateDirtyRegions(): void {
    // Clear existing regions (will recalculate)
    const dirtyNodes = this.dependencies.renderState.getDirtyNodes();
    const dirtyConnections = this.dependencies.renderState.getDirtyConnections();
    
    // Check if any dirty nodes have parameter connections - if so, we need to be more careful
    const nodesWithParamConnections = new Set<string>();
    for (const nodeId of dirtyNodes) {
      const hasParamConnections = this.dependencies.graph.connections.some(
        conn => conn.targetNodeId === nodeId && conn.targetParameter
      );
      if (hasParamConnections) {
        nodesWithParamConnections.add(nodeId);
        // Also mark parameter connections layer as dirty to ensure proper rendering
        this.dependencies.renderState.markLayerDirty(RenderLayer.ParameterConnections);
      }
    }
    
    // Calculate regions for dirty nodes
    for (const nodeId of dirtyNodes) {
      const region = this.calculateNodeDirtyRegion(nodeId);
      if (region) {
        // Validate region is reasonable (not way too large)
        const maxRegionSize = Math.max(this.dependencies.canvas.width, this.dependencies.canvas.height) * 2;
        if (region.width <= maxRegionSize && region.height <= maxRegionSize) {
          this.dependencies.renderState.addDirtyRegion(region);
        } else {
          // Region is suspiciously large - trigger full redraw instead
          this.dependencies.renderState.markFullRedraw();
          return;
        }
      }
    }
    
    // Calculate regions for dirty connections
    for (const connId of dirtyConnections) {
      const connection = this.dependencies.graph.connections.find(c => c.id === connId);
      if (connection) {
        const region = this.calculateConnectionDirtyRegion(connection);
        if (region) {
          // Validate region is reasonable
          const maxRegionSize = Math.max(this.dependencies.canvas.width, this.dependencies.canvas.height) * 2;
          if (region.width <= maxRegionSize && region.height <= maxRegionSize) {
            this.dependencies.renderState.addDirtyRegion(region);
          } else {
            // Region is suspiciously large - trigger full redraw instead
            this.dependencies.renderState.markFullRedraw();
            return;
          }
        }
      }
    }
    
    // If grid layer is dirty, mark entire viewport as dirty (grid covers everything)
    if (this.dependencies.renderState.isLayerDirty(RenderLayer.Grid)) {
      this.dependencies.renderState.addDirtyRegion({
        x: 0,
        y: 0,
        width: this.dependencies.canvas.width,
        height: this.dependencies.canvas.height
      });
    }
  }

  /**
   * Cancel pending render frame
   */
  cancelPendingRender(): void {
    if (this.pendingRenderFrame !== null) {
      cancelAnimationFrame(this.pendingRenderFrame);
      this.pendingRenderFrame = null;
      this.renderRequested = false;
    }
  }
}
