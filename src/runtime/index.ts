/**
 * Runtime System for Node-Based Shader System
 * 
 * This module exports all runtime components for executing compiled shaders in WebGL.
 * 
 * Main entry point: RuntimeManager - provides public API for UI integration
 */

export { RuntimeManager } from './RuntimeManager';
export { CompilationManager } from './CompilationManager';
export { Renderer } from './Renderer';
export { ShaderInstance } from './ShaderInstance';
export { ShaderCompilationError, UniformNotFoundError, WebGLContextError } from './errors';
export type { CompilationResult, UniformMetadata, ErrorCallback, ShaderCompiler } from './types';
export { getUniformName, hashGraph } from './utils';
