// Node Renderer Utility
// Handles rendering of individual nodes with ports, parameters, etc.

import type { NodeInstance } from '../../types/nodeGraph';
import type { NodeSpec } from '../../types/nodeSpec';
import { getNodeColorByCategory } from '../../utils/nodeSpecAdapter';
import { getCSSColor, getCSSColorRGBA, getCSSVariableAsNumber } from '../../utils/cssTokens';

export interface NodeRenderMetrics {
  width: number;
  height: number;
  headerHeight: number;
  portPositions: Map<string, { x: number; y: number; isOutput: boolean }>;
  parameterPositions: Map<string, { x: number; y: number; width: number; height: number }>;
}

export class NodeRenderer {
  private ctx: CanvasRenderingContext2D;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }
  
  private getTypeColor(type: string): string {
    const colorMap: Record<string, string> = {
      'float': 'port-color-float',
      'vec2': 'port-color-vec2',
      'vec3': 'port-color-vec3',
      'vec4': 'port-color-vec4'
    };
    const tokenName = colorMap[type] || 'port-color-default';
    return getCSSColor(tokenName, '#666666');
  }
  
  calculateMetrics(node: NodeInstance, spec: NodeSpec): NodeRenderMetrics {
    const minWidth = 260; // 200 * 1.3
    const maxWidth = 520; // 400 * 1.3
    const headerHeight = 32;
    const portHeight = 24;
    const paramHeight = 32;
    const paramPadding = 8;
    
    // Calculate content height
    const inputPortsHeight = spec.inputs.length * portHeight;
    const outputPortsHeight = spec.outputs.length * portHeight;
    const portsHeight = Math.max(inputPortsHeight, outputPortsHeight);
    
    // Calculate parameter height (only if node is not collapsed)
    const paramCount = node.collapsed ? 0 : Object.keys(spec.parameters).length;
    const paramsHeight = paramCount > 0 ? paramCount * paramHeight + paramPadding : 0;
    
    const contentHeight = portsHeight + paramsHeight;
    const totalHeight = headerHeight + contentHeight;
    
    // Calculate width (based on longest text)
    this.ctx.font = '14px sans-serif';
    const titleWidth = this.ctx.measureText(node.label || spec.displayName).width;
    const width = Math.max(minWidth, Math.min(maxWidth, titleWidth + 52)); // 40 * 1.3 = 52
    
    // Calculate port positions
    const portPositions = new Map<string, { x: number; y: number; isOutput: boolean }>();
    
    // Input ports (left side)
    spec.inputs.forEach((port, index) => {
      const y = node.position.y + headerHeight + (index * portHeight) + (portHeight / 2);
      portPositions.set(`input:${port.name}`, {
        x: node.position.x,
        y,
        isOutput: false
      });
    });
    
    // Output ports (right side)
    spec.outputs.forEach((port, index) => {
      const y = node.position.y + headerHeight + (index * portHeight) + (portHeight / 2);
      portPositions.set(`output:${port.name}`, {
        x: node.position.x + width,
        y,
        isOutput: true
      });
    });
    
    // Calculate parameter positions
    const parameterPositions = new Map<string, { x: number; y: number; width: number; height: number }>();
    if (!node.collapsed && paramCount > 0) {
      const paramStartY = node.position.y + headerHeight + portsHeight + paramPadding;
      const paramWidth = width - (paramPadding * 2);
      
      Object.keys(spec.parameters).forEach((paramName, index) => {
        parameterPositions.set(paramName, {
          x: node.position.x + paramPadding,
          y: paramStartY + (index * paramHeight),
          width: paramWidth,
          height: paramHeight
        });
      });
    }
    
    return {
      width,
      height: totalHeight,
      headerHeight,
      portPositions,
      parameterPositions
    };
  }
  
  renderNode(
    node: NodeInstance,
    spec: NodeSpec,
    metrics: NodeRenderMetrics,
    isSelected: boolean
  ): void {
    const { width, height, headerHeight, portPositions, parameterPositions } = metrics;
    const x = node.position.x;
    const y = node.position.y;
    
    // Node background color
    const bgColor = node.color || getNodeColorByCategory(spec.category);
    
    // Draw selection highlight (subtle background)
    if (isSelected) {
      const selectionColor = getCSSColorRGBA('node-bg-selected', { r: 33, g: 150, b: 243, a: 0.1 });
      this.ctx.fillStyle = `rgba(${selectionColor.r}, ${selectionColor.g}, ${selectionColor.b}, ${selectionColor.a})`;
      const radius = getCSSVariableAsNumber('node-radius', 4);
      this.drawRoundedRect(x, y, width, height, radius);
      this.ctx.fill();
    }
    
    // Draw node background
    this.ctx.fillStyle = bgColor;
    const borderColor = isSelected 
      ? getCSSColor('node-border-selected', '#2196F3')
      : getCSSColor('node-border', '#CCCCCC');
    const borderWidth = isSelected 
      ? getCSSVariableAsNumber('node-border-width-selected', 3)
      : getCSSVariableAsNumber('node-border-width', 1);
    this.ctx.strokeStyle = borderColor;
    this.ctx.lineWidth = borderWidth;
    
    const radius = getCSSVariableAsNumber('node-radius', 4);
    this.drawRoundedRect(x, y, width, height, radius);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Draw header
    const headerBg = getCSSColor('node-header-bg', '#F5F5F5');
    this.ctx.fillStyle = headerBg;
    this.ctx.fillRect(x, y, width, headerHeight);
    const headerBorder = getCSSColor('node-header-border', '#CCCCCC');
    this.ctx.strokeStyle = headerBorder;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + headerHeight);
    this.ctx.lineTo(x + width, y + headerHeight);
    this.ctx.stroke();
    
    // Draw title
    const titleColor = getCSSColor('node-title-color', '#333333');
    this.ctx.fillStyle = titleColor;
    this.ctx.font = '14px sans-serif';
    this.ctx.fillText(node.label || spec.displayName, x + 8, y + 20);
    
    // Draw delete button (if selected) - make it a clickable area
    if (isSelected) {
      const deleteBtnX = x + width - 24;
      const deleteBtnY = y + 4;
      const deleteBtnSize = 20;
      
      // Delete button background (on hover would be handled by canvas)
      const deleteBg = getCSSColor('node-delete-bg', '#F44336');
      this.ctx.fillStyle = deleteBg;
      this.ctx.beginPath();
      this.ctx.arc(deleteBtnX + deleteBtnSize / 2, deleteBtnY + deleteBtnSize / 2, deleteBtnSize / 2 - 2, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Delete button X - draw as two lines forming an X
      const deleteColor = getCSSColor('node-delete-color', '#FFFFFF');
      this.ctx.strokeStyle = deleteColor;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      const centerX = deleteBtnX + deleteBtnSize / 2;
      const centerY = deleteBtnY + deleteBtnSize / 2;
      const crossSize = deleteBtnSize / 3;
      // Draw X shape
      this.ctx.moveTo(centerX - crossSize, centerY - crossSize);
      this.ctx.lineTo(centerX + crossSize, centerY + crossSize);
      this.ctx.moveTo(centerX + crossSize, centerY - crossSize);
      this.ctx.lineTo(centerX - crossSize, centerY + crossSize);
      this.ctx.stroke();
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'alphabetic';
    }
    
    // Draw input ports
    spec.inputs.forEach((port) => {
      const portKey = `input:${port.name}`;
      const pos = portPositions.get(portKey);
      if (pos) {
        this.renderPort(pos.x, pos.y, port.type);
        
        // Port label with type (parameter name + type, inside node)
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'left';
        const portLabel = port.label || port.name;
        const typeColor = this.getTypeColor(port.type);
        
        // Draw parameter name
        const portLabelColor = getCSSColor('node-param-label-color', '#666666');
        this.ctx.fillStyle = portLabelColor;
        const labelX = pos.x + 8;
        this.ctx.fillText(portLabel, labelX, pos.y + 4);
        
        // Measure label width to position type
        const labelWidth = this.ctx.measureText(portLabel).width;
        const typeX = labelX + labelWidth + 4;
        
        // Draw type in type color
        this.ctx.fillStyle = typeColor;
        this.ctx.fillText(`(${port.type})`, typeX, pos.y + 4);
      }
    });
    
    // Draw output ports
    spec.outputs.forEach((port) => {
      const portKey = `output:${port.name}`;
      const pos = portPositions.get(portKey);
      if (pos) {
        this.renderPort(pos.x, pos.y, port.type);
        
        // Port label with type (parameter name + type, inside node)
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'right';
        const portLabel = port.label || port.name;
        const typeColor = this.getTypeColor(port.type);
        
        // Measure type width first (since we're right-aligned)
        const typeText = `(${port.type})`;
        
        // Draw type in type color (right side)
        this.ctx.fillStyle = typeColor;
        const typeX = pos.x - 8;
        this.ctx.fillText(typeText, typeX, pos.y + 4);
        
        // Draw parameter name (left of type)
        const portLabelColor = getCSSColor('node-param-label-color', '#666666');
        this.ctx.fillStyle = portLabelColor;
        const labelWidth = this.ctx.measureText(portLabel).width;
        const typeTextWidth = this.ctx.measureText(typeText).width;
        const labelX = typeX - labelWidth - typeTextWidth - 4;
        this.ctx.fillText(portLabel, labelX, pos.y + 4);
        
        this.ctx.textAlign = 'left';
      }
    });
    
    // Render parameters
    if (!node.collapsed && parameterPositions.size > 0) {
      // Draw separator line before parameters
      const paramStartY = y + headerHeight + Math.max(spec.inputs.length, spec.outputs.length) * 24;
      const separatorColor = getCSSColor('node-param-separator', '#CCCCCC');
      this.ctx.strokeStyle = separatorColor;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, paramStartY);
      this.ctx.lineTo(x + width, paramStartY);
      this.ctx.stroke();
      
      // Render each parameter
      for (const [paramName, paramPos] of parameterPositions.entries()) {
        const paramSpec = spec.parameters[paramName];
        if (!paramSpec) continue;
        
        const paramValue = node.parameters[paramName] ?? paramSpec.default;
        
        // Only render numeric parameters (float/int) for now
        if (paramSpec.type === 'float' || paramSpec.type === 'int') {
          this.renderParameter(paramPos.x, paramPos.y, paramPos.width, paramPos.height, paramName, paramSpec, paramValue as number);
        }
      }
    }
  }
  
  private renderParameter(
    x: number, y: number, width: number, height: number,
    paramName: string, paramSpec: import('../../types/nodeSpec').ParameterSpec, value: number
  ): void {
    const padding = 8;
    const valueWidth = 80;
    
    // Parameter label (left side)
    const paramLabelColor = getCSSColor('node-param-label-color', '#666666');
    this.ctx.fillStyle = paramLabelColor;
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(paramSpec.label || paramName, x + padding, y + height / 2 + 4);
    
    // Value display (right side, draggable)
    const valueX = x + width - valueWidth - padding;
    const paramValueColor = getCSSColor('node-param-value-color', '#333333');
    this.ctx.fillStyle = paramValueColor;
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'right';
    const displayValue = paramSpec.type === 'int' ? Math.round(value).toString() : value.toFixed(3);
    this.ctx.fillText(displayValue, valueX + valueWidth, y + height / 2 + 4);
    this.ctx.textAlign = 'left';
  }
  
  private renderPort(x: number, y: number, type: string): void {
    const radius = getCSSVariableAsNumber('port-radius', 4);
    // Use type color for consistency - same type = same color everywhere
    const color = this.getTypeColor(type);
    
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }
  
  getPortPosition(
    _node: NodeInstance,
    _spec: NodeSpec,
    metrics: NodeRenderMetrics,
    portName: string,
    isOutput: boolean
  ): { x: number; y: number } | null {
    const key = `${isOutput ? 'output' : 'input'}:${portName}`;
    return metrics.portPositions.get(key) || null;
  }
}
