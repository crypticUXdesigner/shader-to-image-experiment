import type { ErrorHandler } from '../../utils/errorHandling';
import type { ShaderInstance } from '../ShaderInstance';
import type { IRenderBackend } from './IRenderBackend';
import type { RenderBackendSelection } from './renderBackendTypes';
import { PreviewFrameLayoutHost } from './PreviewFrameLayoutHost';
import { WebGpuContext } from './WebGpuContext';
import type { CompilationResult, PreviewProgramInstance, WebGpuPassPlan } from '../types';
import {
  type BlurGaussianSeparableV1Plan,
  type BlurGaussianSeparableV1Runtime,
  createBlurGaussianSeparableV1Runtime,
  destroyBlurGaussianSeparableV1Runtime,
  encodeBlurGaussianSeparableV1Frame,
} from './blurGaussianSeparablePassPlanRuntime';
import {
  type GlowBloomV1Plan,
  type GlowBloomV1Runtime,
  createGlowBloomV1Runtime,
  destroyGlowBloomV1Runtime,
  encodeGlowBloomV1Frame,
} from './glowBloomPassPlanRuntime';
import {
  type BokehV1Plan,
  type BokehV1Runtime,
  createBokehV1Runtime,
  destroyBokehV1Runtime,
  encodeBokehV1Frame,
} from './bokehPassPlanRuntime';
import {
  type CrepuscularRaysV1Plan,
  type CrepuscularRaysV1Runtime,
  createCrepuscularRaysV1Runtime,
  destroyCrepuscularRaysV1Runtime,
  encodeCrepuscularRaysV1Frame,
} from './crepuscularRaysPassPlanRuntime';
import { previewPerformanceMark, PreviewPerfMark, previewPerfCounters } from '../previewPerformanceMarks';
import { trimWebGpuShaderPipelineCaches, webGpuParamLayoutsEqual } from './webGpuFullscreenPreviewCache';
import { getPreviewScheduler } from '../PreviewScheduler';
import { FrameGraph, ResourcePool, swapPingPong, textureDescKey, type WebGpuTextureDesc as FrameGraphTextureDesc } from '../webgpuFrameGraph';

type WebGpuInitState =
  | { status: 'pending' }
  | { status: 'ready'; context: WebGpuContext }
  | { status: 'failed'; reason: string };

type WebGpuPipelineState = {
  key: string;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  globalsBuffer: GPUBuffer;
  paramsBuffer: GPUBuffer;
  globalsData: Float32Array;
  paramsData: Float32Array;
  paramsLayout: CompilationResult['paramLayout'];
  paramsDirty: boolean;
  time: number;
  timelineTime: number;
  destroyed: boolean;
};

const BUILTIN_TEST_WGSL = `
struct Globals {
  v0 : vec4<f32>,
  v1 : vec4<f32>,
}

@group(0) @binding(0) var<uniform> globals : Globals;
@group(0) @binding(1) var<storage, read> params : array<vec4<f32>>;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var o : VsOut;
  o.pos = vec4<f32>(p[vid], 0.0, 1.0);
  o.uv = (o.pos.xy * 0.5) + vec2<f32>(0.5, 0.5);
  return o;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let t = globals.v0.x;
  let r = vec3<f32>(in.uv, 0.5 + 0.5 * sin(t));
  return vec4<f32>(r, 1.0);
}
`;

class WebGpuPreviewProgram implements PreviewProgramInstance {
  constructor(private readonly state: WebGpuPipelineState) {}

  setParameter(nodeId: string, paramName: string, value: number | [number, number, number, number]): void {
    const idx = this.state.paramsLayout[`${nodeId}.${paramName}`];
    if (idx == null) return;
    const o = idx * 4;
    if (typeof value === 'number') {
      this.state.paramsData[o + 0] = value;
      this.state.paramsData[o + 1] = 0;
      this.state.paramsData[o + 2] = 0;
      this.state.paramsData[o + 3] = 0;
    } else {
      this.state.paramsData[o + 0] = value[0];
      this.state.paramsData[o + 1] = value[1];
      this.state.paramsData[o + 2] = value[2];
      this.state.paramsData[o + 3] = value[3];
    }
    this.state.paramsDirty = true;
  }

  setParameters(
    updates: Array<{ nodeId: string; paramName: string; value: number | [number, number, number, number] }>
  ): void {
    for (const u of updates) this.setParameter(u.nodeId, u.paramName, u.value);
  }

  setAudioUniform(nodeId: string, outputName: string, value: number): void {
    this.setParameter(nodeId, outputName, value);
  }

  setTime(time: number): void {
    this.state.time = time;
  }

  setTimelineTime(time: number): void {
    this.state.timelineTime = time;
  }

  getTime(): number {
    return this.state.time;
  }

  getTimelineTime(): number {
    return this.state.timelineTime;
  }

  getParameters(): Map<string, number | [number, number, number, number]> {
    // Best-effort map for transfer; only keys present in layout are returned.
    const out = new Map<string, number | [number, number, number, number]>();
    for (const [key, idx] of Object.entries(this.state.paramsLayout)) {
      const o = idx * 4;
      out.set(key, [
        this.state.paramsData[o + 0] ?? 0,
        this.state.paramsData[o + 1] ?? 0,
        this.state.paramsData[o + 2] ?? 0,
        this.state.paramsData[o + 3] ?? 0
      ]);
    }
    return out;
  }

  destroy(): void {
    this.state.destroyed = true;
  }
}

type FrameGraphSmokeState = {
  frameIndex: number;
  pool: ResourcePool<GPUTexture>;
  historyKey: string | null;
  history: { read: GPUTexture; write: GPUTexture } | null;
  sampler: GPUSampler;
  globalsBuffer: GPUBuffer;
  globalsData: Float32Array;
  pipeFeedback: GPURenderPipeline;
  pipePresent: GPURenderPipeline;
};

function isFrameGraphSmokeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  return (window as unknown as { __webgpuFrameGraphSmoke?: boolean }).__webgpuFrameGraphSmoke === true;
}

function isComputeSmokeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  return (window as unknown as { __webgpuComputeSmoke?: boolean }).__webgpuComputeSmoke === true;
}

const FRAMEGRAPH_SMOKE_WGSL = `
struct Globals {
  v0 : vec4<f32>,
  v1 : vec4<f32>,
}

@group(0) @binding(0) var<uniform> globals : Globals;
@group(0) @binding(1) var feedbackTex : texture_2d<f32>;
@group(0) @binding(2) var feedbackSamp : sampler;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var o : VsOut;
  o.pos = vec4<f32>(p[vid], 0.0, 1.0);
  o.uv = (o.pos.xy * 0.5) + vec2<f32>(0.5, 0.5);
  return o;
}

@fragment
fn fsFeedback(in : VsOut) -> @location(0) vec4<f32> {
  let t = globals.v0.x;
  let prev = textureSample(feedbackTex, feedbackSamp, in.uv);
  let wave = 0.5 + 0.5 * sin(t + in.uv.x * 6.28318);
  let next = vec4<f32>(in.uv, wave, 1.0);
  // Gentle feedback blend so we can see history/ping-pong work.
  return mix(prev, next, 0.20);
}

@fragment
fn fsPresent(in : VsOut) -> @location(0) vec4<f32> {
  return textureSample(feedbackTex, feedbackSamp, in.uv);
}
`;

