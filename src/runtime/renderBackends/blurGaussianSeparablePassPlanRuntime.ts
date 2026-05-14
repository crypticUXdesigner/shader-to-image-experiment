/**
 * Shared CPU/GPU resources + per-frame encoding for separable Gaussian blur
 * (`pass.blur.gaussian-separable.v1` pass plans).
 * Used by preview (`WebGpuRenderBackend`) and export paths.
 *
 * Pipeline (per frame, all bound to the same globals + params buffers):
 *   1. inputProgram → tex0   (renders the upstream WGSL subgraph)
 *   2. blur horizontal sampling tex0 → tex1
 *   3. blur vertical sampling tex1 → tex0
 *   4. present tex0 to swapchain
 */
import type { CompilationResult, WebGpuPassPlan } from '../types';
import { previewPerformanceMark, PreviewPerfMark } from '../previewPerformanceMarks';
import { ResourcePool, textureDescKey, type WebGpuTextureDesc as FrameGraphTextureDesc } from '../webgpuFrameGraph';

export type BlurGaussianSeparableV1Plan = Extract<
  WebGpuPassPlan,
  { kind: 'pass.blur.gaussian-separable.v1' }
>;

export type BlurGaussianSeparableV1Runtime = {
  plan: BlurGaussianSeparableV1Plan;
  frameIndex: number;
  pool: ResourcePool<GPUTexture>;
  key: string | null;
  pingpong: { read: GPUTexture; write: GPUTexture } | null;
  sampler: GPUSampler;
  globalsBuffer: GPUBuffer;
  globalsData: Float32Array;
  paramsLayout: CompilationResult['paramLayout'];
  paramsData: Float32Array;
  paramsBuffer: GPUBuffer;
  paramsDirty: boolean;
  /**
   * Render the upstream WGSL subgraph fragment program to an offscreen texture.
   * Bind group 0: globals(0) + params(1).
   */
  pipeInput: GPURenderPipeline;
  /** Horizontal Gaussian blur fragment pipeline. Bind group 0: globals + params + tex + samp. */
  pipeBlurH: GPURenderPipeline;
  /** Vertical Gaussian blur fragment pipeline. */
  pipeBlurV: GPURenderPipeline;
  /** Present pipeline (samples final blurred texture to swapchain). */
  pipePresent: GPURenderPipeline;
  /** Bind group layout shared by `pipeInput` (globals + params only). */
  bglInput: GPUBindGroupLayout;
  /** Bind group layout shared by blur passes (globals + params + tex + samp). */
  bglBlur: GPUBindGroupLayout;
  /** Bind group layout for the present pass (tex + samp). */
  bglPresent: GPUBindGroupLayout;
  time: number;
  timelineTime: number;
};

/**
 * Surface WGSL front-end errors for the input/blur/present modules (used by export paths).
 */
export async function validateBlurGaussianSeparableV1ShaderModules(
  device: GPUDevice,
  plan: BlurGaussianSeparableV1Plan
): Promise<string | undefined> {
  const moduleInput = device.createShaderModule({ code: plan.inputWgsl });
  const moduleBlur = device.createShaderModule({ code: plan.blurWgsl });
  const modulePresent = device.createShaderModule({ code: plan.presentWgsl });
  const e0 = await wgslModuleErrorString(moduleInput);
  if (e0) return e0;
  const e1 = await wgslModuleErrorString(moduleBlur);
  if (e1) return e1;
  return wgslModuleErrorString(modulePresent);
}

async function wgslModuleErrorString(module: GPUShaderModule): Promise<string | undefined> {
  if (typeof module.getCompilationInfo !== 'function') return undefined;
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length === 0) return undefined;
  return errs
    .slice(0, 8)
    .map((m) => `[wgsl:${m.lineNum}:${m.linePos}] ${m.message}`.trim())
    .join('; ');
}

