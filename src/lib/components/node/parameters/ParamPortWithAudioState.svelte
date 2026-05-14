<script lang="ts">
  /**
   * ParamPortWithAudioState
   * Wraps ParameterCell and resolves connection state, signal name, and live value
   * from graph store + parameterValueCalculator. Polls live value on RAF when audio-connected.
   * When a param has evaluable timeline automation, the displayed value is driven by automation across the full timeline (lead-in, gaps, tail).
   * Mode button shows only when connected (graph or audio); icon reflects input mode.
   * Passes effectiveValue to children for knob/input display when connected.
   */
  import ParameterCell from './ParameterCell.svelte';
  import type { ParamPortState } from './ParamPort.svelte';
  import type { IconName } from '../../../../utils/icons';
  import { getParamPortConnectionState } from '../../../../utils/paramPortAudioState';
  import {
    computeEffectiveParameterValue,
    getParameterInputValue,
  } from '../../../../utils/parameterValueCalculator';
  import { evaluateAutomationSignalBindingForParam } from '../../../../utils/automationSignals';
  import { automationLaneHasEvaluableRegions } from '../../../../utils/automationEvaluator';
  import { subscribeParameterValueTick } from '../../../stores/parameterValueTickStore';
  import type { NodeGraph } from '../../../../data-model/types';
  import type { NodeSpec, ParameterInputMode } from '../../../../types/nodeSpec';
  import type { AudioSetup } from '../../../../data-model/audioSetupTypes';
  import type { IAudioManager } from '../../../../runtime/types';
  import type { NodeInstance } from '../../../../data-model/types';

  const MODE_ORDER: ParameterInputMode[] = ['override', 'add', 'subtract', 'multiply'];
  const MODE_TO_ICON: Record<ParameterInputMode, IconName> = {
    override: 'equal',
    add: 'plus',
    subtract: 'minus',
    multiply: 'multiply'
  };

  interface Props {
    nodeId: string;
    paramName: string;
    label: string;
    portId: string;
    portType?: string;
    showPort?: boolean;
    inputMode?: ParameterInputMode;
    onParameterInputModeChanged?: (mode: ParameterInputMode) => void;
    node: NodeInstance;
    graph: NodeGraph;
    audioSetup: AudioSetup;
    nodeSpecs: Map<string, NodeSpec>;
    getAudioManager?: () => IAudioManager | null;
    /** Current timeline time for automation-driven parameter display. */
    getTimelineCurrentTime?: () => number;
    onPortPointerDown?: (e: PointerEvent) => void;
    onPortDoubleClick?: (e: MouseEvent) => void;
    disabled?: boolean;
    class?: string;
    /** Compact ParamCell (no label column); use in group headers, etc. */
    inlineControl?: boolean;
    children?: import('svelte').Snippet<[{
      effectiveValue: number | null;
      /** Value to show in the control. When multiply and input is 0, this is config so user can still drag. */
      displayValue: number;
      /** When true, user is editing config directly (e.g. multiply with 0 input); skip effectiveToConfig. */
      useConfigForInput: boolean;
      /** Stored parameter value (config / base). Display may be effective when wired; inline edit uses the same domain as drag (effective) unless {@link useConfigForInput}. */
      configValue: number;
    }]>;
  }

  let {
    nodeId,
    paramName,
    label,
    portId,
    portType = 'float',
    showPort = true,
    inputMode = 'override',
    onParameterInputModeChanged,
    node,
    graph,
    audioSetup,
    nodeSpecs,
    getAudioManager,
    getTimelineCurrentTime,
    onPortPointerDown,
    onPortDoubleClick,
    disabled = false,
    class: className = '',
    inlineControl = false,
    children,
  }: Props = $props();

  const connectionInfo = $derived(
    getParamPortConnectionState(nodeId, paramName, graph, audioSetup)
  );

  const automationLaneForParam = $derived(
    graph.automation?.lanes?.find((l) => l.nodeId === nodeId && l.paramName === paramName)
  );
  /** True when the lane has at least one evaluable region (automation is active for the full timeline). */
  const hasEvaluableAutomationLane = $derived(
    Boolean(
      automationLaneForParam && automationLaneHasEvaluableRegions(automationLaneForParam)
    )
  );

  const paramSpec = $derived(nodeSpecs.get(node.type)?.parameters?.[paramName]);
  const supportsAudio = $derived(paramSpec?.supportsAudio !== false);
  const supportsAnimation = $derived(paramSpec?.supportsAnimation !== false);
  const portState: ParamPortState = $derived(connectionInfo.state);
  const signalName = $derived(connectionInfo.signalName);
  const showModeButton = $derived(connectionInfo.state !== 'default');
  const modeButtonIcon = $derived(MODE_TO_ICON[inputMode] ?? 'equal');
  let liveValue = $state(0);
  let effectiveValue = $state<number | null>(null);
  /** Incremented every frame when connected so displayValue re-runs and knob shows live value. */
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

  /* Single tick: peak meter (audio only) + effective value. Also run when the param has an active automation lane. */
  $effect(() => {
    const g = graph;
    const n = node;
    const setup = audioSetup;
    const specs = nodeSpecs;
    const mode = inputMode;
    void mode;
    const info = getParamPortConnectionState(nodeId, paramName, g, setup);
    const lane = g.automation?.lanes?.find((l) => l.nodeId === nodeId && l.paramName === paramName);
    const hasLane = Boolean(lane && automationLaneHasEvaluableRegions(lane));
    if (info.state === 'default' && !hasLane) {
      effectiveValue = null;
      return;
    }
    const spec = specs.get(n.type)?.parameters?.[paramName];
    if (!spec) {
      effectiveValue = null;
      return;
    }
    const am = getAudioManager?.();
    const configNum: number =
      typeof n.parameters[paramName] === 'number' && isFinite(n.parameters[paramName] as number)
        ? (n.parameters[paramName] as number)
        : (typeof spec.default === 'number' ? spec.default : 0);

    return subscribeParameterValueTick(() => {
      const currentTime = getTimelineCurrentTime?.() ?? 0;
      const { value: automationVal } = evaluateAutomationSignalBindingForParam(
        n,
        paramName,
        g,
        currentTime,
        spec,
      );
      const config = automationVal !== null && automationVal !== undefined ? automationVal : configNum;

      if (info.state === 'audio-connected' && am) {
        const raw = getParameterInputValue(nodeId, paramName, g, specs, am) ?? null;
        if (raw !== null && typeof raw === 'number' && isFinite(raw)) {
          liveValue = Math.max(0, Math.min(1, raw));
          effectiveValue = applyInputMode(config, raw, inputMode);
        } else {
          effectiveValue = config;
        }
      } else {
        const v = computeEffectiveParameterValue(
          n,
          paramName,
          spec,
          g,
          specs,
          am ?? undefined,
          automationVal ?? undefined
        );
        effectiveValue = v !== null && typeof v === 'number' ? v : null;
      }
      tickCount++;
    });
  });

  /** When connected in multiply mode with ~0 input, show config so user can still drag the parameter. */
  const configValue = $derived((() => {
    const spec = nodeSpecs.get(node.type)?.parameters?.[paramName];
    const raw = node.parameters[paramName];
    if (typeof raw === 'number' && isFinite(raw)) return raw;
    return (typeof spec?.default === 'number' ? spec.default : 0) as number;
  })());
  const inputValue = $derived(
    connectionInfo.state !== 'default'
      ? getParameterInputValue(nodeId, paramName, graph, nodeSpecs, getAudioManager?.() ?? undefined)
      : null
  );
  const useConfigForInput = $derived(
    connectionInfo.state !== 'default' &&
    inputMode === 'multiply' &&
    (inputValue === null || (typeof inputValue === 'number' && Math.abs(inputValue) < 1e-10))
  );
  /** When connected or has evaluable automation lane, depend on tickCount so display updates when playhead moves. */
  const displayValue = $derived.by(() => {
    if (connectionInfo.state !== 'default' || hasEvaluableAutomationLane) {
      const _ = tickCount;
      void _;
    }
    return useConfigForInput ? configValue : (effectiveValue ?? configValue);
  });

  function handleModeClick() {
    const currentIndex = MODE_ORDER.indexOf(inputMode);
    const nextIndex = (currentIndex + 1) % MODE_ORDER.length;
    const nextMode = MODE_ORDER[nextIndex];
    onParameterInputModeChanged?.(nextMode);
  }
</script>

<ParameterCell
  {label}
  {showPort}
  {showModeButton}
  modeButtonIcon={modeButtonIcon}
  {portId}
  {portType}
  {nodeId}
  {paramName}
  portState={portState}
  signalName={signalName}
  liveValue={liveValue}
  supportsAudio={supportsAudio}
  supportsAnimation={supportsAnimation}
  timelineDriven={hasEvaluableAutomationLane}
  {inlineControl}
  {onPortPointerDown}
  {onPortDoubleClick}
  onModeClick={handleModeClick}
  {disabled}
  class={className}
>
  {@render children?.({ effectiveValue, displayValue, useConfigForInput, configValue })}
</ParameterCell>
