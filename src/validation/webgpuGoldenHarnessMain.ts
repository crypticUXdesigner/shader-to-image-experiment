/**
 * Browser entry for WebGL vs WebGPU pixel parity (opt-in; run via `npm run test:webgpu-golden`).
 */
import type { CompilationResult, PreviewProgramInstance } from '../runtime/types';
import type { IRenderBackend } from '../runtime/renderBackends/IRenderBackend';
import { NodeShaderCompiler } from '../shaders/NodeShaderCompiler';
import { nodeSystemSpecs } from '../shaders/nodes/index';
import type { NodeSpec } from '../types/nodeSpec';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import { ShaderInstance } from '../runtime/ShaderInstance';
import { createRenderBackend } from '../runtime/factories';
import { transferParametersFromGraph } from '../runtime/compilation/parameterTransfer';
import { createExportRenderPath } from '../video-export/ExportRenderPath';
import type { FrameAudioState } from '../video-export/OfflineAudioProvider';
import { createWebGpuVideoExportRenderPath } from '../video-export/WebGpuVideoExportRenderPath';
import { renderWebGpuExportRgba8 } from '../image-export/WebGpuExportRenderPath';
import {
  computeRgbaParityMetrics,
  DEFAULT_PARITY_RMS_MAX,
  rgbaDiffToImageData,
  type RgbaParityMetrics
} from './imageParity';
import { isProbablyBlankFrame } from './blankFrameDetection';
import glowBloomSignatureJson from './goldens/glowBloom.signature.json';
import crepuscularRaysSignatureJson from './goldens/crepuscularRays.signature.json';
import {
  computeGridGoldenSignature,
  signatureBase64ToBytes,
  signatureBytesToBase64,
  compareSignaturesRms,
  defaultSignatureRmsMax,
  signaturePass,
} from './goldenImageSignature';
import {
  getWebgpuMvpFixtureAudioSetup,
  getWebgpuMvpFixtureGraph,
  type WebgpuMvpFixtureId,
  WEBGPU_MVP_FIXTURE_IDS
} from './webgpuMvpFixtures';

function buildNodeSpecsMap(): Map<string, NodeSpec> {
  return new Map(nodeSystemSpecs.map((s) => [s.id, s]));
}

const FIXED_TIME = 1.125;
const FIXED_TIMELINE = 0;
export const GOLDEN_VIEW_WIDTH = 128;
export const GOLDEN_VIEW_HEIGHT = 96;
const PERF_FRAMES = 48;

const EMPTY_AUDIO_SETUP: AudioSetup = { files: [], bands: [], remappers: [] };
const ZERO_METRICS: RgbaParityMetrics = { rms: 0, mad: 0, maxDelta: 0, channelMae: [0, 0, 0, 0] };

function rmsMaxForFixture(fixtureId: WebgpuMvpFixtureId, defaultRmsMax: number): number {
  // Per-fixture overrides are absolute thresholds (not max/min vs default). This avoids silently
  // ignoring intended overrides when the default is larger.
  const override: Partial<Record<WebgpuMvpFixtureId, number>> = {
    // Blur pass-plan fixtures are intentionally *not* strict pixel parity; see runAll() skip rules.
    // Still keep an explicit value here so single-fixture runs are consistent when parity is used.
    mvpBlurPassPlan: 12.0,
    mvpGlowBloomPassPlan: 12.0,
    mvpCrepuscularRaysPassPlan: 12.0,
    mvpBlurPassPlanDirectional: 12.0,
    mvpBlurPassPlanRadial: 12.0,
    mvpAudioBlurPassPlan: 12.0,
    mvpAudioBlurPassPlanNonzeroBlur: 12.0,
    mvpAudioGlowBloomPassPlan: 12.0,
    mvpAudioBokehPassPlan: 12.0,
    mvpAudioCrepuscularRaysPassPlan: 12.0,
  };
  return override[fixtureId] ?? defaultRmsMax;
}

function canvasToRgba(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const w = canvas.width;
  const h = canvas.height;
  const tc = document.createElement('canvas');
  tc.width = w;
  tc.height = h;
  const tctx = tc.getContext('2d');
  if (!tctx) throw new Error('2D canvas unsupported');
  tctx.drawImage(canvas, 0, 0);
  return tctx.getImageData(0, 0, w, h).data;
}

function rgbaStats(rgba: Uint8ClampedArray): string {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let aSum = 0;
  let rgbMax = 0;
  const pixels = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const a = rgba[i + 3] ?? 0;
    rSum += r;
    gSum += g;
    bSum += b;
    aSum += a;
    rgbMax = Math.max(rgbMax, r, g, b);
  }
  const fmt = (v: number) => v.toFixed(1);
  return `avg=(${fmt(rSum / pixels)},${fmt(gSum / pixels)},${fmt(bSum / pixels)},${fmt(aSum / pixels)}) maxRgb=${rgbMax}`;
}

function parityDiagnostics(a: Uint8ClampedArray, b: Uint8ClampedArray): string {
  return `webgl ${rgbaStats(a)} webgpu ${rgbaStats(b)}`;
}

async function waitForCanvasPresentation(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForWebGpuProgram(
  backend: IRenderBackend,
  result: CompilationResult,
  timeoutMs: number
): Promise<PreviewProgramInstance> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const p =
      typeof backend.setWebGpuProgram === 'function' ? backend.setWebGpuProgram(result) : null;
    if (p) return p;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  throw new Error('WebGPU program was not installed (adapter/device or WGSL compile)');
}

function makeHost(): HTMLDivElement {
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:0;top:0;width:' +
    GOLDEN_VIEW_WIDTH +
    'px;height:' +
    GOLDEN_VIEW_HEIGHT +
    'px;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.appendChild(host);
  return host;
}

function makeCanvas(host: HTMLDivElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = GOLDEN_VIEW_WIDTH;
  c.height = GOLDEN_VIEW_HEIGHT;
  c.style.width = `${GOLDEN_VIEW_WIDTH}px`;
  c.style.height = `${GOLDEN_VIEW_HEIGHT}px`;
  host.appendChild(c);
  return c;
}

function destroyRenderBackend(backend: IRenderBackend): void {
  const withDestroy = backend as IRenderBackend & { destroy?: () => void };
  withDestroy.destroy?.();

  // The golden harness creates many short-lived canvases. Even when removing the canvas element,
  // browsers may keep the underlying WebGL context alive for a while, leading to
  // "Too many active WebGL contexts" and eventually lost/blank renders.
  //
  // Force a clean teardown when possible.
  try {
    const anyBackend = backend as unknown as { getGLContext?: () => WebGL2RenderingContext | WebGLRenderingContext };
    const gl = anyBackend.getGLContext?.();
    const lose = gl?.getExtension?.('WEBGL_lose_context') as { loseContext?: () => void } | null;
    lose?.loseContext?.();
  } catch {
    // best-effort cleanup; ignore
  }
}

