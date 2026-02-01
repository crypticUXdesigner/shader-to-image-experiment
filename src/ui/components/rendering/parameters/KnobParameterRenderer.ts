/**
 * Knob Parameter Renderer
 * 
 * Renders parameters as rotary knobs (default parameter UI type).
 */

import { ParameterRenderer, type ParameterMetrics, type ParameterRenderState, type CellBounds } from './ParameterRenderer';
import type { NodeInstance } from '../../../../types/nodeGraph';
import type { NodeSpec, ParameterSpec } from '../../../../types/nodeSpec';
import { getCSSColor, getCSSVariableAsNumber } from '../../../../utils/cssTokens';
import { renderParameterCell, drawValueBox } from '../RenderingUtils';

export class KnobParameterRenderer extends ParameterRenderer {
  getUIType(): string {
    return 'knob';
  }
  
  canHandle(_spec: NodeSpec, _paramName: string): boolean {
    // Knob is the default renderer, so it handles everything
    // unless another renderer claims it first (lower priority)
    return true;
  }
  
  getPriority(): number {
    return 0; // Lowest priority - checked last
  }
  
  calculateMetrics(
    _paramName: string,
    _paramSpec: ParameterSpec,
    cellBounds: CellBounds
  ): ParameterMetrics {
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const extraSpacing = getCSSVariableAsNumber('param-label-knob-spacing', 20);
    const knobSize = getCSSVariableAsNumber('knob-size', 45);
    const valueSpacing = getCSSVariableAsNumber('knob-value-spacing', 4);
    
    // Calculate label position
    const labelX = cellBounds.x + cellBounds.width / 2;
    const labelY = cellBounds.y + cellPadding;
    
    // Calculate port position (top-left, aligned with label)
    const portX = cellBounds.x + cellPadding;
    // Port Y will be calculated during rendering based on actual label height
    
    // Calculate knob position (center horizontally, below label)
    const knobX = cellBounds.x + cellBounds.width / 2;
    const labelBottom = cellBounds.y + cellPadding + labelFontSize;
    const knobY = labelBottom + extraSpacing + knobSize / 2;
    
    // Calculate value display position (below knob)
    const valueX = knobX;
    const valueY = knobY + knobSize / 2 + valueSpacing;
    
    return {
      cellX: cellBounds.x,
      cellY: cellBounds.y,
      cellWidth: cellBounds.width,
      cellHeight: cellBounds.height,
      portX,
      portY: cellBounds.y + cellPadding + labelFontSize / 2, // Approximate, will be adjusted during render
      labelX,
      labelY,
      knobX,
      knobY,
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

    const min = paramSpec.min ?? 0;
    const max = paramSpec.max ?? 1;
    // Show animated/connected style when port is connected or when we have a live effective value
    const isAnimated = state.isConnected || state.effectiveValue !== null;
    const knobSize = getCSSVariableAsNumber('knob-size', 45);
    this.renderRotaryKnob(ctx, metrics.knobX, metrics.knobY, knobSize, displayValue, min, max, isAnimated);

    this.renderValueDisplay(
      ctx,
      displayValue,
      paramSpec.type,
      metrics.valueX,
      metrics.valueY,
      isAnimated
    );
  }

  private renderRotaryKnob(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    value: number,
    min: number,
    max: number,
    isAnimated: boolean = false
  ): void {
    const ringWidth = getCSSVariableAsNumber('knob-ring-width', 4);
    const ringColor = getCSSColor('knob-ring-color', getCSSColor('color-gray-70', '#282b31'));
    const ringActiveColorStatic = getCSSColor('knob-ring-active-color-static', getCSSColor('color-blue-90', '#6565dc'));
    const ringActiveColorAnimated = getCSSColor('knob-ring-active-color-animated', getCSSColor('color-leaf-100', '#6eab31'));
    const ringActiveColor = isAnimated ? ringActiveColorAnimated : ringActiveColorStatic;
    const markerSize = getCSSVariableAsNumber('knob-marker-size', 6);
    const markerColor = getCSSColor('knob-marker-color', getCSSColor('color-gray-130', '#ebeff0'));
    const markerRadiusOffset = getCSSVariableAsNumber('knob-marker-radius-offset', 0);
    const arcSweep = getCSSVariableAsNumber('knob-arc-sweep', 270);
    
    // Calculate the arc endpoints for top coverage
    // Start at top-right (135deg), end at top-left (45deg) going clockwise = 270deg
    const topStartDeg = 135; // top-right
    const topEndDeg = 45; // top-left
    const topStartRad = topStartDeg * (Math.PI / 180);
    const topEndRad = topEndDeg * (Math.PI / 180);
    
    // Convert value to normalized range (0 to 1)
    const normalized = (value - min) / (max - min); // 0 to 1
    
    const radius = size / 2 - ringWidth / 2;
    const markerRadius = radius + markerRadiusOffset; // Marker on separate radius
    
    // Set rounded line caps for the arc ends
    ctx.lineCap = 'round';
    
    // Draw full arc ring (background)
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.arc(x, y, radius, topStartRad, topEndRad, false); // clockwise from 135deg to 45deg = 270deg
    ctx.stroke();
    
    // Draw value highlight segment
    if (normalized > 0) {
      ctx.strokeStyle = ringActiveColor;
      ctx.lineWidth = ringWidth;
      ctx.beginPath();
      const highlightEndDeg = (topStartDeg + (normalized * arcSweep)) % 360;
      const highlightEndRad = highlightEndDeg * (Math.PI / 180);
      ctx.arc(x, y, radius, topStartRad, highlightEndRad, false);
      ctx.stroke();
    }
    
    // Draw marker dot at value position
    const markerAngleDeg = (topStartDeg + (normalized * arcSweep)) % 360;
    const markerAngleRad = markerAngleDeg * (Math.PI / 180);
    const markerX = x + Math.cos(markerAngleRad) * markerRadius;
    const markerY = y + Math.sin(markerAngleRad) * markerRadius;
    ctx.fillStyle = markerColor;
    ctx.beginPath();
    ctx.arc(markerX, markerY, markerSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  
  private renderValueDisplay(
    ctx: CanvasRenderingContext2D,
    value: number,
    paramType: string,
    x: number,
    y: number,
    isAnimated: boolean
  ): void {
    drawValueBox(ctx, value, x, y, {
      paramType: paramType === 'int' ? 'int' : 'float',
      isAnimated,
      align: 'top'
    });
  }
  
}
