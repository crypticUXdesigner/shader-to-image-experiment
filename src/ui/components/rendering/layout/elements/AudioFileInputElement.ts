/**
 * Audio File Input Slot Element
 *
 * Single embed-slot that replaces the node body: display text above center,
 * "Upload MP3" button centered, auto-play toggle bottom-right. Height from CSS token.
 */

import type { NodeInstance } from '../../../../../types/nodeGraph';
import type { NodeSpec, AudioFileInputElement as AudioFileInputElementType } from '../../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../../NodeRenderer';
import type { LayoutElementRenderer, ElementMetrics } from '../LayoutElementRenderer';
import { getCSSVariableAsNumber, getCSSColor } from '../../../../../utils/cssTokens';
import { drawRoundedRect } from '../../RenderingUtils';

/** Rect in absolute canvas coordinates (for hit testing). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class AudioFileInputElementRenderer implements LayoutElementRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  canHandle(element: unknown): boolean {
    return (element as { type?: string })?.type === 'audio-file-input-slot';
  }

  calculateMetrics(
    _element: AudioFileInputElementType,
    node: NodeInstance,
    _spec: NodeSpec,
    availableWidth: number,
    startY: number,
    metrics: NodeRenderMetrics
  ): ElementMetrics {
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    const slotHeight = getCSSVariableAsNumber('audio-file-input-slot-height', 140);
    const pd = getCSSVariableAsNumber('embed-slot-pd', 18);

    const containerX = node.position.x + gridPadding;
    const containerY = node.position.y + metrics.headerHeight + startY;

    const slotW = Math.max(0, availableWidth);
    const slotH = slotHeight;

    const buttonWidth = getCSSVariableAsNumber('audio-file-input-button-width', 140);
    const buttonHeight = getCSSVariableAsNumber('audio-file-input-button-height', 36);
    const buttonX = containerX + pd;
    const buttonY = containerY + slotH - buttonHeight - pd;

    const toggleWidth = getCSSVariableAsNumber('toggle-width', 48);
    const toggleHeight = getCSSVariableAsNumber('toggle-height', 24);
    const toggleX = containerX + slotW - toggleWidth - pd;
    const toggleY = containerY + slotH - toggleHeight - pd;

    const uploadButtonRect: Rect = { x: buttonX, y: buttonY, w: buttonWidth, h: buttonHeight };
    const toggleRect: Rect = { x: toggleX, y: toggleY, w: toggleWidth, h: toggleHeight };

    return {
      x: containerX,
      y: containerY,
      width: slotW,
      height: slotH,
      parameterGridPositions: new Map(),
      audioFileInputUploadButtonRect: uploadButtonRect,
      audioFileInputToggleRect: toggleRect
    };
  }

  render(
    _element: AudioFileInputElementType,
    node: NodeInstance,
    spec: NodeSpec,
    elementMetrics: ElementMetrics,
    _nodeMetrics: NodeRenderMetrics,
    renderState: Parameters<LayoutElementRenderer['render']>[5]
  ): void {
    const slotBg = getCSSColor('embed-slot-bg', '#0a0b0d');
    const slotRadius = getCSSVariableAsNumber('embed-slot-radius', 8);
    const pd = getCSSVariableAsNumber('embed-slot-pd', 18);

    const x = elementMetrics.x;
    const y = elementMetrics.y;
    const w = elementMetrics.width;
    const h = elementMetrics.height;

    this.ctx.fillStyle = slotBg;
    drawRoundedRect(this.ctx, x, y, w, h, slotRadius);
    this.ctx.fill();

    const centerX = x + w / 2;

    const filePath = (node.parameters.filePath ?? spec.parameters.filePath?.default ?? '') as string;
    const displayText = filePath && filePath.trim() !== ''
      ? (filePath.split('/').pop() || filePath.split('\\').pop() || filePath).trim()
      : 'No file selected';
    const displayTruncated = displayText.length > 24 ? displayText.slice(0, 21) + '...' : displayText;

    const displayFontSize = getCSSVariableAsNumber('canvas-headline-md-size', 24);
    const displayFontWeight = getCSSVariableAsNumber('canvas-headline-md-weight', 600);
    const hasFile = filePath && filePath.trim() !== '';
    const displayColor = hasFile
      ? getCSSColor('audio-file-input-display-text-color', 'rgba(255,255,255,0.7)')
      : getCSSColor('audio-file-input-display-placeholder-color', 'rgba(255,255,255,0.4)');
    const buttonHeight = getCSSVariableAsNumber('audio-file-input-button-height', 36);
    const contentAreaHeight = h - 2 * pd - buttonHeight;
    const displayY = y + pd + contentAreaHeight / 2;

    this.ctx.font = `${displayFontWeight} ${displayFontSize}px "Space Grotesk", sans-serif`;
    this.ctx.fillStyle = displayColor;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(displayTruncated, centerX, displayY);

    const buttonWidth = getCSSVariableAsNumber('audio-file-input-button-width', 140);
    const buttonX = x + pd;
    const buttonY = y + h - buttonHeight - pd;
    const buttonRadius = getCSSVariableAsNumber('audio-file-input-button-radius', 8);
    const buttonBg = getCSSColor('audio-file-input-button-bg', getCSSColor('color-gray-60', '#1a1c20'));
    const buttonBorder = getCSSColor('audio-file-input-button-border', getCSSColor('color-gray-80', '#282b31'));
    const buttonTextColor = getCSSColor('audio-file-input-button-text-color', getCSSColor('color-gray-130', '#ebeff0'));
    const isUploadHovered = renderState?.hoveredAudioFileInputControl === 'upload';

    if (isUploadHovered) {
      this.ctx.fillStyle = getCSSColor('audio-file-input-button-bg-hover', getCSSColor('color-gray-70', '#282b31'));
    } else {
      this.ctx.fillStyle = buttonBg;
    }
    drawRoundedRect(this.ctx, buttonX, buttonY, buttonWidth, buttonHeight, buttonRadius);
    this.ctx.fill();
    this.ctx.strokeStyle = buttonBorder;
    this.ctx.lineWidth = 1;
    drawRoundedRect(this.ctx, buttonX, buttonY, buttonWidth, buttonHeight, buttonRadius);
    this.ctx.stroke();

    this.ctx.fillStyle = buttonTextColor;
    const buttonFontSize = getCSSVariableAsNumber('canvas-font-button-size', 24);
    const buttonFontWeight = getCSSVariableAsNumber('canvas-font-button-weight', 900);
    this.ctx.font = `${buttonFontWeight} ${buttonFontSize}px "Space Grotesk", sans-serif`;
    this.ctx.fillText('Upload MP3', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);

    const autoPlayValue = (node.parameters.autoPlay ?? spec.parameters.autoPlay?.default ?? 0) as number;
    const isOn = autoPlayValue === 1;
    const isToggleHovered = renderState?.hoveredAudioFileInputControl === 'toggle';

    const toggleRect = elementMetrics.audioFileInputToggleRect as Rect;
    if (!toggleRect) return;

    const toggleWidth = toggleRect.w;
    const toggleHeight = toggleRect.h;
    const toggleRadius = getCSSVariableAsNumber('toggle-border-radius', 12);
    const toggleBorder = getCSSColor('toggle-border', getCSSColor('color-gray-70', '#282b31'));
    const toggleBg = isOn
      ? getCSSColor('toggle-bg-on', getCSSColor('color-blue-90', '#6565dc'))
      : (isToggleHovered
        ? getCSSColor('toggle-bg-hover', getCSSColor('color-gray-70', '#282b31'))
        : getCSSColor('toggle-bg-off', getCSSColor('color-gray-50', '#1a1c20')));
    const sliderSize = getCSSVariableAsNumber('toggle-slider-size', 20);
    const sliderOffset = getCSSVariableAsNumber('toggle-slider-offset', 2);
    const sliderBg = getCSSColor('toggle-slider-bg', getCSSColor('color-gray-130', '#ebeff0'));
    const sliderBorder = getCSSColor('toggle-slider-border', getCSSColor('color-gray-100', '#747e87'));

    const toggleX = toggleRect.x;
    const toggleY = toggleRect.y;

    const labelGap = getCSSVariableAsNumber('audio-file-input-toggle-label-gap', 8);
    const labelFontSize = getCSSVariableAsNumber('toggle-label-font-size', 21);
    const labelFontWeight = getCSSVariableAsNumber('toggle-label-font-weight', 600);
    const labelColor = getCSSColor('toggle-label-color', getCSSColor('color-gray-100', '#747e87'));
    this.ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
    this.ctx.fillStyle = labelColor;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('Auto play', toggleX - labelGap, toggleY + toggleHeight / 2);

    this.ctx.fillStyle = toggleBg;
    drawRoundedRect(this.ctx, toggleX, toggleY, toggleWidth, toggleHeight, toggleRadius);
    this.ctx.fill();
    this.ctx.strokeStyle = toggleBorder;
    this.ctx.lineWidth = 1;
    drawRoundedRect(this.ctx, toggleX, toggleY, toggleWidth, toggleHeight, toggleRadius);
    this.ctx.stroke();

    const sliderRadius = sliderSize / 2;
    const sliderY = toggleY + toggleHeight / 2;
    const sliderX = isOn
      ? toggleX + toggleWidth - sliderRadius - sliderOffset
      : toggleX + sliderRadius + sliderOffset;

    this.ctx.fillStyle = sliderBg;
    this.ctx.beginPath();
    this.ctx.arc(sliderX, sliderY, sliderRadius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = sliderBorder;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(sliderX, sliderY, sliderRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
}