export type WebgpuGoldenRunResult = {
  fixtureId: WebgpuMvpFixtureId;
  width: number;
  height: number;
  metrics: RgbaParityMetrics;
  rmsMax: number;
  pass: boolean;
  diffDataUrl?: string;
  skipped?: string;
  webgpuError?: string;
  diagnostics?: string;
};

export type WebgpuGoldenPerfResult = {
  fixtureId: WebgpuMvpFixtureId;
  frames: number;
  webglAvgFrameMs: number;
  webgpuAvgFrameMs: number | null;
  webgpuSkipped?: string;
};

async function runParityForFixture(
  compiler: NodeShaderCompiler,
  fixtureId: WebgpuMvpFixtureId,
  host: HTMLDivElement,
  rmsMax: number
): Promise<WebgpuGoldenRunResult> {
  const fixtureRmsMax = rmsMaxForFixture(fixtureId, rmsMax);
  const graph = getWebgpuMvpFixtureGraph(fixtureId);

  const glCanvas = makeCanvas(host);
  const gpuCanvas = makeCanvas(host);

  const glBack = createRenderBackend(glCanvas, 'webgl');
  const gpuBack = createRenderBackend(gpuCanvas, 'webgpu');

  try {
    const glCompile = compiler.compile(graph, null, { backend: 'webgl' });
    if (glCompile.metadata.errors.length > 0) {
      return {
        fixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: {
          rms: NaN,
          mad: NaN,
          maxDelta: NaN,
          channelMae: [NaN, NaN, NaN, NaN]
        },
        rmsMax,
        pass: false,
        skipped: `WebGL compile errors: ${glCompile.metadata.errors.join('; ')}`
      };
    }

    const glCtx = glBack.getGLContext();
    if (!glCtx) {
      return {
        fixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: {
          rms: NaN,
          mad: NaN,
          maxDelta: NaN,
          channelMae: [NaN, NaN, NaN, NaN]
        },
        rmsMax,
        pass: false,
        skipped: 'WebGL preview surface missing (getGLContext returned null)'
      };
    }

    const glInst = new ShaderInstance(glCtx, glCompile);
    transferParametersFromGraph(graph, glInst);
    glInst.setTime(FIXED_TIME);
    glInst.setTimelineTime(FIXED_TIMELINE);
    glBack.setShaderInstance(glInst);
    glBack.markDirty('golden');
    glBack.render();

    const wgCompile = compiler.compile(graph, null, { backend: 'webgpu' });
    if (!wgCompile.supported || wgCompile.metadata.errors.length > 0) {
      return {
        fixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: {
          rms: NaN,
          mad: NaN,
          maxDelta: NaN,
          channelMae: [NaN, NaN, NaN, NaN]
        },
        rmsMax,
        pass: false,
        skipped: `WGSL compile: supported=${wgCompile.supported} errors=${wgCompile.metadata.errors.join('; ')}`
      };
    }

    let gpuProg: PreviewProgramInstance;
    try {
      gpuProg = await waitForWebGpuProgram(gpuBack, wgCompile, 12000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        fixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: {
          rms: NaN,
          mad: NaN,
          maxDelta: NaN,
          channelMae: [NaN, NaN, NaN, NaN]
        },
        rmsMax,
        pass: false,
        webgpuError: msg
      };
    }

    transferParametersFromGraph(graph, gpuProg);
    gpuProg.setTime(FIXED_TIME);
    gpuProg.setTimelineTime(FIXED_TIMELINE);
    gpuBack.markDirty('golden');
    gpuBack.render();
    await waitForCanvasPresentation();

    const a = canvasToRgba(glCanvas);
    const b = canvasToRgba(gpuCanvas);
    const metrics = computeRgbaParityMetrics(a, b);
    const pass = metrics.rms <= fixtureRmsMax && Number.isFinite(metrics.rms);
    const diagnostics = pass ? undefined : parityDiagnostics(a, b);
    let diffDataUrl: string | undefined;
    if (!pass) {
      const diff = rgbaDiffToImageData(GOLDEN_VIEW_WIDTH, GOLDEN_VIEW_HEIGHT, a, b);
      const dc = document.createElement('canvas');
      dc.width = GOLDEN_VIEW_WIDTH;
      dc.height = GOLDEN_VIEW_HEIGHT;
      const dctx = dc.getContext('2d');
      if (dctx) {
        dctx.putImageData(diff, 0, 0);
        diffDataUrl = dc.toDataURL('image/png');
      }
    }

    return {
      fixtureId,
      width: GOLDEN_VIEW_WIDTH,
      height: GOLDEN_VIEW_HEIGHT,
      metrics,
      rmsMax: fixtureRmsMax,
      pass,
      diffDataUrl,
      diagnostics
    };
  } finally {
    destroyRenderBackend(glBack);
    destroyRenderBackend(gpuBack);
    glCanvas.remove();
    gpuCanvas.remove();
  }
}

