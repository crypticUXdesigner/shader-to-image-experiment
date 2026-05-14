import { describe, it, expect } from 'vitest';
import type { NodeGraph, NodeInstance } from '../data-model/types';
import type { NodeSpec } from '../types/nodeSpec';
import type { IAudioManager } from '../runtime/types';
import { nodeSystemSpecs } from '../shaders/nodes/index';
import { getVirtualNodeId } from './virtualNodes';
import { resolveMixedWaveNumericParams } from './mixedWaveEffectiveParams';

function buildNodeSpecsMap(): Map<string, NodeSpec> {
  return new Map(nodeSystemSpecs.map((s) => [s.id, s]));
}

describe('resolveMixedWaveNumericParams', () => {
  it('applies multiply mode for weight when an audio virtual wire is present', () => {
    const vid = getVirtualNodeId('band-test-raw');
    const node: NodeInstance = {
      id: 'mw',
      type: 'mixed-wave-signal',
      position: { x: 0, y: 0 },
      parameters: { w2Weight: 1 },
      parameterInputModes: { w2Weight: 'multiply' },
    };
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [node],
      connections: [
        {
          id: 'c1',
          sourceNodeId: vid,
          sourcePort: 'out',
          targetNodeId: 'mw',
          targetParameter: 'w2Weight',
        },
      ],
    };
    const nodeSpecs = buildNodeSpecsMap();
    const audioManager: IAudioManager = {
      getVirtualNodeLiveValue: (id: string) => (id === vid ? 0.05 : null),
    } as unknown as IAudioManager;

    const resolved = resolveMixedWaveNumericParams(node, {
      graph,
      nodeSpecs,
      audioManager,
    });

    expect(resolved.w2Weight).toBeCloseTo(0.05, 5);
    expect(resolved.w0Weight).toBeCloseTo(1, 5);
    expect(resolved.w1Weight).toBeCloseTo(1, 5);
  });
});
