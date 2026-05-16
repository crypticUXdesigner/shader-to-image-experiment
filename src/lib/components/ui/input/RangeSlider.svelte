<script lang="ts">
  interface Props {
    min?: number;
    max?: number;
    lowValue: number;
    highValue: number;
    step?: number;
    disabled?: boolean;
    class?: string;
    onChange?: (payload: { low: number; high: number }) => void;
    onCommit?: (payload: { low: number; high: number }) => void;
  }

  let {
    min = 0,
    max = 1,
    lowValue,
    highValue,
    step = 0.01,
    disabled = false,
    class: className = '',
    onChange,
    onCommit
  }: Props = $props();

  let draggingHandle = $state<'low' | 'high' | null>(null);
  let dragLow = $state(0);
  let dragHigh = $state(0);
  let dragMoved = $state(false);

  const fromProps = $derived.by(() => ({
    low: Math.min(lowValue, highValue),
    high: Math.max(lowValue, highValue),
  }));

  const low = $derived(draggingHandle !== null ? dragLow : fromProps.low);
  const high = $derived(draggingHandle !== null ? dragHigh : fromProps.high);

  function snapValue(raw: number): number {
    let v = Math.max(min, Math.min(max, raw));
    if (typeof step === 'number' && step > 0) {
      v = min + Math.round((v - min) / step) * step;
      v = Math.max(min, Math.min(max, v));
    }
    return v;
  }

  const range = $derived(max - min || 1);
  const lowNorm = $derived((low - min) / range);
  const highNorm = $derived((high - min) / range);
  const lowPct = $derived(`${lowNorm * 100}%`);
  const highPct = $derived(`${highNorm * 100}%`);
  const fillLeft = $derived(`${Math.min(lowNorm, highNorm) * 100}%`);
  const fillWidth = $derived(`${Math.abs(highNorm - lowNorm) * 100}%`);

  let trackEl: HTMLDivElement | undefined = $state();

  function valueFromX(clientX: number, rect: DOMRect): number {
    const t = (clientX - rect.left) / rect.width;
    return min + t * range;
  }

  function handlePointerDown(handle: 'low' | 'high', e: PointerEvent) {
    if (disabled) return;
    draggingHandle = handle;
    dragLow = fromProps.low;
    dragHigh = fromProps.high;
    dragMoved = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (draggingHandle === null) return;
    if (!trackEl) return;
    dragMoved = true;
    const rect = trackEl.getBoundingClientRect();
    const rawValue = valueFromX(e.clientX, rect);
    const snapped = snapValue(rawValue);

    if (draggingHandle === 'low') {
      dragLow = Math.min(snapped, dragHigh);
      onChange?.({ low: dragLow, high: dragHigh });
    } else {
      dragHigh = Math.max(snapped, dragLow);
      onChange?.({ low: dragLow, high: dragHigh });
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (draggingHandle !== null) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      if (dragMoved) {
        onCommit?.({ low: dragLow, high: dragHigh });
      }
    }
    draggingHandle = null;
    dragMoved = false;
  }
</script>

<div
  class="range-slider {className}"
  role="group"
  aria-label="Range slider ({low} – {high})"
  aria-disabled={disabled}
  data-disabled={disabled || undefined}
>
  <div class="track" bind:this={trackEl}>
    <div class="fill" style="left: {fillLeft}; width: {fillWidth}"></div>
    <button
      type="button"
      class="handle handle-low"
      style="left: {lowPct}"
      aria-label="Low value"
      {disabled}
      onpointerdown={(e) => {
        e.preventDefault();
        handlePointerDown('low', e);
      }}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointerleave={handlePointerUp}
      onpointercancel={handlePointerUp}
    ></button>
    <button
      type="button"
      class="handle handle-high"
      style="left: {highPct}"
      aria-label="High value"
      {disabled}
      onpointerdown={(e) => {
        e.preventDefault();
        handlePointerDown('high', e);
      }}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointerleave={handlePointerUp}
      onpointercancel={handlePointerUp}
    ></button>
  </div>
</div>

<style>
  .range-slider {
    /* layout */
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--range-slider-track-height);
    touch-action: none;

    &[data-disabled] {
      opacity: var(--opacity-disabled);
      pointer-events: none;
    }

    .track {
      /* layout */
      position: relative;
      flex: 1;
      height: var(--range-slider-track-height);
      /* box model */
      border: 1px solid var(--range-slider-track-color);
      border-radius: var(--radius-2xs);
      /* visual */
      background: var(--range-slider-bg);

      .fill {
        /* layout */
        position: absolute;
        top: 0;
        bottom: 0;
        /* visual */
        border-radius: var(--radius-2xs);
        background: var(--range-slider-active-color);
        pointer-events: none;
      }

      .handle {
        /* layout */
        position: absolute;
        top: 0;
        bottom: 0;
        width: var(--range-editor-handle-size);
        margin-left: calc(var(--range-editor-handle-size) / -2);
        /* box model */
        border: none;
        border-radius: 0;
        /* visual */
        background: transparent;
        /* other */
        cursor: ew-resize;
        touch-action: none;

        &::before {
          content: '';
          /* layout */
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: var(--range-editor-edge-thickness);
          transform: translateX(-50%);
          /* visual */
          background: var(--range-editor-handle-bg);
          border-radius: 1px; /* one-off: handle edge pill */
          transition:
            width var(--motion-effects-fast-duration) var(--motion-effects-fast-easing),
            background var(--motion-effects-fast-duration) var(--motion-effects-fast-easing);
        }

        &:hover::before {
          width: var(--range-editor-edge-hover-thickness);
          background: var(--range-editor-handle-hover-bg);
        }

        &:active::before {
          background: var(--range-editor-handle-active-bg, var(--color-blue-110));
        }

        &:disabled {
          cursor: not-allowed;
        }

        &:focus {
          outline: none;
        }

        &:focus-visible::before {
          box-shadow: 0 0 0 2px var(--color-blue-90);
        }
      }
    }
  }
</style>