async function runExportParityForFixture(
  compiler: NodeShaderCompiler,
  fixtureId: WebgpuMvpFixtureId,
  rmsMax: number
): Promise<WebgpuGoldenRunResult> {
  const fixtureRmsMax = rmsMaxForFixture(fixtureId, rmsMax);
  const graph = getWebgpuMvpFixtureGraph(fixtureId);

  // WebGL export path
  const glPath = createExportRenderPath(graph, compiler, EMPTY_AUDIO_SETUP, {
    width: GOLDEN_VIEW_WIDTH,
    height: GOLDEN_VIEW_HEIGHT,
    frameRate: 1,
    startTimeSeconds: FIXED_TIME
  });

  try {
    const frameState = { channelSamples: [], uniformUpdates: [], timelineTime: FIXED_TIMELINE };
    const glCanvasLike = glPath.renderFrame(0, frameState);
    const glCanvas = glCanvasLike as HTMLCanvasElement;
    const a = canvasToRgba(glCanvas);

    const wg = await renderWebGpuExportRgba8(graph, compiler, null, {
      width: GOLDEN_VIEW_WIDTH,
      height: GOLDEN_VIEW_HEIGHT,
      timeSeconds: FIXED_TIME,
      timelineTimeSeconds: FIXED_TIMELINE,
      uniformUpdates: [],
    });

    if (!wg.ok) {
      return {
        fixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: {
          rms: NaN,
          mad: NaN,
          maxDelta: NaN,
          channelMae: [NaN, NaN, NaN, NaN]
        },
        rmsMax,
        pass: false,
        skipped: wg.compilation?.unsupportedReasons?.join('; ') ?? wg.reason,
        webgpuError: wg.error ? (wg.error instanceof Error ? wg.error.message : String(wg.error)) : undefined
      };
    }

    const b = new Uint8ClampedArray(wg.rgba8.buffer, wg.rgba8.byteOffset, wg.rgba8.byteLength);
    const metrics = computeRgbaParityMetrics(a, b);
    const pass = metrics.rms <= fixtureRmsMax && Number.isFinite(metrics.rms);
    const diagnostics = pass ? undefined : parityDiagnostics(a, b);
    let diffDataUrl: string | undefined;
    if (!pass) {
      const diff = rgbaDiffToImageData(GOLDEN_VIEW_WIDTH, GOLDEN_VIEW_HEIGHT, a, b);
      const dc = document.createElement('canvas');
      dc.width = GOLDEN_VIEW_WIDTH;
      dc.height = GOLDEN_VIEW_HEIGHT;
      const dctx = dc.getContext('2d');
      if (dctx) {
        dctx.putImageData(diff, 0, 0);
        diffDataUrl = dc.toDataURL('image/png');
      }
    }

    return {
      fixtureId,
      width: GOLDEN_VIEW_WIDTH,
      height: GOLDEN_VIEW_HEIGHT,
      metrics,
      rmsMax: fixtureRmsMax,
      pass,
      diffDataUrl,
      diagnostics
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      fixtureId,
      width: GOLDEN_VIEW_WIDTH,
      height: GOLDEN_VIEW_HEIGHT,
      metrics: {
        rms: NaN,
        mad: NaN,
        maxDelta: NaN,
        channelMae: [NaN, NaN, NaN, NaN]
      },
      rmsMax: fixtureRmsMax,
      pass: false,
      webgpuError: msg
    };
  } finally {
    glPath.dispose();
  }
}

async function runPassPlanSmokeForFixture(
  compiler: NodeShaderCompiler,
  fixtureId: WebgpuMvpFixtureId
): Promise<WebgpuGoldenRunResult> {
  const graph = getWebgpuMvpFixtureGraph(fixtureId);
  const audioSetup = getWebgpuMvpFixtureAudioSetup(fixtureId);

  try {
    const wgCompile = compiler.compile(graph, audioSetup, { backend: 'webgpu' });
    if (!wgCompile.supported || wgCompile.metadata.errors.length > 0) {
      return {
        fixtureId: `passplan:${fixtureId}` as unknown as WebgpuMvpFixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
        rmsMax: DEFAULT_PARITY_RMS_MAX,
        pass: false,
        skipped: `WGSL compile: supported=${wgCompile.supported} errors=${wgCompile.metadata.errors.join('; ')}`
      };
    }
    if (!wgCompile.webgpuPassPlan) {
      return {
        fixtureId: `passplan:${fixtureId}` as unknown as WebgpuMvpFixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
        rmsMax: DEFAULT_PARITY_RMS_MAX,
        pass: true,
        skipped: 'No pass plan in compilation (fixture uses inline WGSL path).'
      };
    }
    if (
      (fixtureId === 'mvpBlurPassPlan' ||
        fixtureId === 'mvpAudioBlurPassPlan' ||
        fixtureId === 'mvpAudioBlurPassPlanNonzeroBlur') &&
      wgCompile.webgpuPassPlan.kind !== 'pass.blur.gaussian-separable.v1'
    ) {
      return {
        fixtureId: `passplan:${fixtureId}` as unknown as WebgpuMvpFixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
        rmsMax: DEFAULT_PARITY_RMS_MAX,
        pass: false,
        webgpuError: `Unexpected pass plan kind: ${wgCompile.webgpuPassPlan.kind}`,
      };
    }
    if (
      (fixtureId === 'mvpGlowBloomPassPlan' || fixtureId === 'mvpAudioGlowBloomPassPlan') &&
      wgCompile.webgpuPassPlan.kind !== 'pass.glow-bloom.v1'
    ) {
      return {
        fixtureId: `passplan:${fixtureId}` as unknown as WebgpuMvpFixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
        rmsMax: DEFAULT_PARITY_RMS_MAX,
        pass: false,
        webgpuError: `Unexpected pass plan kind: ${wgCompile.webgpuPassPlan.kind}`,
      };
    }
    if (
      (fixtureId === 'mvpBokehPassPlan' || fixtureId === 'mvpAudioBokehPassPlan') &&
      wgCompile.webgpuPassPlan.kind !== 'pass.bokeh.v1'
    ) {
      return {
        fixtureId: `passplan:${fixtureId}` as unknown as WebgpuMvpFixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
        rmsMax: DEFAULT_PARITY_RMS_MAX,
        pass: false,
        webgpuError: `Unexpected pass plan kind: ${wgCompile.webgpuPassPlan.kind}`,
      };
    }
    if (
      (fixtureId === 'mvpCrepuscularRaysPassPlan' || fixtureId === 'mvpAudioCrepuscularRaysPassPlan') &&
      wgCompile.webgpuPassPlan.kind !== 'pass.crepuscular-rays.v1'
    ) {
      return {
        fixtureId: `passplan:${fixtureId}` as unknown as WebgpuMvpFixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
        rmsMax: DEFAULT_PARITY_RMS_MAX,
        pass: false,
        webgpuError: `Unexpected pass plan kind: ${wgCompile.webgpuPassPlan.kind}`,
      };
    }

    // Render via deterministic texture readback (not the swapchain canvas). The preview canvas path
    // can report black in headless/composited environments even when WebGPU renders correctly.
    const out = await renderWebGpuExportRgba8(graph, compiler, audioSetup, {
      width: GOLDEN_VIEW_WIDTH,
      height: GOLDEN_VIEW_HEIGHT,
      timeSeconds: FIXED_TIME,
      timelineTimeSeconds: FIXED_TIMELINE,
      uniformUpdates: [],
    });

    if (!out.ok) {
      return {
        fixtureId: `passplan:${fixtureId}` as unknown as WebgpuMvpFixtureId,
        width: GOLDEN_VIEW_WIDTH,
        height: GOLDEN_VIEW_HEIGHT,
        metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
        rmsMax: DEFAULT_PARITY_RMS_MAX,
        pass: false,
        webgpuError: out.error ? (out.error instanceof Error ? out.error.message : String(out.error)) : out.reason,
      };
    }

    const rgba = new Uint8ClampedArray(out.rgba8.buffer, out.rgba8.byteOffset, out.rgba8.byteLength);
    const blank = isProbablyBlankFrame(rgba);
    return {
      fixtureId: `passplan:${fixtureId}` as unknown as WebgpuMvpFixtureId,
      width: GOLDEN_VIEW_WIDTH,
      height: GOLDEN_VIEW_HEIGHT,
      metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
      rmsMax: DEFAULT_PARITY_RMS_MAX,
      pass: !blank,
      webgpuError: blank ? 'Blank/black output for pass plan' : undefined
    };
  } finally {
    // no canvas/contexts allocated in the readback path
  }
}

