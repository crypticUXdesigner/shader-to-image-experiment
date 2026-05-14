/**
 * Runtime Manager - Public API for UI Integration
 * 
 * Provides a clean interface for UI to interact with shader compilation and rendering.
 * Wraps CompilationManager and Renderer as specified in Runtime Integration Specification.
 */

import { GraphChangeDetector } from '../utils/changeDetection/GraphChangeDetector';
import type {
  IAudioManager,
  ICompilationManager,
  TimelineState,
  PreviewDependencyMask
} from './types';
import type { IRenderBackend } from './renderBackends/IRenderBackend';
import type { RenderBackendSelection } from './renderBackends/renderBackendTypes';
import type { NodeGraph, NodeInstance, Connection } from '../data-model/types';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import { getPrimaryFileId } from '../data-model/audioSetupTypes';
import type { ErrorHandler } from '../utils/errorHandling';
import { globalErrorHandler } from '../utils/errorHandling';
import type { Disposable } from '../utils/Disposable';
import { safeDestroy } from '../utils/Disposable';
import { TimeManager } from './runtime/TimeManager';
import { AudioParameterHandler } from './runtime/AudioParameterHandler';
import { RuntimePlaybackHandler } from './runtime/RuntimePlaybackHandler';
import { SyntheticTransport } from './timeline/SyntheticTransport';
import { isRuntimeOnlyParameter } from '../utils/runtimeOnlyParams';
import {
  applyRadialPulseSpawnUniforms,
  clearRadialPulseSpawnArmingState
} from './audio/radialPulsePreviewSpawn';
import { resolveWebGpuPreviewDependencyMaskForClock } from './webGpuPreviewDependencyClock';

/** Callback when playlist advances (e.g. on track end or next); app updates store and calls setAudioSetup + playPrimary. */
export type OnPlaylistAdvance = (nextState: { currentIndex: number }) => void;

export class RuntimeManager implements Disposable {
  private compilationManager: ICompilationManager;
  private renderer: IRenderBackend;
  private audioManager: IAudioManager;
  private currentGraph: NodeGraph | null = null;
  /** Current audio setup (for primary resolution and playlist state). */
  private currentAudioSetup: AudioSetup | null = null;
  private audioSetupFileIds: string[] = [];
  private audioSetupBandIds: string[] = [];
  private onPlaylistAdvance?: OnPlaylistAdvance;

  // Extracted components
  private timeManager: TimeManager;
  private audioParameterHandler: AudioParameterHandler;
  private syntheticTransport: SyntheticTransport;
  private playbackHandler: RuntimePlaybackHandler;

  private errorHandler?: ErrorHandler;

  /** Optional callback run after context is restored (e.g. restart app animation loop). */
  private onAppContextRestored?: () => void;

  /** Optional callback run when context is lost (e.g. stop app animation loop). */
  private onContextLostCallback?: () => void;

  /**
   * When true and preview raster is WebGPU, pass compile `previewDependencies` into `TimeManager`
   * if {@link resolveWebGpuPreviewDependencyMaskForClock} accepts the mask (fail-open otherwise).
   * Default false — see `setTime` comment.
   */
  private readonly webGpuPreviewDependencyClockMask: boolean;

  /**
   * Create a RuntimeManager with injected dependencies.
   * @param renderBackend - Active preview raster backend (WebGL or WebGPU)
   * @param audioManager - AudioManager instance
   * @param compilationManager - CompilationManager instance
   * @param errorHandler - Optional error handler (falls back to globalErrorHandler when not set)
   */
  constructor(
    renderBackend: IRenderBackend,
    audioManager: IAudioManager,
    compilationManager: ICompilationManager,
    errorHandler?: ErrorHandler,
    runtimeOptions?: { webGpuPreviewDependencyClockMask?: boolean }
  ) {
    this.webGpuPreviewDependencyClockMask = runtimeOptions?.webGpuPreviewDependencyClockMask ?? false;
    this.errorHandler = errorHandler;
    this.renderer = renderBackend;
    this.audioManager = audioManager;
    this.compilationManager = compilationManager;

    // After every recompile, mark dirty so the next setTime() renders (with audio uniforms).
    // Without this, when paused the first post-recompile frame is drawn without audio uniforms
    // and we rarely re-render (time unchanged, not dirty), so the wrong preview stays until Play.
    this.compilationManager.setOnRecompiled(() => this.syncTimeAfterRecompile());

    // Create extracted components
    this.timeManager = new TimeManager();
    this.audioParameterHandler = new AudioParameterHandler(audioManager, errorHandler);
    this.syntheticTransport = new SyntheticTransport();
    this.playbackHandler = new RuntimePlaybackHandler({
      audioManager,
      getCurrentAudioSetup: () => this.currentAudioSetup,
      getCurrentGraph: () => this.currentGraph,
      getOnPlaylistAdvance: () => this.onPlaylistAdvance,
      syntheticTransport: this.syntheticTransport,
      errorHandler
    });

    // Before the first render of a new shader instance, push audio uniforms so the first frame is correct.
    this.compilationManager.setOnBeforeFirstRender((instance) => {
      this.audioParameterHandler.updateAudioUniforms(instance, this.currentGraph, { forcePushAll: true });
      applyRadialPulseSpawnUniforms({
        graph: this.currentGraph,
        shaderInstance: instance,
        shaderTime: instance.getTime(),
        audioSetup: this.currentAudioSetup,
        getAnalyzerNodeState: (id) => this.audioManager.getAnalyzerNodeState(id)
      });
    });

    // Start periodic cleanup (every 30 seconds)
    this.audioManager.startPeriodicCleanup(() => {
      const extraIds = [...this.audioSetupFileIds, ...this.audioSetupBandIds];
      this.audioManager.cleanupOrphanedResources(
        this.currentGraph ?? undefined,
        extraIds.length > 0 ? extraIds : undefined
      );
    }, 30000);

    this.renderer.setOnContextRestored(() => {
      this.compilationManager.recompileAfterContextRestore();
      this.onAppContextRestored?.();
    });
  }

