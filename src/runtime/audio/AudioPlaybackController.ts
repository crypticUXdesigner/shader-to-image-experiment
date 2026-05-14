/**
 * AudioPlaybackController - Audio Playback Control
 * 
 * Manages audio playback state, controls play/stop/pause operations,
 * and handles audio node connections.
 */

import type { ErrorHandler } from '../../utils/errorHandling';
import { globalErrorHandler } from '../../utils/errorHandling';
import { BaseDisposable } from '../../utils/Disposable';
import type { AudioContextManager } from './AudioContextManager';

export interface AudioNodeState {
  nodeId: string;
  audioContext: AudioContext | null;
  audioBuffer: AudioBuffer | null;
  sourceNode: AudioBufferSourceNode | null;
  analyserNode: AnalyserNode | null;
  gainNode: GainNode | null;
  isPlaying: boolean;
  startTime: number;
  currentTime: number;
  duration: number;
  frequencyData: Uint8Array | null;
  smoothedValues: Map<string, number>; // For smoothing frequency bands
  /**
   * Monotonic token to prevent overlapping play/seek calls from starting multiple sources.
   * Incremented on each play request; only the latest request is allowed to start.
   */
  playRequestId: number;
}

/**
 * Manages audio playback for multiple nodes.
 */
export class AudioPlaybackController extends BaseDisposable {
  private contextManager: AudioContextManager;
  private audioNodes: Map<string, AudioNodeState> = new Map();
  private errorHandler?: ErrorHandler;
  
  constructor(contextManager: AudioContextManager, errorHandler?: ErrorHandler) {
    super();
    this.contextManager = contextManager;
    this.errorHandler = errorHandler;
  }
  
  /**
   * Create audio node state with buffer and nodes.
   */
  createAudioNodeState(
    nodeId: string,
    audioBuffer: AudioBuffer,
    analyserNode: AnalyserNode,
    gainNode: GainNode
  ): AudioNodeState {
    this.ensureNotDestroyed();
    
    const audioContext = this.contextManager.getContext();
    const frequencyDataBuffer = new ArrayBuffer(analyserNode.frequencyBinCount);
    
    const state: AudioNodeState = {
      nodeId,
      audioContext,
      audioBuffer,
      sourceNode: null,
      analyserNode,
      gainNode,
      isPlaying: false,
      startTime: 0,
      currentTime: 0,
      duration: audioBuffer.duration,
      frequencyData: new Uint8Array(frequencyDataBuffer),
      smoothedValues: new Map(),
      playRequestId: 0
    };
    
    this.audioNodes.set(nodeId, state);
    return state;
  }
  
