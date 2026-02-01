/**
 * Shared rendering utilities
 *
 * Common helper methods used by multiple renderers.
 */

import { getCSSColor, getCSSColorRGBA, getCSSVariableAsNumber } from '../../../utils/cssTokens';

/** Short display labels for port types in the node UI. */
const PORT_TYPE_DISPLAY_LABELS: Record<string, string> = {
  float: 'flt',
  vec2: 'v2',
  vec3: 'v3',
  vec4: 'v4',
};

/**
 * Return the short display label for a port type (e.g. float → flt, vec2 → v2).
 * Unknown types are returned as-is.
 */
export function getPortTypeDisplayLabel(type: string): string {
  return PORT_TYPE_DISPLAY_LABELS[type] ?? type;
}

/**
 * Options for the value-box primitive (rounded background + formatted number).
 * Used by InputParameterRenderer, KnobParameterRenderer, and RemapRangeElement row-2.
 *
 * Token set: `input-value-font-size`, `input-value-color`, `input-value-bg`,
 * `input-value-radius`, `input-value-padding-horizontal`, `input-value-padding-vertical`,
 * `input-value-animated-color` (all from tokens-canvas.css).
 *
 * @param paramType - 'int' rounds; 'float' uses toFixed(3)
 * @param isAnimated - when true, text uses input-value-animated-color (e.g. connected state)
 * @param align - 'center': (x,y) is box center; 'top': (x,y) is top-center of box
 * @param width - optional max width (e.g. for Remap row); box width = min(measured, width)
 */
export interface DrawValueBoxOptions {
  paramType?: 'int' | 'float';
  isAnimated?: boolean;
  align?: 'center' | 'top';
  width?: number;
}

/**
 * Draw a value box (rounded background + mono numeric text).
 * Uses only `input-*` tokens. Callers: InputParameterRenderer, KnobParameterRenderer, RemapRangeElement row-2.
 */
export function drawValueBox(
  ctx: CanvasRenderingContext2D,
  value: number,
  x: number,
  y: number,
  options?: DrawValueBoxOptions
): void {
  const paramType = options?.paramType ?? 'float';
  const isAnimated = options?.isAnimated ?? false;
  const align = options?.align ?? 'center';
  const maxWidth = options?.width;

  const fontSize = getCSSVariableAsNumber('input-value-font-size', 18);
  const color = isAnimated
    ? getCSSColor('input-value-animated-color', '#2f8a6b')
    : getCSSColor('input-value-color', '#ebeff0');
  const bg = getCSSColor('input-value-bg', '#000000d9');
  const radius = getCSSVariableAsNumber('input-value-radius', 6);
  const paddingH = getCSSVariableAsNumber('input-value-padding-horizontal', 16);
  const paddingV = getCSSVariableAsNumber('input-value-padding-vertical', 6);

  const displayText =
    paramType === 'int' ? Math.round(value).toString() : value.toFixed(3);

  ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textMetrics = ctx.measureText(displayText);
  let boxWidth = textMetrics.width + paddingH * 2;
  if (typeof maxWidth === 'number' && maxWidth > 0) {
    boxWidth = Math.min(boxWidth, maxWidth);
  }
  const boxHeight = fontSize + paddingV * 2;

  let boxX: number;
  let boxY: number;
  let textY: number;
  if (align === 'top') {
    boxX = x - boxWidth / 2;
    boxY = y;
    textY = y + boxHeight / 2; // (x,y) is top-center; draw text at box center
  } else {
    boxX = x - boxWidth / 2;
    boxY = y - boxHeight / 2;
    textY = y;
  }

  ctx.fillStyle = bg;
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, radius);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillText(displayText, x, textY);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * Draw a rounded rectangle on the canvas
 */
export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw a rounded rectangle to a Path2D
 */
export function drawRoundedRectToPath(
  path: Path2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  path.moveTo(x + radius, y);
  path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius);
  path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
  path.closePath();
}

/**
 * Draw a vertical range slider (track + active region, optional hover/dragging styling).
 * Used by RangeParameterRenderer, RemapRangeElement, and NodeRenderer (legacy range-editor path).
 * Bottom = low value, top = high value.
 */
