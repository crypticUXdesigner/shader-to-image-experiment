/**
 * Compile-time checks for unified `transform` (Flip → Scale → Rotate).
 */
import { describe, it, expect } from 'vitest';
import { NodeShaderCompiler } from './NodeShaderCompiler';
import { nodeSystemSpecs } from './nodes/index';
import { mvpMirrorFlipGraph } from '../validation/webgpuMvpFixtures';
import type { NodeGraph } from '../data-model/types';
import type { NodeSpec } from '../types/nodeSpec';

function buildNodeSpecsMap(): Map<string, NodeSpec> {
  return new Map(nodeSystemSpecs.map((s) => [s.id, s]));
}

function buildTransformGraph(): NodeGraph {
  return {
    id: 'graph-transform-order',
    name: 'Transform order',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-xf',
        type: 'transform',
        position: { x: 0, y: 0 },
        parameters: {
          pivotX: 0.5,
          pivotY: 0.5,
          flipX: 1,
          flipY: 0,
          scaleX: 2.0,
          scaleY: 1.5,
          angle: 15,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-xf', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-xf', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

const compiler = new NodeShaderCompiler(buildNodeSpecsMap());

function extractTransformNodeBlock(shader: string): string {
  const marker = '// Node: Transform (n-xf)';
  const start = shader.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const blockStart = shader.indexOf('{', start);
  const blockEnd = shader.indexOf('\n  }', blockStart);
  expect(blockStart).toBeGreaterThan(-1);
  expect(blockEnd).toBeGreaterThan(blockStart);
  return shader.slice(blockStart, blockEnd);
}

describe('transform compile order', () => {
  it('GLSL applies flip before scale before rotate', () => {
    const result = compiler.compile(buildTransformGraph());
    expect(result.metadata.errors).toHaveLength(0);

    const block = extractTransformNodeBlock(result.shaderCode);
    const flipIdx = block.indexOf('p.x = -p.x');
    const scaleIdx = block.indexOf('p *= vec2(');
    const rotateIdx = block.indexOf('cos(radians(');
    expect(flipIdx).toBeGreaterThan(-1);
    expect(scaleIdx).toBeGreaterThan(flipIdx);
    expect(rotateIdx).toBeGreaterThan(scaleIdx);
  });

  it('WGSL applies flip before scale before rotate', () => {
    const result = compiler.compile(mvpMirrorFlipGraph(), null, { backend: 'webgpu' });
    expect(result.metadata.errors).toHaveLength(0);
    expect(result.supported).toBe(true);

    const code = result.code;
    const flipIdx = code.indexOf('select(1.0, -1.0,');
    const scaleIdx = code.indexOf('* vec2<f32>(params[5].x, params[6].x)');
    const rotateIdx = code.indexOf('cos(radians(');
    expect(flipIdx).toBeGreaterThan(-1);
    expect(scaleIdx).toBeGreaterThan(flipIdx);
    expect(rotateIdx).toBeGreaterThan(scaleIdx);
  });
});