export function createBlurGaussianSeparableV1Runtime(
  device: GPUDevice,
  plan: BlurGaussianSeparableV1Plan,
  paramLayout: CompilationResult['paramLayout'],
  fragmentTargetFormat: GPUTextureFormat
): BlurGaussianSeparableV1Runtime {
  const moduleInput = device.createShaderModule({ code: plan.inputWgsl });
  const moduleBlur = device.createShaderModule({ code: plan.blurWgsl });
  const modulePresent = device.createShaderModule({ code: plan.presentWgsl });

  const globalsBuffer = device.createBuffer({
    size: 12 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const globalsData = new Float32Array(12);
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const slotCount = Math.max(1, ...Object.values(paramLayout).map((v) => v + 1));
  const paramsData = new Float32Array(slotCount * 4);
  const paramsBuffer = device.createBuffer({
    size: paramsData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bglInput = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  });

  const bglBlur = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const bglPresent = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  /**
   * The intermediate texture used for the input pass (tex0) and the horizontal blur output (tex1)
   * is the same format. Use that format both as the input pipeline's render target and as the blur
   * pipelines' fragment target — only the present pipeline targets the swapchain (`fragmentTargetFormat`).
   */
  const intermediateFormat = plan.intermediateTexture.format;

  const pipeInput = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglInput] }),
    vertex: { module: moduleInput, entryPoint: 'vs' },
    fragment: { module: moduleInput, entryPoint: 'fs', targets: [{ format: intermediateFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const pipeBlurH = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglBlur] }),
    vertex: { module: moduleBlur, entryPoint: 'vs' },
    fragment: { module: moduleBlur, entryPoint: 'fsBlurH', targets: [{ format: intermediateFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const pipeBlurV = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglBlur] }),
    vertex: { module: moduleBlur, entryPoint: 'vs' },
    fragment: { module: moduleBlur, entryPoint: 'fsBlurV', targets: [{ format: intermediateFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const pipePresent = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglPresent] }),
    vertex: { module: modulePresent, entryPoint: 'vs' },
    fragment: { module: modulePresent, entryPoint: 'fs', targets: [{ format: fragmentTargetFormat }] },
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
      return device.createTexture({
        size: { width, height },
        format,
        usage,
        sampleCount,
        label: 'blur.gaussian-separable.pooled',
      });
    },
    destroy: (tex) => tex.destroy(),
  });

  return {
    plan,
    frameIndex: 0,
    pool,
    key: null,
    pingpong: null,
    sampler,
    globalsBuffer,
    globalsData,
    paramsLayout: paramLayout,
    paramsData,
    paramsBuffer,
    paramsDirty: true,
    pipeInput,
    pipeBlurH,
    pipeBlurV,
    pipePresent,
    bglInput,
    bglBlur,
    bglPresent,
    time: 0,
    timelineTime: 0,
  };
}

/**
 * Release ping-pong textures + GPU buffers owned by a runtime instance.
 */
export function destroyBlurGaussianSeparableV1Runtime(
  rt: BlurGaussianSeparableV1Runtime | null | undefined
): void {
  if (!rt) return;
  try {
    if (rt.pingpong) {
      rt.pool.release(rt.pingpong.read);
      rt.pool.release(rt.pingpong.write);
    }
  } catch {
    // ignore
  }
  rt.pool.destroyAll();
  try {
    rt.globalsBuffer.destroy();
  } catch {
    // ignore
  }
  try {
    rt.paramsBuffer.destroy();
  } catch {
    // ignore
  }
}

/**
 * Read a scalar value from the runtime's params buffer at the given slot, defaulting to `fallback`
 * when the slot is unallocated.
 */
function readParamScalar(rt: BlurGaussianSeparableV1Runtime, slot: number, fallback: number): number {
  if (slot < 0) return fallback;
  const v = rt.paramsData[slot * 4];
  return typeof v === 'number' ? v : fallback;
}

/**
 * Encode one full frame: input → blur H → blur V → present, ping-ponging the intermediate texture.
 */
