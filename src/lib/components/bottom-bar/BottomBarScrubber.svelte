<script lang="ts">
  /**
   * BottomBarScrubber - Audio + timeline toggles, waveform strip, playhead, and time display.
   */
  import { untrack } from 'svelte';
  import { Button, ButtonGroup, IconSvg } from '../ui';
  import type { WaveformData } from '../../../runtime';
  import { pollOnAnimationFrame } from '../../utils/pollOnAnimationFrame';

  interface PlaybackState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  }

  interface Props {
    /** Current track key for waveform (e.g. playlist track id or file id). Used for display when getTrackKey not provided. */
    trackKey: string | null;
    /** When provided, effect calls this so it subscribes directly to store; fixes waveform not updating on track change. */
    getTrackKey?: () => string | undefined;
    getState?: () => PlaybackState | null;
    getWaveformForPrimary?: (trackKey?: string) => Promise<WaveformData>;
    onTimeChange?: (time: number) => void;
    isTimelinePanelOpen: boolean;
    onToggleTimelinePanel?: () => void;
    /** True when the global audio bands & remappers panel is open. */
    isAudioPanelOpen?: boolean;
    /** Toggle the global audio bands & remappers panel. */
    onToggleAudioPanel?: () => void;
  }

  let {
    trackKey,
    getTrackKey,
    getState,
    getWaveformForPrimary,
    onTimeChange,
    isTimelinePanelOpen,
    onToggleTimelinePanel,
    isAudioPanelOpen = false,
    onToggleAudioPanel,
  }: Props = $props();

  let stripWrapperEl: HTMLDivElement;
  let waveformCanvasEl: HTMLCanvasElement | undefined;

  let currentTime = $state(0);
  let duration = $state(0);
  let playheadPercent = $state(0);
  let isDraggingPreview = $state(false);
  let didMoveDuringPreviewDrag = $state(false);

  let waveformData = $state<WaveformData | null>(null);
  let waveformDataKey = $state<string | null>(null);
  let waveformLoading = $state(false);

  /** Displayed (animated) bar heights 0–1; drawn each frame. */
  let displayedLeft = $state<number[]>([]);
  let displayedRight = $state<number[]>([]);
  /** Target bar heights (from API or min when clearing). */
  let targetLeft = $state<number[] | null>(null);
  let targetRight = $state<number[] | null>(null);
  /** Global animation phase 0..1+staggerAmount for stagger-in/out. */
  let animationProgress = $state(0);

  const LOAD_DELAY_MS = 150;
  const MIN_WAVEFORM_VALUE = 0.05;
  const WAVEFORM_ANIMATION_SPEED = 1.5;
  const STAGGER_AMOUNT = 0.6;
  const ANIMATION_PROGRESS_INCREMENT = 0.015;
  const CLEAR_DELAY_MS = 500;

  /** So we can cancel the clear timeout when new data arrives. */
  let clearDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  /** Key we started loading for; only apply result if it still matches (so we don't discard due to store timing). */
  let keyWeAreLoadingFor: string | null = null;

  /** Current track key from props (from App via primaryTrackKey so waveform updates on track change). */
  const effectiveKey = $derived(trackKey ?? (typeof getTrackKey === 'function' ? getTrackKey() : null) ?? null);

  /**
   * Update mechanism (track change → waveform update):
   * 1. effectiveKey comes from props (primaryTrackKey from App) so the scrubber updates when track changes.
   * 2. We read getWaveformForPrimary and fallback key inside untrack() so parent re-renders (new
   *    callback refs) don’t re-run this effect and cancel the load timeout before it fires.
   * 3. When the store’s primary changes, we schedule a clear and a load. When the promise resolves
   *    we set waveformData, waveformDataKey, targetLeft/Right, displayedLeft/Right.
   * 4. The draw effect runs the rAF loop; drawWaveformStrip() paints each frame.
   */
  $effect(() => {
    const key = effectiveKey;
    const getter = untrack(() => getWaveformForPrimary);
    if (!getter || !key) {
      const len = untrack(() => displayedLeft.length);
      if (len > 0) {
        untrack(() => {
          targetLeft = displayedLeft.map(() => MIN_WAVEFORM_VALUE);
          targetRight = displayedRight.map(() => MIN_WAVEFORM_VALUE);
          animationProgress = 0;
        });
        if (clearDelayTimeoutId != null) {
          clearTimeout(clearDelayTimeoutId);
          clearDelayTimeoutId = null;
        }
        clearDelayTimeoutId = setTimeout(() => {
          clearDelayTimeoutId = null;
          displayedLeft = [];
          displayedRight = [];
          targetLeft = null;
          targetRight = null;
          animationProgress = 0;
        }, CLEAR_DELAY_MS);
        waveformData = null;
        waveformDataKey = null;
        waveformLoading = false;
        return () => {
          if (clearDelayTimeoutId != null) {
            clearTimeout(clearDelayTimeoutId);
            clearDelayTimeoutId = null;
          }
        };
      }
      waveformData = null;
      waveformDataKey = null;
      waveformLoading = false;
      return;
    }
    const haveDataForThisKey = waveformDataKey === key && waveformData && waveformData.values.length > 0;
    if (haveDataForThisKey) return;

    const lenForClear = untrack(() => displayedLeft.length);
    if (lenForClear > 0) {
      untrack(() => {
        targetLeft = displayedLeft.map(() => MIN_WAVEFORM_VALUE);
        targetRight = displayedRight.map(() => MIN_WAVEFORM_VALUE);
        animationProgress = 0;
      });
    }
    // Do NOT set waveformData/waveformDataKey to null here: that would re-run this effect (they're
    // read in haveDataForThisKey), and the cleanup would clear the load timeout so the load never runs.

    if (clearDelayTimeoutId != null) {
      clearTimeout(clearDelayTimeoutId);
      clearDelayTimeoutId = null;
    }
    clearDelayTimeoutId = setTimeout(() => {
      clearDelayTimeoutId = null;
      displayedLeft = [];
      displayedRight = [];
      targetLeft = null;
      targetRight = null;
      animationProgress = 0;
    }, CLEAR_DELAY_MS);

    const loadTimeoutId = setTimeout(() => {
      if (effectiveKey !== key) return;
      keyWeAreLoadingFor = key;
      waveformLoading = true;
      getter(key).then((data) => {
        if (keyWeAreLoadingFor !== key) return;
        if (key && data.values.length > 0) {
          if (clearDelayTimeoutId != null) {
            clearTimeout(clearDelayTimeoutId);
            clearDelayTimeoutId = null;
          }
          waveformData = data;
          waveformDataKey = key;
          const left = data.values;
          const right = (data.valuesRight != null && data.valuesRight.length === left.length)
            ? data.valuesRight
            : left;
          targetLeft = left;
          targetRight = right;
          displayedLeft = new Array(left.length).fill(MIN_WAVEFORM_VALUE);
          displayedRight = new Array(right.length).fill(MIN_WAVEFORM_VALUE);
          animationProgress = 0;
        } else {
          waveformData = null;
          waveformDataKey = null;
        }
        waveformLoading = false;
      }).catch(() => {
        if (keyWeAreLoadingFor !== key) return;
        waveformData = null;
        waveformDataKey = null;
        waveformLoading = false;
      });
    }, LOAD_DELAY_MS);

    return () => {
      if (clearDelayTimeoutId != null) {
        clearTimeout(clearDelayTimeoutId);
        clearDelayTimeoutId = null;
      }
      clearTimeout(loadTimeoutId);
    };
  });

  /** Lerp displayed toward target each frame with stagger (reference). */
  function interpolateWaveformData(): void {
    const tL = targetLeft;
    const tR = targetRight;
    if (tL == null || tR == null || displayedLeft.length === 0) return;
    const n = displayedLeft.length;
    if (animationProgress < 1 + STAGGER_AMOUNT) {
      animationProgress = Math.min(animationProgress + ANIMATION_PROGRESS_INCREMENT, 1 + STAGGER_AMOUNT);
    }
    const minVal = MIN_WAVEFORM_VALUE;
    for (let i = 0; i < n; i++) {
      const barStartTime = (i / n) * STAGGER_AMOUNT;
      const barProgress = Math.max(0, Math.min(1, animationProgress - barStartTime));
      const targetL = tL[i] ?? minVal;
      const targetR = tR[i] ?? minVal;
      const speed = WAVEFORM_ANIMATION_SPEED * barProgress;
      displayedLeft[i] += (targetL - displayedLeft[i]) * speed;
      displayedRight[i] += (targetR - displayedRight[i]) * speed;
    }
  }

  function drawWaveformStrip(): void {
    interpolateWaveformData();

    const canvas = waveformCanvasEl;
    if (!canvas || !stripWrapperEl) return;
    const wrapperRect = stripWrapperEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio ?? 1;
    const w = Math.round(wrapperRect.width * dpr);
    const h = Math.round(wrapperRect.height * dpr);
    if (w <= 0 || h <= 0) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const root = canvas.closest('.bottom-bar') ?? canvas.closest('.playback-scrubber') ?? document.documentElement;
    const style = getComputedStyle(root as HTMLElement);
    const colorGray = style.getPropertyValue('--color-gray-40').trim() || '#666';
    const colorUnplayed = style.getPropertyValue('--bottom-bar-waveform-unplayed').trim() || style.getPropertyValue('--color-blue-90').trim() || '#4a90d9';
    const colorPlayed = style.getPropertyValue('--bottom-bar-waveform-played').trim() || style.getPropertyValue('--color-blue-70').trim() || '#2c3792';
    ctx.clearRect(0, 0, w, h);
    const centerY = h / 2;
    const minBarPx = Math.max(0.5, 1 * (dpr || 1));
    const values = displayedLeft;
    const valuesRight = displayedRight;
    const n = values.length;
    if (n === 0) {
      ctx.fillStyle = colorGray;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = colorUnplayed;
      ctx.fillRect(0, Math.floor(centerY) - 1, w, 2);
      return;
    }
    const halfHeight = (h / 2) * 0.9;
    const playheadX = (playheadPercent / 100) * w;
    const barWidth = 1;
    for (let i = 0; i < w; i++) {
      const t = w > 1 && n > 1 ? (i / (w - 1)) * (n - 1) : 0;
      const idx = Math.min(Math.floor(t), n - 1);
      const idxNext = Math.min(idx + 1, n - 1);
      const frac = t - idx;
      const vL = Math.min(1, Math.max(0, values[idx] * (1 - frac) + values[idxNext] * frac));
      const vR = Math.min(1, Math.max(0, valuesRight[idx] * (1 - frac) + valuesRight[idxNext] * frac));
      const x = i;
      const isPlayed = x + 0.5 < playheadX;
      ctx.fillStyle = isPlayed ? colorPlayed : colorUnplayed;
      const ampL = Math.max(minBarPx, vL * halfHeight);
      const ampR = Math.max(minBarPx, vR * halfHeight);
      const yTop = centerY - ampL;
      const yBottom = centerY + ampR;
      ctx.fillRect(x, Math.min(yTop, centerY), barWidth, Math.abs(centerY - yTop));
      ctx.fillRect(x, centerY, barWidth, Math.abs(yBottom - centerY));
    }
  }

  $effect(() => {
    waveformData;
    waveformDataKey;
    waveformLoading;
    playheadPercent;
    stripWrapperEl;
    waveformCanvasEl;
    effectiveKey;
    if (!stripWrapperEl || !waveformCanvasEl) return;
    const ro = new ResizeObserver(() => drawWaveformStrip());
    ro.observe(stripWrapperEl);
    // Draw only inside rAF so we never write to displayedLeft/displayedRight/animationProgress
    // during effect run (avoids effect_update_depth_exceeded).
    let rafId: number;
    function loop(): void {
      drawWaveformStrip();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  });

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  const timeDisplayText = $derived(`${formatTime(currentTime)} | ${formatTime(duration)}`);

  $effect(() => {
    if (!getState) return;
    return pollOnAnimationFrame(() => {
      const state = getState();
      if (state) {
        currentTime = state.currentTime;
        duration = state.duration;
        if (!isDraggingPreview && duration > 0) {
          playheadPercent = Math.max(0, Math.min(100, (state.currentTime / duration) * 100));
        }
      } else {
        currentTime = 0;
        duration = 0;
        playheadPercent = 0;
      }
    });
  });

  function getPercentFromStripEvent(e: MouseEvent): number {
    if (!stripWrapperEl) return 0;
    const rect = stripWrapperEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(1, rect.width > 0 ? x / rect.width : 0));
  }

  function getTimeFromStripEvent(e: MouseEvent): number | null {
    const percent = getPercentFromStripEvent(e);
    const state = getState?.();
    if (!state || state.duration <= 0) return null;
    return percent * state.duration;
  }

  function performSeek(time: number): void {
    onTimeChange?.(time);
    const state = getState?.();
    if (state && state.duration > 0) {
      playheadPercent = Math.max(0, Math.min(100, (time / state.duration) * 100));
    }
  }

  function seekFromStripEvent(e: MouseEvent): void {
    const time = getTimeFromStripEvent(e);
    if (time === null) return;
    performSeek(time);
  }

  function handleStripMousedown(e: MouseEvent) {
    if (e.button !== 0) return;
    isDraggingPreview = true;
    didMoveDuringPreviewDrag = false;
    const onMouseUp = () => {
      isDraggingPreview = false;
      document.removeEventListener('mousemove', onMouseMove);
    };
    const onMouseMove = (ev: MouseEvent) => {
      didMoveDuringPreviewDrag = true;
      const time = getTimeFromStripEvent(ev);
      if (time !== null) performSeek(time);
    };
    document.addEventListener('mouseup', onMouseUp, { once: true });
    document.addEventListener('mousemove', onMouseMove);
  }

  function handleStripClick(e: MouseEvent) {
    if (e.button !== 0) return;
    if (didMoveDuringPreviewDrag) return;
    seekFromStripEvent(e);
  }

  function handleToggleTimelinePanel() {
    onToggleTimelinePanel?.();
  }

  function handleToggleAudioPanel() {
    onToggleAudioPanel?.();
  }

  function handleStripKeydown(e: KeyboardEvent) {
    // Space is global play/pause (BottomBar listens on window keyup). When the strip stays
    // focused after a click, we must not treat Space as "activate" — that used to seek to
    // 50% (fake pointer at strip center). Only prevent scroll while focused.
    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const rect = stripWrapperEl?.getBoundingClientRect();
    if (!rect) return;
    const fakeEv = { clientX: rect.left + rect.width / 2 } as MouseEvent;
    seekFromStripEvent(fakeEv);
  }