export function drawVerticalRangeSlider(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  minNorm: number,
  maxNorm: number,
  bgColor: string,
  trackColor: string,
  activeColor: string,
  radius: number,
  isHovered: boolean = false,
  isDragging: boolean = false
): void {
  const trackX = x;
  const trackWidth = width;
  const trackLeft = trackX - trackWidth / 2;
  
  // Draw full slider track background (inactive areas)
  ctx.fillStyle = bgColor;
  drawRoundedRect(ctx, trackLeft, y, trackWidth, height, radius);
  ctx.fill();
  
  // Draw track border for better definition
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, trackLeft, y, trackWidth, height, radius);
  ctx.stroke();
  
  // Draw active range (between min and max handles)
  const actualMinNorm = Math.min(minNorm, maxNorm);
  const actualMaxNorm = Math.max(minNorm, maxNorm);
  const activeTopY = y + (1 - actualMaxNorm) * height;
  const activeBottomY = y + (1 - actualMinNorm) * height;
  const activeHeight = Math.max(0, activeBottomY - activeTopY);
  if (activeHeight > 0) {
    ctx.fillStyle = activeColor;
    drawRoundedRect(ctx, trackLeft, activeTopY, trackWidth, activeHeight, radius);
    ctx.fill();
  }
  
  // Draw edge highlighting when hovering or dragging
  if (isHovered || isDragging) {
    const highlightWidth = 2;
    const highlightOpacity = 0.6;
    
    ctx.fillStyle = `rgba(255, 255, 255, ${highlightOpacity})`;
    ctx.fillRect(trackLeft, y, trackWidth, highlightWidth);
    ctx.fillRect(trackLeft, y + height - highlightWidth, trackWidth, highlightWidth);
  }
}

/**
 * Draw a horizontal range slider with two handles
 * Left = low value (0), right = high value (1)
 * Optional track edge strips: edgeThickness + edgeColor.
 * Optional active-range edge strips: activeEdgeThickness + activeEdgeColor.
 */
export function drawHorizontalRangeSlider(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  minNorm: number,
  maxNorm: number,
  bgColor: string,
  trackColor: string,
  activeColor: string,
  radius: number,
  isHovered: boolean = false,
  isDragging: boolean = false,
  edgeThickness: number = 0,
  edgeColor?: string,
  activeEdgeThickness: number = 0,
  activeEdgeColor?: string
): void {
  // Draw full slider track background (inactive areas)
  ctx.fillStyle = bgColor;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  // Draw track border for better definition
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();

  // Draw active range (between min and max handles)
  const actualMinNorm = Math.min(minNorm, maxNorm);
  const actualMaxNorm = Math.max(minNorm, maxNorm);
  const activeLeft = x + actualMinNorm * width;
  const activeWidth = Math.max(0, (actualMaxNorm - actualMinNorm) * width);
  if (activeWidth > 0) {
    ctx.fillStyle = activeColor;
    drawRoundedRect(ctx, activeLeft, y, activeWidth, height, radius);
    ctx.fill();

    // Draw configurable left/right edge strips on the active range
    if (activeEdgeThickness > 0 && activeEdgeColor) {
      const tw = Math.min(activeEdgeThickness, activeWidth / 2);
      ctx.fillStyle = activeEdgeColor;
      ctx.fillRect(activeLeft, y, tw, height);
      ctx.fillRect(activeLeft + activeWidth - tw, y, tw, height);
    }
  }

  // Draw configurable left/right edge strips (full track)
  if (edgeThickness > 0 && edgeColor) {
    ctx.fillStyle = edgeColor;
    ctx.fillRect(x, y, edgeThickness, height);
    ctx.fillRect(x + width - edgeThickness, y, edgeThickness, height);
  }

  // Draw edge highlighting when hovering or dragging
  if (isHovered || isDragging) {
    const highlightHeight = 2;
    const highlightOpacity = 0.6;

    ctx.fillStyle = `rgba(255, 255, 255, ${highlightOpacity})`;
    ctx.fillRect(x, y, highlightHeight, height);
    ctx.fillRect(x + width - highlightHeight, y, highlightHeight, height);
  }
}

