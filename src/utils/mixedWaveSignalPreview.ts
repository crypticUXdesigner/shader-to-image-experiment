/**
 * CPU-side preview of mixed-wave-signal output for parameter UI live values.
 * Must stay in sync with `mwsMixedWaveShape` + mainCode in `mixed-wave-signal.ts`
 * and with App.svelte uTime: `(performance.now() / 1000) % 1000`.
 */

import type { NodeInstance } from '../data-model/types';
import { mixedWaveSignalNodeSpec } from '../shaders/nodes/mixed-wave-signal';
import {
  resolveMixedWaveNumericParams,
  type MixedWavePreviewResolutionContext,
} from './mixedWaveEffectiveParams';

export type { MixedWavePreviewResolutionContext };

const TAU = 6.28318530718;

function glslFract(x: number): number {
  return x - Math.floor(x);
}

export function mwsMixedWaveShapeJs(p: number, shape: number): number {
  const twoPi = TAU;
  const pi = 3.14159265359;
  if (shape === 0) return Math.sin(p);
  if (shape === 1) return Math.cos(p);
  if (shape === 2) return Math.sign(Math.sin(p));
  if (shape === 3) return Math.asin(Math.sin(p)) * (2.0 / pi);
  if (shape === 4) return 2.0 * glslFract(p / twoPi) - 1.0;
  if (shape === 5) return 1.0 - 2.0 * glslFract(p / twoPi);
  if (shape === 6) return 2.0 * Math.abs(Math.sin(p)) - 1.0;
  if (shape === 7) {
    const x = Math.sin(p);
    const edge0 = -0.999;
    const edge1 = 0.999;
    const denom = edge1 - edge0;
    const t = denom !== 0 ? Math.max(0, Math.min(1, (x - edge0) / denom)) : 0;
    const s = t * t * (3.0 - 2.0 * t);
    return s * 2.0 - 1.0;
  }
  return Math.sin(p);
}

type ResolvedScalars = ReturnType<typeof resolveMixedWaveNumericParams>;

function paramNum(
  node: NodeInstance,
  key: string,
  fallback: number,
  resolved: ResolvedScalars | null
): number {
  if (resolved && Object.prototype.hasOwnProperty.call(resolved, key)) {
    const r = resolved[key];
    if (typeof r === 'number' && !isNaN(r) && isFinite(r)) return r;
  }
  const spec = mixedWaveSignalNodeSpec.parameters[key];
  const def = typeof spec?.default === 'number' ? spec.default : fallback;
  const v = node.parameters[key];
  return typeof v === 'number' && !isNaN(v) ? v : def;
}

function paramShape(node: NodeInstance, key: string, resolved: ResolvedScalars | null): number {
  if (resolved && Object.prototype.hasOwnProperty.call(resolved, key)) {
    const r = resolved[key];
    if (typeof r === 'number' && !isNaN(r) && isFinite(r)) {
      return Math.max(0, Math.min(7, Math.round(r)));
    }
  }
  const spec = mixedWaveSignalNodeSpec.parameters[key];
  const def = typeof spec?.default === 'number' ? Math.round(spec.default) : 0;
  const v = node.parameters[key];
  const r = typeof v === 'number' && !isNaN(v) ? Math.round(v) : def;
  return Math.max(0, Math.min(7, r));
}

