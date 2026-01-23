/**
 * Runtime Manager - Public API for UI Integration
 * 
 * Provides a clean interface for UI to interact with shader compilation and rendering.
 * Wraps CompilationManager and Renderer as specified in Runtime Integration Specification.
 */

import { CompilationManager } from './CompilationManager';
import { Renderer } from './Renderer';
import { AudioManager } from './AudioManager';
import type { ShaderCompiler, ErrorCallback } from './types';
import type { NodeGraph, NodeInstance, Connection } from '../data-model/types';

export class RuntimeManager {
  private compilationManager: CompilationManager;
  private renderer: Renderer;
  private audioManager: AudioManager;
  private currentGraph: NodeGraph | null = null;
  
  constructor(
    canvas: HTMLCanvasElement,
    compiler: ShaderCompiler,
    errorCallback?: ErrorCallback
  ) {
    // Create renderer
    this.renderer = new Renderer(canvas);
    
    // Create audio manager
    this.audioManager = new AudioManager();
    
    // Create compilation manager
    this.compilationManager = new CompilationManager(
      compiler,
      this.renderer,
      errorCallback
    );
  }
  
  /**
   * Check if only node positions changed (not structure, connections, or parameters)
   */
  private isOnlyPositionChange(oldGraph: NodeGraph | null, newGraph: NodeGraph): boolean {
    if (!oldGraph) return false;
    
    // Check if node count changed
    if (oldGraph.nodes.length !== newGraph.nodes.length) return false;
    if (oldGraph.connections.length !== newGraph.connections.length) return false;
    
    // Check if any nodes were added/removed (by ID)
    const oldNodeIds = new Set(oldGraph.nodes.map(n => n.id));
    const newNodeIds = new Set(newGraph.nodes.map(n => n.id));
    if (oldNodeIds.size !== newNodeIds.size) return false;
    for (const id of oldNodeIds) {
      if (!newNodeIds.has(id)) return false;
    }
    
    // Check if any node types changed
    const oldNodesById = new Map(oldGraph.nodes.map(n => [n.id, n]));
    for (const newNode of newGraph.nodes) {
      const oldNode = oldNodesById.get(newNode.id);
      if (!oldNode || oldNode.type !== newNode.type) return false;
    }
    
    // Check if any parameters changed (excluding positions)
    for (const newNode of newGraph.nodes) {
      const oldNode = oldNodesById.get(newNode.id);
      if (!oldNode) return false;
      
      // Compare parameters (excluding position which is in node.position, not parameters)
      const oldParams = JSON.stringify(oldNode.parameters);
      const newParams = JSON.stringify(newNode.parameters);
      if (oldParams !== newParams) return false;
    }
    
    // Check if connections changed
    const oldConnStr = JSON.stringify(oldGraph.connections.map(c => ({
      sourceNodeId: c.sourceNodeId,
      sourcePort: c.sourcePort,
      targetNodeId: c.targetNodeId,
      targetPort: c.targetPort,
      targetParameter: c.targetParameter
    })).sort((a, b) => a.sourceNodeId.localeCompare(b.sourceNodeId)));
    
    const newConnStr = JSON.stringify(newGraph.connections.map(c => ({
      sourceNodeId: c.sourceNodeId,
      sourcePort: c.sourcePort,
      targetNodeId: c.targetNodeId,
      targetPort: c.targetPort,
      targetParameter: c.targetParameter
    })).sort((a, b) => a.sourceNodeId.localeCompare(b.sourceNodeId)));
    
    if (oldConnStr !== newConnStr) return false;
    
    // If we get here, only positions (or viewState) changed
    return true;
  }

