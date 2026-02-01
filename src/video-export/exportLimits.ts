/**
 * Video export limits - used to validate config and throw clear errors when
 * buffer size, resolution, or frame count would exceed browser/API limits.
 */

/** Max canvas width/height many WebGL/VideoEncoder implementations support. */
export const MAX_EXPORT_WIDTH = 4096;
export const MAX_EXPORT_HEIGHT = 4096;

/** Max number of frames (avoids runaway exports and encoder issues). */
export const MAX_EXPORT_FRAMES = 2 ** 20; // ~2.4 h at 120 fps

/**
 * Max samples per frame for per-frame OfflineAudioContext buffers.
 * Very low frame rates can make samplesPerFrame huge; browsers limit OfflineAudioContext length.
 */
export const MAX_SAMPLES_PER_FRAME = 2 ** 24;

/**
 * Max byte length for the final muxed output buffer.
 * TypedArray length is at most 2^31 - 1 in V8; stay under to avoid RangeError.
 */
export const MAX_EXPORT_BUFFER_BYTES = 2 ** 31 - 1;

export interface ExportLimitErrorOptions {
  limitName: string;
  limitValue: number;
  actualValue: number;
  hint?: string;
}

/**
 * Build a clear error message when an export limit is exceeded.
 */
export function formatExportLimitError({
  limitName,
  limitValue,
  actualValue,
  hint,
}: ExportLimitErrorOptions): string {
  let msg = `Video export: ${limitName} exceeded (limit ${limitName}: ${limitValue}, got ${actualValue}).`;
  if (hint) msg += ` ${hint}`;
  return msg;
}
