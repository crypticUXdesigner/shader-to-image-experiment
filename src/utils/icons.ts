// Icon utility helper
// Provides a simple way to render Tabler icons as SVG elements

import { renderIconOnCanvas as renderIconOnCanvasFromCanvas, getIconDefinition } from './canvas-icons';
import { getTablerNodesOutline, getTablerNodesFilled } from './tabler-icons-loader';

// Load icons on first use (synchronous fallback for immediate use)
function getTablerNodes(variant: 'line' | 'filled'): any {
  if (variant === 'filled') {
    return getTablerNodesFilled();
  } else {
    return getTablerNodesOutline();
  }
}

// Icon name mapping from our internal names to Tabler icon names
const iconNameMap: Record<IconName, string> = {
  'grip-vertical': 'grip-vertical',
  'x': 'x',
  'rotate-cw': 'rotate-clockwise',
  'plus': 'plus',
  'sparkles': 'sparkles',
  'eye': 'eye',
  'eye-off': 'eye-off',
  'power': 'power',
  'chevron-down': 'chevron-down',
  'chevron-right': 'chevron-right',
  'chevron-left': 'chevron-left',
  'maximize-2': 'maximize',
  'minimize-2': 'minimize',
  'play': 'player-play',
  'pause': 'player-pause',
  'mouse-pointer': 'pointer',
  'hand': 'hand-stop',
  'lasso': 'marquee-2',
  'menu': 'menu-2',
  'zoom-in': 'zoom-in',
  'picture-in-picture': 'picture-in-picture',
  'layout-sidebar-right': 'layout-sidebar-right',
  'layout-grid': 'layout-grid',
  'transition-left': 'transition-left',
  'square-x': 'square-x',
  'preset': 'wash-dry-shade',
  'search': 'search',
  'arrows-maximize': 'arrows-maximize',
  'arrows-minimize': 'arrows-minimize',
  'copy': 'copy',
  'photo': 'photo',
  'video': 'video',
  'help-circle': 'help-circle',
};

export type IconName = 
  | 'grip-vertical'
  | 'x'
  | 'rotate-cw'
  | 'plus'
  | 'sparkles'
  | 'eye'
  | 'eye-off'
  | 'power'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'maximize-2'
  | 'minimize-2'
  | 'play'
  | 'pause'
  | 'mouse-pointer'
  | 'hand'
  | 'lasso'
  | 'menu'
  | 'zoom-in'
  | 'picture-in-picture'
  | 'layout-sidebar-right'
  | 'layout-grid'
  | 'transition-left'
  | 'square-x'
  | 'preset'
  | 'search'
  | 'arrows-maximize'
  | 'arrows-minimize'
  | 'copy'
  | 'photo'
  | 'video'
  | 'help-circle';

// Helper to get icon path data from Tabler nodes
function getIconPathData(iconName: string, variant: 'line' | 'filled'): Array<{ d: string }> {
  const nodes = getTablerNodes(variant);
  const iconData = nodes[iconName];
  if (!iconData || !Array.isArray(iconData)) {
    return [];
  }
  
  // Extract path data from the node format: [["path", {d: "..."}], ...]
  return iconData
    .filter((node: any) => Array.isArray(node) && node[0] === 'path' && node[1]?.d)
    .map((node: any) => ({ d: node[1].d }));
}

/**
 * Creates an icon element that can be inserted into DOM
 * @param name Icon name
 * @param size Icon size in pixels (default: 16) - kept for API compatibility, size is controlled via CSS
 * @param color Icon color (default: currentColor)
 * @param className Optional CSS class name
 * @param variant Icon variant - if not provided, will be auto-selected based on icon name
 * @returns SVG element
 */
