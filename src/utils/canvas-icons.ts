/**
 * Canvas Icon Renderer
 *
 * Provides efficient SVG-to-canvas rendering with caching.
 * Uses Phosphor Icons exclusively. Path data from public/phosphor-nodes-*.json
 * (see scripts/build-phosphor-icons.ts). https://phosphoricons.com
 *
 * CENTRALIZED ICON DEFINITION SYSTEM:
 * - All icons are defined once here with phosphorIconName + variant (line/filled)
 * - line → Phosphor "regular" weight; filled → Phosphor "fill" weight
 * - Phosphor path data is 256×256; we scale to 24×24 at render time.
 */

import { getPhosphorNodesOutline, getPhosphorNodesFilled } from './phosphor-icons-loader';

/**
 * Icon definition: Phosphor icon name (kebab-case, as in JSON keys) + variant
 */
export type IconVariant = 'line' | 'filled';

export interface IconDefinition {
  phosphorIconName: string;
  variant: IconVariant;
}

type CanonicalIconId = `${string}:${IconVariant}`;

function canonicalId(phosphorIconName: string, variant: IconVariant): CanonicalIconId {
  return `${phosphorIconName}:${variant}`;
}

/**
 * A canonical icon identity is self-describing: "phosphor-icon-name:variant".
 * We intentionally do not keep a second "canonical registry" list here — the
 * Phosphor icon set is already enumerated in `public/phosphor-nodes-*.json`.
 */
function iconDefinitionFromCanonicalId(id: CanonicalIconId): IconDefinition {
  const sepIdx = id.lastIndexOf(':');
  const phosphorIconName = id.slice(0, sepIdx);
  const variant = id.slice(sepIdx + 1) as IconVariant;
  return { phosphorIconName, variant };
}

/**
 * Human/app-facing icon names are aliases that resolve to canonical identities.
 * This prevents "new names" from silently creating new icon definitions.
 */
