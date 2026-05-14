<script lang="ts">
  /**
   * CoordPadCell - Wraps CoordPadWithPorts with graph/audio connection resolution.
   * Resolves connection state and polls live values for X and Y params.
   * When a param has evaluable timeline automation, shows automation-driven value for the whole timeline.
   */
  import CoordPadWithPorts from './CoordPadWithPorts.svelte';
  import { getParamPortConnectionState } from '../../../../utils/paramPortAudioState';
  import {
    computeEffectiveParameterValue,
    getParameterInputValue,
    snapParameterValue,
  } from '../../../../utils/parameterValueCalculator';
  import {
    getAutomationValueForParam,
    automationLaneHasEvaluableRegions,
  } from '../../../../utils/automationEvaluator';
  import { subscribeParameterValueTick } from '../../../stores/parameterValueTickStore';
  import type { NodeGraph } from '../../../../data-model/types';
  import type { NodeSpec, ParameterInputMode } from '../../../../types/nodeSpec';
  import type { AudioSetup } from '../../../../data-model/audioSetupTypes';
  import type { IAudioManager } from '../../../../runtime/types';
  import type { IconName } from '../../../../utils/icons';

  const MODE_TO_ICON: Record<ParameterInputMode, IconName> = {
    override: 'equal',
    add: 'plus',
    subtract: 'minus',
    multiply: 'multiply'
  };

  interface Props {
    nodeId: string;
    node: import('../../../../data-model/types').NodeInstance;
    spec: NodeSpec;
    paramX: string;
    paramY: string;
    /** 'center' (0,0 at center) or 'bottom-left' (0,0 at corner, e.g. brick tiling). Default center. */
    coordsOrigin?: 'center' | 'bottom-left';
    /** Optional nominal UV/rest position shown as anchor + line (see grid layout coordsDisplacementAnchor). */
    displacementAnchor?: { x: number; y: number };
    graph: NodeGraph;
    audioSetup: AudioSetup;
    nodeSpecs: Map<string, NodeSpec>;
    getAudioManager?: () => IAudioManager | null;
    /** Current timeline time for automation-driven parameter display. */
    getTimelineCurrentTime?: () => number;
    onPortPointerDownForConnection?: (screenX: number, screenY: number, pointerId?: number) => void;
    onPortDoubleClick?: (e: MouseEvent, paramName: string) => void;
    onParameterInputModeChanged?: (paramName: string, mode: ParameterInputMode) => void;
    onParameterChange: (paramName: string, value: number) => void;
    disabled?: boolean;
    class?: string;
  }

  let {
    nodeId,
    node,
    spec,
    paramX,
    paramY,
    coordsOrigin = 'center',
    displacementAnchor = undefined,
    graph,
    audioSetup,
    nodeSpecs,
    getAudioManager,
    getTimelineCurrentTime,
    onPortPointerDownForConnection,
    onPortDoubleClick,
    onParameterInputModeChanged,
    onParameterChange,
    disabled = false,
    class: className = '',
  }: Props = $props();

  const connX = $derived(getParamPortConnectionState(nodeId, paramX, graph, audioSetup));
  const connY = $derived(getParamPortConnectionState(nodeId, paramY, graph, audioSetup));

  let liveValueX = $state(0);
  let liveValueY = $state(0);
  let effectiveValueX = $state<number | null>(null);
  let effectiveValueY = $state<number | null>(null);
  /** Same as ParamPortWithAudioState: nudge displayValue when RAF updates effective values. */
  let tickCount = $state(0);

  function applyInputMode(configNum: number, inputValue: number, mode: ParameterInputMode): number {
    switch (mode) {
      case 'override': return inputValue;
      case 'add': return configNum + inputValue;
      case 'subtract': return configNum - inputValue;
      case 'multiply': return configNum * inputValue;
      default: return inputValue;
    }
  }

  /* Single tick: peak meters (audio only) + effective values. Also run when either param has an active automation lane. */
  $effect(() => {
    const g = graph;
    const n = node;
    const specs = nodeSpecs;
    const specX = specs.get(n.type)?.parameters?.[paramX];
    const specY = specs.get(n.type)?.parameters?.[paramY];
    const laneX = g.automation?.lanes?.find((l) => l.nodeId === nodeId && l.paramName === paramX);
    const laneY = g.automation?.lanes?.find((l) => l.nodeId === nodeId && l.paramName === paramY);
    const hasLaneX = Boolean(laneX && automationLaneHasEvaluableRegions(laneX));
    const hasLaneY = Boolean(laneY && automationLaneHasEvaluableRegions(laneY));
    if (
      connX.state === 'default' &&
      connY.state === 'default' &&
      !hasLaneX &&
      !hasLaneY
    ) {
      effectiveValueX = null;
      effectiveValueY = null;
      return;
    }
    const am = getAudioManager?.();
    const configX = getParamValue(paramX);
    const configY = getParamValue(paramY);

    return subscribeParameterValueTick(() => {
      const currentTime = getTimelineCurrentTime?.() ?? 0;
      const automationX =
        specX ? getAutomationValueForParam(n, paramX, g, currentTime, specX) : null;
      const automationY =
        specY ? getAutomationValueForParam(n, paramY, g, currentTime, specY) : null;
      const configXEffective = automationX !== null && automationX !== undefined ? automationX : configX;
      const configYEffective = automationY !== null && automationY !== undefined ? automationY : configY;

      if (connX.state === 'audio-connected' && am && specX) {
        const rawX = getParameterInputValue(nodeId, paramX, g, specs, am) ?? null;
        if (rawX !== null && typeof rawX === 'number' && isFinite(rawX)) {
          liveValueX = Math.max(0, Math.min(1, rawX));
          effectiveValueX = applyInputMode(configXEffective, rawX, getInputMode(paramX));
        } else {
          effectiveValueX = configXEffective;
        }
      } else if ((connX.state !== 'default' || hasLaneX) && specX) {
        const v = computeEffectiveParameterValue(
          n,
          paramX,
          specX,
          g,
          specs,
          am ?? undefined,
          automationX ?? undefined
        );
        effectiveValueX = v !== null && typeof v === 'number' ? v : null;
      } else {
        effectiveValueX = null;
      }

      if (connY.state === 'audio-connected' && am && specY) {
        const rawY = getParameterInputValue(nodeId, paramY, g, specs, am) ?? null;
        if (rawY !== null && typeof rawY === 'number' && isFinite(rawY)) {
          liveValueY = Math.max(0, Math.min(1, rawY));
          effectiveValueY = applyInputMode(configYEffective, rawY, getInputMode(paramY));
        } else {
          effectiveValueY = configYEffective;
        }
      } else if ((connY.state !== 'default' || hasLaneY) && specY) {
        const v = computeEffectiveParameterValue(
          n,
          paramY,
          specY,
          g,
          specs,
          am ?? undefined,
          automationY ?? undefined
        );
        effectiveValueY = v !== null && typeof v === 'number' ? v : null;
      } else {
        effectiveValueY = null;
      }
      tickCount++;
    });
  });

  /** When multiply and input is ~0, show config so user can still drag (same as ParamPortWithAudioState). */
  const inputValueX = $derived(
    connX.state !== 'default'
      ? getParameterInputValue(nodeId, paramX, graph, nodeSpecs, getAudioManager?.() ?? undefined)
      : null
  );
  const inputValueY = $derived(
    connY.state !== 'default'
      ? getParameterInputValue(nodeId, paramY, graph, nodeSpecs, getAudioManager?.() ?? undefined)
      : null
  );
  const modeX = $derived((node.parameterInputModes?.[paramX] ?? spec.parameters[paramX]?.inputMode ?? 'override') as ParameterInputMode);
  const modeY = $derived((node.parameterInputModes?.[paramY] ?? spec.parameters[paramY]?.inputMode ?? 'override') as ParameterInputMode);
  const useConfigForInputX = $derived(
    connX.state !== 'default' &&
    modeX === 'multiply' &&
    (inputValueX === null || (typeof inputValueX === 'number' && Math.abs(inputValueX) < 1e-10))
  );
  const useConfigForInputY = $derived(
    connY.state !== 'default' &&
    modeY === 'multiply' &&
    (inputValueY === null || (typeof inputValueY === 'number' && Math.abs(inputValueY) < 1e-10))
  );
  const displayValueX = $derived.by(() => {
    if (connX.state !== 'default' || connY.state !== 'default') {
      const _ = tickCount;
      void _;
    }
    return useConfigForInputX ? getParamValue(paramX) : (effectiveValueX ?? getParamValue(paramX));
  });
  const displayValueY = $derived.by(() => {
    if (connX.state !== 'default' || connY.state !== 'default') {
      const _ = tickCount;
      void _;
    }
    return useConfigForInputY ? getParamValue(paramY) : (effectiveValueY ?? getParamValue(paramY));
  });

  function getParamValue(name: string): number {
    const val = node.parameters[name];
    const def = spec.parameters[name]?.default;
    if (typeof val === 'number') return val;
    return (typeof def === 'number' ? def : 0) as number;
  }

  function getInputMode(name: string): ParameterInputMode {
    return (node.parameterInputModes?.[name] ?? spec.parameters[name]?.inputMode ?? 'override') as ParameterInputMode;
  }

  /** Convert effective value (user-edited) back to config when connected. Guards against Infinity/NaN. */
  function effectiveToConfig(paramName: string, effectiveValue: number): number {
    const conn = paramName === paramX ? connX : connY;
    const paramSpec = spec.parameters[paramName];
    if (conn.state === 'default') {
      return paramSpec ? snapParameterValue(effectiveValue, paramSpec) : effectiveValue;
    }
    const mode = getInputMode(paramName);
    const inputValue = getParameterInputValue(nodeId, paramName, graph, nodeSpecs, getAudioManager?.() ?? undefined);
    if (inputValue === null) return effectiveValue;
    let raw: number;
    switch (mode) {
      case 'add': raw = effectiveValue - inputValue; break;
      case 'subtract': raw = effectiveValue + inputValue; break;
      case 'multiply':
        if (Math.abs(inputValue) < 1e-10) raw = effectiveValue;
        else raw = effectiveValue / inputValue;
        break;
      default: raw = effectiveValue;
    }
    if (!Number.isFinite(raw)) return getParamValue(paramName);
    return paramSpec ? snapParameterValue(raw, paramSpec) : raw;
  }

  function handleModeClick(paramName: string) {
    const mode = getInputMode(paramName);
    const order: ParameterInputMode[] = ['override', 'add', 'subtract', 'multiply'];
    const idx = order.indexOf(mode);
    const next = order[(idx + 1) % order.length];
    onParameterInputModeChanged?.(paramName, next);
  }

  const portGroupX = $derived({
    label: spec.parameters[paramX]?.label ?? 'X',
    portId: `${nodeId}-${paramX}`,
    portState: connX.state,
    signalName: connX.signalName,
    liveValue: liveValueX,
    showModeButton: connX.state !== 'default',
    modeButtonIcon: MODE_TO_ICON[getInputMode(paramX)] ?? 'equal',
    onModeClick: () => handleModeClick(paramX),
    onPortPointerDown: (e: PointerEvent) => onPortPointerDownForConnection?.(e.clientX, e.clientY, e.pointerId),
    onPortDoubleClick: (e: MouseEvent) => onPortDoubleClick?.(e, paramX),
    disabled,
  });

  const portGroupY = $derived({
    label: spec.parameters[paramY]?.label ?? 'Y',
    portId: `${nodeId}-${paramY}`,
    portState: connY.state,
    signalName: connY.signalName,
    liveValue: liveValueY,
    showModeButton: connY.state !== 'default',
    modeButtonIcon: MODE_TO_ICON[getInputMode(paramY)] ?? 'equal',
    onModeClick: () => handleModeClick(paramY),
    onPortPointerDown: (e: PointerEvent) => onPortPointerDownForConnection?.(e.clientX, e.clientY, e.pointerId),
    onPortDoubleClick: (e: MouseEvent) => onPortDoubleClick?.(e, paramY),
    disabled,
  });

  const paramSpecX = $derived(spec.parameters[paramX]);
  const paramSpecY = $derived(spec.parameters[paramY]);

  const label = $derived(
    (paramSpecX?.label ?? 'Center')
      .replace(/\s+[XY]$/i, '')
  );

  const timelineDrivenPad = $derived.by(() => {
    const g = graph;
    const lx = g.automation?.lanes?.find((l) => l.nodeId === nodeId && l.paramName === paramX);
    const ly = g.automation?.lanes?.find((l) => l.nodeId === nodeId && l.paramName === paramY);
    return Boolean(
      (lx && automationLaneHasEvaluableRegions(lx)) ||
        (ly && automationLaneHasEvaluableRegions(ly))
    );
  });

  /** Hide anchor/line when values can be externally driven — misleading vs graph/audio/automation blend. */
  const displacementNominal = $derived(
    displacementAnchor != null &&
      connX.state === 'default' &&
      connY.state === 'default' &&
      !timelineDrivenPad
      ? displacementAnchor
      : null
  );
