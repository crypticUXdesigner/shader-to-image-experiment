/**
 * Tracks data from public/tracks-data.json.
 * Provides playlist order (alphabetical by displayName) and track URL by id.
 */

import { getAudiotoolPlaylistTrackPlaybackUrl } from '../utils/audiotoolPlaylistPlaybackUrls';
import type { PlaylistPrimarySource } from '../data-model/audioSetupTypes';

export interface TrackEntry {
  name: string;
  displayName: string;
  mp3Url: string;
  playDuration?: string;
  [key: string]: unknown;
}

export type TracksDataMap = Record<string, TrackEntry>;

let cached: TracksDataMap | null = null;

/** Avoid hanging project open / playlist flows when `tracks-data.json` never completes (offline, proxy, etc.). */
const TRACKS_DATA_FETCH_TIMEOUT_MS = 12_000;

/**
 * Base URL for static assets (matches Vite base, e.g. /ShaderNoice/).
 * Relative fetch would use document URL; we use BASE_URL so it works with any base path.
 */
function getTracksDataUrl(): string {
  try {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '';
    return `${base.replace(/\/$/, '')}/tracks-data.json`;
  } catch {
    return '/tracks-data.json';
  }
}

/**
 * Fetch and cache tracks-data.json. Returns cached map after first load.
 */
export async function getTracksData(): Promise<TracksDataMap> {
  if (cached) return cached;
  const url = getTracksDataUrl();
  const controller = new AbortController();
  const timeoutId =
    typeof setTimeout !== 'undefined'
      ? setTimeout(() => controller.abort(), TRACKS_DATA_FETCH_TIMEOUT_MS)
      : 0;
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (e) {
    const cause = e instanceof Error ? e : undefined;
    if (cause?.name === 'AbortError') {
      throw new Error(`Timed out loading tracks catalog (${TRACKS_DATA_FETCH_TIMEOUT_MS}ms): ${url}`, {
        cause
      });
    }
    throw e instanceof Error ? e : new Error(String(e), { cause: e });
  } finally {
    if (timeoutId !== 0) clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error(`Failed to load tracks-data: ${res.status}`);
  const data = (await res.json()) as TracksDataMap;
  cached = data;
  return data;
}

/**
 * Get track entry by id (e.g. "tracks/xyz").
 */
export function getTrackById(data: TracksDataMap, trackId: string): TrackEntry | undefined {
  return data[trackId];
}

/**
 * Get mp3 URL for a track id. Returns undefined if track not found.
 */
export function getTrackMp3Url(data: TracksDataMap, trackId: string): string | undefined {
  return getTrackById(data, trackId)?.mp3Url;
}

/** Matches bundled `tracks-data.json` entries and Audiotool’s public CDN layout. */
const AUDIOTOOL_TRACK_CDN_BASE = 'https://cdn.audiotool.com';

/**
 * MP3 URL on Audiotool’s CDN for a track resource name (e.g. `tracks/xk9…`).
 * Used when the track is not listed in bundled `tracks-data.json` (e.g. signed-in user’s published tracks).
 * May fail at fetch time if the track is private or CDN policy blocks the request (reported via AudioLoader).
 */
export function getAudiotoolCdnTrackMp3Url(trackId: string): string | undefined {
  const id = trackId.trim();
  if (!id.startsWith('tracks/')) return undefined;
  const path = id.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  return `${AUDIOTOOL_TRACK_CDN_BASE}/${path}/track.mp3`;
}

export type PlaylistTrackMp3Source = 'bundled' | 'registry' | 'cdn';

/**
 * Resolve playlist mp3 URL with resolution tier (bundled catalog → session registry → heuristic CDN).
 */
export function resolvePlaylistTrackMp3UrlWithSource(
  data: TracksDataMap,
  trackId: string
): { url: string; source: PlaylistTrackMp3Source } | { url: undefined; source: 'none' } {
  const bundled = getTrackMp3Url(data, trackId);
  if (bundled) return { url: bundled, source: 'bundled' };
  const reg = getAudiotoolPlaylistTrackPlaybackUrl(trackId);
  if (reg) return { url: reg, source: 'registry' };
  const cdn = getAudiotoolCdnTrackMp3Url(trackId);
  if (cdn) return { url: cdn, source: 'cdn' };
  return { url: undefined, source: 'none' };
}

/**
 * Resolve a URL suitable for `AudioLoader` (full file: mp3/wav/ogg — not HLS).
 * Order: bundled `tracks-data.json` → URLs from Audiotool Track API (registry) → legacy CDN path (often 404 for newer tracks).
 */
export function resolvePlaylistTrackMp3Url(data: TracksDataMap, trackId: string): string | undefined {
  const r = resolvePlaylistTrackMp3UrlWithSource(data, trackId);
  return r.url;
}

/**
 * Parse playDuration string (e.g. "123.45s" or "0.010s") to seconds. Returns undefined if missing or invalid.
 */
export function parsePlayDurationSeconds(playDuration: string | undefined): number | undefined {
  if (playDuration == null || playDuration === '') return undefined;
  const s = playDuration.trim().replace(/s$/i, '');
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Get track duration in seconds from tracks-data (from playDuration). Returns undefined if not found or invalid.
 */
export async function getTrackDurationSeconds(trackId: string): Promise<number | undefined> {
  const data = await getTracksData();
  const entry = getTrackById(data, trackId);
  return parsePlayDurationSeconds(entry?.playDuration);
}

/**
 * Build playlist order: all track ids from tracks-data, sorted alphabetically by displayName.
 */
export function getPlaylistOrder(data: TracksDataMap): string[] {
  const ids = Object.keys(data);
  return ids.slice().sort((a, b) => {
    const nameA = (data[a]?.displayName ?? data[a]?.name ?? a).toLowerCase();
    const nameB = (data[b]?.displayName ?? data[b]?.name ?? b).toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

/** Primary playlist entry inferred from bundled `tracks-data` (display metadata for reload/offline labeling). */
export function playlistPrimaryFromBundledCatalog(trackId: string, data: TracksDataMap): PlaylistPrimarySource {
  const entry = data[trackId];
  const dn =
    typeof entry?.displayName === 'string'
      ? entry.displayName.trim()
      : typeof entry?.name === 'string'
        ? entry.name.trim()
        : '';
  const now = new Date().toISOString();
  if (dn.length > 0) {
    return {
      type: 'playlist',
      trackId,
      displayName: dn,
      displayNameSource: 'bundled',
      displayNameUpdatedAt: now,
    };
  }
  return { type: 'playlist', trackId };
}
