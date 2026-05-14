import { describe, expect, it } from 'vitest';
import type { NodeGraph } from './types';
import { migratePolarCoordinatesRemoveEnabled } from './polarCoordinatesRemoveEnabledMigration';

describe('migratePolarCoordinatesRemoveEnabled', () => {
  it('removes polarEnabled from parameters and drops param wires', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        { id: 'src', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 1 } },
        {
          id: 'p1',
          type: 'polar-coordinates',
          position: { x: 0, y: 0 },
          parameters: {
            polarCenterX: 0,
            polarCenterY: 0,
            polarScale: 1,
            polarRadiusScale: 1,
            polarRotation: 0,
            polarEnabled: 0,
          },
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'p1',
          targetParameter: 'polarEnabled',
        },
      ],
      metadata: {},
      viewState: { zoom: 1, panX: 0, panY: 0, selectedNodeIds: [] },
    };

    const out = migratePolarCoordinatesRemoveEnabled(graph);
    const p = out.nodes.find((n) => n.id === 'p1')!;
    expect(p.parameters).not.toHaveProperty('polarEnabled');
    expect(out.connections).toHaveLength(0);
  });

  it('removes automation lane for polarEnabled', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        {
          id: 'p1',
          type: 'polar-coordinates',
          position: { x: 0, y: 0 },
          parameters: {
            polarCenterX: 0,
            polarCenterY: 0,
            polarScale: 1,
            polarRadiusScale: 1,
            polarRotation: 0,
            polarEnabled: 1,
          },
        },
      ],
      connections: [],
      metadata: {},
      viewState: { zoom: 1, panX: 0, panY: 0, selectedNodeIds: [] },
      automation: {
        bpm: 120,
        durationSeconds: 4,
        lanes: [
          {
            id: 'lane1',
            nodeId: 'p1',
            paramName: 'polarEnabled',
            regions: [],
          },
          {
            id: 'lane2',
            nodeId: 'p1',
            paramName: 'polarRotation',
            regions: [],
          },
        ],
      },
    };

    const out = migratePolarCoordinatesRemoveEnabled(graph);
    expect(out.automation?.lanes).toHaveLength(1);
    expect(out.automation?.lanes[0]?.paramName).toBe('polarRotation');
  });

  it('returns same reference when no polar-coordinates nodes', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [{ id: 'a', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} }],
      connections: [],
      metadata: {},
      viewState: { zoom: 1, panX: 0, panY: 0, selectedNodeIds: [] },
    };
    expect(migratePolarCoordinatesRemoveEnabled(graph)).toBe(graph);
  });
});