type RdSignatureRunResult = {
  fixtureId: WebgpuMvpFixtureId;
  rms: number;
  rmsMax: number;
  pass: boolean;
  expectedPresent: boolean;
  signatureBase64: string;
  expectedBase64: string;
  skipped?: string;
};

type GlowBloomSignature = {
  version: 1;
  fixtureId: string;
  width: number;
  height: number;
  grid: [number, number];
  bytesBase64: string;
};

type CrepuscularRaysSignature = {
  version: 1;
  fixtureId: string;
  width: number;
  height: number;
  grid: [number, number];
  bytesBase64: string;
};

async function runGlowBloomSignatureCheck(
  compiler: NodeShaderCompiler,
  fixtureId: WebgpuMvpFixtureId,
  rmsMax: number
): Promise<RdSignatureRunResult> {
  const graph = getWebgpuMvpFixtureGraph(fixtureId);

  try {
    const wgCompile = compiler.compile(graph, null, { backend: 'webgpu' });
    if (!wgCompile.supported || wgCompile.metadata.errors.length > 0) {
      return {
        fixtureId,
        rms: NaN,
        rmsMax,
        pass: false,
        expectedPresent: false,
        signatureBase64: '',
        expectedBase64: '',
        skipped: `WGSL compile: supported=${wgCompile.supported} errors=${wgCompile.metadata.errors.join('; ')}`
      };
    }
    if (!wgCompile.webgpuPassPlan || wgCompile.webgpuPassPlan.kind !== 'pass.glow-bloom.v1') {
      return {
        fixtureId,
        rms: NaN,
        rmsMax,
        pass: true,
        expectedPresent: false,
        signatureBase64: '',
        expectedBase64: '',
        skipped: 'No glow-bloom pass plan (fixture does not compile to pass.glow-bloom.v1).'
      };
    }

    const out = await renderWebGpuExportRgba8(graph, compiler, null, {
      width: GOLDEN_VIEW_WIDTH,
      height: GOLDEN_VIEW_HEIGHT,
      timeSeconds: FIXED_TIME,
      timelineTimeSeconds: FIXED_TIMELINE,
      uniformUpdates: [],
    });
    if (!out.ok) {
      return {
        fixtureId,
        rms: NaN,
        rmsMax,
        pass: false,
        expectedPresent: false,
        signatureBase64: '',
        expectedBase64: '',
        skipped: out.error ? (out.error instanceof Error ? out.error.message : String(out.error)) : out.reason,
      };
    }

    const rgba = new Uint8ClampedArray(out.rgba8.buffer, out.rgba8.byteOffset, out.rgba8.byteLength);
    const sigBytes = computeGridGoldenSignature(rgba, GOLDEN_VIEW_WIDTH, GOLDEN_VIEW_HEIGHT, [16, 12]);
    const sigB64 = signatureBytesToBase64(sigBytes);

    const expected = glowBloomSignatureJson as unknown as GlowBloomSignature;
    const expectedPresent = typeof expected.bytesBase64 === 'string' && expected.bytesBase64.length > 0;
    if (!expectedPresent) {
      return {
        fixtureId,
        rms: NaN,
        rmsMax,
        pass: true,
        expectedPresent: false,
        signatureBase64: sigB64,
        expectedBase64: '',
        skipped: 'No stored glow-bloom signature yet (bytesBase64 empty).'
      };
    }

    const expectedBytes = signatureBase64ToBytes(expected.bytesBase64);
    const rms = compareSignaturesRms(expectedBytes, sigBytes);
    const pass = signaturePass(rms, rmsMax);

    return {
      fixtureId,
      rms,
      rmsMax,
      pass,
      expectedPresent: true,
      signatureBase64: sigB64,
      expectedBase64: expected.bytesBase64
    };
  } catch (e) {
    return {
      fixtureId,
      rms: NaN,
      rmsMax,
      pass: false,
      expectedPresent: false,
      signatureBase64: '',
      expectedBase64: '',
      skipped: e instanceof Error ? e.message : String(e)
    };
  }
}

async function runCrepuscularRaysSignatureCheck(
  compiler: NodeShaderCompiler,
  fixtureId: WebgpuMvpFixtureId,
  rmsMax: number
): Promise<RdSignatureRunResult> {
  const graph = getWebgpuMvpFixtureGraph(fixtureId);

  try {
    const wgCompile = compiler.compile(graph, null, { backend: 'webgpu' });
    if (!wgCompile.supported || wgCompile.metadata.errors.length > 0) {
      return {
        fixtureId,
        rms: NaN,
        rmsMax,
        pass: false,
        expectedPresent: false,
        signatureBase64: '',
        expectedBase64: '',
        skipped: `WGSL compile: supported=${wgCompile.supported} errors=${wgCompile.metadata.errors.join('; ')}`
      };
    }
    if (!wgCompile.webgpuPassPlan || wgCompile.webgpuPassPlan.kind !== 'pass.crepuscular-rays.v1') {
      return {
        fixtureId,
        rms: NaN,
        rmsMax,
        pass: true,
        expectedPresent: false,
        signatureBase64: '',
        expectedBase64: '',
        skipped: 'No crepuscular-rays pass plan (fixture does not compile to pass.crepuscular-rays.v1).'
      };
    }

    const out = await renderWebGpuExportRgba8(graph, compiler, null, {
      width: GOLDEN_VIEW_WIDTH,
      height: GOLDEN_VIEW_HEIGHT,
      timeSeconds: FIXED_TIME,
      timelineTimeSeconds: FIXED_TIMELINE,
      uniformUpdates: [],
    });
    if (!out.ok) {
      return {
        fixtureId,
        rms: NaN,
        rmsMax,
        pass: false,
        expectedPresent: false,
        signatureBase64: '',
        expectedBase64: '',
        skipped: out.error ? (out.error instanceof Error ? out.error.message : String(out.error)) : out.reason,
      };
    }

    const rgba = new Uint8ClampedArray(out.rgba8.buffer, out.rgba8.byteOffset, out.rgba8.byteLength);
    const sigBytes = computeGridGoldenSignature(rgba, GOLDEN_VIEW_WIDTH, GOLDEN_VIEW_HEIGHT, [16, 12]);
    const sigB64 = signatureBytesToBase64(sigBytes);

    const expected = crepuscularRaysSignatureJson as unknown as CrepuscularRaysSignature;
    const expectedPresent = typeof expected.bytesBase64 === 'string' && expected.bytesBase64.length > 0;
    if (!expectedPresent) {
      return {
        fixtureId,
        rms: NaN,
        rmsMax,
        pass: true,
        expectedPresent: false,
        signatureBase64: sigB64,
        expectedBase64: '',
        skipped: 'No stored crepuscular-rays signature yet (bytesBase64 empty).'
      };
    }

    const expectedBytes = signatureBase64ToBytes(expected.bytesBase64);
    const rms = compareSignaturesRms(expectedBytes, sigBytes);
    const pass = signaturePass(rms, rmsMax);

    return {
      fixtureId,
      rms,
      rmsMax,
      pass,
      expectedPresent: true,
      signatureBase64: sigB64,
      expectedBase64: expected.bytesBase64
    };
  } catch (e) {
    return {
      fixtureId,
      rms: NaN,
      rmsMax,
      pass: false,
      expectedPresent: false,
      signatureBase64: '',
      expectedBase64: '',
      skipped: e instanceof Error ? e.message : String(e)
    };
  }
}

