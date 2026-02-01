/**
 * AudioManager - Web Audio API Integration
 * 
 * Orchestrates audio file loading, playback, and frequency analysis.
 * Provides real-time audio data to shader uniforms.
 * 
 * This class uses composition with specialized components:
 * - AudioContextManager: Context lifecycle management
 * - AudioLoader: File/URL loading and decoding
 * - AudioPlaybackController: Playback control
 * - FrequencyAnalyzer: Frequency analysis
 */

import type { NodeGraph } from '../data-model/types';
import type { ErrorHandler } from '../utils/errorHandling';
import type { Disposable } from '../utils/Disposable';
import { AudioContextManager } from './audio/AudioContextManager';
import { AudioLoader } from './audio/AudioLoader';
import { AudioPlaybackController, type AudioNodeState } from './audio/AudioPlaybackController';
import { FrequencyAnalyzer, type FrequencyBand, type AnalyzerNodeState } from './audio/FrequencyAnalyzer';

// Re-export types for backward compatibility
export type { FrequencyBand, AudioNodeState, AnalyzerNodeState };

export class AudioManager implements Disposable {
  private contextManager: AudioContextManager;
  private loader: AudioLoader;
  private playbackController: AudioPlaybackController;
  private frequencyAnalyzer: FrequencyAnalyzer;
  
  private cleanupInterval: number | null = null; // Periodic cleanup interval ID
  
  // Track previous uniform values to detect changes
  private previousUniformValues: Map<string, number> = new Map();
  private readonly VALUE_CHANGE_THRESHOLD = 0.001; // Only update if change > 0.1%
  
  constructor(errorHandler?: ErrorHandler) {
    
    // Create component instances
    this.contextManager = new AudioContextManager(errorHandler);
    this.loader = new AudioLoader(this.contextManager, errorHandler);
    this.playbackController = new AudioPlaybackController(this.contextManager, errorHandler);
    this.frequencyAnalyzer = new FrequencyAnalyzer(this.contextManager, errorHandler);
  }
  
  /**
   * Initialize AudioContext (must be called from user interaction)
   * Note: Does not automatically resume - call resume() after user interaction
   */
  async initialize(): Promise<void> {
    await this.contextManager.initialize();
  }
  
  /**
   * Resume AudioContext (must be called after user interaction)
   */
  async resume(): Promise<void> {
    await this.contextManager.resume();
  }
  
  /**
   * Load audio file for a node (from File object or URL string)
   */
  async loadAudioFile(nodeId: string, file: File | string): Promise<void> {
    // Stop existing playback before loading new file
    this.stopAudio(nodeId);
    
    // Load and decode audio file
    const audioBuffer = await this.loader.loadAudioFile(nodeId, file);
    
    // Get audio context and create nodes
    const audioContext = this.contextManager.getContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096; // Good resolution for frequency analysis
    analyser.smoothingTimeConstant = 0.8;
    
    const gain = audioContext.createGain();
    gain.gain.value = 1.0;
    
    // Create audio node state
    this.playbackController.createAudioNodeState(nodeId, audioBuffer, analyser, gain);
  }
  
  /**
   * Play audio for a node
   * Automatically resumes AudioContext if suspended (requires user interaction)
   */
  async playAudio(nodeId: string, offset: number = 0): Promise<void> {
    await this.playbackController.playAudio(nodeId, offset);
  }
  
  /**
   * Stop audio playback
   */
  stopAudio(nodeId: string): void {
    this.playbackController.stopAudio(nodeId);
    // Clear previous values when audio stops
    this.clearPreviousValues(nodeId);
  }
  
  /**
   * Pause audio playback
   */
  pauseAudio(nodeId: string): void {
    this.playbackController.pauseAudio(nodeId);
    // Clear previous values when audio pauses
    this.clearPreviousValues(nodeId);
  }
  
  /**
   * Create analyzer node
   */
  createAnalyzer(
    nodeId: string,
    audioFileNodeId: string,
    frequencyBands: FrequencyBand[],
    smoothing: number = 0.8,
    fftSize: number = 4096
  ): void {
    const audioState = this.playbackController.getAudioNodeState(audioFileNodeId);
    if (!audioState) {
      throw new Error(`Audio file node ${audioFileNodeId} not found or not initialized`);
    }
    
    this.frequencyAnalyzer.createAnalyzer(
      nodeId,
      audioFileNodeId,
      frequencyBands,
      smoothing,
      fftSize,
      audioState
    );
  }
  
