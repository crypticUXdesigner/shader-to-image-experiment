import { describe, it, expect, vi } from 'vitest';
import type { AutomationState, NodeGraph } from '../data-model/types';
import { digestAutomationForCompileIdentity, hashGraph } from './utils';

describe('digestAutomationForCompileIdentity', () => {
  it('is stable when automation lanes are listed in different order (sorted by lane id)', () => {
    const a: AutomationState = {
      bpm: 120,
      durationSeconds: 60,
      lanes: [
        { id: 'lane-b', nodeId: 'n1', paramName: 'x', regions: [] },
        { id: 'lane-a', nodeId: 'n2', paramName: 'y', regions: [] },
      ],
    };
    const b: AutomationState = {
      ...a,
      lanes: [...a.lanes].reverse(),
    };
    expect(digestAutomationForCompileIdentity(a)).toBe(digestAutomationForCompileIdentity(b));
  });

  it('differs when a lane targets a different node', () => {
    const one: AutomationState = {
      bpm: 120,
      durationSeconds: 60,
      lanes: [{ id: 'lane-a', nodeId: 'n1', paramName: 'x', regions: [] }],
    };
    const two: AutomationState = {
      bpm: 120,
      durationSeconds: 60,
      lanes: [{ id: 'lane-a', nodeId: 'n2', paramName: 'x', regions: [] }],
    };
    expect(digestAutomationForCompileIdentity(one)).not.toBe(digestAutomationForCompileIdentity(two));
  });

  it('does not JSON.stringify whole automation objects (numbers only)', () => {
    const lanes = Array.from({ length: 40 }, (_, i) => ({
      id: `lane-${i}`,
      nodeId: 'n1',
      paramName: 'v',
      regions: Array.from({ length: 8 }, (_, j) => ({
        id: `r-${i}-${j}`,
        startTime: j,
        duration: 1,
        loop: false,
        curve: {
          interpolation: 'linear' as const,
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
        },
      })),
    }));
    const automation: AutomationState = { bpm: 120, durationSeconds: 300, lanes };
    const stringifySpy = vi.spyOn(JSON, 'stringify');
    digestAutomationForCompileIdentity(automation);
    const objectAutomationStringifies = stringifySpy.mock.calls.filter(
      (args) =>
        args[0] !== null &&
        typeof args[0] === 'object' &&
        'lanes' in (args[0] as object) &&
        Array.isArray((args[0] as { lanes?: unknown }).lanes)
    );
    expect(objectAutomationStringifies.length).toBe(0);
    stringifySpy.mockRestore();
  });
});

describe('hashGraph', () => {
  it('matches for graphs that differ only by automation lane array order', () => {
    const nodes: NodeGraph['nodes'] = [
      { id: 'n1', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
    ];
    const g1: NodeGraph = {
      id: 'g1',
      name: 'T',
      version: '2.0',
      nodes,
      connections: [],
      automation: {
        bpm: 100,
        durationSeconds: 10,
        lanes: [
          { id: 'z', nodeId: 'n1', paramName: 'p', regions: [] },
          { id: 'a', nodeId: 'n1', paramName: 'q', regions: [] },
        ],
      },
    };
    const g2: NodeGraph = {
      ...g1,
      automation: {
        ...g1.automation!,
        lanes: [...g1.automation!.lanes].reverse(),
      },
    };
    expect(hashGraph(g1)).toBe(hashGraph(g2));
  });

  it('large automation: hashGraph stays within a bounded wall time (regression guard)', () => {
    const lanes = Array.from({ length: 60 }, (_, i) => ({
      id: `lane-${i}`,
      nodeId: 'n1',
      paramName: 'v',
      regions: Array.from({ length: 12 }, (_, j) => ({
        id: `r-${i}-${j}`,
        startTime: j * 0.1,
        duration: 0.5,
        loop: j % 2 === 0,
        curve: {
          interpolation: 'linear' as const,
          keyframes: [
            { time: 0, value: i },
            { time: 0.5, value: j },
            { time: 1, value: i + j },
          ],
        },
      })),
    }));
    const graph: NodeGraph = {
      id: 'g-large-auto',
      name: 'T',
      version: '2.0',
      nodes: [{ id: 'n1', type: 'time', position: { x: 0, y: 0 }, parameters: {} }],
      connections: [],
      automation: { bpm: 128, durationSeconds: 240, lanes },
    };
    const t0 = performance.now();
    for (let k = 0; k < 40; k++) {
      hashGraph(graph);
    }
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
