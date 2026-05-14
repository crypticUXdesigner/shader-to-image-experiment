/**
 * FrequencyAnalyzer - Frequency Analysis and Band Extraction
 * 
 * Manages analyzer nodes and extracts frequency band values from audio data.
 * Handles smoothing and frequency band calculations.
 */

import type { ErrorHandler } from '../../utils/errorHandling';
import { BaseDisposable } from '../../utils/Disposable';
import type { AudioBandMode } from '../../data-model/audioSetupTypes';
import type { AudioContextManager } from './AudioContextManager';
import type { AudioNodeState } from './AudioPlaybackController';
import { extractFrequencyBands01Into } from './extractFrequencyBands01';

export interface FrequencyBand {
  minHz: number;
  maxHz: number;
}

export interface AnalyzerNodeState {
  nodeId: string;
  analyserNode: AnalyserNode | null;
  frequencyBands: FrequencyBand[];
  /** Per-band extraction mode. */
  bandModes: AudioBandMode[];
  /** Symmetric half-life per band (seconds). */
  smoothingHalfLifeSeconds: number[];
  /** Optional attack half-life per band (seconds). */
  attackHalfLifeSeconds?: Array<number | undefined>;
  /** Optional release half-life per band (seconds). */
  releaseHalfLifeSeconds?: Array<number | undefined>;
  /** Monotonic clock (seconds) of last smoothing update; null until first update. */
  lastUpdateTimeSeconds: number | null;
  fftSize: number;
  bandValues: number[];
  smoothedBandValues: number[];
}

/**
 * Manages frequency analysis for audio nodes.
 */
export class FrequencyAnalyzer extends BaseDisposable {
  private contextManager: AudioContextManager;
  private analyzerNodes: Map<string, AnalyzerNodeState> = new Map();
  /** Cleared each `updateFrequencyAnalysis`; avoids per-frame `new Map()` allocation. */
  private readonly audioFileFrequencyScratch = new Map<string, Uint8Array>();
  /** Reused when an analyzer cannot read from `AudioNodeState.frequencyData` (avoids per-frame `ArrayBuffer`). */
  private fallbackFrequencyScratch: Uint8Array | null = null;
  private fallbackFrequencyBinCount = 0;
  /** Ephemeral return buffer; cleared at start of each `updateFrequencyAnalysis` (consumers must copy in the same tick). */
  private readonly frequencyUniformUpdatesScratch: Array<{ nodeId: string; paramName: string; value: number }> = [];
  // errorHandler parameter kept for API consistency but not currently used

  constructor(contextManager: AudioContextManager, _errorHandler?: ErrorHandler) {
    super();
    this.contextManager = contextManager;
  }
  
  /**
   * Create analyzer node for frequency analysis.
   */
  createAnalyzer(
    nodeId: string,
    audioFileNodeId: string,
    frequencyBands: FrequencyBand[],
    bandModes: AudioBandMode[] | undefined,
    smoothingHalfLifeSeconds: number[],
    attackHalfLifeSeconds: Array<number | undefined> | undefined,
    releaseHalfLifeSeconds: Array<number | undefined> | undefined,
    fftSize: number = 4096,
    audioNodeState: AudioNodeState
  ): AnalyzerNodeState {
    this.ensureNotDestroyed();
    
    if (!audioNodeState.analyserNode) {
      throw new Error(`Audio file node ${audioFileNodeId} does not have an analyser node`);
    }
    
    // Ensure arrays match band count.
    const DEFAULT_HALF_LIFE_SECONDS = 1 / 120;
    const halfLifeArray =
      smoothingHalfLifeSeconds.length >= frequencyBands.length
        ? smoothingHalfLifeSeconds.slice(0, frequencyBands.length)
        : [
            ...smoothingHalfLifeSeconds,
            ...new Array(frequencyBands.length - smoothingHalfLifeSeconds.length).fill(DEFAULT_HALF_LIFE_SECONDS),
          ];
    const attackArray =
      attackHalfLifeSeconds == null
        ? undefined
        : (attackHalfLifeSeconds.length >= frequencyBands.length
            ? attackHalfLifeSeconds.slice(0, frequencyBands.length)
            : [...attackHalfLifeSeconds, ...new Array(frequencyBands.length - attackHalfLifeSeconds.length).fill(undefined)]);
    const releaseArray =
      releaseHalfLifeSeconds == null
        ? undefined
        : (releaseHalfLifeSeconds.length >= frequencyBands.length
            ? releaseHalfLifeSeconds.slice(0, frequencyBands.length)
            : [...releaseHalfLifeSeconds, ...new Array(frequencyBands.length - releaseHalfLifeSeconds.length).fill(undefined)]);
    const DEFAULT_MODE: AudioBandMode = 'mean';
    const bandModeArray =
      (bandModes?.length ?? 0) >= frequencyBands.length
        ? bandModes!.slice(0, frequencyBands.length)
        : [
            ...(bandModes ?? []),
            ...new Array(frequencyBands.length - (bandModes?.length ?? 0)).fill(DEFAULT_MODE),
          ];
    
    // Use the same analyser node from the audio file (shared FFT)
    const analyserState: AnalyzerNodeState = {
      nodeId,
      analyserNode: audioNodeState.analyserNode,
      frequencyBands,
      bandModes: bandModeArray,
      smoothingHalfLifeSeconds: halfLifeArray,
      attackHalfLifeSeconds: attackArray,
      releaseHalfLifeSeconds: releaseArray,
      lastUpdateTimeSeconds: null,
      fftSize,
      bandValues: new Array(frequencyBands.length).fill(0),
      smoothedBandValues: new Array(frequencyBands.length).fill(0)
    };
    
    this.analyzerNodes.set(nodeId, analyserState);
    return analyserState;
  }
  
