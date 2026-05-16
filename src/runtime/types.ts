/**
 * Runtime Types for Node-Based Shader System
 * 
 * These types match the Runtime Integration Specification.
 */

/**
 * Uniform metadata from compiler output.
 */
/**
 * What drives live preview updates for a compiled program (plan §4).
 * Snapshot at compile success; runtime must not re-infer from the graph each frame.
 */
export interface PreviewDependencyMask {
  usesWallTime: boolean;
  usesTimelineTime: boolean;
  usesAudioUniforms: boolean;
  /**
   * Radial pulse `pulseDrive` spawn uses JS + analyser values; the shader may omit band/remap uniforms
   * when Drive is the only consumer. Still needs the same periodic analyser pass as audio uniforms.
   */
  usesRadialPulseVirtualDrive: boolean;
  /**
   * True when `applyRadialPulseSpawnUniforms` may write spawn slots (virtual Drive and/or preview loop
   * interval on a reachable radial-pulse). Keeps that pass on the wall-clock tick, not only analyser cadence.
   */
  usesRadialPulseSpawnUniformPass: boolean;
  usesResolutionUniform: boolean;
  usesMouseUniforms: boolean;
  usesFrameIndex: boolean;
}

/**
 * Minimal uniform/program sink for live preview updates (WebGL or WebGPU).
 * Keeps RuntimeManager/TimeManager/audio code backend-agnostic.
 */
export interface PreviewProgramInstance {
  setParameter(nodeId: string, paramName: string, value: number | [number, number, number, number]): void;
  setParameters(
    updates: Array<{ nodeId: string; paramName: string; value: number | [number, number, number, number] }>
  ): void;
  setAudioUniform(nodeId: string, outputName: string, value: number): void;
  setTime(time: number): void;
  setTimelineTime(time: number): void;
  getTime(): number;
  getTimelineTime(): number;
  getParameters(): Map<string, number | [number, number, number, number]>;
  destroy(): void;
}

export interface UniformMetadata {
  // Uniform identifier in shader
  name: string;  // e.g., "uNodeN1Scale"
  
  // Source information
  nodeId: string;  // e.g., "node-123"
  paramName: string;  // e.g., "scale"
  
  // Type information
  type: 'float' | 'int' | 'vec2' | 'vec3' | 'vec4';
  
  // Default value (from node parameter default)
  defaultValue: number | [number, number] | [number, number, number] | [number, number, number, number];
}

export type RenderBackendKind = 'webgl' | 'webgpu';

export type CompileTargetOptions = {
  /**
   * Requested output backend for emitted `CompilationResult.code`.
   * When omitted, compilers should default to WebGL for compatibility.
   */
  backend?: RenderBackendKind;
};

/**
 * Deterministic mapping from parameter key -> packed index for GPU parameter buffers.
 * Key format is stable and backend-agnostic: `${nodeId}.${paramName}`.
 *
 * WebGPU intent (task 02B): params are packed as `array<vec4<f32>>` and scalars use `.x`.
 */
export type ParamLayout = Record<string, number>;

export type ShaderResourceDecl =
  | { kind: 'texture2d-f32'; key: string }
  | { kind: 'sampler'; key: string };

/**
 * Cloneable resource descriptors used in compiler→runtime contracts.
 * These must remain structured-clone compatible (plain objects + numbers/strings).
 */
export type WebGpuTextureSizeDesc =
  | { kind: 'fixed'; width: number; height: number }
  | { kind: 'canvas' };

export type WebGpuTextureDesc = {
  size: WebGpuTextureSizeDesc;
  /** e.g. 'rgba8unorm' */
  format: GPUTextureFormat;
  /** GPUTextureUsageFlags is a number at runtime and cloneable. */
  usage: GPUTextureUsageFlags;
  sampleCount?: number;
  label?: string;
};