  /**
   * Update all audio uniforms (called each frame)
   * Only updates uniforms when values actually change (optimized)
   */
  updateUniforms(
    setUniform: (nodeId: string, paramName: string, value: number) => void,
    setUniforms: (updates: Array<{ nodeId: string, paramName: string, value: number }>) => void,
    graph?: {
      nodes: Array<{ id: string; type: string; parameters: Record<string, unknown> }>;
      connections: Array<{ sourceNodeId: string; targetNodeId: string; targetPort?: string }>;
    } | null
  ): void {
    const updates: Array<{ nodeId: string, paramName: string, value: number }> = [];
    const audioNodeStates = this.playbackController.getAllAudioNodeStates();
    
    // First pass: Update audio file input uniforms (only if changed)
    for (const [nodeId, state] of audioNodeStates.entries()) {
      if (!state.audioBuffer) {
        continue;
      }
      
      // Update playback time
      this.playbackController.updatePlaybackTime(nodeId);
      
      // Update currentTime uniform (only if changed)
      const currentTimeKey = `${nodeId}.currentTime`;
      const previousCurrentTime = this.previousUniformValues.get(currentTimeKey) ?? state.currentTime;
      if (Math.abs(state.currentTime - previousCurrentTime) > this.VALUE_CHANGE_THRESHOLD) {
        updates.push({ nodeId, paramName: 'currentTime', value: state.currentTime });
        this.previousUniformValues.set(currentTimeKey, state.currentTime);
      }
      
      // Update duration uniform (only if changed - duration rarely changes)
      const durationKey = `${nodeId}.duration`;
      const previousDuration = this.previousUniformValues.get(durationKey) ?? state.duration;
      if (Math.abs(state.duration - previousDuration) > this.VALUE_CHANGE_THRESHOLD) {
        updates.push({ nodeId, paramName: 'duration', value: state.duration });
        this.previousUniformValues.set(durationKey, state.duration);
      }
      
      // Update isPlaying uniform (only if changed)
      const isPlayingValue = state.isPlaying ? 1.0 : 0.0;
      const isPlayingKey = `${nodeId}.isPlaying`;
      const previousIsPlaying = this.previousUniformValues.get(isPlayingKey) ?? isPlayingValue;
      if (Math.abs(isPlayingValue - previousIsPlaying) > this.VALUE_CHANGE_THRESHOLD) {
        updates.push({ nodeId, paramName: 'isPlaying', value: isPlayingValue });
        this.previousUniformValues.set(isPlayingKey, isPlayingValue);
      }
    }
    
    // Second pass: Update analyzer node uniforms using FrequencyAnalyzer
    const frequencyUpdates = this.frequencyAnalyzer.updateFrequencyAnalysis(
      audioNodeStates,
      graph,
      this.previousUniformValues,
      this.VALUE_CHANGE_THRESHOLD
    );
    updates.push(...frequencyUpdates);

    // Third pass: Compute and push per-band remapped values for audio-analyzer nodes
    if (graph) {
      for (const node of graph.nodes) {
        if (node.type !== 'audio-analyzer') continue;
        const analyzerState = this.frequencyAnalyzer.getAnalyzerNodeState(node.id);
        if (!analyzerState?.smoothedBandValues?.length) continue;
        const bandCount = analyzerState.smoothedBandValues.length;
        for (let i = 0; i < bandCount; i++) {
          const bandValue = analyzerState.smoothedBandValues[i];
          const inMin = (typeof node.parameters[`band${i}RemapInMin`] === 'number' ? node.parameters[`band${i}RemapInMin`] : 0) as number;
          const inMax = (typeof node.parameters[`band${i}RemapInMax`] === 'number' ? node.parameters[`band${i}RemapInMax`] : 1) as number;
          const outMin = (typeof node.parameters[`band${i}RemapOutMin`] === 'number' ? node.parameters[`band${i}RemapOutMin`] : 0) as number;
          const outMax = (typeof node.parameters[`band${i}RemapOutMax`] === 'number' ? node.parameters[`band${i}RemapOutMax`] : 1) as number;
          const range = inMax - inMin;
          const normalized = range !== 0 ? (bandValue - inMin) / range : 0;
          const clamped = Math.max(0, Math.min(1, normalized));
          const remapped = outMin + clamped * (outMax - outMin);
          const key = `${node.id}.remap${i}`;
          const prev = this.previousUniformValues.get(key);
          if (prev === undefined || Math.abs(remapped - prev) > this.VALUE_CHANGE_THRESHOLD) {
            updates.push({ nodeId: node.id, paramName: `remap${i}`, value: remapped });
            this.previousUniformValues.set(key, remapped);
          }
        }
      }
    }

    // Batch update all changed uniforms
    if (updates.length > 0) {
      if (updates.length === 1) {
        // Single update - use single update callback
        const update = updates[0];
        setUniform(update.nodeId, update.paramName, update.value);
      } else {
        // Multiple updates - use batch update
        setUniforms(updates);
      }
    }
  }
  
  /**
   * Get audio node state
   */
  getAudioNodeState(nodeId: string): AudioNodeState | undefined {
    return this.playbackController.getAudioNodeState(nodeId);
  }
  
  /**
   * Get analyzer node state
   */
  getAnalyzerNodeState(nodeId: string): AnalyzerNodeState | undefined {
    return this.frequencyAnalyzer.getAnalyzerNodeState(nodeId);
  }
  
  /**
   * Play all audio nodes
   */
  async playAllAudio(offset: number = 0): Promise<void> {
    await this.playbackController.playAllAudio(offset);
  }
  