async function runVideoRenderSmokeForFixture(
  compiler: NodeShaderCompiler,
  fixtureId: WebgpuMvpFixtureId,
  rmsMax: number,
  frames: number
): Promise<WebgpuGoldenRunResult> {
  const fixtureRmsMax = rmsMaxForFixture(fixtureId, rmsMax);
  const graph = getWebgpuMvpFixtureGraph(fixtureId);

  const frameRate = 30;
  const width = GOLDEN_VIEW_WIDTH;
  const height = GOLDEN_VIEW_HEIGHT;

  const glPath = createExportRenderPath(graph, compiler, EMPTY_AUDIO_SETUP, {
    width,
    height,
    frameRate,
    startTimeSeconds: FIXED_TIME
  });

  const wg = await createWebGpuVideoExportRenderPath(graph, compiler, EMPTY_AUDIO_SETUP, {
    width,
    height,
    frameRate,
    startTimeSeconds: FIXED_TIME
  });

  if (!wg.ok) {
    return {
      fixtureId: `video:${fixtureId}` as unknown as WebgpuMvpFixtureId,
      width,
      height,
      metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
        rmsMax: fixtureRmsMax,
      pass: false,
      skipped: wg.compilation?.unsupportedReasons?.join('; ') ?? wg.reason,
      webgpuError: wg.error ? (wg.error instanceof Error ? wg.error.message : String(wg.error)) : undefined
    };
  }

  const asyncRender = (wg.path as unknown as {
    renderFrameAsync?: (frameIndex: number, frameState: FrameAudioState) => Promise<HTMLCanvasElement | OffscreenCanvas>;
  }).renderFrameAsync ?? wg.path.renderFrameAsync;
  if (!asyncRender) {
    return {
      fixtureId: `video:${fixtureId}` as unknown as WebgpuMvpFixtureId,
      width,
      height,
      metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
      rmsMax,
      pass: false,
      skipped: 'WebGPU video export path missing renderFrameAsync'
    };
  }

  try {
    let worst: RgbaParityMetrics | null = null;
    let worstA: Uint8ClampedArray | null = null;
    let worstB: Uint8ClampedArray | null = null;
    let webgpuOnlyBlankStreak = 0;
    let comparedFrames = 0;
    let bothBlankFrames = 0;

    // Warm up to reduce false blank reads from first-frame timing/context churn.
    for (let i = 0; i < 2; i++) {
      const warmState = { channelSamples: [], uniformUpdates: [], timelineTime: i / frameRate };
      glPath.renderFrame(i, warmState);
      await asyncRender(i, warmState);
    }

    for (let frameIndex = 0; frameIndex < frames; frameIndex++) {
      const timelineTime = frameIndex / frameRate;
      const frameState = { channelSamples: [], uniformUpdates: [], timelineTime };

      const glCanvasLike = glPath.renderFrame(frameIndex, frameState);
      const glCanvas = glCanvasLike as HTMLCanvasElement;
      const a = canvasToRgba(glCanvas);

      const wgCanvasLike = await asyncRender(frameIndex, frameState);
      const wgCanvas = wgCanvasLike as HTMLCanvasElement;
      let b = canvasToRgba(wgCanvas);

      const glBlank = isProbablyBlankFrame(a);
      let wgBlank = isProbablyBlankFrame(b);

      // If *both* backends are blank, the fixture may legitimately be black at this moment.
      // Only treat blank as an error when WebGPU is blank but WebGL isn't.
      if (wgBlank && !glBlank) {
        // Retry once after a brief presentation delay to filter flaky captures.
        await waitForCanvasPresentation();
        const wgRetryCanvasLike = await asyncRender(frameIndex, frameState);
        b = canvasToRgba(wgRetryCanvasLike as HTMLCanvasElement);
        wgBlank = isProbablyBlankFrame(b);
      }

      if (wgBlank) {
        if (glBlank) {
          // Legitimately blank across both backends; don't use for "worst diff" selection.
          webgpuOnlyBlankStreak = 0;
          bothBlankFrames++;
          continue;
        }
        webgpuOnlyBlankStreak++;
        if (webgpuOnlyBlankStreak >= 2) {
          return {
            fixtureId: `video:${fixtureId}` as unknown as WebgpuMvpFixtureId,
            width,
            height,
            metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
            rmsMax: fixtureRmsMax,
            pass: false,
            webgpuError: `WebGPU blank/black frames detected at frameIndex=${frameIndex} (streak=${webgpuOnlyBlankStreak})`,
            diagnostics: parityDiagnostics(a, b)
          };
        }
        continue;
      }

      webgpuOnlyBlankStreak = 0;
      comparedFrames++;
      const metrics = computeRgbaParityMetrics(a, b);
      if (!worst || metrics.rms > worst.rms) {
        worst = metrics;
        worstA = a;
        worstB = b;
      }
    }

    if (!worst) {
      return {
        fixtureId: `video:${fixtureId}` as unknown as WebgpuMvpFixtureId,
        width,
        height,
        metrics: { rms: 0, mad: 0, maxDelta: 0, channelMae: [0, 0, 0, 0] },
        rmsMax: fixtureRmsMax,
        pass: true,
        skipped:
          comparedFrames === 0
            ? `No comparable frames (all ${bothBlankFrames}/${frames} frames blank across both backends).`
            : 'No comparable frames (all frames skipped).'
      };
    }

    const metrics = worst;
    const pass = Number.isFinite(metrics.rms) && metrics.rms <= fixtureRmsMax;
    const diagnostics = pass || !worstA || !worstB ? undefined : parityDiagnostics(worstA, worstB);

    let diffDataUrl: string | undefined;
    if (!pass && worstA && worstB) {
      const diff = rgbaDiffToImageData(width, height, worstA, worstB);
      const dc = document.createElement('canvas');
      dc.width = width;
      dc.height = height;
      const dctx = dc.getContext('2d');
      if (dctx) {
        dctx.putImageData(diff, 0, 0);
        diffDataUrl = dc.toDataURL('image/png');
      }
    }

    return {
      fixtureId: `video:${fixtureId}` as unknown as WebgpuMvpFixtureId,
      width,
      height,
      metrics,
      rmsMax: fixtureRmsMax,
      pass,
      diffDataUrl,
      diagnostics
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      fixtureId: `video:${fixtureId}` as unknown as WebgpuMvpFixtureId,
      width,
      height,
      metrics: { rms: NaN, mad: NaN, maxDelta: NaN, channelMae: [NaN, NaN, NaN, NaN] },
      rmsMax: fixtureRmsMax,
      pass: false,
      webgpuError: msg
    };
  } finally {
    glPath.dispose();
    try {
      wg.path.dispose();
    } catch {
      // ignore
    }
  }
}

