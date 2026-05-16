<script lang="ts">
  /**
   * FrequencyRangeEditor
   * Compose: SpectrumStrip, FrequencyScale, RangeSlider (horizontal), ValueInput ×2 (start/end Hz)
   * Spectrum parity: selected violet, unselected gray; log scale 20–20k Hz.
   */
  import SpectrumStrip from './SpectrumStrip.svelte';
  import FrequencyScale from './FrequencyScale.svelte';
  import { RangeSlider, ValueInput } from '../ui';
  import { hzToNorm, normToHz, FREQ_MIN, FREQ_MAX } from './frequencyUtils';

  const DEFAULT_HALF_LIFE_SECONDS = 1 / 120;

  interface Props {
    /** [[minHz, maxHz]] - single band */
    frequencyBands: [[number, number]];
    spectrumData?: number[] | Uint8Array;
    sampleRate?: number;
    fftSize?: number;
    /** When provided with onFftSizeChange, value shown in FFT size input (e.g. band.fftSize) */
    fftSizeValue?: number;
    smoothing?: number;
    /** Optional attack half-life (seconds) for rising edges. When provided with handler, preferred over symmetric half-life. */
    attackHalfLifeSeconds?: number;
    /** Optional release half-life (seconds) for falling edges. When provided with handler, preferred over symmetric half-life. */
    releaseHalfLifeSeconds?: number;
    disabled?: boolean;
    class?: string;
    /** When false, Smooth and FFT size row is hidden (e.g. when shown elsewhere). */
    showSmoothingFft?: boolean;
    onChange?: (bands: [[number, number]]) => void;
    onCommit?: () => void;
    onSmoothingChange?: (value: number) => void;
    onAttackHalfLifeSecondsChange?: (value: number | undefined) => void;
    onReleaseHalfLifeSecondsChange?: (value: number | undefined) => void;
    onFftSizeChange?: (value: number) => void;
  }

  let {
    frequencyBands = [[FREQ_MIN, FREQ_MAX]],
    spectrumData = [],
    sampleRate = 44100,
    fftSize = 2048,
    fftSizeValue,
    smoothing = 0.5,
    attackHalfLifeSeconds,
    releaseHalfLifeSeconds,
    disabled = false,
    class: className = '',
    showSmoothingFft = true,
    onChange,
    onCommit,
    onSmoothingChange,
    onAttackHalfLifeSecondsChange,
    onReleaseHalfLifeSecondsChange,
    onFftSizeChange,
  }: Props = $props();

  const FFT_SIZE_MIN = 256;
  const FFT_SIZE_MAX = 8192;
  const FFT_SIZE_STEP = 256;

  const band = $derived(frequencyBands[0] ?? [FREQ_MIN, FREQ_MAX]);
  const minHz = $derived(Math.max(FREQ_MIN, Math.min(FREQ_MAX, band[0] ?? FREQ_MIN)));
  const maxHz = $derived(Math.max(FREQ_MIN, Math.min(FREQ_MAX, band[1] ?? FREQ_MAX)));

  const minNorm = $derived(hzToNorm(minHz));
  const maxNorm = $derived(hzToNorm(maxHz));

  function handleRangeChange(payload: { low: number; high: number }) {
    const newMinHz = Math.round(normToHz(payload.low));
    const newMaxHz = Math.round(normToHz(payload.high));
    const clampedMin = Math.max(FREQ_MIN, Math.min(FREQ_MAX, newMinHz));
    const clampedMax = Math.max(FREQ_MIN, Math.min(FREQ_MAX, Math.max(clampedMin, newMaxHz)));
    onChange?.([[clampedMin, clampedMax]]);
  }

  function handleMinHzChange(value: number) {
    const clamped = Math.max(FREQ_MIN, Math.min(maxHz, Math.round(value)));
    onChange?.([[clamped, maxHz]]);
  }

  function handleMaxHzChange(value: number) {
    const clamped = Math.max(minHz, Math.min(FREQ_MAX, Math.round(value)));
    onChange?.([[minHz, clamped]]);
  }

  function handleSmoothingChange(value: number) {
    onSmoothingChange?.(Math.max(0, Math.min(1, value)));
  }

  function handleAttackHalfLifeMsChange(value: number) {
    const ms = Math.max(0, value);
    onAttackHalfLifeSecondsChange?.(ms / 1000);
  }

  function handleReleaseHalfLifeMsChange(value: number) {
    const ms = Math.max(0, value);
    onReleaseHalfLifeSecondsChange?.(ms / 1000);
  }

  function handleFftSizeChange(value: number) {
    const clamped = Math.max(
      FFT_SIZE_MIN,
      Math.min(FFT_SIZE_MAX, Math.round(value / FFT_SIZE_STEP) * FFT_SIZE_STEP)
    );
    onFftSizeChange?.(clamped);
  }
</script>

