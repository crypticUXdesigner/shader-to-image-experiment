import { describe, it, expect, vi } from 'vitest';
import type { AudioNodeState, AudioPlaybackController } from './AudioPlaybackController';
import {
  collectAudioUniformUpdates,
  getAudioUniformUpdatesScratchBufferForTests,
} from './audioUniformUpdates';
import type { FrequencyAnalyzer } from './FrequencyAnalyzer';

describe('collectAudioUniformUpdates', () => {
  it('refreshes FrequencyAnalyzer UI state when emitting from offline curve sampler', () => {
    const updateFrequencyAnalysis = vi.fn(() => [] as Array<{ nodeId: string; paramName: string; value: number }>);
    const frequencyAnalyzer = {
      updateFrequencyAnalysis,
      getAnalyzerNodeState: vi.fn(() => undefined),
    } as unknown as FrequencyAnalyzer;

    const buffer = {
      duration: 1,
      sampleRate: 48000,
      length: 48000,
      numberOfChannels: 1,
    } as AudioBuffer;

    const audioStates = new Map<string, AudioNodeState>([
      [
        'tracks/x',
        {
          nodeId: 'tracks/x',
          audioContext: null,
          audioBuffer: buffer,
          sourceNode: null,
          analyserNode: null,
          gainNode: null,
          isPlaying: false,
          startTime: 0,
          currentTime: 0,
          duration: 1,
          frequencyData: null,
          smoothedValues: new Map(),
          playRequestId: 0,
        },
      ],
    ]);

    const playbackController = {
      getAllAudioNodeStates: () => audioStates,
      updatePlaybackTime: vi.fn(),
    } as unknown as AudioPlaybackController;

    const provider = {
      getUniformUpdatesAtTime: () => [{ nodeId: 'band-a', paramName: 'band', value: 0.25 }],
    };

    collectAudioUniformUpdates(
      playbackController,
      frequencyAnalyzer,
      null,
      new Map(),
      0.001,
      null,
      false,
      new Map([['tracks/x', provider]])
    );

    expect(updateFrequencyAnalysis).toHaveBeenCalledTimes(1);
  });

  it('returns the same scratch buffer on successive calls (cleared each invocation)', () => {
    const updateFrequencyAnalysis = vi.fn(() => [] as Array<{ nodeId: string; paramName: string; value: number }>);
    const frequencyAnalyzer = {
      updateFrequencyAnalysis,
      getAnalyzerNodeState: vi.fn(() => undefined),
    } as unknown as FrequencyAnalyzer;

    const buffer = {
      duration: 1,
      sampleRate: 48000,
      length: 48000,
      numberOfChannels: 1,
    } as AudioBuffer;

    const audioStates = new Map<string, AudioNodeState>([
      [
        'tracks/x',
        {
          nodeId: 'tracks/x',
          audioContext: null,
          audioBuffer: buffer,
          sourceNode: null,
          analyserNode: null,
          gainNode: null,
          isPlaying: false,
          startTime: 0,
          currentTime: 0,
          duration: 1,
          frequencyData: null,
          smoothedValues: new Map(),
          playRequestId: 0,
        },
      ],
    ]);

    const playbackController = {
      getAllAudioNodeStates: () => audioStates,
      updatePlaybackTime: vi.fn(),
    } as unknown as AudioPlaybackController;

    const provider = {
      getUniformUpdatesAtTime: () => [{ nodeId: 'band-a', paramName: 'band', value: 0.25 }],
    };

    const prev = getAudioUniformUpdatesScratchBufferForTests();
    const a = collectAudioUniformUpdates(
      playbackController,
      frequencyAnalyzer,
      null,
      new Map(),
      0.001,
      null,
      false,
      new Map([['tracks/x', provider]])
    );
    const b = collectAudioUniformUpdates(
      playbackController,
      frequencyAnalyzer,
      null,
      new Map(),
      0.001,
      null,
      false,
      new Map([['tracks/x', provider]])
    );
    expect(a).toBe(prev);
    expect(b).toBe(prev);
    expect(a).toBe(b);
    expect(a).toEqual([{ nodeId: 'band-a', paramName: 'band', value: 0.25 }]);
  });
});