export function createIconElement(
  name: IconName,
  _size: number = 16,
  color: string = 'currentColor',
  className?: string,
  variant?: 'line' | 'filled'
): SVGElement {
  // Auto-select variant if not provided
  const selectedVariant = variant ?? getIconVariantForIconName(name);
  
  const tablerIconName = iconNameMap[name];
  if (!tablerIconName) {
    throw new Error(`Unknown icon: ${name}`);
  }

  // Get path data from Tabler nodes
  const paths = getIconPathData(tablerIconName, selectedVariant);
  
  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // Note: width and height are NOT set - size is controlled via CSS only
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', selectedVariant === 'filled' ? color : 'none');
  svg.setAttribute('stroke', selectedVariant === 'filled' ? 'none' : color);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  
  if (className) {
    svg.setAttribute('class', className);
  }
  
  // Set inline styles (excluding width/height - controlled via CSS)
  svg.style.display = 'block';
  svg.style.flexShrink = '0';
  svg.style.verticalAlign = 'middle';
  svg.style.pointerEvents = 'none';
  
  // Add path elements from icon data
  if (paths.length > 0) {
    paths.forEach((pathData) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData.d);
      if (selectedVariant === 'filled') {
        path.setAttribute('fill', color);
        path.setAttribute('stroke', 'none');
      } else {
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
      }
      svg.appendChild(path);
    });
  } else {
    // Fallback: draw a simple circle if icon not found
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    path.setAttribute('cx', '12');
    path.setAttribute('cy', '12');
    path.setAttribute('r', '8');
    path.setAttribute('fill', selectedVariant === 'filled' ? color : 'none');
    path.setAttribute('stroke', selectedVariant === 'filled' ? 'none' : color);
    svg.appendChild(path);
  }

  return svg;
}

/**
 * Icon identifiers for node categories and node-specific icons
 */
export type NodeIconIdentifier = 
  | 'audio-waveform'
  | 'grid'
  | 'circle'
  | 'calculator'
  | 'settings'
  | 'move'
  | 'layers'
  | 'square'
  | 'sparkles'
  | 'monitor'
  | 'time-clock'
  | 'wave'
  | 'ripple'
  | 'sphere'
  | 'cube'
  | 'box'
  | 'infinity'
  | 'sparkles-2'
  | 'grain'
  | 'noise'
  | 'hexagon'
  | 'ring'
  | 'rotate'
  | 'blur-circle'
  | 'glow'
  | 'kaleidoscope'
  | 'twist'
  | 'particle'
  | 'gradient'
  | 'rgb-split'
  | 'scanline'
  | 'glitch-block'
  | 'plus'
  | 'minus'
  | 'multiply-x'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'trig-wave'
  | 'arrow-right'
  | 'arrow-down'
  | 'arrow-up'
  | 'arrows-left-right'
  | 'resize'
  | 'ruler'
  | 'vector-dot'
  | 'vector-cross'
  | 'normalize'
  | 'reflect'
  | 'refract'
  | 'constant'
  | 'hash'
  | 'percentage'
  | 'math-min'
  | 'math-max'
  | 'math-max-min'
  | 'math-cos'
  | 'math-tg'
  | 'math-function-y'
  | 'math-symbols'
  | 'math-xy'
  | 'math-function'
  | 'wave-sine'
  | 'bezier'
  | 'color-palette'
  | 'normal-map'
  | 'light'
  | 'dither'
  | 'tone-curve'
  | 'compare'
  | 'select'
  | 'color-wheel'
  | 'color-picker'
  | 'color-swatch'
  | 'chart-scatter'
  | 'chart-scatter-3d'
  | 'brand-planetscale'
  | 'screen-share'
  | 'contrast-2'
  | 'ease-in-out-control-points'
  | 'spiral'
  | 'ikosaedr'
  | 'arrow-move-right'
  | 'arrow-autofit-height'
  | 'arrow-up-right'
  | 'arrows-right-left'
  | 'settings-2'
  | 'layers-union'
  | 'layers-difference'
  | 'blend-mode'
  | 'mask'
  | 'transfer-out'
  | 'adjustments'
  | 'focus'
  | 'glitch'
  | 'displacement'
  | 'brightness';

