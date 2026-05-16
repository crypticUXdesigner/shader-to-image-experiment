<script lang="ts">
  /**
   * Node
   * Root container for DOM node. Position via transform, selection state, drag handle.
   */

  import NodeHeader from './NodeHeader.svelte';
  import NodeBody from './NodeBody.svelte';
  import {
    getCategorySlug,
    isSystemInputNode,
    isStructuredPatternNode,
    isDerivedShapeNode,
    isWarpDistortNode,
    isFunctionsMathNode,
    isAdvancedMathNode,
    isStylizeEffectsNode,
    isSdfRaymarcherNode,
    isShinyNode,
  } from '../../../utils/cssTokens';
  import type { NodeInstance, NodeGraph, GraphUndoRecordingOptions } from '../../../data-model/types';
  import type { NodeSpec } from '../../../types/nodeSpec';
  import type { DomNodeMetrics } from './types';
  import type { AudioSetup } from '../../../data-model/audioSetupTypes';
  import type { IAudioManager } from '../../../runtime/types';
  import { createStrictDoubleClickHandler } from '../../utils/strictDoubleClick';

  interface Props {
    nodeId: string;
    node: NodeInstance;
    spec: NodeSpec;
    metrics: DomNodeMetrics;
    /** Palette/add-picker spawn: brief entrance emphasis (CSS). */
    justLanded?: boolean;
    /** Patch tool: this node is the insert target (double-click or pick); next step is cable. */
    patchIntoInsertPick?: boolean;
    selected: boolean;
    graph: NodeGraph;
    audioSetup: AudioSetup;
    nodeSpecs: Map<string, NodeSpec>;
    getAudioManager?: () => IAudioManager | undefined;
    /** Current timeline time for automation-driven parameter display. */
    getTimelineCurrentTime?: () => number;
    overlayBridge?: import('../../../types/editor').CanvasOverlayBridge | null;
    onPortPointerDownForConnection?: (screenX: number, screenY: number, pointerId?: number) => void;
    onPortClickForSignalPicker?: (screenX: number, screenY: number, nodeId: string, paramName: string, triggerElement?: HTMLElement | null) => void;
    onHeaderPortPointerDown?: (screenX: number, screenY: number, pointerId?: number) => void;
    nodePosition: { x: number; y: number };
    onDrag: (nodeId: string, clientX: number, clientY: number, shiftKey: boolean) => void;
    onSelect: (nodeId: string, multiSelect: boolean) => void;
    onLabelChange: (nodeId: string, label: string | undefined) => void;
    onParameterChange: (
      nodeId: string,
      paramName: string,
      value: import('../../../data-model/types').ParameterValue,
      options?: GraphUndoRecordingOptions
    ) => void;
    onParameterGestureCommit?: () => void;
    onParameterInputModeChanged?: (nodeId: string, paramName: string, mode: import('../../../types/nodeSpec').ParameterInputMode) => void;
    onContextMenu?: (nodeId: string, clientX: number, clientY: number) => void;
    /** Double-click node chrome outside interactive controls → Patch tool: insert this node into a cable on next click. */
    onPatchIntoDoubleClick?: (nodeId: string) => void;
    onPowerToggle?: (nodeId: string, bypassed: boolean) => void;
  }

  let {
    nodeId,
    node,
    spec,
    metrics,
    justLanded = false,
    patchIntoInsertPick = false,
    selected,
    graph,
    audioSetup,
    nodeSpecs,
    getAudioManager,
    getTimelineCurrentTime,
    overlayBridge = null,
    onPortPointerDownForConnection,
    onPortClickForSignalPicker,
    onHeaderPortPointerDown,
    nodePosition,
    onDrag,
    onSelect,
    onLabelChange,
    onParameterChange,
    onParameterGestureCommit,
    onParameterInputModeChanged,
    onContextMenu,
    onPatchIntoDoubleClick,
    onPowerToggle,
  }: Props = $props();

  const label = $derived(node.label ?? spec.displayName);
  const categorySlug = $derived(getCategorySlug(spec.category));
  const isSystemInput = $derived(isSystemInputNode(spec.id, spec.category));
  const isStructuredPattern = $derived(isStructuredPatternNode(spec.id, spec.category));
  const isDerivedShape = $derived(isDerivedShapeNode(spec.id, spec.category));
  const isWarpDistort = $derived(isWarpDistortNode(spec.id, spec.category));
  const isFunctionsMath = $derived(isFunctionsMathNode(spec.id, spec.category));
  const isAdvancedMath = $derived(isAdvancedMathNode(spec.id, spec.category));
  const isStylizeEffects = $derived(isStylizeEffectsNode(spec.id, spec.category));
  const isSdfRaymarcher = $derived(isSdfRaymarcherNode(spec.id, spec.category));
  const isShiny = $derived(isShinyNode(spec.id, spec.category));

  function handleHeaderDragStart(clientX: number, clientY: number, shiftKey: boolean) {
    onDrag(nodeId, clientX, clientY, shiftKey);
  }

  /** Patch-into mode: skip label rename (stopped in header), ports/buttons, and parameter controls. */
  function handlePatchIntoDoubleClick(e: MouseEvent) {
    if (!onPatchIntoDoubleClick) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (
      t.closest(
        'button, input, textarea, select, .value-input-wrapper, .knob, .param-port, [role="textbox"], .toggle, .bezier-editor, .color-picker-row, .coord-pad, .coord-pad-cell, .remap-range-editor, .frequency-range-editor, .enum-selector-trigger'
      )
    ) {
      return;
    }
    e.preventDefault();
    onPatchIntoDoubleClick(nodeId);
  }

  const patchStrictDoubleClick = createStrictDoubleClickHandler((e: MouseEvent) =>
    handlePatchIntoDoubleClick(e)
  );

  function handleClick(e: MouseEvent) {
    onSelect(nodeId, e.shiftKey);
    if (onPatchIntoDoubleClick) patchStrictDoubleClick(e);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events - Node is a custom region; selection and context menu are handled by parent/canvas; keyboard handled elsewhere -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions - Node is a custom region; selection and context menu are handled by parent/canvas; keyboard handled elsewhere -->
<div
  class="node {categorySlug} {isSystemInput ? 'system-input' : ''} {isStructuredPattern ? 'structured' : ''} {isDerivedShape ? 'derived' : ''} {isWarpDistort ? 'warp' : ''} {isFunctionsMath ? 'functions' : ''} {isAdvancedMath ? 'advanced' : ''} {isStylizeEffects ? 'stylize' : ''} {isSdfRaymarcher ? 'raymarcher' : ''} {isShiny ? 'shiny' : ''} {justLanded ? 'landed' : ''} {patchIntoInsertPick ? 'patch-insert-pick' : ''} {selected ? 'selected' : ''} {node.bypassed ? 'is-bypassed' : ''}"
  data-node-id={nodeId}
  style="--node-x: {node.position.x}px; --node-y: {node.position.y}px; transform: translate(var(--node-x), var(--node-y)); width: {metrics.width}px; min-height: {metrics.height}px;"
  role="article"
  aria-label="Node: {label}"
  onclick={handleClick}
  oncontextmenu={(e) => {
      e.preventDefault();
      onContextMenu?.(nodeId, e.clientX, e.clientY);
    }}
>
  <NodeHeader
    spec={spec}
    label={node.label ?? ''}
    headerHeight={metrics.headerHeight}
    inputPortPositions={metrics.inputPortPositions}
    outputPortPositions={metrics.outputPortPositions}
    nodePosition={nodePosition}
    nodeId={nodeId}
    bypassed={node.bypassed === true}
    onPowerToggle={onPowerToggle}
    onHeaderPortPointerDown={onHeaderPortPointerDown}
    onLabelChange={(l) => onLabelChange(nodeId, l)}
    onDragStart={handleHeaderDragStart}
  />
  {#if metrics.height > metrics.headerHeight}
  <NodeBody
    nodeId={nodeId}
    node={node}
    spec={spec}
    width={metrics.width}
    headerHeight={metrics.headerHeight}
    height={metrics.height}
    graph={graph}
    audioSetup={audioSetup}
    nodeSpecs={nodeSpecs}
    getAudioManager={getAudioManager ? () => getAudioManager() ?? null : undefined}
    getTimelineCurrentTime={getTimelineCurrentTime}
    overlayBridge={overlayBridge}
    onPortPointerDownForConnection={onPortPointerDownForConnection}
    onPortClickForSignalPicker={onPortClickForSignalPicker}
    onParameterChange={(paramName, value, options) => onParameterChange(nodeId, paramName, value, options)}
    onParameterGestureCommit={onParameterGestureCommit}
    onParameterInputModeChanged={onParameterInputModeChanged ? (paramName, mode) => onParameterInputModeChanged(nodeId, paramName, mode) : undefined}
  />
  {/if}
</div>

<style>
  .node {
    position: absolute;
    left: 0;
    top: 0;
    box-sizing: border-box;
    border-radius: var(--node-box-border-radius);
    border: 1px solid var(--node-border);
    box-shadow: var(--node-box-shadow);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    transition:
      box-shadow var(--motion-effects-fast-duration) var(--motion-effects-fast-easing),
      border-color var(--motion-effects-fast-duration) var(--motion-effects-fast-easing);

    &.shiny:not(.selected) {
      border-color: var(--node-shiny-ring-color);
      box-shadow:
        0 0 0 var(--node-shiny-ring-width) var(--node-shiny-ring-color),
        0 0 var(--node-shiny-glow-radius) var(--node-shiny-glow-color),
        var(--node-box-shadow);
    }

    &.selected {
      border-color: var(--node-border-selected);
      box-shadow:
        0 0 0 5px var(--node-border-selected),
        var(--node-box-shadow-selected);
    }

    &.selected.shiny {
      border-color: var(--node-border-selected);
      box-shadow:
        0 0 0 var(--node-shiny-ring-width) var(--node-shiny-ring-color),
        0 0 0 5px var(--node-border-selected),
        0 0 var(--node-shiny-glow-radius) var(--node-shiny-glow-color),
        0 0 var(--node-shiny-selected-outer-glow-radius) var(--node-shiny-selected-outer-glow),
        var(--node-box-shadow-selected);
    }

    /* Patch-into: waiting for cable — teal ring reads as “tool intent”, distinct from selection blue */
    &.patch-insert-pick {
      border-color: var(--node-border-patch-insert);
      box-shadow:
        0 0 0 var(--node-patch-insert-ring-width) var(--node-border-patch-insert),
        var(--node-box-shadow-patch-insert);
    }

    /* Tie-break over &.shiny:not(.selected) when shiny node is insert pick but not yet selected */
    &.shiny.patch-insert-pick {
      border-color: var(--node-border-patch-insert);
      box-shadow:
        0 0 0 var(--node-patch-insert-ring-width) var(--node-border-patch-insert),
        var(--node-box-shadow-patch-insert);
    }

    /* Intro: position via --node-x/--node-y so translate + scale can run on the same element */
    &.landed {
      animation: node-land-pop 260ms cubic-bezier(0.22, 1, 0.32, 1) forwards;
    }

    @keyframes node-land-pop {
      0% {
        opacity: 0.55;
        transform: translate(var(--node-x, 0px), var(--node-y, 0px)) scale(0.86);
      }
      100% {
        opacity: 1;
        transform: translate(var(--node-x, 0px), var(--node-y, 0px)) scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &.landed {
        animation: none;
      }
    }

    &.is-bypassed :global(.node-body) {
      opacity: var(--opacity-disabled);
      transition: opacity 150ms var(--motion-effects-fast-easing);
    }

    @media (prefers-reduced-motion: reduce) {
      &.is-bypassed :global(.node-body) {
        transition: none;
      }
    }
  }
</style>
