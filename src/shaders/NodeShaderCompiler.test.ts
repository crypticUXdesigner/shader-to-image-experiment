/**
 * Diagnostic tests for NodeShaderCompiler, including the quad-warp parameter connection bug.
 *
 * Bug: When Intensity (multiply) output is connected to any quad-warp parameter, the shader
 * compiles and runs but shows a solid color. Connecting the upstream multiply to the same
 * parameter works. See docs/quad-warp-parameter-connection-bug.md.
 *
 * Run: npm install -D vitest && npm test (or npx vitest run src/shaders/NodeShaderCompiler.test.ts)
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { NodeShaderCompiler } from './NodeShaderCompiler';
import { WGSL_SUPPORTED_NODE_TYPES, WGSL_WEBGPU_PASS_PLAN_NODE_TYPES } from './compilation/WgslMvpCompiler';
import { nodeSystemSpecs } from './nodes/index';
import { addConnection } from '../data-model/immutableUpdates';
import type { NodeGraph, Connection } from '../data-model/types';
import type { NodeSpec } from '../types/nodeSpec';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import {
  mvpAudioBlurPassPlanGraph,
  mvpAudioBokehPassPlanGraph,
  mvpAudioCrepuscularRaysPassPlanGraph,
  mvpAudioGlowBloomPassPlanGraph,
  mvpBlurPassPlanGraph,
  mvpGlowBloomPassPlanGraph,
  mvpBokehPassPlanGraph,
  mvpCrepuscularRaysPassPlanGraph,
  mvpGenericRaymarcherDisplacementGraph,
  mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup,
  mvpGenericRaymarcherSierpinskiTetraScaleWireGraph,
} from '../validation/webgpuMvpFixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));

function buildNodeSpecsMap(): Map<string, NodeSpec> {
  return new Map(nodeSystemSpecs.map((s) => [s.id, s]));
}

/**
 * Minimal graph that reproduces the parameter-connection scenario:
 * - uv-coordinates -> quad-warp (in)
 * - time -> multiply (a), multiply has param b
 * - multiply (Intensity) out -> quad-warp quadCorner0X (parameter connection)
 * - quad-warp out -> final-output in
 *
 * This ensures quad-warp depends on the multiply; execution order must have multiply before quad-warp,
 * and the generated main code must use the multiply's output variable for quadCorner0X.
 */
function buildGraphWithIntensityToQuadWarpParam(): NodeGraph {
  const uvId = 'n-uv';
  const timeId = 'n-time';
  const intensityId = 'n-intensity';
  const quadWarpId = 'n-quadwarp';
  const outputId = 'n-output';

  return {
    id: 'graph-test',
    name: 'Test',
    version: '2.0',
    nodes: [
      { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: timeId, type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: intensityId,
        type: 'multiply',
        position: { x: 0, y: 0 },
        parameters: { b: 0.1 },
        label: 'Intensity',
      },
      {
        id: quadWarpId,
        type: 'quad-warp',
        position: { x: 0, y: 0 },
        parameters: {
          quadCorner0X: -0.09,
          quadCorner0Y: -0.19,
          quadCorner1X: 0.57,
          quadCorner1Y: -0.05,
          quadCorner2X: 0.32,
          quadCorner2Y: 0.46,
          quadCorner3X: -0.57,
          quadCorner3Y: -0.46,
        },
        parameterInputModes: {},
      },
      { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: quadWarpId, targetPort: 'in' },
      { id: 'c2', sourceNodeId: timeId, sourcePort: 'out', targetNodeId: intensityId, targetPort: 'a' },
      {
        id: 'c3',
        sourceNodeId: intensityId,
        sourcePort: 'out',
        targetNodeId: quadWarpId,
        targetParameter: 'quadCorner0X',
      },
      { id: 'c4', sourceNodeId: quadWarpId, sourcePort: 'out', targetNodeId: outputId, targetPort: 'in' },
    ],
  };
}

/**
 * Expected variable name for a node's "out" port (same convention as VariableNameGenerator).
 */
function expectedOutputVariableName(nodeId: string, portName: string): string {
  const sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
  const sanitizedPort = portName.replace(/[^a-zA-Z0-9]/g, '_');
  return `node_${sanitizedId}_${sanitizedPort}`;
}

