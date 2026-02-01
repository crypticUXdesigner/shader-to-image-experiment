/**
 * ConnectionStateManager
 * 
 * Manages connection state and temporary connection rendering for the node editor canvas.
 * Handles connection preview rendering, connection state variables, and connection hover logic.
 */

import type { NodeGraph } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../NodeRenderer';
import { getCSSColor, getCSSVariableAsNumber, getCSSColorRGBA } from '../../../utils/cssTokens';

export interface ConnectionState {
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
}

export interface ConnectionStateManagerDependencies {
  graph: NodeGraph;
  nodeSpecs: Map<string, NodeSpec>;
  nodeMetrics: Map<string, NodeRenderMetrics>;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  ctx: CanvasRenderingContext2D;
  hitTestPort: (screenX: number, screenY: number) => {
    nodeId: string;
    port: string;
    isOutput: boolean;
    parameter?: string;
  } | null;
}

export class ConnectionStateManager {
  private state: ConnectionState;
  private dependencies: ConnectionStateManagerDependencies;

  constructor(dependencies: ConnectionStateManagerDependencies) {
    this.dependencies = dependencies;
    this.state = {
      isConnecting: false,
      connectionStartNodeId: null,
      connectionStartPort: null,
      connectionStartParameter: null,
      connectionStartIsOutput: false,
      connectionMouseX: 0,
      connectionMouseY: 0,
      hoveredPort: null
    };
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Set connection state
   */
  setState(state: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...state };
  }

  /**
   * Get whether currently connecting
   */
  getIsConnecting(): boolean {
    return this.state.isConnecting;
  }

  /**
   * Get connection start node ID
   */
  getConnectionStartNodeId(): string | null {
    return this.state.connectionStartNodeId;
  }

  /**
   * Get connection start port
   */
  getConnectionStartPort(): string | null {
    return this.state.connectionStartPort;
  }

  /**
   * Get connection start parameter
   */
  getConnectionStartParameter(): string | null {
    return this.state.connectionStartParameter;
  }

  /**
   * Get whether connection start is output
   */
  getConnectionStartIsOutput(): boolean {
    return this.state.connectionStartIsOutput;
  }

  /**
   * Get connection mouse position
   */
  getConnectionMousePosition(): { x: number; y: number } {
    return {
      x: this.state.connectionMouseX,
      y: this.state.connectionMouseY
    };
  }

  /**
   * Get hovered port
   */
  getHoveredPort(): {
    nodeId: string;
    port: string;
    isOutput: boolean;
    parameter?: string;
  } | null {
    return this.state.hoveredPort;
  }

  /**
   * Update hovered port based on mouse position
   * This handles connection hover logic during connection drag
   */
  updateHoveredPort(mouseX: number, mouseY: number): void {
    if (!this.state.isConnecting) {
      this.state.hoveredPort = null;
      return;
    }

    // Check if hovering over a valid input port (only if dragging from output)
    if (this.state.connectionStartIsOutput) {
      const portHit = this.dependencies.hitTestPort(mouseX, mouseY);
      // Only highlight input ports (not outputs) and not the same node
      if (portHit && !portHit.isOutput && portHit.nodeId !== this.state.connectionStartNodeId) {
        this.state.hoveredPort = portHit;
      } else {
        this.state.hoveredPort = null;
      }
    } else {
      this.state.hoveredPort = null;
    }
  }

  /**
   * Update connection mouse position
   */
  updateConnectionMousePosition(mouseX: number, mouseY: number): void {
    this.state.connectionMouseX = mouseX;
    this.state.connectionMouseY = mouseY;
  }

  /**
   * Start connection from a port
   */
  startConnection(
    nodeId: string,
    port: string,
    parameter: string | null,
    isOutput: boolean,
    mouseX: number,
    mouseY: number
  ): void {
    this.state.isConnecting = true;
    this.state.connectionStartNodeId = nodeId;
    this.state.connectionStartPort = port;
    this.state.connectionStartParameter = parameter;
    this.state.connectionStartIsOutput = isOutput;
    this.state.connectionMouseX = mouseX;
    this.state.connectionMouseY = mouseY;
    this.state.hoveredPort = null;
  }

