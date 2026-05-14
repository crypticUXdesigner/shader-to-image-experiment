<script lang="ts">
  /**
   * Concrete floating panel implementation for the audio signal picker.
   * Composes FloatingPanel (chrome + drag) with audio-specific content and sizing.
   */
  import type { NodeGraph } from '../../../data-model/types';
  import type { NodeSpec } from '../../../types/nodeSpec';
  import type { AudioSetup } from '../../../data-model/audioSetupTypes';
  import { getPrimaryFileId } from '../../../data-model/audioSetupTypes';
  import type { SignalSelectPayload } from '../../../types/editor';
  import type { LargeSlotProps, CompactSlotProps } from './AudioSignalPicker.types';
  import AudioSignalPickerLargeContent from './AudioSignalPickerLargeContent.svelte';
  import AudioSignalPickerCompact from './AudioSignalPickerCompact.svelte';
  import { getParamPortConnectionState } from '../../../utils/paramPortAudioState';
  import { getSignalIdFromVirtualNodeId } from '../../../utils/virtualNodes';
  import { addAudioBand, generateUUID } from '../../../data-model';
  import type { AudioBandEntry } from '../../../data-model/audioSetupTypes';
  import { Button, IconSvg } from '../ui';
  import FloatingPanel from './FloatingPanel.svelte';

  interface AudioSignalPickerPanelProps {
    open: boolean;
    /** Stored position for the large (no-connection) popover. */
    xLarge: number;
    yLarge: number;
    /** Stored position for the compact (audio-connected) popover. */
    xCompact: number;
    yCompact: number;
    /** When the user drags the large panel, call with new center (x, y). */
    onPositionChangeLarge?: (x: number, y: number) => void;
    /** When the user drags the compact panel, call with new center (x, y). */
    onPositionChangeCompact?: (x: number, y: number) => void;
    targetNodeId: string;
    targetParameter: string;
    /** Port element that opened this – avoids closing when same click opens */
    triggerElement?: HTMLElement | null;
    graph: NodeGraph;
    audioSetup: AudioSetup;
    nodeSpecs: Map<string, NodeSpec>;
    onSelect: (signal: SignalSelectPayload) => void;
    onClose: () => void;
    /** Called when bands/remappers are added or updated (large content). */
    onAudioSetupChange: (setup: AudioSetup) => void;
    /** Optional: for live spectrum and remapper visualization in picker. */
    getAudioManager?: () => import('../../../runtime/types').IAudioManager | null;
    /**
     * Browse-only mode: opened from a global entry point (e.g. bottom-bar audio
     * button) rather than a parameter port. Forces the large slot, hides
     * Connect actions, and changes the aria label. `targetNodeId` /
     * `targetParameter` can be empty strings in this mode.
     */
    browseOnly?: boolean;
    class?: string;
  }

  let {
    open,
    xLarge,
    yLarge,
    xCompact,
    yCompact,
    onPositionChangeLarge,
    onPositionChangeCompact,
    targetNodeId,
    targetParameter,
    triggerElement = null,
    graph,
    audioSetup,
    nodeSpecs,
    onSelect,
    onClose,
    onAudioSetupChange,
    getAudioManager,
    browseOnly = false,
    class: className = ''
  }: AudioSignalPickerPanelProps = $props();

  const connectionState = $derived(
    getParamPortConnectionState(targetNodeId, targetParameter, graph, audioSetup)
  );

  const mode = $derived(
    browseOnly
      ? 'large'
      : connectionState.state === 'audio-connected' ? 'compact' : 'large'
  );

  /** When set from compact "Open full", show large slot with this band pre-selected. */
  let expandToLargeWithBandId = $state<string | null>(null);

  /** True when we are showing the large slot (either no connection or expanded from compact). */
  const showingLarge = $derived(mode === 'large' || expandToLargeWithBandId != null);

  const connection = $derived(
    graph.connections.find(
      (c) =>
        c.targetNodeId === targetNodeId && c.targetParameter === targetParameter
    )
  );

  const compactConnectionInfo = $derived.by(() => {
    if (mode !== 'compact' || !connection) return null;
    const virtualNodeId = connection.sourceNodeId;
    const signalId = getSignalIdFromVirtualNodeId(virtualNodeId);
    return {
      connectedVirtualNodeId: virtualNodeId,
      connectedSignalId: signalId,
      connectionId: connection.id,
      connectionDisabled: !!connection.disabled,
    };
  });

  function handleClose() {
    expandToLargeWithBandId = null;
    onClose();
  }

  let deleteHandler = $state<(() => void) | null>(null);

  /** Props for large slot. Built here so contract is explicit. */
  const largeSlotProps = $derived({
    targetNodeId,
    targetParameter,
    triggerElement,
    graph,
    audioSetup,
    nodeSpecs,
    onSelect,
    onClose: handleClose,
    onAudioSetupChange,
    getAudioManager,
    initialBandId: expandToLargeWithBandId ?? undefined,
    registerDeleteHandler: (handler: (() => void) | null) => {
      deleteHandler = handler;
    },
    browseOnly,
  } satisfies LargeSlotProps);

  /** Props for compact slot. Only valid when compactConnectionInfo is set. */
  const compactSlotProps = $derived.by((): CompactSlotProps | null => {
    if (!compactConnectionInfo) return null;
    return {
      targetNodeId,
      targetParameter,
      triggerElement,
      graph,
      audioSetup,
      nodeSpecs,
      onSelect,
      onClose: handleClose,
      onAudioSetupChange,
      getAudioManager,
      ...compactConnectionInfo,
      onOpenLargeWithBand: (bandId: string) => {
        expandToLargeWithBandId = bandId;
      },
    };
  });

  const x = $derived(showingLarge ? xLarge : xCompact);
  const y = $derived(showingLarge ? yLarge : yCompact);
  const onPositionChange = $derived(
    showingLarge ? onPositionChangeLarge : onPositionChangeCompact
  );

  const hasFiles = $derived(!!getPrimaryFileId(audioSetup));
  const bands = $derived(audioSetup.bands);

  function nextBandIndex(bands: readonly AudioBandEntry[]): number {
    // Prefer monotonic numeric names ("01", "02", ...) even if bands are deleted/reordered.
    // Fall back to length+1 when existing names aren't purely numeric.
    let max = 0;
    for (const b of bands) {
      const t = b.name.trim();
      if (!/^\d+$/.test(t)) continue;
      const n = Number.parseInt(t, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return (max || bands.length) + 1;
  }

  function handleNewBand() {
    const primaryId = getPrimaryFileId(audioSetup);
    if (!primaryId) return;
    const n = nextBandIndex(bands);
    const newBand: AudioBandEntry = {
      id: `band-${generateUUID()}`,
      name: String(n).padStart(2, '0'),
      sourceFileId: primaryId,
      frequencyBands: [[20, 20000]],
      attackHalfLifeSeconds: 1 / 120,
      releaseHalfLifeSeconds: 1 / 120,
      fftSize: 2048,
    };
    onAudioSetupChange(addAudioBand(audioSetup, newBand));
  }

  /** Do not handle Del/Backspace when focus is in an input so the user can edit text. */
  const INPUT_LIKE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(INPUT_LIKE_SELECTOR)) return;
      e.preventDefault();
      handleClose();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(INPUT_LIKE_SELECTOR)) return;
      deleteHandler?.();
      e.preventDefault();
    }
  }
