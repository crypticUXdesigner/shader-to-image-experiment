/**
 * Parameter hit-region helpers
 *
 * Hit regions are derived from the same token/size inputs as rendering. See:
 * drawValueBox, renderParameterCell, drawParameterPort (packages 02, 03, 04),
 * and RemapRangeElement layout for remap. This ensures hit-test and visuals stay in sync.
 */

import type { NodeInstance } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { getParameterUIRegistry } from '../rendering/ParameterUIRegistry';

/** Parameter grid position (same shape as NodeRenderMetrics.parameterGridPositions values). */
export interface ParameterGridPosition {
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
}

export interface HitRegionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HitRegionCircle {
  cx: number;
  cy: number;
  r: number;
}

export interface ParameterControlHitRegions {
  rects: HitRegionRect[];
  circles: HitRegionCircle[];
}

/**
 * Value-box hit rect using the same token set and size/position rules as drawValueBox (02).
 * Tokens: input-value-font-size, input-value-padding-horizontal, input-value-padding-vertical.
 * align 'center': (x,y) is box center.
 */
export function getValueBoxHitRect(
  x: number,
  y: number,
  options?: { width?: number }
): HitRegionRect {
  const fontSize = getCSSVariableAsNumber('input-value-font-size', 18);
  const paddingH = getCSSVariableAsNumber('input-value-padding-horizontal', 16);
  const paddingV = getCSSVariableAsNumber('input-value-padding-vertical', 6);
  const boxHeight = fontSize + paddingV * 2;
  // Conservative width for hit-test (typical "0.000" / "-1.000" style text)
  const estimatedTextWidth = fontSize * 6;
  let boxWidth = estimatedTextWidth + paddingH * 2;
  if (typeof options?.width === 'number' && options.width > 0) {
    boxWidth = Math.min(boxWidth, options.width);
  }
  return {
    x: x - boxWidth / 2,
    y: y - boxHeight / 2,
    w: boxWidth,
    h: boxHeight
  };
}

