// Node Specification Types
// These define the available node types and their ports/parameters

export type PortType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'int' | 'bool' | 'any';

export interface PortSpec {
  name: string;
  type: PortType;
  label?: string;
  /**
   * When this input is unconnected, use the value of this parameter (or parameters) instead of type default.
   * - Single param: "paramName" → use that parameter's value (float/int formatted as GLSL literal).
   * - Vec2 from two floats: "paramX,paramY" → use vec2(paramX, paramY).
   */
  fallbackParameter?: string;
  /**
   * When this input is unconnected, use this GLSL expression. May reference other inputs as $input.name.
   * Takes precedence over fallbackParameter when set. Used when the default depends on other inputs (e.g. rd from in).
   */
  fallbackExpression?: string;
  /**
   * Omit the visible name chip next to input ports on the node header (dot + type chip remain).
   * `label` is still used for aria-label on the port and documentation when set.
   */
  hideHeaderLabel?: boolean;
}

export interface NodeSpec {
  id: string;                     // Node type ID (e.g., "fbm-noise")
  displayName: string;            // Human-readable palette/canvas title (see `.cursor/rules/shaders/node-standards.mdc`)
  description?: string;           // Node description
  category: string;               // Category (Input, Transform, Generator, etc.)
  icon?: string;                  // Optional node-specific icon identifier (overrides category icon)
  
  // Ports
  inputs: PortSpec[];            // Input ports
  outputs: PortSpec[];            // Output ports
  
  // Parameters
  parameters: Record<string, ParameterSpec>;
  parameterGroups?: ParameterGroup[];
  
  // Parameter layout (optional - defaults to auto-grid)
  parameterLayout?: ParameterLayout;
  
  // GLSL code (required for shader compilation)
  mainCode: string;               // GLSL code with placeholders ($input, $output, $param, etc.)
  functions?: string;             // Optional GLSL functions
}

export type ParameterInputMode = 'override' | 'add' | 'subtract' | 'multiply';

/** Rotary knob arc fill: one-sided (min→value) vs two-sided (neutral→value). */
export type KnobPolarity = 'one-sided' | 'two-sided';

export interface ParameterSpec {
  type: 'float' | 'int' | 'string' | 'vec4' | 'array';
  default: ParameterValue;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  inputMode?: ParameterInputMode;  // How to combine input with config value (default: 'override')
  /** Whether this parameter is intended to be driven by animation / automation (time-varying input). */
  supportsAnimation?: boolean;
  /** Whether this parameter is intended to be driven by audio (virtual audio node or similar signal). */
  supportsAudio?: boolean;
  /**
   * Knob UI only: arc highlight from min to value (default), or from knobCenter to value when two-sided.
   */
  knobPolarity?: KnobPolarity;
  /** Neutral point on the knob arc when knobPolarity is two-sided (default 0). Ignored for one-sided. */
  knobCenter?: number;
}

export type ParameterValue = 
  | number
  | string
  | [number, number, number, number]
  | number[]
  | number[][];  // For array parameters that are arrays of arrays (e.g., frequency bands)

export interface ParameterGroup {
  id: string;
  label: string;
  parameters: string[];
  collapsible: boolean;
  defaultCollapsed: boolean;
}

// Parameter Layout System
// Defines how parameters are laid out in the node body (slot container)
export interface ParameterLayout {
  elements: LayoutElement[];  // Ordered list of elements (rendered top to bottom)
  /** Parameter names that have no connection port (e.g. purely local configuration parameters) */
  parametersWithoutPorts?: string[];
  /**
   * Extra columns of width to add to the node (e.g. 1 = one column wider).
   * Uses the same cell min-width and gap as the grid so the body gets dedicated width and the rest fills.
   */
  extraColumns?: number;
  /**
   * Minimum number of columns for node width (overrides calculated columns when set).
   * Use for nodes that need a fixed wide layout (e.g. 3 columns).
   */
  minColumns?: number;
}

