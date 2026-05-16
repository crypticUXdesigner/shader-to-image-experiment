<script lang="ts">
  /**
   * RemapRangeEditor
   * Two VerticalRangeSliders (in min/max, out min/max), connection visualization,
   * ValueInput row, optional RemapNeedles for live values.
   * Parity with canvas RemapRangeElement.
   */
  import VerticalRangeSlider from './VerticalRangeSlider.svelte';
  import ValueInput from './ValueInput.svelte';

  interface Props {
    inMin: number;
    inMax: number;
    outMin: number;
    outMax: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    liveInValue?: number | null;
    liveOutValue?: number | null;
    class?: string;
    onChange?: (payload: {
      inMin: number;
      inMax: number;
      outMin: number;
      outMax: number;
    }) => void;
    /** Fired once when a vertical range drag ends or after value field commit (for undo coalescing). */
    onCommit?: () => void;
  }

  let {
    inMin,
    inMax,
    outMin,
    outMax,
    min = 0,
    max = 1,
    step = 0.01,
    disabled = false,
    liveInValue,
    liveOutValue,
    class: className = '',
    onChange,
    onCommit,
  }: Props = $props();

  const range = $derived(max - min || 1);
  const inMinNorm = $derived(Math.max(0, Math.min(1, (inMin - min) / range)));
  const inMaxNorm = $derived(Math.max(0, Math.min(1, (inMax - min) / range)));
  const outMinNorm = $derived(Math.max(0, Math.min(1, (outMin - min) / range)));
  const outMaxNorm = $derived(Math.max(0, Math.min(1, (outMax - min) / range)));

  function snapValue(raw: number): number {
    let v = Math.max(min, Math.min(max, raw));
    if (typeof step === 'number' && step > 0) {
      v = min + Math.round((v - min) / step) * step;
      v = Math.max(min, Math.min(max, v));
    }
    return v;
  }

  function handleInChange(payload: { low: number; high: number }) {
    const newInMin = snapValue(payload.low);
    const newInMax = snapValue(payload.high);
    onChange?.({
      inMin: newInMin,
      inMax: newInMax,
      outMin,
      outMax,
    });
  }

  function handleOutChange(payload: { low: number; high: number }) {
    const newOutMin = snapValue(payload.low);
    const newOutMax = snapValue(payload.high);
    onChange?.({
      inMin,
      inMax,
      outMin: newOutMin,
      outMax: newOutMax,
    });
  }

  function handleInMinChange(value: number) {
    const clamped = snapValue(Math.min(value, inMax));
    onChange?.({
      inMin: clamped,
      inMax,
      outMin,
      outMax,
    });
  }

  function handleInMaxChange(value: number) {
    const clamped = snapValue(Math.max(value, inMin));
    onChange?.({
      inMin,
      inMax: clamped,
      outMin,
      outMax,
    });
  }

  /** Out Min/Max may be inverted (outMax < outMin) to reverse the mapping; runtime supports it. */
  function handleOutMinChange(value: number) {
    const clamped = snapValue(value);
    onChange?.({
      inMin,
      inMax,
      outMin: clamped,
      outMax,
    });
  }

  function handleOutMaxChange(value: number) {
    const clamped = snapValue(value);
    onChange?.({
      inMin,
      inMax,
      outMin,
      outMax: clamped,
    });
  }

  /*
   * Connection diagram: glue by label, not by value.
   * Left (input): top edge = In Max position, bottom edge = In Min position.
   * Right (output): top edge = Out Max position, bottom edge = Out Min position.
   * So when Out Max=0 and Out Min=1 (inverted), top edge goes to bottom of bar, bottom edge to top.
   * Track y: 0 = top (value 1), 1 = bottom (value 0). So position for value = 1 - valueNorm.
   */
  const inset = 1;
  const diagramH = 100 - 2 * inset;
  const toDiagramY = (t: number) => inset + t * diagramH;

  /* Input: In Max = top edge of diagram, In Min = bottom edge */
  const inputTopY = $derived(1 - Math.max(inMinNorm, inMaxNorm));
  const inputBottomY = $derived(1 - Math.min(inMinNorm, inMaxNorm));

  /* Output: by label — top edge connects to Out Max handle, bottom edge to Out Min handle */
  const outputMaxY = $derived(1 - outMaxNorm); /* position of Out Max value on track */
  const outputMinY = $derived(1 - outMinNorm); /* position of Out Min value on track */

  const inputTopDy = $derived(toDiagramY(inputTopY));
  const inputBottomDy = $derived(toDiagramY(inputBottomY));
  const outputTopDy = $derived(toDiagramY(outputMaxY)); /* diagram top → Out Max */
  const outputBottomDy = $derived(toDiagramY(outputMinY)); /* diagram bottom → Out Min */

  /*
   * Needle positions: same scale as the sliders (min/max = track range).
   * Track y: 0 = top (value max), 1 = bottom (value min). So position = 1 - valueNorm.
   * Left needle: raw input value; position = (liveInValue - min) / range (clamped to [0,1]).
   * Right needle: remapped value; clamped to [outMin, outMax] then positioned on track so
   * the needle never sits outside the out handles.
   */
  const liveInNorm = $derived(
    liveInValue != null
      ? Math.max(0, Math.min(1, (liveInValue - min) / range))
      : null
  );
  const liveOutClamped = $derived(
    liveOutValue != null
      ? Math.max(
          Math.min(outMin, outMax),
          Math.min(Math.max(outMin, outMax), liveOutValue)
        )
      : null
  );
  const liveOutNorm = $derived(
    liveOutClamped != null
      ? Math.max(0, Math.min(1, (liveOutClamped - min) / range))
      : null
  );
  const liveInY = $derived(liveInNorm != null ? 1 - liveInNorm : null);
  const liveOutY = $derived(liveOutNorm != null ? 1 - liveOutNorm : null);

  const showNeedles = $derived(
    liveInValue != null || liveOutValue != null
  );

  const gradientId = `remap-gradient-${crypto.randomUUID()}`;
