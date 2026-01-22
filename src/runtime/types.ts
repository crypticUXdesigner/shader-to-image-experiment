/**
 * Runtime Types for Node-Based Shader System
 * 
 * These types match the Runtime Integration Specification.
 */

/**
 * Uniform metadata from compiler output.
 */
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

/**
 * Compilation result from the shader compiler.
 */
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

/**
 * Error callback type for runtime error reporting.
 */
export interface ErrorCallback {
  (error: {
    type: 'compilation' | 'runtime' | 'unexpected';
    errors?: string[];
    error?: string;
    timestamp: number;
  }): void;
}

/**
 * Shader compiler interface that the runtime expects.
 */
export interface ShaderCompiler {
  compile(graph: import('../data-model/types').NodeGraph): CompilationResult;
}
