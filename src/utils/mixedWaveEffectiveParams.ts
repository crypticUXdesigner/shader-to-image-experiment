/**
 * Resolves mixed-wave-signal scalar parameters with the same rules as the shader
 * (param ports, input modes, live audio, timeline automation).
 * Lives outside `mixedWaveSignalPreview.ts` to avoid an import cycle with
 * `parameterValueCalculator` → `parameterValueCalculatorInput`.
 */

import type { NodeGraph, NodeInstance } from '../data-model/types';
import type { NodeSpec } from '../types/nodeSpec';
import type { IAudioManager } from '../runtime/types';
import { mixedWaveSignalNodeSpec } from '../shaders/nodes/mixed-wave-signal';
import { computeEffectiveParameterValue } from './parameterValueCalculator';
import { evaluateAutomationSignalBindingForParam } from './automationSignals';

export interface MixedWavePreviewResolutionContext {
  graph: NodeGraph;
  nodeSpecs: Map<string, NodeSpec>;
  audioManager?: IAudioManager;
  /** Defaults to 0 when omitted (matches ParamPortWithAudioState). */
  getTimelineCurrentTime?: () => number;
}

/**
 * Effective float/int parameter values for CPU mixed-wave preview.
 * Keys mirror `mixedWaveSignalNodeSpec.parameters` scalars only.
 */
export type MixedWaveResolvedScalars = Record<string, number>;

function fallbackFromSpec(paramName: string): number {
  const spec = mixedWaveSignalNodeSpec.parameters[paramName];
  return typeof spec?.default === 'number' ? spec.default : 0;
}

function fallbackNumeric(node: NodeInstance, paramName: string): number {
  const v = node.parameters[paramName];
  if (typeof v === 'number' && !isNaN(v)) return v;
  return fallbackFromSpec(paramName);
}

/**
 * Resolve every float/int parameter on mixed-wave-signal for JS preview/evaluation.
 */
export function resolveMixedWaveNumericParams(
  node: NodeInstance,
  ctx: MixedWavePreviewResolutionContext,
): MixedWaveResolvedScalars {
  const { graph, nodeSpecs, audioManager, getTimelineCurrentTime } = ctx;
  const t = getTimelineCurrentTime?.() ?? 0;
  const out: MixedWaveResolvedScalars = {};

  for (const paramName of Object.keys(mixedWaveSignalNodeSpec.parameters)) {
    const paramSpec = mixedWaveSignalNodeSpec.parameters[paramName];
    if (paramSpec.type !== 'float' && paramSpec.type !== 'int') continue;

    const { value: automationVal } = evaluateAutomationSignalBindingForParam(
      node,
      paramName,
      graph,
      t,
      paramSpec,
    );
    const resolved = computeEffectiveParameterValue(
      node,
      paramName,
      paramSpec,
      graph,
      nodeSpecs,
      audioManager,
      automationVal ?? undefined,
    );
    if (resolved !== null && typeof resolved === 'number' && isFinite(resolved)) {
      out[paramName] = resolved;
    } else {
      out[paramName] = fallbackNumeric(node, paramName);
    }
  }

  return out;
}
