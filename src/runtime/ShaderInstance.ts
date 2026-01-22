/**
 * ShaderInstance - WebGL Shader Program Management
 * 
 * Manages a single WebGL shader program and its uniform locations.
 * Implements the ShaderInstance class from Runtime Integration Specification.
 */

import type { CompilationResult } from './types';
import { getUniformName } from './utils';
import { ShaderCompilationError } from './errors';

/**
 * Base vertex shader (static, used for all shaders - fullscreen quad).
 */
const BASE_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export class ShaderInstance {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vertexShader: WebGLShader | null = null;
  private fragmentShader: WebGLShader | null = null;
  
  // Uniform location cache
  private uniformLocations: Map<string, WebGLUniformLocation> = new Map();
  
  // Uniform type cache (for type checking)
  private uniformTypes: Map<string, string> = new Map();
  
  // Current parameter values
  private parameters: Map<string, number> = new Map();
  
  // Global uniforms
  private time: number = 0.0;
  private resolution: [number, number] = [0, 0];
  
  constructor(gl: WebGL2RenderingContext, compilationResult: CompilationResult) {
    this.gl = gl;
    this.createProgram(compilationResult);
    this.cacheUniformLocations(compilationResult);
  }
  
  /**
   * Create and link WebGL shader program.
   */
  private createProgram(compilationResult: CompilationResult): void {
    // Create vertex shader
    this.vertexShader = this.createShader(
      this.gl.VERTEX_SHADER,
      BASE_VERTEX_SHADER
    );
    if (!this.vertexShader) {
      throw new Error('Failed to create vertex shader');
    }
    
    // Create fragment shader
    this.fragmentShader = this.createShader(
      this.gl.FRAGMENT_SHADER,
      compilationResult.shaderCode
    );
    if (!this.fragmentShader) {
      throw new Error('Failed to create fragment shader');
    }
    
    // Create and link program
    this.program = this.gl.createProgram();
    if (!this.program) {
      throw new Error('Failed to create WebGL program');
    }
    
    this.gl.attachShader(this.program, this.vertexShader);
    this.gl.attachShader(this.program, this.fragmentShader);
    this.gl.linkProgram(this.program);
    
    // Check link status
    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(this.program);
      this.destroy();
      throw new ShaderCompilationError(
        'Shader program link failed',
        error || 'Unknown error',
        compilationResult.shaderCode
      );
    }
  }
  
  /**
   * Create and compile a shader.
   */
  private createShader(type: number, source: string): WebGLShader | null {
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      console.error('Shader compile error:', error);
      console.error('Shader source:', source);
      this.gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  /**
   * Cache uniform locations from compilation metadata.
   */
  private cacheUniformLocations(compilationResult: CompilationResult): void {
    if (!this.program) return;
    
    // Cache from compilation metadata (preferred - exact mapping)
    for (const uniform of compilationResult.uniforms) {
      const location = this.gl.getUniformLocation(this.program, uniform.name);
      if (location) {
        this.uniformLocations.set(uniform.name, location);
        this.uniformTypes.set(uniform.name, uniform.type);
        
        // Initialize with default value
        this.setUniformValue(uniform.name, uniform.type, uniform.defaultValue);
      } else {
        console.warn(`Uniform ${uniform.name} not found in shader (may be optimized out)`);
      }
    }
    
    // Also cache global uniforms
    const globalUniforms = ['uTime', 'uResolution'];
    for (const name of globalUniforms) {
      const location = this.gl.getUniformLocation(this.program, name);
      if (location) {
        this.uniformLocations.set(name, location);
      }
    }
  }
  
  /**
   * Set uniform value (type-safe).
   */
  private setUniformValue(
    name: string,
    type: string,
    value: number | [number, number] | [number, number, number] | [number, number, number, number]
  ): void {
    if (!this.program) return;
    
    const location = this.uniformLocations.get(name);
    if (!location) {
      console.warn(`Uniform ${name} location not found (may be optimized out by shader compiler)`);
      return;
    }
    
    this.gl.useProgram(this.program);
    
    switch (type) {
      case 'float':
        this.gl.uniform1f(location, value as number);
        break;
      case 'int':
        this.gl.uniform1i(location, Math.round(value as number));
        break;
      case 'vec2':
        const v2 = value as [number, number];
        this.gl.uniform2f(location, v2[0], v2[1]);
        break;
      case 'vec3':
        const v3 = value as [number, number, number];
        this.gl.uniform3f(location, v3[0], v3[1], v3[2]);
        break;
      case 'vec4':
        const v4 = value as [number, number, number, number];
        this.gl.uniform4f(location, v4[0], v4[1], v4[2], v4[3]);
        break;
      default:
        console.warn(`Unknown uniform type: ${type}`);
    }
  }
  
  /**
   * Update node parameter value.
   */
  setParameter(nodeId: string, paramName: string, value: number): void {
    // Store parameter value
    const key = `${nodeId}.${paramName}`;
    this.parameters.set(key, value);
    
    // Get uniform name (must match compiler's naming)
    const uniformName = getUniformName(nodeId, paramName);
    const uniformType = this.uniformTypes.get(uniformName);
    
    if (!uniformType) {
      console.warn(`Uniform type not found for ${uniformName} (nodeId: ${nodeId}, paramName: ${paramName})`);
      console.warn(`Available uniforms:`, Array.from(this.uniformTypes.keys()));
      return;
    }
    
    // Update uniform immediately
    this.setUniformValue(uniformName, uniformType, value);
  }
  
  /**
   * Batch parameter updates (more efficient).
   */
  setParameters(updates: Array<{ nodeId: string, paramName: string, value: number }>): void {
    if (!this.program) return;
    
    this.gl.useProgram(this.program);
    
    for (const update of updates) {
      const key = `${update.nodeId}.${update.paramName}`;
      this.parameters.set(key, update.value);
      
      const uniformName = getUniformName(update.nodeId, update.paramName);
      const uniformType = this.uniformTypes.get(uniformName);
      
      if (uniformType) {
        this.setUniformValue(uniformName, uniformType, update.value);
      }
    }
  }
  
  /**
   * Set time uniform.
   */
  setTime(time: number): void {
    this.time = time;
    
    if (!this.program) return;
    
    const location = this.uniformLocations.get('uTime');
    if (location) {
      this.gl.useProgram(this.program);
      this.gl.uniform1f(location, time);
    }
  }
  
  /**
   * Set resolution uniform.
   */
  setResolution(width: number, height: number): void {
    if (this.resolution[0] === width && this.resolution[1] === height) {
      return;  // No change
    }
    
    this.resolution = [width, height];
    
    if (!this.program) return;
    
    const location = this.uniformLocations.get('uResolution');
    if (location) {
      this.gl.useProgram(this.program);
      this.gl.uniform2f(location, width, height);
    }
  }
  
  /**
   * Get all parameter values (for transfer to new instance).
   */
  getParameters(): Map<string, number> {
    return new Map(this.parameters);
  }
  
  /**
   * Render fullscreen quad.
   */
  render(width: number, height: number): void {
    if (!this.program) return;
    
    this.gl.useProgram(this.program);
    
    // Set global uniforms
    this.setTime(this.time);
    this.setResolution(width, height);
    
    // Render fullscreen quad
    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    
    const positions = new Float32Array([
      -1, -1,  // Bottom-left
       1, -1,  // Bottom-right
      -1,  1,  // Top-left
       1,  1   // Top-right
    ]);
    
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
    
    const positionLoc = this.gl.getAttribLocation(this.program, 'a_position');
    this.gl.enableVertexAttribArray(positionLoc);
    this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);
    
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    
    // Cleanup
    this.gl.deleteBuffer(positionBuffer);
  }
  
  /**
   * Destroy shader instance and clean up resources.
   */
  destroy(): void {
    if (this.vertexShader) {
      this.gl.deleteShader(this.vertexShader);
      this.vertexShader = null;
    }
    if (this.fragmentShader) {
      this.gl.deleteShader(this.fragmentShader);
      this.fragmentShader = null;
    }
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
    this.uniformLocations.clear();
    this.uniformTypes.clear();
    this.parameters.clear();
  }
}
