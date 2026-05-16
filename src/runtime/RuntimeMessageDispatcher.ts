/**
 * Runtime message API and in-process dispatcher.
 *
 * This defines a small, serializable message protocol between the editor and
 * the runtime. In this task the dispatcher runs in-process and forwards
 * messages to a RuntimeManager instance, but the message shapes are suitable
 * for a future Web Worker transport.
 */

import type { NodeGraph, ParameterValue } from '../data-model/types';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import type { TimelineState } from './types';
import type { RuntimeManager } from './RuntimeManager';

export const RUNTIME_MESSAGE_VERSION = 1 as const;

export type RuntimeRequestMessage =
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'LoadGraph';
      graph: NodeGraph;
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'SetAudioSetup';
      audioSetup: AudioSetup | null;
      options?: { autoPlayWhenReady?: boolean };
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'UpdateParameter';
      nodeId: string;
      paramName: string;
      value: ParameterValue;
      graph?: NodeGraph;
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'UpdateAudioFileParameter';
      nodeId: string;
      paramName: string;
      file: File | string;
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'ToggleGlobalAudioPlayback';
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'PlayNext';
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'PlayPrevious';
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'PlayPrimary';
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'SeekGlobalAudio';
      time: number;
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'GetTimelineState';
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'GetGlobalAudioState';
    };

export type RuntimeResponseMessage =
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'Ack';
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'TimelineState';
      state: TimelineState | null;
    }
  | {
      version: typeof RUNTIME_MESSAGE_VERSION;
      type: 'GlobalAudioState';
      state: { isPlaying: boolean; currentTime: number; duration: number } | null;
    };

/**
 * In-process dispatcher that accepts messages and forwards them to a
 * RuntimeManager. The message types are intentionally serializable so the same
 * protocol can later be used over postMessage to a Web Worker.
 */
export class RuntimeMessageDispatcher {
  private runtime: RuntimeManager;

  constructor(runtime: RuntimeManager) {
    this.runtime = runtime;
  }

  async dispatch(message: RuntimeRequestMessage): Promise<RuntimeResponseMessage> {
    switch (message.type) {
      case 'LoadGraph': {
        await this.runtime.setGraph(message.graph);
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'SetAudioSetup': {
        this.runtime.setAudioSetup(message.audioSetup, message.options);
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'UpdateParameter': {
        this.runtime.updateParameter(
          message.nodeId,
          message.paramName,
          message.value,
          message.graph,
        );
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'UpdateAudioFileParameter': {
        await this.runtime.onAudioFileParameterChange(
          message.nodeId,
          message.paramName,
          message.file,
        );
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'ToggleGlobalAudioPlayback': {
        this.runtime.toggleGlobalAudioPlayback();
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'PlayNext': {
        this.runtime.playNext();
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'PlayPrevious': {
        this.runtime.playPrevious();
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'PlayPrimary': {
        this.runtime.playPrimary();
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'SeekGlobalAudio': {
        this.runtime.seekGlobalAudio(message.time);
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
      case 'GetTimelineState': {
        const state = this.runtime.getTimelineState();
        return {
          version: RUNTIME_MESSAGE_VERSION,
          type: 'TimelineState',
          state,
        };
      }
      case 'GetGlobalAudioState': {
        const state = this.runtime.getGlobalAudioState();
        return {
          version: RUNTIME_MESSAGE_VERSION,
          type: 'GlobalAudioState',
          state,
        };
      }
      default: {
        // Exhaustive check
        const _exhaustive: never = message;
        void _exhaustive;
        return { version: RUNTIME_MESSAGE_VERSION, type: 'Ack' };
      }
    }
  }

  // Convenience helpers used by the UI; these wrap dispatch with typed methods.

  loadGraph(graph: NodeGraph): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'LoadGraph',
      graph,
    }).then(() => {});
  }

  /**
   * Load a saved project into the runtime. Audio setup must be applied before the graph so the
   * first compile bakes arrangement snapshots and other audio-derived shader data.
   */
  async loadProject(
    graph: NodeGraph,
    audioSetup: AudioSetup | null,
    options?: { autoPlayWhenReady?: boolean }
  ): Promise<void> {
    await this.runtime.loadProject(graph, audioSetup, options);
  }

  setAudioSetup(audioSetup: AudioSetup | null, options?: { autoPlayWhenReady?: boolean }): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'SetAudioSetup',
      audioSetup,
      options,
    }).then(() => {});
  }

  updateParameter(
    nodeId: string,
    paramName: string,
    value: ParameterValue,
    graph?: NodeGraph,
  ): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'UpdateParameter',
      nodeId,
      paramName,
      value,
      graph,
    }).then(() => {});
  }

  updateAudioFileParameter(nodeId: string, paramName: string, file: File | string): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'UpdateAudioFileParameter',
      nodeId,
      paramName,
      file,
    }).then(() => {});
  }

  toggleGlobalAudioPlayback(): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'ToggleGlobalAudioPlayback',
    }).then(() => {});
  }

  playNext(): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'PlayNext',
    }).then(() => {});
  }

  playPrevious(): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'PlayPrevious',
    }).then(() => {});
  }

  playPrimary(): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'PlayPrimary',
    }).then(() => {});
  }

  seekGlobalAudio(time: number): Promise<void> {
    return this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'SeekGlobalAudio',
      time,
    }).then(() => {});
  }

  async getTimelineState(): Promise<TimelineState | null> {
    const res = await this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'GetTimelineState',
    });
    return res.type === 'TimelineState' ? res.state : null;
  }

  async getGlobalAudioState(): Promise<
    { isPlaying: boolean; currentTime: number; duration: number } | null
  > {
    const res = await this.dispatch({
      version: RUNTIME_MESSAGE_VERSION,
      type: 'GetGlobalAudioState',
    });
    return res.type === 'GlobalAudioState' ? res.state : null;
  }
}

