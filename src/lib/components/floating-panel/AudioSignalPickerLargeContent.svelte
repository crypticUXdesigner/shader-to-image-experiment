<script lang="ts">
  /**
   * AudioSignalPickerLargeContent - WP audio-signal-picker 02A
   * Large popover when port has no audio connection: two-column layout (bands | remappers for selected band),
   * New band, full band config and remapper add/edit, explicit Connect band (raw) / Connect [remapper] actions.
   * Used only by AudioSignalPickerPanel (floating-panel).
   */
  import { Button, IconSvg, ValueInput, DropdownMenu, MenuItem } from '../ui';
  import BandCard from '../audio/BandCard.svelte';
  import RemapperCard from '../audio/RemapperCard.svelte';
  import type { LargeSlotProps } from './AudioSignalPicker.types';
  import type { AudioBandEntry, AudioRemapperEntry } from '../../../data-model/audioSetupTypes';
  import {
    updateAudioBand,
    addAudioRemapper,
    updateAudioRemapper,
    removeAudioBand,
    removeAudioRemapper,
    generateUUID,
  } from '../../../data-model';
  import { getVirtualNodeId } from '../../../utils/virtualNodes';
  import { subscribeParameterValueTick } from '../../stores/parameterValueTickStore';
  import type { Action } from 'svelte/action';

  const DEFAULT_HALF_LIFE_SECONDS = 1 / 120;

  let {
    audioSetup,
    onSelect,
    onClose,
    onAudioSetupChange,
    getAudioManager,
    initialBandId,
    registerDeleteHandler,
    browseOnly = false,
  }: LargeSlotProps = $props();

  /** User override for band list selection; UNSET = follow auto rules (initial / growth). */
  const USER_BAND_UNSET = Symbol('userBandUnset');
  const AUTO_BAND_NOOP = Symbol('autoBandNoop');
  let userBandChoice = $state<string | null | typeof USER_BAND_UNSET>(USER_BAND_UNSET);
  /** Remapper IDs selected for delete (e.g. Del key). */
  let selectedRemapperIds = $state<Set<string>>(new Set());
  /** After user toggles while `initialBandId` is set, prevents re-snapping to initial every render. */
  let lastAppliedInitialBandId = $state<string | null>(null);
  /** Last committed selection (updated in spectrum effect) so we keep the band when `initialBandId` clears. */
  let selectionEcho = $state<string | null>(null);

  let spectrumDataByBand = $state<Map<string, { frequencyData: Uint8Array; fftSize: number; sampleRate: number }>>(new Map());
  let liveValuesByRemapper = $state<Map<string, { incoming: number | null; outgoing: number | null }>>(new Map());

  /** Throttle live updates to ~20 fps to avoid driving Svelte reactivity at 60 fps. */
  const LIVE_UPDATE_INTERVAL_MS = 50;

  type BandMode = 'mean' | 'max' | 'rms';
  const BAND_MODE_OPTIONS: ReadonlyArray<{ value: BandMode; label: string; desc: string }> = [
    { value: 'mean', label: 'Mean', desc: 'Smooth response. Transients are softened.' },
    { value: 'max', label: 'Max', desc: 'Snappy response. Reacts to transients.' },
    { value: 'rms', label: 'RMS', desc: 'Balanced. Loudness-weighted average.' },
  ];

  let bandModeButtonEl: HTMLDivElement | undefined = $state();
  let bandModeOpen = $state(false);

  /** Updated after render (in spectrum effect) so `$derived` reads previous tick’s ids for growth detection. */
  const prevBandIdsRef = { current: new Set<string>() };

  const bands = $derived(audioSetup.bands);
  const files = $derived(audioSetup.files);
  const remappers = $derived(audioSetup.remappers);
  const hasFiles = $derived(files.length > 0);

  const autoBandId = $derived.by((): string | null | typeof AUTO_BAND_NOOP => {
    if (bands.length === 0) return null;

    const currentIds = new Set(bands.map((b) => b.id));
    const prev = prevBandIdsRef.current;
    const bid = initialBandId ?? null;
    if (bid && currentIds.has(bid) && lastAppliedInitialBandId !== bid) {
      return bid;
    }
    if (currentIds.size === prev.size + 1) {
      const newId = [...currentIds].find((id) => !prev.has(id));
      if (newId != null) return newId;
    }
    return AUTO_BAND_NOOP;
  });

  const selectedBandId = $derived.by((): string | null => {
    if (bands.length === 0) return null;

    const auto = autoBandId;
    if (auto !== AUTO_BAND_NOOP) {
      return auto;
    }

    const currentIds = new Set(bands.map((b) => b.id));
    if (userBandChoice !== USER_BAND_UNSET) {
      if (typeof userBandChoice === 'string' && !currentIds.has(userBandChoice)) {
        return null;
      }
      return userBandChoice as string | null;
    }

    if (selectionEcho != null && currentIds.has(selectionEcho)) {
      return selectionEcho;
    }

    return null;
  });

  const selectedBand = $derived(
    selectedBandId != null ? bands.find((b) => b.id === selectedBandId) ?? null : null
  );
  const selectedBandRemappers = $derived(
    selectedBandId != null
      ? remappers.filter((r) => r.bandId === selectedBandId)
      : remappers
  );

  $effect(() => {
    const setup = audioSetup;
    const currentBandIds = new Set(setup.bands.map((b) => b.id));
    prevBandIdsRef.current = currentBandIds;
    if (setup.bands.length === 0) {
      lastAppliedInitialBandId = null;
      userBandChoice = USER_BAND_UNSET;
      selectionEcho = null;
    }

    const am = getAudioManager?.();
    if (!am || typeof am.getAnalyzerSpectrumData !== 'function') {
      selectionEcho = selectedBandId;
      return;
    }
    let lastUpdateTime = 0;
    const specMap = new Map<string, { frequencyData: Uint8Array; fftSize: number; sampleRate: number }>();
    const liveMap = new Map<string, { incoming: number | null; outgoing: number | null }>();
    const unsub = subscribeParameterValueTick(() => {
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
    selectionEcho = selectedBandId;
    return unsub;
  });

  function toggleBandSelection(bandId: string) {
    const next = selectedBandId === bandId ? null : bandId;
    userBandChoice = next;
    const bid = initialBandId ?? null;
    if (bid != null) {
      lastAppliedInitialBandId = bid;
    }
  }

  function toggleRemapperSelection(remapperId: string, e: MouseEvent) {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    selectedRemapperIds = new Set(
      selectedRemapperIds.has(remapperId)
        ? [...selectedRemapperIds].filter((id) => id !== remapperId)
        : [...selectedRemapperIds, remapperId]
    );
  }

  function deleteSelected() {
    let next = audioSetup;
    const hadRemappersToDelete = selectedRemapperIds.size > 0;
    for (const id of selectedRemapperIds) {
      next = removeAudioRemapper(next, id);
    }
    // Only delete the band when no remappers were selected (so "Del" means "delete band" not "delete remappers only")
    const bandRemoved =
      !hadRemappersToDelete && selectedBandId != null;
    if (bandRemoved) {
      next = removeAudioBand(next, selectedBandId!);
    }
    if (next !== audioSetup) {
      onAudioSetupChange?.(next);
      if (bandRemoved) userBandChoice = null;
      selectedRemapperIds = new Set();
    }
  }

  function handleBandChange(bandId: string, updater: (b: AudioBandEntry) => AudioBandEntry) {
    onAudioSetupChange?.(updateAudioBand(audioSetup, bandId, updater));
  }

  function handleConnectBandRaw(bandId: string) {
    const band = bands.find((b) => b.id === bandId);
    if (!band?.sourceFileId) return;
    const virtualNodeId = getVirtualNodeId(`band-${bandId}-raw`);
    onSelect?.({ type: 'audio', virtualNodeId });
    onClose?.();
  }

  function handleAddRemapper() {
    if (!selectedBandId) return;
    const newRemapper: AudioRemapperEntry = {
      id: `remap-${generateUUID()}`,
      name: `Remap ${selectedBandRemappers.length + 1}`,
      bandId: selectedBandId,
      inMin: 0,
      inMax: 1,
      outMin: 0,
      outMax: 1,
    };
    onAudioSetupChange?.(addAudioRemapper(audioSetup, newRemapper));
  }

  function handleRemapperChange(remapperId: string, updater: (r: AudioRemapperEntry) => AudioRemapperEntry) {
    onAudioSetupChange?.(updateAudioRemapper(audioSetup, remapperId, updater));
  }

  function handleConnectRemapper(remapperId: string) {
    const virtualNodeId = getVirtualNodeId(`remap-${remapperId}`);
    onSelect?.({ type: 'audio', virtualNodeId });
    onClose?.();
  }

  /** Document-level Del/Backspace so it works reliably (focus may be on band/remapper card; portal can affect bubbling). */
  const INPUT_LIKE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

  const registerDeleteBridge: Action<
    HTMLDivElement,
    {
      register: NonNullable<LargeSlotProps['registerDeleteHandler']> | undefined;
      getDelete: () => () => void;
    }
  > = (_node, init) => {
    let lastReg = init.register;
    init.register?.(init.getDelete());
    return {
      update(next) {
        lastReg = next.register;
        next.register?.(next.getDelete());
      },
      destroy() {
        lastReg?.(null);
      },
    };
  };

  const docDeleteCapture: Action<HTMLDivElement, undefined> = (root) => {
    function onDocKeydown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target instanceof Node ? e.target : null;
      if (!target || !root.contains(target)) return;
      if (target instanceof Element && target.closest(INPUT_LIKE_SELECTOR)) return;
      deleteSelected();
      e.preventDefault();
      e.stopPropagation();
    }
    document.addEventListener('keydown', onDocKeydown, true);
    return {
      destroy() {
        document.removeEventListener('keydown', onDocKeydown, true);
      },
    };
  };
</script>

<div
  class="large"
  role="group"
  use:registerDeleteBridge={{ register: registerDeleteHandler, getDelete: () => deleteSelected }}
  use:docDeleteCapture
>
  <div class="columns" role="group" aria-label="Audio signal picker: bands and remappers">
    <div
      class="left scrollbar-styled"
      role={bands.length !== 0 ? 'listbox' : 'group'}
      aria-label="Bands"
    >
      {#if bands.length !== 0}
        {#each bands as band (band.id)}
          <BandCard
            band={band}
            isSelected={selectedBandId === band.id}
            spectrumData={spectrumDataByBand.get(band.id) ?? null}
            onSelect={() => toggleBandSelection(band.id)}
            onConnect={browseOnly ? undefined : () => handleConnectBandRaw(band.id)}
            onDelete={() => {
              onAudioSetupChange?.(removeAudioBand(audioSetup, band.id));
              if (selectedBandId === band.id) userBandChoice = null;
            }}
            onBandChange={(updater) => handleBandChange(band.id, updater)}
          />
        {/each}
      {/if}
      {#if !hasFiles}
        <p class="hint">Upload to add an audio file and create bands.</p>
      {/if}
    </div>

    <div class="right frame-elevated frame-scrollable scrollbar-styled" role="group" aria-label="Remappers for selected band">
      {#if selectedBand}
        <div class="toolbar">
          <div class="controls">
          <div class="row">
            <span class="label">Attack</span>
            <ValueInput
              value={Math.round(((selectedBand.attackHalfLifeSeconds ?? DEFAULT_HALF_LIFE_SECONDS) as number) * 1000)}
              min={0}
              max={10000}
              step={1}
              decimals={0}
              size="sm"
              onChange={(v) =>
                handleBandChange(selectedBand.id, (b) => ({
                  ...b,
                  attackHalfLifeSeconds: Math.max(0, v) / 1000,
                }))}
              onCommit={(v) =>
                handleBandChange(selectedBand.id, (b) => ({
                  ...b,
                  attackHalfLifeSeconds: Math.max(0, v) / 1000,
                }))}
              class="smoothing"
            />
          </div>
          <div class="row">
            <span class="label">Release</span>
            <ValueInput
              value={Math.round(((selectedBand.releaseHalfLifeSeconds ?? DEFAULT_HALF_LIFE_SECONDS) as number) * 1000)}
              min={0}
              max={10000}
              step={1}
              decimals={0}
              size="sm"
              onChange={(v) =>
                handleBandChange(selectedBand.id, (b) => ({
                  ...b,
                  releaseHalfLifeSeconds: Math.max(0, v) / 1000,
                }))}
              onCommit={(v) =>
                handleBandChange(selectedBand.id, (b) => ({
                  ...b,
                  releaseHalfLifeSeconds: Math.max(0, v) / 1000,
                }))}
              class="smoothing"
            />
          </div>
          <div class="row">
            <span class="label">Mode</span>
            <div bind:this={bandModeButtonEl}>
              <Button
                variant="secondary"
                size="sm"
                mode="both"
                aria-label="Mode"
                onclick={() => (bandModeOpen = !bandModeOpen)}
              >
                {BAND_MODE_OPTIONS.find((o) => o.value === (selectedBand.bandMode ?? 'mean'))?.label ?? 'Mean'}
              </Button>
              <DropdownMenu
                open={bandModeOpen}
                anchor={bandModeButtonEl}
                onClose={() => (bandModeOpen = false)}
                class="dropdown"
              >
                {#snippet children()}
                  {#each BAND_MODE_OPTIONS as option (option.value)}
                    <MenuItem
                      label={option.label}
                      desc={option.desc}
                      selected={(selectedBand.bandMode ?? 'mean') === option.value}
                      onclick={() => {
                        handleBandChange(selectedBand.id, (b) => ({ ...b, bandMode: option.value }));
                        bandModeOpen = false;
                      }}
                    />
                  {/each}
                {/snippet}
              </DropdownMenu>
            </div>
          </div>
          <div class="row">
            <span class="label">FFT size</span>
            <ValueInput
              value={selectedBand.fftSize}
              min={256}
              max={8192}
              step={256}
              decimals={0}
              size="sm"
              onChange={(v) => handleBandChange(selectedBand.id, (b) => ({ ...b, fftSize: Math.max(256, Math.min(8192, Math.round(v / 256) * 256)) }))}
              onCommit={(v) => handleBandChange(selectedBand.id, (b) => ({ ...b, fftSize: Math.max(256, Math.min(8192, Math.round(v / 256) * 256)) }))}
              class="fft"
            />
          </div>
        </div>
        {#if selectedBand}
        <Button variant="secondary" size="sm" mode="both" iconPosition="trailing" onclick={handleAddRemapper}>
          <IconSvg name="plus" variant="line" />
          Add remapper
        </Button>
      {/if}

        </div>
      {/if}
      {#if selectedBandRemappers.length === 0}
        <p class="empty">
          {#if bands.length === 0}
            Create your first band.
          {:else if selectedBand}
            {#if browseOnly}
              No remappers for this band. Add one.
            {:else}
              No remappers for this band. Add one or connect band (raw) on the left.
            {/if}
          {:else}
            No remappers yet. Select a band on the left to add one.
          {/if}
        </p>
      {:else}
        <div class="cards scrollbar-styled" role="listbox" aria-label="Remappers">
          {#each selectedBandRemappers as remapper (remapper.id)}
            <RemapperCard
              remapper={remapper}
              bandName={bands.find((b) => b.id === remapper.bandId)?.name ?? 'Band'}
              isSelected={selectedRemapperIds.has(remapper.id)}
              liveValues={liveValuesByRemapper.get(remapper.id) ?? null}
              onSelect={(e) => toggleRemapperSelection(remapper.id, e)}
              onConnect={browseOnly ? undefined : () => handleConnectRemapper(remapper.id)}
              onDelete={() => {
                onAudioSetupChange?.(removeAudioRemapper(audioSetup, remapper.id));
                selectedRemapperIds = new Set([...selectedRemapperIds].filter((id) => id !== remapper.id));
              }}
              onRemapperChange={(updater) => handleRemapperChange(remapper.id, updater)}
            />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .large {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    box-sizing: border-box;

    .columns {
      display: grid;
      /* ~300:460 ratio; fills panel width between min/max on the shell */
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.533fr);
      grid-template-rows: minmax(0, 1fr);
      width: 100%;
      height: 100%;
      gap: 0;
      flex: 1;
      min-height: 0;
      overflow: hidden;

      .left {
        display: flex;
        flex-direction: column;
        gap: var(--pd-md);
        min-width: 0;
        min-height: 0;
        align-self: stretch;
        padding: var(--pd-md);
        overflow-x: hidden;
        overflow-y: auto;
        box-sizing: border-box;

        /* Natural height per band; never shrink cards inside the scroll column. */
        & > :global(.band-card) {
          flex: 0 0 auto;
          width: 100%;
          min-width: 0;
        }

        .hint {
          margin: var(--pd-xs) 0 0;
          font-size: var(--text-xs);
          color: var(--color-gray-110);
          flex-shrink: 0;
        }
      }

      .right {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        align-self: stretch;
        overflow: hidden;
        padding: 0;
        gap: 0;
        background: var(--color-gray-60);
        border-radius: var(--radius-md);
        box-sizing: border-box;

        .toolbar {
          display: flex;
          flex-direction: row;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--pd-md);
          padding: var(--pd-md) var(--pd-md);
          flex-shrink: 0;

          .controls {
            display: flex;
            flex-direction: row;
            align-items: flex-end;
            justify-content: space-between;
            gap: var(--pd-sm);
          }
          .row {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: var(--pd-sm);

            .label {
              font-size: var(--text-xs);
              color: var(--color-gray-110);
              padding-left: var(--pd-xs);
            }
          }
        }

        .empty {
          flex: 1 1 auto;
          min-height: 0;
          margin: 0;
          padding: var(--pd-md);
          font-size: var(--text-sm);
          color: var(--text-muted, var(--color-gray-100));
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .cards {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: var(--pd-sm);
          padding: var(--pd-md);
          overflow-x: hidden;
          overflow-y: auto;
          box-sizing: border-box;

          /* Full width, intrinsic height; scroll lives on .cards, not squashed cards. */
          & > :global(.remapper-card) {
            flex: 0 0 auto;
            width: 100%;
            min-width: 0;
          }
        }
      }
    }
  }
</style>