</script>

<div
  class="remap-range-editor {className}"
  data-disabled={disabled || undefined}
>
  <div class="slider-row display-graph">
    <div class="sliders">
      <div class="column in">
        <VerticalRangeSlider
          min={min}
          max={max}
          lowValue={Math.min(inMin, inMax)}
          highValue={Math.max(inMin, inMax)}
          {step}
          {disabled}
          onChange={handleInChange}
          onCommit={() => onCommit?.()}
          class="remap-slider remap-slider-in"
        />
        {#if showNeedles && liveInY != null}
          <div class="needle-overlay">
            <svg class="needle-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line
                x1="0"
                y1={liveInY * 100}
                x2="100"
                y2={liveInY * 100}
                stroke="var(--remap-range-needle-color)"
                stroke-width="1"
                stroke-linecap="round"
              />
            </svg>
          </div>
        {/if}
      </div>

      <div class="connection">
        <svg
          class="connection-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="var(--remap-range-slider-input-color)" />
              <stop offset="100%" stop-color="var(--remap-range-slider-output-color)" />
            </linearGradient>
          </defs>
          <!-- Gradient fill: left = input right edge, right = output left edge; corners aligned to slider min/max -->
          <polygon
            fill="url(#{gradientId})"
            fill-opacity="0.3"
            points="0,{inputTopDy} 100,{outputTopDy} 100,{outputBottomDy} 0,{inputBottomDy}"
          />
          <!-- Dashed lines: input top-right → output top-left, input bottom-right → output bottom-left -->
          <line
            x1="0"
            y1={inputTopDy}
            x2="100"
            y2={outputTopDy}
            stroke="var(--remap-range-connection-color)"
            stroke-width="0.5"
            stroke-dasharray="6 2"
            stroke-opacity="0.5"
            fill="none"
          />
          <line
            x1="0"
            y1={inputBottomDy}
            x2="100"
            y2={outputBottomDy}
            stroke="var(--remap-range-connection-color)"
            stroke-width="0.5"
            stroke-dasharray="6 2"
            stroke-opacity="0.5"
            fill="none"
          />
        </svg>
      </div>

      <div class="column out">
        <VerticalRangeSlider
          min={min}
          max={max}
          lowValue={outMin}
          highValue={outMax}
          allowInverted
          {step}
          {disabled}
          onChange={handleOutChange}
          onCommit={() => onCommit?.()}
          class="remap-slider remap-slider-out"
        />
        {#if showNeedles && liveOutY != null}
          <div class="needle-overlay">
            <svg class="needle-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line
                x1="0"
                y1={liveOutY * 100}
                x2="100"
                y2={liveOutY * 100}
                stroke="var(--remap-range-needle-color)"
                stroke-width="1"
                stroke-linecap="round"
              />
            </svg>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="inputs">
    <div class="column">
      <div class="field-row">
        <span class="field-label">In Max</span>
        <ValueInput
          value={inMax}
          min={min}
          max={max}
          step={step}
          decimals={3}
          size="sm"
          {disabled}
          onChange={handleInMaxChange}
          onCommit={() => onCommit?.()}
          class="value-input"
        />
      </div>
      <div class="field-row">
        <span class="field-label">In Min</span>
        <ValueInput
          value={inMin}
          min={min}
          max={max}
          step={step}
          decimals={3}
          size="sm"
          {disabled}
          onChange={handleInMinChange}
          onCommit={() => onCommit?.()}
          class="value-input"
        />
      </div>
    </div>
    <div class="column">
      <div class="field-row">
        <span class="field-label">Out Max</span>
        <ValueInput
          value={outMax}
          min={min}
          max={max}
          step={step}
          decimals={3}
          size="sm"
          {disabled}
          onChange={handleOutMaxChange}
          onCommit={() => onCommit?.()}
          class="value-input"
        />
      </div>
      <div class="field-row">
        <span class="field-label">Out Min</span>
        <ValueInput
          value={outMin}
          min={min}
          max={max}
          step={step}
          decimals={3}
          size="sm"
          {disabled}
          onChange={handleOutMinChange}
          onCommit={() => onCommit?.()}
          class="value-input"
        />
      </div>
    </div>
  </div>
</div>

<style>
  /* RemapRangeEditor styles */
  .remap-range-editor {
    /* Layout */
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: var(--pd-sm);
    padding: 0 var(--pd-xs);

    /* Shorter slider row; overrides token so diagram and sliders stay compact */
    --remap-range-slider-row-height: 80px;
    /* Narrower sliders; connection aligns to slider corners */
    --remap-editor-slider-width: 78px;
    --remap-range-slider-width: var(--remap-editor-slider-width);

    &[data-disabled] {
      opacity: var(--opacity-disabled);
      pointer-events: none;
    }

    .slider-row {
      display: flex;
      flex: 0 0 calc(var(--remap-range-slider-row-height) + 2 * var(--pd-sm));
      min-height: var(--remap-range-slider-row-height);
      /* Visual from .display-graph */

      .sliders {
        display: flex;
        flex: 1;
        align-items: stretch;
        gap: 0;
        min-width: 0;

        /* Fixed-width columns: IN and OUT sliders. Connection fills the middle. */
        .column {
          flex: 0 0 auto;
          width: var(--remap-editor-slider-width);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: stretch;
          position: relative;
        }

        .connection {
          flex: 1;
          min-width: 0;
          position: relative;
          pointer-events: none;

          .connection-svg {
            width: 100%;
            height: 100%;
          }
        }

        .needle-overlay {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          right: 0;
          pointer-events: none;

          .needle-svg {
            width: 100%;
            height: 100%;
          }
        }
      }
    }

    /* SVG gradient colors (teal = input, blue = output) */
    --remap-range-slider-input-color: var(--color-teal-gray-70);
    --remap-range-slider-output-color: var(--color-blue-80);

    :global(.remap-slider-in) {
      --remap-range-slider-input-color: var(--color-teal-60);
      --remap-range-slider-input-color-active: var(--color-teal-120);
      --remap-range-slider-track-color: var(--color-teal-60);
      --range-editor-handle-bg: var(--color-teal-90);
      --range-editor-handle-hover-bg: var(--color-teal-100);
    }

    :global(.remap-slider-in .fill) {
      background: var(--remap-range-slider-input-color);
    }

    :global(.remap-slider-in .handle:active::before) {
      background: var(--remap-range-slider-input-color-active);
    }

    :global(.remap-slider-in .handle:focus-visible::before) {
      box-shadow: 0 0 0 2px var(--color-teal-90);
    }

    :global(.remap-slider-out) {
      --remap-range-slider-input-color: var(--color-blue-90);
      --remap-range-slider-input-color-active: var(--color-blue-130);
      --remap-range-slider-track-color: var(--color-blue-60);
      --range-editor-handle-bg: var(--color-blue-110);
      --range-editor-handle-hover-bg: var(--color-blue-120);
    }

    :global(.remap-slider-out .fill) {
      background: var(--remap-range-slider-input-color);
    }

    :global(.remap-slider-out .handle:active::before) {
      background: var(--remap-range-slider-input-color-active);
    }

    .inputs {
      display: flex;
      gap: var(--pd-lg);
      width: 100%;
    }

    /* Match slider/track min-height to row so remap editor is compact */
    & :global(.vertical-range-slider),
    & :global(.vertical-range-slider .track) {
      min-height: var(--remap-range-slider-row-height);
    }

    .inputs .column {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--pd-sm);
      padding: 0;

      .field-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: var(--pd-sm);
      }

      .field-label {
        width: auto;
        font-size: var(--text-xs);
        color: var(--print-subtle);
        font-weight: 600;
      }
    }
  }
</style>
