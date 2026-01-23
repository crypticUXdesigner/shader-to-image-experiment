// Node Editor Canvas Component
// Implements infinite canvas with pan/zoom, grid, and node/connection rendering

import type { NodeGraph, NodeInstance, Connection } from '../../types/nodeGraph';
import type { NodeSpec } from '../../types/nodeSpec';
import { NodeRenderer, type NodeRenderMetrics } from './NodeRenderer';
import { getCSSColor, getCSSVariableAsNumber, getCSSVariable } from '../../utils/cssTokens';

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
  
  // Interaction state
  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;
  private isDraggingNode: boolean = false;
  private draggingNodeId: string | null = null;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private isConnecting: boolean = false;
  private connectionStartNodeId: string | null = null;
  private connectionStartPort: string | null = null;
  private connectionStartIsOutput: boolean = false;
  private connectionMouseX: number = 0;
  private connectionMouseY: number = 0;
  private isSpacePressed: boolean = false;
  private isDraggingParameter: boolean = false;
  private draggingParameterNodeId: string | null = null;
  private draggingParameterName: string | null = null;
  private dragParamStartY: number = 0;
  private dragParamStartValue: number = 0;
  private parameterInputElement: HTMLInputElement | null = null;
  private backgroundDragStartX: number = 0;
  private backgroundDragStartY: number = 0;
  private backgroundDragThreshold: number = 5; // pixels
  private potentialBackgroundPan: boolean = false;
  private nodeDragStartX: number = 0;
  private nodeDragStartY: number = 0;
  private nodeDragThreshold: number = 5; // pixels
  private potentialNodeDrag: boolean = false;
  private potentialNodeDragId: string | null = null;
  
  // Callbacks
  private onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  private onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
  private onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
  private onConnectionSelected?: (connectionId: string | null, multiSelect: boolean) => void;
  private onNodeDeleted?: (nodeId: string) => void;
  private onConnectionDeleted?: (connectionId: string) => void;
  private onParameterChanged?: (nodeId: string, paramName: string, value: number) => void;
  private onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
  private onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../types/nodeSpec').ParameterInputMode) => void;
  private isDialogVisible?: () => boolean;
  
  constructor(canvas: HTMLCanvasElement, graph: NodeGraph, nodeSpecs: NodeSpec[] = []) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;
    this.graph = graph;
    this.nodeRenderer = new NodeRenderer(ctx);
    
    // Store node specs
    for (const spec of nodeSpecs) {
      this.nodeSpecs.set(spec.id, spec);
    }
    
    // Initialize state from graph viewState or defaults
    this.state = {
      zoom: graph.viewState?.zoom ?? 1.0,
      panX: graph.viewState?.panX ?? 0,
      panY: graph.viewState?.panY ?? 0,
      selectedNodeIds: new Set(graph.viewState?.selectedNodeIds ?? []),
      selectedConnectionIds: new Set()
    };
    
    // Calculate node metrics
    this.updateNodeMetrics();
    
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
      this.render();
    }
  }
  
  private updateNodeMetrics(): void {
    this.nodeMetrics.clear();
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      if (spec) {
        const metrics = this.nodeRenderer.calculateMetrics(node, spec);
        this.nodeMetrics.set(node.id, metrics);
      }
    }
  }
  
  private resizeObserver: ResizeObserver | null = null;

  private setupEventListeners(): void {
    // Pan with middle mouse or space + left mouse
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    
    // Resize - use ResizeObserver to watch canvas container size changes
    // This handles both window resize and layout changes (e.g., when preview is collapsed)
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.render();
    });
    this.resizeObserver.observe(this.canvas);
    
    // Also listen to window resize as fallback
    window.addEventListener('resize', () => {
      this.resize();
      this.render();
    });
  }
  
  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    // Setting width/height resets the context, so we need to reapply scale
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    // Reset transform and apply device pixel ratio scaling
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }
  
  // Coordinate conversion
  private screenToCanvas(screenX: number, screenY: number): { x: number, y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = (screenX - rect.left - this.state.panX) / this.state.zoom;
    const y = (screenY - rect.top - this.state.panY) / this.state.zoom;
    return { x, y };
  }
  
  private canvasToScreen(canvasX: number, canvasY: number): { x: number, y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = canvasX * this.state.zoom + this.state.panX + rect.left;
    const y = canvasY * this.state.zoom + this.state.panY + rect.top;
    return { x, y };
  }
  
  // Hit testing
  private hitTestNode(mouseX: number, mouseY: number): string | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    // Check nodes in reverse order (top to bottom)
    for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
      const node = this.graph.nodes[i];
      const metrics = this.nodeMetrics.get(node.id);
      if (!metrics) continue;
      
      if (
        canvasPos.x >= node.position.x &&
        canvasPos.x <= node.position.x + metrics.width &&
        canvasPos.y >= node.position.y &&
        canvasPos.y <= node.position.y + metrics.height
      ) {
        return node.id;
      }
    }
    
    return null;
  }
  
  private hitTestPort(mouseX: number, mouseY: number): { nodeId: string, port: string, isOutput: boolean, parameter?: string } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    const portRadius = 4;
    const hitMargin = 4;
    const hitRadius = portRadius + hitMargin;
    
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics) continue;
      
      // Check parameter input ports (for float/int parameters)
      if (!node.collapsed) {
        for (const [paramName, paramPortPos] of metrics.parameterInputPortPositions.entries()) {
          const paramSpec = spec.parameters[paramName];
          if (paramSpec && paramSpec.type === 'float') {
            const dx = canvasPos.x - paramPortPos.x;
            const dy = canvasPos.y - paramPortPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < hitRadius) {
              return { nodeId: node.id, port: '', isOutput: false, parameter: paramName };
            }
          }
        }
      }
      
      // Check input ports
      for (const port of spec.inputs) {
        const pos = metrics.portPositions.get(`input:${port.name}`);
        if (pos) {
          const dx = canvasPos.x - pos.x;
          const dy = canvasPos.y - pos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < hitRadius) {
            return { nodeId: node.id, port: port.name, isOutput: false };
          }
        }
      }
      
      // Check output ports
      for (const port of spec.outputs) {
        const pos = metrics.portPositions.get(`output:${port.name}`);
        if (pos) {
          const dx = canvasPos.x - pos.x;
          const dy = canvasPos.y - pos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < hitRadius) {
            return { nodeId: node.id, port: port.name, isOutput: true };
          }
        }
      }
    }
    
    return null;
  }
  
  private hitTestConnection(mouseX: number, mouseY: number): string | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    // Increase hit threshold and make it zoom-aware (12 pixels in screen space)
    const hitThreshold = 12 / this.state.zoom;
    
    for (const conn of this.graph.connections) {
      const sourceNode = this.graph.nodes.find(n => n.id === conn.sourceNodeId);
      const targetNode = this.graph.nodes.find(n => n.id === conn.targetNodeId);
      
      if (!sourceNode || !targetNode) continue;
      
      const sourceSpec = this.nodeSpecs.get(sourceNode.type);
      const targetSpec = this.nodeSpecs.get(targetNode.type);
      const sourceMetrics = this.nodeMetrics.get(sourceNode.id);
      const targetMetrics = this.nodeMetrics.get(targetNode.id);
      
      if (!sourceSpec || !targetSpec || !sourceMetrics || !targetMetrics) continue;
      
      const sourcePortPos = sourceMetrics.portPositions.get(`output:${conn.sourcePort}`);
      
      // Handle parameter connections
      let targetPortPos: { x: number; y: number } | undefined;
      if (conn.targetParameter) {
        targetPortPos = targetMetrics.parameterInputPortPositions.get(conn.targetParameter);
      } else {
        targetPortPos = targetMetrics.portPositions.get(`input:${conn.targetPort}`);
      }
      
      if (!sourcePortPos || !targetPortPos) continue;
      
      // Test bezier curve distance
      if (this.isPointNearBezier(
        canvasPos.x, canvasPos.y,
        sourcePortPos.x, sourcePortPos.y,
        targetPortPos.x, targetPortPos.y,
        hitThreshold
      )) {
        return conn.id;
      }
    }
    
    return null;
  }
  
  private hitTestDeleteButton(mouseX: number, mouseY: number): string | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    for (const node of this.graph.nodes) {
      if (!this.state.selectedNodeIds.has(node.id)) continue;
      
      const metrics = this.nodeMetrics.get(node.id);
      if (!metrics) continue;
      
      const deleteBtnX = node.position.x + metrics.width - 24;
      const deleteBtnY = node.position.y + 4;
      const deleteBtnSize = 20;
      const deleteBtnCenterX = deleteBtnX + deleteBtnSize / 2;
      const deleteBtnCenterY = deleteBtnY + deleteBtnSize / 2;
      
      const dx = canvasPos.x - deleteBtnCenterX;
      const dy = canvasPos.y - deleteBtnCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < deleteBtnSize / 2) {
        return node.id;
      }
    }
    
    return null;
  }
  
  private hitTestParameter(mouseX: number, mouseY: number): { nodeId: string, paramName: string, isString?: boolean } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics || node.collapsed) continue;
      
      for (const [paramName, paramPos] of metrics.parameterPositions.entries()) {
        const paramSpec = spec.parameters[paramName];
        if (!paramSpec) continue;
        
        // Check if click is in parameter button/value area (right side)
        const padding = 8;
        const buttonWidth = paramSpec.type === 'string' ? 100 : 80;
        const buttonX = paramPos.x + paramPos.width - buttonWidth - padding;
        const buttonY = paramPos.y;
        const buttonHeight = paramPos.height;
        
        if (
          canvasPos.x >= buttonX &&
          canvasPos.x <= buttonX + buttonWidth &&
          canvasPos.y >= buttonY &&
          canvasPos.y <= buttonY + buttonHeight
        ) {
          return { 
            nodeId: node.id, 
            paramName,
            isString: paramSpec.type === 'string'
          };
        }
      }
    }
    
    return null;
  }
  
  private hitTestParameterMode(mouseX: number, mouseY: number): { nodeId: string, paramName: string } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics || node.collapsed) continue;
      
      for (const [paramName, paramPos] of metrics.parameterPositions.entries()) {
        const paramSpec = spec.parameters[paramName];
        if (!paramSpec) continue;
        
        // Only check mode selector for float/int parameters (they can have input connections)
        if (paramSpec.type !== 'float' && paramSpec.type !== 'int') continue;
        
        // Check if click is in mode selector area (right before value display, very close)
        const padding = 8;
        const valueWidth = 50;
        const modeWidth = 20; // Reduced width to match rendering
        const modeGap = 1; // Small gap to keep it visually distinct but close
        const valueX = paramPos.x + paramPos.width - valueWidth - padding;
        const modeX = valueX - modeWidth - modeGap;
        const modeY = paramPos.y;
        const modeHeight = paramPos.height;
        
        if (
          canvasPos.x >= modeX &&
          canvasPos.x <= modeX + modeWidth &&
          canvasPos.y >= modeY &&
          canvasPos.y <= modeY + modeHeight
        ) {
          return { 
            nodeId: node.id, 
            paramName
          };
        }
      }
    }
    
    return null;
  }
  
  // Public method to check if a click is on a parameter (for double-click handling)
  public hitTestParameterAtScreen(screenX: number, screenY: number): { nodeId: string, paramName: string } | null {
    return this.hitTestParameter(screenX, screenY);
  }
  
  // Show text input overlay for parameter editing
  public showParameterInput(screenX: number, screenY: number): boolean {
    const paramHit = this.hitTestParameter(screenX, screenY);
    if (!paramHit) return false;
    
    const node = this.graph.nodes.find(n => n.id === paramHit.nodeId);
    const spec = this.nodeSpecs.get(node?.type || '');
    const metrics = this.nodeMetrics.get(paramHit.nodeId);
    if (!node || !spec || !metrics) return false;
    
    const paramSpec = spec.parameters[paramHit.paramName];
    if (!paramSpec || (paramSpec.type !== 'float' && paramSpec.type !== 'int')) return false;
    
    const paramPos = metrics.parameterPositions.get(paramHit.paramName);
    if (!paramPos) return false;
    
    // Get current value
    const currentValue = node.parameters[paramHit.paramName] ?? paramSpec.default;
    const numValue = typeof currentValue === 'number' ? currentValue : 0;
    
    // Calculate screen position for input
    const padding = 8;
    const valueWidth = 50;
    const valueX = paramPos.x + paramPos.width - valueWidth - padding;
    const valueY = paramPos.y;
    
    // Convert canvas position to screen position
    const rect = this.canvas.getBoundingClientRect();
    const screenXPos = rect.left + valueX * this.state.zoom + this.state.panX;
    const screenYPos = rect.top + valueY * this.state.zoom + this.state.panY;
    
    // Remove existing input if any
    this.hideParameterInput();
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'number';
    input.style.position = 'fixed';
    input.style.left = `${screenXPos}px`;
    input.style.top = `${screenYPos}px`;
    input.style.width = `${valueWidth * this.state.zoom}px`;
    input.style.height = `${paramPos.height * this.state.zoom}px`;
    input.style.fontSize = `${12 * this.state.zoom}px`;
    input.style.fontFamily = 'monospace';
    const inputBorder = getCSSVariable('param-input-border', '2px solid #2196F3');
    input.style.border = inputBorder;
    const inputRadius = getCSSVariable('input-radius', '2px');
    input.style.borderRadius = inputRadius;
    input.style.padding = '2px 4px';
    input.style.zIndex = '10000';
    const inputBg = getCSSColor('param-input-bg', '#FFFFFF');
    input.style.background = inputBg;
    const inputColor = getCSSColor('param-input-color', '#333333');
    input.style.color = inputColor;
    input.value = paramSpec.type === 'int' ? Math.round(numValue).toString() : numValue.toString();
    
    if (paramSpec.min !== undefined) input.min = String(paramSpec.min);
    if (paramSpec.max !== undefined) input.max = String(paramSpec.max);
    input.step = paramSpec.step !== undefined ? String(paramSpec.step) : 'any';
    
    // Add to document
    document.body.appendChild(input);
    this.parameterInputElement = input;
    
    // Focus and select
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
    
    // Track if we've already committed to prevent double-removal
    let isCommitted = false;
    
    // Handle commit
    const commitValue = () => {
      if (isCommitted) return; // Prevent double-commit
      isCommitted = true;
      
      const newValue = paramSpec.type === 'int' 
        ? parseInt(input.value) 
        : parseFloat(input.value);
      
      if (!isNaN(newValue)) {
        // Clamp to min/max if specified
        let clampedValue = newValue;
        if (paramSpec.min !== undefined) clampedValue = Math.max(clampedValue, paramSpec.min);
        if (paramSpec.max !== undefined) clampedValue = Math.min(clampedValue, paramSpec.max);
        
        this.onParameterChanged?.(paramHit.nodeId, paramHit.paramName, clampedValue);
      }
      
      this.hideParameterInput();
    };
    
    // Handle cancel
    const cancelEdit = () => {
      if (isCommitted) return; // Prevent double-removal
      isCommitted = true;
      this.hideParameterInput();
    };
    
    const blurHandler = commitValue;
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitValue();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    };
    
    input.addEventListener('blur', blurHandler);
    input.addEventListener('keydown', keydownHandler);
    
    // Store handlers for cleanup
    (input as any)._blurHandler = blurHandler;
    (input as any)._keydownHandler = keydownHandler;
    
    return true;
  }
  
  // Hide parameter input overlay
  public hideParameterInput(): void {
    if (this.parameterInputElement) {
      const input = this.parameterInputElement;
      
      // Remove event listeners first to prevent them from firing during removal
      const blurHandler = (input as any)._blurHandler;
      const keydownHandler = (input as any)._keydownHandler;
      
      if (blurHandler) {
        input.removeEventListener('blur', blurHandler);
      }
      if (keydownHandler) {
        input.removeEventListener('keydown', keydownHandler);
      }
      
      // Only remove if the element is still in the DOM
      if (input.parentNode) {
        input.remove();
      }
      
      this.parameterInputElement = null;
    }
  }
  
  private isPointNearBezier(
    px: number, py: number,
    x0: number, y0: number,
    x3: number, y3: number,
    threshold: number
  ): boolean {
    // Bezier control points (50px horizontal offset)
    const cp1X = x0 + 50;
    const cp1Y = y0;
    const cp2X = x3 - 50;
    const cp2Y = y3;
    
    // Calculate curve length to determine appropriate number of samples
    // Use more samples for longer curves to ensure good coverage
    const dx = x3 - x0;
    const dy = y3 - y0;
    const curveLength = Math.sqrt(dx * dx + dy * dy);
    // At least 50 samples, more for longer curves (roughly 1 sample per 10 pixels)
    const samples = Math.max(50, Math.ceil(curveLength / 10));
    
    let minDistance = Infinity;
    
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const point = this.bezierPoint(x0, y0, cp1X, cp1Y, cp2X, cp2Y, x3, y3, t);
      
      const dx = px - point.x;
      const dy = py - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance < threshold;
  }
  
  private bezierPoint(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    t: number
  ): { x: number, y: number } {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    
    return {
      x: uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3,
      y: uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * y3
    };
  }
  
  // Event handlers
  private handleMouseDown(e: MouseEvent): void {
    // Hide parameter input if clicking on canvas (but not on the input itself)
    if (this.parameterInputElement && e.target === this.canvas) {
      this.hideParameterInput();
    }
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Check for delete button hit first (highest priority)
    const deleteHit = this.hitTestDeleteButton(mouseX, mouseY);
    if (deleteHit) {
      this.onNodeDeleted?.(deleteHit);
      this.render();
      return;
    }
    
    // Check for parameter mode selector hit (highest priority for parameter area)
    const modeHit = this.hitTestParameterMode(mouseX, mouseY);
    if (modeHit && !this.isSpacePressed) {
      const node = this.graph.nodes.find(n => n.id === modeHit.nodeId);
      const spec = this.nodeSpecs.get(node?.type || '');
      if (node && spec) {
        const paramSpec = spec.parameters[modeHit.paramName];
        if (paramSpec && (paramSpec.type === 'float' || paramSpec.type === 'int')) {
          // Cycle through modes: override -> add -> subtract -> multiply -> override
          const modes: import('../../types/nodeSpec').ParameterInputMode[] = ['override', 'add', 'subtract', 'multiply'];
          const currentMode = node.parameterInputModes?.[modeHit.paramName] || paramSpec.inputMode || 'override';
          const currentIndex = modes.indexOf(currentMode);
          const nextIndex = (currentIndex + 1) % modes.length;
          const nextMode = modes[nextIndex];
          
          // Update the node's parameter input mode
          if (!node.parameterInputModes) {
            node.parameterInputModes = {};
          }
          node.parameterInputModes[modeHit.paramName] = nextMode;
          
          // Notify callback
          this.onParameterInputModeChanged?.(modeHit.nodeId, modeHit.paramName, nextMode);
          
          this.render();
          return;
        }
      }
    }
    
    // Check for parameter hit (for dragging or file input)
    const paramHit = this.hitTestParameter(mouseX, mouseY);
    if (paramHit && !this.isSpacePressed) {
      // Handle string parameters (file inputs) specially
      if (paramHit.isString) {
        this.handleFileParameterClick(paramHit.nodeId, paramHit.paramName, mouseX, mouseY);
        return;
      }
      
      const node = this.graph.nodes.find(n => n.id === paramHit.nodeId);
      const spec = this.nodeSpecs.get(node?.type || '');
      if (node && spec) {
        const paramSpec = spec.parameters[paramHit.paramName];
        if (paramSpec && (paramSpec.type === 'float' || paramSpec.type === 'int')) {
          this.isDraggingParameter = true;
          this.draggingParameterNodeId = paramHit.nodeId;
          this.draggingParameterName = paramHit.paramName;
          this.dragParamStartY = mouseY;
          this.dragParamStartValue = (node.parameters[paramHit.paramName] ?? paramSpec.default) as number;
          this.canvas.style.cursor = 'ns-resize';
          return;
        }
      }
    }
    
    // Check for port hit
    const portHit = this.hitTestPort(mouseX, mouseY);
    if (portHit) {
      this.isConnecting = true;
      this.connectionStartNodeId = portHit.nodeId;
      this.connectionStartPort = portHit.port;
      this.connectionStartIsOutput = portHit.isOutput;
      this.connectionMouseX = mouseX;
      this.connectionMouseY = mouseY;
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    
    // Check for node hit (but allow panning if spacebar is pressed)
    const nodeHit = this.hitTestNode(mouseX, mouseY);
    if (nodeHit && !this.isSpacePressed) {
      // Check if clicking on node header (for dragging)
      const node = this.graph.nodes.find(n => n.id === nodeHit)!;
      const metrics = this.nodeMetrics.get(nodeHit);
      if (!metrics) return;
      
      const canvasPos = this.screenToCanvas(mouseX, mouseY);
      const headerHeight = metrics.headerHeight;
      
      if (canvasPos.y - node.position.y < headerHeight) {
        // Clicked on header - prepare for potential drag (with threshold)
        this.potentialNodeDrag = true;
        this.potentialNodeDragId = nodeHit;
        this.nodeDragStartX = mouseX;
        this.nodeDragStartY = mouseY;
        const nodeScreenPos = this.canvasToScreen(node.position.x, node.position.y);
        this.dragOffsetX = mouseX - nodeScreenPos.x;
        this.dragOffsetY = mouseY - nodeScreenPos.y;
        this.canvas.style.cursor = 'grab';
      } else {
        // Clicked on node body - select node
        const multiSelect = e.shiftKey;
        if (!multiSelect) {
          this.state.selectedNodeIds.clear();
          this.state.selectedConnectionIds.clear();
        }
        if (this.state.selectedNodeIds.has(nodeHit)) {
          this.state.selectedNodeIds.delete(nodeHit);
        } else {
          this.state.selectedNodeIds.add(nodeHit);
        }
        this.onNodeSelected?.(nodeHit, multiSelect);
        this.render();
      }
      return;
    }
    
    // Check for connection hit
    const connHit = this.hitTestConnection(mouseX, mouseY);
    if (connHit) {
      const multiSelect = e.shiftKey;
      if (!multiSelect) {
        this.state.selectedNodeIds.clear();
        this.state.selectedConnectionIds.clear();
      }
      if (this.state.selectedConnectionIds.has(connHit)) {
        this.state.selectedConnectionIds.delete(connHit);
      } else {
        this.state.selectedConnectionIds.add(connHit);
      }
      this.onConnectionSelected?.(connHit, multiSelect);
      this.render();
      return;
    }
    
    // Clicked on empty canvas
    if (e.button === 0) { // Left click
      // Start panning if space is held
      if (this.isSpacePressed) {
        this.isPanning = true;
        this.panStartX = mouseX - this.state.panX;
        this.panStartY = mouseY - this.state.panY;
        this.canvas.style.cursor = 'grabbing';
      } else {
        // Set up potential background pan (will start if user drags)
        this.potentialBackgroundPan = true;
        this.backgroundDragStartX = mouseX;
        this.backgroundDragStartY = mouseY;
        // Deselect all immediately
        this.state.selectedNodeIds.clear();
        this.state.selectedConnectionIds.clear();
        this.onNodeSelected?.(null, false);
        this.render();
      }
    } else if (e.button === 1) { // Middle mouse
      this.isPanning = true;
      this.panStartX = mouseX - this.state.panX;
      this.panStartY = mouseY - this.state.panY;
      this.canvas.style.cursor = 'grabbing';
    }
  }
  
  private handleMouseMove(e: MouseEvent): void {
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Check if we should start background panning
    if (this.potentialBackgroundPan && !this.isPanning) {
      const dx = mouseX - this.backgroundDragStartX;
      const dy = mouseY - this.backgroundDragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > this.backgroundDragThreshold) {
        // Start panning
        this.isPanning = true;
        this.potentialBackgroundPan = false;
        this.panStartX = this.backgroundDragStartX - this.state.panX;
        this.panStartY = this.backgroundDragStartY - this.state.panY;
        this.canvas.style.cursor = 'grabbing';
      }
    }
    
    // Check if we should start node dragging
    if (this.potentialNodeDrag && !this.isDraggingNode && this.potentialNodeDragId) {
      const dx = mouseX - this.nodeDragStartX;
      const dy = mouseY - this.nodeDragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > this.nodeDragThreshold) {
        // Start dragging
        this.isDraggingNode = true;
        this.draggingNodeId = this.potentialNodeDragId;
        this.potentialNodeDrag = false;
        this.canvas.style.cursor = 'grabbing';
      }
    }
    
    // Update cursor based on hover state (when not actively dragging)
    if (!this.isPanning && !this.isDraggingNode && !this.isConnecting && !this.isDraggingParameter && !this.potentialBackgroundPan && !this.potentialNodeDrag) {
      // Check for parameter mode selector hover (highest priority)
      const modeHit = this.hitTestParameterMode(mouseX, mouseY);
      if (modeHit) {
        this.canvas.style.cursor = 'pointer';
      } else {
        // Check for parameter value hover
        const paramHit = this.hitTestParameter(mouseX, mouseY);
        if (paramHit) {
          this.canvas.style.cursor = 'ns-resize';
        } else if (this.isSpacePressed) {
          this.canvas.style.cursor = 'grab';
        } else {
          this.canvas.style.cursor = 'default';
        }
      }
    }
    
    if (this.isPanning) {
      this.state.panX = mouseX - this.panStartX;
      this.state.panY = mouseY - this.panStartY;
      this.render();
    } else if (this.isDraggingNode && this.draggingNodeId) {
      const node = this.graph.nodes.find(n => n.id === this.draggingNodeId)!;
      const canvasPos = this.screenToCanvas(mouseX - this.dragOffsetX, mouseY - this.dragOffsetY);
      node.position.x = Math.round(canvasPos.x);
      node.position.y = Math.round(canvasPos.y);
      this.onNodeMoved?.(this.draggingNodeId, node.position.x, node.position.y);
      this.render();
    } else if (this.isDraggingParameter && this.draggingParameterNodeId && this.draggingParameterName) {
      const node = this.graph.nodes.find(n => n.id === this.draggingParameterNodeId);
      const spec = this.nodeSpecs.get(node?.type || '');
      if (node && spec) {
        const paramSpec = spec.parameters[this.draggingParameterName];
        if (paramSpec && (paramSpec.type === 'float' || paramSpec.type === 'int')) {
          const deltaY = this.dragParamStartY - mouseY; // Up = increase, down = decrease
          const modifier = e.shiftKey ? 'fine' : (e.ctrlKey || e.metaKey ? 'coarse' : 'normal');
          
          const min = paramSpec.min ?? 0;
          const max = paramSpec.max ?? 1;
          const range = max - min;
          
          const baseSensitivity = 100; // pixels per full range
          const multipliers = {
            'normal': 1.0,
            'fine': 0.1,
            'coarse': 10.0
          };
          
          const sensitivity = baseSensitivity / multipliers[modifier];
          const valueDelta = (deltaY / sensitivity) * range;
          const newValue = Math.max(min, Math.min(max, this.dragParamStartValue + valueDelta));
          
          node.parameters[this.draggingParameterName] = newValue;
          this.onParameterChanged?.(this.draggingParameterNodeId, this.draggingParameterName, newValue);
          this.render();
        }
      }
    } else if (this.isConnecting) {
      this.connectionMouseX = mouseX;
      this.connectionMouseY = mouseY;
      this.render();
    }
  }
  
  private handleMouseUp(e: MouseEvent): void {
    if (this.isConnecting) {
      // Check if released on a valid port
      const portHit = this.hitTestPort(e.clientX, e.clientY);
      if (portHit && portHit.nodeId !== this.connectionStartNodeId) {
        // Valid connection
        if (this.connectionStartIsOutput && !portHit.isOutput) {
          // Output to input or parameter
          if (portHit.parameter) {
            // Connecting to parameter input
            this.onConnectionCreated?.(
              this.connectionStartNodeId!,
              this.connectionStartPort!,
              portHit.nodeId,
              undefined,
              portHit.parameter
            );
          } else {
            // Output to input port
            this.onConnectionCreated?.(
              this.connectionStartNodeId!,
              this.connectionStartPort!,
              portHit.nodeId,
              portHit.port
            );
          }
        } else if (!this.connectionStartIsOutput && portHit.isOutput) {
          // Input to output (reverse) - not applicable for parameter inputs
          this.onConnectionCreated?.(
            portHit.nodeId,
            portHit.port,
            this.connectionStartNodeId!,
            this.connectionStartPort!
          );
        }
      }
      this.isConnecting = false;
      this.connectionStartNodeId = null;
      this.connectionStartPort = null;
      this.canvas.style.cursor = this.isSpacePressed ? 'grab' : 'default';
      this.render();
    }
    
    // If we had a potential node drag but didn't actually drag, select the node
    if (this.potentialNodeDrag && !this.isDraggingNode && this.potentialNodeDragId) {
      const multiSelect = e.shiftKey;
      if (!multiSelect) {
        this.state.selectedNodeIds.clear();
        this.state.selectedConnectionIds.clear();
      }
      if (this.state.selectedNodeIds.has(this.potentialNodeDragId)) {
        this.state.selectedNodeIds.delete(this.potentialNodeDragId);
      } else {
        this.state.selectedNodeIds.add(this.potentialNodeDragId);
      }
      this.onNodeSelected?.(this.potentialNodeDragId, multiSelect);
      this.render();
    }
    
    // Handle double-click on parameter value for text input
    if (!this.isPanning && !this.isDraggingNode && !this.isConnecting && !this.isDraggingParameter) {
      const paramHit = this.hitTestParameter(e.clientX, e.clientY);
      if (paramHit && e.detail === 2) {
        // Double-click on parameter - could show text input (for now, just log)
        // TODO: Implement text input overlay for parameter editing
      }
    }
    
    this.isPanning = false;
    this.isDraggingNode = false;
    this.draggingNodeId = null;
    this.isDraggingParameter = false;
    this.draggingParameterNodeId = null;
    this.draggingParameterName = null;
    this.potentialBackgroundPan = false;
    this.potentialNodeDrag = false;
    this.potentialNodeDragId = null;
    // Reset cursor based on spacebar state
    this.canvas.style.cursor = this.isSpacePressed ? 'grab' : 'default';
  }
  
  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Zoom at mouse position
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, this.state.zoom * zoomFactor));
    
    // Adjust pan to keep mouse position fixed
    const zoomRatio = newZoom / this.state.zoom;
    this.state.panX = mouseX - (mouseX - this.state.panX) * zoomRatio;
    this.state.panY = mouseY - (mouseY - this.state.panY) * zoomRatio;
    
    this.state.zoom = newZoom;
    this.render();
  }
  
  private handleKeyDown(e: KeyboardEvent): void {
    // If dialog is visible, don't handle keyboard shortcuts (except spacebar for panning)
    if (this.isDialogVisible?.()) {
      // Only allow spacebar for panning when dialog is open
      if (e.key === ' ' || e.key === 'Space') {
        if (!this.isSpacePressed) {
          this.isSpacePressed = true;
          // Update cursor if not already panning/dragging
          if (!this.isPanning && !this.isDraggingNode && !this.isConnecting) {
            this.canvas.style.cursor = 'grab';
          }
        }
        e.preventDefault(); // Prevent page scroll
      }
      return;
    }
    
    // Track spacebar for panning
    if (e.key === ' ' || e.key === 'Space') {
      if (!this.isSpacePressed) {
        this.isSpacePressed = true;
        // Update cursor if not already panning/dragging
        if (!this.isPanning && !this.isDraggingNode && !this.isConnecting) {
          this.canvas.style.cursor = 'grab';
        }
      }
      e.preventDefault(); // Prevent page scroll
      return;
    }
    
    // Delete selected nodes/connections
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) {
      for (const nodeId of this.state.selectedNodeIds) {
        this.onNodeDeleted?.(nodeId);
      }
      for (const connId of this.state.selectedConnectionIds) {
        this.onConnectionDeleted?.(connId);
      }
      this.state.selectedNodeIds.clear();
      this.state.selectedConnectionIds.clear();
      this.render();
    }
  }
  
  private handleKeyUp(e: KeyboardEvent): void {
    // Track spacebar release
    if (e.key === ' ' || e.key === 'Space') {
      this.isSpacePressed = false;
      // Reset cursor if not panning/dragging
      if (!this.isPanning && !this.isDraggingNode && !this.isConnecting) {
        this.canvas.style.cursor = 'default';
      }
      e.preventDefault();
    }
  }
  
  // Rendering
  public render(): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    
    // Fill canvas background
    const canvasBg = getCSSColor('canvas-bg', '#0f1013');
    this.ctx.fillStyle = canvasBg;
    this.ctx.fillRect(0, 0, width, height);
    
    // Save context
    this.ctx.save();
    
    // Apply pan/zoom transform
    this.ctx.translate(this.state.panX, this.state.panY);
    this.ctx.scale(this.state.zoom, this.state.zoom);
    
    // Render grid
    this.renderGrid();
    
    // Render connections (behind nodes)
    this.renderConnections();
    
    // Render nodes
    this.renderNodes();
    
    // Render temporary connection line (if connecting)
    if (this.isConnecting) {
      this.renderTemporaryConnection();
    }
    
    // Restore context
    this.ctx.restore();
  }
  
  private renderGrid(): void {
    const gridSize = getCSSVariableAsNumber('canvas-grid-size', 50);
    const gridColor = getCSSColor('canvas-grid-color', '#2A2A2A');
    const dotRadius = getCSSVariableAsNumber('canvas-grid-dot-radius', 1.5);
    
    this.ctx.fillStyle = gridColor;
    
    const rect = this.canvas.getBoundingClientRect();
    const startX = Math.floor((-this.state.panX) / (this.state.zoom * gridSize)) * gridSize;
    const startY = Math.floor((-this.state.panY) / (this.state.zoom * gridSize)) * gridSize;
    const endX = startX + (rect.width / this.state.zoom) + gridSize;
    const endY = startY + (rect.height / this.state.zoom) + gridSize;
    
    // Draw dots at grid intersection points
    this.ctx.beginPath();
    for (let x = startX; x < endX; x += gridSize) {
      for (let y = startY; y < endY; y += gridSize) {
        this.ctx.moveTo(x + dotRadius, y);
        this.ctx.arc(x, y, dotRadius / this.state.zoom, 0, Math.PI * 2);
      }
    }
    this.ctx.fill();
  }
  
  private renderNodes(): void {
    for (const node of this.graph.nodes) {
      this.renderNode(node);
    }
  }
  
  private renderNode(node: NodeInstance): void {
    const spec = this.nodeSpecs.get(node.type);
    if (!spec) return;
    
    const metrics = this.nodeMetrics.get(node.id);
    if (!metrics) {
      // Calculate metrics if missing
      const newMetrics = this.nodeRenderer.calculateMetrics(node, spec);
      this.nodeMetrics.set(node.id, newMetrics);
      this.renderNode(node); // Recursive call with metrics
      return;
    }
    
    const isSelected = this.state.selectedNodeIds.has(node.id);
    this.nodeRenderer.renderNode(node, spec, metrics, isSelected);
  }
  
  private renderConnections(): void {
    for (const conn of this.graph.connections) {
      this.renderConnection(conn);
    }
  }
  
  private renderConnection(conn: Connection): void {
    const sourceNode = this.graph.nodes.find(n => n.id === conn.sourceNodeId);
    const targetNode = this.graph.nodes.find(n => n.id === conn.targetNodeId);
    
    if (!sourceNode || !targetNode) return;
    
    const sourceSpec = this.nodeSpecs.get(sourceNode.type);
    const targetSpec = this.nodeSpecs.get(targetNode.type);
    const sourceMetrics = this.nodeMetrics.get(sourceNode.id);
    const targetMetrics = this.nodeMetrics.get(targetNode.id);
    
    if (!sourceSpec || !targetSpec || !sourceMetrics || !targetMetrics) return;
    
    const isSelected = this.state.selectedConnectionIds.has(conn.id);
    
    // Get actual port positions
    const sourcePortPos = sourceMetrics.portPositions.get(`output:${conn.sourcePort}`);
    
    // Handle parameter connections
    let targetPortPos: { x: number; y: number } | undefined;
    if (conn.targetParameter) {
      targetPortPos = targetMetrics.parameterInputPortPositions.get(conn.targetParameter);
    } else {
      targetPortPos = targetMetrics.portPositions.get(`input:${conn.targetPort}`);
    }
    
    if (!sourcePortPos || !targetPortPos) return;
    
    const sourceX = sourcePortPos.x;
    const sourceY = sourcePortPos.y;
    const targetX = targetPortPos.x;
    const targetY = targetPortPos.y;
    
    // Bezier curve
    const cp1X = sourceX + 50;
    const cp1Y = sourceY;
    const cp2X = targetX - 50;
    const cp2Y = targetY;
    
    const connectionColor = isSelected 
      ? getCSSColor('connection-color-selected', '#2196F3')
      : getCSSColor('connection-color', '#999999');
    const connectionWidth = isSelected
      ? getCSSVariableAsNumber('connection-width-selected', 3)
      : getCSSVariableAsNumber('connection-width', 2);
    const connectionOpacity = isSelected
      ? getCSSVariableAsNumber('connection-opacity-selected', 1.0)
      : getCSSVariableAsNumber('connection-opacity', 0.8);
    
    this.ctx.strokeStyle = connectionColor;
    this.ctx.lineWidth = connectionWidth;
    this.ctx.globalAlpha = connectionOpacity;
    
    this.ctx.beginPath();
    this.ctx.moveTo(sourceX, sourceY);
    this.ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, targetX, targetY);
    this.ctx.stroke();
    
    this.ctx.globalAlpha = 1.0;
  }
  
  private renderTemporaryConnection(): void {
    if (!this.connectionStartNodeId) return;
    
    const sourceNode = this.graph.nodes.find(n => n.id === this.connectionStartNodeId);
    if (!sourceNode) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const targetX = (this.connectionMouseX - rect.left - this.state.panX) / this.state.zoom;
    const targetY = (this.connectionMouseY - rect.top - this.state.panY) / this.state.zoom;
    
    const sourceX = sourceNode.position.x + 200;
    const sourceY = sourceNode.position.y + 50;
    
    const cp1X = sourceX + 50;
    const cp1Y = sourceY;
    const cp2X = targetX - 50;
    const cp2Y = targetY;
    
    const tempConnectionColor = getCSSColor('connection-color', '#999999');
    const tempConnectionWidth = getCSSVariableAsNumber('connection-width', 2);
    this.ctx.strokeStyle = tempConnectionColor;
    this.ctx.lineWidth = tempConnectionWidth;
    this.ctx.setLineDash([5, 5]);
    
    this.ctx.beginPath();
    this.ctx.moveTo(sourceX, sourceY);
    this.ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, targetX, targetY);
    this.ctx.stroke();
    
    this.ctx.setLineDash([]);
  }
  
  // Public API
  setGraph(graph: NodeGraph): void {
    this.graph = graph;
    // Update state from graph viewState
    if (graph.viewState) {
      this.state.zoom = graph.viewState.zoom ?? this.state.zoom;
      this.state.panX = graph.viewState.panX ?? this.state.panX;
      this.state.panY = graph.viewState.panY ?? this.state.panY;
      this.state.selectedNodeIds = new Set(graph.viewState.selectedNodeIds ?? []);
    }
    this.updateNodeMetrics();
    this.render();
  }
  
  setNodeSpecs(nodeSpecs: NodeSpec[]): void {
    this.nodeSpecs.clear();
    for (const spec of nodeSpecs) {
      this.nodeSpecs.set(spec.id, spec);
    }
    this.updateNodeMetrics();
    this.render();
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
    const zoom = Math.min(zoomX, zoomY, 2.0); // Cap zoom at 2.0 to avoid too much zoom
    
    // Calculate pan to center content
    const panX = (canvasWidth / 2) - (centerX * zoom);
    const panY = (canvasHeight / 2) - (centerY * zoom);
    
    // Update state
    this.state.zoom = zoom;
    this.state.panX = panX;
    this.state.panY = panY;
    
    this.render();
  }
  
  getViewState() {
    return {
      zoom: this.state.zoom,
      panX: this.state.panX,
      panY: this.state.panY,
      selectedNodeIds: Array.from(this.state.selectedNodeIds)
    };
  }
  
  getNodeRenderer(): NodeRenderer {
    return this.nodeRenderer;
  }
  
  getNodeMetrics(): Map<string, NodeRenderMetrics> {
    return this.nodeMetrics;
  }
  
  setCallbacks(callbacks: {
    onNodeMoved?: (nodeId: string, x: number, y: number) => void;
    onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
    onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
    onConnectionSelected?: (connectionId: string | null, multiSelect: boolean) => void;
    onNodeDeleted?: (nodeId: string) => void;
    onConnectionDeleted?: (connectionId: string) => void;
    onParameterChanged?: (nodeId: string, paramName: string, value: number) => void;
    onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
    onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../types/nodeSpec').ParameterInputMode) => void;
    isDialogVisible?: () => boolean;
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
    this.isDialogVisible = callbacks.isDialogVisible;
  }

  /**
   * Handle file parameter click - show file input dialog
   */
  private handleFileParameterClick(nodeId: string, paramName: string, screenX: number, screenY: number): void {
    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/mpeg,audio/mp3,.mp3';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.onFileParameterChanged?.(nodeId, paramName, file);
      }
      document.body.removeChild(fileInput);
    });
    
    // Position and trigger
    document.body.appendChild(fileInput);
    fileInput.click();
  }
}
