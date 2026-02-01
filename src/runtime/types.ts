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

/**
 * Renderer interface for dependency injection.
 * Provides rendering capabilities for shader output.
 */
export interface IRenderer {
  /**
   * Mark renderer as dirty (needs rendering).
   */
  markDirty(reason?: string): void;
  
  /**
   * Render a single frame (only if dirty).
   */
  render(): void;
  
  /**
   * Start animation loop.
   */
  startAnimation(): void;
  
  /**
   * Stop animation loop.
   */
  stopAnimation(): void;
  
  /**
   * Set shader instance for rendering.
   */
  setShaderInstance(instance: import('./ShaderInstance').ShaderInstance): void;
  
  /**
   * Get WebGL context (for CompilationManager).
   */
  getGLContext(): WebGL2RenderingContext;
  
  /**
   * Get canvas element.
   */
  getCanvas(): HTMLCanvasElement;
}

/**
 * Audio manager interface for dependency injection.
 * Manages audio file loading, playback, and frequency analysis.
 */
export interface IAudioManager {
  /**
   * Start periodic cleanup of orphaned resources.
   */
  startPeriodicCleanup(cleanupCallback: () => void, intervalMs?: number): void;
  
  /**
   * Stop periodic cleanup.
   */
  stopPeriodicCleanup(): void;
  
  /**
   * Clean up orphaned audio resources not in the graph.
   */
  cleanupOrphanedResources(graph?: import('../data-model/types').NodeGraph | null): void;
  
  /**
   * Remove audio node and clean up resources.
   */
  removeAudioNode(nodeId: string): void;
  
  /**
   * Remove analyzer node and clean up resources.
   */
  removeAnalyzerNode(nodeId: string): void;
  
  /**
   * Get audio node state.
   */
  getAudioNodeState(nodeId: string): import('./AudioManager').AudioNodeState | undefined;
  
  /**
   * Get analyzer node state.
   */
  getAnalyzerNodeState(nodeId: string): import('./AudioManager').AnalyzerNodeState | undefined;
  
  /**
   * Create analyzer node for frequency analysis.
   */
  createAnalyzer(
    nodeId: string,
    audioFileNodeId: string,
    frequencyBands: import('./AudioManager').FrequencyBand[],
    smoothing?: number,
    fftSize?: number
  ): void;
  
  /**
   * Play audio for a node.
   */
  playAudio(nodeId: string, offset?: number): Promise<void>;
  
  /**
   * Stop audio playback for a node.
   */
  stopAudio(nodeId: string): void;
  
  /**
   * Verify cleanup was successful for a node.
   */
  verifyCleanup(nodeId: string): boolean;
  
  /**
   * Update audio uniforms (called each frame).
   */
  updateUniforms(
    setUniform: (nodeId: string, paramName: string, value: number) => void,
    setUniforms: (updates: Array<{ nodeId: string, paramName: string, value: number }>) => void,
    graph?: {
      nodes: Array<{ id: string; type: string; parameters: Record<string, unknown> }>;
      connections: Array<{ sourceNodeId: string; targetNodeId: string; targetPort?: string }>;
    } | null
  ): void;
  
  /**
   * Load audio file for a node.
   */
  loadAudioFile(nodeId: string, file: File | string): Promise<void>;
  
  /**
   * Get global audio state (all audio nodes).
   */
  getGlobalAudioState(): { isPlaying: boolean; currentTime: number; duration: number } | null;
  
  /**
   * Play all audio nodes.
   */
  playAllAudio(offset?: number): Promise<void>;
  
  /**
   * Stop all audio playback.
   */
  stopAllAudio(): void;
  
  /**
   * Seek all audio to a specific time.
   */
  seekAllAudio(time: number): Promise<void>;
}

/**
 * Compilation manager interface for dependency injection.
 * Coordinates compilation triggers and manages shader instance lifecycle.
 */
export interface ICompilationManager {
  /**
   * Set the node graph.
   */
  setGraph(graph: import('../data-model/types').NodeGraph): void;
  
  /**
   * Handle parameter change.
   * Determines if recompilation is needed or just uniform update.
   */
  onParameterChange(nodeId: string, paramName: string, value: number | number[][]): void;
  
  /**
   * Handle graph structure change (node added/removed, connection added/removed).
   * @param immediate - If true, recompile immediately (e.g. when only connections changed).
   */
  onGraphStructureChange(immediate?: boolean): void;
  
  /**
   * Get current shader instance (for time/resolution updates).
   */
  getShaderInstance(): import('./ShaderInstance').ShaderInstance | null;
}
