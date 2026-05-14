<script lang="ts">
  /**
   * NodeBody
   * Renders parameter layout from spec.parameterLayout.
   * Simple controls (Knob, ValueInput, Toggle, Enum, Range) and layout elements
   * (remap-range, bezier, frequency-range, color-picker) are rendered as Svelte components.
   */

  import { autoGenerateLayout } from '../../../utils/layoutMigration';
  import { getCategorySlug } from '../../../utils/cssTokens';
  import { getParameterEnumMappings, isEnumParameter } from '../../../utils/parameterEnumMappings';
  import { getParamPortConnectionState } from '../../../utils/paramPortAudioState';
  import {
    getParameterInputValue,
    snapParameterValue,
  } from '../../../utils/parameterValueCalculator';
  import { getParameterUIRegistry } from '../../../ui/editor';
  import ParamPortWithAudioState from './parameters/ParamPortWithAudioState.svelte';
  import Knob from './parameters/Knob.svelte';
  import { Button, ValueInput } from '../ui';
  import Toggle from './parameters/Toggle.svelte';
  import EnumSelector from './parameters/EnumSelector.svelte';
  import BezierEditor from './parameters/BezierEditor.svelte';
  import ColorPicker from './parameters/ColorPicker.svelte';
  import ColorPickerRow from './parameters/ColorPickerRow.svelte';
  import ColorMapPreview from './parameters/ColorMapPreview.svelte';
  import { RemapRangeEditor } from '../ui';
  import FrequencyRangeEditor from '../audio/FrequencyRangeEditor.svelte';
  import CoordPadCell from './parameters/CoordPadCell.svelte';
  import type { NodeGraph } from '../../../data-model/types';
  import type { NodeSpec, ParameterSpec, ParameterUISelection, ParameterInputMode } from '../../../types/nodeSpec';
  import type { AudioSetup } from '../../../data-model/audioSetupTypes';
  import type { IAudioManager } from '../../../runtime/types';
  import { layoutSectionVisible } from '../../../utils/parameterVisibility';

  interface Props {
    nodeId: string;
    node: import('../../../data-model/types').NodeInstance;
    spec: NodeSpec;
    width: number;
    headerHeight: number;
    height: number;
    graph: NodeGraph;
    audioSetup: AudioSetup;
    nodeSpecs: Map<string, NodeSpec>;
    getAudioManager?: () => IAudioManager | null;
    /** Current timeline time for automation-driven parameter display. */
    getTimelineCurrentTime?: () => number;
    overlayBridge?: import('../../../types/editor').CanvasOverlayBridge | null;
    onPortPointerDownForConnection?: (screenX: number, screenY: number, pointerId?: number) => void;
    onPortClickForSignalPicker?: (screenX: number, screenY: number, nodeId: string, paramName: string, triggerElement?: HTMLElement | null) => void;
    onParameterChange: (paramName: string, value: import('../../../data-model/types').ParameterValue) => void;
    onParameterInputModeChanged?: (paramName: string, mode: ParameterInputMode) => void;
  }

  let {
    nodeId,
    node,
    spec,
    width,
    headerHeight,
    height,
    graph,
    audioSetup,
    nodeSpecs,
    getAudioManager,
    getTimelineCurrentTime,
    overlayBridge = null,
    onPortPointerDownForConnection,
    onPortClickForSignalPicker,
    onParameterChange,
    onParameterInputModeChanged,
  }: Props = $props();

  const bodyHeight = $derived(Math.max(0, height - headerHeight));
  const layout = $derived(spec.parameterLayout ?? autoGenerateLayout(spec));
  /** True when this parameter should show a connection port (float and not in layout.parametersWithoutPorts). */
  function showParamPort(paramName: string, paramSpec: ParameterSpec): boolean {
    if (paramSpec.type !== 'float') return false;
    return !(layout.parametersWithoutPorts ?? []).includes(paramName);
  }

  const paramRegistry = getParameterUIRegistry();

  function getParamUIType(paramName: string, _paramSpec: ParameterSpec, parameterUI?: Record<string, ParameterUISelection>): ParameterUISelection {
    const override = parameterUI?.[paramName];
    if (override) return override;
    if (isEnumParameter(spec.id, paramName)) return 'enum';
    return paramRegistry.getRenderer(spec, paramName).getUIType() as ParameterUISelection;
  }

  function getInputMode(paramName: string): ParameterInputMode {
    return node.parameterInputModes?.[paramName] ?? spec.parameters[paramName]?.inputMode ?? 'override';
  }

  function getParamValue(paramName: string): number {
    const val = node.parameters[paramName];
    const def = spec.parameters[paramName]?.default;
    if (typeof val === 'number') return val;
    return (typeof def === 'number' ? def : 0) as number;
  }

  /**
   * When connected, user edits effective value (what they see). Convert back to config
   * so the base/override value is stored correctly per mode (add/subtract/multiply).
   * Guards against Infinity/NaN and clamps to param range.
   */
  function effectiveToConfig(paramName: string, effectiveValue: number): number {
    const connInfo = getParamPortConnectionState(nodeId, paramName, graph, audioSetup);
    const paramSpec = spec.parameters[paramName];
    if (connInfo.state === 'default') {
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

  const layoutElements = $derived(layout.elements);

  function getArrayParamValue(paramName: string, bandIndex: number): [number, number] {
    const val = node.parameters[paramName];
    if (Array.isArray(val) && Array.isArray(val[bandIndex])) {
      const band = val[bandIndex] as number[];
      return [band[0] ?? 0, band[1] ?? 1];
    }
    return [0, 1];
  }

  function showColorPicker(
    initial: { l: number; c: number; h: number },
    screenX: number,
    screenY: number,
    onApply: (l: number, c: number, h: number) => void
  ) {
    overlayBridge?.showColorPicker(nodeId, initial, screenX, screenY, onApply);
  }

  const isDistort = $derived(getCategorySlug(spec.category) === 'distort');

  function paramGridCols(node: HTMLElement) {
    if (!isDistort) return;
    const update = () => {
      requestAnimationFrame(() => {
        // Check if explicit columns count is set
        const explicitCols = node.getAttribute('data-explicit-cols');
        if (explicitCols) {
          const cols = parseInt(explicitCols, 10);
          if (!isNaN(cols)) {
            // Use explicit columns count, but still detect first/last row counts for border styling
            const items = node.children;
            if (items.length === 0) return;
            const firstTop = (items[0] as HTMLElement).getBoundingClientRect().top;
            let firstRowCols = 0;
            for (let i = 0; i < items.length; i++) {
              const top = (items[i] as HTMLElement).getBoundingClientRect().top;
              if (Math.abs(top - firstTop) < 2) firstRowCols++;
              else break;
            }
            const lastTop = (items[items.length - 1] as HTMLElement).getBoundingClientRect().top;
            let lastRowCols = 0;
            for (let i = items.length - 1; i >= 0; i--) {
              const top = (items[i] as HTMLElement).getBoundingClientRect().top;
              if (Math.abs(top - lastTop) < 2) lastRowCols++;
              else break;
            }
            node.setAttribute('data-cols', String(cols));
            node.setAttribute('data-first-row-cols', String(firstRowCols));
            node.setAttribute('data-last-row-cols', String(Math.max(1, lastRowCols)));
            return;
          }
        }
        
        // Fallback to dynamic detection
        const items = node.children;
        if (items.length === 0) return;
        const firstTop = (items[0] as HTMLElement).getBoundingClientRect().top;
        let cols = 0;
        for (let i = 0; i < items.length; i++) {
          const top = (items[i] as HTMLElement).getBoundingClientRect().top;
          if (Math.abs(top - firstTop) < 2) cols++;
          else break;
        }
        const firstRowCols = cols;
        // When first row has only 1 item (e.g. span-2-cols CoordPadCell), use second row's count
        // so we get correct vertical grid lines instead of data-cols=1 which removes all right borders
        if (cols === 1 && items.length > 1) {
          const secondRowTop = (items[1] as HTMLElement).getBoundingClientRect().top;
          cols = 0;
          for (let i = 1; i < items.length; i++) {
            const top = (items[i] as HTMLElement).getBoundingClientRect().top;
            if (Math.abs(top - secondRowTop) < 2) cols++;
            else break;
          }
        }
        const colsClamped = Math.max(1, Math.min(cols, 4));
        // Count cells in last row (for correct bottom-border removal)
        const lastTop = (items[items.length - 1] as HTMLElement).getBoundingClientRect().top;
        let lastRowCols = 0;
        for (let i = items.length - 1; i >= 0; i--) {
          const top = (items[i] as HTMLElement).getBoundingClientRect().top;
          if (Math.abs(top - lastTop) < 2) lastRowCols++;
          else break;
        }
        node.setAttribute('data-cols', String(colsClamped));
        node.setAttribute('data-first-row-cols', String(firstRowCols));
        node.setAttribute('data-last-row-cols', String(Math.max(1, lastRowCols)));
      });
    };
    const ro = new ResizeObserver(update);
    ro.observe(node);
    update();
    return {
      destroy() {
        ro.disconnect();
      }
    };
  }
</script>

<div
  class="node-body"
  style="width: {width}px; min-height: {bodyHeight}px; pointer-events: auto;"
  role="presentation"
>
  <div class="content">
    {#each layoutElements as element}
      {#if element.type === 'grid'}
        {#if layoutSectionVisible(element.visibleWhen, node, spec)}
        {@const gridEl = element}
        {@const headerToggle = gridEl.headerToggleParameter}
        {@const headerToggleSpec = headerToggle ? spec.parameters[headerToggle] : undefined}
        {@const headerToggleUi =
          headerToggle && headerToggleSpec
            ? getParamUIType(headerToggle, headerToggleSpec, gridEl.parameterUI)
            : null}
        {@const useHeaderToggle = Boolean(
          gridEl.label &&
            headerToggle &&
            headerToggleSpec &&
            headerToggleUi === 'toggle'
        )}
        {#if gridEl.label}
          {#if useHeaderToggle}
            <div class="group-header group-header-with-actions">
              <span class="group-header-label">{gridEl.label}</span>
              <div class="group-header-actions">
                <ParamPortWithAudioState
                  nodeId={nodeId}
                  paramName={headerToggle}
                  label={headerToggleSpec.label ?? headerToggle}
                  portId="{nodeId}-{headerToggle}"
                  portType="float"
                  showPort={false}
                  inlineControl={true}
                  inputMode={getInputMode(headerToggle)}
                  onParameterInputModeChanged={onParameterInputModeChanged
                    ? (mode) => onParameterInputModeChanged(headerToggle, mode)
                    : undefined}
                  {node}
                  {graph}
                  {audioSetup}
                  {nodeSpecs}
                  {getAudioManager}
                  getTimelineCurrentTime={getTimelineCurrentTime}
                  disabled={false}
                >
                  {#snippet children({ displayValue, useConfigForInput })}
                    <Toggle
                      value={displayValue}
                      onChange={(v) =>
                        onParameterChange(headerToggle, useConfigForInput ? v : effectiveToConfig(headerToggle, v))}
                    />
                  {/snippet}
                </ParamPortWithAudioState>
              </div>
            </div>
          {:else}
            <div class="group-header">{gridEl.label}</div>
          {/if}
        {/if}
        {@const validParams = gridEl.parameters.filter(
          (p) => spec.parameters[p] && (!useHeaderToggle || p !== gridEl.headerToggleParameter)
        )}
        {@const gridCols = gridEl.layout?.columns}
        <div
          class="param-grid"
          class:grid-cols-1={typeof gridCols === 'number' && gridCols === 1}
          class:grid-cols-2={typeof gridCols === 'number' && gridCols === 2}
          class:grid-cols-3={typeof gridCols === 'number' && gridCols === 3}
          class:grid-cols-4={typeof gridCols === 'number' && gridCols === 4}
          data-explicit-cols={typeof gridCols === 'number' ? String(gridCols) : undefined}
          use:paramGridCols
        >
          {#each validParams as paramName, i}
            {@const paramSpec = spec.parameters[paramName]}
            {@const prevParam = validParams[i - 1]}
            {@const prevIsCoords = prevParam && getParamUIType(prevParam, spec.parameters[prevParam], gridEl.parameterUI) === 'coords'}
            {@const prevIsCoordX = prevParam && (prevParam.endsWith('X') || prevParam.endsWith('x'))}
            {@const thisIsCoordY = paramName.endsWith('Y') || paramName.endsWith('y')}
            {@const skipAsCoordY = i > 0 && prevIsCoords && prevIsCoordX && thisIsCoordY}
            {@const paramSpanClass = gridEl.layout?.parameterSpan?.[paramName] ? `span-${gridEl.layout.parameterSpan[paramName]}-cols` : ''}
            {#if paramSpec && !skipAsCoordY}
              {@const uiType = getParamUIType(paramName, paramSpec, gridEl.parameterUI)}
              {#if uiType === 'bezier' || uiType === 'range'}
                <!-- Handled by layout elements -->
              {:else if uiType === 'coords'}
                {@const paramY = validParams[i + 1]}
                {@const coordsSpan = gridEl.layout?.coordsSpan ?? 2}
                {@const rawOrigin = gridEl.layout?.coordsOrigin}
                {@const coordsOrigin = typeof rawOrigin === 'object' && rawOrigin != null
                  ? (rawOrigin[paramName] ?? 'center')
                  : (rawOrigin ?? 'center')}
                {#if paramY && spec.parameters[paramY]}
                  {@const displacementAnchor =
                    gridEl.layout?.coordsDisplacementAnchor?.[paramName] ?? undefined}
                  <CoordPadCell
                    {nodeId}
                    {node}
                    {spec}
                    paramX={paramName}
                    paramY={paramY}
                    {coordsOrigin}
                    {displacementAnchor}
                    {graph}
                    {audioSetup}
                    {nodeSpecs}
                    {getAudioManager}
                    getTimelineCurrentTime={getTimelineCurrentTime}
                    onPortPointerDownForConnection={(sx, sy, pointerId) => onPortPointerDownForConnection?.(sx, sy, pointerId)}
                    onPortDoubleClick={(e, p) =>
                      onPortClickForSignalPicker?.(e.clientX, e.clientY, nodeId, p, e.currentTarget as HTMLElement)}
                    onParameterInputModeChanged={onParameterInputModeChanged}
                    onParameterChange={onParameterChange}
                    class="coord-pad-cell span-{coordsSpan}-cols"
                  />
                {/if}
              {:else if uiType === 'toggle'}
              <ParamPortWithAudioState
                nodeId={nodeId}
                paramName={paramName}
                label={paramSpec.label ?? paramName}
                portId="{nodeId}-{paramName}"
                portType="float"
                showPort={false}
                class={paramSpanClass}
                {node}
                {graph}
                {audioSetup}
                {nodeSpecs}
                {getAudioManager}
                getTimelineCurrentTime={getTimelineCurrentTime}
                disabled={false}
              >
                {#snippet children({ displayValue, useConfigForInput })}
                  <Toggle
                    value={displayValue}
                    onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                  />
                {/snippet}
              </ParamPortWithAudioState>
            {:else if uiType === 'enum'}
              <ParamPortWithAudioState
                nodeId={nodeId}
                paramName={paramName}
                label={paramSpec.label ?? paramName}
                portId="{nodeId}-{paramName}"
                portType="float"
                showPort={false}
                class={paramSpanClass}
                {node}
                {graph}
                {audioSetup}
                {nodeSpecs}
                {getAudioManager}
                getTimelineCurrentTime={getTimelineCurrentTime}
                disabled={false}
              >
                {#snippet children({ displayValue, useConfigForInput })}
                  {@const enumMap = getParameterEnumMappings(spec.id, paramName)}
                  {#if enumMap}
                    <EnumSelector
                      value={displayValue}
                      options={enumMap}
                      onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                    />
                  {/if}
                {/snippet}
              </ParamPortWithAudioState>
            {:else if uiType === 'input'}
              <ParamPortWithAudioState
                nodeId={nodeId}
                paramName={paramName}
                label={paramSpec.label ?? paramName}
                portId="{nodeId}-{paramName}"
                portType="float"
                showPort={showParamPort(paramName, paramSpec)}
                inputMode={getInputMode(paramName)}
                class={paramSpanClass}
                onParameterInputModeChanged={onParameterInputModeChanged ? (mode) => onParameterInputModeChanged(paramName, mode) : undefined}
                onPortPointerDown={(e) => onPortPointerDownForConnection?.(e.clientX, e.clientY, e.pointerId)}
                onPortDoubleClick={(e) => onPortClickForSignalPicker?.(e.clientX, e.clientY, nodeId, paramName, e.currentTarget as HTMLElement)}
                {node}
                {graph}
                {audioSetup}
                {nodeSpecs}
                {getAudioManager}
                getTimelineCurrentTime={getTimelineCurrentTime}
                disabled={false}
              >
                {#snippet children({ displayValue, useConfigForInput, configValue })}
                  <ValueInput
                    value={displayValue}
                    min={paramSpec.min ?? 0}
                    max={paramSpec.max ?? 1}
                    step={paramSpec.type === 'int' ? (paramSpec.step ?? 1) : (paramSpec.step ?? 0.01)}
                    decimals={paramSpec.type === 'int' ? 0 : (paramSpec.step && paramSpec.step >= 1 ? 0 : 3)}
                    onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                  />
                {/snippet}
              </ParamPortWithAudioState>
            {:else if uiType === 'knob'}
              {@const connInfo = getParamPortConnectionState(nodeId, paramName, graph, audioSetup)}
              <ParamPortWithAudioState
                nodeId={nodeId}
                paramName={paramName}
                label={paramSpec.label ?? paramName}
                portId="{nodeId}-{paramName}"
                portType="float"
                showPort={showParamPort(paramName, paramSpec)}
                inputMode={getInputMode(paramName)}
                class={paramSpanClass}
                onParameterInputModeChanged={onParameterInputModeChanged ? (mode) => onParameterInputModeChanged(paramName, mode) : undefined}
                onPortPointerDown={(e) => onPortPointerDownForConnection?.(e.clientX, e.clientY, e.pointerId)}
                onPortDoubleClick={(e) => onPortClickForSignalPicker?.(e.clientX, e.clientY, nodeId, paramName, e.currentTarget as HTMLElement)}
                {node}
                {graph}
                {audioSetup}
                {nodeSpecs}
                {getAudioManager}
                getTimelineCurrentTime={getTimelineCurrentTime}
                disabled={false}
              >
                {#snippet children({ displayValue, useConfigForInput, configValue })}
                  <Knob
                    value={displayValue}
                    min={paramSpec.min ?? 0}
                    max={paramSpec.max ?? 1}
                    step={paramSpec.type === 'int' ? (paramSpec.step ?? 1) : (paramSpec.step ?? 0.01)}
                    decimals={paramSpec.type === 'int' ? 0 : (paramSpec.step && paramSpec.step >= 1 ? 0 : 3)}
                    connected={connInfo.state !== 'default'}
                    knobPolarity={paramSpec.knobPolarity ?? 'one-sided'}
                    knobCenter={paramSpec.knobCenter ?? 0}
                    onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                  />
                {/snippet}
              </ParamPortWithAudioState>
            {:else}
              <!-- Unknown UI type, fallback to ValueInput -->
              <ParamPortWithAudioState
                nodeId={nodeId}
                paramName={paramName}
                label={paramSpec.label ?? paramName}
                portId="{nodeId}-{paramName}"
                portType="float"
                showPort={showParamPort(paramName, paramSpec)}
                inputMode={getInputMode(paramName)}
                class={paramSpanClass}
                onParameterInputModeChanged={onParameterInputModeChanged ? (mode) => onParameterInputModeChanged(paramName, mode) : undefined}
                onPortPointerDown={(e) => onPortPointerDownForConnection?.(e.clientX, e.clientY, e.pointerId)}
                onPortDoubleClick={(e) => onPortClickForSignalPicker?.(e.clientX, e.clientY, nodeId, paramName, e.currentTarget as HTMLElement)}
                {node}
                {graph}
                {audioSetup}
                {nodeSpecs}
                {getAudioManager}
                getTimelineCurrentTime={getTimelineCurrentTime}
                disabled={false}
              >
                {#snippet children({ displayValue, useConfigForInput, configValue })}
                  <ValueInput
                    value={displayValue}
                    min={paramSpec.min ?? 0}
                    max={paramSpec.max ?? 1}
                    step={paramSpec.type === 'int' ? (paramSpec.step ?? 1) : (paramSpec.step ?? 0.01)}
                    decimals={paramSpec.type === 'int' ? 0 : (paramSpec.step && paramSpec.step >= 1 ? 0 : 3)}
                    onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                  />
                {/snippet}
              </ParamPortWithAudioState>
            {/if}
          {/if}
        {/each}
        </div>
        {/if}
      {:else if element.type === 'auto-grid'}
        {@const params = Object.keys(spec.parameters)}
        <div class="param-grid" use:paramGridCols>
          {#each params as paramName}
            {@const paramSpec = spec.parameters[paramName]}
            {#if paramSpec}
              {@const uiType = getParamUIType(paramName, paramSpec)}
              {#if uiType === 'bezier' || uiType === 'range'}
                <!-- Handled by layout elements -->
              {:else if uiType === 'toggle'}
                <ParamPortWithAudioState
                  nodeId={nodeId}
                  paramName={paramName}
                  label={paramSpec.label ?? paramName}
                  portId="{nodeId}-{paramName}"
                  portType="float"
                  showPort={false}
                  {node}
                  {graph}
                  {audioSetup}
                  {nodeSpecs}
                  {getAudioManager}
                  getTimelineCurrentTime={getTimelineCurrentTime}
                  disabled={false}
                >
                  {#snippet children({ displayValue, useConfigForInput })}
                    <Toggle
                      value={displayValue}
                      onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                    />
                  {/snippet}
                </ParamPortWithAudioState>
              {:else if uiType === 'enum'}
                <ParamPortWithAudioState
                  nodeId={nodeId}
                  paramName={paramName}
                  label={paramSpec.label ?? paramName}
                  portId="{nodeId}-{paramName}"
                  portType="float"
                  showPort={false}
                  {node}
                  {graph}
                  {audioSetup}
                  {nodeSpecs}
                  {getAudioManager}
                  getTimelineCurrentTime={getTimelineCurrentTime}
                  disabled={false}
                >
                  {#snippet children({ displayValue, useConfigForInput })}
                    {@const enumMap = getParameterEnumMappings(spec.id, paramName)}
                    {#if enumMap}
                      <EnumSelector
                        value={displayValue}
                        options={enumMap}
                        onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                      />
                    {/if}
                  {/snippet}
                </ParamPortWithAudioState>
              {:else if uiType === 'input'}
                <ParamPortWithAudioState
                  nodeId={nodeId}
                  paramName={paramName}
                  label={paramSpec.label ?? paramName}
                  portId="{nodeId}-{paramName}"
                  portType="float"
                  showPort={showParamPort(paramName, paramSpec)}
                  inputMode={getInputMode(paramName)}
                  onParameterInputModeChanged={onParameterInputModeChanged ? (mode) => onParameterInputModeChanged(paramName, mode) : undefined}
                  onPortPointerDown={(e) => onPortPointerDownForConnection?.(e.clientX, e.clientY, e.pointerId)}
                onPortDoubleClick={(e) => onPortClickForSignalPicker?.(e.clientX, e.clientY, nodeId, paramName, e.currentTarget as HTMLElement)}
                  {node}
                  {graph}
                  {audioSetup}
                  {nodeSpecs}
                  {getAudioManager}
                  getTimelineCurrentTime={getTimelineCurrentTime}
                  disabled={false}
                >
                  {#snippet children({ displayValue, useConfigForInput, configValue })}
                    <ValueInput
                      value={displayValue}
                      min={paramSpec.min ?? 0}
                      max={paramSpec.max ?? 1}
                      step={paramSpec.type === 'int' ? (paramSpec.step ?? 1) : (paramSpec.step ?? 0.01)}
                      decimals={paramSpec.type === 'int' ? 0 : (paramSpec.step && paramSpec.step >= 1 ? 0 : 3)}
                      onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                    />
                  {/snippet}
                </ParamPortWithAudioState>
            {:else if uiType === 'knob'}
              {@const connInfo = getParamPortConnectionState(nodeId, paramName, graph, audioSetup)}
              <ParamPortWithAudioState
                nodeId={nodeId}
                paramName={paramName}
                label={paramSpec.label ?? paramName}
                portId="{nodeId}-{paramName}"
                portType="float"
                showPort={showParamPort(paramName, paramSpec)}
                inputMode={getInputMode(paramName)}
                onParameterInputModeChanged={onParameterInputModeChanged ? (mode) => onParameterInputModeChanged(paramName, mode) : undefined}
                onPortPointerDown={(e) => onPortPointerDownForConnection?.(e.clientX, e.clientY, e.pointerId)}
                onPortDoubleClick={(e) => onPortClickForSignalPicker?.(e.clientX, e.clientY, nodeId, paramName, e.currentTarget as HTMLElement)}
                {node}
                {graph}
                {audioSetup}
                {nodeSpecs}
                {getAudioManager}
                getTimelineCurrentTime={getTimelineCurrentTime}
                disabled={false}
              >
                {#snippet children({ displayValue, useConfigForInput, configValue })}
                  <Knob
                    value={displayValue}
                    min={paramSpec.min ?? 0}
                    max={paramSpec.max ?? 1}
                    step={paramSpec.type === 'int' ? (paramSpec.step ?? 1) : (paramSpec.step ?? 0.01)}
                    decimals={paramSpec.type === 'int' ? 0 : (paramSpec.step && paramSpec.step >= 1 ? 0 : 3)}
                    connected={connInfo.state !== 'default'}
                    knobPolarity={paramSpec.knobPolarity ?? 'one-sided'}
                    knobCenter={paramSpec.knobCenter ?? 0}
                    onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                  />
                {/snippet}
              </ParamPortWithAudioState>
              {:else}
                <!-- Unknown UI type, fallback to ValueInput -->
                <ParamPortWithAudioState
                  nodeId={nodeId}
                  paramName={paramName}
                  label={paramSpec.label ?? paramName}
                  portId="{nodeId}-{paramName}"
                  portType="float"
                  showPort={showParamPort(paramName, paramSpec)}
                  inputMode={getInputMode(paramName)}
                  onParameterInputModeChanged={onParameterInputModeChanged ? (mode) => onParameterInputModeChanged(paramName, mode) : undefined}
                  onPortPointerDown={(e) => onPortPointerDownForConnection?.(e.clientX, e.clientY, e.pointerId)}
                onPortDoubleClick={(e) => onPortClickForSignalPicker?.(e.clientX, e.clientY, nodeId, paramName, e.currentTarget as HTMLElement)}
                  {node}
                  {graph}
                  {audioSetup}
                  {nodeSpecs}
                  {getAudioManager}
                  getTimelineCurrentTime={getTimelineCurrentTime}
                  disabled={false}
                >
                  {#snippet children({ displayValue, useConfigForInput, configValue })}
                    <ValueInput
                      value={displayValue}
                      min={paramSpec.min ?? 0}
                      max={paramSpec.max ?? 1}
                      step={paramSpec.type === 'int' ? (paramSpec.step ?? 1) : (paramSpec.step ?? 0.01)}
                      decimals={paramSpec.type === 'int' ? 0 : (paramSpec.step && paramSpec.step >= 1 ? 0 : 3)}
                      onChange={(v) => onParameterChange(paramName, useConfigForInput ? v : effectiveToConfig(paramName, v))}
                    />
                  {/snippet}
                </ParamPortWithAudioState>
              {/if}
            {/if}
          {/each}
        </div>
      {:else if element.type === 'coord-pad'}
        {@const [paramX, paramY] = element.parameters}
        <div class="element coord-pad-wrap">
          <CoordPadCell
            {nodeId}
            {node}
            {spec}
            paramX={paramX}
            paramY={paramY}
            coordsOrigin={element.coordsOrigin}
            {graph}
            {audioSetup}
            {nodeSpecs}
            {getAudioManager}
            getTimelineCurrentTime={getTimelineCurrentTime}
            onPortPointerDownForConnection={(sx, sy, pointerId) => onPortPointerDownForConnection?.(sx, sy, pointerId)}
            onPortDoubleClick={(e, paramName) =>
              onPortClickForSignalPicker?.(e.clientX, e.clientY, nodeId, paramName, e.currentTarget as HTMLElement)}
            onParameterInputModeChanged={onParameterInputModeChanged}
            onParameterChange={onParameterChange}
          />
        </div>
      {:else if element.type === 'remap-range'}
        <div class="element remap-range">
          <RemapRangeEditor
            inMin={getParamValue('inMin')}
            inMax={getParamValue('inMax')}
            outMin={getParamValue('outMin')}
            outMax={getParamValue('outMax')}
            min={-1000}
            max={1000}
            onChange={(p) => {
              onParameterChange('inMin', p.inMin);
              onParameterChange('inMax', p.inMax);
              onParameterChange('outMin', p.outMin);
              onParameterChange('outMax', p.outMax);
            }}
          />
        </div>
      {:else if element.type === 'bezier-editor'}
        {@const params = element.parameters ?? ['x1', 'y1', 'x2', 'y2']}
        <div class="element bezier-editor-wrap">
          <BezierEditor
            x1={getParamValue(params[0])}
            y1={getParamValue(params[1])}
            x2={getParamValue(params[2])}
            y2={getParamValue(params[3])}
            onChange={(p) => {
              onParameterChange(params[0], p.x1);
              onParameterChange(params[1], p.y1);
              onParameterChange(params[2], p.x2);
              onParameterChange(params[3], p.y2);
            }}
          />
        </div>
      {:else if element.type === 'bezier-editor-row'}
        {#if element.label}
          <div class="group-header">{element.label}</div>
        {/if}
        {@const editors = element.editors}
        <div class="element bezier-row">
          {#each editors as editorParams}
            <div class="bezier-item">
              <BezierEditor
                x1={getParamValue(editorParams[0])}
                y1={getParamValue(editorParams[1])}
                x2={getParamValue(editorParams[2])}
                y2={getParamValue(editorParams[3])}
                onChange={(p) => {
                  onParameterChange(editorParams[0], p.x1);
                  onParameterChange(editorParams[1], p.y1);
                  onParameterChange(editorParams[2], p.x2);
                  onParameterChange(editorParams[3], p.y2);
                }}
              />
            </div>
          {/each}
        </div>
      {:else if element.type === 'color-map-preview'}
        {#if element.label}
          <div class="group-header">{element.label}</div>
        {/if}
        <div class="element color-map-preview-wrap">
          <ColorMapPreview
            node={node}
            spec={spec}
            mode={element.mode}
            height={element.height}
          />
        </div>
      {:else if element.type === 'color-picker'}
        {@const paramNames = element.parameters ?? ['l', 'c', 'h']}
        {@const color = {
          l: getParamValue(paramNames[0]),
          c: getParamValue(paramNames[1]),
          h: getParamValue(paramNames[2])
        }}
        <div class="element color-picker-wrap">
          <ColorPicker
            color={color}
            onClick={(sx, sy) => showColorPicker(color, sx, sy, (l, c, h) => {
              onParameterChange(paramNames[0], l);
              onParameterChange(paramNames[1], c);
              onParameterChange(paramNames[2], h);
            })}
          />
        </div>
      {:else if element.type === 'color-picker-row'}
        {#if layoutSectionVisible(element.visibleWhen, node, spec)}
          {@const [startParams, endParams] = element.pickers}
          {#if element.label}
            <div class="group-header group-header-with-actions">
              <span class="group-header-label">{element.label}</span>
              <div class="group-header-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  class="group-header-btn"
                  onclick={() => {
                    const sL = getParamValue(startParams[0]);
                    const sC = getParamValue(startParams[1]);
                    const sH = getParamValue(startParams[2]);
                    const eL = getParamValue(endParams[0]);
                    const eC = getParamValue(endParams[1]);
                    const eH = getParamValue(endParams[2]);
                    onParameterChange(startParams[0], eL);
                    onParameterChange(startParams[1], eC);
                    onParameterChange(startParams[2], eH);
                    onParameterChange(endParams[0], sL);
                    onParameterChange(endParams[1], sC);
                    onParameterChange(endParams[2], sH);
                  }}
                >
                  Swap Colors
                </Button>
                {#if spec.parameters?.reverseHue != null}
                  {@const rev = getParamValue('reverseHue')}
                  <Button
                    variant="secondary"
                    size="sm"
                    class="group-header-btn group-header-btn-toggle {rev > 0 ? 'is-active' : ''}"
                    onclick={() => onParameterChange('reverseHue', rev > 0 ? 0 : 1)}
                  >
                    Reverse Hue
                  </Button>
                {/if}
              </div>
            </div>
          {/if}
          {@const startColor = {
            l: getParamValue(startParams[0]),
            c: getParamValue(startParams[1]),
            h: getParamValue(startParams[2])
          }}
          {@const endColor = {
            l: getParamValue(endParams[0]),
            c: getParamValue(endParams[1]),
            h: getParamValue(endParams[2])
          }}
          <div class="element color-picker-row-wrap">
            <ColorPickerRow
              startColor={startColor}
              endColor={endColor}
              onStartColorClick={(sx, sy) => showColorPicker(startColor, sx, sy, (l, c, h) => {
                onParameterChange(startParams[0], l);
                onParameterChange(startParams[1], c);
                onParameterChange(startParams[2], h);
              })}
              onEndColorClick={(sx, sy) => showColorPicker(endColor, sx, sy, (l, c, h) => {
                onParameterChange(endParams[0], l);
                onParameterChange(endParams[1], c);
                onParameterChange(endParams[2], h);
              })}
            />
          </div>
        {/if}
      {:else if element.type === 'color-picker-row-with-ports'}
        {@const [startParams, endParams] = element.pickers}
        {@const startColor = {
          l: getParamValue(startParams[0]),
          c: getParamValue(startParams[1]),
          h: getParamValue(startParams[2])
        }}
        {@const endColor = {
          l: getParamValue(endParams[0]),
          c: getParamValue(endParams[1]),
          h: getParamValue(endParams[2])
        }}
        <div class="element color-picker-row-wrap">
          <ColorPickerRow
            startColor={startColor}
            endColor={endColor}
            onStartColorClick={(sx, sy) => showColorPicker(startColor, sx, sy, (l, c, h) => {
              onParameterChange(startParams[0], l);
              onParameterChange(startParams[1], c);
              onParameterChange(startParams[2], h);
            })}
            onEndColorClick={(sx, sy) => showColorPicker(endColor, sx, sy, (l, c, h) => {
              onParameterChange(endParams[0], l);
              onParameterChange(endParams[1], c);
              onParameterChange(endParams[2], h);
            })}
          />
        </div>
      {:else if element.type === 'frequency-range'}
        {@const bandIndex = element.bandIndex ?? 0}
        {@const bands = getArrayParamValue(element.parameter, bandIndex)}
        <div class="element frequency-range-wrap">
          <FrequencyRangeEditor
            frequencyBands={[[bands[0], bands[1]]]}
            onChange={(b) => {
              const arr = (node.parameters[element.parameter] as number[][]) ?? [];
              const updated = [...arr];
              if (!updated[bandIndex]) updated[bandIndex] = [0, 1];
              updated[bandIndex] = [b[0][0], b[0][1]];
              onParameterChange(element.parameter, updated);
            }}
          />
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  /* NodeBody Styles */

  .node-body {
    /* Layout */
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    flex: 1;
    min-height: 0;

    /* Box model */
    padding: var(--node-body-padding);
    border-radius: var(--node-body-border-radius) var(--node-body-border-radius) 0 0;
    box-shadow:
      inset 0 3px 1px -3px var(--node-body-shadow-inset),
      0 6px 30px -6px var(--node-body-shadow-color-mid),
      0 12px 60px -12px var(--node-body-shadow-color-outer);

    /* Other */
    overflow: hidden;

    .content {
      /* Layout */
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      gap: var(--param-grid-gap);

      .group-header {
        /* Box model */
        padding: var(--pd-md) var(--pd-xl);

        /* Typography */
        font-size: var(--text-3xl);
        font-weight: 900;
        color: var(--param-group-header-color);

        &.group-header-with-actions {
          /* Layout */
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--pd-md);

          .group-header-label {
            flex-shrink: 0;
          }

          .group-header-actions {
            /* Layout */
            display: flex;
            align-items: center;
            gap: var(--color-map-row-button-gap, var(--pd-sm));
            flex-shrink: 0;
          }

          /* Button component receives these classes; styles apply via :global to its root */
          :global(.group-header-btn) {
            /* Layout */
            display: inline-flex;
            align-items: center;
            justify-content: center;

            /* Box model */
            height: var(--color-map-row-button-height, 24px);
            padding: 0 var(--pd-md);
            border: 1px solid var(--color-gray-70);
            border-radius: var(--color-map-row-button-radius, var(--radius-md));
            background: var(--color-gray-30);

            /* Typography */
            font-size: var(--color-map-row-button-font-size, var(--text-md));
            font-weight: var(--color-map-row-button-font-weight, 600);
            color: var(--param-group-header-color);

            /* Other */
            cursor: default;
            transition:
              background var(--motion-effects-fast-duration) var(--motion-effects-fast-easing),
              border-color var(--motion-effects-fast-duration) var(--motion-effects-fast-easing),
              color var(--motion-effects-fast-duration) var(--motion-effects-fast-easing);
          }

          :global(.group-header-btn:hover) {
            background: var(--color-gray-50);
            border-color: var(--color-gray-80);
          }

          :global(.group-header-btn.group-header-btn-toggle.is-active) {
            background: var(--color-map-row-button-bg-active, var(--color-teal-100));
            border-color: var(--color-map-row-button-border-active, var(--color-teal-120));
            color: var(--color-map-row-button-color-active, var(--color-teal-10));
          }
        }
      }

      .param-grid {
        /* Layout */
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
        gap: var(--param-grid-gap);

        /* Other */
        overflow: hidden;

        :global(.param-cell) {
          /* Layout */
          flex: 1 1 var(--param-cell-min-width);

          /* Box model */
          min-width: var(--param-cell-min-width);
        }

        :global(.param-cell.span-2-cols) {
          /* Layout */
          flex: 2 2 var(--param-cell-min-width);

          /* Box model */
          min-width: calc(2 * var(--param-cell-min-width) + var(--param-grid-gap));
        }

        :global(.param-cell.span-3-cols) {
          /* Layout */
          flex: 3 3 var(--param-cell-min-width);

          /* Box model */
          min-width: calc(3 * var(--param-cell-min-width) + 2 * var(--param-grid-gap));
        }

        /* 1-column grid: vertical stack */
        &.grid-cols-1 {
          display: grid;
          grid-template-columns: 1fr;

          :global(.param-cell) {
            flex: unset;
            min-width: 0;
          }
        }

        /* 2-column grid: Row 1 = CoordPad(2) centered, Row 2 = 2 cells */
        &.grid-cols-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);

          :global(.param-cell) {
            flex: unset;
            min-width: 0;
          }

          :global(.param-cell.span-2-cols) {
            grid-column: span 2;
            flex: unset;
            min-width: 0;
          }
        }

        /* 3-column grid: Row 1 = CoordPad(2) + cell(1), Row 2 = 3 cells */
        &.grid-cols-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);

          :global(.param-cell) {
            flex: unset;
            min-width: 0;
          }

          :global(.param-cell.span-2-cols) {
            grid-column: span 2;
            flex: unset;
            min-width: 0;
          }

          :global(.param-cell.span-3-cols) {
            grid-column: span 3;
            flex: unset;
            min-width: 0;
          }
        }

        /* 4-column grid: consistent row rhythm for pose / spec strips */
        &.grid-cols-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);

          :global(.param-cell) {
            flex: unset;
            min-width: 0;
          }

          :global(.param-cell.span-2-cols) {
            grid-column: span 2;
            flex: unset;
            min-width: 0;
          }

          :global(.param-cell.span-3-cols) {
            grid-column: span 3;
            flex: unset;
            min-width: 0;
          }
        }
      }

      .element {
        /* Box model */
        width: 100%;

        /* Bezier: fill content so no extra gap at bottom */
        &.bezier-editor-wrap {
          flex: 1;
          min-height: 0;
        }

        &.color-picker-wrap,
        &.color-picker-row-wrap {
          /* Layout */
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: var(--color-picker-node-swatch-height);
        }

        &.bezier-row {
          /* Layout */
          display: flex;
          flex: 1;
          min-height: 0;
          gap: var(--param-grid-gap);

          .bezier-item {
            /* Layout */
            flex: 1;

            /* Box model */
            min-width: 0;
          }
        }

      }
    }
  }
</style>