export type WebGpuPassPlan =
  | {
      /**
       * Task 10B: Separable Gaussian blur post-effect pass plan, executed by the WebGPU runtime.
       *
       * Pipeline (4 passes):
       *   1. `inputWgsl` (fullscreen fragment) → tex0  (renders the upstream subgraph)
       *   2. blur horizontal sampling tex0 → tex1
       *   3. blur vertical sampling tex1 → tex0
       *   4. present tex0 to swapchain
       *
       * Contract:
       * - `inputWgsl` is an inline WGSL fragment program with the same bindings as the
       *   single-pass MVP (`globals` uniform + `params` storage). The compiler generates it
       *   from the upstream subgraph (everything except the blur node and `final-output`).
       * - `blurWgsl` uses two extra bindings for the source texture + sampler beyond the
       *   shared globals/params pair. Runtime invokes the same module with two entry points
       *   (`fsBlurH` and `fsBlurV`).
       * - All resources (intermediate textures, ping-pong, params buffer) are owned by the
       *   runtime; the plan only declares descriptors so the resource pool can size them.
       */
      kind: 'pass.blur.gaussian-separable.v1';
      /** Owning blur node id for param-layout keys (`${nodeId}.${paramName}`). */
      nodeId: string;

      /**
       * Inline WGSL fragment program for the upstream subgraph. Outputs the source color
       * for the blur input. Runtime bindings:
       * - @group(0) @binding(0) globals uniform (v0 time/res, v1 flags)
       * - @group(0) @binding(1) params (read-only storage `array<vec4<f32>>`)
       * Entry points: `vs` / `fs`.
       */
      inputWgsl: string;

      /**
       * Blur WGSL fragment program (separable Gaussian; horizontal + vertical entry points).
       * Runtime bindings:
       * - @group(0) @binding(0) globals uniform
       * - @group(0) @binding(1) params (read-only storage)
       * - @group(0) @binding(2) blurInputTex (texture_2d<f32>)
       * - @group(0) @binding(3) blurInputSamp (sampler)
       * Entry points: `vs`, `fsBlurH`, `fsBlurV`.
       */
      blurWgsl: string;

      /**
       * Present WGSL fragment program (samples the final blurred texture to the swapchain).
       * Runtime bindings:
       * - @group(0) @binding(0) presentTex (texture_2d<f32>)
       * - @group(0) @binding(1) presentSamp (sampler)
       * Entry points: `vs`, `fs`.
       */
      presentWgsl: string;

      /** Intermediate (offscreen + ping-pong) texture descriptor; canvas-sized in practice. */
      intermediateTexture: WebGpuTextureDesc;

      /**
       * Deterministic param slots for the blur node. Scalars live in `.x` of the indexed vec4 slot.
       */
      paramSlots: {
        amount: number;
        radius: number;
        type: number;
        direction: number;
        centerX: number;
        centerY: number;
      };
    }
  | {
      /**
       * Glow/bloom post-effect pass plan, executed by the WebGPU runtime.
       *
       * Pipeline (5 passes):
       *   1. `inputWgsl` (fullscreen fragment) -> source texture
       *   2. threshold bright pixels from source -> bright texture
       *   3. horizontal Gaussian blur bright -> blur texture
       *   4. vertical Gaussian blur blur -> bright texture
       *   5. combine source + blurred bright texture -> swapchain/export target
       */
      kind: 'pass.glow-bloom.v1';
      /** Owning glow-bloom node id for param-layout keys (`${nodeId}.${paramName}`). */
      nodeId: string;
      /** Inline WGSL fragment program for the upstream subgraph. Entry points: `vs` / `fs`. */
      inputWgsl: string;
      /** Bright-pass WGSL. Entry points: `vs` / `fs`. */
      thresholdWgsl: string;
      /** Bloom blur WGSL. Entry points: `vs`, `fsBlurH`, `fsBlurV`. */
      blurWgsl: string;
      /** Final combine WGSL. Entry points: `vs` / `fs`. */
      combineWgsl: string;
      /** Intermediate offscreen textures; canvas-sized in practice. */
      intermediateTexture: WebGpuTextureDesc;
      /** Deterministic param slots for the glow-bloom node. Scalars live in `.x`. */
      paramSlots: {
        threshold: number;
        intensity: number;
        radius: number;
        strength: number;
      };
    }
  | {
      /**
       * Bokeh post-effect pass plan, executed by the WebGPU runtime.
       *
       * Pipeline (4 passes):
       *   1. `inputWgsl` (fullscreen fragment) -> source texture
       *   2. bright-pass threshold from source -> bright texture
       *   3. shaped bokeh blur bright -> blur texture
       *   4. combine source + blurred bright texture -> swapchain/export target
       */
      kind: 'pass.bokeh.v1';
      /** Owning bokeh node id for param-layout keys (`${nodeId}.${paramName}`). */
      nodeId: string;
      /** Inline WGSL fragment program for the upstream subgraph. Entry points: `vs` / `fs`. */
      inputWgsl: string;
      /** Bright-pass WGSL. Entry points: `vs` / `fs`. */
      thresholdWgsl: string;
      /** Bokeh blur WGSL. Entry points: `vs` / `fs`. */
      blurWgsl: string;
      /** Final combine WGSL. Entry points: `vs` / `fs`. */
      combineWgsl: string;
      /** Intermediate offscreen textures; canvas-sized in practice. */
      intermediateTexture: WebGpuTextureDesc;
      /** Deterministic param slots for the bokeh node. Scalars live in `.x`. */
      paramSlots: {
        threshold: number;
        intensity: number;
        radius: number;
        strength: number;
        blades: number;
        rotation: number;
      };
    }
  | {
      /**
       * Crepuscular-rays ("god rays") post-effect pass plan, executed by the WebGPU runtime.
       *
       * Pipeline (4 passes):
       *   1. `inputWgsl` (fullscreen fragment) -> source texture (upstream subgraph color image)
       *   2. occluder pass: luminance × procedural angular ray-stripe pattern -> mask texture
       *   3. radial sweep pass: per-fragment march from fragment to source point, accumulating
       *      mask samples with per-step decay -> rays texture
       *   4. combine pass: source.rgb + rays.rgb * intensity -> swapchain / export target
       *
       * Runtime supplies all crepuscular params via `globals.v1`/`v2`/`v3`; the pass plan does not
       * need to know the global param-layout indices (mirrors the blur pass plan convention).
       */
      kind: 'pass.crepuscular-rays.v1';
      /** Owning crepuscular-rays node id for param-layout keys (`${nodeId}.${paramName}`). */
      nodeId: string;
      /** Inline WGSL fragment program for the upstream subgraph. Entry points: `vs` / `fs`. */
      inputWgsl: string;
      /** Occluder mask WGSL (luma × ray stripes). Entry points: `vs` / `fs`. */
      occluderWgsl: string;
      /** Radial sweep WGSL (march from fragment to source). Entry points: `vs` / `fs`. */
      sweepWgsl: string;
      /** Final combine WGSL. Entry points: `vs` / `fs`. */
      combineWgsl: string;
      /** Intermediate offscreen textures; canvas-sized in practice. */
      intermediateTexture: WebGpuTextureDesc;
      /** Deterministic param slots for the crepuscular-rays node. Scalars live in `.x`. */
      paramSlots: {
        sourceX: number;
        sourceY: number;
        distanceFalloff: number;
        intensity: number;
        rayCount: number;
        spread: number;
        width: number;
        rotationSpeed: number;
        rotationOffset: number;
      };
    };