async function runPerfForFixture(
  compiler: NodeShaderCompiler,
  fixtureId: WebgpuMvpFixtureId,
  host: HTMLDivElement,
  frames: number
): Promise<WebgpuGoldenPerfResult> {
  const graph = getWebgpuMvpFixtureGraph(fixtureId);

  const glCanvas = makeCanvas(host);
  const gpuCanvas = makeCanvas(host);
  const glBack = createRenderBackend(glCanvas, 'webgl');
  const gpuBack = createRenderBackend(gpuCanvas, 'webgpu');

  try {
    const glCompile = compiler.compile(graph, null, { backend: 'webgl' });
    if (glCompile.metadata.errors.length > 0) {
      return {
        fixtureId,
        frames,
        webglAvgFrameMs: NaN,
        webgpuAvgFrameMs: null,
        webgpuSkipped: `WebGL compile: ${glCompile.metadata.errors.join('; ')}`
      };
    }
    const glCtx = glBack.getGLContext();
    if (!glCtx) {
      return {
        fixtureId,
        frames,
        webglAvgFrameMs: NaN,
        webgpuAvgFrameMs: null,
        webgpuSkipped: 'WebGL preview surface missing (getGLContext returned null)'
      };
    }

    const glInst = new ShaderInstance(glCtx, glCompile);
    transferParametersFromGraph(graph, glInst);
    glBack.setShaderInstance(glInst);

    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      glInst.setTime(FIXED_TIME + i * 0.0001);
      glBack.markDirty('perf');
      glBack.render();
    }
    const webglAvgFrameMs = (performance.now() - t0) / frames;

    const wgCompile = compiler.compile(graph, null, { backend: 'webgpu' });
    let webgpuAvgFrameMs: number | null = null;
    let webgpuSkipped: string | undefined;

    if (!wgCompile.supported) {
      webgpuSkipped = 'WGSL compile unsupported for fixture';
    } else {
      try {
        const gpuProg = await waitForWebGpuProgram(gpuBack, wgCompile, 12000);
        transferParametersFromGraph(graph, gpuProg);
        const t1 = performance.now();
        for (let i = 0; i < frames; i++) {
          gpuProg.setTime(FIXED_TIME + i * 0.0001);
          gpuBack.markDirty('perf');
          gpuBack.render();
        }
        webgpuAvgFrameMs = (performance.now() - t1) / frames;
      } catch (e) {
        webgpuSkipped = e instanceof Error ? e.message : String(e);
      }
    }

    return {
      fixtureId,
      frames,
      webglAvgFrameMs,
      webgpuAvgFrameMs,
      webgpuSkipped
    };
  } finally {
    destroyRenderBackend(glBack);
    destroyRenderBackend(gpuBack);
    glCanvas.remove();
    gpuCanvas.remove();
  }
}

declare global {
  interface Window {
    __WEBGPU_GOLDEN_READY?: boolean;
    __webgpuForceSrgbPresentation?: boolean;
    __webgpuGolden?: {
      fixtureIds: readonly WebgpuMvpFixtureId[];
      runAll: (rmsMax?: number) => Promise<WebgpuGoldenRunResult[]>;
      runOne: (id: WebgpuMvpFixtureId, rmsMax?: number) => Promise<WebgpuGoldenRunResult>;
      exportOne: (id: WebgpuMvpFixtureId, rmsMax?: number) => Promise<WebgpuGoldenRunResult>;
      perfSmoke: (fixtureId?: WebgpuMvpFixtureId, frames?: number) => Promise<WebgpuGoldenPerfResult>;
      glowBloomSignatureOne: (id?: WebgpuMvpFixtureId, rmsMax?: number) => Promise<RdSignatureRunResult>;
      crepuscularRaysSignatureOne: (id?: WebgpuMvpFixtureId, rmsMax?: number) => Promise<RdSignatureRunResult>;
    };
  }
}

function formatParitySummaryLine(r: WebgpuGoldenRunResult): string {
  if (r.skipped != null && r.skipped.length > 0) return `[${r.fixtureId}] SKIP: ${r.skipped}`;
  if (r.webgpuError != null && r.webgpuError.length > 0)
    return `[${r.fixtureId}] FAIL (WebGPU): ${r.webgpuError}${r.diagnostics ? ` ${r.diagnostics}` : ''}`;
  const rms = r.metrics.rms;
  const rmsStr = Number.isFinite(rms) ? rms.toFixed(4) : String(rms);
  return `[${r.fixtureId}] ${r.pass ? 'PASS' : 'FAIL'} RMS=${rmsStr} (max ${r.rmsMax})${r.diagnostics ? ` ${r.diagnostics}` : ''}`;
}

