import type { NodeInstance } from '../../data-model/types';
import {
  parseTrackFilterList,
  parseTrackFilterListOrdered,
} from '../../audiotool/arrangement/arrangementTrackFilter';
import {
  MAX_ARRANGEMENT_REGIONS,
  type ArrangementRegion,
  type ArrangementSnapshot,
  type ArrangementTrack,
} from '../../audiotool/arrangement/types';

export type PackedArrangementRegion = {
  startSeconds: number;
  endSeconds: number;
  /** Normalized track row 0 (top) … 1 (bottom) in the visible lane set. */
  trackRow: number;
  colorIndex: number;
};

export type ArrangementLanesPackOptions = {
  trackFilterMode: number;
  /** Comma-separated track ids when `trackFilterMode === 1`. */
  trackFilterList: string;
};

/** When filtering: order matches comma-separated ids (lane / notes stack bottom→top semantics). */
function orderFilteredTracksByPreferredIds(
  filteredTracks: ArrangementTrack[],
  preferredOrderIds: readonly string[]
): ArrangementTrack[] {
  const byId = new Map(filteredTracks.map((t) => [t.id, t]));
  const out: ArrangementTrack[] = [];
  const seen = new Set<string>();
  for (const id of preferredOrderIds) {
    const t = byId.get(id);
    if (t == null || seen.has(id)) continue;
    seen.add(id);
    out.push(t);
  }
  /** Stale snapshots: any visible track missing from list still participates (deterministic fallback). */
  const rest = filteredTracks.filter((t) => !seen.has(t.id));
  rest.sort((a, b) => a.orderAmongTracks - b.orderAmongTracks);
  return [...out, ...rest];
}

/** Note / arrangement-lanes packing: enabled tracks; filter list order overrides project order when set. */
export function resolveVisibleTracks(
  snapshot: ArrangementSnapshot,
  options: ArrangementLanesPackOptions
): ArrangementTrack[] {
  const enabled = snapshot.tracks.filter((t) => t.enabled);
  if (options.trackFilterMode !== 1) {
    return [...enabled].sort((a, b) => a.orderAmongTracks - b.orderAmongTracks);
  }
  const preferredOrderIds = parseTrackFilterListOrdered(options.trackFilterList);
  const allow = parseTrackFilterList(options.trackFilterList);
  if (allow.size === 0) return [];
  const filtered = enabled.filter((t) => allow.has(t.id));
  return orderFilteredTracksByPreferredIds(filtered, preferredOrderIds);
}

function trackRowNormalized(track: ArrangementTrack, visibleTracks: ArrangementTrack[]): number {
  if (visibleTracks.length <= 1) return 0.0;
  const index = visibleTracks.findIndex((t) => t.id === track.id);
  if (index < 0) return 0.0;
  return index / Math.max(1, visibleTracks.length - 1);
}

/**
 * Filter and pack regions from an arrangement snapshot for GPU/GLSL baking.
 * Caps at {@link MAX_ARRANGEMENT_REGIONS}; drops regions on hidden/disabled tracks.
 */
export function packArrangementRegionsForGlsl(
  snapshot: ArrangementSnapshot | undefined,
  options: ArrangementLanesPackOptions
): { regions: PackedArrangementRegion[]; trackCount: number } {
  if (!snapshot) {
    return { regions: [], trackCount: 0 };
  }

  const visibleTracks = resolveVisibleTracks(snapshot, options);
  const trackCount = visibleTracks.length;
  if (trackCount === 0) {
    return { regions: [], trackCount: 0 };
  }

  const trackById = new Map(visibleTracks.map((t) => [t.id, t]));
  const packed: PackedArrangementRegion[] = [];

  for (const region of snapshot.regions) {
    if (!region.enabled) continue;
    const track = trackById.get(region.trackId);
    if (!track) continue;
    packed.push({
      startSeconds: region.startSeconds,
      endSeconds: region.startSeconds + region.durationSeconds,
      trackRow: trackRowNormalized(track, visibleTracks),
      colorIndex: region.colorIndex ?? track.colorIndex ?? 0,
    });
    if (packed.length >= MAX_ARRANGEMENT_REGIONS) break;
  }

  packed.sort((a, b) => a.startSeconds - b.startSeconds || a.trackRow - b.trackRow);
  return { regions: packed, trackCount };
}