export function encodeBlurGaussianSeparableV1Frame(
  device: GPUDevice,
  queue: GPUQueue,
  rt: BlurGaussianSeparableV1Runtime,
  width: number,
  height: number,
  presentTargetView: GPUTextureView
): void {
  rt.frameIndex += 1;
  rt.pool.beginFrame(rt.frameIndex);

  const desc: FrameGraphTextureDesc = {
    size: { kind: 'canvas' },
    format: rt.plan.intermediateTexture.format,
    usage: rt.plan.intermediateTexture.usage,
    label: rt.plan.intermediateTexture.label,
  };
  const texKey = textureDescKey(desc, { width, height });
  if (!rt.pingpong || rt.key !== texKey) {
    rt.key = texKey;
    if (rt.pingpong) {
      rt.pool.release(rt.pingpong.read);
      rt.pool.release(rt.pingpong.write);
    }
    rt.pingpong = { read: rt.pool.acquire(texKey), write: rt.pool.acquire(texKey) };
  }

  previewPerformanceMark(PreviewPerfMark.previewUniformsStart);
  // globals.v0 = (time, timelineTime, width, height)
  rt.globalsData[0] = rt.time;
  rt.globalsData[1] = rt.timelineTime;
  rt.globalsData[2] = width;
  rt.globalsData[3] = height;
  // globals.v1 = (amount, radius, direction, type) — read by the blur shader.
  rt.globalsData[4] = readParamScalar(rt, rt.plan.paramSlots.amount, 0.0);
  rt.globalsData[5] = readParamScalar(rt, rt.plan.paramSlots.radius, 5.0);
  rt.globalsData[6] = readParamScalar(rt, rt.plan.paramSlots.direction, 0.0);
  rt.globalsData[7] = readParamScalar(rt, rt.plan.paramSlots.type, 0.0);
  // globals.v2 = (centerX, centerY, 0, 0) — used by radial blur.
  rt.globalsData[8] = readParamScalar(rt, rt.plan.paramSlots.centerX, 0.0);
  rt.globalsData[9] = readParamScalar(rt, rt.plan.paramSlots.centerY, 0.0);
  rt.globalsData[10] = 0.0;
  rt.globalsData[11] = 0.0;

  queue.writeBuffer(
    rt.globalsBuffer,
    0,
    rt.globalsData.buffer as ArrayBuffer,
    rt.globalsData.byteOffset,
    rt.globalsData.byteLength
  );

  if (rt.paramsDirty) {
    queue.writeBuffer(
      rt.paramsBuffer,
      0,
      rt.paramsData.buffer as ArrayBuffer,
      rt.paramsData.byteOffset,
      rt.paramsData.byteLength
    );
    rt.paramsDirty = false;
  }
  previewPerformanceMark(PreviewPerfMark.previewUniformsEnd);

  previewPerformanceMark(PreviewPerfMark.previewDrawStart);
  const encoder = device.createCommandEncoder();

  const { read: tex0, write: tex1 } = rt.pingpong!;

  // Pass 1: input subgraph → tex0
  {
    const bg = device.createBindGroup({
      layout: rt.bglInput,
      entries: [
        { binding: 0, resource: { buffer: rt.globalsBuffer } },
        { binding: 1, resource: { buffer: rt.paramsBuffer } },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: tex0.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipeInput);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  // Pass 2: blur horizontal — sample tex0, write tex1
  {
    const bg = device.createBindGroup({
      layout: rt.bglBlur,
      entries: [
        { binding: 0, resource: { buffer: rt.globalsBuffer } },
        { binding: 1, resource: { buffer: rt.paramsBuffer } },
        { binding: 2, resource: tex0.createView() },
        { binding: 3, resource: rt.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: tex1.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipeBlurH);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  // Pass 3: blur vertical — sample tex1, write back to tex0
  {
    const bg = device.createBindGroup({
      layout: rt.bglBlur,
      entries: [
        { binding: 0, resource: { buffer: rt.globalsBuffer } },
        { binding: 1, resource: { buffer: rt.paramsBuffer } },
        { binding: 2, resource: tex1.createView() },
        { binding: 3, resource: rt.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: tex0.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipeBlurV);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  // Pass 4: present tex0 → swapchain
  {
    const bg = device.createBindGroup({
      layout: rt.bglPresent,
      entries: [
        { binding: 0, resource: tex0.createView() },
        { binding: 1, resource: rt.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: presentTargetView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipePresent);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  queue.submit([encoder.finish()]);
  previewPerformanceMark(PreviewPerfMark.previewDrawEnd);
}
