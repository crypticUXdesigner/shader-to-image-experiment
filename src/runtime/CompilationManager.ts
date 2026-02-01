/**
 * CompilationManager - Compilation Coordination
 * 
 * Coordinates compilation triggers, manages shader instance lifecycle,
 * handles parameter updates (recompile vs uniform-only), and debouncing.
 * Implements the CompilationManager class from Runtime Integration Specification.
 */

import { ShaderInstance } from './ShaderInstance';
import { Renderer } from './Renderer';
import type { ShaderCompiler, ErrorCallback, CompilationResult } from './types';
import type { NodeGraph } from '../data-model/types';
import { hashGraph } from './utils';
import { ShaderCompilationError } from './errors';
import type { ErrorHandler } from '../utils/errorHandling';
import { ErrorUtils, adaptErrorCallback, globalErrorHandler } from '../utils/errorHandling';
import type { Disposable } from '../utils/Disposable';
import { GraphChangeDetector } from '../utils/changeDetection/GraphChangeDetector';

export class CompilationManager implements Disposable {
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
  
  // Track previous graph for change detection (incremental compilation)
  private previousGraph: NodeGraph | null = null;
  
  // Track previous graph state metadata for incremental compilation
  private previousGraphState: {
    nodeIds: Set<string>;
    connectionIds: Set<string>;
    executionOrder: string[];
  } | null = null;
  
  // Store compilation metadata for incremental compilation
  private compilationMetadata: {
    result: CompilationResult;
    executionOrder: string[];
  } | null = null;
  
  // Error handling - support both old ErrorCallback and new ErrorHandler
  private errorCallback?: ErrorCallback;
  private errorHandler?: ErrorHandler;
  
  // Parameter update batching
  private parameterRenderScheduled: boolean = false;
  