/**
 * Draw an arrow from point (x1, y1) to point (x2, y2)
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  
  // Draw arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowSize = 6;
  const arrowX = x2 - Math.cos(angle) * arrowSize;
  const arrowY = y2 - Math.sin(angle) * arrowSize;
  
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(arrowX - Math.cos(angle - Math.PI / 6) * arrowSize, arrowY - Math.sin(angle - Math.PI / 6) * arrowSize);
  ctx.lineTo(arrowX - Math.cos(angle + Math.PI / 6) * arrowSize, arrowY - Math.sin(angle + Math.PI / 6) * arrowSize);
  ctx.closePath();
  ctx.fill();
}

/** State for parameter port drawing (hover, connecting, connected). */
export interface ParameterPortState {
  isHovered: boolean;
  isConnecting?: boolean;
  isConnected?: boolean;
}

/** Minimal metrics needed for parameter cell rendering (cell + label). */
export interface ParameterCellMetrics {
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  labelX: number;
  labelY: number;
}

/** State passed to renderParameterCell (skipPorts, hover, connected). */
export interface ParameterCellRenderState {
  skipPorts: boolean;
  isHovered: boolean;
  isConnected: boolean;
}

/** Mode button data when showModeButton is true (symbol + connected state for colors). */
export interface ParameterCellModeOptions {
  symbol: string;
  isConnected: boolean;
}

/**
 * Options for renderParameterCell. Callers pass precomputed positions (e.g. portY from label height).
 * Token usage: param-cell-* (bg, border), param-label-*, param-mode-button-*; port uses 04's drawParameterPort.
 */
export interface RenderParameterCellOptions {
  labelText: string;
  showModeButton?: boolean;
  mode?: ParameterCellModeOptions;
  modeButtonX?: number;
  modeButtonY?: number;
  skipPorts?: boolean;
  portType?: string;
  portX?: number;
  portY?: number;
  portScale?: number;
}

/**
 * Draw the shared parameter cell shell: background, border, label, optional mode button, and port (via 04's primitive).
 * Used by InputParameterRenderer, KnobParameterRenderer, ToggleParameterRenderer, EnumParameterRenderer.
 * Draw order: cell bg → port → label → mode. Does not draw the control (value box, knob, toggle, enum).
 *
 * Tokens: param-cell-bg, param-cell-bg-end, param-cell-bg-connected, param-cell-bg-gradient-ellipse-* (when not connected),
 * param-cell-border, param-cell-border-connected, param-cell-border-radius, param-label-font-size,
 * param-label-font-weight, param-label-color,
 * param-mode-button-size, param-mode-button-bg, param-mode-button-color-static, param-mode-button-color-connected,
 * param-mode-button-font-size, param-mode-button-font-weight, param-mode-button-text-offset-y.
 * Port is drawn via drawParameterPort (package 04).
 *
 * @param ctx - Canvas 2D context
 * @param metrics - Cell/label metrics (cellX/Y/Width/Height, labelX/Y)
 * @param state - skipPorts, isHovered, isConnected
 * @param options - labelText, showModeButton, mode (symbol, isConnected), modeButtonX/Y, portType, portX, portY, portScale
 */