  /**
   * Register a callback to run when the WebGL context is lost (e.g. stop app animation loop).
   * Also clears the compilation manager's shader instance so no code uses the invalid context.
   */
  setOnContextLost(callback: () => void): void {
    this.onContextLostCallback = callback;
    this.renderer.setOnContextLost(() => {
      this.compilationManager.clearShaderInstanceForContextLoss();
      this.onContextLostCallback?.();
    });
  }

  /**
   * Register a callback to run after the WebGL context is restored and recompilation has run (e.g. restart app animation loop).
   */
  setOnAppContextRestored(callback: () => void): void {
    this.onAppContextRestored = callback;
  }

  /**
   * Register callback when playlist advances (track end or next/previous). App should update store and call setAudioSetup then playPrimary().
   */
  setOnPlaylistAdvance(callback: OnPlaylistAdvance | undefined): void {
    this.onPlaylistAdvance = callback;
  }

  /**
   * Called by CompilationManager after a successful recompile. Optional hook to sync time/uniforms
   * onto the new shader instance (e.g. so paused preview shows current time). No-op by default.
   */
  syncTimeAfterRecompile(): void {
    clearRadialPulseSpawnArmingState();
    this.timeManager.markDirty(this.renderer, 'compilation');
  }

  /**
   * Check if only node positions changed (not structure, connections, or parameters)
   */
  private isOnlyPositionChange(oldGraph: NodeGraph | null, newGraph: NodeGraph): boolean {
    return GraphChangeDetector.isOnlyPositionChange(oldGraph, newGraph);
  }

  /**
   * Apply structure change: cleanup removed nodes, set graph on compiler, schedule recompile, cleanup orphans.
   */
  private applyGraphStructureChange(oldGraph: NodeGraph | null, graph: NodeGraph): void {
    const changeResult = GraphChangeDetector.detectChanges(oldGraph, graph, {
      trackAffectedNodes: false,
      includeConnectionIds: false
    });
    if (changeResult.removedNodeIds.length > 0) {
      this.audioParameterHandler.cleanupRemovedNodes(changeResult.removedNodeIds);
    }
    this.compilationManager.setGraph(graph);
    const onlyRegionTimes = GraphChangeDetector.isOnlyAutomationRegionTimesChange(oldGraph, graph);
    const connectionsOnly = changeResult.isConnectionsChanged && !changeResult.isStructureChanged;
    // Automation curves are compiled into GLSL (evalAutomation_*); always schedule recompile on graph push.
    this.compilationManager.onGraphStructureChange(onlyRegionTimes || connectionsOnly);
    const extraIds = [...this.audioSetupFileIds, ...this.audioSetupBandIds];
    this.audioManager.cleanupOrphanedResources(graph, extraIds.length > 0 ? extraIds : undefined);
  }