</script>

<FloatingPanel
  open={open}
  x={x}
  y={y}
  triggerElement={triggerElement}
  closeOnClickOutside={false}
  onClose={handleClose}
  onPositionChange={onPositionChange}
  onKeydown={handleKeydown}
  ariaLabel={showingLarge
    ? browseOnly
      ? 'Audio bands and remappers'
      : 'Choose or create audio signal'
    : 'Configure connected audio signal'}
  class="audio-signal-picker {className}"
>
  {#snippet headerLeft()}
    {#if showingLarge}
      <Button
        variant="ghost"
        size="sm"
        mode="both"
        iconPosition="trailing"
        disabled={!hasFiles}
        title={hasFiles ? 'New band' : 'Upload'}
        onclick={handleNewBand}
        aria-label="New band"
      >
        <IconSvg name="plus" variant="line" />
        New band
      </Button>
    {/if}
  {/snippet}

  {#snippet children()}
    {#if showingLarge && largeSlotProps}
      <div class="body large" data-slot="large">
        <AudioSignalPickerLargeContent {...largeSlotProps} />
      </div>
    {:else if compactSlotProps}
      <div class="body compact" data-slot="compact">
        <AudioSignalPickerCompact {...compactSlotProps} />
      </div>
    {/if}
  {/snippet}
</FloatingPanel>

<style>
  .body {
    /* layout */
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;

    &.large {
      /* one-off: large picker dimensions */
      width: 100%;
      min-width: 780px;
      max-width: 780px;
      height: 70vh;
      min-height: 70vh;
      max-height: 70vh;

      /* Let large content fill the 70vh shell (flex chain for grid / scroll). */
      > :global(.large) {
        flex: 1;
        min-height: 0;
        min-width: 0;
        align-self: stretch;
      }
    }

    &.compact {
      /* one-off: compact picker dimensions (match AudioSignalPickerCompact .compact) */
      min-width: 300px;
      max-width: 420px;
      min-height: 120px;
    }
  }
</style>