export function renderParameterCell(
  ctx: CanvasRenderingContext2D,
  metrics: ParameterCellMetrics,
  state: ParameterCellRenderState,
  options: RenderParameterCellOptions
): void {
  const skipPorts = state.skipPorts ?? options.skipPorts ?? false;
  const isConnected = state.isConnected;

  // (a) Cell background and border (param-cell-*)
  const cellBg = getCSSColor('param-cell-bg', getCSSColor('color-gray-30', '#050507'));
  const cellBgEnd = getCSSColor('param-cell-bg-end', 'transparent');
  const cellBgConnectedRGBA = getCSSColorRGBA('param-cell-bg-connected', {
    r: 255,
    g: 255,
    b: 255,
    a: 0.5
  });
  const cellBgConnected = `rgba(${cellBgConnectedRGBA.r}, ${cellBgConnectedRGBA.g}, ${cellBgConnectedRGBA.b}, ${cellBgConnectedRGBA.a})`;
  const cellBorderRadius = getCSSVariableAsNumber('param-cell-border-radius', 6);

  if (isConnected) {
    ctx.fillStyle = cellBgConnected;
    drawRoundedRect(
      ctx,
      metrics.cellX,
      metrics.cellY,
      metrics.cellWidth,
      metrics.cellHeight,
      cellBorderRadius
    );
    ctx.fill();
  } else {
    // Radial gradient (start → end) using ellipse controls
    const ew = (metrics.cellWidth * getCSSVariableAsNumber('param-cell-bg-gradient-ellipse-width', 100)) / 100;
    const eh = (metrics.cellHeight * getCSSVariableAsNumber('param-cell-bg-gradient-ellipse-height', 100)) / 100;
    const ex = metrics.cellX + (metrics.cellWidth * getCSSVariableAsNumber('param-cell-bg-gradient-ellipse-x', 50)) / 100;
    const ey = metrics.cellY + (metrics.cellHeight * getCSSVariableAsNumber('param-cell-bg-gradient-ellipse-y', 50)) / 100;
    const gradientRadius = Math.max(ew, eh) / 2;
    const gradient = ctx.createRadialGradient(ex, ey, 0, ex, ey, gradientRadius);
    gradient.addColorStop(0, cellBg);
    gradient.addColorStop(1, cellBgEnd);
    ctx.save();
    drawRoundedRect(
      ctx,
      metrics.cellX,
      metrics.cellY,
      metrics.cellWidth,
      metrics.cellHeight,
      cellBorderRadius
    );
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(metrics.cellX, metrics.cellY, metrics.cellWidth, metrics.cellHeight);
    ctx.restore();
  }

  const borderColor = getCSSColor(
    isConnected ? 'param-cell-border-connected' : 'param-cell-border',
    getCSSColor('color-gray-70', '#282b31')
  );
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  drawRoundedRect(
    ctx,
    metrics.cellX,
    metrics.cellY,
    metrics.cellWidth,
    metrics.cellHeight,
    cellBorderRadius
  );
  ctx.stroke();

  // (b) Port when !skipPorts and port options provided (04's primitive)
  if (
    !skipPorts &&
    options.portType != null &&
    options.portX != null &&
    options.portY != null &&
    options.portScale != null
  ) {
    drawParameterPort(ctx, options.portX, options.portY, options.portType, {
      isHovered: state.isHovered,
      isConnected: state.isConnected
    }, options.portScale);
  }

  // (c) Label (param-label-*)
  const labelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
  const labelFontWeight = getCSSVariableAsNumber('param-label-font-weight', 600);
  const labelColor = getCSSColor('param-label-color', getCSSColor('color-gray-110', '#a3aeb5'));
  ctx.font = `${labelFontWeight} ${labelFontSize}px "Space Grotesk", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillStyle = labelColor;
  ctx.fillText(options.labelText, metrics.labelX, metrics.labelY);

  // (d) Mode button when showModeButton and mode + position provided (param-mode-button-*)
  if (
    options.showModeButton &&
    options.mode != null &&
    options.modeButtonX != null &&
    options.modeButtonY != null
  ) {
    const modeButtonSize = getCSSVariableAsNumber('param-mode-button-size', 20);
    const modeButtonBg = getCSSColor(
      'param-mode-button-bg',
      getCSSColor('color-gray-50', '#111317')
    );
    ctx.fillStyle = modeButtonBg;
    ctx.beginPath();
    ctx.arc(options.modeButtonX, options.modeButtonY, modeButtonSize / 2, 0, Math.PI * 2);
    ctx.fill();

    const modeButtonColorToken = options.mode.isConnected
      ? 'param-mode-button-color-connected'
      : 'param-mode-button-color-static';
    ctx.fillStyle = getCSSColor(
      modeButtonColorToken,
      options.mode.isConnected
        ? getCSSColor('color-gray-130', '#ebeff0')
        : getCSSColor('color-gray-60', '#5a5f66')
    );
    const modeButtonFontSize = getCSSVariableAsNumber('param-mode-button-font-size', 18);
    const modeButtonFontWeight = getCSSVariableAsNumber('param-mode-button-font-weight', 500);
    const modeButtonTextOffsetY = getCSSVariableAsNumber('param-mode-button-text-offset-y', 0);
    ctx.font = `${modeButtonFontWeight} ${modeButtonFontSize}px "Space Grotesk", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      options.mode.symbol,
      options.modeButtonX,
      options.modeButtonY + modeButtonTextOffsetY
    );
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

const PORT_COLOR_TOKEN_MAP: Record<string, string> = {
  float: 'port-color-float',
  int: 'port-color-float',
  vec2: 'port-color-vec2',
  vec3: 'port-color-vec3',
  vec4: 'port-color-vec4',
};