  /**
   * Set the node graph (triggers compilation).
   */
  async setGraph(graph: NodeGraph): Promise<void> {
    if (!graph || !graph.nodes) {
      const handler = this.errorHandler || globalErrorHandler;
      if (handler) {
        handler.report(
          'validation',
          'error',
          'That graph could not be loaded',
          { graphId: graph?.id }
        );
      }
      return;
    }
    const oldGraph = this.currentGraph;
    if (oldGraph === graph) return;
    const onlyPositionsChanged = this.isOnlyPositionChange(oldGraph, graph);
    this.currentGraph = graph;
    if (!onlyPositionsChanged) {
      this.applyGraphStructureChange(oldGraph, graph);
    }
  }

  
  /**
   * Update a parameter value.
   * Determines if recompilation is needed or just uniform update.
   * Accepts full ParameterValue (number, string, vec4, number[], number[][]). Runtime-only params
   * (runtime-only params) are handled here and do not call the compilation manager.
   * @param graph - When provided (from editor after immutable param update), sync currentGraph so runtime uses latest state.
   */
  updateParameter(nodeId: string, paramName: string, value: import('../data-model/types').ParameterValue, graph?: NodeGraph): void {
    // Sync runtime graph when editor passes updated graph (avoids stale graph and wrong band ranges)
    if (graph) {
      this.currentGraph = graph;
      // Keep compilation manager in sync so parameter-only updates use latest graph and uniforms update correctly
      this.compilationManager.setGraph(graph);
    }
    // Handle runtime-only parameters (no shader uniform; apply in JS only where needed)
    if (this.currentGraph) {
      const node = this.currentGraph.nodes.find(n => n.id === nodeId);
      if (node && isRuntimeOnlyParameter(node.type, paramName)) {
        return; // No uniform update for runtime-only params
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
    // Clean up audio resources for deleted node
    this.audioParameterHandler.cleanupRemovedNodes([nodeId]);
    
    if (this.currentGraph) {
      // Trigger recompilation
      this.compilationManager.onGraphStructureChange();
    }
  }
  
  /**
   * Handle connection added (graph structure changed).
   */
  onConnectionAdded(_connection: Connection): void {
    if (this.currentGraph) {
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
   * Also sets uTimelineTime from getTimelineState().currentTime so automation stays in sync.
   */
  setTime(time: number): void {
    const shaderInstance = this.compilationManager.getShaderInstance();
    if (!shaderInstance) return;

    const timelineState = this.getTimelineState();
    shaderInstance.setTimelineTime(timelineState?.currentTime ?? time);

    // When audio is playing, always mark dirty so we render every frame for audio reactivity
    if (timelineState?.isPlaying) {
      this.timeManager.markDirty(this.renderer, 'audio');
    }

    // WebGPU-exclusive preview: by default do not throttle the clock on `previewDependencies`.
    // WGSL MVP mask inference has missed real motion (audio hydrate / primary transport / pass-plan
    // slices), which skips `setTime` + `render` and looks like a frozen canvas. Opt-in:
    // `?webgpuPreviewDependencyClock=1` + fail-open in `resolveWebGpuPreviewDependencyMaskForClock`.
    // WebGL always uses the compile mask so paused idle graphs do not pay full-rate analyser work.
    const mask = this.compilationManager.getPreviewDependencyMask();
    const audioPrimaryPresent = getPrimaryFileId(this.currentAudioSetup) != null;
    const previewDepsForClock =
      this.getExportRasterBackend() === 'webgpu'
        ? resolveWebGpuPreviewDependencyMaskForClock(
            this.webGpuPreviewDependencyClockMask,
            mask,
            audioPrimaryPresent
          )
        : mask;

    // Use TimeManager to handle time updates; pass audio-uniforms callback so shader receives band/remap values every frame
    this.timeManager.updateTime(
      time,
      shaderInstance,
      this.renderer,
      (si) => {
        this.audioParameterHandler.updateAudioUniforms(si, this.currentGraph);
        applyRadialPulseSpawnUniforms({
          graph: this.currentGraph,
          shaderInstance: si,
          shaderTime: time,
          audioSetup: this.currentAudioSetup,
          getAnalyzerNodeState: (id) => this.audioManager.getAnalyzerNodeState(id)
        });
      },
      {
        previewDependencies: previewDepsForClock,
        timelinePlaying: !!timelineState?.isPlaying
      }
    );

    // Resize/layout can mark Renderer dirty without touching TimeManager; paused + stable time skips
    // updateTime()'s render. Mirror post-recompile: flush once whenever the renderer still owes a present.
    if (this.renderer.needsPresentationFlush?.()) {
      this.renderer.render();
    }
  }

  /**
   * Mark runtime as dirty (something changed that requires render).
   */
  markDirty(reason: string): void {
    this.timeManager.markDirty(this.renderer, reason);
  }

  /** Sync shader framebuffer to preview canvas layout (view mode / panel edge). */
  notifyPreviewLayoutChanged(): void {
    this.renderer.notifyPreviewLayoutChanged?.();
    this.markDirty('resize');
    this.renderIfDirty();
  }
  
  /**
   * Render if dirty.
   */
  renderIfDirty(): void {
    this.timeManager.renderIfDirty(this.renderer);
  }

  /**
   * Handle audio file parameter change (no-op; audio is via audioSetup only).
   */
  async onAudioFileParameterChange(_nodeId: string, _paramName: string, _value: unknown): Promise<void> {
    // Audio files are managed via audioSetup and bottom bar upload only
  }

  /**
   * Toggle global audio playback (primary source only).
   */
  toggleGlobalAudioPlayback(): void {
    this.playbackHandler.toggleGlobalAudioPlayback();
  }

  /**
   * Start playing the primary source (with correct loop/onEnded). Call after setAudioSetup when advancing playlist.
   */
  playPrimary(): void {
    this.playbackHandler.playPrimary();
  }

  /**
   * Playlist: advance to next track. Calls onPlaylistAdvance; app updates store, setAudioSetup, playPrimary().
   */
  playNext(): void {
    this.playbackHandler.playNext();
  }

  /**
   * Playlist: previous track or start of current (if within first 3s). Calls onPlaylistAdvance for previous; app updates and playPrimary.
   */
  playPrevious(): void {
    this.playbackHandler.playPrevious();
  }

  /**
   * Start: seek to 0 or go to first playlist track.
   */
  playStart(): void {
    this.playbackHandler.playStart();
  }

  /**
   * Seek global audio to a specific time (or synthetic timeline when no audio).
   */
  seekGlobalAudio(time: number): void {
    this.playbackHandler.seekGlobalAudio(time);
  }

  /**
   * Get timeline state: current time, duration, BPM, and whether time comes from audio.
   * When no graph: null. When graph but no audio: synthetic transport (30s default duration).
   * uTimelineTime should be set from the returned currentTime each frame.
   */
  getTimelineState(): TimelineState | null {
    if (!this.currentGraph) return null;
    return this.playbackHandler.getTimelineState();
  }

  /**
   * Get global audio state (legacy). Prefer getTimelineState() for timeline/scrubber.
   */
  getGlobalAudioState(): { isPlaying: boolean; currentTime: number; duration: number } | null {
    return this.playbackHandler.getGlobalAudioState();
  }

  /**
   * Get audio manager (for external use)
   */
  getAudioManager(): IAudioManager {
    return this.audioManager;
  }

  /**
   * Set audio setup (for cleanup - panel file IDs must not be removed as orphaned).
   * Syncs AudioManager analyzers from panel bands. Loads only the current primary (playlist track or upload).
   * @param options.autoPlayWhenReady - If true, start playback when the primary is ready (immediately if already loaded, or when load completes).
   */
  setAudioSetup(audioSetup: AudioSetup | null, options?: { autoPlayWhenReady?: boolean }): void {
    const autoPlayWhenReady = options?.autoPlayWhenReady ?? false;
    this.currentAudioSetup = audioSetup ?? null;
    const primaryId = getPrimaryFileId(audioSetup);
    this.audioSetupFileIds = primaryId ? [primaryId] : [];
    this.audioSetupBandIds = audioSetup?.bands.map((b) => b.id) ?? [];
    this.audioManager.setAudioSetup?.(audioSetup);
    this.compilationManager.setAudioSetup?.(audioSetup);
    const extraIds = [...this.audioSetupFileIds, ...this.audioSetupBandIds];
    this.audioManager.cleanupOrphanedResources(
      this.currentGraph ?? undefined,
      extraIds.length > 0 ? extraIds : undefined
    );
    this.compilationManager.onGraphStructureChange(true);

    // Load only the current primary (no preload)
    this.playbackHandler.loadPrimaryAndMaybePlay(
      primaryId ?? '',
      audioSetup,
      autoPlayWhenReady,
      (setup) => {
        this.audioManager.setAudioSetup?.(setup);
      }
    );
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
   * Active preview render backend (raster + compile install hooks).
   */
  getRenderBackend(): IRenderBackend {
    return this.renderer;
  }

  /**
   * Raster API for export jobs — same exclusive choice as preview compilation
   * ({@link IRenderBackend.getPreviewCompileExclusiveGpu}).
   */
  getExportRasterBackend(): RenderBackendSelection['selected'] {
    return this.renderer.getPreviewCompileExclusiveGpu();
  }

  /** Last successful compile preview dependency snapshot. */
  getPreviewDependencyMask(): PreviewDependencyMask | null {
    return this.compilationManager.getPreviewDependencyMask();
  }

  /**
   * Cleanup all resources.
   * Cleans up in reverse order of creation (dependencies before dependents).
   */
  destroy(): void {
    clearRadialPulseSpawnArmingState();
    // Stop periodic cleanup first
    this.audioManager.stopPeriodicCleanup();
    
    // Clean up components in reverse order of creation
    // CompilationManager depends on Renderer, so clean it up first
    safeDestroy(this.compilationManager as unknown as Disposable);
    
    // Then clean up AudioManager
    safeDestroy(this.audioManager as unknown as Disposable);
    
    // Finally clean up Renderer (it manages the canvas and WebGL context)
    safeDestroy(this.renderer);
    
    // Clear references
    this.currentGraph = null;
  }
}

// Re-export types for convenience
export type { ShaderCompiler, IRenderer, IAudioManager, ICompilationManager } from './types';
