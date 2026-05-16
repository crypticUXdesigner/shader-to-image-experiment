import type { ArrangementSnapshot, ArrangementTrackKind } from './types';

export type ArrangementTrackFilterRow = {
  id: string;
  label: string;
  kind: ArrangementTrackKind;
  enabled: boolean;
  noteCount: number;
  regionCount: number;
};

export type ArrangementTrackFilterListOptions = {
  /** Include only these track kinds (default: all kinds). */
  kinds?: ReadonlySet<ArrangementTrackKind>;
  /** Omit tracks with zero notes and zero regions in the snapshot. */
  hideEmpty?: boolean;
};

/** Comma-separated ids in document order (first occurrence wins; duplicates trimmed). */
export function parseTrackFilterListOrdered(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw.split(',').map((s) => s.trim())) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function parseTrackFilterList(raw: string): Set<string> {
  return new Set(parseTrackFilterListOrdered(raw));
}

export function serializeTrackFilterList(ids: Iterable<string>): string {
  return [...ids].join(',');
}

/** Dedupe preserving first occurrence — used before persisting filters. */
export function normalizeOrderedTrackIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id.trim()) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function countNotesPerTrack(snapshot: ArrangementSnapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of snapshot.notes ?? []) {
    counts.set(note.trackId, (counts.get(note.trackId) ?? 0) + 1);
  }
  return counts;
}

function countRegionsPerTrack(snapshot: ArrangementSnapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const region of snapshot.regions) {
    if (!region.enabled) continue;
    counts.set(region.trackId, (counts.get(region.trackId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Tracks shown in the arrangement filter UI, in DAW order.
 */
export function listArrangementTracksForFilter(
  snapshot: ArrangementSnapshot | undefined,
  options: ArrangementTrackFilterListOptions = {}
): ArrangementTrackFilterRow[] {
  if (!snapshot) return [];

  const noteCounts = countNotesPerTrack(snapshot);
  const regionCounts = countRegionsPerTrack(snapshot);
  const kinds = options.kinds;

  const rows: ArrangementTrackFilterRow[] = [];
  for (const track of snapshot.tracks) {
    if (!track.enabled) continue;
    if (kinds !== undefined && !kinds.has(track.kind)) continue;

    const noteCount = noteCounts.get(track.id) ?? 0;
    const regionCount = regionCounts.get(track.id) ?? 0;
    if (options.hideEmpty && noteCount === 0 && regionCount === 0) continue;

    rows.push({
      id: track.id,
      label: track.label?.trim() ? track.label.trim() : track.id,
      kind: track.kind,
      enabled: track.enabled,
      noteCount,
      regionCount,
    });
  }

  rows.sort((a, b) => {
    const trackA = snapshot.tracks.find((t) => t.id === a.id);
    const trackB = snapshot.tracks.find((t) => t.id === b.id);
    return (trackA?.orderAmongTracks ?? 0) - (trackB?.orderAmongTracks ?? 0);
  });

  return rows;
}

export function readSelectedTrackIds(
  trackFilterMode: number,
  trackFilterList: string,
  allTrackIds: readonly string[]
): Set<string> {
  if (trackFilterMode !== 1) {
    return new Set(allTrackIds);
  }
  return parseTrackFilterList(trackFilterList);
}

/**
 * @param orderedSelectedIds — selection order defines lane/stack order when `trackFilterMode === 1`.
 */
export function buildTrackFilterParams(
  orderedSelectedIds: readonly string[],
  allTrackIds: readonly string[]
): { trackFilterMode: number; trackFilterList: string } {
  if (allTrackIds.length === 0) {
    return { trackFilterMode: 0, trackFilterList: '' };
  }
  const allSet = new Set(allTrackIds);
  const normalized = normalizeOrderedTrackIds(orderedSelectedIds).filter((id) => allSet.has(id));
  if (normalized.length === 0) {
    return { trackFilterMode: 1, trackFilterList: '' };
  }
  const selectedSet = new Set(normalized);
  const allSelected =
    normalized.length === allTrackIds.length && allTrackIds.every((id) => selectedSet.has(id));
  if (allSelected) {
    return { trackFilterMode: 0, trackFilterList: '' };
  }
  return {
    trackFilterMode: 1,
    trackFilterList: serializeTrackFilterList(normalized),
  };
}

export function arrangementTrackFilterButtonLabel(
  rows: readonly ArrangementTrackFilterRow[],
  selectedIds: Set<string>
): string {
  if (rows.length === 0) return 'No tracks';
  const allIds = rows.map((r) => r.id);
  if (selectedIds.size === 0) return 'No tracks';
  if (selectedIds.size >= allIds.length && allIds.every((id) => selectedIds.has(id))) {
    return rows.length === 1 ? 'All tracks' : `All tracks (${rows.length})`;
  }
  return `${selectedIds.size} / ${rows.length} tracks`;
}

export function trackPassesArrangementFilter(
  trackId: string,
  snapshot: ArrangementSnapshot,
  trackFilterMode: number,
  trackFilterList: string
): boolean {
  if (trackFilterMode !== 1) return true;
  const allow = parseTrackFilterList(trackFilterList);
  if (allow.size === 0) return false;
  const track = snapshot.tracks.find((t) => t.id === trackId);
  return track !== undefined && track.enabled && allow.has(track.id);
}
