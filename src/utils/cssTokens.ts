/**
 * Utility functions for reading CSS custom properties (CSS variables)
 * Used for canvas rendering and other places where CSS variables need to be accessed from JavaScript
 */

/**
 * Get a CSS custom property value from the root element
 * @param propertyName The CSS variable name (with or without -- prefix)
 * @param fallback Optional fallback value if the property is not found
 * @returns The computed value of the CSS variable
 */
export function getCSSVariable(propertyName: string, fallback?: string): string {
  const name = propertyName.startsWith('--') ? propertyName : `--${propertyName}`;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback || '';
}

/**
 * Get a CSS custom property value as a number
 * @param propertyName The CSS variable name (with or without -- prefix)
 * @param fallback Optional fallback value if the property is not found or cannot be parsed
 * @returns The numeric value of the CSS variable
 */
export function getCSSVariableAsNumber(propertyName: string, fallback: number = 0): number {
  const value = getCSSVariable(propertyName);
  if (!value) return fallback;
  
  // Remove units and parse
  const numericValue = parseFloat(value.replace(/[^\d.-]/g, ''));
  return isNaN(numericValue) ? fallback : numericValue;
}

/**
 * Parse a CSS color value (hex, rgb, rgba, or CSS variable)
 * @param value The color value to parse
 * @returns The parsed color as a hex string (e.g., "#FF0000")
 */
export function parseCSSColor(value: string): string {
  if (!value) return '#000000';
  
  // If it's already a hex color, return it
  if (value.startsWith('#')) {
    return value;
  }
  
  // If it's a CSS variable, resolve it
  if (value.startsWith('var(')) {
    const match = value.match(/var\((--[^)]+)\)/);
    if (match) {
      const resolved = getCSSVariable(match[1]);
      return parseCSSColor(resolved);
    }
  }
  
  // If it's rgb/rgba, convert to hex
  if (value.startsWith('rgb')) {
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return `#${[r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('')}`;
    }
  }
  
  // Fallback
  return value;
}

/**
 * Get a CSS color variable and parse it to a hex color
 * @param propertyName The CSS variable name (with or without -- prefix)
 * @param fallback Optional fallback color if the property is not found
 * @returns The color as a hex string
 */
export function getCSSColor(propertyName: string, fallback: string = '#000000'): string {
  const value = getCSSVariable(propertyName);
  if (!value) return fallback;
  return parseCSSColor(value);
}

/**
 * Parse rgba color from CSS variable
 * @param propertyName The CSS variable name
 * @param fallback Optional fallback rgba value
 * @returns Object with r, g, b, a values (0-255 for rgb, 0-1 for alpha)
 */
export function getCSSColorRGBA(propertyName: string, fallback: { r: number; g: number; b: number; a: number } = { r: 0, g: 0, b: 0, a: 1 }): { r: number; g: number; b: number; a: number } {
  const value = getCSSVariable(propertyName);
  if (!value) return fallback;
  
  // Handle rgba() format
  const rgbaMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
    };
  }
  
  // Handle hex format
  const hex = parseCSSColor(value);
  if (hex.startsWith('#')) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, a: 1 };
  }
  
  return fallback;
}
