<script lang="ts">
  import { tick } from 'svelte';
  import { createStrictTapThenDownDouble } from '../../../utils/strictDoubleClick';
  import { pointerModifierDragMultiplier } from './valueInputDragSensitivity';

  interface Props {
    value: number;
    /** When set, inline edit (double-click) seeds from this instead of `value`. Must match what `onChange` interprets (usually the same domain as `value`). */
    valueForEdit?: number;
    min?: number;
    max?: number;
    step?: number;
    decimals?: number;
    disabled?: boolean;
    size?: 'sm' | 'md';
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
    size = 'md',
    class: className = '',
    onChange,
    onCommit
  }: Props = $props();

  let editMode = $state(false);
  let editText = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  let wrapperEl: HTMLDivElement | undefined = $state();
  let lockedWidthPx: number | undefined = $state();

  const valueTapStrictDouble = createStrictTapThenDownDouble();

  /** Same base as Knob: modifiers divide/multiply effective sensitivity. */
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

  function formatDisplay(v: number): string {
    if (decimals === 0) return Math.round(v).toString();
    return v.toFixed(decimals);
  }

  const displayText = $derived(editMode ? editText : formatDisplay(value));

  function handleDisplayFocus(ev: FocusEvent) {
    if (disabled || editMode) return;
    const el = ev.currentTarget as HTMLElement;
    requestAnimationFrame(() => {
      if (disabled || editMode) return;
      if (document.activeElement !== el) return;
      if (el.matches(':focus-visible')) {
        void enterEditMode();
      }
    });
  }

  async function enterEditMode() {
    if (disabled || editMode) return;
    valueTapStrictDouble.reset();
    if (wrapperEl) lockedWidthPx = wrapperEl.offsetWidth;
    editMode = true;
    editText = formatDisplay(valueForEdit ?? value);
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function handlePointerDown(e: PointerEvent) {
    if (disabled || editMode) return;
    if (valueTapStrictDouble.consumeIfSecondPress(e)) {
      // Strict-tap-then-down has decided this primary-mouse pointerdown completes a double-tap;
      // suppress the compatibility `mousedown → click → dblclick` chain for this pointer. Without
      // this, Chrome still dispatches `mousedown` whose default action retargets focus based on
      // the (now-detached) `.value-display` — focus collapses to `<body>`, the freshly mounted
      // `<input>` blurs, `handleBlur → commitEdit` closes edit mode within the same frame, and
      // the user never gets to type. `preventDefault()` here is safe because we are *consuming*
      // this press (no drag will start; no native dblclick is needed — we already enter edit
      // mode via `enterEditMode()` below).
      e.preventDefault();
      void enterEditMode();
      return;
    }
    // IMPORTANT: do NOT `preventDefault()` here (first-press path). In Chrome, `preventDefault()`
    // on a primary-mouse `pointerdown` suppresses the compatibility
    // `mousedown → mouseup → click → dblclick` chain for that pointer. That kills the native
    // double-click fallback (`ondblclick={handleDblClick}` below) used when the strict-tap-then-down
    // gesture does not arm (e.g. user moved between taps). Text selection is already prevented
    // by CSS (`user-select: none` on `.value-display`). We only need `preventDefault()` once a
    // real drag begins, which is handled inside `handlePointerMove` below.
    const el = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    el.setPointerCapture(pointerId);
    let currentX = e.clientX;
    let currentY = e.clientY;
    let dragMovedBeyondTap = false;
    /** Unsnapped float; small dy values accumulate across pointer moves until step snaps. */
    let dragAccumulator = value;
    let lastEmittedSnapped = value;

    function handlePointerMove(moveEvent: PointerEvent) {
      if (
        Math.abs(moveEvent.clientX - e.clientX) > 3 ||
        Math.abs(moveEvent.clientY - e.clientY) > 3
      ) {
        if (!dragMovedBeyondTap) {
          dragMovedBeyondTap = true;
        }
      }
      // Once we're in a real drag, suppress default behavior (text selection start, drag images)
      // for subsequent moves. We did not `preventDefault()` on pointerdown so the native click /
      // dblclick chain is preserved for tap-only gestures.
      if (dragMovedBeyondTap) {
        moveEvent.preventDefault();
      }
      const dx = moveEvent.clientX - currentX;
      const dy = currentY - moveEvent.clientY;
      currentX = moveEvent.clientX;
      currentY = moveEvent.clientY;
      // Ignore horizontal-dominant moves so sideways scrubbing does not nudge the value.
      if (Math.abs(dy) < Math.abs(dx)) return;
      const range = max - min;
      const mult = pointerModifierDragMultiplier(moveEvent);
      const sensitivity = BASE_DRAG_SENSITIVITY / mult;
      const valueDelta = (dy / sensitivity) * range;
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
      if (!dragMovedBeyondTap) {
        valueTapStrictDouble.recordCompletedPrimaryTap(upEvent);
      }
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

  function handleDblClick() {
    void enterEditMode();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }

  function commitEdit() {
    const parsed = parseFloat(editText);
    if (!Number.isNaN(parsed)) {
      const newValue = snapValue(parsed);
      onChange?.(newValue);
      onCommit?.(newValue);
    }
    editMode = false;
    lockedWidthPx = undefined;
  }

  function cancelEdit() {
    editMode = false;
    editText = '';
    lockedWidthPx = undefined;
  }

  function handleBlur() {
    commitEdit();
  }
</script>

<!--
  Stop click / dblclick from bubbling to the parent `.node`. The node uses click events for
  selection toggling and double-click for the patch-into shortcut. Clicks on the value belong
  to ValueInput (single-click = no-op / focus, double-click = inline edit, drag = adjust). The
  canvas wrapper's capture-phase mousedown listener already exempts `.value-input-wrapper`,
  so connection picking and patch-on-cable are unaffected.
-->
<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div
  class="value-input-wrapper {className}"
  bind:this={wrapperEl}
  style={lockedWidthPx != null ? `width: ${lockedWidthPx}px` : ''}
  onclick={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
>
  {#if editMode}
    <input
      bind:this={inputEl}
      type="text"
      class="value-input input-edit size-{size} {className}"
      bind:value={editText}
      onkeydown={handleKeydown}
      onblur={handleBlur}
      {disabled}
      aria-label="Edit value"
    />
  {:else}
    <div
      class="value-input value-display size-{size} {className}"
      role="textbox"
      tabindex={disabled ? -1 : 0}
      aria-label="Value: {displayText}. Tab or double-click to edit, drag vertically to adjust."
      aria-readonly="false"
      onfocus={handleDisplayFocus}
      onpointerdown={handlePointerDown}
      ondblclick={handleDblClick}
      onkeydown={(e) => e.key === 'Enter' && handleDblClick()}
    >
      {displayText}
    </div>
  {/if}
</div>

<style>
  .value-input-wrapper {
    display: inline-flex;
    flex: 0 0 auto;
    width: fit-content;
    min-width: var(--value-display-min-width);
    max-width: 100%;
    box-sizing: border-box;

    .value-input {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      min-width: var(--value-display-min-width);
      max-width: 100%;
      flex: 0 0 auto;
      min-height: var(--size-sm);
      padding: var(--pd-sm) var(--pd-md);
      border-radius: var(--radius-md);
      font-family: var(--font-mono);
      font-size: var(--text-md);
      font-weight: 500;
      color: var(--param-control-value-color);
      background: var(--param-control-bg);
      border: 1px solid var(--param-control-border);
      box-sizing: border-box;
      cursor: ns-resize;

      &.size-sm {
        min-height: var(--size-xs);
        padding: var(--pd-xs) var(--pd-md);
        border-radius: var(--radius-sm);
        font-size: var(--text-xs);
      }

      &:hover {
        background: var(--param-control-bg-hover);
        color: var(--param-control-value-color-hover);
      }

      &:active {
        background: var(--param-control-bg-active);
        color: var(--param-control-value-color-active);
      }

      &:disabled {
        opacity: var(--opacity-disabled);
        cursor: not-allowed;
      }

      &.value-display {
        user-select: none;

        &:focus {
          outline: none;
        }

        &:focus-visible {
          border-color: var(--param-control-border-active);
          box-shadow: 0 0 0 1px var(--param-control-border-active);
        }
      }

      &.input-edit {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        text-align: center;
        border: 1px solid var(--param-control-border);
        cursor: text;
        box-sizing: border-box;

        &:focus {
          outline: none;
          border-color: var(--param-control-border-active);
          box-shadow: 0 0 0 1px var(--param-control-border-active);
        }
      }
    }
  }
</style>
