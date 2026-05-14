/**
 * Shared CPU/GPU resources + per-frame encoding for bokeh
 * (`pass.bokeh.v1` pass plans).
 * Used by preview (`WebGpuRenderBackend`) and export paths.
 */
import type { CompilationResult, WebGpuPassPlan } from '../types';
import { previewPerformanceMark, PreviewPerfMark } from '../previewPerformanceMarks';
import { ResourcePool, textureDescKey, type WebGpuTextureDesc as FrameGraphTextureDesc } from '../webgpuFrameGraph';

export type BokehV1Plan = Extract<WebGpuPassPlan, { kind: 'pass.bokeh.v1' }>;

export type BokehV1Runtime = {
  plan: BokehV1Plan;
  frameIndex: number;
  pool: ResourcePool<GPUTexture>;
  key: string | null;
  textures: { source: GPUTexture; bright: GPUTexture; blur: GPUTexture } | null;
  sampler: GPUSampler;
  globalsBuffer: GPUBuffer;
  globalsData: Float32Array;
  paramsLayout: CompilationResult['paramLayout'];
  paramsData: Float32Array;
  paramsBuffer: GPUBuffer;
  paramsDirty: boolean;
  pipeInput: GPURenderPipeline;
  pipeThreshold: GPURenderPipeline;
  pipeBlur: GPURenderPipeline;
  pipeCombine: GPURenderPipeline;
  bglInput: GPUBindGroupLayout;
  bglTexture: GPUBindGroupLayout;
  bglCombine: GPUBindGroupLayout;
  time: number;
  timelineTime: number;
};

export async function validateBokehV1ShaderModules(
  device: GPUDevice,
  plan: BokehV1Plan
): Promise<string | undefined> {
  const modules = [
    device.createShaderModule({ code: plan.inputWgsl }),
    device.createShaderModule({ code: plan.thresholdWgsl }),
    device.createShaderModule({ code: plan.blurWgsl }),
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

export function createBokehV1Runtime(
  device: GPUDevice,
  plan: BokehV1Plan,
  paramLayout: CompilationResult['paramLayout'],
  fragmentTargetFormat: GPUTextureFormat
): BokehV1Runtime {
  const moduleInput = device.createShaderModule({ code: plan.inputWgsl });
  const moduleThreshold = device.createShaderModule({ code: plan.thresholdWgsl });
  const moduleBlur = device.createShaderModule({ code: plan.blurWgsl });
  const moduleCombine = device.createShaderModule({ code: plan.combineWgsl });

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

  const bglTexture = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

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
  const pipeThreshold = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglTexture] }),
    vertex: { module: moduleThreshold, entryPoint: 'vs' },
    fragment: { module: moduleThreshold, entryPoint: 'fs', targets: [{ format: intermediateFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  const pipeBlur = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bglTexture] }),
    vertex: { module: moduleBlur, entryPoint: 'vs' },
    fragment: { module: moduleBlur, entryPoint: 'fs', targets: [{ format: intermediateFormat }] },
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
        label: 'bokeh.pooled',
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
    pipeThreshold,
    pipeBlur,
    pipeCombine,
    bglInput,
    bglTexture,
    bglCombine,
    time: 0,
    timelineTime: 0,
  };
}

export function destroyBokehV1Runtime(rt: BokehV1Runtime | null | undefined): void {
  if (!rt) return;
  try {
    if (rt.textures) {
      rt.pool.release(rt.textures.source);
      rt.pool.release(rt.textures.bright);
      rt.pool.release(rt.textures.blur);
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

function readParamScalar(rt: BokehV1Runtime, slot: number, fallback: number): number {
  if (slot < 0) return fallback;
  const v = rt.paramsData[slot * 4];
  return typeof v === 'number' ? v : fallback;
}

export function encodeBokehV1Frame(
  device: GPUDevice,
  queue: GPUQueue,
  rt: BokehV1Runtime,
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
      rt.pool.release(rt.textures.bright);
      rt.pool.release(rt.textures.blur);
    }
    rt.textures = {
      source: rt.pool.acquire(texKey),
      bright: rt.pool.acquire(texKey),
      blur: rt.pool.acquire(texKey),
    };
  }

  previewPerformanceMark(PreviewPerfMark.previewUniformsStart);
  // globals: v0(time,timeline,width,height), v1(threshold,intensity,radius,strength), v2(blades,rotation,_,_)
  rt.globalsData[0] = rt.time;
  rt.globalsData[1] = rt.timelineTime;
  rt.globalsData[2] = width;
  rt.globalsData[3] = height;
  rt.globalsData[4] = readParamScalar(rt, rt.plan.paramSlots.threshold, 0.75);
  rt.globalsData[5] = readParamScalar(rt, rt.plan.paramSlots.intensity, 1.0);
  rt.globalsData[6] = readParamScalar(rt, rt.plan.paramSlots.radius, 8.0);
  rt.globalsData[7] = readParamScalar(rt, rt.plan.paramSlots.strength, 0.65);
  rt.globalsData[8] = readParamScalar(rt, rt.plan.paramSlots.blades, 6.0);
  rt.globalsData[9] = readParamScalar(rt, rt.plan.paramSlots.rotation, 0.0);
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
  const { source, bright, blur } = rt.textures!;

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
        { view: source.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipeInput);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

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
        { view: bright.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipeThreshold);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  {
    const bg = device.createBindGroup({
      layout: rt.bglTexture,
      entries: [
        { binding: 0, resource: { buffer: rt.globalsBuffer } },
        { binding: 1, resource: { buffer: rt.paramsBuffer } },
        { binding: 2, resource: bright.createView() },
        { binding: 3, resource: rt.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: blur.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setViewport(0, 0, width, height, 0, 1);
    pass.setPipeline(rt.pipeBlur);
    pass.setBindGroup(0, bg);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  {
    const bg = device.createBindGroup({
      layout: rt.bglCombine,
      entries: [
        { binding: 0, resource: { buffer: rt.globalsBuffer } },
        { binding: 1, resource: source.createView() },
        { binding: 2, resource: blur.createView() },
        { binding: 3, resource: rt.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: presentTargetView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
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