export type LayoutElement =
  | AutoGridElement
  | GridElement
  | RemapRangeElement
  | FrequencyRangeElement
  | BezierEditorElement
  | BezierEditorRowElement
  | ColorPickerElement
  | ColorPickerRowElement
  | ColorPickerRowWithPortsElement
  | ColorMapPreviewElement
  | CoordPadElement
  | ArrangementTrackFilterElement
  | CustomElement;

/** XY coord pad: draggable 2D pad + X/Y ValueInputs below (size sm). Combined cell with ports for X and Y. */
export interface CoordPadElement {
  type: 'coord-pad';
  /** [paramX, paramY] - e.g. ['rippleCenterX', 'rippleCenterY'] or ['sizeX', 'sizeY'] */
  parameters: [string, string];
  /** 'center' (0,0 at center) or 'bottom-left' (0,0 at corner). Use bottom-left for size/scale. Default center. */
  coordsOrigin?: 'center' | 'bottom-left';
}

/** OKLCH color picker: one row with swatch + picker button; parameters l, c, h. */
export interface ColorPickerElement {
  type: 'color-picker';
  /** Parameter names [l, c, h] - defaults to ['l', 'c', 'h'] if not specified */
  parameters?: [string, string, string];
}

/** Two OKLCH color pickers in one row, equal width. */
export interface ColorPickerRowElement {
  type: 'color-picker-row';
  /**
   * Optional visibility clause (matches `GridElement.visibleWhen` semantics).
   * When set, the row renders only when the controlling parameter equals the given number.
   */
  visibleWhen?: {
    parameter: string;
    equals: number;
  };
  /** Optional group header label (e.g. "Colors") rendered above the row */
  label?: string;
  /** Two color picker configs: [start color params], [end color params] */
  pickers: [[string, string, string], [string, string, string]];
}

/** Two OKLCH color pickers in one row with L/C/H parameter ports beneath each swatch. */
export interface ColorPickerRowWithPortsElement {
  type: 'color-picker-row-with-ports';
  /** Two color picker configs: [start color params], [end color params] (each [L, C, H]) */
  pickers: [[string, string, string], [string, string, string]];
}

/** Color map preview: row of color stops (stepped) or gradient bar (smooth). Spans full width. */
export interface ColorMapPreviewElement {
  type: 'color-map-preview';
  /** Optional group header label (e.g. "Colors") rendered above the strip */
  label?: string;
  /** 'stepped': N discrete boxes (one per stop). 'smooth': one gradient bar. */
  mode: 'stepped' | 'smooth';
  /** Height of the strip in px; default from --color-map-preview-height token */
  height?: number;
}

// Default: auto-generates grid from all parameters, respects parameterGroups
export interface AutoGridElement {
  type: 'auto-grid';
  // No config needed - uses all parameters automatically, respects groups
}

// Explicit grid with layout control
export interface GridElement {
  type: 'grid';
  /**
   * When set, this entire grid section (parameters + optional label header) renders only when
   * the node's stored value for `parameter` equals `equals` (fallback: spec default, then 0).
   */
  visibleWhen?: {
    parameter: string;
    equals: number;
  };
  /** Optional header label rendered above this grid block */
  label?: string;
  /**
   * When set with `label`, renders that parameter as a compact toggle in the header row
   * next to the label (e.g. layer on/off). Omit the parameter from `parameters` so it
   * is not duplicated in the grid body. Intended for int 0/1 (toggle UI).
   */
  headerToggleParameter?: string;
  parameters: string[];  // Which parameters to include (in order)
  layout?: {
    columns?: number | 'auto';  // 'auto' uses calculateOptimalColumns
    cellHeight?: number;  // Override default cell height
    cellMinWidth?: number;  // Override default min width
    respectMinWidth?: boolean;  // Whether to respect cellMinWidth (default: true)
    /** Span for coords (CoordPadCell) in columns; default 2. Use 3 for 3-column grids. */
    coordsSpan?: 2 | 3;
    /** Origin for coord pad grid: 'center' (0,0 at center, default) or 'bottom-left' (0,0 at bottom-left). Use a record keyed by X param name to set origin per coord pad (e.g. { sizeX: 'bottom-left', centerX: 'center' }). */
    coordsOrigin?: 'center' | 'bottom-left' | Record<string, 'center' | 'bottom-left'>;
    /**
     * Per coord pad (keyed by X parameter): nominal "rest" UV in value space vs min/max,
     * shown as an anchor dot and a displacement line from anchor to current (CoordPad-only).
     * Hidden when ports are wired or timeline automation affects the pair.
     */
    coordsDisplacementAnchor?: Record<string, { x: number; y: number }>;
    /** Per-parameter column span (e.g. make a single param take full row). */
    parameterSpan?: Record<string, 2 | 3>;
  };
  parameterUI?: Record<string, ParameterUISelection>;  // Override UI per param
}

