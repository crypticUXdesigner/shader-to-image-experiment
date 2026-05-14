import { describe, expect, it } from 'vitest';
import { getParameterEnumMappings } from './parameterEnumMappings';

describe('getParameterEnumMappings', () => {
  it('maps oscillator-2d layerCombine to merge mode labels', () => {
    const m = getParameterEnumMappings('oscillator-2d', 'layerCombine');
    expect(m).not.toBeNull();
    expect(m![0]).toBe('Sum');
    expect(m![1]).toBe('Normalized');
    expect(m![2]).toBe('Product');
    expect(m![3]).toBe('Max |·|');
  });

  it('maps triangle-grid triProjection to UV / infinite plane labels', () => {
    const m = getParameterEnumMappings('triangle-grid', 'triProjection');
    expect(m).not.toBeNull();
    expect(m![0]).toBe('Infinite plane');
    expect(m![1]).toBe('UV');
  });

  it('maps radial-uv-warp warpMode to mode labels', () => {
    const m = getParameterEnumMappings('radial-uv-warp', 'warpMode');
    expect(m).not.toBeNull();
    expect(m![0]).toBe('Bulge / pinch');
    expect(m![1]).toBe('Fisheye');
    expect(m![2]).toBe('Spherize');
  });

  it('maps displace displaceMode to vector vs directional labels', () => {
    const m = getParameterEnumMappings('displace', 'displaceMode');
    expect(m).not.toBeNull();
    expect(m![0]).toBe('Vector offset');
    expect(m![1]).toBe('Directional');
  });

  it('maps infinite-zoom infiniteZoomMotion to ping-pong vs snap labels', () => {
    const m = getParameterEnumMappings('infinite-zoom', 'infiniteZoomMotion');
    expect(m).not.toBeNull();
    expect(m![0]).toBe('Ping-pong loop');
    expect(m![1]).toBe('Snap zoom in');
    expect(m![2]).toBe('Snap zoom out');
  });

  it('maps uv-band-shift orientation to horizontal vs vertical labels', () => {
    const m = getParameterEnumMappings('uv-band-shift', 'uvBandShiftOrientation');
    expect(m).not.toBeNull();
    expect(m![0]).toBe('Horizontal');
    expect(m![1]).toBe('Vertical');
  });
});