const iconAliases: Record<string, CanonicalIconId> = {
  // Basic shapes
  'circle': canonicalId('circle', 'filled'),
  'circle-dotted': canonicalId('circle-dashed', 'line'),
  'square': canonicalId('square', 'line'),
  'star': canonicalId('star', 'line'),
  'flower': canonicalId('flower', 'line'),
  'square-rounded-corners': canonicalId('square', 'line'),
  'rectangle': canonicalId('rectangle', 'line'),
  'hexagon': canonicalId('hexagon', 'line'),
  'sphere': canonicalId('sphere', 'line'),
  'cube': canonicalId('cube', 'filled'),
  'cube-transparent': canonicalId('cube-transparent', 'line'),
  'box': canonicalId('cube', 'line'),
  'cylinder': canonicalId('cylinder', 'line'),
  'ring': canonicalId('circle', 'line'),
  'rings': canonicalId('circle', 'line'),
  'infinity': canonicalId('infinity', 'line'),
  'sparkles-2': canonicalId('sparkle', 'line'),
  'circle-dashed': canonicalId('circle-dashed', 'line'),
  'car': canonicalId('headlights', 'line'),
  'headlights': canonicalId('headlights', 'line'),
  'droplets': canonicalId('drop', 'line'),

  // Patterns & grids
  'grid': canonicalId('grid-four', 'line'),
  'grid-nine': canonicalId('grid-nine', 'line'),
  'dither': canonicalId('checkerboard', 'line'),
  'grain': canonicalId('dots-nine', 'line'),
  'noise': canonicalId('dots-nine', 'line'),
  'particle': canonicalId('dots-nine', 'line'),
  'cell': canonicalId('squares-four', 'line'),
  'cloud': canonicalId('cloud', 'line'),
  'curly-loop': canonicalId('infinity', 'line'),
  'hexagons': canonicalId('hexagon', 'line'),
  'dots': canonicalId('dot', 'line'),
  'dots-nine': canonicalId('dots-nine', 'line'),
  'spray': canonicalId('dots-three', 'line'),
  'atom-2': canonicalId('atom', 'line'),
  'topology-star-ring': canonicalId('star', 'line'),
  'sunrise': canonicalId('sun', 'line'),
  'triangles': canonicalId('caret-up', 'line'),
  'streak': canonicalId('arrow-down-right', 'line'),
  'shape-2': canonicalId('shapes', 'line'),
  'shapes-filled': canonicalId('shapes', 'filled'),
  'layout-board': canonicalId('squares-four', 'line'),
  'kaleidoscope': canonicalId('shapes', 'line'),
  'compass-rose': canonicalId('compass-rose', 'line'),

  // Audio & waveforms
  'audio-waveform': canonicalId('wave-sine', 'line'),
  'wave': canonicalId('wave-sine', 'line'),
  'waves': canonicalId('waves', 'line'),
  'ripple': canonicalId('wave-sine', 'line'),
  'trig-wave': canonicalId('wave-sine', 'line'),
  'music-note-simple': canonicalId('music-note-simple', 'line'),

  // Math & operations
  'calculator': canonicalId('calculator', 'line'),
  'plus': canonicalId('plus', 'filled'),
  'minus': canonicalId('minus', 'filled'),
  'multiply-x': canonicalId('asterisk', 'filled'),
  'divide': canonicalId('divide', 'line'),
  'power': canonicalId('caret-up', 'line'),
  'sqrt': canonicalId('function', 'line'),
  'constant': canonicalId('hash', 'line'),
  'hash': canonicalId('hash', 'line'),
  'hash-straight': canonicalId('hash-straight', 'line'),
  'percentage': canonicalId('percent', 'line'),
  'math-min': canonicalId('caret-down', 'line'),
  'math-max': canonicalId('caret-up', 'line'),
  'math-max-min': canonicalId('arrows-vertical', 'line'),
  'math-cos': canonicalId('wave-sine', 'line'),
  'math-tg': canonicalId('wave-sine', 'line'),
  'math-function-y': canonicalId('function', 'line'),
  'math-symbols': canonicalId('plus-minus', 'line'),
  'math-xy': canonicalId('grid-four', 'line'),
  'math-function': canonicalId('function', 'line'),
  'wave-sine': canonicalId('wave-sine', 'line'),

  // Vectors & geometry
  'arrow-right': canonicalId('arrow-right', 'line'),
  'arrow-square-right': canonicalId('arrow-square-right', 'line'),
  'arrow-down': canonicalId('arrow-down', 'line'),
  'arrow-up': canonicalId('arrow-up', 'line'),
  'arrows-left-right': canonicalId('arrows-left-right', 'line'),
  'arrows-right-left': canonicalId('arrows-left-right', 'line'),
  'vector-dot': canonicalId('dot', 'filled'),
  'vector-cross': canonicalId('x', 'line'),
  'vector-two': canonicalId('vector-two', 'line'),
  'vector-three': canonicalId('vector-three', 'line'),
  'normalize': canonicalId('arrows-vertical', 'line'),
  'reflect': canonicalId('arrows-left-right', 'line'),
  'refract': canonicalId('circle-half', 'line'),
  'bezier': canonicalId('bezier-curve', 'line'),
  'normal-map': canonicalId('circle-half', 'line'),

  // Transform & movement
  'move': canonicalId('arrows-out', 'line'),
  'rotate': canonicalId('arrow-clockwise', 'line'),
  'resize': canonicalId('arrows-out-simple', 'line'),
  'twist': canonicalId('arrow-clockwise', 'line'),
  'arrow-move-right': canonicalId('arrow-right', 'line'),
  'arrow-autofit-height': canonicalId('arrows-vertical', 'line'),
  'arrow-up-right': canonicalId('arrow-up-right', 'line'),
  'arrow-big-right': canonicalId('arrow-fat-right', 'line'),
  'flip-horizontal': canonicalId('arrows-left-right', 'line'),
  'zoom-in': canonicalId('magnifying-glass-plus', 'line'),
  'spiral': canonicalId('spiral', 'line'),
  'ikosaedr': canonicalId('cube', 'line'),

  // Effects & filters
  'blur-circle': canonicalId('circle-half', 'line'),
  'glow': canonicalId('sun', 'filled'),
  'scanline': canonicalId('scan', 'line'),
  'rgb-split': canonicalId('arrows-out', 'line'),
  'glitch-block': canonicalId('grid-four', 'line'),
  'adjustments': canonicalId('sliders', 'line'),
  'focus': canonicalId('crosshair', 'line'),
  'glitch': canonicalId('lightning', 'line'),
  'displacement': canonicalId('arrows-out', 'line'),
  'brightness': canonicalId('sun', 'line'),
  'fish-simple': canonicalId('fish-simple', 'line'),
  'perspective': canonicalId('perspective', 'line'),

  // Color & gradients
  'color-palette': canonicalId('palette', 'line'),
  'color-wheel': canonicalId('circle-half', 'filled'),
  'color-picker': canonicalId('eyedropper', 'line'),
  'color-swatch': canonicalId('palette', 'line'),
  'gradient': canonicalId('gradient', 'line'),
  'ease-in-out-control-points': canonicalId('chart-line', 'line'),

  // Coordinates
  'chart-scatter': canonicalId('chart-scatter', 'line'),
  'chart-scatter-3d': canonicalId('chart-scatter', 'line'),

  // Special icons
  'brand-planetscale': canonicalId('database', 'filled'),
  'screen-share': canonicalId('share', 'line'),
  'contrast-2': canonicalId('circle-half', 'line'),

  // UI & controls
  'settings': canonicalId('gear', 'line'),
  'settings-2': canonicalId('gear', 'line'),
  'monitor': canonicalId('desktop', 'line'),
  'video': canonicalId('video', 'line'),
  'time-clock': canonicalId('clock', 'line'),
  'layers': canonicalId('stack', 'line'),
  'layers-selected': canonicalId('stack', 'line'),
  'layers-union': canonicalId('stack', 'line'),
  'layers-difference': canonicalId('stack-minus', 'line'),
  'blend-mode': canonicalId('circles-four', 'line'),
  'sparkles': canonicalId('sparkle', 'filled'),
  'light': canonicalId('lightbulb', 'filled'),
  'lightbulb': canonicalId('lightbulb', 'line'),
  'ruler': canonicalId('ruler', 'line'),
  'tone-curve': canonicalId('chart-line', 'line'),
  'select': canonicalId('selection', 'line'),
  'compare': canonicalId('columns', 'line'),
  'columns-plus-right': canonicalId('columns-plus-right', 'line'),
  'mask': canonicalId('frame-corners', 'line'),

  // Utility operations
  'transfer-out': canonicalId('arrow-square-out', 'line'),

  // Additional Phosphor icons (direct aliases, default to line)
  'aperture': canonicalId('aperture', 'line'),
  'asterisk-simple': canonicalId('asterisk-simple', 'line'),
  'asterisk': canonicalId('asterisk', 'line'),
  'alien': canonicalId('alien', 'line'),
  'angle': canonicalId('angle', 'line'),
  'approximate-equals': canonicalId('approximate-equals', 'line'),
  'arrows-in-simple': canonicalId('arrows-in-simple', 'line'),
  'arrows-out': canonicalId('arrows-out', 'line'),
  'arrows-out-simple': canonicalId('arrows-out-simple', 'line'),
  'barcode': canonicalId('barcode', 'line'),
  'beach-ball': canonicalId('beach-ball', 'line'),
  'basketball': canonicalId('basketball', 'line'),
  'biohazard': canonicalId('biohazard', 'line'),
  'boules': canonicalId('boules', 'line'),
  'brain': canonicalId('brain', 'line'),
  'broadcast': canonicalId('broadcast', 'line'),
  'checkerboard': canonicalId('checkerboard', 'line'),
  'circle-half-tilt': canonicalId('circle-half-tilt', 'line'),
  'circle-notch': canonicalId('circle-notch', 'line'),
  'circuitry': canonicalId('circuitry', 'line'),
  'corners-in': canonicalId('corners-in', 'line'),
  'corners-out': canonicalId('corners-out', 'line'),
  'cpu': canonicalId('cpu', 'line'),
  'crosshair': canonicalId('crosshair', 'line'),
  'crosshair-simple': canonicalId('crosshair-simple', 'line'),
  'diamonds-four': canonicalId('diamonds-four', 'line'),
  'diamonds': canonicalId('diamonds', 'line'),
  'dice-four': canonicalId('dice-four', 'line'),
  'dice-five': canonicalId('dice-five', 'line'),
  'dice-six': canonicalId('dice-six', 'line'),
  'disco-ball': canonicalId('disco-ball', 'line'),
  'disc': canonicalId('disc', 'line'),
  'dna': canonicalId('dna', 'line'),
  'drop-half': canonicalId('drop-half', 'line'),
  'drone': canonicalId('drone', 'line'),
  'equalizer': canonicalId('equalizer', 'line'),
  'fan': canonicalId('fan', 'line'),
  'fallout-shelter': canonicalId('fallout-shelter', 'line'),
  'gps': canonicalId('gps', 'line'),
  'gps-fix': canonicalId('gps-fix', 'line'),
  'hourglass-simple': canonicalId('hourglass-simple', 'line'),
  'intersect-three': canonicalId('intersect-three', 'line'),
  'meteor': canonicalId('meteor', 'line'),
  'mouse-scroll': canonicalId('mouse-scroll', 'line'),
  'nut': canonicalId('nut', 'line'),
  'octagon': canonicalId('octagon', 'line'),
  'parallelogram': canonicalId('parallelogram', 'line'),
  'path': canonicalId('path', 'line'),
  'peace': canonicalId('peace', 'line'),
  'pentagon': canonicalId('pentagon', 'line'),
  'piano-keys': canonicalId('piano-keys', 'line'),
  'placeholder': canonicalId('placeholder', 'line'),
  'planet': canonicalId('planet', 'line'),
  'poker-chip': canonicalId('poker-chip', 'line'),
  'polygon': canonicalId('polygon', 'line'),
  'pulse': canonicalId('pulse', 'line'),
  'puzzle-piece': canonicalId('puzzle-piece', 'line'),
  'radioactive': canonicalId('radioactive', 'line'),
  'rainbow': canonicalId('rainbow', 'line'),
  'radio-button': canonicalId('radio-button', 'line'),
  'record': canonicalId('record', 'line'),
  'rectangle-dashed': canonicalId('rectangle-dashed', 'line'),
  'robot': canonicalId('robot', 'line'),
  'rows': canonicalId('rows', 'line'),
  'scan': canonicalId('scan', 'line'),
  'scan-smiley': canonicalId('scan-smiley', 'line'),
  'scribble': canonicalId('scribble', 'line'),
  'scribble-loop': canonicalId('scribble-loop', 'line'),
  'seal': canonicalId('seal', 'line'),
  'selection-all': canonicalId('selection-all', 'line'),
  'selection-background': canonicalId('selection-background', 'line'),
  'shooting-star': canonicalId('shooting-star', 'line'),
  'snowflake': canonicalId('snowflake', 'line'),
  'soccer-ball': canonicalId('soccer-ball', 'line'),
  'spinner': canonicalId('spinner', 'line'),
  'spinner-ball': canonicalId('spinner-ball', 'line'),
  'star-of-david': canonicalId('star-of-david', 'line'),
  'sticker': canonicalId('sticker', 'line'),
  'square-split-vertical': canonicalId('square-split-vertical', 'line'),
  'subtract-square': canonicalId('subtract-square', 'line'),
  'swap': canonicalId('swap', 'line'),
  'target': canonicalId('target', 'line'),
  'tennis-ball': canonicalId('tennis-ball', 'line'),
  'tilde': canonicalId('tilde', 'line'),
  'tornado': canonicalId('tornado', 'line'),
  'tree': canonicalId('tree', 'line'),
  'triangle': canonicalId('triangle', 'line'),
  'triangle-dashed': canonicalId('triangle-dashed', 'line'),
  'visor': canonicalId('visor', 'line'),
  'vinyl-record': canonicalId('vinyl-record', 'line'),
  'vignette': canonicalId('vignette', 'line'),
  'virus': canonicalId('virus', 'line'),
  'volleyball': canonicalId('volleyball', 'line'),
  'wall': canonicalId('wall', 'line'),
  'washing-machine': canonicalId('washing-machine', 'line'),
  'wrench': canonicalId('wrench', 'line'),
  'yarn': canonicalId('yarn', 'line'),
  'yin-yang': canonicalId('yin-yang', 'line'),
};

