/**
 * Compile-time tests for the per-node Power feature.
 *
 * Covers both bypass rules end-to-end through `NodeShaderCompiler.compile`:
 *   - Rule A (passthrough): `uv → rotate(bypassed) → noise → final-output`
 *     compiles such that `noise.in` reads from the rotate's upstream (`uv`), and the rotate
 *     node itself emits no GLSL.
 *   - Rule B (disconnect, generator): `orbit-camera(bypassed) → generic-raymarcher.ro`
 *     compiles such that `ro` resolves to the raymarcher's own `cameraRoX/Y/Z` parameters via
 *     the existing `fallbackParameter` path.
 *   - Rule B (pattern in chain): `uv → noise(bypassed) → final-output`
 *     still compiles; the wire from bypassed noise drops, so `final-output` uses its default
 *     color and noise contributes no code.
 *
 * Plus invariants:
 *   - Bypassed nodes are absent from `metadata.executionOrder`.
 *   - A trivial all-bypassed graph still compiles.
 *   - Toggling `bypassed` off → on → off is byte-identical to never toggling.
 */
import { describe, it, expect } from 'vitest';
import { NodeShaderCompiler } from './NodeShaderCompiler';
import { nodeSystemSpecs } from './nodes/index';
import type { NodeGraph } from '../data-model/types';
import type { NodeSpec } from '../types/nodeSpec';

function buildNodeSpecsMap(): Map<string, NodeSpec> {
  return new Map(nodeSystemSpecs.map((s) => [s.id, s]));
}

