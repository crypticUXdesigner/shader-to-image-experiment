/**
 * OverlayManager
 * 
 * Manages UI overlay operations including parameter input, label input, and dialogs.
 * Consolidates overlay logic that was previously split between NodeEditorCanvas and UIElementManager.
 */
import type { NodeGraph } from '../../../data-model/types';
import type { NodeSpec } from '../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../NodeRenderer';
import { UIElementManager } from './UIElementManager';
import { HitTestManager } from './HitTestManager';
import { NodeRenderer } from '../NodeRenderer';
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { getHeaderMainContentBoundsCanvas } from '../../../utils/nodeHeaderGeometry';
import { snapParameterValue } from '../../../utils/parameterValueCalculator';
import type { DropdownMenuItem, SignalSelectPayload } from '../../../types/editor';

export interface OverlayManagerDependencies {
  uiElementManager: UIElementManager;
  hitTestManager: HitTestManager;
  nodeSpecs: Map<string, NodeSpec>;
  nodeMetrics: Map<string, NodeRenderMetrics>;
  graph: NodeGraph;
  nodeRenderer: NodeRenderer;
  ctx: CanvasRenderingContext2D;
  onParameterChanged?: (nodeId: string, paramName: string, value: import('../../../data-model/types').ParameterValue) => void;
  onNodeLabelChanged?: (nodeId: string, label: string | undefined) => void;
  onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
  /** Called before opening the native file picker (e.g. pause WebGL to reduce context loss risk). */
  onFileDialogOpen?: () => void;
  /** Called when the file picker closes (file selected or cancelled) so rendering can resume. */
  onFileDialogClose?: () => void;
  /** Getter for connection creation callback (used by signal picker). */
  getOnConnectionCreated?: () => ((sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void) | undefined;
  /** Getter for connection removal callback (used by signal picker disconnect). */
  getOnConnectionRemoved?: () => ((connectionId: string) => void) | undefined;
  updateNodeMetrics: () => void;
  render: () => void;
}

export class OverlayManager {
  private uiElementManager: UIElementManager;
  private hitTestManager: HitTestManager;
  private nodeSpecs: Map<string, NodeSpec>;
  private nodeMetrics: Map<string, NodeRenderMetrics>;
  private graph: NodeGraph;
  private nodeRenderer: NodeRenderer;
  private ctx: CanvasRenderingContext2D;
  private onParameterChanged?: (nodeId: string, paramName: string, value: import('../../../data-model/types').ParameterValue) => void;
  private onNodeLabelChanged?: (nodeId: string, label: string | undefined) => void;
  private onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
  private onFileDialogOpen?: () => void;
  private onFileDialogClose?: () => void;
  private getOnConnectionCreated?: () => ((sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort?: string, targetParameter?: string) => void) | undefined;
  private getOnConnectionRemoved?: () => ((connectionId: string) => void) | undefined;
  private updateNodeMetrics: () => void;
  private render: () => void;

  constructor(dependencies: OverlayManagerDependencies) {
    this.uiElementManager = dependencies.uiElementManager;
    this.hitTestManager = dependencies.hitTestManager;
    this.nodeSpecs = dependencies.nodeSpecs;
    this.nodeMetrics = dependencies.nodeMetrics;
    this.graph = dependencies.graph;
    this.nodeRenderer = dependencies.nodeRenderer;
    this.ctx = dependencies.ctx;
    this.onParameterChanged = dependencies.onParameterChanged;
    this.onNodeLabelChanged = dependencies.onNodeLabelChanged;
    this.onFileParameterChanged = dependencies.onFileParameterChanged;
    this.onFileDialogOpen = dependencies.onFileDialogOpen;
    this.onFileDialogClose = dependencies.onFileDialogClose;
    this.getOnConnectionCreated = dependencies.getOnConnectionCreated;
    this.getOnConnectionRemoved = dependencies.getOnConnectionRemoved;
    this.updateNodeMetrics = dependencies.updateNodeMetrics;
    this.render = dependencies.render;
  }

