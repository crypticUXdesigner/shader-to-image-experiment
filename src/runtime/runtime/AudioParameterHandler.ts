/**
 * Audio Parameter Handler
 * 
 * Handles audio parameter coordination and audio file loading.
 * Extracted from RuntimeManager to improve separation of concerns.
 */

import type { IAudioManager } from '../types';
import type { NodeGraph } from '../../data-model/types';
import type { ErrorHandler } from '../../utils/errorHandling';

// Try to import globalErrorHandler if it exists (for backward compatibility)
let globalErrorHandler: ErrorHandler | undefined;
try {
  // Dynamic import to avoid errors if globalErrorHandler doesn't exist
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const errorHandling = require('../../utils/errorHandling');
  if (errorHandling.globalErrorHandler) {
    globalErrorHandler = errorHandling.globalErrorHandler;
  }
} catch {
  // globalErrorHandler not available, will use instance errorHandler only
}

/**
 * Audio Parameter Handler
 * 
 * Coordinates audio file loading, analyzer initialization, and parameter updates.
 */
export class AudioParameterHandler {
  private audioManager: IAudioManager;
  private errorHandler?: ErrorHandler;

  constructor(audioManager: IAudioManager, errorHandler?: ErrorHandler) {
    this.audioManager = audioManager;
    this.errorHandler = errorHandler;
  }

  /**
   * Load default audio files for audio-file-input nodes that have filePath set.
   *
   * @param graph - Current node graph
   */
  async loadDefaultAudioFiles(graph: NodeGraph): Promise<void> {
    for (const node of graph.nodes) {
      if (node.type === 'audio-file-input') {
        const filePath = node.parameters.filePath;

        if (typeof filePath === 'string' && filePath.trim() !== '') {
          let resolvedPath = filePath;

          // If it's a relative path (doesn't start with /, http://, or https://)
          // and doesn't start with ./ or ../, treat it as a public folder file
          if (
            !filePath.startsWith('http://') &&
            !filePath.startsWith('https://') &&
            !filePath.startsWith('/') &&
            !filePath.startsWith('./') &&
            !filePath.startsWith('../')
          ) {
            // Assume it's in public folder, add leading slash
            resolvedPath = '/' + filePath;
          }

          // Check if audio is already loaded for this node with the same path
          const existingState = this.audioManager.getAudioNodeState(node.id);
          if (existingState && existingState.audioBuffer) {
            // Audio is already loaded - skip reloading to avoid restarting playback
            continue;
          }

          // Check if it's a valid path/URL
          if (
            resolvedPath.startsWith('http://') ||
            resolvedPath.startsWith('https://') ||
            resolvedPath.startsWith('/')
          ) {
            try {
              await this.onAudioFileParameterChange(node.id, 'filePath', resolvedPath, graph);
              // If load failed internally (handler doesn't throw), node won't have audio - clear filePath so user can select
              const stateAfter = this.audioManager.getAudioNodeState(node.id);
              if (!stateAfter || !stateAfter.audioBuffer) {
                node.parameters.filePath = '';
              }
            } catch (error: any) {
              const handler = this.errorHandler || globalErrorHandler;
              if (handler) {
                const errorMessage = error?.message || String(error);
                handler.report(
                  'audio',
                  'error',
                  `Failed to load default audio file for node ${node.id}`,
                  {
                    originalError:
                      error instanceof Error ? error : new Error(errorMessage),
                    nodeId: node.id,
                    filePath,
                  }
                );
              }
              // Clear filePath so node shows "Select File" and user can pick a file (e.g. from public)
              node.parameters.filePath = '';
            }
          } else {
            const handler = this.errorHandler || globalErrorHandler;
            if (handler) {
              handler.report(
                'validation',
                'warning',
                `Invalid audio file path format: ${filePath}`,
                { nodeId: node.id, filePath, resolvedPath }
              );
            }
          }
        }
      }
    }
  }

