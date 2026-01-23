/**
 * CompilationManager - Compilation Coordination
 * 
 * Coordinates compilation triggers, manages shader instance lifecycle,
 * handles parameter updates (recompile vs uniform-only), and debouncing.
 * Implements the CompilationManager class from Runtime Integration Specification.
 */

import { ShaderInstance } from './ShaderInstance';
import { Renderer } from './Renderer';
import type { ShaderCompiler, ErrorCallback } from './types';
import type { NodeGraph } from '../data-model/types';
import { hashGraph } from './utils';
import { ShaderCompilationError } from './errors';

export class CompilationManager {
  private shaderInstance: ShaderInstance | null = null;
  private compiler: ShaderCompiler;
  private renderer: Renderer;
  private graph: NodeGraph | null = null;
  
  // Debounce compilation
  private compileTimeout: number | null = null;
  private compileIdleCallback: number | null = null;
  private readonly COMPILE_DEBOUNCE_MS = 100;
  
  // Track if graph structure changed
  private lastGraphHash: string = '';
  
  // Error callback
  private errorCallback?: ErrorCallback;
  
  constructor(
    compiler: ShaderCompiler,
    renderer: Renderer,
    errorCallback?: ErrorCallback
  ) {
    this.compiler = compiler;
    this.renderer = renderer;
    this.errorCallback = errorCallback;
  }
  
  /**
   * Set the node graph.
   */
  setGraph(graph: NodeGraph): void {
    this.graph = graph;
  }
  
  /**
   * Handle parameter change.
   * Determines if recompilation is needed or just uniform update.
   */
  onParameterChange(nodeId: string, paramName: string, value: number): void {
    if (!this.graph) return;
    
    // Update graph
    const node = this.graph.nodes.find(n => n.id === nodeId);
    if (node) {
      // Skip runtime-only parameters that are not shader uniforms
      if (node.type === 'audio-file-input' && (paramName === 'filePath' || paramName === 'autoPlay')) {
        // Just update the graph parameter, don't try to set as uniform
        node.parameters[paramName] = value;
        return;
      }
      
      // Skip runtime-only parameters for audio-analyzer nodes
      if (node.type === 'audio-analyzer' && (paramName === 'smoothing' || paramName === 'fftSize' || paramName === 'frequencyBands')) {
        // Just update the graph parameter, don't try to set as uniform
        node.parameters[paramName] = value;
        return;
      }
      
      node.parameters[paramName] = value;
    }
    
    // Check if recompilation needed
    const graphHash = hashGraph(this.graph);
    const needsRecompile = graphHash !== this.lastGraphHash;
    
    if (needsRecompile) {
      // Debounce compilation
      this.scheduleRecompile();
    } else {
      // Check if parameter is connected to an output
      const isConnected = this.graph.connections.some(
        conn => conn.targetNodeId === nodeId && conn.targetParameter === paramName
      );
      
      if (isConnected) {
        // Parameter has input connection - check the input mode
        const node = this.graph.nodes.find(n => n.id === nodeId);
        if (node) {
          // Get the input mode from node override (if explicitly set)
          const inputMode = node.parameterInputModes?.[paramName];
          
          // If mode is explicitly set to 'override', the input completely replaces the config value,
          // so the uniform is not used and we can skip updating it.
          // But if mode is 'add', 'subtract', 'multiply', or undefined (might default to something other than override),
          // the uniform IS used in the combination expression, so we MUST update it.
          // To be safe and ensure correctness, we'll update the uniform unless mode is explicitly 'override'.
          if (inputMode !== 'override') {
            // Mode is add/subtract/multiply or undefined - uniform is used in combination, so update it
            if (this.shaderInstance) {
              this.shaderInstance.setParameter(nodeId, paramName, value);
              this.renderer.render();
            }
          }
          // If mode is explicitly 'override', skip uniform update (input completely replaces config)
        }
      } else {
        // No input connection - just update uniform
        if (this.shaderInstance) {
          this.shaderInstance.setParameter(nodeId, paramName, value);
          this.renderer.render();
        }
      }
    }
  }
  
