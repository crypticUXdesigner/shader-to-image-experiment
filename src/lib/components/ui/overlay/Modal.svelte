<script lang="ts">
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
    onClose?: () => void;
    children?: import('svelte').Snippet<[]>;
    /** CSS class applied to the `.content.frame` element (legacy). */
    class?: string;
    /** CSS class applied to the `.content.frame` element. Prefer this over `class`. */
    contentClass?: string;
    /** When false, clicking the dimmed backdrop does not call `onClose`. */
    backdropDismisses?: boolean;
    /** When false, Escape does not call `onClose`. */
    escapeDismisses?: boolean;
  }

  let {
    open = false,
    onClose,
    children,
    class: className = '',
    contentClass = '',
    backdropDismisses = true,
    escapeDismisses = true,
  }: Props = $props();

  let contentEl = $state<HTMLElement | null>(null);
  let savedFocus: HTMLElement | null = null;

  function getFocusableElements(el: HTMLElement): HTMLElement[] {
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(el.querySelectorAll<HTMLElement>(selector)).filter(
      (node) => !node.hasAttribute('disabled') && node.offsetParent !== null
    );
  }

  $effect(() => {
    if (!open) return;
    savedFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      savedFocus?.focus();
    };
  });

  $effect(() => {
    if (open && contentEl) {
      const focusable = getFocusableElements(contentEl);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }
  });

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open && escapeDismisses && onClose) {
      onClose();
      return;
    }
    if (
      e.key !== 'Tab' ||
      !open ||
      !contentEl ||
      !contentEl.contains(document.activeElement as Node)
    ) {
      return;
    }
    const focusable = getFocusableElements(contentEl);
    if (focusable.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? focusable.indexOf(active) : -1;
    if (e.shiftKey) {
      if (idx <= 0) {
        e.preventDefault();
        focusable[focusable.length - 1].focus();
      }
    } else {
      if (idx === -1 || idx >= focusable.length - 1) {
        e.preventDefault();
        focusable[0].focus();
      }
    }
  }

  $effect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    onclick={(e) => e.target === e.currentTarget && backdropDismisses && onClose?.()}
    use:portal
    transition:fade={() => ({ duration: fadeMs })}
  >
  <div
    bind:this={contentEl}
    class="content frame {contentClass || ''} {className || ''}"
      onclick={(e) => e.stopPropagation()}
    >
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  /* Modal styles */
  .modal-backdrop {
    /* Layout */
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    /* Visual */
    background: var(--search-dialog-overlay);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);

    /* Other */
    z-index: 9998;
    pointer-events: auto;

    .content {
      /* Layout */
      position: relative;
      display: flex;
      flex-direction: column;

      /* Box model: from layer .frame; overrides for modal */
      max-width: 90vw; /* one-off */
      max-height: 90vh; /* one-off */

      /* Other */
      z-index: 9999;
      pointer-events: auto;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .modal-backdrop {
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }
</style>