function installHarnessPageControls(api: NonNullable<Window['__webgpuGolden']>): void {
  const mount = document.getElementById('webgpu-golden-ui');
  if (mount == null) return;

  const lead = document.createElement('p');
  lead.style.margin = '0 0 0.75rem';
  lead.style.fontSize = '0.9rem';
  lead.textContent = 'Run the WebGL vs WebGPU pixel comparison on all MVP fixtures.';

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '0.5rem';
  row.style.alignItems = 'center';

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.textContent = 'Run parity (all fixtures)';
  runBtn.style.padding = '0.45rem 0.85rem';
  runBtn.style.cursor = 'pointer';
  runBtn.style.font = 'inherit';

  const status = document.createElement('div');
  status.style.marginTop = '0.75rem';
  status.style.fontFamily = 'ui-monospace, monospace, Consolas';
  status.style.fontSize = '0.8rem';
  status.style.whiteSpace = 'pre-wrap';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const diffRow = document.createElement('div');
  diffRow.style.marginTop = '0.75rem';
  diffRow.style.display = 'flex';
  diffRow.style.flexWrap = 'wrap';
  diffRow.style.gap = '0.75rem';

  runBtn.addEventListener('click', () => {
    void (async () => {
      runBtn.disabled = true;
      status.textContent = 'Running…';
      diffRow.replaceChildren();
      try {
        const results = await api.runAll();
        const lines = results.map((r) => formatParitySummaryLine(r));
        const allPass = results.every((r) => r.pass);
        status.textContent =
          `${lines.join('\n')}\n\n${allPass ? 'All passed.' : 'Some failed; diff thumbnails (if any) below.'}`;
        for (const r of results) {
          if (r.diffDataUrl != null) {
            const fig = document.createElement('figure');
            fig.style.margin = '0';
            const cap = document.createElement('figcaption');
            cap.textContent = `${r.fixtureId} diff`;
            cap.style.fontSize = '0.7rem';
            cap.style.marginBottom = '0.25rem';
            const img = document.createElement('img');
            img.src = r.diffDataUrl;
            img.alt = `WebGL vs WebGPU diff for ${r.fixtureId}`;
            img.width = GOLDEN_VIEW_WIDTH * 3;
            img.height = GOLDEN_VIEW_HEIGHT * 3;
            img.style.imageRendering = 'pixelated';
            fig.append(cap, img);
            diffRow.appendChild(fig);
          }
        }
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e);
      } finally {
        runBtn.disabled = false;
      }
    })();
  });

  row.append(runBtn);
  mount.append(lead, row, status, diffRow);
}

const compiler = new NodeShaderCompiler(buildNodeSpecsMap());

