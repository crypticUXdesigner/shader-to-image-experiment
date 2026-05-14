import { describe, it, expect } from 'vitest';
import { firstUnsupportedWebGpuMvpNodeType, isNodeTypeSupportedOnWebGpuMvp } from './webGpuMvpNodeSupport';

describe('webGpuMvpNodeSupport', () => {
  it('treats core math nodes as supported', () => {
    expect(isNodeTypeSupportedOnWebGpuMvp('time')).toBe(true);
    expect(isNodeTypeSupportedOnWebGpuMvp('add')).toBe(true);
  });

  it('treats pass-plan-only types as unsupported for MVP fullscreen allowlist', () => {
    expect(isNodeTypeSupportedOnWebGpuMvp('glow-bloom')).toBe(false);
  });

  it('firstUnsupportedWebGpuMvpNodeType returns first mismatch', () => {
    expect(firstUnsupportedWebGpuMvpNodeType(['time', 'glow-bloom', 'add'])).toBe('glow-bloom');
    expect(firstUnsupportedWebGpuMvpNodeType(['time'])).toBeUndefined();
  });
});
