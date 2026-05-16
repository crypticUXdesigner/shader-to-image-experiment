/**
 * Shared assertions for Node Power + export compile parity (still + video paths both call
 * `NodeShaderCompiler.compile(..., { backend: 'webgpu' })` like `WebGpuExportRenderPath`).
 */
import { expect } from 'vitest';
import type { NodeGraph } from '../data-model/types';
import type { CompilationResult } from '../runtime/types';
import type { NodeShaderCompiler } from '../shaders/NodeShaderCompiler';

export function assertCompileDeterministic(
  a: CompilationResult,
  b: CompilationResult,
  label: string
): void {
  expect(a.metadata.errors, `${label}: errors A`).toEqual([]);
  expect(b.metadata.errors, `${label}: errors B`).toEqual([]);
  expect(a.code, `${label}: code`).toBe(b.code);
  expect(a.metadata.executionOrder, `${label}: executionOrder`).toEqual(b.metadata.executionOrder);
}

/** Rule A fixture: `uv → rotate(bypassed) → noise → final-output`. */
export function bypassRuleAGraph(): NodeGraph {
  return {
    id: 'graph-rule-a-bypass-export',
    name: 'Rule A bypass export',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-rotate', type: 'transform', position: { x: 0, y: 0 }, parameters: {}, bypassed: true },
      { id: 'n-noise', type: 'noise', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c-uv-rot', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-rotate', targetPort: 'in' },
      { id: 'c-rot-noise', sourceNodeId: 'n-rotate', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c-noise-out', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/**
 * Rule B fixture (WGSL MVP–friendly): `uv → noise(bypassed) → final-output`.
 * Matches `nodePower.compile.test.ts` Rule B pattern — heavy raymarcher graphs may be `supported: false` for WebGPU export gates.
 */
export function bypassRuleBPatternGraph(): NodeGraph {
  return {
    id: 'graph-rule-b-bypass-export',
    name: 'Rule B bypass export',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-noise', type: 'noise', position: { x: 0, y: 0 }, parameters: {}, bypassed: true },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c-uv-noise', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c-noise-out', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

export function assertBypassExportCompileGate(
  compiler: NodeShaderCompiler,
  graph: NodeGraph,
  bypassedIds: string[],
  label: string
): void {
  const first = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });
  const second = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });
  assertCompileDeterministic(first, second, label);
  expect(first.supported, `${label}: supported`).toBe(true);
  expect(first.backend, `${label}: backend`).toBe('webgpu');
  for (const id of bypassedIds) {
    expect(first.metadata.executionOrder, `${label}: no bypassed in order`).not.toContain(id);
  }
}
