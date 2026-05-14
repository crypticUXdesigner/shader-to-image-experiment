/**
 * Utility to compute effective parameter values when inputs are connected,
 * and to snap values to parameter constraints (min/max/step/int).
 *
 * This module re-exports from parameterValueCalculatorSnap, parameterValueCalculatorInput,
 * and defines computeEffectiveParameterValue.
 *
 * WP: shader-editor-signal-architecture-02
 * - Parameter evaluation now runs through the signal model by representing
 *   base and automation contributions as SignalBinding entries, while keeping
 *   observable behavior identical for current graphs and presets.
 */

import type { NodeGraph, NodeInstance } from '../data-model/types';
import type { NodeSpec, ParameterSpec } from '../types/nodeSpec';
import type { IAudioManager } from '../runtime/types';
import type {
  SignalBinding,
  SignalBindingList,
  SignalValue,
} from '../data-model/signals';
import {
  createAutomationSignalBinding,
  createBaseSignalBinding,
} from '../data-model/signals';
import { getInputValue } from './parameterValueCalculatorInput';
import { snapParameterValue as snapParameterValueInternal } from './parameterValueCalculatorSnap';

export { snapParameterValue } from './parameterValueCalculatorSnap';
export {
  getParameterInputValue,
  hasTrackableInput,
  getAudioRemapLiveValues,
  getAudioAnalyzerBandLiveValues
} from './parameterValueCalculatorInput';

export type ParameterInputMode = 'override' | 'add' | 'subtract' | 'multiply';

/**
 * Internal switch to allow falling back to the legacy (pre-signal-model)
 * configuration calculation if needed during rollout.
 */
const USE_SIGNAL_MODEL: boolean = true;

interface ParameterSignalContext {
  node: NodeInstance;
  paramName: string;
  paramSpec: ParameterSpec;
  automationValue?: number | null;
}

type NumberSignalBinding = SignalBinding<number>;
type NumberSignalBindingList = SignalBindingList<number>;

function buildParameterSignalBindings(
  ctx: ParameterSignalContext,
): NumberSignalBindingList {
  const { node, paramName, paramSpec, automationValue } = ctx;

  const staticConfig = node.parameters[paramName];
  const baseValue =
    typeof staticConfig === 'number'
      ? staticConfig
      : typeof paramSpec.default === 'number'
        ? (paramSpec.default as number)
        : 0;

  const baseBinding = createBaseSignalBinding<number>(
    `base:${node.id}:${paramName}`,
    baseValue,
    0,
  );

  const bindings: NumberSignalBindingList = [baseBinding];

  if (automationValue !== undefined && automationValue !== null) {
    const automationBinding = createAutomationSignalBinding<number>(
      `automation:${node.id}:${paramName}`,
      `${node.id}:${paramName}`,
      1,
      baseValue,
    );
    return [...bindings, automationBinding];
  }

  return bindings;
}

function evaluateConfigFromSignalBindings(
  bindings: NumberSignalBindingList,
  automationValue?: number | null,
): number {
  const base = bindings.find(
    (b): b is NumberSignalBinding & { source: { kind: 'base'; value: SignalValue } } =>
      b.source.kind === 'base',
  );

  const baseValue =
    base && base.source.kind === 'base' && typeof base.source.value === 'number'
      ? (base.source.value as number)
      : 0;

  const hasAutomationBinding = bindings.some(
    (b) => b.source.kind === 'automation',
  );

  if (hasAutomationBinding && automationValue !== undefined && automationValue !== null) {
    return automationValue;
  }

  return baseValue;
}

function computeConfigValueLegacy(
  node: NodeInstance,
  paramName: string,
  paramSpec: ParameterSpec,
  automationValue?: number | null,
): number {
  const staticConfig = node.parameters[paramName];
  return automationValue !== undefined && automationValue !== null
    ? automationValue
    : typeof staticConfig === 'number'
      ? staticConfig
      : typeof paramSpec.default === 'number'
        ? (paramSpec.default as number)
        : 0;
}

/**
 * Compute the effective value of a parameter when it has an input connection
 * or when automation provides a value (automation replaces static config).
 *
 * @param automationValue - When provided and not null, used as the "config" value
 *   (replacing node.parameters[paramName]). When there is no connection, this is
 *   the effective value; when there is a connection, inputMode(automationValue, input) is used.
 */
export function computeEffectiveParameterValue(
  node: NodeInstance,
  paramName: string,
  paramSpec: ParameterSpec,
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  audioManager?: IAudioManager,
  automationValue?: number | null
): number | null {
  const clampToRange = (value: number): number => {
    // Range policy: defaults to 0..1 when missing (matches existing snap defaults).
    const min = typeof paramSpec.min === 'number' ? paramSpec.min : 0;
    const max = typeof paramSpec.max === 'number' ? paramSpec.max : 1;
    return Math.max(min, Math.min(max, value));
  };

  /** Int params must end up integers so enum UI / GLSL `int` uniforms stay consistent after automation/audio. */
  const finalizeDiscrete = (value: number): number => {
    const clamped = clampToRange(value);
    return paramSpec.type === 'int' ? snapParameterValueInternal(clamped, paramSpec) : clamped;
  };

  const configNum: number = USE_SIGNAL_MODEL
    ? evaluateConfigFromSignalBindings(
        buildParameterSignalBindings({
          node,
          paramName,
          paramSpec,
          automationValue,
        }),
        automationValue,
      )
    : computeConfigValueLegacy(node, paramName, paramSpec, automationValue);

  const connection = graph.connections.find(
    (conn) =>
      !conn.disabled &&
      conn.targetNodeId === node.id &&
      conn.targetParameter === paramName
  );

  if (!connection) {
    return finalizeDiscrete(configNum);
  }

  const inputMode: ParameterInputMode =
    node.parameterInputModes?.[paramName] ||
    paramSpec.inputMode ||
    'override';

  const inputValue = getInputValue(connection, graph, nodeSpecs, audioManager);

  if (inputValue === null) {
    return finalizeDiscrete(configNum);
  }

  switch (inputMode) {
    case 'override':
      return finalizeDiscrete(inputValue);
    case 'add':
      return finalizeDiscrete(configNum + inputValue);
    case 'subtract':
      return finalizeDiscrete(configNum - inputValue);
    case 'multiply':
      return finalizeDiscrete(configNum * inputValue);
    default:
      return finalizeDiscrete(inputValue);
  }
}
