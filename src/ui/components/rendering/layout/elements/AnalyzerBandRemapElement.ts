/**
 * Analyzer Band Remap Element Renderer
 *
 * Optional per-band range remap UI on audio-analyzer (same as remap-range: slider row + label/input row).
 * Uses band{N}RemapInMin, band{N}RemapInMax, band{N}RemapOutMin, band{N}RemapOutMax.
 * Needles show live band value (incoming) and remapped value (outgoing).
 */

import type { NodeInstance } from '../../../../../types/nodeGraph';
import type { NodeSpec, AnalyzerBandRemapElement as AnalyzerBandRemapElementType } from '../../../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../../../NodeRenderer';
import type { LayoutElementRenderer, ElementMetrics } from '../LayoutElementRenderer';
import { getCSSVariableAsNumber, getCSSColor } from '../../../../../utils/cssTokens';
import { drawRoundedRect, drawVerticalRangeSlider, drawArrow, drawValueBox } from '../../RenderingUtils';
import { calculateFlexboxLayout } from '../flexbox/FlexboxCalculator';
import type { FlexItem, FlexboxProperties } from '../flexbox/FlexboxTypes';

function paramKey(bandIndex: number, suffix: string): string {
  return `band${bandIndex}Remap${suffix}`;
}

export class AnalyzerBandRemapElementRenderer implements LayoutElementRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  canHandle(element: unknown): boolean {
    return (element as { type?: string })?.type === 'analyzer-band-remap';
  }

  getParam(
    node: NodeInstance,
    spec: NodeSpec,
    bandIndex: number,
    suffix: string,
    fallback: number
  ): number {
    const key = paramKey(bandIndex, suffix);
    const value = node.parameters[key];
    if (typeof value === 'number') return value;
    const def = spec.parameters[key]?.default;
    return typeof def === 'number' ? def : fallback;
  }

  calculateMetrics(
    _element: AnalyzerBandRemapElementType,
    node: NodeInstance,
    _spec: NodeSpec,
    availableWidth: number,
    startY: number,
    metrics: NodeRenderMetrics
  ): ElementMetrics {
    const padding = getCSSVariableAsNumber('remap-range-padding', 18);
    const gap = padding;
    const sliderRowHeight = getCSSVariableAsNumber('remap-range-slider-row-height', 228);
    const inputRowHeight = getCSSVariableAsNumber('remap-range-input-row-height', 30);
    const height = padding + sliderRowHeight + gap + inputRowHeight + padding;

    const gridPadding = getCSSVariableAsNumber('node-body-padding', 18);
    const containerX = node.position.x + gridPadding;
    const containerY = node.position.y + metrics.headerHeight + startY;

    const containerItems: FlexItem[] = [
      {
        id: 'slider-container',
        properties: { width: availableWidth, height }
      }
    ];
    const containerProps: FlexboxProperties = {
      direction: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 0
    };
    const containerLayout = calculateFlexboxLayout(
      containerX,
      containerY,
      availableWidth,
      height,
      containerProps,
      containerItems
    );
    const containerResult = containerLayout.items.get('slider-container');
    if (!containerResult || 'items' in containerResult) {
      return {
        x: containerX,
        y: containerY,
        width: availableWidth,
        height,
        parameterGridPositions: new Map()
      };
    }
    return {
      x: containerLayout.container.x,
      y: containerLayout.container.y,
      width: containerLayout.container.width,
      height: containerLayout.container.height,
      parameterGridPositions: new Map()
    };
  }

  render(
    element: AnalyzerBandRemapElementType,
    node: NodeInstance,
    spec: NodeSpec,
    elementMetrics: ElementMetrics,
    _nodeMetrics: NodeRenderMetrics,
    renderState: {
      audioAnalyzerBandLiveValues?: Map<number, { incoming: number | null; outgoing: number | null }>;
    }
  ): void {
    if (
      elementMetrics.x === undefined || elementMetrics.x === null ||
      elementMetrics.y === undefined || elementMetrics.y === null ||
      elementMetrics.width === undefined || elementMetrics.width === null ||
      elementMetrics.height === undefined || elementMetrics.height === null ||
      elementMetrics.width <= 0 || elementMetrics.height <= 0
    ) {
      console.warn('Invalid analyzer-band-remap element metrics, skipping render', elementMetrics);
      return;
    }

    const bandIndex = element.bandIndex;
    const inMin = this.getParam(node, spec, bandIndex, 'InMin', 0);
    const inMax = this.getParam(node, spec, bandIndex, 'InMax', 1);
    const outMin = this.getParam(node, spec, bandIndex, 'OutMin', 0);
    const outMax = this.getParam(node, spec, bandIndex, 'OutMax', 1);

    const inMinSpec = spec.parameters[paramKey(bandIndex, 'InMin')];
    const inMaxSpec = spec.parameters[paramKey(bandIndex, 'InMax')];
    const outMinSpec = spec.parameters[paramKey(bandIndex, 'OutMin')];
    const outMaxSpec = spec.parameters[paramKey(bandIndex, 'OutMax')];
    const inMinValue = inMinSpec?.min ?? 0;
    const inMaxValue = inMaxSpec?.max ?? 1;
    const outMinValue = outMinSpec?.min ?? 0;
    const outMaxValue = outMaxSpec?.max ?? 1;

    const remapRangeHeight = elementMetrics.height;
    const padding = getCSSVariableAsNumber('remap-range-padding', 18);
    const gap = padding;
    const sliderRowHeight = getCSSVariableAsNumber('remap-range-slider-row-height', 228);
    const inputRowHeight = getCSSVariableAsNumber('remap-range-input-row-height', 30);

    const remapRangeX = elementMetrics.x;
    const remapRangeY = elementMetrics.y;
    const remapRangeWidth = elementMetrics.width;

    const row1X = remapRangeX + padding;
    const row1Y = remapRangeY + padding;
    const row1Width = remapRangeWidth - padding * 2;
    const row1Height = sliderRowHeight;
    const row2Y = remapRangeY + padding + sliderRowHeight + gap;
    const row2Height = inputRowHeight;
    const row2X = remapRangeX + padding;
    const row2Width = remapRangeWidth - padding * 2;

    const normalizeIn = (v: number) =>
      inMaxValue - inMinValue > 0 ? (v - inMinValue) / (inMaxValue - inMinValue) : 0;
    const normalizeOut = (v: number) =>
      outMaxValue - outMinValue > 0 ? (v - outMinValue) / (outMaxValue - outMinValue) : 0;
    const inMinNorm = Math.max(0, Math.min(1, normalizeIn(inMin)));
    const inMaxNorm = Math.max(0, Math.min(1, normalizeIn(inMax)));
    const outMinNorm = Math.max(0, Math.min(1, normalizeOut(outMin)));
    const outMaxNorm = Math.max(0, Math.min(1, normalizeOut(outMax)));

    const editorBg = getCSSColor('remap-range-bg', getCSSColor('range-editor-bg', getCSSColor('color-gray-20', '#020203')));
    const editorRadius = getCSSVariableAsNumber('remap-range-radius', 12);
    /* Use same single padding as audio-file-input slot (embed-slot-pd); no extra editor inset */
    const sliderBg = getCSSColor('remap-range-slider-bg', getCSSColor('range-editor-slider-bg', getCSSColor('color-gray-30', '#0a0b0d')));
    const sliderRadius = getCSSVariableAsNumber('remap-range-slider-radius', 2);
    const sliderTrackColor = getCSSColor('remap-range-slider-track-color', getCSSColor('range-editor-slider-track-color', getCSSColor('color-gray-60', '#5a5f66')));
    const sliderInputActiveColor = getCSSColor('remap-range-slider-input-color', getCSSColor('range-editor-slider-input-active-color', getCSSColor('color-green-90', '#6ee7b7')));
    const sliderOutputActiveColor = getCSSColor('remap-range-slider-output-color', getCSSColor('color-green-90', '#6ee7b7'));
    const sliderWidth = getCSSVariableAsNumber('remap-range-slider-width', 120);
    const connectionColor = getCSSColor('remap-range-connection-color', getCSSColor('range-editor-connection-color', getCSSColor('color-blue-90', '#6565dc')));
    const connectionWidth = getCSSVariableAsNumber('remap-range-connection-width', 2);
    const connectionDash = getCSSVariableAsNumber('remap-range-connection-dash', 4);

    this.ctx.fillStyle = editorBg;
    drawRoundedRect(this.ctx, remapRangeX, remapRangeY, remapRangeWidth, remapRangeHeight, editorRadius);
    this.ctx.fill();

    const sliderHeight = row1Height;
    const inputSliderLeftEdge = row1X;
    const inputSliderCenter = inputSliderLeftEdge + sliderWidth / 2;
    const outputSliderRightEdge = row1X + row1Width;
    const outputSliderCenter = outputSliderRightEdge - sliderWidth / 2;
    const outputSliderLeftEdge = outputSliderCenter - sliderWidth / 2;
    const sliderY = row1Y;

    drawVerticalRangeSlider(
      this.ctx,
      inputSliderCenter, sliderY, sliderWidth, sliderHeight,
      inMinNorm, inMaxNorm,
      sliderBg, sliderTrackColor, sliderInputActiveColor,
      sliderRadius, false, false
    );
    drawVerticalRangeSlider(
      this.ctx,
      outputSliderCenter, sliderY, sliderWidth, sliderHeight,
      outMinNorm, outMaxNorm,
      sliderBg, sliderTrackColor, sliderOutputActiveColor,
      sliderRadius, false, false
    );

    const inputTopY = sliderY + (1 - inMaxNorm) * sliderHeight;
    const inputBottomY = sliderY + (1 - inMinNorm) * sliderHeight;
    const outputTopY = sliderY + (1 - outMaxNorm) * sliderHeight;
    const outputBottomY = sliderY + (1 - outMinNorm) * sliderHeight;
    const gradientX1 = inputSliderLeftEdge + sliderWidth;
    const gradientX2 = outputSliderLeftEdge;
    const areaGradient = this.ctx.createLinearGradient(gradientX1, 0, gradientX2, 0);
    areaGradient.addColorStop(0, sliderInputActiveColor);
    areaGradient.addColorStop(1, sliderOutputActiveColor);
    this.ctx.fillStyle = areaGradient;
    this.ctx.globalAlpha = 0.3;
    this.ctx.beginPath();
    this.ctx.moveTo(gradientX1, inputTopY);
    this.ctx.lineTo(gradientX2, outputTopY);
    this.ctx.lineTo(gradientX2, outputBottomY);
    this.ctx.lineTo(gradientX1, inputBottomY);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.globalAlpha = 1.0;

    this.ctx.strokeStyle = connectionColor;
    this.ctx.lineWidth = connectionWidth;
    this.ctx.setLineDash([connectionDash, connectionDash]);
    this.ctx.globalAlpha = 0.5;
    drawArrow(this.ctx, gradientX1, inputTopY, gradientX2, outputTopY, connectionColor, connectionWidth);
    drawArrow(this.ctx, gradientX1, inputBottomY, gradientX2, outputBottomY, connectionColor, connectionWidth);
    this.ctx.setLineDash([]);
    this.ctx.globalAlpha = 1.0;

    const live = renderState.audioAnalyzerBandLiveValues?.get(bandIndex);
    if (live && (live.incoming != null || live.outgoing != null)) {
      const needleColor = getCSSColor('remap-range-needle-color', '#ffffff');
      const needleWidth = getCSSVariableAsNumber('remap-range-needle-width', 3);
      const needleExtend = getCSSVariableAsNumber('remap-range-needle-extend', 4);
      const scaleMin = Math.min(inMin, outMin);
      const scaleMax = Math.max(inMax, outMax);
      const scaleRange = scaleMax - scaleMin || 1;
      const valueToY = (v: number) => {
        const t = (v - scaleMin) / scaleRange;
        const tClamped = Math.max(0, Math.min(1, t));
        return sliderY + (1 - tClamped) * sliderHeight;
      };
      this.ctx.save();
      this.ctx.strokeStyle = needleColor;
      this.ctx.lineWidth = needleWidth;
      this.ctx.lineCap = 'round';
      this.ctx.setLineDash([]);
      this.ctx.globalAlpha = 1;
      if (live.incoming != null) {
        const needleY = valueToY(live.incoming);
        this.ctx.beginPath();
        this.ctx.moveTo(inputSliderLeftEdge - needleExtend, needleY);
        this.ctx.lineTo(gradientX1 + needleExtend, needleY);
        this.ctx.stroke();
      }
      if (live.outgoing != null) {
        const needleY = valueToY(live.outgoing);
        this.ctx.beginPath();
        this.ctx.moveTo(outputSliderLeftEdge - needleExtend, needleY);
        this.ctx.lineTo(outputSliderRightEdge + needleExtend, needleY);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    const row2ContentX = row2X;
    const row2ContentWidth = row2Width;
    const groupGap = getCSSVariableAsNumber('remap-range-input-group-gap', 24);
    const dashWidth = getCSSVariableAsNumber('remap-range-input-dash-width', 20);
    const itemSpacing = getCSSVariableAsNumber('remap-range-input-item-spacing', 6);
    const labelFontSize = getCSSVariableAsNumber('remap-range-input-label-font-size', 18);
    const labelFontWeight = getCSSVariableAsNumber('remap-range-input-label-font-weight', 600);
    const labelColor = getCSSColor('remap-range-input-label-color', getCSSColor('range-editor-label-color', getCSSColor('color-gray-110', '#a3aeb5')));
    const row2CenterY = row2Y + row2Height / 2;
    const groupWidth = (row2ContentWidth - groupGap) / 2;
    const leftGroupX = row2ContentX;
    const rightGroupX = row2ContentX + groupWidth + groupGap;
    const labelInWidth = getCSSVariableAsNumber('remap-range-input-label-in-width', 30);
    const labelOutWidth = getCSSVariableAsNumber('remap-range-input-label-out-width', 30);

    const drawGroup = (
      groupX: number,
      labelText: string,
      labelWidth: number,
      minVal: number,
      maxVal: number,
      labelAtEnd: boolean
    ) => {
      const valueSlotWidth = (groupWidth - labelWidth - dashWidth - 3 * itemSpacing) / 2;
      const labelFont = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
      this.ctx.font = labelFont;
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = labelColor;
      let x = groupX;
      if (!labelAtEnd) {
        this.ctx.textAlign = 'left';
        this.ctx.fillText(labelText, x, row2CenterY);
        x += labelWidth + itemSpacing;
      }
      drawValueBox(this.ctx, minVal, x + valueSlotWidth / 2, row2CenterY, {
        paramType: 'float',
        align: 'center',
        width: valueSlotWidth
      });
      x += valueSlotWidth + itemSpacing;
      this.ctx.font = labelFont;
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = labelColor;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('—', x + dashWidth / 2, row2CenterY);
      x += dashWidth + itemSpacing;
      drawValueBox(this.ctx, maxVal, x + valueSlotWidth / 2, row2CenterY, {
        paramType: 'float',
        align: 'center',
        width: valueSlotWidth
      });
      x += valueSlotWidth + itemSpacing;
      if (labelAtEnd) {
        this.ctx.font = labelFont;
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = labelColor;
        this.ctx.textAlign = 'right';
        this.ctx.fillText(labelText, x + labelWidth, row2CenterY);
      }
    };

    drawGroup(leftGroupX, 'in', labelInWidth, inMin, inMax, false);
    drawGroup(rightGroupX, 'out', labelOutWidth, outMin, outMax, true);

    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
  }
}