/**
 * Compilation result from the shader compiler.
 */
export interface CompilationResult {
  /**
   * Which backend the emitted `code` targets.
   * Today, the compiler emits WebGL/GLSL only; WebGPU/WGSL is introduced in later tasks.
   */
  backend: RenderBackendKind;

  /**
   * Coverage / support signal for the requested backend.
   * Must be explicit so runtime can fall back per-graph without relying on exceptions.
   */
  supported: boolean;
  unsupportedReasons?: string[];

  /**
   * Backend shader code. For WebGL, this is GLSL ES 3.00 fragment source.
   * `shaderCode` is kept for backward compatibility with the existing WebGL runtime.
   */
  code: string;

  // GLSL shader code
  shaderCode: string;
  
  // Uniform metadata
  uniforms: UniformMetadata[];
  
  // Compilation metadata
  metadata: {
    warnings: string[];
    errors: string[];
    executionOrder: string[];  // Node IDs in execution order
    finalOutputNodeId: string | null;  // ID of final output node
    /** Present on successful compiles; omitted when compilation failed early. */
    previewDependencies?: PreviewDependencyMask;
  };

  /**
   * Deterministic index mapping for parameters that can be stored in a GPU param buffer.
   */
  paramLayout: ParamLayout;

  /**
   * Optional declared resources (future WebGPU binding layout; cloneable).
   */
  resources?: ShaderResourceDecl[];

  /**
   * Optional WebGPU pass plan (Task 09/10). When present, a WebGPU backend may render using passes
   * instead of the single fullscreen fragment program in `code`.
   */
  webgpuPassPlan?: WebGpuPassPlan;
}

/**
 * Shader compiler interface that the runtime expects.
 * @param audioSetup - Optional panel audio setup for audio-derived uniforms (bands/remappers/files).
 */
export interface ShaderCompiler {
  compile(
    graph: import('../data-model/types').NodeGraph,
    audioSetup?: import('../data-model/audioSetupTypes').AudioSetup | null,
    options?: CompileTargetOptions
  ): CompilationResult;

  /**
   * Optional incremental compilation. When implemented, the compiler may return a new result
   * by reusing unchanged parts of the previous compilation. Returns null to fall back to full compile.
   */
  compileIncremental?(
    graph: import('../data-model/types').NodeGraph,
    previousResult: CompilationResult | null,
    affectedNodeIds: Set<string>,
    audioSetup?: import('../data-model/audioSetupTypes').AudioSetup | null,
    options?: CompileTargetOptions
  ): CompilationResult | null;
}

