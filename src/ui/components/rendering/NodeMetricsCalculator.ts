/**
 * Node Metrics Calculator
 * 
 * Calculates layout metrics for nodes including dimensions, header height,
 * parameter grid positions, and port positions.
 * Includes caching to avoid recalculating metrics unnecessarily.
 */

import type { NodeInstance } from '../../../types/nodeGraph';
import type { NodeSpec, ParameterSpec } from '../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../NodeRenderer';
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { ParameterLayoutManager } from './layout/ParameterLayoutManager';
import type { ElementMetrics } from './layout/LayoutElementRenderer';
import { HeaderFlexboxLayout } from './HeaderFlexboxLayout';
import { autoGenerateLayout } from '../../../utils/layoutMigration';

/**
 * Check if a parameter change affects layout
 * Returns true if the change requires metrics recalculation
 */
export function isLayoutAffectingChange(
  _paramName: string,
  _paramSpec: ParameterSpec,
  oldValue: any,
  newValue: any
): boolean {
  // Parameter type changes affect layout
  if (typeof oldValue !== typeof newValue) {
    return true;
  }
  
  // Array length changes affect layout
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    if (oldValue.length !== newValue.length) {
      return true;
    }
    // Array type changes (e.g., number[] vs number[][]) affect layout
    if (oldValue.length > 0 && newValue.length > 0) {
      const oldIsNested = Array.isArray(oldValue[0]);
      const newIsNested = Array.isArray(newValue[0]);
      if (oldIsNested !== newIsNested) {
        return true;
      }
    }
  }
  
  // Parameter existence changes (added/removed) affect layout
  const oldExists = oldValue !== undefined && oldValue !== null;
  const newExists = newValue !== undefined && newValue !== null;
  if (oldExists !== newExists) {
    return true;
  }
  
  // For most parameters (float, int, string, vec4), value changes don't affect layout
  // Only structure changes (adding/removing parameters, type changes, array length) affect layout
  return false;
}

