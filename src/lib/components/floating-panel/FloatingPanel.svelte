<script lang="ts">
  /**
   * FloatingPanel – generic draggable floating panel with header (left slot + drag handle + close),
   * content slot, and optional footer slot. Uses Popover for positioning; later more specific
   * panels (e.g. audio picker shell) can live in this folder and compose this component.
   * Coordinates are the consumer's responsibility: pass x, y and onPositionChange. Use
   * getStoredPosition / setStoredPosition from this folder to persist per-panel (and per-variant) positions.
   */
  import { Popover, Button, IconSvg } from '../ui';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    /**
     * Keep the panel inside the viewport (same mechanism as `AddNodePicker` / `Popover`).
     * Default true so stored positions cannot render off-screen after resize or display change.
     */
    clampToViewport?: boolean;
    /** Passed to `Popover` when clamping (px). */
    viewportInset?: number;
    /** When the user drags the panel, call with new center (x, y). */
    onPositionChange?: (x: number, y: number) => void;
    /** Port/element that opened this – avoids closing when same click opens */
    triggerElement?: HTMLElement | null;
    /** When false, clicking outside does not close (close via button / Escape only). Default false. */
    closeOnClickOutside?: boolean;
    onClose: () => void;
    /** Accessible name for the panel (e.g. "Choose audio signal"). */
    ariaLabel?: string;
    /** Optional keyboard handler for panel-specific shortcuts (e.g. Delete). */
    onKeydown?: (e: KeyboardEvent) => void;
    /** Optional left-side content in the header (e.g. "New band" button). */
    headerLeft?: import('svelte').Snippet<[]>;
    /**
     * Full-width header row (e.g. timeline chrome). When set, replaces the default `headerLeft` column
     * so consumers can merge custom chrome with the centered drag grip.
     */
    headerInset?: import('svelte').Snippet<[]>;
    /** Main content. */
    children?: import('svelte').Snippet<[]>;
    /** Optional footer (message, button row, etc.). */
    footer?: import('svelte').Snippet<[]>;
    class?: string;
    /**
     * `full` — mousedown on the panel body starts a drag (legacy).
     * `grip-only` — only the header grip / explicit handle drags (dense editors like the timeline).
     */
    dragSurface?: 'full' | 'grip-only';
    /** When false, hide the header Close control (consumer provides its own dismiss). */
    showCloseButton?: boolean;
    /** Scroll behavior for the main content region below the header. */
    mainOverflow?: 'auto' | 'hidden';
  }

  let {
    open,
    x,
    y,
    clampToViewport = true,
    viewportInset = 16,
    onPositionChange,
    triggerElement = null,
    closeOnClickOutside = false,
    onClose,
    ariaLabel = 'Panel',
    onKeydown,
    headerLeft,
    headerInset,
    children,
    footer,
    class: className = '',
    dragSurface = 'full',
    showCloseButton = true,
    mainOverflow = 'auto',
  }: Props = $props();

  let dragStart = $state<{
    centerX: number;
    centerY: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const DRAG_IGNORE_SELECTOR =
    'button, input, select, textarea, a, [contenteditable="true"]';

  function startDrag(e: MouseEvent) {
    if (!onPositionChange) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(DRAG_IGNORE_SELECTOR)) return;
    e.preventDefault();
    dragStart = { centerX: x, centerY: y, mouseX: e.clientX, mouseY: e.clientY };
  }

  function onDocMouseMove(e: MouseEvent) {
    if (!dragStart || !onPositionChange) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.mouseX;
    const dy = e.clientY - dragStart.mouseY;
    onPositionChange(dragStart.centerX + dx, dragStart.centerY + dy);
  }

  function onDocMouseUp() {
    dragStart = null;
  }

  $effect(() => {
    if (!dragStart) return;
    document.addEventListener('mousemove', onDocMouseMove);
    document.addEventListener('mouseup', onDocMouseUp);
    return () => {
      document.removeEventListener('mousemove', onDocMouseMove);
      document.removeEventListener('mouseup', onDocMouseUp);
    };
  });
</script>

<Popover
  {open}
  x={x}
  y={y}
  {triggerElement}
  align="center"
  alignY="center"
  {clampToViewport}
  {viewportInset}
  closeOnClickOutside={closeOnClickOutside}
  onClose={onClose}
  class="floating-panel {className}"
>
  <div
    class="content"
    class:dragging={dragStart !== null}
    role="dialog"
    aria-label={ariaLabel}
    tabindex="-1"
    onkeydown={onKeydown}
    onmousedown={onPositionChange && dragSurface === 'full' ? startDrag : undefined}
  >
    <header class="header" class:has-header-inset={!!headerInset}>
      {#if headerInset}
        <div class="header-inset-full">
          {@render headerInset()}
        </div>
      {:else}
        <div class="header-left">
          {#if headerLeft}
            {@render headerLeft()}
          {/if}
        </div>
      {/if}
      {#if onPositionChange}
        <div
          class="drag-indicator"
          role="button"
          tabindex="0"
          aria-label="Drag to move panel"
          title="Drag to move panel"
          onmousedown={startDrag}
        >
          <IconSvg name="grip-horizontal" variant="line" class="drag-icon" />
        </div>
      {/if}
      {#if showCloseButton}
        <div class="header-right">
          <Button
            variant="ghost"
            size="sm"
            mode="both"
            onclick={onClose}
            aria-label="Close panel"
            class="close-btn"
          >
            Close
            <IconSvg name="x" variant="line" />
          </Button>
        </div>
      {/if}
    </header>
    <div class="main scrollbar-styled" style:overflow={mainOverflow}>
      {#if children}
        {@render children()}
      {/if}
    </div>
    {#if footer}
      <div class="footer">
        {@render footer()}
      </div>
    {/if}
  </div>
</Popover>

<style>
  /* Popover wrapper: padding reset (consumer owns inner layout) */
  :global(.floating-panel) {
    padding: 0 !important;
  }

  .content {
    /* layout */
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* visual */
    outline: none;

    &:focus {
      outline: none;
    }

    &.dragging {
      cursor: grabbing;
    }

    .header {
      position: relative;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--pd-md);
      padding: var(--pd-xs);
      min-height: var(--size-sm);

      &.has-header-inset .header-inset-full {
        flex: 1;
        min-width: 0;
        position: relative;
        display: flex;
        align-items: center;
        min-height: var(--size-sm);
      }

      :global(.close-btn) {
        border-radius: calc(var(--radius-md) - var(--pd-xs));
      }
    }

    .header-left {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
    }

    .drag-indicator {
      /* layout */
      position: absolute;
      left: 50%;
      top: 0;
      transform: translateX(-50%);
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 120px; /* one-off: drag handle width */
      /* box model */
      padding: var(--pd-2xs) var(--pd-sm);
      /* visual */
      color: var(--color-gray-90);
      background: var(--color-gray-40);
      border-radius: 0 0 var(--radius-md) var(--radius-md);
      user-select: none;

      &:hover {
        background: var(--color-gray-30);
        color: var(--ghost-print-hover);
      }

      &:active {
        background: var(--ghost-bg-active);
        color: var(--ghost-print-active);
        cursor: grabbing;
      }

      :global(.drag-icon) {
        width: var(--icon-size-sm);
        height: var(--icon-size-sm);
      }
    }

    .header-right {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }

    .main {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .footer {
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      min-height: 0;
    }
  }
</style>