  /**
   * Update dependencies (e.g. when graph is replaced via setGraph).
   */
  updateDependencies(deps: Partial<OverlayManagerDependencies>): void {
    if (deps.graph !== undefined) this.graph = deps.graph;
    if (deps.onFileParameterChanged !== undefined) this.onFileParameterChanged = deps.onFileParameterChanged;
    if (deps.onFileDialogOpen !== undefined) this.onFileDialogOpen = deps.onFileDialogOpen;
    if (deps.onFileDialogClose !== undefined) this.onFileDialogClose = deps.onFileDialogClose;
    if (deps.onParameterChanged !== undefined) this.onParameterChanged = deps.onParameterChanged;
    if (deps.onNodeLabelChanged !== undefined) this.onNodeLabelChanged = deps.onNodeLabelChanged;
  }

  /**
   * Show parameter input overlay for editing numeric parameter values
   * @param screenX Screen X coordinate of the click
   * @param screenY Screen Y coordinate of the click
   * @returns true if parameter input was shown, false otherwise
   */
  showParameterInput(screenX: number, screenY: number): boolean {
    const paramHit = this.hitTestManager.hitTestParameter(screenX, screenY);
    if (!paramHit) return false;
    // Don't show value input when double-click was on the mode button or on a non-numeric control
    if (paramHit.isModeButton || paramHit.isString) return false;

    const node = this.graph.nodes.find(n => n.id === paramHit.nodeId);
    const spec = this.nodeSpecs.get(node?.type || '');
    const metrics = this.nodeMetrics.get(paramHit.nodeId);
    if (!node || !spec || !metrics) return false;
    
    const paramSpec = spec.parameters[paramHit.paramName];
    if (!paramSpec || (paramSpec.type !== 'float' && paramSpec.type !== 'int')) return false;
    
    const gridPos = metrics.parameterGridPositions.get(paramHit.paramName);
    if (!gridPos) return false;
    
    // Get current value
    const currentValue = node.parameters[paramHit.paramName] ?? paramSpec.default;
    const numValue = typeof currentValue === 'number' ? currentValue : 0;
    
    // Center overlay on the value box (valueX/valueY are in canvas space after layout)
    const inputWidth = 180;
    const inputHeight = 40;
    const valueBoxCenterX = gridPos.valueX;
    const valueBoxCenterY = gridPos.valueY;
    const overlayX = valueBoxCenterX - inputWidth / 2;
    const overlayY = valueBoxCenterY - inputHeight / 2;
    
    this.uiElementManager.showParameterInput(
      paramHit.nodeId,
      paramHit.paramName,
      numValue,
      { x: overlayX, y: overlayY },
      { width: inputWidth, height: inputHeight },
      (newValue) => {
        // Snap to parameter constraints (min/max/step/int) so typed values match drag behavior
        const snapped = snapParameterValue(newValue, paramSpec);
        this.onParameterChanged?.(paramHit.nodeId, paramHit.paramName, snapped);
      },
      () => {},
      paramSpec.type === 'int' || paramSpec.type === 'float' ? paramSpec.type : undefined
    );
    
    return true;
  }

  /**
   * Hide parameter input overlay
   */
  hideParameterInput(): void {
    this.uiElementManager.hideParameterInput();
  }

