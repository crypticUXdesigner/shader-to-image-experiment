<script lang="ts">
  /**
   * Single bottom-center stack: queued app toasts, autosave pending, audio analysis.
   * Queue is fed from `appToastStore` (App + globalErrorHandler) and action handlers.
   */
  import type { Action } from 'svelte/action';
  import { Message, IconSvg, Button } from '../ui';
  import { portal } from '../../actions/portal';
  import { audioAnalysisStatusStore } from '../../stores/audioAnalysisStatusStore';
  import type { PreviewCompileStatus } from '../../stores/previewCompileStatusStore';
  import {
    PREVIEW_COMPILE_DEFAULT_LABEL,
    PREVIEW_COMPILE_KEPT_LAST_GOOD_DEFAULT,
    previewCompileStatusStore,
  } from '../../stores/previewCompileStatusStore';
  import { appToastStore, type AppToast } from '../../stores/appToastStore';

  /** Legacy writable store: subscribe in an effect so the stack actually re-renders (runes do not auto-subscribe via `$store` inside `$derived` here). */
  let toasts = $state<AppToast[]>([]);
  $effect(() => {
    const unsub = appToastStore.subscribe((value) => {
      toasts = value;
    });
    return unsub;
  });

  let previewCompile = $state<PreviewCompileStatus>({ state: 'idle' });
  $effect(() => {
    const unsub = previewCompileStatusStore.subscribe((v) => {
      previewCompile = v;
    });
    return unsub;
  });

  interface Props {
    /** User project has local edits not yet written to IndexedDB (debounced autosave may still run). */
    autosavePersistPending?: boolean;
    /**
     * Viewport px from the left where main editor content begins (right edge of the library side panel).
     * When set, the stack is only as wide as the canvas region so toasts stay centered there instead of under the panel.
     */
    toastAlignInsetLeft?: number;
  }

  let { autosavePersistPending = false, toastAlignInsetLeft = 0 }: Props = $props();

  const AUTOSAVE_PENDING_TOAST_DELAY_MS = 900;

  let autosavePersistDelayedVisible = $state(false);

  const autosavePendingDelay: Action<
    HTMLElement,
    {
      pending: boolean;
      delayMs: number;
      setDelayedVisible: (v: boolean) => void;
    }
  > = (_node, _init) => {
    let tid = 0;
    return {
      update(p) {
        window.clearTimeout(tid);
        tid = 0;
        if (!p.pending) {
          p.setDelayedVisible(false);
          return;
        }
        tid = window.setTimeout(() => {
          p.setDelayedVisible(true);
          tid = 0;
        }, p.delayMs);
      },
      destroy() {
        window.clearTimeout(tid);
      },
    };
  };

  const audioAnalysisToast = $derived.by((): {
    show: boolean;
    variant: 'info' | 'error';
    label: string;
    percent?: number;
  } => {
    const status = $audioAnalysisStatusStore;
    if (status.state === 'building') {
      const label = status.label?.trim() || 'Getting audio ready';
      const percent = Math.max(0, Math.min(100, Math.round((status.progress01 ?? 0) * 100)));
      return { show: true, variant: 'info', label, percent };
    }
    if (status.state === 'fallback') {
      const label = status.label?.trim() || 'Live preview until analysis finishes';
      return { show: true, variant: 'info', label };
    }
    if (status.state === 'failed') {
      const label = status.label?.trim() || 'Could not finish analyzing audio';
      return { show: true, variant: 'error', label };
    }
    return { show: false, variant: 'info', label: '' };
  });

  const previewCompileToast = $derived.by((): { show: boolean; label: string } => {
    if (previewCompile.state === 'updating') {
      return {
        show: true,
        label: previewCompile.label?.trim() || PREVIEW_COMPILE_DEFAULT_LABEL,
      };
    }
    return { show: false, label: '' };
  });

  const previewCompileKeptLastGoodToast = $derived.by((): { show: boolean; label: string } => {
    if (previewCompile.state === 'keptLastGood') {
      return {
        show: true,
        label: previewCompile.message?.trim() || PREVIEW_COMPILE_KEPT_LAST_GOOD_DEFAULT,
      };
    }
    return { show: false, label: '' };
  });

  const showOperationalStack = $derived(
    autosavePersistDelayedVisible ||
      audioAnalysisToast.show ||
      previewCompileToast.show ||
      previewCompileKeptLastGoodToast.show,
  );

  const errorToastCount = $derived(toasts.filter((t) => t.variant === 'error').length);
  const showClearAll = $derived(errorToastCount > 3);

  function messageVariant(t: AppToast): 'success' | 'error' | 'info' | 'warning' {
    return t.variant;
  }

  async function copyDetails(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }
</script>

