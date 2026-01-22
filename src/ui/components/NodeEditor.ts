// Main Node Editor Component
// Orchestrates the node editor UI including canvas, layout, and interactions

import { NodeEditorCanvas } from './NodeEditorCanvas';
import { NodeSearchDialog } from './NodeSearchDialog';
import { UndoRedoManager } from './UndoRedoManager';
import { CopyPasteManager } from './CopyPasteManager';
import type { NodeGraph, NodeInstance, Connection } from '../../types/nodeGraph';
import type { NodeSpec } from '../../types/nodeSpec';

export interface NodeEditorCallbacks {
  onGraphChanged?: (graph: NodeGraph) => void;
  onParameterChanged?: (nodeId: string, paramName: string, value: number) => void;
  onError?: (error: { type: string, errors?: string[], error?: string, timestamp: number }) => void;
}

export class NodeEditor {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private canvasComponent: NodeEditorCanvas;
  private searchDialog: NodeSearchDialog;
  private graph: NodeGraph;
  private nodeSpecs: Map<string, NodeSpec>;
  private callbacks: NodeEditorCallbacks;
  private undoRedoManager: UndoRedoManager;
  private copyPasteManager: CopyPasteManager;
  
  constructor(
    container: HTMLElement,
    graph: NodeGraph,
    nodeSpecs: NodeSpec[],
    callbacks: NodeEditorCallbacks = {}
  ) {
    this.container = container;
    this.graph = graph;
    this.callbacks = callbacks;
    this.undoRedoManager = new UndoRedoManager();
    this.copyPasteManager = new CopyPasteManager();
    
    // Create node specs map
    this.nodeSpecs = new Map();
    for (const spec of nodeSpecs) {
      this.nodeSpecs.set(spec.id, spec);
    }
    
    // Push initial state
    this.undoRedoManager.pushState(graph);
    
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);
    
    // Create canvas component
    this.canvasComponent = new NodeEditorCanvas(this.canvas, graph, nodeSpecs);
    
    // Create search dialog (the only menu for adding nodes)
    this.searchDialog = new NodeSearchDialog(nodeSpecs, {
      onCreateNode: (nodeType, x, y) => {
        this.addNode(nodeType, x, y);
      }
    });
    
    // Setup double-click for search dialog (only if not on parameter)
    this.canvas.addEventListener('dblclick', (e) => {
      if (e.target === this.canvas) {
        // Check if double-click is on a parameter value first
        if (this.canvasComponent.showParameterInput(e.clientX, e.clientY)) {
          // Parameter input was shown, don't open search dialog
          return;
        }
        
        // Otherwise, open search dialog
        // Convert to canvas coordinates for node placement, but use screen coordinates for dialog positioning
        const canvasPos = this.canvasComponent['screenToCanvas'](e.clientX, e.clientY);
        this.searchDialog.show(e.clientX, e.clientY, canvasPos.x, canvasPos.y);
      }
    });
    
    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();
    