// Remap range editor (maps to inMin/inMax/outMin/outMax)
export interface RemapRangeElement {
  type: 'remap-range';
  // Height controlled by design system token: --remap-range-height
}

/**
 * Scale for the frequency-range slider.
 * - 'linear': Hz maps linearly to slider position (default).
 * - 'audio': Logarithmic scale; matches human perception of pitch (each octave ≈ equal distance).
 */
export type FrequencyRangeScale = 'linear' | 'audio';

/**
 * Frequency range editor (simplified range: label + horizontal slider + start/end inputs).
 * Used for editing one band of an array parameter (e.g. frequencyBands[bandIndex]).
 * Layout: embed-slot with padding/gap from --embed-slot-pd, direction column.
 */
export interface FrequencyRangeElement {
  type: 'frequency-range';
  /** Name of the array parameter (e.g. 'frequencyBands') */
  parameter: string;
  /** Index of the band to edit within the array */
  bandIndex: number;
  /** Optional label override; defaults to "Band {bandIndex + 1}" or parameter label */
  label?: string;
  /**
   * Slider scale. Default 'linear'.
   * Use 'audio' for frequency in Hz (log scale: 20–20k maps to perceptually even steps).
   */
  scale?: FrequencyRangeScale;
}

// Bezier curve editor
export interface BezierEditorElement {
  type: 'bezier-editor';
  height?: number;  // Default: bezier-editor-height CSS token
  parameters?: ['x1', 'y1', 'x2', 'y2'];  // Optional, defaults to these
}

/** Three bezier editors in one row, equal width; no parameter ports. */
export interface BezierEditorRowElement {
  type: 'bezier-editor-row';
  /** Optional group header label (e.g. "Curves") rendered above the row */
  label?: string;
  height?: number;
  /** Three groups of 4 param names: [x1, y1, x2, y2] per editor (L, C, H curves). */
  editors: [[string, string, string, string], [string, string, string, string], [string, string, string, string]];
}

/** Multi-select track filter for arrangement snapshot nodes. */
export interface ArrangementTrackFilterElement {
  type: 'arrangement-track-filter';
  label?: string;
  /** Limit listed tracks to these kinds (default: all kinds). */
  trackKinds?: Array<'note' | 'audio' | 'pattern'>;
  /** Omit tracks with no notes/regions in the snapshot. */
  hideEmpty?: boolean;
  /** Show note counts in menu rows (notes node). */
  showNoteCounts?: boolean;
}

// Custom element (for future extensibility)
export interface CustomElement {
  type: 'custom';
  elementId: string;
  config?: Record<string, unknown>;
}

// Parameter UI element selection
export type ParameterUISelection = 
  | 'knob'      // Default for float/int
  | 'toggle'    // For int with min=0, max=1
  | 'enum'     // For int with known enum mappings
  | 'bezier'    // For bezier curve parameters
  | 'range'     // For range editor parameters
  | 'input'     // Simple draggable input field (no knob)
  | 'coords'    // XY pad + inputs (combines two float params)
  | 'custom';   // Custom renderer
