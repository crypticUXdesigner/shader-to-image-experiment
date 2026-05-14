<script lang="ts">
  /**
   * App.svelte
   * Root component: runtime, compiler, graph store, layout, bottom bar, node panel,
   * timeline, curve editor, canvas wrapper, error display, overlays.
   */
  import { onMount, tick, untrack } from 'svelte';
  import { loadPhosphorIconData } from '../utils/phosphor-icons-loader';
  import { NodeShaderCompiler } from '../shaders/NodeShaderCompiler';
  import { createRuntimeManager } from '../runtime/factories';
  import { RuntimeMessageDispatcher } from '../runtime/RuntimeMessageDispatcher';
  import type { WaveformService } from '../runtime';
  import { WebGLContextError } from '../runtime/errors';
  import type { GraphViewState, NodeGraph } from '../data-model/types';
  import { nodeSystemSpecs } from '../shaders/nodes/index';
  import { listPresets, loadPresetFromJson, downloadGraphAsJsonFile } from '../utils/presetManager';
  import { toValidationSpecs } from '../utils/nodeSpecUtils';
  import {
    createGetPrimaryAudioBuffer,
    runEditorImageExportSession,
    runEditorVideoExportSession,
  } from './app/appExportSession';
  import { isSupported as isVideoExportSupported } from '../video-export';
  import { globalErrorHandler, ErrorUtils } from '../utils/errorHandling';
  import { safeDestroy } from '../utils/Disposable';
  import {
    updateNodeParameter,
    updateAudioFile,
    addAudioFile,
    generateUUID,
    setAutomationDuration,
    setPlaylistCurrentIndex,
    setPlaylistOrder,
    setPrimarySource,
    getPrimaryFileId,
    setLoopCurrentTrack,
    retargetBandsToPrimary,
  } from '../data-model';
  import {
    getTracksData,
    getPlaylistOrder,
    resolvePlaylistTrackMp3Url,
    playlistPrimaryFromBundledCatalog,
  } from '../runtime/tracksData';
  import {
    fetchAudiotoolTrackViaGetTrack,
    withAudiotoolUserSession,
    type AudiotoolGetTrackParsed,
  } from '../utils/audiotoolSessionRpc';
  import { registerAudiotoolPlaylistTrackPlaybackUrl } from '../utils/audiotoolPlaylistPlaybackUrls';
  import { setAudiotoolTrackDisplayNameCache } from '../utils/audiotoolTrackTitleCache';
  import type { AudioSetup, PlaylistPrimarySource, PlaylistTrackPickMeta } from '../data-model';
  import type { NodeSpec } from '../types';
  import { UndoRedoManager } from '../ui/editor';
  import { appToastStore, errorAnnouncer, formatErrorForAnnouncer } from './stores';
  import type { PreviewCompileUiSink } from '../runtime/previewCompileUiSink';
  import {
    beginPreviewCompileProgressToast,
    clearPreviewCompileProgressToast,
    previewCompileFailedKeptLastGood,
  } from './stores/previewCompileStatusStore';
  import { ErrorAnnouncer, AppSplashScreen } from './components/ui';
  import { getHelpContent } from '../utils/ContextualHelpManager';
  import type { HelpContent } from '../utils/ContextualHelpManager';

  import { createEditorPreviewRuntimeManager, createEditorWaveformService } from './app/editorRuntimeBootstrap';
  import { attachGraphRevisionListeners } from './app/graphRevisionListeners';
  import NodeEditorLayout from './components/editor/NodeEditorLayout.svelte';
  import BottomBar from './components/bottom-bar/BottomBar.svelte';
  import { NodePanelContent, DocsPanelContent } from './components/side-panel';
  import TimelinePanel from './components/timeline/TimelinePanel.svelte';
  import TimelineCurveEditor from './components/timeline/TimelineCurveEditor.svelte';
  import TimelinePanelFloatingShell from './components/timeline/TimelinePanelFloatingShell.svelte';
  import NodeEditorCanvasWrapper from './components/editor/NodeEditorCanvasWrapper.svelte';
  import EditorParameterValueOverlay from './components/editor/EditorParameterValueOverlay.svelte';
  import EditorLabelEditOverlay from './components/editor/EditorLabelEditOverlay.svelte';
  import { HelpCallout, NodeRightClickMenu, ColorPickerPopover, AudioSignalPicker } from './components';
  import {
    getStoredPosition,
    setStoredPosition,
    clampPanelCenterToViewport,
    AUDIO_SIGNAL_PICKER_LARGE_CLAMP_BOX,
    AUDIO_SIGNAL_PICKER_COMPACT_CLAMP_BOX,
    TIMELINE_PANEL_FLOATING_CLAMP_BOX,
  } from './components/floating-panel';
  import { Button, DropdownMenu, ModalDialog } from './components/ui';
  import type { DropdownMenuItem } from './components/ui';
  import type { NodeEditorCanvasWrapperAPI } from './components/editor/NodeEditorCanvasWrapper.types';
  import type { CanvasOverlayBridge, SignalSelectPayload } from './CanvasOverlayBridge';

  import { graphStore } from './stores';
  import { isAppSplashEnabled } from '../utils/appSplash';
  import {
    createUserProjectFromValidatedJson,
    resolveHubSelectionToGraph,
    type HubResolveResult,
  } from './appHubResolve';
  import {
    deleteProjectAtomic,
    duplicateProjectAtomic,
    getProjectPayload,
    listProjectMeta,
    readAppMeta,
    saveProjectPayloadAtomic,
    updateProjectAppearanceAtomic,
    type ProjectMeta,
  } from './storage/projectRepository';
  import type { ProjectAvatarFields } from './storage/projectAvatar';
  import type { ActiveSession, HubSelection } from './storage/projectSessionTypes';
  import { serializeGraph } from '../data-model/serialization';
  import {
    audiotoolSplashAudiotoolPhase,
    createInitialAudiotoolConnection,
    reduceAudiotoolConnection,
    type AudiotoolConnectionEvent,
  } from '../utils/audiotoolConnectionModel';
  import { resolveAudiotoolSignInChromeAction } from '../utils/audiotoolChromeSignIn';
  import { isAudiotoolOAuthConfigured, initAudiotoolBrowserAuth } from '../utils/audiotoolBrowserAuth';
  import { setAudiotoolPlaylistLoadSessionAvailable } from '../utils/audiotoolPlaylistLoadHint';
  import { importProjectTextAsNewLocalProjects } from './storage/projectImport';
  import { buildProjectsBundle, downloadProjectsBundleAsJsonFile } from './storage/projectBundle';

  const splashFeatureEnabled = isAppSplashEnabled();
  const useAudiotoolGate = isAudiotoolOAuthConfigured();
  const initialSplashVisible = splashFeatureEnabled || useAudiotoolGate;

  let splashOverlayVisible = $state(initialSplashVisible);
  /** Initial load finished; intro splash may still be visible until the user dismisses it. */
  let splashReadyForDismiss = $state(false);
  /** Reduced Audiotool OAuth chrome + splash (see `reduceAudiotoolConnection`). */
  let atConn = $state(createInitialAudiotoolConnection(useAudiotoolGate));
  /** In-app modal: pick local project / preset before bootstrap or after Projects home */
  let projectGateBlocking = $state(false);
  let hubBusy = $state(false);
  let hubProjects = $state<ProjectMeta[]>([]);
  let hubStorageWarning = $state<string | null>(null);
  /** `?project=` deep link — highlight in hub only */
  let deepLinkProjectId = $state<string | null>(null);
  /** True after consuming an invalid/dead deep link attempt (prevents repeats). Valid links clear id on success instead. */
  let urlDeepLinkAttemptedInvalid = $state(false);
  let urlHighlightProjectId = $state<string | null>(null);
  let hubLastOpenedProjectId = $state<string | null>(null);
  let activeSession = $state<ActiveSession>({ kind: 'none' });

  let localRevision = $state(0);
  let persistedRevision = $state(0);
  let hydrating = $state(false);
  /** `onMount` assigns — runs first WebGL bootstrap from hub pick (or repeat after return to hub). */
  let runEditorBootstrapFromHubRef: ((sel: HubSelection) => Promise<void>) | null = null;
  /** Clears graph/audio revision listeners; set when editor session mounts. */
  let disposeGraphRevisionListeners: (() => void) | null = null;
  let lastAppMetaWarningKey = $state<string | null>(null);
  let autosaveDebounceHandle = 0;
  let autosaveClampHandle = 0;
  /** Last wall-clock flush of `persistedRevision` to IndexedDB (clamp + idle semantics). */
  let lastSuccessfulPersistAt = $state(0);
  /** Invalidates in-flight Audiotool GetTrack hydrations when primary track or session changes. */
  let audiotoolTrackHydrateGeneration = 0;

  /** §5.7 — IndexedDB refused save before leaving Projects / hub */
  let leaveSaveBlockedOpen = $state(false);

  const isUserProjectDirty = $derived(
    activeSession.kind === 'userProject' &&
      localRevision !== persistedRevision &&
      !hydrating
  );

  function dispatchAt(event: AudiotoolConnectionEvent): void {
    atConn = reduceAudiotoolConnection(atConn, event);
  }

  /** Lets runtime suppress spurious CDN load errors while GetTrack fills the playback URL registry. */
  $effect(() => {
    setAudiotoolPlaylistLoadSessionAvailable(atConn.session != null);
    return () => setAudiotoolPlaylistLoadSessionAvailable(false);
  });

  async function reconnectAudiotoolLoginAfterDisconnect(): Promise<void> {
    if (!useAudiotoolGate) return;
    try {
      const auth = await initAudiotoolBrowserAuth();
      if (auth.status === 'unauthenticated') {
        const login = (): void => {
          auth.login();
        };
        dispatchAt({ type: 'DISCONNECTED_LOGIN_RESTORED', login });
      }
    } catch {
      // Top bar sign-in may stay unavailable until reload; editor continues to work.
    }
  }

  const nodeSpecs: NodeSpec[] = nodeSystemSpecs;
  let hasInitialFit = false;

  async function toggleFullscreen(): Promise<void> {
    if (!document.fullscreenEnabled) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore: browser may block fullscreen depending on context/policy.
    }
  }

  // Clear canvas↔runtime wiring when `canvasApi` / `runtimeManager` change or the shell tears down
  // (hub session reset, project bootstrap, HMR) so spacebar handlers and audioManager refs do not stack.
  $effect(() => {
    const api = canvasApi;
    const rm = runtimeManager;
    if (!api || !rm) return;
    let fitTimer = 0;
    api.setSpacebarStateChangeCallback((isPressed) => {
      graphStore.setSpacebarPressed(isPressed);
      bottomBarRef?.setSpacebarPressed(isPressed);
    });
    api.setAudioManager(rm.getAudioManager());
    if (!hasInitialFit && graphStore.graph.nodes.length > 0) {
      hasInitialFit = true;
      fitTimer = window.setTimeout(() => api.fitToView(), 150);
    }
    return () => {
      if (fitTimer !== 0) clearTimeout(fitTimer);
      api.setSpacebarStateChangeCallback(undefined);
      api.setAudioManager(undefined);
    };
  });

  $effect(() => {
    const rm = runtimeManager;
    if (!rm) return;
    runtimeDispatcher?.setAudioSetup(graphStore.audioSetup);
  });

  // Dispose prior WaveformService when runtime is recreated or cleared so audiograph / decode
  // state does not leak across sessions (same rationale as canvas effect above).
  $effect(() => {
    const rm = runtimeManager;
    if (!rm) {
      waveformService = null;
      return;
    }
    const svc = createEditorWaveformService(rm, () => graphStore.audioSetup);
    waveformService = svc;
    return () => {
      svc.dispose();
    };
  });

  $effect(() => {
    const rm = runtimeManager;
    if (!rm) return;
    rm.setOnPlaylistAdvance((nextState) => {
      void (async () => {
        const data = await getTracksData();
        const live = graphStore.audioSetup;
        const order = live?.playlistState?.order ?? [];
        const trackId = order[nextState.currentIndex];
        if (trackId == null) return;
        const prevPrimaryId = getPrimaryFileId(live);
        let setup = live;
        setup = setPlaylistCurrentIndex(setup, nextState.currentIndex);
        setup = setPrimarySource(setup, playlistPrimaryFromBundledCatalog(trackId, data));
        const newPrimaryId = getPrimaryFileId(setup);
        setup = retargetBandsToPrimary(setup, prevPrimaryId, newPrimaryId);
        graphStore.setAudioSetup(setup);
        runtimeDispatcher?.setAudioSetup(setup, { autoPlayWhenReady: true });
        runtimeDispatcher?.playPrimary();
      })();
    });
    return () => rm.setOnPlaylistAdvance(undefined);
  });

  /** `tracks/*` playlist id only — excludes display-metadata updates so hydration does not loop on graph saves. */
  const audiotoolPlaylistHydrateTrackId = $derived.by(() => {
    const primary = graphStore.audioSetup.primarySource;
    if (primary?.type !== 'playlist') return null;
    const tid = primary.trackId.trim();
    return tid.startsWith('tracks/') ? tid : null;
  });

  /** Background hydrate: Audiotool GetTrack refreshes playback URL registry + persisted display title outside bundled catalog. */
  $effect(() => {
    const session = atConn.session;
    const trackId = audiotoolPlaylistHydrateTrackId;
    if (!trackId || !session) return;

    const gen = ++audiotoolTrackHydrateGeneration;

    void (async () => {
      const data = await getTracksData();
      if (gen !== audiotoolTrackHydrateGeneration) return;
      const bundledEntry = data[trackId];
      const bundledTitle =
        bundledEntry?.displayName?.trim() ?? (typeof bundledEntry?.name === 'string' ? bundledEntry.name.trim() : '');
      if (bundledTitle.length > 0) return;

      const res = await withAudiotoolUserSession(session, (client) => fetchAudiotoolTrackViaGetTrack(client, trackId));
      if (gen !== audiotoolTrackHydrateGeneration) return;
      if (!res.ok || !res.value) return;

      const { playbackUrl, displayName: apiName } = res.value;
      if (playbackUrl) registerAudiotoolPlaylistTrackPlaybackUrl(trackId, playbackUrl);
      const dn = apiName?.trim();
      if (dn?.length) setAudiotoolTrackDisplayNameCache(trackId, dn);

      untrack(() => {
        const cur = graphStore.audioSetup.primarySource;
        if (cur?.type !== 'playlist' || cur.trackId.trim() !== trackId) return;

        let setup = graphStore.audioSetup;
        let graphChanged = false;

        if (dn?.length && cur.displayName !== dn) {
          const merged: PlaylistPrimarySource = {
            ...cur,
            trackId,
            displayName: dn,
            displayNameSource: 'audiotool',
            displayNameUpdatedAt: new Date().toISOString(),
          };
          setup = setPrimarySource(setup, merged);
          graphChanged = true;
        }

        if (graphChanged) graphStore.setAudioSetup(setup);
        if (playbackUrl !== undefined || (dn?.length ?? 0) > 0)
          runtimeDispatcher?.setAudioSetup(graphChanged ? setup : graphStore.audioSetup);
      });
    })();
  });

  const nodeSpecsMap = new Map<string, NodeSpec>(nodeSpecs.map((s) => [s.id, s]));

  const previewCompileUiSink: PreviewCompileUiSink = {
    beginPreviewCompileProgressToast,
    clearPreviewCompileProgressToast,
    previewCompileFailedKeptLastGood,
  };

  let previewMount: HTMLDivElement;
  let compiler = $state<NodeShaderCompiler | null>(null);
  let runtimeManager = $state<Awaited<ReturnType<typeof createRuntimeManager>> | null>(null);
  let runtimeDispatcher = $state<RuntimeMessageDispatcher | null>(null);
  let waveformService = $state<WaveformService | null>(null);
  let undoRedoManager = $state<UndoRedoManager | null>(null);
  let undoStackRevision = $state(0);
  const canUndoGraph = $derived.by(() => {
    void undoStackRevision;
    return undoRedoManager?.canUndo() ?? false;
  });
  const canRedoGraph = $derived.by(() => {
    void undoStackRevision;
    return undoRedoManager?.canRedo() ?? false;
  });
  let canvasApi = $state<NodeEditorCanvasWrapperAPI | null>(null);

  /** Merge current pan/zoom/selection into a semantic snapshot so undo/redo never rewires the camera or selection. */
  function graphWithLiveViewStateRestored(semantic: NodeGraph): NodeGraph {
    const live = canvasApi?.getViewState?.();
    const storeVs = graphStore.graph.viewState;
    const vs: GraphViewState = live
      ? {
          zoom: live.zoom,
          panX: live.panX,
          panY: live.panY,
          selectedNodeIds: [...live.selectedNodeIds],
        }
      : {
          zoom: storeVs?.zoom ?? 1,
          panX: storeVs?.panX ?? 0,
          panY: storeVs?.panY ?? 0,
          selectedNodeIds: [...(storeVs?.selectedNodeIds ?? [])],
        };
    return { ...semantic, viewState: vs };
  }

  async function applyGraphHistorySnapshot(g: NodeGraph): Promise<void> {
    const merged = graphWithLiveViewStateRestored(g);
    canvasApi?.beginGraphHistoryRestore();
    try {
      graphStore.clearPatchPicks();
      graphStore.setGraph(merged, { skipGraphChangedListener: true });
      localRevision++;
      await runtimeDispatcher?.loadGraph(merged);
    } finally {
      undoStackRevision++;
      canvasApi?.completeGraphHistoryRestore(graphStore.graph);
    }
  }

  async function performGraphUndo(): Promise<void> {
    if (!runtimeDispatcher || !undoRedoManager) return;
    const g = undoRedoManager.undo();
    if (!g) return;
    await applyGraphHistorySnapshot(g);
  }

  async function performGraphRedo(): Promise<void> {
    if (!runtimeDispatcher || !undoRedoManager) return;
    const g = undoRedoManager.redo();
    if (!g) return;
    await applyGraphHistorySnapshot(g);
  }

  /** API exposed by BottomBar via bind:this (exported functions). */
  interface BottomBarRef {
    setSpacebarPressed: (isPressed: boolean) => void;
    setTimelinePanelOpen: (open: boolean) => void;
    isTimelinePanelVisible: () => boolean;
    getElement: () => HTMLElement | null;
  }
  let bottomBarRef: BottomBarRef | undefined;

  /** Ref to the nodes tab content (toggle, focusSearch, etc.). */
  let nodePanelRef: { toggle?: () => void; focusSearch?: () => void } | undefined;

  /** API exposed by NodeRightClickMenu via bind:this. */
  interface NodeRightClickMenuRef {
    show: (x: number, y: number, nodeId: string, nodeType: string) => void;
  }
  let nodeRightClickMenuRef: NodeRightClickMenuRef | undefined;

  let curveEditorLaneId = $state<string | null>(null);
  let curveEditorRegionId = $state<string | null>(null);
  let curveEditorParamLabel = $state<string>('');
  /** Live region bounds while dragging/resizing on the timeline (curve editor waveform). */
  let curveEditorRegionTimePreview = $state<{ startTime: number; endTime: number } | null>(null);
  let timelinePanelOpen = $state(false);
  let timelinePanelX = $state(0);
  let timelinePanelY = $state(0);
  let presets = $state<Array<{ name: string; displayName: string }>>([]);
  let selectedPreset = $state<string | null>(null);
  let isPanelVisible = $state(true);
  let zoom = $state(1.0);
  let fps = $state(0);
  let isVisible = $state(true);
  let animationFrameId = $state<number | null>(null);
  let intersectionObserver: IntersectionObserver | null = null;

  /** Discriminator: overview (no selection / top-bar Help) vs node guide (`openHelpForNodeType`). Passed to HelpCallout for shell/header. */
  let helpMode = $state<'overview' | 'node'>('node');

  let helpVisible = $state(false);
  let helpScreenX = $state(0);
  let helpScreenY = $state(0);
  let helpPositionMode = $state<'anchor' | 'center'>('center');
  let helpContent = $state<HelpContent | null>(null);
  /** Node type id when help is for a node (e.g. "noise"); used to look up spec for port labels. */
  let helpNodeType = $state<string | undefined>(undefined);

  /** Placeholder shown until `HelpOverviewContent`; not loaded via `getHelpContent`. */
  const HELP_OVERVIEW_PLACEHOLDER: HelpContent = {
    title: 'ShaderNoice',
    titleType: 'category',
    tagline: 'Overview',
    description: 'Detailed overview sections are coming soon. With no node selected, Help opens here; select a node for its guide.',
  };

  /** Primary track key for waveform scrubber; derived in App so layout re-renders on track change. */
  const primaryTrackKey = $derived(getPrimaryFileId(graphStore.audioSetup));

  /** One highlighted project row in Load project: active local project while editing; on gate, URL target then last-opened. */
  const hubPickerHighlightedProjectId = $derived.by((): string | null => {
    if (runtimeManager !== null) {
      if (activeSession.kind === 'userProject') return activeSession.projectId;
      return null;
    }
    return urlHighlightProjectId ?? hubLastOpenedProjectId ?? null;
  });

  /* Canvas overlay state (for color picker, enum dropdown) */
  let canvasColorPickerVisible = $state(false);
  let canvasColorPickerX = $state(0);
  let canvasColorPickerY = $state(0);
  let canvasColorPickerValue = $state({ l: 0.5, c: 0.2, h: 0 });
  let canvasColorPickerOnApply = $state<((l: number, c: number, h: number) => void) | null>(null);
  /** API exposed by DropdownMenu via bind:this. */
  interface CanvasEnumDropdownRef {
    show: (x: number, y: number, items: DropdownMenuItem[], options?: { openAbove?: boolean; align?: 'start' | 'center'; alignY?: 'start' | 'center'; anchorToSelected?: boolean }) => void;
    hide: () => void;
    isVisible: () => boolean;
  }
  let canvasEnumDropdownRef = $state<CanvasEnumDropdownRef | null>(null);

  let parameterValueOverlayVisible = $state(false);
  let parameterValueOverlayX = $state(0);
  let parameterValueOverlayY = $state(0);
  let parameterValueOverlayWidth = $state(140);
  let parameterValueOverlayHeight = $state(40);
  let parameterValueOverlayValue = $state(0);
  let parameterValueOverlayParamType = $state<'int' | 'float'>('float');
  let parameterValueOverlayOnCommit = $state<((value: number) => void) | null>(null);
  let parameterValueOverlayOnCancel = $state<(() => void) | null>(null);

  let labelEditOverlayVisible = $state(false);
  let labelEditOverlayX = $state(0);
  let labelEditOverlayY = $state(0);
  let labelEditOverlayMinWidth = $state(120);
  let labelEditOverlayLabel = $state<string | undefined>(undefined);
  let labelEditOverlayOnCommit = $state<((label: string | undefined) => void) | null>(null);
  let labelEditOverlayOnCancel = $state<(() => void) | null>(null);

  let signalPickerVisible = $state(false);
  let signalPickerXLarge = $state(0);
  let signalPickerYLarge = $state(0);
  let signalPickerXCompact = $state(0);
  let signalPickerYCompact = $state(0);
  let signalPickerTargetNodeId = $state('');
  let signalPickerTargetParameter = $state('');
  let signalPickerOnSelect = $state<((payload: SignalSelectPayload) => void) | null>(null);
  let signalPickerTriggerElement = $state<HTMLElement | null>(null);
  /** True when the picker was opened from a global entry point (audio button) without a parameter target. */
  let signalPickerBrowseMode = $state(false);

  /** Load picker, shortcuts modal, preset import confirm (see NodeEditorLayout). */
  let layoutBlockingCanvasShortcuts = $state(false);

  const overlayBridge: CanvasOverlayBridge = {
    showParameterValueInput(screenX, screenY, value, size, paramType, onCommit, onCancel) {
      parameterValueOverlayX = screenX;
      parameterValueOverlayY = screenY;
      parameterValueOverlayWidth = Math.max(size.width, 140);
      parameterValueOverlayHeight = size.height;
      parameterValueOverlayValue = value;
      parameterValueOverlayParamType = paramType;
      parameterValueOverlayOnCommit = onCommit;
      parameterValueOverlayOnCancel = onCancel;
      parameterValueOverlayVisible = true;
    },
    hideParameterValueInput() {
      parameterValueOverlayVisible = false;
      parameterValueOverlayOnCommit = null;
      parameterValueOverlayOnCancel = null;
    },
    isParameterValueInputActive() {
      return parameterValueOverlayVisible;
    },
    showLabelEditInput(screenX, screenY, label, size, onCommit, onCancel) {
      labelEditOverlayX = screenX;
      labelEditOverlayY = screenY;
      labelEditOverlayMinWidth = Math.max(size.width, 120);
      labelEditOverlayLabel = label;
      labelEditOverlayOnCommit = onCommit;
      labelEditOverlayOnCancel = onCancel;
      labelEditOverlayVisible = true;
    },
    hideLabelEditInput() {
      labelEditOverlayVisible = false;
      labelEditOverlayOnCommit = null;
      labelEditOverlayOnCancel = null;
    },
    isLabelEditInputActive() {
      return labelEditOverlayVisible;
    },
    showColorPicker(_nodeId, initial, screenX, screenY, onApply) {
      canvasColorPickerValue = initial;
      canvasColorPickerX = screenX;
      canvasColorPickerY = screenY;
      canvasColorPickerOnApply = onApply;
      canvasColorPickerVisible = true;
    },
    hideColorPicker() {
      canvasColorPickerVisible = false;
      canvasColorPickerOnApply = null;
    },
    isColorPickerVisible() {
      return canvasColorPickerVisible;
    },
    showEnumDropdown(screenX, screenY, items, _onSelect, options) {
      canvasEnumDropdownRef?.show(screenX, screenY, items, options);
    },
    hideEnumDropdown() {
      canvasEnumDropdownRef?.hide();
    },
    isEnumDropdownVisible() {
      return canvasEnumDropdownRef?.isVisible?.() ?? false;
    },
    showSignalPicker(_screenX, _screenY, targetNodeId, targetParameter, onSelect, triggerElement) {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const inset = 16;
      const rawLarge = getStoredPosition('audio-signal-picker', {
        variant: 'large',
        fallback: center,
        legacyKey: [
          'shader-composer.audioSignalPickerPositionLarge',
          'shader-composer.audioSignalPickerPosition',
        ],
      });
      const rawCompact = getStoredPosition('audio-signal-picker', {
        variant: 'compact',
        fallback: center,
        legacyKey: [
          'shader-composer.audioSignalPickerPositionCompact',
          'shader-composer.audioSignalPickerPosition',
        ],
      });
      const posLarge = clampPanelCenterToViewport(
        rawLarge,
        AUDIO_SIGNAL_PICKER_LARGE_CLAMP_BOX.width,
        AUDIO_SIGNAL_PICKER_LARGE_CLAMP_BOX.height,
        inset
      );
      const posCompact = clampPanelCenterToViewport(
        rawCompact,
        AUDIO_SIGNAL_PICKER_COMPACT_CLAMP_BOX.width,
        AUDIO_SIGNAL_PICKER_COMPACT_CLAMP_BOX.height,
        inset
      );
      if (posLarge.x !== rawLarge.x || posLarge.y !== rawLarge.y) {
        setStoredPosition('audio-signal-picker', posLarge.x, posLarge.y, 'large');
      }
      if (posCompact.x !== rawCompact.x || posCompact.y !== rawCompact.y) {
        setStoredPosition('audio-signal-picker', posCompact.x, posCompact.y, 'compact');
      }
      signalPickerXLarge = posLarge.x;
      signalPickerYLarge = posLarge.y;
      signalPickerXCompact = posCompact.x;
      signalPickerYCompact = posCompact.y;
      signalPickerTargetNodeId = targetNodeId;
      signalPickerTargetParameter = targetParameter;
      signalPickerOnSelect = onSelect;
      signalPickerTriggerElement = triggerElement ?? null;
      signalPickerBrowseMode = false;
      signalPickerVisible = true;
    },
    hideSignalPicker() {
      signalPickerVisible = false;
      signalPickerOnSelect = null;
      signalPickerTriggerElement = null;
      signalPickerBrowseMode = false;
    },
    isSignalPickerVisible() {
      return signalPickerVisible;
    },
  };

  /**
   * Toggle the audio bands & remappers panel (large picker in browse mode).
   * Reuses the existing AudioSignalPicker shell; no parameter target — Connect
   * actions are hidden, but bands/remappers can still be created, edited, and deleted.
   */
  function toggleAudioPanel() {
    if (signalPickerVisible && signalPickerBrowseMode) {
      signalPickerVisible = false;
      signalPickerOnSelect = null;
      signalPickerTriggerElement = null;
      signalPickerBrowseMode = false;
      return;
    }
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const inset = 16;
    const rawLarge = getStoredPosition('audio-signal-picker', {
      variant: 'large',
      fallback: center,
      legacyKey: [
        'shader-composer.audioSignalPickerPositionLarge',
        'shader-composer.audioSignalPickerPosition',
      ],
    });
    const posLarge = clampPanelCenterToViewport(
      rawLarge,
      AUDIO_SIGNAL_PICKER_LARGE_CLAMP_BOX.width,
      AUDIO_SIGNAL_PICKER_LARGE_CLAMP_BOX.height,
      inset
    );
    if (posLarge.x !== rawLarge.x || posLarge.y !== rawLarge.y) {
      setStoredPosition('audio-signal-picker', posLarge.x, posLarge.y, 'large');
    }
    signalPickerXLarge = posLarge.x;
    signalPickerYLarge = posLarge.y;
    signalPickerTargetNodeId = '';
    signalPickerTargetParameter = '';
    signalPickerOnSelect = null;
    signalPickerTriggerElement = null;
    signalPickerBrowseMode = true;
    signalPickerVisible = true;
  }

  function refreshTimelineFloatingPosition(): void {
    const inset = 16;
    const w = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const h = typeof window !== 'undefined' ? window.innerHeight : 700;
    const approxBodyH = Math.min(h * 0.3, 360);
    const bottomClearance = 100;
    const fallback = { x: w / 2, y: h - bottomClearance - approxBodyH / 2 };
    const raw = getStoredPosition('timeline-panel', {
      fallback,
      legacyKey: 'shader-composer.timelinePanelPosition',
    });
    const clamped = clampPanelCenterToViewport(
      raw,
      TIMELINE_PANEL_FLOATING_CLAMP_BOX.width,
      TIMELINE_PANEL_FLOATING_CLAMP_BOX.height,
      inset
    );
    if (clamped.x !== raw.x || clamped.y !== raw.y) {
      setStoredPosition('timeline-panel', clamped.x, clamped.y);
    }
    timelinePanelX = clamped.x;
    timelinePanelY = clamped.y;
  }

  function isCanvasBlockingDialogVisible(): boolean {
    if (layoutBlockingCanvasShortcuts) return true;
    if (splashOverlayVisible) return true;
    if (leaveSaveBlockedOpen) return true;
    if (helpVisible) return true;
    if (curveEditorLaneId != null) return true;
    if (canvasColorPickerVisible) return true;
    if (parameterValueOverlayVisible) return true;
    if (labelEditOverlayVisible) return true;
    if (signalPickerVisible) return true;
    if (overlayBridge.isEnumDropdownVisible()) return true;
    if (timelinePanelOpen) return true;
    return false;
  }

  function remapGraphIds(g: NodeGraph): NodeGraph {
    const newGraphId = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const nodeIdMap = new Map<string, string>();
    const nodes = g.nodes.map((n) => {
      const newId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      nodeIdMap.set(n.id, newId);
      return { ...n, id: newId };
    });
    const connections = g.connections.map((c) => ({
      ...c,
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceNodeId: nodeIdMap.get(c.sourceNodeId) ?? c.sourceNodeId,
      targetNodeId: nodeIdMap.get(c.targetNodeId) ?? c.targetNodeId,
    }));
    const automation =
      g.automation == null
        ? undefined
        : {
            ...g.automation,
            lanes: g.automation.lanes.map((lane) => ({
              ...lane,
              nodeId: nodeIdMap.get(lane.nodeId) ?? lane.nodeId,
            })),
          };
    return {
      ...g,
      id: newGraphId,
      nodes,
      connections,
      ...(automation !== undefined && { automation }),
      viewState: {
        ...(g.viewState ?? { zoom: 1, panX: 0, panY: 0, selectedNodeIds: [] }),
        selectedNodeIds: [],
      },
    };
  }

  async function applyStartingTrack(
    audioSetup: AudioSetup,
    startingTrackId: string
  ): Promise<AudioSetup> {
    try {
      const data = await getTracksData();
      const order = getPlaylistOrder(data);
      let setup = setPlaylistOrder(audioSetup, order);
      setup = setPrimarySource(setup, playlistPrimaryFromBundledCatalog(startingTrackId, data));
      const idx = order.indexOf(startingTrackId);
      setup = setPlaylistCurrentIndex(setup, idx >= 0 ? idx : 0);
      return setup;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      globalErrorHandler.report(
        'runtime',
        'warning',
        `Could not sync the bundled track catalog (${msg}). Using the playlist saved in this project.`,
        { originalError: e instanceof Error ? e : undefined }
      );
      return audioSetup;
    }
  }

  async function handleImportPresetFromFile(json: string): Promise<void> {
    if (!runtimeDispatcher || !compiler) return;
    await importFileAsNewLocalProject(json);
  }

  function handleDownloadPreset(): void {
    downloadGraphAsJsonFile(graphStore.graph, graphStore.audioSetup);
  }

  async function handleExport(): Promise<void> {
    await runEditorImageExportSession({
      compiler,
      graph: graphStore.graph,
      audioSetup: graphStore.audioSetup,
      getTimelineState: () => runtimeManager?.getTimelineState() ?? null,
      exportRasterBackend: runtimeManager?.getExportRasterBackend() ?? 'webgl2',
    });
  }

  async function handleVideoExport(): Promise<void> {
    await runEditorVideoExportSession({
      graph: graphStore.graph,
      audioSetup: graphStore.audioSetup,
      compiler: compiler!,
      getPrimaryAudio: createGetPrimaryAudioBuffer({
        getAudioManager: () => runtimeManager?.getAudioManager(),
        getAudioSetup: () => graphStore.audioSetup,
      }),
      exportRasterBackend: runtimeManager?.getExportRasterBackend() ?? 'webgl2',
    });
  }

  function finalizeSplashAfterEditorBootstrapLoaded(): void {
    projectGateBlocking = false;
    if (splashFeatureEnabled && !useAudiotoolGate) {
      splashReadyForDismiss = true;
    }
    if (useAudiotoolGate) {
      splashOverlayVisible = false;
    }
  }

  async function ensurePresetsAndHubLoaded(): Promise<void> {
    if (presets.length === 0) {
      presets = await listPresets();
    }
    await refreshHubProjectList();
  }

  async function applyResolvedHubToRuntime(resolved: HubResolveResult): Promise<void> {
    hydrating = true;
    undoRedoManager?.clear();
    graphStore.setGraph(resolved.graph);
    graphStore.setAudioSetup(resolved.audioSetup);
    activeSession = resolved.activeSession;
    selectedPreset = resolved.selectedPreset;
    hydrating = false;
    undoRedoManager?.pushState(graphStore.graph);
    undoStackRevision++;
    localRevision = 0;
    persistedRevision = 0;
    lastSuccessfulPersistAt = Date.now();
    appToastStore.dismissBySource('autosave');
    if (!runtimeDispatcher) return;
    // Audio setup is synced via $effect when graphStore.audioSetup updates.
    await runtimeDispatcher.loadGraph(graphStore.graph);
    if (resolved.graph.nodes.length > 0) {
      setTimeout(() => canvasApi?.fitToView(), 150);
    }
  }

  function parseUrlProjectId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const id = new URLSearchParams(window.location.search).get('project')?.trim();
      return id || null;
    } catch {
      return null;
    }
  }

  function parseUrlPreviewOverlayEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const raw = new URLSearchParams(window.location.search).get('previewOverlay')?.trim().toLowerCase();
      return raw === '1' || raw === 'true' || raw === 'yes';
    } catch {
      return false;
    }
  }

  function stripProjectQueryFromUrl(): void {
    if (typeof window === 'undefined') return;
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has('project')) return;
      u.searchParams.delete('project');
      const qs = u.searchParams.toString();
      history.replaceState(null, '', `${u.pathname}${qs ? `?${qs}` : ''}${u.hash}`);
    } catch {
      // ignore
    }
  }

  function queueAutosaveFlush(): void {
    const fn = (): void => {
      void flushAutosaveNow().catch(() => {});
    };
    const ric = window.requestIdleCallback;
    if (typeof ric === 'function') {
      ric(fn, { timeout: 2200 });
    } else {
      window.setTimeout(fn, 0);
    }
  }

  async function teardownToProjectsSplash(): Promise<void> {
    stopAnimation();
    intersectionObserver?.disconnect();
    intersectionObserver = null;
    safeDestroy(runtimeManager);
    runtimeManager = null;
    runtimeDispatcher = null;
    waveformService = null;
    compiler = null;
    disposeGraphRevisionListeners?.();
    disposeGraphRevisionListeners = null;
    canvasApi = null;
    hasInitialFit = false;
    activeSession = { kind: 'none' };
    localRevision = 0;
    persistedRevision = 0;
    lastSuccessfulPersistAt = Date.now();
    previewMount?.replaceChildren();
    splashOverlayVisible = false;
    projectGateBlocking = true;
    splashReadyForDismiss = false;
    leaveSaveBlockedOpen = false;
    await refreshHubProjectList();
  }

  async function tryOpenDeepLinkedProjectOnce(): Promise<void> {
    const id = deepLinkProjectId;
    if (!id || hubBusy || !runEditorBootstrapFromHubRef || runtimeManager !== null || urlDeepLinkAttemptedInvalid) return;
    const exists = hubProjects.some((p) => p.projectId === id);
    if (!exists) {
      urlDeepLinkAttemptedInvalid = true;
      globalErrorHandler.report(
        'validation',
        'warning',
        'That project is not in saved projects on this device. Open Projects and choose one.'
      );
      stripProjectQueryFromUrl();
      deepLinkProjectId = null;
      urlHighlightProjectId = null;
      return;
    }
    hubBusy = true;
    try {
      await runEditorBootstrapFromHubRef({ kind: 'userProject', projectId: id });
      stripProjectQueryFromUrl();
      deepLinkProjectId = null;
      urlHighlightProjectId = null;
    } catch {
      globalErrorHandler.report(
        'unexpected',
        'error',
        'We could not open that link. Pick the project from Projects instead.'
      );
    } finally {
      hubBusy = false;
    }
  }

  async function refreshHubProjectList(): Promise<void> {
    try {
      hubProjects = await listProjectMeta();
    } catch {
      hubStorageWarning =
        'Could not read saved projects here. Your list may be incomplete. Download your graph as JSON from the editor to keep a backup.';
      hubProjects = [];
      return;
    }
    let appMeta;
    try {
      appMeta = await readAppMeta();
    } catch {
      hubStorageWarning =
        'Could not read app preferences (like last opened project). Pick a project from the list.';
      appMeta = undefined;
    }
    hubLastOpenedProjectId = appMeta?.lastOpenedProjectId ?? null;
    if (appMeta?.lastOpenedProjectId) {
      const hit = hubProjects.some((p) => p.projectId === appMeta!.lastOpenedProjectId);
      if (!hit) {
        const key = `missing:${appMeta.lastOpenedProjectId}`;
        if (lastAppMetaWarningKey !== key) {
          lastAppMetaWarningKey = key;
          globalErrorHandler.report(
            'unexpected',
            'warning',
            'Your last opened project is no longer in the list. Choose another project below.'
          );
        }
      }
    }
  }

  async function handleContinueWithoutAudiotool(): Promise<void> {
    try {
      await ensurePresetsAndHubLoaded();
    } catch {
      globalErrorHandler.report('unexpected', 'error', 'Could not load presets or projects. Try again.');
      return;
    }
    splashOverlayVisible = false;
    await tick();
    await tryOpenDeepLinkedProjectOnce();
    if (!runtimeManager) projectGateBlocking = true;
  }

  async function handleHubPick(selection: HubSelection): Promise<void> {
    if (hubBusy || !runEditorBootstrapFromHubRef) return;
    hubBusy = true;
    hubStorageWarning = null;
    try {
      if (runtimeManager !== null) {
        const resolved = await resolveHubSelectionToGraph(
          selection,
          toValidationSpecs(nodeSpecs),
          remapGraphIds,
          applyStartingTrack
        );
        await applyResolvedHubToRuntime(resolved);
        await refreshHubProjectList();
        finalizeSplashAfterEditorBootstrapLoaded();
      } else {
        await runEditorBootstrapFromHubRef(selection);
        // Bootstrapping from the blocking hub can create new local projects (new/fork/import).
        // Refresh the in-memory meta list so reopening the picker immediately shows the new row.
        await refreshHubProjectList();
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Could not open the editor. Try another project or refresh the page.';
      hubStorageWarning = msg;
      globalErrorHandler.report('unexpected', 'error', msg);
    } finally {
      hubBusy = false;
    }
  }

  async function handleHubDelete(projectId: string): Promise<void> {
    try {
      await deleteProjectAtomic(projectId);
      await refreshHubProjectList();
    } catch (e) {
      globalErrorHandler.report(
        'unexpected',
        'error',
        e instanceof Error ? e.message : 'Could not delete project'
      );
    }
  }

  async function handleHubDuplicate(projectId: string): Promise<void> {
    try {
      const iso = new Date().toISOString();
      await duplicateProjectAtomic({
        sourceProjectId: projectId,
        newProjectId: generateUUID(),
        createdAtISO: iso,
        lastModifiedISO: iso,
      });
      await refreshHubProjectList();
    } catch (e) {
      globalErrorHandler.report(
        'unexpected',
        'error',
        e instanceof Error ? e.message : 'Could not duplicate project'
      );
    }
  }

  async function handleHubAppearanceChange(projectId: string, next: ProjectAvatarFields): Promise<void> {
    try {
      await updateProjectAppearanceAtomic({
        projectId,
        avatarNodeIcon: next.avatarNodeIcon,
        avatarBgToken: next.avatarBgToken,
        avatarIconColorToken: next.avatarIconColorToken,
        lastModifiedISO: new Date().toISOString(),
      });
      await refreshHubProjectList();
    } catch (e) {
      globalErrorHandler.report(
        'unexpected',
        'error',
        e instanceof Error ? e.message : 'Could not update project appearance'
      );
    }
  }

  async function handleHubRename(projectId: string, rawDisplayName: string): Promise<void> {
    try {
      const displayName =
        rawDisplayName.trim().slice(0, 256) ||
        hubProjects.find((p) => p.projectId === projectId)?.displayName.trim() ||
        'Untitled';
      const row = await getProjectPayload(projectId);
      if (!row?.json) throw new Error('Project not found');
      const parsed = await loadPresetFromJson(row.json, toValidationSpecs(nodeSpecs));
      if (!parsed.graph) {
        throw new Error(parsed.errors[0] ?? 'Could not load project data');
      }
      const updatedGraph = { ...parsed.graph, name: displayName };
      const audioSetup = parsed.audioSetup ?? { files: [], bands: [], remappers: [] };
      const json = serializeGraph(updatedGraph, false, audioSetup, {
        startingTrackId: parsed.startingTrackId,
      });
      const iso = new Date().toISOString();
      await saveProjectPayloadAtomic({
        projectId,
        json,
        displayName,
        lastModifiedISO: iso,
      });
      await refreshHubProjectList();
      if (activeSession.kind === 'userProject' && activeSession.projectId === projectId) {
        hydrating = true;
        graphStore.setGraph({ ...graphStore.graph, name: displayName });
        hydrating = false;
      }
    } catch (e) {
      globalErrorHandler.report(
        'unexpected',
        'error',
        e instanceof Error ? e.message : 'Could not rename project'
      );
    }
  }

  async function handleHubImportJson(json: string): Promise<void> {
    if (hubBusy || !runEditorBootstrapFromHubRef) return;
    hubBusy = true;
    try {
      const result = await importProjectTextAsNewLocalProjects({
        text: json,
        nodeSpecs: toValidationSpecs(nodeSpecs),
        remapGraphIds,
        applyStartingTrack,
      });

      if (result.kind === 'bundle') {
        await refreshHubProjectList();

        const importedCount = result.importedProjectIds.length;
        appToastStore.addToast({
          variant: 'success',
          message: importedCount === 1 ? 'Imported 1 project.' : `Imported ${importedCount} projects.`,
          source: 'import',
        });

        if (result.failedCount > 0) {
          appToastStore.addToast({
            variant: 'warning',
            message: `Some projects could not be imported (${result.failedCount}/${result.totalCount}).`,
            source: 'import',
          });
        }
        return;
      }

      await refreshHubProjectList();

      const list = await listProjectMeta();
      let pid = result.projectId;
      try {
        const last = await readAppMeta();
        const lastPid = last?.lastOpenedProjectId;
        if (lastPid && list.some((p) => p.projectId === lastPid)) {
          pid = lastPid;
        }
      } catch {
        // ignore: keep `pid` from import result
      }

      if (!pid || !list.some((p) => p.projectId === pid)) {
        globalErrorHandler.report(
          'validation',
          'error',
          'Your import is saved, but we could not open it automatically. Open it from Projects.'
        );
        return;
      }

      if (runtimeManager !== null) {
        const resolved = await resolveHubSelectionToGraph(
          { kind: 'userProject', projectId: pid },
          toValidationSpecs(nodeSpecs),
          remapGraphIds,
          applyStartingTrack
        );
        await applyResolvedHubToRuntime(resolved);
        finalizeSplashAfterEditorBootstrapLoaded();
      } else {
        await runEditorBootstrapFromHubRef({ kind: 'userProject', projectId: pid });
      }
    } catch (e) {
      globalErrorHandler.report(
        'validation',
        'error',
        e instanceof Error ? e.message : 'That file is not valid graph JSON'
      );
    } finally {
      hubBusy = false;
    }
  }

  async function handleHubExportAllProjects(): Promise<void> {
    if (hubBusy) return;
    hubBusy = true;
    try {
      const { bundle } = await buildProjectsBundle();
      downloadProjectsBundleAsJsonFile(bundle);
      const count = bundle.projects.length;
      appToastStore.addToast({
        variant: 'success',
        message: count === 1 ? 'Exported 1 project.' : `Exported ${count} projects.`,
        source: 'export',
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      globalErrorHandler.report('unexpected', 'error', 'Could not export projects.', {
        originalError: e instanceof Error ? e : new Error(detail),
      });
      appToastStore.addToast({
        variant: 'error',
        message: 'Export failed.',
        copyText: `Export failed.\n${detail}`,
        source: 'export',
      });
    } finally {
      hubBusy = false;
    }
  }

  /** Import from top bar while editor running: new local row + hydrate in place */
  async function importFileAsNewLocalProject(json: string): Promise<void> {
    try {
      const result = await importProjectTextAsNewLocalProjects({
        text: json,
        nodeSpecs: toValidationSpecs(nodeSpecs),
        remapGraphIds,
        applyStartingTrack,
      });

      if (result.kind === 'bundle') {
        await refreshHubProjectList();

        const importedCount = result.importedProjectIds.length;
        appToastStore.addToast({
          variant: 'success',
          message: importedCount === 1 ? 'Imported 1 project.' : `Imported ${importedCount} projects.`,
          source: 'import',
        });

        if (result.failedCount > 0) {
          appToastStore.addToast({
            variant: 'warning',
            message: `Some projects could not be imported (${result.failedCount}/${result.totalCount}).`,
            source: 'import',
          });
        }
        return;
      }

      const projectId = result.projectId;
      const row = await getProjectPayload(projectId);
      if (!row) throw new Error('Import write failed');
      const loadResult = await loadPresetFromJson(row.json, toValidationSpecs(nodeSpecs));
      if (!loadResult.graph) throw new Error(loadResult.errors[0] ?? 'Invalid file');
      let audioSetup = loadResult.audioSetup ?? { files: [], bands: [], remappers: [] };
      if (loadResult.startingTrackId) {
        audioSetup = await applyStartingTrack(audioSetup, loadResult.startingTrackId);
      }
      const graph = loadResult.graph;
      hydrating = true;
      undoRedoManager?.clear();
      graphStore.setGraph(graph);
      graphStore.setAudioSetup(audioSetup);
      activeSession = { kind: 'userProject', projectId };
      selectedPreset = null;
      hydrating = false;
      undoRedoManager?.pushState(graphStore.graph);
      undoStackRevision++;
      localRevision = 0;
      persistedRevision = 0;
      lastSuccessfulPersistAt = Date.now();
      appToastStore.dismissBySource('autosave');
      if (runtimeDispatcher) {
        // Audio setup is synced via $effect when graphStore.audioSetup updates.
        await runtimeDispatcher.loadGraph(graph);
      }
      if (graph.nodes.length > 0) {
        setTimeout(() => canvasApi?.fitToView(), 0);
      }
      await refreshHubProjectList();
    } catch (e) {
      globalErrorHandler.report(
        'validation',
        'error',
        e instanceof Error ? e.message : 'Import failed.'
      );
    }
  }

  async function onLeaveSaveBlockedRetry(): Promise<void> {
    appToastStore.dismissBySource('autosave');
    try {
      await flushAutosaveNow();
      if (localRevision === persistedRevision) {
        leaveSaveBlockedOpen = false;
        await teardownToProjectsSplash();
      }
    } catch {
      // modal stays open; toast from flushAutosaveNow
    }
  }

  function onLeaveSaveBlockedDownloadAndContinue(): void {
    downloadGraphAsJsonFile(graphStore.graph, graphStore.audioSetup);
    leaveSaveBlockedOpen = false;
    void teardownToProjectsSplash();
  }

  function onLeaveSaveBlockedCancel(): void {
    leaveSaveBlockedOpen = false;
  }

  async function flushAutosaveNow(): Promise<void> {
    if (activeSession.kind !== 'userProject') return;
    if (localRevision === persistedRevision) return;
    try {
      const json = serializeGraph(graphStore.graph, true, graphStore.audioSetup, {
        startingTrackId:
          graphStore.audioSetup.primarySource?.type === 'playlist'
            ? graphStore.audioSetup.primarySource.trackId
            : undefined,
      });
      await saveProjectPayloadAtomic({
        projectId: activeSession.projectId,
        json,
        displayName: graphStore.graph.name.trim() || 'Untitled',
        lastModifiedISO: new Date().toISOString(),
      });
      persistedRevision = localRevision;
      lastSuccessfulPersistAt = Date.now();
      appToastStore.dismissBySource('autosave');
      await refreshHubProjectList();
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      appToastStore.addToast({
        variant: 'error',
        message: `Could not save (${detail}). Download your graph as JSON to keep a backup.`,
        copyText: `IndexedDB save failed.\n${detail}`,
        source: 'autosave',
      });
      console.error('[autosave]', e);
      throw e;
    }
  }

  /** Debounced + clamped IndexedDB autosave (`requestIdleCallback` when available; §5 timing). */
  $effect(() => {
    void graphStore.audioSetup;
    void lastSuccessfulPersistAt;
    const rev = localRevision;
    void rev;
    if (hydrating || activeSession.kind !== 'userProject') {
      clearTimeout(autosaveDebounceHandle);
      clearTimeout(autosaveClampHandle);
      autosaveDebounceHandle = 0;
      autosaveClampHandle = 0;
      return;
    }
    if (localRevision === persistedRevision) {
      clearTimeout(autosaveClampHandle);
      autosaveClampHandle = 0;
      return;
    }

    clearTimeout(autosaveDebounceHandle);
    autosaveDebounceHandle = window.setTimeout(() => {
      queueAutosaveFlush();
      autosaveDebounceHandle = 0;
    }, 520);

    const elapsedSincePersist = Date.now() - lastSuccessfulPersistAt;
    const clampWait = Math.max(0, 3200 - elapsedSincePersist);
    clearTimeout(autosaveClampHandle);
    autosaveClampHandle = window.setTimeout(() => {
      if (
        activeSession.kind === 'userProject' &&
        localRevision !== persistedRevision
      ) {
        queueAutosaveFlush();
      }
      autosaveClampHandle = 0;
    }, clampWait);

    return () => {
      clearTimeout(autosaveDebounceHandle);
      clearTimeout(autosaveClampHandle);
      autosaveDebounceHandle = 0;
      autosaveClampHandle = 0;
    };
  });

  function handleAudiotoolLogout(): void {
    const session = atConn.session;
    dispatchAt({ type: 'LOGOUT_AND_CLEAR_SESSION' });
    try {
      session?.logout();
    } catch {
      // ignore
    }
    void reconnectAudiotoolLoginAfterDisconnect();
  }

  function handleAudiotoolSessionRpcInvalidated(): void {
    const session = atConn.session;
    dispatchAt({ type: 'SESSION_INVALIDATED_BY_SERVER' });
    try {
      session?.logout();
    } catch {
      // ignore
    }
    globalErrorHandler.report('network', 'warning', 'You were signed out of Audiotool. Sign in again to use account features.');
    void reconnectAudiotoolLoginAfterDisconnect();
  }

  function startAnimation(): void {
    if (!isVisible || !runtimeManager || animationFrameId !== null) return;
    const ZOOM_UPDATE_INTERVAL = 100;
    let lastFrameTime = performance.now();
    let lastZoomUpdate = lastFrameTime;

    const animate = () => {
      if (!isVisible || !runtimeManager) {
        animationFrameId = null;
        return;
      }
      const now = performance.now();
      const frameTime = now - lastFrameTime;
      lastFrameTime = now;
      fps = frameTime > 0 ? 1000 / frameTime : 0;

      if (now - lastZoomUpdate >= ZOOM_UPDATE_INTERVAL) {
        lastZoomUpdate = now;
        zoom = canvasApi?.getViewState().zoom ?? 1;
      }

      const time = (now / 1000.0) % 1000.0;
      runtimeManager.setTime(time);
      // Node editor canvas redraws on user interaction (pan, zoom, drag, etc.) - no need to redraw every frame
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);
  }

  function stopAnimation(): void {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  onMount(() => {
    let cancelled = false;
    let docListenersAttached = false;

    async function runEditorBootstrapFromHub(selection: HubSelection): Promise<void> {
      const resolved = await resolveHubSelectionToGraph(
        selection,
        toValidationSpecs(nodeSpecs),
        remapGraphIds,
        applyStartingTrack
      );
      if (cancelled) return;

      const comp = new NodeShaderCompiler(nodeSpecsMap);
      compiler = comp;

      const mount = previewMount;
      if (!mount) {
        console.error('[App] Preview mount not found');
        splashOverlayVisible = false;
        throw new Error('Preview mount not found');
      }
      mount.replaceChildren();

      const previewCanvas = document.createElement('canvas');
      previewCanvas.style.cssText = 'width: 100%; height: 100%; display: block;';
      mount.appendChild(previewCanvas);

      const showWebGLUnsupported = (err: WebGLContextError): void => {
        splashOverlayVisible = false;
        mount.removeChild(previewCanvas);
        const msg = document.createElement('div');
        msg.style.cssText = `
        width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
        padding: 24px; text-align: center; color: var(--text-muted, #888);
        font-size: 14px; line-height: 1.5;
      `;
        msg.textContent =
          'WebGL2 is not available here. Try a normal window (not private browsing), turn on hardware acceleration in your browser settings, or use Chrome, Firefox, or Edge.';
        mount.appendChild(msg);
        globalErrorHandler.reportError(
          ErrorUtils.webglError('WebGL2 is not available in this browser.', { originalError: err })
        );
      };

      let rm: Awaited<ReturnType<typeof createRuntimeManager>>;
      try {
        rm = await createEditorPreviewRuntimeManager({
          previewCanvas,
          compiler: comp,
          errorHandler: globalErrorHandler,
          nodeSpecsMap,
          previewCompileUiSink,
        });
        if (cancelled) return;
        runtimeManager = rm;
        runtimeDispatcher = new RuntimeMessageDispatcher(rm);
      } catch (err) {
        if (err instanceof WebGLContextError) {
          showWebGLUnsupported(err);
          throw err;
        }
        splashOverlayVisible = false;
        throw err;
      }
      if (cancelled) return;

      rm.setOnContextLost(() => stopAnimation());
      rm.setOnAppContextRestored(() => startAnimation());

      if (import.meta.env.DEV && parseUrlPreviewOverlayEnabled()) {
        (window as unknown as { __previewSchedulerDebug?: { enableOverlay: (enabled: boolean) => void } })
          .__previewSchedulerDebug?.enableOverlay(true);
      }

      undoRedoManager = new UndoRedoManager();
      disposeGraphRevisionListeners?.();
      const disposeRevisions = attachGraphRevisionListeners({
        host: graphStore,
        getHydrating: () => hydrating,
        onGraphChanged: (g, options) => {
          if (options?.recordUndo !== false) {
            undoRedoManager?.pushState(g);
            undoStackRevision++;
          }
          localRevision++;
        },
        onAudioChanged: () => {
          localRevision++;
        },
      });
      graphStore.setPatchToolExitListener(() => {
        appToastStore.dismissBySource('patch-tool');
      });
      disposeGraphRevisionListeners = () => {
        disposeRevisions();
        graphStore.setPatchToolExitListener(null);
      };

      await applyResolvedHubToRuntime(resolved);
      if (cancelled) return;

      if (!docListenersAttached) {
        docListenersAttached = true;
        document.addEventListener('visibilitychange', () => {
          isVisible = !document.hidden;
          if (!isVisible) {
            stopAnimation();
            void flushAutosaveNow().catch(() => {});
          } else startAnimation();
        });
        window.addEventListener('pagehide', () => {
          void flushAutosaveNow().catch(() => {});
        });
      }

      intersectionObserver?.disconnect();
      intersectionObserver = new IntersectionObserver((entries) => {
        const iv = entries[0].isIntersecting;
        isVisible = iv && !document.hidden;
        if (!isVisible) stopAnimation();
        else startAnimation();
      }, { threshold: 0.1 });
      intersectionObserver.observe(previewCanvas);

      startAnimation();
      finalizeSplashAfterEditorBootstrapLoaded();
    }

    runEditorBootstrapFromHubRef = runEditorBootstrapFromHub;

    (async () => {
      await loadPhosphorIconData();
      await tick();
      if (cancelled) return;
      deepLinkProjectId = parseUrlProjectId();
      urlHighlightProjectId = deepLinkProjectId;

      globalErrorHandler.onError((err: import('../utils/errorHandling').AppError) => {
        appToastStore.addFromAppError(err);
        if (err.severity === 'error' || err.severity === 'warning') {
          errorAnnouncer.announce(formatErrorForAnnouncer(err));
        }
      });

      if (useAudiotoolGate) {
        dispatchAt({ type: 'AUTH_CHECKING' });
        try {
          const auth = await initAudiotoolBrowserAuth();
          if (cancelled) return;
          if (auth.status === 'unauthenticated') {
            const login = (): void => {
              auth.login();
            };
            dispatchAt({
              type: 'AUTH_UNAUTHENTICATED',
              login,
              oauthErrorDetail: auth.error?.message ?? null,
            });
            setAudiotoolPlaylistLoadSessionAvailable(false);
            return;
          }
          dispatchAt({ type: 'AUTH_CONNECTED', session: auth });
          setAudiotoolPlaylistLoadSessionAvailable(true);
        } catch (err) {
          if (cancelled) return;
          const message =
            err instanceof Error ? err.message : 'Audiotool sign-in unavailable';
          dispatchAt({
            type: 'AUTH_INIT_FAILED',
            message,
            retryReload: (): void => {
              window.location.reload();
            },
          });
          return;
        }
      }

      try {
        await ensurePresetsAndHubLoaded();
        await tick();
        if (cancelled) return;
        await tryOpenDeepLinkedProjectOnce();
        if (cancelled) return;
        if (!runtimeManager) {
          splashOverlayVisible = false;
          projectGateBlocking = true;
        }
      } catch (err) {
        console.error('[App] Hub preload failed:', err);
        globalErrorHandler.report('unexpected', 'error', 'Could not load Projects. Refresh the page and try again.');
      }
    })();

    return () => {
      cancelled = true;
      runEditorBootstrapFromHubRef = null;
      stopAnimation();
      intersectionObserver?.disconnect();
      intersectionObserver = null;
      safeDestroy(runtimeManager);
      runtimeManager = null;
      waveformService = null;
    };
  });

  function openHelpOverview(): void {
    helpMode = 'overview';
    const center = canvasApi?.getCanvasCenterInScreen() ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = getStoredPosition('help-panel', {
      fallback: center,
      legacyKey: 'shader-composer.helpPanelPosition',
    });
    helpNodeType = undefined;
    helpContent = HELP_OVERVIEW_PLACEHOLDER;
    helpScreenX = pos.x;
    helpScreenY = pos.y;
    helpPositionMode = 'center';
    helpVisible = true;
  }

  function openHelpForNodeType(nodeType: string): void {
    helpMode = 'node';
    const center = canvasApi?.getCanvasCenterInScreen() ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = getStoredPosition('help-panel', {
      fallback: center,
      legacyKey: 'shader-composer.helpPanelPosition',
    });
    getHelpContent(`node:${nodeType}`).then((content) => {
      if (helpMode !== 'node') return;
      helpContent = content;
      helpNodeType = nodeType;
      helpScreenX = pos.x;
      helpScreenY = pos.y;
      helpPositionMode = 'center';
      helpVisible = true;
    });
  }
</script>

<svelte:window />

{#snippet timelinePanelSnippet()}
  <TimelinePanel
    getGraph={() => graphStore.graph}
    onGraphUpdate={async (g) => {
      graphStore.setGraph(g);
      await runtimeDispatcher?.loadGraph(g);
    }}
    getTimelineState={() => runtimeManager?.getTimelineState() ?? null}
    onSeek={(t) => runtimeManager?.seekGlobalAudio(t)}
    waveformService={waveformService}
    onRevealInNodeEditor={(nodeId, paramName) => {
      canvasApi?.focusNode(nodeId, { zoom: 0.8, targetScreenYFrac: 0.34 });
      queueMicrotask(() => {
        const esc = (v: string) => (typeof CSS !== 'undefined' && 'escape' in CSS ? (CSS as unknown as { escape(s: string): string }).escape(v) : v);
        const selector = `.param-port[data-node-id="${esc(nodeId)}"][data-param-name="${esc(paramName)}"]`;
        const el = document.querySelector(selector) as HTMLElement | null;
        el?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        el?.focus?.({ preventScroll: true });
      });
    }}
    onOpenCurveEditor={(laneId, regionId, labels) => {
      curveEditorRegionTimePreview = null;
      curveEditorLaneId = laneId;
      curveEditorRegionId = regionId;
      curveEditorParamLabel = labels.paramLabel;
    }}
    onClose={() => {
      timelinePanelOpen = false;
    }}
    nodeSpecs={nodeSpecs}
    openCurveEditorRegion={
      curveEditorLaneId && curveEditorRegionId
        ? { laneId: curveEditorLaneId, regionId: curveEditorRegionId }
        : null
    }
    onOpenCurveEditorRegionTimePreview={(preview) => {
      curveEditorRegionTimePreview = preview;
    }}
  />
{/snippet}

{#snippet curveEditorSlotSnippet()}
  {#if curveEditorLaneId && curveEditorRegionId}
    <TimelineCurveEditor
      getGraph={() => graphStore.graph}
      onGraphUpdate={async (g) => {
        graphStore.setGraph(g);
        await runtimeDispatcher?.loadGraph(g);
      }}
      onSeek={(t) => runtimeManager?.seekGlobalAudio(t)}
      onClose={() => {
        curveEditorRegionTimePreview = null;
        curveEditorLaneId = null;
        curveEditorRegionId = null;
        curveEditorParamLabel = '';
      }}
      laneId={curveEditorLaneId}
      regionId={curveEditorRegionId}
      paramLabel={curveEditorParamLabel}
      onRevealInNodeEditor={(nodeId, paramName) => {
        canvasApi?.focusNode(nodeId, { zoom: 0.8, targetScreenYFrac: 0.34 });
        queueMicrotask(() => {
          const esc = (v: string) => (typeof CSS !== 'undefined' && 'escape' in CSS ? (CSS as unknown as { escape(s: string): string }).escape(v) : v);
          const selector = `.param-port[data-node-id="${esc(nodeId)}"][data-param-name="${esc(paramName)}"]`;
          const el = document.querySelector(selector) as HTMLElement | null;
          el?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
          el?.focus?.({ preventScroll: true });
        });
      }}
      nodeSpecs={nodeSpecs}
      regionTimeRangePreview={curveEditorRegionTimePreview}
      getWaveformData={waveformService ? async () => waveformService!.getWaveformForCurveEditor() : undefined}
      getCurrentTransportTime={() => runtimeManager?.getTimelineState()?.currentTime ?? 0}
    />
  {/if}
{/snippet}

<div class="app-root" style="position: fixed; inset: 0; overflow: hidden; background: var(--layout-bg, #1a1a1a);">
  {#if splashOverlayVisible}
    <AppSplashScreen
      audiotoolPhase={audiotoolSplashAudiotoolPhase(atConn)}
      audiotoolError={atConn.oauthErrorDetail}
      onAudiotoolSignIn={atConn.splashPrimaryAction ?? undefined}
      audiotoolSignInLabel={atConn.splashSignInLabel}
      onContinueWithoutAudiotool={useAudiotoolGate && atConn.phase === 'disconnected'
        ? handleContinueWithoutAudiotool
        : undefined}
      audiotoolBootstrapping={atConn.editorBootstrapInFlight}
      ready={splashReadyForDismiss}
      onDismiss={() => {
        splashOverlayVisible = false;
      }}
    />
  {/if}
  <ErrorAnnouncer />

  <ModalDialog
    open={leaveSaveBlockedOpen}
    onClose={onLeaveSaveBlockedCancel}
    variant="confirm"
    title="Could not save before leaving"
    showHeaderClose={true}
    class="leave-save-blocked-modal"
    bodyClass="leave-save-blocked-body"
  >
    {#snippet footer()}
      <div class="leave-save-blocked-footer">
        <Button variant="primary" size="md" onclick={() => void onLeaveSaveBlockedRetry()}>Retry save</Button>
        <Button variant="secondary" size="md" onclick={onLeaveSaveBlockedDownloadAndContinue}>
          Download JSON & leave
        </Button>
        <Button variant="ghost" size="md" onclick={onLeaveSaveBlockedCancel}>Cancel</Button>
      </div>
    {/snippet}
    <p class="leave-save-blocked-copy">
      The browser could not save your project before returning to Projects. That can happen if storage is full, private
      browsing blocks saves, or permission was denied. Retry the save, download your graph as JSON and leave, or cancel
      to stay in the editor.
    </p>
  </ModalDialog>

  <NodeEditorLayout
    runtimeBootstrapped={runtimeManager !== null}
    projectGateBlocking={projectGateBlocking}
    hubProjects={hubProjects}
    hubPresets={presets}
    hubLastOpenedProjectId={hubLastOpenedProjectId}
    hubPickerHighlightedProjectId={hubPickerHighlightedProjectId}
    hubStorageWarning={hubStorageWarning}
    hubBusy={hubBusy}
    onHubPick={handleHubPick}
    onHubDuplicate={(id) => void handleHubDuplicate(id)}
    onHubDelete={(id) => void handleHubDelete(id)}
    onHubRename={(id, name) => void handleHubRename(id, name)}
    onHubAppearanceChange={(id, next) => void handleHubAppearanceChange(id, next)}
    onHubImportJson={(json) => void handleHubImportJson(json)}
    onHubExportAllProjects={() => void handleHubExportAllProjects()}
    presetList={presets}
    selectedPreset={selectedPreset}
    primaryTrackKey={primaryTrackKey}
    autosavePersistPending={isUserProjectDirty}
    audiotoolAccount={atConn.session
      ? {
          userName: atConn.session.userName,
          onLogout: handleAudiotoolLogout,
          rpcClient: atConn.session,
          onAudiotoolSessionInvalidated: handleAudiotoolSessionRpcInvalidated,
        }
      : null}
    audiotoolSignInChrome={resolveAudiotoolSignInChromeAction({
      useAudiotoolGate,
      splashOverlayVisible,
      hasAudiotoolSession: atConn.session != null,
      login: atConn.disconnectedLogin,
    })}
    isPanelVisible={isPanelVisible}
    zoom={zoom}
    fps={fps}
    isVideoExportSupported={isVideoExportSupported()}
    graphHistoryControls={runtimeManager !== null}
    canUndoGraph={canUndoGraph}
    canRedoGraph={canRedoGraph}
    onGraphUndo={() => {
      void performGraphUndo();
    }}
    onGraphRedo={() => {
      void performGraphRedo();
    }}
    onLayoutBlockingOverlaysChange={(blocked) => {
      layoutBlockingCanvasShortcuts = blocked;
    }}
    onPreviewGeometryCommit={() => {
      runtimeManager?.notifyPreviewLayoutChanged();
    }}
    callbacks={{
      onDownloadPreset: handleDownloadPreset,
      onExport: handleExport,
      onVideoExport: handleVideoExport,
      onImportPresetFromFile: handleImportPresetFromFile,
      onZoomChange: (z) => canvasApi?.setZoom(z),
      getZoom: () => canvasApi?.getViewState().zoom ?? 1,
      isHelpEnabled: () => {
        const n = graphStore.graph.viewState?.selectedNodeIds?.length ?? 0;
        return n === 0 || n === 1;
      },
      onHelpClick: () => {
        const ids = graphStore.graph.viewState?.selectedNodeIds ?? [];
        if (ids.length === 0) {
          openHelpOverview();
          return;
        }
        if (ids.length !== 1) return;
        const nodeId = ids[0];
        const node = graphStore.graph.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        openHelpForNodeType(node.type);
      },
      onPanelToggle: () => {
        isPanelVisible = !isPanelVisible;
        nodePanelRef?.toggle?.();
      },
    }}
  >
    {#snippet preview()}
      <div bind:this={previewMount} style="width: 100%; height: 100%;"></div>
    {/snippet}

    {#snippet nodeEditor({ viewMode })}
      {@const graph = graphStore.graph}
      <NodeEditorCanvasWrapper
        nodeSpecs={nodeSpecs}
        graph={graph}
        editorSurfaceVisible={viewMode !== 'full'}
        bind:api={canvasApi}
        overlayBridge={overlayBridge}
        getTimelineCurrentTime={() => runtimeManager?.getTimelineState()?.currentTime ?? 0}
        getTimelineState={() => runtimeManager?.getTimelineState() ?? null}
        getExclusiveRasterGpu={() => runtimeManager?.getExportRasterBackend() ?? null}
        callbacks={{
          onGraphChanged: async (g) => {
            await runtimeDispatcher?.loadGraph(g);
          },
          onConnectionRemoved: () => {},
          onNodeContextMenu: (x, y, nodeId, nodeType) => {
            nodeRightClickMenuRef?.show(x, y, nodeId, nodeType);
          },
          onParameterChanged: async (nodeId, paramName, value, g) => {
            if (!g) return;
            await runtimeDispatcher?.updateParameter(nodeId, paramName, value, g);
          },
          onFileParameterChanged: async (nodeId, paramName, file) => {
            await runtimeDispatcher?.updateAudioFileParameter(nodeId, paramName, file);
            const up = updateNodeParameter(graphStore.graph, nodeId, paramName, file.name);
            graphStore.setGraph(up);
          },
          onFileDialogOpen: () => stopAnimation(),
          onFileDialogClose: () => startAnimation(),
          onSelectionChanged: (ids) => {
            graphStore.updateViewState({ selectedNodeIds: ids });
          },
          isDialogVisible: isCanvasBlockingDialogVisible,
          onToggleFullscreen: () => {
            void toggleFullscreen();
          },
          onUndo: () => {
            void performGraphUndo();
          },
          onRedo: () => {
            void performGraphRedo();
          },
        }}
      />
    {/snippet}

    {#snippet panel()}
      <NodePanelContent
        bind:this={nodePanelRef}
        nodeSpecs={nodeSpecs}
        onCreateNode={(nodeType, canvasX, canvasY) => {
          const node = canvasApi?.addNode(nodeType, canvasX, canvasY);
          if (node) {
            runtimeDispatcher?.loadGraph(graphStore.graph);
          }
        }}
        onScreenToCanvas={(sx, sy) => canvasApi?.screenToCanvas(sx, sy) ?? { x: 0, y: 0 }}
      />
    {/snippet}

    {#snippet docsPanel()}
      <DocsPanelContent nodeSpecs={nodeSpecs} onOpenNodeHelp={openHelpForNodeType} />
    {/snippet}

    {#snippet bottomBar(primaryTrackKey)}
      <BottomBar
        bind:this={bottomBarRef}
        primaryTrackKey={primaryTrackKey}
        getState={() => runtimeManager?.getTimelineState() ?? null}
        getWaveformForPrimary={waveformService ? () => waveformService!.getWaveformForPrimary() : undefined}
        onPlayToggle={() => runtimeDispatcher?.toggleGlobalAudioPlayback()}
        loopCurrentTrack={graphStore.audioSetup?.playlistState?.loopCurrentTrack ?? false}
        onLoopToggle={() => {
          const setup = setLoopCurrentTrack(graphStore.audioSetup, !(graphStore.audioSetup?.playlistState?.loopCurrentTrack));
          graphStore.setAudioSetup(setup);
          const state = runtimeManager?.getTimelineState();
          if (state?.isPlaying) {
            runtimeDispatcher?.toggleGlobalAudioPlayback();
            runtimeDispatcher?.toggleGlobalAudioPlayback();
          }
        }}
        onTimeChange={(t) => runtimeDispatcher?.seekGlobalAudio(t)}
        onToolChange={(tool) => {
          graphStore.setActiveTool(tool);
          canvasApi?.setActiveTool(tool);
        }}
        onTimelinePanelOpen={refreshTimelineFloatingPosition}
        bind:timelinePanelOpen={timelinePanelOpen}
        isAudioPanelOpen={signalPickerVisible && signalPickerBrowseMode}
        onAudioPanelToggle={toggleAudioPanel}
        audioSetup={graphStore.audioSetup}
        getTrackKey={() => getPrimaryFileId(graphStore.audioSetup)}
        getPrimaryAudioFileNodeId={() => getPrimaryFileId(graphStore.audioSetup) ?? 'primary'}
        onSelectTrack={async (trackId, pickMeta?: PlaylistTrackPickMeta) => {
          const prevPrimaryId = getPrimaryFileId(graphStore.audioSetup);
          const data = await getTracksData();

          let gotFromGet: AudiotoolGetTrackParsed | undefined;
          if (trackId.startsWith('tracks/') && !resolvePlaylistTrackMp3Url(data, trackId)) {
            const session = atConn.session;
            if (session) {
              const fetched = await withAudiotoolUserSession(session, (client) =>
                fetchAudiotoolTrackViaGetTrack(client, trackId)
              );
              if (fetched.ok && fetched.value) {
                gotFromGet = fetched.value;
                if (gotFromGet.playbackUrl) registerAudiotoolPlaylistTrackPlaybackUrl(trackId, gotFromGet.playbackUrl);
              }
            }
          }

          const now = new Date().toISOString();
          const pickLabel = pickMeta?.displayName?.trim() ?? '';
          let primaryPl: PlaylistPrimarySource;

          if (pickMeta && pickLabel.length > 0) {
            setAudiotoolTrackDisplayNameCache(trackId, pickLabel);
            primaryPl = {
              type: 'playlist',
              trackId,
              displayName: pickLabel,
              displayNameSource: pickMeta.displayNameSource,
              displayNameUpdatedAt: now,
            };
          } else {
            const fromBundled = playlistPrimaryFromBundledCatalog(trackId, data);
            if (fromBundled.displayName) {
              primaryPl = fromBundled;
            } else if (gotFromGet?.displayName?.trim()) {
              const dn = gotFromGet.displayName.trim();
              setAudiotoolTrackDisplayNameCache(trackId, dn);
              primaryPl = {
                type: 'playlist',
                trackId,
                displayName: dn,
                displayNameSource: 'audiotool',
                displayNameUpdatedAt: now,
              };
            } else {
              primaryPl = { type: 'playlist', trackId };
            }
          }

          let order = getPlaylistOrder(data);
          if (!order.includes(trackId)) {
            order = [trackId, ...order];
          }
          let setup = graphStore.audioSetup;
          setup = setPlaylistOrder(setup, order);
          setup = setPrimarySource(setup, primaryPl);
          const idx = order.indexOf(trackId);
          setup = setPlaylistCurrentIndex(setup, idx >= 0 ? idx : 0);
          const newPrimaryId = getPrimaryFileId(setup);
          setup = retargetBandsToPrimary(setup, prevPrimaryId, newPrimaryId);
          graphStore.setAudioSetup(setup);
          runtimeDispatcher?.setAudioSetup(setup, { autoPlayWhenReady: true });
        }}
        onAudioFileSelected={async (nodeId, file) => {
          let setup = graphStore.audioSetup;
          let targetFileId: string | undefined = nodeId === 'primary' ? (getPrimaryFileId(setup) ?? undefined) : nodeId;
          if (setup.files.length === 0) {
            const newFile = {
              id: `file-${generateUUID()}`,
              name: file.name.replace(/\.[^/.]+$/, '') || file.name,
              filePath: file.name,
              autoPlay: false,
            };
            setup = addAudioFile(setup, newFile);
            setup = setPrimarySource(setup, { type: 'upload', file: newFile });
            graphStore.setAudioSetup(setup);
            targetFileId = newFile.id;
          }
          if (!targetFileId) return;
          const am = runtimeManager?.getAudioManager();
          if (am) await am.loadAudioFile(targetFileId, file);
          graphStore.setAudioSetup(
            updateAudioFile(graphStore.audioSetup, targetFileId, (f) => ({
              ...f,
              filePath: file.name,
              name: file.name.replace(/\.[^/.]+$/, '') || file.name,
            }))
          );
          // Sync timeline duration from primary audio when the loaded file is the primary track
          const primaryFileId = getPrimaryFileId(graphStore.audioSetup);
          if (primaryFileId != null && targetFileId === primaryFileId && runtimeManager) {
            const globalState = runtimeManager.getGlobalAudioState();
            if (globalState != null && globalState.duration > 0) {
              const updated = setAutomationDuration(graphStore.graph, globalState.duration);
              graphStore.setGraph(updated);
              await runtimeDispatcher?.loadGraph(updated);
            }
          }
        }}
        audiotoolRpcClient={atConn.session}
        audiotoolUserName={atConn.session?.userName ?? null}
        onAudiotoolSessionInvalidated={handleAudiotoolSessionRpcInvalidated}
      />
    {/snippet}
  </NodeEditorLayout>

  <NodeRightClickMenu
    bind:this={nodeRightClickMenuRef}
    onReadGuide={(_nodeId, nodeType) => {
      openHelpForNodeType(nodeType);
    }}
    onCopyNodeName={(nodeType) => navigator.clipboard.writeText(nodeType).catch(() => {})}
    onResetParameters={(nodeId, nodeType) => {
      const spec = nodeSpecsMap.get(nodeType);
      if (!spec) return;
      graphStore.resetNodeParametersToDefaults(nodeId, spec.parameters);
      void runtimeManager?.setGraph(graphStore.graph);
      canvasApi?.requestRender();
    }}
    onRemove={(nodeId) => {
      const gpu = runtimeManager?.getExportRasterBackend();
      const connectionValidation =
        gpu === 'webgpu' ? ({ exclusiveRasterGpu: 'webgpu' } as const) : undefined;
      graphStore.removeNode(nodeId, toValidationSpecs(nodeSpecs), connectionValidation);
      runtimeManager?.setGraph(graphStore.graph);
      canvasApi?.requestRender();
    }}
  />

  <HelpCallout
    visible={helpVisible}
    screenX={helpScreenX}
    screenY={helpScreenY}
    positionMode={helpPositionMode}
    content={helpContent}
    helpMode={helpMode}
    helpNodeType={helpNodeType}
    nodeSpecs={nodeSpecsMap}
    onClose={() => {
      helpVisible = false;
      helpNodeType = undefined;
      helpContent = null;
      helpMode = 'node';
    }}
    onPositionChange={(x, y) => {
      helpScreenX = x;
      helpScreenY = y;
      setStoredPosition('help-panel', x, y);
    }}
  />

  <ColorPickerPopover
    visible={canvasColorPickerVisible}
    x={canvasColorPickerX}
    y={canvasColorPickerY}
    value={canvasColorPickerValue}
    onChange={(l, c, h) => {
      canvasColorPickerValue = { l, c, h };
      canvasColorPickerOnApply?.(l, c, h);
    }}
    onClose={() => {
      canvasColorPickerVisible = false;
      canvasColorPickerOnApply = null;
    }}
  />

  <EditorParameterValueOverlay
    visible={parameterValueOverlayVisible}
    x={parameterValueOverlayX}
    y={parameterValueOverlayY}
    width={parameterValueOverlayWidth}
    height={parameterValueOverlayHeight}
    value={parameterValueOverlayValue}
    paramType={parameterValueOverlayParamType}
    onCommit={(value) => {
      parameterValueOverlayOnCommit?.(value);
      parameterValueOverlayVisible = false;
      parameterValueOverlayOnCommit = null;
      parameterValueOverlayOnCancel = null;
    }}
    onCancel={() => {
      parameterValueOverlayOnCancel?.();
      parameterValueOverlayVisible = false;
      parameterValueOverlayOnCommit = null;
      parameterValueOverlayOnCancel = null;
    }}
  />

  <EditorLabelEditOverlay
    visible={labelEditOverlayVisible}
    x={labelEditOverlayX}
    y={labelEditOverlayY}
    minWidth={labelEditOverlayMinWidth}
    label={labelEditOverlayLabel}
    onCommit={(label) => {
      labelEditOverlayOnCommit?.(label);
      labelEditOverlayVisible = false;
      labelEditOverlayOnCommit = null;
      labelEditOverlayOnCancel = null;
    }}
    onCancel={() => {
      labelEditOverlayOnCancel?.();
      labelEditOverlayVisible = false;
      labelEditOverlayOnCommit = null;
      labelEditOverlayOnCancel = null;
    }}
  />

  <DropdownMenu bind:this={canvasEnumDropdownRef} class="canvas-enum-dropdown" />

  <TimelinePanelFloatingShell
    open={timelinePanelOpen}
    x={timelinePanelX}
    y={timelinePanelY}
    onPositionChange={(x, y) => {
      timelinePanelX = x;
      timelinePanelY = y;
      setStoredPosition('timeline-panel', x, y);
    }}
    onClose={() => {
      timelinePanelOpen = false;
    }}
    curveSlotActive={curveEditorLaneId != null && curveEditorRegionId != null}
    timelineSlot={timelinePanelSnippet}
    curveSlot={curveEditorSlotSnippet}
  />

  <AudioSignalPicker
    open={signalPickerVisible}
    xLarge={signalPickerXLarge}
    yLarge={signalPickerYLarge}
    xCompact={signalPickerXCompact}
    yCompact={signalPickerYCompact}
    onPositionChangeLarge={(x, y) => {
      signalPickerXLarge = x;
      signalPickerYLarge = y;
      setStoredPosition('audio-signal-picker', x, y, 'large');
    }}
    onPositionChangeCompact={(x, y) => {
      signalPickerXCompact = x;
      signalPickerYCompact = y;
      setStoredPosition('audio-signal-picker', x, y, 'compact');
    }}
    targetNodeId={signalPickerTargetNodeId}
    targetParameter={signalPickerTargetParameter}
    triggerElement={signalPickerTriggerElement}
    graph={graphStore.graph}
    audioSetup={graphStore.audioSetup}
    nodeSpecs={nodeSpecsMap}
    browseOnly={signalPickerBrowseMode}
    getAudioManager={() => runtimeManager?.getAudioManager() ?? null}
    onSelect={(payload) => {
      signalPickerOnSelect?.(payload);
      if (payload.type === 'set-connection-disabled') {
        return;
      }
      if (signalPickerTriggerElement) {
        signalPickerTriggerElement.focus();
      }
      signalPickerVisible = false;
      signalPickerOnSelect = null;
      signalPickerTriggerElement = null;
      signalPickerBrowseMode = false;
    }}
    onClose={() => {
      if (signalPickerTriggerElement) {
        signalPickerTriggerElement.focus();
      }
      signalPickerVisible = false;
      signalPickerOnSelect = null;
      signalPickerTriggerElement = null;
      signalPickerBrowseMode = false;
    }}
    onAudioSetupChange={(setup) => {
      graphStore.setAudioSetup(setup);
      runtimeDispatcher?.setAudioSetup(setup);
    }}
  />
</div>

<style>
  .leave-save-blocked-footer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--pd-sm);
    justify-content: flex-end;
    width: 100%;
  }

  .leave-save-blocked-copy {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--print-soft);
  }

  :global(.leave-save-blocked-body) {
    min-height: unset;
  }
</style>
