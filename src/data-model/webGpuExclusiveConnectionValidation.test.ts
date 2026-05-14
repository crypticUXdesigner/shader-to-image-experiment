import { describe, it, expect } from 'vitest';
import type { NodeGraph, Connection } from './types';
import type { NodeSpecification } from './validationTypes';
import { addConnectionWithValidation } from './immutableUpdates';

const raySpecs: NodeSpecification[] = [
  {
    id: 'generic-raymarcher',
    inputs: [
      { name: 'in', type: 'float' },
      { name: 'sdf', type: 'float' },
      { name: 'displacement', type: 'float' },
    ],
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {},
  },
  {
    id: 'glass-shell',
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {},
  },
  {
    id: 'mandelbulb-sdf',
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {},
  },
  {
    id: 'displacement-3d',
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {},
  },
  {
    id: 'noise',
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {},
  },
  {
    id: 'bool-out-node',
    inputs: [],
    outputs: [{ name: 'out', type: 'bool' }],
    parameters: {},
  },
  {
    id: 'bool-in-node',
    inputs: [{ name: 'in', type: 'bool' }],
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {},
  },
  {
    id: 'float-in-node',
    inputs: [{ name: 'in', type: 'float' }],
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {},
  },
];

function baseGraph(): NodeGraph {
  return {
    id: 'g',
    name: 't',
    version: '2.0',
    nodes: [
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-glass', type: 'glass-shell', position: { x: 1, y: 0 }, parameters: {} },
      { id: 'n-mandel', type: 'mandelbulb-sdf', position: { x: 2, y: 0 }, parameters: {} },
      { id: 'n-disp', type: 'displacement-3d', position: { x: 3, y: 0 }, parameters: {} },
      { id: 'n-noise', type: 'noise', position: { x: 4, y: 0 }, parameters: {} },
      { id: 'n-bool-out', type: 'bool-out-node', position: { x: 5, y: 0 }, parameters: {} },
      { id: 'n-bool-in', type: 'bool-in-node', position: { x: 6, y: 0 }, parameters: {} },
      { id: 'n-float-in', type: 'float-in-node', position: { x: 7, y: 0 }, parameters: {} },
    ],
    connections: [],
  };
}

describe('WebGPU-exclusive wire validation (generic-raymarcher)', () => {
  it('allows disallowed SDF when no WebGPU validation context', () => {
    const graph = baseGraph();
    const conn: Connection = {
      id: 'c1',
      sourceNodeId: 'n-glass',
      sourcePort: 'out',
      targetNodeId: 'n-ray',
      targetPort: 'sdf',
    };
    const r = addConnectionWithValidation(graph, conn, raySpecs);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects disallowed SDF in WebGPU session', () => {
    const graph = baseGraph();
    const conn: Connection = {
      id: 'c1',
      sourceNodeId: 'n-glass',
      sourcePort: 'out',
      targetNodeId: 'n-ray',
      targetPort: 'sdf',
    };
    const r = addConnectionWithValidation(graph, conn, raySpecs, {
      connectionValidation: { exclusiveRasterGpu: 'webgpu' },
    });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('WebGPU preview');
    expect(r.graph).toBe(graph);
  });

  it('allows mandelbulb-sdf → sdf in WebGPU session', () => {
    const graph = baseGraph();
    const conn: Connection = {
      id: 'c1',
      sourceNodeId: 'n-mandel',
      sourcePort: 'out',
      targetNodeId: 'n-ray',
      targetPort: 'sdf',
    };
    const r = addConnectionWithValidation(graph, conn, raySpecs, {
      connectionValidation: { exclusiveRasterGpu: 'webgpu' },
    });
    expect(r.errors).toHaveLength(0);
    expect(r.graph.connections).toHaveLength(1);
  });

  it('rejects non–displacement-3d on displacement port in WebGPU session', () => {
    const graph = baseGraph();
    const conn: Connection = {
      id: 'c1',
      sourceNodeId: 'n-noise',
      sourcePort: 'out',
      targetNodeId: 'n-ray',
      targetPort: 'displacement',
    };
    const r = addConnectionWithValidation(graph, conn, raySpecs, {
      connectionValidation: { exclusiveRasterGpu: 'webgpu' },
    });
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('allows displacement-3d.out → displacement in WebGPU session', () => {
    const graph = baseGraph();
    const conn: Connection = {
      id: 'c1',
      sourceNodeId: 'n-disp',
      sourcePort: 'out',
      targetNodeId: 'n-ray',
      targetPort: 'displacement',
    };
    const r = addConnectionWithValidation(graph, conn, raySpecs, {
      connectionValidation: { exclusiveRasterGpu: 'webgpu' },
    });
    expect(r.errors).toHaveLength(0);
  });

  it('does not apply WebGPU rules when exclusiveRasterGpu is webgl2', () => {
    const graph = baseGraph();
    const conn: Connection = {
      id: 'c1',
      sourceNodeId: 'n-glass',
      sourcePort: 'out',
      targetNodeId: 'n-ray',
      targetPort: 'sdf',
    };
    const r = addConnectionWithValidation(graph, conn, raySpecs, {
      connectionValidation: { exclusiveRasterGpu: 'webgl2' },
    });
    expect(r.errors).toHaveLength(0);
  });

  it('Phase 2: rejects bool out → float in during WebGPU session', () => {
    const graph = baseGraph();
    const conn: Connection = {
      id: 'c-bool',
      sourceNodeId: 'n-bool-out',
      sourcePort: 'out',
      targetNodeId: 'n-float-in',
      targetPort: 'in',
    };
    const r = addConnectionWithValidation(graph, conn, raySpecs, {
      connectionValidation: { exclusiveRasterGpu: 'webgpu' },
    });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('bool ports only connect to bool');
    expect(r.graph).toBe(graph);
  });

  it('Phase 2: allows bool out → bool in during WebGPU session', () => {
    const graph = baseGraph();
    const conn: Connection = {
      id: 'c-bool',
      sourceNodeId: 'n-bool-out',
      sourcePort: 'out',
      targetNodeId: 'n-bool-in',
      targetPort: 'in',
    };
    const r = addConnectionWithValidation(graph, conn, raySpecs, {
      connectionValidation: { exclusiveRasterGpu: 'webgpu' },
    });
    expect(r.errors).toHaveLength(0);
    expect(r.graph.connections).toHaveLength(1);
  });
});
