import { describe, expect, it } from 'vitest';
import { migrateArrangementNotesParameters } from './arrangementNotesParametersMigration';
import type { NodeGraph } from './types';

describe('migrateArrangementNotesParameters', () => {
  it('converts legacy background RGB into OKLCH and removes RGB keys', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        {
          id: 'n1',
          type: 'arrangement-notes',
          position: { x: 0, y: 0 },
          parameters: {
            backgroundR: 0.03,
            backgroundG: 0.04,
            backgroundB: 0.07,
          },
        },
      ],
      connections: [],
    };

    const migrated = migrateArrangementNotesParameters(graph);
    const p = migrated.nodes[0].parameters as Record<string, number>;

    expect(p.backgroundR).toBeUndefined();
    expect(p.backgroundG).toBeUndefined();
    expect(p.backgroundB).toBeUndefined();
    expect(p.backgroundL).toBeCloseTo(0.3427, 3);
    expect(p.backgroundC).toBeCloseTo(0.0343, 3);
    expect(p.backgroundH).toBeCloseTo(266.506, 2);
  });

  it('rewires parameter connections from legacy RGB params', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        { id: 'c', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.5 } },
        {
          id: 'n1',
          type: 'arrangement-notes',
          position: { x: 0, y: 0 },
          parameters: { backgroundR: 1, backgroundG: 1, backgroundB: 1 },
        },
      ],
      connections: [
        {
          id: 'w',
          sourceNodeId: 'c',
          sourcePort: 'out',
          targetNodeId: 'n1',
          targetParameter: 'backgroundR',
        },
      ],
    };

    const migrated = migrateArrangementNotesParameters(graph);
    expect(migrated.connections[0].targetParameter).toBe('backgroundL');
  });

  it('strips removed viewport / fixed-start params and parameter wires', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        {
          id: 'c',
          type: 'constant-float',
          position: { x: 0, y: 0 },
          parameters: { value: 1 },
        },
        {
          id: 'n1',
          type: 'arrangement-notes',
          position: { x: 0, y: 0 },
          parameters: { viewportMode: 1, fixedStartSeconds: 12 },
        },
      ],
      connections: [
        {
          id: 'w',
          sourceNodeId: 'c',
          sourcePort: 'out',
          targetNodeId: 'n1',
          targetParameter: 'fixedStartSeconds',
        },
      ],
    };

    const migrated = migrateArrangementNotesParameters(graph);
    const p = migrated.nodes[0].parameters as Record<string, unknown>;
    expect(p.viewportMode).toBeUndefined();
    expect(p.fixedStartSeconds).toBeUndefined();
    expect(migrated.connections).toHaveLength(0);
  });

  it('strips legacy uvInputMode and parameter wires (shader always maps UV Coords p → 0–1)', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        {
          id: 'c',
          type: 'constant-float',
          position: { x: 0, y: 0 },
          parameters: { value: 1 },
        },
        {
          id: 'n1',
          type: 'arrangement-notes',
          position: { x: 0, y: 0 },
          parameters: { uvInputMode: 1 },
        },
      ],
      connections: [
        {
          id: 'w',
          sourceNodeId: 'c',
          sourcePort: 'out',
          targetNodeId: 'n1',
          targetParameter: 'uvInputMode',
        },
      ],
    };

    const migrated = migrateArrangementNotesParameters(graph);
    const p = migrated.nodes[0].parameters as Record<string, unknown>;
    expect(p.uvInputMode).toBeUndefined();
    expect(migrated.connections).toHaveLength(0);
  });
});