/**
 * Centralized icon variant selection
 * Gets the variant (line or filled) from the centralized icon registry.
 * This ensures consistent icon styling across the entire application.
 * 
 * All icon definitions (including variant) are in canvas-icons.ts iconRegistry.
 * This function simply retrieves the variant from that registry.
 * 
 * @param iconIdentifier Node icon identifier
 * @returns 'line' or 'filled' variant (defaults to 'line' if icon not found)
 */
export function getIconVariant(iconIdentifier: NodeIconIdentifier | string): 'line' | 'filled' {
  const iconDef = getIconDefinition(iconIdentifier);
  return iconDef?.variant ?? 'line';
}

/**
 * Centralized icon variant selection for IconName types (UI icons)
 * Determines whether an icon should use 'line' or 'filled' style based on the icon name.
 * 
 * @param iconName Icon name
 * @returns 'line' or 'filled' variant
 */
export function getIconVariantForIconName(iconName: IconName): 'line' | 'filled' {
  // Icons that should be filled
  const filledIcons = new Set<IconName>([
    'sparkles',
    'layout-grid',
    'mouse-pointer',
  ]);
  
  if (filledIcons.has(iconName)) {
    return 'filled';
  }
  
  // Default to line for most UI icons
  return 'line';
}

/**
 * Gets a CSS custom property value as a number (for ratios) or string
 * @param propertyName CSS custom property name (e.g., '--icon-stroke-width')
 * @param fallback Fallback value if property is not found
 * @returns Parsed numeric value or fallback
 */
function getIconToken(propertyName: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(propertyName)
    .trim();
  if (!value) return fallback;
  
  // Remove 'px' suffix if present and parse as number
  const numValue = parseFloat(value.replace('px', ''));
  return isNaN(numValue) ? fallback : numValue;
}

/**
 * Gets icon style tokens from CSS custom properties
 * Returns standardized ratios and values for consistent icon rendering
 */
function getIconStyle(size: number) {
  // Get numeric ratios from CSS tokens (these are unitless ratios)
  const ratios = {
    base: getIconToken('--icon-size-base', 1),
    large: getIconToken('--icon-size-large', 0.9),
    medium: getIconToken('--icon-size-medium', 0.8),
    small: getIconToken('--icon-size-small', 0.6),
    tiny: getIconToken('--icon-size-tiny', 0.4),
    half: getIconToken('--icon-spacing-half', 0.5),
    quarter: getIconToken('--icon-spacing-quarter', 0.25),
    eighth: getIconToken('--icon-spacing-eighth', 0.125),
    primary: getIconToken('--icon-element-primary', 0.8),
    secondary: getIconToken('--icon-element-secondary', 0.6),
    tertiary: getIconToken('--icon-element-tertiary', 0.4),
    accent: getIconToken('--icon-element-accent', 0.3),
    gridSpacing: getIconToken('--icon-grid-spacing', 0.25),
    arrowSize: getIconToken('--icon-arrow-size', 0.5),
    arrowWidth: getIconToken('--icon-arrow-width', 0.3),
    circleOuter: getIconToken('--icon-circle-outer', 0.8),
    circleInner: getIconToken('--icon-circle-inner', 0.5),
    circleCenter: getIconToken('--icon-circle-center', 0.3),
    lineLength: getIconToken('--icon-line-length', 0.7),
    lineOffset: getIconToken('--icon-line-offset', 0.15),
  };

  // Get stroke width (in pixels)
  const strokeWidth = getIconToken('--icon-stroke-width', 2);
  
  return {
    size,
    halfSize: size * ratios.half,
    quarterSize: size * ratios.quarter,
    eighthSize: size * ratios.eighth,
    strokeWidth,
    ratios,
    // Computed sizes for convenience
    primary: size * ratios.primary,
    secondary: size * ratios.secondary,
    tertiary: size * ratios.tertiary,
    accent: size * ratios.accent,
    large: size * ratios.large,
    medium: size * ratios.medium,
    small: size * ratios.small,
    tiny: size * ratios.tiny,
  };
}

