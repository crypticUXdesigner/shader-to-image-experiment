<script lang="ts">
  /**
   * TopBar - App top bar: preset/export (left), view mode (center), viewport status (right).
   * Composes TopBarPresetAndExport, TopBarViewControls, TopBarViewportStatus.
   */
  import TopBarPresetAndExport from './TopBarPresetAndExport.svelte';
  import TopBarViewControls from './TopBarViewControls.svelte';
  import TopBarViewportStatus from './TopBarViewportStatus.svelte';
  import AudiotoolAccountMenu from './AudiotoolAccountMenu.svelte';
  import AudiotoolMarkSvg from '../ui/icon/AudiotoolMarkSvg.svelte';
  import Button from '../ui/button/Button.svelte';
  import type { Action } from 'svelte/action';
  import type { ViewMode } from '../editor/types';
  import type { AuthenticatedClient } from '@audiotool/nexus';

  interface Props {
    /** Called with the top bar root element so layout can measure height. */
    barElement?: (el: HTMLDivElement) => void;
    presetLabel: string;
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
    zoomPercent: number;
    fps: number;
    fpsColor: string;
    helpEnabled: boolean;
    isPanelVisible: boolean;
    panelOffset: number;
    onPanelToggle?: () => void;
    onPresetClick?: (e: MouseEvent) => void;
    onDownloadPreset?: () => void;
    onExport?: () => void | Promise<void>;
    onVideoExport?: () => void | Promise<void>;
    /** When false, video export button is disabled and title explains WebCodecs is required. */
    isVideoExportSupported?: boolean;
    /** When true, preset button shows loading state and is disabled. */
    presetLoading?: boolean;
    onZoomChange?: (zoom: number) => void;
    onHelpClick?: () => void;
    onShortcutsClick?: () => void;
    /** When set, shows Audiotool OAuth account control (avatar / user icon + sign out). */
    audiotoolAccount?: {
      userName: string;
      onLogout: () => void;
      rpcClient?: AuthenticatedClient | null;
      onAudiotoolSessionInvalidated?: () => void;
    } | null;
    /** Audiotool configured but disconnected: chrome entry for OAuth redirect. Hidden while splash is up. */
    audiotoolSignInChrome?: (() => void) | null;
    graphHistoryControls?: boolean;
    canUndoGraph?: boolean;
    canRedoGraph?: boolean;
    onGraphUndo?: () => void;
    onGraphRedo?: () => void;
  }

  let {
    barElement,
    presetLabel,
    viewMode,
    setViewMode,
    zoomPercent,
    fps,
    fpsColor,
    helpEnabled,
    isPanelVisible,
    panelOffset = 0,
    onPanelToggle,
    onPresetClick,
    onDownloadPreset,
    onExport,
    onVideoExport,
    isVideoExportSupported = true,
    presetLoading = false,
    onZoomChange,
    onHelpClick,
    onShortcutsClick,
    audiotoolAccount = null,
    audiotoolSignInChrome = null,
    graphHistoryControls = false,
    canUndoGraph = false,
    canRedoGraph = false,
    onGraphUndo,
    onGraphRedo,
  }: Props = $props();

  const notifyBarElement: Action<
    HTMLDivElement,
    ((el: HTMLDivElement) => void) | undefined
  > = (node, callback) => {
    callback?.(node);
    return {
      update(next) {
        next?.(node);
      },
    };
  };
</script>

<div
  use:notifyBarElement={barElement}
  class="top-bar"
  style="--top-bar-left-offset: {panelOffset}px;"
>
  <div class="top-bar-left">
    <TopBarPresetAndExport
      {presetLabel}
      {isPanelVisible}
      {isVideoExportSupported}
      {presetLoading}
      {graphHistoryControls}
      {canUndoGraph}
      {canRedoGraph}
      {onGraphUndo}
      {onGraphRedo}
      {onPanelToggle}
      {onPresetClick}
      {onDownloadPreset}
      {onExport}
      {onVideoExport}
    />
  </div>
  <div class="top-bar-center">
    <TopBarViewControls {viewMode} {setViewMode} />
  </div>
  <div class="top-bar-right">
    {#if audiotoolAccount}
      <AudiotoolAccountMenu
        userName={audiotoolAccount.userName}
        onLogout={audiotoolAccount.onLogout}
        rpcClient={audiotoolAccount.rpcClient ?? null}
        onAudiotoolSessionInvalidated={audiotoolAccount.onAudiotoolSessionInvalidated}
      />
    {:else if audiotoolSignInChrome}
      <div class="top-bar-audiotool-signin">
        <Button
          variant="ghost"
          size="sm"
          mode="both"
          class="top-bar-audiotool-signin__btn"
          title="Sign in to access your Audiotool content"
          onclick={() => audiotoolSignInChrome?.()}
        >
          <AudiotoolMarkSvg />
          <span class="top-bar-audiotool-signin__label">Connect</span>
        </Button>
      </div>
    {/if}
    <TopBarViewportStatus
      {zoomPercent}
      {fps}
      {fpsColor}
      {helpEnabled}
      {onZoomChange}
      {onHelpClick}
      {onShortcutsClick}
    />
  </div>
</div>

<style>
  /* Top Bar layout – bar and left/center/right slots */
  .top-bar {
    position: absolute;
    left: var(--top-bar-left-offset, 0px);
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--pd-md);
    height: calc(var(--size-md) + var(--pd-md) * 2);
    padding: 0 var(--pd-lg);
    z-index: 100;
    pointer-events: none;
    transition: left var(--motion-spatial-fast-duration) var(--motion-spatial-fast-easing);
  }

  :global([data-view="split"]) .top-bar,
  :global([data-view="full"]) .top-bar {
    background: transparent;
  }

  .top-bar-left {
    display: flex;
    align-items: center;
    gap: var(--pd-md);
    pointer-events: auto;
  }

  .top-bar-center {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-width: 0;
    pointer-events: none;
  }

  .top-bar-right {
    display: flex;
    align-items: center;
    gap: var(--pd-md);
    pointer-events: auto;
  }

  .top-bar-audiotool-signin {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  :global(button.top-bar-audiotool-signin__btn.ghost:not(:disabled)) {
    gap: var(--pd-sm);
    max-width: min(220px, 40vw);
  }

  .top-bar-audiotool-signin__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