  /**
   * End connection
   */
  endConnection(): void {
    this.state.isConnecting = false;
    this.state.connectionStartNodeId = null;
    this.state.connectionStartPort = null;
    this.state.connectionStartParameter = null;
    this.state.connectionStartIsOutput = false;
    this.state.connectionMouseX = 0;
    this.state.connectionMouseY = 0;
    this.state.hoveredPort = null;
  }

  /**
   * Update dependencies (called when graph or metrics change)
   */
  updateDependencies(dependencies: Partial<ConnectionStateManagerDependencies>): void {
    this.dependencies = { ...this.dependencies, ...dependencies };
  }

  /**
   * Render temporary connection preview during connection drag
   * This renders the connection line from the source port to the mouse cursor
   */
  renderTemporaryConnection(): void {
    if (!this.state.connectionStartNodeId) return;
    
    const sourceNode = this.dependencies.graph.nodes.find(n => n.id === this.state.connectionStartNodeId);
    if (!sourceNode) return;
    
    const sourceSpec = this.dependencies.nodeSpecs.get(sourceNode.type);
    const sourceMetrics = this.dependencies.nodeMetrics.get(sourceNode.id);
    if (!sourceSpec || !sourceMetrics) return;
    
    // Get actual port position
    let sourcePortPos: { x: number; y: number } | undefined;
    
    if (this.state.connectionStartParameter) {
      // Parameter port
      sourcePortPos = sourceMetrics.parameterInputPortPositions.get(this.state.connectionStartParameter);
    } else if (this.state.connectionStartPort) {
      // Regular port
      const portKey = `${this.state.connectionStartIsOutput ? 'output' : 'input'}:${this.state.connectionStartPort}`;
      sourcePortPos = sourceMetrics.portPositions.get(portKey);
    }
    
    if (!sourcePortPos) return;
    
    const canvasPos = this.dependencies.screenToCanvas(this.state.connectionMouseX, this.state.connectionMouseY);
    let targetX = canvasPos.x;
    let targetY = canvasPos.y;
    
    let isSnapped = false;
    
    // Use hoveredPort if available (set by PortConnectHandler) - this is more reliable than hit testing again
    // Fallback to hitTestPort if hoveredPort is not set (for old code path)
    const portHit = this.state.hoveredPort || this.dependencies.hitTestPort(this.state.connectionMouseX, this.state.connectionMouseY);
    if (portHit && portHit.nodeId !== this.state.connectionStartNodeId) {
      // Check if this is a valid target port
      const isValidTarget = this.state.connectionStartIsOutput 
        ? !portHit.isOutput  // Dragging from output: can connect to input ports or parameters
        : portHit.isOutput;  // Dragging from input: can connect to output ports
      
      if (isValidTarget) {
        // Get the port position and snap to it
        const targetNode = this.dependencies.graph.nodes.find(n => n.id === portHit.nodeId);
        const targetSpec = this.dependencies.nodeSpecs.get(targetNode?.type || '');
        const targetMetrics = this.dependencies.nodeMetrics.get(portHit.nodeId);
        
        if (targetNode && targetSpec && targetMetrics) {
          let snappedPortPos: { x: number; y: number } | undefined;
          
          if (portHit.parameter) {
            // Parameter port
            snappedPortPos = targetMetrics.parameterInputPortPositions.get(portHit.parameter);
          } else {
            // Regular port
            const portKey = `${portHit.isOutput ? 'output' : 'input'}:${portHit.port}`;
            snappedPortPos = targetMetrics.portPositions.get(portKey);
          }
          
          if (snappedPortPos) {
            targetX = snappedPortPos.x;
            targetY = snappedPortPos.y;
            isSnapped = true;
          }
        }
      }
    }
    
    const sourceX = sourcePortPos.x;
    const sourceY = sourcePortPos.y;
    
    // Bezier curve with strong horizontal movement
    // Output connections: move straight right first (100px), then come in from left
    // Input connections: move straight left first (100px), then come in from right
    const cp1X = this.state.connectionStartIsOutput ? sourceX + 100 : sourceX - 100;
    const cp1Y = sourceY;
    const cp2X = this.state.connectionStartIsOutput ? targetX - 100 : targetX + 100;
    const cp2Y = targetY;
    
    // Get connection color based on source port type
    let portType: string = 'float';
    if (this.state.connectionStartParameter) {
      // For parameter connections, get type from parameter spec
      const paramSpec = sourceSpec.parameters[this.state.connectionStartParameter];
      if (paramSpec) {
        // Map parameter types to port types (some parameter types match port types)
        portType = paramSpec.type === 'vec4' ? 'vec4' : 
                   paramSpec.type === 'float' ? 'float' : 'float';
      }
    } else if (this.state.connectionStartPort) {
      // For regular port connections, get type from port spec
      if (this.state.connectionStartIsOutput) {
        const portSpec = sourceSpec.outputs.find(p => p.name === this.state.connectionStartPort);
        portType = portSpec?.type || 'float';
      } else {
        const portSpec = sourceSpec.inputs.find(p => p.name === this.state.connectionStartPort);
        portType = portSpec?.type || 'float';
      }
    }
    
    // Map port type to connection color token (float→parameter port uses dedicated token when hovering a param)
    const connectionColorMap: Record<string, string> = {
      'float': 'connection-color-float',
      'vec2': 'connection-color-vec2',
      'vec3': 'connection-color-vec3',
      'vec4': 'connection-color-vec4',
      'int': 'connection-color-int',
      'bool': 'connection-color-bool'
    };
    let connectionColorToken = connectionColorMap[portType] || 'connection-color-default';
    if (portType === 'float' && this.state.hoveredPort?.parameter) {
      connectionColorToken = 'connection-color-float-parameter';
    }
    const connectionColor = getCSSColor(connectionColorToken, getCSSColor('connection-color-default', getCSSColor('color-gray-100', '#747e87')));
    
    // Draw preview port at cursor position first (smaller, slightly transparent)
    // We'll render it directly here since renderPort is private
    const previewScale = 0.8; // 80% size
    const previewOpacity = 0.7; // 70% opacity
    const previewRadius = getCSSVariableAsNumber('port-radius', 4) * previewScale;
    
    // Draw highlight circle (connecting state) - use green color from token
    const highlightRadius = previewRadius * 3.5;
    const draggingColorRGBA = getCSSColorRGBA('port-dragging-color', { r: 0, g: 255, b: 136, a: 1 });
    const draggingOuterOpacity = getCSSVariableAsNumber('port-dragging-outer-opacity', 0.6);
    
    // Calculate actual opacity value (multiply before using in string)
    const actualOuterOpacity = draggingOuterOpacity * previewOpacity;
    
    // Draw larger transparent circle behind (outer highlight)
    this.dependencies.ctx.fillStyle = `rgba(${draggingColorRGBA.r}, ${draggingColorRGBA.g}, ${draggingColorRGBA.b}, ${actualOuterOpacity})`;
    this.dependencies.ctx.beginPath();
    this.dependencies.ctx.arc(targetX, targetY, highlightRadius, 0, Math.PI * 2);
    this.dependencies.ctx.fill();
    
    // Draw solid green port on top (inner circle)
    this.dependencies.ctx.fillStyle = `rgba(${draggingColorRGBA.r}, ${draggingColorRGBA.g}, ${draggingColorRGBA.b}, ${previewOpacity})`;
    this.dependencies.ctx.beginPath();
    this.dependencies.ctx.arc(targetX, targetY, previewRadius, 0, Math.PI * 2);
    this.dependencies.ctx.fill();
    
    const tempConnectionWidth = getCSSVariableAsNumber('connection-width', 2);
    this.dependencies.ctx.strokeStyle = connectionColor;
    this.dependencies.ctx.lineWidth = tempConnectionWidth;
    
    // Use dotted line when not snapped, solid when snapped
    if (isSnapped) {
      // Solid line when snapped
      this.dependencies.ctx.setLineDash([]);
    } else {
      // Dotted line when not snapped
      const dashPattern = [2, 18]; // 2px dash, 10px gap
      this.dependencies.ctx.setLineDash(dashPattern);
    }
    
    this.dependencies.ctx.beginPath();
    this.dependencies.ctx.moveTo(sourceX, sourceY);
    this.dependencies.ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, targetX, targetY);
    this.dependencies.ctx.stroke();
    
    // Reset line dash pattern to prevent state leakage
    this.dependencies.ctx.setLineDash([]);
  }
}