/** `uv → rotate → noise → final-output`. Rotate is the Rule A subject. */
function buildRuleAGraph(rotateBypassed: boolean): NodeGraph {
  return {
    id: 'graph-rule-a',
    name: 'Rule A',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-rotate', type: 'transform', position: { x: 0, y: 0 }, parameters: {}, bypassed: rotateBypassed },
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

/** `orbit-camera → generic-raymarcher`. Orbit-camera is the Rule B subject (no inputs feeding final-output). */
function buildRuleBGeneratorGraph(orbitBypassed: boolean): NodeGraph {
  return {
    id: 'graph-rule-b-generator',
    name: 'Rule B generator',
    version: '2.0',
    nodes: [
      { id: 'n-orbit', type: 'orbit-camera', position: { x: 0, y: 0 }, parameters: {}, bypassed: orbitBypassed },
      {
        id: 'n-ray',
        type: 'generic-raymarcher',
        position: { x: 0, y: 0 },
        parameters: {
          cameraRoX: 1.5,
          cameraRoY: 2.0,
          cameraRoZ: 4.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c-orbit-ray', sourceNodeId: 'n-orbit', sourcePort: 'ro', targetNodeId: 'n-ray', targetPort: 'ro' },
      { id: 'c-ray-out', sourceNodeId: 'n-ray', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** `uv → noise(bypassed) → final-output`. Rule B (vec2 → float). */
function buildRuleBPatternGraph(noiseBypassed: boolean): NodeGraph {
  return {
    id: 'graph-rule-b-pattern',
    name: 'Rule B pattern',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-noise', type: 'noise', position: { x: 0, y: 0 }, parameters: {}, bypassed: noiseBypassed },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c-uv-noise', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c-noise-out', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** `uv → rotate(bypassed) → noise(bypassed) → final-output`. */
function buildAllBypassedChainGraph(): NodeGraph {
  const g = buildRuleAGraph(true);
  for (const node of g.nodes) {
    if (node.id === 'n-noise') {
      node.bypassed = true;
    }
  }
  return g;
}

const compiler = new NodeShaderCompiler(buildNodeSpecsMap());

describe('Node Power: Rule A (passthrough)', () => {
  it('drops bypassed rotate from execution order and rewrites consumer to read from upstream uv', () => {
    const graphActive = buildRuleAGraph(false);
    const graphBypassed = buildRuleAGraph(true);

    const active = compiler.compile(graphActive);
    const bypassed = compiler.compile(graphBypassed);

    expect(active.metadata.errors).toHaveLength(0);
    expect(bypassed.metadata.errors).toHaveLength(0);

    expect(active.metadata.executionOrder).toContain('n-rotate');
    expect(bypassed.metadata.executionOrder).not.toContain('n-rotate');

    expect(bypassed.shaderCode).not.toContain('// Node: Transform');
    expect(active.shaderCode).toContain('// Node: Transform');

    // After Rule A rewrite, noise reads its `in` from the rotate's primary upstream (uv) — not
    // from rotate's own output variable. Bypass output should NOT reference rotate's output.
    expect(bypassed.shaderCode).not.toContain('node_n_rotate_out');
  });

  it('compiles to a different shader than the non-bypassed version', () => {
    const active = compiler.compile(buildRuleAGraph(false));
    const bypassed = compiler.compile(buildRuleAGraph(true));
    expect(active.shaderCode).not.toEqual(bypassed.shaderCode);
  });

  it('matches WGSL MVP execution order (no bypassed node) when targeting webgpu', () => {
    const result = compiler.compile(buildRuleAGraph(true), null, { backend: 'webgpu' });
    expect(result.metadata.executionOrder).not.toContain('n-rotate');
  });
});

describe('Node Power: Rule B (disconnect — generator)', () => {
  it('drops bypassed orbit-camera and raymarcher falls back to its cameraRoX/Y/Z parameters', () => {
    const active = compiler.compile(buildRuleBGeneratorGraph(false));
    const bypassed = compiler.compile(buildRuleBGeneratorGraph(true));

    expect(active.metadata.errors).toHaveLength(0);
    expect(bypassed.metadata.errors).toHaveLength(0);

    expect(active.metadata.executionOrder).toContain('n-orbit');
    expect(bypassed.metadata.executionOrder).not.toContain('n-orbit');

    // The bypassed compile must not reference orbit-camera's output variable; it should
    // resolve `ro` via the raymarcher's own cameraRoX/cameraRoY/cameraRoZ uniforms.
    expect(bypassed.shaderCode).not.toContain('node_n_orbit_ro');
    expect(bypassed.shaderCode).toContain('un_rayCameraRoX');
    expect(bypassed.shaderCode).toContain('un_rayCameraRoY');
    expect(bypassed.shaderCode).toContain('un_rayCameraRoZ');
  });

  it('does not regress the non-bypassed compile (orbit-camera still wires into ro)', () => {
    const active = compiler.compile(buildRuleBGeneratorGraph(false));
    expect(active.shaderCode).toContain('node_n_orbit_ro');
  });
});

describe('Node Power: Rule B (disconnect — pattern in chain)', () => {
  it('compiles when noise is bypassed; final-output uses defaults after the noise→out wire drops', () => {
    const result = compiler.compile(buildRuleBPatternGraph(true));

    expect(result.metadata.errors).toHaveLength(0);
    expect(result.metadata.executionOrder).not.toContain('n-noise');
    expect(result.shaderCode).not.toContain('// Node: Noise');
    expect(result.shaderCode).toContain('void main()');
  });
});

describe('Node Power: invariants', () => {
  it('toggle off → on → off is byte-identical to never toggling (idempotency)', () => {
    const a = compiler.compile(buildRuleAGraph(false));
    const b = compiler.compile(buildRuleAGraph(false));
    expect(a.shaderCode).toEqual(b.shaderCode);

    const c = compiler.compile(buildRuleAGraph(true));
    const d = compiler.compile(buildRuleAGraph(false));
    expect(d.shaderCode).toEqual(a.shaderCode);
    expect(c.shaderCode).not.toEqual(a.shaderCode);
  });

  it('a fully-bypassed effect chain still compiles to a valid program', () => {
    const result = compiler.compile(buildAllBypassedChainGraph());
    expect(result.metadata.errors).toHaveLength(0);
    expect(result.metadata.executionOrder).not.toContain('n-rotate');
    expect(result.metadata.executionOrder).not.toContain('n-noise');
    expect(result.metadata.executionOrder).toContain('n-out');
    expect(result.shaderCode).toContain('void main()');
  });

  it('bypassed nodes contribute no helper functions or uniforms (they get filtered out)', () => {
    // Use generic-raymarcher (which emits a chunky helper function) as the bypass subject.
    // Rule B → wire to final-output dropped → raymarcher absent from execution + functions.
    const graph: NodeGraph = {
      id: 'graph-bypass-ray',
      name: 'Bypass raymarcher',
      version: '2.0',
      nodes: [
        { id: 'n-const', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0, y: 0, z: 0 } },
        {
          id: 'n-ray',
          type: 'generic-raymarcher',
          position: { x: 0, y: 0 },
          parameters: {},
          bypassed: true,
        },
        { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
      ],
      connections: [
        // raymarcher would normally feed final-output; bypassed → wire dropped.
        { id: 'c1', sourceNodeId: 'n-ray', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        // const-vec3 has no consumer after bypass → final-output uses its own default.
        { id: 'c2', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      ],
    };

    const result = compiler.compile(graph);
    expect(result.metadata.errors).toHaveLength(0);
    expect(result.metadata.executionOrder).not.toContain('n-ray');
    expect(result.shaderCode).not.toContain('generic_raymarcher_sdf');
    // raymarcher's per-node uniforms must not appear in the emitted uniform metadata.
    for (const u of result.uniforms) {
      expect(u.nodeId).not.toBe('n-ray');
    }
  });

  it('unconnected primary input on a Rule A bypassed node degenerates to Rule B', () => {
    // `rotate(bypassed) → noise → final-output` with no upstream wired into rotate.
    // rotate's input is unconnected, so Rule A has no upstream to bridge to → drop wire entirely.
    // noise.in then falls back to the port default (vec2(0)), and the program still compiles.
    const graph: NodeGraph = {
      id: 'graph-rotate-orphan',
      name: 'Rotate orphan',
      version: '2.0',
      nodes: [
        { id: 'n-rotate', type: 'transform', position: { x: 0, y: 0 }, parameters: {}, bypassed: true },
        { id: 'n-noise', type: 'noise', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
      ],
      connections: [
        { id: 'c-rot-noise', sourceNodeId: 'n-rotate', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
        { id: 'c-noise-out', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
      ],
    };

    const result = compiler.compile(graph);
    expect(result.metadata.errors).toHaveLength(0);
    expect(result.metadata.executionOrder).not.toContain('n-rotate');
    expect(result.shaderCode).not.toContain('node_n_rotate_out');
    expect(result.shaderCode).toContain('// Node: Noise');
  });

  it('chains nested Rule A bypasses (rotate → scale, both bypassed) through to the original upstream', () => {
    // `uv → rotate(bypassed) → scale(bypassed) → noise → final-output`
    // Both rotate and scale are Rule A (vec2 → vec2). The chain rewrite walks rotate, then scale,
    // and lands on `uv`, so noise reads its input from `uv` directly.
    const graph: NodeGraph = {
      id: 'graph-nested-a',
      name: 'Nested Rule A',
      version: '2.0',
      nodes: [
        { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'n-rotate', type: 'transform', position: { x: 0, y: 0 }, parameters: {}, bypassed: true },
        { id: 'n-scale', type: 'transform', position: { x: 0, y: 0 }, parameters: {}, bypassed: true },
        { id: 'n-noise', type: 'noise', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
      ],
      connections: [
        { id: 'c-uv-rot', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-rotate', targetPort: 'in' },
        { id: 'c-rot-scale', sourceNodeId: 'n-rotate', sourcePort: 'out', targetNodeId: 'n-scale', targetPort: 'in' },
        { id: 'c-scale-noise', sourceNodeId: 'n-scale', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
        { id: 'c-noise-out', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
      ],
    };

    const result = compiler.compile(graph);
    expect(result.metadata.errors).toHaveLength(0);
    expect(result.metadata.executionOrder).not.toContain('n-rotate');
    expect(result.metadata.executionOrder).not.toContain('n-scale');
    expect(result.shaderCode).not.toContain('node_n_rotate_out');
    expect(result.shaderCode).not.toContain('node_n_scale_out');
  });
});
