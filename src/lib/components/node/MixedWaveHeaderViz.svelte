<script lang="ts">
  import type { NodeGraph, NodeInstance } from '../../../data-model/types';
  import type { NodeSpec } from '../../../types/nodeSpec';
  import type { IAudioManager } from '../../../runtime/types';
  import {
    evaluateMixedWaveSignalPreview,
    evaluateMixedWaveSignalWaveRaw,
    getShaderTimeSeconds,
    mixedWaveOutputRange,
    type MixedWavePreviewResolutionContext,
  } from '../../../utils/mixedWaveSignalPreview';

  type VizKind = 'combined' | 'wave';

  interface MixedWaveHeaderPreviewContext {
    graph: NodeGraph;
    nodeSpecs: Map<string, NodeSpec>;
    getAudioManager?: () => IAudioManager | null;
    getTimelineCurrentTime?: () => number;
  }

  interface Props {
    node: NodeInstance;
    kind: VizKind;
    waveIndex?: 0 | 1 | 2;
    width?: number;
    height?: number;
    /** When set, weights/speeds match the compiled shader (param ports, modes, live audio). */
    previewContext?: MixedWaveHeaderPreviewContext | null;
  }

  let {
    node,
    kind,
    waveIndex = 0,
    width = 84,
    height = 22,
    previewContext = null,
  }: Props = $props();

  function resolutionCtx(): MixedWavePreviewResolutionContext | undefined {
    if (!previewContext) return undefined;
    return {
      graph: previewContext.graph,
      nodeSpecs: previewContext.nodeSpecs,
      audioManager: previewContext.getAudioManager?.() ?? undefined,
      getTimelineCurrentTime: previewContext.getTimelineCurrentTime,
    };
  }

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let rafId: number | null = null;

  function prefersReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }

  function clamp01(x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x;
  }

  /** Map scalar `v` from [vmin, vmax] to pixel x in [0, w-1]. */
  function valueToX(v: number, vmin: number, vmax: number, w: number): number {
    if (w <= 1) return 0;
    const span = vmax - vmin;
    if (!Number.isFinite(span) || Math.abs(span) < 1e-12) {
      return (w - 1) * 0.5;
    }
    const lo = Math.min(vmin, vmax);
    const hi = Math.max(vmin, vmax);
    const vc = Math.min(hi, Math.max(lo, v));
    const t = (vc - lo) / (hi - lo);
    return clamp01(t) * (w - 1);
  }

  function draw(): void {
    const canvas = canvasEl;
    if (!canvas) return;

    const dpr = window.devicePixelRatio ?? 1;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const style = getComputedStyle(canvas);
    const bg = style.getPropertyValue('--mws-viz-bg').trim() || 'rgba(0,0,0,0.45)';
    const track = style.getPropertyValue('--mws-viz-track').trim() || 'rgba(255,255,255,0.14)';
    const dot = style.getPropertyValue('--mws-viz-dot').trim() || '#b7fffb';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const yMid = h * 0.5;
    ctx.strokeStyle = track;
    ctx.lineWidth = Math.max(1, Math.round(dpr));
    ctx.lineCap = 'round';
    const inset = Math.max(2 * dpr, 3);
    ctx.beginPath();
    ctx.moveTo(inset, Math.round(yMid) + 0.5);
    ctx.lineTo(w - inset, Math.round(yMid) + 0.5);
    ctx.stroke();

    const previewResCtx = resolutionCtx();
    const { outMin, outMax } = mixedWaveOutputRange(node, previewResCtx);
    let vx: number;
    if (kind === 'wave') {
      const { value } = evaluateMixedWaveSignalWaveRaw(node, waveIndex, getShaderTimeSeconds(), previewResCtx);
      const u = value * 0.5 + 0.5;
      const vRemapped = outMin + u * (outMax - outMin);
      vx = valueToX(vRemapped, outMin, outMax, w);
    } else {
      const v = evaluateMixedWaveSignalPreview(node, previewResCtx);
      vx = valueToX(v, outMin, outMax, w);
    }

    const cy = Math.round(yMid) + 0.5;
    // Logical ~5.5px radius so the marker reads clearly on the compact strip.
    const dotR = Math.max(5.25 * dpr, 7);

    ctx.beginPath();
    ctx.arc(vx, cy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.fill();
  }

  function stop(): void {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function loop(): void {
    draw();
    rafId = requestAnimationFrame(loop);
  }

  $effect(() => {
    stop();
    if (!canvasEl) return;

    // Touch reactive deps so redraw tracks node + kind (evaluate* reads node.parameters).
    void kind;
    void waveIndex;
    void node.parameters;
    void previewContext?.graph;
    void previewContext?.nodeSpecs;

    draw();
    if (prefersReducedMotion()) return;

    rafId = requestAnimationFrame(loop);
    return () => stop();
  });
</script>

<canvas
  bind:this={canvasEl}
  class="mws-header-viz"
  style="width: {width}px; height: {height}px;"
  aria-hidden="true"
></canvas>

<style>
  .mws-header-viz {
    --mws-viz-bg: color-mix(in oklab, var(--color-gray-10) 35%, transparent);
    --mws-viz-track: color-mix(in oklab, var(--color-gray-95) 22%, transparent);
    --mws-viz-dot: var(--color-teal-100);

    display: block;
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .mws-header-viz {
      transition: none;
    }
  }
</style>
