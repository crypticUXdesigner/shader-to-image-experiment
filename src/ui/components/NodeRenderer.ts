// Handles rendering of individual nodes with ports, parameters, etc.

import type { NodeInstance } from '../../types/nodeGraph';
import type { NodeSpec } from '../../types/nodeSpec';
import { getNodeColorByCategory, getNodeIcon } from '../../utils/nodeSpecUtils';
import { getCSSColor, getCSSColorRGBA, getCSSVariableAsNumber } from '../../utils/cssTokens';
import { renderIconOnCanvas } from '../../utils/icons';
import { NodeMetricsCalculator } from './rendering/NodeMetricsCalculator';
import { NodeHeaderRenderer } from './rendering/NodeHeaderRenderer';
import { NodePortRenderer } from './rendering/NodePortRenderer';
import { getParameterUIRegistry } from './rendering/ParameterUIRegistry';
import { ParameterLayoutManager } from './rendering/layout/ParameterLayoutManager';
import type { ElementMetrics } from './rendering/layout/LayoutElementRenderer';
import { NodeCache } from './rendering/NodeCache';
import { getPortTypeDisplayLabel } from './rendering/RenderingUtils';
import { renderStringParameter, renderArrayParameter } from '../utils/stringArrayRendering';

export interface NodeRenderMetrics {
  width: number;
  height: number;
  headerHeight: number;
  portPositions: Map<string, { x: number; y: number; isOutput: boolean }>;
  
  // New: Parameter grid metrics
  parameterGridPositions: Map<string, {
    cellX: number;
    cellY: number;
    cellWidth: number;
    cellHeight: number;
    knobX: number;
    knobY: number;
    portX: number;
    portY: number;
    labelX: number;
    labelY: number;
    valueX: number;
    valueY: number;
  }>;
  
  // Keep for compatibility (may be deprecated)
  parameterPositions: Map<string, { x: number; y: number; width: number; height: number }>;
  parameterInputPortPositions: Map<string, { x: number; y: number }>;  // Parameter name → port position
  
  // Layout system element metrics (only set when using parameterLayout)
  // Uses string keys (element type + index) for stable lookups across object instances
  elementMetrics?: Map<string, ElementMetrics>;
}

