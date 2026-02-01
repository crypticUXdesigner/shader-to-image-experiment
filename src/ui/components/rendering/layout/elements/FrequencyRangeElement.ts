/**
 * Frequency Range Element Renderer
 *
 * Simplified range editor: label + [optional frequency scale when scale=audio] + horizontal range slider + start/end frequency inputs.
 * Layout: embed-slot with --embed-slot-pd for padding and gap, direction column.
 * Used for editing one band of an array parameter (e.g. frequencyBands[bandIndex]).
 */

import type { NodeInstance } from '../../../../../types/nodeGraph';
import type { NodeSpec, FrequencyRangeElement as FrequencyRangeElementType } from '../../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../../NodeRenderer';
import type { LayoutElementRenderer, ElementMetrics } from '../LayoutElementRenderer';
import { getCSSVariableAsNumber, getCSSColor } from '../../../../../utils/cssTokens';
import { drawRoundedRect, drawHorizontalRangeSlider } from '../../RenderingUtils';

export const FREQ_MIN = 20;
export const FREQ_MAX = 20000;

/** Ticks for the frequency scale in audio (log) mode — music-production–friendly Hz values. */
const FREQ_SCALE_TICKS: { hz: number; label: string }[] = [
  { hz: 20, label: '20' },
  { hz: 100, label: '100' },
  { hz: 250, label: '250' },
  { hz: 1000, label: '1k' },
  { hz: 4000, label: '4k' },
  { hz: 10000, label: '10k' },
  { hz: 20000, label: '20k' }
];

const LOG_FREQ_MIN = Math.log10(FREQ_MIN);
const LOG_FREQ_MAX = Math.log10(FREQ_MAX);
const LOG_FREQ_SPAN = LOG_FREQ_MAX - LOG_FREQ_MIN;

export function hzToNorm(hz: number, scale: 'linear' | 'audio'): number {
  const clamped = Math.max(FREQ_MIN, Math.min(FREQ_MAX, hz));
  if (scale === 'audio') {
    return (Math.log10(clamped) - LOG_FREQ_MIN) / LOG_FREQ_SPAN;
  }
  return (clamped - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);
}

export function normToHz(norm: number, scale: 'linear' | 'audio'): number {
  const t = Math.max(0, Math.min(1, norm));
  if (scale === 'audio') {
    return Math.pow(10, LOG_FREQ_MIN + t * LOG_FREQ_SPAN);
  }
  return FREQ_MIN + t * (FREQ_MAX - FREQ_MIN);
}