  /**
   * Handle graph structure change (node added/removed, connection added/removed).
   */
  onGraphStructureChange(): void {
    this.scheduleRecompile();
  }
  
  /**
   * Schedule recompilation (with debouncing).
   */
  private scheduleRecompile(): void {
    // Cancel any pending compilation
    if (this.compileTimeout) {
      clearTimeout(this.compileTimeout);
      this.compileTimeout = null;
    }
    if (this.compileIdleCallback !== null && window.cancelIdleCallback) {
      window.cancelIdleCallback(this.compileIdleCallback);
      this.compileIdleCallback = null;
    }
    
    // Use requestIdleCallback for async compilation to prevent UI blocking
    // Fallback to setTimeout if requestIdleCallback is not available
    if (window.requestIdleCallback) {
      this.compileIdleCallback = window.requestIdleCallback(
        () => {
          this.recompile();
          this.compileIdleCallback = null;
        },
        { timeout: this.COMPILE_DEBOUNCE_MS }
      );
    } else {
      this.compileTimeout = window.setTimeout(() => {
        this.recompile();
        this.compileTimeout = null;
      }, this.COMPILE_DEBOUNCE_MS);
    }
  }
  
  /**
   * Recompile shader from graph.
   */
  private recompile(): void {
    if (!this.graph) return;
    
    try {
      // Compile
      const result = this.compiler.compile(this.graph);
      
      // Check for errors
      if (result.metadata.errors.length > 0) {
        this.handleCompilationErrors(result.metadata.errors);
        return;
      }
      
      // Create new shader instance
      const gl = this.renderer.getGLContext();
      const newInstance = new ShaderInstance(gl, result);
      
      // Transfer parameter values from old instance (if exists) and from graph
      // This ensures parameters are preserved even when connections change
      if (this.shaderInstance) {
        // First, transfer from old instance (for parameters that were not connected)
        this.transferParameters(this.shaderInstance, newInstance);
        // Then, transfer from graph to fill in any gaps (e.g., parameters that were
        // connected before but are now disconnected, or parameters that changed
        // while connected and need to be restored)
        this.transferParametersFromGraph(newInstance);
        this.shaderInstance.destroy();
      } else {
        // First compilation: transfer parameters from graph to shader instance
        this.transferParametersFromGraph(newInstance);
      }
      
      this.shaderInstance = newInstance;
      this.renderer.setShaderInstance(newInstance);
      
      // Update graph hash
      this.lastGraphHash = hashGraph(this.graph);
      
      // Render
      this.renderer.render();
      
    } catch (error) {
      this.handleCompilationError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Transfer parameter values from old instance to new instance.
   * Only transfers parameters that were not connected in the old shader.
   * Parameters that were connected will be transferred from the graph instead.
   */
  private transferParameters(oldInstance: ShaderInstance, newInstance: ShaderInstance): void {
    if (!this.graph) return;
    
    // Create a set of valid node IDs from current graph
    const validNodeIds = new Set(this.graph.nodes.map(n => n.id));
    
    // Transfer parameter values to new instance, but only for nodes that still exist
    for (const [key, value] of oldInstance.getParameters()) {
      const [nodeId, paramName] = key.split('.');
      
      // Only transfer if the node still exists in the graph
      if (validNodeIds.has(nodeId) && paramName) {
        // Check if parameter is connected to outputs in the NEW graph
        const isConnected = this.graph.connections.some(
          conn => conn.targetNodeId === nodeId && conn.targetParameter === paramName
        );
        if (isConnected) {
          // Parameter has input connection - check the input mode
          const node = this.graph.nodes.find(n => n.id === nodeId);
          if (node) {
            const inputMode = node.parameterInputModes?.[paramName];
            
            if (inputMode === 'override') {
              // Mode is explicitly 'override' - input completely replaces config, so skip uniform
              // Note: Parameters that were connected with 'override' in the old graph wouldn't be in oldInstance.getParameters() anyway,
              // but we check here for consistency and to handle edge cases
              continue;
            }
            // For add/subtract/multiply modes or undefined, the uniform is needed for combination
            // Continue to transfer the value below
          } else {
            // Node not found - skip
            continue;
          }
        }
        
        // Transfer the parameter value (either not connected, or connected with non-override mode)
        newInstance.setParameter(nodeId, paramName, value);
      }
    }
  }
  
  /**
   * Transfer parameter values from graph to shader instance.
   * Used for initial compilation and to fill gaps after transferring from old instance.
   * 
   * @param shaderInstance - The shader instance to transfer parameters to
   * @param skipIfExists - If true, skip parameters that are already set in the instance
   */
  private transferParametersFromGraph(shaderInstance: ShaderInstance, skipIfExists: boolean = false): void {
    if (!this.graph) return;
    
    // Get existing parameters from instance if we should skip them
    const existingParams = skipIfExists ? new Set<string>() : null;
    if (skipIfExists && shaderInstance) {
      // We can't directly query what's in the instance, so we'll just set all non-connected params
      // Setting the same value twice is safe and ensures correctness
      // For now, we'll always set (skipIfExists is for future optimization if needed)
    }
    
    // Transfer all parameter values from graph nodes to shader instance
    for (const node of this.graph.nodes) {
      for (const [paramName, value] of Object.entries(node.parameters)) {
        // Skip runtime-only parameters that are not shader uniforms
        // For audio-file-input nodes: filePath and autoPlay are runtime-only
        if (node.type === 'audio-file-input' && (paramName === 'filePath' || paramName === 'autoPlay')) {
          continue;
        }
        
        // For audio-analyzer nodes: frequencyBands, smoothing, and fftSize are runtime-only
        if (node.type === 'audio-analyzer' && (paramName === 'frequencyBands' || paramName === 'smoothing' || paramName === 'fftSize')) {
          continue;
        }
        
        // Check if parameter is connected to an output
        const isConnected = this.graph.connections.some(
          conn => conn.targetNodeId === node.id && conn.targetParameter === paramName
        );
        if (isConnected) {
          // Parameter has input connection - check the input mode
          // If mode is 'override', the input completely replaces the config value,
          // so the uniform is not used and we can skip setting it.
          // But if mode is 'add', 'subtract', 'multiply', or undefined (might default to something other than override),
          // the uniform IS used in the combination expression, so we MUST set it.
          // To be safe and ensure correctness, we'll set the uniform unless mode is explicitly 'override'.
          const inputMode = node.parameterInputModes?.[paramName];
          
          if (inputMode === 'override') {
            // Mode is explicitly 'override' - input completely replaces config, so skip uniform
            continue;
          }
          // For add/subtract/multiply modes or undefined, the uniform is needed for combination
          // Continue to set the uniform below
        }
        
        // Skip if already exists and skipIfExists is true
        if (skipIfExists && existingParams) {
          const key = `${node.id}.${paramName}`;
          if (existingParams.has(key)) {
            continue;
          }
        }
        
        // Handle different parameter value types
        if (typeof value === 'number') {
          shaderInstance.setParameter(node.id, paramName, value);
        }
        // Note: Other types (string, arrays, etc.) are not handled here as they're not uniforms
      }
    }
  }
  
  /**
   * Handle compilation errors.
   */
  private handleCompilationErrors(errors: string[]): void {
    // Report to UI
    this.errorCallback?.({
      type: 'compilation',
      errors: errors,
      timestamp: Date.now()
    });
    
    // Log to console
    console.error('Shader compilation errors:', errors);
  }
  
  /**
   * Handle compilation error (exception).
   */
  private handleCompilationError(error: Error): void {
    if (error instanceof ShaderCompilationError) {
      this.handleCompilationErrors([error.glError]);
    } else {
      console.error('Unexpected compilation error:', error);
      this.errorCallback?.({
        type: 'unexpected',
        error: error.message,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Get current shader instance (for time/resolution updates).
   */
  getShaderInstance(): ShaderInstance | null {
    return this.shaderInstance;
  }
}