export class NodeRenderer {
  private ctx: CanvasRenderingContext2D;
  private metricsCalculator: NodeMetricsCalculator | null = null;
  private headerRenderer: NodeHeaderRenderer | null = null;
  private portRenderer: NodePortRenderer | null = null;
  private layoutManager: ParameterLayoutManager | null = null;
  private parameterRegistry = getParameterUIRegistry();
  private nodeCache: NodeCache | null = null;
  private useCache: boolean = true;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    // Initialize refactored renderers
    this.metricsCalculator = new NodeMetricsCalculator(ctx);
    this.headerRenderer = new NodeHeaderRenderer(ctx);
    this.portRenderer = new NodePortRenderer(ctx);
    this.layoutManager = new ParameterLayoutManager(ctx);
    this.nodeCache = new NodeCache();
  }
  
  /**
   * Enable or disable node caching
   */
  setCacheEnabled(enabled: boolean): void {
    this.useCache = enabled;
    if (!enabled && this.nodeCache) {
      this.nodeCache.clear();
    }
  }
  
  /**
   * Clear the node cache
   */
  clearCache(): void {
    if (this.nodeCache) {
      this.nodeCache.clear();
    }
  }
  
  /**
   * Clear cache for a specific node
   */
  clearNodeCache(node: NodeInstance, spec: NodeSpec, metrics: NodeRenderMetrics): void {
    if (this.nodeCache) {
      this.nodeCache.invalidateNode(node, spec, metrics);
    }
  }
  
  private getCategoryIconBoxBg(category: string): string {
    const tokenMap: Record<string, string> = {
      'Inputs': 'node-icon-box-bg-inputs',
      'Patterns': 'node-icon-box-bg-patterns',
      'Shapes': 'node-icon-box-bg-shapes',
      'Math': 'node-icon-box-bg-math',
      'Utilities': 'node-icon-box-bg-utilities',
      'Distort': 'node-icon-box-bg-distort',
      'Blend': 'node-icon-box-bg-blend',
      'Mask': 'node-icon-box-bg-mask',
      'Effects': 'node-icon-box-bg-effects',
      'Output': 'node-icon-box-bg-output',
      'Audio': 'node-icon-box-bg-audio'
    };
    const tokenName = tokenMap[category] || 'node-icon-box-bg-default';
    return getCSSColor(tokenName, getCSSColor('node-icon-box-bg-default', getCSSColor('color-gray-60', '#282b31')));
  }
  
  private getCategoryColorEnd(category: string): string {
    const tokenMap: Record<string, string> = {
      'Inputs': 'category-color-end-inputs',
      'Patterns': 'category-color-end-patterns',
      'Shapes': 'category-color-end-shapes',
      'Math': 'category-color-end-math',
      'Utilities': 'category-color-end-utilities',
      'Distort': 'category-color-end-distort',
      'Blend': 'category-color-end-blend',
      'Mask': 'category-color-end-mask',
      'Effects': 'category-color-end-effects',
      'Output': 'category-color-end-output',
      'Audio': 'category-color-end-audio'
    };
    const tokenName = tokenMap[category] || 'category-color-end-default';
    return getCSSColor(tokenName, getCSSColor('category-color-default', getCSSColor('color-gray-100', '#747e87')));
  }
  
  private getHeaderCategoryColor(category: string): string {
    const tokenMap: Record<string, string> = {
      'Inputs': 'node-header-category-color-inputs',
      'Patterns': 'node-header-category-color-patterns',
      'Shapes': 'node-header-category-color-shapes',
      'Math': 'node-header-category-color-math',
      'Utilities': 'node-header-category-color-utilities',
      'Distort': 'node-header-category-color-distort',
      'Blend': 'node-header-category-color-blend',
      'Mask': 'node-header-category-color-mask',
      'Effects': 'node-header-category-color-effects',
      'Output': 'node-header-category-color-output',
      'Audio': 'node-header-category-color-audio'
    };
    const tokenName = tokenMap[category] || 'node-header-category-color-default';
    return getCSSColor(tokenName, getCSSColor('node-header-category-color-default', getCSSColor('color-gray-100', '#747e87')));
  }
  
  private getHeaderCategoryColorEnd(category: string): string {
    const tokenMap: Record<string, string> = {
      'Inputs': 'node-header-category-color-end-inputs',
      'Patterns': 'node-header-category-color-end-patterns',
      'Shapes': 'node-header-category-color-end-shapes',
      'Math': 'node-header-category-color-end-math',
      'Utilities': 'node-header-category-color-end-utilities',
      'Distort': 'node-header-category-color-end-distort',
      'Blend': 'node-header-category-color-end-blend',
      'Mask': 'node-header-category-color-end-mask',
      'Effects': 'node-header-category-color-end-effects',
      'Output': 'node-header-category-color-end-output',
      'Audio': 'node-header-category-color-end-audio'
    };
    const tokenName = tokenMap[category] || 'node-header-category-color-end-default';
    return getCSSColor(tokenName, getCSSColor('node-header-category-color-end-default', getCSSColor('color-gray-80', '#4a5057')));
  }
  
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
  
  calculateMetrics(node: NodeInstance, spec: NodeSpec): NodeRenderMetrics {
    return this.metricsCalculator!.calculate(node, spec);
  }
  
  /**
   * Invalidate cached metrics for a node
   */
  invalidateMetrics(nodeId: string): void {
    this.metricsCalculator!.invalidate(nodeId);
  }
  
  // Old calculateMetricsOld method removed - now using NodeMetricsCalculator
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

  // Determine UI type for a parameter group
  private getParameterUIType(
    spec: NodeSpec,
    paramNames: string[]
  ): 'knob' | 'bezier' | 'color-picker' | 'vector2d' | 'vector3d' | 'enum' | 'range' | 'toggle' {
    // Priority order: bezier > color-picker > vector2d > vector3d > range > enum > toggle > knob
    
    // 1. Bezier curve (existing)
    if (this.isBezierCurveNode(spec)) {
      return 'bezier';
    }
    
    // 2. Color picker (OKLCH)
    if (this.isColorPickerNode(spec, paramNames)) {
      return 'color-picker';
    }
    
    // 3. 2D Vector
    if (this.isVector2DNode(spec, paramNames)) {
      return 'vector2d';
    }
    
    // 4. 3D Vector
    if (this.isVector3DNode(spec, paramNames)) {
      return 'vector3d';
    }
    
    // 5. Range editor
    if (this.isRangeEditorNode(spec, paramNames)) {
      return 'range';
    }
    
    // 6. Enum/Selector (check before toggle to avoid false positives)
    if (this.isEnumNode(spec, paramNames)) {
      return 'enum';
    }
    
    // 7. Toggle
    if (this.isToggleNode(spec, paramNames)) {
      return 'toggle';
    }
    
    // 8. Default: Knob
    return 'knob';
  }

  // Check if node has OKLCH color picker parameters (l, c, h)
  private isColorPickerNode(spec: NodeSpec, paramNames: string[]): boolean {
    return paramNames.includes('l') && paramNames.includes('c') && paramNames.includes('h') &&
      spec.parameters.l?.type === 'float' &&
      spec.parameters.c?.type === 'float' &&
      spec.parameters.h?.type === 'float' &&
      spec.parameters.l.min === 0 && spec.parameters.l.max === 1 &&
      spec.parameters.c.min === 0 && spec.parameters.c.max === 0.4 &&
      spec.parameters.h.min === 0 && spec.parameters.h.max === 360;
  }

  // Check if node has 2D vector parameters (X/Y pairs)
  private isVector2DNode(spec: NodeSpec, paramNames: string[]): boolean {
    const xParam = paramNames.find(p => p.toLowerCase().endsWith('x'));
    const yParam = paramNames.find(p => p.toLowerCase().endsWith('y'));
    
    if (!xParam || !yParam || xParam === yParam) return false;
    
    return spec.parameters[xParam]?.type === 'float' &&
           spec.parameters[yParam]?.type === 'float';
  }

  // Check if node has 3D vector parameters (X/Y/Z triplets)
  private isVector3DNode(spec: NodeSpec, paramNames: string[]): boolean {
    const xParam = paramNames.find(p => p.toLowerCase().endsWith('x'));
    const yParam = paramNames.find(p => p.toLowerCase().endsWith('y'));
    const zParam = paramNames.find(p => p.toLowerCase().endsWith('z'));
    
    if (!xParam || !yParam || !zParam || 
        xParam === yParam || xParam === zParam || yParam === zParam) return false;
    
    return spec.parameters[xParam]?.type === 'float' &&
           spec.parameters[yParam]?.type === 'float' &&
           spec.parameters[zParam]?.type === 'float';
  }

  // Check if node has range editor parameters (inMin, inMax, outMin, outMax)
  private isRangeEditorNode(spec: NodeSpec, paramNames: string[]): boolean {
    return paramNames.includes('inMin') && paramNames.includes('inMax') &&
           paramNames.includes('outMin') && paramNames.includes('outMax') &&
           spec.parameters.inMin?.type === 'float' &&
           spec.parameters.inMax?.type === 'float' &&
           spec.parameters.outMin?.type === 'float' &&
           spec.parameters.outMax?.type === 'float';
  }

  // Check if node has enum/selector parameter
  private isEnumNode(spec: NodeSpec, paramNames: string[]): boolean {
    if (paramNames.length !== 1) return false;
    
    const paramName = paramNames[0];
    const param = spec.parameters[paramName];
    
    if (!param || param.type !== 'int') return false;
    if (param.min === undefined || param.max === undefined) return false;
    
    // Reasonable limit for dropdown (max 15 options)
    const optionCount = param.max - param.min + 1;
    if (optionCount > 15) return false;
    
    // Check if it's a known enum pattern
    return this.isKnownEnumPattern(spec.id, paramName);
  }

  // Check if node has toggle parameter (int 0-1)
  private isToggleNode(spec: NodeSpec, paramNames: string[]): boolean {
    if (paramNames.length !== 1) return false;
    
    const paramName = paramNames[0];
    const param = spec.parameters[paramName];
    
    return param?.type === 'int' && param.min === 0 && param.max === 1;
  }

  // Check if parameter matches a known enum pattern
  private isKnownEnumPattern(nodeId: string, paramName: string): boolean {
    const enumMappings = this.getEnumMappings(nodeId, paramName);
    return enumMappings !== null;
  }

  // Get enum label mappings for a parameter
  getEnumMappings(nodeId: string, paramName: string): Record<number, string> | null {
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
  
  // Calculate optimal column count for parameter grid
  private calculateOptimalColumns(paramCount: number): number {
    if (paramCount <= 1) return 1;
    if (paramCount <= 2) return 2;
    
    // Special case: 5 and 6 elements should use 3 columns and 2 rows
    if (paramCount === 5 || paramCount === 6) return 3;
    
    // For 3+, try to minimize empty cells
    // Calculate rows for 2, 3, 4 columns and pick best
    const options = [2, 3, 4].map(cols => {
      const rows = Math.ceil(paramCount / cols);
      const empty = (cols * rows) - paramCount;
      return { cols, rows, empty, totalCells: cols * rows };
    });
    
    // Prefer fewer total cells, then fewer empty cells
    options.sort((a, b) => {
      if (a.totalCells !== b.totalCells) return a.totalCells - b.totalCells;
      return a.empty - b.empty;
    });
    
    return options[0].cols;
  }
  
  // Render node header with icon, name, and optionally I/O ports
  private renderHeader(
    node: NodeInstance,
    spec: NodeSpec,
    x: number,
    y: number,
    width: number,
    height: number,
    _isSelected: boolean,
    hoveredPortName?: string | null,
    connectingPortName?: string | null,
    skipPorts: boolean = false,
    fullNodeHeight?: number
  ): void {
    const headerPadding = getCSSVariableAsNumber('node-header-padding', 24);
    const iconSize = getCSSVariableAsNumber('node-header-icon-size', 60);
    const iconBoxWidth = getCSSVariableAsNumber('node-icon-box-width', 90);
    const iconBoxHeight = getCSSVariableAsNumber('node-icon-box-height', 90);
    const iconBoxRadius = getCSSVariableAsNumber('node-icon-box-radius', 36);
    const iconBoxNameSpacing = getCSSVariableAsNumber('node-icon-box-name-spacing', 24);
    const nameSize = getCSSVariableAsNumber('node-header-name-size', 30);
    const nameWeight = getCSSVariableAsNumber('node-header-name-weight', 600);
    const nameColor = getCSSColor('node-header-name-color', getCSSColor('color-gray-130', '#ebeff0'));
    const portSize = getCSSVariableAsNumber('node-port-size', 8);
    const inputPortSpacing = getCSSVariableAsNumber('node-header-input-port-spacing', 28);
    const borderRadius = getCSSVariableAsNumber('node-box-border-radius', 24);
    
    // Create clipping path for the full node (to ensure header respects parent container)
    // Use fullNodeHeight if provided, otherwise use header height (for backwards compatibility)
    const nodeHeight = fullNodeHeight ?? height;
    const nodePath = new Path2D();
    this.drawRoundedRectToPath(nodePath, x, y, width, nodeHeight, borderRadius);
    
    // Clip to parent node bounds to ensure header respects the container
    this.ctx.save();
    this.ctx.clip(nodePath);
      
      // Draw header background with radial gradient using header-specific category colors
      const headerBgColorStart = this.getHeaderCategoryColor(spec.category);
      const headerBgColorEnd = this.getHeaderCategoryColorEnd(spec.category);
      
      // Get header gradient ellipse parameters (separate from node gradient)
      const headerEllipseWidthPercent = getCSSVariableAsNumber('node-header-bg-gradient-ellipse-width', 100);
      const headerEllipseHeightPercent = getCSSVariableAsNumber('node-header-bg-gradient-ellipse-height', 100);
      const headerEllipseXPercent = getCSSVariableAsNumber('node-header-bg-gradient-ellipse-x', 50);
      const headerEllipseYPercent = getCSSVariableAsNumber('node-header-bg-gradient-ellipse-y', 50);
      
      // Calculate ellipse dimensions and position
      const headerEllipseWidth = (width * headerEllipseWidthPercent) / 100;
      const headerEllipseHeight = (height * headerEllipseHeightPercent) / 100;
      const headerEllipseX = x + (width * headerEllipseXPercent) / 100;
      const headerEllipseY = y + (height * headerEllipseYPercent) / 100;
      
      // Use the larger dimension for the radial gradient radius to ensure it covers the entire header
      const headerGradientRadius = Math.max(headerEllipseWidth, headerEllipseHeight) / 2;
      
      // Create radial gradient
      const headerGradient = this.ctx.createRadialGradient(
        headerEllipseX, headerEllipseY, 0,
        headerEllipseX, headerEllipseY, headerGradientRadius
      );
      headerGradient.addColorStop(0, headerBgColorStart);
      headerGradient.addColorStop(1, headerBgColorEnd);
      
      // Fill header with gradient (clipping will handle the rounded corners)
      this.ctx.fillStyle = headerGradient;
      this.ctx.fillRect(x, y, width, height);
      
      // Calculate icon/box/label group height for vertical centering
      const groupHeight = iconBoxHeight + iconBoxNameSpacing + nameSize;
      
      // Center the icon/box/label group vertically in the header
      const iconBoxX = x + width / 2 - iconBoxWidth / 2;
      const iconBoxY = y + (height - groupHeight) / 2;
      const iconBoxBg = this.getCategoryIconBoxBg(spec.category);
      this.ctx.fillStyle = iconBoxBg;
      this.drawRoundedRect(iconBoxX, iconBoxY, iconBoxWidth, iconBoxHeight, iconBoxRadius);
      this.ctx.fill();
      
      // Draw icon (centered in icon box)
      const iconX = x + width / 2;
      const iconY = iconBoxY + iconBoxHeight / 2;
      const iconIdentifier = getNodeIcon(spec);
      renderIconOnCanvas(this.ctx, iconIdentifier, iconX, iconY, iconSize, nameColor);
      
      // Draw node name (below icon box)
      const nameY = iconBoxY + iconBoxHeight + iconBoxNameSpacing;
      this.ctx.fillStyle = nameColor;
      this.ctx.font = `${nameWeight} ${nameSize}px "Space Grotesk", sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
    this.ctx.fillText(node.label || spec.displayName, iconX, nameY);
    
    // Restore clipping
    this.ctx.restore();
    
    // Draw input ports (left edge) - only if not skipping
    if (!skipPorts) {
      spec.inputs.forEach((port, index) => {
        const portY = y + headerPadding + (index * inputPortSpacing) + portSize;
        const isHovered = hoveredPortName === port.name;
        const isConnecting = connectingPortName === port.name;
        const portX = x;
        
        // Draw port circle first (without highlight) — connected state not available in this path
        this.renderPortCircle(portX, portY, port.type, isHovered, isConnecting, false);
        
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
        this.drawRoundedRect(typeBgX, typeBgY, typeBgWidth, typeBgHeight, typeBgRadius);
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
        const labelColor = getCSSColor('port-label-color', getCSSColor('color-gray-110', '#a3aeb5'));
        this.ctx.fillStyle = labelColor;
        this.ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(portLabel, nameTextX, nameTextY);
      });
      
      // Draw output ports (right edge)
      spec.outputs.forEach((port, index) => {
        const portY = y + headerPadding + (index * inputPortSpacing) + portSize;
        const isHovered = hoveredPortName === port.name;
        const isConnecting = connectingPortName === port.name;
        const portX = x + width;
        
        // Draw port circle first (without highlight) — connected state not available in this path
        this.renderPortCircle(portX, portY, port.type, isHovered, isConnecting, false);
        
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
        const labelColor = getCSSColor('port-label-color', getCSSColor('color-gray-110', '#a3aeb5'));
        this.ctx.fillStyle = labelColor;
        this.ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(portLabel, nameTextX, nameTextY);

        // Draw type background (between name and port)
        const typeBgColor = this.getPortTypeBgColor(port.type);
        this.ctx.fillStyle = typeBgColor;
        this.drawRoundedRect(typeBgX, typeBgY, typeBgWidth, typeBgHeight, typeBgRadius);
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
    }
    
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
  
  // Render single parameter cell

  // Render range editor (for remap nodes with inMin, inMax, outMin, outMax)
  private renderRangeEditor(
    node: NodeInstance,
    spec: NodeSpec,
    cellX: number,
    cellY: number,
    cellWidth: number,
    _cellHeight: number,
    _isConnected: boolean,
    _isHovered: boolean = false,
    skipPorts: boolean = false,
    hoveredPortName?: string | null,
    isHoveredParameter?: boolean,
    _connectingPortName?: string | null,
    _isConnectingParameter?: boolean,
    connectedParameters?: Set<string>,
    effectiveParameterValues?: Map<string, number | null>,
    useRemapRangeTokens: boolean = false
  ): void {
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    const gridGap = getCSSVariableAsNumber('param-grid-gap', 12);
    
    // Calculate slider UI height (use CSS token)
    const sliderUIHeight = getCSSVariableAsNumber('range-editor-height', 180);
    const sliderUIPadding = 12;
    
    // Calculate parameter grid height (custom, more compact)
    const rangeParamCellHeight = 120; // Custom height for range parameter cells (smaller than standard)
    
    // Slider UI area (full width at top)
    const sliderUIX = cellX + gridPadding;
    const sliderUIY = cellY + gridPadding;
    const sliderUIWidth = cellWidth - gridPadding * 2;
    
    // Parameter grid area (below slider UI)
    const paramGridY = sliderUIY + sliderUIHeight + gridGap;
    const paramGridX = cellX + gridPadding;
    const paramGridWidth = cellWidth - gridPadding * 2;
    
    // Get parameter values
    const inMin = (node.parameters.inMin ?? spec.parameters.inMin?.default ?? 0) as number;
    const inMax = (node.parameters.inMax ?? spec.parameters.inMax?.default ?? 1) as number;
    const outMin = (node.parameters.outMin ?? spec.parameters.outMin?.default ?? 0) as number;
    const outMax = (node.parameters.outMax ?? spec.parameters.outMax?.default ?? 1) as number;
    
    // Get parameter specs for min/max constraints
    const inMinSpec = spec.parameters.inMin;
    const inMaxSpec = spec.parameters.inMax;
    const outMinSpec = spec.parameters.outMin;
    const outMaxSpec = spec.parameters.outMax;
    const inMinValue = inMinSpec?.min ?? 0;
    const inMaxValue = inMaxSpec?.max ?? 1;
    const outMinValue = outMinSpec?.min ?? 0;
    const outMaxValue = outMaxSpec?.max ?? 1;
    
    // Range editor tokens for slider UI; use remap-range-* when drawing a remap-range layout element
    const editorBg = getCSSColor('range-editor-bg', getCSSColor('color-gray-20', '#020203'));
    const editorRadius = getCSSVariableAsNumber('range-editor-radius', 12);
    const editorPadding = getCSSVariableAsNumber('range-editor-padding', 12);
    const sliderBg = getCSSColor('range-editor-slider-bg', getCSSColor('color-gray-30', '#0a0b0d'));
    const sliderRadius = getCSSVariableAsNumber('range-editor-slider-radius', 30);
    const sliderTrackColor = getCSSColor('range-editor-slider-track-color', getCSSColor('color-gray-60', '#5a5f66'));
    let sliderInputActiveColor = getCSSColor('range-editor-slider-input-active-color', getCSSColor('color-green-90', '#6ee7b7'));
    let sliderOutputActiveColor = getCSSColor('range-editor-slider-output-active-color', getCSSColor('color-purple-90', '#8b5cf6'));
    if (useRemapRangeTokens) {
      sliderInputActiveColor = getCSSColor('remap-range-slider-input-color', getCSSColor('range-editor-slider-input-active-color', sliderInputActiveColor));
      // Output (end) slider: green; skip range-editor fallback (purple) so we never show wrong color
      sliderOutputActiveColor = getCSSColor('remap-range-slider-output-color', getCSSColor('color-green-90', '#6ee7b7'));
    }
    const sliderWidth = getCSSVariableAsNumber('range-editor-slider-width', 18);
    const handleSize = getCSSVariableAsNumber('range-editor-handle-size', 12);
    const handleBg = getCSSColor('range-editor-handle-bg', getCSSColor('color-blue-90', '#6565dc'));
    const handleBorder = getCSSColor('range-editor-handle-border', getCSSColor('color-gray-130', '#ebeff0'));
    const connectionColor = getCSSColor('range-editor-connection-color', getCSSColor('color-blue-90', '#6565dc'));
    const connectionWidth = getCSSVariableAsNumber('range-editor-connection-width', 2);
    const connectionDash = getCSSVariableAsNumber('range-editor-connection-dash', 4);
    
    // === RENDER SLIDER UI AT TOP (FULL WIDTH) ===
    const sliderUIEditorX = sliderUIX + sliderUIPadding;
    const sliderUIEditorY = sliderUIY + sliderUIPadding;
    const sliderUIEditorWidth = sliderUIWidth - sliderUIPadding * 2;
    
    // Draw slider UI background
    this.ctx.fillStyle = editorBg;
    this.drawRoundedRect(sliderUIX, sliderUIY, sliderUIWidth, sliderUIHeight, editorRadius);
    this.ctx.fill();
    
    // Normalize values to 0-1 range for display
    const normalizeIn = (v: number) => (inMaxValue - inMinValue > 0) ? (v - inMinValue) / (inMaxValue - inMinValue) : 0;
    const normalizeOut = (v: number) => (outMaxValue - outMinValue > 0) ? (v - outMinValue) / (outMaxValue - outMinValue) : 0;
    const inMinNorm = Math.max(0, Math.min(1, normalizeIn(inMin)));
    const inMaxNorm = Math.max(0, Math.min(1, normalizeIn(inMax)));
    const outMinNorm = Math.max(0, Math.min(1, normalizeOut(outMin)));
    const outMaxNorm = Math.max(0, Math.min(1, normalizeOut(outMax)));
    
    // Layout: Two vertical sliders side by side with space for connection
    const topMargin = 12;
    const bottomMargin = 12;
    
    // Calculate slider height (fill available height based on editor height and padding)
    const sliderHeight = sliderUIHeight - sliderUIPadding * 2 - topMargin - bottomMargin;
    
    // Calculate slider positions: input left-aligned, output right-aligned
    // Note: drawVerticalRangeSlider treats x as the center, so we need to calculate centers
    const inputSliderLeftEdge = sliderUIEditorX + editorPadding;
    const inputSliderCenter = inputSliderLeftEdge + sliderWidth / 2;
    const inputSliderRightEdge = inputSliderCenter + sliderWidth / 2;
    const outputSliderRightEdge = sliderUIEditorX + sliderUIEditorWidth - editorPadding;
    const outputSliderCenter = outputSliderRightEdge - sliderWidth / 2;
    const outputSliderLeftEdge = outputSliderCenter - sliderWidth / 2;
    // sliderUIEditorY already includes sliderUIPadding, so we only add topMargin
    const sliderY = sliderUIEditorY + topMargin;
    
    // Draw input range slider (vertical)
    // TODO: Pass actual hover/drag state when available
    this.drawVerticalRangeSlider(
      inputSliderCenter, sliderY, sliderWidth, sliderHeight,
      inMinNorm, inMaxNorm,
      sliderBg, sliderTrackColor, sliderInputActiveColor,
      handleSize, handleBg, handleBorder, sliderRadius,
      false, // isHovered
      false  // isDragging
    );
    
    // Draw output range slider (vertical)
    // TODO: Pass actual hover/drag state when available
    this.drawVerticalRangeSlider(
      outputSliderCenter, sliderY, sliderWidth, sliderHeight,
      outMinNorm, outMaxNorm,
      sliderBg, sliderTrackColor, sliderOutputActiveColor,
      handleSize, handleBg, handleBorder, sliderRadius,
      false, // isHovered
      false  // isDragging
    );
    
    // Draw connection lines between ranges (horizontal connections)
    // Connect from edges: top-right edge of input to top-left edge of output
    // and bottom-right edge of input to bottom-left edge of output
    
    const inputTopY = sliderY + (1 - inMaxNorm) * sliderHeight; // Top edge (max)
    const inputBottomY = sliderY + (1 - inMinNorm) * sliderHeight; // Bottom edge (min)
    const outputTopY = sliderY + (1 - outMaxNorm) * sliderHeight; // Top edge (max)
    const outputBottomY = sliderY + (1 - outMinNorm) * sliderHeight; // Bottom edge (min)
    
    // Draw gradient fill in the area between the sliders (bounded by sliders and connection lines)
    const gradientX1 = inputSliderRightEdge;
    const gradientX2 = outputSliderLeftEdge;
    
    // Create horizontal gradient from input slider color to output slider color
    const areaGradient = this.ctx.createLinearGradient(gradientX1, 0, gradientX2, 0);
    areaGradient.addColorStop(0, sliderInputActiveColor);
    areaGradient.addColorStop(1, sliderOutputActiveColor);
    
    // Draw filled quadrilateral: top-left, top-right, bottom-right, bottom-left
    this.ctx.fillStyle = areaGradient;
    this.ctx.globalAlpha = 0.3; // Transparency for the gradient fill
    this.ctx.beginPath();
    this.ctx.moveTo(inputSliderRightEdge, inputTopY); // Top-left (input slider top)
    this.ctx.lineTo(outputSliderLeftEdge, outputTopY); // Top-right (output slider top)
    this.ctx.lineTo(outputSliderLeftEdge, outputBottomY); // Bottom-right (output slider bottom)
    this.ctx.lineTo(inputSliderRightEdge, inputBottomY); // Bottom-left (input slider bottom)
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.globalAlpha = 1.0;
    
    // Draw connection lines (original color, on top of gradient)
    this.ctx.strokeStyle = connectionColor;
    this.ctx.lineWidth = connectionWidth;
    this.ctx.setLineDash([connectionDash, connectionDash]);
    this.ctx.globalAlpha = 0.5;
    
    // Connect top edges: input top-right to output top-left
    this.drawArrow(inputSliderRightEdge, inputTopY, outputSliderLeftEdge, outputTopY, connectionColor, connectionWidth);
    // Connect bottom edges: input bottom-right to output bottom-left
    this.drawArrow(inputSliderRightEdge, inputBottomY, outputSliderLeftEdge, outputBottomY, connectionColor, connectionWidth);
    
    this.ctx.setLineDash([]);
    this.ctx.globalAlpha = 1.0;
    
    // === RENDER PARAMETER GRID BELOW SLIDER UI ===
    // Include all 5 parameters: inMax, outMax, inMin, outMin, clamp
    // Layout: Row 1: In Max - Out Max, Row 2: In Min - Out Min
    const allParams = ['inMax', 'outMax', 'inMin', 'outMin', 'clamp'];
    const columns = 2;
    const paramCellWidth = (paramGridWidth - gridGap) / columns;
    
    allParams.forEach((paramName, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const paramCellX = paramGridX + col * (paramCellWidth + gridGap);
      const paramCellY = paramGridY + row * (rangeParamCellHeight + gridGap);
      
      const paramSpec = spec.parameters[paramName];
      if (!paramSpec) return;
      
      const paramValue = node.parameters[paramName] ?? paramSpec.default;
      const isParamHovered = hoveredPortName === paramName && isHoveredParameter;
      const effectiveValue = effectiveParameterValues?.get(paramName) ?? null;
      const isParamConnected = connectedParameters?.has(paramName) ?? false;
      
      // Check UI type - clamp should render as toggle, range params as input field
      const uiType = this.getParameterUIType(spec, [paramName]);
      if (uiType === 'toggle') {
        // Use parameter registry for toggle rendering
        const renderer = this.parameterRegistry.getRenderer(spec, paramName);
        const metrics = renderer.calculateMetrics(
          paramName,
          paramSpec,
          {
            x: paramCellX,
            y: paramCellY,
            width: paramCellWidth,
            height: rangeParamCellHeight
          }
        );
        renderer.render(
          this.ctx,
          node,
          spec,
          paramName,
          metrics,
          {
            isConnected: isParamConnected,
            isHovered: isParamHovered ?? false,
            effectiveValue: effectiveValue,
            skipPorts: skipPorts ?? false
          }
        );
      } else {
        // Use simple input field renderer (no knob, just value display + input)
        this.renderSimpleInputField(
          paramName,
          paramSpec,
          paramValue as number,
          paramCellX,
          paramCellY,
          paramCellWidth,
          rangeParamCellHeight,
          isParamConnected,
          effectiveValue,
          node,
          spec,
          isParamHovered,
          skipPorts
        );
      }
    });
    
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }

  // Helper method to draw a vertical range slider with two handles
  // Bottom = low value, top = high value
  // Handles are not visually drawn but positions are calculated for interactivity
  // handleSize, handleBg, handleBorder are kept for future use but not currently used
  private drawVerticalRangeSlider(
    x: number, y: number, width: number, height: number,
    minNorm: number, maxNorm: number,
    bgColor: string, trackColor: string, activeColor: string,
    _handleSize: number, _handleBg: string, _handleBorder: string,
    radius: number,
    isHovered: boolean = false,
    isDragging: boolean = false
  ): void {
    const trackX = x;
    const trackWidth = width;
    const trackLeft = trackX - trackWidth / 2;
    
    // Draw full slider track background (inactive areas)
    this.ctx.fillStyle = bgColor;
    this.drawRoundedRect(trackLeft, y, trackWidth, height, radius);
    this.ctx.fill();
    
    // Draw track border for better definition
    this.ctx.strokeStyle = trackColor;
    this.ctx.lineWidth = 1;
    this.drawRoundedRect(trackLeft, y, trackWidth, height, radius);
    this.ctx.stroke();
    
    // Draw active range (between min and max handles) - this is the selected range
    // In vertical slider: bottom = low (minNorm), top = high (maxNorm)
    // Handle positions:
    //   - Min handle (bottom): y + (1 - minNorm) * height
    //   - Max handle (top): y + (1 - maxNorm) * height
    // Active range should be between these handles
    // Ensure minNorm <= maxNorm for correct drawing
    const actualMinNorm = Math.min(minNorm, maxNorm);
    const actualMaxNorm = Math.max(minNorm, maxNorm);
    const activeTopY = y + (1 - actualMaxNorm) * height; // Top of active range (at max handle)
    const activeBottomY = y + (1 - actualMinNorm) * height; // Bottom of active range (at min handle)
    const activeHeight = Math.max(0, activeBottomY - activeTopY);
    if (activeHeight > 0) {
      this.ctx.fillStyle = activeColor;
      this.drawRoundedRect(trackLeft, activeTopY, trackWidth, activeHeight, radius);
      this.ctx.fill();
    }
    
    // Calculate handle positions for interactivity (not drawn visually)
    // Bottom = low value (minNorm), top = high value (maxNorm)
    // These positions can be used for hit testing in interaction code
    // const handleY1 = y + (1 - minNorm) * height; // Min handle at bottom
    // const handleY2 = y + (1 - maxNorm) * height; // Max handle at top
    
    // Draw edge highlighting when hovering or dragging
    // Brighten a few pixels at top and bottom edges
    if (isHovered || isDragging) {
      const highlightWidth = 2; // pixels to brighten
      const highlightOpacity = 0.6;
      
      // Top edge highlight
      this.ctx.fillStyle = `rgba(255, 255, 255, ${highlightOpacity})`;
      this.ctx.fillRect(trackLeft, y, trackWidth, highlightWidth);
      
      // Bottom edge highlight
      this.ctx.fillRect(trackLeft, y + height - highlightWidth, trackWidth, highlightWidth);
    }
  }

  // Helper method to draw an arrow
  private drawArrow(x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    
    // Draw arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowSize = 6;
    const arrowX = x2 - Math.cos(angle) * arrowSize;
    const arrowY = y2 - Math.sin(angle) * arrowSize;
    
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(arrowX - Math.cos(angle - Math.PI / 6) * arrowSize, arrowY - Math.sin(angle - Math.PI / 6) * arrowSize);
    this.ctx.lineTo(arrowX - Math.cos(angle + Math.PI / 6) * arrowSize, arrowY - Math.sin(angle + Math.PI / 6) * arrowSize);
    this.ctx.closePath();
    this.ctx.fill();
  }

  // Render simple input field (value display + input, no knob) for range editor cells
  // Layout matches standard parameter cell exactly, but replaces knob with input field
  private renderSimpleInputField(
    paramName: string,
    paramSpec: import('../../types/nodeSpec').ParameterSpec,
    paramValue: number,
    cellX: number,
    cellY: number,
    cellWidth: number,
    cellHeight: number,
    isConnected: boolean,
    effectiveValue: number | null,
    node: NodeInstance,
    spec: NodeSpec,
    isHovered: boolean = false,
    skipPorts: boolean = false
  ): void {
    // Use exact same tokens and setup as renderParameterCell
    const cellBg = getCSSColor('param-cell-bg', getCSSColor('color-gray-30', '#050507'));
    const cellBgEnd = getCSSColor('param-cell-bg-end', 'transparent');
    const cellBgConnectedRGBA = getCSSColorRGBA('param-cell-bg-connected', { r: 255, g: 255, b: 255, a: 0.5 });
    const cellBgConnected = `rgba(${cellBgConnectedRGBA.r}, ${cellBgConnectedRGBA.g}, ${cellBgConnectedRGBA.b}, ${cellBgConnectedRGBA.a})`;
    const cellBorderRadius = getCSSVariableAsNumber('param-cell-border-radius', 6);
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const portSize = getCSSVariableAsNumber('param-port-size', 6);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const labelFontWeight = getCSSVariableAsNumber('param-label-font-weight', 600);
    const labelColor = getCSSColor('param-label-color', getCSSColor('color-gray-110', '#a3aeb5'));
    const valueFontSize = getCSSVariableAsNumber('knob-value-font-size', 18);
    const valueColor = getCSSColor('knob-value-color', getCSSColor('color-gray-130', '#ebeff0'));
    const modeButtonSize = getCSSVariableAsNumber('param-mode-button-size', 20);

    // Draw cell background (gradient when not connected, solid when connected)
    if (isConnected) {
      this.ctx.fillStyle = cellBgConnected;
      this.drawRoundedRect(cellX, cellY, cellWidth, cellHeight, cellBorderRadius);
      this.ctx.fill();
    } else {
      const ew = (cellWidth * getCSSVariableAsNumber('param-cell-bg-gradient-ellipse-width', 100)) / 100;
      const eh = (cellHeight * getCSSVariableAsNumber('param-cell-bg-gradient-ellipse-height', 100)) / 100;
      const ex = cellX + (cellWidth * getCSSVariableAsNumber('param-cell-bg-gradient-ellipse-x', 50)) / 100;
      const ey = cellY + (cellHeight * getCSSVariableAsNumber('param-cell-bg-gradient-ellipse-y', 50)) / 100;
      const gradientRadius = Math.max(ew, eh) / 2;
      const gradient = this.ctx.createRadialGradient(ex, ey, 0, ex, ey, gradientRadius);
      gradient.addColorStop(0, cellBg);
      gradient.addColorStop(1, cellBgEnd);
      this.ctx.save();
      this.drawRoundedRect(cellX, cellY, cellWidth, cellHeight, cellBorderRadius);
      this.ctx.clip();
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
      this.ctx.restore();
    }
    
    // Draw cell border
    const borderColorToken = isConnected ? 'param-cell-border-connected' : 'param-cell-border';
    this.ctx.strokeStyle = getCSSColor(borderColorToken, getCSSColor('color-gray-70', '#282b31'));
    this.ctx.lineWidth = 1;
    this.drawRoundedRect(cellX, cellY, cellWidth, cellHeight, cellBorderRadius);
    this.ctx.stroke();
    
    // Draw parameter name label first to measure actual text height
    const paramNameText = paramSpec.label || paramName;
    this.ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = 'center';
    const paramNameX = cellX + cellWidth / 2;
    const paramNameY = cellY + cellPadding;
    
    // Measure text to get actual rendered height (accounts for font metrics)
    const labelTextMetrics = this.ctx.measureText(paramNameText);
    const actualTextHeight = labelTextMetrics.actualBoundingBoxAscent + labelTextMetrics.actualBoundingBoxDescent;
    // Use actual text height if available, otherwise fall back to font size
    const labelHeight = actualTextHeight > 0 ? actualTextHeight : labelFontSize;
    
    // Port positioned: X uses cellPadding, Y is vertically centered with label text
    const portX = cellX + cellPadding;
    // Port center aligns with label text center (label uses textBaseline='top')
    const portY = paramNameY + labelHeight / 2;
    
    const hasPort = !spec.parameterLayout?.parametersWithoutPorts?.includes(paramName);
    
    // Draw parameter port (top-left corner) - only if not skipping and parameter has a port
    if (!skipPorts && paramSpec.type === 'float' && hasPort) {
      this.renderPort(portX, portY, 'float', isHovered, false, false, portSize / getCSSVariableAsNumber('port-radius', 4));
    }
    
    // Draw parameter name label
    this.ctx.fillStyle = labelColor;
    this.ctx.fillText(paramNameText, paramNameX, paramNameY);
    
    // Calculate input field position (where knob would be, but smaller)
    const labelBottom = paramNameY + labelFontSize;
    const labelInputSpacing = getCSSVariableAsNumber('range-editor-param-label-spacing', 8);
    // Input field center Y - positioned below label with spacing
    const inputFieldCenterY = labelBottom + labelInputSpacing;
    const inputFieldX = cellX + cellWidth / 2; // Horizontally centered like knob
    
    // Draw mode button (left side, vertically centered with input field, horizontally aligned with port) - only if parameter has a port
    if (hasPort && paramSpec.type === 'float') {
      const modeButtonX = portX; // Same X as port (horizontally centered with port)
      const modeButtonY = inputFieldCenterY; // Vertically centered with input field
      const inputMode = node.parameterInputModes?.[paramName] || paramSpec.inputMode || 'override';
      const modeSymbol = inputMode === 'override' ? '=' : inputMode === 'add' ? '+' : inputMode === 'subtract' ? '-' : '*';
      const modeButtonBg = getCSSColor('param-mode-button-bg', getCSSColor('color-gray-50', '#111317'));
      this.ctx.fillStyle = modeButtonBg;
      this.ctx.beginPath();
      this.ctx.arc(modeButtonX, modeButtonY, modeButtonSize / 2, 0, Math.PI * 2);
      this.ctx.fill();
      // Use different color based on connection state
      const modeButtonColorToken = isConnected ? 'param-mode-button-color-connected' : 'param-mode-button-color-static';
      this.ctx.fillStyle = getCSSColor(modeButtonColorToken, isConnected ? getCSSColor('color-gray-130', '#ebeff0') : getCSSColor('color-gray-60', '#5a5f66'));
      const modeButtonFontSize = getCSSVariableAsNumber('param-mode-button-font-size', 18);
      const modeButtonFontWeight = getCSSVariableAsNumber('param-mode-button-font-weight', 500);
      const modeButtonTextOffsetY = getCSSVariableAsNumber('param-mode-button-text-offset-y', 0);
      this.ctx.font = `${modeButtonFontWeight} ${modeButtonFontSize}px "Space Grotesk", sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(modeSymbol, modeButtonX, modeButtonY + modeButtonTextOffsetY);
    }
    
    // Draw input field (replaces knob) - positioned at inputFieldCenterY
    const displayValue = effectiveValue !== null ? effectiveValue : paramValue;
    const isAnimated = effectiveValue !== null;
    const valueDisplayColor = isAnimated 
      ? getCSSColor('node-param-value-animated-color', getCSSColor('color-teal-90', '#2f8a6b'))
      : valueColor;
    
    // Prepare font for text measurement
    this.ctx.font = `${valueFontSize}px "JetBrains Mono", monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle'; // Center vertically on inputFieldCenterY
    const displayText = paramSpec.type === 'int' ? Math.round(displayValue).toString() : displayValue.toFixed(3);
    const textMetrics = this.ctx.measureText(displayText);
    const textWidth = textMetrics.width;
    const textHeight = valueFontSize;
    
    // Draw background (centered on inputFieldCenterY)
    const valueBg = getCSSColor('knob-value-bg', getCSSColor('color-gray-30', '#0a0b0d'));
    const valueRadius = getCSSVariableAsNumber('knob-value-radius', 4);
    const paddingH = getCSSVariableAsNumber('knob-value-padding-horizontal', 8);
    const paddingV = getCSSVariableAsNumber('knob-value-padding-vertical', 4);
    const bgX = inputFieldX - textWidth / 2 - paddingH;
    const bgY = inputFieldCenterY - (textHeight / 2 + paddingV); // Center vertically
    const bgWidth = textWidth + paddingH * 2;
    const bgHeight = textHeight + paddingV * 2;
    this.ctx.fillStyle = valueBg;
    this.drawRoundedRect(bgX, bgY, bgWidth, bgHeight, valueRadius);
    this.ctx.fill();
    
    // Draw text (centered on inputFieldCenterY)
    this.ctx.fillStyle = valueDisplayColor;
    this.ctx.fillText(displayText, inputFieldX, inputFieldCenterY);
    
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
  
  // Render bezier curve editor
  private renderBezierEditor(
    node: NodeInstance,
    spec: NodeSpec,
    editorX: number,
    editorY: number,
    editorWidth: number,
    editorHeight: number,
    _portX: number,
    _portY: number[],
    _modeButtonX: number,
    _modeButtonY: number[],
    _typeLabelX: number,
    _typeLabelY: number[],
    _labelX: number,
    _labelY: number[],
    _connectedParameters?: Set<string>,
    hoveredControlPoint?: number | null,
    _hoveredPortName?: string | null,
    _isHoveredParameter?: boolean,
    _skipPorts: boolean = false
  ): void {
    const bezierEditorBg = getCSSColor('bezier-editor-bg', getCSSColor('color-gray-20', '#020203'));
    const bezierEditorBorder = getCSSColor('bezier-editor-border-color', getCSSColor('color-gray-70', '#282b31'));
    const bezierEditorRadius = getCSSVariableAsNumber('bezier-editor-radius', 8);
    const bezierEditorPadding = getCSSVariableAsNumber('bezier-editor-padding', 12);
    const gridColor = getCSSColor('bezier-editor-grid-color', getCSSColor('color-gray-60', '#5a5f66'));
    const gridLineWidth = getCSSVariableAsNumber('bezier-editor-grid-line-width', 1);
    const gridBorderColor = getCSSColor('bezier-editor-grid-border-color', getCSSColor('color-gray-70', '#282b31'));
    const gridBorderWidth = getCSSVariableAsNumber('bezier-editor-grid-border-width', 2);
    const curveColor = getCSSColor('bezier-editor-curve-color', getCSSColor('color-blue-90', '#6565dc'));
    const curveWidth = getCSSVariableAsNumber('bezier-editor-curve-width', 3);
    const controlPointSize = getCSSVariableAsNumber('bezier-editor-control-point-size', 8);
    const controlPointBg = getCSSColor('bezier-editor-control-point-bg', getCSSColor('color-blue-90', '#6565dc'));
    const controlPointBorder = getCSSColor('bezier-editor-control-point-border', getCSSColor('color-gray-130', '#ebeff0'));
    const controlPointHoverSize = getCSSVariableAsNumber('bezier-editor-control-point-hover-size', 12);
    const controlPointHoverBg = getCSSColor('bezier-editor-control-point-hover-bg', getCSSColor('color-blue-100', '#7a7aff'));
    const controlLineColor = getCSSColor('bezier-editor-control-line-color', getCSSColor('color-gray-80', '#4a5057'));
    const controlLineWidth = getCSSVariableAsNumber('bezier-editor-control-line-width', 1);
    const controlLineDash = getCSSVariableAsNumber('bezier-editor-control-line-dash', 4);
    
    // Get parameter values
    const x1 = (node.parameters.x1 ?? spec.parameters.x1?.default ?? 0) as number;
    const y1 = (node.parameters.y1 ?? spec.parameters.y1?.default ?? 0) as number;
    const x2 = (node.parameters.x2 ?? spec.parameters.x2?.default ?? 1) as number;
    const y2 = (node.parameters.y2 ?? spec.parameters.y2?.default ?? 1) as number;
    
    // Draw editor background FIRST
    this.ctx.fillStyle = bezierEditorBg;
    this.drawRoundedRect(editorX, editorY, editorWidth, editorHeight, bezierEditorRadius);
    this.ctx.fill();
    
    // Draw border - adjust coordinates to account for stroke being centered on path
    // Offset by half the border width so the entire border is visible
    const borderOffset = gridBorderWidth / 2;
    const borderX = editorX + borderOffset;
    const borderY = editorY + borderOffset;
    const borderWidth_rect = editorWidth - gridBorderWidth;
    const borderHeight_rect = editorHeight - gridBorderWidth;
    const borderRadius = Math.max(0, bezierEditorRadius - borderOffset);
    
    this.ctx.strokeStyle = bezierEditorBorder;
    this.ctx.lineWidth = gridBorderWidth;
    this.drawRoundedRect(borderX, borderY, borderWidth_rect, borderHeight_rect, borderRadius);
    this.ctx.stroke();
    
    // Calculate drawing area (inside padding)
    const drawX = editorX + bezierEditorPadding;
    const drawY = editorY + bezierEditorPadding;
    const drawWidth = editorWidth - bezierEditorPadding * 2;
    const drawHeight = editorHeight - bezierEditorPadding * 2;
    
    // Draw grid
    this.ctx.strokeStyle = gridColor;
    this.ctx.lineWidth = gridLineWidth;
    const gridSteps = 4;
    for (let i = 1; i < gridSteps; i++) {
      const t = i / gridSteps;
      // Vertical lines
      this.ctx.beginPath();
      this.ctx.moveTo(drawX + t * drawWidth, drawY);
      this.ctx.lineTo(drawX + t * drawWidth, drawY + drawHeight);
      this.ctx.stroke();
      // Horizontal lines
      this.ctx.beginPath();
      this.ctx.moveTo(drawX, drawY + t * drawHeight);
      this.ctx.lineTo(drawX + drawWidth, drawY + t * drawHeight);
      this.ctx.stroke();
    }
    
    // Draw grid border (all four edges)
    this.ctx.strokeStyle = gridBorderColor;
    this.ctx.lineWidth = gridBorderWidth;
    this.ctx.beginPath();
    // Top edge
    this.ctx.moveTo(drawX, drawY);
    this.ctx.lineTo(drawX + drawWidth, drawY);
    // Right edge
    this.ctx.lineTo(drawX + drawWidth, drawY + drawHeight);
    // Bottom edge
    this.ctx.lineTo(drawX, drawY + drawHeight);
    // Left edge (closes the rectangle)
    this.ctx.closePath();
    this.ctx.stroke();
    
    // Convert bezier control points to screen coordinates (flip Y for screen space)
    const cp1X = drawX + x1 * drawWidth;
    const cp1Y = drawY + (1 - y1) * drawHeight;
    const cp2X = drawX + x2 * drawWidth;
    const cp2Y = drawY + (1 - y2) * drawHeight;
    const startX = drawX;
    const startY = drawY + drawHeight;
    const endX = drawX + drawWidth;
    const endY = drawY;
    
    // Draw control lines (dashed)
    this.ctx.strokeStyle = controlLineColor;
    this.ctx.lineWidth = controlLineWidth;
    this.ctx.setLineDash([controlLineDash, controlLineDash]);
    // Line from start to cp1
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(cp1X, cp1Y);
    this.ctx.stroke();
    // Line from end to cp2
    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(cp2X, cp2Y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Draw bezier curve
    this.ctx.strokeStyle = curveColor;
    this.ctx.lineWidth = curveWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
    this.ctx.stroke();
    
    // Draw control points
    const controlPoints = [
      { x: cp1X, y: cp1Y, paramIndex: 0 },
      { x: cp2X, y: cp2Y, paramIndex: 2 }
    ];
    
    controlPoints.forEach((cp) => {
      const isHovered = hoveredControlPoint === cp.paramIndex;
      const size = isHovered ? controlPointHoverSize : controlPointSize;
      const bg = isHovered ? controlPointHoverBg : controlPointBg;
      
      // Draw control point
      this.ctx.fillStyle = bg;
      this.ctx.beginPath();
      this.ctx.arc(cp.x, cp.y, size / 2, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Draw border
      this.ctx.strokeStyle = controlPointBorder;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    });
    
    // Ports are now rendered in renderNodePorts() method, not here
    
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
  
  // Render parameter grid section (LEGACY - no longer used, migration complete)
  // @ts-ignore - kept for reference but not used
  private renderParameterGrid(
    node: NodeInstance,
    spec: NodeSpec,
    x: number,
    y: number,
    width: number,
    metrics: NodeRenderMetrics,
    _isSelected: boolean,
    effectiveParameterValues?: Map<string, number | null>,
    hoveredPortName?: string | null,
    isHoveredParameter?: boolean,
    connectedParameters?: Set<string>,
    skipPorts: boolean = false
  ): void {
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18); // Use same padding as calculateMetrics
    const groupHeaderHeight = getCSSVariableAsNumber('param-group-header-height', 24);
    const groupHeaderFontSize = getCSSVariableAsNumber('param-group-header-font-size', 24);
    const groupHeaderColor = getCSSColor('param-group-header-color', getCSSColor('color-gray-110', '#a3aeb5'));
    const groupHeaderMarginTop = getCSSVariableAsNumber('param-group-header-margin-top', 0);
    const groupHeaderMarginBottom = getCSSVariableAsNumber('param-group-header-margin-bottom', 0);
    const groupDividerHeight = getCSSVariableAsNumber('param-group-divider-height', 1);
    const groupDividerColor = getCSSColor('param-group-divider-color', getCSSColor('color-gray-70', '#282b31'));
    const groupDividerSpacing = getCSSVariableAsNumber('param-group-divider-spacing', 12);
    const bodyTopPadding = getCSSVariableAsNumber('param-body-top-padding', 24);
    const cellHeight = getCSSVariableAsNumber('param-cell-height', 100);
    const gridGap = getCSSVariableAsNumber('param-grid-gap', 12);
    
    if (Object.keys(spec.parameters).length === 0) return;
    
    // Check for special parameter groups that need custom rendering
    const rangeParams = ['inMin', 'inMax', 'outMin', 'outMax'];
    const isRangeNode = this.isRangeEditorNode(spec, rangeParams);
    
    // Special handling for bezier curve nodes
    const isBezierNode = this.isBezierCurveNode(spec);
    if (isBezierNode) {
      const bodyTopPadding = getCSSVariableAsNumber('param-body-top-padding', 24);
      const bezierEditorHeight = getCSSVariableAsNumber('bezier-editor-height', 200);
      const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
      // Use larger spacing for bezier curve parameters
      const bezierPortSpacing = getCSSVariableAsNumber('bezier-param-port-spacing', 40);
      const modeButtonSize = getCSSVariableAsNumber('param-mode-button-size', 24);
      
      const currentY = y + bodyTopPadding;
      const leftEdgePadding = gridPadding;
      const bezierParams = ['x1', 'y1', 'x2', 'y2'];
      
      // Calculate positions using header node styling
      const portX = x + leftEdgePadding;
      const portRadius = getCSSVariableAsNumber('port-radius', 6);
      const portLabelSpacing = getCSSVariableAsNumber('port-label-spacing', 12);
      const portToModeSpacing = portLabelSpacing;
      const modeButtonX = portX + portRadius + portToModeSpacing;
      const modeToTypeSpacing = portLabelSpacing;
      const typeLabelX = modeButtonX + modeButtonSize + modeToTypeSpacing;
      
      // Calculate labelX based on max type label width
      const typeSpacing = getCSSVariableAsNumber('port-type-spacing', 4);
      const typePaddingH = getCSSVariableAsNumber('port-type-padding-horizontal', 8);
      const typeFontSize = getCSSVariableAsNumber('port-type-font-size', 15);
      const typeFontWeight = getCSSVariableAsNumber('port-type-font-weight', 600);
      // Measure max type width for all parameters
      this.ctx.font = `${typeFontWeight} ${typeFontSize}px "Space Grotesk", sans-serif`;
      const maxTypeWidth = Math.max(...bezierParams.map(p => {
        const paramSpec = spec.parameters[p];
        const paramType = paramSpec?.type || 'float';
        return this.ctx.measureText(getPortTypeDisplayLabel(paramType)).width;
      }));
      const maxTypeBgWidth = maxTypeWidth + typePaddingH * 2;
      const labelX = typeLabelX + maxTypeBgWidth + typeSpacing;
      const bezierEditorX = labelX + 100; // Approximate space for label
      
      // Ensure bezier editor is within node bounds and has minimum width
      const maxBezierEditorX = x + width - gridPadding;
      const actualBezierEditorX = Math.min(bezierEditorX, maxBezierEditorX - 200); // Leave at least 200px width
      const bezierEditorWidth = Math.max(200, maxBezierEditorX - actualBezierEditorX);
      // Port Y positions: distribute evenly across bezier editor height, starting from currentY
      // Center the ports vertically within the editor
      const totalSpacing = (bezierParams.length - 1) * bezierPortSpacing;
      const startOffset = (bezierEditorHeight - totalSpacing) / 2;
      const portY = bezierParams.map((_, index) => currentY + startOffset + index * bezierPortSpacing);
      const modeButtonY = portY; // Mode buttons align with ports
      const typeLabelY = portY; // Type labels align with ports
      const labelY = portY; // Name labels align with ports
      
      // Get hovered control point (if any)
      let hoveredControlPoint: number | null = null;
      // TODO: Get from hover state
      
      this.renderBezierEditor(
        node,
        spec,
        actualBezierEditorX,
        currentY,
        bezierEditorWidth,
        bezierEditorHeight,
        portX,
        portY,
        modeButtonX,
        modeButtonY,
        typeLabelX,
        typeLabelY,
        labelX,
        labelY,
        connectedParameters,
        hoveredControlPoint,
        hoveredPortName,
        isHoveredParameter,
        skipPorts
      );
      return;
    }
    
    // Special handling for range editor nodes
    if (isRangeNode) {
      const bodyTopPadding = getCSSVariableAsNumber('param-body-top-padding', 24);
      const sliderUIHeight = getCSSVariableAsNumber('range-editor-height', 180);
      const gridGap = getCSSVariableAsNumber('param-grid-gap', 12);
      const rangeParamCellHeight = 120; // Custom height for range parameter cells (smaller than standard)
      // 5 parameters: inMin, inMax, outMin, outMax, clamp = 3 rows (2 columns)
      const paramGridHeight = rangeParamCellHeight * 3 + gridGap * 2; // 3 rows
      const cellMinWidth = getCSSVariableAsNumber('param-cell-min-width', 220);
      const currentY = y + bodyTopPadding;
      
      // Calculate cell position (centered horizontally)
      const cellX = x + gridPadding;
      const cellWidth = Math.max(cellMinWidth, width - gridPadding * 2);
      // Total height: slider UI + gap + parameter grid + bottom padding
      const cellHeight = sliderUIHeight + gridGap + paramGridHeight;
      
      // Check if any range parameters are connected
      const rangeParams = ['inMin', 'inMax', 'outMin', 'outMax'];
      const isAnyConnected = rangeParams.some(p => connectedParameters?.has(p) ?? false);
      
      // Check if any range parameters are hovered
      const isAnyHovered = rangeParams.some(p => hoveredPortName === p && isHoveredParameter);
      
      this.renderRangeEditor(
        node,
        spec,
        cellX,
        currentY,
        cellWidth,
        cellHeight,
        isAnyConnected,
        isAnyHovered,
        skipPorts,
        hoveredPortName,
        isHoveredParameter,
        undefined, // connectingPortName - not available in this context
        undefined, // isConnectingParameter - not available in this context
        connectedParameters,
        effectiveParameterValues
      );
      return;
    }
    
    const { groupedParams, ungroupedParams } = this.organizeParametersByGroups(spec);
    let currentY = y;
    
    // Add top padding if body doesn't start with a group header
    // (either no groups at all, or first group has no label)
    const firstGroupHasLabel = groupedParams.length > 0 && groupedParams[0].label && groupedParams[0].parameters.length > 0;
    if (groupedParams.length === 0 || !firstGroupHasLabel) {
      currentY += bodyTopPadding;
    }
    
    // Render grouped parameters
    groupedParams.forEach((group, groupIndex) => {
      if (group.parameters.length === 0) return;
      
      // Draw divider before group (except first group)
      if (groupIndex > 0) {
        // Add spacing before divider
        currentY += groupDividerSpacing;
        // Draw divider
        this.ctx.strokeStyle = groupDividerColor;
        this.ctx.lineWidth = groupDividerHeight;
        this.ctx.beginPath();
        this.ctx.moveTo(x + gridPadding, currentY);
        this.ctx.lineTo(x + width - gridPadding, currentY);
        this.ctx.stroke();
        currentY += groupDividerHeight;
        // Add spacing after divider
        currentY += groupDividerSpacing;
      }
      
      // Draw group header
      if (group.label) {
        // Add top margin before header
        currentY += groupHeaderMarginTop;
        
        this.ctx.fillStyle = groupHeaderColor;
        this.ctx.font = `${getCSSVariableAsNumber('param-group-header-weight', 600)} ${groupHeaderFontSize}px "Space Grotesk", sans-serif`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(group.label, x + gridPadding, currentY + groupHeaderHeight / 2);
        currentY += groupHeaderHeight;
        
        // Add bottom margin after header
        currentY += groupHeaderMarginBottom;
      }
      
      // Render parameters using positions from metrics (single source of truth)
      // Skip range editor parameters if they were already rendered as a group
      group.parameters.forEach((paramName) => {
        // Skip range editor parameters if they were already rendered as a group
        if (isRangeNode && rangeParams.includes(paramName)) {
          return;
        }
        
        const gridPos = metrics.parameterGridPositions.get(paramName);
        if (!gridPos) return;
        
        const paramSpec = spec.parameters[paramName];
        if (!paramSpec) return;
        
        const paramValue = node.parameters[paramName] ?? paramSpec.default;
        const isParamHovered = (hoveredPortName === paramName && isHoveredParameter) ?? false;
        const effectiveValue = effectiveParameterValues?.get(paramName) ?? null;
        const isConnected = connectedParameters?.has(paramName) ?? false;
        
        if (paramSpec.type === 'float' || paramSpec.type === 'int') {
          const renderer = this.parameterRegistry.getRenderer(spec, paramName);
          renderer.render(
            this.ctx,
            node,
            spec,
            paramName,
            gridPos,
            {
              isConnected,
              isHovered: isParamHovered,
              effectiveValue,
              skipPorts
            }
          );
        } else if (paramSpec.type === 'string') {
          // Render string parameter (button style)
          renderStringParameter(this.ctx, gridPos.cellX, gridPos.cellY, gridPos.cellWidth, gridPos.cellHeight, paramName, paramSpec, paramValue as string);
        } else if (paramSpec.type === 'array') {
          // Render array parameter
          renderArrayParameter(this.ctx, gridPos.cellX, gridPos.cellY, gridPos.cellWidth, gridPos.cellHeight, paramName, paramSpec, paramValue);
        }
      });
      
      // Update currentY to after this group (calculate from metrics positions)
      const rows = Math.ceil(group.parameters.length / this.calculateOptimalColumns(group.parameters.length));
      currentY += rows * (cellHeight + gridGap) - gridGap;
    });
    
    // Draw divider before ungrouped params if there are groups
    if (groupedParams.length > 0 && ungroupedParams.length > 0) {
      // Add spacing before divider
      currentY += groupDividerSpacing;
      // Draw divider
      this.ctx.strokeStyle = groupDividerColor;
      this.ctx.lineWidth = groupDividerHeight;
      this.ctx.beginPath();
      this.ctx.moveTo(x + gridPadding, currentY);
      this.ctx.lineTo(x + width - gridPadding, currentY);
      this.ctx.stroke();
      currentY += groupDividerHeight;
      // Add spacing after divider
      currentY += groupDividerSpacing;
    }
    
    // Render ungrouped parameters using positions from metrics
    // Skip range editor parameters if they were already rendered as a group
    ungroupedParams.forEach((paramName) => {
      // Skip range editor parameters if they were already rendered as a group
      if (isRangeNode && rangeParams.includes(paramName)) {
        return;
      }
      
      const gridPos = metrics.parameterGridPositions.get(paramName);
      if (!gridPos) return;
      
      const paramSpec = spec.parameters[paramName];
      if (!paramSpec) return;
      
      const paramValue = node.parameters[paramName] ?? paramSpec.default;
      const isParamHovered = (hoveredPortName === paramName && isHoveredParameter) ?? false;
      const effectiveValue = effectiveParameterValues?.get(paramName) ?? null;
      const isConnected = connectedParameters?.has(paramName) ?? false;
      
      if (paramSpec.type === 'float' || paramSpec.type === 'int') {
        const renderer = this.parameterRegistry.getRenderer(spec, paramName);
        renderer.render(
          this.ctx,
          node,
          spec,
          paramName,
          gridPos,
          {
            isConnected,
            isHovered: isParamHovered,
            effectiveValue,
            skipPorts
          }
        );
      } else if (paramSpec.type === 'string') {
        this.renderStringParameter(gridPos.cellX, gridPos.cellY, gridPos.cellWidth, gridPos.cellHeight, paramName, paramSpec, paramValue as string, node.id);
      } else if (paramSpec.type === 'array') {
        this.renderFrequencyBandsParameter(gridPos.cellX, gridPos.cellY, gridPos.cellWidth, gridPos.cellHeight, paramName, paramSpec, paramValue, node.id);
      }
    });
  }
  
  /**
   * Render static node content to an offscreen canvas (for caching)
   * This renders the base structure without dynamic states (selection, hover, parameter values)
   */
  private renderStaticNodeContent(
    ctx: CanvasRenderingContext2D,
    node: NodeInstance,
    spec: NodeSpec,
    metrics: NodeRenderMetrics,
    width: number,
    height: number
  ): void {
    // Render at (0, 0) since this is an offscreen canvas
    const x = 0;
    const y = 0;
    const { headerHeight } = metrics;
    const borderRadius = getCSSVariableAsNumber('node-box-border-radius', 10);
    
    // Draw node background with gradient using category colors
    const bgColorStartToken = getNodeColorByCategory(spec.category);
    const bgColorStart = getCSSColor(bgColorStartToken, getCSSColor('category-color-default', getCSSColor('color-gray-100', '#747e87')));
    const bgColorEnd = this.getCategoryColorEnd(spec.category);
    
    // Get gradient ellipse parameters
    const ellipseWidthPercent = getCSSVariableAsNumber('node-bg-gradient-ellipse-width', 100);
    const ellipseHeightPercent = getCSSVariableAsNumber('node-bg-gradient-ellipse-height', 100);
    const ellipseXPercent = getCSSVariableAsNumber('node-bg-gradient-ellipse-x', 50);
    const ellipseYPercent = getCSSVariableAsNumber('node-bg-gradient-ellipse-y', 50);
    
    // Calculate ellipse dimensions and position
    const ellipseWidth = (width * ellipseWidthPercent) / 100;
    const ellipseHeight = (height * ellipseHeightPercent) / 100;
    const ellipseX = x + (width * ellipseXPercent) / 100;
    const ellipseY = y + (height * ellipseYPercent) / 100;
    
    // Use the larger dimension for the radial gradient radius
    const gradientRadius = Math.max(ellipseWidth, ellipseHeight) / 2;
    
    // Create radial gradient
    const gradient = ctx.createRadialGradient(
      ellipseX, ellipseY, 0,
      ellipseX, ellipseY, gradientRadius
    );
    gradient.addColorStop(0, bgColorStart);
    gradient.addColorStop(1, bgColorEnd);
    
    // Clip to rounded rectangle and fill with gradient
    ctx.save();
    this.drawRoundedRectOnContext(ctx, x, y, width, height, borderRadius);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
    
    // Draw default border (non-selected)
    const borderColor = getCSSColor('node-border', getCSSColor('color-gray-100', '#747e87'));
    const borderWidth = getCSSVariableAsNumber('node-border-width', 1);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    this.drawRoundedRectOnContext(ctx, x, y, width, height, borderRadius);
    ctx.stroke();
    
    // Render header (icon and name) - static version without hover states
    // Create a temporary header renderer with the offscreen canvas context
    if (this.headerRenderer) {
      // Create a temporary header renderer for the offscreen canvas
      const tempHeaderRenderer = new NodeHeaderRenderer(ctx);
      tempHeaderRenderer.render(
        node,
        spec,
        x,
        y,
        width,
        headerHeight,
        false, // isSelected = false for static cache
        null, // hoveredPortName = null
        null, // connectingPortName = null
        true, // skipPorts = true (ports are rendered separately)
        height
      );
    } else {
      // Fallback - render header directly with the offscreen context
      // We need to temporarily swap contexts for the old renderHeader method
      const oldCtx = this.ctx;
      this.ctx = ctx;
      try {
        this.renderHeader(
          node,
          spec,
          x,
          y,
          width,
          headerHeight,
          false,
          null,
          null,
          true,
          height
        );
      } finally {
        this.ctx = oldCtx;
      }
    }
  }
  
  /**
   * Helper to draw rounded rect on any context
   */
  private drawRoundedRectOnContext(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  renderNode(
    node: NodeInstance,
    spec: NodeSpec,
    metrics: NodeRenderMetrics,
    isSelected: boolean,
    hoveredPortName?: string | null,
    isHoveredParameter?: boolean,
    effectiveParameterValues?: Map<string, number | null>,
    connectingPortName?: string | null,
    isConnectingParameter?: boolean,
    connectedParameters?: Set<string>,
    skipPorts: boolean = false,
    audioRemapLiveValues?: { incoming: number | null; outgoing: number | null },
    audioAnalyzerBandLiveValues?: Map<number, { incoming: number | null; outgoing: number | null }>
  ): void {
    const { width, height, headerHeight } = metrics;
    const x = node.position.x;
    const y = node.position.y;
    
    const borderRadius = getCSSVariableAsNumber('node-box-border-radius', 10);
    
    // Try to use cached static content
    let useCached = false;
    if (this.useCache && this.nodeCache) {
      try {
        const cachedCanvas = this.nodeCache.getCachedNode(
          node,
          spec,
          metrics,
          (ctx, w, h) => this.renderStaticNodeContent(ctx, node, spec, metrics, w, h)
        );
        
        // Draw cached static content
        this.ctx.drawImage(cachedCanvas, x, y);
        useCached = true;
      } catch (error) {
        // Fall back to direct rendering if cache fails
        console.warn('Node cache error, falling back to direct rendering:', error);
        useCached = false;
      }
    }
    
    // If not using cache, render static content directly
    if (!useCached) {
      // Draw selection highlight (subtle background)
      if (isSelected) {
        const selectionColor = getCSSColorRGBA('node-bg-selected', { r: 4, g: 16, b: 51, a: 1 });
        this.ctx.fillStyle = `rgba(${selectionColor.r}, ${selectionColor.g}, ${selectionColor.b}, 0.1)`;
        this.drawRoundedRect(x, y, width, height, borderRadius);
        this.ctx.fill();
      }
      
      // Draw node background with gradient using category colors
      const bgColorStartToken = getNodeColorByCategory(spec.category);
      const bgColorStart = getCSSColor(bgColorStartToken, getCSSColor('category-color-default', getCSSColor('color-gray-100', '#747e87')));
      const bgColorEnd = this.getCategoryColorEnd(spec.category);
      
      // Get gradient ellipse parameters
      const ellipseWidthPercent = getCSSVariableAsNumber('node-bg-gradient-ellipse-width', 100);
      const ellipseHeightPercent = getCSSVariableAsNumber('node-bg-gradient-ellipse-height', 100);
      const ellipseXPercent = getCSSVariableAsNumber('node-bg-gradient-ellipse-x', 50);
      const ellipseYPercent = getCSSVariableAsNumber('node-bg-gradient-ellipse-y', 50);
      
      // Calculate ellipse dimensions and position
      const ellipseWidth = (width * ellipseWidthPercent) / 100;
      const ellipseHeight = (height * ellipseHeightPercent) / 100;
      const ellipseX = x + (width * ellipseXPercent) / 100;
      const ellipseY = y + (height * ellipseYPercent) / 100;
      
      // Use the larger dimension for the radial gradient radius to ensure it covers the entire node
      const gradientRadius = Math.max(ellipseWidth, ellipseHeight) / 2;
      
      // Create radial gradient
      const gradient = this.ctx.createRadialGradient(
        ellipseX, ellipseY, 0,
        ellipseX, ellipseY, gradientRadius
      );
      gradient.addColorStop(0, bgColorStart);
      gradient.addColorStop(1, bgColorEnd);
      
      // Clip to rounded rectangle and fill with gradient
      this.ctx.save();
      // Create clipping path for rounded rectangle
      this.drawRoundedRect(x, y, width, height, borderRadius);
      this.ctx.clip();
      // Fill with gradient (will be clipped to the rounded rectangle)
      this.ctx.fillStyle = gradient;
      // Fill the entire node area - clipping will handle rounded corners
      this.ctx.fillRect(x, y, width, height);
      this.ctx.restore();
      
      // Draw selection highlight (if selected) - bright overlay to make node brighter
      if (isSelected) {
        this.ctx.save();
        this.drawRoundedRect(x, y, width, height, borderRadius);
        this.ctx.clip();
        // Use a bright white overlay to make the node brighter when selected
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(x, y, width, height);
        this.ctx.restore();
      }
      
      // Draw border
      const borderColor = isSelected 
        ? getCSSColor('node-border-selected', getCSSColor('color-blue-90', '#6565dc'))
        : getCSSColor('node-border', getCSSColor('color-gray-100', '#747e87'));
      const baseBorderWidth = isSelected 
        ? getCSSVariableAsNumber('node-border-width-selected', 3)
        : getCSSVariableAsNumber('node-border-width', 1);
      
      // Get current zoom level from transform to make border width fixed regardless of zoom
      const transform = this.ctx.getTransform();
      const zoom = transform.a; // Horizontal scale component
      
      // For selected nodes: add offset and make border width fixed
      if (isSelected) {
        const borderOffset = getCSSVariableAsNumber('node-border-offset-selected', 2); // Offset in canvas units
        const fixedBorderWidth = baseBorderWidth / zoom; // Divide by zoom to make it fixed-size
        
        // Adjust position and size to offset border outward
        const offsetX = x - borderOffset / zoom;
        const offsetY = y - borderOffset / zoom;
        const offsetWidth = width + (borderOffset * 2) / zoom;
        const offsetHeight = height + (borderOffset * 2) / zoom;
        const offsetRadius = Math.max(0, borderRadius + borderOffset / zoom);
        
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = fixedBorderWidth;
        this.drawRoundedRect(offsetX, offsetY, offsetWidth, offsetHeight, offsetRadius);
        this.ctx.stroke();
      } else {
        // Non-selected border: keep original behavior
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = baseBorderWidth;
        this.drawRoundedRect(x, y, width, height, borderRadius);
        this.ctx.stroke();
      }
      
      // Render header (with icon, name, and optionally I/O ports)
      if (this.headerRenderer) {
        this.headerRenderer.render(
          node,
          spec,
          x,
          y,
          width,
          headerHeight,
          isSelected,
          hoveredPortName && !isHoveredParameter ? hoveredPortName : null,
          connectingPortName && !isConnectingParameter ? connectingPortName : null,
          skipPorts,
          height // Pass full node height for proper clipping
        );
      } else {
        // Fallback to old implementation
        this.renderHeader(
          node,
          spec,
          x,
          y,
          width,
          headerHeight,
          isSelected,
          hoveredPortName && !isHoveredParameter ? hoveredPortName : null,
          connectingPortName && !isConnectingParameter ? connectingPortName : null,
          skipPorts,
          height // Pass full node height for proper clipping
        );
      }
    } else {
      // Using cached content - render dynamic overlays on top
      
      // Draw selection highlight (if selected)
      if (isSelected) {
        // Use a bright white overlay to make the node brighter when selected
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.drawRoundedRect(x, y, width, height, borderRadius);
        this.ctx.fill();
        
        // Draw selected border
        const borderColor = getCSSColor('node-border-selected', getCSSColor('color-blue-90', '#6565dc'));
        const baseBorderWidth = getCSSVariableAsNumber('node-border-width-selected', 3);
        
        // Get current zoom level from transform to make border width fixed regardless of zoom
        const transform = this.ctx.getTransform();
        const zoom = transform.a; // Horizontal scale component
        
        const borderOffset = getCSSVariableAsNumber('node-border-offset-selected', 2); // Offset in canvas units
        const fixedBorderWidth = baseBorderWidth / zoom; // Divide by zoom to make it fixed-size
        
        // Adjust position and size to offset border outward
        const offsetX = x - borderOffset / zoom;
        const offsetY = y - borderOffset / zoom;
        const offsetWidth = width + (borderOffset * 2) / zoom;
        const offsetHeight = height + (borderOffset * 2) / zoom;
        const offsetRadius = Math.max(0, borderRadius + borderOffset / zoom);
        
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = fixedBorderWidth;
        this.drawRoundedRect(offsetX, offsetY, offsetWidth, offsetHeight, offsetRadius);
        this.ctx.stroke();
      }
      
      // Render header with hover states (if needed)
      if (this.headerRenderer && (hoveredPortName || connectingPortName)) {
        this.headerRenderer.render(
          node,
          spec,
          x,
          y,
          width,
          headerHeight,
          isSelected,
          hoveredPortName && !isHoveredParameter ? hoveredPortName : null,
          connectingPortName && !isConnectingParameter ? connectingPortName : null,
          skipPorts,
          height
        );
      }
    }
    
    // Always render parameters (they change frequently and can't be cached effectively)
    // Render parameter grid (if not collapsed)
    if (Object.keys(spec.parameters).length > 0) {
      // Use new layout system (always, migration complete)
      if (metrics.elementMetrics && this.layoutManager) {
        // Clip body rendering to node's rounded rectangle bounds.
        // IMPORTANT: Always restore the canvas state even if element rendering throws.
        const bodyClipPath = new Path2D();
        this.drawRoundedRectToPath(bodyClipPath, x, y, width, height, borderRadius);

        this.ctx.save();
        try {
          this.ctx.clip(bodyClipPath);

          // Use layout manager to render elements
          const hoveredAudioFileInputControl =
            spec.id === 'audio-file-input' && hoveredPortName && isHoveredParameter
              ? (hoveredPortName === 'filePath' ? 'upload' : hoveredPortName === 'autoPlay' ? 'toggle' : null)
              : null;

          this.layoutManager.render(
            node,
            spec,
            x,
            y + headerHeight,
            width,
            headerHeight,
            metrics,
            metrics.elementMetrics,
            {
              hoveredPortName: hoveredPortName && isHoveredParameter ? hoveredPortName : null,
              isHoveredParameter,
              connectingPortName: connectingPortName && isConnectingParameter ? connectingPortName : null,
              isConnectingParameter,
              connectedParameters,
              effectiveParameterValues,
              skipPorts,
              audioRemapLiveValues,
              audioAnalyzerBandLiveValues,
              hoveredAudioFileInputControl
            }
          );

          // Render string and array parameters that aren't handled by element renderers
          // TODO: Move this to element renderers or extract to shared utility
          this.renderStringAndArrayParameters(
            node,
            spec,
            metrics
          );
        } catch (error) {
          console.error('Error rendering with layout system:', error);
          // Log error but don't fall back to legacy (migration complete)
        } finally {
          this.ctx.restore();
        }
      } else {
        console.warn('Node metrics missing elementMetrics - layout system not initialized');
      }
    }
  }
  
  /**
   * Render string and array parameters that aren't handled by element renderers
   * This is a temporary solution until these are moved to element renderers
   */
  private renderStringAndArrayParameters(
    node: NodeInstance,
    spec: NodeSpec,
    metrics: NodeRenderMetrics
  ): void {
    // Find string and array parameters that have grid positions
    Object.keys(spec.parameters).forEach((paramName) => {
      const paramSpec = spec.parameters[paramName];
      if (!paramSpec) return;
      
      // Only handle string and array types
      if (paramSpec.type !== 'string' && paramSpec.type !== 'array') return;
      
      const gridPos = metrics.parameterGridPositions.get(paramName);
      if (!gridPos) return;
      
      const paramValue = node.parameters[paramName] ?? paramSpec.default;
      
      if (paramSpec.type === 'string') {
        this.renderStringParameter(
          gridPos.cellX,
          gridPos.cellY,
          gridPos.cellWidth,
          gridPos.cellHeight,
          paramName,
          paramSpec,
          paramValue as string,
          node.id
        );
      } else if (paramSpec.type === 'array') {
        this.renderFrequencyBandsParameter(
          gridPos.cellX,
          gridPos.cellY,
          gridPos.cellWidth,
          gridPos.cellHeight,
          paramName,
          paramSpec,
          paramValue,
          node.id
        );
      }
    });
  }
  
  /**
   * Render parameters using the layout system
   * @deprecated Use ParameterLayoutManager.render() instead
   */
  // @ts-expect-error - Deprecated method kept for reference, may be removed later
  private renderWithLayoutSystem(
    node: NodeInstance,
    spec: NodeSpec,
    _x: number,
    _y: number,
    _width: number,
    _headerHeight: number,
    metrics: NodeRenderMetrics,
    effectiveParameterValues?: Map<string, number | null>,
    hoveredPortName?: string | null,
    isHoveredParameter?: boolean,
    connectingPortName?: string | null,
    isConnectingParameter?: boolean,
    connectedParameters?: Set<string>,
    skipPorts: boolean = false
  ): void {
    if (!spec.parameterLayout || !metrics.elementMetrics) return;
    
    const layout = spec.parameterLayout;
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    
    // Track which parameters have been rendered by other elements
    const renderedParams = new Set<string>();
    
    // Range editor parameters (used by remap-range)
    const rangeParams = ['inMin', 'inMax', 'outMin', 'outMax'];
    
    // Iterate through layout elements and render them
    for (let i = 0; i < layout.elements.length; i++) {
      const element = layout.elements[i];
      // Generate stable key (same logic as ParameterLayoutManager)
      const elementKey = (() => {
        const type = (element as any).type || 'unknown';
        if (type === 'grid' && 'parameters' in element) {
          const params = (element as any).parameters || [];
          return `${type}-${i}-${params.join(',')}`;
        }
        return `${type}-${i}`;
      })();
      const elementMetrics = metrics.elementMetrics.get(elementKey);
      if (!elementMetrics) continue;
      
      if (element.type === 'remap-range') {
        // Render remap range (range editor)
        // elementMetrics positions are in absolute coordinates
        // Validate positions to prevent rendering artifacts
        if (!elementMetrics.x || !elementMetrics.y || !elementMetrics.width || !elementMetrics.height) {
          console.warn('Invalid remap-range element metrics, skipping render');
          continue;
        }
        
        // renderRangeEditor expects cellX/cellY (the container cell), and adds gridPadding internally
        // elementMetrics.x = node.position.x + gridPadding (slider UI left edge, which is cellX + gridPadding)
        // elementMetrics.y = node.position.y + headerHeight + startY (slider UI top edge, which is cellY + gridPadding)
        // So: cellX = elementMetrics.x - gridPadding, cellY = elementMetrics.y - gridPadding
        const cellX = elementMetrics.x - gridPadding;
        const cellY = elementMetrics.y - gridPadding;
        const cellWidth = elementMetrics.width + gridPadding * 2; // availableWidth + 2*gridPadding = full width
        const sliderUIHeight = elementMetrics.height;
        
        // Check if any range parameters are connected/hovered
        const isAnyConnected = rangeParams.some(p => connectedParameters?.has(p) ?? false);
        const isAnyHovered = rangeParams.some(p => hoveredPortName === p && isHoveredParameter);
        
        this.renderRangeEditor(
          node,
          spec,
          cellX,
          cellY,
          cellWidth,
          sliderUIHeight, // cellHeight - not really used but needed for signature
          isAnyConnected,
          isAnyHovered,
          skipPorts,
          hoveredPortName,
          isHoveredParameter,
          connectingPortName,
          isConnectingParameter,
          connectedParameters,
          effectiveParameterValues,
          true // useRemapRangeTokens — remap-range layout element uses remap-range-slider-input/output-color
        );
        
        // Mark range parameters as rendered (they're rendered by the slider UI, not individually)
        rangeParams.forEach(p => renderedParams.add(p));
      } else if (element.type === 'bezier-editor') {
        // Render bezier editor
        // elementMetrics.y is already in absolute coordinates
        // Validate positions to prevent rendering artifacts
        if (!elementMetrics.y || !elementMetrics.height) {
          console.warn('Invalid bezier-editor element metrics, skipping render');
          continue;
        }
        
        const bezierEditorX = (elementMetrics as any).bezierEditorX || elementMetrics.x;
        const bezierEditorY = elementMetrics.y; // Already absolute
        const bezierEditorWidth = (elementMetrics as any).bezierEditorWidth || elementMetrics.width;
        const bezierEditorHeight = elementMetrics.height;
        
        // Extract bezier-specific metrics
        const portX = (elementMetrics as any).portX || (node.position.x + gridPadding);
        const modeButtonX = (elementMetrics as any).modeButtonX || (portX + 20);
        const typeLabelX = (elementMetrics as any).typeLabelX || (modeButtonX + 30);
        const labelX = (elementMetrics as any).labelX || (typeLabelX + 50);
        
        // Get port Y positions from parameter grid positions
        const bezierParams = (element as any).parameters || ['x1', 'y1', 'x2', 'y2'];
        const portY: number[] = [];
        const modeButtonY: number[] = [];
        const typeLabelY: number[] = [];
        const labelY: number[] = [];
        
        bezierParams.forEach((paramName: string) => {
          const gridPos = metrics.parameterGridPositions.get(paramName);
          if (gridPos) {
            portY.push(gridPos.portY);
            modeButtonY.push(gridPos.portY);
            typeLabelY.push(gridPos.portY);
            labelY.push(gridPos.labelY);
          }
        });
        
        // Get hovered control point (if any)
        let hoveredControlPoint: number | null = null;
        // TODO: Get from hover state if needed
        
        this.renderBezierEditor(
          node,
          spec,
          bezierEditorX,
          bezierEditorY,
          bezierEditorWidth,
          bezierEditorHeight,
          portX,
          portY,
          modeButtonX,
          modeButtonY,
          typeLabelX,
          typeLabelY,
          labelX,
          labelY,
          connectedParameters,
          hoveredControlPoint,
          hoveredPortName && isHoveredParameter ? hoveredPortName : null,
          isHoveredParameter,
          skipPorts
        );
      } else if (element.type === 'grid' || element.type === 'auto-grid') {
        // Render grid parameters using metrics from layout system
        // Get parameters for this element
        const elementParams = element.type === 'grid' && 'parameters' in element 
          ? (element.parameters || [])
          : Object.keys(spec.parameters);
        
        // Render each parameter using positions from metrics
        // Skip parameters that were already rendered by other elements (e.g., remap-range)
        elementParams.forEach((paramName) => {
          // Skip if already rendered
          if (renderedParams.has(paramName)) return;
          
          const gridPos = metrics.parameterGridPositions.get(paramName);
          if (!gridPos) return;
          
          const paramSpec = spec.parameters[paramName];
          if (!paramSpec) return;
          
          const paramValue = node.parameters[paramName] ?? paramSpec.default;
          const isParamHovered = (hoveredPortName === paramName && isHoveredParameter) ?? false;
          const effectiveValue = effectiveParameterValues?.get(paramName) ?? null;
          const isConnected = connectedParameters?.has(paramName) ?? false;
          
          if (paramSpec.type === 'float' || paramSpec.type === 'int') {
            const renderer = this.parameterRegistry.getRenderer(spec, paramName);
            renderer.render(
              this.ctx,
              node,
              spec,
              paramName,
              gridPos,
              {
                isConnected,
                isHovered: isParamHovered,
                effectiveValue,
                skipPorts
              }
            );
          } else if (paramSpec.type === 'string') {
            this.renderStringParameter(
              gridPos.cellX,
              gridPos.cellY,
              gridPos.cellWidth,
              gridPos.cellHeight,
              paramName,
              paramSpec,
              paramValue as string,
              node.id
            );
          } else if (paramSpec.type === 'array') {
            this.renderFrequencyBandsParameter(
              gridPos.cellX,
              gridPos.cellY,
              gridPos.cellWidth,
              gridPos.cellHeight,
              paramName,
              paramSpec,
              paramValue,
              node.id
            );
          }
          
          // Mark as rendered
          renderedParams.add(paramName);
        });
      }
    }
  }
  
  // Render only the ports for a node (called after connections)
  renderNodePorts(
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
    // Use port renderer
    if (this.portRenderer) {
      this.portRenderer.render(
        node,
        spec,
        metrics,
        hoveredPortName,
        isHoveredParameter,
        connectingPortName,
        isConnectingParameter,
        connectedParameters,
        connectedHeaderPorts
      );
    }
  }
  
  // @ts-expect-error - Method kept for potential future use
  private renderParameter(
    x: number, y: number, width: number, height: number,
    paramName: string, paramSpec: import('../../types/nodeSpec').ParameterSpec, value: number,
    node: NodeInstance, metrics: NodeRenderMetrics,
    isHovered: boolean = false,
    effectiveValue: number | null = null
  ): void {
    const padding = 8;
    const portRadius = getCSSVariableAsNumber('port-radius', 4);
    const valueWidth = 50;
    const modeWidth = 20; // Reduced width to bring it closer
    
    // Parameter input port (left side, for float parameters only)
    const paramInputPortPos = metrics.parameterInputPortPositions.get(paramName);
    if (paramInputPortPos && paramSpec.type === 'float') {
      // Note: isConnecting for parameters is handled via isConnectingParameter
      const isConnecting = false; // Parameters don't use the connecting state from regular ports
      this.renderPort(paramInputPortPos.x, paramInputPortPos.y, 'float', isHovered, isConnecting, false);
    }
    
    // Parameter label (after port) — headline-md
    const labelX = paramInputPortPos ? paramInputPortPos.x + portRadius + 6 : x + padding;
    const paramLabelColor = getCSSColor('node-param-label-color', getCSSColor('color-gray-100', '#747e87'));
    const paramLabelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const paramLabelFontWeight = getCSSVariableAsNumber('param-label-font-weight', 600);
    this.ctx.fillStyle = paramLabelColor;
    this.ctx.font = `${paramLabelFontWeight} ${paramLabelFontSize}px "Space Grotesk", sans-serif`;
    this.ctx.textAlign = 'left';
    this.ctx.fillText(paramSpec.label || paramName, labelX, y + height / 2 + 4);
    
    // Value display (right side, draggable)
    const valueX = x + width - valueWidth - padding;
    
    // Mode selector (positioned right before value, very close - visually grouped with value) — button style
    const modeGap = 1; // Small gap to keep it visually distinct but close
    const modeX = valueX - modeWidth - modeGap;
    const inputMode = node.parameterInputModes?.[paramName] || paramSpec.inputMode || 'override';
    const modeSymbol = inputMode === 'override' ? '=' : inputMode === 'add' ? '+' : inputMode === 'subtract' ? '-' : '*';
    const modeColor = getCSSColor('node-param-label-color', getCSSColor('color-gray-100', '#747e87'));
    const modeButtonFontSize = getCSSVariableAsNumber('param-mode-button-font-size', 18);
    const modeButtonFontWeight = getCSSVariableAsNumber('param-mode-button-font-weight', 500);
    this.ctx.fillStyle = modeColor;
    this.ctx.font = `${modeButtonFontWeight} ${modeButtonFontSize}px "Space Grotesk", sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(modeSymbol, modeX + modeWidth / 2, y + height / 2 + 4);
    
    // Display value - show effective value if available, otherwise show config value — input style
    const displayValue = effectiveValue !== null ? effectiveValue : value;
    const isAnimated = effectiveValue !== null;
    const inputValueFontSize = getCSSVariableAsNumber('input-value-font-size', 18);
    const paramValueColor = isAnimated 
      ? getCSSColor('node-param-value-animated-color', getCSSColor('color-teal-90', '#2f8a6b'))
      : getCSSColor('node-param-value-color', getCSSColor('color-gray-130', '#ebeff0'));
    this.ctx.fillStyle = paramValueColor;
    this.ctx.font = `${inputValueFontSize}px "JetBrains Mono", monospace`;
    this.ctx.textAlign = 'right';
    const displayText = paramSpec.type === 'int' ? Math.round(displayValue).toString() : displayValue.toFixed(3);
    this.ctx.fillText(displayText, valueX + valueWidth, y + height / 2 + 4);
    this.ctx.textAlign = 'left';
  }
  

  // Render just the port circle (without highlight)
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
  
  // Render the hover highlight circle (larger transparent circle behind the port)
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
  
  // Render port with highlight (for backwards compatibility and non-header ports)
  private renderPort(x: number, y: number, type: string, isHovered: boolean = false, isConnecting: boolean = false, isConnected: boolean = false, scale: number = 1.0, opacity: number = 1.0): void {
    // Draw highlight first (behind)
    this.renderPortHighlight(x, y, isHovered, isConnecting, scale, opacity);
    // Draw port circle on top
    this.renderPortCircle(x, y, type, isHovered, isConnecting, isConnected, scale, opacity);
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
  
  private drawRoundedRectToPath(path: Path2D, x: number, y: number, width: number, height: number, radius: number): void {
    path.moveTo(x + radius, y);
    path.lineTo(x + width - radius, y);
    path.quadraticCurveTo(x + width, y, x + width, y + radius);
    path.lineTo(x + width, y + height - radius);
    path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    path.lineTo(x + radius, y + height);
    path.quadraticCurveTo(x, y + height, x, y + height - radius);
    path.lineTo(x, y + radius);
    path.quadraticCurveTo(x, y, x + radius, y);
    path.closePath();
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
  
  /**
   * Render a string parameter (wrapper for renderStringParameter utility)
   */
  private renderStringParameter(
    x: number,
    y: number,
    width: number,
    height: number,
    paramName: string,
    paramSpec: import('../../types/nodeSpec').ParameterSpec,
    value: string,
    _nodeId: string
  ): void {
    renderStringParameter(this.ctx, x, y, width, height, paramName, paramSpec, value);
  }
  
  /**
   * Render a frequency bands parameter (wrapper for renderArrayParameter utility)
   */
  private renderFrequencyBandsParameter(
    x: number,
    y: number,
    width: number,
    height: number,
    paramName: string,
    paramSpec: import('../../types/nodeSpec').ParameterSpec,
    value: any,
    _nodeId: string
  ): void {
    renderArrayParameter(this.ctx, x, y, width, height, paramName, paramSpec, value);
  }
}