  /**
   * Set the node graph (triggers compilation).
   */
  async setGraph(graph: NodeGraph): Promise<void> {
    // Validate graph
    if (!graph || !graph.nodes) {
      console.error('[RuntimeManager] Invalid graph provided to setGraph');
      return;
    }
    
    // Check if only positions changed - if so, skip expensive operations
    // IMPORTANT: Must check BEFORE setting this.currentGraph, otherwise we compare graph to itself!
    const oldGraph = this.currentGraph;
    const onlyPositionsChanged = this.isOnlyPositionChange(oldGraph, graph);
    
    // Always update current graph reference (after checking position changes)
    // This ensures the graph is available even if audio loading fails
    this.currentGraph = graph;
    
    if (!onlyPositionsChanged) {
      // Clean up audio nodes that are no longer in the graph
      if (this.currentGraph) {
        const currentNodeIds = new Set(this.currentGraph.nodes.map(n => n.id));
        const newNodeIds = new Set(graph.nodes.map(n => n.id));
        
        // Find nodes that were removed
        for (const nodeId of currentNodeIds) {
          if (!newNodeIds.has(nodeId)) {
            // Node was deleted, clean up audio resources
            this.audioManager.removeAudioNode(nodeId);
            this.audioManager.removeAnalyzerNode(nodeId);
          }
        }
      }
      
      // Only update compilation manager if structure actually changed
      this.compilationManager.setGraph(graph);
      this.compilationManager.onGraphStructureChange();
      
      // Load default audio files first (async) - only if structure changed
      // Note: Errors in audio loading are caught and logged, but don't prevent graph from being set
      try {
        await this.loadDefaultAudioFiles(graph);
      } catch (error) {
        console.error('[RuntimeManager] Error in loadDefaultAudioFiles (non-fatal):', error);
        // Continue - graph is already set, audio loading failure shouldn't break the app
      }
      
      // Then initialize audio analyzers (after audio files are loaded)
      this.initializeAudioAnalyzers(graph);
    }
  }

  /**
   * Load default audio files for audio-file-input nodes that have filePath set
   */
  private async loadDefaultAudioFiles(graph: NodeGraph): Promise<void> {
    for (const node of graph.nodes) {
      if (node.type === 'audio-file-input') {
        const filePath = node.parameters.filePath;
        
        if (typeof filePath === 'string' && filePath.trim() !== '') {
          let resolvedPath = filePath;
          
          // If it's a relative path (doesn't start with /, http://, or https://)
          // and doesn't start with ./ or ../, treat it as a public folder file
          if (!filePath.startsWith('http://') && 
              !filePath.startsWith('https://') && 
              !filePath.startsWith('/') &&
              !filePath.startsWith('./') &&
              !filePath.startsWith('../')) {
            // Assume it's in public folder, add leading slash
            resolvedPath = '/' + filePath;
          }
          
          // Check if audio is already loaded for this node with the same path
          const existingState = this.audioManager.getAudioNodeState(node.id);
          if (existingState && existingState.audioBuffer) {
            // Audio is already loaded - check if it's the same file
            // We can't easily compare file paths, but if audio is loaded and playing,
            // we should skip reloading to avoid restarting playback
            // Only reload if the filePath in the node parameters doesn't match what we expect
            // For now, if audio is already loaded, skip reloading
            console.log(`[RuntimeManager] Audio already loaded for node ${node.id}, skipping reload`);
            continue;
          }
          
          // Check if it's a valid path/URL
          if (resolvedPath.startsWith('http://') || 
              resolvedPath.startsWith('https://') || 
              resolvedPath.startsWith('/')) {
            try {
              await this.onAudioFileParameterChange(node.id, 'filePath', resolvedPath);
            } catch (error: any) {
              const errorMessage = error?.message || String(error);
              console.error(`[RuntimeManager] Failed to load default audio file for node ${node.id}:`, errorMessage);
              // Continue loading other files even if one fails
            }
          } else {
            console.warn(`[RuntimeManager] Invalid audio file path format: ${filePath} (resolved: ${resolvedPath})`);
          }
        }
      }
    }
  }

