/**
 * Base interface for layout element renderers
 * Each element type (auto-grid, grid, remap-range, bezier-editor, etc.) implements this
 * 
 * ## Coordinate System
 * 
 * All coordinates in the layout system use **absolute coordinates** relative to the canvas:
 * - `ElementMetrics.x, y`: Absolute canvas coordinates
 * - `ElementMetrics.width, height`: Element dimensions
 * - `parameterGridPositions`: All positions (cellX, cellY, knobX, knobY, etc.) are absolute
 * 
 * The `startY` parameter in `calculateMetrics()` is relative to the node body start (after header),
 * but it should be converted to absolute coordinates when setting `ElementMetrics.y`:
 * ```typescript
 * y: node.position.y + metrics.headerHeight + startY
 * ```
 * 
 * This ensures all rendering uses consistent absolute coordinates.
 */

import type { NodeInstance } from '../../../../types/nodeGraph';
import type { NodeSpec, LayoutElement } from '../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../NodeRenderer';

/**
 * Metrics for a layout element
 */
export interface ElementMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
  // Additional metrics specific to element type
  [key: string]: any;
}

/**
 * Base interface for layout element renderers
 */
export interface LayoutElementRenderer {
  /**
   * Check if this renderer can handle the given element type
   */
  canHandle(element: LayoutElement): boolean;
  
  /**
   * Calculate metrics for this element
   * @param element The layout element
   * @param node Node instance
   * @param spec Node specification
   * @param availableWidth Available width (node width - body padding * 2)
   * @param startY Starting Y position (relative to node body start, after header)
   * @param metrics Existing node metrics (for reference)
   * @returns Element metrics with absolute coordinates
   * 
   * Note: The returned `ElementMetrics` should use absolute coordinates:
   * - `x`: `node.position.x + gridPadding`
   * - `y`: `node.position.y + metrics.headerHeight + startY`
   * - All positions in `parameterGridPositions` should also be absolute
   */
  calculateMetrics(
    element: LayoutElement,
    node: NodeInstance,
    spec: NodeSpec,
    availableWidth: number,
    startY: number,
    metrics: NodeRenderMetrics
  ): ElementMetrics;
  
  /**
   * Render this element
   * @param element The layout element
   * @param node Node instance
   * @param spec Node specification
   * @param elementMetrics Pre-calculated metrics for this element
   * @param nodeMetrics Full node metrics
   * @param renderState Rendering state (hover, connections, etc.)
   */
  render(
    element: LayoutElement,
    node: NodeInstance,
    spec: NodeSpec,
    elementMetrics: ElementMetrics,
    nodeMetrics: NodeRenderMetrics,
    renderState: {
      hoveredPortName?: string | null;
      isHoveredParameter?: boolean;
      connectingPortName?: string | null;
      isConnectingParameter?: boolean;
      connectedParameters?: Set<string>;
      effectiveParameterValues?: Map<string, number | null>;
      skipPorts?: boolean;
      audioRemapLiveValues?: { incoming: number | null; outgoing: number | null };
      /** Per-band live values for audio-analyzer band remap UI (bandIndex -> { incoming, outgoing }) */
      audioAnalyzerBandLiveValues?: Map<number, { incoming: number | null; outgoing: number | null }>;
      /** Audio file input slot: which control is hovered */
      hoveredAudioFileInputControl?: 'upload' | 'toggle' | null;
    }
  ): void;
}
