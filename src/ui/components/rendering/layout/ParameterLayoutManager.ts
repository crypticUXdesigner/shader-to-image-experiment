/**
 * Parameter Layout Manager
 * 
 * Orchestrates the layout system for node parameters.
 * Handles the slot container (node body) and renders elements in order.
 */

import type { NodeInstance } from '../../../../types/nodeGraph';
import type { NodeSpec, LayoutElement } from '../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../NodeRenderer';
import { getCSSVariableAsNumber } from '../../../../utils/cssTokens';
import { autoGenerateLayout } from '../../../../utils/layoutMigration';
import { AutoGridElementRenderer } from './elements/AutoGridElement';
import { GridElementRenderer } from './elements/GridElement';
import { RemapRangeElementRenderer } from './elements/RemapRangeElement';
import { AnalyzerBandRemapElementRenderer } from './elements/AnalyzerBandRemapElement';
import { FrequencyRangeElementRenderer } from './elements/FrequencyRangeElement';
import { BezierEditorElementRenderer } from './elements/BezierEditorElement';
import { ColorPickerElementRenderer } from './elements/ColorPickerElement';
import { AudioFileInputElementRenderer } from './elements/AudioFileInputElement';
import type { LayoutElementRenderer, ElementMetrics } from './LayoutElementRenderer';
import { BodyFlexboxLayout } from '../BodyFlexboxLayout';

/**
 * Generate a stable key for a layout element
 * Uses element type and index to create a unique identifier
 * that works even when element objects are different instances
 */
function getElementKey(element: LayoutElement, index: number): string {
  const type = (element as any).type || 'unknown';
  // For grid elements, include parameters to make them unique
  if (type === 'grid' && 'parameters' in element) {
    const params = (element as any).parameters || [];
    return `${type}-${index}-${params.join(',')}`;
  }
  // For frequency-range, include bandIndex for uniqueness when multiple bands
  if (type === 'frequency-range' && 'bandIndex' in element) {
    return `${type}-${index}-${(element as any).bandIndex ?? 0}`;
  }
  // For analyzer-band-remap, include bandIndex
  if (type === 'analyzer-band-remap' && 'bandIndex' in element) {
    return `${type}-${index}-${(element as any).bandIndex ?? 0}`;
  }
  // For audio-file-input-slot, type + index
  if (type === 'audio-file-input-slot') {
    return `${type}-${index}`;
  }
  // For other elements, type + index is sufficient
  return `${type}-${index}`;
}

export class ParameterLayoutManager {
  private elementRenderers: LayoutElementRenderer[];
  private bodyLayout: BodyFlexboxLayout;
  
  constructor(ctx: CanvasRenderingContext2D) {
    
    // Register all element renderers (order matters - first match wins)
    this.elementRenderers = [
      new AutoGridElementRenderer(ctx),
      new GridElementRenderer(ctx),
      new RemapRangeElementRenderer(ctx),
      new AnalyzerBandRemapElementRenderer(ctx),
      new FrequencyRangeElementRenderer(ctx),
      new BezierEditorElementRenderer(ctx),
      new ColorPickerElementRenderer(ctx),
      new AudioFileInputElementRenderer(ctx)
    ];
    
    this.bodyLayout = new BodyFlexboxLayout();
  }
  