/**
 * Renderer interface for dependency injection.
 * Provides rendering capabilities for shader output.
 */
export interface IRenderer {
  /**
   * Mark renderer as dirty (needs rendering).
   */
  markDirty(reason?: string): void;
  
  /**
   * Render a single frame (only if dirty).
   */
  render(): void;
  
  /**
   * Start animation loop.
   */
  startAnimation(): void;
  
  /**
   * Stop animation loop.
   */
  stopAnimation(): void;
  
  /**
   * Set shader instance for rendering.
   */
  setShaderInstance(instance: import('./ShaderInstance').ShaderInstance): void;
  
  /**
   * Register a callback to run when the WebGL context is restored after loss.
   */
  setOnContextRestored(callback: () => void): void;

  /**
   * Register a callback to run when the WebGL context is lost.
   */
  setOnContextLost(callback: () => void): void;

  /**
   * Get WebGL context (for CompilationManager). Null when preview uses WebGPU-only surface (no live GL).
   */
  getGLContext(): WebGL2RenderingContext | null;
  
  /**
   * True when WebGPU preview is in a terminal failure state (no GL fallback in this session).
   */
  isWebGpuPreviewBlocked?(): boolean;

  /**
   * Get canvas element.
   */
  getCanvas(): HTMLCanvasElement;

  /**
   * Recompute framebuffer size from the preview canvas CSS box (after shell layout changes).
   */
  notifyPreviewLayoutChanged?(): void;

  /**
   * Backing/store or markDirty signaled work that {@link RuntimeManager#setTime}'s clock path may skip
   * rendering (paused + stable time).
   */
  needsPresentationFlush?(): boolean;
}

/**
 * Single source of truth for timeline: current time, duration, BPM, and whether time comes from audio.
 * Used by BottomBar, timeline panel, and uTimelineTime uniform.
 */
export interface TimelineState {
  currentTime: number;
  duration: number;
  bpm: number;
  hasAudio: boolean;
  isPlaying: boolean;
}

/**
 * Audio manager interface for dependency injection.
 * Manages audio file loading, playback, and frequency analysis.
 */
export interface IAudioManager {
  /**
   * Set audio setup from panel. Syncs analyzers from bands; used for cleanup and uniform updates.
   */
  setAudioSetup?(audioSetup: import('../data-model/audioSetupTypes').AudioSetup | null): void;

  /**
   * Start periodic cleanup of orphaned resources.
   */
  startPeriodicCleanup(cleanupCallback: () => void, intervalMs?: number): void;
  
  /**
   * Stop periodic cleanup.
   */
  stopPeriodicCleanup(): void;
  
  /**
   * Clean up orphaned audio resources not in the graph.
   * @param graph - Node graph (valid IDs from graph.nodes)
   * @param extraValidIds - Additional valid IDs (e.g. panel file IDs from audioSetup.files)
   */
  cleanupOrphanedResources(
    graph?: import('../data-model/types').NodeGraph | null,
    extraValidIds?: Iterable<string>
  ): void;
  
  /**
   * Remove audio node and clean up resources.
   */
  removeAudioNode(nodeId: string): void;
  
  /**
   * Remove analyzer node and clean up resources.
   */
  removeAnalyzerNode(nodeId: string): void;
  
  /**
   * Get audio node state.
   */
  getAudioNodeState(nodeId: string): import('./AudioManager').AudioNodeState | undefined;
  
  /**
   * Get analyzer node state.
   */
  getAnalyzerNodeState(nodeId: string): import('./AudioManager').AnalyzerNodeState | undefined;
  
  /**
   * Create analyzer node for frequency analysis.
   */
  createAnalyzer(
    nodeId: string,
    audioFileNodeId: string,
    frequencyBands: import('./AudioManager').FrequencyBand[],
    smoothingHalfLifeSeconds: number[],
    attackHalfLifeSeconds: Array<number | undefined> | undefined,
    releaseHalfLifeSeconds: Array<number | undefined> | undefined,
    fftSize?: number
  ): void;
  
  /**
   * Play audio for a node.
   * @param options - loop (default true); onEnded when loop is false (e.g. playlist advance)
   */
  playAudio(nodeId: string, offset?: number, options?: { loop?: boolean; onEnded?: () => void }): Promise<void>;
  
  /**
   * Pause audio playback for a node.
   */
  pauseAudio(nodeId: string): void;
  
