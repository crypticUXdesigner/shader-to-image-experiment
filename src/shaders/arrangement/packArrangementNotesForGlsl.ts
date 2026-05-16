import type { NodeInstance } from '../../data-model/types';
import {
  MAX_ARRANGEMENT_NOTES_PACKED,
  type ArrangementNote,
  type ArrangementSnapshot,
  type ArrangementTrack,
} from '../../audiotool/arrangement/types';
import { logArrangementNotesBakeDiagnostics } from '../../audiotool/arrangement/arrangementDiagnostics';
import { trackPassesArrangementFilter } from '../../audiotool/arrangement/arrangementTrackFilter';
import {
  arrangementLanesGlslSuffix,
  readArrangementLanesPackOptions,
  resolveVisibleTracks,
  type ArrangementLanesPackOptions,
} from './packArrangementRegionsForGlsl';

/** GLSL/WGSL struct name per arrangement-notes instance (underscore-free tail for stable renaming). */
export function arrangementNotesEvalStructName(nodeId: string): string {
  return `ArrangementNotesEvalOut${arrangementLanesGlslSuffix(nodeId).replace(/_/g, '')}`;
}

export type PackedArrangementNote = {
  startSeconds: number;
  endSeconds: number;
  pitch: number;
  velocity: number;
};

export type ArrangementNotesPackOptions = ArrangementLanesPackOptions & {
  /** 0 = single global pitch band (overlap); 1 = stacked horizontal lanes per note track (height ∝ track pitch span). */
  trackLayout: number;
};

export function readArrangementNotesPackOptions(node: NodeInstance): ArrangementNotesPackOptions {
  const base = readArrangementLanesPackOptions(node);
  const trackLayout = Number(node.parameters.trackLayout ?? 0);
  return { ...base, trackLayout: trackLayout === 1 ? 1 : 0 };
}

export type ArrangementNotesPackResult = {
  notes: PackedArrangementNote[];
  /** Per-note composite 0…1 along the pitch axis before padding (`pitchPos = pp + pitchBand * pitchYNorms[i]`). */
  pitchYNorms: number[];
  pitchMin: number;
  pitchMax: number;
};

type ScratchNote = {
  startSeconds: number;
  endSeconds: number;
  pitch: number;
  velocity: number;
  trackId: string;
};

const MIN_SEMITONE_SPAN = 1;

function syntheticNoteTrack(id: string): ArrangementTrack {
  return { id, kind: 'note', orderAmongTracks: 1_000_000, enabled: true };
}

/** Ordered note tracks that have at least one packed note, plus snapshot order; unknown ids append last. */
function orderedNoteTracksForLanes(
  snapshot: ArrangementSnapshot,
  options: ArrangementLanesPackOptions,
  trackIdsInNotes: Set<string>
): ArrangementTrack[] {
  const visible = resolveVisibleTracks(snapshot, options).filter((t) => t.kind === 'note');
  const byId = new Map(snapshot.tracks.map((t) => [t.id, t]));
  const primary: ArrangementTrack[] = [];
  for (const t of visible) {
    if (trackIdsInNotes.has(t.id)) primary.push(t);
  }
  const orphans: ArrangementTrack[] = [];
  for (const id of trackIdsInNotes) {
    if (primary.some((t) => t.id === id)) continue;
    const known = byId.get(id);
    orphans.push(known?.kind === 'note' ? known : syntheticNoteTrack(id));
  }
  orphans.sort((a, b) => {
    const o = a.orderAmongTracks - b.orderAmongTracks;
    return o !== 0 ? o : a.id.localeCompare(b.id);
  });
  return [...primary, ...orphans];
}

function scratchFromSnapshotNote(note: ArrangementNote, endSeconds: number): ScratchNote {
  return {
    startSeconds: note.startSeconds,
    endSeconds,
    pitch: note.pitch,
    velocity: note.velocity,
    trackId: note.trackId,
  };
}

function pitchRangeByTrack(rows: ScratchNote[]): Map<string, { min: number; max: number }> {
  const m = new Map<string, { min: number; max: number }>();
  for (const r of rows) {
    const cur = m.get(r.trackId);
    if (!cur) {
      m.set(r.trackId, { min: r.pitch, max: r.pitch });
    } else {
      cur.min = Math.min(cur.min, r.pitch);
      cur.max = Math.max(cur.max, r.pitch);
    }
  }
  return m;
}

