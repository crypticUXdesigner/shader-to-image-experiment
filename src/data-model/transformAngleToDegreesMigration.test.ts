import { describe, it, expect } from 'vitest';
import {
  migrateTransformAngleToDegrees,
  normalizeTransformAngleDeg,
} from './transformAngleToDegreesMigration';
import { snapParameterValue } from '../utils/parameterValueCalculator';
import { transform2dNodeSpec } from '../shaders/nodes/transform-2d';
import type { NodeGraph } from './types';

describe('migrateTransformAngleToDegrees', () => {
  it('converts transform angle from radians to degrees', () => {
    const graph: NodeGraph = {
      id: 'g1',
      name: 'T',
      version: '2.0',
      nodes: [
        {
          id: 't1',
          type: 'transform',
          position: { x: 0, y: 0 },
          parameters: { angle: 1.5 },
        },
      ],
      connections: [],
      automation: {
        bpm: 120,
        durationSeconds: 60,
        lanes: [
          {
            id: 'l1',
            nodeId: 't1',
            paramName: 'angle',
            regions: [
              {
                id: 'r1',
                startTime: 0,
                duration: 1,
                curve: {
                  keyframes: [{ time: 0, value: -1.57 }],
                },
              },
            ],
          },
        ],
      },
    };

    const out = migrateTransformAngleToDegrees(graph);
    expect(out.nodes[0].parameters.angle).toBe(Math.round((1.5 * 180) / Math.PI));
    expect(out.automation!.lanes[0].regions[0].curve.keyframes[0].value).toBe(
      Math.round((-1.57 * 180) / Math.PI)
    );
  });

  it('leaves angle at 0 unchanged', () => {
    const graph: NodeGraph = {
      id: 'g1',
      name: 'T',
      version: '2.0',
      nodes: [
        {
          id: 't1',
          type: 'transform',
          position: { x: 0, y: 0 },
          parameters: { angle: 0 },
        },
      ],
      connections: [],
    };

    const out = migrateTransformAngleToDegrees(graph);
    expect(out.nodes[0].parameters.angle).toBe(0);
  });

  it('does not convert values already in degrees', () => {
    const graph: NodeGraph = {
      id: 'g1',
      name: 'T',
      version: '2.0',
      nodes: [
        {
          id: 't1',
          type: 'transform',
          position: { x: 0, y: 0 },
          parameters: { angle: 90 },
        },
      ],
      connections: [],
    };

    const out = migrateTransformAngleToDegrees(graph);
    expect(out.nodes[0].parameters.angle).toBe(90);
  });

  it('wraps out-of-range degree values from radian-era saves into [-180, 180]', () => {
    const graph: NodeGraph = {
      id: 'g1',
      name: 'T',
      version: '2.0',
      nodes: [
        {
          id: 't1',
          type: 'transform',
          position: { x: 0, y: 0 },
          parameters: { angle: 359.2445375470262 },
        },
      ],
      connections: [],
    };

    const out = migrateTransformAngleToDegrees(graph);
    expect(out.nodes[0].parameters.angle).toBe(-1);
  });
});

describe('normalizeTransformAngleDeg', () => {
  it('wraps a full turn to 0', () => {
    expect(normalizeTransformAngleDeg(360)).toBe(0);
    expect(normalizeTransformAngleDeg(359)).toBe(-1);
  });
});

describe('transform angle parameter snap', () => {
  it('snaps exactly to 0 degrees', () => {
    const spec = transform2dNodeSpec.parameters.angle;
    expect(snapParameterValue(0, spec)).toBe(0);
    expect(snapParameterValue(0.4, spec)).toBe(0);
    expect(snapParameterValue(-0.4, spec)).toBe(0);
  });
});
