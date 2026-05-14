/**
 * Shared CPU/GPU resources + per-frame encoding for crepuscular-rays
 * (`pass.crepuscular-rays.v1` pass plans).
 * Used by preview (`WebGpuRenderBackend`) and export paths (image + video).
 *
 * Pipeline (4 passes; bind groups detailed in `crepuscularRaysV1Wgsl.ts`):
 *   1. inputProgram → source   (renders the upstream WGSL subgraph)
 *   2. occluder pass: source -> mask  (luminance × angular ray-stripe pattern)
 *   3. radial sweep pass: mask -> rays (per-fragment march toward source point)
 *   4. combine pass: source + rays * intensity -> swapchain / export target
 */
import type { CompilationResult, WebGpuPassPlan } from '../types';
import { previewPerformanceMark, PreviewPerfMark } from '../previewPerformanceMarks';
import { ResourcePool, textureDescKey, type WebGpuTextureDesc as FrameGraphTextureDesc } from '../webgpuFrameGraph';

export type CrepuscularRaysV1Plan = Extract<WebGpuPassPlan, { kind: 'pass.crepuscular-rays.v1' }>;

export type CrepuscularRaysV1Runtime = {
  plan: CrepuscularRaysV1Plan;
  frameIndex: number;
  pool: ResourcePool<GPUTexture>;
  key: string | null;
  textures: { source: GPUTexture; mask: GPUTexture; rays: GPUTexture } | null;
  sampler: GPUSampler;
  globalsBuffer: GPUBuffer;
  globalsData: Float32Array;
  paramsLayout: CompilationResult['paramLayout'];
  paramsData: Float32Array;
  paramsBuffer: GPUBuffer;
  paramsDirty: boolean;
  pipeInput: GPURenderPipeline;
  pipeOccluder: GPURenderPipeline;
  pipeSweep: GPURenderPipeline;
  pipeCombine: GPURenderPipeline;
  bglInput: GPUBindGroupLayout;
  bglTexture: GPUBindGroupLayout;
  bglCombine: GPUBindGroupLayout;
  time: number;
  timelineTime: number;
};

/**
 * Surface WGSL front-end errors for the input/occluder/sweep/combine modules.
 */
export async function validateCrepuscularRaysV1ShaderModules(
  device: GPUDevice,
  plan: CrepuscularRaysV1Plan
): Promise<string | undefined> {
  const modules = [
    device.createShaderModule({ code: plan.inputWgsl }),
    device.createShaderModule({ code: plan.occluderWgsl }),
    device.createShaderModule({ code: plan.sweepWgsl }),
    device.createShaderModule({ code: plan.combineWgsl }),
  ];
  for (const module of modules) {
    const err = await wgslModuleErrorString(module);
    if (err) return err;
  }
  return undefined;
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

/** Globals struct holds 4 vec4s (time/res, ray params, stripe params, rotation params). */
const GLOBALS_VEC4_COUNT = 4;
const GLOBALS_FLOAT_COUNT = GLOBALS_VEC4_COUNT * 4;
const GLOBALS_BYTE_SIZE = GLOBALS_FLOAT_COUNT * 4;

export function createCrepuscularRaysV1Runtime(
  device: GPUDevice,
  plan: CrepuscularRaysV1Plan,
  paramLayout: CompilationResult['paramLayout'],
  fragmentTargetFormat: GPUTextureFormat
): CrepuscularRaysV1Runtime {
  const moduleInput = device.createShaderModule({ code: plan.inputWgsl });
  const moduleOccluder = device.createShaderModule({ code: plan.occluderWgsl });
  const moduleSweep = device.createShaderModule({ code: plan.sweepWgsl });
  const moduleCombine = device.createShaderModule({ code: plan.combineWgsl });

  const globalsBuffer = device.createBuffer({
    size: GLOBALS_BYTE_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const globalsData = new Float32Array(GLOBALS_FLOAT_COUNT);
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const slotCount = Math.max(1, ...Object.values(paramLayout).map((v) => v + 1));
  const paramsData = new Float32Array(slotCount * 4);
  const paramsBuffer = device.createBuffer({
    size: paramsData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  /** Input pipeline: same single-pass MVP layout (globals + params, fragment-only). */
  const bglInput = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  });

  /** Occluder + sweep share a layout (globals + params + tex + samp). */
  const bglTexture = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  /** Combine layout: globals + source tex + rays tex + sampler. */
  const bglCombine = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const intermediateFormat = plan.intermediateTexture.format;
  const pipeInput = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglInput] }),
    vertex: { module: moduleInput, entryPoint: 'vs' },
    fragment: { module: moduleInput, entryPoint: 'fs', targets: [{ format: intermediateFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  const pipeOccluder = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglTexture] }),
    vertex: { module: moduleOccluder, entryPoint: 'vs' },
    fragment: { module: moduleOccluder, entryPoint: 'fs', targets: [{ format: intermediateFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  const pipeSweep = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglTexture] }),
    vertex: { module: moduleSweep, entryPoint: 'vs' },
    fragment: { module: moduleSweep, entryPoint: 'fs', targets: [{ format: intermediateFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  const pipeCombine = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglCombine] }),
    vertex: { module: moduleCombine, entryPoint: 'vs' },
    fragment: { module: moduleCombine, entryPoint: 'fs', targets: [{ format: fragmentTargetFormat }] },
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
        label: 'crepuscular-rays.pooled',
      });
    },
    destroy: (tex) => tex.destroy(),
  });

  return {
    plan,
    frameIndex: 0,
    pool,
    key: null,
    textures: null,
    sampler,
    globalsBuffer,
    globalsData,
    paramsLayout: paramLayout,
    paramsData,
    paramsBuffer,
    paramsDirty: true,
    pipeInput,
    pipeOccluder,
    pipeSweep,
    pipeCombine,
    bglInput,
    bglTexture,
    bglCombine,
    time: 0,
    timelineTime: 0,
  };
}