/**
 * Centralized icon registry. Single source of truth for DOM and canvas callers.
 * Keys are app-facing identifiers; values resolve to canonical Phosphor name + variant.
 */
export const iconRegistry: Record<string, IconDefinition> = Object.fromEntries(
  Object.entries(iconAliases).map(([alias, id]) => {
    return [alias, iconDefinitionFromCanonicalId(id)];
  })
);

export function getCanonicalIconIdForAlias(iconName: string): CanonicalIconId | null {
  return iconAliases[iconName] ?? null;
}


/**
 * Cache for rendered icons
 * Key format: `${iconName}-${size}-${color}-${strokeWidth}`
 */
const iconCache = new Map<string, HTMLCanvasElement>();

/**
 * Cache for Phosphor icon path data. Key: `${registryKey}-${variant}`
 */
const pathDataCache = new Map<string, string[]>();

/**
 * Extracts path data from Phosphor icon nodes: [["path", {d}], ...].
 */
function getPhosphorIconPathData(phosphorIconName: string, variant: IconVariant): string[] {
  try {
    const nodes = variant === 'filled' ? getPhosphorNodesFilled() : getPhosphorNodesOutline();
    const iconData = nodes[phosphorIconName];
    if (!iconData || !Array.isArray(iconData)) {
      return [];
    }
    return iconData
      .filter((node: unknown): node is ['path', { d: string }] =>
        Array.isArray(node) && node[0] === 'path' && typeof (node[1] as { d?: string })?.d === 'string')
      .map((node) => node[1].d);
  } catch {
    return [];
  }
}