function overlapPitchYNorms(rows: ScratchNote[], pitchMin: number, pitchMax: number): number[] {
  const span = Math.max(MIN_SEMITONE_SPAN, pitchMax - pitchMin);
  return rows.map((r) => (r.pitch - pitchMin) / span);
}

function lanePitchYNorms(snapshot: ArrangementSnapshot, rows: ScratchNote[], options: ArrangementLanesPackOptions): number[] {
  const trackIds = new Set(rows.map((r) => r.trackId));
  const orderedTracks = orderedNoteTracksForLanes(snapshot, options, trackIds);
  const range = pitchRangeByTrack(rows);
  let sumSpans = 0;
  const spanById = new Map<string, number>();
  for (const t of orderedTracks) {
    const pr = range.get(t.id);
    if (!pr) continue;
    const span = Math.max(MIN_SEMITONE_SPAN, pr.max - pr.min);
    spanById.set(t.id, span);
    sumSpans += span;
  }
  if (sumSpans <= 0) {
    return overlapPitchYNorms(rows, Math.min(...rows.map((r) => r.pitch)), Math.max(...rows.map((r) => r.pitch)));
  }
  const cumBase = new Map<string, number>();
  const fracById = new Map<string, number>();
  let cum = 0;
  for (const t of orderedTracks) {
    const span = spanById.get(t.id);
    if (span == null) continue;
    const frac = span / sumSpans;
    cumBase.set(t.id, cum);
    fracById.set(t.id, frac);
    cum += frac;
  }
  return rows.map((r) => {
    const pr = range.get(r.trackId)!;
    const span = spanById.get(r.trackId)!;
    const frac = fracById.get(r.trackId)!;
    const base = cumBase.get(r.trackId) ?? 0;
    const local = (r.pitch - pr.min) / span;
    return base + frac * local;
  });
}

/**
 * Filter and pack notes from an arrangement snapshot for GPU/GLSL baking.
 * Caps at {@link MAX_ARRANGEMENT_NOTES_PACKED}.
 */
export function packArrangementNotesForGlsl(
  snapshot: ArrangementSnapshot | undefined,
  options: ArrangementNotesPackOptions
): ArrangementNotesPackResult {
  if (!snapshot?.notes?.length) {
    return { notes: [], pitchYNorms: [], pitchMin: 36, pitchMax: 84 };
  }

  const scratch: ScratchNote[] = [];

  for (const note of snapshot.notes) {
    if (
      !trackPassesArrangementFilter(note.trackId, snapshot, options.trackFilterMode, options.trackFilterList)
    ) {
      continue;
    }
    const endSeconds = note.startSeconds + note.durationSeconds;
    scratch.push(scratchFromSnapshotNote(note, endSeconds));
    if (scratch.length >= MAX_ARRANGEMENT_NOTES_PACKED) break;
  }

  if (scratch.length === 0) {
    return { notes: [], pitchYNorms: [], pitchMin: 36, pitchMax: 84 };
  }

  let pitchMin = 127;
  let pitchMax = 0;
  for (const row of scratch) {
    pitchMin = Math.min(pitchMin, row.pitch);
    pitchMax = Math.max(pitchMax, row.pitch);
  }

  const laneMode = options.trackLayout === 1;
  const pitchYNorms = laneMode
    ? lanePitchYNorms(snapshot, scratch, options)
    : overlapPitchYNorms(scratch, pitchMin, pitchMax);

  const zipped = scratch.map((row, i) => ({
    row,
    pitchYNorm: pitchYNorms[i] ?? 0,
  }));

  zipped.sort(
    (a, b) => a.row.startSeconds - b.row.startSeconds || a.row.pitch - b.row.pitch || a.row.trackId.localeCompare(b.row.trackId)
  );

  const notes: PackedArrangementNote[] = zipped.map(({ row }) => ({
    startSeconds: row.startSeconds,
    endSeconds: row.endSeconds,
    pitch: row.pitch,
    velocity: row.velocity,
  }));
  const sortedYNorms = zipped.map((z) => z.pitchYNorm);

  return { notes, pitchYNorms: sortedYNorms, pitchMin, pitchMax };
}

