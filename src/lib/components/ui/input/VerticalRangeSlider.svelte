<script lang="ts">
  interface Props {
    min?: number;
    max?: number;
    lowValue: number;
    highValue: number;
    step?: number;
    disabled?: boolean;
    /** When true, allows high < low (inverted range for remap output). */
    allowInverted?: boolean;
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
    allowInverted = false,
    class: className = '',
    onChange,
    onCommit
  }: Props = $props();

  let draggingHandle = $state<'low' | 'high' | null>(null);
  let dragLow = $state(0);
  let dragHigh = $state(1);
  let dragMoved = $state(false);

  const fromProps = $derived.by(() =>
    allowInverted
      ? { low: lowValue, high: highValue }
      : { low: Math.min(lowValue, highValue), high: Math.max(lowValue, highValue) }
  );

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
  /* Vertical: bottom = low (0), top = high (1). CSS top: 0 = top of track. So low at bottom = 1 - lowNorm */
  const lowPct = $derived(`${(1 - lowNorm) * 100}%`);
  const highPct = $derived(`${(1 - highNorm) * 100}%`);
  const fillTop = $derived(`${(1 - Math.max(lowNorm, highNorm)) * 100}%`);
  const fillHeight = $derived(`${Math.abs(highNorm - lowNorm) * 100}%`);

  let trackEl: HTMLDivElement | undefined = $state();

  function valueFromY(clientY: number, rect: DOMRect): number {
    const t = (clientY - rect.top) / rect.height;
    return min + (1 - t) * range;
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
    const rawValue = valueFromY(e.clientY, rect);
    const snapped = snapValue(rawValue);

    if (draggingHandle === 'low') {
      dragLow = allowInverted ? snapped : Math.min(snapped, dragHigh);
      onChange?.({ low: dragLow, high: dragHigh });
    } else {
      dragHigh = allowInverted ? snapped : Math.max(snapped, dragLow);
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
  class="vertical-range-slider {className}"
  role="group"
  aria-label="Vertical range slider ({low} – {high})"
  aria-disabled={disabled}
  data-disabled={disabled || undefined}
>
  <div class="track" bind:this={trackEl}>
    <div class="fill" style="top: {fillTop}; height: {fillHeight}"></div>
    <button
      type="button"
      class="handle handle-low"
      style="top: {lowPct}"
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
      style="top: {highPct}"
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
  /* VerticalRangeSlider styles */
  .vertical-range-slider {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    min-height: 120px;
    touch-action: none;

    &[data-disabled] {
      opacity: var(--opacity-disabled);
      pointer-events: none;
    }

    .track {
    position: relative;
    flex: 1;
    width: var(--remap-range-slider-width);
    min-height: 120px;
    border-radius: var(--remap-range-slider-radius);
    background: var(--remap-range-slider-bg);
    border: 1px solid var(--remap-range-slider-track-color);

    .fill {
    position: absolute;
    left: 0;
    right: 0;
    border-radius: var(--remap-range-slider-radius);
    background: var(--remap-range-slider-input-color);
    pointer-events: none;
    }

    .handle {
    position: absolute;
    left: 0;
    right: 0;
    height: var(--range-editor-handle-size);
    margin-top: calc(var(--range-editor-handle-size) / -2);
    background: transparent;
    border: none;
    border-radius: 0;
    cursor: ns-resize;
    touch-action: none;

    &::before {
      content: '';
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      left: 0;
      right: 0;
      height: var(--range-editor-edge-thickness);
      background: var(--range-editor-handle-bg);
      border-radius: 1px;
      transition:
        height var(--motion-effects-fast-duration) var(--motion-effects-fast-easing),
        background var(--motion-effects-fast-duration) var(--motion-effects-fast-easing);
    }

    &:hover::before {
      height: var(--range-editor-edge-hover-thickness);
      background: var(--range-editor-handle-hover-bg);
    }

    &:active::before {
      background: var(--color-blue-110);
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
