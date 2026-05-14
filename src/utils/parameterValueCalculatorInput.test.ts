import { describe, it, expect } from 'vitest';
import type { NodeGraph, NodeInstance } from '../data-model/types';
import type { NodeSpec } from '../types/nodeSpec';
import { nodeSystemSpecs } from '../shaders/nodes/index';
import { computeEffectiveParameterValue } from './parameterValueCalculator';
import { getVirtualNodeId } from './virtualNodes';

function buildNodeSpecsMap(): Map<string, NodeSpec> {
  return new Map(nodeSystemSpecs.map((s) => [s.id, s]));
}

describe('getInputValue / split-vector CPU preview', () => {
  it('exposes split-vector component when upstream is constant-vec3', () => {
    const constNode: NodeInstance = {
      id: 'cv3',
      type: 'constant-vec3',
      position: { x: 0, y: 0 },
      parameters: { x: 0.1, y: 0.5, z: 0.9 },
    };
    const split: NodeInstance = {
      id: 'sp',
      type: 'split-vector',
      position: { x: 0, y: 0 },
      parameters: {},
    };
    const target: NodeInstance = {
      id: 'tgt',
      type: 'constant-float',
      position: { x: 0, y: 0 },
      parameters: { value: 0.25 },
    };
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [constNode, split, target],
      connections: [
        {
          id: 'c0',
          sourceNodeId: 'cv3',
          sourcePort: 'out',
          targetNodeId: 'sp',
          targetPort: 'in',
        },
        {
          id: 'c1',
          sourceNodeId: 'sp',
          sourcePort: 'y',
          targetNodeId: 'tgt',
          targetParameter: 'value',
        },
      ],
    };
    const nodeSpecs = buildNodeSpecsMap();
    const valueSpec = nodeSpecs.get('constant-float')!.parameters.value;
    const v = computeEffectiveParameterValue(
      target,
      'value',
      valueSpec,
      graph,
      nodeSpecs,
      undefined,
      undefined
    );
    expect(v).toBeCloseTo(0.5, 5);
  });

  it('exposes split-vector when upstream combine-vector is fed by audio', () => {
    const vid = getVirtualNodeId('band-test-raw');
    const combine: NodeInstance = {
      id: 'comb',
      type: 'combine-vector',
      position: { x: 0, y: 0 },
      parameters: { outputType: 2, z: 0, w: 1 },
    };
    const split: NodeInstance = {
      id: 'sp',
      type: 'split-vector',
      position: { x: 0, y: 0 },
      parameters: {},
    };
    const target: NodeInstance = {
      id: 'tgt',
      type: 'constant-float',
      position: { x: 0, y: 0 },
      parameters: { value: 0.25 },
    };
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [combine, split, target],
      connections: [
        {
          id: 'a1',
          sourceNodeId: vid,
          sourcePort: 'out',
          targetNodeId: 'comb',
          targetPort: 'x',
        },
        {
          id: 'c0',
          sourceNodeId: 'comb',
          sourcePort: 'out',
          targetNodeId: 'sp',
          targetPort: 'in',
        },
        {
          id: 'c1',
          sourceNodeId: 'sp',
          sourcePort: 'x',
          targetNodeId: 'tgt',
          targetParameter: 'value',
        },
      ],
    };
    const nodeSpecs = buildNodeSpecsMap();
    const valueSpec = nodeSpecs.get('constant-float')!.parameters.value;
    const audioManager = {
      getVirtualNodeLiveValue: (id: string) => (id === vid ? 0.42 : null),
    } as import('../runtime/types').IAudioManager;

    const v = computeEffectiveParameterValue(
      target,
      'value',
      valueSpec,
      graph,
      nodeSpecs,
      audioManager,
      undefined
    );
    expect(v).toBeCloseTo(0.42, 5);
  });
});
