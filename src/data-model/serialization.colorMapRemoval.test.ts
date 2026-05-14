import { describe, it } from 'vitest';
import { LEGACY_COLOR_MAP_NODE_TYPE } from './colorMapNodeRemovalMigration';
import { deserializeGraph } from './serialization';
import { nodeSystemSpecs } from '../shaders/nodes';
import { toValidationSpecs } from '../utils/nodeSpecUtils';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

describe('deserializeGraph (color-map migration)', () => {
  it('removes legacy color-map nodes and splices wires before validateGraph', () => {
    const json = JSON.stringify({
      format: 'shadernoice-node-graph',
      formatVersion: '2.0',
      graph: {
        id: 'g',
        name: 'Legacy color-map chain',
        version: '2.0',
        nodes: [
          { id: 'uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n', type: 'noise', position: { x: 1, y: 0 }, parameters: {} },
          { id: 'cm', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 2, y: 0 }, parameters: {} },
          { id: 'fo', type: 'final-output', position: { x: 3, y: 0 }, parameters: {} },
        ],
        connections: [
          {
            id: 'c0',
            sourceNodeId: 'uv',
            sourcePort: 'out',
            targetNodeId: 'n',
            targetPort: 'in',
          },
          {
            id: 'c1',
            sourceNodeId: 'n',
            sourcePort: 'out',
            targetNodeId: 'cm',
            targetPort: 'in',
          },
          {
            id: 'c2',
            sourceNodeId: 'cm',
            sourcePort: 'out',
            targetNodeId: 'fo',
            targetPort: 'in',
          },
        ],
      },
    });

    const specs = toValidationSpecs(nodeSystemSpecs);
    const result = deserializeGraph(json, specs);
    assert(result.errors.length === 0, result.errors.join('; ') || 'no errors');
    assert(result.graph !== null, 'graph present');
    const graph = result.graph;
    assert(!graph.nodes.some((node) => node.type === LEGACY_COLOR_MAP_NODE_TYPE), 'no color-map nodes');
    const nToOut = graph.connections.find(
      (c) => c.sourceNodeId === 'n' && c.targetNodeId === 'fo' && c.targetPort === 'in'
    );
    assert(nToOut !== undefined, 'noise → final-output after splice');
  });
});
