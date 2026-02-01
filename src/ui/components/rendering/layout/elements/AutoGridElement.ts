/**
 * Auto Grid Element Renderer
 * 
 * Automatically generates a grid from all node parameters.
 * Respects parameterGroups if defined.
 */

import type { NodeInstance } from '../../../../../types/nodeGraph';
import type { NodeSpec, AutoGridElement as AutoGridElementType } from '../../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../../NodeRenderer';
import type { LayoutElementRenderer, ElementMetrics } from '../LayoutElementRenderer';
import { getCSSColor, getCSSVariableAsNumber } from '../../../../../utils/cssTokens';
import { getParameterUIRegistry } from '../../ParameterUIRegistry';
import { FlexboxLayoutEngine } from '../flexbox/FlexboxLayoutEngine';
import type { FlexItem } from '../flexbox/FlexboxTypes';
import { renderStringParameter, renderArrayParameter } from '../../../../utils/stringArrayRendering';

export class AutoGridElementRenderer implements LayoutElementRenderer {
  private ctx: CanvasRenderingContext2D;
  private parameterRegistry = getParameterUIRegistry();
  private flexboxEngine: FlexboxLayoutEngine;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.flexboxEngine = new FlexboxLayoutEngine();
  }
  
  canHandle(element: any): boolean {
    return element.type === 'auto-grid';
  }
  
  calculateMetrics(
    _element: AutoGridElementType,
    node: NodeInstance,
    spec: NodeSpec,
    availableWidth: number,
    startY: number,
    metrics: NodeRenderMetrics
  ): ElementMetrics {
    const gridGap = getCSSVariableAsNumber('param-grid-gap', 12);
    const cellMinWidth = getCSSVariableAsNumber('param-cell-min-width', 220);
    const groupHeaderHeight = getCSSVariableAsNumber('param-group-header-height', 24);
    const groupHeaderMarginTop = getCSSVariableAsNumber('param-group-header-margin-top', 0);
    const groupHeaderMarginBottom = getCSSVariableAsNumber('param-group-header-margin-bottom', 0);
    const groupDividerHeight = getCSSVariableAsNumber('param-group-divider-height', 1);
    const groupDividerSpacing = getCSSVariableAsNumber('param-group-divider-spacing', 12);
    const bodyTopPadding = getCSSVariableAsNumber('param-body-top-padding', 24);
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    
    // Calculate content-based cell height (same for all cells)
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const extraSpacing = getCSSVariableAsNumber('param-label-knob-spacing', 20);
    const knobSize = getCSSVariableAsNumber('knob-size', 45);
    const valueSpacing = getCSSVariableAsNumber('knob-value-spacing', 4);
    const valueHeight = labelFontSize; // Approximate value height
    const cellHeight = labelFontSize + extraSpacing + knobSize + valueSpacing + valueHeight + cellPadding * 2;
    
    // Organize parameters by groups
    const { groupedParams, ungroupedParams } = this.organizeParametersByGroups(spec);
    
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
    
    const gridX = node.position.x + gridPadding;
    const gridY = node.position.y + metrics.headerHeight + startY;
    let currentY = 0; // Relative to gridY
    
    // Add top padding only when we have groups and the first group has a label.
    // When there are no groups, BodyFlexboxLayout already applies body padding above
    // this slot, so adding param-body-top-padding would double-count (e.g. OKLCH node).
    const firstGroupHasLabel = groupedParams.length > 0 && groupedParams[0].label && groupedParams[0].parameters.length > 0;
    if (groupedParams.length > 0 && !firstGroupHasLabel) {
      currentY += bodyTopPadding;
    }
    
    // Process grouped parameters
    groupedParams.forEach((group, groupIndex) => {
      if (group.parameters.length === 0) return;
      
      // Add divider before group (except first group)
      if (groupIndex > 0) {
        currentY += groupDividerSpacing;
        currentY += groupDividerHeight;
        currentY += groupDividerSpacing;
      }
      
      // Add group header
      if (group.label) {
        currentY += groupHeaderMarginTop;
        currentY += groupHeaderHeight;
        currentY += groupHeaderMarginBottom;
      }
      
      // Create flex items for each parameter cell
      const cellItems: FlexItem[] = group.parameters.map((_paramName, index) => {
        return {
          id: `cell-${index}`,
          properties: {
            width: cellMinWidth, // Will be adjusted by flexbox
            height: cellHeight,
            minWidth: cellMinWidth,
            flexShrink: 1,
            flexGrow: 0
          }
        };
      });
      
      // Use FlexboxLayoutEngine to calculate grid layout for this group
      const groupGridLayout = this.flexboxEngine.calculateLayout(
        gridX,
        gridY + currentY,
        availableWidth,
        undefined, // content-based height
        {
          direction: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: gridGap
        },
        cellItems
      );
      
      // Extract cell layouts and normalize row heights
      const cellLayouts = new Map<string, { x: number; y: number; width: number; height: number }>();
      group.parameters.forEach((_paramName, index) => {
        const cellResult = groupGridLayout.items.get(`cell-${index}`);
        if (cellResult && 'x' in cellResult) {
          cellLayouts.set(`cell-${index}`, cellResult);
        }
      });
      
      // Normalize row heights
      this.normalizeRowHeights(cellLayouts, gridGap);
      
      // Calculate parameter positions from normalized cell layouts
      group.parameters.forEach((paramName, index) => {
        const cellLayout = cellLayouts.get(`cell-${index}`);
        if (!cellLayout) return;
        
        const cellX = cellLayout.x;
        const cellY = cellLayout.y;
        const cellWidth = cellLayout.width;
        const cellHeightNormalized = cellLayout.height;
        
        // Calculate internal element positions (absolute within cell)
        const portX = cellX + cellPadding;
        const labelY = cellY + cellPadding;
        const portY = labelY + labelFontSize / 2;
        const labelX = cellX + cellWidth / 2;
        const knobX = cellX + cellWidth / 2;
        const contentY = cellY + cellPadding;
        const labelBottom = contentY + labelFontSize;
        const knobY = labelBottom + extraSpacing + knobSize / 2;
        const valueX = knobX;
        const valueY = knobY + knobSize / 2 + valueSpacing;
        
        parameterGridPositions.set(paramName, {
          cellX,
          cellY,
          cellWidth,
          cellHeight: cellHeightNormalized,
          knobX,
          knobY,
          portX,
          portY,
          labelX,
          labelY,
          valueX,
          valueY
        });
      });
      
      // Update currentY based on grid layout height.
      //
      // IMPORTANT: Height must be independent of absolute canvas/world coordinates.
      // Using an accumulator initialized to 0 would anchor to world-origin and make
      // the computed height depend on node.position.y when dragged into negative Y.
      // Fix: compute max bottom edge relative to this element's origin (gridY).
      let maxBottom = gridY + currentY;
      for (const cell of cellLayouts.values()) {
        maxBottom = Math.max(maxBottom, cell.y + cell.height);
      }
      currentY = Math.max(0, maxBottom - gridY);
    });
    
    // Add divider before ungrouped params if there are groups
    if (groupedParams.length > 0 && ungroupedParams.length > 0) {
      currentY += groupDividerSpacing;
      currentY += groupDividerHeight;
      currentY += groupDividerSpacing;
    }
    
    // Process ungrouped parameters
    if (ungroupedParams.length > 0) {
      // Create flex items for each parameter cell
      const cellItems: FlexItem[] = ungroupedParams.map((_paramName, index) => {
        return {
          id: `cell-${index}`,
          properties: {
            width: cellMinWidth,
            height: cellHeight,
            minWidth: cellMinWidth,
            flexShrink: 1,
            flexGrow: 0
          }
        };
      });
      
      // Use FlexboxLayoutEngine to calculate grid layout
      const ungroupedGridLayout = this.flexboxEngine.calculateLayout(
        gridX,
        gridY + currentY,
        availableWidth,
        undefined, // content-based height
        {
          direction: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: gridGap
        },
        cellItems
      );
      
      // Extract cell layouts and normalize row heights
      const cellLayouts = new Map<string, { x: number; y: number; width: number; height: number }>();
      ungroupedParams.forEach((_paramName, index) => {
        const cellResult = ungroupedGridLayout.items.get(`cell-${index}`);
        if (cellResult && 'x' in cellResult) {
          cellLayouts.set(`cell-${index}`, cellResult);
        }
      });
      
      // Normalize row heights
      this.normalizeRowHeights(cellLayouts, gridGap);
      
      // Calculate parameter positions from normalized cell layouts
      ungroupedParams.forEach((paramName, index) => {
        const cellLayout = cellLayouts.get(`cell-${index}`);
        if (!cellLayout) return;
        
        const cellX = cellLayout.x;
        const cellY = cellLayout.y;
        const cellWidth = cellLayout.width;
        const cellHeightNormalized = cellLayout.height;
        
        // Calculate internal element positions (absolute within cell)
        const portX = cellX + cellPadding;
        const labelY = cellY + cellPadding;
        const portY = labelY + labelFontSize / 2;
        const labelX = cellX + cellWidth / 2;
        const knobX = cellX + cellWidth / 2;
        const contentY = cellY + cellPadding;
        const labelBottom = contentY + labelFontSize;
        const knobY = labelBottom + extraSpacing + knobSize / 2;
        const valueX = knobX;
        const valueY = knobY + knobSize / 2 + valueSpacing;
        
        parameterGridPositions.set(paramName, {
          cellX,
          cellY,
          cellWidth,
          cellHeight: cellHeightNormalized,
          knobX,
          knobY,
          portX,
          portY,
          labelX,
          labelY,
          valueX,
          valueY
        });
      });
      
      // Update currentY based on grid layout height.
      //
      // IMPORTANT: Height must be independent of absolute canvas/world coordinates.
      // Fix: compute max bottom edge relative to this element's origin (gridY).
      let maxBottom = gridY + currentY;
      for (const cell of cellLayouts.values()) {
        maxBottom = Math.max(maxBottom, cell.y + cell.height);
      }
      currentY = Math.max(0, maxBottom - gridY);
    }
    
    return {
      x: node.position.x,
      y: node.position.y + metrics.headerHeight + startY,
      width: availableWidth,
      height: currentY,
      parameterGridPositions
    };
  }
  
  render(
    _element: AutoGridElementType,
    node: NodeInstance,
    spec: NodeSpec,
    elementMetrics: ElementMetrics,
    _nodeMetrics: NodeRenderMetrics,
    renderState: {
      hoveredPortName?: string | null;
      isHoveredParameter?: boolean;
      connectingPortName?: string | null;
      isConnectingParameter?: boolean;
      connectedParameters?: Set<string>;
      effectiveParameterValues?: Map<string, number | null>;
      skipPorts?: boolean;
    }
  ): void {
    const parameterGridPositions = elementMetrics.parameterGridPositions;
    if (!parameterGridPositions) return;

    // Render group headers/dividers (the layout metrics reserve space for these).
    // Without drawing them, grouped layouts look like "missing headings".
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    const groupHeaderHeight = getCSSVariableAsNumber('param-group-header-height', 24);
    const groupHeaderFontSize = getCSSVariableAsNumber('param-group-header-font-size', 24);
    const groupHeaderFontWeight = getCSSVariableAsNumber('param-group-header-weight', 600);
    const groupHeaderColor = getCSSColor('param-group-header-color', getCSSColor('color-gray-110', '#a3aeb5'));
    const groupHeaderMarginTop = getCSSVariableAsNumber('param-group-header-margin-top', 0);
    const groupHeaderMarginBottom = getCSSVariableAsNumber('param-group-header-margin-bottom', 0);
    const groupDividerHeight = getCSSVariableAsNumber('param-group-divider-height', 1);
    const groupDividerColor = getCSSColor('param-group-divider-color', getCSSColor('color-gray-70', '#282b31'));
    const groupDividerSpacing = getCSSVariableAsNumber('param-group-divider-spacing', 12);
    const bodyTopPadding = getCSSVariableAsNumber('param-body-top-padding', 24);

    const gridX = node.position.x + gridPadding;
    const gridY = elementMetrics.y;
    let currentY = 0; // relative to gridY

    const { groupedParams, ungroupedParams } = this.organizeParametersByGroups(spec);

    // Keep in sync with calculateMetrics(): only add top padding when groups exist
    // and the first group has no label.
    const firstGroupHasLabel =
      groupedParams.length > 0 && !!groupedParams[0].label && groupedParams[0].parameters.length > 0;
    if (groupedParams.length > 0 && !firstGroupHasLabel) {
      currentY += bodyTopPadding;
    }

    const prevTextAlign = this.ctx.textAlign;
    const prevTextBaseline = this.ctx.textBaseline;
    const prevFillStyle = this.ctx.fillStyle;
    const prevStrokeStyle = this.ctx.strokeStyle;
    const prevLineWidth = this.ctx.lineWidth;
    const prevFont = this.ctx.font;

    try {
      groupedParams.forEach((group, groupIndex) => {
        if (group.parameters.length === 0) return;

        // Divider before group (except first group)
        if (groupIndex > 0) {
          currentY += groupDividerSpacing;
          const dividerY = gridY + currentY + groupDividerHeight / 2;
          this.ctx.strokeStyle = groupDividerColor;
          this.ctx.lineWidth = groupDividerHeight;
          this.ctx.beginPath();
          this.ctx.moveTo(gridX, dividerY);
          // Use element width (availableWidth) indirectly via elementMetrics.width
          this.ctx.lineTo(gridX + elementMetrics.width, dividerY);
          this.ctx.stroke();
          currentY += groupDividerHeight;
          currentY += groupDividerSpacing;
        }

        // Group header
        if (group.label) {
          currentY += groupHeaderMarginTop;
          this.ctx.fillStyle = groupHeaderColor;
          this.ctx.font = `${groupHeaderFontWeight} ${groupHeaderFontSize}px "Space Grotesk", sans-serif`;
          this.ctx.textAlign = 'left';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(group.label, gridX, gridY + currentY + groupHeaderHeight / 2);
          currentY += groupHeaderHeight;
          currentY += groupHeaderMarginBottom;
        }

        // Do not advance currentY for the group grid here.
        // The parameter cells are rendered based on precomputed positions from metrics.
        // This header/divider pass is purely visual and must stay consistent with calculateMetrics().
      });

      // Divider before ungrouped params if there are groups
      if (groupedParams.length > 0 && ungroupedParams.length > 0) {
        currentY += groupDividerSpacing;
        const dividerY = gridY + currentY + groupDividerHeight / 2;
        this.ctx.strokeStyle = groupDividerColor;
        this.ctx.lineWidth = groupDividerHeight;
        this.ctx.beginPath();
        this.ctx.moveTo(gridX, dividerY);
        this.ctx.lineTo(gridX + elementMetrics.width, dividerY);
        this.ctx.stroke();
        currentY += groupDividerHeight;
        currentY += groupDividerSpacing;
      }
    } finally {
      this.ctx.textAlign = prevTextAlign;
      this.ctx.textBaseline = prevTextBaseline;
      this.ctx.fillStyle = prevFillStyle;
      this.ctx.strokeStyle = prevStrokeStyle;
      this.ctx.lineWidth = prevLineWidth;
      this.ctx.font = prevFont;
    }
    
    // Get all parameters (auto-grid includes all)
    const allParams = Object.keys(spec.parameters);
    
    // Render each parameter using positions from metrics
    allParams.forEach((paramName) => {
      const gridPos = parameterGridPositions.get(paramName);
      if (!gridPos) return;
      
      const paramSpec = spec.parameters[paramName];
      if (!paramSpec) return;
      
      const isParamHovered = (renderState.hoveredPortName === paramName && renderState.isHoveredParameter) ?? false;
      const effectiveValue = renderState.effectiveParameterValues?.get(paramName) ?? null;
      const isConnected = renderState.connectedParameters?.has(paramName) ?? false;
      
      if (paramSpec.type === 'float' || paramSpec.type === 'int') {
        // Use parameter registry for float/int parameters
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
            skipPorts: renderState.skipPorts ?? false
          }
        );
      } else if (paramSpec.type === 'string') {
        // Render string parameter using shared utility
        const paramValue = node.parameters[paramName] ?? paramSpec.default;
        renderStringParameter(
          this.ctx,
          gridPos.cellX,
          gridPos.cellY,
          gridPos.cellWidth,
          gridPos.cellHeight,
          paramName,
          paramSpec,
          paramValue as string
        );
      } else if (paramSpec.type === 'array') {
        // Render array parameter using shared utility
        const paramValue = node.parameters[paramName] ?? paramSpec.default;
        renderArrayParameter(
          this.ctx,
          gridPos.cellX,
          gridPos.cellY,
          gridPos.cellWidth,
          gridPos.cellHeight,
          paramName,
          paramSpec,
          paramValue
        );
      }
    });
  }
  
  private organizeParametersByGroups(spec: NodeSpec): {
    groupedParams: Array<{ label: string | null; parameters: string[] }>;
    ungroupedParams: string[];
  } {
    const allParamNames = new Set(Object.keys(spec.parameters));
    const groupedParamNames = new Set<string>();
    const groupedParams: Array<{ label: string | null; parameters: string[] }> = [];
    
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
    
    const ungroupedParams = Array.from(allParamNames).filter(name => !groupedParamNames.has(name));
    
    return { groupedParams, ungroupedParams };
  }
  
  /**
   * Normalize row heights - all cells in the same row should have equal height
   */
  private normalizeRowHeights(
    cellLayouts: Map<string, { x: number; y: number; width: number; height: number }>,
    _gridGap: number
  ): void {
    // Group cells by row (based on Y position, with tolerance for floating point)
    const rows = new Map<number, Array<{ id: string; height: number }>>();
    const tolerance = 1; // 1px tolerance for row grouping
    
    for (const [id, cell] of cellLayouts) {
      // Find existing row with similar Y position
      let foundRow = false;
      for (const [rowY] of rows) {
        if (Math.abs(cell.y - rowY) < tolerance) {
          rows.get(rowY)!.push({ id, height: cell.height });
          foundRow = true;
          break;
        }
      }
      
      if (!foundRow) {
        rows.set(cell.y, [{ id, height: cell.height }]);
      }
    }
    
    // For each row, find tallest cell and set all cells to that height
    rows.forEach((cells) => {
      const maxHeight = Math.max(...cells.map(c => c.height));
      
      // Update all cells in row to max height
      cells.forEach(({ id }) => {
        const cell = cellLayouts.get(id);
        if (cell) {
          cell.height = maxHeight;
        }
      });
    });
  }
  
  /**
   * Calculate optimal number of columns for a given parameter count
   * (Kept for reference but not used in flexbox implementation - flexbox handles wrapping automatically)
   * @deprecated Not used - flexbox handles column calculation automatically
   */
  // @ts-ignore - Intentionally unused, kept for reference
  private calculateOptimalColumns(_paramCount: number): number {
    if (_paramCount <= 1) return 1;
    if (_paramCount <= 2) return 2;
    
    if (_paramCount === 5 || _paramCount === 6) return 3;
    
    let bestColumns = 2;
    let bestEmptyCells = Infinity;
    
    for (let cols = 2; cols <= 4; cols++) {
      const rows = Math.ceil(_paramCount / cols);
      const emptyCells = (rows * cols) - _paramCount;
      if (emptyCells < bestEmptyCells) {
        bestEmptyCells = emptyCells;
        bestColumns = cols;
      }
    }
    
    return bestColumns;
  }
}