  /**
   * Stop audio playback for a node.
   */
  stopAudio(nodeId: string): void;
  
  /**
   * Verify cleanup was successful for a node.
   */
  verifyCleanup(nodeId: string): boolean;
  
  /**
   * Update audio uniforms (called each frame).
   */
  updateUniforms(
    setUniform: (nodeId: string, paramName: string, value: number) => void,
    setUniforms: (updates: Array<{ nodeId: string, paramName: string, value: number }>) => void,
    graph?: {
      nodes: Array<{ id: string; type: string; parameters: Record<string, unknown> }>;
      connections: Array<{ sourceNodeId: string; targetNodeId: string; targetPort?: string }>;
    } | null,
    forcePushAll?: boolean
  ): void;
  
  /**
   * Load audio file for a node.
   * @param options.reportLoadFailure - If false, load failures are not reported to the user (e.g. preset filePath missing). Default true.
   */
  loadAudioFile(nodeId: string, file: File | string, options?: { reportLoadFailure?: boolean }): Promise<void>;
  
  /**
   * Get global audio state. When primaryNodeId provided, returns that node's state only.
   */
  getGlobalAudioState(primaryNodeId?: string): { isPlaying: boolean; currentTime: number; duration: number } | null;
  
  /**
   * Play all audio nodes.
   */
  playAllAudio(offset?: number): Promise<void>;
  
  /**
   * Stop all audio playback.
   */
  stopAllAudio(): void;

  /**
   * Pause all audio playback (preserves currentTime for resume).
   */
  pauseAllAudio(): void;
  
  /**
   * Seek all audio to a specific time.
   */
  seekAllAudio(time: number): Promise<void>;

  /**
   * Get audio context sample rate (for spectrum bin mapping).
   */
  getSampleRate(): number;

  /**
   * Get spectrum data for a panel band (for FrequencyRangeEditor).
   */
  getAnalyzerSpectrumData(bandId: string): { frequencyData: Uint8Array; fftSize: number; sampleRate: number } | null;

  /**
   * Get live incoming (raw band) and outgoing (remapped) values for a panel band or remapper.
   * Used for RemapRangeEditor needles.
   */
  getPanelBandLiveValues?(
    bandId: string,
    remap: { inMin: number; inMax: number; outMin: number; outMax: number }
  ): { incoming: number | null; outgoing: number | null };

  /**
   * Get live value for a virtual node (audio signal).
   * Used when a parameter is connected to a virtual node.
   */
  getVirtualNodeLiveValue?(virtualNodeId: string): number | null;
}

/**
 * Compilation manager interface for dependency injection.
 * Coordinates compilation triggers and manages shader instance lifecycle.
 */
export interface ICompilationManager {
  /**
   * Set the node graph.
   */
  setGraph(graph: import('../data-model/types').NodeGraph): void;

  /**
   * Set audio setup from panel (for uniform generation from audio-derived signals).
   */
  setAudioSetup?(audioSetup: import('../data-model/audioSetupTypes').AudioSetup | null): void;

  /**
   * Force preview recompile (e.g. after atomic project load). Bypasses idle-skip dedupe.
   */
  requestFullPreviewRecompile?(): void;
  
  /**
   * Handle parameter change.
   * Determines if recompilation is needed or just uniform update.
   */
  onParameterChange(nodeId: string, paramName: string, value: import('../data-model/types').ParameterValue): void;
  
  /**
   * Handle graph structure change (node added/removed, connection added/removed).
   * @param immediate - If true, recompile immediately (e.g. when only connections changed).
   */
  onGraphStructureChange(immediate?: boolean): void;
  
  /**
   * Recompile after WebGL context restore (previous shader instance is invalid).
   */
  recompileAfterContextRestore(): void;
  
  /**
   * Clear shader instance when WebGL context is lost (do not use or destroy the old instance).
   */
  clearShaderInstanceForContextLoss(): void;
  
  /**
   * Get current shader instance (for time/resolution updates).
   */
  getShaderInstance(): PreviewProgramInstance | null;

  /**
   * Set callback invoked after a successful recompile (e.g. so runtime marks dirty and syncs time).
   */
  setOnRecompiled(callback: () => void): void;

  /**
   * Set callback invoked with the new shader instance before its first render (e.g. to push audio uniforms).
   */
  setOnBeforeFirstRender(callback: (instance: PreviewProgramInstance) => void): void;

  /**
   * Last successful compile's preview dependency snapshot; null if never compiled or failed.
   */
  getPreviewDependencyMask(): PreviewDependencyMask | null;
}
