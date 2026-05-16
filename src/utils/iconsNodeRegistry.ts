/**
 * Node icon identifiers. Extracted from icons.ts for smaller module size.
 */

export type NodeIconIdentifier =
  | 'audio-waveform'
  | 'grid'
  | 'circle'
  | 'circle-dashed'
  | 'car'
  | 'headlights'
  | 'droplets'
  | 'calculator'
  | 'settings'
  | 'move'
  | 'layers'
  | 'square'
  | 'square-split-vertical'
  | 'sparkles'
  | 'monitor'
  | 'video'
  | 'time-clock'
  | 'wave'
  | 'waves'
  | 'ripple'
  | 'sphere'
  | 'cube'
  | 'box'
  | 'infinity'
  | 'sparkles-2'
  | 'grain'
  | 'noise'
  | 'hexagon'
  | 'hexagons'
  | 'ring'
  | 'rings'
  | 'cell'
  | 'cloud'
  | 'curly-loop'
  | 'dots'
  | 'spray'
  | 'atom-2'
  | 'topology-star-ring'
  | 'sunrise'
  | 'triangles'
  | 'streak'
  | 'shape-2'
  | 'layout-board'
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
  | 'flower'
  | 'arrow-right'
  | 'arrow-square-right'
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
  | 'brightness'
  | 'cube-transparent'
  | 'grid-nine'
  // Additional Phosphor icons (direct aliases)
  | 'aperture'
  | 'asterisk-simple'
  | 'asterisk'
  | 'alien'
  | 'angle'
  | 'approximate-equals'
  | 'arrows-in-simple'
  | 'arrows-out'
  | 'arrows-out-simple'
  | 'barcode'
  | 'beach-ball'
  | 'basketball'
  | 'biohazard'
  | 'boules'
  | 'brain'
  | 'broadcast'
  | 'checkerboard'
  | 'circle-half-tilt'
  | 'circle-notch'
  | 'circuitry'
  | 'columns-plus-right'
  | 'corners-in'
  | 'corners-out'
  | 'cpu'
  | 'crosshair'
  | 'crosshair-simple'
  | 'diamonds-four'
  | 'diamonds'
  | 'dice-four'
  | 'dice-five'
  | 'dice-six'
  | 'disco-ball'
  | 'disc'
  | 'dna'
  | 'drop-half'
  | 'drone'
  | 'equalizer'
  | 'fan'
  | 'fallout-shelter'
  | 'gps'
  | 'gps-fix'
  | 'hourglass-simple'
  | 'intersect-three'
  | 'meteor'
  | 'mouse-scroll'
  | 'music-note-simple'
  | 'nut'
  | 'octagon'
  | 'parallelogram'
  | 'path'
  | 'peace'
  | 'pentagon'
  | 'piano-keys'
  | 'placeholder'
  | 'planet'
  | 'poker-chip'
  | 'polygon'
  | 'pulse'
  | 'puzzle-piece'
  | 'radioactive'
  | 'rainbow'
  | 'radio-button'
  | 'record'
  | 'rectangle-dashed'
  | 'robot'
  | 'rows'
  | 'scan'
  | 'scan-smiley'
  | 'scribble'
  | 'scribble-loop'
  | 'seal'
  | 'selection-all'
  | 'selection-background'
  | 'shooting-star'
  | 'snowflake'
  | 'soccer-ball'
  | 'spinner'
  | 'spinner-ball'
  | 'star-of-david'
  | 'sticker'
  | 'subtract-square'
  | 'swap'
  | 'target'
  | 'tennis-ball'
  | 'tilde'
  | 'tornado'
  | 'tree'
  | 'triangle'
  | 'triangle-dashed'
  | 'visor'
  | 'vinyl-record'
  | 'vignette'
  | 'virus'
  | 'volleyball'
  | 'wall'
  | 'washing-machine'
  | 'wrench'
  | 'yarn'
  | 'yin-yang';

