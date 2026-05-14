<script lang="ts">
  /**
   * Knob — Rotary knob for float parameters.
   * Uses ValueInput for value display. Replaces canvas KnobParameterRenderer.
   *
   * Drag Y to rotate; value maps to min–max. Arc 135°→45°, 270° sweep; marker at value.
   * One-sided: active arc from min to value. Two-sided: active arc from knobCenter to value.
   *
   * CSS tokens: --knob-marker-radius-offset (negative = inside arc), --knob-marker-size,
   * --knob-center-size (0 = hidden), --knob-center-bg (solid color or url(#gradient)),
   * --knob-center-border, --knob-center-filter (e.g. drop-shadow). Center does not rotate with value.
   */

  import type { Action } from 'svelte/action';
  import type { KnobPolarity } from '../../../../types/nodeSpec';
  import { ValueInput } from '../../ui';

  function readKnobToken(el: HTMLElement | null, name: string, fallback: number): number {
    if (!el) return fallback;
    const val = getComputedStyle(el).getPropertyValue(name).trim();
    if (!val) return fallback;
    const num = parseFloat(val.replace(/[^\d.-]/g, ''));
    return Number.isNaN(num) ? fallback : num;
  }

  interface Props {
    value: number;
    /** When provided, ValueInput seeds inline edit from this number instead of `value` (e.g. rare overrides). */
    valueForEdit?: number;
    min?: number;
    max?: number;
    step?: number;
    decimals?: number;
    disabled?: boolean;
    connected?: boolean;
    /** Arc fill: one-sided (min→value) or two-sided (knobCenter→value). */
    knobPolarity?: KnobPolarity;
    /** Neutral value on the arc for two-sided mode (default 0). */
    knobCenter?: number;
    class?: string;
    onChange?: (value: number) => void;
    onCommit?: (value: number) => void;
  }

  let {
    value,
    valueForEdit,
    min = 0,
    max = 1,
    step = 0.01,
    decimals = 3,
    disabled = false,
    connected = false,
    knobPolarity = 'one-sided',
    knobCenter = 0,
    class: className = '',
    onChange,
    onCommit
  }: Props = $props();

  /* When connected, drag/inline edit adjust the effective value shown; parent maps back to stored config via input mode. */
  const isReadOnly = $derived(disabled);

  type KnobCssLayout = {
    markerRadiusOffsetPx: number;
    markerSizePx: number;
    centerSizePx: number;
    centerBg: string;
    centerBorderWidth: number;
    centerBorderColor: string;
    knobSizePx: number;
    ringBgWidthPx: number;
    ringActiveWidthPx: number;
  };

  function readKnobLayout(el: HTMLElement): KnobCssLayout {
    return {
      markerRadiusOffsetPx: readKnobToken(el, '--knob-marker-radius-offset', 0),
      markerSizePx: readKnobToken(el, '--knob-marker-size', 9),
      centerSizePx: readKnobToken(el, '--knob-center-size', 0),
      knobSizePx: readKnobToken(el, '--knob-size', 90),
      ringBgWidthPx: readKnobToken(el, '--knob-ring-bg-width', 9),
      ringActiveWidthPx: readKnobToken(el, '--knob-ring-active-width', 3),
      centerBg: getComputedStyle(el).getPropertyValue('--knob-center-bg').trim() || 'transparent',
      centerBorderWidth: readKnobToken(el, '--knob-center-border-width', 0),
      centerBorderColor: getComputedStyle(el).getPropertyValue('--knob-center-border-color').trim() || 'transparent',
    };
  }

  const defaultKnobLayout: KnobCssLayout = {
    markerRadiusOffsetPx: 0,
    markerSizePx: 9,
    centerSizePx: 0,
    centerBg: 'transparent',
    centerBorderWidth: 0,
    centerBorderColor: 'transparent',
    knobSizePx: 90,
    ringBgWidthPx: 9,
    ringActiveWidthPx: 3,
  };

  let knobLayout = $state<KnobCssLayout>(defaultKnobLayout);

  const knobMeasure: Action<HTMLElement> = (node) => {
    knobLayout = readKnobLayout(node);
    const ro = new ResizeObserver(() => {
      knobLayout = readKnobLayout(node);
    });
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  };

  const markerRadiusOffsetPx = $derived(knobLayout.markerRadiusOffsetPx);
  const markerSizePx = $derived(knobLayout.markerSizePx);
  const centerSizePx = $derived(knobLayout.centerSizePx);
  const centerBg = $derived(knobLayout.centerBg);
  const centerBorderWidth = $derived(knobLayout.centerBorderWidth);
  const centerBorderColor = $derived(knobLayout.centerBorderColor);
  const knobSizePx = $derived(knobLayout.knobSizePx);
  const ringBgWidthPx = $derived(knobLayout.ringBgWidthPx);
  const ringActiveWidthPx = $derived(knobLayout.ringActiveWidthPx);

  const ARC_SWEEP = 270;
  const TOP_START_DEG = 135;
  const BASE_DRAG_SENSITIVITY = 100;

  function snapValue(raw: number): number {
    let v = Math.max(min, Math.min(max, raw));
    if (typeof step === 'number' && step > 0) {
      v = min + Math.round((v - min) / step) * step;
      v = Math.max(min, Math.min(max, v));
    } else if (decimals === 0) {
      v = Math.round(v);
      v = Math.max(min, Math.min(max, v));
    } else if (decimals > 0) {
      const factor = Math.pow(10, decimals);
      v = Math.round(v * factor) / factor;
      v = Math.max(min, Math.min(max, v));
    }
    return v;
  }

  const range = $derived(max - min);
  const normalized = $derived((range > 0 ? (value - min) / range : 0));
  const markerAngleDeg = $derived((TOP_START_DEG + normalized * ARC_SWEEP) % 360);
  const markerAngleRad = $derived((markerAngleDeg * Math.PI) / 180);

  /* viewBox expanded by max stroke so arc and ring are never clipped; radius clamped so path is valid */
  const maxStrokePx = $derived(Math.max(ringBgWidthPx, ringActiveWidthPx));
  const viewSize = $derived(knobSizePx + maxStrokePx);
  const center = $derived(viewSize / 2);
  const radius = $derived(Math.max(0, knobSizePx / 2 - ringBgWidthPx / 2)); /* Arc center line; clamp so arc stays inside */
  const markerRadius = $derived(radius + markerRadiusOffsetPx);
  const markerX = $derived(markerRadius * Math.cos(markerAngleRad));
  const markerY = $derived(markerRadius * Math.sin(markerAngleRad));
  const markerR = $derived(markerSizePx / 2);
  const centerR = $derived(centerSizePx > 0 ? centerSizePx / 2 : 0);
  const startRad = (TOP_START_DEG * Math.PI) / 180;
  const startX = $derived(radius * Math.cos(startRad));
  const startY = $derived(radius * Math.sin(startRad));
  const end45Rad = Math.PI / 4;
  const endX45 = $derived(radius * Math.cos(end45Rad));
  const endY45 = $derived(radius * Math.sin(end45Rad));

  /** Arc along the knob track from parameter t0 to t1 in [0,1] (min→max). Clockwise sweep flag 1. */
  function arcPathBetweenT(t0: number, t1: number, r: number): string | null {
    if (t1 <= t0) return null;
    const sweepAngle = (t1 - t0) * ARC_SWEEP;
    const largeArc = sweepAngle > 180 ? 1 : 0;
    const angleStartDeg = TOP_START_DEG + t0 * ARC_SWEEP;
    const angleEndDeg = TOP_START_DEG + t1 * ARC_SWEEP;
    const sr = (angleStartDeg * Math.PI) / 180;
    const er = (angleEndDeg * Math.PI) / 180;
    const x0 = r * Math.cos(sr);
    const y0 = r * Math.sin(sr);
    const x1 = r * Math.cos(er);
    const y1 = r * Math.sin(er);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`;
  }

  const valueArcPath = $derived.by(() => {
    if (range <= 0) return null;
    if (knobPolarity === 'two-sided') {
      const c = Math.max(min, Math.min(max, knobCenter));
      const tCenter = (c - min) / range;
      const tValue = normalized;
      const tLo = Math.min(tCenter, tValue);
      const tHi = Math.max(tCenter, tValue);
      return arcPathBetweenT(tLo, tHi, radius);
    }
    if (normalized <= 0) return null;
    return arcPathBetweenT(0, normalized, radius);
  });

  function handlePointerDown(e: PointerEvent) {
    if (isReadOnly) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    el.setPointerCapture(pointerId);
    let currentY = e.clientY;
    /** Unsnapped float; small dy values accumulate across pointer moves until step snaps. */
    let dragAccumulator = value;
    let lastEmittedSnapped = value;

    function handlePointerMove(moveEvent: PointerEvent) {
      const dy = currentY - moveEvent.clientY;
      currentY = moveEvent.clientY;
      const moveRange = max - min;
      const modifier = moveEvent.shiftKey ? 'fine' : (moveEvent.ctrlKey || moveEvent.metaKey ? 'coarse' : 'normal');
      const multipliers = { normal: 1, fine: 0.1, coarse: 10 };
      const sensitivity = BASE_DRAG_SENSITIVITY / multipliers[modifier];
      const valueDelta = (dy / sensitivity) * moveRange;
      dragAccumulator += valueDelta;
      dragAccumulator = Math.max(min, Math.min(max, dragAccumulator));
      const newValue = snapValue(dragAccumulator);
      lastEmittedSnapped = newValue;
      onChange?.(newValue);
    }

    let cleanedUp = false;
    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      try { el.releasePointerCapture(pointerId); } catch { /* already released */ }
      el.removeEventListener('pointermove', handlePointerMove as EventListener);
      window.removeEventListener('pointerup', handlePointerUp as EventListener);
      window.removeEventListener('pointercancel', handlePointerUp as EventListener);
      el.removeEventListener('lostpointercapture', handleLostCapture as EventListener);
      onCommit?.(lastEmittedSnapped);
    }

    function handlePointerUp(upEvent: PointerEvent) {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
    }

    function handleLostCapture(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    el.addEventListener('pointermove', handlePointerMove as EventListener);
    window.addEventListener('pointerup', handlePointerUp as EventListener);
    window.addEventListener('pointercancel', handlePointerUp as EventListener);
    el.addEventListener('lostpointercapture', handleLostCapture as EventListener);
  }
</script>

<div use:knobMeasure class="knob {className}" class:read-only={isReadOnly} class:connected={connected}>
  <div
    class="ring"
    role="slider"
    tabindex={isReadOnly ? -1 : 0}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-disabled={isReadOnly}
    aria-label="Knob. Drag to adjust value."
    onpointerdown={handlePointerDown}
  >
    <svg class="svg" viewBox="0 0 {viewSize} {viewSize}" aria-hidden="true">
      <g transform="translate({center}, {center})">
        <!-- Optional center circle (behind arc). Border drawn inside so stroke doesn't expand the circle. -->
        {#if centerR > 0}
          <circle
            class="center center-fill"
            cx="0"
            cy="0"
            r={centerR}
            fill={centerBg}
          />
          {#if centerBorderWidth > 0}
            <circle
              class="center center-border"
              cx="0"
              cy="0"
              r={centerR - centerBorderWidth / 2}
              fill="none"
              stroke={centerBorderColor}
              stroke-width={centerBorderWidth}
            />
          {/if}
        {/if}
        <!-- Background arc (135° to 45°, 270° sweep clockwise) -->
        <path
          class="arc-bg"
          d="M {startX} {startY} A {radius} {radius} 0 1 1 {endX45} {endY45}"
          fill="none"
        />
        <!-- Value highlight arc -->
        {#if valueArcPath}
          <path
            class="arc-active"
            class:animated={connected}
            d={valueArcPath}
            fill="none"
          />
        {/if}
        <!-- Marker dot at value position -->
        <circle
          class="marker"
          cx={markerX}
          cy={markerY}
          r={markerR}
        />
      </g>
    </svg>
  </div>
  <div class="value-row">
    <ValueInput
      value={value}
      valueForEdit={valueForEdit}
      {min}
      {max}
      {step}
      {decimals}
      disabled={isReadOnly}
      onChange={onChange}
      onCommit={onCommit}
      class="knob-value-input"
    />
  </div>
</div>

<style>
  .knob {
    /* Layout */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    width: var(--knob-size);
    flex-shrink: 0;

    &.read-only .ring {
      cursor: default;
      opacity: var(--opacity-disabled);
    }

    .ring {
      position: relative;
      width: var(--knob-size);
      height: var(--knob-size);
      cursor: ns-resize;
      touch-action: none;
      user-select: none;
    }

    .ring:focus {
      outline: none;
    }

    .ring:focus-visible {
      outline: 2px solid var(--color-blue-90);
      outline-offset: 2px;
    }

    .ring .svg {
      width: 100%;
      height: 100%;
      transform: rotate(0deg);
    }

    .ring .arc-bg {
      stroke: var(--knob-ring-color);
      stroke-width: var(--knob-ring-bg-width);
      stroke-linecap: round;
    }

    .ring .arc-active {
      stroke: var(--knob-ring-active-color-static);
      stroke-width: var(--knob-ring-active-width);
      stroke-linecap: round;
    }

    .ring .arc-active.animated {
      stroke: var(--knob-ring-active-color-animated);
    }

    .ring .marker {
      fill: var(--knob-marker-color);
    }

    .ring .center-fill {
      filter: var(--knob-center-filter, none);
    }

    /* Per-category: .node.{slug} sets --knob-ring-color, --knob-ring-active-color-static,
       --knob-marker-color, --knob-value-bg, --knob-value-color on itself; knob inherits. */

    .value-row {
      display: flex;
      justify-content: center;

      /* ValueInput receives class="knob-value-input"; use :global to target child component */
      :global(.knob-value-input) {
        --value-display-min-width: 60px;
        --param-control-bg: var(--knob-value-bg);
        --param-control-value-color: var(--knob-value-color);
      }
    }
  }
</style>
