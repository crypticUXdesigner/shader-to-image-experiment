/**
 * Grid Element Renderer
 * 
 * Explicit grid with layout control and parameter selection.
 */

import type { NodeInstance } from '../../../../../types/nodeGraph';
import type { NodeSpec, GridElement as GridElementType } from '../../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../../NodeRenderer';
import type { LayoutElementRenderer, ElementMetrics } from '../LayoutElementRenderer';
import type { ParameterRenderer } from '../../parameters/ParameterRenderer';
import { getCSSColor, getCSSVariableAsNumber } from '../../../../../utils/cssTokens';
import { getParameterUIRegistry } from '../../ParameterUIRegistry';
import { FlexboxLayoutEngine } from '../flexbox/FlexboxLayoutEngine';
import type { FlexItem } from '../flexbox/FlexboxTypes';
import { renderStringParameter, renderArrayParameter } from '../../../../utils/stringArrayRendering';

export class GridElementRenderer implements LayoutElementRenderer {
  private ctx: CanvasRenderingContext2D;
  private parameterRegistry = getParameterUIRegistry();
  private flexboxEngine: FlexboxLayoutEngine;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.flexboxEngine = new FlexboxLayoutEngine();
  }
  
  canHandle(element: any): boolean {
    return element.type === 'grid';
  }
  
  calculateMetrics(
    element: GridElementType,
    node: NodeInstance,
    spec: NodeSpec,
    availableWidth: number,
    startY: number,
    metrics: NodeRenderMetrics
  ): ElementMetrics {
    const gridGap = getCSSVariableAsNumber('param-grid-gap', 12);
    const defaultCellMinWidth = getCSSVariableAsNumber('param-cell-min-width', 220);
    const groupHeaderHeight = getCSSVariableAsNumber('param-group-header-height', 24);
    const groupHeaderMarginTop = getCSSVariableAsNumber('param-group-header-margin-top', 0);
    const groupHeaderMarginBottom = getCSSVariableAsNumber('param-group-header-margin-bottom', 0);
    
    const layout = element.layout || {};
    const cellMinWidth = layout.cellMinWidth ?? defaultCellMinWidth;
    const respectMinWidth = layout.respectMinWidth !== false; // Default true
    
    // Filter parameters - skip missing ones with warning
    const validParams: string[] = [];
    for (const paramName of element.parameters) {
      if (spec.parameters[paramName]) {
        validParams.push(paramName);
      } else {
        console.warn(`Parameter "${paramName}" not found in node "${spec.id}", skipping from grid`);
      }
    }
    
    if (validParams.length === 0) {
      return {
        x: node.position.x,
        y: node.position.y + metrics.headerHeight + startY,
        width: availableWidth,
        height: 0,
        parameterGridPositions: new Map()
      };
    }
    
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const extraSpacing = getCSSVariableAsNumber('param-label-knob-spacing', 20);
    const knobSize = getCSSVariableAsNumber('knob-size', 45);
    const valueSpacing = getCSSVariableAsNumber('knob-value-spacing', 4);
    
    // Calculate content-based cell height (same for all cells)
    const labelHeight = labelFontSize;
    const knobHeight = knobSize;
    const valueHeight = labelFontSize; // Approximate value height
    const cellHeight = labelHeight + extraSpacing + knobHeight + valueSpacing + valueHeight + cellPadding * 2;
    
    // Create flex items for each parameter cell
    const cellItems: FlexItem[] = validParams.map((_paramName, index) => {
      return {
        id: `cell-${index}`,
        properties: {
          width: cellMinWidth, // Will be adjusted by flexbox
          height: cellHeight,
          minWidth: respectMinWidth ? cellMinWidth : undefined,
          flexShrink: 1,
          flexGrow: 0
        }
      };
    });
    
    // Use FlexboxLayoutEngine to calculate grid layout
    const gridX = node.position.x + gridPadding;
    const gridY = node.position.y + metrics.headerHeight + startY;

    // Optional header inside this grid slot (used for parameterGroups).
    const hasHeaderLabel = typeof element.label === 'string' && element.label.trim().length > 0;
    const headerOffset = hasHeaderLabel
      ? (groupHeaderMarginTop + groupHeaderHeight + groupHeaderMarginBottom)
      : 0;
    
    const gridLayout = this.flexboxEngine.calculateLayout(
      gridX,
      gridY + headerOffset,
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
    
    // Extract parameter positions from flexbox layout
    // First, convert to a simpler structure for row height normalization
    const cellLayouts = new Map<string, { x: number; y: number; width: number; height: number }>();
    validParams.forEach((_paramName, index) => {
      const cellResult = gridLayout.items.get(`cell-${index}`);
      if (cellResult && 'x' in cellResult) {
        // It's a LayoutResult (not nested container)
        cellLayouts.set(`cell-${index}`, cellResult);
      }
    });
    
    // Normalize row heights (all cells in same row should have equal height)
    this.normalizeRowHeights(cellLayouts, gridGap);
    
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
    
    validParams.forEach((paramName, index) => {
      const cellLayout = cellLayouts.get(`cell-${index}`);
      if (!cellLayout) return;
      
      const cellX = cellLayout.x;
      const cellY = cellLayout.y;
      const cellWidth = cellLayout.width;
      const cellHeight = cellLayout.height;
      
      // Calculate internal element positions.
      //
      // IMPORTANT: Keep GridElementRenderer consistent with AutoGridElementRenderer so
      // "grid" and "auto-grid" parameter cells look identical.
      const cellElementPositions = this.calculateCellElementPositions(
        cellX,
        cellY,
        cellWidth,
        cellHeight,
        cellPadding,
        labelFontSize,
        extraSpacing,
        knobSize,
        valueSpacing
      );
      
      parameterGridPositions.set(paramName, {
        cellX,
        cellY,
        cellWidth,
        cellHeight,
        knobX: cellElementPositions.knobX,
        knobY: cellElementPositions.knobY,
        portX: cellElementPositions.portX,
        portY: cellElementPositions.portY,
        labelX: cellElementPositions.labelX,
        labelY: cellElementPositions.labelY,
        valueX: cellElementPositions.valueX,
        valueY: cellElementPositions.valueY
      });
    });
    
    // Calculate total height from normalized cell positions.
    //
    // IMPORTANT: Height must be independent of absolute canvas/world coordinates.
    // The previous implementation initialized maxY to 0, which implicitly anchored
    // the grid height to world-origin. When a node was dragged into negative Y,
    // cell bottoms could all be < 0, leaving maxY at 0 and making totalHeight
    // depend on -gridY (i.e., node.position.y). This caused node height to change
    // during dragging.
    //
    // Fix: compute the maximum bottom edge relative to gridY.
    let maxBottom = gridY + headerOffset;
    for (const cell of cellLayouts.values()) {
      maxBottom = Math.max(maxBottom, cell.y + cell.height);
    }
    const totalHeight = Math.max(0, headerOffset + (maxBottom - (gridY + headerOffset)));
    
    return {
      x: gridX,
      y: gridY,
      width: availableWidth,
      height: totalHeight,
      parameterGridPositions
    };
  }
  
  /**
   * Calculate cell internal element positions using flexbox
   */
  private calculateCellElementPositions(
    cellX: number,
    cellY: number,
    cellWidth: number,
    cellHeight: number,
    cellPadding: number,
    labelFontSize: number,
    extraSpacing: number,
    knobSize: number,
    valueSpacing: number
  ): {
    labelX: number;
    labelY: number;
    knobX: number;
    knobY: number;
    valueX: number;
    valueY: number;
    portX: number;
    portY: number;
  } {
    // Match AutoGridElementRenderer's "classic" cell positioning so grid and auto-grid
    // look the same (label at top, knob centered, value beneath).
    //
    // NOTE: Parameter renderers (Knob/Toggle/etc) still compute portY at render-time
    // using measured label height for perfect alignment; these values are the layout
    // anchors used by those renderers.
    const labelX = cellX + cellWidth / 2;
    const labelY = cellY + cellPadding;

    const portX = cellX + cellPadding;
    const portY = labelY + labelFontSize / 2;

    const knobX = cellX + cellWidth / 2;
    const labelBottom = cellY + cellPadding + labelFontSize;
    const knobY = labelBottom + extraSpacing + knobSize / 2;

    const valueX = knobX;
    const valueY = knobY + knobSize / 2 + valueSpacing;

    // cellHeight is intentionally unused here (content is top-anchored).
    void cellHeight;

    return {
      labelX,
      labelY,
      knobX,
      knobY,
      valueX,
      valueY,
      portX,
      portY
    };
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
  
  render(
    element: GridElementType,
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

    // Optional header label (typically for parameterGroups)
    const label = typeof element.label === 'string' ? element.label.trim() : '';
    if (label) {
      const groupHeaderHeight = getCSSVariableAsNumber('param-group-header-height', 24);
      const groupHeaderFontSize = getCSSVariableAsNumber('param-group-header-font-size', 24);
      const groupHeaderFontWeight = getCSSVariableAsNumber('param-group-header-weight', 600);
      const groupHeaderColor = getCSSColor('param-group-header-color', getCSSColor('color-gray-110', '#a3aeb5'));
      const groupHeaderMarginTop = getCSSVariableAsNumber('param-group-header-margin-top', 0);

      const prevTextAlign = this.ctx.textAlign;
      const prevTextBaseline = this.ctx.textBaseline;
      const prevFillStyle = this.ctx.fillStyle;
      const prevFont = this.ctx.font;
      try {
        this.ctx.fillStyle = groupHeaderColor;
        this.ctx.font = `${groupHeaderFontWeight} ${groupHeaderFontSize}px "Space Grotesk", sans-serif`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(
          label,
          elementMetrics.x,
          elementMetrics.y + groupHeaderMarginTop + groupHeaderHeight / 2
        );
      } finally {
        this.ctx.textAlign = prevTextAlign;
        this.ctx.textBaseline = prevTextBaseline;
        this.ctx.fillStyle = prevFillStyle;
        this.ctx.font = prevFont;
      }
    }
    
    // Get parameters for this element
    const elementParams = element.parameters || [];
    
    // Render each parameter using positions from metrics
    elementParams.forEach((paramName) => {
      const gridPos = parameterGridPositions.get(paramName);
      if (!gridPos) return;
      
      const paramSpec = spec.parameters[paramName];
      if (!paramSpec) return;
      
      const isParamHovered = (renderState.hoveredPortName === paramName && renderState.isHoveredParameter) ?? false;
      const effectiveValue = renderState.effectiveParameterValues?.get(paramName) ?? null;
      const isConnected = renderState.connectedParameters?.has(paramName) ?? false;
      
      if (paramSpec.type === 'float' || paramSpec.type === 'int') {
        // Check if parameterUI override is specified for this parameter
        let renderer: ParameterRenderer;
        if (element.parameterUI && element.parameterUI[paramName]) {
          // Use the specified UI type from parameterUI override
          const uiType = element.parameterUI[paramName];
          const overrideRenderer = this.parameterRegistry.getRendererByUIType(uiType);
          if (overrideRenderer) {
            renderer = overrideRenderer;
          } else {
            // Fallback to default renderer selection if UI type not found
            renderer = this.parameterRegistry.getRenderer(spec, paramName);
          }
        } else {
          // Use default renderer selection
          renderer = this.parameterRegistry.getRenderer(spec, paramName);
        }
        
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
