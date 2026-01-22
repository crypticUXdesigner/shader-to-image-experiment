// Runtime Types
// Types for shader compilation and runtime execution

export interface CompilationResult {
  // GLSL shader code
  shaderCode: string;
  
  // Uniform metadata
  uniforms: UniformMetadata[];
  
  // Compilation metadata
  metadata: {
    warnings: string[];
    errors: string[];
    executionOrder: string[];  // Node IDs in execution order
    finalOutputNodeId: string | null;  // ID of final output node
  };
}

export interface UniformMetadata {
  // Uniform identifier in shader
  name: string;  // e.g., "uNodeN1Scale"
  
  // Source information
  nodeId: string;  // e.g., "node-123"
  paramName: string;  // e.g., "scale"
  
  // Type information
  type: 'float' | 'int' | 'vec2' | 'vec3' | 'vec4';
  
  // Default value (from node parameter default)
  defaultValue: number | [number, number] | [number, number, number] | [number, number, number, number];
}