export class FrequencyRangeElementRenderer implements LayoutElementRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  canHandle(element: unknown): boolean {
    return (element as { type?: string })?.type === 'frequency-range';
  }

  getBandValues(
    element: FrequencyRangeElementType,
    node: NodeInstance,
    spec: NodeSpec
  ): { minHz: number; maxHz: number } {
    const param = node.parameters[element.parameter];
    const bands = Array.isArray(param) ? param : (spec.parameters[element.parameter]?.default as number[][]) ?? [];
    const band = bands[element.bandIndex];
    const arr = Array.isArray(band) && band.length >= 2 ? band : [FREQ_MIN, FREQ_MAX];
    return {
      minHz: Math.max(FREQ_MIN, Math.min(FREQ_MAX, Number(arr[0]) ?? FREQ_MIN)),
      maxHz: Math.max(FREQ_MIN, Math.min(FREQ_MAX, Number(arr[1]) ?? FREQ_MAX))
    };
  }

  calculateMetrics(
    element: FrequencyRangeElementType,
    node: NodeInstance,
    _spec: NodeSpec,
    availableWidth: number,
    startY: number,
    metrics: NodeRenderMetrics
  ): ElementMetrics {
    const pd = getCSSVariableAsNumber('embed-slot-pd', 12);
    const gap = pd;
    const labelFontSize = getCSSVariableAsNumber('frequency-range-label-font-size', 18);
    const labelHeight = labelFontSize + 2;
    const sliderHeight = getCSSVariableAsNumber('frequency-range-slider-height', 16);
    const inputRowHeight = getCSSVariableAsNumber('frequency-range-input-row-height', 28);
    const scale = element.scale ?? 'linear';
    const scaleHeight =
      scale === 'audio' ? getCSSVariableAsNumber('frequency-range-scale-height', 22) + gap : 0;

    const height =
      pd + labelHeight + gap + scaleHeight + sliderHeight + gap + inputRowHeight + pd;
    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    const containerX = node.position.x + gridPadding;
    const containerY = node.position.y + metrics.headerHeight + startY;

    return {
      x: containerX,
      y: containerY,
      width: availableWidth,
      height,
      parameterGridPositions: new Map()
    };
  }

  render(
    element: FrequencyRangeElementType,
    node: NodeInstance,
    spec: NodeSpec,
    elementMetrics: ElementMetrics,
    _nodeMetrics: NodeRenderMetrics,
    _renderState: unknown
  ): void {
    if (
      elementMetrics.x === undefined ||
      elementMetrics.x === null ||
      elementMetrics.y === undefined ||
      elementMetrics.y === null ||
      elementMetrics.width === undefined ||
      elementMetrics.width === null ||
      elementMetrics.height === undefined ||
      elementMetrics.height === null ||
      elementMetrics.width <= 0 ||
      elementMetrics.height <= 0
    ) {
      console.warn('Invalid frequency-range element metrics, skipping render', elementMetrics);
      return;
    }

    const pd = getCSSVariableAsNumber('embed-slot-pd', 12);
    const gap = pd;
    const labelFontSize = getCSSVariableAsNumber('frequency-range-label-font-size', 18);
    const labelFontWeight = getCSSVariableAsNumber('frequency-range-label-font-weight', 600);
    const labelHeight = labelFontSize + 2;
    const scaleHeightToken = getCSSVariableAsNumber('frequency-range-scale-height', 22);
    const scaleFontSize = getCSSVariableAsNumber('frequency-range-scale-font-size', 15);
    const scaleFontWeight = getCSSVariableAsNumber('frequency-range-scale-font-weight', 500);
    const sliderHeight = getCSSVariableAsNumber('frequency-range-slider-height', 16);
    const inputRowHeight = getCSSVariableAsNumber('frequency-range-input-row-height', 28);

    const { minHz, maxHz } = this.getBandValues(element, node, spec);
    const scale = element.scale ?? 'linear';
    const minNorm = Math.max(0, Math.min(1, hzToNorm(minHz, scale)));
    const maxNorm = Math.max(0, Math.min(1, hzToNorm(maxHz, scale)));

    const x = elementMetrics.x;
    const y = elementMetrics.y;
    const w = elementMetrics.width;
    const contentWidth = w - pd * 2;

    const label =
      element.label ??
      (spec.parameters[element.parameter]?.label
        ? `${spec.parameters[element.parameter].label} ${element.bandIndex + 1}`
        : `Band ${element.bandIndex + 1}`);

    const editorBg = getCSSColor(
      'frequency-range-bg',
      getCSSColor('range-editor-bg', getCSSColor('color-gray-20', '#020203'))
    );
    const editorRadius = getCSSVariableAsNumber('frequency-range-radius', getCSSVariableAsNumber('range-editor-radius', 12));
    const sliderBg = getCSSColor(
      'frequency-range-slider-bg',
      getCSSColor('range-editor-slider-bg', getCSSColor('color-gray-30', '#0a0b0d'))
    );
    const sliderTrackColor = getCSSColor(
      'frequency-range-slider-track-color',
      getCSSColor('range-editor-slider-track-color', getCSSColor('color-gray-60', '#5a5f66'))
    );
    const sliderActiveColor = getCSSColor(
      'frequency-range-slider-active-color',
      getCSSColor('range-editor-slider-input-active-color', getCSSColor('color-green-90', '#6ee7b7'))
    );
    const sliderRadius = getCSSVariableAsNumber('frequency-range-slider-radius', 4);
    const sliderEdgeThickness = getCSSVariableAsNumber('frequency-range-slider-edge-thickness', 0);
    const sliderEdgeColor = getCSSColor('frequency-range-slider-edge-color', 'transparent');
    const sliderActiveEdgeThickness = getCSSVariableAsNumber('frequency-range-slider-active-edge-thickness', 0);
    const sliderActiveEdgeColor = getCSSColor('frequency-range-slider-active-edge-color', 'transparent');
    const labelColor = getCSSColor(
      'frequency-range-label-color',
      getCSSColor('range-editor-label-color', getCSSColor('color-gray-110', '#a3aeb5'))
    );
    const valueColor = getCSSColor('knob-value-color', getCSSColor('color-gray-130', '#ebeff0'));
    const valueBg = getCSSColor('knob-value-bg', getCSSColor('color-gray-30', '#0a0b0d'));
    const valueFontSize = getCSSVariableAsNumber('knob-value-font-size', 18);
    const valueRadius = getCSSVariableAsNumber('knob-value-radius', 4);
    const valuePaddingH = getCSSVariableAsNumber('knob-value-padding-horizontal', 8);
    const valuePaddingV = getCSSVariableAsNumber('knob-value-padding-vertical', 4);

    // Background (embed-slot)
    this.ctx.fillStyle = editorBg;
    drawRoundedRect(this.ctx, x, y, w, elementMetrics.height, editorRadius);
    this.ctx.fill();

    let currY = y + pd;

    // 1) Label (headline-md)
    this.ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = labelColor;
    this.ctx.fillText(label, x + pd, currY + labelHeight / 2);
    currY += labelHeight + gap;

    // 2) Frequency scale (audio/log mode only): line + ticks + labels
    if (scale === 'audio') {
      const scaleLineY = currY + 4;
      const scaleLineH = 1;
      const scaleLabelY = currY + 4 + scaleLineH + 2 + scaleFontSize / 2;
      const scaleColor = getCSSColor(
        'frequency-range-scale-color',
        getCSSColor('frequency-range-label-color', getCSSColor('color-gray-90', '#5a5f66'))
      );
      this.ctx.fillStyle = scaleColor;
      this.ctx.fillRect(x + pd, scaleLineY, contentWidth, scaleLineH);
      this.ctx.font = `${scaleFontWeight} ${scaleFontSize}px "Space Grotesk", sans-serif`;
      this.ctx.textBaseline = 'middle';
      const tickCount = FREQ_SCALE_TICKS.length;
      FREQ_SCALE_TICKS.forEach(({ hz, label: tickLabel }, i) => {
        const norm = Math.max(0, Math.min(1, hzToNorm(hz, 'audio')));
        const tickX = x + pd + norm * contentWidth;
        this.ctx.fillStyle = scaleColor;
        if (i === 0) this.ctx.textAlign = 'left';
        else if (i === tickCount - 1) this.ctx.textAlign = 'right';
        else this.ctx.textAlign = 'center';
        this.ctx.fillText(tickLabel, tickX, scaleLabelY);
      });
      this.ctx.textAlign = 'left';
      currY += scaleHeightToken + gap;
    }

    // 3) Horizontal range slider
    const sliderX = x + pd;
    const sliderW = contentWidth;
    drawHorizontalRangeSlider(
      this.ctx,
      sliderX,
      currY,
      sliderW,
      sliderHeight,
      minNorm,
      maxNorm,
      sliderBg,
      sliderTrackColor,
      sliderActiveColor,
      sliderRadius,
      false,
      false,
      sliderEdgeThickness,
      sliderEdgeColor,
      sliderActiveEdgeThickness,
      sliderActiveEdgeColor
    );
    currY += sliderHeight + gap;

    // 4) Row: (start) GAP (end) — start left-aligned, end right-aligned
    const rowY = currY;
    const rowCenterY = rowY + inputRowHeight / 2;
    const rowLeft = x + pd;
    const rowRight = x + w - pd;

    const drawValueBox = (val: number, boxX: number, alignRight: boolean): number => {
      const displayText = val.toFixed(0);
      this.ctx.font = `${valueFontSize}px "JetBrains Mono", monospace`;
      const textW = this.ctx.measureText(displayText).width;
      const bgW = textW + valuePaddingH * 2;
      const bgH = valueFontSize + valuePaddingV * 2;
      const drawX = alignRight ? boxX - bgW : boxX;
      const boxCenterX = drawX + bgW / 2;
      this.ctx.fillStyle = valueBg;
      drawRoundedRect(this.ctx, drawX, rowCenterY - bgH / 2, bgW, bgH, valueRadius);
      this.ctx.fill();
      this.ctx.fillStyle = valueColor;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(displayText, boxCenterX, rowCenterY);
      return bgW;
    };

    drawValueBox(minHz, rowLeft, false);
    drawValueBox(maxHz, rowRight, true);

    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
}
