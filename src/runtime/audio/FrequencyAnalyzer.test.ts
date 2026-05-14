import { describe, expect, it } from 'vitest';
import type { AudioBandMode } from '../../data-model/audioSetupTypes';
import { FrequencyAnalyzer } from './FrequencyAnalyzer';

type FakeAnalyserNode = {
  frequencyBinCount: number;
  getByteFrequencyData: (data: Uint8Array) => void;
};

function makeFakeAnalyserNode(spectrum: Uint8Array): FakeAnalyserNode {
  return {
    frequencyBinCount: spectrum.length,
    getByteFrequencyData(data: Uint8Array) {
      data.set(spectrum);
    },
  };
}

describe('FrequencyAnalyzer band extraction modes', () => {
  it('computes mean/max/rms over band bins and normalizes to 0..1', () => {
    const sampleRate = 48_000;
    const fftSize = 8;
    const spectrum = new Uint8Array([10, 20, 30, 40]); // bins 0..3 (fftSize/2)
    const analyserNode = makeFakeAnalyserNode(spectrum) as unknown as AnalyserNode;

    const analyzer = new FrequencyAnalyzer({ getSampleRate: () => sampleRate } as any);
    const audioNodeStates = new Map<string, any>([
      [
        'f1',
        {
          analyserNode,
          frequencyData: new Uint8Array(spectrum.length),
        },
      ],
    ]);

    const band = { minHz: 0, maxHz: (3 / fftSize) * sampleRate };
    const bandModes = ['mean'] satisfies AudioBandMode[];
    const state = analyzer.createAnalyzer(
      'band-1',
      'f1',
      [band],
      [...bandModes],
      [0],
      undefined,
      undefined,
      fftSize,
      audioNodeStates.get('f1')
    );

    const previous = new Map<string, number>();
    analyzer.updateFrequencyAnalysis(audioNodeStates, null, previous, 0.00001, true);
    const meanUpdates = analyzer.updateFrequencyAnalysis(audioNodeStates, null, previous, 0.00001, true);
    expect(meanUpdates).toHaveLength(1);
    expect(meanUpdates[0]).toMatchObject({ nodeId: 'band-1', paramName: 'band' });
    const expectedMean01 = ((10 + 20 + 30 + 40) / 4) / 255;
    expect(meanUpdates[0]!.value).toBeCloseTo(expectedMean01, 6);

    state.bandModes[0] = 'max';
    analyzer.updateFrequencyAnalysis(audioNodeStates, null, previous, 0.00001, true);
    const maxUpdates = analyzer.updateFrequencyAnalysis(audioNodeStates, null, previous, 0.00001, true);
    const expectedMax01 = 40 / 255;
    expect(maxUpdates[0]!.value).toBeCloseTo(expectedMax01, 6);

    state.bandModes[0] = 'rms';
    analyzer.updateFrequencyAnalysis(audioNodeStates, null, previous, 0.00001, true);
    const rmsUpdates = analyzer.updateFrequencyAnalysis(audioNodeStates, null, previous, 0.00001, true);
    const expectedRms01 = Math.sqrt((10 * 10 + 20 * 20 + 30 * 30 + 40 * 40) / 4) / 255;
    expect(rmsUpdates[0]!.value).toBeCloseTo(expectedRms01, 6);
  });

  it('reuses the uniform-updates scratch array across consecutive updateFrequencyAnalysis calls', () => {
    const sampleRate = 48_000;
    const fftSize = 8;
    const spectrum = new Uint8Array([10, 20, 30, 40]);
    const analyserNode = makeFakeAnalyserNode(spectrum) as unknown as AnalyserNode;

    const analyzer = new FrequencyAnalyzer({ getSampleRate: () => sampleRate } as any);
    const audioNodeStates = new Map<string, any>([
      [
        'f1',
        {
          analyserNode,
          frequencyData: new Uint8Array(spectrum.length),
        },
      ],
    ]);

    const band = { minHz: 0, maxHz: (3 / fftSize) * sampleRate };
    analyzer.createAnalyzer(
      'band-1',
      'f1',
      [band],
      ['mean'],
      [0],
      undefined,
      undefined,
      fftSize,
      audioNodeStates.get('f1')
    );

    const previous = new Map<string, number>();
    const a = analyzer.updateFrequencyAnalysis(audioNodeStates, null, previous, 0.00001, true);
    const b = analyzer.updateFrequencyAnalysis(audioNodeStates, null, previous, 0.00001, true);
    expect(a).toBe(b);
    expect(a).toHaveLength(1);
  });
});

