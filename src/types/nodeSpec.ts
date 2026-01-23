// Node Specification Types
// These define the available node types and their ports/parameters

export type PortType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'int' | 'bool';

export interface PortSpec {
  name: string;
  type: PortType;
  label?: string;
}

export interface NodeSpec {
  id: string;                     // Node type ID (e.g., "fbm-noise")
  displayName: string;            // Human-readable name
  description?: string;           // Node description
  category: string;               // Category (Input, Transform, Generator, etc.)
  
  // Ports
  inputs: PortSpec[];            // Input ports
  outputs: PortSpec[];            // Output ports
  
  // Parameters
  parameters: Record<string, ParameterSpec>;
  parameterGroups?: ParameterGroup[];
  
  // GLSL code (required for shader compilation)
  mainCode: string;               // GLSL code with placeholders ($input, $output, $param, etc.)
  functions?: string;             // Optional GLSL functions
}

export type ParameterInputMode = 'override' | 'add' | 'subtract' | 'multiply';

export interface ParameterSpec {
  type: 'float' | 'int' | 'string' | 'vec4' | 'array';
  default: ParameterValue;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  inputMode?: ParameterInputMode;  // How to combine input with config value (default: 'override')
}

export type ParameterValue = 
  | number
  | string
  | [number, number, number, number]
  | number[];

export interface ParameterGroup {
  id: string;
  label: string;
  parameters: string[];
  collapsible: boolean;
  defaultCollapsed: boolean;
}