describe('NodeShaderCompiler', () => {
  /**
     * Full compile path: minimal graph → compile → assert result structure.
   * Guards the critical path graph → NodeShaderCompiler → CompilationResult.
   */
  describe('full compile path (minimal graph)', () => {
    function buildMinimalCompilableGraph(): NodeGraph {
      const constId = 'n-const';
      const outputId = 'n-out';
      return {
        id: 'graph-minimal',
        name: 'Minimal',
        version: '2.0',
        nodes: [
          { id: constId, type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: {} },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: constId, sourcePort: 'out', targetNodeId: outputId, targetPort: 'in' },
        ],
      };
    }

    it('compiles without throwing and returns result with expected structure', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildMinimalCompilableGraph();

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.backend).toBe('webgl');
      expect(result.supported).toBe(true);
      expect(result.code).toBe(result.shaderCode);
      expect(result.shaderCode).toBeDefined();
      expect(typeof result.shaderCode).toBe('string');
      expect(result.shaderCode.length).toBeGreaterThan(0);
      expect(result.uniforms).toBeDefined();
      expect(Array.isArray(result.uniforms)).toBe(true);
      expect(result.paramLayout).toBeDefined();
      expect(typeof result.paramLayout).toBe('object');
      expect(result.metadata.executionOrder).toBeDefined();
      expect(Array.isArray(result.metadata.executionOrder)).toBe(true);
      expect(result.metadata.finalOutputNodeId).toBe('n-out');
    });

    it('produces a deterministic paramLayout for the same graph', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildMinimalCompilableGraph();

      const a = compiler.compile(graph);
      const b = compiler.compile(graph);

      expect(a.metadata.errors).toHaveLength(0);
      expect(b.metadata.errors).toHaveLength(0);
      expect(a.paramLayout).toEqual(b.paramLayout);
    });

    it('includes previewDependencies with no audio uniforms for minimal graph', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildMinimalCompilableGraph();
      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.metadata.previewDependencies).toBeDefined();
      expect(result.metadata.previewDependencies!.usesAudioUniforms).toBe(false);
    });

    it('produces fragment shader with void main and expected identifiers', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildMinimalCompilableGraph();

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.shaderCode).toContain('void main()');
      expect(result.shaderCode).toContain('uTime');
      expect(result.shaderCode).toContain('uResolution');
      expect(result.shaderCode).toContain('fragColor');
    });
  });

  describe('webgpu wgsl MVP subset', () => {
    it('emits WGSL for a supported minimal graph when backend=webgpu', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-min',
        name: 'WGSL minimal',
        version: '2.0',
        nodes: [
          { id: 'n-const', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.1, y: 0.2, z: 0.3 } },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.code).toContain('@fragment');
      expect(result.code).toContain('fn fs');
      expect(result.paramLayout['n-const.x']).toBeTypeOf('number');
      expect(result.paramLayout['n-const.y']).toBeTypeOf('number');
      expect(result.paramLayout['n-const.z']).toBeTypeOf('number');
    });

    it('compiles src/presets/new.json on WebGPU (no structural fallback)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const raw = readFileSync(join(process.cwd(), 'src', 'presets', 'new.json'), 'utf8');
      const parsed = JSON.parse(raw) as { graph: NodeGraph };

      const result = compiler.compile(structuredClone(parsed.graph), null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.supported).toBe(true);
      expect(result.unsupportedReasons ?? []).toHaveLength(0);
    });

    it('compiles src/presets/testing.json on WebGPU (no structural fallback)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const raw = readFileSync(join(process.cwd(), 'src', 'presets', 'testing.json'), 'utf8');
      const parsed = JSON.parse(raw) as { graph: NodeGraph };

      const result = compiler.compile(structuredClone(parsed.graph), null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.supported).toBe(true);
      expect(result.unsupportedReasons ?? []).toHaveLength(0);
    });

    it('emits WGSL helpers for ether-sdf when backend=webgpu', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-ether-sdf',
        name: 'WGSL ether-sdf',
        version: '2.0',
        nodes: [
          { id: 'n-pos', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.1, y: -0.2, z: 0.3 } },
          {
            id: 'n-ether',
            type: 'ether-sdf',
            position: { x: 0, y: 0 },
            parameters: {
              rotSpeedXZ: 0.4,
              rotSpeedXY: 0.3,
              scale: 2.0,
              timeSpeed: 1.0,
              timeOffset: 0.0,
              wobbleSpeed: 0.7,
              sineAmp: 5.5,
              breatheAmount: 0.0,
              breatheSpeed: 0.7,
              positionX: 0.0,
              positionY: 0.0,
              positionZ: 0.0,
            },
          },
          { id: 'n-v', type: 'combine-vector', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-pos', sourcePort: 'out', targetNodeId: 'n-ether', targetPort: 'position' },
          { id: 'c2', sourceNodeId: 'n-ether', sourcePort: 'out', targetNodeId: 'n-v', targetPort: 'x' },
          { id: 'c3', sourceNodeId: 'n-ether', sourcePort: 'out', targetNodeId: 'n-v', targetPort: 'y' },
          { id: 'c4', sourceNodeId: 'n-ether', sourcePort: 'out', targetNodeId: 'n-v', targetPort: 'z' },
          { id: 'c5', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.code).toContain('fn etherSdfMap');
      expect(result.code).toContain('fn etherSdfRot2');
    });

    it('emits WGSL helpers for kifs-sdf when backend=webgpu', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-kifs-sdf',
        name: 'WGSL kifs-sdf',
        version: '2.0',
        nodes: [
          { id: 'n-pos', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.2, y: -0.15, z: 0.4 } },
          {
            id: 'n-kifs',
            type: 'kifs-sdf',
            position: { x: 0, y: 0 },
            parameters: {
              scale: 1.25,
              offsetX: -1.0,
              offsetY: -2.0,
              offsetZ: -0.2,
              rotationAxisX: 1.0,
              rotationAxisY: 4.0,
              rotationAxisZ: 2.0,
              rotationAngle: 0.0,
              iterations: 12,
              sphereRadius: 0.1,
              positionX: 0.0,
              positionY: 0.0,
              positionZ: 0.0,
            },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-pos', sourcePort: 'out', targetNodeId: 'n-kifs', targetPort: 'position' },
          { id: 'c2', sourceNodeId: 'n-kifs', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('kifs-sdf')).toBe(true);
      expect(result.code).toContain('fn kifs_sdf_distance');
    });

    it('compiles shapes-2d (superellipse mode) inline for backend=webgpu', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-shapes2d-superellipse',
        name: 'WGSL shapes-2d superellipse',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-x',
            type: 'shapes-2d',
            position: { x: 0, y: 0 },
            parameters: { shapeType: 2 },
            parameterInputModes: {},
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-x', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-x', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('shapes-2d')).toBe(true);
      expect(result.code).toContain('fn shapes2d_superellipseMask');
    });

    it('compiles glass-shell inline for backend=webgpu (outer refract → inner bounded march)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-glass-shell',
        name: 'WGSL glass shell',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-shell',
            type: 'glass-shell',
            position: { x: 0, y: 0 },
            parameters: { outerSteps: 24, innerSteps: 20 },
            parameterInputModes: {},
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-shell', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-shell', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('glass-shell')).toBe(true);
      expect(result.code).toContain('glass_shell_standalone_pixel');
      expect(result.code).toContain('glass_shell_gs_raymarch_outer');
    });

    it('compiles inflated-icosahedron inline for backend=webgpu (bounded ray march)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-inflated-icosahedron',
        name: 'WGSL inflated icosahedron',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-ico',
            type: 'inflated-icosahedron',
            position: { x: 0, y: 0 },
            parameters: { raymarchSteps: 64 },
            parameterInputModes: {},
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ico', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-ico', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('inflated-icosahedron')).toBe(true);
      expect(result.code).toContain('inflated_icosahedron_standalone_pixel');
      expect(result.code).toContain('fn infl_ic_map');
    });

    it('compiles volume-rays inline for backend=webgpu (bounded ray accumulation)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-volume-rays',
        name: 'WGSL volume rays',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-x', type: 'volume-rays', position: { x: 0, y: 0 }, parameters: {}, parameterInputModes: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-x', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-x', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('volume-rays')).toBe(true);
      expect(result.code).toContain('fn vr_march_acc');
    });

    it('compiles particle-system inline for backend=webgpu (cell hash field)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-particle-system',
        name: 'WGSL particle system',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-p', type: 'particle-system', position: { x: 0, y: 0 }, parameters: {}, parameterInputModes: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-p', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-p', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('particle-system')).toBe(true);
      expect(result.code).toContain('fn ps_particle_system_ps');
    });

    it('compiles blur as separable Gaussian pass plan when graph ends in `... → blur → final-output`', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-blur-passplan',
        name: 'WGSL separable blur (pass plan)',
        version: '2.0',
        nodes: [
          { id: 'n-const', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.5, y: 0.5, z: 0.5, w: 1.0 } },
          { id: 'n-blur', type: 'blur', position: { x: 0, y: 0 }, parameters: { blurAmount: 0.5, blurRadius: 4.0 } },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-blur', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-blur', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(WGSL_WEBGPU_PASS_PLAN_NODE_TYPES.has('blur')).toBe(true);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('blur')).toBe(true);

      const plan = result.webgpuPassPlan;
      expect(plan?.kind).toBe('pass.blur.gaussian-separable.v1');
      if (plan?.kind !== 'pass.blur.gaussian-separable.v1') return;

      expect(plan.nodeId).toBe('n-blur');
      // Upstream subgraph (`constant-vec4` → final-output) compiles into the input fragment shader.
      expect(plan.inputWgsl).toContain('@fragment');
      expect(plan.inputWgsl).toContain('fn fs(');
      expect(plan.blurWgsl).toContain('fsBlurH');
      expect(plan.blurWgsl).toContain('fsBlurV');
      expect(plan.presentWgsl).toContain('fn fs(');
      expect(plan.intermediateTexture.format).toBe('rgba8unorm');
      // Param slots are deterministic per-graph and contiguous past the upstream params.
      expect(result.paramLayout['n-blur.blurAmount']).toBe(plan.paramSlots.amount);
      expect(result.paramLayout['n-blur.blurRadius']).toBe(plan.paramSlots.radius);
      expect(result.paramLayout['n-blur.blurType']).toBe(plan.paramSlots.type);
    });

    it('compiles glow-bloom as threshold/blur/combine pass plan', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-glow-bloom-passplan',
        name: 'WGSL glow bloom (pass plan)',
        version: '2.0',
        nodes: [
          { id: 'n-const', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.9, y: 0.4, z: 0.2, w: 1.0 } },
          {
            id: 'n-glow',
            type: 'glow-bloom',
            position: { x: 0, y: 0 },
            parameters: { glowThreshold: 0.5, glowIntensity: 1.25, glowRadius: 4.0, glowStrength: 0.75 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-glow', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-glow', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(WGSL_WEBGPU_PASS_PLAN_NODE_TYPES.has('glow-bloom')).toBe(true);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('glow-bloom')).toBe(false);

      const plan = result.webgpuPassPlan;
      expect(plan?.kind).toBe('pass.glow-bloom.v1');
      if (plan?.kind !== 'pass.glow-bloom.v1') return;

      expect(plan.nodeId).toBe('n-glow');
      expect(plan.inputWgsl).toContain('@fragment');
      expect(plan.thresholdWgsl).toContain('sourceTex');
      expect(plan.blurWgsl).toContain('fsBlurH');
      expect(plan.blurWgsl).toContain('fsBlurV');
      expect(plan.combineWgsl).toContain('bloomTex');
      expect(plan.intermediateTexture.format).toBe('rgba8unorm');
      expect(result.paramLayout['n-glow.glowThreshold']).toBe(plan.paramSlots.threshold);
      expect(result.paramLayout['n-glow.glowIntensity']).toBe(plan.paramSlots.intensity);
      expect(result.paramLayout['n-glow.glowRadius']).toBe(plan.paramSlots.radius);
      expect(result.paramLayout['n-glow.glowStrength']).toBe(plan.paramSlots.strength);
    });

    it('compiles crepuscular-rays as input/occluder/sweep/combine pass plan', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-crepuscular-rays-passplan',
        name: 'WGSL crepuscular rays (pass plan)',
        version: '2.0',
        nodes: [
          { id: 'n-const', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.6, y: 0.5, z: 0.3, w: 1.0 } },
          {
            id: 'n-crep',
            type: 'crepuscular-rays',
            position: { x: 0, y: 0 },
            parameters: {
              sourceX: 0.25,
              sourceY: 0.1,
              rayCount: 12,
              spread: 360.0,
              width: 0.07,
              distanceFalloff: 1.5,
              intensity: 1.2,
              rotationSpeed: 0.0,
              rotationOffset: 0.0,
            },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-crep', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-crep', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(WGSL_WEBGPU_PASS_PLAN_NODE_TYPES.has('crepuscular-rays')).toBe(true);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('crepuscular-rays')).toBe(false);

      const plan = result.webgpuPassPlan;
      expect(plan?.kind).toBe('pass.crepuscular-rays.v1');
      // Compiler MUST emit the pass plan and not fall back to the inline WGSL allowlist.
      if (plan?.kind !== 'pass.crepuscular-rays.v1') return;

      expect(plan.nodeId).toBe('n-crep');
      expect(plan.inputWgsl).toContain('@fragment');
      expect(plan.inputWgsl).toContain('fn fs(');
      expect(plan.occluderWgsl).toContain('rayStripes');
      expect(plan.sweepWgsl).toContain('SAMPLES');
      expect(plan.combineWgsl).toContain('raysTex');
      expect(plan.intermediateTexture.format).toBe('rgba8unorm');

      // All crepuscular params have deterministic slot mappings exposed in `paramLayout`.
      expect(result.paramLayout['n-crep.sourceX']).toBe(plan.paramSlots.sourceX);
      expect(result.paramLayout['n-crep.sourceY']).toBe(plan.paramSlots.sourceY);
      expect(result.paramLayout['n-crep.distanceFalloff']).toBe(plan.paramSlots.distanceFalloff);
      expect(result.paramLayout['n-crep.intensity']).toBe(plan.paramSlots.intensity);
      expect(result.paramLayout['n-crep.rayCount']).toBe(plan.paramSlots.rayCount);
      expect(result.paramLayout['n-crep.spread']).toBe(plan.paramSlots.spread);
      expect(result.paramLayout['n-crep.width']).toBe(plan.paramSlots.width);
      expect(result.paramLayout['n-crep.rotationSpeed']).toBe(plan.paramSlots.rotationSpeed);
      expect(result.paramLayout['n-crep.rotationOffset']).toBe(plan.paramSlots.rotationOffset);
    });

    it('compiles bokeh as threshold/blur/combine pass plan', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-bokeh-passplan',
        name: 'WGSL bokeh (pass plan)',
        version: '2.0',
        nodes: [
          { id: 'n-const', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.7, y: 0.5, z: 0.2, w: 1.0 } },
          {
            id: 'n-bokeh',
            type: 'bokeh',
            position: { x: 0, y: 0 },
            parameters: {
              bokehThreshold: 0.4,
              bokehIntensity: 1.5,
              bokehRadius: 12.0,
              bokehStrength: 0.8,
              bokehBlades: 6,
              bokehRotation: 30.0,
            },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-bokeh', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-bokeh', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(WGSL_WEBGPU_PASS_PLAN_NODE_TYPES.has('bokeh')).toBe(true);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('bokeh')).toBe(true);

      const plan = result.webgpuPassPlan;
      expect(plan?.kind).toBe('pass.bokeh.v1');
      // Compiler MUST emit the pass plan and not fall back to the inline WGSL allowlist.
      if (plan?.kind !== 'pass.bokeh.v1') return;

      expect(plan.nodeId).toBe('n-bokeh');
      expect(plan.inputWgsl).toContain('@fragment');
      expect(plan.inputWgsl).toContain('fn fs(');
      expect(plan.thresholdWgsl).toContain('sourceTex');
      expect(plan.blurWgsl).toContain('apertureScale');
      expect(plan.combineWgsl).toContain('blurTex');
      expect(plan.intermediateTexture.format).toBe('rgba8unorm');

      expect(result.paramLayout['n-bokeh.bokehThreshold']).toBe(plan.paramSlots.threshold);
      expect(result.paramLayout['n-bokeh.bokehIntensity']).toBe(plan.paramSlots.intensity);
      expect(result.paramLayout['n-bokeh.bokehRadius']).toBe(plan.paramSlots.radius);
      expect(result.paramLayout['n-bokeh.bokehStrength']).toBe(plan.paramSlots.strength);
      expect(result.paramLayout['n-bokeh.bokehBlades']).toBe(plan.paramSlots.blades);
      expect(result.paramLayout['n-bokeh.bokehRotation']).toBe(plan.paramSlots.rotation);
    });

    it('compiles bokeh inline WebGPU when output feeds blend-color (no pass plan)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-bokeh-blend-inline',
        name: 'WGSL bokeh into blend-color',
        version: '2.0',
        nodes: [
          { id: 'n-base', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.1, y: 0.2, z: 0.3, w: 1.0 } },
          { id: 'n-src', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.9, y: 0.8, z: 0.1, w: 1.0 } },
          {
            id: 'n-bokeh',
            type: 'bokeh',
            position: { x: 0, y: 0 },
            parameters: {
              bokehThreshold: 0.5,
              bokehIntensity: 1.0,
              bokehRadius: 10.0,
              bokehStrength: 0.5,
              bokehBlades: 7,
              bokehRotation: 15.0,
            },
          },
          {
            id: 'n-bc',
            type: 'blend-color',
            position: { x: 0, y: 0 },
            parameters: { mode: 2, opacity: 0.8 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c-base', sourceNodeId: 'n-base', sourcePort: 'out', targetNodeId: 'n-bc', targetPort: 'base' },
          { id: 'c-src-bokeh', sourceNodeId: 'n-src', sourcePort: 'out', targetNodeId: 'n-bokeh', targetPort: 'in' },
          { id: 'c-bokeh-blend', sourceNodeId: 'n-bokeh', sourcePort: 'out', targetNodeId: 'n-bc', targetPort: 'blend' },
          { id: 'c-bc-out', sourceNodeId: 'n-bc', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.unsupportedReasons ?? []).toEqual([]);
      expect(result.webgpuPassPlan).toBeUndefined();
      expect(result.code).toContain('fn bokehBright');
      expect(result.code).toContain('@fragment');
    });

    /**
     * Smoke validation for every `webgpuPassPlan.kind` shipped in production.
     *
     * Asserts each MVP fixture compiles for WebGPU and emits the expected pass-plan kind.
     * Pixel parity is exercised by the headless golden harness (`webgpuGoldenHarness.html`)
     * and by snapshot tests (`wgslMvpCompileSnapshots.test.ts`); this block is the cheap,
     * always-on guarantee that the compiler never silently drops a pass-plan branch.
     */
    describe('webgpuPassPlan kind smoke validation (fixtures)', () => {
      const cases: ReadonlyArray<{
        label: string;
        graph: () => NodeGraph;
        kind:
          | 'pass.blur.gaussian-separable.v1'
          | 'pass.glow-bloom.v1'
          | 'pass.bokeh.v1'
          | 'pass.crepuscular-rays.v1';
        audioSetup?: () => AudioSetup;
      }> = [
        { label: 'blur (separable Gaussian)', graph: mvpBlurPassPlanGraph, kind: 'pass.blur.gaussian-separable.v1' },
        { label: 'glow-bloom', graph: mvpGlowBloomPassPlanGraph, kind: 'pass.glow-bloom.v1' },
        { label: 'bokeh', graph: mvpBokehPassPlanGraph, kind: 'pass.bokeh.v1' },
        { label: 'crepuscular-rays', graph: mvpCrepuscularRaysPassPlanGraph, kind: 'pass.crepuscular-rays.v1' },
        {
          label: 'audio blur pass-plan',
          graph: mvpAudioBlurPassPlanGraph,
          kind: 'pass.blur.gaussian-separable.v1',
          audioSetup: mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup,
        },
        {
          label: 'audio glow-bloom pass-plan',
          graph: mvpAudioGlowBloomPassPlanGraph,
          kind: 'pass.glow-bloom.v1',
          audioSetup: mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup,
        },
        {
          label: 'audio bokeh pass-plan',
          graph: mvpAudioBokehPassPlanGraph,
          kind: 'pass.bokeh.v1',
          audioSetup: mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup,
        },
        {
          label: 'audio crepuscular-rays pass-plan',
          graph: mvpAudioCrepuscularRaysPassPlanGraph,
          kind: 'pass.crepuscular-rays.v1',
          audioSetup: mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup,
        },
      ];

      it.each(cases)(
        'compiles fixture for $label and emits webgpuPassPlan.kind=$kind',
        ({ graph, kind, audioSetup }) => {
          const nodeSpecsMap = buildNodeSpecsMap();
          const compiler = new NodeShaderCompiler(nodeSpecsMap);
          const setup = audioSetup?.() ?? null;
          const result = compiler.compile(graph(), setup, { backend: 'webgpu' });

          expect(result.backend).toBe('webgpu');
          expect(result.metadata.errors).toHaveLength(0);
          expect(result.supported, (result.unsupportedReasons ?? []).join('; ')).toBe(true);
          expect(result.webgpuPassPlan?.kind).toBe(kind);
          expect(result.webgpuPassPlan?.nodeId).toBeTypeOf('string');
        }
      );
    });

    it('WebGPU + audioSetup: mvpAudioBlurPassPlan exposes remap paramLayout and blur pass-plan node', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = mvpAudioBlurPassPlanGraph();
      const audioSetup = mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup();
      const result = compiler.compile(graph, audioSetup, { backend: 'webgpu' });

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.supported).toBe(true);
      expect(result.metadata.previewDependencies?.usesAudioUniforms).toBe(true);
      expect(result.paramLayout['remap-mvp-stetra-audio-scale.out']).toBeTypeOf('number');
      expect(result.webgpuPassPlan?.kind).toBe('pass.blur.gaussian-separable.v1');
      expect(result.webgpuPassPlan?.nodeId).toBe('n-blur-stab');
    });

    it('WebGPU + audioSetup: mvpAudioGlowBloomPassPlan exposes remap paramLayout and glow-bloom pass-plan node', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = mvpAudioGlowBloomPassPlanGraph();
      const audioSetup = mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup();
      const result = compiler.compile(graph, audioSetup, { backend: 'webgpu' });

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.supported).toBe(true);
      expect(result.metadata.previewDependencies?.usesAudioUniforms).toBe(true);
      expect(result.paramLayout['remap-mvp-stetra-audio-scale.out']).toBeTypeOf('number');
      expect(result.webgpuPassPlan?.kind).toBe('pass.glow-bloom.v1');
      expect(result.webgpuPassPlan?.nodeId).toBe('n-glow-stgb');
    });

    it('WebGPU + audioSetup: mvpAudioBokehPassPlan exposes remap paramLayout and bokeh pass-plan node', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = mvpAudioBokehPassPlanGraph();
      const audioSetup = mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup();
      const result = compiler.compile(graph, audioSetup, { backend: 'webgpu' });

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.supported).toBe(true);
      expect(result.metadata.previewDependencies?.usesAudioUniforms).toBe(true);
      expect(result.paramLayout['remap-mvp-stetra-audio-scale.out']).toBeTypeOf('number');
      expect(result.webgpuPassPlan?.kind).toBe('pass.bokeh.v1');
      expect(result.webgpuPassPlan?.nodeId).toBe('n-bokeh-stbk');
    });

    it('WebGPU + audioSetup: mvpAudioCrepuscularRaysPassPlan exposes remap paramLayout and crepuscular pass-plan node', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = mvpAudioCrepuscularRaysPassPlanGraph();
      const audioSetup = mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup();
      const result = compiler.compile(graph, audioSetup, { backend: 'webgpu' });

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.supported).toBe(true);
      expect(result.metadata.previewDependencies?.usesAudioUniforms).toBe(true);
      expect(result.paramLayout['remap-mvp-stetra-audio-scale.out']).toBeTypeOf('number');
      expect(result.webgpuPassPlan?.kind).toBe('pass.crepuscular-rays.v1');
      expect(result.webgpuPassPlan?.nodeId).toBe('n-crep-stcr');
    });

    it('compiles edge-detection as inline WGSL', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-edge-detection',
        name: 'WGSL edge-detection',
        version: '2.0',
        nodes: [
          { id: 'n-const', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.4, y: 0.2, z: 0.1, w: 1.0 } },
          {
            id: 'n-edge',
            type: 'edge-detection',
            position: { x: 0, y: 0 },
            parameters: { edgeThreshold: 0.5, edgeWidth: 0.02, edgeIntensity: 1.25, edgeStrength: 0.75 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-edge', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-edge', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('edge-detection')).toBe(true);
      expect(result.code).toContain('smoothstep');
    });

    it('compiles hex-prism-sdf as inline WGSL', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-hex-prism-sdf',
        name: 'WGSL hex prism sdf',
        version: '2.0',
        nodes: [
          {
            id: 'n-pos',
            type: 'constant-vec3',
            position: { x: 0, y: 0 },
            parameters: { x: 0.2, y: 0.1, z: 0.3 },
          },
          {
            id: 'n-hex',
            type: 'hex-prism-sdf',
            position: { x: 0, y: 0 },
            parameters: { hexRadius: 0.25, halfHeight: 0.75, positionX: 0, positionY: 0, positionZ: 0 },
            parameterInputModes: {},
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-pos', sourcePort: 'out', targetNodeId: 'n-hex', targetPort: 'position' },
          { id: 'c2', sourceNodeId: 'n-hex', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('hex-prism-sdf')).toBe(true);
      expect(result.code).toContain('@fragment');
      expect(result.code).toContain('0.866025');
    });

    it('compiles repeated-hex-prism-sdf as inline WGSL', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-repeated-hex-prism-sdf',
        name: 'WGSL repeated hex prism sdf',
        version: '2.0',
        nodes: [
          {
            id: 'n-pos',
            type: 'constant-vec3',
            position: { x: 0, y: 0 },
            parameters: { x: -1.2, y: 0.5, z: 2.1 },
          },
          {
            id: 'n-hexr',
            type: 'repeated-hex-prism-sdf',
            position: { x: 0, y: 0 },
            parameters: {
              spacingX: 2.5,
              spacingY: 2.5,
              spacingZ: 2.5,
              hexRadius: 0.3,
              halfHeight: 1.0,
              positionX: 0,
              positionY: 0,
              positionZ: 0,
            },
            parameterInputModes: {},
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-pos', sourcePort: 'out', targetNodeId: 'n-hexr', targetPort: 'position' },
          { id: 'c2', sourceNodeId: 'n-hexr', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('repeated-hex-prism-sdf')).toBe(true);
      expect(result.code).toContain('@fragment');
      expect(result.code).toContain('repeatedHexPrismSdf_distance');
      // Domain repetition uses floor in the mod emulation.
      expect(result.code).toContain('floor');
      expect(result.code).toContain('0.866025');
    });

    /**
     * Fractal presets: bounded generic-raymarcher pilot wires fractal sdf nodes inline in WGSL.
     * Smoke-check each compiles WebGPU-supported; drift surfaces via `scripts/scan-webgpu-presets.ts`.
     */
    describe.each([
      { file: 'fractal-julia-slab.json', wgslSubstring: 'julia_sl_' },
      { file: 'fractal-mandelbox.json', wgslSubstring: 'mandelbox_sdf_distance' },
      { file: 'fractal-menger-sponge.json', wgslSubstring: 'mer_sponge_distance' },
      { file: 'fractal-sierpinski-tetra.json', wgslSubstring: 'ster_tetra_distance' },
    ])('fractal preset WebGPU ($file)', ({ file, wgslSubstring }) => {
      it('compiles fractal sdf graph on WebGPU with bounded generic-raymarcher march', () => {
        const nodeSpecsMap = buildNodeSpecsMap();
        const compiler = new NodeShaderCompiler(nodeSpecsMap);
        const raw = readFileSync(join(process.cwd(), 'src', 'presets', file), 'utf8');
        const parsed = JSON.parse(raw) as { graph: NodeGraph };

        const result = compiler.compile(structuredClone(parsed.graph), null, { backend: 'webgpu' });

        expect(result.backend).toBe('webgpu');
        expect(result.supported).toBe(true);
        expect(result.code).toContain('@fragment');
        expect(result.code).toContain(wgslSubstring);
        expect(result.code).toContain('genericRaymarchbounded_');
      });
    });

    it('compiles fractal-mandelbulb preset on bounded WebGPU generic-raymarcher + mandelbulb-sdf pilot', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const raw = readFileSync(join(process.cwd(), 'src', 'presets', 'fractal-mandelbulb.json'), 'utf8');
      const parsed = JSON.parse(raw) as { graph: NodeGraph };

      const result = compiler.compile(structuredClone(parsed.graph), null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.code).toContain('@fragment');
      expect(WGSL_SUPPORTED_NODE_TYPES.has('generic-raymarcher')).toBe(true);
      expect(WGSL_SUPPORTED_NODE_TYPES.has('mandelbulb-sdf')).toBe(true);
      expect(result.code).toContain('mandelbulbSdf_distance');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('compiles bounded WebGPU generic-raymarcher with hex-prism-sdf sdf source', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-hex-prism',
        name: 'GRM hex prism',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-prism', type: 'hex-prism-sdf', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-prism',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('0.866025');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('compiles bounded WebGPU generic-raymarcher with metaballs sdf source', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-metaballs-sdf',
        name: 'GRM metab sdf',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-meta',
            type: 'metaballs',
            position: { x: 0, y: 0 },
            parameters: { blobCount: 4, blobRadius: 0.25, threshold: 4.0 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          { id: 'c0', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-meta', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-meta',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('metaballsWgsl_implicit_sdf');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('compiles bounded WebGPU generic-raymarcher with repeated-hex-prism-sdf sdf source', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-repeated-hex-prism',
        name: 'GRM repeated hex prism',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-prism',
            type: 'repeated-hex-prism-sdf',
            position: { x: 0, y: 0 },
            parameters: { spacingX: 2.5, spacingY: 2.5, spacingZ: 2.5, hexRadius: 0.35, halfHeight: 1.2 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-prism',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('repeatedHexPrismSdf_distance');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('compiles bounded WebGPU generic-raymarcher with radial-repeat-sdf sdf source', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-radial-repeat',
        name: 'GRM radial repeat',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-rad',
            type: 'radial-repeat-sdf',
            position: { x: 0, y: 0 },
            parameters: { shellSpacing: 3.5, ringPhase: 0.5 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-rad',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('radialRepeatSdf_distance');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('compiles bounded WebGPU generic-raymarcher with ether-sdf sdf source', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-ether',
        name: 'GRM ether sdf',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-ether',
            type: 'ether-sdf',
            position: { x: 0, y: 0 },
            parameters: {
              rotSpeedXZ: 0.4,
              rotSpeedXY: 0.3,
              scale: 2.0,
              timeSpeed: 1.0,
              timeOffset: 0.0,
              wobbleSpeed: 0.7,
              sineAmp: 5.5,
              breatheAmount: 0.0,
              breatheSpeed: 0.7,
              positionX: 0.0,
              positionY: 0.0,
              positionZ: 0.0,
            },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-ether',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('fn etherSdfMap');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('compiles WebGPU generic-raymarcher with no SDF wire (black output, stays on WebGPU MVP)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-no-sdf',
        name: 'GRM no sdf',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'color',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.code).toContain('vec3<f32>(0.0, 0.0, 0.0)');
      expect(result.code).not.toContain('genericRaymarchbounded_');
    });

    it('compiles bounded WebGPU generic-raymarcher with kifs-sdf sdf source', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-kifs',
        name: 'GRM kifs sdf',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-kifs',
            type: 'kifs-sdf',
            position: { x: 0, y: 0 },
            parameters: {
              scale: 1.3,
              offsetX: -0.5,
              offsetY: -1.2,
              offsetZ: 0.0,
              rotationAxisX: 0.0,
              rotationAxisY: 1.0,
              rotationAxisZ: 0.0,
              rotationAngle: 0.4,
              iterations: 10,
              sphereRadius: 0.12,
              positionX: 0.0,
              positionY: 0.0,
              positionZ: 0.0,
            },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-kifs',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('kifs_sdf_distance');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('compiles bounded WebGPU generic-raymarcher with box-torus-sdf sdf source', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-box-torus-sdf',
        name: 'GRM box torus sdf',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-btt',
            type: 'box-torus-sdf',
            position: { x: 0, y: 0 },
            parameters: { primitiveType: 0 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-btt',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('boxTorusSceneSdf_distance');
      expect(result.code).toContain('BoxTorusSdfSceneParams');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('compiles bounded WebGPU generic-raymarcher with sphere-raymarch sdf source', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-sphere-raymarch',
        name: 'GRM sphere raymarch sdf',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-sr',
            type: 'sphere-raymarch',
            position: { x: 0, y: 0 },
            parameters: {},
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          { id: 'c0', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-sr', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-sr',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('sphereRaymarch_implicit_distance_for_grm');
      expect(result.code).toContain('genericRaymarchbounded_');
    });

    it('reports generic-raymarcher MVP failure when sdf source is outside the bounded allow-list', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-grm-non-mandel',
        name: 'GRM sdf mismatch',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-bad-sdf',
            type: 'gradient',
            position: { x: 0, y: 0 },
            parameters: {},
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          { id: 'c0', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bad-sdf', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-bad-sdf',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          {
            id: 'c4',
            sourceNodeId: 'n-ray',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.supported).toBe(false);
      const joined = (result.unsupportedReasons ?? []).join('\n');
      expect(joined).toMatch(/generic-raymarcher \(WebGPU MVP\): sdf source must be one of /);
      expect(joined).toMatch(/got 'gradient'/);
    });

    it('compiles blur → final on WebGPU with inline WGSL when blur color input is unconnected', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-blur-no-upstream',
        name: 'Blur no upstream',
        version: '2.0',
        nodes: [
          { id: 'n-blur', type: 'blur', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-blur', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.webgpuPassPlan).toBeUndefined();
      expect(result.code).toContain('@fragment');
      expect(result.code).toContain('0.2126');
    });

    it('compiles blur → final on WebGPU with inline path when pass-plan upstream is not WGSL-compatible', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-blur-bad-upstream',
        name: 'Blur with unsupported upstream',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-ray',
            type: 'generic-raymarcher',
            position: { x: 0, y: 0 },
            parameters: {},
            parameterInputModes: {},
          },
          {
            id: 'n-bad-sdf',
            type: 'gradient',
            position: { x: 0, y: 0 },
            parameters: {},
            parameterInputModes: {},
          },
          { id: 'n-blur', type: 'blur', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c0', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bad-sdf', targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: 'n-bad-sdf',
            sourcePort: 'out',
            targetNodeId: 'n-ray',
            targetPort: 'sdf',
          },
          { id: 'c3', sourceNodeId: 'n-ray', sourcePort: 'out', targetNodeId: 'n-blur', targetPort: 'in' },
          { id: 'c5', sourceNodeId: 'n-blur', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(false);
      const reasons = result.unsupportedReasons?.join('\n') ?? '';
      expect(reasons).toMatch(/generic-raymarcher \(WebGPU MVP\): sdf source must be one of /);
      expect(reasons).toMatch(/got 'gradient'/);
    });

    it('compiles `constant-vec4 → blur → blend-color → final-output` on WebGPU (inline blur, no pass plan)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-wgpu-blur-inline-chain',
        name: 'Blur mid-chain',
        version: '2.0',
        nodes: [
          { id: 'n-const', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.2, y: 0.6, z: 0.9, w: 1.0 } },
          { id: 'n-blur', type: 'blur', position: { x: 0, y: 0 }, parameters: { blurAmount: 0.4, blurRadius: 6.0 } },
          {
            id: 'n-blend',
            type: 'blend-color',
            position: { x: 0, y: 0 },
            parameters: { mode: 0, opacity: 0.5 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-blur', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-blur', sourcePort: 'out', targetNodeId: 'n-blend', targetPort: 'base' },
          { id: 'c3', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-blend', targetPort: 'blend' },
          { id: 'c4', sourceNodeId: 'n-blend', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.webgpuPassPlan).toBeUndefined();
      expect(result.code).toContain('@fragment');
      expect(result.code).toContain('0.2126');
    });

    /**
     * Regression: when an input port is unconnected and has no `fallbackParameter`, the WGSL MVP
     * compiler used to bail (`break;`) and leave the node's output unset, which caused the final
     * output resolution to fail with `'could not resolve output expression'`. GLSL parity requires
     * a typed zero default (mirrors `MainCodeGeneratorNodeCode` / `getInputDefaultValue`), so the
     * graph keeps compiling on WebGPU and the user sees an updated shader instead of falling back
     * to WebGL with a confusing console error.
     *
     * Fixture mirrors the user-reported bug:
     *   uv → gradient → blend-mode.blend; blend-mode.out → final-output
     *   blend-mode.base ("Background") is intentionally left unconnected.
     */
    it('compiles when blend-mode.base is unconnected (defaults to 0.0, GLSL parity)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-blend-mode-disconnected-base',
        name: 'blend-mode disconnected base',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-grad', type: 'gradient', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-blend',
            type: 'blend-mode',
            position: { x: 0, y: 0 },
            parameters: { mode: 1, opacity: 1.0, blend: 0.5 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c-uv-grad', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-grad', targetPort: 'in' },
          { id: 'c-grad-blend', sourceNodeId: 'n-grad', sourcePort: 'out', targetNodeId: 'n-blend', targetPort: 'blend' },
          { id: 'c-blend-out', sourceNodeId: 'n-blend', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.unsupportedReasons ?? []).toEqual([]);
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.code).toContain('@fragment');
      expect(result.code).toContain('applyBlendMode(0.0,');
    });

    it('compiles when blend-color.base is unconnected (defaults to vec4(0.0), GLSL parity)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-blend-color-disconnected-base',
        name: 'blend-color disconnected base',
        version: '2.0',
        nodes: [
          { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.4 } },
          { id: 'n-comb', type: 'combine-vector', position: { x: 0, y: 0 }, parameters: { x: 0, y: 0, z: 0, w: 1 } },
          {
            id: 'n-bc',
            type: 'blend-color',
            position: { x: 0, y: 0 },
            parameters: { mode: 2, opacity: 0.5 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          {
            id: 'c-float-x',
            sourceNodeId: 'n-v',
            sourcePort: 'out',
            targetNodeId: 'n-comb',
            targetPort: 'x',
          },
          {
            id: 'c-float-y',
            sourceNodeId: 'n-v',
            sourcePort: 'out',
            targetNodeId: 'n-comb',
            targetPort: 'y',
          },
          {
            id: 'c-float-z',
            sourceNodeId: 'n-v',
            sourcePort: 'out',
            targetNodeId: 'n-comb',
            targetPort: 'z',
          },
          { id: 'c-comb-blend', sourceNodeId: 'n-comb', sourcePort: 'out', targetNodeId: 'n-bc', targetPort: 'blend' },
          { id: 'c-bc-out', sourceNodeId: 'n-bc', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph, null, { backend: 'webgpu' });

      expect(result.backend).toBe('webgpu');
      expect(result.unsupportedReasons ?? []).toEqual([]);
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.code).toContain('@fragment');
      expect(result.code).toContain('mix(vec4<f32>(0.0).xyz');
    });
  });

  describe('box-torus-sdf', () => {
    it('compiles UV → Primitives → final-output without mangling else-if into if_node_*', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-box-torus',
        name: 'Box torus',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-bt', type: 'box-torus-sdf', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bt', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-bt', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.shaderCode).not.toMatch(/\bif_node_/);
      expect(result.shaderCode).toContain('else if');
    });

    it('embeds float param connection into sceneSDF (e.g. primitiveSizeX) and orders upstream math before Primitives', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-bt-param',
        name: 'BT param',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-mw', type: 'mixed-wave-signal', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-mul', type: 'multiply', position: { x: 0, y: 0 }, parameters: { b: 2.0 } },
          {
            id: 'n-bt',
            type: 'box-torus-sdf',
            position: { x: 0, y: 0 },
            parameters: { primitiveType: 0, primitiveSizeX: 1.5 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bt', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-mw', sourcePort: 'out', targetNodeId: 'n-mul', targetPort: 'a' },
          {
            id: 'c3',
            sourceNodeId: 'n-mul',
            sourcePort: 'out',
            targetNodeId: 'n-bt',
            targetParameter: 'primitiveSizeX',
          },
          { id: 'c4', sourceNodeId: 'n-bt', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph);
      expect(result.metadata.errors).toHaveLength(0);
      const order = result.metadata.executionOrder;
      expect(order.indexOf('n-mul')).toBeLessThan(order.indexOf('n-bt'));

      const mulVar = expectedOutputVariableName('n-mul', 'out');
      expect(result.shaderCode).toContain(mulVar);
      const sceneIdx = result.shaderCode.indexOf('sceneSDF');
      expect(sceneIdx).toBeGreaterThanOrEqual(0);
      const sceneChunk = result.shaderCode.slice(sceneIdx, sceneIdx + 1200);
      expect(sceneChunk).toContain(`vec3(clamp((${mulVar}),`);
    });

    it('compiles UV → box-torus-sdf → final-output on WebGPU with scene distance + standalone pixel', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);

      const graph: NodeGraph = {
        id: 'graph-box-torus-wgsl',
        name: 'Box torus WGSL',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-bt',
            type: 'box-torus-sdf',
            position: { x: 0, y: 0 },
            parameters: { primitiveRaymarchSteps: 48, primitiveType: 1 },
          },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bt', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-bt', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });

      expect(result.supported).toBe(true);
      expect(result.code).toContain('boxTorusSdf_standalone_pixel');
      expect(result.code).toContain('btSdTorus');
    });
  });

  describe('uv glitch distort nodes (WebGPU)', () => {
    it('compiles UV → uv-block-glitch → hash32 → final-output', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-uv-block-glitch-wgsl',
        name: 'UV block glitch WGSL',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-bg',
            type: 'uv-block-glitch',
            position: { x: 0, y: 0 },
            parameters: {
              uvBlockGlitchSeed: 1.23,
              uvBlockGlitchBlocks: 5,
              uvBlockGlitchVariation: 0.9,
              uvBlockGlitchCenterXMin: 0.1,
              uvBlockGlitchCenterXMax: 0.9,
              uvBlockGlitchCenterYMin: 0.1,
              uvBlockGlitchCenterYMax: 0.9,
              uvBlockGlitchHalfWMin: 0.02,
              uvBlockGlitchHalfWMax: 0.1,
              uvBlockGlitchAspectMin: 0.5,
              uvBlockGlitchAspectMax: 2.0,
              uvBlockGlitchOffXMin: -0.05,
              uvBlockGlitchOffXMax: 0.05,
              uvBlockGlitchOffYMin: -0.04,
              uvBlockGlitchOffYMax: 0.04,
            },
          },
          { id: 'n-h', type: 'hash32', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bg', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-bg', sourcePort: 'out', targetNodeId: 'n-h', targetPort: 'in' },
          { id: 'c3', sourceNodeId: 'n-h', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.code).toContain('uvBlockGlitch_apply');
    });

    it('compiles UV → uv-band-shift → hash32 → final-output', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-uv-band-shift-wgsl',
        name: 'UV band shift WGSL',
        version: '2.0',
        nodes: [
          { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: 'n-bs',
            type: 'uv-band-shift',
            position: { x: 0, y: 0 },
            parameters: {
              uvBandShiftOrientation: 1,
              uvBandShiftSeed: 2.5,
              uvBandShiftBandCount: 18,
              uvBandShiftPriOffMin: -0.04,
              uvBandShiftPriOffMax: 0.04,
              uvBandShiftPriSpread: 0.35,
              uvBandShiftSecSizeMin: 0.4,
              uvBandShiftSecSizeMax: 1.8,
              uvBandShiftSecSpread: 0.25,
            },
          },
          { id: 'n-h', type: 'hash32', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bs', targetPort: 'in' },
          { id: 'c2', sourceNodeId: 'n-bs', sourcePort: 'out', targetNodeId: 'n-h', targetPort: 'in' },
          { id: 'c3', sourceNodeId: 'n-h', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
        ],
      };

      const result = compiler.compile(structuredClone(graph), null, { backend: 'webgpu' });
      expect(result.supported).toBe(true);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.code).toContain('uvBandShift_applyVertical');
    });
  });

  describe('mixed-wave-signal input node', () => {
    it('compiles mixed-wave-signal → final-output', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph: NodeGraph = {
        id: 'graph-mws',
        name: 'Mixed wave test',
        version: '2.0',
        nodes: [
          { id: 'mws', type: 'mixed-wave-signal', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          {
            id: 'c1',
            sourceNodeId: 'mws',
            sourcePort: 'out',
            targetNodeId: 'n-out',
            targetPort: 'in',
          },
        ],
      };

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.shaderCode.length).toBeGreaterThan(0);
    });
  });

  describe('oscillator-2d input node', () => {
    it('compiles UV → Vortex driven by oscillator x/y → length → final-output', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const uvId = 'n-uv';
      const oscId = 'n-osc';
      const vortexId = 'n-vortex';
      const lenId = 'n-len';
      const outId = 'n-out';

      const graph: NodeGraph = {
        id: 'graph-osc2d',
        name: 'Oscillator 2D test',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: oscId, type: 'oscillator-2d', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: vortexId,
            type: 'vortex',
            position: { x: 0, y: 0 },
            parameters: {
              vortexCenterX: 0.0,
              vortexCenterY: 0.0,
              vortexStrength: 0.5,
              vortexRadius: 2.0,
              vortexFalloff: 1.5,
              vortexTimeSpeed: 0.0,
            },
          },
          { id: lenId, type: 'length', position: { x: 0, y: 0 }, parameters: {} },
          { id: outId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c0', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: vortexId, targetPort: 'in' },
          { id: 'cpx', sourceNodeId: oscId, sourcePort: 'x', targetNodeId: vortexId, targetParameter: 'vortexCenterX' },
          { id: 'cpy', sourceNodeId: oscId, sourcePort: 'y', targetNodeId: vortexId, targetParameter: 'vortexCenterY' },
          { id: 'c1', sourceNodeId: vortexId, sourcePort: 'out', targetNodeId: lenId, targetPort: 'in' },
          { id: 'c2', sourceNodeId: lenId, sourcePort: 'out', targetNodeId: outId, targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.shaderCode.length).toBeGreaterThan(0);
      expect(result.shaderCode).toContain(expectedOutputVariableName(oscId, 'x'));
      expect(result.shaderCode).toContain(expectedOutputVariableName(oscId, 'y'));
      expect(result.shaderCode).toContain('osc2dRawX');
      expect(result.shaderCode).toContain('osc2dTheta');
      expect(result.shaderCode).toContain('osc2d_combine_axis');
    });

    it('includes layer merge helper when Layer mix is Product', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const oscId = 'n-osc';
      const outId = 'n-out';

      const graph: NodeGraph = {
        id: 'graph-osc2d-mode',
        name: 'Oscillator 2D mode test',
        version: '2.0',
        nodes: [
          {
            id: oscId,
            type: 'oscillator-2d',
            position: { x: 0, y: 0 },
            parameters: { layerCombine: 2 },
          },
          { id: outId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c0', sourceNodeId: oscId, sourcePort: 'x', targetNodeId: outId, targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.shaderCode).toContain('osc2d_combine_axis');
      expect(result.shaderCode).toContain('if (mode == 2)');
    });
  });

  describe('turbulence node (function extraction must ignore // comments)', () => {
    it('compiles new preset with uv → turbulence → orbit without spurious reserved word output', () => {
      const presetPath = join(__dirname, '..', 'presets', 'bloom-sphere.json');
      const preset = JSON.parse(readFileSync(presetPath, 'utf8')) as { graph: NodeGraph };
      const graph: NodeGraph = structuredClone(preset.graph);

      const turbId = 'node-turb-test';
      graph.nodes.push({
        id: turbId,
        type: 'turbulence',
        position: { x: 0, y: 0 },
        parameters: {}
      });

      const bloomSphereNode = graph.nodes.find((n) => n.type === 'bloom-sphere');
      expect(bloomSphereNode).toBeTruthy();
      const bloomSphereId = bloomSphereNode!.id;
      const incomingToBloom = graph.connections.find(
        (c) => c.targetNodeId === bloomSphereId && c.targetPort === 'in'
      );
      expect(incomingToBloom).toBeTruthy();
      const srcId = incomingToBloom!.sourceNodeId;
      const srcPort = incomingToBloom!.sourcePort;
      graph.connections = graph.connections.filter((c) => c.id !== incomingToBloom!.id);
      graph.connections.push(
        {
          id: 'c-src-turb',
          sourceNodeId: srcId,
          sourcePort: srcPort,
          targetNodeId: turbId,
          targetPort: 'in'
        },
        {
          id: 'c-turb-bloomSphere',
          sourceNodeId: turbId,
          sourcePort: 'out',
          targetNodeId: bloomSphereId,
          targetPort: 'in'
        }
      );

      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      expect(result.shaderCode).not.toMatch(/\noutput\n/);
      expect(result.shaderCode).toContain('vec2 turbulence(');
    });
  });

  describe('quad-warp parameter connection (Intensity → quadCorner0X)', () => {
    it('places Intensity (multiply) before quad-warp in execution order', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildGraphWithIntensityToQuadWarpParam();

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      const order = result.metadata.executionOrder;
      const intensityIndex = order.indexOf('n-intensity');
      const quadWarpIndex = order.indexOf('n-quadwarp');
      expect(intensityIndex).toBeGreaterThanOrEqual(0);
      expect(quadWarpIndex).toBeGreaterThanOrEqual(0);
      expect(intensityIndex, `Execution order: ${order.join(' -> ')}`).toBeLessThan(quadWarpIndex);
    });

    it('substitutes quad-warp connected parameter with Intensity output variable in main code', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildGraphWithIntensityToQuadWarpParam();

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      const intensityVar = expectedOutputVariableName('n-intensity', 'out');
      // The main code is embedded in result.shaderCode; the quad-warp block should use intensityVar
      // for the connected param (quadCorner0X). So the shader must contain that variable in a
      // context that assigns to the quad-warp corners (e.g. vec2(intensityVar, ...) or similar).
      expect(result.shaderCode).toContain(intensityVar);

      // Stricter: quad-warp c00 is vec2($param.quadCorner0X, $param.quadCorner0Y); with connection
      // it must become vec2(intensityVar, ...). If we used default 0.0 we'd see vec2(0.0, ...) → solid color.
      const c00Pattern = new RegExp(
        `vec2\\(\\s*clamp\\(\\(\\s*${intensityVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\)\\s*,`
      );
      expect(
        result.shaderCode,
        'quad-warp c00 must use Intensity variable (vec2(intensityVar, ...)), not default'
      ).toMatch(c00Pattern);
    });

    /**
     * Full preset test: load testing.json, add Intensity → quad-warp param connection, compile.
     * If this fails, the bug is in the compiler for the real graph. If it passes, the bug is
     * likely runtime (uniforms, WebGL state, etc.).
     */
    const presetPath = join(__dirname, '../presets/testing.json');
    it.skip('with full preset graph: Intensity before quad-warp and correct variable in shader (preset no longer contains this scenario)', () => {
      const raw = readFileSync(presetPath, 'utf-8');
      const preset = JSON.parse(raw) as { graph: NodeGraph; audioSetup?: AudioSetup };
      const baseGraph: NodeGraph = JSON.parse(JSON.stringify(preset.graph));
      const audioSetup: AudioSetup | undefined = preset.audioSetup;

      const intensityId = 'node-1770921234504-ezpttwmaq';
      const quadWarpId = 'node-1770921234504-3aq6894r7';
      const paramConnection: Connection = {
        id: 'conn-intensity-to-quadwarp-param',
        sourceNodeId: intensityId,
        sourcePort: 'out',
        targetNodeId: quadWarpId,
        targetParameter: 'quadCorner0X',
      };
      // Use same immutable path as app (addConnection) so graph shape matches UI
      const graph = baseGraph.connections.some(
        (c) => c.targetNodeId === quadWarpId && c.targetParameter === 'quadCorner0X'
      )
        ? baseGraph
        : addConnection(baseGraph, paramConnection);

      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const result = compiler.compile(graph, audioSetup ?? null);

      expect(result.metadata.errors, result.metadata.errors.join('; ')).toHaveLength(0);
      const order = result.metadata.executionOrder;
      const intensityIndex = order.indexOf(intensityId);
      const quadWarpIndex = order.indexOf(quadWarpId);
      expect(intensityIndex).toBeGreaterThanOrEqual(0);
      expect(quadWarpIndex).toBeGreaterThanOrEqual(0);
      expect(intensityIndex, `Execution order (full preset): ... ${order.slice(Math.max(0, intensityIndex - 1), quadWarpIndex + 2).join(' -> ')} ...`).toBeLessThan(quadWarpIndex);

      const intensityVar = expectedOutputVariableName(intensityId, 'out');
      expect(result.shaderCode, 'Shader should use Intensity output variable for quad-warp param').toContain(intensityVar);

      // Stricter: quad-warp c00 must use intensity var (vec2(intensityVar, ...)), not default 0.0
      const c00Pattern = new RegExp(`vec2\\(\\s*${intensityVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,`);
      expect(
        result.shaderCode,
        'quad-warp c00 must use Intensity variable; otherwise corner is 0 and result is solid color'
      ).toMatch(c00Pattern);
    });
  });

  /**
     * Param wiring contract: execution order and variable substitution for a
   * parameter connection chain. Chain: time → one-minus → hexagon.hexGap.
   * See docs/architecture/audio-reactivity.md — Contract (invariants).
   */
  describe('parameter connection chain (one-minus → hexagon.hexGap)', () => {
    /**
     * Minimal graph: time → one-minus (in), one-minus (out) → hexagon hexGap (param),
     * uv → hexagon (in), hexagon (out) → final-output (in).
     */
    function buildOneMinusToHexagonParamGraph(): NodeGraph {
      const uvId = 'n-uv';
      const timeId = 'n-time';
      const oneMinusId = 'n-om';
      const hexId = 'n-hex';
      const outputId = 'n-out';

      return {
        id: 'graph-wp02',
        name: 'ParamWiringContract',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: timeId, type: 'time', position: { x: 0, y: 0 }, parameters: {} },
          { id: oneMinusId, type: 'one-minus', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: hexId,
            type: 'hexagonal-grid',
            position: { x: 0, y: 0 },
            parameters: { hexGap: 0.1 },
            parameterInputModes: {},
          },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: timeId, sourcePort: 'out', targetNodeId: oneMinusId, targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: oneMinusId,
            sourcePort: 'out',
            targetNodeId: hexId,
            targetParameter: 'hexGap',
          },
          { id: 'c3', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: hexId, targetPort: 'in' },
          { id: 'c4', sourceNodeId: hexId, sourcePort: 'out', targetNodeId: outputId, targetPort: 'in' },
        ],
      };
    }

    it('places one-minus before hexagon in execution order (source before target)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildOneMinusToHexagonParamGraph();

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      const order = result.metadata.executionOrder;
      const oneMinusIndex = order.indexOf('n-om');
      const hexIndex = order.indexOf('n-hex');
      expect(oneMinusIndex).toBeGreaterThanOrEqual(0);
      expect(hexIndex).toBeGreaterThanOrEqual(0);
      expect(
        oneMinusIndex,
        `Execution order: source (one-minus) must be before target (hexagon); got: ${order.join(' -> ')}`
      ).toBeLessThan(hexIndex);
    });

    it('substitutes hexagon hexGap with one-minus output variable in generated code (not uniform)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildOneMinusToHexagonParamGraph();

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      const oneMinusVar = expectedOutputVariableName('n-om', 'out');
      expect(result.shaderCode).toContain(oneMinusVar);

      // Hexagon uses: float gap = clamp($param.hexGap, 0.0, 2.0); with connection it must become
      // clamp(oneMinusVar, 0.0, 2.0), not the default uniform for hexGap.
      const gapVarEsc = oneMinusVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const gapPattern = new RegExp(
        // The node code clamps hexGap, and parameter substitution also clamps.
        `clamp\\(\\s*clamp\\(\\s*\\(\\s*${gapVarEsc}\\s*\\)\\s*,\\s*0\\.0\\s*,\\s*2\\.0\\s*\\)\\s*,\\s*0\\.0\\s*,\\s*2\\.0\\s*\\)`
      );
      expect(
        result.shaderCode,
        'hexagon gap must use one-minus output variable for connected hexGap, not uniform'
      ).toMatch(gapPattern);
    });

    /**
     * Audio param chain: virtual remap → one-minus (port) → hexagon.hexGap (param).
     * Ensures the compiler wires virtual node uniform into one-minus input and one-minus output into hexGap.
     */
    it('wires virtual remap → one-minus → hexGap when audioSetup is provided', () => {
      const remapperId = 'remap-node-test123';
      const virtualRemapId = `audio-signal:remap-${remapperId}`;
      const oneMinusId = 'n-om';
      const hexId = 'n-hex';
      const uvId = 'n-uv';
      const outputId = 'n-out';

      const graph: NodeGraph = {
        id: 'graph-wp10',
        name: 'AudioParamChain',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: oneMinusId, type: 'one-minus', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: hexId,
            type: 'hexagonal-grid',
            position: { x: 0, y: 0 },
            parameters: { hexGap: 0.1 },
            parameterInputModes: { hexGap: 'override' },
          },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: virtualRemapId, sourcePort: 'out', targetNodeId: oneMinusId, targetPort: 'in' },
          {
            id: 'c2',
            sourceNodeId: oneMinusId,
            sourcePort: 'out',
            targetNodeId: hexId,
            targetParameter: 'hexGap',
          },
          { id: 'c3', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: hexId, targetPort: 'in' },
          { id: 'c4', sourceNodeId: hexId, sourcePort: 'out', targetNodeId: outputId, targetPort: 'in' },
        ],
      };

      const audioSetup: AudioSetup = {
        files: [],
        bands: [{ id: 'band-1', name: 'B1', sourceFileId: 'f1', frequencyBands: [[0, 1000]], smoothingHalfLifeSeconds: 1 / 120, fftSize: 4096 }],
        remappers: [
          { id: remapperId, name: 'R1', bandId: 'band-1', inMin: 0, inMax: 1, outMin: 0, outMax: 1 },
        ],
      };

      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const result = compiler.compile(graph, audioSetup);

      expect(result.metadata.errors).toHaveLength(0);
      const oneMinusVar = expectedOutputVariableName(oneMinusId, 'out');
      // Execution order: one-minus (depends only on virtual) before hexagon (depends on one-minus)
      const order = result.metadata.executionOrder;
      const oneMinusIndex = order.indexOf(oneMinusId);
      const hexIndex = order.indexOf(hexId);
      expect(oneMinusIndex).toBeGreaterThanOrEqual(0);
      expect(hexIndex).toBeGreaterThanOrEqual(0);
      expect(oneMinusIndex, 'one-minus must run before hexagon').toBeLessThan(hexIndex);
      // One-minus input must be the remap uniform (uRemap_node_test123Out or similar)
      expect(result.shaderCode).toContain(oneMinusVar);
      const gapVarEsc = oneMinusVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const gapPattern = new RegExp(
        // Node code may already clamp $param.hexGap, and we also clamp the substituted expression.
        // Accept nested clamps like: clamp(clamp((node_var), 0.0, 2.0), 0.0, 2.0)
        `clamp\\(\\s*clamp\\(\\s*\\(\\s*${gapVarEsc}\\s*\\)\\s*,\\s*0\\.0\\s*,\\s*2\\.0\\s*\\)\\s*,\\s*0\\.0\\s*,\\s*2\\.0\\s*\\)`
      );
      expect(result.shaderCode, 'hexGap must use one-minus output variable').toMatch(gapPattern);
      expect(result.metadata.previewDependencies).toBeDefined();
      expect(result.metadata.previewDependencies!.usesAudioUniforms).toBe(true);
    });
  });

  describe('generic-raymarcher SDF and displacement parameter inputs', () => {
    function buildGenericRaymarcherWithEtherSdfGraph(): NodeGraph {
      const uvId = 'n-uv';
      const constId = 'n-const';
      const etherId = 'n-ether';
      const rayId = 'n-ray';
      const outputId = 'n-out';

      return {
        id: 'graph-raymarcher-sdf',
        name: 'Raymarcher SDF Param',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: constId, type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.5 } },
          { id: etherId, type: 'ether-sdf', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: rayId,
            type: 'generic-raymarcher',
            position: { x: 0, y: 0 },
            parameters: {},
          },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'c2', sourceNodeId: etherId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          {
            id: 'c3',
            sourceNodeId: constId,
            sourcePort: 'out',
            targetNodeId: etherId,
            targetParameter: 'timeOffset',
          },
          { id: 'c4', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outputId, targetPort: 'in' },
        ],
      };
    }

    it('uses sceneSDF for generic-raymarcher when SDF source is box-torus (no $output.x =) and embeds float param wires', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const uvId = 'n-uv';
      const mwId = 'n-mw';
      const mulId = 'n-mul';
      const btId = 'n-bt';
      const rayId = 'n-ray';
      const outId = 'n-out';
      const graph: NodeGraph = {
        id: 'graph-ray-bt-sdf',
        name: 'Ray BT SDF',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: mwId, type: 'mixed-wave-signal', position: { x: 0, y: 0 }, parameters: {} },
          { id: mulId, type: 'multiply', position: { x: 0, y: 0 }, parameters: { b: 1.0 } },
          {
            id: btId,
            type: 'box-torus-sdf',
            position: { x: 0, y: 0 },
            parameters: { primitiveType: 0, primitiveSizeX: 1.5 },
          },
          { id: rayId, type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: outId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'r1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'r2', sourceNodeId: btId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          { id: 'r3', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: btId, targetPort: 'in' },
          { id: 'r4', sourceNodeId: mwId, sourcePort: 'out', targetNodeId: mulId, targetPort: 'a' },
          {
            id: 'r5',
            sourceNodeId: mulId,
            sourcePort: 'out',
            targetNodeId: btId,
            targetParameter: 'primitiveSizeX',
          },
          { id: 'r6', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outId, targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph);
      expect(result.metadata.errors).toHaveLength(0);
      const mulVar = expectedOutputVariableName(mulId, 'out');
      expect(result.shaderCode).toContain(mulVar);
      const genericFn = `generic_raymarcher_sdf_${rayId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      expect(result.shaderCode).toMatch(
        new RegExp(`float\\s+${genericFn}\\s*\\(vec3\\s+p\\)\\s*\\{\\s*return\\s+sceneSDF`)
      );
      const sceneIdx = result.shaderCode.indexOf('sceneSDF');
      expect(sceneIdx).toBeGreaterThanOrEqual(0);
      const sceneChunk = result.shaderCode.slice(sceneIdx, sceneIdx + 1200);
      expect(sceneChunk).toContain(`vec3(clamp((${mulVar}),`);
    });

    it('uses SDF parameter input variable in generic-raymarcher SDF function body', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildGenericRaymarcherWithEtherSdfGraph();

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      const constVar = expectedOutputVariableName('n-const', 'out');
      const sanitizedRayId = 'n_ray';
      const funcName = `generic_raymarcher_sdf_${sanitizedRayId}`;
      const pattern = new RegExp(
        `float\\s+${funcName}\\s*\\(vec3\\s+p\\)\\s*\\{[\\s\\S]*${constVar}[\\s\\S]*\\}`
      );
      expect(
        result.shaderCode,
        'generic-raymarcher SDF function must reference constant-float output variable for ether-sdf.timeOffset'
      ).toMatch(pattern);
      expect(
        result.shaderCode,
        'generic-raymarcher SDF function must not contain raw $param.timeOffset placeholder'
      ).not.toContain('$param.timeOffset');
    });

    it('compiles generic-raymarcher with menger-sponge-sdf feeding sdf port', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const uvId = 'n-uv-ms';
      const mengerId = 'n-menger';
      const rayId = 'n-ray-ms';
      const outId = 'n-out-ms';
      const graph: NodeGraph = {
        id: 'graph-menger-ray',
        name: 'Menger Ray',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: mengerId,
            type: 'menger-sponge-sdf',
            position: { x: 0, y: 0 },
            parameters: { iterations: 2, domainScale: 1.0, deFudge: 0.2 }
          },
          { id: rayId, type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: outId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }
        ],
        connections: [
          { id: 'm1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'm2', sourceNodeId: mengerId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          { id: 'm3', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outId, targetPort: 'in' }
        ]
      };

      const result = compiler.compile(graph);
      expect(result.metadata.errors, result.metadata.errors.join('; ')).toHaveLength(0);
      expect(result.shaderCode).toContain('mengerSponge_eval');
      expect(result.shaderCode).toContain('generic_raymarcher_sdf_n_ray_ms');
      expect(result.shaderCode).not.toContain('$param.iterations');
    });

    it('compiles generic-raymarcher with mandelbox-sdf feeding sdf port', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const uvId = 'n-uv-mbox';
      const mboxId = 'n-mandelbox';
      const rayId = 'n-ray-mbox';
      const outId = 'n-out-mbox';
      const graph: NodeGraph = {
        id: 'graph-mandelbox-ray',
        name: 'Mandelbox Ray',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: mboxId,
            type: 'mandelbox-sdf',
            position: { x: 0, y: 0 },
            parameters: { iterations: 8, scale: -2.0, foldingLimit: 1.0, minRadius: 0.25 }
          },
          { id: rayId, type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: outId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }
        ],
        connections: [
          { id: 'b1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'b2', sourceNodeId: mboxId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          { id: 'b3', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outId, targetPort: 'in' }
        ]
      };

      const result = compiler.compile(graph);
      expect(result.metadata.errors, result.metadata.errors.join('; ')).toHaveLength(0);
      expect(result.shaderCode).toContain('mandelbox_sdf_eval');
      expect(result.shaderCode).toContain('generic_raymarcher_sdf_n_ray_mbox');
      expect(result.shaderCode).not.toContain('$param.iterations');
    });

    it('compiles generic-raymarcher with sierpinski-tetra-sdf feeding sdf port', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const uvId = 'n-uv-st';
      const stId = 'n-stetra';
      const rayId = 'n-ray-st';
      const outId = 'n-out-st';
      const graph: NodeGraph = {
        id: 'graph-stetra-ray',
        name: 'Sierpinski Tetra Ray',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: stId,
            type: 'sierpinski-tetra-sdf',
            position: { x: 0, y: 0 },
            parameters: { iterations: 4, scale: 2.0, coreRadius: 0.1 }
          },
          { id: rayId, type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: outId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }
        ],
        connections: [
          { id: 's1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 's2', sourceNodeId: stId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          { id: 's3', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outId, targetPort: 'in' }
        ]
      };

      const result = compiler.compile(graph);
      expect(result.metadata.errors, result.metadata.errors.join('; ')).toHaveLength(0);
      expect(result.shaderCode).toContain('stetraSdfBody');
      expect(result.shaderCode).toContain('generic_raymarcher_sdf_n_ray_st');
      expect(result.shaderCode).not.toContain('$param.iterations');
    });

    it('uses constant-float output for sierpinski-tetra-sdf.scale inside generic-raymarcher SDF function', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = mvpGenericRaymarcherSierpinskiTetraScaleWireGraph();
      const constId = 'n-const-st2';

      const result = compiler.compile(graph);
      expect(result.metadata.errors).toHaveLength(0);
      const constVar = expectedOutputVariableName(constId, 'out');
      const funcName = 'generic_raymarcher_sdf_n_ray_st2';
      const pattern = new RegExp(
        `float\\s+${funcName}\\s*\\(vec3\\s+p\\)\\s*\\{[\\s\\S]*${constVar}[\\s\\S]*\\}`
      );
      expect(result.shaderCode, 'SDF function must inline constant for scale').toMatch(pattern);
      expect(result.shaderCode).not.toContain('$param.scale');
    });

    it('uses audio uniform for sierpinski-tetra-sdf.scale in generic-raymarcher SDF function', () => {
      const remapperId = 'remap-node-stetra-audio';
      const virtualRemapId = `audio-signal:remap-${remapperId}`;
      const uvId = 'n-uv-sta';
      const stId = 'n-stetra-audio';
      const rayId = 'n-ray-sta';
      const outputId = 'n-out-sta';

      const graph: NodeGraph = {
        id: 'graph-ray-stetra-audio',
        name: 'Raymarcher STetra audio scale',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: stId, type: 'sierpinski-tetra-sdf', position: { x: 0, y: 0 }, parameters: { scale: 2.0 } },
          { id: rayId, type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }
        ],
        connections: [
          { id: 'a1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'a2', sourceNodeId: stId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          {
            id: 'a3',
            sourceNodeId: virtualRemapId,
            sourcePort: 'out',
            targetNodeId: stId,
            targetParameter: 'scale'
          },
          { id: 'a4', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outputId, targetPort: 'in' }
        ]
      };

      const audioSetup: AudioSetup = {
        files: [],
        bands: [
          { id: 'band-st', name: 'B1', sourceFileId: 'f1', frequencyBands: [[0, 1000]], smoothingHalfLifeSeconds: 1 / 120, fftSize: 4096 }
        ],
        remappers: [
          { id: remapperId, name: 'R1', bandId: 'band-st', inMin: 0, inMax: 1, outMin: 1.5, outMax: 2.5 }
        ]
      };

      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const result = compiler.compile(graph, audioSetup);

      expect(result.metadata.errors).toHaveLength(0);

      const uniformNodeId = `remap-${remapperId}`;
      const sanitizedId = uniformNodeId.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, 'n$1');
      const expectedUniform = `u${sanitizedId}Out`;

      const funcName = 'generic_raymarcher_sdf_n_ray_sta';
      const pattern = new RegExp(`float\\s+${funcName}\\s*\\(vec3\\s+p\\)\\s*\\{([\\s\\S]*?)\\}`);
      const match = result.shaderCode.match(pattern);
      expect(match, 'generic-raymarcher SDF function body must be found').not.toBeNull();
      const body = match![1];

      expect(body, 'SDF body must reference audio uniform for scale').toContain(expectedUniform);
      expect(body, 'SDF body must not leave raw $param.scale').not.toContain('$param.scale');
    });

    it('uses SDF parameter input variable in generic-raymarcher SDF function body for julia-slab-sdf.xyScale', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const uvId = 'n-uv';
      const constId = 'n-const-julia';
      const juliaId = 'n-julia';
      const rayId = 'n-ray-julia';
      const outputId = 'n-out-julia';

      const graph: NodeGraph = {
        id: 'graph-raymarcher-sdf-julia',
        name: 'Raymarcher Julia SDF Param',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: constId, type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 2.25 } },
          { id: juliaId, type: 'julia-slab-sdf', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: rayId,
            type: 'generic-raymarcher',
            position: { x: 0, y: 0 },
            parameters: {},
          },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'j1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'j2', sourceNodeId: juliaId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          {
            id: 'j3',
            sourceNodeId: constId,
            sourcePort: 'out',
            targetNodeId: juliaId,
            targetParameter: 'xyScale',
          },
          { id: 'j4', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outputId, targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      const constVar = expectedOutputVariableName(constId, 'out');
      const funcName = `generic_raymarcher_sdf_n_ray_julia`;
      const pattern = new RegExp(
        `float\\s+${funcName}\\s*\\(vec3\\s+p\\)\\s*\\{[\\s\\S]*${constVar}[\\s\\S]*\\}`
      );
      expect(
        result.shaderCode,
        'generic-raymarcher SDF function must reference constant-float output variable for julia-slab-sdf.xyScale'
      ).toMatch(pattern);
      expect(
        result.shaderCode,
        'generic-raymarcher SDF function must not contain raw $param.xyScale placeholder when wired'
      ).not.toContain('$param.xyScale');
    });

    it('uses displacement parameter input variable in generic-raymarcher displacement expression', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = mvpGenericRaymarcherDisplacementGraph();

      const result = compiler.compile(graph);

      expect(result.metadata.errors).toHaveLength(0);
      const constVar = expectedOutputVariableName('n-const', 'out');
      // Displacement expression is inlined into generic-raymarcher main code via $displacement_at_p.
      expect(
        result.shaderCode,
        'generic-raymarcher main code must reference constant-float output variable via displacement-3d.timeOffset'
      ).toContain(constVar);
      expect(
        result.shaderCode,
        'generic-raymarcher displacement expression must not contain raw $param.timeOffset placeholder'
      ).not.toContain('$param.timeOffset');
    });

    it('uses audio uniform for SDF parameter connected to virtual audio node in generic-raymarcher SDF function', () => {
      const remapperId = 'remap-node-audio123';
      const virtualRemapId = `audio-signal:remap-${remapperId}`;
      const uvId = 'n-uv-audio';
      const etherId = 'n-ether-audio';
      const rayId = 'n-ray-audio';
      const outputId = 'n-out-audio';

      const graph: NodeGraph = {
        id: 'graph-raymarcher-sdf-audio',
        name: 'Raymarcher SDF Audio Param',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: etherId, type: 'ether-sdf', position: { x: 0, y: 0 }, parameters: { timeOffset: 0.0 } },
          {
            id: rayId,
            type: 'generic-raymarcher',
            position: { x: 0, y: 0 },
            parameters: {},
          },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'c2', sourceNodeId: etherId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          {
            id: 'c3',
            sourceNodeId: virtualRemapId,
            sourcePort: 'out',
            targetNodeId: etherId,
            targetParameter: 'timeOffset',
          },
          { id: 'c4', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outputId, targetPort: 'in' },
        ],
      };

      const audioSetup: AudioSetup = {
        files: [],
        bands: [
          { id: 'band-1', name: 'B1', sourceFileId: 'f1', frequencyBands: [[0, 1000]], smoothingHalfLifeSeconds: 1 / 120, fftSize: 4096 },
        ],
        remappers: [
          { id: remapperId, name: 'R1', bandId: 'band-1', inMin: 0, inMax: 1, outMin: 0, outMax: 1 },
        ],
      };

      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const result = compiler.compile(graph, audioSetup);

      expect(result.metadata.errors).toHaveLength(0);

      // Expected uniform name for remap output, following UniformGenerator.sanitizeUniformName
      const uniformNodeId = `remap-${remapperId}`; // becomes "remap-remap-node-audio123"
      const sanitizedId = uniformNodeId.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, 'n$1');
      const sanitizedParam = 'Out';
      const expectedUniform = `u${sanitizedId}${sanitizedParam}`;

      const sanitizedRayId = 'n_ray_audio';
      const funcName = `generic_raymarcher_sdf_${sanitizedRayId}`;
      const pattern = new RegExp(
        `float\\s+${funcName}\\s*\\(vec3\\s+p\\)\\s*\\{([\\s\\S]*?)\\}`
      );
      const match = result.shaderCode.match(pattern);
      expect(match, 'generic-raymarcher SDF function body must be found').not.toBeNull();
      const body = match![1];

      expect(body, 'SDF function body must reference audio uniform for timeOffset').toContain(expectedUniform);
      expect(
        body,
        'SDF function body must not contain raw $param.timeOffset placeholder when audio connection is present'
      ).not.toContain('$param.timeOffset');
    });

    it('compiles graph with mandelbulb-sdf driving generic-raymarcher SDF', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const uvId = 'n-uv-mbulb';
      const mbId = 'n-mbulb';
      const rayId = 'n-ray-mbulb';
      const outId = 'n-out-mbulb';
      const graph: NodeGraph = {
        id: 'graph-mandelbulb-ray',
        name: 'Mandelbulb Ray',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: mbId, type: 'mandelbulb-sdf', position: { x: 0, y: 0 }, parameters: {} },
          { id: rayId, type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: outId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'mb1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'mb2', sourceNodeId: mbId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          { id: 'mb3', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outId, targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph);
      expect(result.metadata.errors).toHaveLength(0);
      expect(result.shaderCode).toContain('mandelbulbSdf');
      expect(result.shaderCode).toContain('generic_raymarcher_sdf_n_ray_mbulb');
    });

    it('mandelbulb-sdf bailout and deFudge grid compile without errors (DE verification matrix)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const bailouts = [1.35, 1.9, 2.5, 3.5];
      const deFudges = [0.12, 0.45, 0.78, 1.25];
      for (const bailout of bailouts) {
        for (const deFudge of deFudges) {
          const graph: NodeGraph = {
            id: `graph-mb-sweep-${bailout}-${deFudge}`,
            name: 'Mandelbulb sweep',
            version: '2.0',
            nodes: [
              { id: 'n-uv-sw', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
              {
                id: 'n-mb-sw',
                type: 'mandelbulb-sdf',
                position: { x: 0, y: 0 },
                parameters: { bailout, deFudge, hybridMix: 0.0 },
              },
              { id: 'n-ray-sw', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
              { id: 'n-out-sw', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
            ],
            connections: [
              { id: 's1', sourceNodeId: 'n-uv-sw', sourcePort: 'out', targetNodeId: 'n-ray-sw', targetPort: 'in' },
              { id: 's2', sourceNodeId: 'n-mb-sw', sourcePort: 'out', targetNodeId: 'n-ray-sw', targetPort: 'sdf' },
              { id: 's3', sourceNodeId: 'n-ray-sw', sourcePort: 'color', targetNodeId: 'n-out-sw', targetPort: 'in' },
            ],
          };
          const result = compiler.compile(graph);
          expect(result.metadata.errors, `bailout=${bailout} deFudge=${deFudge}`).toHaveLength(0);
        }
      }
    });

    it('mandelbulb-sdf uses audio uniform for deFudge in generic-raymarcher SDF function', () => {
      const remapperId = 'remap-mb-defudge';
      const virtualRemapId = `audio-signal:remap-${remapperId}`;
      const uvId = 'n-uv-mb-aud';
      const mbId = 'n-mb-aud';
      const rayId = 'n-ray-mb-aud';
      const outputId = 'n-out-mb-aud';

      const graph: NodeGraph = {
        id: 'graph-mb-audio-defudge',
        name: 'Mandelbulb deFudge audio',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: mbId, type: 'mandelbulb-sdf', position: { x: 0, y: 0 }, parameters: { deFudge: 0.5 } },
          {
            id: rayId,
            type: 'generic-raymarcher',
            position: { x: 0, y: 0 },
            parameters: {},
          },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'a1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'a2', sourceNodeId: mbId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          {
            id: 'a3',
            sourceNodeId: virtualRemapId,
            sourcePort: 'out',
            targetNodeId: mbId,
            targetParameter: 'deFudge',
          },
          { id: 'a4', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outputId, targetPort: 'in' },
        ],
      };

      const audioSetup: AudioSetup = {
        files: [],
        bands: [
          { id: 'band-mb', name: 'B1', sourceFileId: 'f1', frequencyBands: [[0, 1000]], smoothingHalfLifeSeconds: 1 / 120, fftSize: 4096 },
        ],
        remappers: [
          { id: remapperId, name: 'R1', bandId: 'band-mb', inMin: 0, inMax: 1, outMin: 0.05, outMax: 1.5 },
        ],
      };

      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const result = compiler.compile(graph, audioSetup);

      expect(result.metadata.errors).toHaveLength(0);

      const uniformNodeId = `remap-${remapperId}`;
      const sanitizedId = uniformNodeId.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, 'n$1');
      const expectedUniform = `u${sanitizedId}Out`;

      const funcName = 'generic_raymarcher_sdf_n_ray_mb_aud';
      const pattern = new RegExp(`float\\s+${funcName}\\s*\\(vec3\\s+p\\)\\s*\\{([\\s\\S]*?)\\}`);
      const match = result.shaderCode.match(pattern);
      expect(match, 'generic-raymarcher SDF function body must be found').not.toBeNull();
      const body = match![1];
      expect(body, 'SDF body must reference audio uniform for mandelbulb deFudge').toContain(expectedUniform);
      expect(body, 'must not leave raw deFudge placeholder').not.toContain('$param.deFudge');
    });

    it('mandelbulb-sdf uses constant-float output for hybridMix in generic-raymarcher SDF function', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const uvId = 'n-uv-mb-hyb';
      const constId = 'n-const-mb-hyb';
      const mbId = 'n-mb-hyb';
      const rayId = 'n-ray-mb-hyb';
      const outputId = 'n-out-mb-hyb';

      const graph: NodeGraph = {
        id: 'graph-mb-hybrid',
        name: 'Mandelbulb hybrid',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          { id: constId, type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.42 } },
          { id: mbId, type: 'mandelbulb-sdf', position: { x: 0, y: 0 }, parameters: {} },
          { id: rayId, type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'h1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'in' },
          { id: 'h2', sourceNodeId: mbId, sourcePort: 'out', targetNodeId: rayId, targetPort: 'sdf' },
          {
            id: 'h3',
            sourceNodeId: constId,
            sourcePort: 'out',
            targetNodeId: mbId,
            targetParameter: 'hybridMix',
          },
          { id: 'h4', sourceNodeId: rayId, sourcePort: 'color', targetNodeId: outputId, targetPort: 'in' },
        ],
      };

      const result = compiler.compile(graph);
      expect(result.metadata.errors).toHaveLength(0);
      const constVar = expectedOutputVariableName(constId, 'out');
      const funcName = 'generic_raymarcher_sdf_n_ray_mb_hyb';
      const pattern = new RegExp(
        `float\\s+${funcName}\\s*\\(vec3\\s+p\\)\\s*\\{[\\s\\S]*${constVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*\\}`
      );
      expect(result.shaderCode, 'SDF function must inline constant-float for hybridMix').toMatch(pattern);
      expect(result.shaderCode).not.toContain('$param.hybridMix');
    });
  });

  describe('inflated-icosahedron shader preamble identifiers', () => {
    function buildInflatedIcosahedronGraph(): NodeGraph {
      const uvId = 'n-uv';
      const icoId = 'n-ico';
      const outputId = 'n-out';

      return {
        id: 'graph-inflated-icosahedron',
        name: 'Inflated Icosahedron',
        version: '2.0',
        nodes: [
          { id: uvId, type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
          {
            id: icoId,
            type: 'inflated-icosahedron',
            position: { x: 0, y: 0 },
            parameters: {},
          },
          { id: outputId, type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: uvId, sourcePort: 'out', targetNodeId: icoId, targetPort: 'in' },
          { id: 'c2', sourceNodeId: icoId, sourcePort: 'out', targetNodeId: outputId, targetPort: 'in' },
        ],
      };
    }

    it('includes nc/pbc/pca and GDF* preamble so struct-dependent functions compile', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const graph = buildInflatedIcosahedronGraph();

      const result = compiler.compile(graph);
      expect(result.metadata.errors).toHaveLength(0);

      // These are "preamble" identifiers used by initIcosahedronInflated/pModIcosahedronInflated.
      expect(result.shaderCode).toContain('vec3 nc, pbc, pca;');
      expect(result.shaderCode).toContain('#define GDF13');
      expect(result.shaderCode).toContain('#define GDF18b');

      // A sanity check that a function body referencing nc is present.
      expect(result.shaderCode).toContain('nc = vec3(');
      expect(result.shaderCode).toContain('pModIcosahedronInflated(inout vec3 p)');
    });
  });

  describe('compileIncremental execution-order extensions', () => {
    it('succeeds after adding a disconnected constant-float (subsequence order)', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const base: NodeGraph = {
        id: 'g-ext',
        name: 'g',
        version: '2.0',
        nodes: [
          { id: 'n1', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n2', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n1', sourcePort: 'out', targetNodeId: 'n2', targetPort: 'in' },
        ],
      };
      const prev = compiler.compile(base);
      expect(prev.metadata.errors).toHaveLength(0);
      const extended: NodeGraph = {
        ...base,
        nodes: [
          ...base.nodes,
          {
            id: 'nf',
            type: 'constant-float',
            position: { x: 0, y: 0 },
            parameters: { value: 0.25 },
          },
        ],
      };
      const incr = compiler.compileIncremental(extended, prev, new Set(['nf']));
      expect(incr).not.toBeNull();
      expect(incr!.metadata.executionOrder.length).toBe(prev.metadata.executionOrder.length + 1);
      expect(incr!.metadata.errors).toHaveLength(0);
    });

    it('returns null when a previous-order node is missing from the graph', () => {
      const nodeSpecsMap = buildNodeSpecsMap();
      const compiler = new NodeShaderCompiler(nodeSpecsMap);
      const base: NodeGraph = {
        id: 'g-rem',
        name: 'g',
        version: '2.0',
        nodes: [
          { id: 'n1', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'n2', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n1', sourcePort: 'out', targetNodeId: 'n2', targetPort: 'in' },
        ],
      };
      const prev = compiler.compile(base);
      const broken: NodeGraph = {
        ...base,
        nodes: [{ id: 'n2', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }],
        connections: [],
      };
      const incr = compiler.compileIncremental(broken, prev, new Set(['n2']));
      expect(incr).toBeNull();
    });
  });
});