  /**
   * Show label input overlay for editing node labels
   * @param screenX Screen X coordinate of the click
   * @param screenY Screen Y coordinate of the click
   * @returns true if label input was shown, false otherwise
   */
  showLabelInput(screenX: number, screenY: number): boolean {
    const labelHit = this.hitTestManager.hitTestHeaderLabel(screenX, screenY);
    if (!labelHit) return false;
    
    const node = this.graph.nodes.find(n => n.id === labelHit.nodeId);
    const spec = this.nodeSpecs.get(node?.type || '');
    const metrics = this.nodeMetrics.get(node?.id || '');
    if (!node || !spec || !metrics) return false;
    
    // Get header dimensions and label position (same as in hitTestHeaderLabel)
    const headerHeight = metrics.headerHeight;
    const iconBoxHeight = getCSSVariableAsNumber('node-icon-box-height', 48);
    const iconBoxNameSpacing = getCSSVariableAsNumber('node-icon-box-name-spacing', 4);
    const nameSize = getCSSVariableAsNumber('node-header-name-size', 30);
    const nameWeight = getCSSVariableAsNumber('node-header-name-weight', 600);
    
    // Calculate label position (same as in renderHeader)
    const groupHeight = iconBoxHeight + iconBoxNameSpacing + nameSize;
    const { mainTop, mainHeight } = getHeaderMainContentBoundsCanvas(node.position.y, headerHeight, spec);
    const iconBoxY = mainTop + (mainHeight - groupHeight) / 2;
    const nameY = iconBoxY + iconBoxHeight + iconBoxNameSpacing;
    const iconX = node.position.x + metrics.width / 2;
    
    // Measure text to get label bounds
    this.ctx.font = `${nameWeight} ${nameSize}px "Space Grotesk", sans-serif`;
    const currentLabelText = node.label || spec.displayName;
    const textMetrics = this.ctx.measureText(currentLabelText);
    const textWidth = Math.max(textMetrics.width, 100); // Minimum width for input
    const textHeight = nameSize;
    
    // Label center in canvas space (iconX is already horizontal center; nameY is baseline, so center Y is above it)
    const labelCenterX = iconX;
    const labelCenterY = nameY - textHeight / 2;
    
    this.uiElementManager.showLabelInput(
      labelHit.nodeId,
      node.label,
      { x: labelCenterX, y: labelCenterY },
      { width: textWidth, height: textHeight + 8 },
      (newLabel) => {
        this.onNodeLabelChanged?.(labelHit.nodeId, newLabel);
        this.updateNodeMetrics();
        this.render();
      },
      () => {}
    );
    
    return true;
  }

  /**
   * Hide label input overlay
   */
  hideLabelInput(): void {
    this.uiElementManager.hideLabelInput();
  }

  /**
   * Handle file parameter click - show file input dialog
   * @param nodeId Node ID containing the parameter
   * @param paramName Parameter name
   * @param _screenX Screen X coordinate (unused)
   * @param _screenY Screen Y coordinate (unused)
   */
  handleFileParameterClick(nodeId: string, paramName: string, _screenX: number, _screenY: number): void {
    let resolved = false;
    const resolveDialog = (): void => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener('focus', focusHandler);
      this.onFileDialogClose?.();
    };
    const focusHandler = (): void => resolveDialog();