function getCachedPathData(iconName: string, phosphorIconName: string, variant: IconVariant): string[] {
  const cacheKey = `${iconName}-${variant}`;
  const cached = pathDataCache.get(cacheKey);
  if (cached) return cached;
  const pathData = getPhosphorIconPathData(phosphorIconName, variant);
  if (pathData.length > 0) pathDataCache.set(cacheKey, pathData);
  return pathData;
}

/** Phosphor path data is 256×256; we scale to size with origin at center. */
const PHOSPHOR_VIEW_SIZE = 256;

/**
 * Renders a Phosphor icon on canvas using path data (synchronous).
 */
function renderPhosphorIconOnCanvas(
  ctx: CanvasRenderingContext2D,
  phosphorIconName: string,
  iconName: string,
  x: number,
  y: number,
  size: number,
  color: string,
  variant: IconVariant,
  strokeWidth: number = 2
): void {
  const pathData = getCachedPathData(iconName, phosphorIconName, variant);

  if (pathData.length === 0) {
    ctx.save();
    ctx.translate(x, y);
    if (variant === 'filled') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  const scale = size / PHOSPHOR_VIEW_SIZE;
  ctx.scale(scale, scale);
  ctx.translate(-PHOSPHOR_VIEW_SIZE / 2, -PHOSPHOR_VIEW_SIZE / 2);

  // Phosphor path data is authored as filled shapes (fill="currentColor") in both
  // regular and fill weights; we always fill, never stroke, for correct appearance.
  ctx.fillStyle = color;
  for (const pathString of pathData) {
    const path = new Path2D(pathString);
    ctx.fill(path);
  }

  ctx.restore();
}

/**
 * Gets a cached icon canvas or creates one (synchronous)
 */
function getCachedIcon(
  iconName: string,
  size: number,
  color: string,
  variant: IconVariant,
  strokeWidth: number = 2
): HTMLCanvasElement {
  const cacheKey = `${iconName}-${size}-${color}-${variant}-${strokeWidth}`;
  
  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey)!;
  }
  
  // Create new canvas
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  // Get icon definition from registry
  const iconDef = iconRegistry[iconName];
  
  if (iconDef) {
    renderPhosphorIconOnCanvas(ctx, iconDef.phosphorIconName, iconName, size / 2, size / 2, size, color, iconDef.variant, strokeWidth);
  } else {
    // Fallback: draw placeholder
    if (variant === 'filled') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  
  iconCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * Renders an icon on canvas using cached icons (synchronous).
 * Uses the centralized icon registry (phosphorIconName + variant).
 */
export function renderIconOnCanvas(
  ctx: CanvasRenderingContext2D,
  iconName: string,
  x: number,
  y: number,
  size: number,
  color: string,
  strokeWidth: number = 2
): void {
  // Get icon definition from centralized registry
  const iconDef = iconRegistry[iconName];
  if (!iconDef) {
    console.warn(`Icon "${iconName}" not found in icon registry. Add it to canvas-icons.ts`);
    // Fallback: draw placeholder circle
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  
  const cached = getCachedIcon(iconName, size, color, iconDef.variant, strokeWidth);
  ctx.drawImage(cached, x - size / 2, y - size / 2);
}

/**
 * Pre-caches icons for better performance
 * Call this during app initialization
 */
export function preloadIcons(
  iconNames: string[],
  sizes: number[] = [16, 24, 32, 36, 48],
  colors: string[] = ['#ffffff', '#000000']
): void {
  for (const iconName of iconNames) {
    const iconDef = iconRegistry[iconName];
    const variant: IconVariant = iconDef?.variant ?? 'line';
    for (const size of sizes) {
      for (const color of colors) {
        getCachedIcon(iconName, size, color, variant);
      }
    }
  }
}

/**
 * Clears the icon cache
 */
export function clearIconCache(): void {
  iconCache.clear();
  pathDataCache.clear();
}

/**
 * Gets the complete icon definition (phosphorIconName + variant) for a given icon name.
 */
export function getIconDefinition(iconName: string): IconDefinition | null {
  return iconRegistry[iconName] ?? null;
}

/**
 * Checks if an icon is in the registry (API preserved for callers).
 */
export function hasIcon(iconName: string): boolean {
  return iconName in iconRegistry;
}
