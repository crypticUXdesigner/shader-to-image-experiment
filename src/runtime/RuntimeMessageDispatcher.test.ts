/**
 * Tests for RuntimeMessageDispatcher.
 * Run: npm test (or npx vitest run src/runtime/RuntimeMessageDispatcher.test.ts)
 */

import { describe, it, expect, vi } from 'vitest';
import type { NodeGraph, ParameterValue } from '../data-model/types';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import type { TimelineState } from './types';
import {
  RUNTIME_MESSAGE_VERSION,
  type RuntimeRequestMessage,
  RuntimeMessageDispatcher,
} from './RuntimeMessageDispatcher';

function makeEmptyGraph(): NodeGraph {
  return {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [],
    connections: [],
  };
}

function makeAudioSetup(): AudioSetup {
  return {
    files: [],
    bands: [],
    remappers: [],
  };
}

describe('RuntimeMessageDispatcher', () => {
  it('forwards loadGraph and setAudioSetup messages to runtime manager', async () => {
    const graph = makeEmptyGraph();
    const audioSetup = makeAudioSetup();

    const runtime = {
      setGraph: vi.fn().mockResolvedValue(undefined),
      setAudioSetup: vi.fn(),
      updateParameter: vi.fn(),
      onAudioFileParameterChange: vi.fn().mockResolvedValue(undefined),
      toggleGlobalAudioPlayback: vi.fn(),
      playNext: vi.fn(),
      playPrevious: vi.fn(),
      playPrimary: vi.fn(),
      seekGlobalAudio: vi.fn(),
      getTimelineState: vi.fn().mockReturnValue(null),
      getGlobalAudioState: vi.fn().mockReturnValue(null),
    } as unknown as import('./RuntimeManager').RuntimeManager;

    const dispatcher = new RuntimeMessageDispatcher(runtime);

    await dispatcher.loadGraph(graph);
    await dispatcher.setAudioSetup(audioSetup, { autoPlayWhenReady: true });

    expect((runtime.setGraph as any)).toHaveBeenCalledTimes(1);
    expect((runtime.setGraph as any)).toHaveBeenCalledWith(graph);

    expect((runtime.setAudioSetup as any)).toHaveBeenCalledTimes(1);
    expect((runtime.setAudioSetup as any)).toHaveBeenCalledWith(audioSetup, {
      autoPlayWhenReady: true,
    });
  });

  it('loadProject delegates to RuntimeManager.loadProject', async () => {
    const graph = makeEmptyGraph();
    const audioSetup = makeAudioSetup();

    const runtime = {
      loadProject: vi.fn().mockResolvedValue(undefined),
      setGraph: vi.fn(),
      setAudioSetup: vi.fn(),
      updateParameter: vi.fn(),
      onAudioFileParameterChange: vi.fn().mockResolvedValue(undefined),
      toggleGlobalAudioPlayback: vi.fn(),
      playNext: vi.fn(),
      playPrevious: vi.fn(),
      playPrimary: vi.fn(),
      seekGlobalAudio: vi.fn(),
      getTimelineState: vi.fn().mockReturnValue(null),
      getGlobalAudioState: vi.fn().mockReturnValue(null),
    } as unknown as import('./RuntimeManager').RuntimeManager;

    const dispatcher = new RuntimeMessageDispatcher(runtime);
    await dispatcher.loadProject(graph, audioSetup, { autoPlayWhenReady: true });

    expect((runtime.loadProject as any)).toHaveBeenCalledTimes(1);
    expect((runtime.loadProject as any)).toHaveBeenCalledWith(graph, audioSetup, {
      autoPlayWhenReady: true,
    });
  });

  it('round-trips a request message through JSON serialization', () => {
    const graph = makeEmptyGraph();
    const msg: RuntimeRequestMessage = {
      version: RUNTIME_MESSAGE_VERSION,
      type: 'LoadGraph',
      graph,
    };

    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as RuntimeRequestMessage;

    expect(parsed.version).toBe(RUNTIME_MESSAGE_VERSION);
    expect(parsed.type).toBe('LoadGraph');
    expect(parsed.graph.id).toBe('g1');
  });

  it('returns timeline and global audio state via messages', async () => {
    const timeline: TimelineState = {
      currentTime: 1.5,
      duration: 30,
      bpm: 120,
      hasAudio: true,
      isPlaying: true,
    };
    const globalAudio = { isPlaying: true, currentTime: 1.5, duration: 30 };

    const runtime = {
      setGraph: vi.fn().mockResolvedValue(undefined),
      setAudioSetup: vi.fn(),
      updateParameter: vi.fn(),
      onAudioFileParameterChange: vi.fn().mockResolvedValue(undefined),
      toggleGlobalAudioPlayback: vi.fn(),
      playNext: vi.fn(),
      playPrevious: vi.fn(),
      playPrimary: vi.fn(),
      seekGlobalAudio: vi.fn(),
      getTimelineState: vi.fn().mockReturnValue(timeline),
      getGlobalAudioState: vi.fn().mockReturnValue(globalAudio),
    } as unknown as import('./RuntimeManager').RuntimeManager;

    const dispatcher = new RuntimeMessageDispatcher(runtime);

    const timelineState = await dispatcher.getTimelineState();
    const globalState = await dispatcher.getGlobalAudioState();

    expect(timelineState).toEqual(timeline);
    expect(globalState).toEqual(globalAudio);
  });

  it('updates parameters and audio file parameters via dispatcher', async () => {
    const graph = makeEmptyGraph();
    const value: ParameterValue = 0.5;
    const file = 'file.wav';

    const runtime = {
      setGraph: vi.fn().mockResolvedValue(undefined),
      setAudioSetup: vi.fn(),
      updateParameter: vi.fn(),
      onAudioFileParameterChange: vi.fn().mockResolvedValue(undefined),
      toggleGlobalAudioPlayback: vi.fn(),
      playNext: vi.fn(),
      playPrevious: vi.fn(),
      playPrimary: vi.fn(),
      seekGlobalAudio: vi.fn(),
      getTimelineState: vi.fn().mockReturnValue(null),
      getGlobalAudioState: vi.fn().mockReturnValue(null),
    } as unknown as import('./RuntimeManager').RuntimeManager;

    const dispatcher = new RuntimeMessageDispatcher(runtime);

    await dispatcher.updateParameter('n1', 'gain', value, graph);
    await dispatcher.updateAudioFileParameter('n-audio', 'file', file);

    expect((runtime.updateParameter as any)).toHaveBeenCalledWith(
      'n1',
      'gain',
      value,
      graph,
    );
    expect((runtime.onAudioFileParameterChange as any)).toHaveBeenCalledWith(
      'n-audio',
      'file',
      file,
    );
  });
});