  /**
   * Initialize audio analyzers for all audio-analyzer nodes in the graph
   */
  private initializeAudioAnalyzers(graph: NodeGraph): void {
    for (const node of graph.nodes) {
      if (node.type === 'audio-analyzer') {
        // Find connected audio file input node
        const connection = graph.connections.find(
          c => c.targetNodeId === node.id && c.targetPort === 'audioFile'
        );
        if (connection) {
          const audioFileNodeId = connection.sourceNodeId;
          
          // Check if audio file node is loaded before creating analyzer
          const audioState = this.audioManager.getAudioNodeState(audioFileNodeId);
          if (!audioState || !audioState.analyserNode) {
            // Audio file not loaded yet, skip for now (will be initialized when file loads)
            continue;
          }
          
          const frequencyBands = node.parameters.frequencyBands as number[][] | undefined;
          const smoothing = typeof node.parameters.smoothing === 'number' ? node.parameters.smoothing : 0.8;
          const fftSize = typeof node.parameters.fftSize === 'number' ? node.parameters.fftSize : 4096;
          
          if (Array.isArray(frequencyBands) && frequencyBands.length > 0) {
            const bands = frequencyBands.map((band: any) => {
              if (Array.isArray(band) && band.length >= 2) {
                return { minHz: band[0], maxHz: band[1] };
              }
              return { minHz: 20, maxHz: 20000 };
            });
            
            try {
              this.audioManager.createAnalyzer(node.id, audioFileNodeId, bands, smoothing, fftSize);
            } catch (error) {
              console.warn('Failed to initialize audio analyzer:', error);
            }
          }
        }
      }
    }
  }
  
