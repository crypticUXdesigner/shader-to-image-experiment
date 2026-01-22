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
      node.parameters[paramName] = value;
    }
    
    // Check if recompilation needed
    const graphHash = hashGraph(this.graph);
    const needsRecompile = graphHash !== this.lastGraphHash;
    
    if (needsRecompile) {
      // Debounce compilation
      this.scheduleRecompile();
    } else {
      // Just update uniform
      if (this.shaderInstance) {
        this.shaderInstance.setParameter(nodeId, paramName, value);
        this.renderer.render();
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
    if (this.compileTimeout) {
      clearTimeout(this.compileTimeout);
    }
    
    this.compileTimeout = window.setTimeout(() => {
      this.recompile();
      this.compileTimeout = null;
    }, this.COMPILE_DEBOUNCE_MS);
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
      
      // Transfer parameter values from old instance (if exists) or from graph (if first compilation)
      if (this.shaderInstance) {
        this.transferParameters(this.shaderInstance, newInstance);
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
   */
  private transferParameters(oldInstance: ShaderInstance, newInstance: ShaderInstance): void {
    // Transfer all parameter values to new instance
    for (const [key, value] of oldInstance.getParameters()) {
      const [nodeId, paramName] = key.split('.');
      newInstance.setParameter(nodeId, paramName, value);
    }
  }
  
  /**
   * Transfer parameter values from graph to shader instance (for initial compilation).
   */
  private transferParametersFromGraph(shaderInstance: ShaderInstance): void {
    if (!this.graph) return;
    
    // Transfer all parameter values from graph nodes to shader instance
    for (const node of this.graph.nodes) {
      for (const [paramName, value] of Object.entries(node.parameters)) {
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