const PORT_CONNECTED_COLOR_TOKEN_MAP: Record<string, string> = {
  float: 'port-connected-color-float',
  int: 'port-connected-color-float',
  vec2: 'port-connected-color-vec2',
  vec3: 'port-connected-color-vec3',
  vec4: 'port-connected-color-vec4',
};

/**
 * Draw the shared parameter port primitive (highlight + circle, optional border).
 * Used by InputParameterRenderer, KnobParameterRenderer, ToggleParameterRenderer, EnumParameterRenderer.
 *
 * Tokens: port-radius, param-port-size (callers pass scale = param-port-size/port-radius),
 * port-border-width, port-border-color, port-color-float/vec2/vec3/vec4, port-color-default,
 * port-connected-color-float/vec2/vec3/vec4, port-connected-color-default,
 * port-hover-color, port-dragging-color, port-hover-outer-opacity, port-dragging-outer-opacity.
 * All colors and opacity use getCSSColorRGBA for consistent behavior.
 *
 * @param ctx - Canvas 2D context
 * @param x - Port center X
 * @param y - Port center Y
 * @param type - Port type for color: 'float' | 'int' | 'vec2' | 'vec3' | 'vec4'
 * @param state - { isHovered, isConnecting?, isConnected? }
 * @param scale - Scale factor (e.g. param-port-size / port-radius from metrics)
 */
export function drawParameterPort(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: string,
  state: ParameterPortState,
  scale: number
): void {
  const radius = getCSSVariableAsNumber('port-radius', 4) * scale;
  const opacity = 1.0;

  // (a) Highlight when hovered or connecting
  if (state.isHovered || state.isConnecting) {
    const highlightRadius = radius * 3.5;
    if (state.isConnecting) {
      const c = getCSSColorRGBA('port-dragging-color', { r: 0, g: 255, b: 136, a: 1 });
      const outerOpacity = getCSSVariableAsNumber('port-dragging-outer-opacity', 0.6) * opacity;
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${outerOpacity})`;
    } else {
      const c = getCSSColorRGBA('port-hover-color', { r: 33, g: 150, b: 243, a: 1 });
      const outerOpacity = getCSSVariableAsNumber('port-hover-outer-opacity', 0.3) * opacity;
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${outerOpacity})`;
    }
    ctx.beginPath();
    ctx.arc(x, y, highlightRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // (b) Port circle fill: hover/dragging > connected > type color
  if (state.isHovered || state.isConnecting) {
    if (state.isConnecting) {
      const c = getCSSColorRGBA('port-dragging-color', { r: 0, g: 255, b: 136, a: 1 });
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${opacity})`;
    } else {
      const c = getCSSColorRGBA('port-hover-color', { r: 33, g: 150, b: 243, a: 1 });
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${opacity})`;
    }
  } else if (state.isConnected) {
    const connectedTokenName = PORT_CONNECTED_COLOR_TOKEN_MAP[type] ?? 'port-connected-color-default';
    const colorRGBA = getCSSColorRGBA(connectedTokenName, { r: 81, g: 89, b: 97, a: 1 });
    ctx.fillStyle = `rgba(${colorRGBA.r}, ${colorRGBA.g}, ${colorRGBA.b}, ${opacity})`;
  } else {
    const tokenName = PORT_COLOR_TOKEN_MAP[type] ?? 'port-color-default';
    const colorRGBA = getCSSColorRGBA(tokenName, { r: 102, g: 102, b: 102, a: 1 });
    ctx.fillStyle = `rgba(${colorRGBA.r}, ${colorRGBA.g}, ${colorRGBA.b}, ${opacity})`;
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // (c) Border when port-border-width > 0
  const borderWidth = getCSSVariableAsNumber('port-border-width', 0);
  if (borderWidth > 0) {
    const borderRGBA = getCSSColorRGBA('port-border-color', { r: 255, g: 255, b: 255, a: 1 });
    ctx.strokeStyle = `rgba(${borderRGBA.r}, ${borderRGBA.g}, ${borderRGBA.b}, ${borderRGBA.a * opacity})`;
    ctx.lineWidth = borderWidth;
    ctx.beginPath();
    ctx.arc(x, y, radius + borderWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}
