import { describe, expect, it } from 'vitest';
import type { Connection, NodeGraph } from './types';
import { migrateDisplaceRemoveLegacyInputPorts } from './displaceRemoveLegacyInputPortsMigration';

describe('migrateDisplaceRemoveLegacyInputPorts', () => {
  it('drops wires to displace offset and amount ports', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        { id: 'n1', type: 'constant-vec2', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'n2', type: 'constant-float', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'd', type: 'displace', position: { x: 0, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'c-off',
          sourceNodeId: 'n1',
          sourcePort: 'out',
          targetNodeId: 'd',
          targetPort: 'offset',
        },
        {
          id: 'c-amt',
          sourceNodeId: 'n2',
          sourcePort: 'out',
          targetNodeId: 'd',
          targetPort: 'amount',
        },
        {
          id: 'keep',
          sourceNodeId: 'n1',
          sourcePort: 'out',
          targetNodeId: 'd',
          targetPort: 'in',
        },
      ],
    };

    const out = migrateDisplaceRemoveLegacyInputPorts(graph);
    expect(out.connections).toHaveLength(1);
    expect(out.connections[0].targetPort).toBe('in');
  });

  it('is a no-op when no displace nodes', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [{ id: 'a', type: 'noise', position: { x: 0, y: 0 }, parameters: {} }],
      connections: [],
    };
    expect(migrateDisplaceRemoveLegacyInputPorts(graph)).toBe(graph);
  });
});
