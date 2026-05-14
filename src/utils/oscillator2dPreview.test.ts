import { describe, expect, it, vi, afterEach } from 'vitest';
import type { NodeInstance } from '../data-model/types';
import * as timeBase from './mixedWaveSignalPreview';
import { evaluateOscillator2dPortPreview } from './oscillator2dPreview';

function makeOscNode(overrides: Partial<NodeInstance['parameters']> = {}): NodeInstance {
  return {
    id: 'osc-test',
    type: 'oscillator-2d',
    position: { x: 0, y: 0 },
    parameters: {
      globalSpeed: 1,
      globalOffset: 0,
      layerCombine: 0,
      x1On: 1,
      x1Amp: 1,
      x1Freq: 0,
      x1Phase: 0,
      x2On: 0,
      x2Amp: 0,
      x2Freq: 1,
      x2Phase: 0,
      x3On: 0,
      x3Amp: 0,
      x3Freq: 1,
      x3Phase: 0,
      y1On: 1,
      y1Amp: 1,
      y1Freq: 0,
      y1Phase: 0,
      y2On: 0,
      y2Amp: 0,
      y2Freq: 1,
      y2Phase: 0,
      y3On: 0,
      y3Amp: 0,
      y3Freq: 1,
      y3Phase: 0,
      rotationSpeed: 0,
      rotationPhase: 0,
      rotWobbleAmp: 0,
      rotWobbleFreq: 0,
      rotWobblePhase: 0,
      offsetX: 0.25,
      offsetY: -0.5,
      ...overrides,
    },
  };
}

describe('evaluateOscillator2dPortPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('at fixed t matches rotated stack + offsetX / offsetY', () => {
    const spy = vi.spyOn(timeBase, 'getShaderTimeSeconds').mockReturnValue(0);
    const node = makeOscNode({
      x1Freq: 0,
      x1Phase: Math.PI / 2,
      x1Amp: 0.7,
      y1On: 0,
      y2On: 0,
      y3On: 0,
    });
    const x = evaluateOscillator2dPortPreview(node, 'x');
    expect(x).toBeCloseTo(0.25 + 0.7, 6);
    const y = evaluateOscillator2dPortPreview(node, 'y');
    expect(y).toBeCloseTo(-0.5, 6);
    expect(spy).toHaveBeenCalled();
  });

  it('changes with time when globalSpeed is non-zero', () => {
    const spy = vi.spyOn(timeBase, 'getShaderTimeSeconds');
    const node = makeOscNode({
      globalSpeed: 2,
      x1Freq: 1,
      x1Phase: 0,
      y1On: 0,
      y2On: 0,
      y3On: 0,
    });
    spy.mockReturnValue(0);
    const x0 = evaluateOscillator2dPortPreview(node, 'x');
    spy.mockReturnValue(0.25);
    const x1 = evaluateOscillator2dPortPreview(node, 'x');
    expect(x1).not.toBe(x0);
  });
});
