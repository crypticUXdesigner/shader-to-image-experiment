<script lang="ts">
  /**
   * BezierEditor - Curve editor for x1, y1, x2, y2 params.
   * Parity with canvas BezierEditorElement.
   */
  interface Props {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    disabled?: boolean;
    class?: string;
    onChange?: (payload: { x1: number; y1: number; x2: number; y2: number }) => void;
    onCommit?: () => void;
  }

  let {
    x1,
    y1,
    x2,
    y2,
    disabled = false,
    class: className = '',
    onChange,
    onCommit,
  }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  let draggingIndex = $state<number | null>(null);
  let dragStart = $state<{ x: number; y: number; x1: number; y1: number; x2: number; y2: number } | null>(null);

  const GRID_STEPS = 4;

  function fromScreen(sx: number, sy: number): { x: number; y: number } {
    if (!containerEl) return { x: 0, y: 0 };
    const inner = containerEl.querySelector('.inner');
    if (!inner) return { x: 0, y: 0 };
    const rect = inner.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const x = (sx - rect.left) / w;
    const y = 1 - (sy - rect.top) / h;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function handlePointerDown(e: PointerEvent, index: number) {
    if (disabled) return;
    e.preventDefault();
    draggingIndex = index;
    dragStart = { x: e.clientX, y: e.clientY, x1, y1, x2, y2 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (draggingIndex === null || !dragStart) return;
    const delta = fromScreen(e.clientX, e.clientY);
    const start = fromScreen(dragStart.x, dragStart.y);
    const dx = delta.x - start.x;
    const dy = delta.y - start.y;

    let nx1 = dragStart.x1;
    let ny1 = dragStart.y1;
    let nx2 = dragStart.x2;
    let ny2 = dragStart.y2;

    if (draggingIndex === 0) {
      nx1 = Math.max(0, Math.min(1, dragStart.x1 + dx));
      ny1 = Math.max(0, Math.min(1, dragStart.y1 + dy));
    } else {
      nx2 = Math.max(0, Math.min(1, dragStart.x2 + dx));
      ny2 = Math.max(0, Math.min(1, dragStart.y2 + dy));
    }
    onChange?.({ x1: nx1, y1: ny1, x2: nx2, y2: ny2 });
  }

  function handlePointerUp(e: PointerEvent) {
    if (draggingIndex !== null) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      onCommit?.();
      draggingIndex = null;
      dragStart = null;
    }
  }
</script>

<div
  bind:this={containerEl}
  class="bezier-editor {className}"
  class:disabled
  role="img"
  aria-label="Bezier curve editor"
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerUp}
>
  <div class="area">
    <!-- Inner rect: same inset as curve/canvas; handles use this for positioning -->
    <div class="inner">
      <svg class="canvas" viewBox="0 0 1 1" preserveAspectRatio="none">
        <!-- Grid border: outer rect so tokens are used -->
        <rect class="grid-border" x="0" y="0" width="1" height="1" fill="none" vector-effect="non-scaling-stroke" />
        <!-- Grid -->
        {#each Array(GRID_STEPS - 1) as _, i}
          {@const t = (i + 1) / GRID_STEPS}
          <line x1={t} y1="0" x2={t} y2="1" class="grid" vector-effect="non-scaling-stroke" />
          <line x1="0" y1={t} x2="1" y2={t} class="grid" vector-effect="non-scaling-stroke" />
        {/each}
        <!-- Control lines (stroke-dasharray in viewBox units: 0.05 = 5% of 1-unit width) -->
        <line x1="0" y1="1" x2={x1} y2={1 - y1} class="ctrl-line" stroke-dasharray="0.05 0.05" vector-effect="non-scaling-stroke" />
        <line x1="1" y1="0" x2={x2} y2={1 - y2} class="ctrl-line" stroke-dasharray="0.05 0.05" vector-effect="non-scaling-stroke" />
        <!-- Curve -->
        <path
          d="M 0 1 C {x1} {1 - y1} {x2} {1 - y2} 1 0"
          fill="none"
          class="curve"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <!-- Control points: positioned relative to inner (same coords as curve) -->
      <button
        type="button"
        class="handle"
        class:active={draggingIndex === 0}
        style="left: {x1 * 100}%; top: {(1 - y1) * 100}%;"
        disabled={disabled}
        onpointerdown={(e) => handlePointerDown(e, 0)}
        aria-label="Control point 1"
      ></button>
      <button
        type="button"
        class="handle"
        class:active={draggingIndex === 1}
        style="left: {x2 * 100}%; top: {(1 - y2) * 100}%;"
        disabled={disabled}
        onpointerdown={(e) => handlePointerDown(e, 1)}
        aria-label="Control point 2"
      ></button>
    </div>
  </div>
</div>

<style>
  /* BezierEditor Styles */

  .bezier-editor {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: var(--bezier-editor-height);
    min-height: var(--bezier-editor-height);
    border-radius: var(--radius-lg);
    background: var(--bezier-editor-bg);
    border: 2px solid var(--bezier-editor-border-color);
    overflow: hidden;

    &.disabled {
      opacity: var(--opacity-disabled);
      pointer-events: none;
    }

    .area {
      position: relative;
      flex: 1;
      min-height: 0;
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;

      /* Inner: positioned with padding token inset; SVG and handles live here (no container padding) */
      .inner {
        position: absolute;
        inset: var(--bezier-editor-padding);

        .canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;

          /* :global() needed: Svelte scoping doesn't reliably apply to SVG child elements */
          :global(.grid-border) {
            fill: none;
            stroke: var(--bezier-editor-grid-border-color);
            stroke-width: var(--bezier-editor-grid-border-width);
          }

          :global(.grid) {
            stroke: var(--bezier-editor-grid-color);
            stroke-width: var(--bezier-editor-grid-line-width);
          }

          :global(.ctrl-line) {
            stroke: var(--bezier-editor-control-line-color);
            stroke-width: var(--bezier-editor-control-line-width);
          }

          :global(.curve) {
            stroke: var(--bezier-editor-curve-color);
            stroke-width: var(--bezier-editor-curve-width);
          }
        }

        .handle {
          position: absolute;
          width: 16px;
          height: 16px;
          margin: -8px 0 0 -8px;
          padding: 0;
          border: 2px solid var(--color-gray-130);
          border-radius: 50%;
          background: var(--bezier-editor-control-point-bg);
          cursor: grab;
          transform: translate(0, 0);

          &:active {
            cursor: grabbing;
          }

          &:hover:not(:disabled) {
            width: 20px;
            height: 20px;
            margin: -10px 0 0 -10px;
          }
        }
      }
    }
  }
</style>
