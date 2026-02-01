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
import type { NodeGraph, NodeInstance } from '../../../../types/nodeGraph';
import type { NodeSpec } from '../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../NodeRenderer';
import type { ToolType } from '../../BottomBar';
import { getCSSVariableAsNumber } from '../../../../utils/cssTokens';
import { snapParameterValue } from '../../../../utils/parameterValueCalculator';
import { getParameterUIRegistry } from '../../rendering/ParameterUIRegistry';
import { RenderLayer } from '../../rendering/RenderState';
import { FREQ_MIN, FREQ_MAX, normToHz } from '../../rendering/layout/elements/FrequencyRangeElement';

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
  nodeComponents: Map<string, any>; // NodeComponent type
  nodeRenderer: any; // NodeRenderer type
  renderState: any; // RenderState type
  connectionLayerRenderer: any; // ConnectionLayerRenderer type
  parameterConnectionLayerRenderer: any; // ParameterConnectionLayerRenderer type
  activeTool: ToolType;
  /** When set, used so the handler always sees the current tool (avoids stale value after setActiveTool). */
  getActiveTool?: () => ToolType;
  isSpacePressed: boolean;
  canvas: HTMLCanvasElement;
  
  // Callbacks
  onNodeDeleted?: (nodeId: string) => void;
  onTypeLabelClick?: (portType: string, screenX: number, screenY: number, typeLabelBounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => void;
  onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../../../types/nodeSpec').ParameterInputMode) => void;
  onParameterChanged?: (nodeId: string, paramName: string, value: number | number[][]) => void;
  onConnectionCreated?: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void;
  onNodeMoved?: (nodeId: string, x: number, y: number) => void;
  onNodeSelected?: (nodeId: string | null, multiSelect: boolean) => void;
  
  // Methods
  attachDocumentListeners: () => void;
  detachDocumentListeners: () => void;
  createInteractionEvent: (type: InteractionType, e: MouseEvent | WheelEvent, target?: any) => InteractionEvent;
  handleFileParameterClick: (nodeId: string, paramName: string, screenX: number, screenY: number) => void;
  handleFrequencyBandsParameterClick: (nodeId: string, paramName: string, screenX: number, screenY: number) => void;
  handleEnumParameterClick: (nodeId: string, paramName: string, screenX: number, screenY: number) => void;
  handleColorPickerClick?: (nodeId: string, screenX: number, screenY: number) => void;
  calculateSmartGuides: (draggingNode: NodeInstance, proposedX: number, proposedY: number) => {
    snappedX: number;
    snappedY: number;
    guides: { vertical: Array<{ x: number; startY: number; endY: number }>; horizontal: Array<{ y: number; startX: number; endX: number }> };
  };
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
  
  // Smart guides setter
  setSmartGuides: (guides: { vertical: Array<{ x: number; startY: number; endY: number }>; horizontal: Array<{ y: number; startX: number; endX: number }> }) => void;
  
  // Mouse position updater
  updateMousePosition: (x: number, y: number) => void;
}

