/**
 * Node Component
 * 
 * Wraps NodeRenderer functionality in a component-based architecture.
 * Uses CanvasComponent base class for lifecycle management and state.
 * 
 * Phase 2.2: Architecture Improvements
 */

import { CanvasComponent, type ComponentMetrics, type ComponentState } from '../base/CanvasComponent';
import { NodeRenderer, type NodeRenderMetrics } from '../NodeRenderer';
import type { NodeInstance } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';

export interface NodeComponentState extends ComponentState {
  isSelected: boolean;
  hoveredPortName: string | null;
  isHoveredParameter: boolean | undefined;
  effectiveParameterValues: Map<string, number | null>;
  connectingPortName: string | null;
  isConnectingParameter: boolean | undefined;
  connectedParameters: Set<string>;
  /** Header port keys that have a connection: "input:name" or "output:name" */
  connectedHeaderPorts: Set<string>;
  skipPorts: boolean;
  /** Live incoming/outgoing values for audio-remap node (for needle markers) */
  audioRemapLiveValues?: { incoming: number | null; outgoing: number | null };
  /** Per-band live values for audio-analyzer band remap UI (bandIndex -> { incoming, outgoing }) */
  audioAnalyzerBandLiveValues?: Map<number, { incoming: number | null; outgoing: number | null }>;
}

/**
 * Component wrapper for node rendering
 * 
 * Provides component lifecycle and state management for nodes,
 * while delegating actual rendering to NodeRenderer.
 */
export class NodeComponent extends CanvasComponent {
  private nodeRenderer: NodeRenderer;
  private node: NodeInstance;
  private spec: NodeSpec;
  private nodeMetrics: NodeRenderMetrics | null = null;
  
  constructor(
    ctx: CanvasRenderingContext2D,
    node: NodeInstance,
    spec: NodeSpec,
    nodeRenderer: NodeRenderer,
    initialState: Partial<NodeComponentState> = {}
  ) {
    const defaultState: NodeComponentState = {
      isSelected: false,
      hoveredPortName: null,
      isHoveredParameter: undefined,
      effectiveParameterValues: new Map(),
      connectingPortName: null,
      isConnectingParameter: undefined,
      connectedParameters: new Set(),
      connectedHeaderPorts: new Set(),
      skipPorts: false,
      ...initialState
    };
    
    super(ctx, defaultState);
    this.nodeRenderer = nodeRenderer;
    this.node = node;
    this.spec = spec;
  }
  
  /**
   * Render the node
   */
  render(): void {
    // Always recalculate metrics - they may have changed due to parameter updates
    // The NodeRenderer's cache handles optimization, so this is safe to call every frame
    this.nodeMetrics = this.calculateNodeMetrics();
    
    // Delegate to NodeRenderer
    this.nodeRenderer.renderNode(
      this.node,
      this.spec,
      this.nodeMetrics,
      this.getState().isSelected,
      this.getState().hoveredPortName,
      this.getState().isHoveredParameter,
      this.getState().effectiveParameterValues,
      this.getState().connectingPortName,
      this.getState().isConnectingParameter,
      this.getState().connectedParameters,
      this.getState().skipPorts,
      this.getState().audioRemapLiveValues,
      this.getState().audioAnalyzerBandLiveValues
    );
  }
  
  /**
   * Render only the ports (called after connections are rendered)
   */
  renderPorts(): void {
    if (!this.nodeMetrics) {
      this.nodeMetrics = this.calculateNodeMetrics();
    }
    
    this.nodeRenderer.renderNodePorts(
      this.node,
      this.spec,
      this.nodeMetrics,
      this.getState().hoveredPortName,
      this.getState().isHoveredParameter,
      this.getState().connectingPortName,
      this.getState().isConnectingParameter,
      this.getState().connectedParameters,
      this.getState().connectedHeaderPorts
    );
  }
  
  /**
   * Calculate component metrics (position and size)
   */
  calculateMetrics(): ComponentMetrics {
    const nodeMetrics = this.calculateNodeMetrics();
    return {
      x: this.node.position.x,
      y: this.node.position.y,
      width: nodeMetrics.width,
      height: nodeMetrics.height
    };
  }
  
  /**
   * Calculate node render metrics
   */
  private calculateNodeMetrics(): NodeRenderMetrics {
    return this.nodeRenderer.calculateMetrics(this.node, this.spec);
  }
  
  /**
   * Test if a point hits this node
   */
  hitTest(x: number, y: number): boolean {
    return this.isPointInside(x, y);
  }
  
  /**
   * Update node position
   */
  setPosition(x: number, y: number): void {
    this.node.position.x = x;
    this.node.position.y = y;
    // Invalidate metrics cache when position changes
    this.nodeMetrics = null;
    // Recalculate component metrics
    this.metrics = this.calculateMetrics();
  }
  
  /**
   * Update the node reference (e.g. when graph is replaced via setGraph).
   * Ensures the component renders with current node data (e.g. parameter values during drag).
   */
  updateNode(node: NodeInstance): void {
    this.node = node;
    this.nodeMetrics = null;
  }

  /**
   * Get the underlying node instance
   */
  getNode(): NodeInstance {
    return this.node;
  }
  
  /**
   * Get the node specification
   */
  getSpec(): NodeSpec {
    return this.spec;
  }
  
  /**
   * Get node render metrics
   */
  getNodeMetrics(): NodeRenderMetrics {
    if (!this.nodeMetrics) {
      this.nodeMetrics = this.calculateNodeMetrics();
    }
    return this.nodeMetrics;
  }
  
  /**
   * Invalidate metrics cache (call when node properties change)
   */
  invalidateMetrics(): void {
    this.nodeMetrics = null;
  }
  
  /**
   * Lifecycle: Called when component state updates
   */
  onUpdate?(prevState: ComponentState): void {
    // Invalidate metrics if state changes that affect rendering
    const currentState = this.getState() as NodeComponentState;
    const prev = prevState as NodeComponentState;
    
    // If selection or connection state changed, metrics might need recalculation
    if (currentState.isSelected !== prev.isSelected ||
        currentState.skipPorts !== prev.skipPorts) {
      // Metrics don't change, but we might want to trigger a re-render
      // This is handled by the render system
    }
  }
}