<div class="frequency-range-editor card-display {className}" data-disabled={disabled || undefined}>
  <div class="spectrum-with-slider display-graph">
    <SpectrumStrip
      spectrumData={spectrumData}
      selectedMin={minHz}
      selectedMax={maxHz}
      {sampleRate}
      {fftSize}
    />
    <div class="slider-overlay">
      <RangeSlider
        min={0}
        max={1}
        lowValue={minNorm}
        highValue={maxNorm}
        step={0.001}
        {disabled}
        onChange={handleRangeChange}
        onCommit={() => onCommit?.()}
        class="freq-range-slider"
      />
    </div>
  </div>
  <div class="scale">
    <FrequencyScale />
  </div>
  <div class="inputs">
    <div class="row">
      <div class="column">
        <span class="field-label">Start</span>
        <ValueInput
          value={minHz}
          min={FREQ_MIN}
          max={FREQ_MAX}
          step={1}
          decimals={0}
          size="sm"
          {disabled}
          onChange={handleMinHzChange}
          onCommit={() => onCommit?.()}
          class="freq-input freq-input-start"
        />
      </div>
      <div class="column">
        <span class="field-label">End</span>
        <ValueInput
          value={maxHz}
          min={FREQ_MIN}
          max={FREQ_MAX}
          step={1}
          decimals={0}
          size="sm"
          {disabled}
          onChange={handleMaxHzChange}
          onCommit={() => onCommit?.()}
          class="freq-input freq-input-end"
        />
      </div>
    </div>
    {#if showSmoothingFft && onFftSizeChange != null}
      <div class="row">
        <div class="column">
          {#if onAttackHalfLifeSecondsChange != null || onReleaseHalfLifeSecondsChange != null}
            <span class="field-label">Attack / Release</span>
            <div class="attack-release">
              <ValueInput
                value={Math.round(((attackHalfLifeSeconds ?? DEFAULT_HALF_LIFE_SECONDS) as number) * 1000)}
                min={0}
                max={10000}
                step={1}
                decimals={0}
                size="sm"
                {disabled}
                onChange={handleAttackHalfLifeMsChange}
                onCommit={handleAttackHalfLifeMsChange}
                class="attack-half-life-input"
              />
              <ValueInput
                value={Math.round(((releaseHalfLifeSeconds ?? DEFAULT_HALF_LIFE_SECONDS) as number) * 1000)}
                min={0}
                max={10000}
                step={1}
                decimals={0}
                size="sm"
                {disabled}
                onChange={handleReleaseHalfLifeMsChange}
                onCommit={handleReleaseHalfLifeMsChange}
                class="release-half-life-input"
              />
            </div>
          {:else if onSmoothingChange != null}
            <span class="field-label">Smooth</span>
            <ValueInput
              value={smoothing}
              min={0}
              max={1}
              step={0.01}
              decimals={2}
              size="sm"
              {disabled}
              onChange={handleSmoothingChange}
              onCommit={handleSmoothingChange}
              class="smoothing-input"
            />
          {/if}
        </div>
        <div class="column">
          <span class="field-label">FFT size</span>
          <ValueInput
            value={fftSizeValue ?? fftSize}
            min={FFT_SIZE_MIN}
            max={FFT_SIZE_MAX}
            step={FFT_SIZE_STEP}
            decimals={0}
            size="sm"
            {disabled}
            onChange={handleFftSizeChange}
            onCommit={handleFftSizeChange}
            class="fft-size-input"
          />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* FrequencyRangeEditor styles – visual from .card-display, .display-graph */
  .frequency-range-editor {
    --spectrum-strip-height: 120px;

    &[data-disabled] {
      opacity: var(--opacity-disabled);
      pointer-events: none;
    }

    .spectrum-with-slider {
      min-height: var(--spectrum-strip-height);
    }

    .slider-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;

      :global(.freq-range-slider) {
        --range-slider-track-height: var(--spectrum-strip-height);
        --range-slider-active-color: color-mix(in srgb, var(--color-teal-90) 10%, transparent);
        --range-slider-bg: transparent;
        --range-slider-track-color: transparent;
        --range-editor-handle-bg: var(--color-teal-100);
        --range-editor-handle-hover-bg: var(--color-teal-110);
        --range-editor-handle-active-bg: var(--color-teal-120);
      }


    }

    .scale {
      width: 100%;
    }

    .inputs {
      display: flex;
      flex-direction: column;
      gap: var(--card-display-gap);
      width: 100%;
    }

    .inputs .row {
      display: flex;
      gap: var(--pd-lg);
      width: 100%;
    }

    .inputs .column {
      flex: 1;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: var(--pd-sm);
      padding: 0;

      .field-label {
        width: auto;
        font-size: var(--text-xs);
        color: var(--print-subtle);
        font-weight: 600;
      }
    }

    .attack-release {
      display: flex;
      gap: var(--pd-xs);
      justify-content: flex-end;
      flex: 1;
      min-width: 0;
    }

    :global(.attack-half-life-input),
    :global(.release-half-life-input) {
      width: 90px;
    }
  }
</style>