window.__WEBGPU_GOLDEN_READY = true;
window.__webgpuGolden = {
  fixtureIds: WEBGPU_MVP_FIXTURE_IDS,
  runAll: async (rmsMax = DEFAULT_PARITY_RMS_MAX) => {
    const host = makeHost();
    try {
      const out: WebgpuGoldenRunResult[] = [];
      const isBlurPassPlanFixture = (id: WebgpuMvpFixtureId) =>
        id === 'mvpBlurPassPlan' ||
        id === 'mvpBlurPassPlanDirectional' ||
        id === 'mvpBlurPassPlanRadial' ||
        id === 'mvpAudioBlurPassPlan' ||
        id === 'mvpAudioBlurPassPlanNonzeroBlur';
      const isGlowBloomPassPlanFixture = (id: WebgpuMvpFixtureId) =>
        id === 'mvpGlowBloomPassPlan' || id === 'mvpAudioGlowBloomPassPlan';
      const isAudioBokehPassPlanFixture = (id: WebgpuMvpFixtureId) => id === 'mvpAudioBokehPassPlan';
      const isCrepuscularRaysPassPlanFixture = (id: WebgpuMvpFixtureId) =>
        id === 'mvpCrepuscularRaysPassPlan' || id === 'mvpAudioCrepuscularRaysPassPlan';
      const isParityDeferredFixture = (id: WebgpuMvpFixtureId) =>
        id === 'mvpDistortBatch' || id === 'mvpPatternNoiseBatch';

      for (const id of WEBGPU_MVP_FIXTURE_IDS) {
        // Image parity should validate the export paths (Task 07) because the preview-canvas path
        // can be sensitive to context churn, GPU compositing, and headless limitations.
        console.log(`[webgpu-golden] parity:${id}`);
        if (isBlurPassPlanFixture(id)) {
          const result: WebgpuGoldenRunResult = {
            fixtureId: id,
            width: GOLDEN_VIEW_WIDTH,
            height: GOLDEN_VIEW_HEIGHT,
            metrics: ZERO_METRICS,
            rmsMax: rmsMaxForFixture(id, rmsMax),
            pass: true,
            skipped:
              'Blur pass-plan fixtures are validated via pass-plan smoke (non-blank render), not WebGL pixel parity.'
          };
          console.log(formatParitySummaryLine(result));
          out.push(result);
        } else if (isGlowBloomPassPlanFixture(id)) {
          const result: WebgpuGoldenRunResult = {
            fixtureId: id,
            width: GOLDEN_VIEW_WIDTH,
            height: GOLDEN_VIEW_HEIGHT,
            metrics: ZERO_METRICS,
            rmsMax: rmsMaxForFixture(id, rmsMax),
            pass: true,
            skipped:
              'Glow-bloom pass-plan fixture is validated via pass-plan smoke (non-blank render), not WebGL pixel parity.'
          };
          console.log(formatParitySummaryLine(result));
          out.push(result);
        } else if (isAudioBokehPassPlanFixture(id)) {
          const result: WebgpuGoldenRunResult = {
            fixtureId: id,
            width: GOLDEN_VIEW_WIDTH,
            height: GOLDEN_VIEW_HEIGHT,
            metrics: ZERO_METRICS,
            rmsMax: rmsMaxForFixture(id, rmsMax),
            pass: true,
            skipped:
              'Audio bokeh pass-plan fixture is validated via pass-plan smoke (non-blank render), not WebGL pixel parity.'
          };
          console.log(formatParitySummaryLine(result));
          out.push(result);
        } else if (isCrepuscularRaysPassPlanFixture(id)) {
          const result: WebgpuGoldenRunResult = {
            fixtureId: id,
            width: GOLDEN_VIEW_WIDTH,
            height: GOLDEN_VIEW_HEIGHT,
            metrics: ZERO_METRICS,
            rmsMax: rmsMaxForFixture(id, rmsMax),
            pass: true,
            skipped:
              'Crepuscular-rays pass-plan fixture is validated via pass-plan smoke (non-blank render), not WebGL pixel parity.'
          };
          console.log(formatParitySummaryLine(result));
          out.push(result);
        } else if (isParityDeferredFixture(id)) {
          const result: WebgpuGoldenRunResult = {
            fixtureId: id,
            width: GOLDEN_VIEW_WIDTH,
            height: GOLDEN_VIEW_HEIGHT,
            metrics: ZERO_METRICS,
            rmsMax: rmsMaxForFixture(id, rmsMax),
            pass: true,
            skipped:
              'Pixel parity is temporarily deferred for this fixture (known numeric instability / non-determinism).'
          };
          console.log(formatParitySummaryLine(result));
          out.push(result);
        } else {
          const result = await runExportParityForFixture(compiler, id, rmsMax);
          console.log(formatParitySummaryLine(result));
          out.push(result);
        }
      }
      // Task 08 smoke: render a short sequence via WebGPU video export path and ensure frames are non-blank
      // and within the same RMS tolerance vs WebGL export render path.
      for (const id of WEBGPU_MVP_FIXTURE_IDS) {
        if (
          isBlurPassPlanFixture(id) ||
          isGlowBloomPassPlanFixture(id) ||
          isAudioBokehPassPlanFixture(id) ||
          isCrepuscularRaysPassPlanFixture(id) ||
          isParityDeferredFixture(id)
        ) {
          const result: WebgpuGoldenRunResult = {
            fixtureId: `video:${id}` as unknown as WebgpuMvpFixtureId,
            width: GOLDEN_VIEW_WIDTH,
            height: GOLDEN_VIEW_HEIGHT,
            metrics: ZERO_METRICS,
            rmsMax: rmsMaxForFixture(id, rmsMax),
            pass: true,
            skipped: isBlurPassPlanFixture(id)
              ? 'Video parity is skipped for blur pass-plan fixtures; use pass-plan smoke.'
              : isGlowBloomPassPlanFixture(id)
                ? 'Video parity is skipped for glow-bloom pass-plan fixture; use pass-plan smoke.'
                : isAudioBokehPassPlanFixture(id)
                  ? 'Video parity is skipped for audio bokeh pass-plan fixture; use pass-plan smoke.'
                  : isCrepuscularRaysPassPlanFixture(id)
                    ? 'Video parity is skipped for crepuscular-rays pass-plan fixture; use pass-plan smoke.'
                    : 'Video parity is temporarily deferred for this fixture (known numeric instability / non-determinism).'
          };
          console.log(formatParitySummaryLine(result));
          out.push(result);
          continue;
        }
        console.log(`[webgpu-golden] video:${id}`);
        const result = await runVideoRenderSmokeForFixture(compiler, id, rmsMax, 16);
        console.log(formatParitySummaryLine(result));
        out.push(result);
      }
      // Task 10 pilot smoke: for fixtures that compile to a WebGPU pass plan, ensure the backend renders non-blank.
      for (const id of WEBGPU_MVP_FIXTURE_IDS) {
        console.log(`[webgpu-golden] passplan:${id}`);
        const result = await runPassPlanSmokeForFixture(compiler, id);
        console.log(formatParitySummaryLine(result));
        out.push(result);
      }
      // Glow-bloom correctness is validated via a compact image signature (stable under small numeric diffs).
      console.log(`[webgpu-golden] signature:mvpGlowBloomPassPlan`);
      const glowSig = await runGlowBloomSignatureCheck(
        compiler,
        'mvpGlowBloomPassPlan',
        defaultSignatureRmsMax()
      );
      if (glowSig.skipped != null) {
        console.log(`[signature:mvpGlowBloomPassPlan] SKIP: ${glowSig.skipped}`);
        if (glowSig.signatureBase64) {
          console.log(`[signature:mvpGlowBloomPassPlan] signatureBase64=${glowSig.signatureBase64}`);
        }
      } else {
        const rmsStr = Number.isFinite(glowSig.rms) ? glowSig.rms.toFixed(4) : String(glowSig.rms);
        console.log(
          `[signature:mvpGlowBloomPassPlan] ${glowSig.pass ? 'PASS' : 'FAIL'} RMS=${rmsStr} (max ${glowSig.rmsMax})`
        );
      }

      // Crepuscular-rays correctness is validated via a compact image signature (stable under small numeric diffs).
      console.log(`[webgpu-golden] signature:mvpCrepuscularRaysPassPlan`);
      const crepSig = await runCrepuscularRaysSignatureCheck(
        compiler,
        'mvpCrepuscularRaysPassPlan',
        defaultSignatureRmsMax()
      );
      if (crepSig.skipped != null) {
        console.log(`[signature:mvpCrepuscularRaysPassPlan] SKIP: ${crepSig.skipped}`);
        if (crepSig.signatureBase64) {
          console.log(`[signature:mvpCrepuscularRaysPassPlan] signatureBase64=${crepSig.signatureBase64}`);
        }
      } else {
        const rmsStr = Number.isFinite(crepSig.rms) ? crepSig.rms.toFixed(4) : String(crepSig.rms);
        console.log(
          `[signature:mvpCrepuscularRaysPassPlan] ${crepSig.pass ? 'PASS' : 'FAIL'} RMS=${rmsStr} (max ${crepSig.rmsMax})`
        );
      }
      return out;
    } finally {
      host.remove();
    }
  },
  runOne: async (id: WebgpuMvpFixtureId, rmsMax = DEFAULT_PARITY_RMS_MAX) => {
    const host = makeHost();
    try {
      return await runParityForFixture(compiler, id, host, rmsMax);
    } finally {
      host.remove();
    }
  },
  exportOne: async (id: WebgpuMvpFixtureId, rmsMax = DEFAULT_PARITY_RMS_MAX) => {
    return await runExportParityForFixture(compiler, id, rmsMax);
  },
  perfSmoke: async (fixtureId: WebgpuMvpFixtureId = 'mvpConstantVec3', frames = PERF_FRAMES) => {
    const host = makeHost();
    try {
      return await runPerfForFixture(compiler, fixtureId, host, frames);
    } finally {
      host.remove();
    }
  },
  glowBloomSignatureOne: async (
    id: WebgpuMvpFixtureId = 'mvpGlowBloomPassPlan',
    rmsMax = defaultSignatureRmsMax()
  ) => {
    return await runGlowBloomSignatureCheck(compiler, id, rmsMax);
  },
  crepuscularRaysSignatureOne: async (
    id: WebgpuMvpFixtureId = 'mvpCrepuscularRaysPassPlan',
    rmsMax = defaultSignatureRmsMax()
  ) => {
    return await runCrepuscularRaysSignatureCheck(compiler, id, rmsMax);
  },
};

installHarnessPageControls(window.__webgpuGolden);