  /**
   * Stop all audio nodes
   */
  stopAllAudio(): void {
    const audioNodeStates = this.playbackController.getAllAudioNodeStates();
    for (const nodeId of audioNodeStates.keys()) {
      this.stopAudio(nodeId);
    }
  }
  
  /**
   * Get global audio state (from first loaded audio file)
   */
  getGlobalAudioState(): { isPlaying: boolean; currentTime: number; duration: number } | null {
    return this.playbackController.getGlobalAudioState();
  }
  
  /**
   * Seek all audio to a specific time
   */
  async seekAllAudio(time: number): Promise<void> {
    await this.playbackController.seekAllAudio(time);
  }
  
  /**
   * Remove audio node and clean up all resources
   */
  removeAudioNode(nodeId: string): void {
    this.playbackController.removeAudioNode(nodeId);
    // Clear previous values when node is removed
    this.clearPreviousValues(nodeId);
  }
  
  /**
   * Remove analyzer node and clean up all resources
   */
  removeAnalyzerNode(nodeId: string): void {
    this.frequencyAnalyzer.removeAnalyzerNode(nodeId);
    // Clear previous values when analyzer node is removed
    this.clearPreviousValues(nodeId);
  }
  
  /**
   * Clear previous uniform values for a node (call when audio stops or node is removed)
   */
  clearPreviousValues(nodeId: string): void {
    for (const key of this.previousUniformValues.keys()) {
      if (key.startsWith(`${nodeId}.`)) {
        this.previousUniformValues.delete(key);
      }
    }
  }
  
  /**
   * Verify all resources are cleaned up for a node
   */
  verifyCleanup(nodeId: string): boolean {
    const audioState = this.playbackController.getAudioNodeState(nodeId);
    const analyzerState = this.frequencyAnalyzer.getAnalyzerNodeState(nodeId);
    
    if (audioState || analyzerState) {
      console.warn(`[AudioManager] Resources still exist for node ${nodeId} after cleanup`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get resource statistics
   */
  getResourceStats(): {
    audioNodes: number;
    analyzerNodes: number;
    audioBuffers: number;
  } {
    const audioNodeStates = this.playbackController.getAllAudioNodeStates();
    return {
      audioNodes: audioNodeStates.size,
      analyzerNodes: this.frequencyAnalyzer.getAnalyzerNodeCount(),
      audioBuffers: Array.from(audioNodeStates.values())
        .filter(s => s.audioBuffer !== null).length
    };
  }
  
  /**
   * Start periodic cleanup (check for orphaned resources)
   * Note: The cleanup callback should be provided by the caller (RuntimeManager)
   * to have access to the current graph
   */
  startPeriodicCleanup(cleanupCallback: () => void, intervalMs: number = 30000): void {
    if (this.cleanupInterval) {
      return; // Already running
    }
    
    this.cleanupInterval = window.setInterval(() => {
      cleanupCallback();
    }, intervalMs);
  }
  
  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  /**
   * Clean up orphaned resources (nodes that no longer exist in graph)
   */
  cleanupOrphanedResources(graph?: NodeGraph | null): void {
    if (!graph) return;
    
    const validNodeIds = new Set(graph.nodes.map(n => n.id));
    const audioNodeStates = this.playbackController.getAllAudioNodeStates();
    
    // Find orphaned audio nodes
    const orphanedAudioNodes: string[] = [];
    for (const nodeId of audioNodeStates.keys()) {
      if (!validNodeIds.has(nodeId)) {
        orphanedAudioNodes.push(nodeId);
      }
    }
    
    // Find orphaned analyzer nodes
    const orphanedAnalyzerNodes: string[] = [];
    for (const nodeId of this.frequencyAnalyzer.getAllAnalyzerNodeIds()) {
      if (!validNodeIds.has(nodeId)) {
        orphanedAnalyzerNodes.push(nodeId);
      }
    }
    
    // Clean up orphaned nodes
    for (const nodeId of orphanedAudioNodes) {
      console.warn(`[AudioManager] Cleaning up orphaned audio node: ${nodeId}`);
      this.removeAudioNode(nodeId);
    }
    
    for (const nodeId of orphanedAnalyzerNodes) {
      console.warn(`[AudioManager] Cleaning up orphaned analyzer node: ${nodeId}`);
      this.removeAnalyzerNode(nodeId);
    }
    
    if (orphanedAudioNodes.length > 0 || orphanedAnalyzerNodes.length > 0) {
      console.warn(`[AudioManager] Cleaned up ${orphanedAudioNodes.length} audio nodes and ${orphanedAnalyzerNodes.length} analyzer nodes`);
    }
  }
  
  /**
   * Cleanup all resources
   */
  destroy(): void {
    // Stop periodic cleanup
    this.stopPeriodicCleanup();
    
    // Destroy components in reverse order of creation (dependencies before dependents)
    // FrequencyAnalyzer depends on AudioPlaybackController
    // AudioPlaybackController depends on AudioContextManager
    // AudioLoader depends on AudioContextManager
    this.frequencyAnalyzer.destroy();
    this.playbackController.destroy();
    this.loader.destroy();
    this.contextManager.destroy();
  }
}