export function filterNotesForNode(
  snapshot: ArrangementSnapshot | undefined,
  node: NodeInstance
): ArrangementNotesPackResult {
  return packArrangementNotesForGlsl(snapshot, readArrangementNotesPackOptions(node));
}

function fmtGlslFloat(v: number): string {
  if (!Number.isFinite(v)) return '0.0';
  const s = v.toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
}

function fmtWgslFloat(v: number): string {
  return fmtGlslFloat(v);
}

export function buildArrangementNotesGlslBake(nodeId: string, packed: ArrangementNotesPackResult): string {
  const suffix = arrangementLanesGlslSuffix(nodeId);
  const count = packed.notes.length;
  const lines: string[] = [`const int ARR_NOTE_COUNT_${suffix} = ${count};`];

  if (count === 0) {
    lines.push(`const vec4 ARR_NOTES_${suffix}[1] = vec4[1](vec4(0.0));`);
    lines.push(`const float ARR_NOTE_Y_NORM_${suffix}[1] = float[1](0.0);`);
  } else {
    const entries = packed.notes.map(
      (n) =>
        `vec4(${fmtGlslFloat(n.startSeconds)}, ${fmtGlslFloat(n.endSeconds)}, ${fmtGlslFloat(n.pitch)}, ${fmtGlslFloat(n.velocity)})`
    );
    lines.push(`const vec4 ARR_NOTES_${suffix}[${count}] = vec4[${count}](${entries.join(', ')});`);
    const yEntries = packed.pitchYNorms.map((y) => fmtGlslFloat(y));
    lines.push(`const float ARR_NOTE_Y_NORM_${suffix}[${count}] = float[${count}](${yEntries.join(', ')});`);
  }

  return lines.join('\n');
}

const ARRANGEMENT_NOTES_BAKE_PLACEHOLDER = '{{ARRANGEMENT_NOTES_BAKE}}';
const NODE_SUFFIX_PLACEHOLDER = '{{NODE_SUFFIX}}';
const ARR_NOTES_EVAL_STRUCT_PLACEHOLDER = '{{ARR_NOTES_EVAL_STRUCT}}';

export function injectArrangementNotesNodeFunctions(
  funcCode: string,
  node: NodeInstance,
  snapshot: ArrangementSnapshot | undefined
): string {
  const suffix = arrangementLanesGlslSuffix(node.id);
  const options = readArrangementNotesPackOptions(node);
  const packed = packArrangementNotesForGlsl(snapshot, options);
  logArrangementNotesBakeDiagnostics(
    node.id,
    snapshot,
    packed,
    options.trackFilterMode,
    options.trackFilterList
  );
  const bake = buildArrangementNotesGlslBake(node.id, packed);
  const evalStruct = arrangementNotesEvalStructName(node.id);
  return funcCode
    .replace(ARRANGEMENT_NOTES_BAKE_PLACEHOLDER, bake)
    .replaceAll(NODE_SUFFIX_PLACEHOLDER, suffix)
    .replaceAll(ARR_NOTES_EVAL_STRUCT_PLACEHOLDER, evalStruct);
}