const COMPUTE_SMOKE_WGSL = `
struct Globals {
  v0 : vec4<f32>,
  v1 : vec4<f32>,
}

@group(0) @binding(0) var<uniform> globals : Globals;
@group(0) @binding(1) var readTex : texture_2d<f32>;
@group(0) @binding(2) var writeTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<storage, read> params : array<vec4<f32>>;

fn clampCoord(p : vec2<i32>, w : i32, h : i32) -> vec2<i32> {
  return vec2<i32>(clamp(p.x, 0, w - 1), clamp(p.y, 0, h - 1));
}

fn paramF(idx : i32, fallback : f32) -> f32 {
  if (idx < 0) { return fallback; }
  return params[u32(idx)].x;
}

@compute @workgroup_size(8, 8, 1)
fn cs(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(globals.v0.z);
  let h = i32(globals.v0.w);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) { return; }

  let p = vec2<i32>(x, y);

  // Parameters (indices provided by JS; defaults match node defaults).
  let feed = paramF(0, 0.055);
  let kill = paramF(1, 0.062);
  let du = 0.01 * paramF(2, 1.0);
  let dv = 0.01 * paramF(3, 0.5);
  let scale = max(1.0, paramF(4, 80.0));
  let stepsF = clamp(paramF(5, 3.0), 1.0, 5.0);
  let steps = i32(stepsF + 0.5);
  let timeSpeed = paramF(6, 1.0);
  let timeOffset = paramF(7, 0.0);
  let intensity = paramF(8, 1.0);
  let grain = paramF(9, 0.0);

  let t = (globals.v0.x + timeOffset) * timeSpeed;
  let uv = vec2<f32>(f32(x) / f32(max(1, w)), f32(y) / f32(max(1, h)));

  // Load state (RG = U,V).
  var state = textureLoad(readTex, p, 0);
  var U = state.r;
  var V = state.g;

  // Initialize for first frames after resize/reset: U ~ 1, V seeded blobs.
  if (globals.v1.x > 0.5) {
    let cx = uv.x * scale;
    let cy = uv.y * scale;
    let s = 0.5 + 0.5 * sin(cx * 6.1 + cy * 4.7 + t * 0.15);
    let g = grain * (0.5 + 0.5 * sin(cx * 17.0 + cy * 13.0 + t * 0.7));
    V = clamp(0.08 + 0.85 * s + g, 0.0, 1.0);
    U = clamp(0.92 - 0.22 * s, 0.0, 1.0);
  }

  // One iteration per dispatch. Multi-step simulation is implemented by JS by dispatching multiple passes and ping-ponging.
  // This keeps neighborhood reads correct (each step reads the previous step output).
  let l = textureLoad(readTex, clampCoord(p + vec2<i32>(-1, 0), w, h), 0);
  let r = textureLoad(readTex, clampCoord(p + vec2<i32>( 1, 0), w, h), 0);
  let uN = textureLoad(readTex, clampCoord(p + vec2<i32>( 0,-1), w, h), 0);
  let dS = textureLoad(readTex, clampCoord(p + vec2<i32>( 0, 1), w, h), 0);

  let lapU = (l.r + r.r + uN.r + dS.r - 4.0 * U);
  let lapV = (l.g + r.g + uN.g + dS.g - 4.0 * V);

  let rUVV = U * V * V;
  U = U + (du * lapU - rUVV + feed * (1.0 - U));
  V = V + (dv * lapV + rUVV - (feed + kill) * V);
  U = clamp(U, 0.0, 1.0);
  V = clamp(V, 0.0, 1.0);

  let outB = clamp(0.25 + 0.75 * (V * intensity), 0.0, 1.0);
  textureStore(writeTex, p, vec4<f32>(U, V, outB, 1.0));
}

@group(0) @binding(0) var presentTex : texture_2d<f32>;
@group(0) @binding(1) var presentSamp : sampler;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var o : VsOut;
  o.pos = vec4<f32>(p[vid], 0.0, 1.0);
  o.uv = (o.pos.xy * 0.5) + vec2<f32>(0.5, 0.5);
  return o;
}

@fragment
fn fsPresent(in : VsOut) -> @location(0) vec4<f32> {
  return textureSample(presentTex, presentSamp, in.uv);
}
`;

type ComputeSmokeState = {
  frameIndex: number;
  pool: ResourcePool<GPUTexture>;
  key: string | null;
  pingpong: { read: GPUTexture; write: GPUTexture } | null;
  sampler: GPUSampler;
  globalsBuffer: GPUBuffer;
  globalsData: Float32Array;
  pipeCompute: GPUComputePipeline;
  pipePresent: GPURenderPipeline;
  time: number;
  timelineTime: number;
  initFramesLeft: number;
  paramsLayout: CompilationResult['paramLayout'] | null;
  paramsData: Float32Array;
  paramsBuffer: GPUBuffer;
  paramsDirty: boolean;
};

/**
 * WebGPU-only preview backend (Task 03): owns adapter/device/canvas context and WGSL pipelines
 * without constructing a parallel WebGL2 context or off-screen GL backing canvas.
 *
 * **Related modules (ownership):**
 * - `./webGpuFullscreenPreviewCache.ts` — fullscreen single-pass shader/pipeline LRU trim; param-layout
 *   equality for safe pipeline reuse across recompiles.
 */
export class WebGpuRenderBackend implements IRenderBackend {
  private readonly errorHandler?: ErrorHandler;
  private readonly layout: PreviewFrameLayoutHost;
  private webgpu: WebGpuInitState = { status: 'pending' };
  private pipeline: WebGpuPipelineState | null = null;
  private program: PreviewProgramInstance | null = null;
  private frameGraphSmoke: FrameGraphSmokeState | null = null;
  private computeSmoke: ComputeSmokeState | null = null;
  private activePassPlan: WebGpuPassPlan | null = null;
  private blurGaussianSeparable: BlurGaussianSeparableV1Runtime | null = null;
  private glowBloom: GlowBloomV1Runtime | null = null;
  private bokeh: BokehV1Runtime | null = null;
  private crepuscularRays: CrepuscularRaysV1Runtime | null = null;
  /**
   * Task 12: keep single-pass WebGPU objects stable across recompiles where possible.
   * These caches are cleared on device lost (see init).
   */
  private singlePassLayouts:
    | { bindGroupLayout: GPUBindGroupLayout; pipelineLayout: GPUPipelineLayout }
    | null = null;
  private readonly shaderModuleCache = new Map<string, GPUShaderModule>();
  private readonly renderPipelineCache = new Map<string, GPURenderPipeline>();

  private onContextLostCallback: (() => void) | null = null;

  constructor(
    presentationCanvas: HTMLCanvasElement,
    public readonly selection: RenderBackendSelection,
    errorHandler?: ErrorHandler
  ) {
    this.errorHandler = errorHandler;
    this.layout = new PreviewFrameLayoutHost(presentationCanvas, {
      dirtySource: 'WebGpuRenderBackend',
      isLayoutBlocked: () => this.webgpu.status === 'failed'
    });

    void this.initWebGpu(presentationCanvas);
  }