  /**
   * Initialize audio analyzers for all audio-analyzer nodes in the graph.
   * 
   * @param graph - Current node graph
   */
  initializeAudioAnalyzers(graph: NodeGraph): void {
    for (const node of graph.nodes) {
      if (node.type === 'audio-analyzer') {
        // Find connected audio file input node
        const connection = graph.connections.find(
          (c) => c.targetNodeId === node.id && c.targetPort === 'audioFile'
        );
        if (connection) {
          const audioFileNodeId = connection.sourceNodeId;

          // Check if audio file node is loaded before creating analyzer
          const audioState = this.audioManager.getAudioNodeState(audioFileNodeId);
          if (!audioState || !audioState.analyserNode) {
            // Audio file not loaded yet, skip for now (will be initialized when file loads)
            continue;
          }

          // Type guard for frequencyBands: must be array of number arrays
          let frequencyBands: number[][] | undefined;
          const freqParam = node.parameters.frequencyBands;
          if (
            Array.isArray(freqParam) &&
            freqParam.length > 0 &&
            Array.isArray(freqParam[0])
          ) {
            const isValid = freqParam.every(
              (item: any) =>
                Array.isArray(item) &&
                item.every((el: any) => typeof el === 'number')
            );
            if (isValid) {
              frequencyBands = freqParam as unknown as number[][];
            }
          }
          const smoothing =
            typeof node.parameters.smoothing === 'number'
              ? node.parameters.smoothing
              : 0.8;
          const fftSize =
            typeof node.parameters.fftSize === 'number'
              ? node.parameters.fftSize
              : 4096;

          if (Array.isArray(frequencyBands) && frequencyBands.length > 0) {
            const bands = frequencyBands.map((band: any) => {
              if (Array.isArray(band) && band.length >= 2) {
                return { minHz: band[0], maxHz: band[1] };
              }
              return { minHz: 20, maxHz: 20000 };
            });

            try {
              this.audioManager.createAnalyzer(
                node.id,
                audioFileNodeId,
                bands,
                smoothing,
                fftSize
              );
            } catch (error) {
              const handler = this.errorHandler || globalErrorHandler;
              if (handler) {
                handler.report(
                  'audio',
                  'warning',
                  'Failed to initialize audio analyzer',
                  {
                    originalError:
                      error instanceof Error ? error : new Error(String(error)),
                    nodeId: node.id,
                    audioFileNodeId,
                  }
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * Handle audio file parameter change.
   * 
   * @param nodeId - Node ID
   * @param paramName - Parameter name
   * @param value - Parameter value
   * @param graph - Current node graph (for updating node parameters)
   */
  async onAudioFileParameterChange(
    nodeId: string,
    paramName: string,
    value: any,
    graph?: NodeGraph | null
  ): Promise<void> {
    console.log(`[AudioParameterHandler] onAudioFileParameterChange called: nodeId=${nodeId}, paramName=${paramName}, value=`, value instanceof File ? `File(${value.name})` : value, 'graph=', graph ? `present (${graph.nodes.length} nodes)` : 'null');
    if (paramName === 'filePath') {
      try {
        // Check if we're loading the same file that's already loaded
        const existingState = this.audioManager.getAudioNodeState(nodeId);
        let currentFilePath = '';
        if (graph) {
          const node = graph.nodes.find((n) => n.id === nodeId);
          if (node) {
            currentFilePath =
              typeof node.parameters.filePath === 'string'
                ? node.parameters.filePath
                : '';
          }
        }

        // Determine the new file path
        let newFilePath = '';
        if (value instanceof File) {
          newFilePath = value.name;
        } else if (typeof value === 'string' && value.trim() !== '') {
          // Extract filename from URL/path for comparison
          newFilePath =
            value.split('/').pop() || value.split('\\').pop() || value;
        }

        // If the file path hasn't changed and audio is already loaded, skip reloading
        if (
          existingState &&
          existingState.audioBuffer &&
          newFilePath === currentFilePath &&
          newFilePath !== ''
        ) {
          return;
        }

        // Remember if this node was playing so we can resume after loading the new file
        const wasPlaying = existingState?.isPlaying ?? false;

        let filename = '';

        if (value instanceof File) {
          // User selected a file
          filename = value.name; // Store filename first so UI updates immediately
          console.log(`[AudioParameterHandler] Loading file for node ${nodeId}:`, filename, `(${value.size} bytes)`);
          
          // Update graph with filename BEFORE loading (so UI shows filename even if loading fails)
          if (graph) {
            const node = graph.nodes.find((n) => n.id === nodeId);
            if (node) {
              node.parameters.filePath = filename;
              console.log(`[AudioParameterHandler] Updated filePath parameter for node ${nodeId} to:`, filename);
            } else {
              console.warn(`[AudioParameterHandler] Node ${nodeId} not found in graph`);
            }
          }
          
          // Now try to load the file
          await this.audioManager.loadAudioFile(nodeId, value);
          console.log(`[AudioParameterHandler] File loaded successfully for node ${nodeId}`);
        } else if (typeof value === 'string' && value.trim() !== '') {
          // URL or path string (for default files)
          // Extract filename from URL/path
          filename = value.split('/').pop() || value.split('\\').pop() || value;
          
          // Update graph with filename BEFORE loading
          if (graph) {
            const node = graph.nodes.find((n) => n.id === nodeId);
            if (node) {
              node.parameters.filePath = filename;
              console.log(`[AudioParameterHandler] Updated filePath parameter for node ${nodeId} to:`, filename);
            }
          }
          
          // Now try to load the file
          await this.audioManager.loadAudioFile(nodeId, value);
        } else {
          return; // Invalid value
        }

        // Initialize analyzers connected to this audio file node (now that it's loaded)
        if (graph) {
          this.initializeAudioAnalyzers(graph);
        }

        // Auto-play if enabled, or resume if this node was playing before the file change
        const node = graph?.nodes.find((n) => n.id === nodeId);
        const autoPlayValue =
          typeof node?.parameters.autoPlay === 'number'
            ? Math.round(node.parameters.autoPlay)
            : 0;
        const shouldPlay = (node && autoPlayValue === 1) || wasPlaying;
        if (shouldPlay) {
          this.audioManager.playAudio(nodeId).catch((error) => {
            const errorMsg = error?.message || String(error);
            if (
              !errorMsg.includes('user gesture') &&
              !errorMsg.includes('user interaction') &&
              !errorMsg.includes('not allowed to start')
            ) {
              const handler = this.errorHandler || globalErrorHandler;
              if (handler) {
                handler.report(
                  'audio',
                  'warning',
                  'Failed to start audio playback',
                  {
                    originalError:
                      error instanceof Error ? error : new Error(errorMsg),
                    nodeId,
                  }
                );
              }
            }
          });
        }
      } catch (error: any) {
        const handler = this.errorHandler || globalErrorHandler;
        if (handler) {
          const errorMessage = error?.message || String(error);
          handler.report(
            'audio',
            'error',
            `Failed to load audio file for node ${nodeId}`,
            {
              originalError:
                error instanceof Error ? error : new Error(errorMessage),
              nodeId,
              paramName,
            }
          );
        }

        // Don't throw - allow the UI to continue working even if audio fails
        // The error is now displayed to the user via the error handler
      }
    }
  }

  /**
   * Handle audio analyzer parameter change.
   * 
   * @param nodeId - Node ID
   * @param paramName - Parameter name
   * @param value - Parameter value
   * @param graph - Current node graph
   */
  onAudioAnalyzerParameterChange(
    nodeId: string,
    paramName: string,
    value: any,
    graph: NodeGraph
  ): void {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Find connected audio file input node
    const connection = graph.connections.find(
      (c) => c.targetNodeId === nodeId && c.targetPort === 'audioFile'
    );
    if (!connection) return;

    const audioFileNodeId = connection.sourceNodeId;

    // Recreate analyzer if frequencyBands, smoothing, or fftSize changes
    if (
      paramName === 'frequencyBands' ||
      paramName === 'smoothing' ||
      paramName === 'fftSize'
    ) {
      // Remove old analyzer
      this.audioManager.removeAnalyzerNode(nodeId);

      // Prefer the passed value for frequencyBands so we're not dependent on graph reference.
      // Deep-clone so we're not affected by later mutation of the editor's array.
      let frequencyBands: number[][] | undefined;
      if (paramName === 'frequencyBands' && Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
        const isValid = value.every(
          (item: any) =>
            Array.isArray(item) &&
            item.every((el: any) => typeof el === 'number')
        );
        if (isValid) {
          frequencyBands = (value as number[][]).map((band) => [Number(band[0]), Number(band[1])]);
        }
      }
      if (frequencyBands == null) {
        const freqParam = node.parameters.frequencyBands;
        if (
          Array.isArray(freqParam) &&
          freqParam.length > 0 &&
          Array.isArray(freqParam[0])
        ) {
          const isValid = freqParam.every(
            (item: any) =>
              Array.isArray(item) &&
              item.every((el: any) => typeof el === 'number')
          );
          if (isValid) {
            frequencyBands = freqParam as unknown as number[][];
          }
        }
      }
      const smoothing =
        typeof node.parameters.smoothing === 'number'
          ? node.parameters.smoothing
          : 0.8;
      const fftSize =
        typeof node.parameters.fftSize === 'number'
          ? node.parameters.fftSize
          : 4096;

      if (Array.isArray(frequencyBands) && frequencyBands.length > 0) {
        // Convert frequency bands format
        const bands = frequencyBands.map((band: any) => {
          if (Array.isArray(band) && band.length >= 2) {
            return { minHz: band[0], maxHz: band[1] };
          }
          return { minHz: 20, maxHz: 20000 };
        });

        try {
          this.audioManager.createAnalyzer(
            nodeId,
            audioFileNodeId,
            bands,
            smoothing,
            fftSize
          );
        } catch (error) {
          const handler = this.errorHandler || globalErrorHandler;
          if (handler) {
            handler.report(
              'audio',
              'error',
              'Failed to create audio analyzer',
              {
                originalError:
                  error instanceof Error ? error : new Error(String(error)),
                nodeId,
                audioFileNodeId,
              }
            );
          }
        }
      }
    }
  }

  /**
   * Clean up audio resources for removed nodes.
   * 
   * @param removedNodeIds - Array of node IDs that were removed
   */
  cleanupRemovedNodes(removedNodeIds: string[]): void {
    for (const nodeId of removedNodeIds) {
      this.audioManager.removeAudioNode(nodeId);
      this.audioManager.removeAnalyzerNode(nodeId);

      // Verify cleanup
      if (!this.audioManager.verifyCleanup(nodeId)) {
        const handler = this.errorHandler || globalErrorHandler;
        if (handler) {
          handler.report(
            'audio',
            'warning',
            `Audio cleanup incomplete for node ${nodeId}`,
            { nodeId }
          );
        }
      }
    }
  }

  /**
   * Tick audio analyzers (run frequency analysis and fill smoothedBandValues) without pushing uniforms.
   * Use after recreating an analyzer so the node-editor canvas (e.g. audio-remap needles) sees fresh
   * values immediately even when the main animation loop is not running (e.g. preview off-screen).
   */
  tickAudioAnalyzers(graph: NodeGraph | null): void {
    this.audioManager.updateUniforms(
      () => {},
      () => {},
      graph
    );
  }

  /**
   * Update audio uniforms (called each frame).
   * 
   * @param shaderInstance - Shader instance to update
   * @param graph - Current node graph (for connection checking)
   */
  updateAudioUniforms(
    shaderInstance: any,
    graph: NodeGraph | null
  ): void {
    this.audioManager.updateUniforms(
      (nodeId: string, paramName: string, value: number) => {
        shaderInstance.setAudioUniform(nodeId, paramName, value);
      },
      (updates: Array<{ nodeId: string; paramName: string; value: number }>) => {
        // Use batch update method if available (more efficient)
        if (shaderInstance.setParameters) {
          shaderInstance.setParameters(updates);
        } else {
          // Fallback: update individually
          for (const update of updates) {
            shaderInstance.setAudioUniform(
              update.nodeId,
              update.paramName,
              update.value
            );
          }
        }
      },
      graph // Pass graph context for connection checking
    );
  }
}