export class NodeMetricsCalculator {
  private cache: Map<string, NodeRenderMetrics> = new Map();
  private ctx: CanvasRenderingContext2D;
  private layoutManager: ParameterLayoutManager;
  private headerLayout: HeaderFlexboxLayout;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.layoutManager = new ParameterLayoutManager(ctx);
    this.headerLayout = new HeaderFlexboxLayout(ctx);
  }
  
  /**
   * Calculate metrics for a node (with caching)
   */
  calculate(node: NodeInstance, spec: NodeSpec): NodeRenderMetrics {
    const cacheKey = this.getCacheKey(node, spec);
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    // Calculate metrics
    const metrics = this.calculateMetrics(node, spec);
    
    // Cache result
    this.cache.set(cacheKey, metrics);
    
    return metrics;
  }
  
  /**
   * Check if a parameter affects node layout/size
   * Layout-affecting: parameter count, parameter types, layout mode, array length, etc.
   * Value-only: slider values, numeric values that don't change structure
   */
  private isLayoutAffectingParameter(
    paramName: string,
    paramSpec: ParameterSpec,
    node: NodeInstance,
    _spec: NodeSpec
  ): boolean {
    // Parameters that affect layout:
    // - Array length changes (affect layout size)
    // - Parameter type changes (different types have different UI elements)
    // - Parameter existence (adding/removing parameters)
    
    // Array parameters: length affects layout
    if (paramSpec.type === 'array') {
      const value = node.parameters[paramName];
      if (Array.isArray(value)) {
        // Array length affects layout - include in cache key
        return true;
      }
    }
    
    // Complex types that affect layout size
    if (paramSpec.type === 'vec4') {
      // Vec4 parameters might have special UI that affects layout
      return true;
    }
    
    // For most parameters (float, int, string), value changes don't affect layout
    // Only structure changes (adding/removing parameters, type changes) affect layout
    return false;
  }
  
  /**
   * Get layout-affecting parameters only (for cache key)
   * Returns a simplified representation that excludes value-only parameters
   */
  private getLayoutAffectingParameters(
    node: NodeInstance,
    spec: NodeSpec
  ): Record<string, any> {
    const layoutParams: Record<string, any> = {};
    
    // Include parameter structure (which parameters exist, their types, array lengths)
    // but not their values for simple types
    for (const [paramName, paramSpec] of Object.entries(spec.parameters)) {
      if (this.isLayoutAffectingParameter(paramName, paramSpec, node, spec)) {
        // Include parameter value if it affects layout (e.g., array length)
        layoutParams[paramName] = node.parameters[paramName];
      } else {
        // For value-only parameters, just mark that they exist (for cache key)
        // This allows cache hits when only values change
        layoutParams[paramName] = node.parameters.hasOwnProperty(paramName) ? '__exists__' : undefined;
      }
    }
    
    // Include parameter count (affects layout)
    layoutParams.__paramCount__ = Object.keys(node.parameters).length;
    
    // Include parameter structure hash (to detect parameter additions/removals)
    const paramNames = Object.keys(node.parameters).sort().join(',');
    layoutParams.__paramStructure__ = paramNames;
    
    return layoutParams;
  }
  
  /**
   * Generate cache key for a node (optimized - excludes value-only parameters)
   */
  private getCacheKey(node: NodeInstance, spec: NodeSpec): string {
    // Include position so we never serve metrics computed for a different position.
    // Returned metrics include absolute coords (parameterGridPositions, portPositions);
    // height/width are position-independent, but we key by position to avoid any
    // "bottom edge attached" bugs from stale cache or missed invalidation.
    const layoutParams = this.getLayoutAffectingParameters(node, spec);
    const paramsKey = JSON.stringify(layoutParams);
    const posKey = `${node.position.x},${node.position.y}`;

    return `${node.id}-${node.label || ''}-${paramsKey}-${spec.id}-${posKey}`;
  }
  
  /**
   * Invalidate cache for a specific node
   */
  invalidate(nodeId: string): void {
    // Remove all cache entries for this node
    for (const [key] of this.cache) {
      if (key.startsWith(`${nodeId}-`)) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Clear all cached metrics
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Calculate metrics for a node (actual implementation)
   */
  private calculateMetrics(node: NodeInstance, spec: NodeSpec): NodeRenderMetrics {
    const minWidth = getCSSVariableAsNumber('node-box-min-width', 300);
    const nameSize = getCSSVariableAsNumber('node-header-name-size', 30);
    
    // Calculate total width first (needed for header layout)
    this.ctx.font = `${getCSSVariableAsNumber('node-header-name-weight', 600)} ${nameSize}px "Space Grotesk", sans-serif`;
    const titleWidth = this.ctx.measureText(node.label || spec.displayName).width;
    let width = Math.max(minWidth, titleWidth + 100);
    
    // Organize parameters by groups (needed for width calculation)
    const { groupedParams, ungroupedParams } = this.organizeParametersByGroups(spec);
    
    // Adjust width if needed for parameter grid (or bezier). Color-picker-only nodes use min-width only; swatch fills width.
    const isBezierNode = this.isBezierCurveNode(spec);
    const layout = spec.parameterLayout || autoGenerateLayout(spec);
    const isColorPickerOnly =
      layout.elements?.length === 1 &&
      (layout.elements[0] as { type?: string }).type === 'color-picker';

    if (Object.keys(spec.parameters).length > 0 && !isColorPickerOnly) {
      const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
      
      if (isBezierNode) {
        // For bezier nodes, calculate width needed for bezier editor
        const portSize = getCSSVariableAsNumber('param-port-size', 6);
        const portToModeSpacing = 8;
        const modeButtonSize = getCSSVariableAsNumber('param-mode-button-size', 24);
        const modeToLabelSpacing = 8;
        const labelWidth = 60; // Approximate label width
        const bezierEditorMinWidth = 250; // Minimum width for bezier editor
        
        const leftEdgeWidth = gridPadding + portSize + portToModeSpacing + modeButtonSize + modeToLabelSpacing + labelWidth;
        const minBezierWidth = leftEdgeWidth + bezierEditorMinWidth + gridPadding;
        width = Math.max(width, minBezierWidth);
      } else {
        const gridGap = getCSSVariableAsNumber('param-grid-gap', 12);
        const cellMinWidth = getCSSVariableAsNumber('param-cell-min-width', 120);
        
        // Check all groups to find max columns needed
        let maxColumns = 1;
        [...groupedParams, { parameters: ungroupedParams }].forEach((group) => {
          if (group.parameters.length > 0) {
            const cols = this.calculateOptimalColumns(group.parameters.length);
            maxColumns = Math.max(maxColumns, cols);
          }
        });
        
        // Apply extraColumns from layout (e.g. audio-analyzer needs one column wider)
        const extraColumns = layout.extraColumns ?? 0;
        const effectiveColumns = maxColumns + Math.max(0, extraColumns);
        
        // Calculate minimum width needed for grid (dedicated width by columns, rest fills)
        const minGridWidth = gridPadding * 2 + (effectiveColumns * cellMinWidth) + ((effectiveColumns - 1) * gridGap);
        width = Math.max(width, minGridWidth);
      }
    }
    
    // 1. Calculate header layout using flexbox
    const headerLayout = this.headerLayout.calculateLayout(
      node.position.x,
      node.position.y,
      width,
      spec,
      node
    );
    
    const actualHeaderHeight = headerLayout.container.height;
    
    // 2. Calculate body layout (only if node is not collapsed)
    // BodyFlexboxLayout is integrated into ParameterLayoutManager
    let paramsHeight = 0;
    const parameterGridPositions = new Map<string, {
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
    }>();
    let elementMetrics: Map<string, ElementMetrics> | undefined = undefined;
    
    if (Object.keys(spec.parameters).length > 0) {
      // Auto-generate layout if missing (migration support)
      const layout = spec.parameterLayout || autoGenerateLayout(spec);
      
      // Use new layout system (always, no legacy fallback)
      const layoutResult = this.layoutManager.calculateMetrics(
        node,
        { ...spec, parameterLayout: layout },
        node.position.x,
        node.position.y,
        width,
        actualHeaderHeight,
        {
          width,
          headerHeight: actualHeaderHeight,
          portPositions: headerLayout.portPositions,
          parameterGridPositions: new Map(),
          parameterPositions: new Map(),
          parameterInputPortPositions: new Map()
        }
      );
      
      // Merge parameter positions from layout
      layoutResult.parameterGridPositions.forEach((pos, paramName) => {
        parameterGridPositions.set(paramName, pos);
      });
      
      paramsHeight = layoutResult.totalHeight;
      elementMetrics = layoutResult.elementMetrics;
    }
    
    // Calculate total height
    const totalHeight = actualHeaderHeight + paramsHeight;
    
    // Keep old parameter positions for compatibility
    const parameterPositions = new Map<string, { x: number; y: number; width: number; height: number }>();
    const parameterInputPortPositions = new Map<string, { x: number; y: number }>();
    
    // Populate old format from new format for compatibility
    parameterGridPositions.forEach((pos, paramName) => {
      parameterPositions.set(paramName, {
        x: pos.cellX,
        y: pos.cellY,
        width: pos.cellWidth,
        height: pos.cellHeight
      });
      
      const paramSpec = spec.parameters[paramName];
      if (paramSpec && paramSpec.type === 'float') {
        if (spec.parameterLayout?.parametersWithoutPorts?.includes(paramName)) {
          // Skip: this parameter has no port
        } else {
          parameterInputPortPositions.set(paramName, {
            x: pos.portX,
            y: pos.portY
          });
        }
      }
    });
    
    return {
      width,
      height: totalHeight,
      headerHeight: actualHeaderHeight,
      portPositions: headerLayout.portPositions,
      parameterGridPositions,
      parameterPositions,
      parameterInputPortPositions,
      elementMetrics
    };
  }
  
  // Check if a node is a bezier curve node (has x1, y1, x2, y2 parameters)
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

  // isRangeEditorNode kept for potential future use but not currently used
  // private isRangeEditorNode(spec: NodeSpec, paramNames: string[]): boolean {
  //   return paramNames.includes('inMin') && paramNames.includes('inMax') &&
  //          paramNames.includes('outMin') && paramNames.includes('outMax') &&
  //          spec.parameters.inMin?.type === 'float' &&
  //          spec.parameters.inMax?.type === 'float' &&
  //          spec.parameters.outMin?.type === 'float' &&
  //          spec.parameters.outMax?.type === 'float';
  // }

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
    let bestColumns = 2;
    let bestEmptyCells = Infinity;
    
    for (let cols = 2; cols <= 4; cols++) {
      const rows = Math.ceil(paramCount / cols);
      const emptyCells = (rows * cols) - paramCount;
      if (emptyCells < bestEmptyCells) {
        bestEmptyCells = emptyCells;
        bestColumns = cols;
      }
    }
    
    return bestColumns;
  }
}