export function destroyCrepuscularRaysV1Runtime(rt: CrepuscularRaysV1Runtime | null | undefined): void {
  if (!rt) return;
  try {
    if (rt.textures) {
      rt.pool.release(rt.textures.source);
      rt.pool.release(rt.textures.mask);
      rt.pool.release(rt.textures.rays);
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

function readParamScalar(rt: CrepuscularRaysV1Runtime, slot: number, fallback: number): number {
  if (slot < 0) return fallback;
  const v = rt.paramsData[slot * 4];
  return typeof v === 'number' ? v : fallback;
}

export function encodeCrepuscularRaysV1Frame(
  device: GPUDevice,
  queue: GPUQueue,
  rt: CrepuscularRaysV1Runtime,
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
  if (!rt.textures || rt.key !== texKey) {
    rt.key = texKey;
    if (rt.textures) {
      rt.pool.release(rt.textures.source);
      rt.pool.release(rt.textures.mask);
      rt.pool.release(rt.textures.rays);
    }
    rt.textures = {
      source: rt.pool.acquire(texKey),
      mask: rt.pool.acquire(texKey),
      rays: rt.pool.acquire(texKey),
    };
  }

  previewPerformanceMark(PreviewPerfMark.previewUniformsStart);
  // globals.v0 = (time, timelineTime, width, height)
  rt.globalsData[0] = rt.time;
  rt.globalsData[1] = rt.timelineTime;
  rt.globalsData[2] = width;
  rt.globalsData[3] = height;
  // globals.v1 = (sourceX, sourceY, distanceFalloff, intensity)
  rt.globalsData[4] = readParamScalar(rt, rt.plan.paramSlots.sourceX, 0.0);
  rt.globalsData[5] = readParamScalar(rt, rt.plan.paramSlots.sourceY, 0.0);
  rt.globalsData[6] = readParamScalar(rt, rt.plan.paramSlots.distanceFalloff, 1.0);
  rt.globalsData[7] = readParamScalar(rt, rt.plan.paramSlots.intensity, 1.0);
  // globals.v2 = (rayCount, spread, width, 0)
  rt.globalsData[8] = readParamScalar(rt, rt.plan.paramSlots.rayCount, 12.0);
  rt.globalsData[9] = readParamScalar(rt, rt.plan.paramSlots.spread, 360.0);
  rt.globalsData[10] = readParamScalar(rt, rt.plan.paramSlots.width, 0.08);
  rt.globalsData[11] = 0.0;
  // globals.v3 = (rotationSpeed, rotationOffset, 0, 0)
  rt.globalsData[12] = readParamScalar(rt, rt.plan.paramSlots.rotationSpeed, 0.0);
  rt.globalsData[13] = readParamScalar(rt, rt.plan.paramSlots.rotationOffset, 0.0);
  rt.globalsData[14] = 0.0;
  rt.globalsData[15] = 0.0;

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
  const { source, mask, rays } = rt.textures!;

  // Pass 1: input subgraph → source
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
          view: source.createView(),
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

  // Pass 2: occluder mask (sample source, multiply luma × stripes) → mask
  {
    const bg = device.createBindGroup({
      layout: rt.bglTexture,
      entries: [
        { binding: 0, resource: { buffer: rt.globalsBuffer } },
        { binding: 1, resource: { buffer: rt.paramsBuffer } },
        { binding: 2, resource: source.createView() },
        { binding: 3, resource: rt.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: mask.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipeOccluder);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  // Pass 3: radial sweep over mask → rays
  {
    const bg = device.createBindGroup({
      layout: rt.bglTexture,
      entries: [
        { binding: 0, resource: { buffer: rt.globalsBuffer } },
        { binding: 1, resource: { buffer: rt.paramsBuffer } },
        { binding: 2, resource: mask.createView() },
        { binding: 3, resource: rt.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: rays.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipeSweep);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  // Pass 4: combine source + rays → swapchain / export target
  {
    const bg = device.createBindGroup({
      layout: rt.bglCombine,
      entries: [
        { binding: 0, resource: { buffer: rt.globalsBuffer } },
        { binding: 1, resource: source.createView() },
        { binding: 2, resource: rays.createView() },
        { binding: 3, resource: rt.sampler },
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
    pass.setPipeline(rt.pipeCombine);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  queue.submit([encoder.finish()]);
  previewPerformanceMark(PreviewPerfMark.previewDrawEnd);
}
