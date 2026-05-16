import { describe, it, expect } from 'vitest';
import { migrateTransform2dUnify } from './transform2dUnifyMigration';
import type { NodeGraph } from './types';

describe('migrateTransform2dUnify', () => {
  it('migrates rotate to transform with pivot and angle', () => {
    const graph: NodeGraph = {
      id: 'g1',
      name: 'T',
      version: '2.0',
      nodes: [
        {
          id: 'r1',
          type: 'rotate',
          position: { x: 0, y: 0 },
          parameters: { angle: 1.5, centerX: 0.2, centerY: -0.3 },
          parameterInputModes: { angle: 'multiply', centerX: 'add' },
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'r1',
          targetParameter: 'centerY',
        },
      ],
      automation: {
        bpm: 120,
        durationSeconds: 60,
        lanes: [{ id: 'l1', nodeId: 'r1', paramName: 'angle', regions: [] }],
      },
    };

    const out = migrateTransform2dUnify(graph);
    const n = out.nodes[0];
    expect(n.type).toBe('transform');
    expect(n.parameters.pivotX).toBe(0.2);
    expect(n.parameters.pivotY).toBe(-0.3);
    expect(n.parameters.angle).toBe(Math.round((1.5 * 180) / Math.PI));
    expect(n.parameters.flipX).toBe(0);
    expect(n.parameters.scaleX).toBe(1.0);
    expect(n.parameterInputModes?.angle).toBe('multiply');
    expect(n.parameterInputModes?.pivotX).toBe('add');
    expect(out.connections[0].targetParameter).toBe('pivotY');
    expect(out.automation!.lanes[0].paramName).toBe('angle');
  });

  it('migrates scale to transform with pivot and scale', () => {
    const graph: NodeGraph = {
      id: 'g1',
      name: 'T',
      version: '2.0',
      nodes: [
        {
          id: 's1',
          type: 'scale',
          position: { x: 0, y: 0 },
          parameters: { scaleX: 2.0, scaleY: 0.5, centerX: 1.0, centerY: 0.0 },
          parameterInputModes: { scaleX: 'multiply' },
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 's1',
          targetParameter: 'scaleY',
        },
      ],
      automation: {
        bpm: 120,
        durationSeconds: 60,
        lanes: [{ id: 'l1', nodeId: 's1', paramName: 'centerX', regions: [] }],
      },
    };

    const out = migrateTransform2dUnify(graph);
    const n = out.nodes[0];
    expect(n.type).toBe('transform');
    expect(n.parameters.scaleX).toBe(2.0);
    expect(n.parameters.scaleY).toBe(0.5);
    expect(n.parameters.pivotX).toBe(1.0);
    expect(n.parameters.angle).toBe(0.0);
    expect(n.parameters.flipX).toBe(0);
    expect(n.parameterInputModes?.scaleX).toBe('multiply');
    expect(out.connections[0].targetParameter).toBe('scaleY');
    expect(out.automation!.lanes[0].paramName).toBe('pivotX');
  });

  it('migrates mirror-flip to transform with pivot and flip', () => {
    const graph: NodeGraph = {
      id: 'g1',
      name: 'T',
      version: '2.0',
      nodes: [
        {
          id: 'm1',
          type: 'mirror-flip',
          position: { x: 0, y: 0 },
          parameters: {
            mirrorFlipX: 1,
            mirrorFlipY: 0,
            mirrorCenterX: 0.5,
            mirrorCenterY: -0.5,
          },
          parameterInputModes: { mirrorFlipX: 'override' },
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'm1',
          targetParameter: 'mirrorCenterX',
        },
      ],
      automation: {
        bpm: 120,
        durationSeconds: 60,
        lanes: [{ id: 'l1', nodeId: 'm1', paramName: 'mirrorFlipY', regions: [] }],
      },
    };

    const out = migrateTransform2dUnify(graph);
    const n = out.nodes[0];
    expect(n.type).toBe('transform');
    expect(n.parameters.flipX).toBe(1);
    expect(n.parameters.flipY).toBe(0);
    expect(n.parameters.pivotX).toBe(0.5);
    expect(n.parameters.pivotY).toBe(-0.5);
    expect(n.parameters.scaleX).toBe(1.0);
    expect(n.parameters.angle).toBe(0.0);
    expect(n.parameterInputModes?.flipX).toBe('override');
    expect(out.connections[0].targetParameter).toBe('pivotX');
    expect(out.automation!.lanes[0].paramName).toBe('flipY');
  });
});
