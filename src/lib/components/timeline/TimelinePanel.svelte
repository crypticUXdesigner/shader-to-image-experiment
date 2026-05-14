<script lang="ts">
  /**
   * Timeline Panel
   * Lanes, regions, BPM, ruler, playhead, snap, add-lane dropdown.
   */
  import { DropdownMenu } from '../ui';
  import { getContext } from 'svelte';
  import { wheelNonPassive } from '../../actions/wheelPassive';
  import { portal } from '../../actions/portal';
  import {
    addAutomationLane,
    addAutomationRegion,
    updateAutomationRegion,
    removeAutomationRegion,
    removeAutomationLane,
    setAutomationBpm,
    generateUUID,
  } from '../../../data-model';
  import { snapToGrid, SNAP_GRID_OPTIONS } from '../../../utils/timelineSnap';
  import type { NodeGraph } from '../../../data-model/types';
  import type { NodeSpec } from '../../../types/nodeSpec';
  import type { TimelineState } from '../../../runtime/types';
  import type { AutomationLane, AutomationRegion } from '../../../data-model/types';
  import type { WaveformService } from '../../../runtime/waveform';
  import TimelineLanes from './TimelineLanes.svelte';
  import TimelineHeaderControls from './TimelineHeaderControls.svelte';
  import TimelineRuler from './TimelineRuler.svelte';
  import TimelineScroller from './TimelineScroller.svelte';
  import {
    clampPan as clampPanValue,
    getTimeFromClientXInRect,
    timeToX as timeToXValue,
    xToTime as xToTimeValue,
    type TimelineTransformParams,
  } from './timelineMath';
  import {
    computeDuplicateDropStart,
    computeResizeFromMouseDelta,
    createRegionDragState,
    createRegionResizeState,
    updateRegionDragTime,
  } from './regionInteractions';
  import { buildTimelineLaneViewModels, type TimelineLaneViewModel } from './timelineLaneViewModel';
  import { buildTimelineRulerData } from './timelineRulerModel';
  import { paintRulerWaveformCanvas } from './paintRulerWaveformCanvas';
  import { pollOnAnimationFrame } from '../../utils/pollOnAnimationFrame';
  import {
    TIMELINE_FLOATING_HEADER_HOST,
    type TimelineFloatingHeaderHostGetter,
  } from './timelineFloatingHeaderContext';

  const DEFAULT_BPM = 120;
  const DEFAULT_BARS_NEW_REGION = 16;
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 8;
  const ZOOM_DEFAULT = 1;
  const TRACK_WIDTH = 400;
  const TRACK_HEADER_WIDTH = 200;

  interface FloatParamOption {
    nodeId: string;
    paramName: string;
    nodeLabel: string;
    paramLabel: string;
  }

  interface Props {
    getGraph: () => NodeGraph;
    onGraphUpdate: (graph: NodeGraph) => void;
    getTimelineState: () => TimelineState | null;
    onSeek?: (time: number) => void;
    waveformService?: WaveformService | null;
    onRevealInNodeEditor?: (nodeId: string, paramName: string) => void;
    onOpenCurveEditor?: (
      laneId: string,
      regionId: string,
      labels: { paramLabel: string; nodeLabel: string }
    ) => void;
    onClose?: () => void;
    nodeSpecs: NodeSpec[];
    /** When the curve editor is open for this lane/region, drag/resize preview times are reported here. */
    openCurveEditorRegion?: { laneId: string; regionId: string } | null;
    onOpenCurveEditorRegionTimePreview?: (preview: { startTime: number; endTime: number } | null) => void;
  }

  let {
    getGraph,
    onGraphUpdate,
    getTimelineState,
    onSeek,
    waveformService = null,
    onRevealInNodeEditor,
    onOpenCurveEditor,
    onClose,
    nodeSpecs,
    openCurveEditorRegion = null,
    onOpenCurveEditorRegionTimePreview,
  }: Props = $props();

  const getFloatingHeaderHost = getContext<TimelineFloatingHeaderHostGetter | undefined>(
    TIMELINE_FLOATING_HEADER_HOST
  );
  const floatingPanelHeaderMountEl = $derived(getFloatingHeaderHost?.() ?? null);

  const nodeSpecsMap = $derived(new Map(nodeSpecs.map((s) => [s.id, s])));

  function syncCurveEditorRegionTimePreview(): void {
    const cb = onOpenCurveEditorRegionTimePreview;
    const target = openCurveEditorRegion;
    if (!cb || !target) return;

    if (regionDrag?.isDuplicate) {
      cb(null);
      return;
    }

    if (
      regionResize &&
      regionResize.laneId === target.laneId &&
      regionResize.regionId === target.regionId
    ) {
      const st = regionResize.startTime;
      cb({ startTime: st, endTime: st + regionResize.startDuration });
      return;
    }

    const drag = regionDrag;
    if (drag && drag.laneId === target.laneId && drag.regionId === target.regionId) {
      const graph = getGraph();
      const lane = graph.automation?.lanes.find((l: AutomationLane) => l.id === drag.laneId);
      const region = lane?.regions.find((r: AutomationRegion) => r.id === drag.regionId);
      if (!region) {
        cb(null);
        return;
      }
      const st = drag.startTime;
      cb({ startTime: st, endTime: st + region.duration });
      return;
    }

    if (regionDrag || regionResize) {
      cb(null);
    }
  }

  let zoomLevel = $state(ZOOM_DEFAULT);
  let panOffset = $state(0);
  let snapEnabled = $state(false);
  let snapGridBars = $state(4);
  let selectedRegion = $state<{ laneId: string; regionId: string } | null>(null);
  let regionDrag = $state<{
    laneId: string;
    regionId: string;
    startTime: number;
    /** Time offset from cursor to region start (cursorTime - region.startTime) so region sticks to cursor. */
    gripOffset: number;
    isDuplicate: boolean;
  } | null>(null);
  let regionResize = $state<{
    laneId: string;
    regionId: string;
    edge: 'left' | 'right';
    startX: number;
    startTime: number;
    startDuration: number;
  } | null>(null);
  let addLaneOpen = $state(false);
  let addLaneSearch = $state('');
  let snapGridOpen = $state(false);
  let regionContextMenuRef: import('../ui/menu/DropdownMenu.svelte').default | undefined;
  let scrollEl: HTMLDivElement | null = null;
  let lanesContainerEl: HTMLDivElement | null = null;
  let rulerTrackEl: HTMLDivElement | null = null;
  let trackColumnEl: HTMLDivElement | null = null;
  let playheadClipEl = $state<HTMLDivElement | null>(null);
  let rulerSeekDragging = $state(false);
  let playheadDragging = $state(false);
  let trackWidth = $state(TRACK_WIDTH);
  /** Ruler track CSS width from ResizeObserver — canvas often reports 0×0 before first layout. */
  let rulerWaveformHostCssWidth = $state(0);
  /** Full waveform for current primary (from 02B); null when no data or no service. Stereo: values = left, valuesRight = right. */
  let fullWaveformData = $state<{ values: number[]; valuesRight?: number[]; durationSeconds: number } | null>(null);
  let rulerWaveformCanvasEl = $state<HTMLCanvasElement | null>(null);

  const laneVMs = $derived.by((): TimelineLaneViewModel[] =>
    buildTimelineLaneViewModels(getGraph(), nodeSpecsMap)
  );

  const lanes = $derived(laneVMs.map((vm) => vm.lane));

  /** Snapshot of timeline state so playhead and ruler react to playback (getTimelineState is not reactive). */
  let timelineStateSnapshot = $state<{
    currentTime: number;
    duration: number;
    hasAudio: boolean;
  } | null>(null);

  $effect(() => {
    if (!getTimelineState) return;
    const poll = () => {
      const state = getTimelineState();
      timelineStateSnapshot = state
        ? {
            currentTime: state.currentTime,
            duration: state.duration,
            hasAudio: state.hasAudio,
          }
        : null;
    };
    poll();
    return pollOnAnimationFrame(poll);
  });

  /**
   * When the primary MP3 finishes decoding, `hasAudio` flips true and duration becomes the real clip length.
   * Waveform must refetch then — the first attempt often ran while only the heuristic CDN URL existed (404)
   * and no decode buffer, so audiograph + fetch both failed.
   */
  const waveformReloadToken = $derived.by(() => {
    const svc = waveformService;
    const wk = svc?.getPrimaryWaveformKey() ?? '';
    const st = timelineStateSnapshot;
    return `${wk}:${st?.hasAudio === true ? 1 : 0}:${(st?.duration ?? 0).toFixed(3)}`;
  });

  /** Fetch full waveform when service, primary, or decoded audio binding changes. */
  $effect(() => {
    void waveformReloadToken;
    const svc = waveformService;
    const primaryWaveformKey = svc?.getPrimaryWaveformKey() ?? null;
    if (!svc || !primaryWaveformKey) {
      fullWaveformData = null;
      return;
    }
    let cancelled = false;
    void svc.getWaveformForPrimary().then((data) => {
      if (cancelled) return;
      const duration = data.durationSeconds > 0 ? data.durationSeconds : getDuration();
      fullWaveformData =
        data.values.length > 0 && duration > 0
          ? { values: data.values, valuesRight: data.valuesRight, durationSeconds: duration }
          : null;
    });
    return () => {
      cancelled = true;
    };
  });

  /** Draw waveform slice in ruler canvas when data or view (zoom/pan) changes. */
  $effect(() => {
    const canvas = rulerWaveformCanvasEl;
    const full = fullWaveformData;
    const visDur = visibleDuration;
    const svc = waveformService;
    void trackWidth;
    void rulerWaveformHostCssWidth;
    if (!canvas) return;
    const layoutHint = {
      cssWidthFallbackPx: Math.max(rulerWaveformHostCssWidth, trackWidth, TRACK_WIDTH),
      cssHeightFallbackPx: 20,
    };
    paintRulerWaveformCanvas(canvas, full, svc, panOffset, visDur, layoutHint);
    let raf = 0;
    if (canvas.getBoundingClientRect().width < 2) {
      raf = requestAnimationFrame(() => {
        paintRulerWaveformCanvas(canvas, full, svc, panOffset, visDur, layoutHint);
      });
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  });

  function getDuration(): number {
    const state = getTimelineState();
    if (state != null) return state.duration;
    return getGraph().automation?.durationSeconds ?? 30;
  }

  function getBpm(): number {
    return getGraph().automation?.bpm ?? DEFAULT_BPM;
  }

  const visibleDuration = $derived.by(() => {
    const d = getDuration();
    return d <= 0 ? 0 : d / zoomLevel;
  });

  /** Single source for ruler / lanes / playhead time mapping (keep in sync with zoom/pan). */
  const timelineTransform = $derived.by((): TimelineTransformParams => {
    void timelineStateSnapshot;
    return {
      duration: getDuration(),
      panOffset,
      visibleDuration,
      trackWidth,
    };
  });

  function clampPan(): void {
    panOffset = clampPanValue(panOffset, getDuration(), visibleDuration);
  }

  function applyTimelineZoom(delta: number, anchorTime: number): void {
    const duration = getDuration();
    if (duration <= 0) return;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel * (1 + delta)));
    const visible = duration / newZoom;
    zoomLevel = newZoom;
    panOffset = Math.max(0, Math.min(anchorTime - visible / 2, duration - visible));
    clampPan();
  }

  function timeToX(time: number): number {
    return timeToXValue(time, timelineTransform);
  }

  function xToTime(x: number): number {
    return xToTimeValue(x, timelineTransform);
  }

  /** Get time (0..duration) under a clientX position for a track rect; used for region drag so movement is 1:1 with cursor. */
  function getTimeFromTrackRect(clientX: number, trackRect: DOMRect): number {
    return getTimeFromClientXInRect(clientX, trackRect, timelineTransform);
  }

  /** Get time (0..duration) from a mouse event on the ruler track; null if invalid. */
  function getRulerTimeFromEvent(e: MouseEvent): number | null {
    if (!rulerTrackEl) return null;
    const rect = rulerTrackEl.getBoundingClientRect();
    if (rect.width <= 0) return null;
    if (timelineTransform.duration <= 0) return null;
    return getTimeFromClientXInRect(e.clientX, rect, timelineTransform);
  }

  function onRulerSeekMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (!onSeek || getDuration() <= 0 || getTimelineState() == null) return;
    const t = getRulerTimeFromEvent(e);
    if (t != null) onSeek(t);
    rulerSeekDragging = true;

    const onMove = (e2: MouseEvent): void => {
      if (!rulerSeekDragging) return;
      const t2 = getRulerTimeFromEvent(e2);
      if (t2 != null) onSeek(t2);
    };
    const onUp = (): void => {
      rulerSeekDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /** Get time (0..duration) from clientX using the playhead track (lane column) rect; null if invalid. */
  function getTimeFromPlayheadTrack(clientX: number): number | null {
    if (!playheadClipEl) return null;
    const rect = playheadClipEl.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const duration = getDuration();
    if (duration <= 0) return null;
    return getTimeFromClientXInRect(clientX, rect, timelineTransform);
  }

  function onPlayheadPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (!onSeek || getDuration() <= 0) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    playheadDragging = true;
    const t = getTimeFromPlayheadTrack(e.clientX);
    if (t != null) onSeek(t);

    const onMove = (e2: PointerEvent): void => {
      e2.preventDefault();
      const t2 = getTimeFromPlayheadTrack(e2.clientX);
      if (t2 != null) onSeek(t2);
    };
    const onUp = (e2: PointerEvent): void => {
      if (e2.pointerId === e.pointerId) {
        target.releasePointerCapture(e2.pointerId);
      }
      playheadDragging = false;
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  const scrollerLeftPct = $derived.by(() => {
    const duration = getDuration();
    if (duration <= 0) return 0;
    return (panOffset / duration) * 100;
  });

  const scrollerWidthPct = $derived.by(() => {
    const duration = getDuration();
    if (duration <= 0) return 100;
    const visible = visibleDuration;
    return Math.max(2, (visible / duration) * 100);
  });

  const currentTime = $derived(timelineStateSnapshot?.currentTime ?? 0);
  const showPlayhead = $derived(timelineStateSnapshot != null);
  const playheadOnlyLayout = $derived(showPlayhead && lanes.length === 0);
  const playheadX = $derived(timeToX(currentTime));

  const snapGridLabel = $derived(
    SNAP_GRID_OPTIONS.find((o) => o.value === snapGridBars)?.label ?? String(snapGridBars)
  );

  /** Add Lane: only float parameters (automation is float-only; evaluator/GLSL do not support int). */
  function getFloatParamOptions(): FloatParamOption[] {
    const graph = getGraph();
    const existing = new Set(
      (graph.automation?.lanes ?? []).map((l) => `${l.nodeId}:${l.paramName}`)
    );
    const options: FloatParamOption[] = [];
    for (const node of graph.nodes) {
      const spec = nodeSpecsMap.get(node.type);
      if (!spec?.parameters) continue;
      const nodeLabel = node.label ?? spec.displayName ?? node.type;
      for (const [paramName, paramSpec] of Object.entries(spec.parameters)) {
        if (paramSpec.type !== 'float') continue;
        if (existing.has(`${node.id}:${paramName}`)) continue;
        options.push({
          nodeId: node.id,
          paramName,
          nodeLabel,
          paramLabel: paramSpec.label ?? paramName,
        });
      }
    }
    return options;
  }

  const filteredFloatParams = $derived.by(() => {
    const query = addLaneSearch.trim().toLowerCase();
    let opts = getFloatParamOptions();
    if (query) {
      opts = opts.filter(
        (o) =>
          o.nodeLabel.toLowerCase().includes(query) ||
          o.paramLabel.toLowerCase().includes(query)
      );
    }
    const grouped = new Map<string, FloatParamOption[]>();
    for (const o of opts) {
      if (!grouped.has(o.nodeId)) grouped.set(o.nodeId, []);
      grouped.get(o.nodeId)!.push(o);
    }
    return { options: opts, grouped };
  });

  const rulerSeekEnabled = $derived.by(() => {
    return Boolean(onSeek && getDuration() > 0 && timelineStateSnapshot != null);
  });

  const rulerData = $derived.by(() => {
    const duration = getDuration();
    const bpm = getBpm();
    const state = getTimelineState();
    const hasAudio = state?.hasAudio ?? false;
    const vis = visibleDuration;
    return buildTimelineRulerData({
      duration,
      bpm,
      hasAudio,
      visibleDuration: vis,
      panOffset,
    });
  });

  /** Grid step positions (x in px) for track lanes; same step as snap grid. */
  const trackGridLines = $derived.by(() => {
    const visible = visibleDuration;
    const bpm = getBpm();
    if (visible <= 0 || bpm <= 0 || snapGridBars <= 0) return [];
    const stepSec = (snapGridBars * 60) / bpm;
    const start = panOffset;
    const end = panOffset + visible;
    const firstStep = Math.ceil(start / stepSec) * stepSec;
    const lines: number[] = [];
    for (let t = firstStep; t < end; t += stepSec) {
      const x = timeToX(t);
      if (x >= 0 && x <= trackWidth) lines.push(x);
    }
    return lines;
  });

  function applyBpm(value: number): void {
    const num = Number.isFinite(value) ? Math.max(20, Math.min(300, value)) : DEFAULT_BPM;
    const updated = setAutomationBpm(getGraph(), num);
    onGraphUpdate(updated);
  }

  function addLane(nodeId: string, paramName: string): void {
    const laneId = generateUUID();
    const updated = addAutomationLane(getGraph(), { id: laneId, nodeId, paramName });
    onGraphUpdate(updated);
    addLaneOpen = false;
    addLaneSearch = '';
  }

  function createRegion(laneId: string, startTime: number): void {
    const graph = getGraph();
    const lane = graph.automation?.lanes.find((l: AutomationLane) => l.id === laneId);
    const node = lane ? graph.nodes.find((n: { id: string }) => n.id === lane.nodeId) : undefined;
    const spec = node ? nodeSpecsMap.get(node.type) : undefined;
    const nodeLabel = node?.label ?? spec?.displayName ?? lane?.nodeId ?? '';
    const paramLabel = spec?.parameters?.[lane?.paramName ?? '']?.label ?? lane?.paramName ?? '';
    const bpm = getBpm();
    const durationSec = Math.max(0.001, (DEFAULT_BARS_NEW_REGION * 60) / bpm);
    const start = snapEnabled ? snapToGrid(startTime, bpm, snapGridBars) : startTime;
    const regionId = generateUUID();
    const paramSpec = lane ? spec?.parameters?.[lane.paramName] : undefined;
    const isFloat = paramSpec && paramSpec.type === 'float';
    const rawValue =
      isFloat && node && lane
        ? (node.parameters?.[lane.paramName] ?? paramSpec?.default)
        : undefined;
    const numValue = typeof rawValue === 'number' ? rawValue : undefined;
    const min = typeof paramSpec?.min === 'number' ? paramSpec.min : 0;
    const max = typeof paramSpec?.max === 'number' ? paramSpec.max : 1;
    const range = max - min;
    const normalized =
      numValue !== undefined
        ? range === 0
          ? 0.5
          : Math.max(0, Math.min(1, (numValue - min) / range))
        : undefined;
    const curve =
      normalized !== undefined
        ? {
            keyframes: [
              { time: 0, value: normalized },
              { time: 1, value: normalized },
            ],
            interpolation: 'bezier' as const,
          }
        : undefined;
    const updated = addAutomationRegion(graph, laneId, {
      id: regionId,
      startTime: start,
      duration: durationSec,
      loop: false,
      ...(curve ? { curve } : {}),
    });
    onGraphUpdate(updated);
    selectedRegion = { laneId, regionId };
    if (onOpenCurveEditor) {
      onOpenCurveEditor(laneId, regionId, { paramLabel, nodeLabel });
    }
  }

  function deleteRegion(laneId: string, regionId: string): void {
    const updated = removeAutomationRegion(getGraph(), laneId, regionId);
    onGraphUpdate(updated);
    if (selectedRegion?.laneId === laneId && selectedRegion?.regionId === regionId) {
      selectedRegion = null;
    }
  }

  function deleteLane(laneId: string): void {
    const updated = removeAutomationLane(getGraph(), laneId);
    onGraphUpdate(updated);
    if (selectedRegion?.laneId === laneId) {
      selectedRegion = null;
    }
  }

  function duplicateRegion(
    laneId: string,
    sourceRegionId: string,
    startTime: number
  ): void {
    const graph = getGraph();
    const lane = graph.automation?.lanes.find((l: AutomationLane) => l.id === laneId);
    const region = lane?.regions.find((r: AutomationRegion) => r.id === sourceRegionId);
    if (!lane || !region) return;
    const newId = generateUUID();
    const updated = addAutomationRegion(graph, laneId, {
      id: newId,
      startTime,
      duration: region.duration,
      loop: region.loop,
      curve: region.curve,
    });
    onGraphUpdate(updated);
    selectedRegion = { laneId, regionId: newId };
  }

  function handleTrackDblClick(e: MouseEvent, laneId: string) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('region-block')) return;
    const track = (e.currentTarget as HTMLElement).closest('.track') as HTMLElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const xPx = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const x = rect.width > 0 ? (xPx / rect.width) * trackWidth : 0;
    const time = xToTime(x);
    createRegion(laneId, time);
  }

  function onRegionResizeStart(
    e: MouseEvent,
    laneId: string,
    regionId: string,
    edge: 'left' | 'right'
  ) {
    e.preventDefault();
    e.stopPropagation();
    const graph = getGraph();
    const lane = graph.automation?.lanes.find((l: AutomationLane) => l.id === laneId);
    const region = lane?.regions.find((r: AutomationRegion) => r.id === regionId);
    if (!lane || !region) return;
    regionResize = createRegionResizeState({
      laneId,
      regionId,
      edge,
      startX: e.clientX,
      regionStartTime: region.startTime,
      regionDuration: region.duration,
    });
    const track = lanesContainerEl?.querySelector(
      `.track[data-lane-id="${laneId}"]`
    ) as HTMLElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const visible = visibleDuration;
    const secondsPerPx = rect.width > 0 ? visible / rect.width : 0;
    const bpm = getBpm();
    const durationMax = getDuration();
    const minDuration = 0.001;

    const onMove = (e2: MouseEvent): void => {
      if (!regionResize) return;
      const dxPx = e2.clientX - regionResize.startX;
      const next = computeResizeFromMouseDelta({
        edge: regionResize.edge,
        startTime: regionResize.startTime,
        startDuration: regionResize.startDuration,
        dxPx,
        secondsPerPx,
        durationMax,
        minDuration,
        snapEnabled,
        bpm,
        snapGridBars,
      });
      regionResize = {
        ...regionResize,
        startX: e2.clientX,
        startTime: next.startTime,
        startDuration: next.duration,
      };
      syncCurveEditorRegionTimePreview();
    };
    const onUp = (): void => {
      onOpenCurveEditorRegionTimePreview?.(null);
      const final = regionResize;
      regionResize = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (final) {
        const updated = updateAutomationRegion(getGraph(), laneId, regionId, {
          startTime: final.startTime,
          duration: final.startDuration,
        });
        onGraphUpdate(updated);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    syncCurveEditorRegionTimePreview();
  }

  function onRegionMouseDown(e: MouseEvent, laneId: string, regionId: string) {
    if ((e.target as HTMLElement).closest('.region-resize')) return;
    e.preventDefault();
    selectedRegion = { laneId, regionId };
    const graph = getGraph();
    const lane = graph.automation?.lanes.find((l: AutomationLane) => l.id === laneId);
    const region = lane?.regions.find((r: AutomationRegion) => r.id === regionId);
    if (!lane || !region) return;

    const track = lanesContainerEl?.querySelector(
      `.track[data-lane-id="${laneId}"]`
    ) as HTMLElement | null;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const cursorTime = getTimeFromTrackRect(e.clientX, rect);
    const isDuplicate = e.altKey || e.metaKey;
    regionDrag = createRegionDragState({
      laneId,
      regionId,
      regionStartTime: region.startTime,
      cursorTime,
      isDuplicate,
    });

    const onMouseMove = (e2: MouseEvent): void => {
      if (!regionDrag) return;
      const trackEl = lanesContainerEl?.querySelector(
        `.track[data-lane-id="${laneId}"]`
      ) as HTMLElement;
      if (!trackEl) return;
      const trackRect = trackEl.getBoundingClientRect();
      const cursorTimeNow = getTimeFromTrackRect(e2.clientX, trackRect);
      const newStart = updateRegionDragTime({
        cursorTime: cursorTimeNow,
        gripOffset: regionDrag.gripOffset,
        duration: getDuration(),
        regionDuration: region.duration,
        snapEnabled,
        bpm: getBpm(),
        snapGridBars,
      });
      regionDrag = { ...regionDrag, startTime: newStart };
      syncCurveEditorRegionTimePreview();
    };

    const onMouseUp = (): void => {
      onOpenCurveEditorRegionTimePreview?.(null);
      const final = regionDrag;
      regionDrag = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (final) {
        const updated = updateAutomationRegion(getGraph(), laneId, regionId, {
          startTime: final.startTime,
        });
        onGraphUpdate(updated);
      }
    };

    if (isDuplicate) {
      const onMouseUpDup = (e2: MouseEvent): void => {
        onOpenCurveEditorRegionTimePreview?.(null);
        window.removeEventListener('mouseup', onMouseUpDup);
        const track = lanesContainerEl?.querySelector(
          `.track[data-lane-id="${laneId}"]`
        ) as HTMLElement;
        if (track) {
          const rect = track.getBoundingClientRect();
          const maxT = getDuration();
          const rawStart = computeDuplicateDropStart({
            clientX: e2.clientX,
            trackRect: rect,
            math: timelineTransform,
            snapEnabled,
            bpm: getBpm(),
            snapGridBars,
          });
          const newStart = Math.max(0, Math.min(rawStart, maxT - region.duration));
          duplicateRegion(laneId, regionId, newStart);
        }
        regionDrag = null;
      };
      syncCurveEditorRegionTimePreview();
      window.addEventListener('mouseup', onMouseUpDup);
      return;
    }

    syncCurveEditorRegionTimePreview();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function onRegionContextMenu(e: MouseEvent, laneId: string, regionId: string) {
    e.preventDefault();
    selectedRegion = { laneId, regionId };
    regionContextMenuRef?.show(e.clientX, e.clientY, [
      { label: 'Delete', action: () => deleteRegion(laneId, regionId) },
    ]);
  }

  function handleRegionDblClick(laneId: string, regionId: string): void {
    if (!onOpenCurveEditor) return;
    const vm = laneVMs.find((x) => x.lane.id === laneId);
    onOpenCurveEditor(laneId, regionId, {
      paramLabel: vm?.paramLabel ?? '',
      nodeLabel: vm?.nodeLabel ?? laneId,
    });
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (!selectedRegion) return;
    e.preventDefault();
    deleteRegion(selectedRegion.laneId, selectedRegion.regionId);
  }

  function onScrollerMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const scrollerEl = (e.currentTarget as HTMLElement).closest('.scroller') as HTMLElement | null;
    if (!scrollerEl) return;
    const duration = getDuration();
    if (duration <= 0) return;

    const rect = scrollerEl.getBoundingClientRect();
    const fracFromClick = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
    const visible = visibleDuration;
    const thumbFrac = duration > 0 ? Math.min(1, visible / duration) : 1;
    const leftFrac = duration > 0 ? panOffset / duration : 0;
    const rightFrac = leftFrac + thumbFrac;
    /** Click on track (not thumb): jump so viewport is centered under mouse. */
    const onThumb = fracFromClick >= leftFrac && fracFromClick <= rightFrac;
    if (!onThumb) {
      panOffset = Math.max(0, Math.min(duration - visible, fracFromClick * duration - visible / 2));
      clampPan();
    }

    const startPanOffset = panOffset;
    const startClientX = e.clientX;
    const onMove = (e2: MouseEvent): void => {
      const dx = e2.clientX - startClientX;
      const frac = rect.width > 0 ? dx / rect.width : 0;
      panOffset = clampPanValue(startPanOffset + frac * duration, duration, visible);
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onScrollerWheel(e: WheelEvent) {
    e.preventDefault();
    const duration = getDuration();
    if (duration <= 0) return;
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    applyTimelineZoom(delta, panOffset + visibleDuration / 2);
  }

  function onTimelineWheel(e: WheelEvent) {
    if (!e.altKey && !e.metaKey) return;
    e.preventDefault();
    const duration = getDuration();
    if (duration <= 0) return;
    const rect = scrollEl?.getBoundingClientRect();
    if (!rect) return;
    const scrollX = e.clientX - rect.left;
    const trackAreaLeft = TRACK_HEADER_WIDTH + 12; /* --pd-md */
    const trackX = Math.max(0, Math.min(trackWidth, scrollX - trackAreaLeft));
    const timeUnderCursor = xToTime(trackX);
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    applyTimelineZoom(delta, timeUnderCursor);
  }

  const snapGridMenuItems = $derived(
    SNAP_GRID_OPTIONS.map((opt) => ({
      label: opt.label,
      action: () => {
        snapGridBars = opt.value;
      },
    }))
  );

  $effect(() => {
    function onKey(e: KeyboardEvent) {
      handleKeydown(e);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  $effect(() => {
    const el = trackColumnEl;
    if (!el) {
      trackWidth = TRACK_WIDTH;
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect.width != null && entry.contentRect.width > 0) {
        trackWidth = Math.round(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  $effect(() => {
    const el = rulerTrackEl;
    if (!el) {
      rulerWaveformHostCssWidth = 0;
      return;
    }
    const update = (): void => {
      const w = el.getBoundingClientRect().width;
      rulerWaveformHostCssWidth = w >= 2 ? Math.round(w) : 0;
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

<div class="inner" style="--timeline-track-width: {trackWidth}px; --track-header-width: {TRACK_HEADER_WIDTH}px">
  {#snippet timelineHeaderControlsSnippet(layoutVariant: 'default' | 'floatingPanel')}
    <TimelineHeaderControls
      bpm={getBpm()}
      onApplyBpm={(v) => applyBpm(v)}
      snapEnabled={snapEnabled}
      onToggleSnap={() => (snapEnabled = !snapEnabled)}
      snapGridLabel={snapGridLabel}
      snapGridEnabled={snapEnabled}
      snapGridMenuItems={snapGridMenuItems}
      filteredFloatParams={filteredFloatParams}
      addLaneOpen={addLaneOpen}
      addLaneSearch={addLaneSearch}
      onToggleAddLaneOpen={() => (addLaneOpen = !addLaneOpen)}
      onCloseAddLane={() => (addLaneOpen = false)}
      onUpdateAddLaneSearch={(v) => (addLaneSearch = v)}
      onAddLane={addLane}
      snapGridOpen={snapGridOpen}
      onToggleSnapGridOpen={() => (snapGridOpen = !snapGridOpen)}
      onCloseSnapGrid={() => (snapGridOpen = false)}
      onClose={onClose}
      {layoutVariant}
    />
  {/snippet}

  {#if floatingPanelHeaderMountEl}
    <div class="timeline-header-portal-root" use:portal={floatingPanelHeaderMountEl}>
      {@render timelineHeaderControlsSnippet('floatingPanel')}
    </div>
  {:else}
    {@render timelineHeaderControlsSnippet('default')}
  {/if}

  {#snippet footerRight()}
    <TimelineScroller
      scrollerLeftPct={scrollerLeftPct}
      scrollerWidthPct={scrollerWidthPct}
      onMouseDown={onScrollerMouseDown}
      onWheel={onScrollerWheel}
    />
    <TimelineRuler
      rulerSeekEnabled={rulerSeekEnabled}
      currentTime={currentTime}
      duration={getDuration()}
      waveformService={waveformService}
      rulerData={rulerData}
      timeToX={timeToX}
      onMouseDown={onRulerSeekMouseDown}
      onRulerTrackEl={(el) => (rulerTrackEl = el)}
      onWaveformCanvasEl={(el) => (rulerWaveformCanvasEl = el)}
    />
  {/snippet}

  <div
    bind:this={scrollEl}
    class="scroll"
    use:wheelNonPassive={onTimelineWheel}
    role="presentation"
  >
    <div class="scroll-viewport">
      <TimelineLanes
        laneVMs={laneVMs}
        trackGridLines={trackGridLines}
        selectedRegion={selectedRegion}
        regionDrag={regionDrag}
        regionResize={regionResize}
        timeToX={timeToX}
        playheadOnlyLayout={playheadOnlyLayout}
        showPlayhead={showPlayhead}
        playheadDragging={playheadDragging}
        playheadX={playheadX}
        duration={getDuration()}
        currentTime={currentTime}
        rulerSeekEnabled={rulerSeekEnabled}
        onDeleteLane={deleteLane}
        onTrackDblClick={handleTrackDblClick}
        onRegionMouseDown={onRegionMouseDown}
        onRegionContextMenu={onRegionContextMenu}
        onRegionDblClick={handleRegionDblClick}
        onRegionResizeStart={onRegionResizeStart}
        onPlayheadPointerDown={onPlayheadPointerDown}
        onRevealInNodeEditor={onRevealInNodeEditor}
        onTrackColumnEl={(el) => (trackColumnEl = el)}
        onLanesContainerEl={(el) => (lanesContainerEl = el)}
        onPlayheadClipEl={(el) => (playheadClipEl = el)}
      />
    </div>
    <div class="timeline-footer" role="presentation">
      <div class="footer-corner" aria-hidden="true"></div>
      <div class="timeline-footer-tracks">
        {@render footerRight()}
      </div>
    </div>
  </div>

  <DropdownMenu bind:this={regionContextMenuRef} class="timeline-region-context-menu" />
</div>

<style>
  /* === Layout (component-owned: colocated from timeline layout) === */
  .timeline-header-portal-root {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  .inner {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    flex: 1;
    min-height: 0;

    .scroll {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 0;

      .scroll-viewport {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .scroll-viewport::-webkit-scrollbar {
        display: none;
      }

      .timeline-footer {
        flex-shrink: 0;
        display: flex;
        flex-direction: row;
        align-items: stretch;
      }

      .footer-corner {
        flex-shrink: 0;
        width: var(--track-header-width);
        box-sizing: border-box;
        padding-left: var(--pd-xs);
      }

      .timeline-footer-tracks {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--pd-xs);
        padding: 0 var(--pd-xs) var(--pd-xs);
        box-sizing: border-box;
        background: var(--color-gray-60);
        border-radius: 0 0 var(--radius-md) var(--radius-md);
        overflow: hidden;
      }
    }
  }
</style>