export class MouseEventHandler {
  private deps: MouseEventHandlerDependencies;
  
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
    return this.deps.getActiveTool?.() ?? this.getActiveTool();
  }

  /**
   * Notify parameter change and then render. If the callback returns a Promise (e.g. async
   * runtime sync for audio-analyzer params), wait for it so the next paint sees the updated state.
   */
  private flushParameterChangeAndRender(nodeId: string, paramName: string, value: number | number[][]): void {
    const result = this.deps.onParameterChanged?.(nodeId, paramName, value);
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
    // Hide parameter input if clicking on canvas (but not on the input itself)
    if (this.deps.uiElementManager.isAnyUIActive() && e.target === this.deps.canvas) {
      this.deps.uiElementManager.hideAll();
    }
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Check for delete button hit first (highest priority)
    const deleteHit = this.deps.hitTestManager.hitTestDeleteButton(mouseX, mouseY);
    if (deleteHit) {
      // Clean up NodeComponent if feature flag is enabled (Phase 2.2)
      const component = this.deps.nodeComponents.get(deleteHit);
      if (component) {
        component.unmount();
        this.deps.nodeComponents.delete(deleteHit);
      }
      this.deps.onNodeDeleted?.(deleteHit);
      this.deps.handlerContext.render();
      return;
    }
    
    // Check for type label hit (before port connections to allow clicking type labels)
    const typeLabelHit = this.deps.hitTestManager.hitTestTypeLabel(mouseX, mouseY);
    if (typeLabelHit && !this.deps.isSpacePressed && this.getActiveTool() === 'cursor') {
      e.preventDefault();
      e.stopPropagation();
      console.log('[MouseEventHandler] Type label clicked:', typeLabelHit.portType, 'at', typeLabelHit.screenX, typeLabelHit.screenY);
      console.log('[MouseEventHandler] onTypeLabelClick callback:', {
        exists: !!this.deps.onTypeLabelClick,
        type: typeof this.deps.onTypeLabelClick
      });
      if (this.deps.onTypeLabelClick) {
        this.deps.onTypeLabelClick(typeLabelHit.portType, typeLabelHit.screenX, typeLabelHit.screenY, typeLabelHit.typeLabelBounds);
      } else {
        console.warn('[MouseEventHandler] onTypeLabelClick callback is not defined!');
      }
      return;
    }
    
    // Check for parameter hit (includes mode button when isModeButton)
    const paramHit = this.deps.hitTestManager.hitTestParameter(mouseX, mouseY);
    if (paramHit?.isModeButton && !this.deps.isSpacePressed) {
      const node = this.graph.nodes.find(n => n.id === paramHit.nodeId);
      const spec = this.deps.nodeSpecs.get(node?.type || '');
      if (node && spec) {
        const paramSpec = spec.parameters[paramHit.paramName];
        if (paramSpec && paramSpec.type === 'float') {
          // Cycle through modes: override -> add -> subtract -> multiply -> override
          const modes: import('../../../../types/nodeSpec').ParameterInputMode[] = ['override', 'add', 'subtract', 'multiply'];
          const currentMode = node.parameterInputModes?.[paramHit.paramName] || paramSpec.inputMode || 'override';
          const currentIndex = modes.indexOf(currentMode);
          const nextIndex = (currentIndex + 1) % modes.length;
          const nextMode = modes[nextIndex];
          
          // Update the node's parameter input mode
          if (!node.parameterInputModes) {
            node.parameterInputModes = {};
          }
          node.parameterInputModes[paramHit.paramName] = nextMode;
          
          // Notify callback
          this.deps.onParameterInputModeChanged?.(paramHit.nodeId, paramHit.paramName, nextMode);
          
          this.deps.handlerContext.render();
          return;
        }
      }
    }
    
    // Use interaction handler system for tool-specific interactions (check early for priority)
    // Selection tool should work everywhere, even when clicking on nodes/ports
    if (this.deps.interactionManager && this.getActiveTool() === 'select') {
      const event = this.deps.createInteractionEvent(InteractionType.RectangleSelection, e);
      if (this.deps.interactionManager.start(event)) {
        // Attach document-level listeners for dragging outside canvas
        this.deps.attachDocumentListeners();
        return; // Event handled by handler
      }
    }
    
    // Hand tool should also work everywhere
    if (this.deps.interactionManager && this.getActiveTool() === 'hand') {
      const event = this.deps.createInteractionEvent(InteractionType.CanvasPan, e);
      if (this.deps.interactionManager.start(event)) {
        // Attach document-level listeners for dragging outside canvas
        this.deps.attachDocumentListeners();
        return; // Event handled by handler
      }
    }
    
    // Use interaction handler system for bezier control dragging (only for cursor tool)
    if (this.deps.interactionManager && this.getActiveTool() === 'cursor') {
      const bezierHit = this.deps.hitTestManager.hitTestBezierControlPoint(mouseX, mouseY);
      if (bezierHit && !this.deps.isSpacePressed) {
        const event = this.deps.createInteractionEvent(InteractionType.BezierControlDrag, e, bezierHit);
        if (this.deps.interactionManager.start(event)) {
          return; // Event handled by handler
        }
      }
    }
    
    // Check if dropdown is open - if so, don't handle other interactions
    if (this.deps.uiElementManager.isEnumDropdownVisible()) {
      // Let the dropdown handle clicks (it will close on outside click)
      return;
    }
    
    // Check if frequency bands editor is open - if so, don't handle other interactions
    if (this.deps.uiElementManager.isFrequencyBandsEditorVisible()) {
      // Let the editor handle clicks (it will close on outside click)
      return;
    }

    // Check if color picker popover is open - if so, let it handle clicks
    if (this.deps.uiElementManager.isColorPickerVisible()) {
      return;
    }

    // Check color picker (OKLCH swatch/button) before parameter hit – open popover
    if (this.getActiveTool() === 'cursor' && this.deps.handleColorPickerClick) {
      const colorPickerHit = this.deps.hitTestManager.hitTestColorPicker(mouseX, mouseY);
      if (colorPickerHit) {
        e.preventDefault();
        e.stopPropagation();
        this.deps.handleColorPickerClick(colorPickerHit.nodeId, mouseX, mouseY);
        return;
      }
    }
    
    // Use interaction handler system for parameter dragging (only for cursor tool)
    if (this.deps.interactionManager && this.getActiveTool() === 'cursor') {
      const paramHit = this.deps.hitTestManager.hitTestParameter(mouseX, mouseY);
      if (paramHit && !this.deps.isSpacePressed) {
        // Handle string parameters (file inputs) specially - not handled by handler
        if (paramHit.isString) {
          this.deps.handleFileParameterClick(paramHit.nodeId, paramHit.paramName, mouseX, mouseY);
          return;
        }
        
        // Handle array parameters (frequency bands) specially - not handled by handler
        if (paramHit.isArray) {
          this.deps.handleFrequencyBandsParameterClick(paramHit.nodeId, paramHit.paramName, mouseX, mouseY);
          return;
        }

        // Handle frequency-range element (slider / start / end) - start drag
        if (paramHit.frequencyBand && paramHit.scale != null) {
          const node = this.graph.nodes.find(n => n.id === paramHit.nodeId);
          if (!node) return;
          const raw = node.parameters[paramHit.paramName];
          const bands: number[][] = Array.isArray(raw)
            ? (raw as unknown as number[][]).map((b) => (Array.isArray(b) && b.length >= 2 ? [Number(b[0]) ?? FREQ_MIN, Number(b[1]) ?? FREQ_MAX] : [FREQ_MIN, FREQ_MAX]))
            : [];
          const band = bands[paramHit.frequencyBand.bandIndex] ?? [FREQ_MIN, FREQ_MAX];
          const idx = paramHit.frequencyBand.field === 'start' || paramHit.frequencyBand.field === 'sliderLow' ? 0 : 1;
          const currentHz = Number(band[idx]) ?? (idx === 0 ? FREQ_MIN : FREQ_MAX);
          this.setState({
            interaction: {
              isDraggingParameter: true,
              draggingParameterNodeId: paramHit.nodeId,
              draggingParameterName: paramHit.paramName,
              dragParamStartX: mouseX,
              dragParamStartY: mouseY,
              dragParamStartValue: currentHz,
              draggingFrequencyBand: { ...paramHit.frequencyBand, scale: paramHit.scale }
            }
          });
          this.deps.canvas.style.cursor = paramHit.frequencyBand.field === 'sliderLow' || paramHit.frequencyBand.field === 'sliderHigh' ? 'ew-resize' : 'ns-resize';
          return;
        }

        // Check if this is an enum parameter - handle dropdown before drag handler
        const node = this.graph.nodes.find(n => n.id === paramHit.nodeId);
        const spec = this.deps.nodeSpecs.get(node?.type || '');
        if (node && spec) {
          const paramSpec = spec.parameters[paramHit.paramName];
          if (paramSpec) {
            const parameterRegistry = getParameterUIRegistry();
            const renderer = parameterRegistry.getRenderer(spec, paramHit.paramName);
            if (renderer.getUIType() === 'enum') {
              // Handle enum parameter - open dropdown menu
              e.preventDefault(); // Prevent default behavior
              e.stopPropagation(); // Prevent other handlers from interfering
              this.deps.handleEnumParameterClick(paramHit.nodeId, paramHit.paramName, mouseX, mouseY);
              return;
            }
          }
        }

        // Explicit mode-button check: if click is on the mode button for this param, cycle mode instead of starting drag
        const modeHit = this.deps.hitTestManager.hitTestParameterMode(mouseX, mouseY);
        if (modeHit && modeHit.nodeId === paramHit.nodeId && modeHit.paramName === paramHit.paramName) {
          const modeNode = this.graph.nodes.find(n => n.id === modeHit.nodeId);
          const modeSpec = this.deps.nodeSpecs.get(modeNode?.type || '');
          if (modeNode && modeSpec) {
            const modeParamSpec = modeSpec.parameters[modeHit.paramName];
            if (modeParamSpec && modeParamSpec.type === 'float') {
              const modes: import('../../../../types/nodeSpec').ParameterInputMode[] = ['override', 'add', 'subtract', 'multiply'];
              const currentMode = modeNode.parameterInputModes?.[modeHit.paramName] || modeParamSpec.inputMode || 'override';
              const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
              const nextMode = modes[nextIndex];
              if (!modeNode.parameterInputModes) modeNode.parameterInputModes = {};
              modeNode.parameterInputModes[modeHit.paramName] = nextMode;
              this.deps.onParameterInputModeChanged?.(modeHit.nodeId, modeHit.paramName, nextMode);
              this.deps.handlerContext.render();
              return;
            }
          }
        }

        const event = this.deps.createInteractionEvent(InteractionType.ParameterDrag, e, paramHit);
        if (this.deps.interactionManager.start(event)) {
          return; // Event handled by handler
        }
        
        // Fallback: legacy parameter handling when interaction manager doesn't handle it
        if (node && spec) {
          const paramSpec = spec.parameters[paramHit.paramName];
          if (!paramSpec) return;
          
          // Check if this is a toggle parameter (int with min 0, max 1)
          // This matches the logic in NodeRenderer.isToggleNode
          const isToggle = paramSpec.type === 'int' && 
            paramSpec.min === 0 && 
            paramSpec.max === 1;
          
          // Handle toggle parameters - toggle on click instead of drag
          if (isToggle) {
            const currentValue = (node.parameters[paramHit.paramName] ?? paramSpec.default) as number;
            const newValue = currentValue === 1 ? 0 : 1;
            this.flushParameterChangeAndRender(paramHit.nodeId, paramHit.paramName, newValue);
            return;
          }
          
          // Handle float/int parameters - drag to adjust
          if (paramSpec.type === 'float' || paramSpec.type === 'int') {
            this.setState({
              interaction: {
                isDraggingParameter: true,
                draggingParameterNodeId: paramHit.nodeId,
                draggingParameterName: paramHit.paramName,
                dragParamStartY: mouseY,
                dragParamStartValue: (node.parameters[paramHit.paramName] ?? paramSpec.default) as number
              }
            });
            this.deps.canvas.style.cursor = 'ns-resize';
            return;
          }
        }
      }
    }
    
    // Use interaction handler system for port connection (only for cursor tool)
    if (this.deps.interactionManager && this.getActiveTool() === 'cursor') {
      const portHit = this.deps.hitTestManager.hitTestPort(mouseX, mouseY);
      if (portHit) {
        const event = this.deps.createInteractionEvent(InteractionType.PortConnect, e, portHit);
        if (this.deps.interactionManager.start(event)) {
          return; // Event handled by handler
        }
      }
    }
    
    // Use interaction handler system for connection selection (only for cursor tool)
    // Check connection before node so clicking on a cable selects it even when the cable overlaps a node's bounds
    if (this.deps.interactionManager && this.getActiveTool() === 'cursor') {
      const connHit = this.deps.hitTestManager.hitTestConnection(mouseX, mouseY);
      if (connHit) {
        const event = this.deps.createInteractionEvent(InteractionType.NodeSelect, e, connHit);
        if (this.deps.interactionManager.start(event)) {
          return; // Event handled by handler
        }
      }
    }
    
    // Use interaction handler system for node dragging (only for cursor tool)
    if (this.deps.interactionManager && this.getActiveTool() === 'cursor') {
      const nodeHit = this.deps.hitTestManager.hitTestNode(mouseX, mouseY);
      if (nodeHit && !this.deps.isSpacePressed) {
        const event = this.deps.createInteractionEvent(InteractionType.NodeDrag, e, nodeHit);
        if (this.deps.interactionManager.start(event)) {
          // Attach document-level listeners for dragging outside canvas
          this.deps.attachDocumentListeners();
          return; // Event handled by handler
        }
      }
    }
    
    // Use interaction handler system for canvas panning (fallback for cursor tool)
    if (this.deps.interactionManager && this.getActiveTool() === 'cursor') {
      // Check for panning scenarios: spacebar+drag, middle mouse, or background drag
      const isSpacePressed = this.deps.isSpacePressed;
      const isMiddleMouse = e.button === 1;
      const isLeftClickOnEmpty = e.button === 0;
      
      if (isSpacePressed || isMiddleMouse || isLeftClickOnEmpty) {
        const event = this.deps.createInteractionEvent(InteractionType.CanvasPan, e);
        if (this.deps.interactionManager.start(event)) {
          // Attach document-level listeners for dragging outside canvas
          this.deps.attachDocumentListeners();
          // If spacebar or middle mouse, panning started immediately
          // If left click on empty, potential background pan is set up
          if (isLeftClickOnEmpty && !isSpacePressed) {
            // Deselect all immediately for background pan
            // Mark connections as dirty before clearing so they re-render correctly
            const selection = this.deps.getSelectionState();
            if (selection.selectedConnectionIds.size > 0) {
              const previouslySelected = Array.from(selection.selectedConnectionIds);
              this.deps.renderState.markConnectionsDirty(previouslySelected);
            }
            // Mark previously selected nodes as dirty so they re-render without selection border
            if (selection.selectedNodeIds.size > 0) {
              const previouslySelectedNodes = Array.from(selection.selectedNodeIds);
              this.deps.renderState.markNodesDirty(previouslySelectedNodes);
            }
            this.deps.selectionManager.clear();
            this.deps.getSelectionState(); // Sync to state
            this.deps.onNodeSelected?.(null, false);
            this.deps.handlerContext.render();
          }
          return; // Event handled by handler
        }
      }
    }
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
    
    // Use interaction handler system for interaction updates
    if (this.deps.interactionManager) {
      // Always try to update all interaction types in priority order
      // Handlers will check their own state via canHandle() to determine if they're active
      let eventHandled = false;
      
      // Try handlers in priority order (highest first)
      // Node dragging (priority 50)
      const nodeHit = this.deps.hitTestManager.hitTestNode(mouseX, mouseY);
      const eventNodeDrag = this.deps.createInteractionEvent(InteractionType.NodeDrag, e, nodeHit);
      if (this.deps.interactionManager.update(eventNodeDrag)) {
        eventHandled = true;
      }
      
      // Port connection (priority 45)
      const portHit = this.deps.hitTestManager.hitTestPort(mouseX, mouseY);
      const eventPortConnect = this.deps.createInteractionEvent(InteractionType.PortConnect, e, portHit);
      if (this.deps.interactionManager.update(eventPortConnect)) {
        eventHandled = true;
      }
      
      // Parameter dragging (priority 40)
      const paramHit = this.deps.hitTestManager.hitTestParameter(mouseX, mouseY);
      const eventParamDrag = this.deps.createInteractionEvent(InteractionType.ParameterDrag, e, paramHit);
      if (this.deps.interactionManager.update(eventParamDrag)) {
        eventHandled = true;
      }
      
      // Bezier control dragging (priority 35)
      const bezierHit = this.deps.hitTestManager.hitTestBezierControlPoint(mouseX, mouseY);
      const eventBezierDrag = this.deps.createInteractionEvent(InteractionType.BezierControlDrag, e, bezierHit);
      if (this.deps.interactionManager.update(eventBezierDrag)) {
        eventHandled = true;
      }
      
      // Rectangle selection (priority 25)
      if (this.getActiveTool() === 'select') {
        const eventSelection = this.deps.createInteractionEvent(InteractionType.RectangleSelection, e);
        if (this.deps.interactionManager.update(eventSelection)) {
          eventHandled = true;
        }
      }
      
      // Panning (priority 10-15)
      const eventPan = this.deps.createInteractionEvent(InteractionType.CanvasPan, e);
      if (this.deps.interactionManager.update(eventPan)) {
        eventHandled = true;
      }
      
      // Update hover states when no active interaction is consuming mouse events
      // This provides visual feedback for ports and parameters
      if (!eventHandled) {
        // Check for port hover (for highlighting)
        const connectionState = this.deps.getConnectionState();
        const previousHoveredPort = connectionState.hoveredPort;
        let hoverChanged = false;
        if (portHit) {
          if (!previousHoveredPort || previousHoveredPort.nodeId !== portHit.nodeId || previousHoveredPort.port !== portHit.port) {
            hoverChanged = true;
          }
          this.deps.setConnectionState({ hoveredPort: portHit });
          this.deps.canvas.style.cursor = 'crosshair';
        } else {
          if (previousHoveredPort !== null) {
            hoverChanged = true;
          }
          this.deps.setConnectionState({ hoveredPort: null });
        }
        
        // Render if hover state changed
        if (hoverChanged) {
          this.deps.handlerContext.requestRender();
        }
        
        // Update cursor based on what's under the mouse
        const bezierHitHover = this.deps.hitTestManager.hitTestBezierControlPoint(mouseX, mouseY);
        if (bezierHitHover) {
          this.deps.canvas.style.cursor = 'move';
        } else {
          const modeHit = this.deps.hitTestManager.hitTestParameterMode(mouseX, mouseY);
          if (modeHit) {
            this.deps.canvas.style.cursor = 'pointer';
          } else if (portHit) {
            // Port hover already set cursor to crosshair above
          } else if (paramHit) {
            // String (file) parameters: clickable button → pointer
            if (paramHit.isString) {
              this.deps.canvas.style.cursor = 'pointer';
            } else if (paramHit.frequencyBand) {
              // Frequency-range (horizontal slider): edges use ew-resize, start/end use default
              this.deps.canvas.style.cursor = (paramHit.frequencyBand.field === 'sliderLow' || paramHit.frequencyBand.field === 'sliderHigh') ? 'ew-resize' : 'default';
            } else {
              // Check if this is a toggle parameter
              const node = this.graph.nodes.find(n => n.id === paramHit.nodeId);
              const spec = this.deps.nodeSpecs.get(node?.type || '');
              if (node && spec) {
                const paramSpec = spec.parameters[paramHit.paramName];
                const isToggle = paramSpec && paramSpec.type === 'int' && 
                  paramSpec.min === 0 && 
                  paramSpec.max === 1;
                this.deps.canvas.style.cursor = isToggle ? 'pointer' : 'ns-resize';
              } else {
                this.deps.canvas.style.cursor = 'ns-resize';
              }
            }
          } else if (this.getActiveTool() === 'hand') {
            this.deps.canvas.style.cursor = 'grab';
          } else if (this.getActiveTool() === 'select') {
            this.deps.canvas.style.cursor = 'crosshair';
          } else if (this.deps.isSpacePressed) {
            this.deps.canvas.style.cursor = 'grab';
          } else {
            this.deps.canvas.style.cursor = 'default';
          }
        }
      }
      
      // Continue with edge scrolling and other logic below
    }
    
    // Fallback to old implementation
    // Check if we should start background panning
    const state = this.getState();
    if (state.pan.potentialBackgroundPan && !state.pan.isPanning) {
      const dx = mouseX - state.pan.backgroundDragStartX;
      const dy = mouseY - state.pan.backgroundDragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > this.backgroundDragThreshold) {
        // Start panning
        const viewState = this.deps.getViewStateInternal();
        this.setState({
          pan: {
            isPanning: true,
            potentialBackgroundPan: false,
            panStartX: state.pan.backgroundDragStartX - viewState.panX,
            panStartY: state.pan.backgroundDragStartY - viewState.panY
          }
        });
        this.deps.canvas.style.cursor = 'grabbing';
      }
    }
    
    // Check if we should start node dragging
    if (state.interaction.potentialNodeDrag && !state.interaction.isDraggingNode && state.interaction.potentialNodeDragId) {
      const dx = mouseX - state.interaction.nodeDragStartX;
      const dy = mouseY - state.interaction.nodeDragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > this.nodeDragThreshold) {
        // Start dragging
        const draggedNode = this.graph.nodes.find(n => n.id === state.interaction.potentialNodeDragId);
        const selectedNodesInitialPositions = new Map<string, { x: number; y: number }>();
        
        if (draggedNode) {
          const draggingNodeInitialPos = { x: draggedNode.position.x, y: draggedNode.position.y };
          
          // Store initial positions of all selected nodes (including the dragged one)
          const selection = this.deps.getSelectionState();
          for (const selectedNodeId of selection.selectedNodeIds) {
            const selectedNode = this.graph.nodes.find(n => n.id === selectedNodeId);
            if (selectedNode) {
              selectedNodesInitialPositions.set(selectedNodeId, {
                x: selectedNode.position.x,
                y: selectedNode.position.y
              });
            }
          }
          
          this.setState({
            interaction: {
              isDraggingNode: true,
              draggingNodeId: state.interaction.potentialNodeDragId,
              potentialNodeDrag: false,
              draggingNodeInitialPos,
              selectedNodesInitialPositions
            }
          });
        }
        this.deps.canvas.style.cursor = 'grabbing';
      }
    }
    
    // Update cursor and port hover state (when not actively dragging)
    const currentState = this.getState();
    if (!currentState.pan.isPanning && !currentState.interaction.isDraggingNode && !currentState.connection.isConnecting && !currentState.interaction.isDraggingParameter && !currentState.interaction.isDraggingBezierControl && !currentState.pan.potentialBackgroundPan && !currentState.interaction.potentialNodeDrag) {
      // Check for port hover (for highlighting)
      const portHit = this.deps.hitTestManager.hitTestPort(mouseX, mouseY);
      const previousHoveredPort = currentState.connection.hoveredPort;
      let hoverChanged = false;
      
      if (portHit) {
        if (!previousHoveredPort || previousHoveredPort.nodeId !== portHit.nodeId || previousHoveredPort.port !== portHit.port) {
          hoverChanged = true;
        }
        this.deps.setConnectionState({ hoveredPort: portHit });
        this.deps.canvas.style.cursor = 'crosshair';
      } else {
        if (previousHoveredPort !== null) {
          hoverChanged = true;
        }
        this.deps.setConnectionState({ hoveredPort: null });
      }
      
      // Render if hover state changed
      if (hoverChanged) {
        this.deps.handlerContext.render();
      }
      
      // Check for bezier control point hover (high priority)
      const bezierHit = this.deps.hitTestManager.hitTestBezierControlPoint(mouseX, mouseY);
      if (bezierHit) {
        this.deps.canvas.style.cursor = 'move';
      } else {
        // Check for parameter mode selector hover
        const modeHit = this.deps.hitTestManager.hitTestParameterMode(mouseX, mouseY);
        if (modeHit) {
          this.deps.canvas.style.cursor = 'pointer';
        } else if (portHit) {
          // Port hover already set cursor to crosshair above
        } else {
          // Check for parameter value hover
          const paramHit = this.deps.hitTestManager.hitTestParameter(mouseX, mouseY);
          if (paramHit) {
            // String (file) parameters: clickable button → pointer
            if (paramHit.isString) {
              this.deps.canvas.style.cursor = 'pointer';
            } else if (paramHit.frequencyBand) {
              // Frequency-range (horizontal slider): edges use ew-resize, start/end use default
              this.deps.canvas.style.cursor = (paramHit.frequencyBand.field === 'sliderLow' || paramHit.frequencyBand.field === 'sliderHigh') ? 'ew-resize' : 'default';
            } else {
              // Check if this is a toggle parameter - use pointer cursor for toggles
              const node = this.graph.nodes.find(n => n.id === paramHit.nodeId);
              const spec = this.deps.nodeSpecs.get(node?.type || '');
              if (node && spec) {
                const paramSpec = spec.parameters[paramHit.paramName];
                const isToggle = paramSpec && paramSpec.type === 'int' && 
                  paramSpec.min === 0 && 
                  paramSpec.max === 1;
                this.deps.canvas.style.cursor = isToggle ? 'pointer' : 'ns-resize';
              } else {
                this.deps.canvas.style.cursor = 'ns-resize';
              }
            }
          } else if (this.getActiveTool() === 'hand') {
            this.deps.canvas.style.cursor = 'grab';
          } else if (this.getActiveTool() === 'select') {
            this.deps.canvas.style.cursor = 'crosshair';
          } else if (this.deps.isSpacePressed) {
            this.deps.canvas.style.cursor = 'grab';
          } else {
            this.deps.canvas.style.cursor = 'default';
          }
        }
      }
    }
    
    // Check for edge scrolling when dragging nodes or connections
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
    
    // Panning and node dragging are handled by InteractionManager
    // Old fallback code removed - handlers are always used
    const currentStateForDrag = this.getState();
    if (currentStateForDrag.interaction.isDraggingNode && currentStateForDrag.interaction.draggingNodeId && currentStateForDrag.interaction.draggingNodeInitialPos) {
      const node = this.graph.nodes.find(n => n.id === currentStateForDrag.interaction.draggingNodeId)!;
      const canvasPos = this.deps.screenToCanvas(mouseX - currentStateForDrag.interaction.dragOffsetX, mouseY - currentStateForDrag.interaction.dragOffsetY);
      
      // Calculate smart guides and snap position for the primary dragged node
      const { snappedX, snappedY, guides } = this.deps.calculateSmartGuides(node, canvasPos.x, canvasPos.y);
      
      // Calculate the delta from initial position
      const deltaX = snappedX - currentStateForDrag.interaction.draggingNodeInitialPos.x;
      const deltaY = snappedY - currentStateForDrag.interaction.draggingNodeInitialPos.y;
      
      // Move all selected nodes by the same delta
      const movedNodeIds: string[] = [];
      for (const [nodeId, initialPos] of currentStateForDrag.interaction.selectedNodesInitialPositions.entries()) {
        const selectedNode = this.graph.nodes.find(n => n.id === nodeId);
        if (selectedNode) {
          selectedNode.position.x = Math.round(initialPos.x + deltaX);
          selectedNode.position.y = Math.round(initialPos.y + deltaY);

          this.deps.onNodeMoved?.(nodeId, selectedNode.position.x, selectedNode.position.y);
          movedNodeIds.push(nodeId);
        }
      }
      
      this.deps.setSmartGuides(guides);
      // Mark moved nodes and all related elements as dirty
      this.deps.renderState.markNodesDirty(movedNodeIds);
      this.deps.renderState.markLayerDirty(RenderLayer.Overlays); // Smart guides render in overlay layer
      
      // Mark all connections connected to moved nodes as dirty (connections need to redraw when endpoints move)
      const connectionsToUpdate: string[] = [];
      for (const nodeId of movedNodeIds) {
        for (const conn of this.graph.connections) {
          if (conn.sourceNodeId === nodeId || conn.targetNodeId === nodeId) {
            connectionsToUpdate.push(conn.id);
          }
        }
      }
      if (connectionsToUpdate.length > 0) {
        this.deps.renderState.markConnectionsDirty(connectionsToUpdate);
      }
      
      // Clear connection path caches when nodes move (port positions change)
      this.deps.connectionLayerRenderer?.clearCache();
      this.deps.parameterConnectionLayerRenderer?.clearCache();
      
      // Mark ports layer as dirty (ports are rendered separately and need to move with nodes)
      this.deps.renderState.markLayerDirty(RenderLayer.Ports);
      this.deps.renderState.markLayerDirty(RenderLayer.Connections);
      this.deps.renderState.markLayerDirty(RenderLayer.ParameterConnections);
      
      this.deps.handlerContext.requestRender();
    } else {
      const currentStateForParam = this.getState();
      if (currentStateForParam.interaction.isDraggingParameter && currentStateForParam.interaction.draggingParameterNodeId && currentStateForParam.interaction.draggingParameterName) {
        const node = this.graph.nodes.find(n => n.id === currentStateForParam.interaction.draggingParameterNodeId);
        const spec = this.deps.nodeSpecs.get(node?.type || '');
        const fb = currentStateForParam.interaction.draggingFrequencyBand;
        if (node && spec && fb) {
          const raw = node.parameters[currentStateForParam.interaction.draggingParameterName!];
          const bands: number[][] = (Array.isArray(raw) ? raw : []).map((b: unknown) =>
            Array.isArray(b) && b.length >= 2 ? [Number(b[0]) ?? FREQ_MIN, Number(b[1]) ?? FREQ_MAX] : [FREQ_MIN, FREQ_MAX]
          );
          const bandIndex = fb.bandIndex;
          const idx = fb.field === 'start' || fb.field === 'sliderLow' ? 0 : 1;
          if (bands[bandIndex] == null) bands[bandIndex] = [FREQ_MIN, FREQ_MAX];
          if (fb.field === 'sliderLow' || fb.field === 'sliderHigh') {
            const metrics = this.deps.nodeMetrics.get(node.id);
            const layout = spec.parameterLayout?.elements ?? [];
            let em: { x?: number; width?: number } | undefined;
            for (let i = 0; i < layout.length; i++) {
              const el = layout[i] as { type?: string; bandIndex?: number };
              if (el?.type === 'frequency-range' && (el.bandIndex ?? 0) === bandIndex) {
                em = metrics?.elementMetrics?.get(`frequency-range-${i}-${bandIndex}`);
                break;
              }
            }
            if (em?.x != null && em?.width != null) {
              const pd = getCSSVariableAsNumber('embed-slot-pd', 12);
              const sliderX = em.x + pd;
              const sliderW = em.width - pd * 2;
              const canvasPos = this.deps.screenToCanvas(mouseX, mouseY);
              let norm = (canvasPos.x - sliderX) / sliderW;
              norm = Math.max(0, Math.min(1, norm));
              const newHz = Math.round(normToHz(norm, fb.scale));
              bands[bandIndex][idx] = Math.max(FREQ_MIN, Math.min(FREQ_MAX, newHz));
            }
          } else {
            const deltaY = currentStateForParam.interaction.dragParamStartY - mouseY;
            const baseSensitivity = 150;
            const modifier = e.shiftKey ? 0.1 : (e.ctrlKey || e.metaKey ? 10 : 1);
            const range = FREQ_MAX - FREQ_MIN;
            const valueDelta = (deltaY / baseSensitivity) * range * modifier;
            const newHz = Math.max(FREQ_MIN, Math.min(FREQ_MAX, currentStateForParam.interaction.dragParamStartValue + valueDelta));
            bands[bandIndex][idx] = Math.round(newHz);
          }
          const newBands = bands;
          node.parameters[currentStateForParam.interaction.draggingParameterName!] = newBands as any;
          this.deps.nodeMetrics.delete(currentStateForParam.interaction.draggingParameterNodeId!);
          this.deps.nodeRenderer.invalidateMetrics(currentStateForParam.interaction.draggingParameterNodeId!);
          const comp = this.deps.nodeComponents.get(currentStateForParam.interaction.draggingParameterNodeId!);
          if (comp) comp.invalidateMetrics();
          this.flushParameterChangeAndRender(currentStateForParam.interaction.draggingParameterNodeId!, currentStateForParam.interaction.draggingParameterName!, newBands);
        } else if (node && spec) {
          const paramSpec = spec.parameters[currentStateForParam.interaction.draggingParameterName];
          if (paramSpec && (paramSpec.type === 'float' || paramSpec.type === 'int')) {
            // Calculate delta in screen space (Up = increase, down = decrease)
            const deltaY = currentStateForParam.interaction.dragParamStartY - mouseY;
            const modifier = e.shiftKey ? 'fine' : (e.ctrlKey || e.metaKey ? 'coarse' : 'normal');
          
          const min = paramSpec.min ?? 0;
          const max = paramSpec.max ?? 1;
          const range = max - min;
          
          // For range slider parameters (remap and analyzer band remap), use slider height for sensitivity
          const p = currentStateForParam.interaction.draggingParameterName || '';
          const isRangeSliderParam =
            ['inMin', 'inMax', 'outMin', 'outMax'].includes(p) ||
            /^band\d+Remap(InMin|InMax|OutMin|OutMax)$/.test(p);
          let baseSensitivity: number;
          
          if (isRangeSliderParam) {
            // Calculate the visual slider height in screen pixels
            const sliderUIHeight = getCSSVariableAsNumber('range-editor-height', 260);
            const sliderUIPadding = 12;
            const topMargin = 12;
            const bottomMargin = 12;
            const sliderHeight = sliderUIHeight - sliderUIPadding * 2 - topMargin - bottomMargin;
            // Convert canvas height to screen pixels
            const viewState = this.deps.getViewStateInternal();
            baseSensitivity = sliderHeight * viewState.zoom;
          } else {
            // For regular parameters, use a default sensitivity
            baseSensitivity = 100;
          }
          
          const multipliers = {
            'normal': 1.0,
            'fine': 0.1,
            'coarse': 10.0
          };
          
          const sensitivity = baseSensitivity / multipliers[modifier];
          const valueDelta = (deltaY / sensitivity) * range;
          const rawValue = currentStateForParam.interaction.dragParamStartValue + valueDelta;
          const newValue = snapParameterValue(rawValue, paramSpec);

          node.parameters[currentStateForParam.interaction.draggingParameterName] = newValue;
          
          // Invalidate metrics cache so controls update during drag
          this.deps.nodeMetrics.delete(currentStateForParam.interaction.draggingParameterNodeId);
          this.deps.nodeRenderer.invalidateMetrics(currentStateForParam.interaction.draggingParameterNodeId);
          const component = this.deps.nodeComponents.get(currentStateForParam.interaction.draggingParameterNodeId);
          if (component) {
            component.invalidateMetrics();
          }
          
          this.flushParameterChangeAndRender(currentStateForParam.interaction.draggingParameterNodeId, currentStateForParam.interaction.draggingParameterName, newValue);
          }
        }
      } else {
        const currentStateForBezier = this.getState();
        if (currentStateForBezier.interaction.isDraggingBezierControl && currentStateForBezier.interaction.draggingBezierNodeId !== null && currentStateForBezier.interaction.draggingBezierControlIndex !== null && currentStateForBezier.interaction.dragBezierStartValues) {
          const node = this.graph.nodes.find(n => n.id === currentStateForBezier.interaction.draggingBezierNodeId);
          const spec = this.deps.nodeSpecs.get(node?.type || '');
          const metrics = this.deps.nodeMetrics.get(node?.id || '');
          if (!node || !spec || !metrics) return;
          const x1Pos = metrics.parameterGridPositions.get('x1');
          if (!x1Pos) return;
          
          const bezierEditorX = x1Pos.cellX;
          const bezierEditorY = x1Pos.cellY;
          const bezierEditorWidth = x1Pos.cellWidth;
          const bezierEditorHeight = x1Pos.cellHeight;
          const bezierEditorPadding = getCSSVariableAsNumber('bezier-editor-padding', 12);
          
          // Calculate drawing area
          const drawX = bezierEditorX + bezierEditorPadding;
          const drawY = bezierEditorY + bezierEditorPadding;
          const drawWidth = bezierEditorWidth - bezierEditorPadding * 2;
          const drawHeight = bezierEditorHeight - bezierEditorPadding * 2;
          
          // Convert mouse position to canvas coordinates
          const canvasPos = this.deps.screenToCanvas(mouseX, mouseY);
          
          // Calculate new control point position (clamped to editor bounds)
          let newX = (canvasPos.x - drawX) / drawWidth;
          let newY = 1 - (canvasPos.y - drawY) / drawHeight; // Flip Y for parameter space
          
          // Clamp to [0, 1]
          newX = Math.max(0, Math.min(1, newX));
          newY = Math.max(0, Math.min(1, newY));
          
          // Update the appropriate parameters based on control index
          if (currentStateForBezier.interaction.draggingBezierControlIndex === 0) {
            // Control point 1 (x1, y1)
            node.parameters.x1 = newX;
            node.parameters.y1 = newY;
            this.deps.onParameterChanged?.(currentStateForBezier.interaction.draggingBezierNodeId, 'x1', newX);
            this.deps.onParameterChanged?.(currentStateForBezier.interaction.draggingBezierNodeId, 'y1', newY);
          } else if (currentStateForBezier.interaction.draggingBezierControlIndex === 1) {
            // Control point 2 (x2, y2)
            node.parameters.x2 = newX;
            node.parameters.y2 = newY;
            this.deps.onParameterChanged?.(currentStateForBezier.interaction.draggingBezierNodeId, 'x2', newX);
            this.deps.onParameterChanged?.(currentStateForBezier.interaction.draggingBezierNodeId, 'y2', newY);
          }
          
          this.deps.handlerContext.render();
        } else {
          const currentStateForConn = this.getState();
          if (currentStateForConn.connection.isConnecting) {
            // Update connection mouse position
            this.setState({
              connection: {
                connectionMouseX: mouseX,
                connectionMouseY: mouseY
              }
            });
            
            // Check if hovering over a valid input port (only if dragging from output)
            if (currentStateForConn.connection.connectionStartIsOutput) {
              const portHit = this.deps.hitTestManager.hitTestPort(mouseX, mouseY);
              // Only highlight input ports (not outputs) and not the same node
              if (portHit && !portHit.isOutput && portHit.nodeId !== currentStateForConn.connection.connectionStartNodeId) {
                this.setState({ connection: { hoveredPort: portHit } });
              } else {
                this.setState({ connection: { hoveredPort: null } });
              }
            } else {
              this.setState({ connection: { hoveredPort: null } });
            }
            this.deps.handlerContext.render();
          }
        }
      }
    }
  }
  
  /**
   * Handle mouse up event
   */
  handleMouseUp(e: MouseEvent): void {
    // Detach document-level listeners when drag ends
    this.deps.detachDocumentListeners();
    
    // Try new interaction handler system for interaction end (Phase 2.4)
    if (this.deps.interactionManager) {
      // Always try to end all interaction types - handlers will check if they're active
      // This ensures handlers can clean up their state even if old instance variables aren't set
      const eventTypes = [
        InteractionType.NodeDrag,
        InteractionType.ParameterDrag,
        InteractionType.BezierControlDrag,
        InteractionType.PortConnect,
        InteractionType.CanvasPan,
        InteractionType.RectangleSelection
      ];
      
      for (const eventType of eventTypes) {
        const event = this.deps.createInteractionEvent(eventType, e);
        this.deps.interactionManager.end(event);
      }
    }
    
    // Stop edge scrolling
    this.deps.edgeScrollManager.stop();
    
    // Clear smart guides
    this.deps.setSmartGuides({ vertical: [], horizontal: [] });
    // Force overlays to redraw immediately so guide lines disappear on mouseup
    this.deps.renderState.markLayerDirty(RenderLayer.Overlays);
    this.deps.handlerContext.requestRender();
    
    const currentState = this.getState();
    if (currentState.connection.isConnecting) {
      // Check if released on a valid port
      const portHit = this.deps.hitTestManager.hitTestPort(e.clientX, e.clientY);
      if (portHit && portHit.nodeId !== currentState.connection.connectionStartNodeId) {
        // Valid connection
        if (currentState.connection.connectionStartIsOutput && !portHit.isOutput) {
          // Output to input or parameter
          if (portHit.parameter) {
            // Connecting to parameter input
            this.deps.onConnectionCreated?.(
              currentState.connection.connectionStartNodeId!,
              currentState.connection.connectionStartPort!,
              portHit.nodeId,
              undefined,
              portHit.parameter
            );
          } else {
            // Output to input port
            this.deps.onConnectionCreated?.(
              currentState.connection.connectionStartNodeId!,
              currentState.connection.connectionStartPort!,
              portHit.nodeId,
              portHit.port
            );
          }
        } else if (!currentState.connection.connectionStartIsOutput && portHit.isOutput) {
          // Input to output (reverse) - not applicable for parameter inputs
          this.deps.onConnectionCreated?.(
            portHit.nodeId,
            portHit.port,
            currentState.connection.connectionStartNodeId!,
            currentState.connection.connectionStartPort!
          );
        }
      }
      this.setState({
        connection: {
          isConnecting: false,
          connectionStartNodeId: null,
          connectionStartPort: null,
          connectionStartParameter: null,
          hoveredPort: null
        }
      });
      this.deps.canvas.style.cursor = this.deps.isSpacePressed ? 'grab' : 'default';
      this.deps.handlerContext.render();
    }
    
    // If we had a potential node drag but didn't actually drag, the selection was already handled in mouseDown
    // So we don't need to do anything here - just clean up
    const finalState = this.getState();
    if (finalState.interaction.potentialNodeDrag && !finalState.interaction.isDraggingNode && finalState.interaction.potentialNodeDragId) {
      // Selection was already handled in mouseDown, so we just clean up the drag state
      // No need to change selection here
    }
    
    // Handle double-click on parameter value for text input
    if (!finalState.pan.isPanning && !finalState.interaction.isDraggingNode && !finalState.connection.isConnecting && !finalState.interaction.isDraggingParameter) {
      const paramHit = this.deps.hitTestManager.hitTestParameter(e.clientX, e.clientY);
      if (paramHit && e.detail === 2) {
        // Double-click on parameter - could show text input (for now, just log)
        // TODO: Implement text input overlay for parameter editing
      }
    }

    // Reset all interaction state
    this.setState({
      pan: {
        isPanning: false,
        potentialBackgroundPan: false
      },
      interaction: {
        isDraggingNode: false,
        draggingNodeId: null,
        draggingNodeInitialPos: null,
        selectedNodesInitialPositions: new Map(),
        isDraggingParameter: false,
        draggingParameterNodeId: null,
        draggingParameterName: null,
        dragParamStartX: 0,
        dragParamStartY: 0,
        dragParamStartValue: 0,
        draggingFrequencyBand: null,
        isDraggingBezierControl: false,
        draggingBezierNodeId: null,
        draggingBezierControlIndex: null,
        dragBezierStartValues: null,
        potentialNodeDrag: false,
        potentialNodeDragId: null
      }
    });
    // Reset cursor based on spacebar state
    this.deps.canvas.style.cursor = this.deps.isSpacePressed ? 'grab' : 'default';
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