export function readArrangementLanesPackOptions(node: NodeInstance): ArrangementLanesPackOptions {
  const trackFilterMode = Number(node.parameters.trackFilterMode ?? 0);
  const trackFilterList =
    typeof node.parameters.trackFilterList === 'string' ? node.parameters.trackFilterList : '';
  return { trackFilterMode, trackFilterList };
}

export function filterRegionsForNode(
  snapshot: ArrangementSnapshot | undefined,
  node: NodeInstance
): { regions: PackedArrangementRegion[]; trackCount: number } {
  return packArrangementRegionsForGlsl(snapshot, readArrangementLanesPackOptions(node));
}

/** Stable GLSL identifier suffix per node instance. */
export function arrangementLanesGlslSuffix(nodeId: string): string {
  let id = nodeId.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^\d/.test(id)) id = `n_${id}`;
  return id;
}

function fmtGlslFloat(v: number): string {
  if (!Number.isFinite(v)) return '0.0';
  const s = v.toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
}

/**
 * Emit compile-time GLSL constants for one arrangement-lanes node instance.
 * Replaces `{{ARRANGEMENT_BAKE}}` in the node spec preamble.
 */
export function buildArrangementLanesGlslBake(
  nodeId: string,
  packed: { regions: PackedArrangementRegion[]; trackCount: number }
): string {
  const suffix = arrangementLanesGlslSuffix(nodeId);
  const count = packed.regions.length;
  const lines: string[] = [
    `const int ARR_LANE_COUNT_${suffix} = ${count};`,
    `const float ARR_LANE_TRACKS_${suffix} = ${fmtGlslFloat(Math.max(1, packed.trackCount))};`,
  ];

  if (count === 0) {
    lines.push(`const vec4 ARR_LANE_REGIONS_${suffix}[1] = vec4[1](vec4(0.0));`);
  } else {
    const entries = packed.regions.map(
      (r) =>
        `vec4(${fmtGlslFloat(r.startSeconds)}, ${fmtGlslFloat(r.endSeconds)}, ${fmtGlslFloat(r.trackRow)}, ${fmtGlslFloat(r.colorIndex)})`
    );
    lines.push(
      `const vec4 ARR_LANE_REGIONS_${suffix}[${count}] = vec4[${count}](${entries.join(', ')});`
    );
  }

  return lines.join('\n');
}

export function regionCountFromSnapshot(snapshot: ArrangementSnapshot): number {
  return snapshot.regions.filter((r) => r.enabled).length;
}

const ARRANGEMENT_BAKE_PLACEHOLDER = '{{ARRANGEMENT_BAKE}}';
const NODE_SUFFIX_PLACEHOLDER = '{{NODE_SUFFIX}}';

/**
 * Inject per-instance baked region tables and suffix tokens into arrangement-lanes GLSL.
 */
export function injectArrangementLanesNodeFunctions(
  funcCode: string,
  node: NodeInstance,
  snapshot: ArrangementSnapshot | undefined
): string {
  const suffix = arrangementLanesGlslSuffix(node.id);
  const packed = filterRegionsForNode(snapshot, node);
  const bake = buildArrangementLanesGlslBake(node.id, packed);
  return funcCode
    .replace(ARRANGEMENT_BAKE_PLACEHOLDER, bake)
    .replaceAll(NODE_SUFFIX_PLACEHOLDER, suffix);
}

function fmtWgslFloat(v: number): string {
  if (!Number.isFinite(v)) return '0.0';
  const s = v.toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
}

/**
 * Per-instance WGSL bake: const region table + eval helper for one arrangement-lanes node.
 * Registered via {@link buildArrangementLanesWgslNodeHelper} in the WGSL MVP compiler.
 */
