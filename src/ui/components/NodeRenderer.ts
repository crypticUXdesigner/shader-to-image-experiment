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
  parameterInputPortPositions: Map<string, { x: number; y: number }>;  // Parameter name → port position
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
    const groupHeaderHeight = 24;
    const groupDividerHeight = 1;
    
    // Calculate content height
    const inputPortsHeight = spec.inputs.length * portHeight;
    const outputPortsHeight = spec.outputs.length * portHeight;
    const portsHeight = Math.max(inputPortsHeight, outputPortsHeight);
    
    // Calculate parameter height (only if node is not collapsed)
    let paramsHeight = 0;
    let currentY = 0;
    
    if (!node.collapsed && Object.keys(spec.parameters).length > 0) {
      // Organize parameters by groups
      const { groupedParams, ungroupedParams } = this.organizeParametersByGroups(spec);
      
      // Calculate height for grouped parameters
      groupedParams.forEach((group, groupIndex) => {
        if (groupIndex > 0) {
          // Add divider before group (except first group)
          currentY += groupDividerHeight;
        }
        if (group.label) {
          // Add header height for groups with labels
          currentY += groupHeaderHeight;
        }
        // Add height for each parameter in the group
        currentY += group.parameters.length * paramHeight;
      });
      
      // Add divider before ungrouped params if there are groups
      if (groupedParams.length > 0 && ungroupedParams.length > 0) {
        currentY += groupDividerHeight;
      }
      
      // Add height for ungrouped parameters
      currentY += ungroupedParams.length * paramHeight;
      
      paramsHeight = currentY + paramPadding;
    }
    
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
    const parameterInputPortPositions = new Map<string, { x: number; y: number }>();
    if (!node.collapsed && Object.keys(spec.parameters).length > 0) {
      const paramStartY = node.position.y + headerHeight + portsHeight + paramPadding;
      const paramWidth = width - (paramPadding * 2);
      const portRadius = getCSSVariableAsNumber('port-radius', 4);
      
      // Organize parameters by groups
      const { groupedParams, ungroupedParams } = this.organizeParametersByGroups(spec);
      
      let currentParamY = paramStartY;
      
      // Position grouped parameters
      groupedParams.forEach((group, groupIndex) => {
        if (groupIndex > 0) {
          // Add divider height before group (except first group)
          currentParamY += groupDividerHeight;
        }
        if (group.label) {
          // Add header height for groups with labels
          currentParamY += groupHeaderHeight;
        }
        
        // Position each parameter in the group
        group.parameters.forEach((paramName) => {
          const paramX = node.position.x + paramPadding;
          
          parameterPositions.set(paramName, {
            x: paramX,
            y: currentParamY,
            width: paramWidth,
            height: paramHeight
          });
          
          // Add parameter input port position for float/int parameters
          const paramSpec = spec.parameters[paramName];
          if (paramSpec && paramSpec.type === 'float') {
            parameterInputPortPositions.set(paramName, {
              x: paramX + portRadius + 2,  // Left side, slightly inset
              y: currentParamY + paramHeight / 2
            });
          }
          
          currentParamY += paramHeight;
        });
      });
      
      // Add divider before ungrouped params if there are groups
      if (groupedParams.length > 0 && ungroupedParams.length > 0) {
        currentParamY += groupDividerHeight;
      }
      
      // Position ungrouped parameters
      ungroupedParams.forEach((paramName) => {
        const paramX = node.position.x + paramPadding;
        
        parameterPositions.set(paramName, {
          x: paramX,
          y: currentParamY,
          width: paramWidth,
          height: paramHeight
        });
        
        // Add parameter input port position for float/int parameters
        const paramSpec = spec.parameters[paramName];
        if (paramSpec && (paramSpec.type === 'float' || paramSpec.type === 'int')) {
          parameterInputPortPositions.set(paramName, {
            x: paramX + portRadius + 2,  // Left side, slightly inset
            y: currentParamY + paramHeight / 2
          });
        }
        
        currentParamY += paramHeight;
      });
    }
    
    return {
      width,
      height: totalHeight,
      headerHeight,
      portPositions,
      parameterPositions,
      parameterInputPortPositions
    };
  }
  
  private organizeParametersByGroups(spec: NodeSpec): {
    groupedParams: Array<{ label: string | null; parameters: string[] }>;
    ungroupedParams: string[];
  } {
    const allParamNames = new Set(Object.keys(spec.parameters));
    const groupedParamNames = new Set<string>();
    const groupedParams: Array<{ label: string | null; parameters: string[] }> = [];
    
    // Process parameter groups
    if (spec.parameterGroups) {
      spec.parameterGroups.forEach((group) => {
        const groupParams = group.parameters.filter(name => allParamNames.has(name));
        if (groupParams.length > 0) {
          groupedParams.push({
            label: group.label || null,
            parameters: groupParams
          });
          groupParams.forEach(name => groupedParamNames.add(name));
        }
      });
    }
    
    // Find ungrouped parameters
    const ungroupedParams = Array.from(allParamNames).filter(name => !groupedParamNames.has(name));
    
    return { groupedParams, ungroupedParams };
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
      const paramPadding = 8;
      const paramHeight = 32;
      const groupHeaderHeight = 24;
      const paramStartY = y + headerHeight + Math.max(spec.inputs.length, spec.outputs.length) * 24;
      
      // Draw separator line before parameters
      const separatorColor = getCSSColor('node-param-separator', '#CCCCCC');
      this.ctx.strokeStyle = separatorColor;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, paramStartY);
      this.ctx.lineTo(x + width, paramStartY);
      this.ctx.stroke();
      
      // Organize parameters by groups
      const { groupedParams, ungroupedParams } = this.organizeParametersByGroups(spec);
      
      // Render grouped parameters
      let lastRenderedY = paramStartY + paramPadding;
      groupedParams.forEach((group, groupIndex) => {
        if (group.parameters.length === 0) return;
        
        // Get first parameter position to determine where to draw header/divider
        const firstParamPos = parameterPositions.get(group.parameters[0]);
        if (!firstParamPos) return;
        
        if (groupIndex > 0) {
          // Draw divider before group (except first group)
          // Position it between the last rendered item and this group
          const dividerY = firstParamPos.y - (group.label ? groupHeaderHeight : 0) - 1;
          this.ctx.strokeStyle = separatorColor;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(x + paramPadding, dividerY);
          this.ctx.lineTo(x + width - paramPadding, dividerY);
          this.ctx.stroke();
        }
        
        if (group.label) {
          // Draw group header above first parameter
          // The first parameter's Y already accounts for the header height
          // So we draw the header at firstParamPos.y - groupHeaderHeight
          const headerTopY = firstParamPos.y - groupHeaderHeight;
          const headerTextY = headerTopY + 16; // 16px from top for text baseline
          
          const groupHeaderColor = getCSSColor('node-param-group-header-color', '#666666');
          this.ctx.fillStyle = groupHeaderColor;
          this.ctx.font = '11px sans-serif';
          this.ctx.textAlign = 'left';
          this.ctx.textBaseline = 'alphabetic';
          this.ctx.fillText(group.label, x + paramPadding, headerTextY);
        }
        
        // Render each parameter in the group
        group.parameters.forEach((paramName) => {
          const paramPos = parameterPositions.get(paramName);
          if (!paramPos) return;
          
          const paramSpec = spec.parameters[paramName];
          if (!paramSpec) return;
          
          const paramValue = node.parameters[paramName] ?? paramSpec.default;
          
          // Render numeric parameters (float/int)
          if (paramSpec.type === 'float') {
            this.renderParameter(paramPos.x, paramPos.y, paramPos.width, paramPos.height, paramName, paramSpec, paramValue as number, node, metrics);
          }
          // Render string parameters (e.g., file inputs)
          else if (paramSpec.type === 'string') {
            this.renderStringParameter(paramPos.x, paramPos.y, paramPos.width, paramPos.height, paramName, paramSpec, paramValue as string, node.id);
          }
          
          lastRenderedY = paramPos.y + paramHeight;
        });
      });
      
      // Draw divider before ungrouped params if there are groups
      if (groupedParams.length > 0 && ungroupedParams.length > 0) {
        const firstUngroupedPos = parameterPositions.get(ungroupedParams[0]);
        if (firstUngroupedPos) {
          const dividerY = firstUngroupedPos.y - 1;
          this.ctx.strokeStyle = separatorColor;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(x + paramPadding, dividerY);
          this.ctx.lineTo(x + width - paramPadding, dividerY);
          this.ctx.stroke();
        }
      }
      
      // Render ungrouped parameters
      ungroupedParams.forEach((paramName) => {
        const paramPos = parameterPositions.get(paramName);
        if (!paramPos) return;
        
        const paramSpec = spec.parameters[paramName];
        if (!paramSpec) return;
        
        const paramValue = node.parameters[paramName] ?? paramSpec.default;
        
        // Render numeric parameters (float/int)
        if (paramSpec.type === 'float') {
          this.renderParameter(paramPos.x, paramPos.y, paramPos.width, paramPos.height, paramName, paramSpec, paramValue as number, node, metrics);
        }
        // Render string parameters (e.g., file inputs)
        else if (paramSpec.type === 'string') {
          this.renderStringParameter(paramPos.x, paramPos.y, paramPos.width, paramPos.height, paramName, paramSpec, paramValue as string, node.id);
        }
      });
    }
  }
  
  private renderParameter(
    x: number, y: number, width: number, height: number,
    paramName: string, paramSpec: import('../../types/nodeSpec').ParameterSpec, value: number,
    node: NodeInstance, metrics: NodeRenderMetrics
  ): void {
    const padding = 8;
    const portRadius = getCSSVariableAsNumber('port-radius', 4);
    const valueWidth = 50;
    const modeWidth = 20; // Reduced width to bring it closer
    
    // Parameter input port (left side, for float/int parameters)
    const paramInputPortPos = metrics.parameterInputPortPositions.get(paramName);
    if (paramInputPortPos && (paramSpec.type === 'float' || paramSpec.type === 'int')) {
      this.renderPort(paramInputPortPos.x, paramInputPortPos.y, 'float');
    }
    
    // Parameter label (after port)
    const labelX = paramInputPortPos ? paramInputPortPos.x + portRadius + 6 : x + padding;
    const paramLabelColor = getCSSColor('node-param-label-color', '#666666');
    this.ctx.fillStyle = paramLabelColor;
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(paramSpec.label || paramName, labelX, y + height / 2 + 4);
    
    // Value display (right side, draggable)
    const valueX = x + width - valueWidth - padding;
    
    // Mode selector (positioned right before value, very close - visually grouped with value)
    const modeGap = 1; // Small gap to keep it visually distinct but close
    const modeX = valueX - modeWidth - modeGap;
    const inputMode = node.parameterInputModes?.[paramName] || paramSpec.inputMode || 'override';
    const modeSymbol = inputMode === 'override' ? '=' : inputMode === 'add' ? '+' : inputMode === 'subtract' ? '-' : '*';
    const modeColor = getCSSColor('node-param-label-color', '#666666');
    this.ctx.fillStyle = modeColor;
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(modeSymbol, modeX + modeWidth / 2, y + height / 2 + 4);
    const paramValueColor = getCSSColor('node-param-value-color', '#333333');
    this.ctx.fillStyle = paramValueColor;
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'right';
    const displayValue = paramSpec.type === 'int' ? Math.round(value).toString() : value.toFixed(3);
    this.ctx.fillText(displayValue, valueX + valueWidth, y + height / 2 + 4);
    this.ctx.textAlign = 'left';
  }
  
  private renderStringParameter(
    x: number, y: number, width: number, height: number,
    paramName: string, paramSpec: import('../../types/nodeSpec').ParameterSpec, value: string, nodeId: string
  ): void {
    const padding = 8;
    const buttonWidth = 100;
    
    // Parameter label (left side)
    const paramLabelColor = getCSSColor('node-param-label-color', '#666666');
    this.ctx.fillStyle = paramLabelColor;
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(paramSpec.label || paramName, x + padding, y + height / 2 + 4);
    
    // Button area (right side)
    const buttonX = x + width - buttonWidth - padding;
    const buttonBg = getCSSColor('node-bg', '#FFFFFF');
    const buttonBorder = getCSSColor('node-border', '#CCCCCC');
    
    // Draw button background
    this.ctx.fillStyle = buttonBg;
    this.ctx.strokeStyle = buttonBorder;
    this.ctx.lineWidth = 1;
    this.drawRoundedRect(buttonX, y + 2, buttonWidth, height - 4, 4);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Button text - show filename if file is selected, otherwise show "Select File"
    const buttonTextColor = getCSSColor('node-param-value-color', '#333333');
    this.ctx.fillStyle = buttonTextColor;
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';
    
    let buttonText = 'Select File';
    if (value && value.trim() !== '') {
      // Extract filename from path (handle both full paths and just filenames)
      const filename = value.split('/').pop() || value.split('\\').pop() || value;
      // Truncate if too long
      if (filename.length > 15) {
        buttonText = filename.substring(0, 12) + '...';
      } else {
        buttonText = filename;
      }
    }
    
    this.ctx.fillText(buttonText, buttonX + buttonWidth / 2, y + height / 2 + 4);
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