</script>

<CoordPadWithPorts
  timelineDriven={timelineDrivenPad}
  label={label}
  x={displayValueX}
  y={displayValueY}
  minX={paramSpecX?.min ?? -2}
  maxX={paramSpecX?.max ?? 2}
  minY={paramSpecY?.min ?? -2}
  maxY={paramSpecY?.max ?? 2}
  origin={coordsOrigin}
  displacementNominal={displacementNominal}
  step={paramSpecX?.step ?? paramSpecY?.step ?? 0.1}
  labelX={paramSpecX?.label ?? 'X'}
  labelY={paramSpecY?.label ?? 'Y'}
  {nodeId}
  paramNameX={paramX}
  paramNameY={paramY}
  portGroupX={portGroupX}
  portGroupY={portGroupY}
  disabled={disabled}
  class={className}
  onChange={(x, y) => {
    onParameterChange(paramX, useConfigForInputX ? x : effectiveToConfig(paramX, x));
    onParameterChange(paramY, useConfigForInputY ? y : effectiveToConfig(paramY, y));
  }}
  onCommit={(x, y) => {
    onParameterChange(paramX, useConfigForInputX ? x : effectiveToConfig(paramX, x));
    onParameterChange(paramY, useConfigForInputY ? y : effectiveToConfig(paramY, y));
  }}
/>
