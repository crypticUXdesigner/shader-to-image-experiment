/**
 * String and Array Parameter Rendering Utilities
 * 
 * Shared utilities for rendering string and array parameters on canvas.
 * Used by NodeRenderer, GridElement, and AutoGridElement to ensure consistent
 * rendering of string (file selection) and array (frequency bands) parameters.
 */

import { getCSSColor, getCSSVariableAsNumber } from '../../utils/cssTokens';
import type { ParameterSpec } from '../../types/nodeSpec';

/**
 * Draw a rounded rectangle on a canvas context
 */
function drawRoundedRect(
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
 * Render a string parameter (file selection button style)
 * 
 * @param ctx - Canvas rendering context
 * @param x - X position
 * @param y - Y position
 * @param width - Width of the parameter area
 * @param height - Height of the parameter area
 * @param paramName - Parameter name
 * @param paramSpec - Parameter specification
 * @param value - String value (file path)
 */
export function renderStringParameter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  paramName: string,
  paramSpec: ParameterSpec,
  value: string
): void {
  const padding = 8;
  const buttonWidth = 100;
  const paramLabelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
  const paramLabelFontWeight = getCSSVariableAsNumber('param-label-font-weight', 600);
  const buttonFontSize = getCSSVariableAsNumber('param-mode-button-font-size', 18);
  const buttonFontWeight = getCSSVariableAsNumber('param-mode-button-font-weight', 500);
  
  // Parameter label (left side) — headline-md
  const paramLabelColor = getCSSColor('node-param-label-color', getCSSColor('color-gray-100', '#747e87'));
  ctx.fillStyle = paramLabelColor;
  ctx.font = `${paramLabelFontWeight} ${paramLabelFontSize}px "Space Grotesk", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(paramSpec.label || paramName, x + padding, y + height / 2 + 4);
  
  // Button area (right side)
  const buttonX = x + width - buttonWidth - padding;
  const buttonBg = getCSSColor('node-bg', getCSSColor('color-gray-30', '#050507'));
  const buttonBorder = getCSSColor('node-border', getCSSColor('color-gray-100', '#747e87'));
  
  // Draw button background
  ctx.fillStyle = buttonBg;
  ctx.strokeStyle = buttonBorder;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, buttonX, y + 2, buttonWidth, height - 4, 4);
  ctx.fill();
  ctx.stroke();
  
  // Button text - show filename if file is selected, otherwise show "Select File" — button style
  const buttonTextColor = getCSSColor('node-param-value-color', '#333333');
  ctx.fillStyle = buttonTextColor;
  ctx.font = `${buttonFontWeight} ${buttonFontSize}px "Space Grotesk", sans-serif`;
  ctx.textAlign = 'center';
  
  let buttonText = 'Select File';
  if (value && value.trim() !== '') {
    // Extract filename from path (handle both full paths and just filenames)
    const filename = value.split('/').pop() || value.split('\\').pop() || value;
    // Truncate if too long
    if (filename.length > 15) {
      buttonText = filename.substring(0, 12) + '...';
    } else {
      buttonText = filename;
    }
  }
  
  ctx.fillText(buttonText, buttonX + buttonWidth / 2, y + height / 2 + 4);
  ctx.textAlign = 'left';
}

/**
 * Render an array parameter (frequency bands display)
 * 
 * @param ctx - Canvas rendering context
 * @param x - X position
 * @param y - Y position
 * @param width - Width of the parameter area
 * @param height - Height of the parameter area
 * @param paramName - Parameter name
 * @param paramSpec - Parameter specification
 * @param value - Array value (frequency bands or other array data)
 */
export function renderArrayParameter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  paramName: string,
  paramSpec: ParameterSpec,
  value: any
): void {
  const padding = 8;
  const valueWidth = 50;
  const paramLabelFontSize = getCSSVariableAsNumber('param-label-font-size', 18);
  const paramLabelFontWeight = getCSSVariableAsNumber('param-label-font-weight', 600);
  const inputValueFontSize = getCSSVariableAsNumber('input-value-font-size', 18);
  
  // Parameter label (left side) — headline-md
  const paramLabelColor = getCSSColor('node-param-label-color', getCSSColor('color-gray-100', '#747e87'));
  ctx.fillStyle = paramLabelColor;
  ctx.font = `${paramLabelFontWeight} ${paramLabelFontSize}px "Space Grotesk", sans-serif`;
  ctx.textAlign = 'left';
  const labelText = paramSpec.label || paramName;
  ctx.fillText(labelText, x + padding, y + height / 2 + 4);
  
  // Display frequency bands (right side) — input style
  const bandsTextColor = getCSSColor('node-param-value-color', '#333333');
  ctx.fillStyle = bandsTextColor;
  ctx.font = `${inputValueFontSize}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'right';
  
  if (Array.isArray(value) && value.length > 0) {
    // Format bands as "20-120, 120-300, ..." (compact, no "Hz" suffix to save space)
    const bandsText = value.map((band: any, index: number) => {
      if (Array.isArray(band) && band.length >= 2) {
        const minHz = Math.round(band[0]);
        const maxHz = Math.round(band[1]);
        return `${minHz}-${maxHz}`;
      }
      return `B${index}`;
    }).join(', ');
    
    // Calculate available width for value (similar to renderParameter)
    const valueX = x + width - valueWidth - padding;
    const labelWidth = ctx.measureText(labelText).width;
    const availableWidth = valueX - (x + padding + labelWidth) - 8; // 8px gap between label and value
    
    // Truncate if too long
    let displayText = bandsText;
    if (ctx.measureText(displayText).width > availableWidth) {
      // Truncate and add ellipsis
      while (ctx.measureText(displayText + '...').width > availableWidth && displayText.length > 0) {
        displayText = displayText.slice(0, -1);
      }
      displayText += '...';
    }
    
    ctx.fillText(displayText, valueX + valueWidth, y + height / 2 + 4);
  } else {
    ctx.fillText('No bands', x + width - padding, y + height / 2 + 4);
  }
  
  ctx.textAlign = 'left';
}

/**
 * Measure text width with current canvas font settings
 * 
 * @param ctx - Canvas rendering context
 * @param text - Text to measure
 * @returns Width of the text in pixels
 */
export function measureText(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}

/**
 * Truncate text to fit within a given width, adding ellipsis if needed
 * 
 * @param ctx - Canvas rendering context
 * @param text - Text to truncate
 * @param maxWidth - Maximum width in pixels
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  
  let truncated = text;
  while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}
