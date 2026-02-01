/**
 * Enum Parameter Renderer
 * 
 * Renders int parameters with known enum mappings as dropdown selectors.
 */

import { ParameterRenderer, type ParameterMetrics, type ParameterRenderState, type CellBounds } from './ParameterRenderer';
import type { NodeInstance } from '../../../../types/nodeGraph';
import type { NodeSpec, ParameterSpec } from '../../../../types/nodeSpec';
import { getCSSColor, getCSSVariableAsNumber } from '../../../../utils/cssTokens';
import { renderParameterCell, drawRoundedRect } from '../RenderingUtils';

export class EnumParameterRenderer extends ParameterRenderer {
  getUIType(): string {
    return 'enum';
  }
  
  canHandle(spec: NodeSpec, paramName: string): boolean {
    // Enum: single int parameter with min/max, reasonable option count, and known enum pattern
    const param = spec.parameters[paramName];
    if (!param || param.type !== 'int') return false;
    if (param.min === undefined || param.max === undefined) return false;
    
    // Reasonable limit for dropdown (max 15 options)
    const optionCount = param.max - param.min + 1;
    if (optionCount > 15) return false;
    
    // Check if it's a known enum pattern
    return this.isKnownEnumPattern(spec.id, paramName);
  }
  
  getPriority(): number {
    return 60; // Higher than toggle, lower than bezier/range
  }
  
