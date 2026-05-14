<script lang="ts">
  /**
   * Draggable floating shell for the timeline + optional curve editor (see `FloatingPanel`).
   * Timeline body is stacked above the curve editor when the latter is open.
   */
  import { setContext } from 'svelte';
  import FloatingPanel from '../floating-panel/FloatingPanel.svelte';
  import {
    TIMELINE_FLOATING_HEADER_HOST,
    type TimelineFloatingHeaderHostGetter,
  } from './timelineFloatingHeaderContext';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    onPositionChange: (x: number, y: number) => void;
    onClose: () => void;
    /** When true, reserve the fixed-height band below the timeline for `curveSlot`. */
    curveSlotActive: boolean;
    timelineSlot?: import('svelte').Snippet<[]>;
    curveSlot?: import('svelte').Snippet<[]>;
  }

  let {
    open,
    x,
    y,
    onPositionChange,
    onClose,
    curveSlotActive,
    timelineSlot,
    curveSlot,
  }: Props = $props();

  let floatingHeaderMountEl = $state<HTMLDivElement | null>(null);
  setContext<TimelineFloatingHeaderHostGetter>(TIMELINE_FLOATING_HEADER_HOST, () => floatingHeaderMountEl);
</script>

{#snippet floatingHeaderMountSnippet()}
  <div bind:this={floatingHeaderMountEl} class="timeline-floating-header-mount"></div>
{/snippet}

<FloatingPanel
  {open}
  {x}
  {y}
  {onPositionChange}
  {onClose}
  dragSurface="grip-only"
  showCloseButton={false}
  mainOverflow="hidden"
  closeOnClickOutside={false}
  ariaLabel="Timeline and automation"
  class="timeline-floating-panel-shell"
  headerInset={floatingHeaderMountSnippet}
>
  {#snippet children()}
    <div
      class="shell-root frame"
      class:has-curve={curveSlotActive}
      role="presentation"
    >
      <div class="timeline-band">
        {#if timelineSlot}
          {@render timelineSlot()}
        {/if}
      </div>
      {#if curveSlotActive}
        <div class="curve-band">
          {#if curveSlot}
            {@render curveSlot()}
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}
</FloatingPanel>

<style>
  :global(.floating-panel.timeline-floating-panel-shell) {
    z-index: var(--timeline-panel-z-index);
  }

  .timeline-floating-header-mount {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: var(--size-sm);
  }

  .shell-root {
    /* Region colors — match BottomBar timeline shell (node category tints) */
    --timeline-region-color-inputs: var(--node-icon-box-color-inputs);
    --timeline-region-color-patterns: var(--node-icon-box-bg-patterns);
    --timeline-region-color-sdf: var(--node-icon-box-color-sdf);
    --timeline-region-color-shapes: var(--node-icon-box-color-shapes);
    --timeline-region-color-math: var(--node-icon-box-color-math);
    --timeline-region-color-utilities: var(--node-icon-box-color-utilities);
    --timeline-region-color-distort: var(--node-icon-box-color-distort);
    --timeline-region-color-blend: var(--node-icon-box-color-blend);
    --timeline-region-color-mask: var(--node-icon-box-color-mask);
    --timeline-region-color-effects: var(--node-icon-box-color-effects);
    --timeline-region-color-output: var(--node-icon-box-color-output);
    --timeline-region-color-audio: var(--node-icon-box-color-audio);
    --timeline-region-color-default: var(--node-icon-box-color-default);
    --timeline-region-color-inputs-system: var(--node-icon-box-color-inputs-system);
    --timeline-region-color-patterns-structured: var(--node-icon-box-color-patterns-structured);
    --timeline-region-color-shapes-derived: var(--node-icon-box-color-shapes-derived);
    --timeline-region-color-math-functions: var(--node-icon-box-color-math-functions);
    --timeline-region-color-math-advanced: var(--node-icon-box-color-math-advanced);
    --timeline-region-color-distort-warp: var(--node-icon-box-color-distort-warp);
    --timeline-region-color-effects-stylize: var(--node-icon-box-color-effects-stylize);

    --timeline-viewport-left: 0px;
    --timeline-viewport-width: 100vw;
    --timeline-panel-computed-width: min(
      var(--timeline-panel-max-width),
      max(
        var(--timeline-panel-min-width),
        calc(var(--timeline-viewport-width, 100vw) * var(--timeline-panel-width-ratio, 0.6))
      )
    );

    --track-header-width: 200px;

    display: flex;
    flex-direction: column;
    width: var(--timeline-panel-computed-width);
    min-height: var(--timeline-panel-height);
    height: min(30vh, 360px);
    max-height: min(80vh, 520px);
    min-width: 0;
    padding: 0;
    overflow: hidden;
  }

  .shell-root.has-curve {
    height: calc(min(30vh, 360px) + var(--timeline-curve-editor-slot-height));
    min-height: var(--timeline-panel-height-with-editor);
    max-height: min(80vh, calc(520px + var(--timeline-curve-editor-slot-height)));
  }

  .timeline-band {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .curve-band {
    flex-shrink: 0;
    height: var(--timeline-curve-editor-slot-height);
    max-height: var(--timeline-curve-editor-slot-height);
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .curve-band :global(.curve-editor) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
