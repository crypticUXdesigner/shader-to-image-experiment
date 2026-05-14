<script lang="ts">
  /**
   * Node Editor Layout
   * Split view with resizable divider, corner widget, preset dropdown, zoom, help, panel toggle.
   */
  import { onMount } from 'svelte';
  import { TopBar, KeyboardShortcutsModal } from '../top-bar';
  import { SidePanel } from '../side-panel';
  import VerticalResizeHandle from './VerticalResizeHandle.svelte';
  import PreviewContainer from './PreviewContainer.svelte';
  import ConfirmPresetImportModal from './ConfirmPresetImportModal.svelte';
  import LoadProjectDialog from './LoadProjectDialog.svelte';
  import AppToastStack from './AppToastStack.svelte';
  import { audioAnalysisStatusStore } from '../../stores/audioAnalysisStatusStore';
  import { appToastStore, getGraph } from '../../stores';
  import { globalErrorHandler } from '../../../utils/errorHandling';
  import type { ViewMode, LayoutCallbacks } from './types';
  import type { AuthenticatedClient } from '@audiotool/nexus';
  import type { ProjectAvatarFields } from '../../storage/projectAvatar';
  import type { ProjectMeta } from '../../storage/projectRepository';
  import type { HubSelection } from '../../storage/projectSessionTypes';

  interface Props {
    preview?: import('svelte').Snippet<[]>;
    nodeEditor?: import('svelte').Snippet<[{ viewMode: ViewMode }]>;
    panel?: import('svelte').Snippet<[]>;
    docsPanel?: import('svelte').Snippet<[]>;
    bottomBar?: import('svelte').Snippet<[string | null]>;
    callbacks?: LayoutCallbacks;
    presetList?: Array<{ name: string; displayName: string }>;
    selectedPreset?: string | null;
    /** Primary track key so bottom bar re-renders when track changes (waveform scrubber). */
    primaryTrackKey?: string | null;
    /** True once WebGL runtime exists (blocking project gate dismissed). */
    runtimeBootstrapped?: boolean;
    /** Full-screen picker must stay open until the user selects a hub row. */
    projectGateBlocking?: boolean;
    hubProjects?: ProjectMeta[];
    hubPresets?: Array<{ name: string; displayName: string }>;
    hubLastOpenedProjectId?: string | null;
    /** Single highlighted project row in the load picker (active session vs URL / last-opened on gate). */
    hubPickerHighlightedProjectId?: string | null;
    hubStorageWarning?: string | null;
    hubBusy?: boolean;
    onHubPick?: (selection: HubSelection) => Promise<void>;
    onHubDuplicate?: (projectId: string) => void;
    onHubDelete?: (projectId: string) => void;
    onHubRename?: (projectId: string, nextDisplayName: string) => void;
    onHubAppearanceChange?: (projectId: string, next: ProjectAvatarFields) => void;
    onHubImportJson?: (json: string) => void;
    onHubExportAllProjects?: () => void | Promise<void>;
    isPanelVisible?: boolean;
    zoom?: number;
    fps?: number;
    /** When false, top bar disables video export and shows WebCodecs message. */
    isVideoExportSupported?: boolean;
    /** User project has local edits not yet written to IndexedDB (debounced autosave may still run). */
    autosavePersistPending?: boolean;
    /** Logged-in Audiotool user (avatar + sign out) in the top bar when OAuth is enabled. */
    audiotoolAccount?: {
      userName: string;
      onLogout: () => void;
      rpcClient?: AuthenticatedClient | null;
      onAudiotoolSessionInvalidated?: () => void;
    } | null;
    /** When disconnected, OAuth is configured and splash is dismissed: sign-in control in the top bar. */
    audiotoolSignInChrome?: (() => void) | null;
    graphHistoryControls?: boolean;
    canUndoGraph?: boolean;
    canRedoGraph?: boolean;
    onGraphUndo?: () => void;
    onGraphRedo?: () => void;
    /** Fired when layout-owned modals should block canvas shortcuts (load picker, shortcuts, import confirm). */
    onLayoutBlockingOverlaysChange?: (blocked: boolean) => void;
    /** Sync preview framebuffer when shell geometry changes (view mode, panel inset). */
    onPreviewGeometryCommit?: () => void;
  }

  let {
    preview,
    nodeEditor,
    panel,
    docsPanel,
    bottomBar,
    callbacks = {},
    presetList = [],
    selectedPreset = null,
    primaryTrackKey = null,
    runtimeBootstrapped = false,
    projectGateBlocking = false,
    hubProjects = [],
    hubPresets = [],
    hubLastOpenedProjectId = null,
    hubPickerHighlightedProjectId = null,
    hubStorageWarning = null,
    hubBusy = false,
    onHubPick,
    onHubDuplicate = () => {},
    onHubDelete = () => {},
    onHubRename = () => {},
    onHubAppearanceChange = () => {},
    onHubImportJson = () => {},
    onHubExportAllProjects = () => {},
    isPanelVisible = true,
    zoom = 1.0,
    fps = 0,
    isVideoExportSupported = true,
    autosavePersistPending = false,
    audiotoolAccount = null,
    audiotoolSignInChrome = null,
    graphHistoryControls = false,
    canUndoGraph = false,
    canRedoGraph = false,
    onGraphUndo,
    onGraphRedo,
    onLayoutBlockingOverlaysChange,
    onPreviewGeometryCommit,
  }: Props = $props();

  const SAFE_DISTANCE = 16;
  const PANEL_MIN_WIDTH = 250;
  const PANEL_MAX_WIDTH = 800;

  // State
  let containerEl = $state<HTMLDivElement | undefined>(undefined);
  let buttonContainerEl = $state<HTMLDivElement | undefined>(undefined);
  /** User opened from top bar (“Load preset”); combined with parent's project gate blocking. */
  let loadPickerUserOpened = $state(false);
  const loadProjectDialogOpen = $derived(projectGateBlocking || loadPickerUserOpened);

  let viewMode = $state<ViewMode>('node');
  let activeTab = $state<'nodes' | 'docs'>('nodes');
  let dividerPosition = $state(0.5);
  let panelWidth = $state(300);
  let isUiHidden = $state(false);

  let isDraggingDivider = $state(false);
  let isResizingPanel = $state(false);
  /** True only after panel open animation (0.3s) has finished; hides instantly when panel starts closing. */
  let showPanelResizeHandle = $state(false);
  let panelOpenTimeoutId = 0;
  let panelResizeStartX = $state(0);
  let panelResizeStartWidth = $state(0);

  /** PERF: Throttle panel/divider/corner resize to one layout update per frame. */
  let resizeMoveRafId = 0;
  let latestMoveEvent = null as MouseEvent | null;

  let presetLoading = $state(false);
  let shortcutsModalOpen = $state(false);
  /** When set, show "Import preset?" confirmation modal; confirm runs import with this JSON. */
  let pendingImportJson = $state<string | null>(null);

  // Derived
  const helpEnabled = $derived.by(() => {
    const cb = callbacks.isHelpEnabled;
    if (cb) return cb();
    const g = getGraph();
    const ids = g?.viewState?.selectedNodeIds ?? [];
    const n = ids.length;
    return n === 0 || n === 1;
  });

  const fpsColor = $derived(
    fps <= 0 ? 'var(--layout-button-color)' : fps >= 55 ? 'var(--fps-color-good)' : fps >= 30 ? 'var(--fps-color-moderate)' : 'var(--fps-color-poor)'
  );

  const topBarHeight = $derived(isUiHidden ? 0 : (buttonContainerEl ? buttonContainerEl.getBoundingClientRect().height : 60));
  const bottomBarHeight = $derived(isUiHidden ? 0 : 12);
  const bottomSafeInset = $derived(isUiHidden ? 0 : Math.max(bottomBarHeight, SAFE_DISTANCE));
  const rawPanelOffset = $derived(isPanelVisible ? panelWidth : 0);
  const panelOffset = $derived(isUiHidden ? 0 : rawPanelOffset);

  function pushToast(message: string, type: 'success' | 'error' | 'info'): void {
    const variant = type === 'success' ? 'success' : type === 'info' ? 'info' : 'error';
    appToastStore.addToast({ variant, message, copyText: message });
  }

  function isUserCancelled(err: unknown): boolean {
    if (err && typeof err === 'object' && 'name' in err && (err as { name?: unknown }).name === 'AbortError') return true;
    if (err instanceof Error) {
      return err.message === 'Cancelled' || err.message === 'Export cancelled' || err.message === 'Export canceled';
    }
    return false;
  }

  // View mode
  function setViewMode(mode: ViewMode) {
    if (viewMode === mode) return;
    viewMode = mode;
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      target.closest?.('[contenteditable="true"]') != null
    );
  }

  // View mode keyboard shortcuts (1/2/3) — mount-only listener; handler reads live $state (no reactive re-subscribe).
  onMount(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (shortcutsModalOpen || pendingImportJson !== null) return;
      if (loadProjectDialogOpen) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        callbacks.onPanelToggle?.();
        return;
      }

      if (e.key === '<') {
        e.preventDefault();
        isUiHidden = !isUiHidden;
        loadPickerUserOpened = false;
        return;
      }

      if (e.key === '1') {
        e.preventDefault();
        setViewMode('node');
      } else if (e.key === '2') {
        e.preventDefault();
        setViewMode('split');
      } else if (e.key === '3') {
        e.preventDefault();
        setViewMode('full');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  /**
   * Preview canvas ResizeObserver can miss geometry updates when only the shell changes.
   * Double rAF runs after layout commits for the new view mode / panel inset.
   */
  $effect(() => {
    viewMode;
    panelOffset;
    runtimeBootstrapped;
    const cb = onPreviewGeometryCommit;
    if (!cb || !runtimeBootstrapped) return;
    let cancelled = false;
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      if (cancelled) return;
      innerRaf = requestAnimationFrame(() => {
        if (cancelled) return;
        cb();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
  });

  // Panel resize handle: show only after open animation; hide instantly on close
  $effect(() => {
    const visible = isPanelVisible;
    if (panelOpenTimeoutId) {
      window.clearTimeout(panelOpenTimeoutId);
      panelOpenTimeoutId = 0;
    }
    if (visible) {
      panelOpenTimeoutId = window.setTimeout(() => {
        panelOpenTimeoutId = 0;
        showPanelResizeHandle = true;
      }, 300);
    } else {
      showPanelResizeHandle = false;
    }
    return () => {
      if (panelOpenTimeoutId) window.clearTimeout(panelOpenTimeoutId);
    };
  });

  // Divider drag
  function onDividerMouseDown(e: MouseEvent) {
    isDraggingDivider = true;
    e.preventDefault();
  }

  function onPanelResizeMouseDown(e: MouseEvent) {
    isResizingPanel = true;
    panelResizeStartX = e.clientX;
    panelResizeStartWidth = panelWidth;
    e.preventDefault();
  }

  // Global mouse handlers (throttled to one layout update per frame for FPS during panel/split resize)
  $effect(() => {
    if (!isDraggingDivider && !isResizingPanel) return;

    function applyMove(e: MouseEvent) {
      if (isDraggingDivider && containerEl) {
        const rect = containerEl.getBoundingClientRect();
        const availableWidth = rect.width - panelOffset;
        // Split handle sits to the left of the preview (outside it); handle is at split edge - 4px, so keep it under cursor
        const RESIZE_HANDLE_OFFSET_PX = 4;
        const newPos = (e.clientX - rect.left - panelOffset + RESIZE_HANDLE_OFFSET_PX) / availableWidth;
        dividerPosition = Math.max(0.2, Math.min(0.8, newPos));
      } else if (isResizingPanel) {
        const deltaX = e.clientX - panelResizeStartX;
        panelWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, panelResizeStartWidth + deltaX));
      }
    }

    const onMove = (e: MouseEvent) => {
      latestMoveEvent = e;
      if (resizeMoveRafId) return;
      resizeMoveRafId = requestAnimationFrame(() => {
        resizeMoveRafId = 0;
        const ev = latestMoveEvent;
        if (ev) applyMove(ev);
      });
    };

    const onUp = () => {
      if (resizeMoveRafId) {
        cancelAnimationFrame(resizeMoveRafId);
        resizeMoveRafId = 0;
      }
      latestMoveEvent = null;
      isDraggingDivider = false;
      isResizingPanel = false;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      if (resizeMoveRafId) cancelAnimationFrame(resizeMoveRafId);
      resizeMoveRafId = 0;
      latestMoveEvent = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  });

  // Action handlers
  function handleDownloadPreset() {
    try {
      callbacks.onDownloadPreset?.();
      pushToast('Graph downloaded as JSON.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download graph';
      globalErrorHandler.report('runtime', 'error', 'Could not download graph.', { originalError: err instanceof Error ? err : new Error(msg) });
    }
  }

  async function handleExport() {
    try {
      await callbacks.onExport?.();
      pushToast('Image exported.', 'success');
    } catch (err) {
      if (isUserCancelled(err)) {
        pushToast('Image export canceled.', 'info');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to export image';
      globalErrorHandler.report('runtime', 'error', msg, {
        originalError: err instanceof Error ? err : new Error(msg),
      });
    }
  }

  async function handleVideoExport() {
    try {
      const status = $audioAnalysisStatusStore;
      if (status.state === 'building' || status.state === 'fallback') {
        pushToast('Still prepping live audio. Video export uses the full offline analysis.', 'info');
      }
      await callbacks.onVideoExport?.();
      pushToast('Video exported.', 'success');
    } catch (err) {
      if (isUserCancelled(err)) {
        pushToast('Video export canceled.', 'info');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to export video';
      globalErrorHandler.report('runtime', 'error', msg, { originalError: err instanceof Error ? err : new Error(msg) });
    }
  }

  async function handleModalHubPick(selection: HubSelection): Promise<void> {
    if (!onHubPick) return;
    await onHubPick(selection);
    loadPickerUserOpened = false;
  }

  async function handleImportPresetFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !callbacks.onImportPresetFromFile) return;
    const graph = getGraph();
    const json = await file.text();
    if (graph.nodes.length > 0) {
      pendingImportJson = json;
      return;
    }
    await doImportPreset(json);
  }

  async function doImportPreset(json: string) {
    if (!callbacks.onImportPresetFromFile) return;
    try {
      presetLoading = true;
      pendingImportJson = null;
      await callbacks.onImportPresetFromFile(json);
      pushToast('Preset imported.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      globalErrorHandler.report('runtime', 'error', msg, { originalError: err instanceof Error ? err : new Error(msg) });
    } finally {
      presetLoading = false;
    }
  }

  function handlePresetClick(_e: MouseEvent) {
    loadPickerUserOpened = true;
  }

  let containerWidth = $state(0);
  let containerHeight = $state(0);
  const contentWidth = $derived(containerWidth - panelOffset);

  // ResizeObserver ensures dimensions stay correct when layout changes (e.g. panel toggle, window resize)
  $effect(() => {
    const el = containerEl;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      containerWidth = rect.width;
      containerHeight = rect.height;
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    containerWidth = rect.width;
    containerHeight = rect.height;
    return () => ro.disconnect();
  });

  const topBarZoomChangeProps = $derived.by(() => {
    // Work around occasional Svelte TS stale prop inference by passing this via spread.
    return { onZoomChange: callbacks.onZoomChange } as unknown as Record<string, never>;
  });

  const presetLabel = $derived.by(() => {
    if (!runtimeBootstrapped) return 'Pick a project…';
    if (selectedPreset) {
      return presetList.find((p) => p.name === selectedPreset)?.displayName ?? selectedPreset;
    }
    const gn = getGraph()?.name?.trim();
    return gn && gn.length > 0 ? gn : 'Local project';
  });

  const zoomPercent = $derived(Math.round(zoom * 100));

  $effect(() => {
    const blocked =
      shortcutsModalOpen || pendingImportJson !== null || loadProjectDialogOpen;
    onLayoutBlockingOverlaysChange?.(blocked);
    return () => {
      onLayoutBlockingOverlaysChange?.(false);
    };
  });
</script>

<div
  bind:this={containerEl}
  class="node-editor-layout"
  class:is-resizing-layout={isDraggingDivider || isResizingPanel}
  data-view={viewMode}
  data-preview={viewMode === 'node' ? 'collapsed' : 'expanded'}
  data-ui-hidden={isUiHidden ? 'true' : 'false'}
  style="position: absolute; inset: 0; --panel-width-dynamic: {panelWidth}px; --top-bar-left-offset: {panelOffset}px;"
>
  <!-- Top bar -->
  <TopBar
    barElement={(el) => (buttonContainerEl = el)}
    presetLabel={presetLabel}
    presetLoading={presetLoading || hubBusy}
    viewMode={viewMode}
    setViewMode={setViewMode}
    zoomPercent={zoomPercent}
    fps={fps}
    fpsColor={fpsColor}
    helpEnabled={helpEnabled}
    isPanelVisible={isPanelVisible}
    panelOffset={panelOffset}
    onPanelToggle={callbacks.onPanelToggle}
    onPresetClick={handlePresetClick}
    onDownloadPreset={handleDownloadPreset}
    onExport={handleExport}
    onVideoExport={handleVideoExport}
    isVideoExportSupported={isVideoExportSupported}
    {...topBarZoomChangeProps}
    onHelpClick={callbacks.onHelpClick}
    onShortcutsClick={() => (shortcutsModalOpen = true)}
    {graphHistoryControls}
    {canUndoGraph}
    {canRedoGraph}
    {onGraphUndo}
    {onGraphRedo}
    {audiotoolAccount}
    audiotoolSignInChrome={audiotoolSignInChrome}
  />

  <KeyboardShortcutsModal open={shortcutsModalOpen} onClose={() => (shortcutsModalOpen = false)} />

  <ConfirmPresetImportModal
    open={pendingImportJson !== null}
    onClose={() => (pendingImportJson = null)}
    onConfirm={() => pendingImportJson != null && doImportPreset(pendingImportJson)}
  />

  <LoadProjectDialog
    open={loadProjectDialogOpen}
    dismissible={!projectGateBlocking}
    presetLoading={presetLoading}
    hubProjects={hubProjects}
    hubPresets={hubPresets}
    hubLastOpenedProjectId={hubLastOpenedProjectId}
    hubPickerHighlightedProjectId={hubPickerHighlightedProjectId}
    hubStorageWarning={hubStorageWarning}
    hubBusy={hubBusy}
    onClose={() => (loadPickerUserOpened = false)}
    onHubPick={(s) => void handleModalHubPick(s)}
    onHubDuplicate={onHubDuplicate}
    onHubDelete={onHubDelete}
    onHubRename={onHubRename}
    onHubAppearanceChange={onHubAppearanceChange}
    onHubImportJson={onHubImportJson}
    onHubExportAllProjects={onHubExportAllProjects}
  />

  <input
    type="file"
    accept=".json,application/json"
    style="position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none;"
    onchange={handleImportPresetFile}
    aria-label="Import preset from file"
  />

  <!-- Side panel (tabs + content slots) -->
  <SidePanel
    isPanelVisible={isPanelVisible}
    panelWidth={panelWidth}
    activeTab={activeTab}
    onTabChange={(tab) => (activeTab = tab)}
    onPanelToggle={() => callbacks.onPanelToggle?.()}
    nodesPanel={panel}
    docsPanel={docsPanel}
  />

  <!-- Resize handles (same level, above slots so they are never clipped by overflow:hidden on editor/preview) -->
  {#if showPanelResizeHandle && !isUiHidden}
    <VerticalResizeHandle
      edgeLeft={panelWidth}
      onMouseDown={onPanelResizeMouseDown}
      disableTransition={isResizingPanel}
    />
  {/if}
  {#if viewMode === 'split' && !isUiHidden}
    <VerticalResizeHandle
      edgeLeft={panelOffset + contentWidth * dividerPosition}
      onMouseDown={onDividerMouseDown}
      disableTransition={isDraggingDivider}
      side="left"
      containerWidth={containerWidth}
    />
  {/if}

  <!-- Node editor slot (z-index below panel so panel draws on top when open; panel uses --z-panel) -->
  <div
    class="node-editor-slot"
    style="
      position: absolute;
      left: {panelOffset}px;
      top: 0;
      bottom: 0;
      overflow: hidden;
      width: {viewMode === 'full' ? 0 : viewMode === 'split' ? contentWidth * dividerPosition : containerWidth - panelOffset}px;
      display: {viewMode === 'full' ? 'none' : 'block'};
      z-index: var(--z-base);
    "
  >
    {#if nodeEditor}
      {@render nodeEditor({ viewMode })}
    {/if}
  </div>

  <!-- Preview slot -->
  <PreviewContainer
    preview={preview}
    viewMode={viewMode}
    panelOffset={panelOffset}
    contentWidth={contentWidth}
    dividerPosition={dividerPosition}
    containerWidth={containerWidth}
    containerHeight={containerHeight}
    topBarHeight={topBarHeight}
    bottomSafeInset={bottomSafeInset}
    containerEl={containerEl}
    disableTransition={
      isDraggingDivider || isResizingPanel || viewMode !== 'node'
    }
  />

  <!-- Bottom bar slot -->
  {#if bottomBar}
    {@render bottomBar(primaryTrackKey)}
  {/if}
</div>

<AppToastStack
  autosavePersistPending={autosavePersistPending}
  toastAlignInsetLeft={panelOffset}
/>

<style>
  /* Panel-affected layout: animate in sync with node panel slide (`--motion-spatial-fast-*`) */
  .node-editor-layout {
    overflow: visible;

    .node-editor-slot {
      transition:
        left var(--motion-spatial-fast-duration) var(--motion-spatial-fast-easing),
        width var(--motion-spatial-fast-duration) var(--motion-spatial-fast-easing);
    }

    /* During divider or panel resize, follow cursor immediately (no transition) */
    &.is-resizing-layout .node-editor-slot {
      transition: none;
    }
  }

  /* Hide all UI chrome (top bar, side panel, bottom bar) but preserve state */
  .node-editor-layout[data-ui-hidden="true"] {
    :global(.top-bar),
    :global(.side-panel-container),
    :global(.bottom-bar-wrapper),
    :global(.vertical-resize-handle) {
      display: none !important;
    }
  }
</style>