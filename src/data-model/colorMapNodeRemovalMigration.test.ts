import { describe, it } from 'vitest';
import type { NodeGraph } from './types';
import { LEGACY_COLOR_MAP_NODE_TYPE, migrateRemoveColorMapNodes } from './colorMapNodeRemovalMigration';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function emptyGraph(): NodeGraph {
  return {
    id: 'g',
    name: 't',
    version: '2.0',
    nodes: [],
    connections: [],
  };
}

describe('migrateRemoveColorMapNodes', () => {
  it('leaves graphs without color-map unchanged', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [
        { id: 'a', type: 'noise', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'b', type: 'final-output', position: { x: 1, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'a',
          sourcePort: 'out',
          targetNodeId: 'b',
          targetPort: 'in',
        },
      ],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(m.nodes.length === 2, 'node count');
    assert(m.connections.length === 1, 'conn count');
    assert(m.connections[0].sourceNodeId === 'a', 'wire preserved');
  });

  it('removes an isolated color-map node', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [{ id: 'cm', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 0, y: 0 }, parameters: {} }],
      connections: [],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(m.nodes.length === 0, 'no nodes');
    assert(m.connections.length === 0, 'no conns');
  });

  it('splices single upstream through to one downstream', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [
        { id: 'src', type: 'float-src', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'cm', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 1, y: 0 }, parameters: {} },
        { id: 'sink', type: 'float-sink', position: { x: 2, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'c-in',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'cm',
          targetPort: 'in',
        },
        {
          id: 'c-out',
          sourceNodeId: 'cm',
          sourcePort: 'out',
          targetNodeId: 'sink',
          targetPort: 'in',
        },
      ],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(!m.nodes.some((n) => n.type === LEGACY_COLOR_MAP_NODE_TYPE), 'no color-map');
    assert(m.connections.length === 1, 'single bridge');
    const b = m.connections[0];
    assert(b.sourceNodeId === 'src' && b.targetNodeId === 'sink', 'splice endpoints');
    assert(b.sourcePort === 'out' && b.targetPort === 'in', 'ports');
  });

  it('splices fan-out to multiple downstreams', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [
        { id: 'src', type: 'float-src', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'cm', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 1, y: 0 }, parameters: {} },
        { id: 't1', type: 'float-sink', position: { x: 2, y: 0 }, parameters: {} },
        { id: 't2', type: 'float-sink', position: { x: 2, y: 1 }, parameters: {} },
      ],
      connections: [
        {
          id: 'c-in',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'cm',
          targetPort: 'in',
        },
        {
          id: 'c-o1',
          sourceNodeId: 'cm',
          sourcePort: 'out',
          targetNodeId: 't1',
          targetPort: 'in',
        },
        {
          id: 'c-o2',
          sourceNodeId: 'cm',
          sourcePort: 'out',
          targetNodeId: 't2',
          targetPort: 'in',
        },
      ],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(m.connections.length === 2, 'two bridges');
    assert(
      m.connections.every((c) => c.sourceNodeId === 'src' && c.sourcePort === 'out'),
      'both from src'
    );
    const targets = new Set(m.connections.map((c) => c.targetNodeId));
    assert(targets.has('t1') && targets.has('t2'), 'both targets');
  });

  it('handles chained color-map nodes', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [
        { id: 'src', type: 'float-src', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'cm1', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 1, y: 0 }, parameters: {} },
        { id: 'cm2', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 2, y: 0 }, parameters: {} },
        { id: 'sink', type: 'float-sink', position: { x: 3, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'a',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'cm1',
          targetPort: 'in',
        },
        {
          id: 'b',
          sourceNodeId: 'cm1',
          sourcePort: 'out',
          targetNodeId: 'cm2',
          targetPort: 'in',
        },
        {
          id: 'c',
          sourceNodeId: 'cm2',
          sourcePort: 'out',
          targetNodeId: 'sink',
          targetPort: 'in',
        },
      ],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(!m.nodes.some((n) => n.type === LEGACY_COLOR_MAP_NODE_TYPE), 'no color-map');
    assert(m.connections.length === 1, 'single final wire');
    const w = m.connections[0];
    assert(w.sourceNodeId === 'src' && w.targetNodeId === 'sink', 'end-to-end');
  });

  it('drops downstream wires when color-map has no upstream', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [
        { id: 'cm', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 0, y: 0 }, parameters: {} },
        { id: 'sink', type: 'float-sink', position: { x: 1, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'c-out',
          sourceNodeId: 'cm',
          sourcePort: 'out',
          targetNodeId: 'sink',
          targetPort: 'in',
        },
      ],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(m.nodes.length === 1 && m.nodes[0].id === 'sink', 'only sink');
    assert(m.connections.length === 0, 'sink unwired');
  });

  it('sets disabled on bridge when incoming was disabled', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [
        { id: 'src', type: 'float-src', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'cm', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 1, y: 0 }, parameters: {} },
        { id: 'sink', type: 'float-sink', position: { x: 2, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'c-in',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'cm',
          targetPort: 'in',
          disabled: true,
        },
        {
          id: 'c-out',
          sourceNodeId: 'cm',
          sourcePort: 'out',
          targetNodeId: 'sink',
          targetPort: 'in',
        },
      ],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(m.connections[0].disabled === true, 'bridge disabled');
  });

  it('sets disabled on bridge when outgoing was disabled', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [
        { id: 'src', type: 'float-src', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'cm', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 1, y: 0 }, parameters: {} },
        { id: 'sink', type: 'float-sink', position: { x: 2, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'c-in',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'cm',
          targetPort: 'in',
        },
        {
          id: 'c-out',
          sourceNodeId: 'cm',
          sourcePort: 'out',
          targetNodeId: 'sink',
          targetPort: 'in',
          disabled: true,
        },
      ],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(m.connections[0].disabled === true, 'bridge disabled');
  });

  it('preserves parameter-target outgoing connections', () => {
    const g: NodeGraph = {
      ...emptyGraph(),
      nodes: [
        { id: 'src', type: 'float-src', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'cm', type: LEGACY_COLOR_MAP_NODE_TYPE, position: { x: 1, y: 0 }, parameters: {} },
        { id: 'sink', type: 'float-sink', position: { x: 2, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'c-in',
          sourceNodeId: 'src',
          sourcePort: 'out',
          targetNodeId: 'cm',
          targetPort: 'in',
        },
        {
          id: 'c-out',
          sourceNodeId: 'cm',
          sourcePort: 'out',
          targetNodeId: 'sink',
          targetParameter: 'value',
        },
      ],
    };
    const m = migrateRemoveColorMapNodes(g);
    assert(m.connections.length === 1, 'one bridge');
    const b = m.connections[0];
    assert(b.targetParameter === 'value', 'param target');
    assert(!b.targetPort, 'no port');
  });
});