</script>

<div class="playback-scrubber">
  <div class="timeline-preview-block">
    <ButtonGroup class="panel-toggles" ariaLabel="Open panel">
      <Button
        class={`audio-toggle ${isAudioPanelOpen ? 'is-active' : ''}`}
        variant="ghost"
        size="sm"
        mode="icon-only"
        aria-pressed={isAudioPanelOpen}
        title={isAudioPanelOpen ? 'Close audio bands & remappers' : 'Open audio bands & remappers'}
        aria-label={isAudioPanelOpen ? 'Close audio bands and remappers' : 'Open audio bands and remappers'}
        onclick={handleToggleAudioPanel}
      >
        <IconSvg name="waveform" variant="line" />
      </Button>
      <Button
        class={`timeline-toggle ${isTimelinePanelOpen ? 'is-active' : ''}`}
        variant="ghost"
        size="sm"
        mode="icon-only"
        aria-pressed={isTimelinePanelOpen}
        title={isTimelinePanelOpen ? 'Close timeline' : 'Open timeline'}
        aria-label={isTimelinePanelOpen ? 'Close timeline' : 'Open timeline'}
        onclick={handleToggleTimelinePanel}
      >
        <IconSvg name="line-segments" variant="line" />
      </Button>
    </ButtonGroup>
    <div class="timeline-preview control-strip" title="Scrub time">
      <div
        bind:this={stripWrapperEl}
        class="strip-wrapper"
        class:is-loading={waveformLoading}
        role="button"
        aria-label="Scrub timeline"
        tabindex="0"
        onmousedown={handleStripMousedown}
        onclick={handleStripClick}
        onkeydown={handleStripKeydown}
      >
        <div class="timeline-preview-strip">
          <canvas bind:this={waveformCanvasEl} class="waveform-canvas" aria-hidden="true"></canvas>
          {#if waveformLoading}
            <div class="waveform-loading-overlay" aria-hidden="true">Loading…</div>
          {/if}
        </div>
        <div class="playhead" style="left: {playheadPercent}%"></div>
      </div>
    </div>
    <div class="time-display">{timeDisplayText}</div>
  </div>
</div>

<style>
  .playback-scrubber {
    justify-self: flex-end;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    min-height: fit-content;
    padding-bottom: var(--pd-xl);
  }

  .timeline-preview-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: var(--pd-sm);
  }


  .time-display {
    font-family: var(--font-mono);
    font-optical-sizing: auto;
    font-size: var(--text-2xs);
    line-height: 1;
    color: var(--print-default);
    text-align: center;
    white-space: nowrap;
  }

  .timeline-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--timeline-preview-width);
    height: fit-content;
    padding: var(--pd-xs) var(--pd-sm);
    box-sizing: border-box;
    cursor: default;
    pointer-events: auto;
  }

  .strip-wrapper {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    min-height: fit-content;
    cursor: default;
  }

  .strip-wrapper.is-loading {
    cursor: wait;
  }

  .strip-wrapper:focus-visible {
    outline: none;
  }

  .timeline-preview-strip {
    position: relative;
    width: 100%;
    height: var(--size-md);
    border-radius: var(--radius-sm);
    overflow: hidden;
    pointer-events: none;
  }

  .timeline-preview-strip .waveform-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }

  .timeline-preview-strip .waveform-loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    color: var(--color-gray-90);
    font-size: var(--text-xs);
    pointer-events: none;
  }

  .playhead {
    position: absolute;
    top: 50%;
    left: 0%;
    transform: translate(-50%, -50%);
    z-index: 1;
    width: 2px;
    height: 100%;
    background: var(--print-highlight);
    pointer-events: none;
  }
</style>
