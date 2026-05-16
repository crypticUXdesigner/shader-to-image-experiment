<script lang="ts">
  import type { Action } from 'svelte/action';
  import { fade } from 'svelte/transition';
  import { portal } from '../../../actions/portal';
  import { readCssTimeMs } from '../../../../utils/readCssTimeMs';

  let reducedMotion = $state(false);
  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    const handler = (): void => {
      reducedMotion = mq.matches;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  const fadeMs = $derived.by(() => {
    if (typeof window === 'undefined') return 150;
    if (reducedMotion) return 0;
    const fast = readCssTimeMs('--motion-effects-fast-duration');
    return Number.isFinite(fast) ? fast : 150;
  });

  interface Props {
    open?: boolean;
    /** Anchor element for positioning; if not provided, use x/y */
    anchor?: HTMLElement | null;
    /** Trigger element – don't close when clicking the trigger (e.g. the port that opened this) */
    triggerElement?: HTMLElement | null;
    /** Fixed position when anchor not used */
    x?: number;
    y?: number;
    /** Position above anchor instead of below */
    openAbove?: boolean;
    /** Horizontal alignment when using x/y: 'start' = top-left at (x,y), 'center' = center at (x,y) */
    align?: 'start' | 'center';
    /** Vertical alignment when using x/y: 'start' = top at y, 'center' = vertical center at y */
    alignY?: 'start' | 'center';
    /** When false, clicking outside does not close the popover (close via Done / Escape only). Default true. */
    closeOnClickOutside?: boolean;
    /**
     * When true, after layout the popover is shifted so its bounding box stays inside the viewport
     * with at least `viewportInset` px from each edge. Opt-in to avoid changing anchored menus unexpectedly.
     */
    clampToViewport?: boolean;
    /** Minimum distance from the popover box to the viewport edge when `clampToViewport` is true (px). */
    viewportInset?: number;
    /**
     * Optional gate for outside clicks: return false to keep the popover open (e.g. canvas Alt+click
     * that repositions the menu on mousedown before this click reaches document).
     */
    canCloseOnClickOutside?: (e: MouseEvent) => boolean;
    onClose?: () => void;
    children?: import('svelte').Snippet<[]>;
    class?: string;
  }

  let {
    open = false,
    anchor = null,
    triggerElement = null,
    x = 0,
    y = 0,
    openAbove = false,
    align = 'center',
    alignY = 'start',
    closeOnClickOutside = true,
    clampToViewport = false,
    viewportInset = 12,
    canCloseOnClickOutside,
    onClose,
    children,
    class: className = ''
  }: Props = $props();

  let popoverEl = $state<HTMLElement | null>(null);
  let openedAt = $state<number>(0);
  /** Extra offset from base `getPosition()` so the popover stays inside the viewport (when clamping). */
  let positionDelta = $state({ top: 0, left: 0 });

  /** Sets openedAt when the popover content mounts (each open is a fresh {#if open} subtree). */
  const stampOpenedAt: Action<HTMLElement, void> = () => {
    openedAt = Date.now();
    return {};
  };

  function getPosition(): { top: number; left: number } {
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const gap = 12; /* one-off: space between anchor and popover edge */
      const left =
        align === 'start' ? rect.left : rect.left + rect.width / 2;
      return {
        top: openAbove ? rect.top - gap : rect.bottom + gap,
        left
      };
    }
    return { top: y, left: x };
  }

  const basePosition = $derived(open ? getPosition() : { top: 0, left: 0 });

  const position = $derived.by(() => {
    const b = basePosition;
    return {
      top: b.top + positionDelta.top,
      left: b.left + positionDelta.left
    };
  });

  function getTransform(): string {
    const tx = align === 'center' ? '-50%' : '0';
    const tyAnchor = openAbove ? '-100%' : '0';
    if (anchor) {
      return `translate(${tx}, ${tyAnchor})`;
    }
    const ty = alignY === 'center' ? '-50%' : openAbove ? '-100%' : '0';
    if (align === 'start') {
      return openAbove ? `translate(0, ${ty})` : alignY === 'center' ? `translate(0, -50%)` : 'none';
    }
    return `translate(${tx}, ${ty})`;
  }

  const transform = $derived(open ? getTransform() : 'none');

  function handleClickOutside(e: MouseEvent) {
    if (!open || !onClose) return;
    const elapsed = Date.now() - openedAt;
    if (elapsed < 300) return;
    const target = e.target as Node;
    const isOutside =
      popoverEl &&
      !popoverEl.contains(target) &&
      !anchor?.contains(target) &&
      !triggerElement?.contains(target);
    if (
      isOutside &&
      (canCloseOnClickOutside == null || canCloseOnClickOutside(e))
    ) {
      onClose();
    }
  }

  const INPUT_LIKE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !open || !onClose) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(INPUT_LIKE_SELECTOR)) return;
    onClose();
  }

  $effect(() => {
    if (!open) return;
    if (closeOnClickOutside) {
      document.addEventListener('click', handleClickOutside, true);
    }
    document.addEventListener('keydown', handleKeydown);
    return () => {
      if (closeOnClickOutside) {
        document.removeEventListener('click', handleClickOutside, true);
      }
      document.removeEventListener('keydown', handleKeydown);
    };
  });

  $effect(() => {
    if (!open || !clampToViewport) {
      positionDelta = { top: 0, left: 0 };
      return;
    }
    // Re-clamp when anchor / x / y / alignment changes while open.
    void basePosition.top;
    void basePosition.left;
    if (!popoverEl) return;

    let cancelled = false;
    let ro: ResizeObserver | undefined;

    function clampOnce(): void {
      if (cancelled || !popoverEl) return;
      const m = viewportInset;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
      if (vw <= 0 || vh <= 0) return;

      const maxOuterHeight = Math.max(120, vh - 2 * m);
      const r0 = popoverEl.getBoundingClientRect();
      // Tall menus (add picker): shrink outer box first so position clamp can succeed.
      if (r0.height > maxOuterHeight + 0.5) {
        popoverEl.style.maxHeight = `${Math.floor(maxOuterHeight)}px`;
        popoverEl.style.overflow = 'hidden';
        popoverEl.style.boxSizing = 'border-box';
        return;
      }

      const r = popoverEl.getBoundingClientRect();
      let desiredLeft = r.left;
      let desiredTop = r.top;
      const w = r.width;
      const h = r.height;
      if (desiredLeft < m) desiredLeft = m;
      if (desiredTop < m) desiredTop = m;
      if (desiredLeft + w > vw - m) desiredLeft = vw - m - w;
      if (desiredTop + h > vh - m) desiredTop = vh - m - h;

      // Screen-space nudge; add to prior delta (do *not* replace: ResizeObserver re-fires with dt=0
      // when already fitted, which would wipe a non-zero positionDelta).
      const adjLeft = desiredLeft - r.left;
      const adjTop = desiredTop - r.top;
      if (adjLeft !== 0 || adjTop !== 0) {
        positionDelta = {
          top: positionDelta.top + adjTop,
          left: positionDelta.left + adjLeft
        };
      }
    }

    const runLayout = (): void => {
      requestAnimationFrame(() => {
        if (!cancelled) clampOnce();
      });
    };

    const id0 = requestAnimationFrame(() => {
      requestAnimationFrame(runLayout);
    });

    if (popoverEl) {
      ro = new ResizeObserver(runLayout);
      ro.observe(popoverEl);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', runLayout);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(id0);
      ro?.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', runLayout);
      }
      if (popoverEl) {
        popoverEl.style.maxHeight = '';
        popoverEl.style.overflow = '';
        popoverEl.style.boxSizing = '';
      }
      positionDelta = { top: 0, left: 0 };
    };
  });
</script>

{#if open}
  {@const pos = position}
  <div
    bind:this={popoverEl}
    class="popover-base frame {className || ''}"
    style="top: {pos.top}px; left: {pos.left}px; transform: {transform};"
    role="dialog"
    aria-modal="false"
    use:portal
    use:stampOpenedAt
    transition:fade={() => ({ duration: fadeMs })}
  >
    {@render children?.()}
  </div>
{/if}

<style>
  /* Popover styles */
  .popover-base {
    /* Layout */
    position: fixed;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    padding: var(--pd-sm);

    /* Box model / visual from layer .frame */

    /* Other */
    z-index: var(--message-z-index);
    pointer-events: auto;
  }
</style>