function clamp01(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function phase01FromP(p: number): number {
  return clamp01(glslFract(p / TAU));
}

/**
 * Same time base as shader uTime (see App.svelte animation loop).
 */
export function getShaderTimeSeconds(): number {
  return (performance.now() / 1000) % 1000.0;
}

export interface MixedWavePhaseValue {
  /** Normalized phase \(0..1\) over one cycle. */
  phase01: number;
  /** Signal value \(typically -1..1\). */
  value: number;
}

export function evaluateMixedWaveSignalWaveRaw(
  node: NodeInstance,
  waveIndex: 0 | 1 | 2,
  tSec: number = getShaderTimeSeconds(),
  ctx?: MixedWavePreviewResolutionContext
): MixedWavePhaseValue {
  const resolved = ctx ? resolveMixedWaveNumericParams(node, ctx) : null;
  const globalSpeed = paramNum(node, 'globalSpeed', 1, resolved);
  const globalOffset = paramNum(node, 'globalOffset', 0, resolved);
  const tBase = tSec * globalSpeed + globalOffset;

  const speedKey = waveIndex === 0 ? 'w0Speed' : waveIndex === 1 ? 'w1Speed' : 'w2Speed';
  const offsetKey = waveIndex === 0 ? 'w0Offset' : waveIndex === 1 ? 'w1Offset' : 'w2Offset';
  const shapeKey = waveIndex === 0 ? 'w0Shape' : waveIndex === 1 ? 'w1Shape' : 'w2Shape';

  const speedFallback = waveIndex === 0 ? 1 : waveIndex === 1 ? 0.73 : 1.31;
  const offsetFallback = waveIndex === 0 ? 0 : waveIndex === 1 ? 2.17 : 4.03;
  const p = tBase * paramNum(node, speedKey, speedFallback, resolved) + paramNum(node, offsetKey, offsetFallback, resolved);
  const v = mwsMixedWaveShapeJs(p, paramShape(node, shapeKey, resolved));
  return { phase01: phase01FromP(p), value: v };
}

export function evaluateMixedWaveSignalCombinedRaw(
  node: NodeInstance,
  tSec: number = getShaderTimeSeconds(),
  ctx?: MixedWavePreviewResolutionContext
): MixedWavePhaseValue {
  const resolved = ctx ? resolveMixedWaveNumericParams(node, ctx) : null;
  const globalSpeed = paramNum(node, 'globalSpeed', 1, resolved);
  const globalOffset = paramNum(node, 'globalOffset', 0, resolved);
  const tBase = tSec * globalSpeed + globalOffset;

  const p0 = tBase * paramNum(node, 'w0Speed', 1, resolved) + paramNum(node, 'w0Offset', 0, resolved);
  const p1 = tBase * paramNum(node, 'w1Speed', 0.73, resolved) + paramNum(node, 'w1Offset', 2.17, resolved);
  const p2 = tBase * paramNum(node, 'w2Speed', 1.31, resolved) + paramNum(node, 'w2Offset', 4.03, resolved);

  const s0 = mwsMixedWaveShapeJs(p0, paramShape(node, 'w0Shape', resolved));
  const s1 = mwsMixedWaveShapeJs(p1, paramShape(node, 'w1Shape', resolved));
  const s2 = mwsMixedWaveShapeJs(p2, paramShape(node, 'w2Shape', resolved));

  const w0 = paramNum(node, 'w0Weight', 1, resolved);
  const w1 = paramNum(node, 'w1Weight', 1, resolved);
  const w2 = paramNum(node, 'w2Weight', 1, resolved);
  const wsum = w0 + w1 + w2 + 1e-6;
  const combinedRaw = (w0 * s0 + w1 * s1 + w2 * s2) / wsum;

  return { phase01: phase01FromP(tBase), value: combinedRaw };
}

/** Output remap range for UI (e.g. header viz maps value along min→max horizontally). */
export function mixedWaveOutputRange(
  node: NodeInstance,
  ctx?: MixedWavePreviewResolutionContext,
  /** When the caller already ran {@link resolveMixedWaveNumericParams}, pass it to avoid a second resolve. */
  alreadyResolved?: ResolvedScalars | null
): { outMin: number; outMax: number } {
  const resolved =
    alreadyResolved !== undefined
      ? alreadyResolved
      : ctx
        ? resolveMixedWaveNumericParams(node, ctx)
        : null;
  return {
    outMin: paramNum(node, 'outMin', -1, resolved),
    outMax: paramNum(node, 'outMax', 1, resolved),
  };
}

export function evaluateMixedWaveSignalPreview(
  node: NodeInstance,
  ctx?: MixedWavePreviewResolutionContext
): number {
  const resolved = ctx ? resolveMixedWaveNumericParams(node, ctx) : null;
  const tSec = getShaderTimeSeconds();
  const globalSpeed = paramNum(node, 'globalSpeed', 1, resolved);
  const globalOffset = paramNum(node, 'globalOffset', 0, resolved);
  const tBase = tSec * globalSpeed + globalOffset;

  const p0 = tBase * paramNum(node, 'w0Speed', 1, resolved) + paramNum(node, 'w0Offset', 0, resolved);
  const p1 = tBase * paramNum(node, 'w1Speed', 0.73, resolved) + paramNum(node, 'w1Offset', 2.17, resolved);
  const p2 = tBase * paramNum(node, 'w2Speed', 1.31, resolved) + paramNum(node, 'w2Offset', 4.03, resolved);

  const s0 = mwsMixedWaveShapeJs(p0, paramShape(node, 'w0Shape', resolved));
  const s1 = mwsMixedWaveShapeJs(p1, paramShape(node, 'w1Shape', resolved));
  const s2 = mwsMixedWaveShapeJs(p2, paramShape(node, 'w2Shape', resolved));

  const w0 = paramNum(node, 'w0Weight', 1, resolved);
  const w1 = paramNum(node, 'w1Weight', 1, resolved);
  const w2 = paramNum(node, 'w2Weight', 1, resolved);
  const wsum = w0 + w1 + w2 + 1e-6;
  const combined = (w0 * s0 + w1 * s1 + w2 * s2) / wsum;
  const u = combined * 0.5 + 0.5;
  const { outMin, outMax } = mixedWaveOutputRange(node, ctx, resolved);
  return outMin + u * (outMax - outMin);
}
