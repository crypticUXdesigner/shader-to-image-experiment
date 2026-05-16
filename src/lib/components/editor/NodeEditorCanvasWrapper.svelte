<script lang="ts">
  /**
   * NodeEditorCanvasWrapper
   *
   * Thin Svelte wrapper for vanilla NodeEditorCanvas. Syncs graph from store,
   * forwards canvas events to store/parent, and exposes canvas methods for parent.
   *
   * Undo/copy-paste: parent owns them; wrapper only forwards events.
   */

  import { onMount, untrack } from 'svelte';
  import { NodeEditorCanvas, CopyPasteManager } from '../../../ui/editor';
  import {
    addNodes,
    addConnections,
    updateViewState,
    addConnectionWithValidation,
    insertNodeIntoConnection,
    type AddConnectionWithValidationResult,
    type NodeSpecification,
    type InsertNodeIntoConnectionErrorCode,
    type ConnectionValidationContext,
  } from '../../../data-model';
  import { wheelNonPassive } from '../../actions/wheelPassive';
  import type { NodeGraph, Connection, NodeInstance, ParameterValue, GraphUndoRecordingOptions } from '../../../data-model/types';
  import type { NodeSpec, ParameterInputMode } from '../../../types/nodeSpec';
  import type { RenderBackendSelected } from '../../../runtime/renderBackends/renderBackendTypes';
  import { graphStore } from '../../stores';
  import { appToastStore } from '../../stores/appToastStore';
  import { firstUnsupportedWebGpuMvpNodeType } from '../../utils/webGpuMvpNodeSupport';
  import { getVirtualNodeIdsFromAudioSetup } from '../../../utils/virtualNodes';
  import { hasPaletteNodeMime, readPaletteNodeType } from '../../../utils/paletteNodeDrag';
  import DomNodeLayer from './DomNodeLayer.svelte';
  import AddNodePicker from './AddNodePicker.svelte';
  import type {
    NodeEditorCanvasWrapperCallbacks,
    NodeEditorCanvasWrapperAPI
  } from './NodeEditorCanvasWrapper.types';
  import { syncCanvasAfterParameterStoreUpdateThenRuntime } from './parameterChangeSync';

  interface Props {
    nodeSpecs: NodeSpec[];
    graph: NodeGraph;
    callbacks?: NodeEditorCanvasWrapperCallbacks;
    api?: NodeEditorCanvasWrapperAPI | null;
    overlayBridge?: import('../../../types/editor').CanvasOverlayBridge | null;
    /** Current timeline time for automation-driven parameter display. */
    getTimelineCurrentTime?: () => number;
    /** Timeline state for the dirty-runner (mark automation nodes dirty when playing). */
    getTimelineState?: () => import('../../../runtime/types').TimelineState | null;
    /** Same exclusive raster API as preview/export — drives WebGPU-only wire validation. */
    getExclusiveRasterGpu?: () => RenderBackendSelected | null;
    /**
     * When false (e.g. fullscreen preview), skip idle DomNodeLayer view-state polling.
     * Final canvas view is flushed once when hidden; one catch-up sync runs when visible again.
     */
    editorSurfaceVisible?: boolean;
  }

  let {
    nodeSpecs,
    graph,
    callbacks = {},
    api: apiProp = $bindable(null as NodeEditorCanvasWrapperAPI | null),
    overlayBridge = null,
    getTimelineCurrentTime,
    getTimelineState,
    getExclusiveRasterGpu,
    editorSurfaceVisible = true,
  }: Props = $props();

  const copyPasteManager = new CopyPasteManager();
  let containerEl = $state<HTMLDivElement | null>(null);
  let wrapperEl = $state<HTMLDivElement | null>(null);
  let canvasInstance = $state<NodeEditorCanvas | null>(null);
  let liveViewState = $state({ zoom: 1, panX: 0, panY: 0, selectedNodeIds: [] as string[] });
  /** When true, the next graph-prop sync skips `preserveViewState` apply (undo/redo uses `completeGraphHistoryRestore`). */
  let skipNextGraphPropApply = $state(false);
  const activeTool = $derived(graphStore.activeTool);
  /** Read via `$derived` so `$effect` re-runs when picks change (plain `graphStore.*` getters do not subscribe inside `$effect`). */
  const patchWireConnectionId = $derived(graphStore.patchWireConnectionId);
  const patchInsertNodeId = $derived(graphStore.patchInsertNodeId);
  const isSpacebarPressed = $derived(graphStore.isSpacebarPressed);
  /** Hand tool active = toolbar selection OR spacebar held */
  const effectiveHandTool = $derived(activeTool === 'hand' || isSpacebarPressed);
  let isHandPanning = $state(false);

  let addNodePickerOpen = $state(false);
  let addNodePickerScreen = $state({ x: 0, y: 0 });
  let addNodePendingCanvas = $state({ x: 0, y: 0 });

  /** Brief entrance motion for palette / add-picker placed nodes (DomNodeLayer). */
  let landedNodeId = $state<string | null>(null);
  let landedClearTimer: ReturnType<typeof setTimeout> | null = null;
  let paletteDragHighlight = $state(false);

  function flashLandedNode(id: string): void {
    if (landedClearTimer) clearTimeout(landedClearTimer);
    landedNodeId = id;
    landedClearTimer = setTimeout(() => {
      landedNodeId = null;
      landedClearTimer = null;
    }, 320);
  }

  function handleWrapperPaletteDragEnter(e: DragEvent): void {
    if (!hasPaletteNodeMime(e.dataTransfer)) return;
    e.preventDefault();
    paletteDragHighlight = true;
  }

  function handleWrapperPaletteDragLeave(e: DragEvent): void {
    if (!hasPaletteNodeMime(e.dataTransfer)) return;
    const related = e.relatedTarget as Node | null;
    if (related && wrapperEl?.contains(related)) return;
    paletteDragHighlight = false;
  }

  function handleWrapperPaletteDragOver(e: DragEvent): void {
    if (!hasPaletteNodeMime(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  }

  function handleWrapperPaletteDrop(e: DragEvent): void {
    if (!hasPaletteNodeMime(e.dataTransfer)) return;
    e.preventDefault();
    paletteDragHighlight = false;
    const nodeType = readPaletteNodeType(e.dataTransfer);
    if (!nodeType || !apiProp?.screenToCanvas || !apiProp.addNode) return;
    if (webGpuSessionBlocksUnsupportedNodeTypes([nodeType])) return;
    const pos = apiProp.screenToCanvas(e.clientX, e.clientY);
    apiProp.addNode(nodeType, pos.x, pos.y);
  }

  /** Palette drag cancelled or finished outside the editor — clear drop highlight. */
  onMount(() => {
    const onWindowDragEnd = () => {
      paletteDragHighlight = false;
    };
    window.addEventListener('dragend', onWindowDragEnd);
    return () => window.removeEventListener('dragend', onWindowDragEnd);
  });

  function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  function toNodeSpecifications(specs: NodeSpec[]): NodeSpecification[] {
    return specs.map((spec) => ({
      id: spec.id,
      inputs: spec.inputs?.map((i) => ({ name: i.name, type: i.type })),
      outputs: spec.outputs?.map((o) => ({ name: o.name, type: o.type })),
      parameters: Object.fromEntries(
        Object.entries(spec.parameters ?? {}).map(([key, p]) => [
          key,
          {
            type: p.type,
            default: p.default,
            min: p.min,
            max: p.max,
          },
        ])
      ),
    }));
  }

  function webGpuSessionBlocksUnsupportedNodeTypes(nodeTypes: readonly string[]): boolean {
    if (getExclusiveRasterGpu?.() !== 'webgpu') return false;
    const bad = firstUnsupportedWebGpuMvpNodeType(nodeTypes);
    if (bad == null) return false;
    appToastStore.addToast({
      variant: 'error',
      message: `WebGPU preview does not support this node yet (${bad}). Add ?renderBackend=webgl to the URL and reload, or pick a different node.`,
      source: 'webgpu-node-guard',
    });
    return true;
  }

  function webGpuConnectionValidation(): ConnectionValidationContext | undefined {
    const sel = getExclusiveRasterGpu?.() ?? null;
    if (sel === 'webgpu') return { exclusiveRasterGpu: 'webgpu' };
    return undefined;
  }

  function optionsForNewConnection(): { connectionValidation?: ConnectionValidationContext } {
    const v = webGpuConnectionValidation();
    return v ? { connectionValidation: v } : {};
  }

  function applyAddConnectionResult(result: AddConnectionWithValidationResult): void {
    if (result.errors.length > 0) {
      appToastStore.addToast({
        variant: 'error',
        message: result.errors[0] ?? 'Could not create connection.',
        source: 'connection-validation',
      });
      return;
    }
    // If an existing connection was replaced, notify the callback.
    if (result.replacedConnectionId) {
      callbacks.onConnectionRemoved?.(result.replacedConnectionId);
    }
    graphStore.setGraph(result.graph);
    notifyGraphChanged();
  }

  function buildApi(
    canvas: NodeEditorCanvas,
    addNodeFn: (nodeType: string, x: number, y: number) => NodeInstance | null,
    nodeSpecsMap: Map<string, NodeSpec>
  ): NodeEditorCanvasWrapperAPI {
    return {
      requestRender: () => canvas.requestRender(),
      fitToView: () => canvas.fitToView(),
      focusNode: (nodeId, options) => {
        canvas.focusNode(nodeId, options);
        const vs = canvas.getViewState();
        liveViewState = {
          panX: vs.panX,
          panY: vs.panY,
          zoom: vs.zoom,
          selectedNodeIds: [...vs.selectedNodeIds],
        };
        graphStore.updateViewState({
          panX: vs.panX,
          panY: vs.panY,
          zoom: vs.zoom,
          selectedNodeIds: [...vs.selectedNodeIds],
        });
        callbacks.onSelectionChanged?.([...vs.selectedNodeIds]);
      },
      handleWheel: (e) => canvas.handleWheel(e),
      forwardMouseDown: (e) => canvas.handleMouseDownFromOverlay(e),
      hitTestConnection: (sx, sy) => canvas.hitTestConnectionAtScreen(sx, sy),
      setZoom: (zoom, cx, cy) => canvas.setZoom(zoom, cx, cy),
      getViewState: () => canvas.getViewState(),
      setActiveTool: (tool) => canvas.setActiveTool(tool),
      setAudioManager: (am) => canvas.setAudioManager(am),
      getAudioManager: () => canvas.getAudioManager(),
      setSpacebarStateChangeCallback: (cb) => canvas.setSpacebarStateChangeCallback(cb),
      screenToCanvas: (sx, sy) => (canvas as unknown as { screenToCanvas(x: number, y: number): { x: number; y: number } }).screenToCanvas(sx, sy),
      getCanvasCenterInScreen: () => {
        const canvasEl = (canvas as unknown as { canvas: HTMLCanvasElement }).canvas;
        if (!canvasEl) return { x: 0, y: 0 };
        const r = canvasEl.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
      render: () => canvas.render(),
      addNode: addNodeFn,
      getNodeMetrics: (nodeId) => {
        const cached = canvas.getNodeMetrics().get(nodeId);
        if (cached) return cached;
        const node = graphStore.graph.nodes.find((n) => n.id === nodeId);
        if (!node) return undefined;
        const spec = nodeSpecsMap.get(node.type);
        if (!spec) return undefined;
        return canvas.getNodeRenderer().calculateMetrics(node, spec);
      },
      isNodeVisible: (node, metrics) => canvas.isNodeVisible(node, metrics),
      startConnectionFromPort: (sx, sy) => canvas.startConnectionFromPort(sx, sy),
      beginGraphHistoryRestore: () => {
        skipNextGraphPropApply = true;
      },
      completeGraphHistoryRestore: (g: NodeGraph) => {
        const c = canvasInstance;
        if (!c) return;
        c.setGraph(g, { preserveViewState: false });
        const vs = c.getViewState();
        liveViewState = {
          panX: vs.panX,
          panY: vs.panY,
          zoom: vs.zoom,
          selectedNodeIds: [...vs.selectedNodeIds],
        };
        c.requestRender();
      },
    };
  }

  function notifyGraphChanged(): void {
    callbacks.onGraphChanged?.(graphStore.graph);
  }

  const PATCH_SUCCESS = "Nice. Patching done.";

  function mapPatchError(code: InsertNodeIntoConnectionErrorCode): string {
    switch (code) {
      case 'no_valid_ports':
        return 'No matching port types.';
      case 'cannot_patch_endpoint_node':
        return 'Can not patch this.';
      case 'connection_not_found':
        return 'Where is the cable?';
      case 'insert_node_not_found':
        return 'Where is the node?';
      case 'connection_validation_failed':
        return 'WebGPU preview blocked this patch.';
      default:
        return "Patching not possible.";
    }
  }

  /** Double-click node body → Patch tool with node chosen; next click on a cable commits (or Esc). */
  function beginPatchIntoFromNodeDoubleClick(nodeId: string): void {
    graphStore.setActiveTool('patch');
    graphStore.setPatchInsertNodePick(nodeId);
    graphStore.setPatchWirePick(null);
    apiProp?.setActiveTool?.('patch');
    graphStore.updateViewState({ selectedNodeIds: [nodeId] });
    liveViewState = {
      ...liveViewState,
      selectedNodeIds: [nodeId],
    };
    canvasInstance?.setSelectionFromDOM?.([nodeId]);
    canvasInstance?.requestRender?.();
    callbacks.onSelectionChanged?.([nodeId]);
  }

  /** Exit Patch tool: Cursor, clear picks, dismiss prompt toast. */
  function exitPatchMode(): void {
    canvasInstance?.clearConnectionSelectionFromDOM?.();
    graphStore.clearPatchPicks();
    graphStore.setActiveTool('cursor');
    apiProp?.setActiveTool?.('cursor');
    appToastStore.dismissBySource('patch-tool');
  }

  function tryCommitPatch(connectionId: string, insertNodeId: string): void {
    const specs = toNodeSpecifications(nodeSpecs);
    const gpuCtx = webGpuConnectionValidation();
    const result = insertNodeIntoConnection(
      graphStore.graph,
      connectionId,
      insertNodeId,
      specs,
      gpuCtx ? { connectionValidation: gpuCtx } : undefined
    );
    if (!result.ok) {
      appToastStore.addToast({
        variant: 'error',
        message: result.detail ?? mapPatchError(result.code),
        source: 'patch-commit',
      });
      return;
    }
    graphStore.setGraph(result.graph);
    notifyGraphChanged();
    canvasInstance?.requestRender?.();
    callbacks.onSelectionChanged?.(graphStore.viewState.selectedNodeIds ?? []);
    exitPatchMode();
    appToastStore.addToast({
      variant: 'success',
      message: PATCH_SUCCESS,
      source: 'patch-success',
    });
  }

  function onPatchWireChosen(connectionId: string): void {
    const nodePick = graphStore.patchInsertNodeId;
    if (nodePick) {
      tryCommitPatch(connectionId, nodePick);
    } else {
      graphStore.setPatchWirePick(connectionId);
      canvasInstance?.setConnectionSelectionFromDOM?.(connectionId);
      if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
      canvasInstance?.requestRender?.();
      callbacks.onSelectionChanged?.([]);
    }
  }

  function onPatchNodeChosen(nodeId: string): void {
    const wireId = graphStore.patchWireConnectionId;
    if (wireId) {
      tryCommitPatch(wireId, nodeId);
    } else {
      graphStore.setPatchInsertNodePick(nodeId);
      graphStore.updateViewState({ selectedNodeIds: [nodeId] });
      liveViewState = {
        ...liveViewState,
        selectedNodeIds: [nodeId],
      };
      canvasInstance?.setSelectionFromDOM?.([nodeId]);
      canvasInstance?.requestRender?.();
      callbacks.onSelectionChanged?.([nodeId]);
    }
  }

  /** Prompt copy for patch mode from wire/node picks; empty when not in patch tool. */
  const patchToolPromptMessage = $derived.by(() => {
    if (activeTool !== 'patch') return '';
    const wire = patchWireConnectionId;
    const node = patchInsertNodeId;
    if (wire != null && node == null) return 'Click a node...';
    if (wire == null && node != null) return 'Select the cable...';
    return 'Click a cable or node...';
  });

  /** Dedupes imperative toast updates (plain let avoids effect reading/writing same `$state`). */
  let lastSyncedPatchToolToastMessage = '';

  /** Keeps bottom prompt text in sync with wire/node picks (one persistent toast, source patch-tool). */
  $effect(() => {
    const tool = activeTool;
    const msg = patchToolPromptMessage;
    if (tool !== 'patch') {
      lastSyncedPatchToolToastMessage = '';
      appToastStore.dismissBySource('patch-tool');
      return;
    }
    if (msg === lastSyncedPatchToolToastMessage) return;
    lastSyncedPatchToolToastMessage = msg;

    appToastStore.dismissBySource('patch-tool');
    appToastStore.addToast({
      variant: 'info',
      message: msg,
      source: 'patch-tool',
      noAutoDismiss: true,
      dismissKeycaps: [
        { text: 'Esc', title: 'Exit patch mode' },
        { text: 'Right-click', title: 'Exit patch mode' },
      ],
    });
  });

  $effect(() => {
    if (activeTool !== 'patch') return;
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        exitPatchMode();
      }
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
      exitPatchMode();
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  });

  /** Popover treats canvas clicks as “outside”; Alt+click / Add-tool click already moves the picker on mousedown — skip the following click so it doesn’t close. */
  function canCloseAddNodePickerOnOutsideClick(e: MouseEvent): boolean {
    const t = e.target;
    if (!(t instanceof Node)) return true;
    const canvas = containerEl?.querySelector('canvas');
    if (!canvas || !(canvas === t || canvas.contains(t))) return true;
    const tool = graphStore.activeTool;
    if (tool === 'add') return false;
    if (tool === 'cursor' && e.altKey) return false;
    return true;
  }

  /** Show signal picker when param port is clicked (DOM nodes capture pointer events, so canvas never receives port clicks). */
  function handlePortClickForSignalPicker(
    screenX: number,
    screenY: number,
    targetNodeId: string,
    targetParameter: string,
    triggerElement?: HTMLElement | null
  ): void {
    if (graphStore.activeTool === 'patch') return;
    if (!overlayBridge) return;
    const validationSpecs = toNodeSpecifications(nodeSpecs);
    const onSelect = (payload: import('../../../types/editor').SignalSelectPayload) => {
      if (payload.type === 'graph' && payload.nodeId != null && payload.port != null) {
        const conn: Connection = {
          id: generateId('conn'),
          sourceNodeId: payload.nodeId,
          sourcePort: payload.port,
          targetNodeId,
          targetPort: undefined,
          targetParameter,
        };
        const result = addConnectionWithValidation(graphStore.graph, conn, validationSpecs, optionsForNewConnection());
        if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
        applyAddConnectionResult(result);
      } else if (payload.type === 'audio' && payload.virtualNodeId != null) {
        const conn: Connection = {
          id: generateId('conn'),
          sourceNodeId: payload.virtualNodeId,
          sourcePort: 'out',
          targetNodeId,
          targetPort: undefined,
          targetParameter,
        };
        const result = addConnectionWithValidation(graphStore.graph, conn, validationSpecs, optionsForNewConnection());
        if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
        applyAddConnectionResult(result);
      } else if (payload.type === 'disconnect' && payload.connectionId != null) {
        if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
        graphStore.removeConnection(payload.connectionId);
        callbacks.onConnectionRemoved?.(payload.connectionId);
        notifyGraphChanged();
      } else if (
        payload.type === 'set-connection-disabled' &&
        payload.connectionId != null &&
        payload.disabled != null
      ) {
        if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
        graphStore.setConnectionDisabled(payload.connectionId, payload.disabled);
        notifyGraphChanged();
      }
      canvasInstance?.requestRender?.();
    };
    overlayBridge.showSignalPicker(screenX, screenY + 8, targetNodeId, targetParameter, onSelect, triggerElement);
  }

  function syncViewStateFromCanvas(canvas: NodeEditorCanvas): void {
    const vs = canvas.getViewState();
    graphStore.updateViewState({
      zoom: vs.zoom,
      panX: vs.panX,
      panY: vs.panY,
      selectedNodeIds: vs.selectedNodeIds
    });
  }

  /** Copy canvas view state into `liveViewState` (DomNodeLayer) without touching the graph store. */
  function flushLiveViewStateFromApi(api: NodeEditorCanvasWrapperAPI): void {
    const vs = api.getViewState();
    const ids = vs.selectedNodeIds ?? [];
    liveViewState = {
      panX: vs.panX,
      panY: vs.panY,
      zoom: vs.zoom,
      selectedNodeIds: [...ids],
    };
  }

  async function handleParameterChange(
    nodeId: string,
    paramName: string,
    value: ParameterValue,
    canvas: NodeEditorCanvas | null,
    options?: GraphUndoRecordingOptions
  ): Promise<void> {
    graphStore.updateNodeParameter(nodeId, paramName, value, options);
    await syncCanvasAfterParameterStoreUpdateThenRuntime({
      canvas,
      getGraph: () => graphStore.graph,
      syncViewStateFromCanvas,
      notifyRuntimeParameterChanged: () =>
        callbacks.onParameterChanged?.(nodeId, paramName, value, graphStore.graph),
      notifyGraphChanged,
    });
  }

  // View state sync from canvas (for DOM layer transform)
  // Only update when pan/zoom/selection actually change to avoid unnecessary Svelte re-renders.
  // PERF: Throttle tick to ~30 fps (VIEW_STATE_SYNC_INTERVAL_MS) so we don't run RAF every frame
  // when idle or during pan/zoom; selection changes still update liveViewState on the next tick.
  // When pan/zoom stop, apply final state once (wasChanging/skippedLast) so DomNodeLayer is not left behind.
  const VIEW_STATE_SYNC_INTERVAL_MS = 33;
  /** During pan/zoom-only, update liveViewState every N ticks. N=1 keeps DOM in sync with canvas (connections) for visual continuity; N>1 would throttle DOM more but caused connections to lag behind nodes. */
  const PAN_ZOOM_UPDATE_EVERY_N_FRAMES = 1;
  $effect(() => {
    const api = apiProp;
    const surfaceVisible = editorSurfaceVisible;
    if (!api) return;

    if (!surfaceVisible) {
      flushLiveViewStateFromApi(api);
      return;
    }

    flushLiveViewStateFromApi(api);

    let rafId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let lastRunTime = 0;
    let frameCount = 0;
    let wasChanging = false;
    let skippedLast = false;
    function tick() {
      if (!api) return;
      const now = performance.now();
      const elapsed = lastRunTime === 0 ? VIEW_STATE_SYNC_INTERVAL_MS : now - lastRunTime;
      if (elapsed < VIEW_STATE_SYNC_INTERVAL_MS && lastRunTime !== 0) {
        timeoutId = setTimeout(() => {
          timeoutId = undefined;
          rafId = requestAnimationFrame(tick);
        }, VIEW_STATE_SYNC_INTERVAL_MS - elapsed);
        return;
      }
      lastRunTime = now;

      const vs = api.getViewState();
      const ids = vs.selectedNodeIds ?? [];
      const prev = liveViewState;
      const idsChanged =
        prev.selectedNodeIds.length !== ids.length ||
        ids.some((id, i) => prev.selectedNodeIds[i] !== id);
      const viewChanged =
        prev.panX !== vs.panX || prev.panY !== vs.panY || prev.zoom !== vs.zoom || idsChanged;
      if (viewChanged) {
        wasChanging = true;
        frameCount++;
        const onlyPanZoom = !idsChanged;
        const shouldUpdate = onlyPanZoom
          ? frameCount % PAN_ZOOM_UPDATE_EVERY_N_FRAMES === 0
          : true;
        if (shouldUpdate) {
          liveViewState = {
            panX: vs.panX,
            panY: vs.panY,
            zoom: vs.zoom,
            selectedNodeIds: ids
          };
          skippedLast = false;
        } else {
          skippedLast = onlyPanZoom;
        }
      } else {
        if (wasChanging && skippedLast) {
          liveViewState = {
            panX: vs.panX,
            panY: vs.panY,
            zoom: vs.zoom,
            selectedNodeIds: ids
          };
        }
        wasChanging = false;
        skippedLast = false;
      }

      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = undefined;
      }
      if (viewChanged && idsChanged) {
        rafId = requestAnimationFrame(tick);
      } else {
        timeoutId = setTimeout(() => {
          timeoutId = undefined;
          rafId = requestAnimationFrame(tick);
        }, VIEW_STATE_SYNC_INTERVAL_MS);
      }
    }
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  });

  // Canvas creation: only depend on container and specs. Do NOT track graph - otherwise
  // clicking background to pan (which deselects nodes and updates graph) would destroy
  // and recreate the canvas, losing the pan state.
  $effect(() => {
    const container = containerEl;
    const specs = nodeSpecs;
    if (!container || !specs.length) return;

    const g = untrack(() => graph);

    const nodeSpecsMap = new Map<string, NodeSpec>();
    for (const spec of specs) {
      nodeSpecsMap.set(spec.id, spec);
    }
    const validationSpecs = toNodeSpecifications(specs);

    const canvasEl = document.createElement('canvas');
    canvasEl.tabIndex = 0;
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.style.display = 'block';
    canvasEl.style.outline = 'none';
    container.appendChild(canvasEl);

    const paramConnectionsOverlayEl = document.createElement('canvas');
    paramConnectionsOverlayEl.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; display: block;';
    paramConnectionsOverlayEl.setAttribute('aria-hidden', 'true');
    const topOverlayEl = document.createElement('canvas');
    topOverlayEl.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; display: block;';
    topOverlayEl.setAttribute('aria-hidden', 'true');
    const overlayContainer = document.createElement('div');
    overlayContainer.style.cssText = 'position: absolute; inset: 0; z-index: 2; pointer-events: none;';
    overlayContainer.appendChild(paramConnectionsOverlayEl);
    overlayContainer.appendChild(topOverlayEl);
    container.parentElement?.appendChild(overlayContainer);

    const canvas = new NodeEditorCanvas(
      canvasEl,
      g,
      specs,
      undefined,
      overlayBridge ?? undefined,
      () => new Set(getVirtualNodeIdsFromAudioSetup(graphStore.audioSetup)),
      getTimelineState
    );
    canvas.setParameterConnectionsOverlay(paramConnectionsOverlayEl);
    canvas.setTopOverlayCanvas(topOverlayEl);
    // Use wrapper rect for param port screen→canvas so connection endpoints align with DOM nodes
    canvas.setConnectionRectProvider(() => container.parentElement?.getBoundingClientRect() ?? null);
    canvasInstance = canvas;

    canvas.setCallbacks({
      onNodeMoved: (nodeId, x, y) => {
        const node = graphStore.graph.nodes.find((n: NodeInstance) => n.id === nodeId);
        if (node) {
          graphStore.updateNodePosition(nodeId, { x, y });
          syncViewStateFromCanvas(canvas);
          notifyGraphChanged();
        }
      },
      onNodeSelected: (nodeId, multiSelect) => {
        if (multiSelect) {
          // For marquee selection, canvas already has correct selection - sync from it
          syncViewStateFromCanvas(canvas);
          const ids = canvas.getViewState().selectedNodeIds;
          // Update liveViewState immediately so DomNodeLayer shows selection without waiting for sync loop
          liveViewState = { ...liveViewState, selectedNodeIds: ids };
          callbacks.onSelectionChanged?.(ids);
          return;
        }
        const currentSelectedIds = graphStore.viewState.selectedNodeIds ?? [];
        const newSelectedIds =
          nodeId && currentSelectedIds.length === 1 && currentSelectedIds[0] === nodeId
            ? []
            : nodeId
              ? [nodeId]
              : [];
        graphStore.updateViewState({ selectedNodeIds: newSelectedIds });
        syncViewStateFromCanvas(canvas);
        callbacks.onSelectionChanged?.(newSelectedIds);
      },
      onConnectionCreated: (sourceNodeId, sourcePort, targetNodeId, targetPort?, targetParameter?) => {
        const conn: Connection = {
          id: generateId('conn'),
          sourceNodeId,
          sourcePort,
          targetNodeId,
          targetPort,
          targetParameter,
        };
        const result = addConnectionWithValidation(graphStore.graph, conn, validationSpecs, optionsForNewConnection());
        syncViewStateFromCanvas(canvas);
        applyAddConnectionResult(result);
      },
      onConnectionSelected: () => {},
      onNodeDeleted: (nodeId) => {
        syncViewStateFromCanvas(canvas);
        graphStore.removeNode(nodeId, validationSpecs, webGpuConnectionValidation());
        notifyGraphChanged();
      },
      onConnectionDeleted: (connectionId) => {
        syncViewStateFromCanvas(canvas);
        graphStore.removeConnection(connectionId);
        callbacks.onConnectionRemoved?.(connectionId);
        notifyGraphChanged();
      },
      onParameterChanged: (nodeId, paramName, value, opts) => {
        void handleParameterChange(nodeId, paramName, value, canvas, opts);
      },
      onParameterGestureCommit: () => {
        graphStore.recordUndoSnapshot();
      },
      onFileParameterChanged: async (nodeId, paramName, file) => {
        try {
          await callbacks.onFileParameterChanged?.(nodeId, paramName, file);
          syncViewStateFromCanvas(canvas);
          canvas.setGraph(graphStore.graph);
          canvas.render();
        } catch (err) {
          console.error('[NodeEditorCanvasWrapper] onFileParameterChanged error:', err);
          throw err;
        }
      },
      onFileDialogOpen: callbacks.onFileDialogOpen,
      onFileDialogClose: callbacks.onFileDialogClose,
      onParameterInputModeChanged: (nodeId, paramName, mode: ParameterInputMode) => {
        graphStore.updateNodeParameterInputMode(nodeId, paramName, mode);
        syncViewStateFromCanvas(canvas);
        canvas.setGraph(graphStore.graph);
        notifyGraphChanged();
      },
      onNodeLabelChanged: (nodeId, label) => {
        graphStore.updateNodeLabel(nodeId, label);
        syncViewStateFromCanvas(canvas);
        canvas.setGraph(graphStore.graph);
        notifyGraphChanged();
      },
      onTypeLabelClick: () => {},
      onNodeContextMenu: callbacks.onNodeContextMenu,
      onCopySelected: () => {
        const ids = graphStore.graph.viewState?.selectedNodeIds ?? [];
        if (ids.length === 0) return;
        const g = graphStore.graph;
        const nodes = g.nodes.filter((n) => ids.includes(n.id));
        const selectedSet = new Set(ids);
        const connections = g.connections.filter(
          (c) => selectedSet.has(c.sourceNodeId) && selectedSet.has(c.targetNodeId)
        );
        copyPasteManager.copy(nodes, connections);
      },
      onPaste: () => {
        if (!copyPasteManager.hasClipboard()) return;
        const c = canvas as unknown as {
          canvas: HTMLCanvasElement;
          screenToCanvas(sx: number, sy: number): { x: number; y: number };
        };
        const r = c.canvas.getBoundingClientRect();
        const pos = c.screenToCanvas(r.left + r.width / 2, r.top + r.height / 2);
        const data = copyPasteManager.paste(pos.x, pos.y);
        if (!data) return;
        if (webGpuSessionBlocksUnsupportedNodeTypes(data.nodes.map((n) => n.type))) return;
        syncViewStateFromCanvas(canvas);
        let newGraph = addNodes(graphStore.graph, data.nodes);
        newGraph = addConnections(newGraph, data.connections);
        newGraph = updateViewState(newGraph, { selectedNodeIds: data.nodes.map((n) => n.id) });
        graphStore.setGraph(newGraph);
        callbacks.onSelectionChanged?.(data.nodes.map((n) => n.id));
        notifyGraphChanged();
        canvas.requestRender();
      },
      onDuplicateSelected: () => {
        const ids = graphStore.graph.viewState?.selectedNodeIds ?? [];
        if (ids.length === 0) return;
        const g = graphStore.graph;
        const nodes = g.nodes.filter((n) => ids.includes(n.id));
        const selectedSet = new Set(ids);
        const connections = g.connections.filter(
          (c) => selectedSet.has(c.sourceNodeId) && selectedSet.has(c.targetNodeId)
        );
        copyPasteManager.copy(nodes, connections);
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        const metrics = canvas.getNodeMetrics();
        for (const n of nodes) {
          const m = metrics.get(n.id);
          const w = m?.width ?? 0;
          const h = m?.height ?? 0;
          minX = Math.min(minX, n.position.x);
          minY = Math.min(minY, n.position.y);
          maxX = Math.max(maxX, n.position.x + w);
          maxY = Math.max(maxY, n.position.y + h);
        }
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const offset = 24;
        const data = copyPasteManager.paste(centerX + offset, centerY + offset);
        if (!data) return;
        if (webGpuSessionBlocksUnsupportedNodeTypes(data.nodes.map((n) => n.type))) return;
        syncViewStateFromCanvas(canvas);
        let newGraph = addNodes(graphStore.graph, data.nodes);
        newGraph = addConnections(newGraph, data.connections);
        newGraph = updateViewState(newGraph, { selectedNodeIds: data.nodes.map((n) => n.id) });
        graphStore.setGraph(newGraph);
        callbacks.onSelectionChanged?.(data.nodes.map((n) => n.id));
        notifyGraphChanged();
        canvas.requestRender();
      },
      hasClipboard: () => copyPasteManager.hasClipboard(),
      isDialogVisible: callbacks.isDialogVisible,
      onToggleFullscreen: callbacks.onToggleFullscreen,
      onUndo: () => {
        void callbacks.onUndo?.();
      },
      onRedo: () => {
        void callbacks.onRedo?.();
      },
      onRequestAddNodeAtCanvas: (screenX, screenY) => {
        const c = canvas as unknown as { screenToCanvas(sx: number, sy: number): { x: number; y: number } };
        const pos = c.screenToCanvas(screenX, screenY);
        addNodePickerScreen = { x: screenX, y: screenY };
        addNodePendingCanvas = { x: pos.x, y: pos.y };
        addNodePickerOpen = true;
      }
    });

    function addNodeToGraph(nodeType: string, x: number, y: number): NodeInstance | null {
      if (webGpuSessionBlocksUnsupportedNodeTypes([nodeType])) return null;
      const spec = nodeSpecsMap.get(nodeType);
      if (!spec) return null;
      const parameters: Record<string, ParameterValue> = {};
      for (const [paramName, paramSpec] of Object.entries(spec.parameters)) {
        parameters[paramName] = (paramSpec as { default?: ParameterValue }).default as ParameterValue;
      }
      const tempNode: NodeInstance = {
        id: 'temp',
        type: nodeType,
        position: { x: 0, y: 0 },
        parameters
      };
      const metrics = canvas.getNodeRenderer().calculateMetrics(tempNode, spec);
      const adjustedX = x - metrics.width / 2;
      const adjustedY = y - metrics.headerHeight / 2;
      const node: NodeInstance = {
        id: generateId('node'),
        type: nodeType,
        position: { x: adjustedX, y: adjustedY },
        parameters
      };
      syncViewStateFromCanvas(canvas);
      graphStore.addNode(node);
      const finalMetrics = canvas.getNodeRenderer().calculateMetrics(node, spec);
      canvas.getNodeMetrics().set(node.id, finalMetrics);
      canvas.setGraph(graphStore.graph);
      graphStore.updateViewState({ selectedNodeIds: [node.id] });
      liveViewState = { ...liveViewState, selectedNodeIds: [node.id] };
      canvas.setSelectionFromDOM([node.id]);
      callbacks.onSelectionChanged?.([node.id]);
      flashLandedNode(node.id);
      notifyGraphChanged();
      canvas.requestRender();
      return node;
    }

    apiProp = buildApi(canvas, addNodeToGraph, nodeSpecsMap);

    return () => {
      canvas.setConnectionRectProvider(null);
      canvas.setTopOverlayCanvas(null);
      canvas.setParameterConnectionsOverlay(null);
      canvas.destroy();
      overlayContainer.removeChild(topOverlayEl);
      overlayContainer.removeChild(paramConnectionsOverlayEl);
      container.parentElement?.removeChild(overlayContainer);
      container.removeChild(canvasEl);
      canvasInstance = null;
      apiProp = null;
    };
  });

  // Apply graph to canvas when prop changes. preserveViewState: true so reactive updates
  // (e.g. parameter change) don't overwrite pan/zoom with stale graph.viewState from the store.
  $effect(() => {
    const canvas = canvasInstance;
    const g = graph;
    if (!canvas) return;
    if (skipNextGraphPropApply) {
      skipNextGraphPropApply = false;
      return;
    }
    canvas.setGraph(g, { preserveViewState: true });
  });

  // Forward connection clicks from DOM layer to canvas. Parameter connections render over node
  // bodies; DOM nodes capture clicks before the canvas. Capture-phase intercept when on a connection.
  /** Real DOM controls inside a `.node` must own their own pointer/click sequences (e.g. ValueInput double-click). Match the same set Node.svelte exempts from patch-into double-click. */
  const NODE_INTERACTIVE_SELECTOR =
    '.node :is(button, input, textarea, select, .value-input-wrapper, .value-input, .knob, .param-port, [role="textbox"], [role="slider"], .toggle, .bezier-editor, .color-picker-row, .coord-pad, .coord-pad-cell, .remap-range-editor, .frequency-range-editor, .enum-selector-trigger)';
  /** PERF: Subscribe only to wrapper + API identity; read `graphStore.activeTool` / `isSpacebarPressed` inside the handler so tool/space changes do not remove/re-add capture listeners. */
  $effect(() => {
    const wrapper = wrapperEl;
    const api = apiProp;
    if (!wrapper || !api?.hitTestConnection) return;
    const handler = (e: MouseEvent) => {
      if (graphStore.isSpacebarPressed || e.button !== 0) return;
      const tool = graphStore.activeTool;
      const target = e.target;
      if (target instanceof Element && target.closest(NODE_INTERACTIVE_SELECTOR)) {
        return;
      }
      const connId = api.hitTestConnection?.(e.clientX, e.clientY);
      if (connId && tool === 'patch') {
        e.preventDefault();
        e.stopPropagation();
        onPatchWireChosen(connId);
        return;
      }
      if ((tool !== 'cursor' && tool !== 'add') || !api.forwardMouseDown) return;
      if (connId) {
        e.preventDefault();
        e.stopPropagation();
        (e as MouseEvent & { _connectionClickForward?: string })._connectionClickForward = connId;
        api.forwardMouseDown(e);
      }
    };
    wrapper.addEventListener('mousedown', handler, true);
    return () => wrapper.removeEventListener('mousedown', handler, true);
  });

</script>

<div
  bind:this={wrapperEl}
  class="node-editor-canvas-wrapper"
  class:palette-drop-active={paletteDragHighlight}
  style="width: 100%; height: 100%; position: relative; overflow: hidden;"
  use:wheelNonPassive={(e) => apiProp?.handleWheel?.(e)}
  ondragenter={handleWrapperPaletteDragEnter}
  ondragleave={handleWrapperPaletteDragLeave}
  ondragover={handleWrapperPaletteDragOver}
  ondrop={handleWrapperPaletteDrop}
>
  <div
    bind:this={containerEl}
    style="position: absolute; inset: 0; z-index: 0;"
  ></div>
  <!-- Hand tool overlay: captures pointer events over nodes so panning works everywhere -->
  <div
    class="hand-tool-overlay"
    class:active={effectiveHandTool}
    class:panning={isHandPanning}
    role="presentation"
    aria-hidden="true"
    onmousedown={(e) => {
      if (effectiveHandTool && apiProp?.forwardMouseDown) {
        e.preventDefault();
        e.stopPropagation();
        isHandPanning = true;
        const onUp = () => {
          isHandPanning = false;
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mouseup', onUp);
        apiProp.forwardMouseDown(e);
      }
    }}
  ></div>
  <DomNodeLayer
    landedNodeId={landedNodeId}
    patchInsertNodeId={patchInsertNodeId}
    graph={graph}
    nodeSpecs={nodeSpecs}
    audioSetup={graphStore.audioSetup}
    getAudioManager={() => apiProp?.getAudioManager?.() ?? undefined}
    getTimelineCurrentTime={getTimelineCurrentTime}
    overlayBridge={overlayBridge}
    onPortPointerDownForConnection={(sx, sy, pointerId) => apiProp?.startConnectionFromPort?.(sx, sy, pointerId)}
    onPortClickForSignalPicker={handlePortClickForSignalPicker}
    onHeaderPortPointerDown={(sx, sy, pointerId) => apiProp?.startConnectionFromPort?.(sx, sy, pointerId)}
    viewState={{
      zoom: liveViewState.zoom,
      panX: liveViewState.panX,
      panY: liveViewState.panY,
      selectedNodeIds: liveViewState.selectedNodeIds
    }}
    canvasApi={apiProp}
    onNodeMoved={(nodeId, x, y) => {
      // Sync view state before graph update so setGraph (triggered by $effect) doesn't overwrite
      // canvas pan/zoom with stale graph.viewState (e.g. 0,0 when user had panned)
      if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
      graphStore.updateNodePosition(nodeId, { x, y });
      canvasInstance?.requestRender?.();
      notifyGraphChanged();
    }}
    onNodeSelected={(nodeId, multiSelect) => {
      if (graphStore.activeTool === 'patch' && !isSpacebarPressed && !multiSelect) {
        onPatchNodeChosen(nodeId);
        return;
      }
      if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
      let newIds: string[];
      if (multiSelect) {
        const current = new Set(graphStore.viewState.selectedNodeIds ?? []);
        if (current.has(nodeId)) current.delete(nodeId);
        else current.add(nodeId);
        newIds = Array.from(current);
        graphStore.updateViewState({ selectedNodeIds: newIds });
        callbacks.onSelectionChanged?.(newIds);
      } else {
        const currentSelectedIds = graphStore.viewState.selectedNodeIds ?? [];
        newIds =
          nodeId && currentSelectedIds.length === 1 && currentSelectedIds[0] === nodeId
            ? []
            : nodeId
              ? [nodeId]
              : [];
        graphStore.updateViewState({ selectedNodeIds: newIds });
        callbacks.onSelectionChanged?.(newIds);
      }
      // Push selection to canvas so sync loop (which reads from canvas) doesn't overwrite liveViewState
      canvasInstance?.setSelectionFromDOM?.(newIds);
      canvasInstance?.requestRender?.();
    }}
    onNodeLabelChanged={(nodeId, label) => {
      graphStore.updateNodeLabel(nodeId, label);
      notifyGraphChanged();
      canvasInstance?.requestRender?.();
    }}
    onParameterInputModeChanged={(nodeId, paramName, mode) => {
      if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
      graphStore.updateNodeParameterInputMode(nodeId, paramName, mode);
      canvasInstance?.setGraph?.(graphStore.graph);
      canvasInstance?.requestRender?.();
      notifyGraphChanged();
    }}
    onParameterChange={(nodeId, paramName, value, options) => {
      void handleParameterChange(nodeId, paramName, value, canvasInstance, options);
    }}
    onParameterGestureCommit={() => graphStore.recordUndoSnapshot()}
    onNodeContextMenu={(nodeId, clientX, clientY) => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node) callbacks.onNodeContextMenu?.(clientX, clientY, nodeId, node.type);
    }}
    onPatchIntoDoubleClick={beginPatchIntoFromNodeDoubleClick}
    onNodePowerToggle={(nodeId, bypassed) => {
      // Keep camera stable: power toggles are graph edits, but should never change pan/zoom.
      // Sync from canvas first so graph.viewState is current, and preserve view state on apply.
      if (canvasInstance) syncViewStateFromCanvas(canvasInstance);
      graphStore.setNodeBypassed(nodeId, bypassed);
      notifyGraphChanged();
      canvasInstance?.setGraph?.(graphStore.graph, { preserveViewState: true });
      canvasInstance?.requestRender?.();
    }}
  />

  <AddNodePicker
    open={addNodePickerOpen}
    x={addNodePickerScreen.x}
    y={addNodePickerScreen.y}
    nodeSpecs={nodeSpecs}
    canCloseOnClickOutside={canCloseAddNodePickerOnOutsideClick}
    onSelect={(nodeType) => {
      const cx = addNodePendingCanvas.x;
      const cy = addNodePendingCanvas.y;
      addNodePickerOpen = false;
      const node = apiProp?.addNode(nodeType, cx, cy);
      if (node) {
        canvasInstance?.requestRender?.();
      }
    }}
    onClose={() => {
      addNodePickerOpen = false;
    }}
  />
</div>

<style>
  .node-editor-canvas-wrapper.palette-drop-active {
    cursor: none !important;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--color-teal-light-110) 75%, transparent);
    background: color-mix(in srgb, var(--color-teal-light-110) 6%, transparent);
  }

  /* Crosshair reads as a “+” drop cursor; children may set their own cursor — override while dropping. */
  .node-editor-canvas-wrapper.palette-drop-active :global(*) {
    cursor: none !important;
  }

  .hand-tool-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    cursor: grab;

    &.active {
      pointer-events: auto;
    }

    &.panning {
      cursor: all-scroll;
    }
  }
</style>