  /**
   * Calculate metrics for all layout elements
   */
  calculateMetrics(
    node: NodeInstance,
    spec: NodeSpec,
    nodeX: number,
    nodeY: number,
    nodeWidth: number,
    headerHeight: number,
    existingMetrics: Partial<NodeRenderMetrics>
  ): {
    totalHeight: number;
    elementMetrics: Map<string, ElementMetrics>;
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
  } {
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    const availableWidth = nodeWidth - gridPadding * 2;
    const bodyStartY = nodeY + headerHeight;
    
    // Get layout or auto-generate (same logic as render method)
    const layout = spec.parameterLayout || autoGenerateLayout(spec);
    
    // Build full metrics object for element renderers
    const fullMetrics: NodeRenderMetrics = {
      width: nodeWidth,
      height: 0, // Will be calculated
      headerHeight,
      portPositions: existingMetrics.portPositions || new Map(),
      parameterGridPositions: existingMetrics.parameterGridPositions || new Map(),
      parameterPositions: existingMetrics.parameterPositions || new Map(),
      parameterInputPortPositions: existingMetrics.parameterInputPortPositions || new Map()
    };
    
    // Use string keys instead of element objects for stable lookups
    const elementMetrics = new Map<string, ElementMetrics>();
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
    
    // First pass: Calculate element heights (needed for flexbox layout)
    const slotHeights = new Map<LayoutElement, number>();
    for (let i = 0; i < layout.elements.length; i++) {
      const element = layout.elements[i];
      const renderer = this.getElementRenderer(element);
      if (!renderer) {
        console.warn(`No renderer found for layout element type: ${(element as any).type}`);
        continue;
      }
      
      // Calculate metrics with temporary startY (will be adjusted by flexbox)
      // Use a temporary startY that represents relative position within body
      const tempMetrics = renderer.calculateMetrics(
        element,
        node,
        spec,
        availableWidth,
        0, // Temporary - will be recalculated with actual positions
        fullMetrics
      );
      
      // Validate height before storing
      const height = tempMetrics?.height;
      if (height === undefined || height === null || !isFinite(height) || height <= 0) {
        console.warn(`Invalid height calculated for element ${i} (type: ${(element as any).type}), height: ${height}. Using minimum height.`);
        slotHeights.set(element, 20); // Minimum height fallback
      } else {
        slotHeights.set(element, height);
      }
    }
    
    // Use BodyFlexboxLayout to calculate slot positions
    const bodyLayout = this.bodyLayout.calculateLayout(
      nodeX,
      bodyStartY,
      nodeWidth,
      layout,
      slotHeights
    );
    
    // Second pass: Recalculate element metrics with actual positions from flexbox
    for (let i = 0; i < layout.elements.length; i++) {
      const element = layout.elements[i];
      const elementKey = getElementKey(element, i);
      const slotLayout = bodyLayout.slots[i];
      
      if (!slotLayout) {
        console.warn(`No slot layout found for element ${i}`);
        continue;
      }
      
      const renderer = this.getElementRenderer(element);
      if (!renderer) {
        continue;
      }
      
      // Calculate startY relative to body start (for element renderer)
      // Validate slotLayout has valid properties before using it
      if (slotLayout.y === undefined || slotLayout.y === null || 
          slotLayout.x === undefined || slotLayout.x === null ||
          slotLayout.width === undefined || slotLayout.width === null ||
          slotLayout.height === undefined || slotLayout.height === null ||
          !isFinite(slotLayout.x) || !isFinite(slotLayout.y) ||
          !isFinite(slotLayout.width) || !isFinite(slotLayout.height) ||
          slotLayout.width <= 0 || slotLayout.height <= 0) {
        console.warn(`Invalid slot layout for element ${i}, skipping metrics calculation`);
        continue;
      }
      
      const startY = slotLayout.y - bodyStartY;
      // Validate startY is a valid number
      if (!isFinite(startY)) {
        console.warn(`Invalid startY calculated for element ${i}, skipping metrics calculation`);
        continue;
      }
      
      const metrics = renderer.calculateMetrics(
        element,
        node,
        spec,
        availableWidth,
        startY,
        fullMetrics
      );
      
      // Validate metrics before storing
      if (!metrics || 
          metrics.x === undefined || metrics.x === null ||
          metrics.y === undefined || metrics.y === null ||
          metrics.width === undefined || metrics.width === null ||
          metrics.height === undefined || metrics.height === null ||
          !isFinite(metrics.x) || !isFinite(metrics.y) ||
          !isFinite(metrics.width) || !isFinite(metrics.height) ||
          metrics.width <= 0 || metrics.height <= 0) {
        console.warn(`Invalid metrics returned from calculateMetrics for element ${i}, skipping`);
        continue;
      }
      
      // Update element metrics with flexbox-calculated position
      elementMetrics.set(elementKey, {
        ...metrics,
        x: slotLayout.x,
        y: slotLayout.y,
        width: slotLayout.width,
        height: slotLayout.height
      });
      
      // Extract parameter positions. Elements return canvas-space positions, so use as-is (do not add slotLayout).
      if (metrics.parameterGridPositions) {
        for (const [paramName, pos] of metrics.parameterGridPositions) {
          parameterGridPositions.set(paramName, {
            cellX: pos.cellX,
            cellY: pos.cellY,
            cellWidth: pos.cellWidth,
            cellHeight: pos.cellHeight,
            knobX: pos.knobX,
            knobY: pos.knobY,
            portX: pos.portX,
            portY: pos.portY,
            labelX: pos.labelX,
            labelY: pos.labelY,
            valueX: pos.valueX,
            valueY: pos.valueY
          });
        }
      }
    }
    
    // Body height comes from BodyFlexboxLayout (top padding + slot extent + bottom padding).
    const totalHeight = bodyLayout.container.height;

    return {
      totalHeight,
      elementMetrics,
      parameterGridPositions
    };
  }
  
  /**
   * Render all layout elements
   */
  render(
    node: NodeInstance,
    spec: NodeSpec,
    _nodeX: number,
    _nodeY: number,
    _nodeWidth: number,
    _headerHeight: number,
    metrics: NodeRenderMetrics,
    elementMetrics: Map<string, ElementMetrics>,
    renderState: {
      hoveredPortName?: string | null;
      isHoveredParameter?: boolean;
      connectingPortName?: string | null;
      isConnectingParameter?: boolean;
      connectedParameters?: Set<string>;
      effectiveParameterValues?: Map<string, number | null>;
      skipPorts?: boolean;
      audioRemapLiveValues?: { incoming: number | null; outgoing: number | null };
      audioAnalyzerBandLiveValues?: Map<number, { incoming: number | null; outgoing: number | null }>;
      hoveredAudioFileInputControl?: 'upload' | 'toggle' | null;
    }
  ): void {
    // Use the same layout generation logic as calculateMetrics
    // This ensures consistency between calculateMetrics and render
    const layout = spec.parameterLayout || autoGenerateLayout(spec);
    
    // Render elements in order
    for (let i = 0; i < layout.elements.length; i++) {
      const element = layout.elements[i];
      const elementKey = getElementKey(element, i);
      
      const metricsForElement = elementMetrics.get(elementKey);
      if (!metricsForElement) {
        // Skip if metrics not found (should not happen in normal operation)
        continue;
      }
      
      const renderer = this.getElementRenderer(element);
      if (!renderer) {
        continue;
      }
      
      renderer.render(
        element,
        node,
        spec,
        metricsForElement,
        metrics,
        renderState
      );
    }
  }
  
  /**
   * Get renderer for an element
   */
  private getElementRenderer(element: LayoutElement): LayoutElementRenderer | null {
    for (const renderer of this.elementRenderers) {
      if (renderer.canHandle(element)) {
        return renderer;
      }
    }
    return null;
  }
}
