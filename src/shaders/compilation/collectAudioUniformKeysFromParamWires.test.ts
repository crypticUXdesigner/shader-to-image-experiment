/**
 * Deterministic coverage for virtual audio → parameter wires used by WGSL uniform slicing.
 */
import { describe, it, expect } from 'vitest';
import type { NodeGraph } from '../../data-model/types';
import { VIRTUAL_NODE_PREFIX } from '../../utils/virtualNodes';
import { collectAudioUniformKeysFromParamWires } from './WgslMvpCompiler';

function minimalGraph(connections: NodeGraph['connections']): NodeGraph {
  return {
    id: 'g',
    name: 'test',
    version: '2.0',
    nodes: [
      { id: 'n-a', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 1 } },
      { id: 'n-b', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 2 } },
    ],
    connections,
  };
}

describe('collectAudioUniformKeysFromParamWires', () => {
  it('returns empty set when there are no matching wires', () => {
    const graph = minimalGraph([]);
    expect(collectAudioUniformKeysFromParamWires(graph, new Set(['n-a']))).toEqual(new Set());
  });

  it('collects remap virtual signal keys as `{signalId}.out`', () => {
    const graph = minimalGraph([
      {
        id: 'c1',
        sourceNodeId: `${VIRTUAL_NODE_PREFIX}remap-myRemap`,
        sourcePort: 'out',
        targetNodeId: 'n-a',
        targetParameter: 'value',
      },
    ]);
    const keys = collectAudioUniformKeysFromParamWires(graph, new Set(['n-a']));
    expect([...keys].sort()).toEqual(['remap-myRemap.out']);
  });

  it('maps band raw/remap virtual IDs to `.band` / `.remap` keys', () => {
    const graph = minimalGraph([
      {
        id: 'c1',
        sourceNodeId: `${VIRTUAL_NODE_PREFIX}band-subwoofer-raw`,
        sourcePort: 'out',
        targetNodeId: 'n-a',
        targetParameter: 'value',
      },
      {
        id: 'c2',
        sourceNodeId: `${VIRTUAL_NODE_PREFIX}band-subwoofer-remap`,
        sourcePort: 'out',
        targetNodeId: 'n-b',
        targetParameter: 'value',
      },
    ]);
    const keys = collectAudioUniformKeysFromParamWires(graph, new Set(['n-a', 'n-b']));
    expect([...keys].sort()).toEqual(['subwoofer.band', 'subwoofer.remap']);
  });

  it('ignores wires whose target node is not in the reachable set', () => {
    const graph = minimalGraph([
      {
        id: 'c1',
        sourceNodeId: `${VIRTUAL_NODE_PREFIX}remap-x`,
        sourcePort: 'out',
        targetNodeId: 'n-a',
        targetParameter: 'value',
      },
    ]);
    expect(collectAudioUniformKeysFromParamWires(graph, new Set(['n-b']))).toEqual(new Set());
  });

  it('ignores disabled parameter wires', () => {
    const graph = minimalGraph([
      {
        id: 'c1',
        sourceNodeId: `${VIRTUAL_NODE_PREFIX}remap-x`,
        sourcePort: 'out',
        targetNodeId: 'n-a',
        targetParameter: 'value',
        disabled: true,
      },
    ]);
    expect(collectAudioUniformKeysFromParamWires(graph, new Set(['n-a']))).toEqual(new Set());
  });

  it('ignores non-virtual sources and port-only targets', () => {
    const graph = minimalGraph([
      {
        id: 'c1',
        sourceNodeId: 'n-b',
        sourcePort: 'out',
        targetNodeId: 'n-a',
        targetPort: 'in',
      },
    ]);
    expect(collectAudioUniformKeysFromParamWires(graph, new Set(['n-a']))).toEqual(new Set());
  });

  it('does not add keys for unrecognized virtual signal shapes', () => {
    const graph = minimalGraph([
      {
        id: 'c1',
        sourceNodeId: `${VIRTUAL_NODE_PREFIX}unknown-shape`,
        sourcePort: 'out',
        targetNodeId: 'n-a',
        targetParameter: 'value',
      },
    ]);
    expect(collectAudioUniformKeysFromParamWires(graph, new Set(['n-a']))).toEqual(new Set());
  });
});
