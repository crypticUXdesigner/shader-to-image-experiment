<script lang="ts">
  /**
   * BottomBar
   * Composes BottomBarPlaybackControls, BottomBarScrubber, BottomBarToolSelector; timeline panel opens in App.
   */
  import { graphStore } from '../../stores';
  import type { ToolType } from '../../stores';
  import type { AudioSetup } from '../../../data-model/audioSetupTypes';
  import type { WaveformData } from '../../../runtime';
  import type { AuthenticatedClient } from '@audiotool/nexus';
  import type { PlaylistTrackPickMeta } from '../../../data-model/audioSetupTypes';
  import BottomBarPlaybackControls from './BottomBarPlaybackControls.svelte';
  import BottomBarScrubber from './BottomBarScrubber.svelte';
  import BottomBarToolSelector from './BottomBarToolSelector.svelte';
  import { pollOnAnimationFrame } from '../../utils/pollOnAnimationFrame';

  interface PlaybackState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    /** When true, primary audio has a decoded buffer (see runtime TimelineState). */
    hasAudio?: boolean;
  }

  interface Props {
    getState?: () => PlaybackState | null;
    getWaveformForPrimary?: (trackKey?: string) => Promise<WaveformData>;
    onPlayToggle?: () => void;
    loopCurrentTrack?: boolean;
    onLoopToggle?: () => void;
    onTimeChange?: (time: number) => void;
    onToolChange?: (tool: ToolType) => void;
    /** Called when the timeline floating panel is about to open (restore position, etc.). */
    onTimelinePanelOpen?: () => void;
    /**
     * True when the global audio bands & remappers panel is open (browse-mode
     * picker). Drives the audio toggle's active state in the scrubber.
     */
    isAudioPanelOpen?: boolean;
    /** Toggle the global audio bands & remappers panel. */
    onAudioPanelToggle?: () => void;
    audioSetup?: AudioSetup;
    /** Primary track key from App (ensures waveform scrubber updates on track change when rendered via snippet). */
    primaryTrackKey?: string | null;
    /** If provided, scrubber uses this as fallback. */
    getTrackKey?: () => string | undefined;
    getPrimaryAudioFileNodeId?: () => string | undefined;
    onSelectTrack?: (trackId: string, pickMeta?: PlaylistTrackPickMeta) => void | Promise<void>;
    onAudioFileSelected?: (nodeId: string, file: File) => Promise<void>;
    /** Optional Audiotool OAuth session for listing user tracks in LoadTrackDialog. */
    audiotoolRpcClient?: AuthenticatedClient | null;
    /** OAuth user name (handle) for user-scoped APIs. */
    audiotoolUserName?: string | null;
    /** Called when RPC indicates OAuth bearer is invalid (expired/revoked). */
    onAudiotoolSessionInvalidated?: () => void;
    /** Bound to the floating timeline panel visibility (owned by App). */
    timelinePanelOpen?: boolean;
  }

  let {
    getState,
    getWaveformForPrimary,
    onPlayToggle,
    loopCurrentTrack = false,
    onLoopToggle,
    onTimeChange,
    onToolChange,
    onTimelinePanelOpen,
    isAudioPanelOpen = false,
    onAudioPanelToggle,
    audioSetup = { files: [], bands: [], remappers: [] },
    primaryTrackKey = null,
    getTrackKey,
    getPrimaryAudioFileNodeId,
    onSelectTrack,
    onAudioFileSelected,
    audiotoolRpcClient = null,
    audiotoolUserName = null,
    onAudiotoolSessionInvalidated,
    timelinePanelOpen = $bindable(false),
  }: Props = $props();

  let bottomBarEl: HTMLDivElement;

  let isSpacebarPressed = $state(false);
  let isPlaying = $state(false);
  /** Bumps when decoded primary audio attaches so the scrubber re-fetches waveform (reload race). */
  let playbackWaveformToken = $state('0:0.000');
  const SPACE_PRESS_THRESHOLD = 200;
  let spacebarPressTime: number | null = null;

  function primaryKey(src: NonNullable<AudioSetup['primarySource']>): string {
    return src.type === 'playlist' ? src.trackId : src.type === 'upload' ? src.file?.id ?? '' : '';
  }

  const currentPrimary = $derived(graphStore.audioSetup?.primarySource);
  const currentKey = $derived(currentPrimary ? primaryKey(currentPrimary) : null);

  const activeTool = $derived(graphStore.activeTool);
  const effectiveTool = $derived(isSpacebarPressed ? 'hand' : activeTool);

  const scrubberTrackKey = $derived.by(() => {
    const base = primaryTrackKey ?? currentKey ?? '';
    return `${base}|${playbackWaveformToken}`;
  });

  // Transport tick for BottomBarPlaybackControls + waveform reload token when MP3 decodes
  $effect(() => {
    if (!getState) return;
    return pollOnAnimationFrame(() => {
      const state = getState();
      isPlaying = state?.isPlaying ?? false;
      const has = state?.hasAudio === true;
      const dur = state?.duration ?? 0;
      playbackWaveformToken = `${has ? 1 : 0}:${dur.toFixed(3)}`;
    });
  });

  function handleToolClick(tool: ToolType) {
    graphStore.setActiveTool(tool);
    onToolChange?.(tool);
  }

  function handleToggleTimelinePanel() {
    const next = !timelinePanelOpen;
    if (next) {
      onTimelinePanelOpen?.();
    }
    timelinePanelOpen = next;
  }

  // Keyboard shortcuts
  $effect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.key === ' ' || e.key === 'Space') && !isInput && !e.repeat && spacebarPressTime === null) {
        spacebarPressTime = Date.now();
      }

      if (!isInput && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          handleToolClick('cursor');
        } else if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          handleToolClick('hand');
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          handleToolClick('select');
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          handleToolClick('patch');
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.key === ' ' || e.key === 'Space') && !isInput && spacebarPressTime !== null) {
        const pressDuration = Date.now() - spacebarPressTime;
        if (pressDuration < SPACE_PRESS_THRESHOLD) {
          e.preventDefault();
          onPlayToggle?.();
        }
        spacebarPressTime = null;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  export function setSpacebarPressed(isPressed: boolean): void {
    isSpacebarPressed = isPressed;
  }
  export function setTimelinePanelOpen(open: boolean): void {
    if (open && !timelinePanelOpen) {
      onTimelinePanelOpen?.();
    }
    timelinePanelOpen = open;
  }
  export function isTimelinePanelVisible(): boolean {
    return timelinePanelOpen;
  }
  export function getElement(): HTMLElement | null {
    return bottomBarEl ?? null;
  }
</script>

<svelte:window />

<div class="bottom-bar-wrapper">
  <div bind:this={bottomBarEl} class="bottom-bar">
    <!-- Left: Play + Track selector -->
    <div class="section">
      <BottomBarPlaybackControls
        isPlaying={isPlaying}
        audioSetup={audioSetup}
        loopCurrentTrack={loopCurrentTrack}
        onPlayToggle={onPlayToggle}
        onLoopToggle={onLoopToggle}
        getPrimaryAudioFileNodeId={getPrimaryAudioFileNodeId}
        onSelectTrack={onSelectTrack}
        onAudioFileSelected={onAudioFileSelected}
        audiotoolRpcClient={audiotoolRpcClient}
        audiotoolUserName={audiotoolUserName ?? undefined}
        onAudiotoolSessionInvalidated={onAudiotoolSessionInvalidated}
      />
    </div>

    <!-- Center: Scrubber (timeline is a floating panel in App) -->
    <div class="section center timeline-center">
      <BottomBarScrubber
        trackKey={scrubberTrackKey}
        getTrackKey={getTrackKey}
        getState={getState}
        getWaveformForPrimary={getWaveformForPrimary}
        onTimeChange={onTimeChange}
        isTimelinePanelOpen={timelinePanelOpen}
        onToggleTimelinePanel={handleToggleTimelinePanel}
        isAudioPanelOpen={isAudioPanelOpen}
        onToggleAudioPanel={onAudioPanelToggle}
      />
    </div>

    <!-- Right: Tool selector -->
    <div class="section">
      <BottomBarToolSelector effectiveTool={effectiveTool} onToolChange={onToolChange} />
    </div>
  </div>
</div>

<style>
  /* === Bottom bar layout (moved from layout/bottom-bar.css) === */
  .bottom-bar-wrapper {
    /* Layout */
    position: fixed;
    bottom: 0;
    left: var(--top-bar-left-offset, 0px);
    right: 0;

    /* Visual: transparent so gradient in .bottom-bar shows through */
    background: transparent;

    /* Other */
    z-index: var(--bottom-bar-z-index);
    pointer-events: none;
    transition: left var(--motion-spatial-fast-duration) var(--motion-spatial-fast-easing);
  }

  .bottom-bar {
    /* Layout */
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--bottom-bar-height);

    /* Box model */
    padding: 0 var(--pd-xl);

    /* Visual */
    background: radial-gradient(ellipse 40% 80% at 50% 100%, rgba(0, 0, 0, 0.35) 0%, transparent 100%);

    /* Other */
    pointer-events: none;

    .section {
      /* Layout */
      display: flex;
      align-items: center;
      gap: var(--pd-xl);
      min-width: 0; /* allow shrink so track selector stays within bar */

      /* Box model */
      padding: var(--pd-lg) 0;

      /* Other */
      pointer-events: auto;

      &.center.timeline-center {
        position: absolute;
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: none;

        :global(.playback-scrubber) {
          pointer-events: auto;
        }

        :global(.playback-scrubber .timeline-preview-block) {
          pointer-events: auto;
        }
      }
    }
  }
</style>