    this.canvasComponent.setCallbacks({
      onNodeMoved: (nodeId, x, y) => {
        const node = this.graph.nodes.find(n => n.id === nodeId);
        if (node) {
          node.position.x = x;
          node.position.y = y;
          // Update metrics for moved node
          const spec = this.nodeSpecs.get(node.type);
          if (spec) {
            const metrics = this.canvasComponent.getNodeRenderer().calculateMetrics(node, spec);
            this.canvasComponent.getNodeMetrics().set(node.id, metrics);
          }
          this.updateViewState();
          this.notifyGraphChanged();
        }
      },
      onNodeSelected: (nodeId, multiSelect) => {
        // Update selection state
        if (!this.graph.viewState) {
          this.graph.viewState = {
            zoom: 1.0,
            panX: 0,
            panY: 0,
            selectedNodeIds: []
          };
        }
        if (!multiSelect) {
          this.graph.viewState.selectedNodeIds = nodeId ? [nodeId] : [];
        } else if (nodeId) {
          const selected = this.graph.viewState.selectedNodeIds || [];
          if (selected.includes(nodeId)) {
            this.graph.viewState.selectedNodeIds = selected.filter(id => id !== nodeId);
          } else {
            this.graph.viewState.selectedNodeIds = [...selected, nodeId];
          }
        }
        this.updateViewState();
      },
      onConnectionCreated: (sourceNodeId, sourcePort, targetNodeId, targetPort) => {
        // Create new connection
        const connection: Connection = {
          id: this.generateId('conn'),
          sourceNodeId,
          sourcePort,
          targetNodeId,
          targetPort
        };
        
        // Validate connection
        if (this.validateConnection(connection)) {
          this.graph.connections.push(connection);
          this.updateViewState();
          this.notifyGraphChanged();
        }
      },
      onConnectionSelected: (_connectionId, _multiSelect) => {
        // TODO: Handle connection selection
      },
      onNodeDeleted: (nodeId) => {
        // Remove node and all its connections
        this.graph.nodes = this.graph.nodes.filter(n => n.id !== nodeId);
        this.graph.connections = this.graph.connections.filter(
          c => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
        );
        this.updateViewState();
        this.notifyGraphChanged();
      },
      onConnectionDeleted: (connectionId) => {
        this.graph.connections = this.graph.connections.filter(c => c.id !== connectionId);
        this.updateViewState();
        this.notifyGraphChanged();
      },
      onParameterChanged: (nodeId, paramName, value) => {
        // Update parameter value in graph
        this.updateParameter(nodeId, paramName, value);
      },
      isDialogVisible: () => this.searchDialog.isVisible()
    });
  }
  
  private validateConnection(connection: Connection): boolean {
    const sourceNode = this.graph.nodes.find(n => n.id === connection.sourceNodeId);
    const targetNode = this.graph.nodes.find(n => n.id === connection.targetNodeId);
    
    if (!sourceNode || !targetNode) {
      return false;
    }
    
    const sourceSpec = this.nodeSpecs.get(sourceNode.type);
    const targetSpec = this.nodeSpecs.get(targetNode.type);
    
    if (!sourceSpec || !targetSpec) {
      return false;
    }
    
    // Check if ports exist
    const sourcePort = sourceSpec.outputs.find(p => p.name === connection.sourcePort);
    const targetPort = targetSpec.inputs.find(p => p.name === connection.targetPort);
    
    if (!sourcePort || !targetPort) {
      return false;
    }
    
    // Check if target port already has a connection
    const existingConnection = this.graph.connections.find(
      c => c.targetNodeId === connection.targetNodeId && c.targetPort === connection.targetPort
    );
    
    if (existingConnection) {
      return false; // Port already connected
    }
    
    // TODO: Check type compatibility
    
    return true;
  }
  
  private updateViewState(): void {
    const viewState = this.canvasComponent.getViewState();
    this.graph.viewState = {
      zoom: viewState.zoom,
      panX: viewState.panX,
      panY: viewState.panY,
      selectedNodeIds: viewState.selectedNodeIds
    };
  }
  
  private notifyGraphChanged(): void {
    this.undoRedoManager.pushState(this.graph);
    this.callbacks.onGraphChanged?.(this.graph);
  }
  
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Public API
  setGraph(graph: NodeGraph): void {
    this.graph = graph;
    this.canvasComponent.setGraph(graph);
    this.undoRedoManager.pushState(graph);
  }
  
  getGraph(): NodeGraph {
    return this.graph;
  }
  
  undo(): boolean {
    const state = this.undoRedoManager.undo();
    if (state) {
      this.graph = state;
      this.canvasComponent.setGraph(state);
      this.callbacks.onGraphChanged?.(state);
      return true;
    }
    return false;
  }
  
  redo(): boolean {
    const state = this.undoRedoManager.redo();
    if (state) {
      this.graph = state;
      this.canvasComponent.setGraph(state);
      this.callbacks.onGraphChanged?.(state);
      return true;
    }
    return false;
  }
  
  canUndo(): boolean {
    return this.undoRedoManager.canUndo();
  }
  
  canRedo(): boolean {
    return this.undoRedoManager.canRedo();
  }
  
  addNode(nodeType: string, x: number, y: number): NodeInstance | null {
    const spec = this.nodeSpecs.get(nodeType);
    if (!spec) {
      return null;
    }
    
    // Create node with default parameters
    const parameters: Record<string, any> = {};
    for (const [paramName, paramSpec] of Object.entries(spec.parameters)) {
      parameters[paramName] = paramSpec.default;
    }
    
    const node: NodeInstance = {
      id: this.generateId('node'),
      type: nodeType,
      position: { x, y },
      parameters,
      collapsed: false
    };
    
    this.graph.nodes.push(node);
    // Update metrics for new node
    const metrics = this.canvasComponent.getNodeRenderer().calculateMetrics(node, spec);
    this.canvasComponent.getNodeMetrics().set(node.id, metrics);
    this.canvasComponent.setGraph(this.graph);
    this.notifyGraphChanged();
    
    return node;
  }
  
  updateParameter(nodeId: string, paramName: string, value: number): void {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    if (node) {
      node.parameters[paramName] = value;
      this.callbacks.onParameterChanged?.(nodeId, paramName, value);
      // Parameter changes don't trigger undo (they're too frequent)
      // Only structure changes trigger undo
    }
  }
  
  copy(): void {
    const selectedNodeIds = Array.from(this.canvasComponent.getViewState().selectedNodeIds);
    if (selectedNodeIds.length === 0) return;
    
    const selectedNodes = this.graph.nodes.filter(n => selectedNodeIds.includes(n.id));
    const selectedConnections = this.graph.connections.filter(
      c => selectedNodeIds.includes(c.sourceNodeId) && selectedNodeIds.includes(c.targetNodeId)
    );
    
    this.copyPasteManager.copy(selectedNodes, selectedConnections);
  }
  
  paste(x: number, y: number): void {
    const pasted = this.copyPasteManager.paste(x, y);
    if (!pasted) return;
    
    // Add pasted nodes and connections
    this.graph.nodes.push(...pasted.nodes);
    this.graph.connections.push(...pasted.connections);
    
    // Update metrics for new nodes
    for (const node of pasted.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      if (spec) {
        const metrics = this.canvasComponent.getNodeRenderer().calculateMetrics(node, spec);
        this.canvasComponent.getNodeMetrics().set(node.id, metrics);
      }
    }
    
    // Select pasted nodes
    const viewState = this.canvasComponent.getViewState();
    viewState.selectedNodeIds = pasted.nodes.map(n => n.id);
    this.graph.viewState = {
      zoom: this.graph.viewState?.zoom ?? 1.0,
      panX: this.graph.viewState?.panX ?? 0,
      panY: this.graph.viewState?.panY ?? 0,
      selectedNodeIds: viewState.selectedNodeIds
    };
    
    this.canvasComponent.setGraph(this.graph);
    this.notifyGraphChanged();
  }
  
  duplicate(): void {
    const selectedNodeIds = Array.from(this.canvasComponent.getViewState().selectedNodeIds);
    if (selectedNodeIds.length === 0) return;
    
    // Copy first
    this.copy();
    
    // Then paste with offset
    const selectedNodes = this.graph.nodes.filter(n => selectedNodeIds.includes(n.id));
    if (selectedNodes.length === 0) return;
    
    // Calculate average position
    let avgX = 0;
    let avgY = 0;
    for (const node of selectedNodes) {
      avgX += node.position.x;
      avgY += node.position.y;
    }
    avgX /= selectedNodes.length;
    avgY /= selectedNodes.length;
    
    // Paste with offset
    this.paste(avgX + 50, avgY + 50);
  }
  
  selectAll(): void {
    const allNodeIds = this.graph.nodes.map(n => n.id);
    const viewState = this.canvasComponent.getViewState();
    viewState.selectedNodeIds = allNodeIds;
    this.graph.viewState = {
      zoom: this.graph.viewState?.zoom ?? 1.0,
      panX: this.graph.viewState?.panX ?? 0,
      panY: this.graph.viewState?.panY ?? 0,
      selectedNodeIds: allNodeIds
    };
    this.canvasComponent.setGraph(this.graph);
  }
  
  // Keyboard shortcuts
  setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      // If search dialog is open, only handle Escape and dialog-specific shortcuts
      // Let the dialog handle its own keyboard events
      if (this.searchDialog.isVisible()) {
        // Only allow opening search dialog again (Ctrl+F) or Escape (handled by dialog)
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === 'f')) {
          e.preventDefault();
          const rect = this.canvas.getBoundingClientRect();
          const viewState = this.canvasComponent.getViewState();
          const centerX = (rect.width / 2 - viewState.panX) / viewState.zoom;
          const centerY = (rect.height / 2 - viewState.panY) / viewState.zoom;
          this.searchDialog.show(centerX, centerY);
        }
        // Don't handle other shortcuts when dialog is open
        return;
      }
      
      // Ctrl++ or Ctrl+= or Ctrl+F to open search dialog in center
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === 'f')) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const viewState = this.canvasComponent.getViewState();
        const centerX = (rect.width / 2 - viewState.panX) / viewState.zoom;
        const centerY = (rect.height / 2 - viewState.panY) / viewState.zoom;
        this.searchDialog.show(centerX, centerY);
        return;
      }
      
      // Ctrl/Cmd + F: Focus search (also handled above, but keep for clarity)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        // Already handled above
        return;
      }
      
      // Ctrl/Cmd + C: Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        this.copy();
      }
      
      // Ctrl/Cmd + V: Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const viewState = this.canvasComponent.getViewState();
        // Paste at center of viewport
        const centerX = (rect.width / 2 - viewState.panX) / viewState.zoom;
        const centerY = (rect.height / 2 - viewState.panY) / viewState.zoom;
        this.paste(centerX, centerY);
      }
      
      // Ctrl/Cmd + D: Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        this.duplicate();
      }
      
      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        this.selectAll();
      }
      
      // Ctrl/Cmd + Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
      
      // Ctrl/Cmd + Shift + Z: Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this.redo();
      }
    });
  }
  
  destroy(): void {
    this.searchDialog.destroy();
    this.container.removeChild(this.canvas);
  }
}