export function buildArrangementNotesWgslNodeHelper(
  nodeId: string,
  packed: ArrangementNotesPackResult
): string {
  const suffix = arrangementLanesGlslSuffix(nodeId);
  const evalStruct = arrangementNotesEvalStructName(nodeId);
  const count = packed.notes.length;
  const arraySize = Math.max(1, count);
  const lines: string[] = [`const ARR_NOTE_COUNT_${suffix}: i32 = ${count};`];

  if (count === 0) {
    lines.push(`const ARR_NOTES_${suffix}: array<vec4<f32>, 1> = array<vec4<f32>, 1>(vec4<f32>(0.0));`);
    lines.push(`const ARR_NOTE_Y_NORM_${suffix}: array<f32, 1> = array<f32, 1>(0.0);`);
  } else {
    const entries = packed.notes.map(
      (n) =>
        `vec4<f32>(${fmtWgslFloat(n.startSeconds)}, ${fmtWgslFloat(n.endSeconds)}, ${fmtWgslFloat(n.pitch)}, ${fmtWgslFloat(n.velocity)})`
    );
    lines.push(
      `const ARR_NOTES_${suffix}: array<vec4<f32>, ${arraySize}> = array<vec4<f32>, ${arraySize}>(${entries.join(', ')});`
    );
    const yParts = packed.pitchYNorms.map((y) => fmtWgslFloat(y));
    lines.push(
      `const ARR_NOTE_Y_NORM_${suffix}: array<f32, ${arraySize}> = array<f32, ${arraySize}>(${yParts.join(', ')});`
    );
  }

  lines.push(`struct ${evalStruct} {
  color: vec4<f32>,
  mask: f32,
}

fn evalArrangementNotes_${suffix}(
  uv: vec2<f32>,
  timelineTime: f32,
  windowSeconds: f32,
  timelineAnchor: f32,
  noteSize: f32,
  velocityScale: f32,
  edgeFade: f32,
  opacity: f32,
  backgroundRgb: vec3<f32>,
  layoutOrientation: f32,
  pitchPadding: f32,
  rowGap: f32,
  playheadShow: f32,
  playheadOklch: vec3<f32>
) -> ${evalStruct} {
  let uvN = arrangementNotesUvFromPWgsl(uv);
  let timeCoord = select(uvN.y, uvN.x, layoutOrientation < 0.5);
  let pitchCoord = select(uvN.x, uvN.y, layoutOrientation < 0.5);
  let windowStart = select(
    timelineTime,
    timelineTime - windowSeconds * 0.5,
    timelineAnchor < 0.5
  );
  let timeAtAxis = windowStart + clamp(timeCoord, 0.0, 1.0) * max(windowSeconds, 0.0001);
  let pp = clamp(pitchPadding, 0.0, 0.49);
  let pitchBand = max(1.0 - 2.0 * pp, 0.0001);
  var color = backgroundRgb;
  var alpha: f32 = 0.0;
  let halfNote = noteSize * 0.5;

  for (var i: i32 = 0; i < ${MAX_ARRANGEMENT_NOTES_PACKED}; i++) {
    if (i >= ARR_NOTE_COUNT_${suffix}) {
      break;
    }
    let note = ARR_NOTES_${suffix}[i];
    if (timeAtAxis < note.x || timeAtAxis > note.y) {
      continue;
    }
    let pitchPos = pp + pitchBand * ARR_NOTE_Y_NORM_${suffix}[i];
    let rowDist = abs(pitchCoord - pitchPos);
    let hr = max(halfNote - rowGap, 0.0001);
    if (rowDist > hr) {
      continue;
    }
    let vel = clamp(note.w * velocityScale, 0.0, 1.0);
    let rowFade = (1.0 - smoothstep(hr * 0.55, hr, rowDist)) * vel;
    let hue = fract(note.z * 0.024 + 0.12);
    let noteRgb = vec3<f32>(
      0.55 + 0.45 * cos(6.28318 * (hue + 0.0)),
      0.55 + 0.45 * cos(6.28318 * (hue + 0.33)),
      0.55 + 0.45 * cos(6.28318 * (hue + 0.66))
    );
    color = mix(color, noteRgb, rowFade);
    alpha = max(alpha, rowFade);
  }

  let playheadT = select(0.0, 0.5, timelineAnchor < 0.5);
  if (playheadShow >= 0.5) {
    let playheadDist = abs(timeCoord - playheadT);
    let playheadWidth = max(fwidth(timeCoord), 0.001) * 1.25;
    let playheadLine = 1.0 - smoothstep(playheadWidth * 0.5, playheadWidth, playheadDist);
    if (playheadLine > 0.0) {
      let playheadRgb = arrangementNotesOklchToRgbWgsl(playheadOklch);
      color = mix(color, playheadRgb, playheadLine);
      alpha = max(alpha, playheadLine);
    }
  }

  let edge = arrangementNotesEdgeFadeWgsl(uvN, edgeFade);
  let outWeight = alpha * opacity * edge;
  var out: ${evalStruct};
  out.color = vec4<f32>(color, outWeight);
  out.mask = outWeight;
  return out;
}
`);

  return lines.join('\n');
}