    this.onFileDialogOpen?.();
    window.addEventListener('focus', focusHandler);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/mpeg,audio/mp3,.mp3';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (e) => {
      resolveDialog();
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (this.onFileParameterChanged) {
          this.onFileParameterChanged(nodeId, paramName, file);
        } else {
          console.error(`[OverlayManager] onFileParameterChanged callback is not set!`);
        }
      } else {
        console.warn(`[OverlayManager] No file selected for node ${nodeId}, parameter ${paramName}`);
      }
      if (fileInput.parentNode === document.body) {
        document.body.removeChild(fileInput);
      }
    });

    document.body.appendChild(fileInput);
    fileInput.click();
  }

  /**
   * Handle enum parameter click - show dropdown menu
   * @param nodeId Node ID containing the parameter
   * @param paramName Parameter name
   * @param screenX Screen X coordinate
   * @param screenY Screen Y coordinate
   */
  handleEnumParameterClick(nodeId: string, paramName: string, screenX: number, screenY: number): void {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    const spec = this.nodeSpecs.get(node?.type || '');
    if (!node || !spec) return;

    const paramSpec = spec.parameters[paramName];
    if (!paramSpec || paramSpec.type !== 'int') return;

    // Get enum mappings from NodeRenderer
    const enumMappings = this.nodeRenderer.getEnumMappings(spec.id, paramName);
    if (!enumMappings) return;

    // If dropdown is already open, close it (toggle behavior)
    if (this.uiElementManager.isEnumDropdownVisible()) {
      this.uiElementManager.hideEnumDropdown();
      return;
    }

    // Get current value
    const currentValue = (node.parameters[paramName] ?? paramSpec.default) as number;

    // Create dropdown items
    const items: DropdownMenuItem[] = Object.entries(enumMappings)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([valueStr, label]) => {
        const value = parseInt(valueStr);
        return {
          label,
          disabled: false,
          selected: value === currentValue,
          action: () => {
            if (value !== currentValue) {
              this.onParameterChanged?.(nodeId, paramName, value);
              this.render();
            }
          }
        };
      });

    // Use click position directly – user clicked on the element, so center dropdown there.
    // No zoom/canvas conversion needed; screen coords are already correct.
    const finalScreenX = screenX;
    const finalScreenY = screenY;

    // Wrap items to ensure they call onParameterChanged
    const wrappedItems: DropdownMenuItem[] = items.map(item => ({
      ...item,
      action: () => {
        item.action(); // This already calls onParameterChanged and render
      }
    }));
    
    this.uiElementManager.showEnumDropdown(
      finalScreenX,
      finalScreenY,
      wrappedItems,
      () => {}, // onSelect not needed since action handles it
      { anchorToSelected: true }
    );
  }

  /**
   * Handle color picker (OKLCH) click – show HSV-style popover
   */
  handleColorPickerClick(nodeId: string, screenX: number, screenY: number): void {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    const spec = this.nodeSpecs.get(node?.type || '');
    if (!node || !spec || !spec.parameterLayout?.elements) return;

    // Use hit test to find which color picker element was clicked
    const hitResult = this.hitTestManager.hitTestColorPicker(screenX, screenY);
    if (!hitResult || hitResult.nodeId !== nodeId) return;

    const layout = spec.parameterLayout.elements;
    const clickedElement = layout[hitResult.elementIndex] as
      | { type: 'color-picker'; parameters?: [string, string, string] }
      | { type: 'color-picker-row'; pickers: [[string, string, string], [string, string, string]] }
      | { type: 'color-picker-row-with-ports'; pickers: [[string, string, string], [string, string, string]] };
    if (!clickedElement) return;

    let paramNames: [string, string, string];
    if (clickedElement.type === 'color-picker-row' || clickedElement.type === 'color-picker-row-with-ports') {
      const pickerIndex = hitResult.pickerIndex ?? 0;
      paramNames = clickedElement.pickers[pickerIndex];
    } else if (clickedElement.type === 'color-picker') {
      paramNames = clickedElement.parameters || ['l', 'c', 'h'];
    } else {
      return;
    }

    const [lParam, cParam, hParam] = paramNames;

    const l = (node.parameters[lParam] ?? spec.parameters[lParam]?.default ?? 0.5) as number;
    const c = (node.parameters[cParam] ?? spec.parameters[cParam]?.default ?? 0.1) as number;
    const h = (node.parameters[hParam] ?? spec.parameters[hParam]?.default ?? 0) as number;

    const popoverY = screenY + 8;

    this.uiElementManager.showColorPicker(
      nodeId,
      { l, c, h },
      screenX,
      popoverY,
      (newL, newC, newH) => {
        this.onParameterChanged?.(nodeId, lParam, newL);
        this.onParameterChanged?.(nodeId, cParam, newC);
        this.onParameterChanged?.(nodeId, hParam, newH);
        this.render();
      }
    );
  }

  /**
   * Handle parameter port click – show signal connection picker (graph outputs + audio signals).
   */
  handleSignalPickerClick(screenX: number, screenY: number, targetNodeId: string, targetParameter: string): void {
    const onSelect = (payload: SignalSelectPayload) => {
      if (payload.type === 'graph' && payload.nodeId != null && payload.port != null) {
        this.getOnConnectionCreated?.()?.(payload.nodeId, payload.port, targetNodeId, undefined, targetParameter);
      } else if (payload.type === 'audio' && payload.virtualNodeId != null) {
        this.getOnConnectionCreated?.()?.(payload.virtualNodeId, 'out', targetNodeId, undefined, targetParameter);
      } else if (payload.type === 'disconnect' && payload.connectionId != null) {
        this.getOnConnectionRemoved?.()?.(payload.connectionId);
      } else if (
        payload.type === 'set-connection-disabled' &&
        payload.connectionId != null &&
        payload.disabled != null
      ) {
        // OverlayManager currently has no "update connection" callback; fall back to no-op here.
      }
      this.render();
    };
    this.uiElementManager.showSignalPicker(screenX, screenY, targetNodeId, targetParameter, onSelect);
  }
}
