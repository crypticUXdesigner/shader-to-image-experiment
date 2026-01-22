/**
 * Runtime Error Classes
 * 
 * These error classes match the Runtime Integration Specification.
 */

/**
 * Shader compilation error (WebGL compile/link failures).
 */
export class ShaderCompilationError extends Error {
  constructor(
    message: string,
    public glError: string,
    public shaderCode: string
  ) {
    super(message);
    this.name = 'ShaderCompilationError';
  }
}

/**
 * Uniform not found error.
 */
export class UniformNotFoundError extends Error {
  constructor(
    public uniformName: string,
    public nodeId: string,
    public paramName: string
  ) {
    super(`Uniform ${uniformName} not found for ${nodeId}.${paramName}`);
    this.name = 'UniformNotFoundError';
  }
}

/**
 * WebGL context error.
 */
export class WebGLContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGLContextError';
  }
}
