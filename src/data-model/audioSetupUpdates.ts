/**
 * Immutable Audio Setup Update Utilities
 *
 * Provides immutable update functions for AudioSetup.
 * All functions return new AudioSetup instances.
 */

import type {
  AudioSetup,
  AudioFileEntry,
  AudioBandEntry,
  AudioRemapperEntry,
  PrimarySource,
  PlaylistState,
} from './audioSetupTypes';
import { defaultRemapperEntryForBand, defaultRemapperIdForBand } from './audioBandRemapMigration';

function withDefaultBandMode(entry: AudioBandEntry): AudioBandEntry {
  if (entry.bandMode != null) return entry;
  return { ...entry, bandMode: 'mean' };
}

function copyFile(entry: AudioFileEntry): AudioFileEntry {
  return { ...entry };
}

function copyBand(entry: AudioBandEntry): AudioBandEntry {
  const normalized = withDefaultBandMode(entry);
  const band = entry.frequencyBands[0];
  const copy: [[number, number]] = band ? [[band[0], band[1]]] : [[0, 0]];
  return { ...normalized, frequencyBands: copy };
}

function copyRemapper(entry: AudioRemapperEntry): AudioRemapperEntry {
  return { ...entry };
}

export function addFile(setup: AudioSetup, file: AudioFileEntry): AudioSetup {
  return {
    ...setup,
    files: [copyFile(file), ...setup.files],
  };
}

export function updateFile(
  setup: AudioSetup,
  fileId: string,
  updater: (file: AudioFileEntry) => AudioFileEntry
): AudioSetup {
  const index = setup.files.findIndex((f) => f.id === fileId);
  if (index === -1) return setup;
  const newFiles = [...setup.files];
  newFiles[index] = updater(copyFile(setup.files[index]));
  return { ...setup, files: newFiles };
}

export function removeFile(setup: AudioSetup, fileId: string): AudioSetup {
  return {
    ...setup,
    files: setup.files.filter((f) => f.id !== fileId),
    bands: setup.bands.filter((b) => b.sourceFileId !== fileId),
    remappers: setup.remappers.filter((r) => {
      const band = setup.bands.find((b) => b.id === r.bandId);
      return band?.sourceFileId !== fileId;
    }),
  };
}

export function addBand(setup: AudioSetup, band: AudioBandEntry): AudioSetup {
  const copied = copyBand(band);
  const defaultId = defaultRemapperIdForBand(copied.id);
  const hasDefault = setup.remappers.some((r) => r.id === defaultId);
  const remappers = hasDefault
    ? setup.remappers
    : [copyRemapper(defaultRemapperEntryForBand(copied)), ...setup.remappers];
  return {
    ...setup,
    bands: [copied, ...setup.bands],
    remappers,
  };
}

export function updateBand(
  setup: AudioSetup,
  bandId: string,
  updater: (band: AudioBandEntry) => AudioBandEntry
): AudioSetup {
  const index = setup.bands.findIndex((b) => b.id === bandId);
  if (index === -1) return setup;
  const newBands = [...setup.bands];
  newBands[index] = updater(copyBand(setup.bands[index]));
  return { ...setup, bands: newBands };
}

export function removeBand(setup: AudioSetup, bandId: string): AudioSetup {
  return {
    ...setup,
    bands: setup.bands.filter((b) => b.id !== bandId),
    remappers: setup.remappers.filter((r) => r.bandId !== bandId),
  };
}

export function addRemapper(setup: AudioSetup, remapper: AudioRemapperEntry): AudioSetup {
  return {
    ...setup,
    remappers: [copyRemapper(remapper), ...setup.remappers],
  };
}

export function updateRemapper(
  setup: AudioSetup,
  remapperId: string,
  updater: (remapper: AudioRemapperEntry) => AudioRemapperEntry
): AudioSetup {
  const index = setup.remappers.findIndex((r) => r.id === remapperId);
  if (index === -1) return setup;
  const newRemappers = [...setup.remappers];
  newRemappers[index] = updater(copyRemapper(setup.remappers[index]));
  return { ...setup, remappers: newRemappers };
}

export function removeRemapper(setup: AudioSetup, remapperId: string): AudioSetup {
  return {
    ...setup,
    remappers: setup.remappers.filter((r) => r.id !== remapperId),
  };
}

// --- Primary source & playlist (playlist-waveform) ---

export function setPrimarySource(setup: AudioSetup, primarySource: PrimarySource | undefined): AudioSetup {
  return { ...setup, primarySource };
}

export function setPlaylistOrder(setup: AudioSetup, order: string[]): AudioSetup {
  const playlistState: PlaylistState = {
    order,
    currentIndex: setup.playlistState?.currentIndex ?? 0,
    loopCurrentTrack: setup.playlistState?.loopCurrentTrack ?? false,
  };
  return { ...setup, playlistState };
}

export function setPlaylistCurrentIndex(setup: AudioSetup, currentIndex: number): AudioSetup {
  const ps = setup.playlistState;
  if (!ps) return setup;
  const clamped = Math.max(0, Math.min(currentIndex, Math.max(0, ps.order.length - 1)));
  return { ...setup, playlistState: { ...ps, currentIndex: clamped } };
}

export function setLoopCurrentTrack(setup: AudioSetup, loopCurrentTrack: boolean): AudioSetup {
  const ps = setup.playlistState;
  if (!ps) return setup;
  return { ...setup, playlistState: { ...ps, loopCurrentTrack } };
}

/**
 * Retarget bands so they follow the new primary source.
 *
 * For now the design is “bands follow the active track”:
 * - Any band whose sourceFileId was the previous primary id is updated.
 * - Any band whose sourceFileId is a playlist track id (present in
 *   playlistState.order) is also updated to point at the new primary id.
 *
 * This keeps presets using playlists or uploads in sync when the user switches
 * tracks from the bottom bar, so remappers always listen to the currently
 * selected track instead of a stale one.
 */
export function retargetBandsToPrimary(
  setup: AudioSetup,
  prevPrimaryId: string | undefined,
  newPrimaryId: string | undefined,
): AudioSetup {
  if (!newPrimaryId || prevPrimaryId === newPrimaryId) {
    return setup;
  }

  const playlistIds = new Set(setup.playlistState?.order ?? []);

  const bandsChanged = setup.bands.some((b) => {
    if (prevPrimaryId && b.sourceFileId === prevPrimaryId) return true;
    if (playlistIds.size > 0 && playlistIds.has(b.sourceFileId)) return true;
    return false;
  });
  if (!bandsChanged) return setup;

  const bands = setup.bands.map((band) => {
    const shouldRetarget =
      (prevPrimaryId && band.sourceFileId === prevPrimaryId) ||
      (playlistIds.size > 0 && playlistIds.has(band.sourceFileId));
    if (!shouldRetarget) return band;

    const copy = copyBand(band);
    copy.sourceFileId = newPrimaryId;
    return copy;
  });

  return { ...setup, bands };
}