  /**
   * Play audio for a node.
   * Automatically resumes AudioContext if suspended (requires user interaction).
   * @param nodeId - Node (or track) id
   * @param offset - Start time in seconds
   * @param options - loop (default true for backward compat); onEnded called when playback ends (when loop is false)
   */
  async playAudio(nodeId: string, offset: number = 0, options?: { loop?: boolean; onEnded?: () => void }): Promise<void> {
    this.ensureNotDestroyed();
    
    const state = this.audioNodes.get(nodeId);
    if (!state) {
      const handler = this.errorHandler || globalErrorHandler;
      handler.report(
        'audio',
        'warning',
        `Nothing is loaded for this audio clip yet`,
        { nodeId, availableNodes: Array.from(this.audioNodes.keys()).join(', ') }
      );
      return;
    }
    
    // Prevent overlapping play/seek requests from starting multiple sources.
    // (e.g. rapid scrubbing triggers many seekAllAudio() calls.)
    const requestId = state.playRequestId + 1;
    state.playRequestId = requestId;

    // Ensure AudioContext is ready
    await this.contextManager.ensureReady();
    if (state.playRequestId !== requestId) {
      // A newer play request superseded this one.
      return;
    }
    const audioContext = this.contextManager.getContext();
    
    // Check if we have an audio buffer
    if (!state.audioBuffer) {
      const handler = this.errorHandler || globalErrorHandler;
      handler.report(
        'audio',
        'warning',
        `No audio file loaded for this clip`,
        { nodeId }
      );
      return;
    }
    
    // Check if gain and analyser nodes are set up
    if (!state.gainNode || !state.analyserNode) {
      const handler = this.errorHandler || globalErrorHandler;
      handler.report(
        'audio',
        'warning',
        `Audio playback is not ready yet`,
        { nodeId, hasGainNode: !!state.gainNode, hasAnalyserNode: !!state.analyserNode }
      );
      return;
    }
    
    // Stop existing playback if any
    this.stopAudio(nodeId);
    
    // Clamp offset to valid range
    const clampedOffset = Math.max(0, Math.min(offset, state.audioBuffer.duration));
    const loop = options?.loop ?? true;
    const onEnded = options?.onEnded;
    
    try {
      // Create new source node
      const source = audioContext.createBufferSource();
      source.buffer = state.audioBuffer;
      source.loop = loop;
      
      if (!loop && onEnded) {
        source.onended = () => {
          state.isPlaying = false;
          state.sourceNode = null;
          state.currentTime = 0;
          onEnded();
        };
      }
      
      // Connect: source -> gain -> analyser -> destination
      source.connect(state.gainNode);
      state.gainNode.connect(state.analyserNode);
      state.analyserNode.connect(audioContext.destination);
      
      // Start playback at offset
      state.sourceNode = source;
      state.startTime = audioContext.currentTime - clampedOffset;
      state.currentTime = clampedOffset;
      state.isPlaying = true;
      
      source.start(0, clampedOffset);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AudioPlaybackController] Failed to start audio playback for node ${nodeId}:`, errorMessage);
      state.isPlaying = false;
      state.sourceNode = null;
      throw error; // Re-throw so caller can handle it
    }
  }
  
  /**
   * Stop audio playback
   */
  stopAudio(nodeId: string): void {
    this.ensureNotDestroyed();
    
    const state = this.audioNodes.get(nodeId);
    if (!state || !state.sourceNode) {
      return;
    }
    
    try {
      // If we manually stop, suppress onended so playlist-advance callbacks
      // only run for natural playback completion.
      state.sourceNode.onended = null;
      state.sourceNode.stop();
    } catch (e) {
      // Already stopped, ignore
    }
    
    state.sourceNode = null;
    state.isPlaying = false;
    state.currentTime = 0;
  }
  
  /**
   * Pause audio playback
   */
  pauseAudio(nodeId: string): void {
    this.ensureNotDestroyed();
    
    const state = this.audioNodes.get(nodeId);
    if (!state || !state.sourceNode) {
      return;
    }
    
    // Capture playback position before stopping the source.
    try {
      if (state.isPlaying && state.audioBuffer && this.contextManager.isInitialized()) {
        const audioContext = this.contextManager.getContext();
        let t = audioContext.currentTime - state.startTime;
        // Clamp into [0, duration]
        if (state.audioBuffer.duration > 0) {
          t = t % state.audioBuffer.duration;
          if (t < 0) t = 0;
        }
        state.currentTime = Math.max(0, Math.min(t, state.audioBuffer.duration));
      }
    } catch {
      // If context isn't available, fall back to last known state.currentTime.
    }
    
    try {
      // Suppress onended (manual pause must not advance playlists).
      state.sourceNode.onended = null;
      state.sourceNode.stop();
    } catch {
      // ignore
    }
    
    state.sourceNode = null;
    state.isPlaying = false;
  }
  
  /**
   * Play all audio nodes
   */
  async playAllAudio(offset: number = 0): Promise<void> {
    this.ensureNotDestroyed();
    
    const promises: Promise<void>[] = [];
    for (const nodeId of this.audioNodes.keys()) {
      promises.push(this.playAudio(nodeId, offset));
    }
    await Promise.all(promises);
  }

  /**
   * Pause all audio nodes (preserves currentTime for resume).
   */
  pauseAllAudio(): void {
    this.ensureNotDestroyed();
    
    for (const nodeId of this.audioNodes.keys()) {
      this.pauseAudio(nodeId);
    }
  }
  
  /**
   * Stop all audio nodes
   */
  stopAllAudio(): void {
    this.ensureNotDestroyed();
    
    for (const nodeId of this.audioNodes.keys()) {
      this.stopAudio(nodeId);
    }
  }
  
  /**
   * Seek all audio to a specific time
   */
  async seekAllAudio(time: number): Promise<void> {
    this.ensureNotDestroyed();
    
    const wasPlaying = Array.from(this.audioNodes.values()).some(s => s.isPlaying);
    // Commit logical time before any await (playAudio awaits AudioContext resume).
    // Otherwise a quick scrub-then-play can read stale currentTime in getGlobalAudioState().
    for (const state of this.audioNodes.values()) {
      if (!state.audioBuffer) continue;
      state.currentTime = Math.max(0, Math.min(time, state.audioBuffer.duration));
    }

    await this.playAllAudio(time);
    if (!wasPlaying) {
      // If it wasn't playing before, pause after seeking so the playhead stays at the seek time.
      this.pauseAllAudio();
    }
  }
  
  /**
   * Get audio node state
   */
  getAudioNodeState(nodeId: string): AudioNodeState | undefined {
    return this.audioNodes.get(nodeId);
  }
  
  /**
   * Get all audio node states
   */
  getAllAudioNodeStates(): Map<string, AudioNodeState> {
    return this.audioNodes;
  }
  
  /**
   * Update playback time for a node (called each frame)
   */
  updatePlaybackTime(nodeId: string): void {
    const state = this.audioNodes.get(nodeId);
    if (!state || !state.isPlaying || !state.sourceNode || !state.audioContext) {
      return;
    }
    
    const audioContext = this.contextManager.getContext();
    let elapsed = audioContext.currentTime - state.startTime;
    
    // Handle looping
    if (elapsed >= state.duration) {
      elapsed = elapsed % state.duration;
      // Restart from beginning if we've looped
      if (elapsed < 0.1) { // Small threshold to avoid rapid restarts
        state.startTime = audioContext.currentTime;
        elapsed = 0;
      }
    }
    
    state.currentTime = Math.max(0, elapsed);
  }
  
  /**
   * Get global audio state. When primaryNodeId is provided, returns that node's state only; otherwise first loaded node.
   */
  getGlobalAudioState(primaryNodeId?: string): { isPlaying: boolean; currentTime: number; duration: number } | null {
    const nodesToCheck = primaryNodeId
      ? (this.audioNodes.has(primaryNodeId) ? [this.audioNodes.get(primaryNodeId)!] : [])
      : Array.from(this.audioNodes.values());
    for (const state of nodesToCheck) {
      if (!state?.audioBuffer) continue;
      let currentTime = state.currentTime;
      if (state.isPlaying && state.sourceNode && this.contextManager.isInitialized()) {
        const audioContext = this.contextManager.getContext();
        currentTime = (audioContext.currentTime - state.startTime) % state.audioBuffer.duration;
        if (currentTime < 0) currentTime = 0;
        state.currentTime = currentTime;
      }
      return {
        isPlaying: state.isPlaying,
        currentTime,
        duration: state.audioBuffer.duration
      };
    }
    return null;
  }
  
  /**
   * Remove audio node and clean up all resources
   */
  removeAudioNode(nodeId: string): void {
    this.ensureNotDestroyed();
    
    const state = this.audioNodes.get(nodeId);
    if (!state) return;
    
    // Stop audio playback
    this.stopAudio(nodeId);
    
    // Disconnect all audio nodes
    if (state.sourceNode) {
      try {
        state.sourceNode.stop(); // Stop if playing
        state.sourceNode.disconnect(); // Disconnect all connections
      } catch (e) {
        // Ignore errors (node may already be stopped)
      }
      state.sourceNode = null;
    }
    
    if (state.gainNode) {
      try {
        state.gainNode.disconnect();
      } catch (e) {
        // Ignore errors
      }
      state.gainNode = null;
    }
    
    if (state.analyserNode) {
      try {
        state.analyserNode.disconnect();
      } catch (e) {
        // Ignore errors
      }
      state.analyserNode = null;
    }
    
    // Clear audio buffer reference (allows GC)
    state.audioBuffer = null;
    
    // Clear frequency data
    state.frequencyData = null;
    state.smoothedValues.clear();
    
    // Remove from map
    this.audioNodes.delete(nodeId);
  }
  
  /**
   * Clean up resources.
   */
  protected doDestroy(): void {
    // Stop all audio and clean up properly
    for (const nodeId of Array.from(this.audioNodes.keys())) {
      this.removeAudioNode(nodeId);
    }
    
    // Clear map
    this.audioNodes.clear();
  }
}
