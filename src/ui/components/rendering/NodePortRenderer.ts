/**
 * Node Port Renderer
 * 
 * Handles rendering of all node ports including:
 * - Header input/output ports with labels
 * - Parameter input ports
 * - Bezier curve parameter ports with mode buttons
 */

import type { NodeInstance } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../NodeRenderer';
import { getCSSColor, getCSSColorRGBA, getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { drawRoundedRect, getPortTypeDisplayLabel } from './RenderingUtils';

export class NodePortRenderer {
  private ctx: CanvasRenderingContext2D;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }
  
  /**
   * Render all ports for a node (header ports + parameter ports)
   */
  render(
    node: NodeInstance,
    spec: NodeSpec,
    metrics: NodeRenderMetrics,
    hoveredPortName?: string | null,
    isHoveredParameter?: boolean,
    connectingPortName?: string | null,
    isConnectingParameter?: boolean,
    connectedParameters?: Set<string>,
    connectedHeaderPorts?: Set<string>
  ): void {
    // Render header I/O ports with labels
    // Use port positions from metrics (calculated by HeaderFlexboxLayout) to ensure
    // visual alignment with connections and hit-testing
    spec.inputs.forEach((port) => {
      const portPos = metrics.portPositions.get(`input:${port.name}`);
      if (!portPos) {
        console.warn(`No port position found for input port: ${port.name}`);
        return;
      }
      
      const portX = portPos.x;
      const portY = portPos.y;
      const isHovered = hoveredPortName === port.name && !isHoveredParameter;
      const isConnecting = connectingPortName === port.name && !isConnectingParameter;
      const isConnected = connectedHeaderPorts?.has(`input:${port.name}`) ?? false;
      
      // Draw port circle first (without highlight)
      this.renderPortCircle(portX, portY, port.type, isHovered, isConnecting, isConnected);
      
      // Draw port label (type and name) to the right of the port
      // Order: port -> type -> name
      const portRadius = getCSSVariableAsNumber('port-radius', 6);
      const labelSpacing = getCSSVariableAsNumber('port-label-spacing', 12);
      const labelFontSize = getCSSVariableAsNumber('port-label-font-size', 15);
      const labelFontWeight = getCSSVariableAsNumber('port-label-font-weight', 600);
      const typeFontSize = getCSSVariableAsNumber('port-type-font-size', 15);
      const typeFontWeight = getCSSVariableAsNumber('port-type-font-weight', 600);
      const typeSpacing = getCSSVariableAsNumber('port-label-spacing', 12); // Use same spacing as port-to-type
      const typeBgRadius = getCSSVariableAsNumber('port-type-bg-radius', 6);
      const typePaddingH = getCSSVariableAsNumber('port-type-padding-horizontal', 8);
      const typePaddingV = getCSSVariableAsNumber('port-type-padding-vertical', 4);
      
      const portLabel = port.label || port.name;
      const typeLabel = getPortTypeDisplayLabel(port.type);

      // Measure text widths
      this.ctx.font = `${typeFontWeight} ${typeFontSize}px "Space Grotesk", sans-serif`;
      const typeWidth = this.ctx.measureText(typeLabel).width;

      // Calculate positions: port -> type -> name
      const typeStartX = portX + portRadius + labelSpacing;
      const typeBgX = typeStartX;
      const typeBgWidth = typeWidth + typePaddingH * 2;
      const typeBgHeight = typeFontSize + typePaddingV * 2;
      const typeBgY = portY - typeBgHeight / 2;
      const typeTextX = typeStartX + typePaddingH;
      const typeTextY = portY;

      const nameStartX = typeStartX + typeBgWidth + typeSpacing;
      const nameTextX = nameStartX;
      const nameTextY = portY;

      // Draw type background first
      const typeBgColor = this.getPortTypeBgColor(port.type);
      this.ctx.fillStyle = typeBgColor;
      drawRoundedRect(this.ctx, typeBgX, typeBgY, typeBgWidth, typeBgHeight, typeBgRadius);
      this.ctx.fill();

      // Draw hover highlight after type background (so it appears on top of bg but behind text)
      this.renderPortHighlight(portX, portY, isHovered, isConnecting);

      // Draw type text
      const typeTextColor = this.getPortTypeTextColor(port.type);
      this.ctx.fillStyle = typeTextColor;
      this.ctx.font = `${typeFontWeight} ${typeFontSize}px "Space Grotesk", sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(typeLabel, typeTextX, typeTextY);
      
      // Draw label text (no background, after type)
      const labelColor = getCSSColor('node-header-port-label-color', getCSSColor('color-gray-130', '#ebeff0'));
      this.ctx.fillStyle = labelColor;
      this.ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(portLabel, nameTextX, nameTextY);
    });
    
    spec.outputs.forEach((port) => {
      const portPos = metrics.portPositions.get(`output:${port.name}`);
      if (!portPos) {
        console.warn(`No port position found for output port: ${port.name}`);
        return;
      }
      
      const portX = portPos.x;
      const portY = portPos.y;
      const isHovered = hoveredPortName === port.name && !isHoveredParameter;
      const isConnecting = connectingPortName === port.name && !isConnectingParameter;
      const isConnected = connectedHeaderPorts?.has(`output:${port.name}`) ?? false;
      
      // Draw port circle first (without highlight)
      this.renderPortCircle(portX, portY, port.type, isHovered, isConnecting, isConnected);
      
      // Draw port label (name and type) to the left of the port
      // Order: name -> type -> port
      const portRadius = getCSSVariableAsNumber('port-radius', 6);
      const labelSpacing = getCSSVariableAsNumber('port-label-spacing', 12);
      const labelFontSize = getCSSVariableAsNumber('port-label-font-size', 15);
      const labelFontWeight = getCSSVariableAsNumber('port-label-font-weight', 600);
      const typeFontSize = getCSSVariableAsNumber('port-type-font-size', 15);
      const typeFontWeight = getCSSVariableAsNumber('port-type-font-weight', 600);
      const typeSpacing = getCSSVariableAsNumber('port-label-spacing', 12); // Use same spacing as port-to-type
      const typeBgRadius = getCSSVariableAsNumber('port-type-bg-radius', 6);
      const typePaddingH = getCSSVariableAsNumber('port-type-padding-horizontal', 8);
      const typePaddingV = getCSSVariableAsNumber('port-type-padding-vertical', 4);
      
      const portLabel = port.label || port.name;
      const typeLabel = getPortTypeDisplayLabel(port.type);

      // Measure text widths
      this.ctx.font = `${typeFontWeight} ${typeFontSize}px "Space Grotesk", sans-serif`;
      const typeWidth = this.ctx.measureText(typeLabel).width;

      // Calculate positions from right to left: port -> type -> name
      const typeBgWidth = typeWidth + typePaddingH * 2;
      const typeBgHeight = typeFontSize + typePaddingV * 2;
      
      const typeEndX = portX - portRadius - labelSpacing;
      const typeBgX = typeEndX - typeBgWidth;
      const typeBgY = portY - typeBgHeight / 2;
      const typeTextX = typeBgX + typePaddingH;
      const typeTextY = portY;
      
      const nameEndX = typeBgX - typeSpacing;
      const nameTextX = nameEndX;
      const nameTextY = portY;
      
      // Draw label text first (no background, furthest left)
      const labelColor = getCSSColor('node-header-port-label-color', getCSSColor('color-gray-130', '#ebeff0'));
      this.ctx.fillStyle = labelColor;
      this.ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(portLabel, nameTextX, nameTextY);
      
      // Draw type background (between name and port)
      const typeBgColor = this.getPortTypeBgColor(port.type);
      this.ctx.fillStyle = typeBgColor;
      drawRoundedRect(this.ctx, typeBgX, typeBgY, typeBgWidth, typeBgHeight, typeBgRadius);
      this.ctx.fill();
      
      // Draw hover highlight after type background (so it appears on top of bg but behind text)
      this.renderPortHighlight(portX, portY, isHovered, isConnecting);
      
      // Draw type text
      const typeTextColor = this.getPortTypeTextColor(port.type);
      this.ctx.fillStyle = typeTextColor;
      this.ctx.font = `${typeFontWeight} ${typeFontSize}px "Space Grotesk", sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(typeLabel, typeTextX, typeTextY);
    });

    // Render parameter input ports
    const portSizeParam = getCSSVariableAsNumber('param-port-size', 6);
    const portRadius = getCSSVariableAsNumber('port-radius', 4);
    
    // Special handling for bezier curve nodes
    const isBezierNode = this.isBezierCurveNode(spec);
    if (isBezierNode) {
      this.renderBezierParameterPorts(
        node,
        spec,
        metrics,
        hoveredPortName,
        isHoveredParameter,
        connectingPortName,
        isConnectingParameter,
        connectedParameters
      );
    } else {
      // Regular parameter ports
      for (const [paramName, gridPos] of metrics.parameterGridPositions.entries()) {
        if (spec.parameterLayout?.parametersWithoutPorts?.includes(paramName)) continue;
        const paramSpec = spec.parameters[paramName];
        if (paramSpec && paramSpec.type === 'float') {
          const isHovered = hoveredPortName === paramName && isHoveredParameter;
          const isConnecting = connectingPortName === paramName && isConnectingParameter;
          const isConnected = connectedParameters?.has(paramName) ?? false;
          this.renderPort(
            gridPos.portX,
            gridPos.portY,
            'float',
            isHovered,
            isConnecting,
            isConnected,
            portSizeParam / portRadius
          );
        }
      }
    }
    
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
  
  /**
   * Render bezier curve parameter ports with mode buttons, type labels, and name labels
   */
  private renderBezierParameterPorts(
    node: NodeInstance,
    spec: NodeSpec,
    metrics: NodeRenderMetrics,
    hoveredPortName?: string | null,
    isHoveredParameter?: boolean,
    connectingPortName?: string | null,
    isConnectingParameter?: boolean,
    connectedParameters?: Set<string>
  ): void {
    const { headerHeight } = metrics;
    const x = node.position.x;
    const y = node.position.y;
    
    // Calculate positions (same logic as in renderParameterGrid)
    const bodyTopPadding = getCSSVariableAsNumber('param-body-top-padding', 24);
    const bezierEditorHeight = getCSSVariableAsNumber('bezier-editor-height', 200);
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    const bezierPortSpacing = getCSSVariableAsNumber('bezier-param-port-spacing', 40);
    const modeButtonSize = getCSSVariableAsNumber('param-mode-button-size', 24);
    const modeButtonBg = getCSSColor('param-mode-button-bg', getCSSColor('color-gray-50', '#111317'));
    
    const currentY = y + headerHeight + bodyTopPadding;
    const leftEdgePadding = gridPadding;
    const bezierParams = ['x1', 'y1', 'x2', 'y2'];
    
    // Calculate positions using header node styling
    const portX = x + leftEdgePadding;
    const portRadius = getCSSVariableAsNumber('port-radius', 6);
    const portLabelSpacing = getCSSVariableAsNumber('port-label-spacing', 12);
    // Use consistent spacing between all elements: port -> mode -> name (12px between each)
    // Calculate edge-to-edge spacing for visual consistency
    const portEdgeX = portX + portRadius; // Port right edge
    const portToModeSpacing = portLabelSpacing;
    const modeButtonX = portEdgeX + portToModeSpacing + (modeButtonSize / 2); // Mode button center
    const modeButtonRightEdge = modeButtonX + (modeButtonSize / 2); // Mode button right edge
    const modeToLabelSpacing = portLabelSpacing;
    const labelX = modeButtonRightEdge + modeToLabelSpacing;
    
    // Port Y positions: distribute evenly across bezier editor height
    const totalSpacing = (bezierParams.length - 1) * bezierPortSpacing;
    const startOffset = (bezierEditorHeight - totalSpacing) / 2;
    const portY = bezierParams.map((_, index) => currentY + startOffset + index * bezierPortSpacing);
    const modeButtonY = portY;
    const labelY = portY;
    
    // Label styling (matching header nodes)
    const labelFontSize = getCSSVariableAsNumber('port-label-font-size', 15);
    const labelFontWeight = getCSSVariableAsNumber('port-label-font-weight', 600);
    const labelColor = getCSSColor('port-label-color', getCSSColor('color-gray-110', '#a3aeb5'));
    
    // Render each parameter port with mode button and name label
    bezierParams.forEach((paramName, index) => {
      const paramSpec = spec.parameters[paramName];
      if (!paramSpec) return;
      
      const hasPort = !spec.parameterLayout?.parametersWithoutPorts?.includes(paramName);
      const isConnected = connectedParameters?.has(paramName) ?? false;
      const isHovered = hoveredPortName === paramName && isHoveredParameter === true;
      const isConnecting = connectingPortName === paramName && isConnectingParameter === true;
      
      // Draw port (using same rendering as header nodes) - only if parameter has a port
      if (hasPort) {
        this.renderPortCircle(portX, portY[index], 'float', isHovered, isConnecting, isConnected);
      }
      
      // Draw mode button - only if parameter has a port
      if (hasPort) {
        const inputMode = node.parameterInputModes?.[paramName] || paramSpec.inputMode || 'override';
        const modeSymbol = inputMode === 'override' ? '=' : inputMode === 'add' ? '+' : inputMode === 'subtract' ? '-' : '*';
        this.ctx.fillStyle = modeButtonBg;
        this.ctx.beginPath();
        this.ctx.arc(modeButtonX, modeButtonY[index], modeButtonSize / 2, 0, Math.PI * 2);
        this.ctx.fill();
        const modeButtonColorToken = isConnected ? 'param-mode-button-color-connected' : 'param-mode-button-color-static';
        this.ctx.fillStyle = getCSSColor(modeButtonColorToken, isConnected ? getCSSColor('color-gray-130', '#ebeff0') : getCSSColor('color-gray-60', '#5a5f66'));
        const modeButtonFontSize = getCSSVariableAsNumber('param-mode-button-font-size', 18);
        const modeButtonFontWeight = getCSSVariableAsNumber('param-mode-button-font-weight', 500);
        this.ctx.font = `${modeButtonFontWeight} ${modeButtonFontSize}px "Space Grotesk", sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(modeSymbol, modeButtonX, modeButtonY[index]);
        
        // Draw port highlight
        this.renderPortHighlight(portX, portY[index], isHovered, isConnecting);
      }
      
      // Draw name label (after mode button with 12px spacing, or after port if no mode button)
      const paramLabel = paramSpec.label || paramName;
      this.ctx.fillStyle = labelColor;
      this.ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      // Adjust label X position if no mode button (label should be after port instead)
      const labelXPos = hasPort ? labelX : (portX + portRadius + portLabelSpacing);
      this.ctx.fillText(paramLabel, labelXPos, labelY[index]);
    });
    
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
  
  /**
   * Render a port circle
   */
  private renderPortCircle(x: number, y: number, type: string, isHovered: boolean = false, isConnecting: boolean = false, isConnected: boolean = false, scale: number = 1.0, opacity: number = 1.0): void {
    const radius = getCSSVariableAsNumber('port-radius', 4) * scale;
    const borderWidth = getCSSVariableAsNumber('port-border-width', 0);
    const borderColorRGBA = getCSSColorRGBA('port-border-color', { r: 255, g: 255, b: 255, a: 1 });
    
    // Determine port color: hover/dragging > connected > type color
    if (isHovered || isConnecting) {
      if (isConnecting) {
        const draggingColorRGBA = getCSSColorRGBA('port-dragging-color', { r: 0, g: 255, b: 136, a: 1 });
        this.ctx.fillStyle = `rgba(${draggingColorRGBA.r}, ${draggingColorRGBA.g}, ${draggingColorRGBA.b}, ${opacity})`;
      } else {
        const hoverColorRGBA = getCSSColorRGBA('port-hover-color', { r: 33, g: 150, b: 243, a: 1 });
        this.ctx.fillStyle = `rgba(${hoverColorRGBA.r}, ${hoverColorRGBA.g}, ${hoverColorRGBA.b}, ${opacity})`;
      }
    } else if (isConnected) {
      const connectedColorMap: Record<string, string> = {
        'float': 'port-connected-color-float',
        'vec2': 'port-connected-color-vec2',
        'vec3': 'port-connected-color-vec3',
        'vec4': 'port-connected-color-vec4'
      };
      const connectedTokenName = connectedColorMap[type] || 'port-connected-color-default';
      const colorRGBA = getCSSColorRGBA(connectedTokenName, { r: 81, g: 89, b: 97, a: 1 });
      this.ctx.fillStyle = `rgba(${colorRGBA.r}, ${colorRGBA.g}, ${colorRGBA.b}, ${opacity})`;
    } else {
      const colorMap: Record<string, string> = {
        'float': 'port-color-float',
        'vec2': 'port-color-vec2',
        'vec3': 'port-color-vec3',
        'vec4': 'port-color-vec4'
      };
      const tokenName = colorMap[type] || 'port-color-default';
      const colorRGBA = getCSSColorRGBA(tokenName, { r: 102, g: 102, b: 102, a: 1 });
      this.ctx.fillStyle = `rgba(${colorRGBA.r}, ${colorRGBA.g}, ${colorRGBA.b}, ${opacity})`;
    }
    
    // Draw the port circle (inner circle - always solid)
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Draw border if border width is greater than 0
    // Border is drawn outward only by offsetting the radius by half the border width
    if (borderWidth > 0) {
      this.ctx.strokeStyle = `rgba(${borderColorRGBA.r}, ${borderColorRGBA.g}, ${borderColorRGBA.b}, ${borderColorRGBA.a * opacity})`;
      this.ctx.lineWidth = borderWidth;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius + borderWidth / 2, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }
  
  /**
   * Render the hover highlight circle (larger transparent circle behind the port)
   */
  private renderPortHighlight(x: number, y: number, isHovered: boolean = false, isConnecting: boolean = false, scale: number = 1.0, opacity: number = 1.0): void {
    if (!isHovered && !isConnecting) return;
    
    const radius = getCSSVariableAsNumber('port-radius', 4) * scale;
    const highlightRadius = radius * 3.5; // Larger circle
    
    if (isConnecting) {
      // Dragging state: use green color from token
      const draggingColorRGBA = getCSSColorRGBA('port-dragging-color', { r: 0, g: 255, b: 136, a: 1 });
      const draggingOuterOpacity = getCSSVariableAsNumber('port-dragging-outer-opacity', 0.6);
      const actualOuterOpacity = draggingOuterOpacity * opacity;
      
      // Draw larger transparent circle behind (outer highlight)
      this.ctx.fillStyle = `rgba(${draggingColorRGBA.r}, ${draggingColorRGBA.g}, ${draggingColorRGBA.b}, ${actualOuterOpacity})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, highlightRadius, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      // Hover state: use blue color from token
      const hoverColorRGBA = getCSSColorRGBA('port-hover-color', { r: 33, g: 150, b: 243, a: 1 });
      const hoverOuterOpacity = getCSSVariableAsNumber('port-hover-outer-opacity', 0.3);
      const actualOuterOpacity = hoverOuterOpacity * opacity;
      
      // Draw larger transparent circle behind (outer highlight)
      this.ctx.fillStyle = `rgba(${hoverColorRGBA.r}, ${hoverColorRGBA.g}, ${hoverColorRGBA.b}, ${actualOuterOpacity})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, highlightRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  /**
   * Render port with highlight (for backwards compatibility and non-header ports)
   */
  private renderPort(x: number, y: number, type: string, isHovered: boolean = false, isConnecting: boolean = false, isConnected: boolean = false, scale: number = 1.0, opacity: number = 1.0): void {
    // Draw highlight first (behind)
    this.renderPortHighlight(x, y, isHovered, isConnecting, scale, opacity);
    // Draw port circle on top
    this.renderPortCircle(x, y, type, isHovered, isConnecting, isConnected, scale, opacity);
  }
  
  /**
   * Check if a node is a bezier curve node (has x1, y1, x2, y2 parameters)
   */
  private isBezierCurveNode(spec: NodeSpec): boolean {
    return spec.id === 'bezier-curve' || (
      spec.parameters.x1 !== undefined &&
      spec.parameters.y1 !== undefined &&
      spec.parameters.x2 !== undefined &&
      spec.parameters.y2 !== undefined &&
      spec.parameters.x1.type === 'float' &&
      spec.parameters.y1.type === 'float' &&
      spec.parameters.x2.type === 'float' &&
      spec.parameters.y2.type === 'float'
    );
  }
  
  /**
   * Get port type background color
   */
  private getPortTypeBgColor(type: string): string {
    const tokenMap: Record<string, string> = {
      'float': 'port-type-bg-float',
      'vec2': 'port-type-bg-vec2',
      'vec3': 'port-type-bg-vec3',
      'vec4': 'port-type-bg-vec4'
    };
    const tokenName = tokenMap[type] || 'port-type-bg-default';
    return getCSSColor(tokenName, getCSSColor('port-type-bg-default', getCSSColor('color-gray-100', '#747e87')));
  }
  
  /**
   * Get port type text color
   */
  private getPortTypeTextColor(type: string): string {
    const tokenMap: Record<string, string> = {
      'float': 'port-type-text-float',
      'vec2': 'port-type-text-vec2',
      'vec3': 'port-type-text-vec3',
      'vec4': 'port-type-text-vec4'
    };
    const tokenName = tokenMap[type] || 'port-type-text-default';
    return getCSSColor(tokenName, getCSSColor('port-type-text-default', getCSSColor('color-gray-130', '#ebeff0')));
  }
}