  isWebGpuPreviewBlocked(): boolean {
    return this.webgpu.status === 'failed';
  }

  markDirty(reason?: string): void {
    this.layout.markDirty(reason ?? 'unknown');
  }

  getCanvas(): HTMLCanvasElement {
    return this.layout.getCanvas();
  }

  getGLContext(): WebGL2RenderingContext | null {
    return null;
  }

  getPreviewCompileExclusiveGpu(): RenderBackendSelection['selected'] {
    return this.selection.selected;
  }

  notifyPreviewLayoutChanged(): void {
    this.layout.notifyPreviewLayoutChanged();
  }

  needsPresentationFlush(): boolean {
    return this.layout.needsPresentationFlush();
  }

  setShaderInstance(_instance: ShaderInstance): void {
    // WebGPU preview uses WGSL pipelines via setWebGpuProgram; no WebGL ShaderInstance.
  }

  setOnContextRestored(_callback: () => void): void {
    // WebGL-style context restore is not wired for WebGPU-only preview yet.
  }

  setOnContextLost(callback: () => void): void {
    this.onContextLostCallback = callback;
  }

  startAnimation(): void {
    // Main app owns the animation loop.
  }

  stopAnimation(): void {
    // Main app owns the animation loop.
  }

  destroy(): void {
    this.clearWebGpuPassPlanRuntimeState();
    if (this.pipeline) {
      this.disposePipelineState(this.pipeline);
      this.pipeline = null;
    }
    this.program = null;
    this.shaderModuleCache.clear();
    this.renderPipelineCache.clear();
    this.singlePassLayouts = null;
    if (this.webgpu.status === 'ready') {
      try {
        this.webgpu.context.canvasContext.unconfigure();
      } catch {
        // ignore
      }
    }
    this.webgpu = { status: 'failed', reason: 'destroyed' };
    this.layout.destroy();
  }

  private disposePipelineState(state: WebGpuPipelineState): void {
    if (state.destroyed) return;
    state.destroyed = true;
    try {
      state.globalsBuffer.destroy();
    } catch {
      // ignore
    }
    try {
      state.paramsBuffer.destroy();
    } catch {
      // ignore
    }
  }

  private async initWebGpu(canvas: HTMLCanvasElement): Promise<void> {
    const result = await WebGpuContext.init(canvas, this.errorHandler);
    if (!result.ok) {
      this.webgpu = { status: 'failed', reason: result.reason };
      const forced = this.selection.mode === 'webgpu';
      this.selection.reason = `webgpu.initFailed.${result.reason}`;
      this.errorHandler?.report(
        'runtime',
        forced ? 'error' : 'warning',
        forced
          ? `WebGPU preview cannot start (${result.reason}). Add ?renderBackend=webgl to the URL and reload to use WebGL preview.`
          : `WebGPU init failed (${result.reason}). Add ?renderBackend=webgl to the URL and reload to use WebGL preview.`,
        result.error
          ? {
              context: { webgpu: { reason: result.reason, mode: this.selection.mode } },
              originalError: result.error
            }
          : { context: { webgpu: { reason: result.reason, mode: this.selection.mode } } }
      );
      getPreviewScheduler().setEffectiveBackend('webgpu', `preview.unavailable.init.${result.reason}`);
      return;
    }

    this.webgpu = { status: 'ready', context: result.context };

    void result.context.device.lost.then((info: GPUDeviceLostInfo) => {
      // If we already fell back (e.g. multiple device-lost notifications), avoid churn.
      if (this.webgpu.status !== 'ready') return;
      this.webgpu = { status: 'failed', reason: `device.lost.${info.reason}` };
      if (this.pipeline) {
        this.disposePipelineState(this.pipeline);
      }
      this.pipeline = null;
      this.program = null;
      this.frameGraphSmoke = null;
      this.computeSmoke = null;
      this.activePassPlan = null;
      this.blurGaussianSeparable = null;
      this.glowBloom = null;
      this.crepuscularRays = null;
      this.singlePassLayouts = null;
      this.shaderModuleCache.clear();
      this.renderPipelineCache.clear();
      this.selection.reason = `webgpu.deviceLost.${info.reason}`;
      getPreviewScheduler().setEffectiveBackend('webgpu', `preview.unavailable.deviceLost.${info.reason}`);
      this.errorHandler?.report(
        'runtime',
        'error',
        `WebGPU device lost (${info.reason}). Reload the page or switch to WebGL preview (?renderBackend=webgl).`,
        { context: { webgpu: { reason: info.reason, message: info.message } } }
      );
      this.onContextLostCallback?.();
      this.markDirty('webgpu.device.lost');
    });

    // Install a tiny built-in program so forced WebGPU mode shows a real frame
    // even before the compiler emits WGSL (Task 04).
    this.setWebGpuProgram({
      backend: 'webgpu',
      supported: true,
      code: BUILTIN_TEST_WGSL,
      shaderCode: '',
      uniforms: [],
      metadata: { warnings: [], errors: [], executionOrder: [], finalOutputNodeId: null },
      paramLayout: {},
    });
    this.markDirty('webgpu.context.ready');
  }

