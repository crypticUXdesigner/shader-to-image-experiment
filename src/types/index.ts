export interface ParameterConfig {
  type: 'float' | 'int';
  default: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  readOnly?: boolean; // If true, parameter is read-only (auto-synced from another element)
  disabled?: boolean; // If true, parameter is disabled (unavailable in current mode)
}

export interface ParameterGroup {
  id: string;
  label: string;
  parameters: string[];
  collapsible: boolean;
  defaultCollapsed: boolean;
}

export type ElementType = 'coordinate-modifier' | 'content-generator' | 'post-processor';

export interface VisualElement {
  id: string;
  displayName: string;
  description: string;
  category: string;
  
  // Element type - determines behavior and ordering
  elementType?: ElementType; // If not specified, defaults to 'content-generator'
  
  // GLSL code components
  functions: string;
  mainCode: string;
  uniforms: string[];
  postColorCode?: string; // Optional code for post-color-mapping stage (used when postColorMapping is true or mode-dependent)
  
  // Parameters
  parameters: Record<string, ParameterConfig>;
  parameterGroups: ParameterGroup[];
  
  // Dependencies
  requires?: string[];
  
  // Post-processing mode
  postColorMapping?: boolean; // If true, element code is inserted after color mapping (default: false)
  
  // Application order
  order: number;
}

export interface OKLCHColor {
  l: number;  // Lightness (0-1)
  c: number;  // Chroma (0-1)
  h: number;  // Hue (0-360 degrees)
}

export interface CubicBezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type ColorMode = 'bezier' | 'thresholds';

export interface ColorConfig {
  mode: ColorMode;
  startColor: OKLCHColor;
  endColor: OKLCHColor;
  stops: number;
  lCurve: CubicBezier;
  cCurve: CubicBezier;
  hCurve: CubicBezier;
  transitionWidth?: number; // For threshold mode: smoothstep transition width
  ditherStrength?: number; // For threshold mode: Bayer dithering strength
  pixelSize?: number; // For threshold mode: Bayer dithering pixel size
  toneMapping?: {
    exposure?: number; // Brightness multiplier (default: 1.0)
    contrast?: number; // Contrast adjustment (default: 1.0)
    saturation?: number; // Saturation multiplier (default: 1.0)
  };
}

export interface TimelineConfig {
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface ExportConfig {
  resolution: [number, number];
  format: 'png' | 'jpeg' | 'webp';
  quality?: number;
  filename?: string;
}

export interface Layer {
  id: string;
  activeElements: string[];
  elementOrder: string[];
  parameters: Record<string, number>;
  blendingMode: number;  // 0=Normal, 1=Multiply, ..., 11=Exclusion
  opacity: number;       // 0.0-1.0
  visible: boolean;
  colorConfig: ColorConfig;  // Per-layer color configuration
}

// FX layer: post-processors applied to the final composited result
export interface FXLayer {
  id: string;  // Always 'fx'
  activeElements: string[];  // Only post-processor element IDs
  elementOrder: string[];  // Order of post-processors
  parameters: Record<string, number>;  // Parameters for FX post-processors
}

export interface SavedConfig {
  version: string;
  timestamp: string;
  
  // NEW: Layer-based config (version 2.0)
  layers?: Layer[];
  fxLayer?: FXLayer;  // Post-processors applied to final composited result
  
  // LEGACY: Single-layer config (version 1.0, for backward compatibility)
  activeElements?: string[];
  elementOrder?: string[];
  parameters?: Record<string, number>;
  
  // Shared (both versions)
  colorConfig: ColorConfig;
  timelineConfig: TimelineConfig;
  exportConfig: ExportConfig;
}