  constructor(
    compiler: ShaderCompiler,
    renderer: Renderer,
    errorCallback?: ErrorCallback,
    errorHandler?: ErrorHandler
  ) {
    this.compiler = compiler;
    this.renderer = renderer;
    this.errorCallback = errorCallback;
    this.errorHandler = errorHandler;
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
  onParameterChange(nodeId: string, paramName: string, value: number | number[][]): void {
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

      // Skip runtime-only parameters for audio-analyzer nodes (band remap params are used in JS only)
      const isAnalyzerRuntimeParam =
        node.type === 'audio-analyzer' &&
        (paramName === 'smoothing' || paramName === 'fftSize' || paramName === 'frequencyBands' ||
          /^band\d+Remap(InMin|InMax|OutMin|OutMax)$/.test(paramName));
      if (isAnalyzerRuntimeParam) {
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
    } else if (typeof value === 'number') {
      // Parameter value changed (number) - batch uniform updates and rendering
      this.scheduleParameterUpdate(nodeId, paramName, value);
    } else {
      // Array parameter (e.g. frequencyBands) - trigger recompile
      this.scheduleRecompile();
    }
  }
  
  /**
   * Handle graph structure change (node added/removed, connection added/removed).
   * @param immediate - If true, recompile immediately (e.g. when only connections changed) so parameter connections take effect right away.
   */
  onGraphStructureChange(immediate: boolean = false): void {
    if (immediate) {
      this.cancelPendingRecompile();
      // Defer to next tick so we don't block the connection handler; still much faster than 100ms debounce
      this.compileTimeout = window.setTimeout(() => {
        this.compileTimeout = null;
        this.recompile();
      }, 0);
    } else {
      this.scheduleRecompile();
    }
  }

  /**
   * Cancel any pending recompilation (used before immediate recompile).
   */
  private cancelPendingRecompile(): void {
    if (this.compileTimeout) {
      clearTimeout(this.compileTimeout);
      this.compileTimeout = null;
    }
    if (this.compileIdleCallback !== null && typeof window !== 'undefined' && window.cancelIdleCallback) {
      window.cancelIdleCallback(this.compileIdleCallback);
      this.compileIdleCallback = null;
    }
  }
  
  /**
   * Schedule parameter update for next frame (batching).
   * Updates uniforms immediately (cheap operation) but defers rendering.
   */
  private scheduleParameterUpdate(nodeId: string, paramName: string, value: number): void {
    if (!this.graph || !this.shaderInstance) return;
    
    // Update uniform immediately (cheap operation, doesn't block)
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
          this.shaderInstance.setParameter(nodeId, paramName, value);
        }
        // If mode is explicitly 'override', skip uniform update (input completely replaces config)
      }
    } else {
      // No input connection - just update uniform
      this.shaderInstance.setParameter(nodeId, paramName, value);
    }
    
    // Mark renderer as dirty
    this.renderer.markDirty('parameter');
    
    // Schedule render for next frame (if not already scheduled)
    if (!this.parameterRenderScheduled) {
      this.parameterRenderScheduled = true;
      requestAnimationFrame(() => {
        this.flushParameterRender();
      });
    }
  }
  
  /**
   * Flush pending parameter render (called on next animation frame).
   */
  private flushParameterRender(): void {
    this.parameterRenderScheduled = false;
    
    // All uniforms were already updated in scheduleParameterUpdate()
    // Just need to render once per frame
    this.renderer.render();
  }
  
  /**
   * Schedule recompilation (with debouncing).
   */
  private scheduleRecompile(): void {
    this.cancelPendingRecompile();
    
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
   * Uses incremental compilation when possible to improve performance.
   */
  private recompile(): void {
    if (!this.graph) return;
    
    try {
      // Detect what changed in the graph
      const changes = this.detectGraphChanges(this.graph);
      
      // Get previous compilation result for incremental compilation
      const previousResult = this.compilationMetadata?.result || null;
      
      // When connections change, always do full compilation so parameter inputs
      // (e.g. hexGap from one-minus/audio) are correctly wired in the shader.
      // Incremental compilation can leave parameter connection wiring stale.
      const tryIncremental =
        !changes.changedConnections &&
        previousResult &&
        changes.affectedNodeIds.size < this.graph.nodes.length * 0.5;

      let result: CompilationResult;
      if (tryIncremental) {
        const incrementalResult = (this.compiler as any).compileIncremental?.(
          this.graph,
          previousResult,
          changes.affectedNodeIds
        );
        if (incrementalResult) {
          result = incrementalResult;
        } else {
          result = this.compiler.compile(this.graph);
        }
      } else {
        result = this.compiler.compile(this.graph);
      }
      
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
      
      // Store compilation metadata for future incremental compilation
      this.compilationMetadata = {
        result,
        executionOrder: result.metadata.executionOrder
      };
      
      // Update previous graph state with execution order
      if (this.previousGraphState) {
        this.previousGraphState.executionOrder = result.metadata.executionOrder;
      }
      
      // Update graph hash
      this.lastGraphHash = hashGraph(this.graph);
      
      // Mark as dirty and render after successful compilation
      this.renderer.markDirty('compilation');
      this.renderer.render();
      
    } catch (error) {
      this.handleCompilationError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Detect what changed in the graph compared to previous state.
   * Returns information about added/removed nodes and affected nodes.
   * Uses unified change detection system.
   */
  private detectGraphChanges(graph: NodeGraph): {
    addedNodes: string[];
    removedNodes: string[];
    changedConnections: boolean;
    changedNodeIds: Set<string>;
    affectedNodeIds: Set<string>;
  } {
    // Use unified change detection system
    const changeResult = GraphChangeDetector.detectChanges(
      this.previousGraph,
      graph,
      {
        trackAffectedNodes: true,
        includeConnectionIds: false // We don't need connection IDs for this use case
      }
    );
    
    // Update previous graph state metadata for incremental compilation
    const currentNodeIds = new Set(graph.nodes.map(n => n.id));
    const currentConnectionIds = new Set(graph.connections.map(c => c.id));
    
    if (!this.previousGraphState) {
      // First compilation - initialize state
      this.previousGraphState = {
        nodeIds: currentNodeIds,
        connectionIds: currentConnectionIds,
        executionOrder: []
      };
    } else {
      // Update previous state
      this.previousGraphState = {
        nodeIds: currentNodeIds,
        connectionIds: currentConnectionIds,
        executionOrder: this.previousGraphState.executionOrder // Preserve execution order
      };
    }
    
    // Update previous graph reference for next comparison
    this.previousGraph = graph;
    
    // Build set of changed node IDs (type or parameters changed, plus added nodes)
    const changedNodeIds = new Set<string>();
    changeResult.changedNodeIds.forEach(id => changedNodeIds.add(id));
    changeResult.addedNodeIds.forEach(id => changedNodeIds.add(id));
    
    return {
      addedNodes: changeResult.addedNodeIds,
      removedNodes: changeResult.removedNodeIds,
      changedConnections: changeResult.isConnectionsChanged,
      changedNodeIds,
      affectedNodeIds: changeResult.affectedNodeIds
    };
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
        
        // For audio-analyzer: frequencyBands, smoothing, fftSize, and band remap params are runtime-only
        if (node.type === 'audio-analyzer' &&
            (paramName === 'frequencyBands' || paramName === 'smoothing' || paramName === 'fftSize' ||
             /^band\d+Remap(InMin|InMax|OutMin|OutMax)$/.test(paramName))) {
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
          // Debug logging for turbulence strength
          if (node.type === 'turbulence' && paramName === 'turbulenceStrength') {
            const isConnected = this.graph.connections.some(
              conn => conn.targetNodeId === node.id && conn.targetParameter === paramName
            );
            const inputMode = node.parameterInputModes?.[paramName];
            console.log(`[Turbulence Uniform] Setting uniform for ${node.id}.${paramName}:`, {
              value,
              isConnected,
              inputMode,
              nodeId: node.id
            });
          }
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
    const message = errors.length === 1 
      ? errors[0] 
      : `Shader compilation failed with ${errors.length} errors`;
    
    // Use new error handler if available
    if (this.errorHandler) {
      this.errorHandler.reportError(
        ErrorUtils.compilationError(message, errors)
      );
    } else if (this.errorCallback) {
      // Fallback to old callback for backward compatibility
      const oldError = {
        type: 'compilation' as const,
        errors: errors,
        timestamp: Date.now()
      };
      this.errorCallback(oldError);
      
      // Also report to global error handler
      globalErrorHandler.reportError(adaptErrorCallback(oldError));
    } else {
      // No error handler - use global handler
      globalErrorHandler.reportError(
        ErrorUtils.compilationError(message, errors)
      );
    }
  }
  
  /**
   * Handle compilation error (exception).
   */
  private handleCompilationError(error: Error): void {
    if (error instanceof ShaderCompilationError) {
      this.handleCompilationErrors([error.glError]);
    } else {
      const message = `Unexpected compilation error: ${error.message}`;
      
      // Use new error handler if available
      if (this.errorHandler) {
        this.errorHandler.reportError(
          ErrorUtils.compilationError(message, undefined, { originalError: error })
        );
      } else if (this.errorCallback) {
        // Fallback to old callback for backward compatibility
        const oldError = {
          type: 'unexpected' as const,
          error: error.message,
          timestamp: Date.now()
        };
        this.errorCallback(oldError);
        
        // Also report to global error handler
        globalErrorHandler.reportError(adaptErrorCallback(oldError));
      } else {
        // No error handler - use global handler
        globalErrorHandler.reportError(
          ErrorUtils.compilationError(message, undefined, { originalError: error })
        );
      }
    }
  }
  
  /**
   * Get current shader instance (for time/resolution updates).
   */
  getShaderInstance(): ShaderInstance | null {
    return this.shaderInstance;
  }
  
  /**
   * Cleanup all resources.
   */
  destroy(): void {
    // Cancel pending compilation
    if (this.compileTimeout) {
      clearTimeout(this.compileTimeout);
      this.compileTimeout = null;
    }
    
    if (this.compileIdleCallback !== null && window.cancelIdleCallback) {
      window.cancelIdleCallback(this.compileIdleCallback);
      this.compileIdleCallback = null;
    }
    
    // Clean up shader instance
    if (this.shaderInstance) {
      this.shaderInstance.destroy();
      this.shaderInstance = null;
    }
    
    // Clear references
    this.graph = null;
    this.compilationMetadata = null;
    this.previousGraphState = null;
    this.previousGraph = null;
  }
}
