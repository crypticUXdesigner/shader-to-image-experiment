<script lang="ts">
  /**
   * AudioSignalPickerCompact - WP audio-signal-picker 02B
   * Compact popover when port is audio-connected: show config of the connected band or remapper
   * and a Disconnect button. No option to select another signal.
   * Used only by AudioSignalPickerPanel (floating-panel).
   */
  import { Button, IconSvg, DropdownMenu, MenuItem, EditableLabel } from '../ui';
  import FrequencyRangeEditor from '../audio/FrequencyRangeEditor.svelte';
  import { RemapRangeEditor } from '../ui';
  import type { CompactSlotProps } from './AudioSignalPicker.types';
  import type { AudioBandEntry, AudioRemapperEntry } from '../../../data-model/audioSetupTypes';
  import { updateAudioBand, updateAudioRemapper } from '../../../data-model';
  import { subscribeParameterValueTick } from '../../stores/parameterValueTickStore';

  let {
    audioSetup,
    onSelect,
    onAudioSetupChange,
    connectedSignalId,
    connectionId,
    connectionDisabled,
    getAudioManager,
    onOpenLargeWithBand,
  }: CompactSlotProps = $props();

  let spectrumDataByBand = $state<Map<string, { frequencyData: Uint8Array; fftSize: number; sampleRate: number }>>(new Map());
  let liveValuesByRemapper = $state<Map<string, { incoming: number | null; outgoing: number | null }>>(new Map());

  /** Throttle live updates to ~20 fps to avoid driving Svelte reactivity at 60 fps. */
  const LIVE_UPDATE_INTERVAL_MS = 50;

  $effect(() => {
    const am = getAudioManager?.();
    const setup = audioSetup;
    if (!am || typeof am.getAnalyzerSpectrumData !== 'function') return;
    let lastUpdateTime = 0;
    const specMap = new Map<string, { frequencyData: Uint8Array; fftSize: number; sampleRate: number }>();
    const liveMap = new Map<string, { incoming: number | null; outgoing: number | null }>();
    return subscribeParameterValueTick(() => {
      specMap.clear();
      liveMap.clear();
      for (const band of setup.bands) {
        const spec = am.getAnalyzerSpectrumData(band.id);
        if (spec) specMap.set(band.id, spec);
        for (const remap of setup.remappers.filter((r) => r.bandId === band.id)) {
          const live = am.getPanelBandLiveValues?.(band.id, {
            inMin: remap.inMin,
            inMax: remap.inMax,
            outMin: remap.outMin,
            outMax: remap.outMax,
          });
          if (live) liveMap.set(remap.id, live);
        }
      }
      const now = performance.now();
      if (now - lastUpdateTime >= LIVE_UPDATE_INTERVAL_MS) {
        lastUpdateTime = now;
        spectrumDataByBand = new Map(specMap);
        liveValuesByRemapper = new Map(liveMap);
      }
    });
  });

  type Resolved =
    | { kind: 'band'; band: AudioBandEntry }
    | { kind: 'remapper'; remapper: AudioRemapperEntry }
    | { kind: 'not-found' };

  const resolved = $derived.by((): Resolved => {
    if (connectedSignalId.endsWith('-raw') && connectedSignalId.startsWith('band-')) {
      const bandId = connectedSignalId.slice(5, -4);
      const band = audioSetup.bands.find((b) => b.id === bandId);
      if (band) return { kind: 'band', band };
    }
    if (connectedSignalId.startsWith('remap-')) {
      const remapperId = connectedSignalId.slice(6);
      const remapper = audioSetup.remappers.find((r) => r.id === remapperId);
      if (remapper) return { kind: 'remapper', remapper };
    }
    return { kind: 'not-found' };
  });

  function handleDisconnect() {
    onSelect({ type: 'disconnect', connectionId });
  }

  const isAudioOff = $derived(connectionDisabled === true);
  const powerHelp = $derived(
    isAudioOff
      ? 'Power — turn on audio for this parameter'
      : 'Power — turn off audio for this parameter'
  );

  function handleConnectionPowerClick(e: MouseEvent) {
    e.stopPropagation();
    onSelect({
      type: 'set-connection-disabled',
      connectionId,
      disabled: !connectionDisabled,
    });
  }

  function handleBandChange(bandId: string, updater: (b: AudioBandEntry) => AudioBandEntry) {
    onAudioSetupChange(updateAudioBand(audioSetup, bandId, updater));
  }

  function handleRemapperChange(remapperId: string, updater: (r: AudioRemapperEntry) => AudioRemapperEntry) {
    onAudioSetupChange(updateAudioRemapper(audioSetup, remapperId, updater));
  }

  let sourceFileButtonEl: HTMLDivElement | undefined = $state();
  let sourceFileOpen = $state(false);

  type BandMode = 'mean' | 'max' | 'rms';
  const BAND_MODE_OPTIONS: ReadonlyArray<{ value: BandMode; label: string; desc: string }> = [
    { value: 'mean', label: 'Mean', desc: 'Smooth response. Transients are softened.' },
    { value: 'max', label: 'Max', desc: 'Snappy response. Reacts to transients.' },
    { value: 'rms', label: 'RMS', desc: 'Balanced. Loudness-weighted average.' },
  ];

  let modeButtonEl: HTMLDivElement | undefined = $state();
  let modeOpen = $state(false);
