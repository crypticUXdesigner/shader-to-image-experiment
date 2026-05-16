/**
 * Arrangement track filter dropdown (arrangement-notes / arrangement-lanes).
 */

import type { NodeInstance } from '../../../../../data-model/types';
import type {
  NodeSpec,
  LayoutElement,
  ArrangementTrackFilterElement as ArrangementTrackFilterElementType,
} from '../../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../../NodeRenderer';
import type { LayoutElementRenderer, ElementMetrics } from '../LayoutElementRenderer';
import { getCategoryVariableAsNumber, getCSSVariableAsNumber } from '../../../../../utils/cssTokens';

export class ArrangementTrackFilterElementRenderer implements LayoutElementRenderer {
  constructor(_ctx: CanvasRenderingContext2D) {
    // ctx unused; nodes are DOM-rendered.
  }

  canHandle(element: LayoutElement): boolean {
    return element.type === 'arrangement-track-filter';
  }

  calculateMetrics(
    element: ArrangementTrackFilterElementType,
    node: NodeInstance,
    spec: NodeSpec,
    availableWidth: number,
    startY: number,
    metrics: NodeRenderMetrics
  ): ElementMetrics {
    const category = spec.category;
    const gridPadding = category != null
      ? getCategoryVariableAsNumber('node-body-padding', category, 18)
      : getCSSVariableAsNumber('node-body-padding', 18);
    const groupHeaderHeight = category != null
      ? getCategoryVariableAsNumber('param-group-header-height', category, 18)
      : getCSSVariableAsNumber('param-group-header-height', 24);
    const groupHeaderMarginTop = category != null
      ? getCategoryVariableAsNumber('param-group-header-margin-top', category, 12)
      : getCSSVariableAsNumber('param-group-header-margin-top', 0);
    const groupHeaderMarginBottom = category != null
      ? getCategoryVariableAsNumber('param-group-header-margin-bottom', category, 12)
      : getCSSVariableAsNumber('param-group-header-margin-bottom', 0);
    const paramCellMinHeight = getCSSVariableAsNumber('param-cell-min-height', 56);

    const hasLabel = Boolean(element.label?.trim());
    const headerBlock = hasLabel
      ? groupHeaderMarginTop + groupHeaderHeight + groupHeaderMarginBottom
      : 0;
    const height = headerBlock + paramCellMinHeight;

    const x = node.position.x + gridPadding;
    const y = node.position.y + metrics.headerHeight + startY;

    return {
      x,
      y,
      width: availableWidth,
      height,
      parameterGridPositions: new Map(),
    };
  }
}
