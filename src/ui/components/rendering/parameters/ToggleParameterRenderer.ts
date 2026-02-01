/**
 * Toggle Parameter Renderer
 * 
 * Renders boolean/int parameters (0/1) as toggle switches.
 */

import { ParameterRenderer, type ParameterMetrics, type ParameterRenderState, type CellBounds } from './ParameterRenderer';
import type { NodeInstance } from '../../../../types/nodeGraph';
import type { NodeSpec, ParameterSpec } from '../../../../types/nodeSpec';
import { getCSSColor, getCSSVariableAsNumber } from '../../../../utils/cssTokens';
import { renderParameterCell, drawRoundedRect } from '../RenderingUtils';

export class ToggleParameterRenderer extends ParameterRenderer {
  getUIType(): string {
    return 'toggle';
  }
  
  canHandle(spec: NodeSpec, paramName: string): boolean {
    // Toggle: single int parameter with min=0, max=1
    const param = spec.parameters[paramName];
    return param?.type === 'int' && param.min === 0 && param.max === 1;
  }
  
  getPriority(): number {
    return 50; // Higher than knob, lower than enum
  }
  
  calculateMetrics(
    _paramName: string,
    _paramSpec: ParameterSpec,
    cellBounds: CellBounds
  ): ParameterMetrics {
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    
    // Toggle is centered vertically in cell
    const toggleHeight = getCSSVariableAsNumber('toggle-height', 24);
    
    return {
      cellX: cellBounds.x,
      cellY: cellBounds.y,
      cellWidth: cellBounds.width,
      cellHeight: cellBounds.height,
      portX: cellBounds.x + cellPadding,
      portY: cellBounds.y + cellPadding + labelFontSize / 2,
      labelX: cellBounds.x + cellBounds.width / 2,
      labelY: cellBounds.y + cellPadding,
      knobX: cellBounds.x + cellBounds.width / 2, // Toggle center X
      knobY: cellBounds.y + cellBounds.height / 2, // Toggle center Y (vertically centered)
      valueX: cellBounds.x + cellBounds.width / 2,
      valueY: cellBounds.y + cellBounds.height / 2 + toggleHeight / 2 // Below toggle
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
    const isOn = paramValue === 1;

    const labelText = paramSpec.label || paramName;
    const showPort = false; // int parameters no longer have ports
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

    renderParameterCell(ctx, metrics, state, {
      labelText,
      showModeButton: false,
      portType: showPort ? 'float' : undefined,
      portX: showPort ? metrics.portX : undefined,
      portY: showPort ? portY : undefined,
      portScale: showPort ? portScale : undefined
    });

    this.renderToggle(ctx, metrics.knobX, metrics.knobY, isOn, state.isHovered);
  }

  private renderToggle(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    isOn: boolean,
    isHovered: boolean
  ): void {
    const toggleWidth = getCSSVariableAsNumber('toggle-width', 48);
    const toggleHeight = getCSSVariableAsNumber('toggle-height', 24);
    const toggleRadius = getCSSVariableAsNumber('toggle-border-radius', 12);
    const toggleBorder = getCSSColor('toggle-border', getCSSColor('color-gray-70', '#282b31'));
    const toggleBg = isOn 
      ? getCSSColor('toggle-bg-on', getCSSColor('color-blue-90', '#6565dc'))
      : (isHovered 
        ? getCSSColor('toggle-bg-hover', getCSSColor('color-gray-70', '#282b31'))
        : getCSSColor('toggle-bg-off', getCSSColor('color-gray-50', '#1a1c20')));
    const sliderSize = getCSSVariableAsNumber('toggle-slider-size', 20);
    const sliderOffset = getCSSVariableAsNumber('toggle-slider-offset', 2);
    const sliderBg = getCSSColor('toggle-slider-bg', getCSSColor('color-gray-130', '#ebeff0'));
    const sliderBorder = getCSSColor('toggle-slider-border', getCSSColor('color-gray-100', '#747e87'));
    
    // Position toggle (centerX, centerY is the center of the toggle)
    const toggleX = centerX - toggleWidth / 2;
    const toggleY = centerY - toggleHeight / 2;
    
    // Draw toggle background
    ctx.fillStyle = toggleBg;
    drawRoundedRect(ctx, toggleX, toggleY, toggleWidth, toggleHeight, toggleRadius);
    ctx.fill();
    
    // Draw toggle border
    ctx.strokeStyle = toggleBorder;
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, toggleX, toggleY, toggleWidth, toggleHeight, toggleRadius);
    ctx.stroke();
    
    // Calculate slider position
    const sliderRadius = sliderSize / 2;
    const sliderY = toggleY + toggleHeight / 2;
    const sliderX = isOn 
      ? toggleX + toggleWidth - sliderRadius - sliderOffset
      : toggleX + sliderRadius + sliderOffset;
    
    // Draw slider
    ctx.fillStyle = sliderBg;
    ctx.beginPath();
    ctx.arc(sliderX, sliderY, sliderRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = sliderBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sliderX, sliderY, sliderRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Reset text alignment
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  
}