export function buildArrangementLanesWgslNodeHelper(
  nodeId: string,
  packed: { regions: PackedArrangementRegion[]; trackCount: number }
): string {
  const suffix = arrangementLanesGlslSuffix(nodeId);
  const count = packed.regions.length;
  const arraySize = Math.max(1, count);
  const lines: string[] = [
    `const ARR_LANE_COUNT_${suffix}: i32 = ${count};`,
    `const ARR_LANE_TRACKS_${suffix}: f32 = ${fmtWgslFloat(Math.max(1, packed.trackCount))};`,
  ];

  if (count === 0) {
    lines.push(`const ARR_LANE_REGIONS_${suffix}: array<vec4<f32>, 1> = array<vec4<f32>, 1>(vec4<f32>(0.0));`);
  } else {
    const entries = packed.regions.map(
      (r) =>
        `vec4<f32>(${fmtWgslFloat(r.startSeconds)}, ${fmtWgslFloat(r.endSeconds)}, ${fmtWgslFloat(r.trackRow)}, ${fmtWgslFloat(r.colorIndex)})`
    );
    lines.push(
      `const ARR_LANE_REGIONS_${suffix}: array<vec4<f32>, ${arraySize}> = array<vec4<f32>, ${arraySize}>(${entries.join(', ')});`
    );
  }

  lines.push(`
fn evalArrangementLanes_${suffix}(
  uv: vec2<f32>,
  timelineTime: f32,
  viewportMode: f32,
  windowSeconds: f32,
  fixedStart: f32,
  colorSource: f32,
  laneHeight: f32,
  laneSpacing: f32,
  edgeFade: f32,
  opacity: f32,
  backgroundRgb: vec3<f32>
) -> vec4<f32> {
  let windowStart = select(fixedStart, timelineTime - windowSeconds * 0.5, viewportMode < 0.5);
  let timeAtX = windowStart + clamp(uv.x, 0.0, 1.0) * max(windowSeconds, 0.0001);
  let tracks = max(ARR_LANE_TRACKS_${suffix}, 1.0);
  let rowStep = (1.0 - laneSpacing) / tracks;
  let halfLane = laneHeight * rowStep * 0.5;
  var color = backgroundRgb;
  var alpha: f32 = 0.0;

  for (var i: i32 = 0; i < ${MAX_ARRANGEMENT_REGIONS}; i++) {
    if (i >= ARR_LANE_COUNT_${suffix}) {
      break;
    }
    let reg = ARR_LANE_REGIONS_${suffix}[i];
    let rowCenter = 1.0 - reg.z;
    let rowDist = abs(uv.y - rowCenter);
    if (rowDist > halfLane) {
      continue;
    }
    if (timeAtX < reg.x || timeAtX > reg.y) {
      continue;
    }
    let rowFade = 1.0 - smoothstep(halfLane * 0.65, halfLane, rowDist);
    let regionRgb = arrangementLanesPaletteColorWgsl(reg.w, reg.z, colorSource);
    color = mix(color, regionRgb, rowFade);
    alpha = max(alpha, rowFade);
  }

  let playheadX = select(
    clamp((timelineTime - fixedStart) / max(windowSeconds, 0.0001), 0.0, 1.0),
    0.5,
    viewportMode < 0.5
  );
  let playheadVisible = select(
    timelineTime >= fixedStart && timelineTime <= fixedStart + max(windowSeconds, 0.0001),
    true,
    viewportMode < 0.5
  );
  if (playheadVisible) {
    let playheadDist = abs(uv.x - playheadX);
    let playheadWidth = max(fwidth(uv.x), 0.001) * 1.25;
    let playheadLine = 1.0 - smoothstep(playheadWidth * 0.5, playheadWidth, playheadDist);
    if (playheadLine > 0.0) {
      let playheadRgb = vec3<f32>(0.72, 0.92, 0.88);
      color = mix(color, playheadRgb, playheadLine);
      alpha = max(alpha, playheadLine);
    }
  }

  let edge = arrangementLanesEdgeFadeWgsl(uv, edgeFade);
  return vec4<f32>(color, alpha * opacity * edge);
}
`);

  return lines.join('\n');
}

export type { ArrangementRegion };
