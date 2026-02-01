/**
 * Input Parameter Renderer
 * 
 * Renders parameters as simple draggable input fields (no knob).
 * Used for parameters that should display just a number input instead of a rotary knob.
 */

import { ParameterRenderer, type ParameterMetrics, type ParameterRenderState, type CellBounds } from './ParameterRenderer';
import type { NodeInstance } from '../../../../types/nodeGraph';
import type { NodeSpec, ParameterSpec } from '../../../../types/nodeSpec';
import { getCSSVariableAsNumber } from '../../../../utils/cssTokens';
import { renderParameterCell, drawValueBox } from '../RenderingUtils';

export class InputParameterRenderer extends ParameterRenderer {
  getUIType(): string {
    return 'input';
  }
  
  canHandle(_spec: NodeSpec, _paramName: string): boolean {
    // This renderer only handles parameters explicitly set to 'input' via parameterUI
    // It should not be selected automatically, only when explicitly requested
    return false;
  }
  
  getPriority(): number {
    return 40; // Lower than toggle/enum, but higher than knob
  }
  
  calculateMetrics(
    _paramName: string,
    _paramSpec: ParameterSpec,
    cellBounds: CellBounds
  ): ParameterMetrics {
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const labelInputSpacing = getCSSVariableAsNumber('range-editor-param-label-spacing', 8);
    
    // Calculate label position
    const labelX = cellBounds.x + cellBounds.width / 2;
    const labelY = cellBounds.y + cellPadding;
    
    // Calculate port position (top-left, aligned with label)
    const portX = cellBounds.x + cellPadding;
    
    // Calculate input field position (where knob would be, but smaller)
    const labelBottom = cellBounds.y + cellPadding + labelFontSize;
    const inputFieldCenterY = labelBottom + labelInputSpacing;
    const inputFieldX = cellBounds.x + cellBounds.width / 2;
    
    // Value display is the same as input field (centered)
    const valueX = inputFieldX;
    const valueY = inputFieldCenterY;
    
    return {
      cellX: cellBounds.x,
      cellY: cellBounds.y,
      cellWidth: cellBounds.width,
      cellHeight: cellBounds.height,
      portX,
      portY: cellBounds.y + cellPadding + labelFontSize / 2, // Approximate, will be adjusted during render
      labelX,
      labelY,
      knobX: inputFieldX, // Input field center X (reusing knobX for positioning)
      knobY: inputFieldCenterY, // Input field center Y (reusing knobY for positioning)
      valueX,
      valueY
    };
  }
  
  render(
    ctx: CanvasRenderingContext2D,
    node: NodeInstance,
    spec: NodeSpec,
    paramName: string,
    metrics: ParameterMetrics,
    state: ParameterRenderState
  ): void {
    const paramSpec = spec.parameters[paramName];
    if (!paramSpec) return;

    const paramValue = (node.parameters[paramName] ?? paramSpec.default) as number;
    const displayValue = state.effectiveValue !== null ? state.effectiveValue : paramValue;

    const labelText = paramSpec.label || paramName;
    const hasPort = !spec.parameterLayout?.parametersWithoutPorts?.includes(paramName);
    const showPort =
      !state.skipPorts && paramSpec.type === 'float' && hasPort;
    const showModeButton = hasPort && paramSpec.type === 'float';
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const labelFontWeight = getCSSVariableAsNumber('param-label-font-weight', 600);
    ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
    ctx.textBaseline = 'top';
    const labelTextMetrics = ctx.measureText(labelText);
    const actualTextHeight =
      labelTextMetrics.actualBoundingBoxAscent + labelTextMetrics.actualBoundingBoxDescent;
    const labelHeight = actualTextHeight > 0 ? actualTextHeight : labelFontSize;
    const portY = metrics.labelY + labelHeight / 2;
    const portScale =
      getCSSVariableAsNumber('param-port-size', 6) / getCSSVariableAsNumber('port-radius', 4);
    const portType = paramSpec.type === 'int' ? 'float' : (paramSpec.type || 'float');
    const inputMode =
      node.parameterInputModes?.[paramName] || paramSpec.inputMode || 'override';
    const modeSymbol =
      inputMode === 'override'
        ? '='
        : inputMode === 'add'
          ? '+'
          : inputMode === 'subtract'
            ? '-'
            : '*';

    renderParameterCell(ctx, metrics, state, {
      labelText,
      showModeButton: showModeButton,
      mode: showModeButton ? { symbol: modeSymbol, isConnected: state.isConnected } : undefined,
      modeButtonX: showModeButton ? metrics.portX : undefined,
      modeButtonY: showModeButton ? metrics.knobY : undefined,
      portType: showPort ? portType : undefined,
      portX: showPort ? metrics.portX : undefined,
      portY: showPort ? portY : undefined,
      portScale: showPort ? portScale : undefined
    });

    // Show animated/connected style when port is connected or when we have a live effective value
    const isAnimated = state.isConnected || state.effectiveValue !== null;
    this.renderInputField(
      ctx,
      displayValue,
      paramSpec,
      metrics.knobX,
      metrics.knobY,
      isAnimated
    );
  }

  private renderInputField(
    ctx: CanvasRenderingContext2D,
    value: number,
    paramSpec: ParameterSpec,
    x: number,
    y: number,
    isAnimated: boolean
  ): void {
    drawValueBox(ctx, value, x, y, {
      paramType: paramSpec.type === 'int' ? 'int' : 'float',
      isAnimated,
      align: 'center'
    });
  }
  
}