function pointInRect(px: number, py: number, r: HitRegionRect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function pointInCircle(px: number, py: number, c: HitRegionCircle): boolean {
  const dx = px - c.cx;
  const dy = py - c.cy;
  return dx * dx + dy * dy <= c.r * c.r;
}

/**
 * Returns true if (px, py) lies in any of the given regions.
 */
export function isPointInParameterRegions(
  px: number,
  py: number,
  regions: ParameterControlHitRegions
): boolean {
  for (const r of regions.rects) {
    if (pointInRect(px, py, r)) return true;
  }
  for (const c of regions.circles) {
    if (pointInCircle(px, py, c)) return true;
  }
  return false;
}

/**
 * Get parameter control hit regions using the same token/size inputs and layout rules
 * as the parameter renderers (toggle-width/height, knob-size, input-value-*, enum-selector-*).
 * Used by HitTestManager so hit-test does not re-implement layout.
 */
export function getParameterControlHitRegions(
  spec: NodeSpec,
  paramName: string,
  gridPos: ParameterGridPosition
): ParameterControlHitRegions | null {
  const registry = getParameterUIRegistry();
  let renderer;
  try {
    renderer = registry.getRenderer(spec, paramName);
  } catch {
    return null;
  }
  const uiType = renderer.getUIType();
  const rects: HitRegionRect[] = [];
  const circles: HitRegionCircle[] = [];

  if (uiType === 'toggle') {
    const toggleWidth = getCSSVariableAsNumber('toggle-width', 48);
    const toggleHeight = getCSSVariableAsNumber('toggle-height', 24);
    rects.push({
      x: gridPos.knobX - toggleWidth / 2,
      y: gridPos.knobY - toggleHeight / 2,
      w: toggleWidth,
      h: toggleHeight
    });
  } else if (uiType === 'enum') {
    const cellPadding = getCSSVariableAsNumber('param-cell-padding', 12);
    const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
    const selectorSpacing = getCSSVariableAsNumber('param-label-knob-spacing', 20);
    const selectorHeight = getCSSVariableAsNumber('enum-selector-height', 32);
    const labelBottom = gridPos.labelY + labelFontSize;
    const selectorY = labelBottom + selectorSpacing;
    const selectorX = gridPos.cellX + cellPadding;
    const selectorWidth = gridPos.cellWidth - cellPadding * 2;
    rects.push({
      x: selectorX,
      y: selectorY,
      w: selectorWidth,
      h: selectorHeight
    });
  } else if (uiType === 'knob') {
    const knobSize = getCSSVariableAsNumber('knob-size', 45);
    const interactionRadius = knobSize / 2 + 10;
    circles.push({ cx: gridPos.knobX, cy: gridPos.knobY, r: interactionRadius });
    const valueBox = getValueBoxHitRect(gridPos.valueX, gridPos.valueY);
    rects.push(valueBox);
  } else if (uiType === 'input') {
    const valueBox = getValueBoxHitRect(gridPos.knobX, gridPos.knobY);
    rects.push(valueBox);
  } else {
    return null;
  }

  return { rects, circles };
}

/** Remap hit region: one of rect or circle, tagged with paramName. */
export interface RemapHitRegion {
  paramName: string;
  rect?: HitRegionRect;
  circle?: HitRegionCircle;
}

/** Element metrics shape used by remap (x, y, width, height). */
export interface RemapElementMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Result of getRemapHitRegions: regions plus layout used for "which slider" testing. */
export interface RemapHitRegionsResult {
  regions: RemapHitRegion[];
  inputSliderCenter: number;
  outputSliderCenter: number;
  sliderInteractionWidth: number;
}

/**
 * Get remap hit regions using the same token names and layout math as RemapRangeElement.render().
 * Tokens: remap-range-padding, remap-range-slider-row-height, remap-range-editor-padding,
 * remap-range-slider-width, remap-range-input-* (including remap-range-input-label-in-width,
 * remap-range-input-label-out-width); range-editor-handle-size for handle radius.
 * zoom is used to scale interaction radii so hit areas match visual size.
 */
export function getRemapHitRegions(
  node: NodeInstance,
  spec: NodeSpec,
  elementMetrics: RemapElementMetrics,
  zoom: number
): RemapHitRegionsResult {
  const regions: RemapHitRegion[] = [];
  const padding = getCSSVariableAsNumber('remap-range-padding', 12);
  const gap = padding;
  const sliderRowHeight = getCSSVariableAsNumber('remap-range-slider-row-height', 228);
  const inputRowHeight = getCSSVariableAsNumber('remap-range-input-row-height', 30);
  const editorPadding = getCSSVariableAsNumber('remap-range-editor-padding', 12);
  const sliderWidth = getCSSVariableAsNumber('remap-range-slider-width', 120);
  const handleSize = getCSSVariableAsNumber('range-editor-handle-size', 12);
  const topMargin = 12;
  const bottomMargin = 12;

  const remapRangeX = elementMetrics.x;
  const remapRangeY = elementMetrics.y;
  const remapRangeWidth = elementMetrics.width;
  const row1X = remapRangeX + padding;
  const row1Y = remapRangeY + padding;
  const row1Width = remapRangeWidth - padding * 2;
  const row1Height = sliderRowHeight;
  const sliderHeight = row1Height - topMargin - bottomMargin;
  const sliderY = row1Y + topMargin;

  const inputSliderLeftEdge = row1X + editorPadding;
  const inputSliderCenter = inputSliderLeftEdge + sliderWidth / 2;
  const outputSliderRightEdge = row1X + row1Width - editorPadding;
  const outputSliderCenter = outputSliderRightEdge - sliderWidth / 2;

  const handleInteractionRadius = (handleSize / 2 + 10) / zoom;
  const sliderInteractionWidth = (sliderWidth + 20) / zoom;

  const inMin = (node.parameters.inMin ?? spec.parameters.inMin?.default ?? 0) as number;
  const inMax = (node.parameters.inMax ?? spec.parameters.inMax?.default ?? 1) as number;
  const outMin = (node.parameters.outMin ?? spec.parameters.outMin?.default ?? 0) as number;
  const outMax = (node.parameters.outMax ?? spec.parameters.outMax?.default ?? 1) as number;
  const inMinSpec = spec.parameters.inMin;
  const inMaxSpec = spec.parameters.inMax;
  const outMinSpec = spec.parameters.outMin;
  const outMaxSpec = spec.parameters.outMax;
  const inMinValue = inMinSpec?.min ?? 0;
  const inMaxValue = inMaxSpec?.max ?? 1;
  const outMinValue = outMinSpec?.min ?? 0;
  const outMaxValue = outMaxSpec?.max ?? 1;
  const normalizeIn = (v: number) =>
    inMaxValue - inMinValue > 0 ? (v - inMinValue) / (inMaxValue - inMinValue) : 0;
  const normalizeOut = (v: number) =>
    outMaxValue - outMinValue > 0 ? (v - outMinValue) / (outMaxValue - outMinValue) : 0;
  const inMinNorm = Math.max(0, Math.min(1, normalizeIn(inMin)));
  const inMaxNorm = Math.max(0, Math.min(1, normalizeIn(inMax)));
  const outMinNorm = Math.max(0, Math.min(1, normalizeOut(outMin)));
  const outMaxNorm = Math.max(0, Math.min(1, normalizeOut(outMax)));

  const handleYInMin = sliderY + (1 - inMinNorm) * sliderHeight;
  const handleYInMax = sliderY + (1 - inMaxNorm) * sliderHeight;
  const handleYOutMin = sliderY + (1 - outMinNorm) * sliderHeight;
  const handleYOutMax = sliderY + (1 - outMaxNorm) * sliderHeight;

  regions.push({
    paramName: 'inMin',
    circle: { cx: inputSliderCenter, cy: handleYInMin, r: handleInteractionRadius }
  });
  regions.push({
    paramName: 'inMax',
    circle: { cx: inputSliderCenter, cy: handleYInMax, r: handleInteractionRadius }
  });
  regions.push({
    paramName: 'outMin',
    circle: { cx: outputSliderCenter, cy: handleYOutMin, r: handleInteractionRadius }
  });
  regions.push({
    paramName: 'outMax',
    circle: { cx: outputSliderCenter, cy: handleYOutMax, r: handleInteractionRadius }
  });

  const row2Y = remapRangeY + padding + sliderRowHeight + gap;
  const row2X = remapRangeX + padding;
  const row2Width = remapRangeWidth - padding * 2;
  const row2ContentX = row2X + editorPadding;
  const row2ContentWidth = row2Width - editorPadding * 2;
  const groupGap = getCSSVariableAsNumber('remap-range-input-group-gap', 24);
  const dashWidth = getCSSVariableAsNumber('remap-range-input-dash-width', 20);
  const itemSpacing = getCSSVariableAsNumber('remap-range-input-item-spacing', 6);
  const labelInWidth = getCSSVariableAsNumber('remap-range-input-label-in-width', 30);
  const labelOutWidth = getCSSVariableAsNumber('remap-range-input-label-out-width', 30);
  const groupWidth = (row2ContentWidth - groupGap) / 2;
  const leftGroupX = row2ContentX;
  const rightGroupX = row2ContentX + groupWidth + groupGap;
  const valueSlotWidthLeft = (groupWidth - labelInWidth - dashWidth - 3 * itemSpacing) / 2;
  const valueSlotWidthRight = (groupWidth - labelOutWidth - dashWidth - 3 * itemSpacing) / 2;

  const inMinX = leftGroupX + labelInWidth + itemSpacing;
  const inMaxX = inMinX + valueSlotWidthLeft + itemSpacing + dashWidth + itemSpacing;
  const outMinX = rightGroupX;
  const outMaxX = rightGroupX + valueSlotWidthRight + itemSpacing + dashWidth + itemSpacing;

  regions.push({
    paramName: 'inMin',
    rect: { x: inMinX, y: row2Y, w: valueSlotWidthLeft, h: inputRowHeight }
  });
  regions.push({
    paramName: 'inMax',
    rect: { x: inMaxX, y: row2Y, w: valueSlotWidthLeft, h: inputRowHeight }
  });
  regions.push({
    paramName: 'outMin',
    rect: { x: outMinX, y: row2Y, w: valueSlotWidthRight, h: inputRowHeight }
  });
  regions.push({
    paramName: 'outMax',
    rect: { x: outMaxX, y: row2Y, w: valueSlotWidthRight, h: inputRowHeight }
  });

  return {
    regions,
    inputSliderCenter,
    outputSliderCenter,
    sliderInteractionWidth
  };
}

/**
 * Test (px, py) against a RemapHitRegionsResult. Slider handles first (by x-distance), then row-2 boxes.
 */
export function testRemapHit(
  px: number,
  py: number,
  result: RemapHitRegionsResult
): string | null {
  return testRemapHitRegions(
    px,
    py,
    result.regions,
    result.sliderInteractionWidth,
    result.inputSliderCenter,
    result.outputSliderCenter
  );
}

function bandRemapParamKey(bandIndex: number, suffix: string): string {
  return `band${bandIndex}Remap${suffix}`;
}

/**
 * Get remap hit regions for audio-analyzer band remap (same layout as getRemapHitRegions,
 * but reads band{N}RemapInMin/InMax/OutMin/OutMax and returns regions with those param names).
 */
export function getAnalyzerBandRemapHitRegions(
  node: NodeInstance,
  spec: NodeSpec,
  elementMetrics: RemapElementMetrics,
  bandIndex: number,
  zoom: number
): RemapHitRegionsResult {
  const regions: RemapHitRegion[] = [];
  const padding = getCSSVariableAsNumber('remap-range-padding', 12);
  const gap = padding;
  const sliderRowHeight = getCSSVariableAsNumber('remap-range-slider-row-height', 228);
  const inputRowHeight = getCSSVariableAsNumber('remap-range-input-row-height', 30);
  const editorPadding = getCSSVariableAsNumber('remap-range-editor-padding', 12);
  const sliderWidth = getCSSVariableAsNumber('remap-range-slider-width', 120);
  const handleSize = getCSSVariableAsNumber('range-editor-handle-size', 12);
  const topMargin = 12;
  const bottomMargin = 12;

  const remapRangeX = elementMetrics.x;
  const remapRangeY = elementMetrics.y;
  const remapRangeWidth = elementMetrics.width;
  const row1X = remapRangeX + padding;
  const row1Y = remapRangeY + padding;
  const row1Width = remapRangeWidth - padding * 2;
  const row1Height = sliderRowHeight;
  const sliderHeight = row1Height - topMargin - bottomMargin;
  const sliderY = row1Y + topMargin;

  const inputSliderLeftEdge = row1X + editorPadding;
  const inputSliderCenter = inputSliderLeftEdge + sliderWidth / 2;
  const outputSliderRightEdge = row1X + row1Width - editorPadding;
  const outputSliderCenter = outputSliderRightEdge - sliderWidth / 2;

  const handleInteractionRadius = (handleSize / 2 + 10) / zoom;
  const sliderInteractionWidth = (sliderWidth + 20) / zoom;

  const inMin = (node.parameters[bandRemapParamKey(bandIndex, 'InMin')] ?? spec.parameters[bandRemapParamKey(bandIndex, 'InMin')]?.default ?? 0) as number;
  const inMax = (node.parameters[bandRemapParamKey(bandIndex, 'InMax')] ?? spec.parameters[bandRemapParamKey(bandIndex, 'InMax')]?.default ?? 1) as number;
  const outMin = (node.parameters[bandRemapParamKey(bandIndex, 'OutMin')] ?? spec.parameters[bandRemapParamKey(bandIndex, 'OutMin')]?.default ?? 0) as number;
  const outMax = (node.parameters[bandRemapParamKey(bandIndex, 'OutMax')] ?? spec.parameters[bandRemapParamKey(bandIndex, 'OutMax')]?.default ?? 1) as number;
  const inMinSpec = spec.parameters[bandRemapParamKey(bandIndex, 'InMin')];
  const inMaxSpec = spec.parameters[bandRemapParamKey(bandIndex, 'InMax')];
  const outMinSpec = spec.parameters[bandRemapParamKey(bandIndex, 'OutMin')];
  const outMaxSpec = spec.parameters[bandRemapParamKey(bandIndex, 'OutMax')];
  const inMinValue = inMinSpec?.min ?? 0;
  const inMaxValue = inMaxSpec?.max ?? 1;
  const outMinValue = outMinSpec?.min ?? 0;
  const outMaxValue = outMaxSpec?.max ?? 1;
  const normalizeIn = (v: number) =>
    inMaxValue - inMinValue > 0 ? (v - inMinValue) / (inMaxValue - inMinValue) : 0;
  const normalizeOut = (v: number) =>
    outMaxValue - outMinValue > 0 ? (v - outMinValue) / (outMaxValue - outMinValue) : 0;
  const inMinNorm = Math.max(0, Math.min(1, normalizeIn(inMin)));
  const inMaxNorm = Math.max(0, Math.min(1, normalizeIn(inMax)));
  const outMinNorm = Math.max(0, Math.min(1, normalizeOut(outMin)));
  const outMaxNorm = Math.max(0, Math.min(1, normalizeOut(outMax)));

  const inMinParam = bandRemapParamKey(bandIndex, 'InMin');
  const inMaxParam = bandRemapParamKey(bandIndex, 'InMax');
  const outMinParam = bandRemapParamKey(bandIndex, 'OutMin');
  const outMaxParam = bandRemapParamKey(bandIndex, 'OutMax');

  const handleYInMin = sliderY + (1 - inMinNorm) * sliderHeight;
  const handleYInMax = sliderY + (1 - inMaxNorm) * sliderHeight;
  const handleYOutMin = sliderY + (1 - outMinNorm) * sliderHeight;
  const handleYOutMax = sliderY + (1 - outMaxNorm) * sliderHeight;

  regions.push({ paramName: inMinParam, circle: { cx: inputSliderCenter, cy: handleYInMin, r: handleInteractionRadius } });
  regions.push({ paramName: inMaxParam, circle: { cx: inputSliderCenter, cy: handleYInMax, r: handleInteractionRadius } });
  regions.push({ paramName: outMinParam, circle: { cx: outputSliderCenter, cy: handleYOutMin, r: handleInteractionRadius } });
  regions.push({ paramName: outMaxParam, circle: { cx: outputSliderCenter, cy: handleYOutMax, r: handleInteractionRadius } });

  const row2Y = remapRangeY + padding + sliderRowHeight + gap;
  const row2X = remapRangeX + padding;
  const row2Width = remapRangeWidth - padding * 2;
  const row2ContentX = row2X + editorPadding;
  const row2ContentWidth = row2Width - editorPadding * 2;
  const groupGap = getCSSVariableAsNumber('remap-range-input-group-gap', 24);
  const dashWidth = getCSSVariableAsNumber('remap-range-input-dash-width', 20);
  const itemSpacing = getCSSVariableAsNumber('remap-range-input-item-spacing', 6);
  const labelInWidth = getCSSVariableAsNumber('remap-range-input-label-in-width', 30);
  const labelOutWidth = getCSSVariableAsNumber('remap-range-input-label-out-width', 30);
  const groupWidth = (row2ContentWidth - groupGap) / 2;
  const leftGroupX = row2ContentX;
  const rightGroupX = row2ContentX + groupWidth + groupGap;
  const valueSlotWidthLeft = (groupWidth - labelInWidth - dashWidth - 3 * itemSpacing) / 2;
  const valueSlotWidthRight = (groupWidth - labelOutWidth - dashWidth - 3 * itemSpacing) / 2;

  const inMinX = leftGroupX + labelInWidth + itemSpacing;
  const inMaxX = inMinX + valueSlotWidthLeft + itemSpacing + dashWidth + itemSpacing;
  const outMinX = rightGroupX;
  const outMaxX = rightGroupX + valueSlotWidthRight + itemSpacing + dashWidth + itemSpacing;

  regions.push({ paramName: inMinParam, rect: { x: inMinX, y: row2Y, w: valueSlotWidthLeft, h: inputRowHeight } });
  regions.push({ paramName: inMaxParam, rect: { x: inMaxX, y: row2Y, w: valueSlotWidthLeft, h: inputRowHeight } });
  regions.push({ paramName: outMinParam, rect: { x: outMinX, y: row2Y, w: valueSlotWidthRight, h: inputRowHeight } });
  regions.push({ paramName: outMaxParam, rect: { x: outMaxX, y: row2Y, w: valueSlotWidthRight, h: inputRowHeight } });

  return {
    regions,
    inputSliderCenter,
    outputSliderCenter,
    sliderInteractionWidth
  };
}

/**
 * Test (px, py) against remap regions. Slider handles are tested first (by distance to cursor),
 * then row-2 boxes. Returns the first matching paramName or null.
 * Matches HitTestManager order: input/output slider handles first (by x-distance), then row-2 by x.
 */
function testRemapHitRegions(
  px: number,
  py: number,
  regions: RemapHitRegion[],
  sliderInteractionWidth: number,
  inputSliderCenter: number,
  outputSliderCenter: number
): string | null {
  const distToInput = Math.abs(px - inputSliderCenter);
  const distToOutput = Math.abs(px - outputSliderCenter);
  const isNearInput = distToInput <= sliderInteractionWidth / 2;
  const isNearOutput = distToOutput <= sliderInteractionWidth / 2;

  const handleRegions = regions.filter((r) => r.circle != null);
  const boxRegions = regions.filter((r) => r.rect != null);

  const isInHandle = (p: string) => p === 'inMin' || p === 'inMax' || p.endsWith('RemapInMin') || p.endsWith('RemapInMax');
  const isOutHandle = (p: string) => p === 'outMin' || p === 'outMax' || p.endsWith('RemapOutMin') || p.endsWith('RemapOutMax');

  if (isNearInput && (!isNearOutput || distToInput < distToOutput)) {
    const inHandles = handleRegions.filter((r) => isInHandle(r.paramName));
    let best: { paramName: string; dist: number } | null = null;
    for (const r of inHandles) {
      if (!r.circle) continue;
      const d = Math.abs(py - r.circle.cy);
      if (d <= r.circle.r && (best == null || d < best.dist)) {
        best = { paramName: r.paramName, dist: d };
      }
    }
    if (best) return best.paramName;
  }
  if (isNearOutput && (!isNearInput || distToOutput < distToInput)) {
    const outHandles = handleRegions.filter((r) => isOutHandle(r.paramName));
    let best: { paramName: string; dist: number } | null = null;
    for (const r of outHandles) {
      if (!r.circle) continue;
      const d = Math.abs(py - r.circle.cy);
      if (d <= r.circle.r && (best == null || d < best.dist)) {
        best = { paramName: r.paramName, dist: d };
      }
    }
    if (best) return best.paramName;
  }

  for (const r of boxRegions) {
    if (!r.rect) continue;
    if (pointInRect(px, py, r.rect)) return r.paramName;
  }
  return null;
}
