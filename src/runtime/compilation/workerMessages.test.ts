/**
 * Ensures compile payloads (including incremental previousResult) round-trip through the same
 * cloning path used before postMessage to the compilation worker, preserving paramLayout slots
 * for virtual audio remap uniforms.
 *
 * Outbound: `WorkerCompilePayload` (`type: 'compile'`, numeric `id`, `targetBackend`, `graph`,
 * `audioSetup`, `previousResult` nullable, `affectedNodeIds`, `tryIncremental`).
 * Inbound: `WorkerReplyMessage` — `inited` | `result` (`id` + `result`) | `error` (`id` + `message`).
 * `CompilationManager` applies `result` on the main thread; stale `id`s must be ignored.
 */

import { describe, it, expect } from 'vitest';
import type { WorkerCompilePayload, WorkerReplyMessage } from './workerMessages';
import { cloneableCompilePayload } from './workerMessages';
import type { RenderBackendKind } from '../types';
import type { NodeGraph } from '../../data-model/types';
import type { CompilationResult } from '../types';

const AUDIO_REMAP_LAYOUT_KEY = 'remap-mvp-stetra-audio-scale.out';

function minimalGraph(): NodeGraph {
  return {
    id: 'g-worker-msg',
    name: 't',
    version: '2.0',
    nodes: [{ id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }],
    connections: [],
  };
}

function minimalCompilationResultWithAudioRemapSlot(): CompilationResult {
  return {
    backend: 'webgpu',
    supported: true,
    unsupportedReasons: undefined,
    code: '',
    shaderCode: '',
    uniforms: [],
    metadata: {
      warnings: [],
      errors: [],
      executionOrder: [],
      finalOutputNodeId: 'n-out',
      previewDependencies: {
        usesWallTime: false,
        usesTimelineTime: false,
        usesAudioUniforms: true,
        usesRadialPulseVirtualDrive: false,
        usesRadialPulseSpawnUniformPass: false,
        usesResolutionUniform: false,
        usesMouseUniforms: false,
        usesFrameIndex: false,
      },
    },
    paramLayout: {
      [AUDIO_REMAP_LAYOUT_KEY]: 19,
      'n-out.someParam': 0,
    },
    resources: undefined,
    webgpuPassPlan: undefined,
  };
}

describe('cloneableCompilePayload', () => {
  it('preserves paramLayout entries for audio remap keys on incremental previousResult', () => {
    const targetBackend: RenderBackendKind = 'webgpu';
    const payload: WorkerCompilePayload = {
      type: 'compile',
      id: 1,
      targetBackend,
      graph: minimalGraph(),
      audioSetup: null,
      previousResult: minimalCompilationResultWithAudioRemapSlot(),
      affectedNodeIds: ['n-out'],
      tryIncremental: true,
    };

    const cloned = cloneableCompilePayload(payload);

    expect(cloned.previousResult?.paramLayout[AUDIO_REMAP_LAYOUT_KEY]).toBe(19);
    expect(cloned.previousResult?.paramLayout['n-out.someParam']).toBe(0);
  });

  it('matches structuredClone when available (worker channel behavior)', () => {
    const targetBackend: RenderBackendKind = 'webgpu';
    const payload: WorkerCompilePayload = {
      type: 'compile',
      id: 2,
      targetBackend,
      graph: minimalGraph(),
      audioSetup: null,
      previousResult: minimalCompilationResultWithAudioRemapSlot(),
      affectedNodeIds: [],
      tryIncremental: false,
    };

    if (typeof structuredClone !== 'function') {
      expect.fail('structuredClone should exist in Vitest environment');
    }

    const viaCloneable = cloneableCompilePayload(payload);
    const direct = structuredClone(payload);

    expect(viaCloneable.previousResult?.paramLayout[AUDIO_REMAP_LAYOUT_KEY]).toBe(
      direct.previousResult?.paramLayout[AUDIO_REMAP_LAYOUT_KEY]
    );
  });

  it('cloneableCompilePayload keeps tryIncremental false with null previousResult (full compile channel)', () => {
    const payload: WorkerCompilePayload = {
      type: 'compile',
      id: 3,
      targetBackend: 'webgl',
      graph: minimalGraph(),
      audioSetup: null,
      previousResult: null,
      affectedNodeIds: ['n-out'],
      tryIncremental: false,
    };

    const cloned = cloneableCompilePayload(payload);
    expect(cloned.type).toBe('compile');
    expect(cloned.previousResult).toBeNull();
    expect(cloned.tryIncremental).toBe(false);
    expect(cloned.id).toBe(3);
  });

  it('WorkerReplyMessage result branch carries compile id and result metadata CompilationManager reads', () => {
    const result = minimalCompilationResultWithAudioRemapSlot();
    const msg: WorkerReplyMessage = { type: 'result', id: 42, result };
    expect(msg.type).toBe('result');
    expect(msg.id).toBe(42);
    expect(msg.result.metadata.finalOutputNodeId).toBe('n-out');
    expect(msg.result.backend).toBe('webgpu');
  });

  it('WorkerReplyMessage error branch is structuredClone-stable', () => {
    const msg: WorkerReplyMessage = { type: 'error', id: 7, message: 'worker compile failed' };
    if (typeof structuredClone !== 'function') {
      expect.fail('structuredClone should exist in Vitest environment');
    }
    const copy = structuredClone(msg);
    expect(copy).toEqual(msg);
    expect((copy as WorkerReplyMessage).type).toBe('error');
  });

  it('cloneableCompilePayload JSON fallback drops non-JSON values (functions never cross postMessage)', () => {
    const payload = {
      type: 'compile' as const,
      id: 8,
      targetBackend: 'webgl' as const,
      graph: minimalGraph(),
      audioSetup: null,
      previousResult: null,
      affectedNodeIds: [] as string[],
      tryIncremental: false,
      evil: () => 1,
    } as unknown as WorkerCompilePayload;

    const cloned = cloneableCompilePayload(payload);
    expect('evil' in cloned).toBe(false);
    expect(cloned.type).toBe('compile');
  });
});
