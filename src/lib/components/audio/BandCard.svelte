<script lang="ts">
  /**
   * BandCard - Single band card in the large audio signal picker.
   * Shows band name, frequency range editor, and Connect (raw) action.
   */
  import { Button, IconSvg, EditableLabel } from '../ui';
  import FrequencyRangeEditor from './FrequencyRangeEditor.svelte';
  import type { AudioBandEntry } from '../../../data-model/audioSetupTypes';

  interface SpectrumData {
    frequencyData: Uint8Array;
    fftSize: number;
    sampleRate: number;
  }

  interface Props {
    band: AudioBandEntry;
    isSelected?: boolean;
    spectrumData?: SpectrumData | null;
    onSelect?: () => void;
    onConnect?: () => void;
    onDelete?: () => void;
    onBandChange?: (updater: (b: AudioBandEntry) => AudioBandEntry) => void;
  }

  let {
    band,
    isSelected = false,
    spectrumData = null,
    onSelect,
    onConnect,
    onDelete,
    onBandChange,
  }: Props = $props();

  const canConnect = $derived(!!band.sourceFileId);
</script>

<div
  class="band-card panel-card"
  class:selected={isSelected}
  role="option"
  aria-selected={isSelected}
  tabindex="0"
  aria-label="Band. Click or press Space to select or deselect. Delete key removes selected band."
  onclick={onSelect}
  onkeydown={(e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelect?.();
    }
  }}
>
  <div class="band-card-header">
    <div class="band-card-label-wrap" role="presentation" ondblclick={(e) => e.stopPropagation()}>
      <EditableLabel
        value={band.name}
        placeholder="Band name"
        ariaLabel="Band name"
        onCommit={(value) => onBandChange?.((b) => ({ ...b, name: value }))}
      />
    </div>
    <Button
      variant="ghost"
      size="sm"
      mode="icon-only"
      title="Delete band"
      aria-label={`Delete band: ${band.name || band.id}`}
      onclick={(e) => {
        e.stopPropagation();
        onDelete?.();
      }}
    >
      <IconSvg name="trash" variant="line" />
    </Button>
    {#if onConnect}
      <Button
        variant="ghost"
        size="sm"
        mode="both"
        disabled={!canConnect}
        title={canConnect ? 'Connect band (raw)' : 'Set source file first'}
        aria-label={canConnect ? `Connect: ${band.name || band.id}` : 'Set source file first'}
        onclick={(e) => {
          e.stopPropagation();
          onConnect?.();
        }}
      >
        <IconSvg name="plug" variant="line" />
        Connect
      </Button>
    {/if}
  </div>
  <div class="frequency-editor-wrap" role="presentation" onclick={(e) => e.stopPropagation()}>
    <FrequencyRangeEditor
      frequencyBands={band.frequencyBands}
      spectrumData={spectrumData?.frequencyData}
      sampleRate={spectrumData?.sampleRate ?? 44100}
      fftSize={band.fftSize}
      fftSizeValue={band.fftSize}
      showSmoothingFft={false}
      onChange={(bands) => onBandChange?.((b) => ({ ...b, frequencyBands: bands }))}
    />
  </div>
</div>

<style>
  .band-card {
    gap: 0;
    padding: 0;
    width: 100%;
    box-sizing: border-box;

    .band-card-header {
      display: flex;
      align-items: center;
      gap: 0;
      width: 100%;
      height: var(--size-md);
      padding: 0 var(--pd-sm);
      min-height: 0;

      :global(.button) {
        border-radius: calc(var(--radius-md) - var(--pd-sm)) !important;
      }
    }

    .band-card-label-wrap {
      flex: 1;
      min-width: 0;
    }

    .frequency-editor-wrap {
      width: 100%;

      :global(.frequency-range-editor) {
        --spectrum-strip-height: 56px;
      }

      :global(.frequency-range-editor .spectrum-with-slider) {
        height: var(--spectrum-strip-height);
        min-height: var(--spectrum-strip-height);
      }

      :global(.frequency-range-editor .spectrum-strip) {
        height: 100%;
      }
    }
  }
</style>