/**
 * Renders an icon on a canvas context
 * Uses Tabler Icons exclusively - all icons must be mapped in canvas-icons.ts
 * This function delegates to the centralized renderIconOnCanvas from canvas-icons.ts
 * which uses the iconRegistry to get both Tabler icon name and variant.
 * 
 * @param ctx Canvas rendering context
 * @param iconName Icon identifier
 * @param x Center X position
 * @param y Center Y position
 * @param size Icon size in pixels
 * @param color Icon color
 */
export function renderIconOnCanvas(
  ctx: CanvasRenderingContext2D,
  iconName: NodeIconIdentifier | string,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  // Calculate stroke width from CSS tokens for consistent rendering
  const style = getIconStyle(size);
  
  // Delegate to the centralized renderIconOnCanvas which uses the iconRegistry
  // This ensures both DOM and Canvas use the same icon definitions (name + variant)
  renderIconOnCanvasFromCanvas(ctx, iconName, x, y, size, color, style.strokeWidth);
}

/**
 * Creates an icon element for a node icon identifier (can be used in DOM)
 * This is similar to createIconElement but works with NodeIconIdentifier instead of IconName
 * @param iconIdentifier Node icon identifier
 * @param size Icon size in pixels (default: 16) - kept for API compatibility, size is controlled via CSS
 * @param color Icon color (default: currentColor)
 * @param className Optional CSS class name
 * @param variant Icon variant - if not provided, will be auto-selected based on icon identifier
 * @returns SVG element
 */
export function createNodeIconElement(
  iconIdentifier: NodeIconIdentifier | string,
  _size: number = 16,
  color: string = 'currentColor',
  className?: string,
  variant?: 'line' | 'filled'
): SVGElement {
  // Get icon definition from centralized registry
  const iconDef = getIconDefinition(iconIdentifier);
  
  // Use provided variant or get from registry (registry is source of truth)
  const selectedVariant = variant ?? iconDef?.variant ?? 'line';
  const tablerIconName = iconDef?.tablerIconName;
  
  if (!iconDef || !tablerIconName) {
    // Fallback: draw a simple circle if icon not found
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // Note: width and height are NOT set - size is controlled via CSS only
    svg.setAttribute('viewBox', '0 0 24 24');
    // Apply base icon class and any additional classes
    const classes = className ? `icon ${className}` : 'icon';
    svg.setAttribute('class', classes);
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '8');
    circle.setAttribute('fill', selectedVariant === 'filled' ? color : 'none');
    circle.setAttribute('stroke', selectedVariant === 'filled' ? 'none' : color);
    svg.appendChild(circle);
    return svg;
  }

  // Get path data from Tabler nodes using the variant from registry
  const paths = getIconPathData(tablerIconName, selectedVariant);
  
  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // Note: width and height are NOT set - size is controlled via CSS only
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', selectedVariant === 'filled' ? color : 'none');
  svg.setAttribute('stroke', selectedVariant === 'filled' ? 'none' : color);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  
  // Apply base icon class and any additional classes
  const classes = className ? `icon ${className}` : 'icon';
  svg.setAttribute('class', classes);
  
  // Add path elements from icon data
  if (paths.length > 0) {
    paths.forEach((pathData) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData.d);
      if (selectedVariant === 'filled') {
        path.setAttribute('fill', color);
        path.setAttribute('stroke', 'none');
      } else {
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
      }
      svg.appendChild(path);
    });
  } else {
    // Fallback: draw a simple circle if icon not found
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    path.setAttribute('cx', '12');
    path.setAttribute('cy', '12');
    path.setAttribute('r', '8');
    path.setAttribute('fill', selectedVariant === 'filled' ? color : 'none');
    path.setAttribute('stroke', selectedVariant === 'filled' ? 'none' : color);
    svg.appendChild(path);
  }

  return svg;
}

// Re-export canvas icon utilities for convenience
export {
  preloadIcons,
  clearIconCache
} from './canvas-icons';
