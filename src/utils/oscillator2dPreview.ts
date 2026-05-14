/**
 * CPU-side preview of oscillator-2d X/Y outputs for parameter UI live values.
 * Must stay in sync with `functions` + `mainCode` in `shaders/nodes/oscillator-2d.ts`
 * and with shader time via {@link getShaderTimeSeconds} (same base as `mixed-wave-signal` preview).
 */

import type { NodeInstance } from '../data-model/types';
import { oscillator2dNodeSpec } from '../shaders/nodes/oscillator-2d';
import { getShaderTimeSeconds } from './mixedWaveSignalPreview';

function paramNum(node: NodeInstance, key: string, fallback: number): number {
  const spec = oscillator2dNodeSpec.parameters[key];
  const def = typeof spec?.default === 'number' ? spec.default : fallback;
  const v = node.parameters[key];
  return typeof v === 'number' && !isNaN(v) ? v : def;
}

function paramInt(node: NodeInstance, key: string, fallback: number): number {
  const spec = oscillator2dNodeSpec.parameters[key];
  const def = typeof spec?.default === 'number' ? Math.round(spec.default) : fallback;
  const v = node.parameters[key];
  const r = typeof v === 'number' && !isNaN(v) ? Math.round(v) : def;
  if (spec?.type === 'int' && typeof spec.min === 'number' && typeof spec.max === 'number') {
    return Math.max(spec.min, Math.min(spec.max, r));
  }
  return r;
}

function osc2dOnf(on: number): number {
  return on >= 0.5 ? 1.0 : 0.0;
}

/** Mirrors GLSL `osc2d_combine_axis` in oscillator-2d.ts */
function osc2dCombineAxis(
  mode: number,
  on1: number,
  amp1: number,
  s1: number,
  on2: number,
  amp2: number,
  s2: number,
  on3: number,
  amp3: number,
  s3: number
): number {
  const o1 = osc2dOnf(on1);
  const o2 = osc2dOnf(on2);
  const o3 = osc2dOnf(on3);
  const t1 = amp1 * s1;
  const t2 = amp2 * s2;
  const t3 = amp3 * s3;
  const c1 = o1 * t1;
  const c2 = o2 * t2;
  const c3 = o3 * t3;

  if (mode === 0) {
    return c1 + c2 + c3;
  }
  if (mode === 1) {
    const eps = 1e-6;
    const w = Math.abs(amp1) * o1 + Math.abs(amp2) * o2 + Math.abs(amp3) * o3 + eps;
    return (c1 + c2 + c3) / Math.max(w, eps);
  }
  if (mode === 2) {
    const p1 = (1 - o1) + o1 * t1;
    const p2 = (1 - o2) + o2 * t2;
    const p3 = (1 - o3) + o3 * t3;
    const prod = p1 * p2 * p3;
    const anyOn = Math.max(Math.max(o1, o2), o3);
    return anyOn >= 0.25 ? prod : 0.0;
  }
  let bestMag = -1.0;
  let bestVal = 0.0;
  if (o1 > 0.5) {
    const m = Math.abs(t1);
    if (m > bestMag) {
      bestMag = m;
      bestVal = t1;
    }
  }
  if (o2 > 0.5) {
    const m = Math.abs(t2);
    if (m > bestMag) {
      bestMag = m;
      bestVal = t2;
    }
  }
  if (o3 > 0.5) {
    const m = Math.abs(t3);
    if (m > bestMag) {
      bestMag = m;
      bestVal = t3;
    }
  }
  return bestVal;
}

export function evaluateOscillator2dPortPreview(node: NodeInstance, port: 'x' | 'y'): number {
  const tau = 6.283185307179586;
  const tSec = getShaderTimeSeconds();
  const osc2dT = tSec * paramNum(node, 'globalSpeed', 1) + paramNum(node, 'globalOffset', 0);

  const layerCombine = Math.max(0, Math.min(3, paramInt(node, 'layerCombine', 0)));

  const sx1 = Math.sin(osc2dT * tau * paramNum(node, 'x1Freq', 1) + paramNum(node, 'x1Phase', 0));
  const sx2 = Math.sin(osc2dT * tau * paramNum(node, 'x2Freq', 1) + paramNum(node, 'x2Phase', 0));
  const sx3 = Math.sin(osc2dT * tau * paramNum(node, 'x3Freq', 1) + paramNum(node, 'x3Phase', 0));
  const sy1 = Math.sin(osc2dT * tau * paramNum(node, 'y1Freq', 1) + paramNum(node, 'y1Phase', 0));
  const sy2 = Math.sin(osc2dT * tau * paramNum(node, 'y2Freq', 1) + paramNum(node, 'y2Phase', 0));
  const sy3 = Math.sin(osc2dT * tau * paramNum(node, 'y3Freq', 1) + paramNum(node, 'y3Phase', 0));

  const rawX = osc2dCombineAxis(
    layerCombine,
    paramInt(node, 'x1On', 1),
    paramNum(node, 'x1Amp', 0),
    sx1,
    paramInt(node, 'x2On', 0),
    paramNum(node, 'x2Amp', 0),
    sx2,
    paramInt(node, 'x3On', 0),
    paramNum(node, 'x3Amp', 0),
    sx3
  );
  const rawY = osc2dCombineAxis(
    layerCombine,
    paramInt(node, 'y1On', 1),
    paramNum(node, 'y1Amp', 0),
    sy1,
    paramInt(node, 'y2On', 0),
    paramNum(node, 'y2Amp', 0),
    sy2,
    paramInt(node, 'y3On', 0),
    paramNum(node, 'y3Amp', 0),
    sy3
  );

  const theta =
    osc2dT * tau * paramNum(node, 'rotationSpeed', 0) +
    paramNum(node, 'rotationPhase', 0) +
    paramNum(node, 'rotWobbleAmp', 0) *
      Math.sin(osc2dT * tau * paramNum(node, 'rotWobbleFreq', 0) + paramNum(node, 'rotWobblePhase', 0));
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const rx = c * rawX - s * rawY;
  const ry = s * rawX + c * rawY;

  if (port === 'x') {
    return rx + paramNum(node, 'offsetX', 0);
  }
  return ry + paramNum(node, 'offsetY', 0);
}
