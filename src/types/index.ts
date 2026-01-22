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

// Node-based shader system types (version 2.0)
export type ParameterValue = 
  | number                        // For float/int parameters
  | string                        // For string parameters (swizzle, etc.)
  | [number, number, number, number]  // For vec4 parameters (bezier curves)
  | number[];                     // For array parameters (color stops)

export interface NodeInstance {
  // Identity
  id: string;                    // Unique node ID (UUID recommended)
  type: string;                   // Node type ID (from Node Specification)
  
  // Position and layout
  position: {                     // Node position in canvas (pixels)
    x: number;                    // Integer, can be negative
    y: number;                    // Integer, can be negative
  };
  
  // Parameters
  parameters: Record<string, ParameterValue>;  // Parameter name → value
  
  // Metadata
  label?: string;                 // Optional custom label (overrides displayName)
  collapsed?: boolean;            // Whether node UI is collapsed (default: false)
  color?: string;                 // Optional node color (hex, e.g., "#FF0000")
}

export interface Connection {
  id: string;                     // Unique connection ID (UUID recommended)
  
  // Source (output)
  sourceNodeId: string;            // Source node ID
  sourcePort: string;              // Source port name (from Node Specification)
  
  // Target (input)
  targetNodeId: string;            // Target node ID
  targetPort: string;              // Target port name (from Node Specification)
}

export interface NodeGraph {
  // Identity
  id: string;                     // Unique graph ID (UUID recommended)
  name: string;                   // Graph name (user-defined)
  version: string;                // Graph format version ("2.0")
  
  // Graph data
  nodes: NodeInstance[];          // All nodes in the graph
  connections: Connection[];      // All connections in the graph
  
  // Metadata
  metadata?: {
    description?: string;         // Optional description
    author?: string;              // Optional author
    createdAt?: string;         // ISO 8601 timestamp
    modifiedAt?: string;         // ISO 8601 timestamp
    tags?: string[];             // Optional tags
  };
  
  // View state (UI state, not part of graph logic)
  viewState?: {
    zoom: number;                 // Canvas zoom level (default: 1.0)
    panX: number;                 // Canvas pan X (pixels, default: 0)
    panY: number;                 // Canvas pan Y (pixels, default: 0)
    selectedNodeIds?: string[];   // Currently selected nodes
  };
}

// Node specification types (from Node Specification)
// Re-export from nodeSpec.ts for compatibility (excluding types that conflict)
export type { NodeSpec, PortSpec, PortType, ParameterSpec } from './nodeSpec';
// Note: ParameterValue and ParameterGroup are already defined above, so we don't re-export them

// Legacy types for backward compatibility
export interface NodePort {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'int' | 'bool';
}

export interface NodeParameter {
  type: 'float' | 'int' | 'string' | 'vec4' | 'array';
  default?: number | string | [number, number, number, number] | number[];
  min?: number;
  max?: number;
  step?: number;
}

// Compilation result types (from Runtime/Integration Specification)
export interface UniformMetadata {
  name: string;  // e.g., "uNodeN1Scale"
  nodeId: string;  // e.g., "node-123"
  paramName: string;  // e.g., "scale"
  type: 'float' | 'int' | 'vec2' | 'vec3' | 'vec4';
  defaultValue: number | [number, number] | [number, number, number] | [number, number, number, number];
}

export interface CompilationResult {
  shaderCode: string;
  uniforms: UniformMetadata[];
  metadata: {
    warnings: string[];
    errors: string[];
    executionOrder: string[];  // Node IDs in execution order
    finalOutputNodeId: string | null;  // ID of final output node
  };
}