</script>

<div class="compact">
  {#if resolved.kind === 'not-found'}
    <p class="fallback">Signal not found</p>
  {:else if resolved.kind === 'band'}
    {@const band = resolved.band}
    {@const bandId = band.id}
    {@const files = audioSetup.files}
    {@const selectedFile = files.find((f) => f.id === band.sourceFileId)}
    {@const selectedFileName = selectedFile?.name ?? (selectedFile?.filePath ? selectedFile.filePath.split(/[/\\]/).pop() : 'No file')}
    <div class="section band frame-elevated">
      <div class="header">
        <div class="label-wrap">
          <EditableLabel
            value={band.name}
            placeholder="Band name"
            ariaLabel="Band name"
            onCommit={(value) => handleBandChange(bandId, (b) => ({ ...b, name: value }))}
          />
        </div>
      </div>
      <div class="row">
        <span class="label">Source</span>
        <div class="source" bind:this={sourceFileButtonEl}>
          <Button
            variant="ghost"
            size="sm"
            mode="both"
            disabled={files.length === 0}
            class="trigger"
            onclick={() => (sourceFileOpen = !sourceFileOpen)}
          >
            <IconSvg name="music" variant="line" />
            <span class="text">{selectedFileName}</span>
          </Button>
          <DropdownMenu
            open={sourceFileOpen}
            anchor={sourceFileButtonEl}
            onClose={() => (sourceFileOpen = false)}
            class="dropdown"
          >
            {#snippet children()}
              {#each files as file (file.id)}
                <MenuItem
                  label={file.name || file.filePath || `File ${file.id}`}
                  onclick={() => {
                    handleBandChange(bandId, (b) => ({ ...b, sourceFileId: file.id }));
                    sourceFileOpen = false;
                  }}
                />
              {/each}
            {/snippet}
          </DropdownMenu>
        </div>
      </div>
      <div class="row">
        <span class="label">Mode</span>
        <div class="source" bind:this={modeButtonEl}>
          <Button
            variant="ghost"
            size="sm"
            mode="both"
            class="trigger"
            aria-label="Mode"
            onclick={() => (modeOpen = !modeOpen)}
          >
            <span class="text">
              {BAND_MODE_OPTIONS.find((o) => o.value === (band.bandMode ?? 'mean'))?.label ?? 'Mean'}
            </span>
          </Button>
          <DropdownMenu
            open={modeOpen}
            anchor={modeButtonEl}
            onClose={() => (modeOpen = false)}
            class="dropdown"
          >
            {#snippet children()}
              {#each BAND_MODE_OPTIONS as option (option.value)}
                <MenuItem
                  label={option.label}
                  desc={option.desc}
                  selected={(band.bandMode ?? 'mean') === option.value}
                  onclick={() => {
                    handleBandChange(bandId, (b) => ({ ...b, bandMode: option.value }));
                    modeOpen = false;
                  }}
                />
              {/each}
            {/snippet}
          </DropdownMenu>
        </div>
      </div>
      <div class="frequency-wrap">
        <FrequencyRangeEditor
          frequencyBands={band.frequencyBands}
          spectrumData={spectrumDataByBand.get(bandId)?.frequencyData}
          sampleRate={spectrumDataByBand.get(bandId)?.sampleRate ?? 44100}
          fftSize={band.fftSize}
          fftSizeValue={band.fftSize}
          attackHalfLifeSeconds={band.attackHalfLifeSeconds}
          releaseHalfLifeSeconds={band.releaseHalfLifeSeconds}
          onChange={(bands) => handleBandChange(bandId, (b) => ({ ...b, frequencyBands: bands }))}
          onAttackHalfLifeSecondsChange={(v) =>
            handleBandChange(bandId, (b) => ({ ...b, attackHalfLifeSeconds: v != null ? Math.max(0, v) : undefined }))}
          onReleaseHalfLifeSecondsChange={(v) =>
            handleBandChange(bandId, (b) => ({ ...b, releaseHalfLifeSeconds: v != null ? Math.max(0, v) : undefined }))}
          onFftSizeChange={(v) => handleBandChange(bandId, (b) => ({ ...b, fftSize: Math.max(256, Math.min(8192, Math.round(v / 256) * 256)) }))}
        />
      </div>
    </div>
  {:else if resolved.kind === 'remapper'}
    {@const remapper = resolved.remapper}
    {@const remapperId = remapper.id}
    {@const remapperBandName = audioSetup.bands.find((b) => b.id === remapper.bandId)?.name ?? 'Band'}
    <div class="section remapper frame-elevated card">
      <div class="header">
        <div class="label-wrap">
          <EditableLabel
            value={remapper.name}
            prefix={`${remapperBandName}: `}
            placeholder="Remapper name"
            ariaLabel="Remapper name"
            onCommit={(value) => handleRemapperChange(remapperId, (r) => ({ ...r, name: value }))}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          mode="icon-only"
          aria-pressed={isAudioOff}
          aria-label={powerHelp}
          title={powerHelp}
          onclick={handleConnectionPowerClick}
        >
          <IconSvg name="power" variant="line" class="power-audio-icon {isAudioOff ? 'is-dimmed' : ''}" />
        </Button>
        {#if onOpenLargeWithBand}
          <Button
            variant="secondary"
            size="sm"
            mode="both"
            onclick={() => onOpenLargeWithBand(remapper.bandId)}
            aria-label="Swap"
            title="Swap"
          >
            <IconSvg name="swap" variant="line" />
            Swap
          </Button>
        {/if}
      </div>
      <div class="remap-wrap">
        <RemapRangeEditor
          inMin={remapper.inMin}
          inMax={remapper.inMax}
          outMin={remapper.outMin}
          outMax={remapper.outMax}
          liveInValue={liveValuesByRemapper.get(remapperId)?.incoming ?? null}
          liveOutValue={liveValuesByRemapper.get(remapperId)?.outgoing ?? null}
          onChange={(payload) => handleRemapperChange(remapperId, (r) => ({ ...r, ...payload }))}
        />
      </div>
    </div>
  {/if}
  <div class="disconnect">
    <Button variant="warning" size="sm" mode="both" onclick={handleDisconnect} aria-label="Disconnect audio signal">
      <IconSvg name="circle-x" variant="filled" />
      Disconnect
    </Button>
  </div>
</div>

<style>
  .compact {
    /* layout */
    display: flex;
    flex-direction: column;
    min-width: 380px; /* one-off: compact picker min width */
    max-width: 520px; /* one-off: compact picker max width */
    max-height: 480px; /* one-off: compact picker max height */
    padding: 0;
    overflow-y: auto;

    .fallback {
      margin: 0;
      font-size: var(--text-md);
      color: var(--text-muted, var(--color-gray-100));
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: var(--pd-md);
      padding: var(--pd-md);

      .header {
        display: flex;
        align-items: center;
        gap: var(--pd-md);
        width: 100%;
        min-height: var(--size-md);

        :global(.power-audio-icon.is-dimmed svg) {
          color: var(--color-blue-110);
        }
      }

      .label-wrap {
        flex: 1;
        min-width: 0;
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--pd-md);

        .label {
          flex-shrink: 0;
          width: 56px; /* one-off: fixed label width for alignment */
          font-size: var(--text-sm);
          color: var(--color-gray-110);
        }

        .source {
          position: relative;
          flex: 1;
          min-width: 0;

          .text {
            max-width: 260px; /* one-off: truncate long file names */
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
      }

      .frequency-wrap {
        width: 100%;

        :global(.frequency-range-editor) {
          --spectrum-strip-height: 100px; /* one-off: spectrum strip in compact */
        }
      }

      .remap-wrap {
        width: 100%;
      }
    }

    .disconnect {
      flex-shrink: 0;
      display: flex;
      justify-content: flex-start;
      padding: var(--pd-sm);
    }
  }
</style>