{#if toasts.length > 0 || showOperationalStack}
  <div
    use:portal
    use:autosavePendingDelay={{
      pending: autosavePersistPending,
      delayMs: AUTOSAVE_PENDING_TOAST_DELAY_MS,
      setDelayedVisible: (v) => {
        autosavePersistDelayedVisible = v;
      },
    }}
    class="toast-stack"
    style:left={`${toastAlignInsetLeft}px`}
    role="status"
    aria-live="polite"
  >
    {#if showClearAll}
      <div class="toast-toolbar">
        <Button variant="ghost" size="sm" onclick={() => appToastStore.clearAll()}>Clear all</Button>
      </div>
    {/if}
    {#each toasts as t (t.id)}
      <div class="toast-queued">
        <Message
          stacked
          visible={true}
          variant={messageVariant(t)}
          onclose={() => {
            (t.onDismiss ?? t.onAction)?.();
            appToastStore.dismiss(t.id);
          }}
        >
          <span class="toast-line">
            <span
              class="toast-msg"
              aria-label={(t.repeatCount ?? 1) > 1
                ? `Repeated ${t.repeatCount} times. ${t.message}`
                : t.message}
            >
              {#if (t.repeatCount ?? 1) > 1}<span class="toast-repeat-prefix" aria-hidden="true">({t.repeatCount}x) </span>{/if}{t.message}
            </span>
            {#if t.dismissKeycaps?.length || t.actionLabel || t.variant === 'error' || t.variant === 'warning'}
              <span class="toast-line__right">
                {#if t.dismissKeycaps?.length}
                  <span class="toast-dismiss-keycaps" aria-hidden="true">
                    {#each t.dismissKeycaps as k}
                      <kbd class="toast-kbd" title={k.title}>{k.text}</kbd>
                    {/each}
                  </span>
                {/if}
                {#if t.actionLabel}
                  <Button
                    variant="ghost"
                    size="sm"
                    class="toast-action"
                    onclick={() => {
                      t.onAction?.();
                      appToastStore.dismiss(t.id);
                    }}
                  >
                    {t.actionLabel}
                  </Button>
                {/if}
                {#if t.variant === 'error' || t.variant === 'warning'}
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon-only"
                    class="toast-copy"
                    title="Copy details"
                    aria-label="Copy details to clipboard"
                    onclick={() => void copyDetails(t.copyText)}
                  >
                    <IconSvg name="copy" variant="line" />
                  </Button>
                {/if}
              </span>
            {/if}
          </span>
        </Message>
      </div>
    {/each}
    {#if autosavePersistDelayedVisible}
      <Message stacked visible={true} variant="info" hideIcon={true}>
        <span class="autosave-persist-pending-inner">
          <span class="autosave-spinner" aria-hidden="true">
            <IconSvg name="circle-notch" variant="line" class="autosave-spinner__icon" />
          </span>
          <span>Saving your project...</span>
        </span>
      </Message>
    {/if}
    {#if audioAnalysisToast.show}
      <Message stacked visible={true} variant={audioAnalysisToast.variant}>
        <span>
          <span>{audioAnalysisToast.label}</span>
          {#if audioAnalysisToast.percent !== undefined}
            <span aria-hidden="true"> {audioAnalysisToast.percent}%</span>
          {/if}
        </span>
      </Message>
    {/if}
    {#if previewCompileToast.show}
      <Message stacked visible={true} variant="info" hideIcon={true}>
        <span class="preview-compile-inner">
          <span class="preview-compile-spinner" aria-hidden="true">
            <IconSvg name="circle-notch" variant="line" class="preview-compile-spinner__icon" />
          </span>
          <span>{previewCompileToast.label}</span>
        </span>
      </Message>
    {/if}
    {#if previewCompileKeptLastGoodToast.show}
      <Message stacked visible={true} variant="info" hideIcon={true}>
        <span class="preview-compile-kept-inner">{previewCompileKeptLastGoodToast.label}</span>
      </Message>
    {/if}
  </div>
{/if}

<style>
  .toast-stack {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 10000;
    pointer-events: none;
    box-sizing: border-box;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    justify-content: flex-start;
    gap: var(--pd-sm);
    padding-bottom: calc(var(--bottom-bar-height) + var(--pd-md));
  }

  .toast-toolbar {
    pointer-events: auto;
    display: flex;
    justify-content: center;
    width: fit-content;
    max-width: min(var(--message-max-width), 100%);
  }

  .toast-queued {
    pointer-events: auto;
    width: fit-content;
    max-width: min(var(--message-max-width), 100%);
  }

  .toast-line {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
    column-gap: var(--pd-xl);
    row-gap: var(--pd-sm);
    min-width: 0;
  }

  .toast-line__right {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    gap: var(--pd-sm);
    min-width: 0;
  }

  .toast-msg {
    flex: 0 1 auto;
    min-width: 0;
    text-align: left;
    overflow-wrap: break-word;
  }

  .toast-dismiss-keycaps {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    gap: 6px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-2xs);
    line-height: 1.2;
    letter-spacing: 0.02em;
  }

  .toast-kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-height: 1.35rem;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-gray-70);
    background: var(--color-gray-40);
    color: var(--print-muted);
    font-size: inherit;
    font-weight: 500;
    white-space: nowrap;
  }

  :global(.toast-copy) {
    flex-shrink: 0;
    pointer-events: auto;
  }

  :global(.toast-copy svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }

  .autosave-persist-pending-inner {
    display: flex;
    align-items: center;
    gap: var(--pd-md);
  }

  .autosave-spinner {
    display: flex;
    flex-shrink: 0;
    animation: autosave-spinner-rotate 0.85s linear infinite;
    color: var(--layout-message-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .autosave-spinner {
      animation: none;
    }
  }

  @keyframes autosave-spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.autosave-spinner__icon) {
    flex-shrink: 0;
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }

  .preview-compile-inner {
    display: flex;
    align-items: center;
    gap: var(--pd-md);
  }

  .preview-compile-kept-inner {
    display: block;
    max-width: min(var(--message-max-width), 100%);
    text-align: center;
    line-height: 1.35;
  }

  .preview-compile-spinner {
    display: flex;
    flex-shrink: 0;
    animation: preview-compile-spinner-rotate 0.85s linear infinite;
    color: var(--layout-message-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .preview-compile-spinner {
      animation: none;
    }
  }

  @keyframes preview-compile-spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.preview-compile-spinner__icon) {
    flex-shrink: 0;
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }
</style>