  calculateMetrics(
    _paramName: string,
    _paramSpec: ParameterSpec,
    cellBounds: CellBounds
  ): ParameterMetrics {
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const selectorHeight = getCSSVariableAsNumber('enum-selector-height', 32);
    const selectorSpacing = getCSSVariableAsNumber('param-label-knob-spacing', 20);
    
    return {
      cellX: cellBounds.x,
      cellY: cellBounds.y,
      cellWidth: cellBounds.width,
      cellHeight: cellBounds.height,
      portX: cellBounds.x + cellPadding,
      portY: cellBounds.y + cellPadding + labelFontSize / 2,
      labelX: cellBounds.x + cellBounds.width / 2,
      labelY: cellBounds.y + cellPadding,
      knobX: cellBounds.x + cellBounds.width / 2,
      knobY: cellBounds.y + cellPadding + labelFontSize + selectorSpacing + selectorHeight / 2,
      valueX: cellBounds.x + cellBounds.width / 2,
      valueY: cellBounds.y + cellPadding + labelFontSize + selectorSpacing + selectorHeight
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

    this.renderEnumSelector(ctx, spec, paramName, paramValue, metrics, state.isHovered);
  }

  private renderEnumSelector(
    ctx: CanvasRenderingContext2D,
    spec: NodeSpec,
    paramName: string,
    paramValue: number,
    metrics: ParameterMetrics,
    isHovered: boolean
  ): void {
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const selectorHeight = getCSSVariableAsNumber('enum-selector-height', 32);
    const selectorSpacing = getCSSVariableAsNumber('param-label-knob-spacing', 20);
    const selectorBg = isHovered 
      ? getCSSColor('enum-selector-bg-hover', getCSSColor('color-gray-50', '#1a1c20'))
      : getCSSColor('enum-selector-bg', getCSSColor('color-gray-30', '#0a0b0d'));
    const selectorBorder = getCSSColor('enum-selector-border', getCSSColor('color-gray-70', '#282b31'));
    const selectorRadius = getCSSVariableAsNumber('enum-selector-radius', 6);
    const selectorPadding = getCSSVariableAsNumber('enum-selector-padding', 8);
    const selectorFontSize = getCSSVariableAsNumber('enum-selector-font-size', 18);
    const selectorFontWeight = getCSSVariableAsNumber('enum-selector-font-weight', 500);
    const selectorColor = getCSSColor('enum-selector-color', getCSSColor('color-gray-130', '#ebeff0'));
    const arrowSize = getCSSVariableAsNumber('enum-selector-arrow-size', 8);
    const arrowColor = getCSSColor('enum-selector-arrow-color', getCSSColor('color-gray-100', '#747e87'));
    
    // Position selector below label
    const labelBottom = metrics.labelY + labelFontSize;
    const selectorY = labelBottom + selectorSpacing;
    const selectorX = metrics.cellX + cellPadding;
    const selectorWidth = metrics.cellWidth - cellPadding * 2;
    
    // Draw selector background
    ctx.fillStyle = selectorBg;
    drawRoundedRect(ctx, selectorX, selectorY, selectorWidth, selectorHeight, selectorRadius);
    ctx.fill();
    
    // Draw selector border
    ctx.strokeStyle = selectorBorder;
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, selectorX, selectorY, selectorWidth, selectorHeight, selectorRadius);
    ctx.stroke();
    
    // Get current label
    const enumMappings = this.getEnumMappings(spec.id, paramName);
    const currentLabel = enumMappings?.[paramValue] ?? paramValue.toString();
    
    // Draw label text
    ctx.font = `${selectorFontWeight} ${selectorFontSize}px "Space Grotesk", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = selectorColor;
    const textX = selectorX + selectorPadding;
    const textY = selectorY + selectorHeight / 2;
    ctx.fillText(currentLabel, textX, textY);
    
    // Draw dropdown arrow (right side)
    const arrowX = selectorX + selectorWidth - selectorPadding - arrowSize;
    const arrowY = selectorY + selectorHeight / 2;
    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY - arrowSize / 2);
    ctx.lineTo(arrowX + arrowSize, arrowY - arrowSize / 2);
    ctx.lineTo(arrowX + arrowSize / 2, arrowY + arrowSize / 2);
    ctx.closePath();
    ctx.fill();
    
    // Reset text alignment
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  
  private isKnownEnumPattern(nodeId: string, paramName: string): boolean {
    const enumMappings = this.getEnumMappings(nodeId, paramName);
    return enumMappings !== null;
  }
  
  private getEnumMappings(nodeId: string, paramName: string): Record<number, string> | null {
    // compare node - operation
    if (nodeId === 'compare' && paramName === 'operation') {
      return {
        0: 'Equal (==)',
        1: 'Not Equal (!=)',
        2: 'Less Than (<)',
        3: 'Less or Equal (<=)',
        4: 'Greater Than (>)',
        5: 'Greater or Equal (>=)'
      };
    }
    
    // blend-mode node - mode
    if (nodeId === 'blend-mode' && paramName === 'mode') {
      return {
        0: 'Normal',
        1: 'Multiply',
        2: 'Screen',
        3: 'Overlay',
        4: 'Soft Light',
        5: 'Hard Light',
        6: 'Color Dodge',
        7: 'Color Burn',
        8: 'Linear Dodge',
        9: 'Linear Burn',
        10: 'Difference',
        11: 'Exclusion'
      };
    }
    
    // gradient-mask node - maskType
    if (nodeId === 'gradient-mask' && paramName === 'maskType') {
      return {
        0: 'Radial',
        1: 'Linear',
        2: 'Elliptical'
      };
    }
    
    // block-edge-brightness node - direction
    if (nodeId === 'block-edge-brightness' && paramName === 'direction') {
      return {
        0: 'Horizontal',
        1: 'Vertical'
      };
    }
    
    // block-color-glitch node - direction
    if (nodeId === 'block-color-glitch' && paramName === 'direction') {
      return {
        0: 'Horizontal',
        1: 'Vertical'
      };
    }
    
    // plane-grid node - planeType
    if (nodeId === 'plane-grid' && paramName === 'planeType') {
      return {
        0: 'Raymarched',
        1: 'Grid',
        2: 'Checkerboard'
      };
    }
    
    // box-torus-sdf node - primitiveType
    if (nodeId === 'box-torus-sdf' && paramName === 'primitiveType') {
      return {
        0: 'Box',
        1: 'Torus',
        2: 'Capsule'
      };
    }
    
    return null;
  }
  
}