  private ensureFrameGraphSmoke(ctx: WebGpuContext): FrameGraphSmokeState {
    if (this.frameGraphSmoke) return this.frameGraphSmoke;

    const device = ctx.getDevice();
    const module = device.createShaderModule({ code: FRAMEGRAPH_SMOKE_WGSL });

    const globalsBuffer = device.createBuffer({
      size: 8 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const globalsData = new Float32Array(8);

    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const pipeFeedback = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fsFeedback', targets: [{ format: ctx.presentationFormat }] },
      primitive: { topology: 'triangle-list' },
    });

    const pipePresent = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fsPresent', targets: [{ format: ctx.presentationFormat }] },
      primitive: { topology: 'triangle-list' },
    });

    const pool = new ResourcePool<GPUTexture>({
      create: (key) => {
        // key format: "tex:<w>:<h>:<format>:<usage>:<sampleCount>"
        const parts = key.split(':');
        if (parts.length < 6 || parts[0] !== 'tex') {
          throw new Error(`Unexpected texture key: ${key}`);
        }
        const width = Math.max(1, parseInt(parts[1] ?? '1', 10));
        const height = Math.max(1, parseInt(parts[2] ?? '1', 10));
        const format = parts[3] as GPUTextureFormat;
        const usage = Number(parts[4] ?? 0) as GPUTextureUsageFlags;
        const sampleCount = Math.max(1, parseInt(parts[5] ?? '1', 10));
        return device.createTexture({
          size: { width, height },
          format,
          sampleCount,
          usage,
          label: 'framegraph.pooled',
        });
      },
      destroy: (tex) => tex.destroy(),
    });

    const state: FrameGraphSmokeState = {
      frameIndex: 0,
      pool,
      historyKey: null,
      history: null,
      sampler,
      globalsBuffer,
      globalsData,
      pipeFeedback,
      pipePresent,
    };
    this.frameGraphSmoke = state;
    return state;
  }

  private renderFrameGraphSmoke(ctx: WebGpuContext, time: number, timelineTime: number): void {
    const device = ctx.getDevice();
    const queue = ctx.getQueue();
    const width = this.getCanvas().width;
    const height = this.getCanvas().height;

    const smoke = this.ensureFrameGraphSmoke(ctx);
    smoke.frameIndex += 1;
    smoke.pool.beginFrame(smoke.frameIndex);

    const texDesc: FrameGraphTextureDesc = {
      size: { kind: 'canvas' },
      format: ctx.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      label: 'framegraph.history',
    };
    const key = textureDescKey(texDesc, { width, height });

    // Resize invalidation: when key changes, recreate the history pair.
    if (!smoke.history || smoke.historyKey !== key) {
      smoke.historyKey = key;
      if (smoke.history) {
        smoke.pool.release(smoke.history.read);
        smoke.pool.release(smoke.history.write);
      }
      smoke.history = { read: smoke.pool.acquire(key), write: smoke.pool.acquire(key) };
    }

    const history = smoke.history!;

    previewPerformanceMark(PreviewPerfMark.previewUniformsStart);
    // globals.v0 = (time, timelineTime, res.x, res.y)
    smoke.globalsData[0] = time;
    smoke.globalsData[1] = timelineTime;
    smoke.globalsData[2] = width;
    smoke.globalsData[3] = height;
    smoke.globalsData[4] = 0;
    smoke.globalsData[5] = 0;
    smoke.globalsData[6] = 0;
    smoke.globalsData[7] = 0;
    queue.writeBuffer(
      smoke.globalsBuffer,
      0,
      smoke.globalsData.buffer as ArrayBuffer,
      smoke.globalsData.byteOffset,
      smoke.globalsData.byteLength
    );
    previewPerformanceMark(PreviewPerfMark.previewUniformsEnd);

    previewPerformanceMark(PreviewPerfMark.previewDrawStart);
    const encoder = device.createCommandEncoder();
    const fg = new FrameGraph();

    fg.addPass({
      id: 'feedback',
      kind: 'render',
      reads: ['history.read'],
      writes: ['history.write'],
      execute: () => {
        const bindGroup = device.createBindGroup({
          layout: smoke.pipeFeedback.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: smoke.globalsBuffer } },
            { binding: 1, resource: history.read.createView() },
            { binding: 2, resource: smoke.sampler },
          ],
        });

        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: history.write.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        pass.setViewport(0, 0, width, height, 0, 1);
        pass.setPipeline(smoke.pipeFeedback);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, 0);
        pass.end();
      },
    });

    fg.addPass({
      id: 'present',
      kind: 'render',
      reads: ['history.write'],
      writes: ['present'],
      execute: () => {
        const bindGroup = device.createBindGroup({
          layout: smoke.pipePresent.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: smoke.globalsBuffer } },
            { binding: 1, resource: history.write.createView() },
            { binding: 2, resource: smoke.sampler },
          ],
        });

        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: ctx.getCurrentTextureView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        pass.setViewport(0, 0, width, height, 0, 1);
        pass.setPipeline(smoke.pipePresent);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, 0);
        pass.end();
      },
    });

    fg.execute();
    queue.submit([encoder.finish()]);
    previewPerformanceMark(PreviewPerfMark.previewDrawEnd);

    smoke.history = swapPingPong(history);
  }

  private ensureComputeSmoke(ctx: WebGpuContext): ComputeSmokeState {
    if (this.computeSmoke) return this.computeSmoke;
    const device = ctx.getDevice();
    const module = device.createShaderModule({ code: COMPUTE_SMOKE_WGSL });

    const globalsBuffer = device.createBuffer({
      size: 8 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const globalsData = new Float32Array(8);
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    const paramsData = new Float32Array(10 * 4);
    const paramsBuffer = device.createBuffer({
      size: paramsData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const computeBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });

    const presentBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const pipeCompute = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [computeBgl] }),
      compute: { module, entryPoint: 'cs' },
    });

    const pipePresent = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [presentBgl] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fsPresent', targets: [{ format: ctx.presentationFormat }] },
      primitive: { topology: 'triangle-list' },
    });

    const pool = new ResourcePool<GPUTexture>({
      create: (key) => {
        const parts = key.split(':');
        if (parts.length < 6 || parts[0] !== 'tex') {
          throw new Error(`Unexpected texture key: ${key}`);
        }
        const width = Math.max(1, parseInt(parts[1] ?? '1', 10));
        const height = Math.max(1, parseInt(parts[2] ?? '1', 10));
        const format = parts[3] as GPUTextureFormat;
        const usage = Number(parts[4] ?? 0) as GPUTextureUsageFlags;
        const sampleCount = Math.max(1, parseInt(parts[5] ?? '1', 10));
        return device.createTexture({ size: { width, height }, format, usage, sampleCount, label: 'compute.smoke.pooled' });
      },
      destroy: (tex) => tex.destroy(),
    });

    const state: ComputeSmokeState = {
      frameIndex: 0,
      pool,
      key: null,
      pingpong: null,
      sampler,
      globalsBuffer,
      globalsData,
      pipeCompute,
      pipePresent,
      time: 0,
      timelineTime: 0,
      initFramesLeft: 8,
      paramsLayout: null,
      paramsData,
      paramsBuffer,
      paramsDirty: true,
    };
    this.computeSmoke = state;
    return state;
  }

  private renderComputeSmoke(ctx: WebGpuContext, time: number, timelineTime: number): void {
    const device = ctx.getDevice();
    const queue = ctx.getQueue();
    const width = this.getCanvas().width;
    const height = this.getCanvas().height;

    const smoke = this.ensureComputeSmoke(ctx);
    smoke.frameIndex += 1;
    smoke.pool.beginFrame(smoke.frameIndex);
    smoke.time = time;
    smoke.timelineTime = timelineTime;

    const texDesc: FrameGraphTextureDesc = {
      size: { kind: 'canvas' },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      label: 'compute.smoke.state',
    };
    const key = textureDescKey(texDesc, { width, height });

    if (!smoke.pingpong || smoke.key !== key) {
      smoke.key = key;
      if (smoke.pingpong) {
        smoke.pool.release(smoke.pingpong.read);
        smoke.pool.release(smoke.pingpong.write);
      }
      smoke.pingpong = { read: smoke.pool.acquire(key), write: smoke.pool.acquire(key) };
    }

    const pp = smoke.pingpong!;

    previewPerformanceMark(PreviewPerfMark.previewUniformsStart);
    smoke.globalsData[0] = time;
    smoke.globalsData[1] = timelineTime;
    smoke.globalsData[2] = width;
    smoke.globalsData[3] = height;
    smoke.globalsData[4] = smoke.initFramesLeft > 0 ? 1 : 0; // init flag
    smoke.globalsData[5] = 0;
    smoke.globalsData[6] = 0;
    smoke.globalsData[7] = 0;
    queue.writeBuffer(
      smoke.globalsBuffer,
      0,
      smoke.globalsData.buffer as ArrayBuffer,
      smoke.globalsData.byteOffset,
      smoke.globalsData.byteLength
    );

    if (smoke.paramsDirty) {
      queue.writeBuffer(
        smoke.paramsBuffer,
        0,
        smoke.paramsData.buffer as ArrayBuffer,
        smoke.paramsData.byteOffset,
        smoke.paramsData.byteLength
      );
      smoke.paramsDirty = false;
    }
    previewPerformanceMark(PreviewPerfMark.previewUniformsEnd);

    const stepsVal = Math.max(1, Math.min(5, Math.round(smoke.paramsData[5 * 4] ?? 3)));
    let stepPair = pp;

    previewPerformanceMark(PreviewPerfMark.previewDrawStart);
    const encoder = device.createCommandEncoder();

    // Compute passes: update state for N steps, ping-ponging each step.
    for (let step = 0; step < stepsVal; step++) {
      const bg = device.createBindGroup({
        layout: smoke.pipeCompute.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: smoke.globalsBuffer } },
          { binding: 1, resource: stepPair.read.createView() },
          { binding: 2, resource: stepPair.write.createView() },
          { binding: 3, resource: { buffer: smoke.paramsBuffer } },
        ],
      });

      const pass = encoder.beginComputePass();
      pass.setPipeline(smoke.pipeCompute);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8), 1);
      pass.end();

      // After each step, swap so the next step reads the previous step's output.
      stepPair = swapPingPong(stepPair);
    }

    // Present: sample state to swapchain.
    {
      const bg = device.createBindGroup({
        layout: smoke.pipePresent.getBindGroupLayout(0),
        entries: [
          // Present the most recent step output: after N swaps, the "read" texture holds the last written.
          { binding: 0, resource: stepPair.read.createView() },
          { binding: 1, resource: smoke.sampler },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTextureView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setViewport(0, 0, width, height, 0, 1);
      pass.setPipeline(smoke.pipePresent);
      pass.setBindGroup(0, bg);
      pass.draw(3, 1, 0, 0);
      pass.end();
    }

    queue.submit([encoder.finish()]);
    previewPerformanceMark(PreviewPerfMark.previewDrawEnd);

    // Persist state for next frame: the pair's read should be the latest state.
    smoke.pingpong = stepPair;
    if (smoke.initFramesLeft > 0) smoke.initFramesLeft -= 1;
  }

  private destroyBlurGaussianSeparableState(): void {
    destroyBlurGaussianSeparableV1Runtime(this.blurGaussianSeparable);
    this.blurGaussianSeparable = null;
  }

  private ensureBlurGaussianSeparable(
    ctx: WebGpuContext,
    plan: BlurGaussianSeparableV1Plan,
    paramLayout: CompilationResult['paramLayout']
  ): BlurGaussianSeparableV1Runtime {
    const existing = this.blurGaussianSeparable;
    if (
      existing &&
      existing.plan.nodeId === plan.nodeId &&
      existing.plan.kind === plan.kind &&
      existing.plan.inputWgsl === plan.inputWgsl
    ) {
      // Plan unchanged; refresh the param layout reference so new keys are visible.
      existing.paramsLayout = paramLayout;
      return existing;
    }

    this.destroyBlurGaussianSeparableState();
    const device = ctx.getDevice();
    const rt = createBlurGaussianSeparableV1Runtime(device, plan, paramLayout, ctx.presentationFormat);
    this.blurGaussianSeparable = rt;
    return rt;
  }

  private renderBlurGaussianSeparable(ctx: WebGpuContext, rt: BlurGaussianSeparableV1Runtime): void {
    const device = ctx.getDevice();
    const queue = ctx.getQueue();
    const width = this.getCanvas().width;
    const height = this.getCanvas().height;
    encodeBlurGaussianSeparableV1Frame(device, queue, rt, width, height, ctx.getCurrentTextureView());
  }

  private destroyGlowBloomState(): void {
    destroyGlowBloomV1Runtime(this.glowBloom);
    this.glowBloom = null;
  }

  private ensureGlowBloom(
    ctx: WebGpuContext,
    plan: GlowBloomV1Plan,
    paramLayout: CompilationResult['paramLayout']
  ): GlowBloomV1Runtime {
    const existing = this.glowBloom;
    if (
      existing &&
      existing.plan.nodeId === plan.nodeId &&
      existing.plan.kind === plan.kind &&
      existing.plan.inputWgsl === plan.inputWgsl
    ) {
      existing.paramsLayout = paramLayout;
      return existing;
    }

    this.destroyGlowBloomState();
    const device = ctx.getDevice();
    const rt = createGlowBloomV1Runtime(device, plan, paramLayout, ctx.presentationFormat);
    this.glowBloom = rt;
    return rt;
  }

  private renderGlowBloom(ctx: WebGpuContext, rt: GlowBloomV1Runtime): void {
    const device = ctx.getDevice();
    const queue = ctx.getQueue();
    const width = this.getCanvas().width;
    const height = this.getCanvas().height;
    encodeGlowBloomV1Frame(device, queue, rt, width, height, ctx.getCurrentTextureView());
  }

  private destroyBokehState(): void {
    destroyBokehV1Runtime(this.bokeh);
    this.bokeh = null;
  }

  private ensureBokeh(
    ctx: WebGpuContext,
    plan: BokehV1Plan,
    paramLayout: CompilationResult['paramLayout']
  ): BokehV1Runtime {
    const existing = this.bokeh;
    if (
      existing &&
      existing.plan.nodeId === plan.nodeId &&
      existing.plan.kind === plan.kind &&
      existing.plan.inputWgsl === plan.inputWgsl
    ) {
      existing.paramsLayout = paramLayout;
      return existing;
    }

    this.destroyBokehState();
    const device = ctx.getDevice();
    const rt = createBokehV1Runtime(device, plan, paramLayout, ctx.presentationFormat);
    this.bokeh = rt;
    return rt;
  }

  private renderBokeh(ctx: WebGpuContext, rt: BokehV1Runtime): void {
    const device = ctx.getDevice();
    const queue = ctx.getQueue();
    const width = this.getCanvas().width;
    const height = this.getCanvas().height;
    encodeBokehV1Frame(device, queue, rt, width, height, ctx.getCurrentTextureView());
  }

  private destroyCrepuscularRaysState(): void {
    destroyCrepuscularRaysV1Runtime(this.crepuscularRays);
    this.crepuscularRays = null;
  }

  private ensureCrepuscularRays(
    ctx: WebGpuContext,
    plan: CrepuscularRaysV1Plan,
    paramLayout: CompilationResult['paramLayout']
  ): CrepuscularRaysV1Runtime {
    const existing = this.crepuscularRays;
    if (
      existing &&
      existing.plan.nodeId === plan.nodeId &&
      existing.plan.kind === plan.kind &&
      existing.plan.inputWgsl === plan.inputWgsl
    ) {
      existing.paramsLayout = paramLayout;
      return existing;
    }

    this.destroyCrepuscularRaysState();
    const device = ctx.getDevice();
    const rt = createCrepuscularRaysV1Runtime(device, plan, paramLayout, ctx.presentationFormat);
    this.crepuscularRays = rt;
    return rt;
  }

  private renderCrepuscularRays(ctx: WebGpuContext, rt: CrepuscularRaysV1Runtime): void {
    const device = ctx.getDevice();
    const queue = ctx.getQueue();
    const width = this.getCanvas().width;
    const height = this.getCanvas().height;
    encodeCrepuscularRaysV1Frame(device, queue, rt, width, height, ctx.getCurrentTextureView());
  }

  /**
   * Clears multipass pass-plan routing + GPU runtimes before installing a single-pass WGSL pipeline.
   * If we skip this when switching e.g. `pass.bokeh.v1` → inline WGSL and `createShaderModule` fails
   * mid-way, {@link #activePassPlan} would still point at the old pass plan and {@link #render} could
   * keep encoding multipass work with a superseded/invalid runtime (GPU hang, endless compile retry).
   */
  private clearWebGpuPassPlanRuntimeState(): void {
    this.activePassPlan = null;
    this.destroyBlurGaussianSeparableState();
    this.destroyGlowBloomState();
    this.destroyBokehState();
    this.destroyCrepuscularRaysState();
  }

  public setWebGpuProgram(result: CompilationResult): PreviewProgramInstance | null {
    if (this.webgpu.status !== 'ready') return null;
    if (result.backend !== 'webgpu' || !result.supported) return null;

    const ctx = this.webgpu.context;
    const device = ctx.getDevice();

    try {
      if (result.webgpuPassPlan?.kind === 'pass.blur.gaussian-separable.v1') {
        this.activePassPlan = result.webgpuPassPlan;
        const rt = this.ensureBlurGaussianSeparable(ctx, result.webgpuPassPlan, result.paramLayout);
        rt.paramsData.fill(0);
        rt.paramsDirty = true;

        class BlurPassPlanProgram implements PreviewProgramInstance {
          setParameter(nodeId: string, paramName: string, value: number | [number, number, number, number]): void {
            const idx = rt.paramsLayout[`${nodeId}.${paramName}`];
            if (idx == null) return;
            const o = idx * 4;
            if (typeof value === 'number') {
              rt.paramsData[o + 0] = value;
              rt.paramsData[o + 1] = 0;
              rt.paramsData[o + 2] = 0;
              rt.paramsData[o + 3] = 0;
            } else {
              rt.paramsData[o + 0] = value[0];
              rt.paramsData[o + 1] = value[1];
              rt.paramsData[o + 2] = value[2];
              rt.paramsData[o + 3] = value[3];
            }
            rt.paramsDirty = true;
          }
          setParameters(updates: Array<{ nodeId: string; paramName: string; value: number | [number, number, number, number] }>): void {
            for (const u of updates) this.setParameter(u.nodeId, u.paramName, u.value);
          }
          setAudioUniform(nodeId: string, outputName: string, value: number): void {
            this.setParameter(nodeId, outputName, value);
          }
          setTime(time: number): void {
            rt.time = time;
          }
          setTimelineTime(time: number): void {
            rt.timelineTime = time;
          }
          getTime(): number {
            return rt.time;
          }
          getTimelineTime(): number {
            return rt.timelineTime;
          }
          getParameters(): Map<string, number | [number, number, number, number]> {
            const out = new Map<string, number | [number, number, number, number]>();
            for (const [key, idx] of Object.entries(rt.paramsLayout)) {
              const o = idx * 4;
              out.set(key, [
                rt.paramsData[o + 0] ?? 0,
                rt.paramsData[o + 1] ?? 0,
                rt.paramsData[o + 2] ?? 0,
                rt.paramsData[o + 3] ?? 0,
              ]);
            }
            return out;
          }
          destroy(): void {
            // backend owns pipelines/textures
          }
        }
        const prog = new BlurPassPlanProgram();
        this.program = prog;
        this.markDirty('webgpu.passplan.blur.set');
        return prog;
      }
      if (result.webgpuPassPlan?.kind === 'pass.glow-bloom.v1') {
        this.activePassPlan = result.webgpuPassPlan;
        const rt = this.ensureGlowBloom(ctx, result.webgpuPassPlan, result.paramLayout);
        rt.paramsData.fill(0);
        rt.paramsDirty = true;

        class GlowBloomPassPlanProgram implements PreviewProgramInstance {
          setParameter(nodeId: string, paramName: string, value: number | [number, number, number, number]): void {
            const idx = rt.paramsLayout[`${nodeId}.${paramName}`];
            if (idx == null) return;
            const o = idx * 4;
            if (typeof value === 'number') {
              rt.paramsData[o + 0] = value;
              rt.paramsData[o + 1] = 0;
              rt.paramsData[o + 2] = 0;
              rt.paramsData[o + 3] = 0;
            } else {
              rt.paramsData[o + 0] = value[0];
              rt.paramsData[o + 1] = value[1];
              rt.paramsData[o + 2] = value[2];
              rt.paramsData[o + 3] = value[3];
            }
            rt.paramsDirty = true;
          }
          setParameters(updates: Array<{ nodeId: string; paramName: string; value: number | [number, number, number, number] }>): void {
            for (const u of updates) this.setParameter(u.nodeId, u.paramName, u.value);
          }
          setAudioUniform(nodeId: string, outputName: string, value: number): void {
            this.setParameter(nodeId, outputName, value);
          }
          setTime(time: number): void {
            rt.time = time;
          }
          setTimelineTime(time: number): void {
            rt.timelineTime = time;
          }
          getTime(): number {
            return rt.time;
          }
          getTimelineTime(): number {
            return rt.timelineTime;
          }
          getParameters(): Map<string, number | [number, number, number, number]> {
            const out = new Map<string, number | [number, number, number, number]>();
            for (const [key, idx] of Object.entries(rt.paramsLayout)) {
              const o = idx * 4;
              out.set(key, [
                rt.paramsData[o + 0] ?? 0,
                rt.paramsData[o + 1] ?? 0,
                rt.paramsData[o + 2] ?? 0,
                rt.paramsData[o + 3] ?? 0,
              ]);
            }
            return out;
          }
          destroy(): void {
            // backend owns pipelines/textures
          }
        }
        const prog = new GlowBloomPassPlanProgram();
        this.program = prog;
        this.markDirty('webgpu.passplan.glow-bloom.set');
        return prog;
      }
      if (result.webgpuPassPlan?.kind === 'pass.bokeh.v1') {
        this.activePassPlan = result.webgpuPassPlan;
        const rt = this.ensureBokeh(ctx, result.webgpuPassPlan, result.paramLayout);
        rt.paramsData.fill(0);
        rt.paramsDirty = true;

        class BokehPassPlanProgram implements PreviewProgramInstance {
          setParameter(nodeId: string, paramName: string, value: number | [number, number, number, number]): void {
            const idx = rt.paramsLayout[`${nodeId}.${paramName}`];
            if (idx == null) return;
            const o = idx * 4;
            if (typeof value === 'number') {
              rt.paramsData[o + 0] = value;
              rt.paramsData[o + 1] = 0;
              rt.paramsData[o + 2] = 0;
              rt.paramsData[o + 3] = 0;
            } else {
              rt.paramsData[o + 0] = value[0];
              rt.paramsData[o + 1] = value[1];
              rt.paramsData[o + 2] = value[2];
              rt.paramsData[o + 3] = value[3];
            }
            rt.paramsDirty = true;
          }
          setParameters(updates: Array<{ nodeId: string; paramName: string; value: number | [number, number, number, number] }>): void {
            for (const u of updates) this.setParameter(u.nodeId, u.paramName, u.value);
          }
          setAudioUniform(nodeId: string, outputName: string, value: number): void {
            this.setParameter(nodeId, outputName, value);
          }
          setTime(time: number): void {
            rt.time = time;
          }
          setTimelineTime(time: number): void {
            rt.timelineTime = time;
          }
          getTime(): number {
            return rt.time;
          }
          getTimelineTime(): number {
            return rt.timelineTime;
          }
          getParameters(): Map<string, number | [number, number, number, number]> {
            const out = new Map<string, number | [number, number, number, number]>();
            for (const [key, idx] of Object.entries(rt.paramsLayout)) {
              const o = idx * 4;
              out.set(key, [
                rt.paramsData[o + 0] ?? 0,
                rt.paramsData[o +  1] ?? 0,
                rt.paramsData[o + 2] ?? 0,
                rt.paramsData[o + 3] ?? 0,
              ]);
            }
            return out;
          }
          destroy(): void {
            // backend owns pipelines/textures
          }
        }
        const prog = new BokehPassPlanProgram();
        this.program = prog;
        this.markDirty('webgpu.passplan.bokeh.set');
        return prog;
      }
      if (result.webgpuPassPlan?.kind === 'pass.crepuscular-rays.v1') {
        this.activePassPlan = result.webgpuPassPlan;
        const rt = this.ensureCrepuscularRays(ctx, result.webgpuPassPlan, result.paramLayout);
        rt.paramsData.fill(0);
        rt.paramsDirty = true;

        class CrepuscularRaysPassPlanProgram implements PreviewProgramInstance {
          setParameter(nodeId: string, paramName: string, value: number | [number, number, number, number]): void {
            const idx = rt.paramsLayout[`${nodeId}.${paramName}`];
            if (idx == null) return;
            const o = idx * 4;
            if (typeof value === 'number') {
              rt.paramsData[o + 0] = value;
              rt.paramsData[o + 1] = 0;
              rt.paramsData[o + 2] = 0;
              rt.paramsData[o + 3] = 0;
            } else {
              rt.paramsData[o + 0] = value[0];
              rt.paramsData[o + 1] = value[1];
              rt.paramsData[o + 2] = value[2];
              rt.paramsData[o + 3] = value[3];
            }
            rt.paramsDirty = true;
          }
          setParameters(updates: Array<{ nodeId: string; paramName: string; value: number | [number, number, number, number] }>): void {
            for (const u of updates) this.setParameter(u.nodeId, u.paramName, u.value);
          }
          setAudioUniform(nodeId: string, outputName: string, value: number): void {
            this.setParameter(nodeId, outputName, value);
          }
          setTime(time: number): void {
            rt.time = time;
          }
          setTimelineTime(time: number): void {
            rt.timelineTime = time;
          }
          getTime(): number {
            return rt.time;
          }
          getTimelineTime(): number {
            return rt.timelineTime;
          }
          getParameters(): Map<string, number | [number, number, number, number]> {
            const out = new Map<string, number | [number, number, number, number]>();
            for (const [key, idx] of Object.entries(rt.paramsLayout)) {
              const o = idx * 4;
              out.set(key, [
                rt.paramsData[o + 0] ?? 0,
                rt.paramsData[o + 1] ?? 0,
                rt.paramsData[o + 2] ?? 0,
                rt.paramsData[o + 3] ?? 0,
              ]);
            }
            return out;
          }
          destroy(): void {
            // backend owns pipelines/textures
          }
        }
        const prog = new CrepuscularRaysPassPlanProgram();
        this.program = prog;
        this.markDirty('webgpu.passplan.crepuscular-rays.set');
        return prog;
      }

      // Must run before single-pass pipeline creation so stale pass-plan frames cannot encode while
      // a new compile is applied or if module/pipeline creation throws (see {@link clearWebGpuPassPlanRuntimeState}).
      this.clearWebGpuPassPlanRuntimeState();

      const key = result.code;
      const existing = this.pipeline;
      if (
        existing &&
        existing.key === key &&
        !existing.destroyed &&
        webGpuParamLayoutsEqual(existing.paramsLayout, result.paramLayout)
      ) {
        this.program = this.program ?? new WebGpuPreviewProgram(existing);
        return this.program;
      }

      // Task 12: cache shader modules and pipelines to reduce recompile stutters
      // when toggling between graphs / backends frequently.
      const cacheKey = `${ctx.presentationFormat}:${key}`;
      let module = this.shaderModuleCache.get(cacheKey);
      if (module) {
        previewPerfCounters.webgpuShaderModuleCacheHits += 1;
      } else {
        previewPerfCounters.webgpuShaderModuleCreates += 1;
        module = device.createShaderModule({ code: result.code });
        this.shaderModuleCache.set(cacheKey, module);
        trimWebGpuShaderPipelineCaches(this.shaderModuleCache, this.renderPipelineCache);
      }

      const globalsBuffer = device.createBuffer({
        size: 8 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      const slotCount = Math.max(1, ...Object.values(result.paramLayout).map((v) => v + 1));
      const paramsData = new Float32Array(slotCount * 4);
      const paramsBuffer = device.createBuffer({
        size: paramsData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });

      const layouts =
        this.singlePassLayouts ??
        (() => {
          const bindGroupLayout = device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
            ]
          });
          const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
          this.singlePassLayouts = { bindGroupLayout, pipelineLayout };
          return this.singlePassLayouts;
        })();

      let pipeline = this.renderPipelineCache.get(cacheKey);
      if (pipeline) {
        previewPerfCounters.webgpuRenderPipelineCacheHits += 1;
      } else {
        previewPerfCounters.webgpuRenderPipelineCreates += 1;
        pipeline = device.createRenderPipeline({
          layout: layouts.pipelineLayout,
          vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint: 'fs', targets: [{ format: ctx.presentationFormat }] },
          primitive: { topology: 'triangle-list' }
        });
        this.renderPipelineCache.set(cacheKey, pipeline);
        trimWebGpuShaderPipelineCaches(this.shaderModuleCache, this.renderPipelineCache);
      }

      const bindGroup = device.createBindGroup({
        layout: layouts.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: globalsBuffer } },
          { binding: 1, resource: { buffer: paramsBuffer } }
        ]
      });

      const state: WebGpuPipelineState = {
        key,
        pipeline,
        bindGroup,
        globalsBuffer,
        paramsBuffer,
        globalsData: new Float32Array(8),
        paramsData,
        paramsLayout: result.paramLayout,
        paramsDirty: true,
        time: 0,
        timelineTime: 0,
        destroyed: false
      };

      // Task 12: ensure old GPU buffers don’t accumulate across recompiles.
      if (this.pipeline) this.disposePipelineState(this.pipeline);
      this.pipeline = state;
      this.activePassPlan = null;
      this.program = new WebGpuPreviewProgram(state);
      this.markDirty('webgpu.program.set');
      return this.program;
    } catch (e) {
      const err = e instanceof Error ? e : new Error('WebGPU set program failed', { cause: e });
      this.errorHandler?.report('runtime', 'warning', 'WebGPU pipeline creation failed; preview may stay on the previous program until the graph compiles for WebGPU.', {
        context: { webgpu: { reason: 'pipeline.create.failed' } },
        originalError: err
      });
      return null;
    }
  }

  public render(): void {
    // Matches `Renderer.render` prelude: ResizeObserver marks `pendingResize`; apply canvas backing size
    // before reading `getCanvas().width` / encoding WebGPU work.
    this.layout.applyPendingViewportLayout();

    if (this.webgpu.status === 'pending') {
      this.layout.clearPresentationDirtyAfterDraw();
      return;
    }

    if (this.webgpu.status === 'failed') {
      this.layout.clearPresentationDirtyAfterDraw();
      return;
    }

    // Keep WebGPU canvas context configured as the backing store size changes.
    this.webgpu.context.configureToCanvasSize();

    // Task 09 smoke: optional frame-graph path for exercising multi-pass + ping-pong.
    if (this.webgpu.status === 'ready' && isFrameGraphSmokeEnabled()) {
      this.renderFrameGraphSmoke(this.webgpu.context, this.pipeline?.time ?? 0, this.pipeline?.timelineTime ?? 0);
      previewPerfCounters.previewFrameCommits += 1;
      previewPerfCounters.webgpuPreviewCommitsSmokeFramegraph += 1;
      getPreviewScheduler().recordPreviewFrameCommit();
      this.layout.clearPresentationDirtyAfterDraw();
      return;
    }

    // Task 10 smoke: optional compute + ping-pong path to validate compute plumbing.
    if (this.webgpu.status === 'ready' && isComputeSmokeEnabled()) {
      this.renderComputeSmoke(this.webgpu.context, this.pipeline?.time ?? 0, this.pipeline?.timelineTime ?? 0);
      previewPerfCounters.previewFrameCommits += 1;
      previewPerfCounters.webgpuPreviewCommitsSmokeCompute += 1;
      getPreviewScheduler().recordPreviewFrameCommit();
      this.layout.clearPresentationDirtyAfterDraw();
      return;
    }

    // Task 10B: blur post-effect pass plan (separable Gaussian) — multi-pass render path.
    if (this.webgpu.status === 'ready' && this.activePassPlan?.kind === 'pass.blur.gaussian-separable.v1') {
      const rt = this.blurGaussianSeparable;
      if (rt) {
        this.renderBlurGaussianSeparable(this.webgpu.context, rt);
        previewPerfCounters.previewFrameCommits += 1;
        previewPerfCounters.webgpuPreviewCommitsPassBlur += 1;
        getPreviewScheduler().recordPreviewFrameCommit();
        this.layout.clearPresentationDirtyAfterDraw();
        return;
      }
    }

    if (this.webgpu.status === 'ready' && this.activePassPlan?.kind === 'pass.glow-bloom.v1') {
      const rt = this.glowBloom;
      if (rt) {
        this.renderGlowBloom(this.webgpu.context, rt);
        previewPerfCounters.previewFrameCommits += 1;
        previewPerfCounters.webgpuPreviewCommitsPassGlowBloom += 1;
        getPreviewScheduler().recordPreviewFrameCommit();
        this.layout.clearPresentationDirtyAfterDraw();
        return;
      }
    }

    if (this.webgpu.status === 'ready' && this.activePassPlan?.kind === 'pass.bokeh.v1') {
      const rt = this.bokeh;
      if (rt) {
        this.renderBokeh(this.webgpu.context, rt);
        previewPerfCounters.previewFrameCommits += 1;
        previewPerfCounters.webgpuPreviewCommitsPassBokeh += 1;
        getPreviewScheduler().recordPreviewFrameCommit();
        this.layout.clearPresentationDirtyAfterDraw();
        return;
      }
    }

    if (this.webgpu.status === 'ready' && this.activePassPlan?.kind === 'pass.crepuscular-rays.v1') {
      const rt = this.crepuscularRays;
      if (rt) {
        this.renderCrepuscularRays(this.webgpu.context, rt);
        previewPerfCounters.previewFrameCommits += 1;
        previewPerfCounters.webgpuPreviewCommitsPassCrepuscular += 1;
        getPreviewScheduler().recordPreviewFrameCommit();
        this.layout.clearPresentationDirtyAfterDraw();
        return;
      }
    }

    // Task 03: if a WebGPU pipeline is installed, render via WebGPU.
    if (this.webgpu.status === 'ready' && this.pipeline && !this.pipeline.destroyed) {
      const ctx = this.webgpu.context;
      const device = ctx.getDevice();
      const queue = ctx.getQueue();

      const width = this.getCanvas().width;
      const height = this.getCanvas().height;

      previewPerformanceMark(PreviewPerfMark.previewUniformsStart);
      // globals.v0 = (time, timelineTime, res.x, res.y)
      this.pipeline.globalsData[0] = this.pipeline.time;
      this.pipeline.globalsData[1] = this.pipeline.timelineTime;
      this.pipeline.globalsData[2] = width;
      this.pipeline.globalsData[3] = height;
      // globals.v1 = (flags, 0,0,0)
      this.pipeline.globalsData[4] = 0;
      this.pipeline.globalsData[5] = 0;
      this.pipeline.globalsData[6] = 0;
      this.pipeline.globalsData[7] = 0;

      queue.writeBuffer(
        this.pipeline.globalsBuffer,
        0,
        this.pipeline.globalsData.buffer as ArrayBuffer,
        this.pipeline.globalsData.byteOffset,
        this.pipeline.globalsData.byteLength
      );
      if (this.pipeline.paramsDirty) {
        queue.writeBuffer(
          this.pipeline.paramsBuffer,
          0,
          this.pipeline.paramsData.buffer as ArrayBuffer,
          this.pipeline.paramsData.byteOffset,
          this.pipeline.paramsData.byteLength
        );
        this.pipeline.paramsDirty = false;
      }
      previewPerformanceMark(PreviewPerfMark.previewUniformsEnd);

      previewPerformanceMark(PreviewPerfMark.previewDrawStart);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTextureView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });

      pass.setViewport(0, 0, width, height, 0, 1);
      pass.setPipeline(this.pipeline.pipeline);
      pass.setBindGroup(0, this.pipeline.bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
      queue.submit([encoder.finish()]);
      previewPerformanceMark(PreviewPerfMark.previewDrawEnd);

      previewPerfCounters.previewFrameCommits += 1;
      previewPerfCounters.webgpuPreviewCommitsSimple += 1;
      getPreviewScheduler().recordPreviewFrameCommit();
      this.layout.clearPresentationDirtyAfterDraw();
      return;
    }

    // If a WebGPU program was destroyed (superseded by a new compile), free old buffers.
    if (this.pipeline?.destroyed) {
      this.disposePipelineState(this.pipeline);
      this.pipeline = null;
    }

    // No drawable WebGPU pipeline this frame (e.g. awaiting compile); do not touch WebGL.
    this.layout.clearPresentationDirtyAfterDraw();
  }
}