  /**
   * Update a parameter value.
   * Determines if recompilation is needed or just uniform update.
   */
  updateParameter(nodeId: string, paramName: string, value: number): void {
    // Handle runtime-only parameters for audio nodes
    if (this.currentGraph) {
      const node = this.currentGraph.nodes.find(n => n.id === nodeId);
      
      // Handle audio-file-input runtime parameters
      if (node && node.type === 'audio-file-input' && paramName === 'autoPlay') {
        // autoPlay is runtime-only, not a shader uniform
        // Update the graph parameter but don't try to set it as a uniform
        if (node) {
          node.parameters[paramName] = value;
        }
        
        // Trigger playback if autoPlay is enabled (handle both int and float)
        const autoPlayValue = typeof value === 'number' ? Math.round(value) : 0;
        if (autoPlayValue === 1) {
          this.audioManager.playAudio(nodeId).catch(error => {
            console.warn('Autoplay blocked - user interaction required:', error);
          });
        } else {
          // Stop playback if autoPlay is disabled
          this.audioManager.stopAudio(nodeId);
        }
        return;
      }
      
      // Handle audio-analyzer runtime parameters
      if (node && node.type === 'audio-analyzer' && (paramName === 'smoothing' || paramName === 'fftSize' || paramName === 'frequencyBands')) {
        // These are runtime-only, not shader uniforms
        // Update the graph parameter and handle via audio analyzer parameter change handler
        if (node) {
          node.parameters[paramName] = value;
        }
        this.onAudioAnalyzerParameterChange(nodeId, paramName, value);
        return;
      }
    }
    
    // For all other parameters, use normal flow
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
  onNodeRemoved(nodeId: string): void {
    // Clean up audio resources for deleted node (safe to call even if node doesn't exist)
    this.audioManager.removeAudioNode(nodeId);
    this.audioManager.removeAnalyzerNode(nodeId);
    
    if (this.currentGraph) {
      // Trigger recompilation
      this.compilationManager.onGraphStructureChange();
    }
  }
  
  /**
   * Handle connection added (graph structure changed).
   */
  onConnectionAdded(connection: Connection): void {
    if (this.currentGraph) {
      // Connection should already be in graph (added by UI)
      // Just trigger recompilation
      this.compilationManager.onGraphStructureChange();
      
      // If this connects an audio-analyzer to an audio-file-input, initialize analyzer
      const targetNode = this.currentGraph.nodes.find(n => n.id === connection.targetNodeId);
      if (targetNode && targetNode.type === 'audio-analyzer' && connection.targetPort === 'audioFile') {
        this.initializeAudioAnalyzers(this.currentGraph);
      }
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
      
      // Update audio uniforms
      this.updateAudioUniforms(shaderInstance);
      
      this.renderer.render();
    }
  }

  /**
   * Update audio uniforms (called each frame)
   */
  private updateAudioUniforms(shaderInstance: any): void {
    this.audioManager.updateUniforms(
      (nodeId: string, paramName: string, value: number) => {
        shaderInstance.setAudioUniform(nodeId, paramName, value);
      },
      (updates: Array<{ nodeId: string, paramName: string, value: number }>) => {
        for (const update of updates) {
          shaderInstance.setAudioUniform(update.nodeId, update.paramName, update.value);
        }
      }
    );
  }

  /**
   * Handle audio file parameter change
   */
  async onAudioFileParameterChange(nodeId: string, paramName: string, value: any): Promise<void> {
    if (paramName === 'filePath') {
      try {
        // Check if we're loading the same file that's already loaded
        const existingState = this.audioManager.getAudioNodeState(nodeId);
        let currentFilePath = '';
        if (this.currentGraph) {
          const node = this.currentGraph.nodes.find(n => n.id === nodeId);
          if (node) {
            currentFilePath = typeof node.parameters.filePath === 'string' ? node.parameters.filePath : '';
          }
        }
        
        // Determine the new file path
        let newFilePath = '';
        if (value instanceof File) {
          newFilePath = value.name;
        } else if (typeof value === 'string' && value.trim() !== '') {
          // Extract filename from URL/path for comparison
          newFilePath = value.split('/').pop() || value.split('\\').pop() || value;
        }
        
        // If the file path hasn't changed and audio is already loaded, skip reloading
        if (existingState && existingState.audioBuffer && newFilePath === currentFilePath && newFilePath !== '') {
          console.log(`[RuntimeManager] Audio file ${newFilePath} already loaded for node ${nodeId}, skipping reload`);
          return;
        }
        
        let filename = '';
        
        if (value instanceof File) {
          // User selected a file
          await this.audioManager.loadAudioFile(nodeId, value);
          filename = value.name;
        } else if (typeof value === 'string' && value.trim() !== '') {
          // URL or path string (for default files)
          await this.audioManager.loadAudioFile(nodeId, value);
          // Extract filename from URL/path
          filename = value.split('/').pop() || value.split('\\').pop() || value;
        } else {
          return; // Invalid value
        }
        
        // Store filename in node parameters for display
        if (this.currentGraph) {
          const node = this.currentGraph.nodes.find(n => n.id === nodeId);
          if (node) {
            node.parameters.filePath = filename;
          }
        }
        
        // Initialize analyzers connected to this audio file node (now that it's loaded)
        if (this.currentGraph) {
          this.initializeAudioAnalyzers(this.currentGraph);
        }
        
        // Auto-play if enabled (only after user interaction)
        const node = this.currentGraph?.nodes.find(n => n.id === nodeId);
        // Handle both integer and float values (0.42 should be treated as 0, 1.0 as 1)
        const autoPlayValue = typeof node?.parameters.autoPlay === 'number' 
          ? Math.round(node.parameters.autoPlay) 
          : 0;
        if (node && autoPlayValue === 1) {
          // Try to play, but don't fail if autoplay is blocked
          // Note: Autoplay may be blocked by browser policy - user interaction required
          this.audioManager.playAudio(nodeId).catch(error => {
            // This is expected if autoplay is blocked - audio is still loaded and ready
            const errorMsg = error?.message || String(error);
            if (!errorMsg.includes('user gesture') && !errorMsg.includes('user interaction') && !errorMsg.includes('not allowed to start')) {
              console.warn('[RuntimeManager] Failed to start audio playback:', errorMsg);
            }
          });
        }
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error(`[RuntimeManager] Failed to load audio file for node ${nodeId}:`, errorMessage);
        
        // Don't throw - allow the UI to continue working even if audio fails
        // The error is logged so the user can see what went wrong
        // TODO: Consider showing a user-friendly notification/toast
      }
    }
  }

  /**
   * Handle audio analyzer parameter change
   */
  onAudioAnalyzerParameterChange(nodeId: string, paramName: string, value: any): void {
    if (!this.currentGraph) return;
    
    const node = this.currentGraph.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Find connected audio file input node
    const connection = this.currentGraph.connections.find(
      c => c.targetNodeId === nodeId && c.targetPort === 'audioFile'
    );
    if (!connection) return;
    
    const audioFileNodeId = connection.sourceNodeId;
    
    // Recreate analyzer if frequencyBands, smoothing, or fftSize changes
    if (paramName === 'frequencyBands' || paramName === 'smoothing' || paramName === 'fftSize') {
      // Remove old analyzer
      this.audioManager.removeAnalyzerNode(nodeId);
      
      // Get current parameter values
      const frequencyBands = node.parameters.frequencyBands as number[][] | undefined;
      const smoothing = typeof node.parameters.smoothing === 'number' ? node.parameters.smoothing : 0.8;
      const fftSize = typeof node.parameters.fftSize === 'number' ? node.parameters.fftSize : 4096;
      
      if (Array.isArray(frequencyBands) && frequencyBands.length > 0) {
        // Convert frequency bands format
        const bands = frequencyBands.map((band: any) => {
          if (Array.isArray(band) && band.length >= 2) {
            return { minHz: band[0], maxHz: band[1] };
          }
          return { minHz: 20, maxHz: 20000 };
        });
        
        try {
          this.audioManager.createAnalyzer(nodeId, audioFileNodeId, bands, smoothing, fftSize);
        } catch (error) {
          console.error('Failed to create audio analyzer:', error);
        }
      }
    }
  }

  /**
   * Toggle global audio playback (all audio file inputs)
   */
  toggleGlobalAudioPlayback(): void {
    // Debug: Check graph state
    if (!this.currentGraph) {
      console.warn('[RuntimeManager] No current graph set - cannot toggle playback');
      return;
    }
    
    if (!this.currentGraph.nodes || this.currentGraph.nodes.length === 0) {
      console.warn('[RuntimeManager] Graph has no nodes - cannot toggle playback');
      return;
    }
    
    // Check if there are any audio file input nodes first
    const audioFileNodes = this.currentGraph.nodes.filter(n => n.type === 'audio-file-input');
    const hasAudioNodes = audioFileNodes.length > 0;
    
    if (!hasAudioNodes) {
      console.warn(
        `[RuntimeManager] No audio file input nodes in graph - cannot toggle playback. ` +
        `Graph has ${this.currentGraph.nodes.length} nodes of types: ` +
        `${[...new Set(this.currentGraph.nodes.map(n => n.type))].join(', ')}`
      );
      return;
    }
    
    // Get audio node IDs
    const audioNodeIds = this.currentGraph?.nodes
      .filter(n => n.type === 'audio-file-input')
      .map(n => n.id) || [];
    
    // Check if audio is actually loaded
    const loadedStates = audioNodeIds.map(id => {
      const state = this.audioManager.getAudioNodeState(id);
      return { id, state, hasBuffer: state && state.audioBuffer !== null };
    });
    
    const loadedCount = loadedStates.filter(s => s.hasBuffer).length;
    const globalState = this.audioManager.getGlobalAudioState();
    
    if (!globalState) {
      if (loadedCount === 0) {
        console.warn(`[RuntimeManager] Audio nodes found (${audioNodeIds.length}) but no audio loaded yet. Audio may still be loading, or loading may have failed. Check console for errors.`);
      } else {
        // Try to play even if getGlobalAudioState returns null - it might work
        const firstLoadedNode = loadedStates.find(s => s.hasBuffer);
        if (firstLoadedNode) {
          this.audioManager.playAudio(firstLoadedNode.id).catch(error => {
            console.error(`[RuntimeManager] Failed to play audio for node ${firstLoadedNode.id}:`, error);
          });
        }
      }
      return;
    }
    
    if (globalState.isPlaying) {
      this.audioManager.stopAllAudio();
    } else {
      // Resume from current position
      this.audioManager.playAllAudio(globalState.currentTime).catch(error => {
        console.error('[RuntimeManager] Failed to play audio:', error);
      });
    }
  }
  
  /**
   * Seek global audio to a specific time
   */
  seekGlobalAudio(time: number): void {
    this.audioManager.seekAllAudio(time).catch(error => {
      console.warn('Failed to seek audio:', error);
    });
  }
  
  /**
   * Get global audio state
   */
  getGlobalAudioState(): { isPlaying: boolean; currentTime: number; duration: number } | null {
    return this.audioManager.getGlobalAudioState();
  }

  /**
   * Get audio manager (for external use)
   */
  getAudioManager(): AudioManager {
    return this.audioManager;
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
