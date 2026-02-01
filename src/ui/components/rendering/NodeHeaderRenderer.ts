/**
 * Node Header Renderer
 * 
 * Handles rendering of node headers including:
 * - Header background with gradient
 * - Icon box and icon
 * - Node name/label
 * 
 * Note: Ports are rendered separately by NodePortRenderer
 */

import type { NodeInstance } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';
import { getNodeIcon } from '../../../utils/nodeSpecUtils';
import { getCSSColor, getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { renderIconOnCanvas } from '../../../utils/icons';
import { drawRoundedRect, drawRoundedRectToPath } from './RenderingUtils';

export class NodeHeaderRenderer {
  private ctx: CanvasRenderingContext2D;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }
  
  /**
   * Render the node header
   */
  render(
    node: NodeInstance,
    spec: NodeSpec,
    x: number,
    y: number,
    width: number,
    height: number,
    _isSelected: boolean,
    _hoveredPortName?: string | null,
    _connectingPortName?: string | null,
    _skipPorts: boolean = false,
    fullNodeHeight?: number
  ): void {
    const iconSize = getCSSVariableAsNumber('node-header-icon-size', 60);
    const iconBoxWidth = getCSSVariableAsNumber('node-icon-box-width', 90);
    const iconBoxHeight = getCSSVariableAsNumber('node-icon-box-height', 90);
    const iconBoxRadius = getCSSVariableAsNumber('node-icon-box-radius', 36);
    const iconBoxNameSpacing = getCSSVariableAsNumber('node-icon-box-name-spacing', 24);
    const nameSize = getCSSVariableAsNumber('node-header-name-size', 30);
    const nameWeight = getCSSVariableAsNumber('node-header-name-weight', 600);
    const nameColor = getCSSColor('node-header-name-color', getCSSColor('color-gray-130', '#ebeff0'));
    const borderRadius = getCSSVariableAsNumber('node-box-border-radius', 24);
    
    // Create clipping path for the full node (to ensure header respects parent container)
    // Use fullNodeHeight if provided, otherwise use header height (for backwards compatibility)
    const nodeHeight = fullNodeHeight ?? height;
    const nodePath = new Path2D();
    drawRoundedRectToPath(nodePath, x, y, width, nodeHeight, borderRadius);
    
    // Clip to parent node bounds to ensure header respects the container
    this.ctx.save();
    this.ctx.clip(nodePath);
    
    // Logo padding: inset around icon box + label (center part only)
    const logoPadding = getCSSVariableAsNumber('node-header-logo-padding', 60);

      // Draw header background with radial gradient using header-specific category colors
      // Header fills its entire allocated space (no padding on background)
      const headerBgColorStart = this.getHeaderCategoryColor(spec.category);
      const headerBgColorEnd = this.getHeaderCategoryColorEnd(spec.category);
      
      // Get header gradient ellipse parameters (separate from node gradient)
      const headerEllipseWidthPercent = getCSSVariableAsNumber('node-header-bg-gradient-ellipse-width', 100);
      const headerEllipseHeightPercent = getCSSVariableAsNumber('node-header-bg-gradient-ellipse-height', 100);
      const headerEllipseXPercent = getCSSVariableAsNumber('node-header-bg-gradient-ellipse-x', 50);
      const headerEllipseYPercent = getCSSVariableAsNumber('node-header-bg-gradient-ellipse-y', 50);
      
      // Calculate ellipse dimensions and position relative to full header area
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
      
      // Fill header background - fills entire allocated space (clipping will handle the rounded corners)
      this.ctx.fillStyle = headerGradient;
      this.ctx.fillRect(x, y, width, height);
      
      // Calculate icon/box/label group height for vertical centering
      const groupHeight = iconBoxHeight + iconBoxNameSpacing + nameSize;
      
      // Center the icon/box/label group vertically in the header, respecting logo padding (center only)
      const iconBoxX = x + width / 2 - iconBoxWidth / 2;
      const iconBoxY = y + logoPadding + (height - logoPadding * 2 - groupHeight) / 2;
      const iconBoxBg = this.getCategoryIconBoxBg(spec.category);
      this.ctx.fillStyle = iconBoxBg;
      drawRoundedRect(this.ctx, iconBoxX, iconBoxY, iconBoxWidth, iconBoxHeight, iconBoxRadius);
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
    
    // Note: Ports are now rendered separately by NodePortRenderer
    // This keeps the header renderer focused on header-specific rendering
    
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
  
  // Helper methods for category colors
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
  
}