  /**
   * Get analyzer node state.
   */
  getAnalyzerNodeState(nodeId: string): AnalyzerNodeState | undefined {
    return this.analyzerNodes.get(nodeId);
  }
  
  /**
   * Get all analyzer node IDs (for cleanup operations).
   */
  getAllAnalyzerNodeIds(): string[] {
    return Array.from(this.analyzerNodes.keys());
  }
  
  /**
   * Get number of analyzer nodes.
   */
  getAnalyzerNodeCount(): number {
    return this.analyzerNodes.size;
  }
  
  /**
   * Extract frequency bands from analyser data.
   */
  private extractFrequencyBands(
    frequencyData: Uint8Array,
    frequencyBands: FrequencyBand[],
    bandModes: AudioBandMode[],
    sampleRate: number,
    fftSize: number
  ): void {
    extractFrequencyBands01Into(
      frequencyData,
      frequencyBands,
      bandModes,
      sampleRate,
      fftSize,
      this.analyzerStateTempWriteTarget
    );
  }

  /**
   * Scratch write target for extractFrequencyBands to avoid per-frame allocations.
   * Sized once per analyzer based on band count.
   */
  private analyzerStateTempWriteTarget: number[] = [];
  
  /**
   * Update frequency analysis for all analyzer nodes.
   * Returns updates for uniforms that changed.
   * @param forcePushAll - When true, always add every band to updates (for a new shader instance).
   * @returns Ephemeral array reused on the next call; treat like a fresh array within the same synchronous consumer (e.g. spread into your buffer immediately).
   */
  updateFrequencyAnalysis(
    audioNodeStates: Map<string, AudioNodeState>,
    graph?: { connections: Array<{ sourceNodeId: string; targetNodeId: string; targetPort?: string }> } | null,
    previousUniformValues?: Map<string, number>,
    valueChangeThreshold: number = 0.001,
    forcePushAll: boolean = false
  ): Array<{ nodeId: string, paramName: string, value: number }> {
    this.ensureNotDestroyed();

    const updates = this.frequencyUniformUpdatesScratch;
    updates.length = 0;
    const sampleRate = this.contextManager.getSampleRate();

    // First pass: Get frequency data from all audio nodes that have an analyser
    // (Use analyser output regardless of isPlaying so reactivity works when playback
    // state and actual sound are out of sync, e.g. after context resume.)
    const audioFileFrequencyData = this.audioFileFrequencyScratch;
    audioFileFrequencyData.clear();

    for (const [nodeId, state] of audioNodeStates.entries()) {
      if (state.analyserNode && state.frequencyData) {
        state.analyserNode.getByteFrequencyData(state.frequencyData as Uint8Array<ArrayBuffer>);
        audioFileFrequencyData.set(nodeId, state.frequencyData as Uint8Array);
      }
    }
    
    // Second pass: Update analyzer node uniforms
    for (const [nodeId, analyzerState] of this.analyzerNodes.entries()) {
      if (!analyzerState.analyserNode) continue;
      
      // Find connected audio file node using graph context
      let connectedAudioNodeId: string | null = null;
      if (graph) {
        const connection = graph.connections.find(
          c => c.targetNodeId === nodeId && c.targetPort === 'audioFile'
        );
        if (connection) {
          connectedAudioNodeId = connection.sourceNodeId;
        }
      }
      
      // Fallback: try to find by shared analyserNode if graph not available
      if (!connectedAudioNodeId) {
        for (const [audioNodeId, audioState] of audioNodeStates.entries()) {
          if (audioState.analyserNode === analyzerState.analyserNode) {
            connectedAudioNodeId = audioNodeId;
            break;
          }
        }
      }
      
      // Skip if no connected audio node found
      if (!connectedAudioNodeId) continue;
      
      // Get frequency data (reuse from first pass if available, else read from analyser)
      // We always run band extraction when we have an analyser, so reactivity works even
      // when isPlaying is out of sync with actual playback (e.g. after context resume).
      let frequencyData: Uint8Array | null = audioFileFrequencyData.get(connectedAudioNodeId) || null;
      
      // Fallback: read directly from analyser when not in first-pass map
      if (!frequencyData && analyzerState.analyserNode) {
        const binCount = analyzerState.analyserNode.frequencyBinCount;
        if (
          this.fallbackFrequencyScratch == null ||
          this.fallbackFrequencyBinCount !== binCount
        ) {
          this.fallbackFrequencyScratch = new Uint8Array(binCount);
          this.fallbackFrequencyBinCount = binCount;
        }
        analyzerState.analyserNode.getByteFrequencyData(
          this.fallbackFrequencyScratch as Uint8Array<ArrayBuffer>
        );
        frequencyData = this.fallbackFrequencyScratch;
      }
      
      if (!frequencyData) continue;
      
      // Extract frequency bands
      if (this.analyzerStateTempWriteTarget.length !== analyzerState.bandValues.length) {
        this.analyzerStateTempWriteTarget = new Array(analyzerState.bandValues.length).fill(0);
      }
      this.extractFrequencyBands(
        frequencyData,
        analyzerState.frequencyBands,
        analyzerState.bandModes,
        sampleRate,
        analyzerState.fftSize
      );
      // Copy into analyzerState.bandValues (stable array identity avoids downstream churn)
      for (let i = 0; i < analyzerState.bandValues.length; i++) {
        analyzerState.bandValues[i] = this.analyzerStateTempWriteTarget[i] ?? 0;
      }
      
      // Apply per-band smoothing (time-based half-life) and check for changes
      const nowSeconds = performance.now() / 1000;
      const dtSeconds =
        analyzerState.lastUpdateTimeSeconds == null ? 0 : Math.max(0, nowSeconds - analyzerState.lastUpdateTimeSeconds);
      analyzerState.lastUpdateTimeSeconds = nowSeconds;

      const tauFromHalfLife = (halfLifeSeconds: number): number => {
        if (halfLifeSeconds <= 0) return 0;
        if (!Number.isFinite(halfLifeSeconds)) return Number.POSITIVE_INFINITY;
        return halfLifeSeconds / Math.LN2;
      };
      const retentionFromTau = (dt: number, tau: number): number => {
        if (tau === Number.POSITIVE_INFINITY) return 1;
        if (tau <= 0 || dt <= 0) return dt <= 0 ? 1 : 0;
        return Math.exp(-dt / tau);
      };

      for (let i = 0; i < analyzerState.bandValues.length; i++) {
        const newValue = analyzerState.bandValues[i];
        const oldValue = analyzerState.smoothedBandValues[i] || 0;
        const rising = newValue > oldValue;
        const useAttackRelease =
          (analyzerState.attackHalfLifeSeconds?.[i] != null) || (analyzerState.releaseHalfLifeSeconds?.[i] != null);
        const halfLifeSeconds = useAttackRelease
          ? (rising ? analyzerState.attackHalfLifeSeconds?.[i] : analyzerState.releaseHalfLifeSeconds?.[i])
          : analyzerState.smoothingHalfLifeSeconds[i];
        const halfLife = halfLifeSeconds ?? analyzerState.smoothingHalfLifeSeconds[i] ?? (1 / 120);
        const tau = tauFromHalfLife(halfLife);
        const retention = retentionFromTau(dtSeconds, tau);
        const smoothed = retention * oldValue + (1 - retention) * newValue;
        analyzerState.smoothedBandValues[i] = smoothed;
        
        // Single-band analyzer: output name is 'band'
        const bandParamName = analyzerState.bandValues.length === 1 ? 'band' : `band${i}`;
        const bandKey = `${nodeId}.${bandParamName}`;
        if (previousUniformValues) {
          const prev = previousUniformValues.get(bandKey);
          const isFirst = prev === undefined;
          if (forcePushAll || isFirst || Math.abs(smoothed - prev!) > valueChangeThreshold) {
            updates.push({ nodeId, paramName: bandParamName, value: smoothed });
            previousUniformValues.set(bandKey, smoothed);
          }
        } else {
          updates.push({ nodeId, paramName: bandParamName, value: smoothed });
        }
      }
    }
    
    return updates;
  }
  
  /**
   * Remove analyzer node and clean up all resources
   */
  removeAnalyzerNode(nodeId: string): void {
    this.ensureNotDestroyed();
    
    const state = this.analyzerNodes.get(nodeId);
    if (!state) return;
    
    // Disconnect analyser node (only if it's not shared with an audio file node)
    // Note: Analyzer nodes share the analyserNode with their connected audio file node,
    // so we should NOT disconnect it here - it will be cleaned up when the audio file node is removed
    // However, we still clear the reference to allow proper cleanup tracking
    if (state.analyserNode) {
      // Don't disconnect shared analyser nodes - they're managed by the audio file node
      // Just clear the reference
      state.analyserNode = null;
    }
    
    // Clear frequency data
    state.bandValues = [];
    state.smoothedBandValues = [];
    
    // Remove from map
    this.analyzerNodes.delete(nodeId);
  }
  
  /**
   * Clean up resources.
   */
  protected doDestroy(): void {
    // Clean up analyzer nodes
    for (const nodeId of Array.from(this.analyzerNodes.keys())) {
      this.removeAnalyzerNode(nodeId);
    }
    
    // Clear map
    this.analyzerNodes.clear();
  }
}
