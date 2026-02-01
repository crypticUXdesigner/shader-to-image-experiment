/**
 * OverlayManager
 * 
 * Manages UI overlay operations including parameter input, label input, and dialogs.
 * Consolidates overlay logic that was previously split between NodeEditorCanvas and UIElementManager.
 */
import type { NodeGraph } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../NodeRenderer';
import { UIElementManager } from './UIElementManager';
import { HitTestManager } from './HitTestManager';
import { NodeRenderer } from '../NodeRenderer';
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { snapParameterValue } from '../../../utils/parameterValueCalculator';
import type { DropdownMenuItem } from '../DropdownMenu';

export interface OverlayManagerDependencies {
  uiElementManager: UIElementManager;
  hitTestManager: HitTestManager;
  nodeSpecs: Map<string, NodeSpec>;
  nodeMetrics: Map<string, NodeRenderMetrics>;
  graph: NodeGraph;
  nodeRenderer: NodeRenderer;
  ctx: CanvasRenderingContext2D;
  canvasToScreen: (canvasX: number, canvasY: number) => { x: number; y: number };
  onParameterChanged?: (nodeId: string, paramName: string, value: number) => void;
  onNodeLabelChanged?: (nodeId: string, label: string | undefined) => void;
  onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
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
  private canvasToScreen: (canvasX: number, canvasY: number) => { x: number; y: number };
  private onParameterChanged?: (nodeId: string, paramName: string, value: number) => void;
  private onNodeLabelChanged?: (nodeId: string, label: string | undefined) => void;
  private onFileParameterChanged?: (nodeId: string, paramName: string, file: File) => void;
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
    this.canvasToScreen = dependencies.canvasToScreen;
    this.onParameterChanged = dependencies.onParameterChanged;
    this.onNodeLabelChanged = dependencies.onNodeLabelChanged;
    this.onFileParameterChanged = dependencies.onFileParameterChanged;
    this.updateNodeMetrics = dependencies.updateNodeMetrics;
    this.render = dependencies.render;
  }

  /**
   * Update dependencies (e.g. when graph is replaced via setGraph).
   */
  updateDependencies(deps: Partial<OverlayManagerDependencies>): void {
    if (deps.graph !== undefined) this.graph = deps.graph;
    if (deps.onFileParameterChanged !== undefined) this.onFileParameterChanged = deps.onFileParameterChanged;
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
      () => {}
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
    const iconBoxY = node.position.y + (headerHeight - groupHeight) / 2;
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
    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/mpeg,audio/mp3,.mp3';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log(`[OverlayManager] File selected for node ${nodeId}, parameter ${paramName}:`, file.name);
        console.log(`[OverlayManager] Callback available:`, !!this.onFileParameterChanged);
        if (this.onFileParameterChanged) {
          this.onFileParameterChanged(nodeId, paramName, file);
        } else {
          console.error(`[OverlayManager] onFileParameterChanged callback is not set!`);
        }
      } else {
        console.warn(`[OverlayManager] No file selected for node ${nodeId}, parameter ${paramName}`);
      }
      document.body.removeChild(fileInput);
    });
    
    // Position and trigger
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  /**
   * Handle frequency bands parameter click - show frequency bands editor modal
   * @param nodeId Node ID containing the parameter
   * @param paramName Parameter name
   * @param _screenX Screen X coordinate (unused)
   * @param _screenY Screen Y coordinate (unused)
   */
  handleFrequencyBandsParameterClick(nodeId: string, paramName: string, _screenX: number, _screenY: number): void {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    const spec = this.nodeSpecs.get(node?.type || '');
    if (!node || !spec) return;

    const paramSpec = spec.parameters[paramName];
    if (!paramSpec || paramSpec.type !== 'array') return;

    // Get current value or default
    const currentValue = node.parameters[paramName] ?? paramSpec.default;
    const bandsArray = Array.isArray(currentValue) ? currentValue : paramSpec.default as number[][];
    
    // Ensure it's an array of arrays
    if (!Array.isArray(bandsArray) || (bandsArray.length > 0 && !Array.isArray(bandsArray[0]))) {
      console.warn('Invalid frequency bands format');
      return;
    }

    // Show the editor with current bands
    this.uiElementManager.showFrequencyBandsEditor(
      bandsArray as number[][],
      (bands: number[][]) => {
        // bands is already number[][], no conversion needed
        // Type cast needed because callback signature expects number, but frequencyBands is an array
        this.onParameterChanged?.(nodeId, paramName, bands as any);
        this.render();
      },
      () => {
        // Nothing to do on cancel
      }
    );
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
          action: () => {
            if (value !== currentValue) {
              this.onParameterChanged?.(nodeId, paramName, value);
              this.render();
            }
          }
        };
      });

    // Calculate dropdown position based on enum selector position
    const metrics = this.nodeMetrics.get(nodeId);
    let finalScreenX = screenX;
    let finalScreenY = screenY;
    
    if (metrics) {
      const gridPos = metrics.parameterGridPositions.get(paramName);
      if (gridPos) {
        // Calculate enum selector position (matching EnumParameterRenderer logic)
        const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
        const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
        const selectorHeight = getCSSVariableAsNumber('enum-selector-height', 32);
        const selectorSpacing = getCSSVariableAsNumber('param-label-knob-spacing', 20);
        
        // Position selector below label
        const labelBottom = gridPos.labelY + labelFontSize;
        const selectorY = labelBottom + selectorSpacing;
        const selectorX = gridPos.cellX + cellPadding;

        // Convert canvas coordinates to screen coordinates
        const selectorBottomScreen = this.canvasToScreen(selectorX, selectorY + selectorHeight);
        const selectorLeftScreen = this.canvasToScreen(selectorX, selectorY);

        // Position dropdown below the selector, aligned with left edge
        finalScreenY = selectorBottomScreen.y + 4; // 4px gap
        finalScreenX = selectorLeftScreen.x;
      }
    }

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
      () => {} // onSelect not needed since action handles it
    );
  }

  /**
   * Handle color picker (OKLCH) click – show HSV-style popover
   */
  handleColorPickerClick(nodeId: string, screenX: number, screenY: number): void {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    const spec = this.nodeSpecs.get(node?.type || '');
    if (!node || !spec || spec.id !== 'oklch-color') return;

    const l = (node.parameters.l ?? spec.parameters.l?.default ?? 0.5) as number;
    const c = (node.parameters.c ?? spec.parameters.c?.default ?? 0.1) as number;
    const h = (node.parameters.h ?? spec.parameters.h?.default ?? 0) as number;

    const popoverY = screenY + 8;

    this.uiElementManager.showColorPicker(
      nodeId,
      { l, c, h },
      screenX,
      popoverY,
      (newL, newC, newH) => {
        this.onParameterChanged?.(nodeId, 'l', newL);
        this.onParameterChanged?.(nodeId, 'c', newC);
        this.onParameterChanged?.(nodeId, 'h', newH);
        this.render();
      }
    );
  }
}
