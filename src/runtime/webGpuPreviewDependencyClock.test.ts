import { describe, it, expect } from 'vitest';
import {
  parseWebGpuPreviewDependencyClockMaskFromSearch,
  resolveWebGpuPreviewDependencyMaskForClock,
} from './webGpuPreviewDependencyClock';
import type { PreviewDependencyMask } from './types';

function mask(partial: Partial<PreviewDependencyMask>): PreviewDependencyMask {
  return {
    usesWallTime: false,
    usesTimelineTime: false,
    usesAudioUniforms: false,
    usesRadialPulseVirtualDrive: false,
    usesRadialPulseSpawnUniformPass: false,
    usesResolutionUniform: false,
    usesMouseUniforms: false,
    usesFrameIndex: false,
    ...partial,
  };
}

/**
 * Mirrors `TimeManager.updateTime` deps: usesWallTime, usesTimelineTime, usesFrameIndex,
 * usesRadialPulseSpawnUniformPass, usesAudioUniforms. Nested blocks map resolver
 * acceptance (same mask vs null) to those fields.
 */
describe('resolveWebGpuPreviewDependencyMaskForClock', () => {
  it('returns null when experimental flag is off', () => {
    const m = mask({ usesWallTime: true });
    expect(resolveWebGpuPreviewDependencyMaskForClock(false, m, false)).toBeNull();
    expect(resolveWebGpuPreviewDependencyMaskForClock(false, null, false)).toBeNull();
  });

  it('returns null when mask is null', () => {
    expect(resolveWebGpuPreviewDependencyMaskForClock(true, null, false)).toBeNull();
  });

  describe('usesWallTime (TimeManager wall/timeline driver)', () => {
    it('accepts mask when wall time drives clock (flag on)', () => {
      const m = mask({ usesWallTime: true, usesAudioUniforms: true });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBe(m);
    });

    it('accepts mask when wall time drives clock even if primary audio is present', () => {
      const m = mask({ usesWallTime: true, usesTimelineTime: false });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, true)).toBe(m);
    });
  });

  describe('usesTimelineTime (TimeManager wall/timeline driver)', () => {
    it('accepts mask when only timeline drives clock', () => {
      const m = mask({ usesWallTime: false, usesTimelineTime: true });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBe(m);
    });

    it('accepts mask when timeline drives clock even if audio uniforms would otherwise force fail-open', () => {
      const m = mask({
        usesWallTime: false,
        usesTimelineTime: true,
        usesAudioUniforms: true,
      });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBe(m);
    });
  });

  describe('usesAudioUniforms', () => {
    it('fail-opens (null) when audio uniforms without wall or timeline clock', () => {
      const m = mask({ usesAudioUniforms: true, usesWallTime: false, usesTimelineTime: false });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBeNull();
    });

    it('accepts mask when audio uniforms and wall clock both set', () => {
      const m = mask({ usesAudioUniforms: true, usesWallTime: true, usesTimelineTime: false });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBe(m);
    });
  });

  describe('usesRadialPulseSpawnUniformPass', () => {
    it('fail-opens when radial spawn pass without wall or timeline clock', () => {
      const m = mask({ usesRadialPulseSpawnUniformPass: true, usesWallTime: false, usesTimelineTime: false });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBeNull();
    });

    it('accepts mask when radial spawn pass and wall clock both set', () => {
      const m = mask({
        usesWallTime: true,
        usesRadialPulseSpawnUniformPass: true,
        usesTimelineTime: false,
      });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBe(m);
    });
  });

  describe('usesFrameIndex', () => {
    it('fail-opens when frame index without wall or timeline clock', () => {
      const m = mask({ usesFrameIndex: true, usesWallTime: false, usesTimelineTime: false });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBeNull();
    });

    it('accepts mask when frame index and wall clock both set', () => {
      const m = mask({ usesWallTime: true, usesFrameIndex: true, usesTimelineTime: false });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBe(m);
    });
  });

  describe('audioPrimaryPresent (conservative; mask may omit usesAudioUniforms)', () => {
    it('fail-opens when primary audio present without wall or timeline clock', () => {
      const m = mask({ usesWallTime: false, usesTimelineTime: false, usesAudioUniforms: false });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, true)).toBeNull();
    });

    it('allows static mask when nothing risky and no primary audio', () => {
      const m = mask({ usesWallTime: false, usesTimelineTime: false });
      expect(resolveWebGpuPreviewDependencyMaskForClock(true, m, false)).toBe(m);
    });
  });
});

describe('parseWebGpuPreviewDependencyClockMaskFromSearch', () => {
  it('parses affirmative query values', () => {
    expect(parseWebGpuPreviewDependencyClockMaskFromSearch('?webgpuPreviewDependencyClock=1')).toBe(true);
    expect(parseWebGpuPreviewDependencyClockMaskFromSearch('?webgpuPreviewDependencyClock=true')).toBe(true);
    expect(parseWebGpuPreviewDependencyClockMaskFromSearch('?webgpuPreviewDependencyClock=yes')).toBe(true);
  });

  it('defaults to false', () => {
    expect(parseWebGpuPreviewDependencyClockMaskFromSearch('')).toBe(false);
    expect(parseWebGpuPreviewDependencyClockMaskFromSearch('?webgpuPreviewDependencyClock=0')).toBe(false);
    expect(parseWebGpuPreviewDependencyClockMaskFromSearch('?other=1')).toBe(false);
  });
});