/** Every {@link NodeIconIdentifier} — single source for avatar/icon pickers. */
export const ALL_NODE_ICON_IDENTIFIERS: readonly NodeIconIdentifier[] = [
  'audio-waveform',
  'grid',
  'circle',
  'circle-dashed',
  'car',
  'headlights',
  'droplets',
  'calculator',
  'settings',
  'move',
  'layers',
  'square',
  'square-split-vertical',
  'sparkles',
  'monitor',
  'video',
  'time-clock',
  'wave',
  'waves',
  'ripple',
  'sphere',
  'cube',
  'box',
  'infinity',
  'sparkles-2',
  'grain',
  'noise',
  'hexagon',
  'hexagons',
  'ring',
  'rings',
  'cell',
  'curly-loop',
  'dots',
  'spray',
  'atom-2',
  'topology-star-ring',
  'sunrise',
  'triangles',
  'streak',
  'shape-2',
  'layout-board',
  'rotate',
  'blur-circle',
  'glow',
  'kaleidoscope',
  'twist',
  'particle',
  'gradient',
  'rgb-split',
  'scanline',
  'glitch-block',
  'plus',
  'minus',
  'multiply-x',
  'divide',
  'power',
  'sqrt',
  'trig-wave',
  'flower',
  'arrow-right',
  'arrow-square-right',
  'arrow-down',
  'arrow-up',
  'arrows-left-right',
  'resize',
  'ruler',
  'vector-dot',
  'vector-cross',
  'normalize',
  'reflect',
  'refract',
  'constant',
  'hash',
  'percentage',
  'math-min',
  'math-max',
  'math-max-min',
  'math-cos',
  'math-tg',
  'math-function-y',
  'math-symbols',
  'math-xy',
  'math-function',
  'wave-sine',
  'bezier',
  'color-palette',
  'normal-map',
  'light',
  'dither',
  'tone-curve',
  'compare',
  'select',
  'color-wheel',
  'color-picker',
  'color-swatch',
  'chart-scatter',
  'chart-scatter-3d',
  'brand-planetscale',
  'screen-share',
  'contrast-2',
  'ease-in-out-control-points',
  'spiral',
  'ikosaedr',
  'arrow-move-right',
  'arrow-autofit-height',
  'arrow-up-right',
  'arrows-right-left',
  'settings-2',
  'layers-union',
  'layers-difference',
  'blend-mode',
  'mask',
  'transfer-out',
  'adjustments',
  'focus',
  'glitch',
  'displacement',
  'brightness',
  'cube-transparent',
  'grid-nine',
  // Additional Phosphor icons (direct aliases)
  'aperture',
  'asterisk-simple',
  'asterisk',
  'alien',
  'angle',
  'approximate-equals',
  'arrows-in-simple',
  'arrows-out',
  'arrows-out-simple',
  'barcode',
  'beach-ball',
  'basketball',
  'biohazard',
  'boules',
  'brain',
  'broadcast',
  'checkerboard',
  'circle-half-tilt',
  'circle-notch',
  'circuitry',
  'columns-plus-right',
  'corners-in',
  'corners-out',
  'cpu',
  'crosshair',
  'crosshair-simple',
  'diamonds-four',
  'diamonds',
  'dice-four',
  'dice-five',
  'dice-six',
  'disco-ball',
  'disc',
  'dna',
  'drop-half',
  'drone',
  'equalizer',
  'fan',
  'fallout-shelter',
  'gps',
  'gps-fix',
  'hourglass-simple',
  'intersect-three',
  'meteor',
  'mouse-scroll',
  'music-note-simple',
  'nut',
  'octagon',
  'parallelogram',
  'path',
  'peace',
  'pentagon',
  'piano-keys',
  'placeholder',
  'planet',
  'poker-chip',
  'polygon',
  'pulse',
  'puzzle-piece',
  'radioactive',
  'rainbow',
  'radio-button',
  'record',
  'rectangle-dashed',
  'robot',
  'rows',
  'scan',
  'scan-smiley',
  'scribble',
  'scribble-loop',
  'seal',
  'selection-all',
  'selection-background',
  'shooting-star',
  'snowflake',
  'soccer-ball',
  'spinner',
  'spinner-ball',
  'star-of-david',
  'sticker',
  'subtract-square',
  'swap',
  'target',
  'tennis-ball',
  'tilde',
  'tornado',
  'tree',
  'triangle',
  'triangle-dashed',
  'visor',
  'vinyl-record',
  'vignette',
  'virus',
  'volleyball',
  'wall',
  'washing-machine',
  'wrench',
  'yarn',
  'yin-yang',
];
