import type { PreviewDependencyMask } from './types';

/**
 * Opt-in URL flag: `?webgpuPreviewDependencyClock=1|true|yes`
 * Lets WebGPU preview pass {@link PreviewDependencyMask} into {@link TimeManager} so paused graphs
 * can skip full-rate work — **default off** because mask inference has historically missed motion
 * (see `RuntimeManager.setTime`). When disabled or uncertain, callers should pass `null` (full-rate).
 */
export function parseUrlWebGpuPreviewDependencyClockMask(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = new URLSearchParams(window.location.search).get('webgpuPreviewDependencyClock')?.trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  } catch {
    return false;
  }
}

/** @internal Vitest — parse from a query string without `window`. */
export function parseWebGpuPreviewDependencyClockMaskFromSearch(search: string): boolean {
  const raw = new URLSearchParams(search).get('webgpuPreviewDependencyClock')?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * When the experimental WebGPU clock mask is enabled, return the compiled mask only if it is
 * internally consistent enough for {@link TimeManager} (fail-open to `null` = legacy full-rate).
 */
export function resolveWebGpuPreviewDependencyMaskForClock(
  experimentalMaskEnabled: boolean,
  mask: PreviewDependencyMask | null,
  audioPrimaryPresent: boolean
): PreviewDependencyMask | null {
  if (!experimentalMaskEnabled) return null;
  if (mask == null) return null;

  const drivesClock = mask.usesWallTime || mask.usesTimelineTime;

  if (!drivesClock) {
    if (mask.usesAudioUniforms) return null;
    if (mask.usesRadialPulseSpawnUniformPass) return null;
    if (mask.usesFrameIndex) return null;
    if (audioPrimaryPresent) return null;
  }

  return mask;
}
