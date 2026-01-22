/**
 * Runtime Manager - Public API for UI Integration
 * 
 * Provides a clean interface for UI to interact with shader compilation and rendering.
 * Wraps CompilationManager and Renderer as specified in Runtime Integration Specification.
 */

import { CompilationManager } from './CompilationManager';
import { Renderer } from './Renderer';
import type { ShaderCompiler, ErrorCallback } from './types';
import type { NodeGraph, NodeInstance, Connection } from '../data-model/types';

export class RuntimeManager {
  private compilationManager: CompilationManager;
  private renderer: Renderer;
  private currentGraph: NodeGraph | null = null;
  
  constructor(
    canvas: HTMLCanvasElement,
    compiler: ShaderCompiler,
    errorCallback?: ErrorCallback
  ) {
    // Create renderer
    this.renderer = new Renderer(canvas);
    
    // Create compilation manager
    this.compilationManager = new CompilationManager(
      compiler,
      this.renderer,
      errorCallback
    );
  }
  
  /**
   * Set the node graph (triggers compilation).
   */
  setGraph(graph: NodeGraph): void {
    this.currentGraph = graph;
    this.compilationManager.setGraph(graph);
    this.compilationManager.onGraphStructureChange();
  }
  
  /**
   * Update a parameter value.
   * Determines if recompilation is needed or just uniform update.
   */
  updateParameter(nodeId: string, paramName: string, value: number): void {
    this.compilationManager.onParameterChange(nodeId, paramName, value);
  }
  
  /**
   * Handle node added (graph structure changed).
   */
  onNodeAdded(_node: NodeInstance): void {
    if (this.currentGraph) {
      // Node should already be in graph (added by UI)
      // Just trigger recompilation
      this.compilationManager.onGraphStructureChange();
    }
  }
  
  /**
   * Handle node removed (graph structure changed).
   */
  onNodeRemoved(_nodeId: string): void {
    if (this.currentGraph) {
      // Node should already be removed from graph (removed by UI)
      // Just trigger recompilation
      this.compilationManager.onGraphStructureChange();
    }
  }
  
  /**
   * Handle connection added (graph structure changed).
   */
  onConnectionAdded(_connection: Connection): void {
    if (this.currentGraph) {
      // Connection should already be in graph (added by UI)
      // Just trigger recompilation
      this.compilationManager.onGraphStructureChange();
    }
  }
  
  /**
   * Handle connection removed (graph structure changed).
   */
  onConnectionRemoved(_connectionId: string): void {
    if (this.currentGraph) {
      // Connection should already be removed from graph (removed by UI)
      // Just trigger recompilation
      this.compilationManager.onGraphStructureChange();
    }
  }
  
  /**
   * Set time uniform.
   */
  setTime(time: number): void {
    const shaderInstance = this.compilationManager.getShaderInstance();
    if (shaderInstance) {
      shaderInstance.setTime(time);
      this.renderer.render();
    }
  }
  
  /**
   * Render a single frame.
   */
  render(): void {
    this.renderer.render();
  }
  
  /**
   * Start animation loop.
   */
  startAnimation(): void {
    this.renderer.startAnimation();
  }
  
  /**
   * Stop animation loop.
   */
  stopAnimation(): void {
    this.renderer.stopAnimation();
  }
  
  /**
   * Get renderer (for advanced use).
   */
  getRenderer(): Renderer {
    return this.renderer;
  }
}

// Re-export compiler interface and error callback for convenience
export type { ShaderCompiler, ErrorCallback } from './types';
